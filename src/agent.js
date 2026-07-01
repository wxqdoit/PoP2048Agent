import { cloneBoard, DIRECTIONS, getEmptyCells, maxTile, moveBoard, SIZE } from './game2048.js';

const SEARCH_DEPTH = 2;
const SNAKE_WEIGHTS = [
  [65536, 32768, 16384, 8192],
  [512, 1024, 2048, 4096],
  [256, 128, 64, 32],
  [2, 4, 8, 16]
];

function boardKey(board) {
  return board.flat().join(',');
}

function mergePotential(board) {
  let total = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = board[row][col];
      if (!value) continue;
      if (col + 1 < SIZE && board[row][col + 1] === value) total += value;
      if (row + 1 < SIZE && board[row + 1][col] === value) total += value;
    }
  }
  return total;
}

function smoothnessPenalty(board) {
  let penalty = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = board[row][col];
      if (!value) continue;
      if (col + 1 < SIZE && board[row][col + 1]) {
        penalty += Math.abs(Math.log2(value) - Math.log2(board[row][col + 1]));
      }
      if (row + 1 < SIZE && board[row + 1][col]) {
        penalty += Math.abs(Math.log2(value) - Math.log2(board[row + 1][col]));
      }
    }
  }
  return penalty;
}

function snakeScore(board) {
  let score = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      score += board[row][col] * SNAKE_WEIGHTS[row][col];
    }
  }
  return score / 1024;
}

function hasMaxInCorner(board) {
  const currentMax = maxTile(board);
  return (
    board[0][0] === currentMax ||
    board[0][SIZE - 1] === currentMax ||
    board[SIZE - 1][0] === currentMax ||
    board[SIZE - 1][SIZE - 1] === currentMax
  );
}

export function evaluateBoard(board) {
  const emptyCells = getEmptyCells(board).length;
  const currentMax = maxTile(board);
  const cornerBonus = hasMaxInCorner(board) ? currentMax * 9 : 0;
  return (
    emptyCells * 420 +
    currentMax * 2 +
    cornerBonus +
    mergePotential(board) * 120 -
    smoothnessPenalty(board) * 55 +
    snakeScore(board)
  );
}

function bestMoveValue(board, depth, cache) {
  const cacheKey = `${depth}:${boardKey(board)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const values = DIRECTIONS.map((direction) => {
    const move = moveBoard(board, direction);
    if (!move.moved) return Number.NEGATIVE_INFINITY;
    return move.gained * 1.35 + expectedSpawnValue(move.board, depth - 1, cache);
  });

  const value = Math.max(...values);
  cache.set(cacheKey, value);
  return value;
}

function expectedSpawnValue(board, depth, cache) {
  if (depth <= 0) return evaluateBoard(board);

  const cells = getEmptyCells(board);
  if (cells.length === 0) return evaluateBoard(board);

  let total = 0;
  for (const cell of cells) {
    for (const spawn of [{ value: 2, weight: 0.9 }, { value: 4, weight: 0.1 }]) {
      const next = cloneBoard(board);
      next[cell.row][cell.col] = spawn.value;
      total += (spawn.weight / cells.length) * bestMoveValue(next, depth, cache);
    }
  }
  return total;
}

function directionLabel(direction) {
  return {
    up: 'Up',
    right: 'Right',
    down: 'Down',
    left: 'Left'
  }[direction];
}

function buildReasons(board, result) {
  const emptyCells = getEmptyCells(result.board).length;
  const reasons = [];
  if (result.gained > 0) reasons.push(`captures ${result.gained} merge points`);
  if (hasMaxInCorner(result.board)) reasons.push('anchors the largest tile in a corner');
  reasons.push(`keeps ${emptyCells} empty cells open`);
  const nextMerge = mergePotential(result.board);
  if (nextMerge > 0) reasons.push(`sets up ${nextMerge} adjacent merge value`);
  return `${directionLabel(result.direction)} ${reasons.join(', ')}.`;
}

export function recommendMove(board) {
  const startedAt = performance.now();
  const cache = new Map();

  const alternatives = DIRECTIONS.map((direction) => {
    const move = moveBoard(board, direction);
    if (!move.moved) {
      return {
        direction,
        label: directionLabel(direction),
        legal: false,
        score: Number.NEGATIVE_INFINITY,
        gained: 0,
        emptyCells: getEmptyCells(board).length
      };
    }
    const score = move.gained * 1.35 + expectedSpawnValue(move.board, SEARCH_DEPTH - 1, cache);
    return {
      direction,
      label: directionLabel(direction),
      legal: true,
      score,
      gained: move.gained,
      emptyCells: getEmptyCells(move.board).length,
      board: move.board
    };
  }).sort((a, b) => b.score - a.score);

  const best = alternatives.find((candidate) => candidate.legal);
  if (!best) {
    return {
      direction: null,
      label: 'Game over',
      reason: 'No legal moves remain.',
      confidence: 0,
      alternatives: alternatives.map(({ board: _, ...item }) => item),
      model: 'local-expectimax-2048-agent-v1',
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100
    };
  }

  const runnerUp = alternatives.find((candidate) => candidate.legal && candidate.direction !== best.direction);
  const margin = runnerUp ? best.score - runnerUp.score : best.score;
  const confidence = Math.max(51, Math.min(99, Math.round(68 + margin / 160)));

  return {
    direction: best.direction,
    label: best.label,
    reason: buildReasons(board, best),
    confidence,
    alternatives: alternatives.map(({ board: _, ...item }) => ({
      ...item,
      score: Number.isFinite(item.score) ? Math.round(item.score) : null
    })),
    model: 'local-expectimax-2048-agent-v1',
    searchDepth: SEARCH_DEPTH,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100
  };
}

