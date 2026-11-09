import { decisionCopy } from './reader/insights';
import { ScanLine } from 'lucide-react';
import { ScreenStudio, type ScreenAPI } from './screen/ScreenStudio';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Command,
  ExternalLink,
  FlaskConical,
  History,
  Layers3,
  PanelTop,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Spade,
  TrendingUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, cardText } from './engine/cards';
import { EquityResult, Range } from './engine/equity';
import { act, Action, botAction, Game, legal, newHand } from './engine/game';
import { readSaved, useEquity } from './hooks';
import { Coach, pct } from './components/Coach';
import { PlayingCard } from './components/Card';
import { defaultScenario, HandLab, Scenario } from './components/HandLab';
import { Table } from './components/Table';
import type { ReaderPanel } from './reader/panel';
import { BrowserDecision } from './components/BrowserDecision';
import { Performance, PerformanceData, performanceData } from './components/Performance';
import { money } from './reader/journal';
import { BrowserTable } from './components/BrowserTable';
import { useBrowserReader } from './reader/useBrowserReader';
import { BridgeStatus, ReaderDecision, ReaderSnapshot } from './reader/model';

type Record = {
  id: number;
  at: string;
  hole: Card[];
  villain?: Card[];
  board: Card[];
  pot: number;
  delta: number;
  result: string;
  vpip: boolean;
  pfr: boolean;
  won: boolean;
  log: Game['log'];
};
type HUDData = {
  hole: Card[];
  board: Card[];
  pot: number;
  call: number;
  range: Range;
  result?: EquityResult;
  status: string;
  hand: number | string;
  complete: boolean;
  source?: 'browser' | 'simulator';
  sourceName?: string;
  blocked?: string;
  updatedAt?: number;
  opponents?: number;
  action?: string;
  explanation?: string;
  amount?: number | null;
  amountLabel?: string;
  currency?: string;
  threshold?: number;
  holding?: boolean;
  autoRunning?: boolean;
  performance?: PerformanceData;
};
declare global {
  interface Window {
    river?: {
      screen?: ScreenAPI;
      showHUD: () => Promise<void>;
      hideHUD: () => void;
      publishHUD: (data: HUDData) => void;
      readHUD: () => Promise<HUDData | null>;
      onHUD: (callback: (data: HUDData) => void) => () => void;
      opacity: (value: number) => void;
      publishReaderPanel: (panel: ReaderPanel) => void;
      resetGraph: () => Promise<void>;
      onReaderCommand: (callback: (command: string) => void) => () => void;
      stopAuto: () => Promise<void>;
      readerStatus: () => Promise<BridgeStatus>;
      readTable: () => Promise<ReaderSnapshot | null>;
      onTable: (callback: (data: ReaderSnapshot | null) => void) => () => void;
      publishDecision: (data: ReaderDecision | null) => void;
      copyReaderCode: () => Promise<void>;
      openConnector: () => Promise<void>;
      resetReader: () => Promise<void>;
    };
  }
}
const STORAGE = 'river.hands.v1';
function getHistory(): Record[] {
  const data = readSaved<unknown>(STORAGE, []);
  return Array.isArray(data)
    ? data
        .filter(
          (v) =>
            v &&
            Number.isInteger(v.id) &&
            Number.isFinite(v.delta) &&
            Array.isArray(v.hole) &&
            v.hole.length === 2 &&
            Array.isArray(v.log),
        )
        .slice(-500)
    : [];
}
function downloadHistory(records: Record[]) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: 'river-hands',
          version: 1,
          exportedAt: new Date().toISOString(),
          hands: records.map((r) => ({
            ...r,
            cards: {
              hole: r.hole.map(cardText),
              board: r.board.map(cardText),
              villain: r.villain?.map(cardText),
            },
          })),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `river-session-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function HUD() {
  const [data, setData] = useState<HUDData | null>(null),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const bc = new BroadcastChannel('river-hud');
    bc.onmessage = (e) => setData(e.data);
    window.river?.readHUD().then(setData);
    const dispose = window.river?.onHUD(setData);
    return () => {
      bc.close();
      dispose?.();
    };
  }, []);
  const stale = data?.source === 'browser' && !!data.updatedAt && clock - data.updatedAt > 3500;
  return (
    <div className="hud-shell clean-hud">
      <div className="hud-title">
        <span>
          <Spade size={17} fill="currentColor" /> RIVER{' '}
          <small>
            {data?.source === 'simulator'
              ? 'PRACTICE'
              : data?.sourceName === 'Screen reader'
                ? 'SCREEN'
                : 'LIVE'}
          </small>
        </span>
        <button
          aria-label="Close HUD"
          onClick={() => (window.river ? window.river.hideHUD() : window.close())}
        >
          <X size={18} />
        </button>
      </div>
      <div className="hud-source">
        <span className={`dot ${!stale && data?.action ? 'green' : ''}`} />
        {data?.source === 'simulator'
          ? 'LOCAL SIMULATOR'
          : data?.holding
            ? 'UPDATING TABLE'
            : stale
              ? 'FEED PAUSED'
              : 'LIVE TABLE'}
        <span>#{data?.hand || '—'}</span>
      </div>
      <div className={`hud-cards ${data?.holding ? 'holding' : ''}`}>
        <div>
          <span className="eyebrow">YOUR HAND</span>
          <div className="card-row">
            {Array.from({ length: 2 }, (_, i) => (
              <PlayingCard key={i} card={data?.hole[i]} small />
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">BOARD</span>
          <div className="card-row">
            {Array.from({ length: 5 }, (_, i) => (
              <PlayingCard key={i} card={data?.board[i]} small />
            ))}
          </div>
        </div>
      </div>
      {data?.source === 'simulator' ? (
        <Coach
          result={data.result}
          pending={!data.result}
          pot={data.pot}
          call={data.call}
          range={data.range}
          opponents={1}
          complete={data.complete}
          compact
        />
      ) : (
        <>
          <BrowserDecision
            action={stale ? undefined : data?.action}
            amount={data?.amount}
            amountLabel={data?.amountLabel}
            currency={data?.currency}
            equity={stale ? undefined : data?.result?.equity}
            win={stale ? undefined : data?.result?.win}
            threshold={data?.threshold}
            pending={!stale && data?.holding}
            reason={
              stale
                ? 'Reader disconnected. Actions paused.'
                : data?.explanation || data?.blocked || 'Connect your browser table in River.'
            }
          />
          <Performance
            data={data?.performance}
            compact
            onReset={() => window.river?.resetGraph()}
          />
          {data?.autoRunning && (
            <button className="stop-auto" onClick={() => window.river?.stopAuto()}>
              STOP AUTOMATIC PLAY
            </button>
          )}
        </>
      )}
      {window.river && (
        <label className="hud-opacity">
          Opacity
          <input
            aria-label="HUD opacity"
            type="range"
            min="0.45"
            max="1"
            step="0.05"
            defaultValue="0.98"
            onChange={(e) => window.river?.opacity(Number(e.target.value))}
          />
        </label>
      )}
    </div>
  );
}

function Studio() {
  const [page, setPage] = useState('browser');
  const [hudSource, setHudSource] = useState<'simulator' | 'browser' | 'screen'>('browser');
  const [records, setRecords] = useState<Record[]>(getHistory);
  const [game, setGame] = useState(() => newHand((records.at(-1)?.id || 0) + 1));
  const [auto, setAuto] = useState(false);
  const [raise, setRaise] = useState(6);
  const [range, setRange] = useState<Range>('random');
  const [trials, setTrials] = useState(() => {
    const n = readSaved('river.precision', 6000);
    return [2000, 6000, 25000].includes(n) ? n : 6000;
  });
  const [pace, setPace] = useState(() => {
    const n = readSaved('river.pace', 1100);
    return [350, 1100, 1800].includes(n) ? n : 1100;
  });
  const [settings, setSettings] = useState(false);
  const reader = useBrowserReader(trials);
  const browserSession =
    reader.journal.journal.sessions.find((s) => s.id === reader.journal.journal.active) ||
    (reader.journal.journal.pendingReset ? undefined : reader.journal.journal.sessions.at(-1));
  const perf = useMemo(
    () => (browserSession ? performanceData(browserSession) : undefined),
    [browserSession],
  );
  useEffect(() => {
    try {
      localStorage.setItem('river.precision', JSON.stringify(trials));
      localStorage.setItem('river.pace', JSON.stringify(pace));
    } catch {
      /* The table can still run without saved preferences. */
    }
  }, [trials, pace]);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [toast, setToast] = useState('');
  const [study, setStudy] = useState<{ scenario: Scenario; key: number }>({
    scenario: defaultScenario,
    key: 0,
  });
  const [inspected, setInspected] = useState<Record | null>(null);
  const captured = useRef(new Set<number>());
  const heroEquity = useEquity({
    hole: game.players[0].hole,
    board: game.board,
    opponents: 1,
    range,
    trials,
  });
  const villainEquity = useEquity(
    !game.complete && game.actor === 1
      ? {
          hole: game.players[1].hole,
          board: game.board,
          opponents: 1,
          range: 'random',
          trials: 1200,
        }
      : null,
  );
  const heroCall = game.complete
    ? 0
    : Math.min(
        game.players[0].stack,
        Math.max(0, game.players[1].streetBet - game.players[0].streetBet),
      );
  const total = records.reduce((n, r) => n + r.delta, 0);
  const wins = records.filter((r) => r.won).length;
  const playAction = useCallback((action: Action, target?: number) => {
    try {
      setGame((g) => act(g, action, target));
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Action unavailable.');
    }
  }, []);
  const nextHand = useCallback(
    () =>
      setGame((g) => {
        if (!g.complete) return g;
        const stacks = g.players.map((p) => p.stack);
        return newHand(g.id + 1, stacks.every((s) => s > 0) ? stacks : [200, 200], 1 - g.button);
      }),
    [],
  );
  useEffect(() => {
    if (!game.complete && game.actor === 1 && villainEquity.result) {
      const id = game.id,
        count = game.log.length;
      const decision = botAction(game, villainEquity.result.equity);
      const timer = setTimeout(
        () =>
          setGame((g) =>
            g.id === id && g.log.length === count ? act(g, decision.action, decision.target) : g,
          ),
        pace,
      );
      return () => clearTimeout(timer);
    }
  }, [game, villainEquity.result, pace]);
  useEffect(() => {
    if (!auto || page !== 'simulator') return;
    if (game.complete) {
      if (game.players.some((p) => p.stack === 0)) {
        setAuto(false);
        return;
      }
      const timer = setTimeout(nextHand, pace + 1000);
      return () => clearTimeout(timer);
    }
    if (game.actor === 0 && heroEquity.result) {
      const decision = botAction(game, heroEquity.result.equity);
      const timer = setTimeout(() => playAction(decision.action, decision.target), pace);
      return () => clearTimeout(timer);
    }
  }, [auto, game, heroEquity.result, page, pace, nextHand, playAction]);
  useEffect(() => {
    if (!game.complete || captured.current.has(game.id)) return;
    captured.current.add(game.id);
    const record: Record = {
      id: game.id,
      at: new Date().toISOString(),
      hole: game.players[0].hole,
      villain: game.showdown ? game.players[1].hole : undefined,
      board: game.board,
      pot: game.pot,
      delta: game.players[0].stack - game.startStacks[0],
      result: game.result,
      vpip: game.vpip[0],
      pfr: game.pfr[0],
      won: game.winner === 0,
      log: game.log,
    };
    setRecords((r) => [...r, record].slice(-500));
  }, [game]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(records));
    } catch {
      setToast('Local storage is full. Export your hands to keep a copy.');
    }
  }, [records]);
  useEffect(() => {
    if (hudSource !== 'simulator') return;
    const data: HUDData = {
      source: 'simulator',
      hole: game.players[0].hole,
      board: game.board,
      pot: game.pot,
      call: heroCall,
      range,
      result: heroEquity.result,
      status: game.complete
        ? game.result
        : `${game.street} · ${game.actor === 0 ? 'Your decision' : 'Atlas to act'}`,
      hand: game.id,
      complete: game.complete,
    };
    window.river?.publishHUD(data);
    const bc = new BroadcastChannel('river-hud');
    bc.postMessage(data);
    bc.close();
    try {
      localStorage.setItem('river.hud', JSON.stringify(data));
    } catch {
      /* HUD still works through IPC. */
    }
  }, [game, heroCall, range, heroEquity.result, hudSource]);
  useEffect(() => {
    if (hudSource !== 'browser' || page === 'screen') return;
    const { snapshot, assessment, equity, now } = reader;
    const data: HUDData = {
      source: 'browser',
      sourceName: 'Browser reader',
      action: reader.decision?.action,
      explanation: reader.decision
        ? decisionCopy(reader.decision, reader.snapshot).body
        : undefined,
      hole: reader.display.hole,
      board: reader.display.board,
      holding: reader.display.holding,
      autoRunning: snapshot?.automation?.running,
      amount: reader.decision?.target ?? reader.decision?.amount,
      amountLabel: reader.decision?.target !== undefined ? 'to' : undefined,
      currency: snapshot?.currency,
      threshold: reader.decision?.threshold,
      performance: perf,
      pot: snapshot?.pot || 0,
      call: snapshot?.call || 0,
      opponents: snapshot?.opponents || 1,
      range: 'random',
      result: reader.equityAssessment.valid ? equity.result : undefined,
      blocked: assessment.valid ? undefined : assessment.reason,
      updatedAt: snapshot?.receivedAt || 0,
      status: reader.decision
        ? `${reader.decision.action} · read-only guidance`
        : assessment.reason || 'Calculating',
      hand: reader.display.handId || snapshot?.handId || '—',
      complete: false,
    };
    window.river?.publishHUD(data);
    const bc = new BroadcastChannel('river-hud');
    bc.postMessage(data);
    bc.close();
  }, [
    hudSource,
    reader.snapshot,
    reader.assessment,
    reader.equity.result,
    reader.decision,
    reader.display,
    reader.journal.journal,
  ]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes((e.target as HTMLElement).tagName) ||
        e.metaKey ||
        e.ctrlKey ||
        settings ||
        inspected ||
        page !== 'simulator'
      )
        return;
      const key = e.key.toLowerCase();
      if (key === ' ' && game.complete) {
        e.preventDefault();
        nextHand();
        return;
      }
      if (auto || game.actor !== 0 || game.complete) return;
      const l = legal(game);
      if (key === 'f') playAction('fold');
      if (key === 'c') playAction(l.check ? 'check' : 'call');
      if (key === 'r' && l.canRaise) playAction('raise', Math.max(l.min, Math.min(l.max, raise)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, auto, page, raise, settings, inspected, nextHand, playAction]);
  const openHUD = () => {
    if (window.river)
      window.river.showHUD().catch(() => setToast('The HUD could not open. Please retry.'));
    else {
      const popup = window.open(`${location.pathname}?hud=1`, 'river-hud', 'width=380,height=620');
      if (!popup) setToast('Allow this browser to open the HUD popup.');
      else setToast('Browser HUD opened. The macOS app keeps it above other windows.');
    }
  };
  const navigate = (next: string) => {
    if (next !== 'simulator') setAuto(false);
    if (next === 'browser' || next === 'simulator' || next === 'screen') setHudSource(next);
    setPage(next);
  };
  const studyRecord = (r: Record) => {
    setStudy({ scenario: { hole: r.hole, board: r.board, pot: r.pot, call: 0 }, key: Date.now() });
    setInspected(null);
    navigate('lab');
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('browser');
          }}
        >
          <div className="brand-icon">
            <Spade size={22} fill="currentColor" />
          </div>
          <div>
            river<span>HOLD’EM STUDIO</span>
          </div>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {[
            { id: 'browser', label: 'Browser table', icon: PanelTop },
            { id: 'screen', label: 'Screen reader', icon: ScanLine },
            { id: 'lab', label: 'Hand lab', icon: FlaskConical },
            { id: 'simulator', label: 'Practice table', icon: Layers3 },
            { id: 'history', label: 'Practice history', icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
              <Icon size={18} />
              {label}
              {id === 'browser' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-session">
          <div className="eyebrow">BROWSER SESSION</div>
          <div className="sidebar-profit">{perf ? money(perf.net, perf.currency, true) : '—'}</div>
          <div className="sidebar-session-bottom">
            <span>
              {perf ? `${perf.count} observed intervals` : 'Waiting for first checkpoint'}
            </span>
            <TrendingUp size={13} />
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={18} />
            <div>
              <strong>Private by design</strong>
              <span>All calculations stay local.</span>
            </div>
          </div>
          <button onClick={() => setSettings(true)}>
            <Settings2 size={17} />
            Preferences<kbd>⌘</kbd>
          </button>
          <div className="sidebar-version">
            <span className="dot green" />
            River 1.4.0<span>macOS ready</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <span>
              {page === 'simulator'
                ? 'Practice table'
                : page === 'screen'
                  ? 'Screen reader'
                  : page === 'browser'
                    ? 'Browser table'
                    : page === 'lab'
                      ? 'Hand lab'
                      : 'Session history'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span className="dot green" /> LOCAL ENGINE
            </span>
            <button onClick={openHUD} className="hud-button">
              <PanelTop size={15} />
              Open HUD
              <ExternalLink size={12} />
            </button>
            <div className="profile" title="Private workspace">
              ♠
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'simulator'
                  ? 'LESS GUESSWORK. MORE UNDERSTANDING.'
                  : page === 'screen'
                    ? 'READ ANY VISIBLE TABLE'
                    : page === 'browser'
                      ? 'YOUR CONNECTED TABLE'
                      : page === 'lab'
                        ? 'EXPLORE EVERY POSSIBILITY.'
                        : 'TURN EXPERIENCE INTO INSIGHT.'}
              </div>
              <h1>
                {page === 'simulator'
                  ? 'Practice with purpose.'
                  : page === 'screen'
                    ? 'A new way to see your table.'
                    : page === 'browser'
                      ? 'Your table. In focus.'
                      : page === 'lab'
                        ? 'Look deeper into your hand.'
                        : 'Every hand tells a story.'}
              </h1>
              <p>
                {page === 'simulator'
                  ? 'Play, explore, and understand the numbers behind your next move.'
                  : page === 'screen'
                    ? 'Local screen reading, flexible mapping, and clear confidence checks.'
                    : page === 'browser'
                      ? 'A clearer decision. A steady view. Your session, tracked.'
                      : page === 'lab'
                        ? 'Build a spot. Test a range. See how the decision changes.'
                        : 'Your saved practice hands, decisions, and progress in one place.'}
              </p>
            </div>
            {page === 'simulator' ? (
              <span className="practice-pill">
                <span className="dot green" />
                PLAY MONEY
              </span>
            ) : page === 'history' ? (
              <button
                className="secondary"
                disabled={!records.length}
                onClick={() => downloadHistory(records)}
              >
                <ArrowDownToLine size={15} />
                Export session
              </button>
            ) : (
              <span className="practice-pill">
                {page === 'browser' ? 'LOCAL ANALYSIS' : 'STUDY MODE'}
              </span>
            )}
          </div>
          {page !== 'browser' && page !== 'screen' && (
            <div className="stat-row">
              <Stat
                icon={<TrendingUp size={18} />}
                title="Net result"
                value={`${total >= 0 ? '+' : ''}${total}`}
                suffix="chips"
                detail="Across saved practice hands"
                positive={total >= 0}
              />
              <Stat
                icon={<Layers3 size={18} />}
                title="Hands played"
                value={String(records.length)}
                detail="Up to 500 saved on this device"
              />
              <Stat
                icon={<BarChart3 size={18} />}
                title="Hands won"
                value={records.length ? ((wins / records.length) * 100).toFixed(1) : '—'}
                suffix={records.length ? '%' : ''}
                detail={`${wins} wins · split pots excluded`}
              />
              <Stat
                icon={<Activity size={18} />}
                title="Engine"
                value="Monte Carlo"
                detail={`${trials.toLocaleString()} samples per analysis`}
                engine
              />
            </div>
          )}
          {page === 'simulator' && (
            <div className="workspace-columns">
              <div className="left-column">
                <Table
                  game={game}
                  auto={auto}
                  setAuto={setAuto}
                  raise={raise}
                  setRaise={setRaise}
                  onAct={playAction}
                  next={nextHand}
                  ready={!!heroEquity.result}
                  thinking={villainEquity.pending}
                />
                <section className="panel table-details">
                  <div className="section-label">
                    <span>
                      <SlidersHorizontal size={14} /> TABLE INSIGHTS
                    </span>
                    <span className="tiny-tag">NO HIDDEN-CARD ACCESS</span>
                  </div>
                  <div className="table-insight-grid">
                    <div>
                      <span>Your position</span>
                      <strong>{game.button === 0 ? 'Button / small blind' : 'Big blind'}</strong>
                      <small>
                        {game.button === 0
                          ? 'First preflop, last postflop'
                          : 'Last preflop, first postflop'}
                      </small>
                    </div>
                    <div>
                      <span>Current hand</span>
                      <strong>{heroEquity.result?.made || 'Evaluating…'}</strong>
                      <small>
                        {game.board.length
                          ? `${game.board.length} community cards`
                          : 'Before the flop'}
                      </small>
                    </div>
                    <label>
                      <span>Assumed opponent range</span>
                      <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
                        <option value="random">Any two cards</option>
                        <option value="wide">Wide · top ~60%</option>
                        <option value="balanced">Balanced · top ~35%</option>
                        <option value="tight">Tight · top ~15%</option>
                      </select>
                      <small>Study assumption, not observed</small>
                    </label>
                  </div>
                </section>
                <section className="panel action-log">
                  <div className="section-label">
                    <span>
                      <History size={14} /> HAND ACTIVITY
                    </span>
                    <span className="muted">#{game.id}</span>
                  </div>
                  <div className="log-list">
                    {[...game.log]
                      .reverse()
                      .slice(0, 6)
                      .map((event, i) => (
                        <div key={`${game.id}-${game.log.length - i}`}>
                          <span className="log-street">{event.street}</span>
                          <span>
                            <strong>{event.player}</strong> {event.text}
                          </span>
                          {i === 0 && <span className="latest-badge">LATEST</span>}
                        </div>
                      ))}
                  </div>
                </section>
                <div className="practice-note">
                  <ShieldCheck size={15} />
                  <span>
                    A private practice environment. Atlas uses sampled equity and simple betting
                    rules, without seeing your cards.
                  </span>
                </div>
              </div>
              <Coach
                {...heroEquity}
                complete={game.complete}
                pot={game.pot}
                call={heroCall}
                opponents={1}
                range={range}
              />
            </div>
          )}
          {page === 'screen' && (
            <ScreenStudio
              trials={trials}
              onHUD={() => {
                setHudSource('screen');
                openHUD();
              }}
            />
          )}
          {page === 'browser' && (
            <BrowserTable
              reader={reader}
              onHUD={() => {
                setHudSource('browser');
                openHUD();
              }}
            />
          )}
          {page === 'lab' && <HandLab key={study.key} initial={study.scenario} trials={trials} />}
          {page === 'history' && (
            <>
              <div className="history-overview panel">
                <div>
                  <span className="eyebrow">SAVED SESSION PERFORMANCE</span>
                  <h2>
                    {total >= 0 ? '+' : ''}
                    {total}
                    <small> chips</small>
                  </h2>
                  <p className="muted small-text">
                    Chip change from each completed hand. Fresh tables start at 200 chips.
                  </p>
                </div>
                <div className="history-chart">
                  <MiniChart records={records} />
                </div>
                <div className="history-metrics">
                  <div>
                    <span>VPIP</span>
                    <strong>
                      {records.length
                        ? pct(records.filter((r) => r.vpip).length / records.length)
                        : '—'}
                    </strong>
                    <small>Voluntarily entered pot preflop</small>
                  </div>
                  <div>
                    <span>PFR</span>
                    <strong>
                      {records.length
                        ? pct(records.filter((r) => r.pfr).length / records.length)
                        : '—'}
                    </strong>
                    <small>Raised at least once preflop</small>
                  </div>
                </div>
              </div>
              <section className="panel history-panel">
                <div className="section-label">
                  <span>HAND HISTORY</span>
                  <span className="muted">{records.length} saved hands</span>
                </div>
                {!records.length ? (
                  <div className="empty-state">
                    <History size={32} />
                    <h3>Your story starts at the table.</h3>
                    <p>Complete a practice hand and it will appear here automatically.</p>
                    <button className="primary" onClick={() => navigate('simulator')}>
                      Play your first hand
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="history-table">
                    <div className="history-row history-head">
                      <span>Hand / time</span>
                      <span>Your cards</span>
                      <span>Board</span>
                      <span>Net result</span>
                      <span />
                    </div>
                    {[...records].reverse().map((r) => (
                      <div className="history-row" key={r.id}>
                        <div>
                          <strong>#{String(r.id).padStart(3, '0')}</strong>
                          <small>
                            {new Date(r.at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </div>
                        <div className="card-row">
                          {r.hole.map((c) => (
                            <PlayingCard card={c} small key={c} />
                          ))}
                        </div>
                        <div className="card-row">
                          {r.board.length ? (
                            r.board.map((c) => <PlayingCard card={c} small key={c} />)
                          ) : (
                            <span className="muted small-text">Ended preflop</span>
                          )}
                        </div>
                        <strong className={r.delta >= 0 ? 'positive' : 'negative'}>
                          {r.delta > 0 ? '+' : ''}
                          {r.delta}
                          <small> chips</small>
                        </strong>
                        <button className="text-button" onClick={() => setInspected(r)}>
                          Review
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="main-footer">
            <span>Made for a clearer game.</span>
            <span>Texas Hold’em · Local analysis · Private session history</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="settings-title">Make it your table.</h2>
                <p>Fine-tune your analysis and practice settings.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Close preferences"
                onClick={() => setSettings(false)}
              >
                <X size={19} />
              </button>
            </div>
            <label className="setting-row">
              <div>
                <strong>Analysis precision</strong>
                <p>More samples reduce Monte Carlo noise.</p>
              </div>
              <select value={trials} onChange={(e) => setTrials(Number(e.target.value))}>
                <option value="2000">Quick · 2,000</option>
                <option value="6000">Balanced · 6,000</option>
                <option value="25000">Detailed · 25,000</option>
              </select>
            </label>
            <label className="setting-row">
              <div>
                <strong>Table pace</strong>
                <p>Delay between automatic decisions.</p>
              </div>
              <select value={pace} onChange={(e) => setPace(Number(e.target.value))}>
                <option value="1800">Relaxed</option>
                <option value="1100">Standard</option>
                <option value="350">Fast</option>
              </select>
            </label>
            <div className="setting-row">
              <div>
                <strong>Keyboard shortcuts</strong>
                <p>At the practice table, outside input fields.</p>
              </div>
              <span className="shortcut-list">
                <kbd>F</kbd>Fold <kbd>C</kbd>Check / call <kbd>R</kbd>Raise
              </span>
            </div>
            <div className="settings-about">
              <ShieldCheck size={19} />
              <p>
                River runs entirely on this device. Autoplay controls the built-in fake-money table.
                The HUD can mirror this simulator or the paired browser reader. Browser autoplay is
                started only in the table toolbar and follows the action and spending limits you
                set. Equity assumes the selected range and does not guarantee a winning strategy.
              </p>
            </div>
            <div className="setting-row">
              <div>
                <strong>Clear saved practice</strong>
                <p>Removes this device’s history and starts a fresh table.</p>
              </div>
              <button
                className="danger-button"
                onClick={() => {
                  if (!resetConfirm) {
                    setResetConfirm(true);
                    return;
                  }
                  setAuto(false);
                  captured.current.clear();
                  setRecords([]);
                  setGame(newHand());
                  setResetConfirm(false);
                  setSettings(false);
                  setToast('Practice history cleared. A fresh table is ready.');
                }}
              >
                {resetConfirm ? 'Confirm clear' : 'Clear history'}
              </button>
            </div>
          </section>
        </div>
      )}
      {inspected && (
        <div className="modal-backdrop" onClick={() => setInspected(null)}>
          <section
            className="modal review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="review-title">Hand #{inspected.id}</h2>
                <p>{inspected.result}</p>
              </div>
              <button
                className="icon-button"
                aria-label="Close hand review"
                onClick={() => setInspected(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="review-cards">
              <div>
                <span className="eyebrow">YOUR HAND</span>
                <div className="card-row">
                  {inspected.hole.map((c) => (
                    <PlayingCard key={c} card={c} small />
                  ))}
                </div>
              </div>
              <div>
                <span className="eyebrow">
                  ATLAS {inspected.villain ? 'AT SHOWDOWN' : 'DID NOT SHOW'}
                </span>
                <div className="card-row">
                  {(inspected.villain || [undefined, undefined]).map((c, i) => (
                    <PlayingCard key={i} card={c} hidden={c === undefined} small />
                  ))}
                </div>
              </div>
              <div>
                <span className="eyebrow">BOARD</span>
                <div className="card-row">
                  {inspected.board.map((c) => (
                    <PlayingCard key={c} card={c} small />
                  ))}
                </div>
              </div>
            </div>
            <div className="review-log">
              {inspected.log.map((e, i) => (
                <div key={i}>
                  <span>{e.street}</span>
                  <p>
                    <strong>{e.player}</strong> {e.text}
                  </p>
                </div>
              ))}
            </div>
            <button className="primary" onClick={() => studyRecord(inspected)}>
              <FlaskConical size={15} />
              Study final board in Hand lab
              <ArrowRight size={15} />
            </button>
            <p className="micro muted">
              Loads your cards and final board with zero to call. Opponent cards remain unknown to
              the equity model.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  icon,
  title,
  value,
  suffix,
  detail,
  positive,
  engine,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  suffix?: string;
  detail: string;
  positive?: boolean;
  engine?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{title}</span>
        {icon}
      </div>
      <div
        className={`stat-value ${positive === true ? 'positive' : positive === false ? 'negative' : ''} ${engine ? 'engine-value' : ''}`}
      >
        {engine && <span className="dot green" />}
        {value}
        <span>{suffix}</span>
      </div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
function MiniChart({ records }: { records: Record[] }) {
  let sum = 0;
  const points = [0, ...records.map((r) => (sum += r.delta))];
  const min = Math.min(...points) - 5,
    max = Math.max(...points) + 5;
  const coords = points
    .map(
      (p, i) =>
        `${(i / Math.max(1, points.length - 1)) * 240},${60 - ((p - min) / (max - min)) * 50}`,
    )
    .join(' ');
  return (
    <svg
      viewBox="0 0 240 68"
      className="mini-chart"
      role="img"
      aria-label={
        records.length
          ? `Net chips over ${records.length} completed hands`
          : 'No completed hands yet'
      }
    >
      <path d="M0 62H240" stroke="#3A4C68" strokeDasharray="3 5" />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        points={points.length === 1 ? '0,35 240,35' : coords}
      />
    </svg>
  );
}
export default function App() {
  return new URLSearchParams(location.search).has('hud') ? <HUD /> : <Studio />;
}
