import { assertCards, evaluate, parseCard } from '../engine/cards';
import { advice, EquityResult } from '../engine/equity';
import { ActionRange, drawStrength, RangeSituation } from '../study/range-model';
import { preflopPlan, PreflopPlan, preflopView } from './preflop';
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
  preflop?: { spot: PreflopPlan['spot']; code: string };
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
export function situationFromSnapshot(input: ReaderSnapshot): RangeSituation | undefined {
  // Preflop, only players who raised or called count; posted blinds are not actions.
  const preflop = input.board.length === 0;
  const snapshot = preflop ? preflopView(input) : input;
  if (!Number.isInteger(snapshot.opponents) || snapshot.opponents < 1 || snapshot.opponents > 5)
    return undefined;
  if (
    preflop &&
    (snapshot.source === 'update-com.p365play.com' ||
      snapshot.seats.some((p) => p.lastAction != null))
  ) {
    const active = snapshot.seats.filter((p) => !p.hero && p.inHand);
    const call = snapshot.call ?? 0;
    const potTotal = snapshot.pot ?? call;
    const potBefore = call > 0 ? Math.max(call * 0.25, potTotal - call) : 1;
    return {
      actions: Array.from(
        { length: snapshot.opponents },
        (_, i): ActionRange =>
          active[i]?.lastAction === 'raise' || active[i]?.lastAction === 'bet'
            ? 'raise'
            : active[i]?.lastAction === 'call'
              ? 'call'
              : 'unknown',
      ),
      pressure: call > 0 ? Math.min(4, Math.max(0, call / potBefore)) : 0,
    };
  }
  const active = snapshot.seats.filter((p) => !p.hero && p.inHand);
  const call = snapshot.call != null && Number.isFinite(snapshot.call) ? snapshot.call : 0;
  const heroBet =
    snapshot.heroBet != null && Number.isFinite(snapshot.heroBet) ? snapshot.heroBet : 0;
  const maxOppBet = Math.max(0, ...active.map((p) => (p.bet != null ? p.bet : 0)));
  const aggressiveKind: ActionRange = heroBet > 0 || snapshot.board.length === 0 ? 'raise' : 'bet';
  const actions: ActionRange[] = Array.from({ length: snapshot.opponents }, (_, i) => {
    const seat = active[i];
    if (seat?.lastAction === 'raise') return 'raise';
    if (seat?.lastAction === 'bet') return 'bet';
    if (seat?.lastAction === 'call') return 'call';
    if (call > 0) {
      if (seat?.bet != null && maxOppBet > 0 && Math.abs(seat.bet - maxOppBet) < 0.005)
        return aggressiveKind;
      if (seat?.bet != null && seat.bet > 0) return 'call';
      if (snapshot.opponents === 1) return aggressiveKind;
    } else if (seat?.bet != null && seat.bet > 0) {
      return 'call';
    }
    return 'unknown';
  });
  const potTotal = snapshot.callPot ?? snapshot.pot ?? call;
  const potBefore = call > 0 ? Math.max(call * 0.25, potTotal - call) : 1;
  const pressure = call > 0 ? Math.min(4, Math.max(0, call / potBefore)) : 0;
  return { actions, pressure };
}

export function evaluateLiveDecision(snapshot: ReaderSnapshot, result: EquityResult) {
  const pot = snapshot.callPot ?? snapshot.pot!;
  const call = snapshot.call!;
  const line = advice(result.equity, pot, call, snapshot.opponents);
  let action = line.action;
  let explanation = line.explanation;
  let decisionFloor = result.equity;
  // Preflop uses starting-hand ranges for the spot; equity alone ignores folds and position.
  if (snapshot.board.length === 0) {
    const preflop = preflopPlan(snapshot, result.equity, line.threshold);
    return {
      line,
      action: preflop.action as string,
      explanation: preflop.explanation,
      decisionFloor,
      highCardPostflop: false,
      boardOnly: false,
      backdoorsOnly: false,
      preflop,
    };
  }
  const hole = snapshot.hole.map(parseCard);
  const board = snapshot.board.map(parseCard);
  const postflop = board.length >= 3;
  const heroEval = postflop ? evaluate([...hole, ...board]) : null;
  const boardEval = postflop ? evaluate(board) : null;
  const highCardPostflop = postflop && heroEval!.category === 0;
  const boardOnly =
    postflop &&
    heroEval!.score === boardEval!.score &&
    (board.length === 5 ? result.win === 0 : heroEval!.category > 0);
  const backdoorsOnly =
    postflop && board.length < 5 && highCardPostflop && drawStrength(hole, board) === 0;

  if (action === 'Raise' || action === 'Bet') {
    const contEquity = result.analysis?.continuation.equity;
    const minCont = call > 0 ? 0.58 : 0.52;
    if (postflop && (highCardPostflop || boardOnly)) {
      action = call === 0 ? 'Check' : 'Call';
      explanation =
        call === 0
          ? 'Unimproved high-card/board holdings check rather than value-betting into continuing hands.'
          : 'Unimproved high-card/board holdings do not raise for value postflop.';
    } else if (contEquity != null && contEquity < minCont) {
      action = call === 0 ? 'Check' : 'Call';
      explanation =
        call === 0
          ? `Against continuing hands (${Math.round(contEquity * 100)}% equity), checking avoids value-cutting your hand.`
          : `Raising is skipped because equity against continuing hands is ${Math.round(contEquity * 100)}%.`;
    }
  }

  if (call > 0 && action === 'Call') {
    const cautious = result.analysis?.cautious.equity ?? result.equity;
    const streetReserve = result.analysis
      ? board.length === 3
        ? 0.035
        : board.length === 4
          ? 0.02
          : board.length === 5
            ? 0.015
            : 0.02
      : 0;
    const handPenalty =
      (backdoorsOnly ? 0.03 : 0) +
      (boardOnly || (board.length === 5 && highCardPostflop) ? 0.025 : 0);
    decisionFloor = Math.max(0, Math.min(result.equity, cautious) - streetReserve - handPenalty);
    if (
      (result.analysis || backdoorsOnly || boardOnly || (board.length === 5 && highCardPostflop)) &&
      decisionFloor < line.threshold
    ) {
      action = 'Fold';
      explanation = `After weighting for the opponent’s betting range and remaining streets, cautious equity (${Math.round(decisionFloor * 100)}%) is below the ${Math.round(line.threshold * 100)}% required to call.`;
    }
  }

  return {
    line,
    action,
    explanation,
    decisionFloor,
    highCardPostflop,
    boardOnly,
    backdoorsOnly,
    preflop: undefined as PreflopPlan | undefined,
  };
}

export function readerDecision(
  snapshot: ReaderSnapshot,
  result: EquityResult,
  now = Date.now(),
): ReaderDecision | null {
  if (!assessSnapshot(snapshot, now).valid) return null;
  const evaluated = evaluateLiveDecision(snapshot, result);
  const { line } = evaluated;
  let action = evaluated.action;
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
      : action === evaluated.action
        ? evaluated.explanation
        : 'The available action is check/call; raising is not currently offered by the table.',
    amount: action === 'Call' ? snapshot.call : null,
    updatedAt: now,
    preflop: evaluated.preflop
      ? { spot: evaluated.preflop.spot, code: evaluated.preflop.code }
      : undefined,
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
