const OpenAI = require('openai');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const AUTH_COOLDOWN_MS = 60 * 60 * 1000;
const KEY_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_COOLDOWN_WAIT_MS = 60000;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

const statusOf = error => Number(error.status || error.response?.status);
const metadataOf = error => error.error?.metadata || error.response?.data?.error?.metadata || error.metadata || {};
const isKeyLimit = error => metadataOf(error).limit_source === 'openrouter_key_limit'
  || /key (?:total |monthly )?limit exceeded/i.test(String(error.message || ''));
// Google rejects a bad key with HTTP 400 rather than 401.
const isInvalidKey = error => statusOf(error) === 400 && /api key not valid|invalid auth|API_KEY_INVALID/i.test(String(error.message || ''));
// "can only afford N tokens" is handled upstream by retrying with fewer tokens.
const isCreditShortfall = error => statusOf(error) === 402 && !/can only afford/i.test(String(error.message || ''));

const listKeys = (...names) => [...new Set(names.flatMap(name => String(process.env[name] || '').split(',')).map(key => key.trim().replace(/^["']|["']$/g, '')).filter(Boolean))];

// Google's OpenAI-compatible endpoint serves Gemini models directly (free tier), without OpenRouter credits.
function geminiClient(apiKey, timeout) {
  const client = new OpenAI({ baseURL: GEMINI_BASE_URL, apiKey, maxRetries: 0, timeout });
  return {
    provider: 'gemini',
    chat: { completions: { create: (params, options) => {
      const model = String(params?.model || '');
      if (!/^(?:google\/)?gemini/i.test(model)) {
        return Promise.reject(Object.assign(new Error(`The Gemini API cannot serve model "${model}".`), { unsupportedModel: true }));
      }
      // Thinking is off by default through OpenRouter; keep it off so it cannot consume max_tokens.
      return client.chat.completions.create({ ...params, model: model.replace(/^google\//i, '').replace(/:free$/i, ''), reasoning_effort: 'none' }, options);
    } } }
  };
}

function openRouterClient(apiKey, timeout) {
  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey, maxRetries: 0, timeout, defaultHeaders: { 'X-Title': 'QP Generator' } });
  client.provider = 'openrouter';
  return client;
}

function creditsExhausted(error) {
  return Object.assign(new Error('AI credits are exhausted on every configured key. Add OpenRouter credits, or set a valid GEMINI_API_KEYS on the backend to use the free Gemini API.'), { status: 402, cause: error });
}

class AiKeyManager {
  constructor(options = {}) {
    const timeout = positive(process.env.AI_TIMEOUT_MS, 90000);
    this.clients = options.clients || [
      ...listKeys('GEMINI_API_KEYS', 'GEMINI_API_KEY').map(key => geminiClient(key, timeout)),
      ...listKeys('OPENROUTER_API_KEYS', 'OPENROUTER_API_KEY').map(key => openRouterClient(key, timeout))
    ];
    this.tail = Promise.resolve();
    this.sleep = options.sleep || wait;
    this.maxAttempts = Math.min(5, positive(process.env.AI_MAX_ATTEMPTS, 3));
    this.intervalMs = positive(process.env.AI_MIN_INTERVAL_MS, 1200);
    this.cooldowns = this.clients.map(() => 0);
    this.activeIndex = null;
  }

  // One request at a time. Transient rate limits keep their provider cooldown,
  // while invalid, out-of-credit or per-key-limit keys are swapped for the next configured key.
  executeWithAI(operation) {
    const task = this.tail.then(() => this._execute(operation));
    this.tail = task.catch(() => {});
    return task;
  }

  _availableIndex(skipped = new Set()) {
    const now = Date.now();
    if (this.activeIndex !== null && !skipped.has(this.activeIndex) && this.cooldowns[this.activeIndex] <= now) return this.activeIndex;
    for (let index = 0; index < this.clients.length; index++) {
      if (!skipped.has(index) && this.cooldowns[index] <= now) {
        this.activeIndex = index;
        return index;
      }
    }
    return null;
  }

  async _execute(operation) {
    if (!this.clients.length) {
      const error = new Error('AI is not configured. Set GEMINI_API_KEYS or OPENROUTER_API_KEY on the backend.');
      error.status = 503;
      throw error;
    }
    let lastError;
    let retries = 0;
    let switches = 0;
    const skipped = new Set();
    for (;;) {
      const index = this._availableIndex(skipped);
      if (index === null) {
        const waiting = this.cooldowns.filter((_, i) => !skipped.has(i));
        const delay = waiting.length ? Math.min(...waiting) - Date.now() : Infinity;
        if (delay > MAX_COOLDOWN_WAIT_MS) {
          if (lastError && isCreditShortfall(lastError)) throw creditsExhausted(lastError);
          throw lastError || Object.assign(new Error('All AI API keys are cooling down. Add a healthy key or wait for the limit to reset.'), { status: 503 });
        }
        await this.sleep(Math.max(this.intervalMs, delay));
        continue;
      }
      try {
        const result = await operation(this.clients[index]);
        await this.sleep(this.intervalMs);
        return result;
      } catch (error) {
        lastError = error;
        if (error.unsupportedModel) {
          // Not this key's fault: try another provider for this call only.
          skipped.add(index);
          this.activeIndex = null;
          continue;
        }
        const status = statusOf(error);
        const invalid = status === 401 || isInvalidKey(error);
        if (invalid || isKeyLimit(error) || isCreditShortfall(error)) {
          this.cooldowns[index] = Date.now() + (invalid ? AUTH_COOLDOWN_MS : KEY_LIMIT_COOLDOWN_MS);
          this.activeIndex = null;
          switches++;
          if (switches >= this.clients.length) throw isCreditShortfall(error) ? creditsExhausted(error) : error;
          continue;
        }
        // Account-level credit and rate-limit failures are shared by every key.
        const transient = status === 429 || status >= 500 || ['ECONNRESET', 'ETIMEDOUT'].includes(error.code) || error.name === 'APIConnectionError';
        if (!transient || retries >= this.maxAttempts - 1) throw error;
        const headers = error.headers || error.response?.headers;
        const raw = headers?.get?.('retry-after') || headers?.['retry-after'];
        const delay = raw ? (Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - Date.now()) : 2000 * 2 ** retries;
        // A Gemini key's daily quota is per key: fall through to the next key instead of failing.
        const dailyQuota = /per ?day/i.test(String(error.message || ''));
        if (status === 429 && this.clients[index].provider === 'gemini' && (delay > MAX_COOLDOWN_WAIT_MS || dailyQuota)) {
          this.cooldowns[index] = Date.now() + (dailyQuota ? AUTH_COOLDOWN_MS : Math.min(delay, AUTH_COOLDOWN_MS));
          this.activeIndex = null;
          continue;
        }
        if (delay > MAX_COOLDOWN_WAIT_MS) throw error;
        retries++;
        await this.sleep(Math.max(this.intervalMs, delay || 0));
      }
    }
  }
}

module.exports = new AiKeyManager();
module.exports.AiKeyManager = AiKeyManager;
