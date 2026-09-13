const { OFFLINE_REPLY_TEMPLATES, fillTemplate } = require('../prompts/lunaPrompt');
const { readMemory } = require('../memory/memoryManager');

const INTENT_PATTERNS = [
  { intent: 'greeting', pattern: /^(chào|xin chào|hi|hello|hey|alo|ê|ê luna)\b/i },
  { intent: 'howAreYou', pattern: /(khoẻ không|khoe khong|how are you|dạo này (thế nào|sao))/i },
  { intent: 'thanks', pattern: /(cảm ơn|cam on|thank you|thanks|thank)/i },
  { intent: 'bye', pattern: /(tạm biệt|tam biet|bye|bye bye|goodbye|hẹn gặp lại)/i },
  { intent: 'compliment', pattern: /(dễ thương|de thuong|cute|giỏi quá|gioi qua|xinh|thông minh|thong minh)/i },
];

function detectIntent(message) {
  const msg = (message || '').trim();
  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(msg)) return intent;
  }
  return 'unknown';
}

function pickVariant(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generateOfflineReply(context) {
  const message = (context && context.message) || '';
  const memory = readMemory();
  const name = memory && memory.name ? memory.name : null;

  const intent = detectIntent(message);
  const templates = OFFLINE_REPLY_TEMPLATES[intent] || OFFLINE_REPLY_TEMPLATES.unknown;
  const rawTemplate = pickVariant(templates);
  const reply = fillTemplate(rawTemplate, name);

  const emotionMap = {
    greeting: 'happy', howAreYou: 'excited', thanks: 'shy',
    bye: 'happy', compliment: 'shy', unknown: 'curious',
  };
  const animationMap = {
    greeting: 'wave', howAreYou: 'talk', thanks: 'talk',
    bye: 'wave', compliment: 'talk', unknown: 'thinking',
  };

  return {
    reply,
    emotion: emotionMap[intent] || 'neutral',
    animation: animationMap[intent] || 'idle',
    intent,
  };
}

module.exports = { generateOfflineReply, detectIntent };
