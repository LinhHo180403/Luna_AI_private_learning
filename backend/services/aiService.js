const config = require('../config/config');
const offlineService = require('./offlineService');
const naraService = require('./naraService');
const { LUNA_SYSTEM_PROMPT } = require('../prompts/lunaPrompt');

class AiServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AiServiceError';
    this.cause = cause;
  }
}

async function getReply(context) {
  switch (config.AI_PROVIDER) {
    case 'offline': {
      const result = offlineService.generateOfflineReply(context);
      return { ...result, source: 'offline' };
    }
    case 'nara': {
      const history = (context.session && context.session.history) || [];
      const messages = [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: context.message },
      ];
      const replyText = await naraService.callNara({ messages, systemPrompt: LUNA_SYSTEM_PROMPT });
      return { reply: replyText, emotion: 'neutral', animation: 'talk', source: 'nara' };
    }
    case 'openai':
    case 'gemini':
      throw new AiServiceError(
        `AI_PROVIDER="${config.AI_PROVIDER}" hiện chưa được implement (chỉ có switch case chờ sẵn).`
      );
    default:
      throw new AiServiceError(`AI_PROVIDER không hợp lệ: "${config.AI_PROVIDER}"`);
  }
}

async function generateStructured({ system, user }) {
  if (config.AI_PROVIDER !== 'nara') {
    throw new AiServiceError(
      `generateStructured() chỉ hỗ trợ AI_PROVIDER=nara, hiện đang là "${config.AI_PROVIDER}".`
    );
  }
  const replyText = await naraService.callNara({
    messages: [{ role: 'user', content: user }],
    systemPrompt: system,
  });

  try {
    const cleaned = replyText.replace(/^```json\s*|```\s*$/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    throw new AiServiceError(
      `NaraRouter trả về JSON không hợp lệ cho generateStructured(): ${err.message}`,
      err
    );
  }
}

module.exports = { getReply, generateStructured, AiServiceError };
