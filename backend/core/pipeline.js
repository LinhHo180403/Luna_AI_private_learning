const ResponseBuilder = require('./responseBuilder');
const logger = require('./logger');

function createEmptyMessageResponse() {
  return new ResponseBuilder()
    .setReply('Bạn chưa nhắn gì cho Luna cả 👀')
    .setSource('brain')
    .setEmotion('curious')
    .setAnimation('idle')
    .build();
}

function createNoSkillResponse() {
  logger.error('[lunaBrain] Không có skill nào xử lý được message - kiểm tra lại SKILL_ORDER!');
  return new ResponseBuilder()
    .setReply('Luna không biết trả lời sao cho câu này 😵 (lỗi hệ thống, báo cho dev nha)')
    .setSource('brain-no-skill-matched')
    .setEmotion('sad')
    .setAnimation('idle')
    .build();
}

function createSkillErrorResponse(skillName) {
  return new ResponseBuilder()
    .setReply('Luna gặp lỗi khi xử lý yêu cầu này, bạn thử lại giúp Luna nha 🥲')
    .setSource(`error-in-${skillName}`)
    .setEmotion('sad')
    .setAnimation('idle')
    .build();
}

function matchSkill(context, skillOrder, { onError } = {}) {
  for (const skill of skillOrder) {
    try {
      if (skill.canHandle(context)) return skill;
    } catch (err) {
      logger.error(`[lunaBrain] Skill "${skill.name}" lỗi ở canHandle():`, err.message);
      onError?.({ skill: skill.name, phase: 'canHandle', error: err.message });
    }
  }
  return null;
}

async function executeSkill(skill, context, { onError } = {}) {
  try {
    return await skill.handle(context);
  } catch (err) {
    logger.error(`[lunaBrain] Skill "${skill.name}" lỗi ở handle():`, err.message);
    onError?.({ skill: skill.name, phase: 'handle', error: err.message });
    return createSkillErrorResponse(skill.name);
  }
}

function postProcess(response) {
  return response;
}

module.exports = {
  createEmptyMessageResponse,
  createNoSkillResponse,
  matchSkill,
  executeSkill,
  postProcess,
};
