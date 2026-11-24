// Even module initialization cannot construct a live provider client.
jest.mock('openai', () => jest.fn(() => ({ offline: true })));

const OpenAI = require('openai');
const { AiKeyManager } = require('../src/services/aiKeyManager');

const envKeys = ['AI_MAX_ATTEMPTS', 'AI_MIN_INTERVAL_MS'];
let originalEnv;

beforeEach(() => {
  jest.clearAllMocks();
  originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.AI_MAX_ATTEMPTS = '3';
  process.env.AI_MIN_INTERVAL_MS = '10';
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function fixture() {
  const client = { chat: { completions: { create: jest.fn() } } };
  const otherClient = { chat: { completions: { create: jest.fn() } } };
  const sleep = jest.fn().mockResolvedValue(undefined);
  const manager = new AiKeyManager({ clients: [client, otherClient], sleep });
  const operation = jest.fn(ai => ai.chat.completions.create({ model: 'offline-model' }));
  return { manager, client, otherClient, sleep, operation };
}

describe('Bounded AI retries with injected clients and sleep', () => {
  test('uses the injected client and pacing without constructing provider clients', async () => {
    const { manager, client, otherClient, sleep, operation } = fixture();
    const output = { choices: [{ message: { content: 'offline' } }] };
    client.chat.completions.create.mockResolvedValue(output);
    await expect(manager.executeWithAI(operation)).resolves.toBe(output);
    expect(operation).toHaveBeenCalledWith(client);
    expect(sleep.mock.calls).toEqual([[10]]);
    expect(otherClient.chat.completions.create).not.toHaveBeenCalled();
    expect(OpenAI).not.toHaveBeenCalled();
  });

  test.each([429, 500, 502, 503])('bounds persistent HTTP %s failures to three attempts', async status => {
    const { manager, client, otherClient, sleep, operation } = fixture();
    const error = Object.assign(new Error('offline provider failure'), { status });
    client.chat.completions.create.mockRejectedValue(error);
    await expect(manager.executeWithAI(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [4000]]);
    expect(otherClient.chat.completions.create).not.toHaveBeenCalled();
  });

  test('retries nested 5xx statuses and succeeds within the bound', async () => {
    const { manager, client, sleep, operation } = fixture();
    client.chat.completions.create
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { response: { status: 503 } }))
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { status: 502 }))
      .mockResolvedValueOnce('recovered');
    await expect(manager.executeWithAI(operation)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [4000], [10]]);
  });

  test.each([
    { status: 400 }, { status: 403 }, { status: 422 }
  ])('does not retry permanent failures %p', async properties => {
    const { manager, client, sleep, operation } = fixture();
    const error = Object.assign(new Error('permanent'), properties);
    client.chat.completions.create.mockRejectedValue(error);
    await expect(manager.executeWithAI(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('rotates to the next configured key after an invalid-key response', async () => {
    const { manager, client, otherClient, sleep, operation } = fixture();
    client.chat.completions.create.mockRejectedValue(Object.assign(new Error('invalid key'), { status: 401 }));
    otherClient.chat.completions.create.mockResolvedValue('ok');
    await expect(manager.executeWithAI(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenNthCalledWith(1, client);
    expect(operation).toHaveBeenNthCalledWith(2, otherClient);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[10]]);
  });

  test('rotates away from a key whose own spend limit is exhausted', async () => {
    const { manager, client, otherClient, sleep, operation } = fixture();
    const error = Object.assign(new Error('Key limit exceeded'), {
      status: 403,
      error: { metadata: { limit_source: 'openrouter_key_limit' } }
    });
    client.chat.completions.create.mockRejectedValue(error);
    otherClient.chat.completions.create.mockResolvedValue('ok');
    await expect(manager.executeWithAI(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenNthCalledWith(1, client);
    expect(operation).toHaveBeenNthCalledWith(2, otherClient);
    expect(sleep.mock.calls).toEqual([[10]]);
  });

  test('does not rotate for an account-level credit shortfall', async () => {
    const { manager, client, otherClient, sleep, operation } = fixture();
    const error = Object.assign(new Error('This request requires more credits, or fewer max_tokens. You requested up to 5500 tokens, but can only afford 5485.'), { status: 402 });
    client.chat.completions.create.mockRejectedValue(error);
    await expect(manager.executeWithAI(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(otherClient.chat.completions.create).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  test('gives up after every configured key is rejected without waiting out the cooldown', async () => {
    const { manager, client, otherClient, sleep, operation } = fixture();
    const first = Object.assign(new Error('invalid first key'), { status: 401 });
    const second = Object.assign(new Error('invalid second key'), { status: 401 });
    client.chat.completions.create.mockRejectedValue(first);
    otherClient.chat.completions.create.mockRejectedValue(second);
    await expect(manager.executeWithAI(operation)).rejects.toBe(second);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('keeps the healthy key active for later queued operations', async () => {
    const { manager, client, otherClient, operation } = fixture();
    client.chat.completions.create.mockRejectedValueOnce(Object.assign(new Error('invalid key'), { status: 401 }));
    otherClient.chat.completions.create.mockResolvedValue('ok');
    await expect(manager.executeWithAI(operation)).resolves.toBe('ok');
    const secondOperation = jest.fn().mockResolvedValue('second');
    await expect(manager.executeWithAI(secondOperation)).resolves.toBe('second');
    expect(secondOperation).toHaveBeenCalledWith(otherClient);
  });

  test.each([
    { code: 'ECONNRESET' }, { code: 'ETIMEDOUT' }, { name: 'APIConnectionError' }
  ])('bounds transient connection failures %p', async properties => {
    const { manager, client, sleep, operation } = fixture();
    const error = Object.assign(new Error('connection failed'), properties);
    client.chat.completions.create.mockRejectedValue(error);
    await expect(manager.executeWithAI(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test.each([
    { status: 429, headers: { 'retry-after': '7' } },
    { status: 503, response: { headers: { 'retry-after': '7' } } },
    { status: 429, headers: { get: jest.fn().mockReturnValue('7') } }
  ])('honors numeric Retry-After from supported header shapes %p', async properties => {
    const { manager, client, sleep, operation } = fixture();
    client.chat.completions.create
      .mockRejectedValueOnce(Object.assign(new Error('cooldown'), properties))
      .mockResolvedValueOnce('ok');
    await expect(manager.executeWithAI(operation)).resolves.toBe('ok');
    expect(sleep.mock.calls).toEqual([[7000], [10]]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('honors HTTP-date Retry-After using an injected clock observation', async () => {
    const now = Date.parse('2030-01-01T00:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { manager, client, sleep, operation } = fixture();
    client.chat.completions.create
      .mockRejectedValueOnce(Object.assign(new Error('cooldown'), {
        status: 429, headers: { 'retry-after': new Date(now + 15000).toUTCString() }
      }))
      .mockResolvedValueOnce('ok');
    await expect(manager.executeWithAI(operation)).resolves.toBe('ok');
    expect(sleep.mock.calls).toEqual([[15000], [10]]);
  });

  test('does not violate a cooldown longer than the bounded wait', async () => {
    const { manager, client, sleep, operation } = fixture();
    const error = Object.assign(new Error('long cooldown'), { status: 429, headers: { 'retry-after': '61' } });
    client.chat.completions.create.mockRejectedValue(error);
    await expect(manager.executeWithAI(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('enforces minimum pacing for shorter provider cooldowns', async () => {
    const { manager, client, sleep, operation } = fixture();
    client.chat.completions.create
      .mockRejectedValueOnce(Object.assign(new Error('short cooldown'), { status: 429, headers: { 'retry-after': '0.001' } }))
      .mockResolvedValueOnce('ok');
    await expect(manager.executeWithAI(operation)).resolves.toBe('ok');
    expect(sleep.mock.calls).toEqual([[10], [10]]);
  });

  test('caps configured retry attempts at five and supports a one-attempt limit', async () => {
    process.env.AI_MAX_ATTEMPTS = '100';
    const capped = fixture();
    capped.client.chat.completions.create.mockRejectedValue(Object.assign(new Error('offline'), { status: 500 }));
    await expect(capped.manager.executeWithAI(capped.operation)).rejects.toThrow('offline');
    expect(capped.operation).toHaveBeenCalledTimes(5);
    expect(capped.sleep.mock.calls).toEqual([[2000], [4000], [8000], [16000]]);
    process.env.AI_MAX_ATTEMPTS = '1';
    const single = fixture();
    single.client.chat.completions.create.mockRejectedValue(Object.assign(new Error('offline'), { status: 429 }));
    await expect(single.manager.executeWithAI(single.operation)).rejects.toThrow('offline');
    expect(single.operation).toHaveBeenCalledTimes(1);
    expect(single.sleep).not.toHaveBeenCalled();
  });

  test('reports missing configuration without invoking the operation', async () => {
    const sleep = jest.fn();
    const operation = jest.fn();
    const manager = new AiKeyManager({ clients: [], sleep });
    await expect(manager.executeWithAI(operation)).rejects.toMatchObject({ status: 503 });
    expect(operation).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('Serial queue survives a failed operation', () => {
  test('never overlaps concurrent submissions and continues after a permanent rejection', async () => {
    const { manager, client, sleep } = fixture();
    const events = [];
    let release;
    let notifyStarted;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { notifyStarted = resolve; });
    const error = Object.assign(new Error('bad request'), { status: 400 });
    const first = manager.executeWithAI(async ai => {
      expect(ai).toBe(client);
      events.push('first:start');
      notifyStarted();
      await gate;
      events.push('first:fail');
      throw error;
    });
    const observedFailure = expect(first).rejects.toBe(error);
    const second = manager.executeWithAI(async () => { events.push('second:start'); return 'second'; });
    const third = manager.executeWithAI(async () => { events.push('third:start'); return 'third'; });
    await started;
    expect(events).toEqual(['first:start']);
    release();
    await observedFailure;
    await expect(second).resolves.toBe('second');
    await expect(third).resolves.toBe('third');
    expect(events).toEqual(['first:start', 'first:fail', 'second:start', 'third:start']);
    expect(sleep.mock.calls).toEqual([[10], [10]]);
  });

  test('keeps the next operation queued until successful pacing finishes', async () => {
    let release;
    let notifyPacing;
    const gate = new Promise(resolve => { release = resolve; });
    const pacingStarted = new Promise(resolve => { notifyPacing = resolve; });
    const sleep = jest.fn().mockImplementationOnce(() => { notifyPacing(); return gate; }).mockResolvedValue(undefined);
    const manager = new AiKeyManager({ clients: [{ offline: true }], sleep });
    const secondOperation = jest.fn().mockResolvedValue('second');
    const first = manager.executeWithAI(async () => 'first');
    const second = manager.executeWithAI(secondOperation);
    await pacingStarted;
    expect(secondOperation).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(secondOperation).toHaveBeenCalledTimes(1);
  });
});
