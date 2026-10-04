const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessionManager } = require('../session/sessionManager');
const aiService = require('../services/aiService');
const { createChatArchiveManager } = require('../archive/chatArchiveManager');
const { createMemoryManager } = require('../memory/memoryManager');

function createClock() {
  let index = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, index++)).toISOString();
}

test('session memory isolates sessions and preserves message ordering', () => {
  const manager = createSessionManager({ now: createClock() });
  manager.addMessage('alpha', 'user', 'alpha user');
  manager.addMessage('alpha', 'assistant', 'alpha assistant');
  manager.addMessage('beta', 'user', 'beta user');

  assert.deepEqual(manager.getHistory('alpha').map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: 'alpha user' },
    { role: 'assistant', content: 'alpha assistant' },
  ]);
  assert.deepEqual(manager.getHistory('beta').map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: 'beta user' },
  ]);
});

test('session memory caps history by message count and updates session timestamps', () => {
  const manager = createSessionManager({ maxHistoryMessages: 3, now: createClock() });
  const created = manager.getSession('limited');
  const createdUpdatedAt = created.updatedAt;
  assert.equal(created.createdAt, created.updatedAt);
  assert.ok(!Number.isNaN(Date.parse(created.updatedAt)));

  manager.addMessage('limited', 'user', 'one');
  manager.addMessage('limited', 'assistant', 'two');
  manager.addMessage('limited', 'user', 'three');
  const updated = manager.addMessage('limited', 'assistant', 'four');

  assert.deepEqual(updated.history.map(({ role, content }) => ({ role, content })), [
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
    { role: 'assistant', content: 'four' },
  ]);
  assert.notEqual(updated.updatedAt, createdUpdatedAt);
});

test('trimmed session history is summarized into persistent long-term memory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-session-summary-'));
  const memory = createMemoryManager(path.join(directory, 'memory.json'), { now: createClock() });
  const manager = createSessionManager({ maxHistoryMessages: 2, now: createClock(), memoryManager: memory });
  try {
    manager.addMessage('summary', 'user', 'I am building Luna AI on desktop');
    manager.addMessage('summary', 'assistant', 'That sounds exciting');
    manager.addMessage('summary', 'user', 'Please keep the architecture simple');

    assert.deepEqual(manager.getHistory('summary').map((item) => item.content), [
      'That sounds exciting',
      'Please keep the architecture simple',
    ]);
    assert.deepEqual(memory.readMemory().notes, [
      'Tóm tắt hội thoại cũ: Người dùng: I am building Luna AI on desktop',
    ]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('session reset affects only its runtime session and a new manager simulates restart', () => {
  const manager = createSessionManager({ now: createClock() });
  manager.addMessage('reset-me', 'user', 'remove this');
  manager.addMessage('keep-me', 'user', 'keep this');
  const reset = manager.resetSession('reset-me');

  assert.deepEqual(reset.history, []);
  assert.equal(reset.createdAt, reset.updatedAt);
  assert.deepEqual(manager.getHistory('keep-me').map((item) => item.content), ['keep this']);

  const restartedManager = createSessionManager({ now: createClock() });
  assert.deepEqual(restartedManager.listSessionIds(), []);
  assert.deepEqual(restartedManager.getHistory('reset-me'), []);
});

test('session reset and restart do not modify persistent chat archive', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-session-memory-archive-'));
  const archive = createChatArchiveManager(path.join(directory, 'chat-archive.json'));
  try {
    archive.appendConversationTurn({ sessionId: 'persisted', userMessage: 'archived user', assistantMessage: 'archived assistant' });
    const before = fs.readFileSync(archive.archivePath, 'utf-8');
    const manager = createSessionManager({ now: createClock() });
    manager.addMessage('persisted', 'user', 'runtime only');
    manager.resetSession('persisted');
    createSessionManager({ now: createClock() });

    assert.equal(fs.readFileSync(archive.archivePath, 'utf-8'), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('aiService sends only ordered runtime session history to the provider', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-session-provider-archive-'));
  const archive = createChatArchiveManager(path.join(directory, 'chat-archive.json'));
  const manager = createSessionManager({ now: createClock() });
  try {
    archive.appendConversationTurn({
      sessionId: 'context', userMessage: 'archived user', assistantMessage: 'archived assistant',
    });
    manager.addMessage('context', 'user', 'runtime user');
    manager.addMessage('context', 'assistant', 'runtime assistant');
    let receivedMessages;
    let receivedContext;
    const provider = {
      name: 'test-provider',
      chat: async (messages, options) => {
        receivedMessages = messages;
        receivedContext = options.context;
        return { reply: 'provider reply', emotion: 'neutral', animation: 'talk' };
      },
    };

    await aiService.getReply(
      { message: 'current user', session: manager.getSession('context'), memory: { name: null } },
      { provider }
    );

    assert.deepEqual(receivedMessages, [
      { role: 'user', content: 'runtime user' },
      { role: 'assistant', content: 'runtime assistant' },
      { role: 'user', content: 'current user' },
    ]);
    assert.equal('archive' in receivedContext, false);
    assert.doesNotMatch(JSON.stringify(receivedMessages), /archived user|archived assistant/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
