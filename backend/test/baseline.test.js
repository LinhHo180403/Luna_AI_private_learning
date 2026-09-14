const test = require('node:test');
const assert = require('node:assert/strict');

const CalculatorSkill = require('../skills/calculatorSkill');
const SnakeSkill = require('../skills/snakeSkill');
const WeatherSkill = require('../skills/weatherSkill');
const ResponseBuilder = require('../core/responseBuilder');
const CommandTypes = require('../core/commandTypes');
const sessionManager = require('../session/sessionManager');

const { calculate } = CalculatorSkill;

test('calculator respects multiplication precedence', () => {
  assert.equal(calculate('5 + 5 * 2'), 15);
});

test('calculator supports parentheses and exponentiation', () => {
  assert.equal(calculate('(2 + 3) ^ 2'), 25);
});

test('calculator rejects division by zero', () => {
  assert.throws(() => calculate('10 / 0'));
});

test('calculator rejects unbalanced parentheses', () => {
  assert.throws(() => calculate('(2 + 3'));
});

test('calculator skill recognizes an arithmetic expression only', () => {
  const skill = new CalculatorSkill();
  assert.equal(skill.canHandle({ message: '12 * 7' }), true);
  assert.equal(skill.canHandle({ message: 'hello Luna' }), false);
});

test('snake skill recognizes the English open trigger', () => {
  const skill = new SnakeSkill();
  assert.equal(skill.canHandle({ message: 'play snake game' }), true);
});

test('specialized skills do not claim unrelated input', () => {
  const message = { message: 'tell me a story' };
  assert.equal(new SnakeSkill().canHandle(message), false);
  assert.equal(new WeatherSkill().canHandle(message), false);
});

test('response builder preserves a normal command response contract', () => {
  const response = new ResponseBuilder()
    .setReply('Ready')
    .setSource('test')
    .setEmotion('happy')
    .setAnimation('wave')
    .setVoice(true)
    .addCommand(CommandTypes.OPEN_GAME, { game: 'snake' })
    .build();

  assert.equal(response.reply, 'Ready');
  assert.equal(response.emotion, 'happy');
  assert.equal(response.animation, 'wave');
  assert.equal(response.voice, true);
  assert.deepEqual(response.commands, [{ type: CommandTypes.OPEN_GAME, payload: { game: 'snake' } }]);
  assert.equal(typeof response.timestamp, 'string');
});

test('response builder normalizes unsupported emotion and animation values', () => {
  const response = new ResponseBuilder().setEmotion('invalid').setAnimation('invalid').build();
  assert.equal(response.emotion, 'neutral');
  assert.equal(response.animation, 'idle');
});

test('response builder rejects an unknown command type', () => {
  assert.throws(() => new ResponseBuilder().addCommand('NOT_A_COMMAND'));
});

test('session helper stores and resets only in-memory test session data', () => {
  const sessionId = 'baseline-test-session';
  sessionManager.resetSession(sessionId);
  sessionManager.addMessage(sessionId, 'user', 'hello');
  sessionManager.addMessage(sessionId, 'assistant', 'hi');
  assert.deepEqual(sessionManager.getHistory(sessionId).map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ]);
  assert.deepEqual(sessionManager.resetSession(sessionId).history, []);
});
