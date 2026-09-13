// ⚠️ FILE NÀY LÀ DEAD CODE - KHÔNG ĐƯỢC NẠP QUA skills/index.js (SKILL_ORDER).
// Xem chi tiết lý do trong Luna_AI_Project_Status.docx mục 3.
// Giữ lại chỉ để tham khảo lịch sử, KHÔNG xoá nhưng cũng KHÔNG dùng.

const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');

const OLD_REPLIES = {
  greeting: ['Hello.', 'Hi there.', 'Greetings.'],
  howAreYou: ['I am functioning normally.', 'All systems operational.'],
  thanks: ['You are welcome.', 'No problem.'],
  bye: ['Goodbye.', 'See you later.'],
  unknown: ['I do not understand.', 'Unable to process that request.'],
};

const INTENT_PATTERNS_OLD = [
  { intent: 'greeting', pattern: /^(hi|hello|hey)\b/i },
  { intent: 'howAreYou', pattern: /how are you/i },
  { intent: 'thanks', pattern: /(thank you|thanks)/i },
  { intent: 'bye', pattern: /(bye|goodbye)/i },
];

function detectIntentOld(message) {
  const msg = (message || '').trim();
  for (const { intent, pattern } of INTENT_PATTERNS_OLD) {
    if (pattern.test(msg)) return intent;
  }
  return 'unknown';
}

class OfflineChatSkill extends Skill {
  constructor() {
    super('OfflineChatSkill');
  }

  canHandle(context) {
    return true;
  }

  async handle(context) {
    const intent = detectIntentOld(context.message);
    const pool = OLD_REPLIES[intent] || OLD_REPLIES.unknown;
    const reply = pool[Math.floor(Math.random() * pool.length)];

    const emotionMap = {
      greeting: 'happy', howAreYou: 'excited', thanks: 'shy', bye: 'sad', unknown: 'curious',
    };

    return new ResponseBuilder()
      .setReply(reply)
      .setSource('offline-chat-skill-DEPRECATED')
      .setEmotion(emotionMap[intent] || 'neutral')
      .setAnimation('talk')
      .build();
  }
}

module.exports = OfflineChatSkill;
