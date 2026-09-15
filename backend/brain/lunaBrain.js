const SKILL_ORDER = require('../skills/index');
const eventBus = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');
const { readMemory } = require('../memory/memoryManager');
const {
  createEmptyMessageResponse,
  createNoSkillResponse,
  matchSkill,
  executeSkill,
  postProcess,
} = require('../core/pipeline');

class LunaBrain {
  async processMessage({ message, session } = {}) {
    const trimmed = (message || '').trim();

    eventBus.emit(EventTypes.USER_MESSAGE, { message: trimmed, timestamp: new Date().toISOString() });

    if (!trimmed) {
      return this.runStage('postProcess', () => postProcess(createEmptyMessageResponse()));
    }

    const memory = readMemory();
    const context = { message: trimmed, session: session || null, memory };

    const onError = (payload) => eventBus.emit(EventTypes.ERROR, payload);
    const skill = await this.runStage('matchSkill', () => matchSkill(context, SKILL_ORDER, { onError }));

    if (!skill) {
      return this.runStage('postProcess', () => postProcess(createNoSkillResponse(), context));
    }

    const response = await this.runStage('executeSkill', () => executeSkill(skill, context, { onError }), skill.name);
    eventBus.emit(EventTypes.SKILL_HANDLED, { skill: skill.name, response });
    if (skill.name === 'AiSkill') eventBus.emit(EventTypes.AI_REPLY, { response });
    return this.runStage('postProcess', () => postProcess(response, context), skill.name);
  }

  async runStage(stage, work, skill) {
    const startedAt = Date.now();
    const result = await work();
    eventBus.emit(EventTypes.STAGE_COMPLETED, {
      stage,
      durationMs: Date.now() - startedAt,
      ...(skill ? { skill } : {}),
    });
    return result;
  }
}

module.exports = new LunaBrain();
module.exports.LunaBrain = LunaBrain;
