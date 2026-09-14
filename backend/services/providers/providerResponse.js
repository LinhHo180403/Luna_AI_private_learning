class ProviderResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderResponseError';
  }
}

/**
 * Minimal provider response contract consumed by aiService/AiSkill:
 * { reply: string, source: string, emotion?: string, animation?: string }.
 */
function normalizeProviderResponse(response, source) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new ProviderResponseError('AI provider returned an invalid response object.');
  }
  if (typeof response.reply !== 'string' || !response.reply.trim()) {
    throw new ProviderResponseError('AI provider response must contain a non-empty reply.');
  }
  if (typeof source !== 'string' || !source) {
    throw new ProviderResponseError('AI provider response is missing its source metadata.');
  }

  const normalized = { reply: response.reply, source };
  if (typeof response.emotion === 'string') normalized.emotion = response.emotion;
  if (typeof response.animation === 'string') normalized.animation = response.animation;
  return normalized;
}

module.exports = { ProviderResponseError, normalizeProviderResponse };
