import { ReaderDecision, ReaderSnapshot } from './model';
export function decisionCopy(d: ReaderDecision | null, s: ReaderSnapshot | null) {
  if (!d || !s)
    return {
      title: 'Your next move',
      body: 'Guidance appears when your cards and the current price are clear.',
    };
  const equity = Math.round(d.equity * 100),
    needed = Math.round(d.threshold * 100);
  if (d.preflop) return { title: preflopTitle(d.action, d.preflop.spot), body: d.explanation };
  if (d.intent === 'bluff' || d.intent === 'semi-bluff')
    return {
      title:
        d.intent === 'semi-bluff'
          ? 'A draw with another way to win'
          : 'An occasional bluff opportunity',
      body: 'This player has often folded to bets. This is a mixed strategy suggestion based on observations, not knowledge of their cards.',
    };
  if (d.action === 'Fold')
    return {
      title: 'The price is too high',
      body: `About ${equity}% estimated equity against ${needed}% needed to call. Folding avoids adding more chips at this price.`,
    };
  if (d.action === 'Call')
    return {
      title: s.allInCall ? 'Calling uses your remaining stack' : 'Call clears the model’s price',
      body: `About ${equity}% action-weighted equity against ${needed}% needed to call after accounting for bet pressure and remaining streets.`,
    };
  if (d.action === 'Check')
    return {
      title: s.board.length === 5 ? 'No need to add chips' : 'Take the free card',
      body: 'There is nothing to call. Checking keeps the pot at its current size.',
    };
  return {
    title: 'Consider betting for value',
    body: 'Your hand compares well with the assumed ranges. The suggested size is a starting point, not a solved strategy.',
  };
}

// Preflop decisions come from starting-hand ranges, so their copy explains the spot.
export function preflopTitle(action: string, spot: string) {
  if (action === 'Raise' || action === 'Bet')
    return spot === 'unopened'
      ? 'Raise first in'
      : spot === 'limped'
        ? 'Raise the limpers'
        : spot === 'raised'
          ? 'Re-raise for value'
          : 'Raise again';
  if (action === 'Call') return spot === 'limped' ? 'Limp along cheaply' : 'Call and see the flop';
  if (action === 'Check') return 'Check your option';
  return 'Fold this hand';
}
