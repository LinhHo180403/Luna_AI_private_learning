const naraService = require('../naraService');
const { normalizeProviderResponse } = require('./providerResponse');

class NaraProviderError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'NaraProviderError';
    this.cause = cause;
  }
}

class NaraProvider {
  constructor({ callNara = naraService.callNara } = {}) {
    this.name = 'nara';
    this.callNara = callNara;
  }

  async chat(messages, { systemPrompt } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('NaraProvider.chat: "messages" phải là mảng không rỗng.');
    }
    try {
      const reply = await this.callNara({ messages, systemPrompt });
      return normalizeProviderResponse({ reply, emotion: 'neutral', animation: 'talk' }, this.name);
    } catch (err) {
      throw new NaraProviderError(
        'Nara provider request failed. Check provider configuration and service availability.',
        err
      );
    }
  }
}

module.exports = NaraProvider;
module.exports.NaraProviderError = NaraProviderError;
