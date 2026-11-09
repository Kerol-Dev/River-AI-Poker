import { ArrowUpRight, ChevronDown, CircleHelp, Sparkles, Target } from 'lucide-react';
import { advice, EquityResult, Range, RANGE_PERCENT } from '../engine/equity';
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export function Coach({
  result,
  pending,
  error,
  pot,
  call,
  opponents,
  range,
  compact = false,
  complete = false,
  blocked,
  actionOverride,
  explanationOverride,
}: {
  result?: EquityResult;
  pending: boolean;
  error?: string;
  pot: number;
  call: number;
  opponents: number;
  range: Range;
  compact?: boolean;
  complete?: boolean;
  blocked?: string;
  actionOverride?: string;
  explanationOverride?: string;
}) {
  const a = result ? advice(result.equity, pot, call, opponents) : null;
  return (
    <section className={`coach panel ${compact ? 'compact' : ''}`}>
      <div className="section-label">
        <span>
          <Sparkles size={15} /> DECISION COACH
        </span>
        <span className="tiny-tag">STATISTICAL</span>
      </div>
      <div className="equity-display">
        <div>
          <span className="muted small-text">Estimated equity</span>
          <div className="equity-value">
            {result ? (result.equity * 100).toFixed(1) : '···'}
            <span>%</span>
          </div>
          <span className="micro muted">
            {blocked
              ? 'Reading paused'
              : pending
                ? 'Simulating possible runouts…'
                : result
                  ? `95% sampling bound ±${(result.margin * 100).toFixed(1)} pts`
                  : error || 'Choose your cards to begin'}
          </span>
        </div>
        <div
          className="equity-ring"
          style={{
            background: `conic-gradient(var(--accent) ${(result?.equity || 0) * 360}deg, var(--surface-3) 0deg)`,
          }}
        >
          <span>
            <Target size={24} />
          </span>
        </div>
      </div>
      <div className="outcome-bars">
        <div className="bar-track">
          <i style={{ width: pct(result?.win || 0) }} />
          <i className="tie-bar" style={{ width: pct(result?.tie || 0) }} />
        </div>
        <div className="bar-legend">
          <span>
            <b className="dot green" />
            Win {result ? pct(result.win) : '—'}
          </span>
          <span>
            <b className="dot gold" />
            Tie {result ? pct(result.tie) : '—'}
          </span>
          <span>
            <b className="dot grey" />
            Lose {result ? pct(result.loss) : '—'}
          </span>
        </div>
      </div>
      <div className="recommendation">
        <div className="eyebrow">
          SUGGESTED LINE <ArrowUpRight size={14} />
        </div>
        <div className="recommended-action">
          {blocked
            ? 'Waiting for table'
            : complete
              ? 'Hand complete'
              : actionOverride || a?.action || 'Calculating'}
          {!actionOverride && !blocked && !complete && a && ['Raise', 'Bet'].includes(a.action) && (
            <span>Explore ½ pot</span>
          )}
        </div>
        <p>
          {blocked ||
            explanationOverride ||
            (complete
              ? 'The table result is final. This equity estimate still compares your cards against the assumed range, not the opponent’s revealed cards.'
              : a?.explanation || 'Evaluating your hand against the selected opponent range.')}
        </p>
      </div>
      <div className="math-grid">
        <div>
          <span>Equity needed</span>
          <strong>{a ? pct(a.threshold) : '—'}</strong>
        </div>
        <div>
          <span>
            Call EV <small>¹</small>
          </span>
          <strong className={a && a.callEV < 0 ? 'negative' : 'positive'}>
            {a && call > 0 ? `${a.callEV >= 0 ? '+' : ''}${a.callEV.toFixed(1)}` : '—'}{' '}
            <small>{call > 0 ? 'chips' : ''}</small>
          </strong>
        </div>
      </div>
      {!compact && (
        <>
          <details className="reasoning" open>
            <summary>
              Understand the decision <ChevronDown size={14} />
            </summary>
            <div className="reason-step">
              <span>01</span>
              <div>
                <strong>Read the price</strong>
                <p>
                  {call
                    ? `Call ${call} into ${pot}. You need ${pct(call / (pot + call))} equity to break even if no more chips go in.`
                    : 'There is no bet to call. Checking costs zero additional chips.'}
                </p>
              </div>
            </div>
            <div className="reason-step">
              <span>02</span>
              <div>
                <strong>Test the assumption</strong>
                <p>
                  Against {opponents} opponent{opponents > 1 ? 's' : ''}, using{' '}
                  {range === 'random'
                    ? 'all possible starting hands'
                    : `an approximate top ${RANGE_PERCENT[range]}% starting range`}
                  . A tighter continuing range can change the answer.
                </p>
              </div>
            </div>
            <div className="reason-step">
              <span>03</span>
              <div>
                <strong>Plan the next street</strong>
                <p>
                  Position, future bets, fold equity, and opponent tendencies are not priced into
                  this estimate. A positive call EV is not a guaranteed profitable line.
                </p>
              </div>
            </div>
          </details>
          <div className="model-note">
            <CircleHelp size={14} />
            <span>
              ¹ Showdown model: equity × (pot + call) − call. No rake. Sampling precision does not
              measure range accuracy. Heuristic guidance, not a GTO solution.
            </span>
          </div>
          <div className="calculation-footer">
            <span className="dot green" />
            {result ? result.trials.toLocaleString() : '…'} simulations · runs on your device
          </div>
        </>
      )}
    </section>
  );
}
