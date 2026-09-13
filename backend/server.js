const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const lunaBrain = require('./brain/lunaBrain');
const sessionManager = require('./session/sessionManager');
const eventBus = require('./events/eventBus');
const EventTypes = require('./events/eventTypes');
const { readMemory, resetMemory } = require('./memory/memoryManager');

config.validateConfig();

const app = express();
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

if (config.DEBUG_LOG) {
  eventBus.on(EventTypes.USER_MESSAGE, (e) => console.log('[event] USER_MESSAGE:', e.message));
  eventBus.on(EventTypes.SKILL_HANDLED, (e) => console.log('[event] SKILL_HANDLED:', e.skill));
  eventBus.on(EventTypes.AI_REPLY, () => console.log('[event] AI_REPLY'));
  eventBus.on(EventTypes.MEMORY_UPDATED, (e) => console.log('[event] MEMORY_UPDATED:', e));
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

    const sid = sessionId || 'default';
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
  const reset = sessionManager.resetSession(req.params.sessionId);
  eventBus.emit(EventTypes.SESSION_RESET, { sessionId: req.params.sessionId });
  res.json(reset);
});

app.use((req, res) => {
  res.status(404).json({ error: `Không tìm thấy route: ${req.method} ${req.path}` });
});

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`Luna AI backend đang chạy tại http://localhost:${config.PORT} (AI_PROVIDER=${config.AI_PROVIDER})`);
  });
}

module.exports = app;
