import React, { useCallback, useEffect, useRef, useState } from 'react';

const GRID_SIZE = 20;
const CELL_SIZE = 18;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const INITIAL_SNAKE = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTAS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function createFood(snake) {
  const occupied = new Set(snake.map(({ x, y }) => `${x}:${y}`));
  const cells = [];
  for (let x = 0; x < GRID_SIZE; x += 1) for (let y = 0; y < GRID_SIZE; y += 1) {
    if (!occupied.has(`${x}:${y}`)) cells.push({ x, y });
  }
  return cells[Math.floor(Math.random() * cells.length)] || null;
}

function SnakeCanvasGame({ onClose }) {
  const canvasRef = useRef(null);
  const snakeRef = useRef(INITIAL_SNAKE);
  const directionRef = useRef('right');
  const pendingDirectionRef = useRef('right');
  const foodRef = useRef(createFood(INITIAL_SNAKE));
  const [score, setScore] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const draw = useCallback(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    context.fillStyle = '#14122A';
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.strokeStyle = 'rgba(155, 138, 230, 0.16)';
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      context.beginPath(); context.moveTo(i * CELL_SIZE, 0); context.lineTo(i * CELL_SIZE, CANVAS_SIZE); context.stroke();
      context.beginPath(); context.moveTo(0, i * CELL_SIZE); context.lineTo(CANVAS_SIZE, i * CELL_SIZE); context.stroke();
    }
    snakeRef.current.forEach((segment, index) => {
      context.fillStyle = index === 0 ? '#FF8B6B' : '#9B8AE6';
      context.fillRect(segment.x * CELL_SIZE + 2, segment.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    });
    if (foodRef.current) {
      context.fillStyle = '#4FCBA0';
      context.beginPath();
      context.arc(foodRef.current.x * CELL_SIZE + CELL_SIZE / 2, foodRef.current.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 3, 0, Math.PI * 2);
      context.fill();
    }
  }, []);

  const resetGame = useCallback(() => {
    snakeRef.current = INITIAL_SNAKE.map((segment) => ({ ...segment }));
    directionRef.current = 'right';
    pendingDirectionRef.current = 'right';
    foodRef.current = createFood(snakeRef.current);
    setScore(0); setIsPaused(false); setIsGameOver(false);
  }, []);

  useEffect(() => { draw(); }, [draw, score, isGameOver]);

  useEffect(() => {
    if (isPaused || isGameOver) return undefined;
    const timer = window.setInterval(() => {
      const requested = pendingDirectionRef.current;
      if (OPPOSITE[directionRef.current] !== requested) directionRef.current = requested;
      const [dx, dy] = DELTAS[directionRef.current];
      const nextHead = { x: snakeRef.current[0].x + dx, y: snakeRef.current[0].y + dy };
      const willEat = nextHead.x === foodRef.current?.x && nextHead.y === foodRef.current?.y;
      const body = willEat ? snakeRef.current : snakeRef.current.slice(0, -1);
      const hitWall = nextHead.x < 0 || nextHead.x >= GRID_SIZE || nextHead.y < 0 || nextHead.y >= GRID_SIZE;
      if (hitWall || body.some(({ x, y }) => x === nextHead.x && y === nextHead.y)) { setIsGameOver(true); return; }
      snakeRef.current = [nextHead, ...snakeRef.current];
      if (willEat) { setScore((value) => value + 1); foodRef.current = createFood(snakeRef.current); } else snakeRef.current.pop();
      draw();
    }, 130);
    return () => window.clearInterval(timer);
  }, [draw, isGameOver, isPaused]);

  useEffect(() => {
    const keys = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    const onKeyDown = (event) => { if (keys[event.key]) { event.preventDefault(); pendingDirectionRef.current = keys[event.key]; } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <section className="snake-canvas-game" aria-label="Trò chơi Rắn săn mồi">
      <header className="snake-canvas-header">
        <div><h2>🐍 Rắn săn mồi</h2><span>Điểm: {score}</span></div>
        <button type="button" className="game-sidebar-close" onClick={onClose} aria-label="Đóng trò chơi">×</button>
      </header>
      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="snake-canvas" />
      <p className="snake-canvas-help">Dùng phím mũi tên hoặc W/A/S/D để điều khiển.</p>
      {isGameOver && <p className="snake-canvas-result">Game over — điểm của bạn: {score}</p>}
      <div className="snake-canvas-actions">
        <button type="button" onClick={() => setIsPaused((value) => !value)} disabled={isGameOver}>{isPaused ? 'Tiếp tục' : 'Tạm dừng'}</button>
        <button type="button" onClick={resetGame}>Chơi lại</button>
      </div>
    </section>
  );
}

export default SnakeCanvasGame;
