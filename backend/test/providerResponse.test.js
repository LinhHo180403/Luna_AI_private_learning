const test = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../services/aiService');
const OfflineProvider = require('../services/providers/offlineProvider');
const NaraProvider = require('../services/providers/naraProvider');
const { ProviderResponseError, normalizeProviderResponse } = require('../services/providers/providerResponse');

test('provider response contract keeps only reply, source, and existing rendering hints', () => {
  const result = normalizeProviderResponse(
    { reply: 'hello', emotion: 'happy', animation: 'wave', providerPayload: { internal: true } },
    'offline'
  );
  assert.deepEqual(result, { reply: 'hello', source: 'offline', emotion: 'happy', animation: 'wave' });
});

test('OfflineProvider returns the common provider response contract', async () => {
  const provider = new OfflineProvider({
    generateOfflineReply: () => ({ reply: 'offline hello', emotion: 'happy', animation: 'wave', unexpected: true }),
  });
  const result = await provider.chat([{ role: 'user', content: 'hello' }], { context: {} });
  assert.deepEqual(result, { reply: 'offline hello', source: 'offline', emotion: 'happy', animation: 'wave' });
});

test('NaraProvider returns the common provider response contract using a mock', async () => {
  const provider = new NaraProvider({ callNara: async () => 'Nara hello' });
  const result = await provider.chat([{ role: 'user', content: 'hello' }]);
  assert.deepEqual(result, { reply: 'Nara hello', source: 'nara', emotion: 'neutral', animation: 'talk' });
});

test('aiService normalizes provider output before AiSkill can consume it', async () => {
  const provider = {
    name: 'test-provider',
    chat: async () => ({ reply: 'hello', emotion: 'curious', internalProviderData: 'do-not-leak' }),
  };
  const result = await aiService.getReply({ message: 'hello', session: { history: [] } }, { provider });
  assert.deepEqual(result, { reply: 'hello', source: 'test-provider', emotion: 'curious' });
});

test('aiService rejects malformed provider output before it reaches the UI', async () => {
  const provider = { name: 'test-provider', chat: async () => undefined };
  await assert.rejects(
    () => aiService.getReply({ message: 'hello', session: { history: [] } }, { provider }),
    ProviderResponseError
  );
});
