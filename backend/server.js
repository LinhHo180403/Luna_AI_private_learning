const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const lunaBrain = require('./brain/lunaBrain');
const sessionManager = require('./session/sessionManager');
const eventBus = require('./events/eventBus');
const EventTypes = require('./events/eventTypes');
const { readMemory, resetMemory } = require('./memory/memoryManager');

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
  eventBus.on(EventTypes.USER_MESSAGE, (e) => console.log('[event] USER_MESSAGE:', { length: e.message?.length || 0 }));
  eventBus.on(EventTypes.SKILL_HANDLED, (e) => console.log('[event] SKILL_HANDLED:', e.skill));
  eventBus.on(EventTypes.AI_REPLY, () => console.log('[event] AI_REPLY'));
  eventBus.on(EventTypes.MEMORY_UPDATED, () => console.log('[event] MEMORY_UPDATED'));
  eventBus.on(EventTypes.ERROR, (e) => console.log('[event] ERROR:', e));
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

    sessionManager.addMessage(sid, 'user', message);
    sessionManager.addMessage(sid, 'assistant', response.reply);

    if (response.memory) {
      eventBus.emit(EventTypes.MEMORY_UPDATED, { memory: response.memory });
    }

    res.json(response);
  } catch (err) {
    console.error('[server] Lỗi không mong muốn ở /api/chat:', err);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ, thử lại sau.' });
  }
});

app.get('/api/memory', (req, res) => {
  res.json(readMemory());
});

app.post('/api/memory/reset', (req, res) => {
  const reset = resetMemory();
  eventBus.emit(EventTypes.MEMORY_UPDATED, { memory: reset });
  res.json(reset);
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
  console.error('[server] Unhandled request error:', err.message);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  const error = status === 400 ? 'Yêu cầu không hợp lệ.' : 'Lỗi máy chủ nội bộ, thử lại sau.';
  res.status(status).json({ error });
});

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`Luna AI backend đang chạy tại http://localhost:${config.PORT} (AI_PROVIDER=${config.AI_PROVIDER})`);
  });
}

module.exports = app;
module.exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
module.exports.MAX_SESSION_ID_LENGTH = MAX_SESSION_ID_LENGTH;
