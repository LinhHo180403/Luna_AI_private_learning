import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVERSATION_STATES as S,
  CONVERSATION_EVENTS as E,
  conversationReducer,
  getAvatarAnimation,
  getConversationStatusText,
} from '../src/core/conversationReducer.js';

test('conversation reducer performs valid state transitions and leaves invalid ones unchanged', () => {
  assert.equal(conversationReducer(S.IDLE, E.LISTEN_START), S.LISTENING);
  assert.equal(conversationReducer(S.LISTENING, E.SEND), S.THINKING);
  assert.equal(conversationReducer(S.THINKING, E.TOKEN), S.SPEAKING);
  assert.equal(conversationReducer(S.SPEAKING, E.TTS_ENDED), S.IDLE);
  assert.equal(conversationReducer(S.SPEAKING, E.INTERRUPT), S.INTERRUPTED);
  assert.equal(conversationReducer(S.INTERRUPTED, E.LISTEN_START), S.LISTENING);
  assert.equal(conversationReducer(S.IDLE, E.TOKEN), S.IDLE);
  assert.equal(conversationReducer(S.LISTENING, E.TTS_ENDED), S.LISTENING);
});

test('TTS end never overwrites interrupted state and first token enters speaking', () => {
  assert.equal(conversationReducer(S.INTERRUPTED, E.TTS_ENDED), S.INTERRUPTED);
  assert.equal(conversationReducer(S.THINKING, E.TOKEN), S.SPEAKING);
});

test('conversation reducer exposes avatar animations and Vietnamese status for every state', () => {
  const expected = new Map([
    [S.IDLE, ['wave', 'Sẵn sàng trò chuyện']],
    [S.LISTENING, ['thinking', 'Đang lắng nghe...']],
    [S.THINKING, ['thinking', 'Đang suy nghĩ...']],
    [S.SPEAKING, ['talk', 'Luna đang trả lời...']],
    [S.INTERRUPTED, ['idle', 'Đã ngắt phản hồi']],
  ]);
  for (const [state, [animation, status]] of expected) {
    assert.equal(getAvatarAnimation(state, 'wave'), animation);
    assert.equal(getConversationStatusText(state), status);
  }
});
