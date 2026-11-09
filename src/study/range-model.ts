import { Card, evaluate, rank, suit } from '../engine/cards';

export type ActionRange = 'unknown' | 'call' | 'bet' | 'raise';
export type RangeSituation = { actions: ActionRange[]; pressure: number };
export type RangeMode = 'observed' | 'cautious' | 'continue';

/** A visible-draw heuristic, not an estimate that every out is clean. */
export function drawStrength(hole: Card[], board: Card[]) {
  if (board.length < 3 || board.length >= 5) return 0;
  const all = [...hole, ...board];
  const flush = [0, 1, 2, 3].some(
    (s) => all.filter((c) => suit(c) === s).length === 4 && hole.some((c) => suit(c) === s),
  );
  const ranks = new Set(all.map(rank));
  if (ranks.has(14)) ranks.add(1);
  const missing = new Set<number>();
  for (let low = 1; low <= 10; low++) {
    const sequence = Array.from({ length: 5 }, (_, i) => low + i);
    const absent = sequence.filter((r) => !ranks.has(r));
    if (
      absent.length === 1 &&
      hole.some(
        (c) =>
          !board.some((b) => rank(b) === rank(c)) &&
          (sequence.includes(rank(c)) || (rank(c) === 14 && sequence.includes(1))),
      )
    )
      missing.add(absent[0]);
  }
  return Math.max(flush ? 0.72 : 0, missing.size >= 2 ? 0.65 : missing.size === 1 ? 0.42 : 0);
}

/**
 * Explicit stress assumptions, NOT learned probabilities or solver ranges.
 * Percentiles refer to made-hand strength on the CURRENT board, before runouts.
 * Action weighting retains bluffs/draws instead of pretending a bet proves value.
 */
export function rangeWeights(
  combos: [Card, Card][],
  board: Card[],
  action: ActionRange,
  pressure: number,
  mode: RangeMode,
  preflopScore: (a: Card, b: Card) => number,
): number[] {
  if (action === 'unknown' && mode !== 'continue') return combos.map(() => 1);
  const scores = combos.map((h) =>
    board.length ? evaluate([...h, ...board]).score : preflopScore(...h),
  );
  const sorted = [...scores].sort((a, b) => a - b),
    percentiles = new Map<number, number>();
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j] === sorted[i]) j++;
    percentiles.set(sorted[i], (i + j) / (2 * sorted.length));
    i = j;
  }
  const tight = mode === 'cautious' || mode === 'continue';
  const floor =
    mode === 'continue'
      ? 0.025
      : tight
        ? 0.06
        : action === 'raise'
          ? 0.1
          : action === 'bet'
            ? 0.2
            : 0.35;
  const power =
    (action === 'raise' ? 4 : action === 'bet' ? 3 : 2) +
    (tight ? 1 : 0) +
    Math.min(1.5, Math.max(0, pressure - 0.5));
  return combos.map((h, i) => {
    const made = percentiles.get(scores[i])!;
    const draw = board.length ? drawStrength(h, board) : 0;
    return floor + (1 - floor) * Math.pow(Math.max(made, draw), power);
  });
}
