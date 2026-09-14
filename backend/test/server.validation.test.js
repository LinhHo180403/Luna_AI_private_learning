const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');

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

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

test('chat rejects a missing message', async () => {
  const { response, payload } = await postJson('/api/chat', {});
  assert.equal(response.status, 400);
  assert.equal(typeof payload.error, 'string');
});

test('chat rejects a non-string message', async () => {
  const { response, payload } = await postJson('/api/chat', { message: 123 });
  assert.equal(response.status, 400);
  assert.equal(typeof payload.error, 'string');
});

test('chat rejects a whitespace-only message', async () => {
  const { response, payload } = await postJson('/api/chat', { message: '   ' });
  assert.equal(response.status, 400);
  assert.equal(typeof payload.error, 'string');
});

test('chat rejects a message longer than the configured maximum', async () => {
  const { response, payload } = await postJson('/api/chat', { message: 'a'.repeat(app.MAX_MESSAGE_LENGTH + 1) });
  assert.equal(response.status, 400);
  assert.equal(typeof payload.error, 'string');
});

test('malformed JSON receives a JSON 400 response without a stack trace', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad}',
  });
  const body = await response.text();
  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(JSON.parse(body).error, 'JSON request body không hợp lệ.');
  assert.doesNotMatch(body, /SyntaxError|at parse|node_modules/);
});

test('session reset rejects blank and oversized session IDs', async () => {
  const blank = await fetch(`${baseUrl}/api/session/%20/reset`, { method: 'POST' });
  const oversized = await fetch(`${baseUrl}/api/session/${'a'.repeat(app.MAX_SESSION_ID_LENGTH + 1)}/reset`, { method: 'POST' });
  assert.equal(blank.status, 400);
  assert.equal(oversized.status, 400);
});

test('session reset accepts a normal session ID', async () => {
  const { response, payload } = await postJson('/api/session/baseline-validation/reset', {});
  assert.equal(response.status, 200);
  assert.deepEqual(payload.history, []);
});

test('session reset preserves support for the default session ID', async () => {
  const { response, payload } = await postJson('/api/session/default/reset', {});
  assert.equal(response.status, 200);
  assert.deepEqual(payload.history, []);
});
