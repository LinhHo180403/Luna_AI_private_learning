const config = require('../config/config');
const defaultMemoryManager = require('../memory/memoryManager');
const logger = require('../core/logger');

const MAX_SUMMARY_LENGTH = 240;

function summarizeDiscardedMessages(messages) {
  const fragments = messages
    .map(({ role, content }) => {
      const text = String(content ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const speaker = role === 'assistant' ? 'Luna' : 'Người dùng';
      return `${speaker}: ${text}`;
    })
    .filter(Boolean);

  if (fragments.length === 0) return null;
  return `Tóm tắt hội thoại cũ: ${fragments.join(' | ')}`.slice(0, MAX_SUMMARY_LENGTH);
}

function createSessionManager({
  maxHistoryMessages = config.MAX_HISTORY_MESSAGES,
  now = () => new Date().toISOString(),
  memoryManager = defaultMemoryManager,
} = {}) {
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
      const discarded = session.history.slice(0, session.history.length - maxHistoryMessages);
      session.history = session.history.slice(session.history.length - maxHistoryMessages);
      const summary = summarizeDiscardedMessages(discarded);
      if (summary) {
        try {
          memoryManager.patchMemory({ notes: [summary] });
        } catch (err) {
          logger.error('[sessionManager] Could not persist trimmed history summary.', {
            sessionId,
            error: err.name,
          });
        }
      }
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

module.exports = { ...sessionManager, createSessionManager, summarizeDiscardedMessages, MAX_SUMMARY_LENGTH };
