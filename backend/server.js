const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const lunaBrain = require('./brain/lunaBrain');
const sessionManager = require('./session/sessionManager');
const eventBus = require('./events/eventBus');
const EventTypes = require('./events/eventTypes');
const { readMemory, resetMemory } = require('./memory/memoryManager');
const { chatArchiveManager } = require('./archive/chatArchiveManager');
const { formatMemoryForPrompt } = require('./services/aiService');
const { callNaraStream } = require('./services/naraService');
const { LUNA_SYSTEM_PROMPT } = require('./prompts/lunaPrompt');
const logger = require('./core/logger');

config.validateConfig();

const MAX_MESSAGE_LENGTH = 2000;
const MAX_SESSION_ID_LENGTH = 128;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function getValidatedSessionId(sessionId, fallbackToDefault = true) {
  if (sessionId === undefined || sessionId === null || sessionId === '') {
    return fallbackToDefault ? 'default' : null;
  }
  if (
    typeof sessionId !== 'string' ||
    !sessionId.trim() ||
    sessionId.length > MAX_SESSION_ID_LENGTH ||
    !SESSION_ID_PATTERN.test(sessionId)
  ) {
    return null;
  }
  return sessionId;
}

function writeSseEvent(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function persistCompletedChatTurn(sessionId, message, response) {
  sessionManager.addMessage(sessionId, 'user', message);
  sessionManager.addMessage(sessionId, 'assistant', response.reply);

  try {
    chatArchiveManager.appendConversationTurn({
      sessionId,
      userMessage: message,
      assistantMessage: response.reply,
      assistantSource: response.source,
    });
  } catch (err) {
    logger.error('[chatArchive] Could not persist completed chat turn.', { sessionId, error: err.name });
  }
}

const app = express();
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'JSON request body không hợp lệ.' });
  }
  return next(err);
});

if (config.DEBUG_LOG) {
  eventBus.on(EventTypes.USER_MESSAGE, (e) => logger.debug('[event] USER_MESSAGE', { length: e.message?.length || 0 }));
  eventBus.on(EventTypes.SKILL_HANDLED, (e) => logger.debug('[event] SKILL_HANDLED', { skill: e.skill }));
  eventBus.on(EventTypes.AI_REPLY, () => logger.debug('[event] AI_REPLY'));
  eventBus.on(EventTypes.MEMORY_UPDATED, () => logger.debug('[event] MEMORY_UPDATED'));
  eventBus.on(EventTypes.ERROR, (e) => logger.debug('[event] ERROR', e));
  eventBus.on(EventTypes.STAGE_COMPLETED, (e) => logger.debug('[event] STAGE_COMPLETED', e));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', aiProvider: config.AI_PROVIDER, timestamp: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body || {};
    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'Thiếu hoặc sai định dạng field "message" (phải là string).' });
    }
    if (!message.trim()) {
      return res.status(400).json({ error: 'Field "message" không được để trống.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Field "message" không được vượt quá ${MAX_MESSAGE_LENGTH} ký tự.` });
    }

    const sid = getValidatedSessionId(sessionId);
    if (!sid) {
      return res.status(400).json({ error: 'Field "sessionId" không hợp lệ.' });
    }
    const session = sessionManager.getSession(sid);
    const response = await lunaBrain.processMessage({ message, session });

    persistCompletedChatTurn(sid, message, response);

    if (response.memory) {
      eventBus.emit(EventTypes.MEMORY_UPDATED, { memory: response.memory });
    }

    res.json(response);
  } catch (err) {
    logger.error('[server] Lỗi không mong muốn ở /api/chat:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ, thử lại sau.' });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  const { message, sessionId } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Field "message" không hợp lệ.' });
  }
  const sid = getValidatedSessionId(sessionId);
  if (!sid) return res.status(400).json({ error: 'Field "sessionId" không hợp lệ.' });

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  try {
    const session = sessionManager.getSession(sid);
    let response;

    if (config.AI_PROVIDER === 'nara') {
      const memory = readMemory();
      const messages = [
        ...session.history.map(({ role, content }) => ({ role, content })),
        { role: 'user', content: message },
      ];
      let reply = '';
      reply = await callNaraStream({
        messages,
        systemPrompt: `${LUNA_SYSTEM_PROMPT}${formatMemoryForPrompt(memory)}`,
        onToken: (token) => {
          reply += token;
          if (!res.writableEnded) writeSseEvent(res, 'token', { token });
        },
      });
      response = {
        reply,
        source: 'nara',
        emotion: 'neutral',
        animation: 'talk',
        voice: true,
        commands: [],
        memory: null,
        data: null,
        timestamp: new Date().toISOString(),
      };
    } else {
      response = await lunaBrain.processMessage({ message, session });
      writeSseEvent(res, 'token', { token: response.reply });
    }

    persistCompletedChatTurn(sid, message, response);
    if (response.memory) eventBus.emit(EventTypes.MEMORY_UPDATED, { memory: response.memory });
    writeSseEvent(res, 'done', { response });
  } catch (err) {
    logger.error('[stream] Could not complete streamed chat response.', { error: err.name });
    writeSseEvent(res, 'error', { error: 'Không thể hoàn tất phản hồi streaming.' });
  } finally {
    res.end();
  }
});

app.get('/api/memory', (req, res) => {
  res.json(readMemory());
});

app.post('/api/memory/reset', (req, res) => {
  try {
    const reset = resetMemory();
    eventBus.emit(EventTypes.MEMORY_UPDATED, { memory: reset });
    res.json(reset);
  } catch (err) {
    logger.error('[memory] Could not reset persistent memory.', { error: err.name });
    res.status(500).json({ error: 'Không thể reset memory hiện tại.' });
  }
});

app.post('/api/session/:sessionId/reset', (req, res) => {
  const sessionId = getValidatedSessionId(req.params.sessionId, false);
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID không hợp lệ.' });
  }
  const reset = sessionManager.resetSession(sessionId);
  eventBus.emit(EventTypes.SESSION_RESET, { sessionId });
  res.json(reset);
});

app.use((req, res) => {
  res.status(404).json({ error: `Không tìm thấy route: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  logger.error('[server] Unhandled request error:', err.message);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  const error = status === 400 ? 'Yêu cầu không hợp lệ.' : 'Lỗi máy chủ nội bộ, thử lại sau.';
  res.status(status).json({ error });
});

if (require.main === module) {
  app.listen(config.PORT, () => {
    logger.info(`Luna AI backend đang chạy tại http://localhost:${config.PORT} (AI_PROVIDER=${config.AI_PROVIDER})`);
  });
}

module.exports = app;
module.exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
module.exports.MAX_SESSION_ID_LENGTH = MAX_SESSION_ID_LENGTH;
