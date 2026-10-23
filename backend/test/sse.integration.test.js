const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server');
const sessionManager = require('../session/sessionManager');
const config = require('../config/config');
const aiService = require('../services/aiService');
const { VALID_EMOTIONS, VALID_ANIMATIONS } = require('../core/responseBuilder');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test('POST /api/chat/stream returns SSE token and done events in offline mode', async () => {
  const sessionId = 'sse-offline';
  sessionManager.resetSession(sessionId);
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'stream this reply', sessionId }),
  });
  const body = await response.text();
  const tokenMatch = body.match(/event: token\ndata: (.+)\n\n/);
  const doneMatch = body.match(/event: done\ndata: (.+)\n\n/);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.ok(tokenMatch);
  assert.ok(doneMatch);
  const token = JSON.parse(tokenMatch[1]).token;
  const completed = JSON.parse(doneMatch[1]).response;
  assert.equal(token, completed.reply);
  assert.equal(completed.source, 'offline');
  assert.deepEqual(sessionManager.getHistory(sessionId).map((item) => item.role), ['user', 'assistant']);
});

test('POST /api/chat remains a JSON REST response after SSE support is added', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'REST still works', sessionId: 'sse-rest-regression' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(typeof payload.reply, 'string');
  assert.ok(payload.reply.length > 0);
});

test('Nara streaming still routes calculator and memory messages through LunaBrain before streaming AiSkill', async () => {
  const originalProvider = config.AI_PROVIDER;
  const originalStreamingReply = aiService.getStreamingReply;
  const streamedContexts = [];
  config.AI_PROVIDER = 'nara';
  aiService.getStreamingReply = async (context, { onToken }) => {
    streamedContexts.push(context);
    onToken('Hel');
    onToken('lo');
    return {
      reply: 'Hello', source: 'nara', emotion: 'neutral', animation: 'talk',
    };
  };

  try {
    const calculator = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '2+3*4', sessionId: 'sse-nara-calculator' }),
    });
    const calculatorText = await calculator.text();
    const calculatorDone = JSON.parse(calculatorText.match(/event: done\ndata: (.+)\n\n/)[1]).response;
    assert.equal(calculatorDone.source, 'calculator');
    assert.equal(calculatorDone.reply, '2+3*4 = 14');
    assert.equal(streamedContexts.length, 0);

    const memory = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'tôi là ai', sessionId: 'sse-nara-memory' }),
    });
    const memoryDone = JSON.parse((await memory.text()).match(/event: done\ndata: (.+)\n\n/)[1]).response;
    assert.equal(memoryDone.source, 'memory');
    assert.equal(streamedContexts.length, 0);

    const ai = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hãy kể một chuyện ngắn', sessionId: 'sse-nara-ai' }),
    });
    const aiText = await ai.text();
    const tokens = [...aiText.matchAll(/event: token\ndata: (.+)\n\n/g)].map((match) => JSON.parse(match[1]).token);
    const aiDone = JSON.parse(aiText.match(/event: done\ndata: (.+)\n\n/)[1]).response;
    assert.deepEqual(tokens, ['Hel', 'lo']);
    assert.equal(aiDone.reply, 'Hello');
    assert.equal(aiDone.source, 'nara');
    assert.ok(VALID_EMOTIONS.includes(aiDone.emotion));
    assert.ok(VALID_ANIMATIONS.includes(aiDone.animation));
    assert.deepEqual(aiDone.commands, []);
  } finally {
    config.AI_PROVIDER = originalProvider;
    aiService.getStreamingReply = originalStreamingReply;
  }
});

test('stream endpoint validates invalid input before opening an SSE response', async () => {
  for (const body of [
    { message: '', sessionId: 'sse-invalid' },
    { message: 'x'.repeat(app.MAX_MESSAGE_LENGTH + 1), sessionId: 'sse-invalid' },
    { message: 'hello', sessionId: 'bad session id' },
  ]) {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});

test('client disconnect aborts Nara streaming without persisting a partial turn', async () => {
  const originalProvider = config.AI_PROVIDER;
  const originalStreamingReply = aiService.getStreamingReply;
  const sessionId = 'sse-client-abort';
  sessionManager.resetSession(sessionId);
  config.AI_PROVIDER = 'nara';
  let signalWasAborted = false;
  let notifyAbort;
  const aborted = new Promise((resolve) => { notifyAbort = resolve; });
  aiService.getStreamingReply = async (_context, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      signalWasAborted = true;
      notifyAbort();
      const error = new Error('client cancelled');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    await new Promise((resolve, reject) => {
      const request = http.request(`${baseUrl}/api/chat/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      }, (response) => {
        response.destroy();
        resolve();
      });
      request.on('error', (error) => error.code === 'ECONNRESET' ? resolve() : reject(error));
      request.end(JSON.stringify({ message: 'hãy stream thật chậm', sessionId }));
    });
    await Promise.race([
      aborted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('server did not abort upstream stream')), 1_000)),
    ]);
    assert.equal(signalWasAborted, true);
    assert.deepEqual(sessionManager.getHistory(sessionId), []);
  } finally {
    config.AI_PROVIDER = originalProvider;
    aiService.getStreamingReply = originalStreamingReply;
  }
});
