import type { ReaderDecision, ReaderSnapshot } from './model';

export type ManualSize = { target: number | null; note: string };

/** Display only. Targets here never enter the action bridge. */
export function manualSize(s: ReaderSnapshot | null, d: ReaderDecision | null): ManualSize | null {
  if (!s || !d || s.automation?.running || !['Bet', 'Raise'].includes(d.action)) return null;
  const { pot, call, heroBet } = s;
  if (d.target == null || pot == null || call == null || heroBet == null) return null;

  const cents = (n: number) => Math.round(n * 100);
  const match = cents(heroBet) + cents(call);
  const potAfterCall = cents(pot) + cents(call);
  const desired = cents(d.target);
  if (potAfterCall <= 0 || desired - match > potAfterCall) return null;

  const min = s.sizing?.min;
  const max = s.sizing?.max;
  if (min != null && max != null) {
    const candidates = ([50, 100] as const)
      .map((percent) => ({ percent, target: match + Math.round((potAfterCall * percent) / 100) }))
      .filter(({ target }) => target > match && target >= cents(min) && target <= cents(max));
    candidates.sort((a, b) => Math.abs(a.target - desired) - Math.abs(b.target - desired));
    const preset = candidates[0];
    if (preset)
      return {
        target: preset.target / 100,
        note: `Manual size: ${preset.percent}% of the pot${call > 0 ? ' after calling' : ''}.`,
      };
  }

  return {
    target: null,
    note: 'No half-pot or pot-sized target fits the confirmed table limits.',
  };
}
