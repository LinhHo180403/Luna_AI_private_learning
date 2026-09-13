const SKILL_ORDER = require('../skills/index');
const eventBus = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');
const ResponseBuilder = require('../core/responseBuilder');
const { readMemory } = require('../memory/memoryManager');

class LunaBrain {
  async processMessage({ message, session } = {}) {
    const trimmed = (message || '').trim();

    eventBus.emit(EventTypes.USER_MESSAGE, { message: trimmed, timestamp: new Date().toISOString() });

    if (!trimmed) {
      return new ResponseBuilder()
        .setReply('Bạn chưa nhắn gì cho Luna cả 👀')
        .setSource('brain')
        .setEmotion('curious')
        .setAnimation('idle')
        .build();
    }

    const memory = readMemory();
    const context = { message: trimmed, session: session || null, memory };

    for (const skill of SKILL_ORDER) {
      let canHandle;
      try {
        canHandle = skill.canHandle(context);
      } catch (err) {
        console.error(`[lunaBrain] Skill "${skill.name}" lỗi ở canHandle():`, err.message);
        eventBus.emit(EventTypes.ERROR, { skill: skill.name, phase: 'canHandle', error: err.message });
        continue;
      }

      if (!canHandle) continue;

      try {
        const response = await skill.handle(context);
        eventBus.emit(EventTypes.SKILL_HANDLED, { skill: skill.name, response });
        if (skill.name === 'AiSkill') {
          eventBus.emit(EventTypes.AI_REPLY, { response });
        }
        return response;
      } catch (err) {
        console.error(`[lunaBrain] Skill "${skill.name}" lỗi ở handle():`, err.message);
        eventBus.emit(EventTypes.ERROR, { skill: skill.name, phase: 'handle', error: err.message });
        return new ResponseBuilder()
          .setReply('Luna gặp lỗi khi xử lý yêu cầu này, bạn thử lại giúp Luna nha 🥲')
          .setSource(`error-in-${skill.name}`)
          .setEmotion('sad')
          .setAnimation('idle')
          .build();
      }
    }

    console.error('[lunaBrain] Không có skill nào xử lý được message - kiểm tra lại SKILL_ORDER!');
    return new ResponseBuilder()
      .setReply('Luna không biết trả lời sao cho câu này 😵 (lỗi hệ thống, báo cho dev nha)')
      .setSource('brain-no-skill-matched')
      .setEmotion('sad')
      .setAnimation('idle')
      .build();
  }
}

module.exports = new LunaBrain();
module.exports.LunaBrain = LunaBrain;
