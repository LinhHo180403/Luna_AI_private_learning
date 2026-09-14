const config = require('../config/config');
const naraService = require('./naraService');
const { LUNA_SYSTEM_PROMPT } = require('../prompts/lunaPrompt');
const { getConfiguredProvider } = require('./providers/providerRegistry');
const { normalizeProviderResponse } = require('./providers/providerResponse');

class AiServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AiServiceError';
    this.cause = cause;
  }
}

async function getReply(context, { provider = getConfiguredProvider() } = {}) {
  const history = (context.session && context.session.history) || [];
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: context.message },
  ];
  const response = await provider.chat(messages, { systemPrompt: LUNA_SYSTEM_PROMPT, context });
  return normalizeProviderResponse(response, provider.name);
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
