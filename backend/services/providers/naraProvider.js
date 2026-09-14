const naraService = require('../naraService');

class NaraProvider {
  constructor({ callNara = naraService.callNara } = {}) {
    this.name = 'nara';
    this.callNara = callNara;
  }

  async chat(messages, { systemPrompt } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new TypeError('NaraProvider.chat: "messages" phải là mảng không rỗng.');
    }
    const reply = await this.callNara({ messages, systemPrompt });
    return { reply, emotion: 'neutral', animation: 'talk', source: 'nara' };
  }
}

module.exports = NaraProvider;
