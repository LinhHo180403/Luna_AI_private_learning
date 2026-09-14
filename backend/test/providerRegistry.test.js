const test = require('node:test');
const assert = require('node:assert/strict');

const OfflineProvider = require('../services/providers/offlineProvider');
const NaraProvider = require('../services/providers/naraProvider');
const {
  ProviderRegistryError,
  createProviderRegistry,
  resolveProvider,
  getConfiguredProvider,
} = require('../services/providers/providerRegistry');

test('configured provider is resolved through the registry', () => {
  assert.equal(getConfiguredProvider().name, 'offline');
});

test('provider registry resolves the offline provider', () => {
  const offline = { name: 'offline', chat: async () => ({ source: 'offline' }) };
  const nara = { name: 'nara', chat: async () => ({ source: 'nara' }) };
  assert.equal(resolveProvider('offline', createProviderRegistry({ offline, nara })), offline);
});

test('provider registry resolves the nara provider', () => {
  const offline = { name: 'offline', chat: async () => ({ source: 'offline' }) };
  const nara = { name: 'nara', chat: async () => ({ source: 'nara' }) };
  assert.equal(resolveProvider('nara', createProviderRegistry({ offline, nara })), nara);
});

test('provider registry handles an unsupported provider safely', () => {
  const registry = createProviderRegistry({
    offline: { name: 'offline', chat: async () => ({}) },
    nara: { name: 'nara', chat: async () => ({}) },
  });
  assert.throws(() => resolveProvider('openai', registry), ProviderRegistryError);
});

test('provider registry rejects objects that do not satisfy the chat contract', () => {
  assert.throws(() => createProviderRegistry({ offline: { name: 'offline' } }), ProviderRegistryError);
});

test('offline provider fulfils the chat contract without external services', async () => {
  const context = { message: 'hello' };
  const provider = new OfflineProvider({
    generateOfflineReply: (receivedContext) => ({ reply: receivedContext.message, emotion: 'happy', animation: 'wave' }),
  });
  const result = await provider.chat([{ role: 'user', content: 'hello' }], { context });
  assert.deepEqual(result, { reply: 'hello', emotion: 'happy', animation: 'wave', source: 'offline' });
});

test('nara provider delegates chat through an injected client without network access', async () => {
  let received;
  const provider = new NaraProvider({
    callNara: async (request) => { received = request; return 'mocked Nara reply'; },
  });
  const messages = [{ role: 'user', content: 'hello' }];
  const result = await provider.chat(messages, { systemPrompt: 'system prompt' });
  assert.deepEqual(received, { messages, systemPrompt: 'system prompt' });
  assert.deepEqual(result, { reply: 'mocked Nara reply', emotion: 'neutral', animation: 'talk', source: 'nara' });
});
