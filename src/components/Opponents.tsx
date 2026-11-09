import { BrowserReaderState } from '../reader/useBrowserReader';
import { foldEstimate, rangeFor } from '../reader/opponents';
export function Opponents({ reader }: { reader: BrowserReaderState }) {
  const { book, error } = reader.opponents;
  const names = new Set(reader.snapshot?.seats.filter((p) => !p.hero).map((p) => p.username) || []),
    profiles = Object.values(book.profiles).filter((p) => names.has(p.name));
  return (
    <section className="panel opponent-panel">
      <div className="section-label">
        <span>AT YOUR TABLE</span>
        <span>Patterns from visible play</span>
      </div>
      {!profiles.length ? (
        <p className="tracking-note">
          Profiles appear as named players and their actions are observed. Hidden cards are never
          used.
        </p>
      ) : (
        <div className="opponent-grid">
          {profiles.map((p) => {
            const f = foldEstimate(p),
              aggression = p.actions ? Math.round(((p.bets + p.raises) / p.actions) * 100) : 0;
            return (
              <article key={p.name}>
                <header>
                  <strong>{p.name}</strong>
                  <span>{p.hands} hands observed</span>
                </header>
                <div className="opponent-stats">
                  <div>
                    <b>{p.actions ? aggression + '%' : '—'}</b>
                    <small>Bet / raise actions</small>
                  </div>
                  <div>
                    <b>{f ? Math.round(f.rate * 100) + '%' : '—'}</b>
                    <small>Folded to a bet · {p.faced} observed</small>
                  </div>
                  <div>
                    <b>
                      {
                        {
                          random: 'Learning',
                          tight: 'Selective',
                          balanced: 'Balanced',
                          wide: 'Often involved',
                        }[rangeFor(p)]
                      }
                    </b>
                    <small>Starting-hand style</small>
                  </div>
                </div>
                <p>
                  {p.pricedPre < 30
                    ? `Learning their starting hands: ${p.pricedPre} of 30 observations so far.`
                    : 'Their starting-hand estimate is based on the decisions we could observe. Position and missed hands can affect it.'}
                </p>
                <p>
                  {p.riverBluffCandidates
                    ? `${p.riverBluffCandidates} river bets ended with a revealed high-card hand. They may have been bluffs.`
                    : 'No clear bluff evidence yet. Hidden cards stay unknown.'}
                </p>
              </article>
            );
          })}
        </div>
      )}
      <details className="decision-breakdown">
        <summary>Recent table activity</summary>
        {book.events
          .slice(-10)
          .reverse()
          .map((e, i) => (
            <div className="opponent-event" key={i}>
              <time>{new Date(e.at).toLocaleTimeString()}</time>
              <strong>{e.name}</strong>
              <span>
                {(
                  {
                    fold: 'Folded',
                    check: 'Checked',
                    call: 'Called',
                    raise: 'Raised',
                    bet: 'Bet',
                  } as Record<string, string>
                )[e.action] || e.action}
              </span>
              <small>
                {e.street === 0
                  ? 'Preflop'
                  : e.street === 3
                    ? 'Flop'
                    : e.street === 4
                      ? 'Turn'
                      : 'River'}{' '}
                · #{e.hand}
              </small>
            </div>
          ))}
        <p className="tracking-note">
          These are the actions River saw while connected. Missing hands are not included.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
