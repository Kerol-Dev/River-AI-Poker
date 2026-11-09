import { useEffect, useRef, useState } from 'react';
import {
  Monitor,
  ScanLine,
  Square,
  Play,
  Pause,
  Plus,
  Trash2,
  PanelTop,
  Upload,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useEquity } from '../hooks';
import { advice } from '../engine/equity';
import { parseCard } from '../engine/cards';
import { PlayingCard } from '../components/Card';
import {
  Frame,
  Region,
  Role,
  ScreenReading,
  parseFrame,
  roles,
  suggestRegions,
} from './recognition';
import { isPreview } from '../devPreview';
export type ScreenAPI = {
  sources: () => Promise<{
    sources: { id: string; name: string; kind: string }[];
    permission: string;
  }>;
  capture: (input: { sourceId: string; regions: Region[] }) => Promise<Frame>;
  reset: () => Promise<void>;
};
export function ScreenStudio({ trials, onHUD }: { trials: number; onHUD: () => void }) {
  const [sources, setSources] = useState<{ id: string; name: string; kind: string }[]>([]),
    [source, setSource] = useState(''),
    [frame, setFrame] = useState<Frame | null>(null),
    [regions, setRegions] = useState<Region[]>([]),
    [role, setRole] = useState<Role>('hole'),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [message, setMessage] = useState(
      'Choose a window to start. Nothing is captured until you select a source.',
    ),
    [opponents, setOpponents] = useState(1),
    [street, setStreet] = useState(0),
    [reading, setReading] = useState<ScreenReading | null>(null),
    [clock, setClock] = useState(Date.now()),
    [confirmed, setConfirmed] = useState(false),
    [review, setReview] = useState(false);
  const [draft, setDraft] = useState<Region | null>(null),
    drag = useRef<{ x: number; y: number; id?: string; region?: Region } | null>(null),
    mapRef = useRef<HTMLDivElement>(null),
    sequence = useRef(0),
    stable = useRef({ key: '', count: 0 }),
    cardStable = useRef({ key: '', count: 0 }),
    active = useRef(true),
    current = useRef({ source, regions, opponents, street });
  current.current = { source, regions, opponents, street };
  useEffect(() => {
    active.current = true;
    const t = setInterval(() => setClock(Date.now()), 500);
    return () => {
      active.current = false;
      sequence.current++;
      clearInterval(t);
    };
  }, []);
  const invalidate = (mappingChanged = true) => {
    sequence.current++;
    stable.current = { key: '', count: 0 };
    cardStable.current = { key: '', count: 0 };
    setReading(null);
    setLive(false);
    if (mappingChanged) {
      setConfirmed(false);
      setMessage('Mapping changed. Confirm it before continuing.');
    } else setMessage('Reading paused. Start reading when ready.');
  };
  const valid =
    !!reading &&
    !reading.issues.length &&
    clock - reading.at < 5000 &&
    confirmed &&
    stable.current.count >= 2;
  const equityValid =
    !!reading &&
    !reading.equityIssues.length &&
    clock - reading.at < 5000 &&
    confirmed &&
    cardStable.current.count >= 2;
  const eq = useEquity(
    equityValid
      ? {
          hole: reading!.hole.map(parseCard),
          board: reading!.board.map(parseCard),
          opponents,
          range: 'random',
          trials,
        }
      : null,
  );
  const line =
    valid && eq.result ? advice(eq.result.equity, reading!.pot!, reading!.call!, opponents) : null;
  const action = line
    ? ['Raise', 'Bet'].includes(line.action)
      ? reading!.call === 0
        ? 'Check'
        : 'Call'
      : line.action
    : null;
  // Screen mode gives a verified call/check/fold comparison. Sizing requires a client adapter.
  useEffect(() => {
    window.river?.publishHUD({
      source: 'browser',
      sourceName: 'Screen reader',
      hole: equityValid ? reading!.hole.map(parseCard) : [],
      board: equityValid ? reading!.board.map(parseCard) : [],
      pot: reading?.pot || 0,
      call: reading?.call || 0,
      range: 'random',
      result: equityValid ? eq.result : undefined,
      status: action || 'Review reading',
      hand: 'Screen',
      complete: false,
      action: action || undefined,
      amount: action === 'Call' ? reading?.call : 0,
      currency: '',
      threshold: line?.threshold,
      updatedAt: equityValid ? reading!.at : Date.now(),
      blocked: valid ? undefined : reading?.issues[0] || 'Confirm the mapping and start reading.',
      explanation: action
        ? `Based on the visible cards and ${opponents} opponent${opponents === 1 ? '' : 's'}. Review the screen before acting.`
        : undefined,
    });
  }, [reading, valid, equityValid, eq.result, action]);
  async function loadSources() {
    setBusy(true);
    try {
      if (!window.river?.screen)
        throw Error('Open the River macOS app to select another app or browser window.');
      const result = await window.river.screen.sources();
      setSources(result.sources);
      setMessage(
        result.permission === 'denied'
          ? 'Allow River in macOS System Settings → Privacy & Security → Screen Recording, then reopen River.'
          : 'Choose a single table window. Screen capture stays on your Mac.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function capture(scan = false) {
    if (!source || busy) return;
    const ticket = sequence.current;
    setBusy(true);
    try {
      const f = await window.river!.screen!.capture({
        sourceId: source,
        regions: scan ? [] : regions,
      });
      if (!active.current || ticket !== sequence.current) return;
      setFrame(f);
      if (scan) {
        setRegions(suggestRegions(f));
        setConfirmed(false);
        setMessage('Suggested regions are a draft. Add anything missing, then confirm your map.');
      } else {
        const r = parseFrame(f, regions, opponents, street);
        stable.current = r.issues.length
          ? { key: '', count: 0 }
          : {
              key: r.signature,
              count: stable.current.key === r.signature ? stable.current.count + 1 : 1,
            };
        cardStable.current = r.equityIssues.length
          ? { key: '', count: 0 }
          : {
              key: r.cardSignature,
              count: cardStable.current.key === r.cardSignature ? cardStable.current.count + 1 : 1,
            };
        setReading(r);
        setMessage(
          r.issues.length
            ? 'Some fields need a clearer view.'
            : stable.current.count < 2
              ? 'Confirming this reading…'
              : 'Reading confirmed.',
        );
      }
    } catch (e) {
      if (active.current && ticket === sequence.current) {
        setReading(null);
        setLive(false);
        stable.current = { key: '', count: 0 };
        setMessage((e as Error).message);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!live || busy) return;
    const t = setTimeout(() => capture(), 900);
    return () => clearTimeout(t);
  }, [live, busy, frame, source, regions, street, opponents]);
  const point = (e: React.PointerEvent) => {
    const box = mapRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
  };
  function pointerDown(e: React.PointerEvent) {
    if (!frame) return;
    invalidate();
    const p = point(e);
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-region]')?.dataset.region;
    const region = regions.find((r) => r.id === id);
    drag.current = { ...p, id, region };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(
      region || {
        id: crypto.randomUUID(),
        role,
        label: roles.find((r) => r.role === role)!.label,
        ...p,
        width: 0,
        height: 0,
      },
    );
  }
  function pointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const p = point(e),
      start = drag.current;
    if (start.region) {
      const r = start.region;
      setDraft({
        ...r,
        x: Math.max(0, Math.min(1 - r.width, r.x + p.x - start.x)),
        y: Math.max(0, Math.min(1 - r.height, r.y + p.y - start.y)),
      });
    } else
      setDraft((d) =>
        d
          ? {
              ...d,
              x: Math.min(start.x, p.x),
              y: Math.min(start.y, p.y),
              width: Math.abs(p.x - start.x),
              height: Math.abs(p.y - start.y),
            }
          : null,
      );
  }
  function pointerUp(e: React.PointerEvent) {
    if (draft && draft.width > 0.008 && draft.height > 0.008)
      setRegions((old) =>
        [
          ...old.filter(
            (r) => r.id !== draft.id && (draft.role === 'player' || r.role !== draft.role),
          ),
          draft,
        ].slice(-20),
      );
    drag.current = null;
    setDraft(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function saveMap() {
    const blob = new Blob([JSON.stringify({ version: 1, game: 'holdem', regions }, null, 2)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'river-table-map.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  async function importMap(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30000) throw Error();
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        data.game !== 'holdem' ||
        !Array.isArray(data.regions) ||
        data.regions.length > 20 ||
        !data.regions.every(
          (r: Region) =>
            roles.some((v) => v.role === r.role) &&
            typeof r.id === 'string' &&
            r.id.length <= 60 &&
            typeof r.label === 'string' &&
            r.label.length < 80 &&
            [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
            r.x >= 0 &&
            r.y >= 0 &&
            r.width > 0.003 &&
            r.height > 0.003 &&
            r.x + r.width <= 1.001 &&
            r.y + r.height <= 1.001,
        )
      )
        throw Error();
      invalidate();
      setRegions(data.regions);
      setMessage('Map imported. Check the regions against this window before confirming.');
    } catch {
      setMessage('That file is not a valid River Hold’em map.');
    }
  }
  return (
    <div className="screen-workspace">
      <div className="screen-intro panel">
        <div>
          <span className="eyebrow">SCREEN READER · BETA</span>
          <h2>Your table, wherever you play.</h2>
          <p>
            Choose a window, map the important areas, and review what River sees. All text
            recognition happens on your Mac.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={loadSources}>
          <Monitor size={16} />
          Choose a window
        </button>
      </div>
      <div className="screen-toolbar panel">
        <select
          aria-label="Window to read"
          value={source}
          onChange={async (e) => {
            invalidate();
            setFrame(null);
            setSource(e.target.value);
            await window.river?.screen?.reset();
          }}
        >
          <option value="">Select a window</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind === 'screen' ? 'Display: ' : ''}
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          disabled={!source || busy}
          onClick={() => {
            invalidate();
            void capture(true);
          }}
        >
          <ScanLine size={16} />
          Find regions
        </button>
        <button className="secondary" disabled={!source || busy} onClick={() => capture()}>
          <Square size={15} />
          Read once
        </button>
        <button
          className={live ? 'stop-auto' : 'primary'}
          disabled={!source || !confirmed}
          onClick={() => {
            if (live) {
              invalidate(false);
            } else setLive(true);
          }}
        >
          {live ? <Pause size={15} /> : <Play size={15} />} {live ? 'Pause' : 'Start reading'}
        </button>
      </div>
      <div className="screen-layout">
        <section className="panel screen-map-panel">
          <div className="screen-map-tools">
            <label>
              Draw a region
              <select
                aria-label="Region type"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <span>Drag to draw. Drag a region to move it.</span>
            <button className="text-button" disabled={!regions.length} onClick={saveMap}>
              Export map
            </button>
            <label className="text-button map-import">
              Import map
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => importMap(e.target.files?.[0])}
              />
            </label>
          </div>
          <div
            ref={mapRef}
            className={`screen-map ${!frame ? 'empty' : ''}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={() => {
              drag.current = null;
              setDraft(null);
            }}
          >
            {frame ? (
              <>
                <img
                  src={frame.image}
                  draggable={false}
                  alt="Selected window. Draw regions around your cards, the board, pot, call amount, and action buttons."
                />
                {[...regions.filter((r) => r.id !== draft?.id), ...(draft ? [draft] : [])].map(
                  (r) => (
                    <div
                      data-region={r.id}
                      key={r.id}
                      className="screen-region"
                      style={{
                        left: r.x * 100 + '%',
                        top: r.y * 100 + '%',
                        width: r.width * 100 + '%',
                        height: r.height * 100 + '%',
                      }}
                    >
                      <span>{r.label}</span>
                    </div>
                  ),
                )}
              </>
            ) : (
              <div className="screen-empty">
                <Monitor size={38} />
                <h3>Bring your table into view</h3>
                <p>Select an app or browser window above, then choose Find regions.</p>
                <small>macOS may ask for Screen Recording permission.</small>
              </div>
            )}
          </div>
          <div className="screen-map-footer">
            {regions.map((r) => (
              <button
                key={r.id}
                className="region-chip"
                onClick={() => {
                  invalidate();
                  setRegions((v) => v.filter((x) => x.id !== r.id));
                }}
              >
                {r.label}
                <Trash2 size={12} />
              </button>
            ))}
            {regions.length > 0 && (
              <button
                className="primary"
                onClick={() => {
                  stable.current = { key: '', count: 0 };
                  cardStable.current = { key: '', count: 0 };
                  setReading(null);
                  setConfirmed(true);
                  setMessage(
                    'Map confirmed. Set the street and opponent count, then start reading.',
                  );
                }}
              >
                <CheckCircle2 size={15} />
                {confirmed ? 'Map confirmed' : 'Confirm mapping'}
              </button>
            )}
          </div>
        </section>
        <aside className="screen-review panel">
          <span className="eyebrow">READING CHECK</span>
          <div className={`screen-status ${valid ? 'ready' : ''}`}>
            {valid ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            <span>{busy ? 'Reading the selected window…' : message}</span>
          </div>
          <div className="screen-settings">
            <label>
              Opponents in hand
              <select
                value={opponents}
                onChange={(e) => {
                  invalidate(false);
                  setOpponents(Number(e.target.value));
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Street
              <select
                value={street}
                onChange={(e) => {
                  invalidate(false);
                  setStreet(Number(e.target.value));
                }}
              >
                <option value="0">Preflop</option>
                <option value="3">Flop</option>
                <option value="4">Turn</option>
                <option value="5">River</option>
              </select>
            </label>
          </div>
          <p className="micro muted">
            Set these for the current hand. A street change pauses guidance until the board matches.
          </p>
          <div className="screen-detected">
            <span className="eyebrow">YOUR CARDS</span>
            <div className="card-row">
              {[0, 1].map((i) => (
                <PlayingCard
                  key={i}
                  small
                  card={reading?.hole[i] ? parseCard(reading.hole[i]) : undefined}
                />
              ))}
            </div>
            <span className="eyebrow">BOARD</span>
            <div className="card-row">
              {Array.from({ length: 5 }, (_, i) => (
                <PlayingCard
                  key={i}
                  small
                  card={reading?.board[i] ? parseCard(reading.board[i]) : undefined}
                />
              ))}
            </div>
            <div className="screen-amounts">
              <div>
                <small>Pot</small>
                <b>{reading?.pot ?? '—'}</b>
              </div>
              <div>
                <small>To call</small>
                <b>{reading?.call ?? '—'}</b>
              </div>
              <div>
                <small>OCR confidence</small>
                <b>{reading ? Math.round(reading.confidence * 100) + '%' : '—'}</b>
              </div>
            </div>
          </div>
          <div className="screen-recommendation">
            <span className="eyebrow">
              {valid ? 'YOUR DECISION' : equityValid ? 'WIN CHANCE' : 'REVIEW NEEDED'}
            </span>
            <strong>
              {action ||
                (equityValid && eq.result
                  ? Math.round(eq.result.win * 100) + '%'
                  : valid
                    ? 'Calculating…'
                    : 'Check the reading')}
            </strong>
            <p>
              {line
                ? `${Math.round(eq.result!.equity * 100)}% estimated equity · ${Math.round(line.threshold * 100)}% needed to call`
                : equityValid
                  ? 'Your cards are readable. Action guidance waits for a clear price and your turn.'
                  : 'River waits for two matching, high-confidence readings.'}
            </p>
          </div>
          {reading?.issues.length ? (
            <ul className="screen-issues">
              {reading.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          ) : null}
          <button className="secondary" onClick={onHUD}>
            <PanelTop size={15} />
            Open floating HUD
          </button>
          <button className="text-button" onClick={() => setReview(!review)}>
            {review ? 'Hide' : 'Show'} recognised text
          </button>
          {review && (
            <div className="ocr-text">
              {frame?.readings.map((r) => (
                <p key={r.id}>
                  <b>{regions.find((m) => m.id === r.id)?.label || 'Window scan'}</b>
                  {r.words.map((w) => w.text).join(' ') || 'No readable text'}
                </p>
              ))}
            </div>
          )}
          <p className="micro muted">
            Screen mode is guidance only. Unfamiliar card designs, hidden windows and side pots may
            need manual review. Confidence is OCR certainty, not a guarantee of correct cards.
          </p>
        </aside>
      </div>
    </div>
  );
}
