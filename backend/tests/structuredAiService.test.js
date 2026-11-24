jest.mock('../src/services/aiKeyManager', () => ({ executeWithAI: jest.fn() }));
const manager = require('../src/services/aiKeyManager');
const { requestJson, chunkText, models } = require('../src/services/structuredAiService');
const response = (finish_reason = 'stop', content = '{"ok":true}') => ({ choices: [{ finish_reason, message: { content } }], usage: { total_tokens: 42, cost: 0.001 } });
beforeEach(() => jest.resetAllMocks());

test('defaults generation to the free router without overriding an explicit model', () => {
  const previous = process.env.AI_GENERATION_MODEL;
  try {
    delete process.env.AI_GENERATION_MODEL;
    jest.isolateModules(() => {
      expect(require('../src/services/structuredAiService').models.generation).toBe('google/gemini-2.5-flash');
    });
    process.env.AI_GENERATION_MODEL = 'configured/model';
    jest.isolateModules(() => {
      expect(require('../src/services/structuredAiService').models.generation).toBe('configured/model');
    });
  } finally {
    if (previous === undefined) delete process.env.AI_GENERATION_MODEL;
    else process.env.AI_GENERATION_MODEL = previous;
  }
});

test('keeps free generation on the same free model across provider retries', async () => {
  const previous = process.env.AI_GENERATION_MODEL;
  let freeRequest;
  let freeManager;
  try {
    process.env.AI_GENERATION_MODEL = 'openrouter/free';
    jest.isolateModules(() => {
      freeRequest = require('../src/services/structuredAiService').requestJson;
      freeManager = require('../src/services/aiKeyManager');
    });
    const create = jest.fn().mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 })).mockResolvedValueOnce(response());
    freeManager.executeWithAI.mockImplementation(async operation => {
      const client = { chat: { completions: { create } } };
      try { return await operation(client); } catch { return operation(client); }
    });
    await expect(freeRequest({ prompt: 'Generate questions', task: 'generation', maxTokens: 1900 })).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.every(([request]) => request.model === 'openrouter/free' && !request.models)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.AI_GENERATION_MODEL;
    else process.env.AI_GENERATION_MODEL = previous;
  }
});

test('uses the observed OpenRouter chat schema and distinct extraction/generation models', async () => {
  const create = jest.fn(async () => response());
  manager.executeWithAI.mockImplementation(operation => operation({ chat: { completions: { create } } }));
  expect(await requestJson({ prompt: 'Extract source', maxTokens: 512 })).toEqual({ ok: true });
  expect(create.mock.calls[0][0]).toMatchObject({ model: models.extraction, response_format: { type: 'json_object' }, max_tokens: 512 });
  await requestJson({ prompt: 'Generate questions', task: 'generation', maxTokens: 5500 });
  expect(create.mock.calls[1][0].model).toBe(models.generation);
});
test.each(['length', 'content_filter', 'error', 'tool_calls', null])('rejects incomplete or unusable finish reason %p', async finishReason => {
  manager.executeWithAI.mockResolvedValue(response(finishReason));
  await expect(requestJson({ prompt: 'test' })).rejects.toThrow(/incomplete/);
});
test.each(['', null, '{broken'])('rejects invalid JSON content %p', async content => {
  manager.executeWithAI.mockResolvedValue(response('stop', content));
  await expect(requestJson({ prompt: 'test' })).rejects.toThrow();
});
test('checks input byte limits before making a request', async () => {
  await expect(requestJson({ prompt: '电'.repeat(17000) })).rejects.toThrow(/input exceeds/);
  expect(manager.executeWithAI).not.toHaveBeenCalled();
});
test('reserves the budget for every actual retry attempt and records provider usage', async () => {
  const budget = { calls: 0, maxCalls: 3, reservedTokens: 0, maxTokens: 10000, usedTokens: 0, cost: 0 };
  const create = jest.fn().mockRejectedValueOnce(new Error('Transient mock failure')).mockResolvedValueOnce(response());
  manager.executeWithAI.mockImplementation(async operation => {
    const client = { chat: { completions: { create } } };
    try { return await operation(client); } catch { return operation(client); }
  });
  await requestJson({ prompt: 'test', maxTokens: 1000, budget });
  expect(budget).toMatchObject({ calls: 2, usedTokens: 42, cost: 0.001, reservedTokens: 2608 });
  expect(create).toHaveBeenCalledTimes(2);
});
test.each(['calls', 'tokens'])('stops before spending beyond the %s bound', async limit => {
  const budget = { calls: limit === 'calls' ? 3 : 0, maxCalls: 3, reservedTokens: 0, maxTokens: limit === 'tokens' ? 100 : 10000, usedTokens: 0, cost: 0 };
  const create = jest.fn();
  manager.executeWithAI.mockImplementation(operation => operation({ chat: { completions: { create } } }));
  await expect(requestJson({ prompt: 'test', maxTokens: 1000, budget })).rejects.toThrow(/budget reached/);
  expect(create).not.toHaveBeenCalled();
});
test('chunking preserves Unicode text and obeys its UTF-8 byte bound', () => {
  const source = '电阻网络\n' + 'emoji-free Unicode text '.repeat(5);
  const chunks = chunkText(source, 32);
  expect(chunks.every(c => Buffer.byteLength(c) <= 32)).toBe(true);
  expect(chunks.join('').replace(/\n/g, '')).toBe(source.replace(/\n/g, ''));
});
test('retries an insufficient-credit 402 with a completion limit the account can afford', async () => {
  const budget = { calls: 0, maxCalls: 10, reservedTokens: 0, maxTokens: 100000, usedTokens: 0, cost: 0 };
  const create = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('402 This request requires more credits, or fewer max_tokens. You requested up to 5500 tokens, but can only afford 5485.'), { status: 402 }))
    .mockResolvedValueOnce(response());
  manager.executeWithAI.mockImplementation(operation => operation({ chat: { completions: { create } } }));
  await expect(requestJson({ prompt: 'test', task: 'generation', maxTokens: 5500, budget })).resolves.toEqual({ ok: true });
  expect(create.mock.calls.map(call => call[0].max_tokens)).toEqual([5500, 5210]);
  expect(budget.calls).toBe(2);
  expect(budget.usedTokens).toBe(42);
});
test('adapts small classification requests without requiring a large completion budget', async () => {
  const create = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('402 This request requires more credits, or fewer max_tokens. You requested up to 600 tokens, but can only afford 500.'), { status: 402 }))
    .mockResolvedValueOnce(response());
  manager.executeWithAI.mockImplementation(operation => operation({ chat: { completions: { create } } }));
  await expect(requestJson({ prompt: 'test', maxTokens: 600 })).resolves.toEqual({ ok: true });
  expect(create.mock.calls.map(call => call[0].max_tokens)).toEqual([600, 475]);
});
test('reports exhausted credits instead of requesting an unusable completion budget', async () => {
  manager.executeWithAI.mockRejectedValue(Object.assign(new Error('402 This request requires more credits, or fewer max_tokens. You requested up to 5500 tokens, but can only afford 1200.'), { status: 402 }));
  await expect(requestJson({ prompt: 'test', maxTokens: 5500 })).rejects.toMatchObject({
    status: 402,
    message: expect.stringMatching(/credits are nearly exhausted/)
  });
  expect(manager.executeWithAI).toHaveBeenCalledTimes(1);
});
test('does not retry a 402 that carries no affordability hint', async () => {
  const error = Object.assign(new Error('402 Insufficient credits.'), { status: 402 });
  manager.executeWithAI.mockRejectedValue(error);
  await expect(requestJson({ prompt: 'test', maxTokens: 5500 })).rejects.toBe(error);
  expect(manager.executeWithAI).toHaveBeenCalledTimes(1);
});
