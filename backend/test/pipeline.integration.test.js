const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const config = require('../config/config');
const eventBus = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test('POST /api/chat emits measured pipeline stages for the selected skill', async () => {
  assert.equal(config.DEBUG_LOG, true);
  const stages = [];
  const listener = (event) => stages.push(event);
  eventBus.on(EventTypes.STAGE_COMPLETED, listener);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello Luna', sessionId: 'pipeline-integration' }),
    });
    assert.equal(response.status, 200);
    assert.ok(stages.length >= 1);
    assert.ok(stages.every((event) => typeof event.durationMs === 'number' && event.durationMs >= 0));
    assert.ok(stages.some((event) => event.stage === 'executeSkill' && event.skill === 'AiSkill'));
  } finally {
    eventBus.off(EventTypes.STAGE_COMPLETED, listener);
  }
});
