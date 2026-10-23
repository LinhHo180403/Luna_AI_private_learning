import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStoredMessages, saveStoredMessages } from '../src/core/chatStorage.js';

function createStorage(initial = null, throws = false) {
  let value = initial;
  return {
    getItem() { if (throws) throw new Error('blocked'); return value; },
    setItem(_key, next) { if (throws) throw new Error('blocked'); value = next; },
    value: () => value,
  };
}

test('chat storage removes streaming flags and empty in-progress Luna messages', () => {
  const storage = createStorage();
  assert.equal(saveStoredMessages(storage, [
    { role: 'user', text: 'hi' },
    { role: 'luna', text: '', isStreaming: true },
    { role: 'luna', text: 'partial', isStreaming: true },
  ]), true);
  assert.deepEqual(JSON.parse(storage.value()), [
    { role: 'user', text: 'hi' },
    { role: 'luna', text: 'partial' },
  ]);
  assert.deepEqual(loadStoredMessages(storage), [
    { role: 'user', text: 'hi' },
    { role: 'luna', text: 'partial' },
  ]);
});

test('chat storage handles malformed JSON and storage errors without crashing', () => {
  assert.deepEqual(loadStoredMessages(createStorage('{bad')), []);
  assert.deepEqual(loadStoredMessages(createStorage(null, true)), []);
  assert.equal(saveStoredMessages(createStorage(null, true), []), false);
});
