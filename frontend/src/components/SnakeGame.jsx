// frontend/src/components/SnakeGame.jsx
// Game Rắn săn mồi (Snake) - hỗ trợ 2 chế độ: "ai" (Luna tự chơi, có bình luận
// rule-based đa dạng) và "player" (người dùng điều khiển bằng phím mũi tên/WASD).
//
// THIẾT KẾ: toàn bộ logic thuần (pure functions - không phụ thuộc React state/DOM)
// được tách riêng và export ở đầu file để có thể unit test bằng Node trực tiếp,
// KHÔNG cần render component thật. Component ở cuối file chỉ là lớp "vẽ" mỏng bọc
// quanh các hàm thuần này.

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// PURE LOGIC (export để test bằng Node, không phụ thuộc React)
// ============================================================================

export const GRID_SIZE = 20;
export const DIRECTIONS = Object.freeze({
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
});

// Cặp hướng đối lập - dùng để chặn người chơi/AI quay đầu 180° tức thời (chết ngay).
const OPPOSITE = Object.freeze({ UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' });

export function isOppositeDirection(current, next) {
  return OPPOSITE[current] === next;
}

/**
 * Tính vị trí đầu rắn mới dựa trên hướng hiện tại.
 */
export function computeNextHead(head, direction) {
  const { dx, dy } = DIRECTIONS[direction];
  return { x: head.x + dx, y: head.y + dy };
}

/**
 * Kiểm tra va chạm: tường hoặc chính thân rắn.
 * QUAN TRỌNG: ô đuôi (phần tử cuối snake array) KHÔNG tính là va chạm nếu rắn
 * không ăn mồi ở bước này, vì đuôi sẽ di chuyển đi trong cùng tick - nếu không trừ
 * trường hợp này, rắn sẽ báo "tự đâm" sai ngay cả khi đang di chuyển hợp lệ theo
 * đường thân của chính nó (bug rất dễ mắc phải nếu so sánh nguyên mảng snake).
 */
export function checkCollision(newHead, snake, willEat) {
  if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
    return { collided: true, reason: 'wall' };
  }
  const bodyToCheck = willEat ? snake : snake.slice(0, snake.length - 1);
  const hitSelf = bodyToCheck.some((seg) => seg.x === newHead.x && seg.y === newHead.y);
  if (hitSelf) {
    return { collided: true, reason: 'self' };
  }
  return { collided: false, reason: null };
}

/**
 * Sinh vị trí mồi mới, đảm bảo KHÔNG rơi vào ô đang có thân rắn.
 * @param {Array<{x,y}>} snake
 * @param {() => number} [rng] - hàm random tuỳ chỉnh (dùng để test deterministic)
 */
export function spawnFood(snake, rng = Math.random) {
  const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
  const freeCells = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length === 0) return null; // Rắn đã chiếm toàn bộ grid (thắng tuyệt đối)
  const index = Math.floor(rng() * freeCells.length);
  return freeCells[index];
}

/**
 * BFS tìm đường đi ngắn nhất từ đầu rắn tới mồi, coi thân rắn (trừ đuôi) là vật cản.
 * Trả về mảng hướng đi (['UP','RIGHT',...]) hoặc null nếu không có đường.
 */
export function bfsPathToFood(snake, food) {
  const head = snake[0];
  const blocked = new Set(snake.slice(0, snake.length - 1).map((s) => `${s.x},${s.y}`));

  const queue = [{ pos: head, path: [] }];
  const visited = new Set([`${head.x},${head.y}`]);

  while (queue.length > 0) {
    const { pos, path } = queue.shift();
    if (pos.x === food.x && pos.y === food.y) {
      return path;
    }
    for (const [dirName, { dx, dy }] of Object.entries(DIRECTIONS)) {
      const next = { x: pos.x + dx, y: pos.y + dy };
      const key = `${next.x},${next.y}`;
      if (
        next.x < 0 || next.x >= GRID_SIZE ||
        next.y < 0 || next.y >= GRID_SIZE ||
        visited.has(key) ||
        blocked.has(key)
      ) {
        continue;
      }
      visited.add(key);
      queue.push({ pos: next, path: [...path, dirName] });
    }
  }
  return null;
}

/**
 * Flood-fill đếm số ô trống có thể tới được từ 1 vị trí - dùng làm "điểm sinh tồn"
 * khi AI không tìm được đường trực tiếp tới mồi, để chọn hướng đi KHÔNG tự nhốt
 * mình vào ngõ cụt (survival heuristic đơn giản thay vì BFS đầy đủ tới mồi).
 */
export function floodFillCount(startPos, snake, maxCells = GRID_SIZE * GRID_SIZE) {
  const blocked = new Set(snake.slice(0, snake.length - 1).map((s) => `${s.x},${s.y}`));
  if (
    startPos.x < 0 || startPos.x >= GRID_SIZE ||
    startPos.y < 0 || startPos.y >= GRID_SIZE ||
    blocked.has(`${startPos.x},${startPos.y}`)
  ) {
    return 0;
  }

  const visited = new Set([`${startPos.x},${startPos.y}`]);
  const stack = [startPos];
  let count = 0;

  while (stack.length > 0 && count < maxCells) {
    const pos = stack.pop();
    count++;
    for (const { dx, dy } of Object.values(DIRECTIONS)) {
      const next = { x: pos.x + dx, y: pos.y + dy };
      const key = `${next.x},${next.y}`;
      if (
        next.x < 0 || next.x >= GRID_SIZE ||
        next.y < 0 || next.y >= GRID_SIZE ||
        visited.has(key) ||
        blocked.has(key)
      ) {
        continue;
      }
      visited.add(key);
      stack.push(next);
    }
  }
  return count;
}

/**
 * Quyết định hướng đi tiếp theo cho AI:
 * 1. Nếu có đường BFS tới mồi -> đi theo bước đầu tiên của đường đó.
 * 2. Nếu KHÔNG có đường (mồi bị thân rắn chặn) -> chọn hướng hợp lệ (không đâm
 *    tường/thân) có flood-fill lớn nhất (nhiều không gian sinh tồn nhất).
 * 3. Nếu không còn hướng nào hợp lệ -> trả về hướng hiện tại (sắp thua, để game
 *    loop tự phát hiện collision ở bước tiếp theo).
 */
export function pickAiDirection(snake, food, currentDirection) {
  const path = bfsPathToFood(snake, food);
  if (path && path.length > 0) {
    return path[0];
  }

  const head = snake[0];
  let bestDirection = currentDirection;
  let bestScore = -1;

  for (const [dirName] of Object.entries(DIRECTIONS)) {
    if (isOppositeDirection(currentDirection, dirName)) continue; // không quay đầu 180°
    const nextHead = computeNextHead(head, dirName);
    const { collided } = checkCollision(nextHead, snake, false);
    if (collided) continue;

    const space = floodFillCount(nextHead, snake);
    if (space > bestScore) {
      bestScore = space;
      bestDirection = dirName;
    }
  }
  return bestDirection;
}

// Kho câu bình luận AI - đồng bộ tinh thần với backend/skills/snakeSkill.js
// (SNAKE_AI_COMMENTARY), nhưng là bản độc lập vì frontend/backend chạy tách biệt,
// không thể import trực tiếp module CommonJS của backend vào bundle Vite.
export const AI_COMMENTARY = {
  eating: [
    { vi: 'Ăn được rồi nè, ngon quá! 😋', en: 'Got one, yum!' },
    { vi: 'Táo này là của Luna!', en: 'That apple is mine now!' },
    { vi: 'Một điểm nữa cho Luna~', en: 'One more point for Luna~' },
  ],
  closeCall: [
    { vi: 'Suýt nữa thì đụng tường rồi đó!', en: 'Almost hit the wall there!' },
    { vi: 'Né kịp trong gang tấc!', en: 'Dodged that by a hair!' },
  ],
  gameOver: [
    { vi: 'Ối, Luna va vào chính mình rồi 😅', en: 'Oops, ran into myself!' },
    { vi: 'Thua rồi, chơi lại nha!', en: "Game over, let's go again!" },
  ],
  idle: [
    { vi: 'Đang tìm đường đi ngon nhất đây...', en: 'Plotting the best route...' },
    { vi: 'Rắn Luna đang bò tới mục tiêu!', en: 'Slithering toward the target!' },
  ],
};

export function pickRandomCommentary(category, rng = Math.random) {
  const pool = AI_COMMENTARY[category] || AI_COMMENTARY.idle;
  return pool[Math.floor(rng() * pool.length)];
}

function createInitialSnake() {
  const midX = Math.floor(GRID_SIZE / 2);
  const midY = Math.floor(GRID_SIZE / 2);
  return [
    { x: midX, y: midY },
    { x: midX - 1, y: midY },
    { x: midX - 2, y: midY },
  ];
}

const TICK_MS_BY_SPEED = { slow: 220, normal: 140, fast: 80 };

// ============================================================================
// REACT COMPONENT
// ============================================================================

function SnakeGame({ onClose }) {
  const [mode, setMode] = useState('ai'); // 'ai' | 'player'
  const [speed, setSpeed] = useState('normal');
  const [snake, setSnake] = useState(createInitialSnake);
  const [direction, setDirection] = useState('RIGHT');
  const [food, setFood] = useState(() => spawnFood(createInitialSnake()));
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [commentary, setCommentary] = useState(null);

  // Ref giữ hướng "chờ áp dụng" ở tick tiếp theo - tránh trường hợp người chơi bấm
  // 2 phím liên tiếp trong cùng 1 tick gây quay đầu 180° (chết oan).
  const pendingDirectionRef = useRef('RIGHT');
  const directionRef = useRef('RIGHT');

  const resetGame = useCallback(() => {
    const initial = createInitialSnake();
    setSnake(initial);
    setDirection('RIGHT');
    directionRef.current = 'RIGHT';
    pendingDirectionRef.current = 'RIGHT';
    setFood(spawnFood(initial));
    setScore(0);
    setIsGameOver(false);
    setIsPaused(false);
    setCommentary(null);
  }, []);

  // ---- Game loop ----
  useEffect(() => {
    if (isGameOver || isPaused) return undefined;

    const tickMs = TICK_MS_BY_SPEED[speed] || TICK_MS_BY_SPEED.normal;

    const intervalId = setInterval(() => {
      setSnake((prevSnake) => {
        let nextDir = pendingDirectionRef.current;

        if (mode === 'ai') {
          nextDir = pickAiDirection(prevSnake, food, directionRef.current);
        } else if (isOppositeDirection(directionRef.current, nextDir)) {
          // Người chơi cố quay đầu 180° - bỏ qua input đó, giữ hướng cũ.
          nextDir = directionRef.current;
        }

        directionRef.current = nextDir;
        setDirection(nextDir);

        const head = prevSnake[0];
        const newHead = computeNextHead(head, nextDir);
        const willEat = Boolean(food) && newHead.x === food.x && newHead.y === food.y;
        const { collided, reason } = checkCollision(newHead, prevSnake, willEat);

        if (collided) {
          setIsGameOver(true);
          if (mode === 'ai') setCommentary(pickRandomCommentary('gameOver'));
          return prevSnake; // giữ nguyên state cuối cùng để hiển thị vị trí lúc thua
        }

        const newSnake = [newHead, ...prevSnake];
        if (willEat) {
          setScore((s) => s + 1);
          setFood(spawnFood(newSnake));
          if (mode === 'ai') setCommentary(pickRandomCommentary('eating'));
        } else {
          newSnake.pop(); // di chuyển bình thường - bỏ đuôi
          if (mode === 'ai' && Math.random() < 0.08) {
            setCommentary(pickRandomCommentary('idle'));
          }
        }
        return newSnake;
      });
    }, tickMs);

    return () => clearInterval(intervalId);
  }, [mode, speed, food, isGameOver, isPaused]);

  // ---- Bàn phím cho chế độ 'player' ----
  useEffect(() => {
    if (mode !== 'player') return undefined;

    const keyMap = {
      ArrowUp: 'UP', w: 'UP', W: 'UP',
      ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
      ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
      ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
    };

    function handleKeyDown(e) {
      const dir = keyMap[e.key];
      if (!dir) return;
      e.preventDefault();
      pendingDirectionRef.current = dir;
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    resetGame();
  };

  return (
    <div className="snake-game" role="region" aria-label="Game Rắn săn mồi">
      <div className="snake-game-header">
        <h3>🐍 Rắn săn mồi</h3>
        {onClose && (
          <button type="button" className="snake-game-close-btn" onClick={onClose} aria-label="Đóng game">
            ✕
          </button>
        )}
      </div>

      <div className="snake-game-controls">
        <div className="snake-game-mode-toggle">
          <button
            type="button"
            className={mode === 'ai' ? 'active' : ''}
            onClick={() => handleModeChange('ai')}
          >
            Luna tự chơi
          </button>
          <button
            type="button"
            className={mode === 'player' ? 'active' : ''}
            onClick={() => handleModeChange('player')}
          >
            Tôi chơi
          </button>
        </div>
        <select value={speed} onChange={(e) => setSpeed(e.target.value)} className="snake-game-speed-select">
          <option value="slow">Chậm</option>
          <option value="normal">Vừa</option>
          <option value="fast">Nhanh</option>
        </select>
        <button type="button" onClick={() => setIsPaused((p) => !p)} disabled={isGameOver}>
          {isPaused ? '▶️ Tiếp tục' : '⏸️ Tạm dừng'}
        </button>
      </div>

      <div className="snake-game-score">Điểm: {score}</div>

      {commentary && mode === 'ai' && (
        <div className="snake-game-commentary">{commentary.vi} <span className="snake-game-commentary-en">({commentary.en})</span></div>
      )}

      <div
        className="snake-game-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
        }}
      >
        {snake.map((seg, i) => (
          <div
            key={`snake-${i}`}
            className={i === 0 ? 'snake-game-head' : 'snake-game-body'}
            style={{ gridColumnStart: seg.x + 1, gridRowStart: seg.y + 1 }}
          />
        ))}
        {food && (
          <div
            className="snake-game-food"
            style={{ gridColumnStart: food.x + 1, gridRowStart: food.y + 1 }}
          />
        )}
      </div>

      {isGameOver && (
        <div className="snake-game-over">
          <p>Game Over! Điểm cuối: {score}</p>
          <button type="button" onClick={resetGame}>Chơi lại</button>
        </div>
      )}
    </div>
  );
}

export default SnakeGame;
