// frontend/src/App.jsx
// Orchestrator chính của Luna AI: quản lý chat (gửi/nhận, lưu localStorage), theme
// sáng/tối (lưu localStorage), voice (SpeechSynthesis phát giọng Luna + SpeechRecognition
// nhận giọng nói người dùng), avatar state (emotion/animation nhận từ backend), và
// game/plan overlay state - điều phối qua commandDispatcher.js khi backend gửi lệnh.
//
// THIẾT KẾ: các hàm thuần (không phụ thuộc React/DOM) được tách và export riêng ở
// đầu file để test bằng Node - session id, đọc/ghi localStorage có inject storage
// để test được mà không cần trình duyệt thật.

import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import axios from 'axios';
import AvatarFace from './components/AvatarFace.jsx';
import PlanCard from './components/PlanCard.jsx';
import SnakeCanvasGame from './components/SnakeCanvasGame.jsx';
import TicTacToe from './components/TicTacToe.jsx';
import { dispatchCommands } from './core/commandDispatcher.js';
import {
  CONVERSATION_STATES,
  CONVERSATION_EVENTS,
  conversationReducer,
  getAvatarAnimation,
  getConversationStatusText,
} from './core/conversationReducer.js';
import { consumeSseResponse } from './core/sseClient.js';
import { loadStoredMessages, saveStoredMessages } from './core/chatStorage.js';

export { CONVERSATION_STATES, consumeSseResponse, loadStoredMessages, saveStoredMessages };

// ============================================================================
// PURE HELPERS (export để test bằng Node, storage được inject để không cần browser)
// ============================================================================

export const STORAGE_KEYS = Object.freeze({
  THEME: 'luna-ai-theme',
  SESSION_ID: 'luna-ai-session-id',
  MESSAGES: 'luna-ai-messages',
});

/**
 * Sinh session id ngẫu nhiên. Dùng crypto.randomUUID() nếu có (browser hiện đại),
 * fallback về chuỗi ngẫu nhiên thủ công nếu không (môi trường cũ/test).
 */
export function generateSessionId(cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined) {
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lấy session id đã lưu, hoặc sinh mới và lưu lại nếu chưa có.
 * @param {Storage} storage - localStorage thật hoặc mock để test
 */
export function getOrCreateSessionId(storage) {
  try {
    const existing = storage.getItem(STORAGE_KEYS.SESSION_ID);
    if (existing) return existing;
    const fresh = generateSessionId();
    storage.setItem(STORAGE_KEYS.SESSION_ID, fresh);
    return fresh;
  } catch (err) {
    console.warn('[App] Không đọc/ghi được localStorage cho session id, dùng session tạm:', err.message);
    return generateSessionId();
  }
}

export function loadStoredTheme(storage) {
  try {
    const theme = storage.getItem(STORAGE_KEYS.THEME);
    return theme === 'dark' || theme === 'light' ? theme : 'light';
  } catch (err) {
    return 'light';
  }
}

export function saveStoredTheme(storage, theme) {
  try {
    storage.setItem(STORAGE_KEYS.THEME, theme);
    return true;
  } catch (err) {
    console.warn('[App] Lỗi lưu theme vào localStorage:', err.message);
    return false;
  }
}

/**
 * Format giờ:phút cho timestamp hiển thị dưới mỗi bubble chat.
 */
export function formatMessageTime(isoString) {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return '';
  }
}

/**
 * Chuyển 1 message người dùng/Luna thành object chuẩn để lưu vào state/localStorage.
 */
export function createMessage(role, text) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role, // 'user' | 'luna'
    text,
    timestamp: new Date().toISOString(),
  };
}

export function isSnakeSidebarTrigger(text) {
  return /(?:chơi\s+trò\s+chơi\s+con\s+rắn|play\s+snake\s+game)/iu.test(String(text || '').trim());
}

// ============================================================================
// REACT COMPONENT
// ============================================================================

function App() {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;

  const [sessionId] = useState(() => (storage ? getOrCreateSessionId(storage) : generateSessionId()));
  const [messages, setMessages] = useState(() => (storage ? loadStoredMessages(storage) : []));
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationState, dispatchConversation] = useReducer(conversationReducer, CONVERSATION_STATES.IDLE);

  const [theme, setTheme] = useState(() => (storage ? loadStoredTheme(storage) : 'light'));
  const [emotion, setEmotion] = useState('neutral');
  const [animation, setAnimation] = useState('idle');

  const [activeGame, setActiveGame] = useState(null); // { game, id, status } | null
  const [plan, setPlan] = useState(null);

  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);

  const messageListRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamAbortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  // ---- Áp dụng theme lên <html data-theme="..."> + lưu localStorage ----
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (storage) saveStoredTheme(storage, theme);
  }, [theme]);

  // ---- Lưu lịch sử chat vào localStorage mỗi khi messages đổi ----
  useEffect(() => {
    if (storage) saveStoredMessages(storage, messages);
  }, [messages]);

  // ---- Tự cuộn xuống cuối khi có tin nhắn mới ----
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // ---- Phát giọng nói Luna qua Web Speech API (SpeechSynthesis) ----
  const speak = useCallback((text, onEnd) => {
    if (!voiceOutputEnabled) return false;
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    try {
      window.speechSynthesis.cancel(); // huỷ câu đang nói dở nếu có, tránh chồng giọng
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.0;
      utterance.onend = () => onEnd?.();
      utterance.onerror = (event) => {
        if (event.error !== 'canceled' && event.error !== 'interrupted') onEnd?.();
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (err) {
      console.warn('[App] Lỗi phát giọng nói:', err.message);
      return false;
    }
  }, [voiceOutputEnabled]);

  // ---- Nhận giọng nói qua SpeechRecognition (nếu trình duyệt hỗ trợ) ----
  const toggleListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionApi) {
      console.warn('[App] Trình duyệt không hỗ trợ SpeechRecognition.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      dispatchConversation(CONVERSATION_EVENTS.LISTEN_END);
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
    };
    recognition.onerror = (event) => {
      console.warn('[App] Lỗi SpeechRecognition:', event.error);
      setIsListening(false);
      dispatchConversation(CONVERSATION_EVENTS.LISTEN_END);
    };
    recognition.onend = () => {
      setIsListening(false);
      dispatchConversation(CONVERSATION_EVENTS.LISTEN_END);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    dispatchConversation(CONVERSATION_EVENTS.LISTEN_START);
  }, [isListening]);

  // ---- Command handlers cho commandDispatcher ----
  const clearChat = useCallback(() => {
    setMessages([]);
    if (storage) saveStoredMessages(storage, []);
  }, []);

  const commandHandlers = {
    setActiveGame,
    setEmotion,
    setAnimation,
    speak,
    setMemory: () => {}, // memory hiện chưa hiển thị UI riêng, chỉ log qua eventBus backend
    setPlan,
    clearChat,
  };

  // ---- Gửi tin nhắn ----
  const sendMessage = useCallback(async (rawText) => {
    const text = rawText.trim();
    if (!text || isLoading) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    const userMessage = createMessage('user', text);
    const streamingMessage = { ...createMessage('luna', ''), isStreaming: true };
    setMessages((prev) => [...prev, userMessage]);
    setMessages((prev) => [...prev, streamingMessage]);
    setInputValue('');
    setIsLoading(true);
    dispatchConversation(CONVERSATION_EVENTS.SEND);

    if (isSnakeSidebarTrigger(text)) {
      setActiveGame({ game: 'snake', id: `snake-local-${Date.now()}`, status: 'open' });
    }

    let receivedToken = false;
    let response;
    let requestError;
    let abortController;
    try {
      abortController = new AbortController();
      streamAbortControllerRef.current = abortController;
      const streamResponse = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: text, sessionId }),
        signal: abortController.signal,
      });

      if (!streamResponse.ok) {
        throw new Error(`Streaming endpoint trả về HTTP ${streamResponse.status}.`);
      }

      await consumeSseResponse(streamResponse, (event, payload) => {
        if (event === 'token' && typeof payload.token === 'string') {
          if (!isCurrentRequest()) return;
          receivedToken = true;
          dispatchConversation(CONVERSATION_EVENTS.TOKEN);
          setMessages((prev) => prev.map((message) => (
            message.id === streamingMessage.id
              ? { ...message, text: `${message.text}${payload.token}` }
              : message
          )));
        }
        if (event === 'done' && payload.response && isCurrentRequest()) response = payload.response;
        if (event === 'error') throw new Error(payload.error || 'Streaming response thất bại.');
      });

      if (!response || typeof response.reply !== 'string') {
        throw new Error('Streaming response không hoàn chỉnh.');
      }
    } catch (streamError) {
      // Chỉ fallback khi chưa nhận token nào; nếu không sẽ tránh gửi cùng một prompt hai lần.
      if (receivedToken || streamError.name === 'AbortError') {
        requestError = streamError;
      } else {
        try {
          const restResult = await axios.post('/api/chat', { message: text, sessionId });
          response = restResult.data;
        } catch (restError) {
          requestError = restError;
        }
      }
    } finally {
      if (streamAbortControllerRef.current === abortController) streamAbortControllerRef.current = null;
    }

    try {
      if (!isCurrentRequest()) return;
      if (requestError) throw requestError;
      if (!response || typeof response.reply !== 'string') throw new Error('Không nhận được phản hồi hợp lệ từ Luna.');
      setMessages((prev) => prev.map((message) => (
        message.id === streamingMessage.id
          ? { ...message, text: response.reply, isStreaming: false }
          : message
      )));

      setEmotion(response.emotion || 'neutral');
      setAnimation(response.animation || 'idle');

      dispatchCommands(response.commands, commandHandlers);

      if (response.voice) {
        dispatchConversation(CONVERSATION_EVENTS.DONE_WITH_VOICE);
        const speakingStarted = speak(response.reply, () => dispatchConversation(CONVERSATION_EVENTS.TTS_ENDED));
        if (!speakingStarted) dispatchConversation(CONVERSATION_EVENTS.DONE_NO_VOICE);
      } else {
        dispatchConversation(CONVERSATION_EVENTS.DONE_NO_VOICE);
      }
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('[App] Lỗi gửi tin nhắn:', err.message);
      const errorText = err.name === 'AbortError'
        ? 'Phản hồi của Luna đã được ngắt.'
        : 'Luna không kết nối được với server, thử lại giúp Luna nha 🥲';
      setMessages((prev) => prev.map((message) => (
        message.id === streamingMessage.id
          ? { ...message, text: message.text || errorText, isStreaming: false }
          : message
      )));
      if (err.name !== 'AbortError') {
        setEmotion('sad');
        setAnimation('idle');
        dispatchConversation(CONVERSATION_EVENTS.ERROR);
      }
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
    }
  }, [isLoading, sessionId, speak]);

  const interruptConversation = useCallback(() => {
    requestIdRef.current += 1;
    streamAbortControllerRef.current?.abort();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setMessages((prev) => prev.map((message) => (
      message.isStreaming
        ? { ...message, text: message.text || 'Phản hồi của Luna đã được ngắt.', isStreaming: false }
        : message
    )));
    dispatchConversation(CONVERSATION_EVENTS.INTERRUPT);
    setIsLoading(false);
  }, []);

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleSendClick = () => sendMessage(inputValue);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const toggleVoiceOutput = () => setVoiceOutputEnabled((v) => !v);

  const closeGame = () => setActiveGame(null);
  const closePlan = () => setPlan(null);
  const avatarAnimation = getAvatarAnimation(conversationState, animation);
  const conversationStatus = getConversationStatusText(conversationState);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <span aria-hidden="true">🌙</span>
          <span>Luna AI</span>
        </div>
        <div className="app-header-controls">
          <button type="button" className="btn-icon" onClick={toggleVoiceOutput} aria-label={voiceOutputEnabled ? 'Tắt giọng nói Luna' : 'Bật giọng nói Luna'} title={voiceOutputEnabled ? 'Tắt giọng nói' : 'Bật giọng nói'}>
            {voiceOutputEnabled ? '🔊' : '🔇'}
          </button>
          <button type="button" className="btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} title="Đổi giao diện">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button type="button" className="btn-icon" onClick={clearChat} aria-label="Xoá lịch sử chat" title="Xoá lịch sử chat">
            🗑️
          </button>
        </div>
      </header>

      <div className={`app-body${activeGame?.status === 'open' ? ' app-body-game-open' : ''}`}>
        <aside className="avatar-panel">
          <AvatarFace emotion={emotion} animation={avatarAnimation} />
          <div className="avatar-panel-name">Luna</div>
          <div className="avatar-panel-status">
            {conversationStatus}
          </div>
        </aside>

        <main className="chat-panel">
          <div className="chat-message-list" ref={messageListRef}>
            {messages.length === 0 && (
              <div className="chat-empty-state">
                Chào bạn! Luna đây 👋 Nhắn gì đó để bắt đầu trò chuyện, hoặc thử
                &ldquo;chơi rắn đi&rdquo;, &ldquo;chơi cờ ca rô&rdquo;, &ldquo;lập kế hoạch cho...&rdquo;.
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message chat-message-${msg.role === 'user' ? 'user' : 'luna'}`}>
                <div className={`chat-bubble${msg.isStreaming ? ' chat-bubble-streaming' : ''}`}>
                  {msg.isStreaming && !msg.text ? (
                    <><span className="chat-bubble-typing-dot" /><span className="chat-bubble-typing-dot" /><span className="chat-bubble-typing-dot" /></>
                  ) : msg.text}
                  {msg.isStreaming && msg.text && <span aria-label="Đang nhận phản hồi">▍</span>}
                </div>
                <span className="chat-bubble-timestamp">{formatMessageTime(msg.timestamp)}</span>
              </div>
            ))}

            {plan && (
              <div className="chat-message chat-message-luna">
                <PlanCard plan={plan} onClose={closePlan} />
              </div>
            )}

          </div>

          <div className="chat-input-bar">
            <button
              type="button"
              className="btn-icon"
              onClick={toggleListening}
              aria-label={isListening ? 'Dừng ghi âm' : 'Nói với Luna'}
              title={isListening ? 'Đang nghe... bấm để dừng' : 'Nói với Luna'}
            >
              {isListening ? '🔴' : '🎤'}
            </button>
            <textarea
              className="chat-input-field"
              placeholder="Nhắn gì đó cho Luna..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={handleSendClick}
              disabled={isLoading || !inputValue.trim()}
            >
              Gửi
            </button>
            {(isLoading || conversationState === CONVERSATION_STATES.SPEAKING) && (
              <button type="button" className="btn-icon" onClick={interruptConversation} aria-label="Ngắt phản hồi của Luna" title="Ngắt phản hồi">
                ⏹️
              </button>
            )}
          </div>
        </main>

        <aside className="game-sidebar" aria-label="Khung trò chơi" aria-hidden={activeGame?.status !== 'open'}>
          <div className="game-sidebar-content">
            {activeGame?.status === 'open' && activeGame.game === 'snake' && <SnakeCanvasGame onClose={closeGame} />}
            {activeGame?.status === 'open' && activeGame.game === 'tictactoe' && <TicTacToe onClose={closeGame} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
