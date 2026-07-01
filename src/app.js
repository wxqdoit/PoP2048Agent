import { addRandomTile, cloneBoard, createInitialBoard, flattenBoard, isGameOver, moveBoard } from './game2048.js';
import { recommendMove } from './agent.js';
import {
  archiveProofWithWallet,
  connectFilecoinWallet,
  filecoinChain,
  retrieveProofWithWallet,
  walletAvailable
} from './filecoin.js';

const boardEl = document.querySelector('#board');
const scoreValue = document.querySelector('#scoreValue');
const bestValue = document.querySelector('#bestValue');
const turnValue = document.querySelector('#turnValue');
const turnLog = document.querySelector('#turnLog');
const agentDirection = document.querySelector('#agentDirection');
const agentReason = document.querySelector('#agentReason');
const agentMetrics = document.querySelector('#agentMetrics');
const agentMoveButton = document.querySelector('#agentMoveButton');
const newGameButton = document.querySelector('#newGameButton');
const connectWalletButton = document.querySelector('#connectWalletButton');
const archiveButton = document.querySelector('#archiveButton');
const retrieveButton = document.querySelector('#retrieveButton');
const pieceCidInput = document.querySelector('#pieceCidInput');
const storageMode = document.querySelector('#storageMode');
const storageStatus = document.querySelector('#storageStatus');
const walletAddress = document.querySelector('#walletAddress');
const receipt = document.querySelector('#receipt');
const digestShort = document.querySelector('#digestShort');
const themeToggle = document.querySelector('#themeToggle');

const bestStorageKey = 'pop2048.bestScore';
const themeStorageKey = 'pop2048.theme';

const state = {
  sessionId: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  board: createInitialBoard(),
  score: 0,
  best: Number(localStorage.getItem(bestStorageKey) || 0),
  moves: [],
  recommendation: null,
  gameOver: false,
  wallet: null,
  lastDigest: null
};

function applySavedTheme() {
  const saved = localStorage.getItem(themeStorageKey);
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
}

function setupBoard() {
  boardEl.innerHTML = '';
  for (let index = 0; index < 16; index += 1) {
    const cell = document.querySelector('#cellTemplate').content.firstElementChild.cloneNode(true);
    boardEl.append(cell);
  }
}

function tileClass(value) {
  if (value === 0) return 'empty';
  if (value >= 2048) return 'tile-super';
  return `tile-${value}`;
}

function renderBoard() {
  const values = flattenBoard(state.board);
  [...boardEl.children].forEach((cell, index) => {
    const value = values[index];
    const span = cell.querySelector('span');
    cell.className = `cell ${tileClass(value)}`;
    span.textContent = value || '';
    cell.setAttribute('aria-label', value ? String(value) : 'empty');
  });
}

function renderScores() {
  scoreValue.textContent = String(state.score);
  bestValue.textContent = String(state.best);
  turnValue.textContent = String(state.moves.length);
}

function renderAgent() {
  const recommendation = state.recommendation;
  agentDirection.textContent = recommendation?.label || '-';
  agentReason.textContent = recommendation?.reason || 'No legal moves remain.';
  agentMoveButton.disabled = !recommendation?.direction || state.gameOver;

  agentMetrics.innerHTML = '';
  const metrics = [
    ['Confidence', recommendation ? `${recommendation.confidence}%` : '-'],
    ['Depth', recommendation?.searchDepth || '-'],
    ['Latency', recommendation ? `${recommendation.durationMs}ms` : '-']
  ];
  for (const [label, value] of metrics) {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    agentMetrics.append(item);
  }
}

function renderLog() {
  turnLog.innerHTML = '';
  const entries = state.moves.slice(-8).reverse();
  for (const entry of entries) {
    const item = document.createElement('li');
    item.innerHTML = `
      <span>#${entry.turn} ${entry.playerMove.toUpperCase()}</span>
      <strong>${entry.acceptedRecommendation ? 'matched agent' : 'manual line'}</strong>
    `;
    turnLog.append(item);
  }
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildProofPackage() {
  return {
    schema: 'pop2048-agent-proof-v1',
    app: {
      name: 'PoP2048Agent',
      mechanic: '2048 agent recommendations archived as proof-of-play logs',
      agent: state.recommendation?.model || 'local-expectimax-2048-agent-v1'
    },
    session: {
      id: state.sessionId,
      startedAt: state.startedAt,
      updatedAt: new Date().toISOString(),
      score: state.score,
      best: state.best,
      turns: state.moves.length,
      gameOver: state.gameOver,
      board: state.board
    },
    moves: state.moves
  };
}

async function renderDigest() {
  const proof = buildProofPackage();
  const digest = await sha256(JSON.stringify(proof));
  state.lastDigest = digest;
  digestShort.textContent = digest.slice(0, 10);
}

function renderReceipt(data) {
  receipt.hidden = false;
  const copyText = data.copies?.length ? `${data.copies.length}/${data.requestedCopies}` : '-';
  receipt.innerHTML = `
    <span>PieceCID</span>
    <code>${data.pieceCid}</code>
    <span>SHA-256</span>
    <code>${data.digest}</code>
    <span>Bytes</span>
    <code>${data.bytes}</code>
    <span>Copies</span>
    <code>${copyText}${data.complete ? ' complete' : ' partial'}</code>
  `;
  pieceCidInput.value = data.pieceCid;
}

function renderRetrievedProof(data) {
  receipt.hidden = false;
  receipt.innerHTML = `
    <span>Retrieved</span>
    <code>${data.pieceCid}</code>
    <span>Stored digest</span>
    <code>${data.digest || 'not included'}</code>
    <span>Archived</span>
    <code>${data.archivedAt || 'not included'}</code>
  `;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function setWalletDisconnected(message) {
  state.wallet = null;
  storageMode.textContent = walletAvailable() ? 'Wallet ready' : 'Wallet required';
  storageStatus.textContent = message;
  walletAddress.textContent = 'Not connected';
  connectWalletButton.disabled = !walletAvailable();
  archiveButton.disabled = true;
  retrieveButton.disabled = true;
}

function setWalletConnected(connection) {
  state.wallet = connection;
  storageMode.textContent = 'Wallet connected';
  storageStatus.textContent = `${connection.chain.name} ready for Synapse storage.`;
  walletAddress.textContent = shortAddress(connection.address);
  connectWalletButton.textContent = 'Reconnect wallet';
  connectWalletButton.disabled = false;
  archiveButton.disabled = false;
  retrieveButton.disabled = false;
}

async function connectWallet() {
  connectWalletButton.disabled = true;
  connectWalletButton.textContent = 'Connecting';
  storageStatus.textContent = `Requesting ${filecoinChain.name} wallet connection.`;

  try {
    const connection = await connectFilecoinWallet();
    setWalletConnected(connection);
  } catch (error) {
    setWalletDisconnected(error.message);
  } finally {
    connectWalletButton.textContent = state.wallet ? 'Reconnect wallet' : 'Connect wallet';
    connectWalletButton.disabled = !walletAvailable();
  }
}

async function render() {
  renderBoard();
  renderScores();
  renderAgent();
  renderLog();
  await renderDigest();
}

function refreshAgent() {
  state.gameOver = isGameOver(state.board);
  state.recommendation = recommendMove(state.board);
}

async function applyMove(direction, origin = 'manual') {
  if (state.gameOver) return;
  const before = cloneBoard(state.board);
  const recommendation = state.recommendation;
  const moved = moveBoard(state.board, direction);
  if (!moved.moved) return;

  const spawned = addRandomTile(moved.board);
  state.board = spawned.board;
  state.score += moved.gained;
  state.best = Math.max(state.best, state.score);
  localStorage.setItem(bestStorageKey, String(state.best));

  state.moves.push({
    turn: state.moves.length + 1,
    at: new Date().toISOString(),
    before,
    playerMove: direction,
    origin,
    agentRecommendation: recommendation,
    acceptedRecommendation: recommendation?.direction === direction,
    gained: moved.gained,
    spawned: spawned.spawned,
    after: cloneBoard(state.board)
  });

  refreshAgent();
  await render();
}

async function newGame() {
  state.sessionId = crypto.randomUUID();
  state.startedAt = new Date().toISOString();
  state.board = createInitialBoard();
  state.score = 0;
  state.moves = [];
  state.gameOver = false;
  state.recommendation = null;
  receipt.hidden = true;
  refreshAgent();
  await render();
}

async function archiveProof() {
  if (!state.wallet?.synapse) {
    receipt.hidden = false;
    receipt.innerHTML = '<span>Status</span><code>Connect wallet first.</code>';
    return;
  }

  archiveButton.disabled = true;
  archiveButton.textContent = 'Archiving';
  receipt.hidden = true;
  const proof = buildProofPackage();
  const digest = await sha256(JSON.stringify(proof));

  try {
    const data = await archiveProofWithWallet({
      synapse: state.wallet.synapse,
      proof,
      digest,
      callbacks: {
        onStatus: (message) => {
          storageStatus.textContent = message;
        },
        onUploadProgress: (bytesUploaded, totalBytes) => {
          storageStatus.textContent = `Uploading ${bytesUploaded}/${totalBytes} bytes.`;
        }
      }
    });
    renderReceipt(data);
    storageStatus.textContent = `Archived on ${data.chain}.`;
  } catch (error) {
    receipt.hidden = false;
    receipt.innerHTML = `<span>Status</span><code>${error.message}</code>`;
  } finally {
    archiveButton.disabled = !state.wallet?.synapse;
    archiveButton.textContent = 'Archive proof';
  }
}

async function retrieveProof() {
  const pieceCid = pieceCidInput.value.trim();
  if (!pieceCid) return;
  if (!state.wallet?.synapse) {
    receipt.hidden = false;
    receipt.innerHTML = '<span>Status</span><code>Connect wallet first.</code>';
    return;
  }

  retrieveButton.disabled = true;
  retrieveButton.textContent = 'Retrieving';
  try {
    const data = await retrieveProofWithWallet(state.wallet.synapse, pieceCid);
    renderRetrievedProof(data);
  } catch (error) {
    receipt.hidden = false;
    receipt.innerHTML = `<span>Status</span><code>${error.message}</code>`;
  } finally {
    retrieveButton.disabled = !state.wallet?.synapse;
    retrieveButton.textContent = 'Retrieve proof';
  }
}

async function loadStorageStatus() {
  if (!walletAvailable()) {
    setWalletDisconnected('Install a browser wallet to archive proof on Filecoin.');
    return;
  }

  setWalletDisconnected(`Connect wallet to use ${filecoinChain.name}.`);
}

function bindEvents() {
  document.querySelectorAll('[data-move]').forEach((button) => {
    button.addEventListener('click', () => applyMove(button.dataset.move));
  });
  agentMoveButton.addEventListener('click', () => {
    const direction = state.recommendation?.direction;
    if (direction) applyMove(direction, 'agent');
  });
  newGameButton.addEventListener('click', newGame);
  connectWalletButton.addEventListener('click', connectWallet);
  archiveButton.addEventListener('click', archiveProof);
  retrieveButton.addEventListener('click', retrieveProof);
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(themeStorageKey, next);
  });

  window.addEventListener('keydown', (event) => {
    const keyMap = {
      ArrowUp: 'up',
      ArrowRight: 'right',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      w: 'up',
      d: 'right',
      s: 'down',
      a: 'left'
    };
    const direction = keyMap[event.key];
    if (!direction) return;
    event.preventDefault();
    applyMove(direction);
  });

  if (window.ethereum?.on) {
    window.ethereum.on('accountsChanged', () => {
      setWalletDisconnected('Wallet account changed. Connect wallet again.');
    });
    window.ethereum.on('chainChanged', () => {
      setWalletDisconnected('Wallet network changed. Connect wallet again.');
    });
  }
}

applySavedTheme();
setupBoard();
bindEvents();
refreshAgent();
await loadStorageStatus();
await render();
