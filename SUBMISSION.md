# PoP2048Agent Submission Notes

## Short description

PoP2048Agent is a Proof-of-Play 2048 game where a local AI agent recommends moves, records the player's choices, and archives the complete session log to Filecoin through the Synapse SDK.

## Main mechanic

Each turn creates an agent recommendation and a player decision record. The archived proof package shows the board before the move, the agent's recommendation, the actual move, whether the player followed the agent, the spawned tile, and the resulting board.

## Filecoin usage

The browser uses the connected wallet and Synapse SDK to upload the proof package:

```js
const synapse = Synapse.create({
  account: address,
  chain: calibration,
  transport: custom(window.ethereum),
  source: 'pop2048-agent',
  withCDN: false
});

const preflight = await synapse.storage.prepare({
  dataSize: BigInt(bytes.byteLength)
});

const result = await synapse.storage.upload(bytes);
```

The returned PieceCID is displayed as the proof-of-play key. Retrieval uses:

```js
const downloaded = await synapse.storage.download({ pieceCid });
```

## AI build log

- Selected a game mechanic that makes Filecoin visible as a proof key, not background storage.
- Implemented a local expectimax-style 2048 agent to keep the gameplay fast and deterministic.
- Added an archive envelope with digest, session metadata, move logs, and Agent recommendation traces.
- Removed the server path and moved Synapse usage into the browser wallet flow, so the app can run from GitHub Pages.

## 60 second demo

1. Start a new game.
2. Show the agent recommendation and confidence.
3. Make one manual move.
4. Press `AI` to follow the agent.
5. Show the session log and digest.
6. Connect wallet.
7. Click `Archive proof` and show the PieceCID.
8. Paste the PieceCID into retrieve and load the stored proof.
