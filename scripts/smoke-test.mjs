import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';
import { createInitialBoard, getValidMoves, moveBoard } from '../src/game2048.js';
import { recommendMove } from '../src/agent.js';

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

const server = createAppServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://${address.address}:${address.port}`;

try {
  const statusResponse = await fetch(`${baseUrl}/api/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(typeof status.synapseConfigured, 'boolean');

  const pageResponse = await fetch(`${baseUrl}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /PoP2048Agent/);

  const archiveResponse = await fetch(`${baseUrl}/api/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proof: { schema: 'pop2048-agent-proof-v1', session: { id: 'test' }, moves: [] },
      digest: 'test'
    })
  });
  assert.equal(archiveResponse.status, process.env.SYNAPSE_PRIVATE_KEY ? 200 : 503);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('PoP2048Agent smoke test passed');

