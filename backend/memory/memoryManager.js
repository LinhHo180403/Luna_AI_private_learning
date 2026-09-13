const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const MEMORY_PATH = path.resolve(__dirname, '..', config.MEMORY_FILE_PATH.replace(/^\.\//, ''));

function ensureMemoryFile() {
  const dir = path.dirname(MEMORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(MEMORY_PATH)) {
    const initial = { name: null, preferences: {}, notes: [], updatedAt: new Date().toISOString() };
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

function readMemory() {
  ensureMemoryFile();
  try {
    const raw = fs.readFileSync(MEMORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[memoryManager] Lỗi đọc memory.json, trả về memory rỗng:', err.message);
    return { name: null, preferences: {}, notes: [], updatedAt: new Date().toISOString() };
  }
}

function writeMemory(memoryObj) {
  ensureMemoryFile();
  const toWrite = { ...memoryObj, updatedAt: new Date().toISOString() };
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(toWrite, null, 2), 'utf-8');
  return toWrite;
}

function patchMemory(patch) {
  const current = readMemory();
  const merged = {
    ...current,
    ...patch,
    preferences: {
      ...(current.preferences || {}),
      ...(patch.preferences || {}),
    },
    notes: patch.notes
      ? [...(current.notes || []), ...(Array.isArray(patch.notes) ? patch.notes : [patch.notes])]
      : (current.notes || []),
  };
  return writeMemory(merged);
}

function resetMemory() {
  return writeMemory({ name: null, preferences: {}, notes: [] });
}

module.exports = {
  readMemory,
  writeMemory,
  patchMemory,
  resetMemory,
  MEMORY_PATH,
};
