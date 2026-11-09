import { assertCards, Card, CATEGORIES, evaluate, rank, suit } from './cards';
export type Range = 'random' | 'wide' | 'balanced' | 'tight';
export const RANGE_PERCENT: Record<Range, number> = {
  random: 100,
  wide: 60,
  balanced: 35,
  tight: 15,
};
export type EquityInput = {
  hole: Card[];
  board: Card[];
  opponents: number;
  range: Range;
  opponentRanges?: Range[];
  trials: number;
};
export type EquityResult = {
  equity: number;
  win: number;
  tie: number;
  loss: number;
  margin: number;
  trials: number;
  distribution: number[];
  made: string;
};
/** A transparent starting-hand ordering, not a solver-derived opening range. */
export function startingStrength(a: Card, b: Card) {
  const hi = Math.max(rank(a), rank(b)),
    lo = Math.min(rank(a), rank(b));
  if (hi === lo) return 22 + hi * 4;
  return (
    hi * 2.3 +
    lo * 1.5 +
    (suit(a) === suit(b) ? 4 : 0) -
    Math.max(0, hi - lo - 1) * 1.8 +
    (hi === 14 ? 2 : 0)
  );
}
const allCombos: [Card, Card][] = [];
for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) allCombos.push([a, b]);
allCombos.sort((a, b) => startingStrength(...b) - startingStrength(...a));
const cutoff = (range: Range) =>
  startingStrength(
    ...allCombos[Math.min(1325, Math.ceil((1326 * RANGE_PERCENT[range]) / 100) - 1)],
  );
export function inRange(a: Card, b: Card, range: Range) {
  return startingStrength(a, b) >= cutoff(range);
}
export function calculateEquity(input: EquityInput, rng = Math.random): EquityResult {
  const { hole, board, opponents, range, trials } = input;
  assertCards([...hole, ...board]);
  if (hole.length !== 2 || ![0, 3, 4, 5].includes(board.length))
    throw new Error('Choose two hole cards and a board of 0, 3, 4, or 5 cards.');
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 5)
    throw new Error('Choose between one and five opponents.');
  if (!Number.isInteger(trials) || trials < 1 || trials > 100000)
    throw new Error('Invalid simulation count.');
  if (!(range in RANGE_PERCENT)) throw new Error('Unknown range.');
  const known = new Set([...hole, ...board]);
  const available = Array.from({ length: 52 }, (_, i) => i).filter((c) => !known.has(c));
  const ranges = input.opponentRanges || Array.from({ length: opponents }, () => range);
  if (ranges.length !== opponents || ranges.some((r) => !(r in RANGE_PERCENT)))
    throw new Error('Invalid opponent ranges.');
  const combinations = ranges.map((r) =>
    allCombos.filter(([a, b]) => !known.has(a) && !known.has(b) && inRange(a, b, r)),
  );
  if (combinations.some((c) => !c.length))
    throw new Error('Opponent range has no compatible cards.');
  let wins = 0,
    ties = 0,
    total = 0,
    squareTotal = 0;
  const distribution = CATEGORIES.map(() => 0);
  for (let n = 0; n < trials; n++) {
    // Reject the entire joint draw on collisions, preserving the conditional range distribution.
    let villain: Card[][];
    let used: Set<Card>;
    do {
      villain = [];
      used = new Set<Card>();
      for (let p = 0; p < opponents; p++) {
        const combos = combinations[p],
          combo = combos[Math.floor(rng() * combos.length)];
        villain.push(combo);
        used.add(combo[0]);
        used.add(combo[1]);
      }
    } while (used.size !== opponents * 2);
    const remaining = available.filter((c) => !used.has(c));
    const runout = [...board];
    for (let i = 0; i < 5 - board.length; i++) {
      const j = i + Math.floor(rng() * (remaining.length - i));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      runout.push(remaining[i]);
    }
    const hero = evaluate([...hole, ...runout]);
    distribution[hero.category]++;
    const others = villain.map((h) => evaluate([...h, ...runout]).score);
    const best = Math.max(hero.score, ...others);
    let share = 0;
    if (hero.score === best) {
      const equal = others.filter((s) => s === best).length;
      share = 1 / (equal + 1);
      if (equal) ties++;
      else wins++;
    }
    total += share;
    squareTotal += share * share;
  }
  const equity = total / trials;
  // Hoeffding bound: valid for bounded fractional pot shares, including zero observed wins.
  return {
    equity,
    win: wins / trials,
    tie: ties / trials,
    loss: (trials - wins - ties) / trials,
    margin: Math.sqrt(Math.log(40) / (2 * trials)),
    trials,
    distribution: distribution.map((v) => v / trials),
    made: evaluate([...hole, ...board]).name,
  };
}
export function advice(equity: number, pot: number, call: number, opponents = 1) {
  const threshold = call > 0 ? call / (pot + call) : 0;
  const callEV = equity * (pot + call) - call;
  const edge = equity - threshold;
  const valueThreshold = Math.max(0.58, 1 / (opponents + 1) + 0.18);
  const action =
    call > 0
      ? edge < 0
        ? 'Fold'
        : equity > Math.max(0.7, valueThreshold)
          ? 'Raise'
          : 'Call'
      : equity > valueThreshold
        ? 'Bet'
        : 'Check';
  const explanation =
    action === 'Fold'
      ? 'Your estimated share of the pot is below the price of calling. Folding preserves chips under this showdown model.'
      : action === 'Call'
        ? 'Your estimated equity clears the immediate price. Calling is plausible, but future bets and your ability to reach showdown still matter.'
        : action === 'Raise' || action === 'Bet'
          ? 'Your equity is strong against the selected range. A value bet is a candidate, provided worse hands will continue. The model does not estimate that response.'
          : 'You can see the next decision without adding chips. Checking keeps the pot manageable while preserving your current equity.';
  return { action, threshold, callEV, edge, explanation, sizing: 0.5 };
}
