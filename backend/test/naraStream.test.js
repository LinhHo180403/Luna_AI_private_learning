const test = require('node:test');
const assert = require('node:assert/strict');

const { callNaraStream } = require('../services/naraService');

function createStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

test('Nara stream forwards ordered token chunks without a network request', async () => {
  const tokens = [];
  let request;
  const reply = await callNaraStream({
    messages: [{ role: 'user', content: 'hello' }],
    systemPrompt: 'test system prompt',
    apiKey: 'test-key',
    baseUrl: 'https://nara.test/v1',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        body: createStream([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    },
    onToken: (token) => tokens.push(token),
  });

  assert.equal(reply, 'Hello');
  assert.deepEqual(tokens, ['Hel', 'lo']);
  assert.equal(request.url, 'https://nara.test/v1/chat/completions');
  assert.equal(JSON.parse(request.options.body).stream, true);
});

test('Nara stream stops immediately when an external abort signal is triggered', async () => {
  const controller = new AbortController();
  const pendingFetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const pending = callNaraStream({
    messages: [{ role: 'user', content: 'hello' }], onToken: () => {}, apiKey: 'test-key',
    fetchImpl: pendingFetch, signal: controller.signal, timeoutMs: 10_000,
  });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});
