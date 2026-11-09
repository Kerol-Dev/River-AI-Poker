import { assertCards, parseCard } from '../engine/cards';
import { ReaderSnapshot } from './model';
export type CardDisplay = {
  handId: string;
  hole: number[];
  board: number[];
  at: number;
  holding: boolean;
};
export const emptyDisplay = (): CardDisplay => ({
  handId: '',
  hole: [],
  board: [],
  at: 0,
  holding: false,
});
// Presentation only. Retained cards must never be used to authorize a decision.
export function presentCards(
  previous: CardDisplay,
  snapshot: ReaderSnapshot | null,
  now: number,
  holdMs = 1400,
): CardDisplay {
  const hold = () =>
    now - previous.at <= holdMs ? { ...previous, holding: true } : emptyDisplay();
  if (!snapshot || now - snapshot.receivedAt > 3500) return hold();
  if (!snapshot.handId) return hold();
  const same = snapshot.handId === previous.handId;
  let hole: number[], board: number[];
  try {
    hole = snapshot.hole.map(parseCard);
    board = snapshot.board.map(parseCard);
    assertCards([...hole, ...board]);
  } catch {
    return same ? hold() : emptyDisplay();
  }
  const valid = hole.length === 2 && [0, 3, 4, 5].includes(board.length);
  if (!same)
    return valid
      ? { handId: snapshot.handId, hole, board, at: snapshot.receivedAt, holding: false }
      : { ...emptyDisplay(), handId: snapshot.handId };
  if (
    !valid ||
    board.length < previous.board.length ||
    previous.board.some((c, i) => board[i] !== c) ||
    (previous.hole.length === 2 && previous.hole.some((c, i) => hole[i] !== c))
  )
    return hold();
  return { handId: snapshot.handId, hole, board, at: snapshot.receivedAt, holding: false };
}
