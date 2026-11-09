import { ReaderSnapshot } from './model';
export type Checkpoint = { at: number; handId: string; balance: number; gap?: boolean };
export type CashFlow = { at: number; amount: number };
export type BrowserSession = {
  id: string;
  start: number;
  end?: number;
  currency: string;
  seat: string;
  points: Checkpoint[];
  flows: CashFlow[];
};
export type Journal = {
  sessions: BrowserSession[];
  active: string | null;
  paused: boolean;
  pendingReset?: boolean;
};
export const emptyJournal = (): Journal => ({ sessions: [], active: null, paused: false });
export function balanceAtBoundary(s: ReaderSnapshot): number | null {
  const hero = s.seats.find((p) => p.hero);
  if (
    !s.handId ||
    s.errors.length ||
    s.board.length ||
    s.hole.length !== 2 ||
    hero?.stack == null ||
    s.heroBet == null ||
    !['€', '£', '$'].includes(s.currency)
  )
    return null;
  return Math.round((hero.stack + s.heroBet) * 100);
}
export function checkpoint(j: Journal, s: ReaderSnapshot, at = s.receivedAt): Journal {
  const balance = balanceAtBoundary(s),
    hero = s.seats.find((p) => p.hero);
  if (j.paused || balance === null || !hero) return j;
  const active = j.sessions.find((v) => v.id === j.active);
  if (!active || active.currency !== s.currency || active.seat !== hero.id) {
    const session: BrowserSession = {
      id: `${at}-${s.handId}`,
      start: at,
      currency: s.currency,
      seat: hero.id,
      points: [{ at, handId: s.handId, balance }],
      flows: [],
    };
    return {
      ...j,
      pendingReset: false,
      active: session.id,
      sessions: [
        ...j.sessions.map((v) => (v.id === j.active ? { ...v, end: at } : v)),
        session,
      ].slice(-50),
    };
  }
  if (active.points.some((p) => p.handId === s.handId)) return j;
  return {
    ...j,
    sessions: j.sessions.map((v) =>
      v.id === active.id
        ? {
            ...v,
            points: [
              v.points[0],
              ...v.points.slice(1).slice(-1998),
              { at, handId: s.handId, balance, gap: at - v.points.at(-1)!.at > 180000 },
            ],
          }
        : v,
    ),
  };
}
export function netAt(session: BrowserSession, p: Checkpoint) {
  return (
    p.balance -
    session.points[0].balance -
    session.flows.filter((f) => f.at <= p.at).reduce((n, f) => n + f.amount, 0)
  );
}
export function sessionNet(s: BrowserSession) {
  return netAt(s, s.points.at(-1)!);
}
export function addFlow(j: Journal, amount: number, at = Date.now()): Journal {
  if (!j.active || !Number.isFinite(amount) || amount === 0) return j;
  return {
    ...j,
    sessions: j.sessions.map((s) =>
      s.id === j.active
        ? {
            ...s,
            flows: [
              ...s.flows,
              {
                at: Math.max(s.start + 1, Math.min(at, s.points.at(-1)!.at)),
                amount: Math.round(amount * 100),
              },
            ],
          }
        : s,
    ),
  };
}
export function endSession(j: Journal, finalBalance?: number, at = Date.now()): Journal {
  return {
    ...j,
    active: null,
    paused: true,
    sessions: j.sessions.map((s) =>
      s.id === j.active
        ? {
            ...s,
            end: at,
            points:
              finalBalance === undefined
                ? s.points
                : [
                    ...s.points,
                    { at, handId: 'Closing balance', balance: Math.round(finalBalance * 100) },
                  ],
          }
        : s,
    ),
  };
}
export function buckets(s: BrowserSession, minutes: number) {
  const size = minutes * 60000,
    out = new Map<number, { at: number; delta: number; net: number; count: number }>();
  for (let i = 1; i < s.points.length; i++) {
    const p = s.points[i],
      at = Math.floor(p.at / size) * size,
      delta = netAt(s, p) - netAt(s, s.points[i - 1]);
    const b = out.get(at) || { at, delta: 0, net: 0, count: 0 };
    b.delta += delta;
    b.net = netAt(s, p);
    b.count++;
    out.set(at, b);
  }
  return [...out.values()];
}
export function restoreJournal(value: unknown): Journal {
  try {
    const j = value as Journal;
    if (!j || !Array.isArray(j.sessions)) return emptyJournal();
    const sessions = j.sessions
      .filter(
        (s) =>
          s &&
          typeof s.id === 'string' &&
          Number.isFinite(s.start) &&
          ['€', '£', '$'].includes(s.currency) &&
          Array.isArray(s.points) &&
          s.points.length &&
          s.points.every(
            (p) => Number.isFinite(p.at) && Number.isInteger(p.balance) && p.balance >= 0,
          ) &&
          Array.isArray(s.flows) &&
          s.flows.every((f) => Number.isFinite(f.at) && Number.isInteger(f.amount)),
      )
      .slice(-50);
    return {
      sessions,
      active: null,
      paused: false,
      ...(j.pendingReset ? { pendingReset: true } : {}),
    };
  } catch {
    return emptyJournal();
  }
}
export function money(cents: number, currency = '€', signed = false) {
  return `${signed && cents > 0 ? '+' : cents < 0 ? '−' : ''}${currency}${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function resetGraph(j: Journal, at = Date.now()): Journal {
  return {
    ...j,
    active: null,
    paused: false,
    pendingReset: true,
    sessions: j.sessions.map((s) => (s.id === j.active ? { ...s, end: at } : s)),
  };
}
