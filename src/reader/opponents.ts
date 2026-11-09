import { assertCards, evaluate, parseCard } from '../engine/cards';
import { Range } from '../engine/equity';
import { ReaderSnapshot } from './model';
export type OpponentProfile = {
  name: string;
  hands: number;
  actions: number;
  checks: number;
  calls: number;
  bets: number;
  raises: number;
  folds: number;
  pricedPre: number;
  enteredPre: number;
  faced: number;
  foldedFacing: number;
  showdowns: number;
  riverBluffCandidates: number;
  updated: number;
};
export type ObservedAction = {
  at: number;
  hand: string;
  name: string;
  action: string;
  street: number;
  amount: number | null;
};
export type OpponentBook = { profiles: Record<string, OpponentProfile>; events: ObservedAction[] };
export type ObservationState = {
  hand: string;
  previous: ReaderSnapshot | null;
  seen: Set<string>;
  dedup: Set<string>;
  riverAggressors: Set<string>;
  shown: Set<string>;
};
export const emptyBook = (): OpponentBook => ({ profiles: Object.create(null), events: [] });
export const emptyObservation = (): ObservationState => ({
  hand: '',
  previous: null,
  seen: new Set(),
  dedup: new Set(),
  riverAggressors: new Set(),
  shown: new Set(),
});
const freshProfile = (name: string, at: number): OpponentProfile => ({
  name,
  hands: 0,
  actions: 0,
  checks: 0,
  calls: 0,
  bets: 0,
  raises: 0,
  folds: 0,
  pricedPre: 0,
  enteredPre: 0,
  faced: 0,
  foldedFacing: 0,
  showdowns: 0,
  riverBluffCandidates: 0,
  updated: at,
});
export function observeOpponents(
  book: OpponentBook,
  state: ObservationState,
  s: ReaderSnapshot,
): OpponentBook {
  if (!s.handId || s.errors.length || ![0, 3, 4, 5].includes(s.board.length)) return book;
  if (state.hand !== s.handId) {
    Object.assign(state, emptyObservation(), { hand: s.handId });
  }
  let changed = false;
  const profiles = Object.assign(Object.create(null), book.profiles) as Record<
      string,
      OpponentProfile
    >,
    events = [...book.events];
  const touch = (name: string) => {
    changed = true;
    return (profiles[name] = {
      ...(profiles[name] || freshProfile(name, s.receivedAt)),
      updated: s.receivedAt,
    });
  };
  for (const seat of s.seats.filter((p) => !p.hero && p.username)) {
    const name = seat.username!;
    if (seat.inHand && !state.seen.has(name)) {
      state.seen.add(name);
      touch(name).hands++;
    }
    const previous = state.previous?.seats.find((p) => p.id === seat.id && p.username === name),
      actor = state.previous?.actorSeat === seat.id;
    const a = seat.lastAction,
      street = s.board.length;
    // A repeated label is not a new action. An observed actor transition or changed
    // label/commitment must support the event, within the same hand and street.
    const sameStreet = state.previous?.board.length === street;
    const changedLabel = previous && previous.lastAction !== a;
    const changedBet =
      previous && seat.bet != null && previous.bet != null && seat.bet > previous.bet;
    if (
      a &&
      ['check', 'call', 'bet', 'raise', 'fold'].includes(a) &&
      previous &&
      sameStreet &&
      (changedLabel ||
        (actor && s.actorSeat !== seat.id && (!changedBet || ['call', 'bet', 'raise'].includes(a))))
    ) {
      const signature = [s.handId, street, name, a, seat.bet, seat.stack].join(':');
      if (!state.dedup.has(signature)) {
        state.dedup.add(signature);
        const p = touch(name);
        p.actions++;
        p[(a + 's') as 'checks' | 'calls' | 'bets' | 'raises' | 'folds']++;
        const maxBet = Math.max(0, ...(state.previous?.seats || []).map((x) => x.bet || 0));
        const priced = previous.bet != null && maxBet > previous.bet + 0.001;
        if (actor && priced) {
          p.faced++;
          if (a === 'fold') p.foldedFacing++;
          if (street === 0) {
            p.pricedPre++;
            if (a !== 'fold') p.enteredPre++;
          }
        }
        if (street === 5 && (a === 'bet' || a === 'raise')) state.riverAggressors.add(name);
        events.push({
          at: s.receivedAt,
          hand: s.handId,
          name,
          action: a,
          street,
          amount: seat.bet ?? null,
        });
      }
    }
    if (street === 5 && seat.shown?.length === 2 && !state.shown.has(name)) {
      try {
        const visible = [...s.board, ...seat.shown].map(parseCard);
        assertCards(visible);
        const score = evaluate(visible);
        state.shown.add(name);
        const p = touch(name);
        p.showdowns++;
        if (score.category === 0 && state.riverAggressors.has(name)) p.riverBluffCandidates++;
      } catch {
        /* malformed public reveal is ignored */
      }
    }
  }
  state.previous = s;
  if (!changed) return book;
  const entries = Object.entries(profiles)
    .sort((a, b) => b[1].updated - a[1].updated)
    .slice(0, 500);
  return { profiles: Object.fromEntries(entries), events: events.slice(-1000) };
}
export function rangeFor(p?: OpponentProfile): Range {
  if (!p || !Number.isFinite(p.pricedPre) || p.pricedPre < 30) return 'random';
  const rate = (p.enteredPre + 3) / (p.pricedPre + 6);
  return rate < 0.25 ? 'tight' : rate < 0.5 ? 'balanced' : 'wide';
}
export function foldEstimate(p?: OpponentProfile) {
  if (!p || !Number.isFinite(p.faced) || p.faced < 20) return null;
  const n = p.faced,
    rate = p.foldedFacing / n,
    z = 1.96,
    den = 1 + (z * z) / n,
    center = (rate + (z * z) / (2 * n)) / den,
    margin = (z * Math.sqrt((rate * (1 - rate)) / n + (z * z) / (4 * n * n))) / den;
  return { rate, lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), n };
}
export function restoreBook(value: unknown): OpponentBook {
  const b = value as OpponentBook;
  if (!b || !b.profiles || typeof b.profiles !== 'object') return emptyBook();
  const profiles = Object.fromEntries(
    Object.entries(b.profiles)
      .filter(
        ([k, p]) =>
          k.length <= 80 &&
          p &&
          p.name === k &&
          [
            'hands',
            'actions',
            'checks',
            'calls',
            'bets',
            'raises',
            'folds',
            'pricedPre',
            'enteredPre',
            'faced',
            'foldedFacing',
            'showdowns',
            'riverBluffCandidates',
            'updated',
          ].every((f) => Number.isFinite((p as any)[f]) && (p as any)[f] >= 0),
      )
      .slice(0, 500),
  );
  return {
    profiles,
    events: Array.isArray(b.events)
      ? b.events
          .filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.at))
          .slice(-1000)
      : [],
  };
}
