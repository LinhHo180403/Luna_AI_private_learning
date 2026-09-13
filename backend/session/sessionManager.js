const config = require('../config/config');

const sessions = new Map();

function getOrCreateSession(sessionId = 'default') {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { history: [], createdAt: new Date().toISOString() });
  }
  return sessions.get(sessionId);
}

function addMessage(sessionId, role, content) {
  const session = getOrCreateSession(sessionId);
  session.history.push({ role, content, timestamp: new Date().toISOString() });

  const maxMessages = config.MAX_HISTORY_MESSAGES;
  if (session.history.length > maxMessages) {
    session.history = session.history.slice(session.history.length - maxMessages);
  }
  return session;
}

function getHistory(sessionId = 'default') {
  return getOrCreateSession(sessionId).history;
}

function getSession(sessionId = 'default') {
  return getOrCreateSession(sessionId);
}

function resetSession(sessionId = 'default') {
  sessions.set(sessionId, { history: [], createdAt: new Date().toISOString() });
  return sessions.get(sessionId);
}

function listSessionIds() {
  return Array.from(sessions.keys());
}

module.exports = { getOrCreateSession, addMessage, getHistory, getSession, resetSession, listSessionIds };
