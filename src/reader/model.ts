import { assertCards, parseCard } from '../engine/cards';
import { advice, EquityResult } from '../engine/equity';
export type ReaderSeat = {
  id: string;
  label: string;
  inHand: boolean;
  hero: boolean;
  stack: number | null;
  username?: string | null;
  bet?: number | null;
  lastAction?: string | null;
  shown?: string[];
};
export type ReaderSnapshot = {
  version: 1;
  key: string;
  source: string;
  automation?: { running: boolean; reason: string; count: number; spent: number };
  handId: string;
  actorSeat?: string | null;
  timeLeft?: number | null;
  sittingOut?: boolean;
  sizing?: { min: number | null; max: number | null; editable: boolean };
  hole: string[];
  board: string[];
  pot: number | null;
  callPot?: number | null;
  allInCall?: boolean;
  call: number | null;
  currency: string;
  heroBet?: number | null;
  actionAmounts?: { call?: number; bet?: number; raise?: number };
  opponents: number;
  heroTurn: boolean;
  actions: string[];
  seats: ReaderSeat[];
  dealer: string | null;
  errors: string[];
  mapping: { mapped: number; total: number };
  receivedAt: number;
};
export type ReaderDecision = {
  key: string;
  action: string;
  equity: number;
  callEV: number;
  threshold: number;
  explanation: string;
  amount: number | null;
  updatedAt: number;
  target?: number;
  intent?: 'value' | 'call' | 'check' | 'fold' | 'raise' | 'bet' | 'bluff' | 'semi-bluff';
  reasoning?: string[];
};
export type BridgeStatus = {
  running: boolean;
  port: number;
  token?: string;
  connected: boolean;
  lastSeen: number | null;
  error?: string;
};
export function assessEquitySnapshot(snapshot: ReaderSnapshot | null, now = Date.now()) {
  const blocked = (reason: string) => ({
    valid: false as const,
    reason,
    hole: [] as number[],
    board: [] as number[],
  });
  if (!snapshot)
    return blocked('Waiting for a table reading. Finish mapping and check that Live is on.');
  if (now - snapshot.receivedAt > 3500 || now < snapshot.receivedAt - 1000)
    return blocked('The table feed is stale. Waiting for a fresh reading.');
  if (snapshot.errors.length) return blocked(snapshot.errors[0]);
  if (!snapshot.handId) return blocked('Waiting for a readable hand number.');
  if (snapshot.sittingOut)
    return blocked('Your seat is sitting out. Resume at the table when ready.');
  if (snapshot.hole.length !== 2) return blocked('Your two visible hole cards are not available.');
  if (![0, 3, 4, 5].includes(snapshot.board.length))
    return blocked('Community cards are still changing.');
  let hole: number[], board: number[];
  try {
    hole = snapshot.hole.map(parseCard);
    board = snapshot.board.map(parseCard);
    assertCards([...hole, ...board]);
  } catch {
    return blocked('Card reading is incomplete or duplicated.');
  }
  if (!Number.isInteger(snapshot.opponents) || snapshot.opponents < 1 || snapshot.opponents > 5)
    return blocked('Could not confirm the active opponents.');
  return { valid: true as const, reason: '', hole, board };
}
export function assessSnapshot(snapshot: ReaderSnapshot | null, now = Date.now()) {
  const cards = assessEquitySnapshot(snapshot, now);
  if (!cards.valid || !snapshot) return cards;
  const { hole, board } = cards;
  const blocked = (reason: string) => ({
    valid: false as const,
    reason,
    hole: [] as number[],
    board: [] as number[],
  });
  if (snapshot.pot === null || !Number.isFinite(snapshot.pot) || snapshot.pot <= 0)
    return blocked('The pot amount is not readable.');
  if (
    snapshot.allInCall &&
    (snapshot.opponents !== 1 ||
      snapshot.callPot == null ||
      !Number.isFinite(snapshot.callPot) ||
      snapshot.callPot <= 0 ||
      snapshot.callPot > snapshot.pot ||
      snapshot.call == null ||
      snapshot.callPot < snapshot.call)
  )
    return blocked('All-in call detected. Eligible pot needs manual review.');
  if (!snapshot.heroTurn)
    return blocked('Waiting for your turn. Pre-action checkboxes are ignored.');
  if (
    snapshot.call === null ||
    !Number.isFinite(snapshot.call) ||
    snapshot.call < 0 ||
    snapshot.call > snapshot.pot + 0.01
  )
    return blocked('The current call amount is not readable.');
  if (!snapshot.actions.includes(snapshot.call === 0 ? 'check' : 'call'))
    return blocked('Waiting for confirmed legal action buttons.');
  return { valid: true as const, reason: '', hole, board };
}
export function readerDecision(
  snapshot: ReaderSnapshot,
  result: EquityResult,
  now = Date.now(),
): ReaderDecision | null {
  if (!assessSnapshot(snapshot, now).valid) return null;
  const line = advice(
    result.equity,
    snapshot.callPot ?? snapshot.pot!,
    snapshot.call!,
    snapshot.opponents,
  );
  let action = line.action;
  if (
    ['Raise', 'Bet'].includes(action) &&
    !snapshot.actions.some((a) => a === 'raise' || a === 'bet')
  )
    action = snapshot.call === 0 ? 'Check' : 'Call';
  if (action === 'Fold' && !snapshot.actions.includes('fold')) return null;
  if (action === 'Raise' && snapshot.actions.includes('bet') && !snapshot.actions.includes('raise'))
    action = 'Bet';
  if (action === 'Bet' && snapshot.actions.includes('raise') && !snapshot.actions.includes('bet'))
    action = 'Raise';
  return {
    key: snapshot.key,
    action,
    equity: result.equity,
    callEV: line.callEV,
    threshold: line.threshold,
    explanation: ['Raise', 'Bet'].includes(action)
      ? 'Value aggression is a candidate against the assumed range. Exact raise bounds and future betting are not solved; choose the amount yourself.'
      : action === line.action
        ? line.explanation
        : 'The available action is check/call; raising is not currently offered by the table.',
    amount: action === 'Call' ? snapshot.call : null,
    updatedAt: now,
  };
}

export function visibleReaderCards(snapshot: ReaderSnapshot | null, now = Date.now()) {
  if (!snapshot || now - snapshot.receivedAt > 3500) return { hole: [], board: [] };
  try {
    const hole = snapshot.hole.map(parseCard),
      board = snapshot.board.map(parseCard);
    assertCards([...hole, ...board]);
    return {
      hole: hole.length === 2 ? hole : [],
      board: [0, 3, 4, 5].includes(board.length) ? board : [],
    };
  } catch {
    return { hole: [], board: [] };
  }
}
