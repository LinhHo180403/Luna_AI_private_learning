const config = require('../../config/config');
const OfflineProvider = require('./offlineProvider');
const NaraProvider = require('./naraProvider');

class ProviderRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderRegistryError';
  }
}

/** Provider contract: { name: string, chat(messages, options): Promise<object> }. */
function assertProviderContract(provider) {
  if (!provider || typeof provider.name !== 'string' || typeof provider.chat !== 'function') {
    throw new ProviderRegistryError('AI provider không tuân thủ contract chat(messages, options).');
  }
  return provider;
}

function createProviderRegistry({ offline = new OfflineProvider(), nara = new NaraProvider() } = {}) {
  return Object.freeze({
    offline: assertProviderContract(offline),
    nara: assertProviderContract(nara),
  });
}

const providerRegistry = createProviderRegistry();

function resolveProvider(name, registry = providerRegistry) {
  const provider = registry[name];
  if (!provider) {
    throw new ProviderRegistryError(`AI provider không được hỗ trợ: "${name}".`);
  }
  return assertProviderContract(provider);
}

function getConfiguredProvider(providerName = config.AI_PROVIDER) {
  return resolveProvider(providerName);
}

module.exports = {
  ProviderRegistryError,
  assertProviderContract,
  createProviderRegistry,
  resolveProvider,
  getConfiguredProvider,
  providerRegistry,
};
