const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-chat-archive-http-'));
process.env.CHAT_ARCHIVE_FILE_PATH = path.join(directory, 'chat-archive.json');

const app = require('../server');
const { ChatArchiveError, chatArchiveManager } = require('../archive/chatArchiveManager');

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
  fs.rmSync(directory, { recursive: true, force: true });
});

test('POST /api/chat archives a completed turn without changing its response', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'archive this chat', sessionId: 'archive-http' }),
  });
  const payload = await response.json();
  const archive = chatArchiveManager.readArchive();
  const conversation = archive.conversations.find((item) => item.id === 'archive-http');

  assert.equal(response.status, 200);
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].content, 'archive this chat');
  assert.equal(conversation.messages[1].content, payload.reply);
  assert.equal(conversation.messages[1].source, payload.source);
});

test('POST /api/chat stays successful when archive persistence fails', async () => {
  const originalAppendConversationTurn = chatArchiveManager.appendConversationTurn;
  chatArchiveManager.appendConversationTurn = () => {
    throw new ChatArchiveError('simulated archive persistence failure');
  };

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'archive failure must not fail chat', sessionId: 'archive-http-failure' }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(typeof payload.reply, 'string');
    assert.ok(payload.reply.trim().length > 0);
  } finally {
    chatArchiveManager.appendConversationTurn = originalAppendConversationTurn;
  }
});
