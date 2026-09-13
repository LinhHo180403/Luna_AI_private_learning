const config = require('../config/config');
const { LUNA_SYSTEM_PROMPT } = require('../prompts/lunaPrompt');

class NaraServiceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'NaraServiceError';
    this.cause = cause;
  }
}

async function callNara({ messages, systemPrompt } = {}) {
  if (!config.AI_API_KEY) {
    throw new NaraServiceError(
      'AI_API_KEY đang rỗng nhưng đang cố gọi NaraRouter API thật. ' +
      'Kiểm tra lại .env (AI_PROVIDER=nara cần có AI_API_KEY).'
    );
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new NaraServiceError('naraService.callNara: "messages" phải là mảng không rỗng.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);

  const payload = {
    model: config.AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt || LUNA_SYSTEM_PROMPT },
      ...messages,
    ],
  };

  try {
    const response = await fetch(`${config.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.AI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new NaraServiceError(
        `NaraRouter trả về lỗi HTTP ${response.status}: ${errBody.slice(0, 300)}`
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new NaraServiceError('NaraRouter trả về response không đúng định dạng mong đợi (thiếu choices[0].message.content).');
    }
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new NaraServiceError(`NaraRouter timeout sau ${config.AI_TIMEOUT_MS}ms.`, err);
    }
    if (err instanceof NaraServiceError) throw err;
    throw new NaraServiceError(`Lỗi khi gọi NaraRouter: ${err.message}`, err);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { callNara, NaraServiceError };
