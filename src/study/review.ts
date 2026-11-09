import { evaluate } from '../engine/cards';
import type { EquityInput, EquityResult } from './equity';
import { drawStrength } from './range-model';

/** Study-only sensitivity comparison. Never published to the browser action bridge. */
export function reviewHand(
  input: EquityInput,
  result: EquityResult,
  pot: number,
  call: number,
  reservePoints?: number,
) {
  if (!Number.isFinite(pot) || pot <= 0 || !Number.isFinite(call) || call < 0)
    throw Error('Use a positive pot and a non-negative call amount.');
  if (
    reservePoints !== undefined &&
    (!Number.isFinite(reservePoints) || reservePoints < 0 || reservePoints > 100)
  )
    throw Error('The policy reserve must be between 0 and 100 percentage points.');
  const { hole, board, opponents } = input;
  const boardOnly =
    board.length === 5 && evaluate([...hole, ...board]).score === evaluate(board).score;
  const backdoorsOnly =
    board.length > 0 &&
    board.length < 5 &&
    evaluate([...hole, ...board]).category === 0 &&
    drawStrength(hole, board) === 0;
  const defaultReserve =
    (board.length === 5 ? 2 : board.length === 4 ? 4 : board.length === 3 ? 6 : 5) +
    (backdoorsOnly ? 5 : 0) +
    (opponents - 1) * 1.5;
  const reserve = (reservePoints ?? defaultReserve) / 100;
  const tighter = result.analysis?.cautious ?? result;
  const decisionFloor = Math.max(
    0,
    Math.min(result.equity - result.margin, tighter.equity - tighter.margin) - reserve,
  );
  const threshold = call / (pot + call);
  const ev = (equity: number) => equity * (pot + call) - call;
  const conservativeEV = ev(decisionFloor);
  const action =
    call === 0 ? 'Check candidate' : conservativeEV > 0 ? 'Call candidate' : 'Fold candidate';
  const explanation =
    call === 0
      ? 'Checking costs nothing. A profitable bet needs a model of which hands continue and at what size; raw equity alone is not enough.'
      : conservativeEV > 0
        ? 'The call clears its price after testing a tighter range, sampling uncertainty and the chosen policy reserve.'
        : 'The call does not clear its price after testing a tighter range, sampling uncertainty and the chosen policy reserve.';
  return {
    action,
    explanation,
    threshold,
    decisionFloor,
    reserve,
    conservativeEV,
    boardOnly,
    backdoorsOnly,
    baselineEV: ev(result.analysis?.baseline.equity ?? result.equity),
    observedEV: ev(result.equity),
    tighterEV: ev(tighter.equity),
    breakEvenTie: result.win === 0 && opponents === 1 && call > 0 ? 2 * threshold : null,
  };
}
