# PoP2048Agent

Proof-of-Play 2048 with a local AI agent and Filecoin archive receipts.

The product mechanic is simple: play 2048, let the agent recommend moves, and archive the full play log as a Filecoin proof package through the Synapse SDK. The PieceCID becomes the shareable proof-of-play key.

## What it demonstrates

- Agent: a local expectimax-style 2048 coach that evaluates legal moves, explains the recommendation, and records whether the player followed it.
- Filecoin primitive: Synapse SDK storage upload and retrieval for proof packages.
- Proof package: session id, board states, agent recommendations, player moves, spawn events, score, final board, and SHA-256 digest.

## Run locally

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:8787`.

## Enable live Filecoin archive

Create `.env` values in the hosting environment:

```sh
SYNAPSE_PRIVATE_KEY=0x...
SYNAPSE_CHAIN=calibration
SYNAPSE_SOURCE=pop2048-agent
```

Then run:

```sh
npm run dev
```

The server keeps the private key outside the browser and exposes:

- `GET /api/status`
- `POST /api/archive`
- `GET /api/retrieve?pieceCid=...`

## Verify

```sh
npm run check
```

The smoke test validates 2048 merge logic, agent recommendation output, the static app route, `/api/status`, and the archive endpoint behavior with or without `SYNAPSE_PRIVATE_KEY`.

## Demo flow

1. Open the board and show the initial agent recommendation.
2. Make a player move and show whether it matched the agent.
3. Use the `AI` control for one agent-selected move.
4. Show the session log and digest.
5. Archive proof, then copy the returned PieceCID.
6. Retrieve the proof by PieceCID.

## Performance notes

- The agent uses a fixed depth-2 search over a 4x4 board and memoizes evaluated board states per turn.
- Archive payloads are capped at 256 KB on the server.
- Rendering updates 16 stable grid cells, so each turn avoids layout churn from rebuilding the full page.

