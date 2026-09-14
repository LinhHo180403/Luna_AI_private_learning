const offlineService = require('../offlineService');

class OfflineProvider {
  constructor({ generateOfflineReply = offlineService.generateOfflineReply } = {}) {
    this.name = 'offline';
    this.generateOfflineReply = generateOfflineReply;
  }

  async chat(messages, { context = {} } = {}) {
    if (!Array.isArray(messages)) {
      throw new TypeError('OfflineProvider.chat: "messages" phải là một mảng.');
    }
    const result = await this.generateOfflineReply(context);
    return { ...result, source: 'offline' };
  }
}

module.exports = OfflineProvider;
