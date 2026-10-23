export const CONVERSATION_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'interrupted',
});

export const CONVERSATION_EVENTS = Object.freeze({
  LISTEN_START: 'LISTEN_START',
  LISTEN_END: 'LISTEN_END',
  SEND: 'SEND',
  TOKEN: 'TOKEN',
  DONE_WITH_VOICE: 'DONE_WITH_VOICE',
  DONE_NO_VOICE: 'DONE_NO_VOICE',
  TTS_ENDED: 'TTS_ENDED',
  INTERRUPT: 'INTERRUPT',
  ABORTED: 'ABORTED',
  ERROR: 'ERROR',
});

export function conversationReducer(state, event) {
  switch (event) {
    case CONVERSATION_EVENTS.LISTEN_START:
      return state === CONVERSATION_STATES.IDLE || state === CONVERSATION_STATES.INTERRUPTED
        ? CONVERSATION_STATES.LISTENING
        : state;
    case CONVERSATION_EVENTS.LISTEN_END:
      return state === CONVERSATION_STATES.LISTENING ? CONVERSATION_STATES.IDLE : state;
    case CONVERSATION_EVENTS.SEND:
      return state === CONVERSATION_STATES.IDLE || state === CONVERSATION_STATES.LISTENING || state === CONVERSATION_STATES.INTERRUPTED
        ? CONVERSATION_STATES.THINKING
        : state;
    // Giữ nguyên quyết định UX của Task 4.2: token đầu tiên bật SPEAKING ngay.
    case CONVERSATION_EVENTS.TOKEN:
      return state === CONVERSATION_STATES.THINKING ? CONVERSATION_STATES.SPEAKING : state;
    case CONVERSATION_EVENTS.DONE_WITH_VOICE:
      return state === CONVERSATION_STATES.THINKING || state === CONVERSATION_STATES.SPEAKING
        ? CONVERSATION_STATES.SPEAKING
        : state;
    case CONVERSATION_EVENTS.DONE_NO_VOICE:
    case CONVERSATION_EVENTS.ERROR:
      return state === CONVERSATION_STATES.THINKING || state === CONVERSATION_STATES.SPEAKING
        ? CONVERSATION_STATES.IDLE
        : state;
    case CONVERSATION_EVENTS.INTERRUPT:
    case CONVERSATION_EVENTS.ABORTED:
      return state === CONVERSATION_STATES.THINKING || state === CONVERSATION_STATES.SPEAKING
        ? CONVERSATION_STATES.INTERRUPTED
        : state;
    // TTS cancel có thể gọi onerror; chỉ SPEAKING mới được kết thúc về IDLE.
    case CONVERSATION_EVENTS.TTS_ENDED:
      return state === CONVERSATION_STATES.SPEAKING ? CONVERSATION_STATES.IDLE : state;
    default:
      return state;
  }
}

export function getAvatarAnimation(state, fallbackAnimation = 'idle') {
  if (state === CONVERSATION_STATES.LISTENING || state === CONVERSATION_STATES.THINKING) return 'thinking';
  if (state === CONVERSATION_STATES.SPEAKING) return 'talk';
  if (state === CONVERSATION_STATES.INTERRUPTED) return 'idle';
  return fallbackAnimation;
}

export function getConversationStatusText(state) {
  return {
    [CONVERSATION_STATES.IDLE]: 'Sẵn sàng trò chuyện',
    [CONVERSATION_STATES.LISTENING]: 'Đang lắng nghe...',
    [CONVERSATION_STATES.THINKING]: 'Đang suy nghĩ...',
    [CONVERSATION_STATES.SPEAKING]: 'Luna đang trả lời...',
    [CONVERSATION_STATES.INTERRUPTED]: 'Đã ngắt phản hồi',
  }[state] || 'Sẵn sàng trò chuyện';
}
