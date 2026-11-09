import { pct } from './Coach';
export function BrowserDecision({
  action,
  amount,
  amountLabel,
  currency,
  equity,
  win,
  tie,
  threshold,
  reason,
  pending = false,
}: {
  action?: string;
  amount?: number | null;
  amountLabel?: string;
  currency?: string;
  equity?: number;
  win?: number;
  tie?: number;
  threshold?: number;
  reason?: string;
  pending?: boolean;
}) {
  return (
    <section className={`decision-focus ${action ? 'ready' : ''}`} aria-live="polite">
      <div className="decision-label">
        <span>
          {action ? 'SUGGESTED ACTION' : win !== undefined ? 'WIN CHANCE' : 'TABLE STATUS'}
        </span>
        <span>{action ? 'READY' : pending ? 'UPDATING' : 'STANDBY'}</span>
      </div>
      <div className="decision-word">
        {action || (win !== undefined ? pct(win) : pending ? 'Updating' : 'Waiting')}
        {action && amount != null && (
          <span>
            {amountLabel ? amountLabel + ' ' : ''}
            {currency}
            {amount.toFixed(2)}
          </span>
        )}
      </div>
      <p title={reason}>{reason || 'Connect the reader to see your next decision.'}</p>
      {equity !== undefined && (
        <div className="decision-metrics">
          <div title="Chance of winning outright against the assumed range">
            <span>Win outright</span>
            <strong>{win !== undefined ? pct(win) : '—'}</strong>
          </div>
          <div title="Chance of sharing the best hand">
            <span>Tie</span>
            <strong>{tie !== undefined ? pct(tie) : '—'}</strong>
          </div>
          <div>
            <span title="Includes your share of split pots">Pot share</span>
            <strong>{pct(equity)}</strong>
          </div>
          <div>
            <span>Needed to call</span>
            <strong>{threshold !== undefined ? pct(threshold) : '—'}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
