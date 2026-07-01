import assert from 'node:assert/strict';
import { createInitialBoard, getValidMoves, moveBoard } from '../src/game2048.js';
import { recommendMove } from '../src/agent.js';
import { filecoinChain, supportedNetworks } from '../src/filecoin.js';

const rowMerge = moveBoard([
  [2, 2, 4, 4],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0]
], 'left');

assert.equal(rowMerge.gained, 12);
assert.deepEqual(rowMerge.board[0], [4, 8, 0, 0]);

const initial = createInitialBoard(() => 0);
assert.equal(initial.flat().filter(Boolean).length, 2);
assert.ok(getValidMoves(initial).length > 0);

const recommendation = recommendMove([
  [2, 4, 8, 16],
  [0, 2, 4, 8],
  [0, 0, 2, 4],
  [0, 0, 0, 2]
]);

assert.ok(['up', 'right', 'down', 'left'].includes(recommendation.direction));
assert.equal(recommendation.model, 'local-expectimax-2048-agent-v1');

assert.equal(filecoinChain.id, 314159);
assert.ok(supportedNetworks().some((chain) => chain.id === 314159));

console.log('PoP2048Agent smoke test passed');
