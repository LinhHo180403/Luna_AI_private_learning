const test = require('node:test');
const assert = require('node:assert/strict');

const { LunaBrain } = require('../brain/lunaBrain');
const ResponseBuilder = require('../core/responseBuilder');
const logger = require('../core/logger');
const {
  matchSkill,
  executeSkill,
  postProcess,
} = require('../core/pipeline');

function withoutTimestamp({ timestamp, ...response }) {
  return response;
}

test('LunaBrain pipeline preserves offline baseline responses', async () => {
  const brain = new LunaBrain();
  const session = { history: [] };
  const cases = [
    {
      message: '',
      expected: {
        reply: 'Bạn chưa nhắn gì cho Luna cả 👀', source: 'brain', emotion: 'curious', animation: 'idle',
        voice: true, commands: [], memory: null, data: null,
      },
    },
    {
      message: '5 + 5 * 2',
      expected: {
        reply: '5 + 5 * 2 = 15', source: 'calculator', emotion: 'excited', animation: 'talk',
        voice: true, commands: [], memory: null, data: { expression: '5 + 5 * 2', result: 15 },
      },
    },
    {
      message: 'weather in Da Nang',
      expected: {
        reply: 'Thời tiết ở Da Nang: nắng nhẹ, khoảng 30°C, độ ẩm 70%. (Lưu ý: đây là dữ liệu mock offline, chưa nối API thời tiết thật nha!)',
        source: 'weather', emotion: 'happy', animation: 'talk', voice: true, commands: [], memory: null,
        data: { weather: { city: 'Da Nang', tempC: 30, condition: 'nắng nhẹ', humidity: 70 }, isMock: true },
      },
    },
  ];

  for (const { message, expected } of cases) {
    assert.deepEqual(withoutTimestamp(await brain.processMessage({ message, session })), expected);
  }
});

test('pipeline stages skip non-matching skills, handle errors, and return valid results', async () => {
  const events = [];
  const originalLoggerError = logger.error;
  logger.error = () => {};
  const context = { message: 'test' };
  const skipped = { name: 'SkippedSkill', canHandle: () => false };
  const broken = { name: 'BrokenSkill', canHandle: () => true, handle: async () => { throw new Error('broken'); } };
  const validResponse = new ResponseBuilder().setReply('handled').setSource('ValidSkill').build();
  const valid = { name: 'ValidSkill', canHandle: () => true, handle: async () => validResponse };

  try {
    assert.equal(matchSkill(context, [skipped, broken]), broken);
    const errorResponse = await executeSkill(broken, context, { onError: (event) => events.push(event) });
    assert.equal(errorResponse.source, 'error-in-BrokenSkill');
    assert.deepEqual(events, [{ skill: 'BrokenSkill', phase: 'handle', error: 'broken' }]);

    assert.equal(matchSkill(context, [skipped, valid]), valid);
    assert.equal(await executeSkill(valid, context), validResponse);
    assert.equal(postProcess(validResponse, context), validResponse);
  } finally {
    logger.error = originalLoggerError;
  }
});
