const OpenAI = require('openai');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const AUTH_COOLDOWN_MS = 60 * 60 * 1000;
const KEY_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_COOLDOWN_WAIT_MS = 60000;

const statusOf = error => Number(error.status || error.response?.status);
const metadataOf = error => error.error?.metadata || error.response?.data?.error?.metadata || error.metadata || {};
const isKeyLimit = error => metadataOf(error).limit_source === 'openrouter_key_limit'
  || /key (?:total |monthly )?limit exceeded/i.test(String(error.message || ''));

class AiKeyManager {
  constructor(options = {}) {
    const keys = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    this.clients = options.clients || keys.map(apiKey => new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1', apiKey, maxRetries: 0,
      timeout: positive(process.env.AI_TIMEOUT_MS, 90000),
      defaultHeaders: { 'X-Title': 'QP Generator' }
    }));
    this.tail = Promise.resolve();
    this.sleep = options.sleep || wait;
    this.maxAttempts = Math.min(5, positive(process.env.AI_MAX_ATTEMPTS, 3));
    this.intervalMs = positive(process.env.AI_MIN_INTERVAL_MS, 1200);
    this.cooldowns = this.clients.map(() => 0);
    this.activeIndex = null;
  }

  // One request at a time. Transient rate limits keep their provider cooldown,
  // while invalid or per-key-limit keys are swapped for the next configured key.
  executeWithAI(operation) {
    const task = this.tail.then(() => this._execute(operation));
    this.tail = task.catch(() => {});
    return task;
  }

  _availableIndex() {
    const now = Date.now();
    if (this.activeIndex !== null && this.cooldowns[this.activeIndex] <= now) return this.activeIndex;
    for (let index = 0; index < this.clients.length; index++) {
      if (this.cooldowns[index] <= now) {
        this.activeIndex = index;
        return index;
      }
    }
    return null;
  }

  async _execute(operation) {
    if (!this.clients.length) {
      const error = new Error('AI is not configured. Set OPENROUTER_API_KEY on the backend.');
      error.status = 503;
      throw error;
    }
    let lastError;
    let retries = 0;
    let switches = 0;
    for (;;) {
      const index = this._availableIndex();
      if (index === null) {
        const delay = Math.min(...this.cooldowns) - Date.now();
        if (delay > MAX_COOLDOWN_WAIT_MS) {
          throw lastError || Object.assign(new Error('All OpenRouter API keys are cooling down. Add a healthy key or wait for the limit to reset.'), { status: 503 });
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
        const status = statusOf(error);
        if (status === 401 || isKeyLimit(error)) {
          this.cooldowns[index] = Date.now() + (status === 401 ? AUTH_COOLDOWN_MS : KEY_LIMIT_COOLDOWN_MS);
          this.activeIndex = null;
          switches++;
          if (switches >= this.clients.length) throw error;
          continue;
        }
        // Account-level credit and rate-limit failures are shared by every key.
        const transient = status === 429 || status >= 500 || ['ECONNRESET', 'ETIMEDOUT'].includes(error.code) || error.name === 'APIConnectionError';
        if (!transient || retries >= this.maxAttempts - 1) throw error;
        const headers = error.headers || error.response?.headers;
        const raw = headers?.get?.('retry-after') || headers?.['retry-after'];
        const delay = raw ? (Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - Date.now()) : 2000 * 2 ** retries;
        if (delay > MAX_COOLDOWN_WAIT_MS) throw error;
        retries++;
        await this.sleep(Math.max(this.intervalMs, delay || 0));
      }
    }
  }
}

module.exports = new AiKeyManager();
module.exports.AiKeyManager = AiKeyManager;
