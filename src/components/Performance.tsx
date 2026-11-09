import { useState } from 'react';
import { BrowserSession, buckets, money, netAt, sessionNet } from '../reader/journal';
import { JournalState } from '../reader/useJournal';
export type PerformanceData = {
  currency: string;
  net: number;
  start: number;
  end?: number;
  count: number;
  points: { at: number; net: number }[];
  ten: ReturnType<typeof buckets>;
  hour: ReturnType<typeof buckets>;
};
export function performanceData(s: BrowserSession): PerformanceData {
  const all = s.points.map((p) => ({ at: p.at, net: netAt(s, p) }));
  const stride = Math.max(1, Math.ceil(all.length / 80));
  return {
    currency: s.currency,
    net: sessionNet(s),
    start: s.start,
    end: s.end,
    count: Math.max(0, s.points.length - 1),
    points: all.filter((_, i) => i === 0 || i === all.length - 1 || i % stride === 0),
    ten: buckets(s, 10).slice(-48),
    hour: buckets(s, 60).slice(-48),
  };
}
export function Performance({
  data,
  compact = false,
  onReset,
}: {
  data?: PerformanceData;
  compact?: boolean;
  onReset?: () => void;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [interval, setInterval] = useState(10),
    [view, setView] = useState<'curve' | 'bars'>('curve');
  const rows = data ? (interval === 10 ? data.ten : data.hour) : [];
  const pts = data?.points || [],
    min = Math.min(0, ...pts.map((p) => p.net)),
    max = Math.max(0, ...pts.map((p) => p.net)),
    range = Math.max(100, max - min),
    width = 600,
    height = compact ? 100 : 160;
  const y = (v: number) => height - 16 - ((v - min) / range) * (height - 32),
    start = pts[0]?.at || 0,
    duration = Math.max(1, (pts.at(-1)?.at || 0) - start);
  const coords = pts
    .map((p) => `${12 + ((p.at - start) / duration) * (width - 24)},${y(p.net)}`)
    .join(' ');
  const bound = Math.max(1, ...rows.map((r) => Math.abs(r.delta)));
  const plotted =
    view === 'curve' ? pts : rows.map((r) => ({ at: r.at, net: r.net, delta: r.delta }));
  const selected = cursor === null ? undefined : plotted[Math.min(cursor, plotted.length - 1)];
  const pick = (x: number, box: DOMRect) => {
    if (!plotted.length) return;
    const f = Math.max(0, Math.min(1, (((x - box.left) / box.width) * width - 12) / (width - 24)));
    if (view === 'bars') {
      setCursor(Math.min(plotted.length - 1, Math.floor(f * plotted.length)));
      return;
    }
    const t = start + f * duration;
    let index = 0;
    plotted.forEach((p, i) => {
      if (Math.abs(p.at - t) < Math.abs(plotted[index].at - t)) index = i;
    });
    setCursor(index);
  };
  const cursorX = selected
    ? view === 'curve'
      ? 12 + ((selected.at - start) / duration) * (width - 24)
      : 12 + ((Math.min(cursor!, plotted.length - 1) + 0.5) * (width - 24)) / plotted.length
    : 0;
  return (
    <section className={`performance ${compact ? 'compact' : ''}`}>
      <div className="performance-head">
        <div>
          <span className="eyebrow">SESSION NET · OBSERVED</span>
          <strong className={data && data.net < 0 ? 'negative' : ''}>
            {data ? money(data.net, data.currency, true) : '—'}
          </strong>
        </div>
        <div className="chart-controls">
          <select
            aria-label="Performance interval"
            value={interval}
            onChange={(e) => {
              setInterval(Number(e.target.value));
              setView('bars');
              setCursor(null);
            }}
          >
            <option value="10">10 min</option>
            <option value="60">1 hour</option>
          </select>
          <button
            className={view === 'curve' ? 'selected' : ''}
            onClick={() => {
              setView(view === 'curve' ? 'bars' : 'curve');
              setCursor(null);
            }}
          >
            {view === 'curve' ? 'Net curve' : 'Period P/L'}
          </button>
          {onReset && (
            <button
              onClick={() => {
                setCursor(null);
                onReset();
              }}
            >
              Reset graph
            </button>
          )}
        </div>
      </div>
      <svg
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          data
            ? `Session net ${money(data.net, data.currency, true)}. ${view === 'curve' ? 'Cumulative balance change' : `${interval}-minute profit and loss`}.`
            : 'Session chart awaiting checkpoints'
        }
        className="profit-chart"
        tabIndex={0}
        style={{ touchAction: 'none' }}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX, e.currentTarget.getBoundingClientRect());
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={(e) => {
          if (!e.buttons) setCursor(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setCursor((i) =>
              Math.max(
                0,
                Math.min(plotted.length - 1, (i ?? 0) + (e.key === 'ArrowRight' ? 1 : -1)),
              ),
            );
          }
        }}
      >
        {selected && (
          <line
            x1={cursorX}
            x2={cursorX}
            y1="8"
            y2={height - 8}
            style={{ stroke: 'var(--accent)' }}
            strokeWidth="1"
          />
        )}
        <line
          x1="12"
          x2={width - 12}
          y1={view === 'curve' ? y(0) : height / 2}
          y2={view === 'curve' ? y(0) : height / 2}
          style={{ stroke: 'var(--line-strong)' }}
          strokeDasharray="4 5"
        />
        {view === 'curve' && pts.length > 0 && (
          <>
            <polyline
              points={coords}
              style={{ stroke: data!.net < 0 ? 'var(--loss)' : 'var(--win)' }}
              strokeWidth="3"
              fill="none"
              strokeLinejoin="round"
            />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={12 + ((p.at - start) / duration) * (width - 24)}
                cy={y(p.net)}
                r="3"
                style={{ fill: 'var(--accent)' }}
              >
                <title>
                  {new Date(p.at).toLocaleTimeString()} · {money(p.net, data!.currency, true)}
                </title>
              </circle>
            ))}
          </>
        )}
        {view === 'bars' &&
          rows.map((r, i) => {
            const h = (Math.abs(r.delta) / bound) * (height / 2 - 12),
              w = (width - 24) / Math.max(1, rows.length);
            return (
              <rect
                key={r.at}
                x={12 + i * w + 2}
                y={r.delta >= 0 ? height / 2 - h : height / 2}
                width={Math.max(2, w - 5)}
                height={Math.max(1, h)}
                rx="3"
                style={{ fill: r.delta >= 0 ? 'var(--win)' : 'var(--loss)' }}
              >
                <title>
                  {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {money(r.delta, data!.currency, true)}
                </title>
              </rect>
            );
          })}
        {(!data || pts.length < 2) && (
          <text
            x="300"
            y={height / 2 - 12}
            style={{ fill: 'var(--text-3)' }}
            textAnchor="middle"
            fontSize="13"
          >
            Waiting for two hand checkpoints
          </text>
        )}
      </svg>
      {selected && (
        <div className="chart-tooltip" role="status">
          {new Date(selected.at).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · Net {money(selected.net, data!.currency, true)}
          {view === 'bars' && 'delta' in selected
            ? ` · Period ${money(selected.delta as number, data!.currency, true)}`
            : ''}
        </div>
      )}
      <div className="chart-caption">
        <span>
          {data
            ? new Date(data.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Session starts automatically'}
        </span>
        <span>
          {data
            ? `${data.count} observed intervals${data.end ? ' · ended' : ''}`
            : 'At the next readable preflop'}
        </span>
      </div>
      {!compact && view === 'bars' && rows.length > 0 && (
        <div className="period-table">
          <div>
            <span>Period starting</span>
            <span>P/L</span>
            <span>Session net</span>
          </div>
          {[...rows]
            .reverse()
            .slice(0, 8)
            .map((r) => (
              <div key={r.at}>
                <span>
                  {new Date(r.at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <strong className={r.delta < 0 ? 'negative' : ''}>
                  {money(r.delta, data!.currency, true)}
                </strong>
                <strong>{money(r.net, data!.currency, true)}</strong>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
export function SessionPanel({ state }: { state: JournalState }) {
  const { journal } = state;
  const [selected, setSelected] = useState(''),
    [amount, setAmount] = useState(''),
    [flowKind, setFlowKind] = useState('add'),
    [balance, setBalance] = useState('');
  const session =
    journal.sessions.find((s) => s.id === selected) ||
    journal.sessions.find((s) => s.id === journal.active) ||
    (journal.pendingReset ? undefined : journal.sessions.at(-1));
  const isActive = !!journal.active && session?.id === journal.active;
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ format: 'river-browser-sessions', version: 1, ...journal }, null, 2)],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'river-browser-sessions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="panel session-panel">
      <div className="section-label">
        <span>PERFORMANCE & HISTORY</span>
        <div className="session-tools">
          <select
            aria-label="Saved browser session"
            value={session?.id || ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!session && <option value="">No sessions yet</option>}
            {[...journal.sessions].reverse().map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.start).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {s.currency}
                {s.id === journal.active ? ' · Live' : ''}
              </option>
            ))}
          </select>
          <button className="secondary" disabled={!journal.sessions.length} onClick={exportData}>
            Export
          </button>
        </div>
      </div>
      <Performance
        data={session ? performanceData(session) : undefined}
        onReset={() => {
          setSelected('');
          state.reset();
        }}
      />
      <p className="tracking-note">
        Balances are sampled at stable preflop boundaries, including posted chips. The current hand
        is excluded until the next checkpoint. Record buy-ins and withdrawals below; unrecorded cash
        movements affect the estimate.
      </p>
      <details className="session-accounting">
        <summary>Session controls & cash adjustments</summary>
        <div className="accounting-fields">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(amount);
              if (isActive && n > 0 && Number.isFinite(n)) {
                state.flow(flowKind === 'add' ? n : -n);
                setAmount('');
              }
            }}
          >
            <label>
              Cash movement at the latest checkpoint
              <select
                aria-label="Cash movement type"
                value={flowKind}
                onChange={(e) => setFlowKind(e.target.value)}
              >
                <option value="add">Buy-in / top-up</option>
                <option value="remove">Withdrawal</option>
              </select>
            </label>
            <input
              aria-label="Cash adjustment amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <button className="secondary" disabled={!isActive}>
              Record
            </button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                isActive &&
                balance !== '' &&
                Number.isFinite(Number(balance)) &&
                Number(balance) >= 0
              ) {
                state.end(Number(balance));
                setBalance('');
              }
            }}
          >
            <label>
              Final settled balance
              <input
                aria-label="Final settled balance"
                type="number"
                min="0"
                step="0.01"
                placeholder="After the hand ends"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                required
              />
            </label>
            <button className="secondary" disabled={!isActive}>
              End session
            </button>
          </form>
          {journal.paused && (
            <button className="primary" onClick={state.start}>
              Start next session
            </button>
          )}
        </div>
        <p className="tracking-note">
          Only enter a final balance after all chips have been returned. A new app launch starts a
          separate session. Cash adjustments are saved with this session.
        </p>
        {session && (
          <div className="checkpoint-list">
            {[...session.points]
              .reverse()
              .slice(0, 8)
              .map((p) => (
                <div key={`${p.at}-${p.handId}`}>
                  <span>
                    {p.handId === 'Closing balance' ? p.handId : `Hand #${p.handId}`}
                    {p.gap ? ' · observation gap' : ''}
                  </span>
                  <span>{new Date(p.at).toLocaleTimeString()}</span>
                  <strong>{money(p.balance, session.currency)}</strong>
                </div>
              ))}
          </div>
        )}
      </details>
      {state.error && <p role="alert">{state.error}</p>}
    </section>
  );
}
