const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../core/logger');

const MEMORY_VERSION = 1;
// Keep the deterministic prompt footprint bounded until retrieval is introduced in a later phase.
const MAX_PREFERENCES = 20;
const MAX_NOTES = 20;
const MAX_GOALS = 10;
const MAX_MEMORY_ITEM_LENGTH = 300;

class MemoryManagerError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MemoryManagerError';
    this.cause = cause;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_MEMORY_ITEM_LENGTH) : '';
}

function normalizeStringList(value, limit) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))].slice(-limit);
}

function normalizePreferences(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => {
        const normalizedKey = normalizeText(key);
        const normalizedValue = Array.isArray(item)
          ? normalizeStringList(item, MAX_NOTES)
          : normalizeText(item);
        return [normalizedKey, normalizedValue];
      })
      .filter(([key, item]) => key && (Array.isArray(item) ? item.length > 0 : item))
      .slice(0, MAX_PREFERENCES)
  );
}

function createDefaultMemory(now = () => new Date().toISOString()) {
  return {
    version: MEMORY_VERSION,
    name: null,
    preferences: {},
    notes: [],
    goals: [],
    updatedAt: now(),
  };
}

function normalizeMemory(memory, { now = () => new Date().toISOString() } = {}) {
  if (!isPlainObject(memory)) {
    throw new MemoryManagerError('Memory file has an unsupported format.');
  }

  const name = normalizeText(memory.name) || null;
  const updatedAt = typeof memory.updatedAt === 'string' && !Number.isNaN(Date.parse(memory.updatedAt))
    ? memory.updatedAt
    : now();

  return {
    version: MEMORY_VERSION,
    name,
    preferences: normalizePreferences(memory.preferences),
    notes: normalizeStringList(memory.notes, MAX_NOTES),
    goals: normalizeStringList(memory.goals, MAX_GOALS),
    updatedAt,
  };
}

function mergePreferences(current, patch) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(normalizePreferences(patch))) {
    if (Array.isArray(value)) {
      const existing = Array.isArray(merged[key]) ? merged[key] : (merged[key] ? [merged[key]] : []);
      merged[key] = normalizeStringList([...existing, ...value], MAX_NOTES);
    } else {
      merged[key] = value;
    }
  }
  return normalizePreferences(merged);
}

function hasSameMemoryContent(left, right) {
  return JSON.stringify({
    version: left.version,
    name: left.name,
    preferences: left.preferences,
    notes: left.notes,
    goals: left.goals,
  }) === JSON.stringify({
    version: right.version,
    name: right.name,
    preferences: right.preferences,
    notes: right.notes,
    goals: right.goals,
  });
}

function createMemoryManager(
  filePath = config.MEMORY_FILE_PATH,
  { fileSystem = fs, now = () => new Date().toISOString() } = {}
) {
  const memoryPath = path.resolve(__dirname, '..', filePath.replace(/^\.\//, ''));

  function writeAtomically(memory) {
    const directory = path.dirname(memoryPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(memoryPath)}.${process.pid}.${Date.now()}.tmp`
    );

    try {
      fileSystem.writeFileSync(temporaryPath, JSON.stringify(memory, null, 2), 'utf-8');
      fileSystem.renameSync(temporaryPath, memoryPath);
    } catch (err) {
      try {
        if (fileSystem.existsSync(temporaryPath)) fileSystem.unlinkSync(temporaryPath);
      } catch {
        // Keep the original write error; cleanup is best effort.
      }
      throw new MemoryManagerError('Memory file could not be written.', err);
    }
  }

  function ensureMemoryFile() {
    const directory = path.dirname(memoryPath);
    if (!fileSystem.existsSync(directory)) fileSystem.mkdirSync(directory, { recursive: true });
    if (!fileSystem.existsSync(memoryPath)) writeAtomically(createDefaultMemory(now));
  }

  function readMemoryStrict() {
    ensureMemoryFile();
    try {
      return normalizeMemory(JSON.parse(fileSystem.readFileSync(memoryPath, 'utf-8')), { now });
    } catch (err) {
      if (err instanceof MemoryManagerError) throw err;
      throw new MemoryManagerError('Memory file could not be read.', err);
    }
  }

  function readMemory() {
    try {
      return readMemoryStrict();
    } catch (err) {
      logger.error('[memoryManager] Could not read persistent memory.', { error: err.name });
      return createDefaultMemory(now);
    }
  }

  function writeMemory(memoryObj) {
    // Strict read before write prevents malformed on-disk data from being replaced implicitly.
    const current = readMemoryStrict();
    const normalized = normalizeMemory(memoryObj, { now });
    if (hasSameMemoryContent(current, normalized)) return current;
    const toWrite = { ...normalized, updatedAt: now() };
    writeAtomically(toWrite);
    return toWrite;
  }

  function patchMemory(patch) {
    if (!isPlainObject(patch)) throw new MemoryManagerError('Memory patch must be an object.');
    const current = readMemoryStrict();
    const merged = {
      ...current,
      ...(Object.prototype.hasOwnProperty.call(patch, 'name') ? { name: patch.name } : {}),
      preferences: mergePreferences(current.preferences, patch.preferences),
      notes: normalizeStringList([...current.notes, ...normalizeStringList(patch.notes, MAX_NOTES)], MAX_NOTES),
      goals: normalizeStringList([...current.goals, ...normalizeStringList(patch.goals, MAX_GOALS)], MAX_GOALS),
    };
    return writeMemory(merged);
  }

  function resetMemory() {
    // An explicit reset still refuses to overwrite malformed data; recover it manually first.
    return writeMemory(createDefaultMemory(now));
  }

  return { memoryPath, ensureMemoryFile, readMemory, writeMemory, patchMemory, resetMemory };
}

const memoryManager = createMemoryManager();

module.exports = {
  ...memoryManager,
  createMemoryManager,
  createDefaultMemory,
  normalizeMemory,
  hasSameMemoryContent,
  MemoryManagerError,
  MEMORY_VERSION,
  MAX_PREFERENCES,
  MAX_NOTES,
  MAX_GOALS,
  MAX_MEMORY_ITEM_LENGTH,
  MEMORY_PATH: memoryManager.memoryPath,
};
