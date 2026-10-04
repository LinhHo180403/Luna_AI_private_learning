const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { LunaBrain } = require('../brain/lunaBrain');
const ResponseBuilder = require('../core/responseBuilder');
const aiService = require('../services/aiService');
const NaraProvider = require('../services/providers/naraProvider');
const { generateOfflineReply } = require('../services/offlineService');
const { createMemoryManager } = require('../memory/memoryManager');
const { createSessionManager } = require('../session/sessionManager');
const { createChatArchiveManager } = require('../archive/chatArchiveManager');

test('LunaBrain reads one memory snapshot and supplies it to its selected skill', async () => {
  const memory = { version: 1, name: 'Linh', preferences: {}, notes: [], goals: [], updatedAt: '2026-01-01T00:00:00.000Z' };
  let reads = 0;
  let receivedContext;
  const skill = {
    name: 'MemoryObserver',
    canHandle: (context) => {
      receivedContext = context;
      return true;
    },
    handle: async () => new ResponseBuilder().setReply('ok').setSource('test').build(),
  };
  const brain = new LunaBrain({
    memoryManager: { readMemory: () => { reads += 1; return memory; } },
    skillOrder: [skill],
  });

  await brain.processMessage({ message: 'hello' });
  assert.equal(reads, 1);
  assert.equal(receivedContext.memory, memory);
});

test('aiService formats long-term memory into the Nara system prompt without archive data', async () => {
  let receivedRequest;
  const provider = new NaraProvider({
    callNara: async (request) => {
      receivedRequest = request;
      return 'hello';
    },
  });
  const memory = {
    version: 1,
    name: 'Linh',
    preferences: { likes: ['anime'] },
    notes: ['old note', 'desktop-first', 'explicit memory only', 'latest note'],
    goals: ['finish Luna AI'],
  };

  await aiService.getReply({
    message: 'current request',
    session: { history: [{ role: 'user', content: 'runtime history' }] },
    memory,
  }, { provider });

  assert.deepEqual(receivedRequest.messages, [
    { role: 'user', content: 'runtime history' },
    { role: 'user', content: 'current request' },
  ]);
  assert.match(receivedRequest.systemPrompt, /Linh/);
  assert.match(receivedRequest.systemPrompt, /anime/);
  assert.match(receivedRequest.systemPrompt, /desktop-first/);
  assert.match(receivedRequest.systemPrompt, /latest note/);
  assert.doesNotMatch(receivedRequest.systemPrompt, /old note/);
  assert.doesNotMatch(receivedRequest.systemPrompt, /archive/i);
});

test('offline replies use the supplied context memory snapshot', () => {
  const result = generateOfflineReply({
    message: 'hello',
    memory: { name: 'Linh', preferences: {}, notes: [], goals: [] },
  });
  assert.match(result.reply, /Linh/);
});

test('session lifecycle and chat archive changes do not modify long-term memory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-memory-isolation-'));
  const memoryPath = path.join(directory, 'memory.json');
  const archivePath = path.join(directory, 'chat-archive.json');
  const manager = createMemoryManager(memoryPath);
  const sessions = createSessionManager();
  const archive = createChatArchiveManager(archivePath);
  try {
    manager.patchMemory({ name: 'Linh', goals: ['finish Luna AI'] });
    const before = fs.readFileSync(memoryPath, 'utf-8');
    sessions.addMessage('one', 'user', 'runtime turn');
    sessions.resetSession('one');
    createSessionManager();
    archive.appendConversationTurn({ sessionId: 'one', userMessage: 'archived user', assistantMessage: 'archived assistant' });

    assert.equal(fs.readFileSync(memoryPath, 'utf-8'), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
