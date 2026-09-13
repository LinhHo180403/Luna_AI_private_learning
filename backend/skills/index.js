const MemorySkill = require('./memorySkill');
const CalculatorSkill = require('./calculatorSkill');
const SnakeSkill = require('./snakeSkill');
const TicTacToeSkill = require('./ticTacToeSkill');
const WeatherSkill = require('./weatherSkill');
const PlannerSkill = require('./plannerSkill');
const AiSkill = require('./aiSkill');

const SKILL_ORDER = [
  new MemorySkill(),
  new CalculatorSkill(),
  new SnakeSkill(),
  new TicTacToeSkill(),
  new WeatherSkill(),
  new PlannerSkill(),
  new AiSkill(),
];

const lastSkill = SKILL_ORDER[SKILL_ORDER.length - 1];
if (lastSkill.name !== 'AiSkill') {
  throw new Error(
    `[skills/index.js] SKILL_ORDER cấu hình sai: skill cuối cùng phải là AiSkill, ` +
    `nhưng hiện tại là "${lastSkill.name}". Sửa lại thứ tự trong SKILL_ORDER.`
  );
}

module.exports = SKILL_ORDER;
