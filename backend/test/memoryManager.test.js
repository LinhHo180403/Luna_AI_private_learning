const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMemoryManager,
  MemoryManagerError,
  MEMORY_VERSION,
} = require('../memory/memoryManager');

function createClock() {
  let index = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, index++)).toISOString();
}

function createTestManager(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-memory-manager-'));
  const memoryPath = path.join(directory, 'memory.json');
  return {
    directory,
    memoryPath,
    manager: createMemoryManager(memoryPath, { now: createClock(), ...options }),
  };
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

function createBackupFailingFileSystem() {
  return {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    unlinkSync: fs.unlinkSync,
    renameSync: fs.renameSync,
    writeFileSync: (targetPath, ...args) => {
      if (path.basename(targetPath).startsWith('.memory.json.bak.')) {
        throw new Error('simulated backup write failure');
      }
      return fs.writeFileSync(targetPath, ...args);
    },
  };
}

test('missing memory file creates the versioned default schema and backup', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    const memory = manager.readMemory();
    assert.equal(memory.version, MEMORY_VERSION);
    assert.deepEqual(memory, {
      version: 1, name: null, preferences: {}, notes: [], goals: [], updatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(fs.existsSync(memoryPath), true);
    assert.equal(fs.existsSync(manager.backupPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(manager.backupPath, 'utf-8')), memory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy memory is normalized without losing valid fields', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    fs.writeFileSync(memoryPath, JSON.stringify({
      name: 'Linh', preferences: { theme: 'dark' }, notes: ['uses Luna'], updatedAt: '2025-01-01T00:00:00.000Z',
    }), 'utf-8');
    assert.deepEqual(manager.readMemory(), {
      version: 1,
      name: 'Linh',
      preferences: { theme: 'dark' },
      notes: ['uses Luna'],
      goals: [],
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed memory is safe to read and is never overwritten by a patch or reset', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    fs.writeFileSync(memoryPath, '{bad json}', 'utf-8');
    assert.equal(manager.readMemory().version, MEMORY_VERSION);
    assert.throws(() => manager.patchMemory({ name: 'Linh' }), MemoryManagerError);
    assert.throws(() => manager.resetMemory(), MemoryManagerError);
    assert.equal(fs.readFileSync(memoryPath, 'utf-8'), '{bad json}');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('memory updates merge name, preferences, notes, and goals with a new timestamp', () => {
  const { directory, manager } = createTestManager();
  try {
    manager.readMemory();
    const named = manager.patchMemory({ name: 'Linh' });
    const updated = manager.patchMemory({
      preferences: { likes: ['anime'] }, notes: ['desktop-first'], goals: ['finish Luna AI'],
    });
    const merged = manager.patchMemory({ preferences: { likes: ['coding'] }, notes: ['desktop-first'] });

    assert.equal(named.name, 'Linh');
    assert.deepEqual(updated.preferences, { likes: ['anime'] });
    assert.deepEqual(updated.notes, ['desktop-first']);
    assert.deepEqual(updated.goals, ['finish Luna AI']);
    assert.deepEqual(merged.preferences.likes, ['anime', 'coding']);
    assert.deepEqual(merged.notes, ['desktop-first']);
    assert.notEqual(updated.updatedAt, named.updatedAt);
    assert.deepEqual(JSON.parse(fs.readFileSync(manager.backupPath, 'utf-8')), merged);

    const unchanged = manager.patchMemory({ notes: ['desktop-first'] });
    assert.equal(unchanged.updatedAt, merged.updatedAt);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a valid backup restores a corrupted primary memory after manager restart', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    const saved = manager.patchMemory({ name: 'Linh', goals: ['finish Luna AI'] });
    fs.writeFileSync(memoryPath, '{corrupted primary}', 'utf-8');
    const restartedManager = createMemoryManager(memoryPath, { now: createClock() });

    assert.deepEqual(restartedManager.readMemory(), saved);
    assert.deepEqual(JSON.parse(fs.readFileSync(memoryPath, 'utf-8')), saved);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a valid backup restores a missing primary memory', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    const saved = manager.patchMemory({ name: 'Linh' });
    fs.unlinkSync(memoryPath);
    const restartedManager = createMemoryManager(memoryPath, { now: createClock() });

    assert.deepEqual(restartedManager.readMemory(), saved);
    assert.deepEqual(JSON.parse(fs.readFileSync(memoryPath, 'utf-8')), saved);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('corrupted primary and backup files are preserved when recovery is impossible', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    manager.patchMemory({ name: 'Linh' });
    fs.writeFileSync(memoryPath, '{bad primary}', 'utf-8');
    fs.writeFileSync(manager.backupPath, '{bad backup}', 'utf-8');

    assert.equal(manager.readMemory().version, MEMORY_VERSION);
    assert.throws(() => manager.patchMemory({ notes: ['must not overwrite'] }), MemoryManagerError);
    assert.equal(fs.readFileSync(memoryPath, 'utf-8'), '{bad primary}');
    assert.equal(fs.readFileSync(manager.backupPath, 'utf-8'), '{bad backup}');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a backup write failure preserves the valid primary memory', () => {
  const { directory, memoryPath } = createTestManager();
  try {
    const manager = createMemoryManager(memoryPath, {
      fileSystem: createBackupFailingFileSystem(), now: createClock(),
    });
    const saved = manager.patchMemory({ name: 'Linh' });

    assert.equal(saved.name, 'Linh');
    assert.deepEqual(JSON.parse(fs.readFileSync(memoryPath, 'utf-8')).name, 'Linh');
    assert.equal(fs.existsSync(manager.backupPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('temporary write failure preserves the existing memory file', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    manager.patchMemory({ name: 'Linh' });
    const previous = fs.readFileSync(memoryPath, 'utf-8');
    const failingManager = createMemoryManager(memoryPath, {
      fileSystem: createFailingFileSystem('writeFileSync'), now: createClock(),
    });
    assert.throws(() => failingManager.patchMemory({ notes: ['new note'] }), MemoryManagerError);
    assert.equal(fs.readFileSync(memoryPath, 'utf-8'), previous);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('atomic replace failure preserves the existing memory file', () => {
  const { directory, memoryPath, manager } = createTestManager();
  try {
    manager.patchMemory({ name: 'Linh' });
    const previous = fs.readFileSync(memoryPath, 'utf-8');
    const failingManager = createMemoryManager(memoryPath, {
      fileSystem: createFailingFileSystem('renameSync'), now: createClock(),
    });
    assert.throws(() => failingManager.patchMemory({ notes: ['new note'] }), MemoryManagerError);
    assert.equal(fs.readFileSync(memoryPath, 'utf-8'), previous);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reset writes a fresh default schema only when the current file is valid', () => {
  const { directory, manager } = createTestManager();
  try {
    manager.patchMemory({ name: 'Linh', notes: ['keep before reset'] });
    const reset = manager.resetMemory();
    assert.equal(reset.name, null);
    assert.deepEqual(reset.preferences, {});
    assert.deepEqual(reset.notes, []);
    assert.deepEqual(reset.goals, []);
    assert.equal(reset.version, MEMORY_VERSION);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
