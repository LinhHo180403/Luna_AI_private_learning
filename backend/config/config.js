require('dotenv').config();

const VALID_PROVIDERS = ['offline', 'nara'];

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
}

function parseIntSafe(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function getAiProviderFromEnv(env = process.env) {
  return (env.AI_PROVIDER || 'offline').trim().toLowerCase() || 'offline';
}

const AI_PROVIDER = getAiProviderFromEnv();

const config = {
  PORT: parseIntSafe(process.env.PORT, 3001),
  NODE_ENV: process.env.NODE_ENV || 'development',
  AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'deepseek-3.2',
  AI_BASE_URL: process.env.AI_BASE_URL || 'https://api.nararouter.com/v1',
  AI_TIMEOUT_MS: parseIntSafe(process.env.AI_TIMEOUT_MS, 20000),
  MAX_HISTORY_MESSAGES: parseIntSafe(process.env.MAX_HISTORY_MESSAGES, 12),
  MEMORY_FILE_PATH: process.env.MEMORY_FILE_PATH || './memory/memory.json',
  DEBUG_LOG: parseBoolean(process.env.DEBUG_LOG, true),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

function validateConfig() {
  const warnings = [];
  if (config.AI_PROVIDER === 'nara' && !config.AI_API_KEY) {
    warnings.push(
      '[config] AI_PROVIDER=nara nhưng AI_API_KEY đang RỖNG. ' +
      'Đây là trạng thái nửa vời (half-state) - server sẽ cố gọi API thật và lỗi. ' +
      'Hãy điền AI_API_KEY hoặc đổi AI_PROVIDER=offline.'
    );
  }
  if (!VALID_PROVIDERS.includes(config.AI_PROVIDER)) {
    warnings.push(
      `[config] AI_PROVIDER=${config.AI_PROVIDER} không được hỗ trợ. ` +
      `Giá trị hợp lệ: ${VALID_PROVIDERS.join(', ')}.`
    );
  }
  if (warnings.length > 0 && config.DEBUG_LOG) {
    warnings.forEach((w) => console.warn(w));
  }
  return warnings;
}

module.exports = config;
module.exports.validateConfig = validateConfig;
module.exports.VALID_PROVIDERS = VALID_PROVIDERS;
module.exports.getAiProviderFromEnv = getAiProviderFromEnv;
