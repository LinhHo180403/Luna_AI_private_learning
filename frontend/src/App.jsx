// frontend/src/App.jsx
// Orchestrator chính của Luna AI: quản lý chat (gửi/nhận, lưu localStorage), theme
// sáng/tối (lưu localStorage), voice (SpeechSynthesis phát giọng Luna + SpeechRecognition
// nhận giọng nói người dùng), avatar state (emotion/animation nhận từ backend), và
// game/plan overlay state - điều phối qua commandDispatcher.js khi backend gửi lệnh.
//
// THIẾT KẾ: các hàm thuần (không phụ thuộc React/DOM) được tách và export riêng ở
// đầu file để test bằng Node - session id, đọc/ghi localStorage có inject storage
// để test được mà không cần trình duyệt thật.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import AvatarFace from './components/AvatarFace.jsx';
import PlanCard from './components/PlanCard.jsx';
import SnakeCanvasGame from './components/SnakeCanvasGame.jsx';
import TicTacToe from './components/TicTacToe.jsx';
import { dispatchCommands } from './core/commandDispatcher.js';

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

export function loadStoredMessages(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.MESSAGES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[App] Lỗi đọc lịch sử chat từ localStorage, bắt đầu lại từ rỗng:', err.message);
    return [];
  }
}

export function saveStoredMessages(storage, messages) {
  try {
    storage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    return true;
  } catch (err) {
    console.warn('[App] Lỗi lưu lịch sử chat vào localStorage:', err.message);
    return false;
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

export const CONVERSATION_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'interrupted',
});

/**
 * Đọc event stream từ POST /api/chat/stream. EventSource không hỗ trợ POST,
 * vì vậy client dùng fetch + ReadableStream và cùng cú pháp SSE chuẩn.
 */
export async function consumeSseResponse(response, onEvent) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('Streaming response không có readable body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchBlock = (block) => {
    const lines = block.split('\n');
    let event = 'message';
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }

    if (dataLines.length === 0) return;
    try {
      onEvent(event, JSON.parse(dataLines.join('\n')));
    } catch {
      throw new Error('Streaming response có dữ liệu không hợp lệ.');
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r/g, '');

    let delimiterIndex = buffer.indexOf('\n\n');
    while (delimiterIndex !== -1) {
      const block = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);
      if (block.trim()) dispatchBlock(block);
      delimiterIndex = buffer.indexOf('\n\n');
    }

    if (done) break;
  }

  if (buffer.trim()) dispatchBlock(buffer);
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
  const [conversationState, setConversationState] = useState(CONVERSATION_STATES.IDLE);

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
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
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
      setConversationState(CONVERSATION_STATES.IDLE);
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
      setConversationState(CONVERSATION_STATES.IDLE);
    };
    recognition.onend = () => {
      setIsListening(false);
      setConversationState(CONVERSATION_STATES.IDLE);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setConversationState(CONVERSATION_STATES.LISTENING);
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

    const userMessage = createMessage('user', text);
    const streamingMessage = { ...createMessage('luna', ''), isStreaming: true };
    setMessages((prev) => [...prev, userMessage]);
    setMessages((prev) => [...prev, streamingMessage]);
    setInputValue('');
    setIsLoading(true);
    setConversationState(CONVERSATION_STATES.THINKING);

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
          receivedToken = true;
          setConversationState(CONVERSATION_STATES.SPEAKING);
          setMessages((prev) => prev.map((message) => (
            message.id === streamingMessage.id
              ? { ...message, text: `${message.text}${payload.token}` }
              : message
          )));
        }
        if (event === 'done' && payload.response) response = payload.response;
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
        setConversationState(CONVERSATION_STATES.SPEAKING);
        const speakingStarted = speak(response.reply, () => setConversationState(CONVERSATION_STATES.IDLE));
        if (!speakingStarted) setConversationState(CONVERSATION_STATES.IDLE);
      } else {
        setConversationState(CONVERSATION_STATES.IDLE);
      }
    } catch (err) {
      console.error('[App] Lỗi gửi tin nhắn:', err.message);
      const errorText = err.name === 'AbortError'
        ? 'Phản hồi của Luna đã được ngắt.'
        : 'Luna không kết nối được với server, thử lại giúp Luna nha 🥲';
      setMessages((prev) => prev.map((message) => (
        message.id === streamingMessage.id
          ? { ...message, text: errorText, isStreaming: false }
          : message
      )));
      setEmotion('sad');
      setAnimation('idle');
      setConversationState(err.name === 'AbortError' ? CONVERSATION_STATES.INTERRUPTED : CONVERSATION_STATES.IDLE);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, sessionId, speak]);

  const interruptConversation = useCallback(() => {
    streamAbortControllerRef.current?.abort();
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setConversationState(CONVERSATION_STATES.INTERRUPTED);
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
  const avatarAnimation = conversationState === CONVERSATION_STATES.LISTENING || conversationState === CONVERSATION_STATES.THINKING
    ? 'thinking'
    : conversationState === CONVERSATION_STATES.SPEAKING
      ? 'talk'
      : conversationState === CONVERSATION_STATES.INTERRUPTED
        ? 'idle'
        : animation;
  const conversationStatus = {
    [CONVERSATION_STATES.IDLE]: 'Sẵn sàng trò chuyện',
    [CONVERSATION_STATES.LISTENING]: 'Đang lắng nghe...',
    [CONVERSATION_STATES.THINKING]: 'Đang suy nghĩ...',
    [CONVERSATION_STATES.SPEAKING]: 'Luna đang trả lời...',
    [CONVERSATION_STATES.INTERRUPTED]: 'Đã ngắt phản hồi',
  }[conversationState];

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
