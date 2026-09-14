const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config/config');
const aiService = require('../services/aiService');
const AiSkill = require('../skills/aiSkill');
const OfflineProvider = require('../services/providers/offlineProvider');
const NaraProvider = require('../services/providers/naraProvider');
const { NaraProviderError } = require('../services/providers/naraProvider');
const {
  ProviderRegistryError,
  getConfiguredProvider,
} = require('../services/providers/providerRegistry');

test('AI_PROVIDER configuration recognizes offline and nara values', () => {
  assert.equal(config.getAiProviderFromEnv({ AI_PROVIDER: 'offline' }), 'offline');
  assert.equal(config.getAiProviderFromEnv({ AI_PROVIDER: 'NARA' }), 'nara');
  assert.equal(getConfiguredProvider('offline').name, 'offline');
  assert.equal(getConfiguredProvider('nara').name, 'nara');
});

test('unsupported AI_PROVIDER is retained and produces a clear configuration error', () => {
  assert.equal(config.getAiProviderFromEnv({ AI_PROVIDER: 'unknown' }), 'unknown');
  assert.throws(
    () => getConfiguredProvider('unknown'),
    (err) => err instanceof ProviderRegistryError &&
      err.message.includes('unknown') &&
      !/key|token|secret/i.test(err.message)
  );
});

test('offline provider works without network access or an API key', async () => {
  const provider = new OfflineProvider({
    generateOfflineReply: () => ({ reply: 'offline reply', emotion: 'neutral', animation: 'idle' }),
  });
  const result = await provider.chat([{ role: 'user', content: 'hello' }], { context: { message: 'hello' } });
  assert.equal(result.reply, 'offline reply');
  assert.equal(result.source, 'offline');
});

test('Nara provider failure is normalized without leaking an upstream secret', async () => {
  const secret = 'test-secret-value';
  const provider = new NaraProvider({
    callNara: async () => { throw new Error(`upstream failed with ${secret}`); },
  });

  await assert.rejects(
    () => provider.chat([{ role: 'user', content: 'hello' }]),
    (err) => err instanceof NaraProviderError &&
      err.message === 'Nara provider request failed. Check provider configuration and service availability.' &&
      !err.message.includes(secret)
  );
});

test('AI skill preserves its safe fallback when the configured provider fails', async () => {
  const originalGetReply = aiService.getReply;
  const originalConsoleError = console.error;
  const secret = 'test-secret-value';
  const logs = [];
  aiService.getReply = async () => {
    throw new NaraProviderError('Nara provider request failed. Check provider configuration and service availability.', new Error(secret));
  };
  console.error = (...args) => logs.push(args.join(' '));

  try {
    const response = await new AiSkill().handle({ message: 'hello' });
    assert.equal(response.source, 'ai-error-fallback');
    assert.doesNotMatch(response.reply, /test-secret-value/);
    assert.ok(logs.every((entry) => !entry.includes(secret)));
  } finally {
    aiService.getReply = originalGetReply;
    console.error = originalConsoleError;
  }
});
