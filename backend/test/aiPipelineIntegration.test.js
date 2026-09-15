// Task 1.4 — Xác nhận luồng tích hợp end-to-end: LunaBrain -> AiSkill -> aiService -> Provider.
// Toàn bộ test chạy OFFLINE (AI_PROVIDER mặc định = offline trong môi trường test),
// không gọi Nara API thật. Lỗi provider được mô phỏng bằng cách thay thế tạm thời
// aiService.getReply (đúng cách providerConfiguration.test.js đã làm ở mức unit),
// nhưng lần này gửi qua HTTP thật để chứng minh toàn bộ pipeline (kể cả lunaBrain
// và server.js) không rò rỉ lỗi 500 và vẫn ghi lại lịch sử session đúng.

const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const aiService = require('../services/aiService');
const sessionManager = require('../session/sessionManager');
const { VALID_EMOTIONS, VALID_ANIMATIONS } = require('../core/responseBuilder');

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

async function postChat(body) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

test('full pipeline: a message that no other skill claims reaches AiSkill via the offline provider end-to-end', async () => {
  const sid = 'integration-e2e-offline';
  sessionManager.resetSession(sid);

  const { response, payload } = await postChat({
    message: 'Kể cho Luna nghe về vũ trụ đi',
    sessionId: sid,
  });

  assert.equal(response.status, 200);
  assert.equal(payload.source, 'offline');
  assert.equal(typeof payload.reply, 'string');
  assert.ok(payload.reply.trim().length > 0);
  assert.ok(VALID_EMOTIONS.includes(payload.emotion));
  assert.ok(VALID_ANIMATIONS.includes(payload.animation));
  assert.equal(typeof payload.timestamp, 'string');

  // server.js phải đã ghi cả 2 lượt (user + assistant) vào đúng session này.
  const history = sessionManager.getHistory(sid);
  assert.equal(history.length, 2);
  assert.deepEqual(
    history.map((h) => h.role),
    ['user', 'assistant']
  );
  assert.equal(history[1].content, payload.reply);
});

test('full pipeline: session history accumulates across turns and is threaded into aiService context', async () => {
  const sid = 'integration-e2e-history';
  sessionManager.resetSession(sid);

  const capturedContexts = [];
  const originalGetReply = aiService.getReply;
  aiService.getReply = async (context, options) => {
    // QUAN TRỌNG: session.history là 1 mảng dùng chung, bị mutate tiếp ở các lượt sau
    // (sessionManager giữ đúng 1 object session theo sessionId) — phải snapshot
    // (copy) ngay tại thời điểm gọi, nếu không capturedContexts[0] sẽ bị "nhìn thấy"
    // luôn cả state của lượt 2 do cùng tham chiếu mảng.
    const historySnapshot = ((context.session && context.session.history) || []).map((h) => ({ ...h }));
    capturedContexts.push({ message: context.message, historySnapshot });
    return originalGetReply(context, options);
  };

  try {
    await postChat({ message: 'Kể cho Luna nghe về vũ trụ đi', sessionId: sid });
    await postChat({ message: 'Kể tiếp một chuyện khác đi Luna', sessionId: sid });

    assert.equal(capturedContexts.length, 2);
    // Ở lượt 2, context.session.history phải đã chứa lượt 1 (user + assistant)
    // trước khi được gửi tới provider — đây là điểm audit chính của Task 1.4.
    assert.equal(capturedContexts[0].historySnapshot.length, 0);
    assert.equal(capturedContexts[1].historySnapshot.length, 2);
    assert.equal(capturedContexts[1].historySnapshot[0].role, 'user');
    assert.equal(capturedContexts[1].historySnapshot[1].role, 'assistant');
  } finally {
    aiService.getReply = originalGetReply;
  }

  // Sau 2 lượt, sessionManager phải có đúng 4 message (2 user + 2 assistant), đúng thứ tự.
  const history = sessionManager.getHistory(sid);
  assert.equal(history.length, 4);
  assert.deepEqual(
    history.map((h) => h.role),
    ['user', 'assistant', 'user', 'assistant']
  );
});

test('full pipeline: a provider failure deep in aiService never surfaces as an HTTP 500 and still gets recorded in session history', async () => {
  const sid = 'integration-e2e-provider-error';
  sessionManager.resetSession(sid);

  const secret = 'sk-should-never-leak-to-client';
  const originalGetReply = aiService.getReply;
  aiService.getReply = async () => {
    throw new Error(`nara upstream exploded, key=${secret}`);
  };

  let response;
  let payload;
  try {
    ({ response, payload } = await postChat({
      message: 'Kể cho Luna nghe về vũ trụ đi',
      sessionId: sid,
    }));
  } finally {
    aiService.getReply = originalGetReply;
  }

  // Request KHÔNG được 500 — AiSkill phải bắt lỗi và trả fallback an toàn (200).
  assert.equal(response.status, 200);
  assert.equal(payload.source, 'ai-error-fallback');
  assert.equal(payload.emotion, 'sad');
  assert.ok(payload.reply.trim().length > 0);
  assert.doesNotMatch(payload.reply, new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(payload), new RegExp(secret));

  // Lượt lỗi vẫn phải được ghi vào lịch sử session giống như một lượt trả lời bình thường,
  // để lượt chat kế tiếp trong cùng session không bị mất ngữ cảnh.
  const history = sessionManager.getHistory(sid);
  assert.equal(history.length, 2);
  assert.equal(history[1].content, payload.reply);
});

test('full pipeline: an unhandled synchronous crash in a skill upstream of AiSkill still returns a safe JSON error, not a raw 500 stack trace', async () => {
  // Đây không mô phỏng lỗi provider (AiSkill đã tự bắt lỗi provider ở trên),
  // mà mô phỏng trường hợp một skill BẤT KỲ trước AiSkill trong SKILL_ORDER ném lỗi
  // đồng bộ ở canHandle()/handle() — lunaBrain.js phải tự bắt được (xem lunaBrain.js),
  // không để lộ stack trace ra client.
  const CalculatorSkill = require('../skills/calculatorSkill');
  const originalCanHandle = CalculatorSkill.prototype.canHandle;
  CalculatorSkill.prototype.canHandle = function throwingCanHandle() {
    throw new Error('simulated skill crash');
  };

  const sid = 'integration-e2e-skill-crash';
  sessionManager.resetSession(sid);

  let response;
  let payload;
  try {
    ({ response, payload } = await postChat({
      message: 'Kể cho Luna nghe về vũ trụ đi',
      sessionId: sid,
    }));
  } finally {
    CalculatorSkill.prototype.canHandle = originalCanHandle;
  }

  assert.equal(response.status, 200);
  assert.equal(typeof payload.reply, 'string');
  assert.ok(payload.reply.trim().length > 0);
  assert.doesNotMatch(JSON.stringify(payload), /simulated skill crash|at Object|node_modules/);
});
