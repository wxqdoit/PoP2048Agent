# PoP2048Agent

Proof-of-Play 2048 with a local AI agent and Filecoin archive receipts.

The product mechanic is simple: play 2048, let the agent recommend moves, and archive the full play log as a Filecoin proof package through the Synapse SDK. The PieceCID becomes the shareable proof-of-play key.

## Live page

- GitHub Pages: https://wxqdoit.github.io/PoP2048Agent/
- The GitHub Pages deployment is the full app. Filecoin archive and retrieval run in the browser through the user's wallet.

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

## Use live Filecoin archive

Use a browser wallet that exposes `window.ethereum` and can switch to Filecoin Calibration.
The app requests the wallet account, creates a Synapse SDK client with `custom(window.ethereum)`, prepares storage payment, uploads the proof package, and displays the returned PieceCID.

## Verify

```sh
npm run check
```

The smoke test validates 2048 merge logic, agent recommendation output, Filecoin Calibration configuration, and the production Vite build.

## Demo flow

1. Open the board and show the initial agent recommendation.
2. Make a player move and show whether it matched the agent.
3. Use the `AI` control for one agent-selected move.
4. Show the session log and digest.
5. Connect wallet.
6. Archive proof, then copy the returned PieceCID.
7. Retrieve the proof by PieceCID.

## Performance notes

- The agent uses a fixed depth-2 search over a 4x4 board and memoizes evaluated board states per turn.
- Archive payloads are capped at 256 KB before the wallet upload begins.
- Rendering updates 16 stable grid cells, so each turn avoids layout churn from rebuilding the full page.
- The production bundle is generated with Vite and served as static files from `docs/`.
