// frontend/src/components/TicTacToe.jsx
// Game Cờ ca-rô: hỗ trợ 2 chế độ bàn cờ - "classic" (3x3, thắng 3 quân, dùng minimax
// chơi HOÀN HẢO vì không gian trạng thái nhỏ) và "gomoku" (15x15, thắng 5 quân liên
// tiếp, dùng heuristic chấm điểm theo mẫu quân cờ vì minimax đầy đủ bất khả thi ở
// kích thước này).
//
// THIẾT KẾ giống SnakeGame.jsx: toàn bộ logic thuần (không phụ thuộc React) được
// tách và export riêng để test bằng Node, component chỉ là lớp vẽ mỏng bên ngoài.

import React, { useState, useCallback } from 'react';

// ============================================================================
// PURE LOGIC (export để test bằng Node)
// ============================================================================

export const BOARD_CONFIG = {
  classic: { size: 3, winLength: 3 },
  gomoku: { size: 15, winLength: 5 },
};

export function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

/**
 * Kiểm tra có winLength quân liên tiếp cùng dấu (ngang/dọc/chéo) đi qua ô (row, col)
 * không. Chỉ cần quét quanh nước đi mới nhất (không quét toàn bàn) để hiệu quả hơn
 * trên bàn 15x15.
 */
export function checkWinner(board, row, col, winLength) {
  const size = board.length;
  const player = board[row][col];
  if (!player) return false;

  const directions = [
    [0, 1],  // ngang
    [1, 0],  // dọc
    [1, 1],  // chéo xuống-phải
    [1, -1], // chéo xuống-trái
  ];

  for (const [dr, dc] of directions) {
    let count = 1;
    // Đếm về phía dương
    for (let step = 1; step < winLength; step++) {
      const r = row + dr * step;
      const c = col + dc * step;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== player) break;
      count++;
    }
    // Đếm về phía âm
    for (let step = 1; step < winLength; step++) {
      const r = row - dr * step;
      const c = col - dc * step;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== player) break;
      count++;
    }
    if (count >= winLength) return true;
  }
  return false;
}

export function isBoardFull(board) {
  return board.every((row) => row.every((cell) => cell !== null));
}

export function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      if (board[r][c] === null) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

// ---- Minimax hoàn hảo cho bàn "classic" (3x3, winLength=3) ----
// Không gian trạng thái tối đa 9! ~ 362880, quá nhỏ nên minimax đầy đủ (không cắt
// tỉa alpha-beta) vẫn chạy tức thời - ưu tiên ĐÚNG TUYỆT ĐỐI hơn tối ưu tốc độ.
function minimax(board, winLength, isMaximizing, aiPlayer, humanPlayer, depth = 0) {
  const emptyCells = getEmptyCells(board);

  // Kiểm tra người thắng bằng cách quét toàn bàn (bàn 3x3 nhỏ nên chấp nhận được,
  // khác với checkWinner theo nước đi cụ thể dùng cho gomoku).
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      if (board[r][c] && checkWinner(board, r, c, winLength)) {
        if (board[r][c] === aiPlayer) return 10 - depth;
        return depth - 10;
      }
    }
  }
  if (emptyCells.length === 0) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const { row, col } of emptyCells) {
      const next = cloneBoard(board);
      next[row][col] = aiPlayer;
      const score = minimax(next, winLength, false, aiPlayer, humanPlayer, depth + 1);
      best = Math.max(best, score);
    }
    return best;
  }
  let best = Infinity;
  for (const { row, col } of emptyCells) {
    const next = cloneBoard(board);
    next[row][col] = humanPlayer;
    const score = minimax(next, winLength, true, aiPlayer, humanPlayer, depth + 1);
    best = Math.min(best, score);
  }
  return best;
}

export function pickBestMoveClassic(board, aiPlayer, humanPlayer, winLength) {
  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) return null;

  // Nước đi đầu tiên khi bàn trống: đi giữa để giảm không gian tính toán (kết quả
  // toán học vẫn tối ưu như minimax đầy đủ vì tính đối xứng của bàn 3x3).
  if (emptyCells.length === board.length * board.length) {
    const mid = Math.floor(board.length / 2);
    return { row: mid, col: mid };
  }

  let bestScore = -Infinity;
  let bestMove = emptyCells[0];
  for (const { row, col } of emptyCells) {
    const next = cloneBoard(board);
    next[row][col] = aiPlayer;
    const score = minimax(next, winLength, false, aiPlayer, humanPlayer, 0);
    if (score > bestScore) {
      bestScore = score;
      bestMove = { row, col };
    }
  }
  return bestMove;
}

// ---- Heuristic chấm điểm cho bàn "gomoku" (15x15, winLength=5) ----
// Minimax đầy đủ bất khả thi (không gian trạng thái quá lớn). Thay vào đó: với mỗi
// ô trống, chấm điểm dựa trên độ dài chuỗi quân liên tiếp mà nước đi đó tạo ra cho
// AI (tấn công) VÀ chặn được cho đối thủ (phòng thủ), theo từng hướng. Chỉ xét các
// ô lân cận quân đã đi (trong bán kính 2 ô) để giới hạn không gian tìm kiếm.
function countLineScore(board, row, col, player, winLength) {
  const size = board.length;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  let totalScore = 0;

  for (const [dr, dc] of directions) {
    let count = 1;
    let openEnds = 0;

    // phía dương
    let step = 1;
    while (step < winLength) {
      const r = row + dr * step;
      const c = col + dc * step;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] === (player === 'X' ? 'O' : 'X')) break;
      if (board[r][c] === player) { count++; step++; continue; }
      if (board[r][c] === null) openEnds++;
      break;
    }
    // phía âm
    step = 1;
    while (step < winLength) {
      const r = row - dr * step;
      const c = col - dc * step;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] === (player === 'X' ? 'O' : 'X')) break;
      if (board[r][c] === player) { count++; step++; continue; }
      if (board[r][c] === null) openEnds++;
      break;
    }

    // Điểm tăng phi tuyến theo độ dài chuỗi - chuỗi càng dài càng nguy hiểm/lợi thế.
    if (count >= winLength) totalScore += 100000;
    else if (count === winLength - 1 && openEnds > 0) totalScore += 5000 * openEnds;
    else if (count === winLength - 2 && openEnds > 0) totalScore += 500 * openEnds;
    else totalScore += count * count * (openEnds + 1);
  }
  return totalScore;
}

function getCandidateCells(board, radius = 2) {
  const size = board.length;
  const candidates = new Set();
  let hasAnyMove = false;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) {
        hasAnyMove = true;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === null) {
              candidates.add(`${nr},${nc}`);
            }
          }
        }
      }
    }
  }

  if (!hasAnyMove) {
    const mid = Math.floor(size / 2);
    return [{ row: mid, col: mid }];
  }

  return Array.from(candidates).map((key) => {
    const [row, col] = key.split(',').map(Number);
    return { row, col };
  });
}

export function pickBestMoveGomoku(board, aiPlayer, humanPlayer, winLength) {
  const candidates = getCandidateCells(board);
  if (candidates.length === 0) return null;

  let bestScore = -Infinity;
  let bestMove = candidates[0];

  for (const { row, col } of candidates) {
    const attackScore = countLineScore(board, row, col, aiPlayer, winLength);
    const defenseScore = countLineScore(board, row, col, humanPlayer, winLength);
    // Ưu tiên tấn công nhỉnh hơn phòng thủ 1 chút (1.1x) - AI thiên về chủ động
    // ghi điểm thay vì chỉ phòng thủ bị động.
    const totalScore = attackScore * 1.1 + defenseScore;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMove = { row, col };
    }
  }
  return bestMove;
}

export function pickBestMove(board, mode, aiPlayer, humanPlayer) {
  const { winLength } = BOARD_CONFIG[mode];
  if (mode === 'classic') {
    return pickBestMoveClassic(board, aiPlayer, humanPlayer, winLength);
  }
  return pickBestMoveGomoku(board, aiPlayer, humanPlayer, winLength);
}

// ============================================================================
// REACT COMPONENT
// ============================================================================

function TicTacToe({ onClose }) {
  const [mode, setMode] = useState('classic'); // 'classic' | 'gomoku'
  const [board, setBoard] = useState(() => createEmptyBoard(BOARD_CONFIG.classic.size));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winner, setWinner] = useState(null); // 'player' | 'ai' | 'draw' | null
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);

  const HUMAN = 'X';
  const AI = 'O';

  const resetGame = useCallback((newMode = mode) => {
    setMode(newMode);
    setBoard(createEmptyBoard(BOARD_CONFIG[newMode].size));
    setIsPlayerTurn(true);
    setWinner(null);
    setIsAiThinking(false);
    setLastMove(null);
  }, [mode]);

  const makeAiMove = useCallback((currentBoard) => {
    setIsAiThinking(true);
    // setTimeout nhỏ để UI kịp render "đang suy nghĩ" trước khi minimax/heuristic
    // (có thể tốn vài chục ms trên gomoku) chạy đồng bộ chặn main thread.
    setTimeout(() => {
      const move = pickBestMove(currentBoard, mode, AI, HUMAN);
      if (!move) {
        setIsAiThinking(false);
        return;
      }
      const nextBoard = cloneBoard(currentBoard);
      nextBoard[move.row][move.col] = AI;
      setBoard(nextBoard);
      setLastMove(move);
      setIsAiThinking(false);

      const { winLength } = BOARD_CONFIG[mode];
      if (checkWinner(nextBoard, move.row, move.col, winLength)) {
        setWinner('ai');
      } else if (isBoardFull(nextBoard)) {
        setWinner('draw');
      } else {
        setIsPlayerTurn(true);
      }
    }, 50);
  }, [mode]);

  const handleCellClick = (row, col) => {
    if (!isPlayerTurn || winner || isAiThinking || board[row][col] !== null) return;

    const nextBoard = cloneBoard(board);
    nextBoard[row][col] = HUMAN;
    setBoard(nextBoard);
    setLastMove({ row, col });
    setIsPlayerTurn(false);

    const { winLength } = BOARD_CONFIG[mode];
    if (checkWinner(nextBoard, row, col, winLength)) {
      setWinner('player');
      return;
    }
    if (isBoardFull(nextBoard)) {
      setWinner('draw');
      return;
    }
    makeAiMove(nextBoard);
  };

  const handleModeChange = (newMode) => {
    if (newMode !== mode) resetGame(newMode);
  };

  const boardSize = BOARD_CONFIG[mode].size;

  return (
    <div className="tictactoe-game" role="region" aria-label="Game Cờ ca-rô">
      <div className="tictactoe-header">
        <h3>⭕ Cờ ca-rô</h3>
        {onClose && (
          <button type="button" className="tictactoe-close-btn" onClick={onClose} aria-label="Đóng game">✕</button>
        )}
      </div>

      <div className="tictactoe-controls">
        <div className="tictactoe-mode-toggle">
          <button type="button" className={mode === 'classic' ? 'active' : ''} onClick={() => handleModeChange('classic')}>
            3x3 Cổ điển
          </button>
          <button type="button" className={mode === 'gomoku' ? 'active' : ''} onClick={() => handleModeChange('gomoku')}>
            Gomoku 15x15
          </button>
        </div>
        <button type="button" onClick={() => resetGame(mode)}>🔄 Chơi lại</button>
      </div>

      <div className="tictactoe-status">
        {winner === 'player' && '🎉 Bạn thắng rồi!'}
        {winner === 'ai' && '😏 Luna thắng ván này!'}
        {winner === 'draw' && '🤝 Hoà!'}
        {!winner && isAiThinking && 'Luna đang suy nghĩ...'}
        {!winner && !isAiThinking && (isPlayerTurn ? 'Lượt của bạn' : 'Lượt của Luna')}
      </div>

      <div
        className={`tictactoe-board tictactoe-board-${mode}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
          gridTemplateRows: `repeat(${boardSize}, 1fr)`,
        }}
      >
        {board.map((rowArr, r) =>
          rowArr.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={`tictactoe-cell${lastMove && lastMove.row === r && lastMove.col === c ? ' tictactoe-cell-last' : ''}`}
              onClick={() => handleCellClick(r, c)}
              disabled={Boolean(winner) || cell !== null || !isPlayerTurn}
              aria-label={`Ô hàng ${r + 1} cột ${c + 1}${cell ? `, đã đánh dấu ${cell}` : ''}`}
            >
              {cell}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default TicTacToe;
