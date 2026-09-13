const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');
const CommandTypes = require('../core/commandTypes');
const { patchMemory, readMemory } = require('../memory/memoryManager');

const NAME_PATTERNS = [
  /(?:tôi tên là|tên tôi là|mình tên là|gọi tôi là)\s+([^\s.,!?]+(?:\s+[^\s.,!?]+)?)/i,
  /(?:my name is|call me)\s+([^\s.,!?]+(?:\s+[^\s.,!?]+)?)/i,
];

const QUERY_MEMORY_PATTERNS = [
  /bạn (?:biết|nhớ) gì (?:về|ve) tôi/i,
  /tôi (?:là ai|tên gì)/i,
  /what do you (?:know|remember) about me/i,
  /who am i/i,
];

class MemorySkill extends Skill {
  constructor() {
    super('MemorySkill');
  }

  canHandle(context) {
    const msg = (context.message || '').trim();
    if (!msg) return false;
    return (
      NAME_PATTERNS.some((re) => re.test(msg)) ||
      QUERY_MEMORY_PATTERNS.some((re) => re.test(msg))
    );
  }

  async handle(context) {
    const msg = (context.message || '').trim();
    const builder = new ResponseBuilder().setSource('memory');

    for (const pattern of NAME_PATTERNS) {
      const match = msg.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        const updated = patchMemory({ name });
        return builder
          .setReply(`Chào ${name}! Luna sẽ nhớ tên bạn nha ✨`)
          .setEmotion('happy')
          .setAnimation('wave')
          .addCommand(CommandTypes.UPDATE_MEMORY, { memory: updated })
          .setMemory(updated)
          .build();
      }
    }

    if (QUERY_MEMORY_PATTERNS.some((re) => re.test(msg))) {
      const memory = readMemory();
      if (memory.name) {
        return builder
          .setReply(`Luna nhớ chứ! Bạn là ${memory.name} đó 😊`)
          .setEmotion('curious')
          .setAnimation('talk')
          .setData({ memory })
          .build();
      }
      return builder
        .setReply('Hmm, Luna chưa biết tên bạn đâu. Giới thiệu cho Luna biết đi!')
        .setEmotion('curious')
        .setAnimation('thinking')
        .build();
    }

    return builder.setReply('Luna chưa hiểu ý bạn về phần ký ức này.').setEmotion('neutral').build();
  }
}

module.exports = MemorySkill;
