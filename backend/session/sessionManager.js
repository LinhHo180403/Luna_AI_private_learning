const config = require('../config/config');

function createSessionManager({ maxHistoryMessages = config.MAX_HISTORY_MESSAGES, now = () => new Date().toISOString() } = {}) {
  const sessions = new Map();

  function createSession() {
    const timestamp = now();
    return { history: [], createdAt: timestamp, updatedAt: timestamp };
  }

  function getOrCreateSession(sessionId = 'default') {
    if (!sessions.has(sessionId)) sessions.set(sessionId, createSession());
    return sessions.get(sessionId);
  }

  function addMessage(sessionId, role, content) {
    const session = getOrCreateSession(sessionId);
    const timestamp = now();
    session.history.push({ role, content, timestamp });
    if (session.history.length > maxHistoryMessages) {
      session.history = session.history.slice(session.history.length - maxHistoryMessages);
    }
    session.updatedAt = timestamp;
    return session;
  }

  function getHistory(sessionId = 'default') {
    return getOrCreateSession(sessionId).history;
  }

  function getSession(sessionId = 'default') {
    return getOrCreateSession(sessionId);
  }

  function resetSession(sessionId = 'default') {
    const session = createSession();
    sessions.set(sessionId, session);
    return session;
  }

  function listSessionIds() {
    return Array.from(sessions.keys());
  }

  return { getOrCreateSession, addMessage, getHistory, getSession, resetSession, listSessionIds };
}

const sessionManager = createSessionManager();

module.exports = { ...sessionManager, createSessionManager };
