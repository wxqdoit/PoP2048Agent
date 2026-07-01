import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Brain, Moon, RotateCcw, Sun, Wallet } from 'lucide-react';
import { addRandomTile, cloneBoard, createInitialBoard, flattenBoard, isGameOver, moveBoard } from './game2048.js';
import { recommendMove } from './agent.js';
import { archiveProofWithWallet, createSynapseFromProvider, filecoinChain, retrieveProofWithWallet } from './filecoin.js';
import { Badge } from './components/ui/badge.jsx';
import { Button } from './components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card.jsx';
import { Input } from './components/ui/input.jsx';
import { cn } from './lib/utils.js';

const bestStorageKey = 'pop2048.bestScore';
const themeStorageKey = 'pop2048.theme';
const reownConfigured = Boolean(import.meta.env.VITE_REOWN_PROJECT_ID);
const ReownWalletPanel = lazy(() => import('./components/ReownWalletPanel.jsx'));

const initialGame = () => ({
  sessionId: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  board: createInitialBoard(),
  score: 0,
  moves: [],
  gameOver: false,
  recommendation: null
});

function sha256(text) {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', data).then((buffer) =>
    [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  );
}

function buildProofPackage(game, bestScore) {
  return {
    schema: 'pop2048-agent-proof-v1',
    app: {
      name: 'PoP2048Agent',
      mechanic: '2048 agent recommendations archived as proof-of-play logs',
      agent: game.recommendation?.model || 'local-expectimax-2048-agent-v1'
    },
    session: {
      id: game.sessionId,
      startedAt: game.startedAt,
      updatedAt: new Date().toISOString(),
      score: game.score,
      best: bestScore,
      turns: game.moves.length,
      gameOver: game.gameOver,
      board: game.board
    },
    moves: game.moves
  };
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(themeStorageKey) || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  return [theme, setTheme];
}

function tileClasses(value) {
  if (!value) return 'bg-white/10 text-transparent dark:bg-white/10';
  const common = 'shadow-sm';
  const map = {
    2: 'bg-[#f4efe3] text-slate-950',
    4: 'bg-[#e5f1d6] text-slate-950',
    8: 'bg-[#f5b971] text-white',
    16: 'bg-[#eb8a57] text-white',
    32: 'bg-[#d95f43] text-white',
    64: 'bg-[#bf3d35] text-white',
    128: 'bg-[#f0b429] text-slate-950',
    256: 'bg-[#19a974] text-white',
    512: 'bg-[#2364aa] text-white',
    1024: 'bg-[#6046a6] text-white'
  };
  return cn(common, map[value] || 'bg-slate-950 text-emerald-300 dark:bg-emerald-400 dark:text-slate-950');
}

function ScoreTile({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3">
      <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-2xl leading-none text-foreground">{value}</strong>
    </div>
  );
}

function GameBoard({ board }) {
  return (
    <div className="mx-auto aspect-square w-full max-w-[620px] rounded-lg border border-white/15 bg-[#25443b] p-2.5 sm:p-3.5">
      <div className="grid size-full grid-cols-4 gap-2 sm:gap-3">
        {flattenBoard(board).map((value, index) => (
          <div
            key={`${index}-${value}`}
            role="gridcell"
            aria-label={value ? String(value) : 'empty'}
            className={cn(
              'grid aspect-square min-w-0 place-items-center rounded-md text-[clamp(1.25rem,6vw,3.2rem)] font-black leading-none transition-transform',
              value >= 1024 && 'text-[clamp(0.9rem,4vw,2.4rem)]',
              tileClasses(value)
            )}
          >
            <span className="max-w-full overflow-wrap-anywhere">{value || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MovePad({ onMove, agentMove, disabled }) {
  const moves = [
    [null, 'up', null],
    ['left', 'agent', 'right'],
    [null, 'down', null]
  ];
  const icons = {
    up: <ArrowUp className="size-5" />,
    right: <ArrowRight className="size-5" />,
    down: <ArrowDown className="size-5" />,
    left: <ArrowLeft className="size-5" />,
    agent: <Brain className="size-5" />
  };

  return (
    <div className="mx-auto mt-4 grid w-max grid-cols-3 gap-2">
      {moves.flat().map((move, index) =>
        move ? (
          <Button
            key={move}
            type="button"
            size="icon"
            variant={move === 'agent' ? 'default' : 'outline'}
            disabled={disabled || (move === 'agent' && !agentMove)}
            aria-label={move === 'agent' ? 'Use agent move' : `Move ${move}`}
            title={move === 'agent' ? 'Use agent move' : `Move ${move}`}
            onClick={() => onMove(move === 'agent' ? agentMove : move, move)}
          >
            {icons[move]}
          </Button>
        ) : (
          <span key={`empty-${index}`} className="size-11" />
        )
      )}
    </div>
  );
}

function AgentPanel({ recommendation }) {
  const metrics = [
    ['Confidence', recommendation ? `${recommendation.confidence}%` : '-'],
    ['Depth', recommendation?.searchDepth || '-'],
    ['Latency', recommendation ? `${recommendation.durationMs}ms` : '-']
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Agent</p>
            <CardTitle>{recommendation?.label || '-'}</CardTitle>
          </div>
          <Badge variant={recommendation?.direction ? 'success' : 'secondary'}>{recommendation?.direction ? 'Ready' : 'Done'}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{recommendation?.reason || 'No legal moves remain.'}</CardDescription>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-md bg-secondary p-2">
              <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
              <strong className="mt-1 block text-sm">{value}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WalletUnavailablePanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Filecoin</p>
            <CardTitle>Reown Project ID required</CardTitle>
          </div>
          <Badge variant="warning">Config</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <CardDescription>Set `VITE_REOWN_PROJECT_ID` from Reown Dashboard, then rebuild the GitHub Pages bundle.</CardDescription>
        <Button type="button" className="w-full" disabled>
          <Wallet className="size-4" />
          Connect wallet
        </Button>
      </CardContent>
    </Card>
  );
}

function WalletLoadingPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Filecoin</p>
            <CardTitle>Loading wallet</CardTitle>
          </div>
          <Badge variant="secondary">Reown</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>Initializing Reown AppKit.</CardDescription>
      </CardContent>
    </Card>
  );
}

function FilecoinPanel({ wallet, proof, digest, onReceipt }) {
  const [pieceCid, setPieceCid] = useState('');
  const [status, setStatus] = useState('Ready to archive after wallet connection.');
  const [busy, setBusy] = useState(false);
  const [synapse, setSynapse] = useState(null);

  useEffect(() => {
    setSynapse(null);
  }, [wallet.address, wallet.provider]);

  const ensureSynapse = useCallback(async () => {
    if (synapse) return synapse;
    const client = await createSynapseFromProvider({ provider: wallet.provider, address: wallet.address });
    setSynapse(client);
    return client;
  }, [synapse, wallet.address, wallet.provider]);

  const archiveProof = async () => {
    if (!wallet.connected) {
      onReceipt({ title: 'Status', lines: [['Wallet', 'Connect wallet first.']] });
      return;
    }

    setBusy(true);
    setStatus('Preparing Synapse client.');
    try {
      const client = await ensureSynapse();
      const result = await archiveProofWithWallet({
        synapse: client,
        proof,
        digest,
        callbacks: {
          onStatus: setStatus,
          onUploadProgress: (uploaded, total) => setStatus(`Uploading ${uploaded}/${total} bytes.`)
        }
      });
      setPieceCid(result.pieceCid);
      setStatus(`Archived on ${result.chain}.`);
      onReceipt({
        title: 'PieceCID',
        lines: [
          ['PieceCID', result.pieceCid],
          ['SHA-256', result.digest],
          ['Bytes', String(result.bytes)],
          ['Copies', `${result.copies.length}/${result.requestedCopies}${result.complete ? ' complete' : ' partial'}`]
        ]
      });
    } catch (error) {
      setStatus(error.message);
      onReceipt({ title: 'Archive status', lines: [['Status', error.message]] });
    } finally {
      setBusy(false);
    }
  };

  const retrieveProof = async () => {
    if (!wallet.connected) {
      onReceipt({ title: 'Status', lines: [['Wallet', 'Connect wallet first.']] });
      return;
    }
    if (!pieceCid.trim()) return;

    setBusy(true);
    setStatus('Retrieving proof.');
    try {
      const client = await ensureSynapse();
      const result = await retrieveProofWithWallet(client, pieceCid.trim());
      setStatus('Proof retrieved.');
      onReceipt({
        title: 'Retrieved',
        lines: [
          ['PieceCID', result.pieceCid],
          ['Digest', result.digest || 'not included'],
          ['Archived', result.archivedAt || 'not included']
        ]
      });
    } catch (error) {
      setStatus(error.message);
      onReceipt({ title: 'Retrieve status', lines: [['Status', error.message]] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="eyebrow">Proof</p>
        <CardTitle>Archive</CardTitle>
        <CardDescription>{status}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" className="w-full" disabled={!wallet.connected || busy} onClick={archiveProof}>
          Archive proof
        </Button>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="pieceCid">
            PieceCID
          </label>
          <Input id="pieceCid" value={pieceCid} onChange={(event) => setPieceCid(event.target.value)} spellCheck={false} />
        </div>
        <Button type="button" variant="outline" className="w-full" disabled={!wallet.connected || busy || !pieceCid.trim()} onClick={retrieveProof}>
          Retrieve proof
        </Button>
      </CardContent>
    </Card>
  );
}

function ReceiptPanel({ receipt, digest }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Session log</p>
            <CardTitle>{digest.slice(0, 10) || '-'}</CardTitle>
          </div>
          <Badge variant="outline">SHA-256</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {receipt ? (
          <div className="space-y-2">
            {receipt.lines.map(([label, value]) => (
              <div key={label} className="space-y-1">
                <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
                <code className="block max-w-full overflow-auto rounded-md bg-secondary p-2 text-xs text-foreground">{value}</code>
              </div>
            ))}
          </div>
        ) : (
          <CardDescription>Archive or retrieve a proof to show the receipt.</CardDescription>
        )}
      </CardContent>
    </Card>
  );
}

function TurnLog({ moves }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="eyebrow">Turns</p>
        <CardTitle>Latest moves</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="max-h-56 space-y-2 overflow-auto pl-5">
          {moves.slice(-8).reverse().map((move) => (
            <li key={move.turn} className="border-b border-border pb-2">
              <span className="block text-xs font-semibold text-muted-foreground">#{move.turn} {move.playerMove.toUpperCase()}</span>
              <strong className="text-sm text-primary">{move.acceptedRecommendation ? 'matched agent' : 'manual line'}</strong>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [game, setGame] = useState(() => {
    const created = initialGame();
    return { ...created, recommendation: recommendMove(created.board) };
  });
  const [best, setBest] = useState(() => Number(localStorage.getItem(bestStorageKey) || 0));
  const [digest, setDigest] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [wallet, setWallet] = useState({ connected: false, address: '', provider: null, chainId: undefined });

  const proof = useMemo(() => buildProofPackage(game, best), [best, game]);

  useEffect(() => {
    sha256(JSON.stringify(proof)).then(setDigest);
  }, [proof]);

  const resetGame = () => {
    const created = initialGame();
    setReceipt(null);
    setGame({ ...created, recommendation: recommendMove(created.board) });
  };

  const applyMove = useCallback((direction, origin = 'manual') => {
    if (!direction || game.gameOver) return;
    const before = cloneBoard(game.board);
    const recommendation = game.recommendation;
    const moved = moveBoard(game.board, direction);
    if (!moved.moved) return;

    const spawned = addRandomTile(moved.board);
    const nextScore = game.score + moved.gained;
    const nextBest = Math.max(best, nextScore);
    const nextMoves = [
      ...game.moves,
      {
        turn: game.moves.length + 1,
        at: new Date().toISOString(),
        before,
        playerMove: direction,
        origin,
        agentRecommendation: recommendation,
        acceptedRecommendation: recommendation?.direction === direction,
        gained: moved.gained,
        spawned: spawned.spawned,
        after: cloneBoard(spawned.board)
      }
    ];
    const nextGameOver = isGameOver(spawned.board);
    const nextRecommendation = recommendMove(spawned.board);

    localStorage.setItem(bestStorageKey, String(nextBest));
    setBest(nextBest);
    setGame({
      ...game,
      board: spawned.board,
      score: nextScore,
      moves: nextMoves,
      gameOver: nextGameOver,
      recommendation: nextRecommendation
    });
  }, [best, game]);

  useEffect(() => {
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
    const handler = (event) => {
      const direction = keyMap[event.key];
      if (!direction) return;
      event.preventDefault();
      applyMove(direction);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyMove]);

  return (
    <main className="mx-auto min-h-screen w-[min(1180px,calc(100%_-_24px))] py-5 text-foreground sm:py-7">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Proof-of-Play</p>
          <h1 className="mt-1 text-[clamp(2rem,7vw,4.2rem)] font-black leading-none tracking-normal">PoP2048Agent</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Toggle color theme"
            title="Toggle color theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
          <Button type="button" variant="secondary" onClick={resetGame}>
            <RotateCcw className="size-4" />
            New game
          </Button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.72fr)]">
        <Card className="p-3 sm:p-5">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <ScoreTile label="Score" value={game.score} />
            <ScoreTile label="Best" value={best} />
            <ScoreTile label="Turns" value={game.moves.length} />
          </div>
          <GameBoard board={game.board} />
          <MovePad onMove={applyMove} agentMove={game.recommendation?.direction} disabled={game.gameOver} />
        </Card>

        <aside className="grid gap-3">
          <AgentPanel recommendation={game.recommendation} />
          {reownConfigured ? (
            <Suspense fallback={<WalletLoadingPanel />}>
              <ReownWalletPanel onWalletChange={setWallet} />
            </Suspense>
          ) : (
            <WalletUnavailablePanel />
          )}
          <FilecoinPanel wallet={wallet} proof={proof} digest={digest} onReceipt={setReceipt} />
          <ReceiptPanel receipt={receipt} digest={digest} />
          <TurnLog moves={game.moves} />
        </aside>
      </section>
    </main>
  );
}
