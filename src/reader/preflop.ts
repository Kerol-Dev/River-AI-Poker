import type { ReaderSeat, ReaderSnapshot } from './model';

/**
 * Preflop plan. Before the flop most players still holding cards have not acted yet and
 * usually fold, so "equity against everyone dealt in" badly understates strong hands.
 * River therefore reads the action (unopened, limped, raised, re-raised) and uses
 * standard starting-hand ranges for each spot. Position is not known on every site,
 * so these are middle-position ranges: slightly tight from the button, slightly loose
 * under the gun. They are a teaching baseline, not a solver output.
 */
export type PreflopSpot = 'unopened' | 'limped' | 'raised' | 'reraised';

const ORDER = 'AKQJT98765432';
/** "AQo", "KTs" or "99" for two cards such as ["Ah", "Qc"]. */
export function handCode(hole: string[]): string {
  const [a, b] = hole.map((c) => c.trim().replace(/^10/, 'T'));
  const [hi, lo] =
    ORDER.indexOf(a[0].toUpperCase()) <= ORDER.indexOf(b[0].toUpperCase()) ? [a, b] : [b, a];
  const r1 = hi[0].toUpperCase(),
    r2 = lo[0].toUpperCase();
  if (r1 === r2) return r1 + r2;
  return r1 + r2 + (hi[1].toLowerCase() === lo[1].toLowerCase() ? 's' : 'o');
}

/** Expands range notation: "22+", "ATs+", "KQo", "A5s-A2s", "JJ-88". */
export function expandRange(text: string): Set<string> {
  const out = new Set<string>();
  const at = (r: string) => ORDER.indexOf(r);
  for (const raw of text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)) {
    const plus = raw.endsWith('+'),
      part = raw.replace('+', '');
    const [from, to] = part.split('-');
    const pair = (h: string) => h.length === 2 && h[0] === h[1];
    if (pair(from)) {
      const start = at(from[0]),
        end = plus ? 0 : to ? at(to[0]) : start;
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++)
        out.add(ORDER[i] + ORDER[i]);
      continue;
    }
    const high = from[0],
      kind = from[2];
    const lowStart = at(from[1]);
    const lowEnd = plus ? at(high) + 1 : to ? at(to[1]) : lowStart;
    for (let i = Math.min(lowStart, lowEnd); i <= Math.max(lowStart, lowEnd); i++)
      if (i > at(high)) out.add(high + ORDER[i] + kind);
  }
  return out;
}

export const RANGES = {
  // Raise first in: about the top 22% of starting hands.
  open: expandRange('22+, A2s+, A9o+, K9s+, KTo+, Q9s+, QJo, J9s+, T9s, 98s, 87s, 76s'),
  // Raise over limpers: hands that play well heads-up in a bigger pot.
  isolate: expandRange('55+, A8s+, ATo+, KTs+, KQo, QJs, JTs'),
  // Limp behind for a small price: hands that win big pots when they hit.
  overlimp: expandRange('22+, A2s+, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s'),
  // Facing one raise.
  threeBet: expandRange('QQ+, AKs, AKo'),
  callRaise: expandRange(
    'JJ-22, AQs-A9s, A5s-A4s, AQo, AJo, KQs, KJs, KTs, KQo, QJs, QTs, JTs, T9s, 98s',
  ),
  // Extra big-blind defence when the price is good (already 1 big blind invested).
  bbDefend: expandRange(
    'A2s+, A2o+, K5s+, K8o+, Q7s+, Q9o+, J7s+, J9o+, T7s+, T9o, 96s+, 86s+, 75s+, 65s, 54s',
  ),
  // Facing a 3-bet or more.
  fourBet: expandRange('KK+, AKs'),
  callThreeBet: expandRange('QQ, JJ, AKo, AQs'),
  // Also call a re-raise that is small relative to the pot.
  callThreeBetPriced: expandRange('TT, 99, AQo, AJs, KQs'),
  // A call or raise that puts a large part of your stack in.
  commit: expandRange('TT+, AQs+, AKo'),
};

const voluntary = (p: ReaderSeat) => p.lastAction === 'raise' || p.lastAction === 'bet';
/** Bet365 shows every player's action, so "no actions yet" is meaningful there. Other sites
 * only count as known once a seat action has been read. */
const actionsKnown = (s: ReaderSnapshot) =>
  s.source === 'update-com.p365play.com' || s.seats.some((p) => p.lastAction != null);

/** Reads the preflop action from seat actions. Without action data (most non-Bet365 sites)
 * any price to call is treated as a raise, the cautious reading. */
export function preflopSpot(s: ReaderSnapshot): { spot: PreflopSpot; known: boolean } {
  const opponents = s.seats.filter((p) => !p.hero && p.inHand);
  const known = actionsKnown(s);
  if (!known) return { spot: (s.call ?? 0) > 0 ? 'raised' : 'limped', known: false };
  const hero = s.seats.find((p) => p.hero);
  const raises = opponents.filter(voluntary).length + (hero && voluntary(hero) ? 1 : 0);
  const calls = opponents.filter((p) => p.lastAction === 'call').length;
  const spot: PreflopSpot =
    raises === 0
      ? calls > 0
        ? 'limped'
        : 'unopened'
      : raises >= 2 || (hero && voluntary(hero) && (s.call ?? 0) > 0)
        ? 'reraised'
        : 'raised';
  return { spot, known: true };
}

/** Opponents who will realistically see the flop: those who raised or called. When nobody
 * has, assume one (usually the big blind). Without action data, at most two. */
export function preflopOpponents(s: ReaderSnapshot): ReaderSeat[] {
  const opponents = s.seats.filter((p) => !p.hero && p.inHand);
  if (!actionsKnown(s)) return opponents.slice(0, 2);
  const acted = opponents.filter((p) => voluntary(p) || p.lastAction === 'call');
  if (acted.length) return acted;
  const blind = [...opponents].sort((a, b) => (b.bet ?? 0) - (a.bet ?? 0))[0];
  return blind ? [{ ...blind, bet: 0, lastAction: null }] : [];
}

/** Snapshot used for preflop equity: only the opponents who will realistically play. */
export function preflopView(s: ReaderSnapshot): ReaderSnapshot {
  if (s.board.length) return s;
  const keep = preflopOpponents(s);
  if (!keep.length) return s;
  const ids = new Set(keep.map((p) => p.id));
  return {
    ...s,
    opponents: keep.length,
    seats: s.seats.map((p) =>
      p.hero ? p : ids.has(p.id) ? keep.find((k) => k.id === p.id)! : { ...p, inHand: false },
    ),
  };
}

export type PreflopPlan = {
  action: 'Raise' | 'Call' | 'Check' | 'Fold';
  spot: PreflopSpot;
  code: string;
  explanation: string;
  /** Raise size as a fraction of the pot after calling. */
  fraction: number;
};

export function preflopPlan(s: ReaderSnapshot, equity: number, threshold: number): PreflopPlan {
  const code = handCode(s.hole);
  const { spot, known } = preflopSpot(s);
  const call = s.call ?? 0;
  const hero = s.seats.find((p) => p.hero);
  const stack = hero?.stack != null ? hero.stack + (s.heroBet ?? 0) : null;
  const where = known
    ? ''
    : ' River cannot see who raised on this site, so it reads any price as a raise.';
  const plan = (
    action: PreflopPlan['action'],
    explanation: string,
    fraction = 0.6,
  ): PreflopPlan => ({
    action,
    spot,
    code,
    explanation: explanation + where,
    fraction,
  });
  // A large share of your stack: only continue with the strongest hands or a clear price.
  if (stack != null && stack > 0 && call > 0.3 * stack)
    return RANGES.commit.has(code) || equity >= threshold + 0.05
      ? plan('Call', `${code} is strong enough to commit a large part of your stack here.`)
      : plan(
          'Fold',
          `This call is ${Math.round((call / stack) * 100)}% of your stack. ${code} is not strong enough to commit it.`,
        );
  if (spot === 'unopened')
    return RANGES.open.has(code)
      ? plan(
          'Raise',
          `Nobody has raised. ${code} is in River's raise-first-in range (about the top 22% of hands): raising can win the blinds now or take a strong hand heads-up.`,
        )
      : call === 0
        ? plan('Check', `${code} is not strong enough to raise. Check and see the flop for free.`)
        : plan(
            'Fold',
            `Nobody has raised, but ${code} is outside the raise-first-in range. Limping in with weak hands loses money over time.`,
          );
  if (spot === 'limped') {
    if (RANGES.isolate.has(code))
      return plan(
        'Raise',
        `Players limped in. ${code} is strong enough to raise and play a bigger pot against fewer opponents.`,
        0.8,
      );
    if (call === 0)
      return plan('Check', `Players limped. Check your option with ${code} and see a cheap flop.`);
    return RANGES.overlimp.has(code)
      ? plan(
          'Call',
          `Players limped. ${code} can win a big pot when it hits, and the price is small.`,
        )
      : plan(
          'Fold',
          `Players limped. ${code} rarely wins enough when it hits to pay for the flop.`,
        );
  }
  if (spot === 'raised') {
    if (RANGES.threeBet.has(code))
      return plan(
        'Raise',
        `Someone raised. ${code} is a premium hand: re-raise (3-bet) for value.`,
        0.8,
      );
    if (RANGES.callRaise.has(code))
      return plan(
        'Call',
        `Someone raised. ${code} plays well against a raising range, so call and see the flop, often with position.`,
      );
    const bigBlind = (s.heroBet ?? 0) > 0 && threshold < 0.34;
    if (bigBlind && RANGES.bbDefend.has(code))
      return plan(
        'Call',
        `You already have chips in and only need ${Math.round(threshold * 100)}% equity. ${code} is a good enough defence at this price.`,
      );
    return plan(
      'Fold',
      `Someone raised. Against a raising range ${code} is often dominated (a better kicker or a bigger pair), so fold.`,
    );
  }
  if (RANGES.fourBet.has(code))
    return plan(
      'Raise',
      `The pot is re-raised. ${code} is at the top of any range: raise again.`,
      0.65,
    );
  if (RANGES.callThreeBet.has(code))
    return plan(
      'Call',
      `The pot is re-raised. ${code} is strong enough to call, but re-raising again mostly gets called by better hands.`,
    );
  if (threshold <= 0.35 && RANGES.callThreeBetPriced.has(code))
    return plan(
      'Call',
      `The pot is re-raised, but you only need ${Math.round(threshold * 100)}% equity. ${code} is strong enough to call at this price.`,
    );
  return plan(
    'Fold',
    `The pot is re-raised. Re-raising ranges are tight (big pairs and AK), and ${code} is behind most of them.`,
  );
}
