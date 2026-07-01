export const SIZE = 4;
export const DIRECTIONS = ['up', 'right', 'down', 'left'];

export function createEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function flattenBoard(board) {
  return board.flat();
}

export function boardsEqual(a, b) {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (a[row][col] !== b[row][col]) return false;
    }
  }
  return true;
}

export function getEmptyCells(board) {
  const cells = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === 0) cells.push({ row, col });
    }
  }
  return cells;
}

export function addRandomTile(board, random = Math.random) {
  const nextBoard = cloneBoard(board);
  const cells = getEmptyCells(nextBoard);
  if (cells.length === 0) {
    return { board: nextBoard, spawned: null };
  }
  const index = Math.floor(random() * cells.length);
  const cell = cells[index];
  const value = random() < 0.9 ? 2 : 4;
  nextBoard[cell.row][cell.col] = value;
  return {
    board: nextBoard,
    spawned: { row: cell.row, col: cell.col, value }
  };
}

export function createInitialBoard(random = Math.random) {
  const first = addRandomTile(createEmptyBoard(), random);
  return addRandomTile(first.board, random).board;
}

function mergeLine(line) {
  const values = line.filter((value) => value !== 0);
  const merged = [];
  let gained = 0;

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const next = values[index + 1];
    if (current === next) {
      const combined = current * 2;
      merged.push(combined);
      gained += combined;
      index += 1;
    } else {
      merged.push(current);
    }
  }

  while (merged.length < SIZE) merged.push(0);
  return { line: merged, gained };
}

function readLine(board, direction, index) {
  if (direction === 'left') return board[index].slice();
  if (direction === 'right') return board[index].slice().reverse();
  if (direction === 'up') return board.map((row) => row[index]);
  return board.map((row) => row[index]).reverse();
}

function writeLine(board, direction, index, line) {
  if (direction === 'left') {
    board[index] = line;
    return;
  }
  if (direction === 'right') {
    board[index] = line.slice().reverse();
    return;
  }
  if (direction === 'up') {
    for (let row = 0; row < SIZE; row += 1) board[row][index] = line[row];
    return;
  }
  const reversed = line.slice().reverse();
  for (let row = 0; row < SIZE; row += 1) board[row][index] = reversed[row];
}

export function moveBoard(board, direction) {
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`Unknown direction: ${direction}`);
  }

  const nextBoard = createEmptyBoard();
  let gained = 0;

  for (let index = 0; index < SIZE; index += 1) {
    const source = readLine(board, direction, index);
    const result = mergeLine(source);
    gained += result.gained;
    writeLine(nextBoard, direction, index, result.line);
  }

  return {
    board: nextBoard,
    moved: !boardsEqual(board, nextBoard),
    gained
  };
}

export function getValidMoves(board) {
  return DIRECTIONS
    .map((direction) => ({ direction, result: moveBoard(board, direction) }))
    .filter((candidate) => candidate.result.moved);
}

export function isGameOver(board) {
  return getValidMoves(board).length === 0;
}

export function maxTile(board) {
  return Math.max(...flattenBoard(board));
}

