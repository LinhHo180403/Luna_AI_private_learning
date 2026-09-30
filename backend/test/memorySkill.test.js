const test = require('node:test');
const assert = require('node:assert/strict');

const MemorySkill = require('../skills/memorySkill');

function createMemoryManagerStub() {
  const memory = { version: 1, name: null, preferences: {}, notes: [], goals: [], updatedAt: '2026-01-01T00:00:00.000Z' };
  const patches = [];
  return {
    patches,
    readMemory: () => memory,
    patchMemory: (patch) => {
      patches.push(patch);
      if (patch.name) memory.name = patch.name;
      if (patch.preferences) memory.preferences = { ...memory.preferences, ...patch.preferences };
      if (patch.notes) memory.notes.push(...patch.notes);
      if (patch.goals) memory.goals.push(...patch.goals);
      return memory;
    },
  };
}

test('memory skill saves a name only after an explicit remember intent', async () => {
  const manager = createMemoryManagerStub();
  const skill = new MemorySkill({ memoryManager: manager });
  const response = await skill.handle({ message: 'Hãy nhớ tên tôi là Linh' });

  assert.deepEqual(manager.patches, [{ name: 'Linh' }]);
  assert.equal(response.source, 'memory');
  assert.equal(response.memory.name, 'Linh');
});

test('memory skill saves explicit preferences, goals, and notes deterministically', async () => {
  const manager = createMemoryManagerStub();
  const skill = new MemorySkill({ memoryManager: manager });

  await skill.handle({ message: 'Hãy nhớ tôi thích anime' });
  await skill.handle({ message: 'Ghi nhớ mục tiêu của tôi là hoàn thành Luna AI' });
  await skill.handle({ message: 'Lưu lại ghi chú dùng desktop trước' });

  assert.deepEqual(manager.patches, [
    { preferences: { likes: ['anime'] } },
    { goals: ['hoàn thành Luna AI'] },
    { notes: ['dùng desktop trước'] },
  ]);
});

test('ordinary and ambiguous conversation does not match or save memory', () => {
  const manager = createMemoryManagerStub();
  const skill = new MemorySkill({ memoryManager: manager });

  assert.equal(skill.canHandle({ message: 'Hôm nay tôi đang làm Luna AI.' }), false);
  assert.equal(skill.canHandle({ message: 'Tôi thích bài hát này.' }), false);
  assert.equal(skill.canHandle({ message: 'Tên tôi là Linh.' }), false);
  assert.deepEqual(manager.patches, []);
});

test('memory skill queries its injected manager', async () => {
  const manager = createMemoryManagerStub();
  manager.patchMemory({ name: 'Linh' });
  manager.patchMemory({ preferences: { likes: ['anime'] } });
  const skill = new MemorySkill({ memoryManager: manager });
  const response = await skill.handle({ message: 'Bạn nhớ gì về tôi?' });

  assert.match(response.reply, /Linh/);
  assert.match(response.reply, /anime/);
  assert.equal(response.data.memory, manager.readMemory());
});

test('memory skill keeps the previous memory safe when its manager rejects an update', async () => {
  const skill = new MemorySkill({
    memoryManager: {
      patchMemory: () => { throw new Error('corrupted memory'); },
      readMemory: () => ({ version: 1, name: null, preferences: {}, notes: [], goals: [] }),
    },
  });
  const response = await skill.handle({ message: 'Hãy nhớ tên tôi là Linh' });

  assert.equal(response.source, 'memory');
  assert.equal(response.emotion, 'sad');
  assert.equal(response.memory, null);
});
