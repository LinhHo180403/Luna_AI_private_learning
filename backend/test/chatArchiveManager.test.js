const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ChatArchiveError, createChatArchiveManager } = require('../archive/chatArchiveManager');

function createTestArchive() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-chat-archive-'));
  return { directory, manager: createChatArchiveManager(path.join(directory, 'chat-archive.json')) };
}

function createFailingFileSystem(method) {
  return {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    unlinkSync: fs.unlinkSync,
    writeFileSync: method === 'writeFileSync' ? () => { throw new Error('simulated write failure'); } : fs.writeFileSync,
    renameSync: method === 'renameSync' ? () => { throw new Error('simulated replace failure'); } : fs.renameSync,
  };
}

test('chat archive persists a completed user and assistant turn', () => {
  const { directory, manager } = createTestArchive();
  try {
    manager.appendConversationTurn({
      sessionId: 'archive-test', userMessage: 'hello', assistantMessage: 'hi', assistantSource: 'offline',
    });
    const archive = manager.readArchive();
    assert.equal(archive.version, 1);
    assert.equal(archive.conversations.length, 1);
    assert.deepEqual(archive.conversations[0].messages.map(({ role, content, source }) => ({ role, content, source })), [
      { role: 'user', content: 'hello', source: undefined },
      { role: 'assistant', content: 'hi', source: 'offline' },
    ]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('chat archive keeps conversations separated by session ID', () => {
  const { directory, manager } = createTestArchive();
  try {
    manager.appendConversationTurn({ sessionId: 'one', userMessage: 'a', assistantMessage: 'b' });
    manager.appendConversationTurn({ sessionId: 'two', userMessage: 'c', assistantMessage: 'd' });
    manager.appendConversationTurn({ sessionId: 'one', userMessage: 'e', assistantMessage: 'f' });
    const archive = manager.readArchive();
    assert.equal(archive.conversations.length, 2);
    assert.equal(archive.conversations.find((item) => item.id === 'one').messages.length, 4);
    assert.equal(archive.conversations.find((item) => item.id === 'two').messages.length, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('chat archive rejects a malformed archive without replacing it', () => {
  const { directory, manager } = createTestArchive();
  try {
    fs.writeFileSync(manager.archivePath, '{bad json}', 'utf-8');
    assert.throws(
      () => manager.appendConversationTurn({ sessionId: 'one', userMessage: 'a', assistantMessage: 'b' }),
      ChatArchiveError
    );
    assert.equal(fs.readFileSync(manager.archivePath, 'utf-8'), '{bad json}');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('chat archive preserves the previous file when the temporary write fails', () => {
  const { directory, manager } = createTestArchive();
  try {
    manager.appendConversationTurn({ sessionId: 'one', userMessage: 'old', assistantMessage: 'reply' });
    const previousContents = fs.readFileSync(manager.archivePath, 'utf-8');
    const failingManager = createChatArchiveManager(manager.archivePath, {
      fileSystem: createFailingFileSystem('writeFileSync'),
    });

    assert.throws(
      () => failingManager.appendConversationTurn({ sessionId: 'one', userMessage: 'new', assistantMessage: 'reply' }),
      ChatArchiveError
    );
    assert.equal(fs.readFileSync(manager.archivePath, 'utf-8'), previousContents);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('chat archive preserves the previous file when atomic replace fails', () => {
  const { directory, manager } = createTestArchive();
  try {
    manager.appendConversationTurn({ sessionId: 'one', userMessage: 'old', assistantMessage: 'reply' });
    const previousContents = fs.readFileSync(manager.archivePath, 'utf-8');
    const failingManager = createChatArchiveManager(manager.archivePath, {
      fileSystem: createFailingFileSystem('renameSync'),
    });

    assert.throws(
      () => failingManager.appendConversationTurn({ sessionId: 'one', userMessage: 'new', assistantMessage: 'reply' }),
      ChatArchiveError
    );
    assert.equal(fs.readFileSync(manager.archivePath, 'utf-8'), previousContents);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
