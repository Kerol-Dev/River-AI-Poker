import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { emptyDisplay, presentCards } from '../src/reader/presentation';
import {
  addFlow,
  balanceAtBoundary,
  buckets,
  checkpoint,
  emptyJournal,
  endSession,
  resetGraph,
  netAt,
  restoreJournal,
  sessionNet,
} from '../src/reader/journal';
import { ReaderSnapshot } from '../src/reader/model';
function sample(at = 10000): ReaderSnapshot {
  return {
    version: 1,
    source: 'update-com.p365play.com',
    key: '',
    handId: '100',
    hole: ['As', 'Qh'],
    board: [],
    pot: 0.06,
    call: 0.02,
    currency: '€',
    heroBet: 0.02,
    actionAmounts: { call: 0.02, raise: 0.08 },
    opponents: 1,
    heroTurn: true,
    actions: ['fold', 'call', 'raise'],
    seats: [{ id: 'player-seat-3', hero: true, inHand: true, label: 'You', stack: 9.98 }],
    dealer: null,
    errors: [],
    mapping: { mapped: 5, total: 5 },
    receivedAt: at,
  };
}
describe('steady card presentation', () => {
  it('retains cards during a short invalidation but expires on a real disconnect', () => {
    let d = presentCards(emptyDisplay(), sample(), 10000);
    assert.equal(d.hole.length, 2);
    d = presentCards(d, null, 10500);
    assert.equal(d.hole.length, 2);
    assert.equal(d.holding, true);
    assert.equal(presentCards(d, null, 11401).hole.length, 0);
  });
  it('retains a full flop through disappearing and partial card animations', () => {
    const s = { ...sample(), board: ['2c', '3d', '4h'] };
    let d = presentCards(emptyDisplay(), s, 10000);
    d = presentCards(d, { ...s, board: ['2c'], receivedAt: 10300 }, 10300);
    assert.equal(d.board.length, 3);
    assert.equal(d.holding, true);
    d = presentCards(d, { ...s, board: ['2c', '3d', '4h', '5s'], receivedAt: 10500 }, 10500);
    assert.equal(d.board.length, 4);
    assert.equal(d.holding, false);
  });
  it('never carries old cards into a new hand or accepts duplicate cards', () => {
    const d = presentCards(emptyDisplay(), sample(), 10000);
    assert.equal(
      presentCards(d, { ...sample(10100), handId: '101', hole: [] }, 10100).hole.length,
      0,
    );
    assert.equal(
      presentCards(emptyDisplay(), { ...sample(), board: ['As', '2c', '3h'] }, 10000).hole.length,
      0,
    );
  });
  it('does not prolong the hold by polling an unchanged timestamp', () => {
    const d = presentCards(emptyDisplay(), sample(), 10200);
    assert.equal(d.at, 10000);
    assert.equal(presentCards(d, null, 11401).hole.length, 0);
  });
});
describe('browser session accounting', () => {
  it('includes posted chips and excludes mid-hand fluctuations', () => {
    const s = sample();
    assert.equal(balanceAtBoundary(s), 1000);
    assert.equal(balanceAtBoundary({ ...s, board: ['2c', '3d', '4h'] }), null);
    assert.equal(balanceAtBoundary({ ...s, heroBet: null }), null);
  });
  it('records a hand once and bins actual net changes by time', () => {
    let j = checkpoint(emptyJournal(), sample(1000));
    j = checkpoint(j, {
      ...sample(601000),
      handId: '101',
      seats: [{ ...sample().seats[0], stack: 11.98 }],
    });
    j = checkpoint(j, { ...sample(602000), handId: '101' });
    assert.equal(j.sessions[0].points.length, 2);
    assert.equal(sessionNet(j.sessions[0]), 200);
    assert.equal(buckets(j.sessions[0], 10)[0].delta, 200);
    assert.equal(buckets(j.sessions[0], 60)[0].delta, 200);
  });
  it('separates buy-ins and withdrawals from earnings and preserves cents', () => {
    let j = checkpoint(emptyJournal(), sample(1000));
    j = checkpoint(j, {
      ...sample(601000),
      handId: '101',
      seats: [{ ...sample().seats[0], stack: 14.98 }],
    });
    j = addFlow(j, 5, 602000);
    assert.equal(sessionNet(j.sessions[0]), 0);
    j = endSession(j, 12, 603000);
    j = { ...j, active: j.sessions[0].id };
    j = addFlow(j, -3, 604000);
    assert.equal(sessionNet(j.sessions[0]), 0);
    assert.equal(netAt(j.sessions[0], j.sessions[0].points[0]), 0);
  });
  it('starts a different session for a changed currency or seat', () => {
    const j = checkpoint(checkpoint(emptyJournal(), sample()), { ...sample(12000), currency: '£' });
    assert.equal(j.sessions.length, 2);
    assert.equal(sessionNet(j.sessions[1]), 0);
  });
  it('saves an explicit closing balance and keeps paused tracking paused', () => {
    let j = endSession(checkpoint(emptyJournal(), sample()), 12);
    assert.equal(sessionNet(j.sessions[0]), 200);
    assert.equal(j.active, null);
    assert.equal(j.paused, true);
    assert.equal(checkpoint(j, { ...sample(), handId: '101' }), j);
  });
  it('does not join a prior session across an app restart', () => {
    const restored = restoreJournal(checkpoint(emptyJournal(), sample()));
    assert.equal(restored.active, null);
    assert.equal(restored.sessions.length, 1);
    assert.deepEqual(restoreJournal({ sessions: [{ points: [] }] }), emptyJournal());
  });
});
function autoFixture() {
  const sandbox: any = {};
  runInNewContext(
    readFileSync(new URL('../browser-extension/autoplay.js', import.meta.url), 'utf8'),
    sandbox,
  );
  let time = 10000,
    s: any = sample(),
    clicks: string[] = [];
  const key = () => sandbox.RiverAutoplay.keyOf(s);
  const controller = sandbox.RiverAutoplay.create({
    read: () => s,
    now: () => time,
    click: (a: string) => {
      clicks.push(a);
      return true;
    },
  });
  const tick = (action = 'Call') => controller.observe(s, { key: key(), action, updatedAt: time });
  return {
    controller,
    clicks,
    tick,
    get s() {
      return s;
    },
    set s(value) {
      s = value;
    },
    advance: (n: number) => (time += n),
  };
}
describe('user-controlled automatic play on a synthetic table only', () => {
  it('never acts before explicit start or before the full countdown', () => {
    const f = autoFixture();
    f.tick();
    f.advance(5000);
    f.tick();
    assert.equal(f.clicks.length, 0);
    f.controller.start({ perAction: 1, budget: 5, actions: 10, delay: 1800 });
    f.tick();
    f.advance(1799);
    f.tick();
    assert.equal(f.clicks.length, 0);
    f.advance(1);
    f.tick();
    assert.deepEqual(f.clicks, ['call']);
  });
  it('does not retry a submitted action even if the same turn remains visible', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.tick();
    f.advance(1800);
    f.tick();
    f.advance(5000);
    f.tick();
    assert.equal(f.clicks.length, 1);
    f.advance(8000);
    f.tick();
    assert.equal(f.controller.status().running, false);
    assert.equal(f.clicks.length, 1);
  });
  it('cancels the countdown when cards, bets or the hand change', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.tick();
    f.advance(1700);
    f.s = { ...f.s, call: 0.5 };
    f.tick();
    f.advance(100);
    f.tick();
    assert.equal(f.clicks.length, 0);
    f.s = { ...f.s, errors: ['Cards changing'] };
    f.tick();
    f.advance(5000);
    f.tick();
    assert.equal(f.clicks.length, 0);
  });
  it('stops before exceeding the per-action or total spend cap', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 0.01, budget: 0.01, actions: 10 });
    f.tick();
    assert.equal(f.clicks.length, 0);
    assert.equal(f.controller.status().running, false);
  });
  it('does not click when a recommendation has no matching legal action', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.tick('Bet');
    assert.equal(f.controller.status().running, false);
    assert.equal(f.clicks.length, 0);
  });
  it('uses verified incremental raise cost and stops if the amount is unreadable', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 0.06, budget: 1, actions: 1 });
    f.tick('Raise');
    f.advance(1800);
    f.tick('Raise');
    assert.deepEqual(f.clicks, ['raise']);
    assert.equal(f.controller.status().spent, 6);
    assert.equal(f.controller.status().running, false);
    const g = autoFixture();
    g.s = { ...g.s, heroBet: null };
    g.controller.start({ perAction: 1, budget: 5, actions: 10 });
    g.tick('Raise');
    assert.equal(g.clicks.length, 0);
    assert.equal(g.controller.status().running, false);
  });
  it('requires positive limits, respects Stop, and stops on table identity change', () => {
    const f = autoFixture();
    assert.throws(() => f.controller.start({ perAction: 0, budget: 1, actions: 10 }));
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.tick();
    f.controller.stop('Stopped');
    f.advance(3000);
    f.tick();
    assert.equal(f.clicks.length, 0);
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.s = { ...f.s, currency: '£' };
    f.tick();
    assert.equal(f.controller.status().running, false);
  });
  it('rejects stale decisions and expires the ten-minute run', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 5, actions: 10, minutes: 10 });
    f.controller.observe(f.s, { key: 'wrong', action: 'Call', updatedAt: 0 });
    f.advance(2000);
    f.controller.observe(f.s, { key: 'wrong', action: 'Call', updatedAt: 0 });
    assert.equal(f.clicks.length, 0);
    f.advance(600000);
    f.tick();
    assert.equal(f.controller.status().running, false);
  });
});

describe('session reset', () => {
  it('archives the old graph and starts the next checkpoint from zero', () => {
    let j = checkpoint(emptyJournal(), sample());
    j = checkpoint(j, {
      ...sample(12000),
      handId: '101',
      seats: [{ ...sample().seats[0], stack: 11.98 }],
    });
    j = resetGraph(j, 13000);
    assert.equal(j.active, null);
    assert.equal(j.pendingReset, true);
    assert.equal(j.sessions[0].end, 13000);
    assert.equal(sessionNet(j.sessions[0]), 200);
    assert.equal(restoreJournal(j).pendingReset, true);
    j = checkpoint(j, { ...sample(14000), handId: '102' });
    assert.equal(j.sessions.length, 2);
    assert.equal(sessionNet(j.sessions[1]), 0);
    assert.equal(j.pendingReset, false);
  });
});
describe('automatic timing and sizing regressions on fake chips', () => {
  it('ignores timer changes but stops when the site sits the player out', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1000, budget: 1000, actions: 1000 });
    f.s = { ...f.s, timeLeft: 10 };
    f.tick();
    f.advance(900);
    f.s = { ...f.s, timeLeft: 9 };
    f.tick();
    assert.equal(f.clicks.length, 1);
    f.s = { ...f.s, sittingOut: true };
    f.tick();
    assert.equal(f.controller.status().running, false);
    assert.match(f.controller.status().reason, /sitting out/);
  });
  it('uses a free check or fold when the visible deadline is imminent and guidance is late', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 1, actions: 10, timeoutFallback: true });
    f.s = { ...f.s, timeLeft: 2 };
    f.controller.observe(f.s, null);
    f.advance(151);
    f.controller.observe(f.s, null);
    assert.deepEqual(f.clicks, ['fold']);
    const g = autoFixture();
    g.controller.start({ perAction: 1, budget: 1, actions: 10, timeoutFallback: false });
    g.s = { ...g.s, timeLeft: 2 };
    g.controller.observe(g.s, null);
    g.advance(500);
    g.controller.observe(g.s, null);
    assert.equal(g.clicks.length, 0);
  });
  it('accepts a fast street transition as acknowledgement without duplicating a click', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 1, actions: 10 });
    f.tick();
    f.advance(900);
    f.tick();
    f.s = { ...f.s, board: ['2c', '3d', '4h'] };
    f.tick();
    f.advance(900);
    f.tick();
    assert.equal(f.clicks.length, 2);
  });
  it('requires the table to echo an exact sized target before one submission', () => {
    const sandbox: any = {};
    runInNewContext(
      readFileSync(new URL('../browser-extension/autoplay.js', import.meta.url), 'utf8'),
      sandbox,
    );
    let s: any = { ...sample(), sizing: { min: 0.08, max: 10, editable: true } },
      now = 10000,
      clicks = 0;
    const targets: number[] = [];
    const c = sandbox.RiverAutoplay.create({
      read: () => s,
      now: () => now,
      prepare: (t: number) => {
        targets.push(t);
        return true;
      },
      click: () => {
        clicks++;
        return true;
      },
    });
    const observe = () =>
      c.observe(s, {
        key: sandbox.RiverAutoplay.keyOf(s),
        action: 'Raise',
        target: 0.5,
        updatedAt: now,
      });
    c.start({ perAction: 1, budget: 5, actions: 10 });
    observe();
    assert.deepEqual(targets, [0.5]);
    now += 500;
    observe();
    assert.equal(clicks, 0);
    s = { ...s, actionAmounts: { ...s.actionAmounts, raise: 0.5 } };
    observe();
    now += 900;
    observe();
    assert.equal(clicks, 1);
    assert.equal(c.status().spent, 48);
  });
});

describe('automatic pauses and stop explanations', () => {
  it('pauses during a brief blank pot/seat reading and restarts the action countdown', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.tick();
    f.advance(800);
    const original = f.s;
    f.s = { ...original, currency: '', seats: [], handId: '' };
    f.tick();
    assert.equal(f.controller.status().running, true);
    assert.match(f.controller.status().reason, /refreshes/);
    assert.equal(f.clicks.length, 0);
    f.advance(500);
    f.s = original;
    f.tick();
    assert.equal(f.clicks.length, 0);
    f.advance(899);
    f.tick();
    assert.equal(f.clicks.length, 0);
    f.advance(1);
    f.tick();
    assert.equal(f.clicks.length, 1);
  });
  it('stops on prolonged missing identity and preserves that first reason', () => {
    const f = autoFixture();
    f.controller.start({ perAction: 1, budget: 5, actions: 10 });
    f.s = { ...f.s, currency: '' };
    f.tick();
    f.advance(3500);
    f.tick();
    assert.equal(f.controller.status().running, false);
    const reason = f.controller.status().reason;
    assert.match(reason, /unreadable/);
    f.controller.stop('Another event');
    assert.equal(f.controller.status().reason, reason);
    assert.equal(f.clicks.length, 0);
  });
  it('enforces max bet per round across streets, resets on the next round, and caps rounds and 3-hour duration', () => {
    const f = autoFixture();
    assert.throws(() => f.controller.start({ perRound: 1, maxLoss: 5, rounds: 2, minutes: 181 }));
    f.controller.start({ perRound: 0.03, maxLoss: 5, rounds: 1, minutes: 180 });
    assert.equal(f.controller.status().maxMinutes, 180);
    assert.equal(f.controller.status().timeRemaining, 10800);
    // Street 1 of hand 100: call €0.02 -> roundSpent = 2 cents, rounds = 1
    f.tick('Call');
    f.advance(900);
    f.tick('Call');
    assert.equal(f.clicks.length, 1);
    assert.equal(f.controller.status().roundSpent, 2);
    assert.equal(f.controller.status().rounds, 1);
    assert.equal(f.controller.status().running, true);
    // Street 2 of hand 100: another €0.02 call would push roundSpent to 4c (> 3c perRound cap)
    f.s = { ...f.s, board: ['2c', '3d', '4h'] };
    f.tick('Call');
    assert.equal(f.controller.status().running, false);
    assert.match(f.controller.status().reason, /Max bet per round/);
  });
  it('allows multi-street play within a round, resets round bet on a new hand, and stops when max rounds or net loss is reached', () => {
    const f = autoFixture();
    f.controller.start({ perRound: 0.05, maxLoss: 0.5, rounds: 1, minutes: 180 });
    // Preflop call €0.02 in hand 100
    f.tick('Call');
    f.advance(900);
    f.tick('Call');
    assert.equal(f.controller.status().rounds, 1);
    assert.equal(f.controller.status().roundSpent, 2);
    // Flop call €0.02 in same hand 100 -> allowed because still in round 1 and 4c <= 5c perRound
    f.s = { ...f.s, board: ['2c', '3d', '4h'] };
    f.tick('Call');
    f.advance(900);
    f.tick('Call');
    assert.equal(f.clicks.length, 2);
    assert.equal(f.controller.status().rounds, 1);
    assert.equal(f.controller.status().roundSpent, 4);
    assert.equal(f.controller.status().running, true);
    // Hand 101 begins -> roundSpent resets to 0 and Auto stops because rounds (1) >= maxRounds (1)
    f.s = { ...f.s, handId: '101', board: [] };
    f.tick('Call');
    assert.equal(f.controller.status().roundSpent, 0);
    assert.equal(f.controller.status().running, false);
    assert.match(f.controller.status().reason, /Max rounds reached/);

    // Net stack drawdown test for maxLoss
    const g = autoFixture();
    g.controller.start({ perRound: 2, maxLoss: 0.5, rounds: 10, minutes: 60 });
    // Hero started with 9.98 + 0.02 heroBet = 10.00 balance. Drop Hero stack to 9.52 (48c loss so far)
    g.s = {
      ...g.s,
      handId: '200',
      heroBet: 0,
      call: 0.05,
      seats: g.s.seats.map((p: any) => (p.hero ? { ...p, stack: 9.52, bet: 0 } : p)),
    };
    // Calling 0.05 would bring total net loss to 0.48 + 0.05 = 0.53 > 0.50 maxLoss
    g.tick('Call');
    assert.equal(g.clicks.length, 0);
    assert.equal(g.controller.status().running, false);
    assert.match(g.controller.status().reason, /Max loss limit reached/);
  });
});
