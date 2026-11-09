import { assertCards, Card, CATEGORIES, evaluate, rank, suit, seeded } from '../engine/cards';
import { rangeWeights, RangeMode, RangeSituation } from './range-model';
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
  situation?: RangeSituation;
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
  exact?: boolean;
  analysis?: {
    version: 2;
    baseline: EquityScenario;
    cautious: EquityScenario;
    continuation: EquityScenario;
    label: string;
  };
};
export type EquityScenario = Pick<
  EquityResult,
  'equity' | 'win' | 'tie' | 'loss' | 'margin' | 'exact'
>;
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
function calculateScenario(input: EquityInput, rng: () => number, mode?: RangeMode): EquityResult {
  const { hole, board, opponents, range, trials } = input;
  const known = new Set([...hole, ...board]);
  const available = Array.from({ length: 52 }, (_, i) => i).filter((c) => !known.has(c));
  const ranges = input.opponentRanges || Array.from({ length: opponents }, () => range);
  const combinations = ranges.map((r) =>
    allCombos.filter(([a, b]) => !known.has(a) && !known.has(b) && inRange(a, b, r)),
  );
  if (combinations.some((c) => !c.length)) throw Error('Opponent range has no compatible cards.');
  const weights = combinations.map((combos, i) =>
    mode && input.situation
      ? rangeWeights(
          combos,
          board,
          input.situation.actions[i],
          input.situation.pressure,
          mode,
          startingStrength,
        )
      : combos.map(() => 1),
  );
  const cumulative = weights.map((ws) => {
    let sum = 0;
    return ws.map((w) => (sum += w));
  });
  const choose = (i: number) => {
    const c = cumulative[i],
      x = rng() * c[c.length - 1];
    let lo = 0,
      hi = c.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x < c[mid]) hi = mid;
      else lo = mid + 1;
    }
    return combinations[i][lo];
  };
  let wins = 0,
    ties = 0,
    total = 0,
    weightTotal = 0;
  const distribution = CATEGORIES.map(() => 0);
  const record = (villain: Card[][], runout: Card[], weight = 1) => {
    const hero = evaluate([...hole, ...runout]),
      others = villain.map((h) => evaluate([...h, ...runout]).score),
      best = Math.max(hero.score, ...others);
    distribution[hero.category] += weight;
    weightTotal += weight;
    if (hero.score === best) {
      const equal = others.filter((s) => s === best).length;
      total += weight / (equal + 1);
      if (equal) ties += weight;
      else wins += weight;
    }
  };
  // All legal opposing combinations are enumerated on a heads-up river.
  // Exact here means exact FOR THE CHOSEN RANGE, not certainty about that range.
  const exact = board.length === 5 && opponents === 1;
  if (exact) combinations[0].forEach((h, i) => record([h], board, weights[0][i]));
  else
    for (let n = 0; n < trials; n++) {
      let villain: Card[][],
        used: Set<Card>,
        attempts = 0;
      do {
        villain = Array.from({ length: opponents }, (_, i) => choose(i));
        used = new Set(villain.flat());
        if (++attempts > 10000)
          throw Error('The selected ranges cannot produce a compatible deal.');
      } while (used.size !== opponents * 2);
      const remaining = available.filter((c) => !used.has(c)),
        runout = [...board];
      for (let i = 0; i < 5 - board.length; i++) {
        const j = i + Math.floor(rng() * (remaining.length - i));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        runout.push(remaining[i]);
      }
      record(villain, runout);
    }
  return {
    equity: total / weightTotal,
    win: wins / weightTotal,
    tie: ties / weightTotal,
    loss: Math.max(0, 1 - (wins + ties) / weightTotal),
    margin: exact ? 0 : Math.sqrt(Math.log(160) / (2 * trials)),
    trials: exact ? combinations[0].length : trials,
    distribution: distribution.map((v) => v / weightTotal),
    made: evaluate([...hole, ...board]).name,
    exact,
  };
}
export function calculateEquity(input: EquityInput, rng = Math.random): EquityResult {
  const { hole, board, opponents, range, trials } = input;
  assertCards([...hole, ...board]);
  if (hole.length !== 2 || ![0, 3, 4, 5].includes(board.length))
    throw Error('Choose two hole cards and a board of 0, 3, 4, or 5 cards.');
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 5)
    throw Error('Choose between one and five opponents.');
  if (!Number.isInteger(trials) || trials < 1 || trials > 100000)
    throw Error('Invalid simulation count.');
  if (!Object.hasOwn(RANGE_PERCENT, range)) throw Error('Unknown range.');
  const ranges = input.opponentRanges || Array.from({ length: opponents }, () => range);
  if (ranges.length !== opponents || ranges.some((r) => !Object.hasOwn(RANGE_PERCENT, r)))
    throw Error('Invalid opponent ranges.');
  if (
    input.situation &&
    (input.situation.actions.length !== opponents ||
      input.situation.actions.some((a) => !['unknown', 'call', 'bet', 'raise'].includes(a)) ||
      !Number.isFinite(input.situation.pressure) ||
      input.situation.pressure < 0)
  )
    throw Error('Invalid action-range context.');
  if (!input.situation) return calculateScenario(input, rng);
  // Stable inputs keep identical samples; HUD polling does not reroll a borderline decision.
  if (rng === Math.random) {
    let h = 2166136261;
    for (const c of JSON.stringify(input)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    rng = seeded(h);
  }
  const baseline = calculateScenario(input, rng),
    observed = calculateScenario(input, rng, 'observed'),
    cautious = calculateScenario(input, rng, 'cautious'),
    continuation = calculateScenario(input, rng, 'continue');
  const brief = ({ equity, win, tie, loss, margin, exact }: EquityResult): EquityScenario => ({
    equity,
    win,
    tie,
    loss,
    margin,
    exact,
  });
  return {
    ...observed,
    analysis: {
      version: 2,
      baseline: brief(baseline),
      cautious: brief(cautious),
      continuation: brief(continuation),
      label: input.situation.actions.some((a) => a === 'bet' || a === 'raise')
        ? 'Action-weighted range · heuristic'
        : 'Starting-range estimate · heuristic',
    },
  };
}
