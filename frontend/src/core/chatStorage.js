export function sanitizeStoredMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.reduce((result, message) => {
    if (!message || typeof message !== 'object') return result;
    const { isStreaming, ...storedMessage } = message;
    if (isStreaming && storedMessage.role === 'luna' && !String(storedMessage.text || '').trim()) return result;
    result.push(storedMessage);
    return result;
  }, []);
}

export function loadStoredMessages(storage) {
  try {
    const raw = storage.getItem('luna-ai-messages');
    if (!raw) return [];
    return sanitizeStoredMessages(JSON.parse(raw));
  } catch (err) {
    console.warn('[App] Lỗi đọc lịch sử chat từ localStorage, bắt đầu lại từ rỗng:', err.message);
    return [];
  }
}

export function saveStoredMessages(storage, messages) {
  try {
    storage.setItem('luna-ai-messages', JSON.stringify(sanitizeStoredMessages(messages)));
    return true;
  } catch (err) {
    console.warn('[App] Lỗi lưu lịch sử chat vào localStorage:', err.message);
    return false;
  }
}
