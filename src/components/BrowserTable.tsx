import { decisionCopy } from '../reader/insights';
import { isPreview } from '../devPreview';
import { Check, Copy, FolderOpen, PanelTop, Radio, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { BrowserReaderState } from '../reader/useBrowserReader';
import { PlayingCard } from './Card';
import { BrowserDecision } from './BrowserDecision';
import { Opponents } from './Opponents';
import { SessionPanel } from './Performance';
export function BrowserTable({ reader, onHUD }: { reader: BrowserReaderState; onHUD: () => void }) {
  const [setup, setSetup] = useState(false),
    [copied, setCopied] = useState(false),
    [message, setMessage] = useState('');
  const { snapshot, display, decision, assessment, equity, bridge, now } = reader;
  const fresh = !!snapshot && now - snapshot.receivedAt < 3500;
  const automation = snapshot?.automation;
  const insight = decisionCopy(decision, snapshot);
  const cards = (values: number[], count: number) =>
    Array.from({ length: count }, (_, i) => <PlayingCard key={i} card={values[i]} small />);
  return (
    <div className="browser-dashboard">
      {isPreview && (
        <div className="preview-banner">
          LOCAL DESIGN PREVIEW · SAMPLE DATA · NO BROWSER ACTIONS
        </div>
      )}
      <div className="browser-command">
        <div className={`feed-status ${fresh ? 'live' : ''}`}>
          <Radio size={16} />
          <strong>
            {fresh ? 'Reader connected' : bridge?.running ? 'Waiting for reader' : 'Reader offline'}
          </strong>
          <span>
            {fresh ? 'Browser reader · visible table' : 'Open connection settings to pair'}
          </span>
        </div>
        <div>
          <button className="secondary" onClick={() => setSetup(!setup)}>
            <Settings2 size={16} />
            Connection
          </button>
          <button className="primary" onClick={onHUD}>
            <PanelTop size={17} />
            OPEN HUD
          </button>
        </div>
      </div>
      {(setup || !fresh) && (
        <details className="panel connection-drawer" open={setup || undefined}>
          <summary>
            Connect your table{' '}
            <span>{bridge?.running ? 'Local bridge ready' : 'Start River to connect'}</span>
          </summary>
          <div className="connection-content">
            <div>
              <b>1. Load connector</b>
              <p>
                Chrome → Manage extensions → Load unpacked. For updates, reload the extension and
                refresh the poker tab between hands.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  window.river
                    ?.openConnector()
                    .catch(() => setMessage('Could not open connector folder.'))
                }
              >
                <FolderOpen size={15} />
                Connector folder
              </button>
            </div>
            <div>
              <b>2. Pair with River</b>
              <p>Copy the code into River Table Mapper, then choose Pair and Start reader.</p>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await window.river?.copyReaderCode();
                    setCopied(true);
                  } catch {
                    setMessage('Could not copy pairing code.');
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
                {copied ? 'Code copied' : 'Copy pairing code'}
              </button>
            </div>
            <div>
              <b>3. Finish mapping</b>
              <p>
                Use Auto-map or drag the markers. Choose Done mapping and leave Live on. Your
                session starts at the next stable preflop.
              </p>
              <button
                className="text-button"
                onClick={async () => {
                  await window.river?.resetReader();
                  setMessage('Pairing revoked. Copy a new code to reconnect.');
                }}
              >
                Revoke pairing
              </button>
            </div>
          </div>
          {(message || bridge?.error) && (
            <p className="reader-warning">{message || bridge?.error}</p>
          )}
        </details>
      )}
      <div className="browser-live-grid">
        <section className="panel table-overview">
          <div className="section-label">
            <span>CURRENT HAND</span>
            <span className="hand-number">#{display.handId || '—'}</span>
          </div>
          <div className={`stable-cards ${display.holding ? 'holding' : ''}`}>
            <div>
              <span className="eyebrow">YOUR CARDS</span>
              <div className="card-row">{cards(display.hole, 2)}</div>
            </div>
            <div>
              <span className="eyebrow">
                {display.board.length === 0
                  ? 'BOARD'
                  : display.board.length === 3
                    ? 'FLOP'
                    : display.board.length === 4
                      ? 'TURN'
                      : 'RIVER'}
              </span>
              <div className="card-row">{cards(display.board, 5)}</div>
            </div>
          </div>
          <div className="reading-note">
            {display.holding
              ? 'Updating table · last confirmed cards'
              : fresh
                ? 'Visible cards confirmed'
                : 'Waiting for a live table'}
          </div>
          <div className="table-figures">
            <div>
              <span>Total pot</span>
              <strong>
                {fresh && snapshot.pot != null
                  ? `${snapshot.currency}${snapshot.pot.toFixed(2)}`
                  : '—'}
              </strong>
            </div>
            <div>
              <span>To call</span>
              <strong>
                {fresh && snapshot.call != null
                  ? `${snapshot.currency}${snapshot.call.toFixed(2)}`
                  : '—'}
              </strong>
            </div>
            <div>
              <span>Opponents</span>
              <strong>{fresh ? snapshot.opponents : '—'}</strong>
            </div>
          </div>
          <div className="seat-strip">
            {snapshot?.seats.map((s) => (
              <div className={s.hero ? 'hero-seat' : ''} key={s.id}>
                <span>
                  {s.label}
                  {snapshot.dealer === s.id ? ' · D' : ''}
                </span>
                <strong>
                  {fresh && s.stack != null ? `${snapshot.currency}${s.stack.toFixed(2)}` : '—'}
                </strong>
                <small>{s.inHand ? 'In hand' : 'Sitting / folded'}</small>
              </div>
            ))}
          </div>
        </section>
        <BrowserDecision
          action={decision?.action}
          amount={decision?.target ?? decision?.amount}
          amountLabel={decision?.target !== undefined ? 'to' : undefined}
          currency={snapshot?.currency}
          equity={reader.equityAssessment.valid ? equity.result?.equity : undefined}
          win={reader.equityAssessment.valid ? equity.result?.win : undefined}
          tie={reader.equityAssessment.valid ? equity.result?.tie : undefined}
          threshold={decision?.threshold}
          pending={display.holding || (assessment.valid && equity.pending)}
          reason={decision ? insight.body : assessment.reason || equity.error}
        />
      </div>
      <div className="automation-summary panel">
        <div>
          <span className="eyebrow">PLAY MODE</span>
          <h3>{automation?.running ? 'Automatic play is running' : 'Manual play'}</h3>
          <p>
            {automation?.reason ||
              'Automatic play is available in the browser toolbar. Set your limits there, then press START AUTO yourself.'}
          </p>
        </div>
        <div className="automation-facts">
          <strong>
            {automation?.count || 0}
            <span>auto actions this run</span>
          </strong>
          <strong>
            {snapshot?.currency || ''}
            {((automation?.spent || 0) / 100).toFixed(2)}
            <span>submitted spend</span>
          </strong>
          {automation?.running ? (
            <button className="stop-auto" onClick={() => window.river?.stopAuto()}>
              STOP AUTO
            </button>
          ) : (
            <span className="tiny-tag">ESCAPE STOPS AUTO</span>
          )}
        </div>
      </div>
      <details className="panel decision-breakdown">
        <summary>{decision ? insight.title : 'Understanding your next move'}</summary>
        <p>{insight.body}</p>
        {decision && (
          <div className="decision-explained">
            <div>
              <span>Estimated equity</span>
              <strong>{Math.round(decision.equity * 100)}%</strong>
              <small>Your estimated share of the pot against the assumed hands.</small>
            </div>
            <div>
              <span>Needed to call</span>
              <strong>{Math.round(decision.threshold * 100)}%</strong>
              <small>The break-even point at the current call price, before rake.</small>
            </div>
            <div>
              <span>Opponents in hand</span>
              <strong>{snapshot?.opponents}</strong>
              <small>Player observations can refine the assumed starting hands.</small>
            </div>
          </div>
        )}
      </details>
      <Opponents reader={reader} />
      <SessionPanel state={reader.journal} />
      <p className="dashboard-footnote">
        Equity uses unknown or explicitly labelled heuristic opponent ranges. Guidance is a
        statistical estimate, not a GTO solution. Automatic sizing requires the table to confirm the
        exact target. Opponent ranges and bluff choices are transparent heuristics.
      </p>
    </div>
  );
}
