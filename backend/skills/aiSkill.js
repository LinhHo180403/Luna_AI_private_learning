const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');
const aiService = require('../services/aiService');
const config = require('../config/config');
const logger = require('../core/logger');

class AiSkill extends Skill {
  constructor() {
    super('AiSkill');
  }

  canHandle(context) {
    return true;
  }

  async handle(context) {
    const builder = new ResponseBuilder();
    try {
      const result = context.onToken && config.AI_PROVIDER === 'nara'
        ? await aiService.getStreamingReply(context, { onToken: context.onToken, signal: context.signal })
        : await aiService.getReply(context);
      return builder
        .setReply(result.reply)
        .setSource(result.source)
        .setEmotion(result.emotion)
        .setAnimation(result.animation)
        .build();
    } catch (err) {
      if (context.signal?.aborted || err?.name === 'AbortError') throw err;
      logger.error('[aiSkill] aiService.getReply() lỗi:', err.message);
      return builder
        .setReply('Luna đang gặp chút trục trặc, thử lại giúp Luna sau nha 🥲')
        .setSource('ai-error-fallback')
        .setEmotion('sad')
        .setAnimation('idle')
        .build();
    }
  }
}

module.exports = AiSkill;
