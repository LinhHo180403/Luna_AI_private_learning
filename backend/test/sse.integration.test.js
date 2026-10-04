const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const sessionManager = require('../session/sessionManager');

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
