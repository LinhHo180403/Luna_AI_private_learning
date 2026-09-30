const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');
const CommandTypes = require('../core/commandTypes');
const defaultMemoryManager = require('../memory/memoryManager');

const MEMORY_PREFIX = '(?:hãy\\s+)?(?:ghi\\s+nhớ|nhớ|lưu\\s+lại|remember|save|store)(?:\\s+rằng|\\s+that)?\\s*';
const NAME_PATTERNS = [
  new RegExp(`^${MEMORY_PREFIX}(?:tên\\s+tôi\\s+là|my\\s+name\\s+is|call\\s+me)\\s+([^\\s.,!?]+(?:\\s+[^\\s.,!?]+)?)`, 'i'),
];
const PREFERENCE_PATTERNS = [
  new RegExp(`^${MEMORY_PREFIX}(?:tôi\\s+thích|i\\s+like)\\s+(.+)$`, 'i'),
];
const GOAL_PATTERNS = [
  new RegExp(`^${MEMORY_PREFIX}(?:mục\\s+tiêu\\s+của\\s+tôi\\s+là|my\\s+goal\\s+is)\\s+(.+)$`, 'i'),
];
const NOTE_PATTERNS = [
  new RegExp(`^${MEMORY_PREFIX}(?:ghi\\s+chú|note|rằng|that)\\s+(.+)$`, 'i'),
];
const QUERY_MEMORY_PATTERNS = [
  /bạn (?:biết|nhớ) gì (?:về|ve) tôi/i,
  /tôi (?:là ai|tên gì)/i,
  /what do you (?:know|remember) about me/i,
  /who am i/i,
];

function getCapturedValue(message, patterns) {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].trim()) return match[1].trim();
  }
  return null;
}

class MemorySkill extends Skill {
  constructor({ memoryManager = defaultMemoryManager } = {}) {
    super('MemorySkill');
    this.memoryManager = memoryManager;
  }

  canHandle(context) {
    const message = (context.message || '').trim();
    if (!message) return false;
    return Boolean(
      getCapturedValue(message, NAME_PATTERNS) ||
      getCapturedValue(message, PREFERENCE_PATTERNS) ||
      getCapturedValue(message, GOAL_PATTERNS) ||
      getCapturedValue(message, NOTE_PATTERNS) ||
      QUERY_MEMORY_PATTERNS.some((pattern) => pattern.test(message))
    );
  }

  async handle(context) {
    const message = (context.message || '').trim();
    const builder = new ResponseBuilder().setSource('memory');
    const name = getCapturedValue(message, NAME_PATTERNS);
    const preference = getCapturedValue(message, PREFERENCE_PATTERNS);
    const goal = getCapturedValue(message, GOAL_PATTERNS);
    const note = getCapturedValue(message, NOTE_PATTERNS);

    try {
      if (name) return this.createSavedResponse(builder, this.memoryManager.patchMemory({ name }), `Luna sẽ nhớ tên ${name} nha ✨`);
      if (preference) return this.createSavedResponse(builder, this.memoryManager.patchMemory({ preferences: { likes: [preference] } }), 'Luna đã ghi nhớ sở thích này rồi nha ✨');
      if (goal) return this.createSavedResponse(builder, this.memoryManager.patchMemory({ goals: [goal] }), 'Luna đã ghi nhớ mục tiêu này rồi nha ✨');
      if (note) return this.createSavedResponse(builder, this.memoryManager.patchMemory({ notes: [note] }), 'Luna đã lưu ghi chú này rồi nha ✨');

      if (QUERY_MEMORY_PATTERNS.some((pattern) => pattern.test(message))) {
        const memory = this.memoryManager.readMemory();
        const details = [
          memory.name ? `tên bạn là ${memory.name}` : null,
          memory.preferences.likes?.length ? `bạn thích ${memory.preferences.likes.join(', ')}` : null,
          memory.goals.length ? `mục tiêu gần đây là ${memory.goals[memory.goals.length - 1]}` : null,
        ].filter(Boolean);
        return builder
          .setReply(details.length ? `Luna nhớ ${details.join('; ')} 😊` : 'Luna chưa có thông tin nào được bạn bảo nhớ cả.')
          .setEmotion('curious')
          .setAnimation('talk')
          .setData({ memory })
          .build();
      }
    } catch {
      return builder
        .setReply('Luna chưa thể cập nhật ký ức lúc này. Dữ liệu cũ vẫn được giữ nguyên nha.')
        .setEmotion('sad')
        .setAnimation('idle')
        .build();
    }

    return builder.setReply('Luna chưa hiểu yêu cầu ghi nhớ này.').setEmotion('neutral').build();
  }

  createSavedResponse(builder, memory, reply) {
    return builder
      .setReply(reply)
      .setEmotion('happy')
      .setAnimation('wave')
      .addCommand(CommandTypes.UPDATE_MEMORY, { memory })
      .setMemory(memory)
      .build();
  }
}

module.exports = MemorySkill;
