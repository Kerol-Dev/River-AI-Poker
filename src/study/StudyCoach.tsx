import type { EquityInput, EquityResult } from './equity';
import { reviewHand } from './review';
import { pct } from '../components/Coach';
export function StudyCoach({
  input,
  result,
  pending,
  error,
  pot,
  call,
  reserve,
  onReserve,
}: {
  input: EquityInput;
  result?: EquityResult;
  pending: boolean;
  error?: string;
  pot: number;
  call: number;
  reserve?: number;
  onReserve: (value: number | undefined) => void;
}) {
  const review = result ? reviewHand(input, result, pot, call, reserve) : null;
  const analysis = result?.analysis;
  return (
    <section
      className="coach panel study-coach"
      aria-label="Offline hand analysis"
      aria-busy={pending}
    >
      <div className="section-label">
        <span>HAND REVIEW</span>
        <span className="tiny-tag">OFFLINE STUDY</span>
      </div>
      <div className="equity-display">
        <div>
          <span className="muted small-text">Estimated pot share</span>
          <div className="equity-value">
            {result ? (100 * result.equity).toFixed(1) : '···'}
            <span>%</span>
          </div>
          <p className="micro muted">
            {error ||
              (pending
                ? 'Comparing range assumptions…'
                : result?.exact
                  ? 'Exact combinations, for each assumed range'
                  : 'Sampled runouts, stable for identical inputs')}
          </p>
        </div>
      </div>
      <div className="study-outcomes" aria-label="Showdown outcomes">
        {(
          [
            ['Win outright', result?.win],
            ['Tie', result?.tie],
            ['Lose', result?.loss],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value === undefined ? '—' : pct(value)}</strong>
          </div>
        ))}
      </div>
      <p className="micro muted">Pot share includes split pots. A tie is not an outright win.</p>
      <div className="recommendation" aria-live="polite">
        <div className="eyebrow">STUDY COMPARISON</div>
        <div className="recommended-action">
          {error ? 'Review inputs' : review?.action || 'Calculating'}
        </div>
        <p>{review?.explanation || error || 'Evaluating the selected scenario locally.'}</p>
        {review?.boardOnly && (
          <p>Your best hand plays the board. Your hole cards do not improve it.</p>
        )}
        {review?.backdoorsOnly && (
          <p>
            {input.board.length === 3
              ? 'High card with backdoor possibilities only. A runner-runner draw is not a four-card draw.'
              : 'High card with no one-card flush or straight draw.'}
          </p>
        )}
        {review?.breakEvenTie !== null && review?.breakEvenTie !== undefined && (
          <p>
            With no outright wins, a heads-up call needs more than {pct(review.breakEvenTie)} ties
            before rake.
          </p>
        )}
      </div>
      <div className="math-grid">
        <div>
          <span>Needed to call</span>
          <strong>{review ? pct(review.threshold) : '—'}</strong>
        </div>
        <div>
          <span>After uncertainty reserve</span>
          <strong>{review ? pct(review.decisionFloor) : '—'}</strong>
        </div>
      </div>
      <div className="study-scenarios">
        <h3>How much does the assumption matter?</h3>
        {(
          [
            [
              'Starting range',
              analysis?.baseline.equity,
              'Equal weights within your selected starting range.',
            ],
            [
              'Action-weighted',
              result?.equity,
              'Hands weighted by current strength and the action you selected.',
            ],
            [
              'Tighter range',
              analysis?.cautious.equity,
              'A stress test with more weight on stronger hands.',
            ],
            [
              'Continuing range',
              analysis?.continuation.equity,
              'A stronger response assumption, not a recommendation to raise.',
            ],
          ] as const
        ).map(([label, value, help]) => (
          <div className="study-scenario" key={label} title={help}>
            <span>{label}</span>
            <div>
              <i style={{ width: pct(value ?? 0) }} />
            </div>
            <strong>{value === undefined ? '—' : pct(value)}</strong>
          </div>
        ))}
      </div>
      <details className="reasoning">
        <summary>Price, assumptions & limits</summary>
        <p className="small-text">
          Pot {pot.toFixed(2)} + call {call.toFixed(2)} = {(pot + call).toFixed(2)} chips. This
          model assumes the whole pot is eligible and does not model side pots.
        </p>
        <div className="study-reserve">
          <label htmlFor="study-reserve">
            Policy reserve <span className="muted">percentage points</span>
          </label>
          <input
            id="study-reserve"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={reserve ?? (review ? +(review.reserve * 100).toFixed(1) : '')}
            onChange={(e) =>
              onReserve(
                e.target.value === ''
                  ? undefined
                  : Math.max(0, Math.min(100, Number(e.target.value))),
              )
            }
          />
          <button className="subtle-button" onClick={() => onReserve(undefined)}>
            Use default
          </button>
        </div>
        <p className="micro muted">
          The reserve is a chosen caution margin for range error and future costs, not an estimated
          probability, rake calculation or solver output. Changing it changes the comparison.
        </p>
        <p className="small-text">
          {result?.exact
            ? 'All compatible heads-up river hands are enumerated.'
            : `Sampling allowance: ${result ? pct(result.margin) : '—'}. It covers sampling error, not incorrect assumptions about opponents.`}
        </p>
        <p className="small-text">
          Conservative call comparison: {review ? review.conservativeEV.toFixed(2) : '—'} chips.
          This uses the lower of the action-weighted and tighter estimates, subtracts sampling
          allowance and reserve, then applies pot share × (pot + call) − call.
        </p>
        <p className="small-text">
          The ranges are transparent heuristics. They do not reconstruct a full betting history,
          position, opponent intent or future actions. More trials do not fix a poor range
          assumption.
        </p>
      </details>
      <p className="model-note">
        Study estimates, not a solved strategy or a prediction of profit. This review does not
        publish actions to the browser reader.
      </p>
    </section>
  );
}
