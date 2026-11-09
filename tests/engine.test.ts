import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, parseCard, seeded, shuffled } from '../src/engine/cards';
import { advice, calculateEquity } from '../src/engine/equity';
import { act, botAction, legal, newHand } from '../src/engine/game';
const cards = (text: string) => text.split(' ').map(parseCard);
describe('hand evaluator', () => {
  const fixtures = [
    ['As Ks Qs Js Ts 2d 3c', 8],
    ['Ac Ad Ah As Kd 2c 3h', 7],
    ['Ac Ad Ah Ks Kd Kh 3c', 6],
    ['As Js 9s 7s 2s Kd Qc', 5],
    ['As 2d 3h 4c 5s Kc Qc', 4],
    ['Ac Ad Ah Ks Qd 9c 8h', 3],
    ['Ac Ad Ks Kd Qc Qd 2h', 2],
    ['Ac Ad Ks Qd Jc 9d 2h', 1],
    ['As Kd Jh 9c 7s 4d 2c', 0],
  ] as const;
  for (const [hand, category] of fixtures)
    it(`ranks ${hand}`, () => assert.equal(evaluate(cards(hand)).category, category));
  it('uses kickers and the higher two pairs', () => {
    assert.ok(
      evaluate(cards('Ac Ad Ks Kd Qc Qd 2h')).score > evaluate(cards('Ac Ad Js Jd Kc 9d 2h')).score,
    );
    assert.ok(
      evaluate(cards('Ac Ad Ks Qd Jc 9d 2h')).score > evaluate(cards('Ac Ad Ks Qd Tc 9d 2h')).score,
    );
  });
  it('orders wheel below six-high straight', () =>
    assert.ok(evaluate(cards('2s 3d 4h 5c 6s')).score > evaluate(cards('As 2d 3h 4c 5s')).score));
  it('does not confuse flush plus off-suit straight with straight flush', () =>
    assert.equal(evaluate(cards('As Ks 9s 8s 7s Qh Jd')).category, 5));
  it('handles double trips as aces full of kings', () =>
    assert.deepEqual(evaluate(cards('Ac Ad Ah Ks Kd Kh 3c')).kickers, [14, 13]));
  it('matches the established full-deck five-card category census', () => {
    const counts = Array(9).fill(0);
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) counts[evaluate([a, b, c, d, e]).category]++;
    assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  });
  it('seven-card evaluator agrees with best of 21 five-card subsets', () => {
    const rng = seeded(18);
    for (let k = 0; k < 2000; k++) {
      const hand = shuffled(rng).slice(0, 7);
      let best = 0;
      for (let a = 0; a < 7; a++)
        for (let b = a + 1; b < 7; b++)
          best = Math.max(best, evaluate(hand.filter((_, i) => i !== a && i !== b)).score);
      assert.equal(evaluate(hand).score, best);
    }
  });
});
describe('equity and guidance', () => {
  it('royal flush is unbeatable', () => {
    const r = calculateEquity(
      {
        hole: cards('As Ks'),
        board: cards('Qs Js Ts 2d 3d'),
        opponents: 5,
        range: 'random',
        trials: 100,
      },
      seeded(1),
    );
    assert.equal(r.equity, 1);
    assert.equal(r.win, 1);
  });
  it('splits a board royal flush equally, including multiway', () => {
    const r = calculateEquity(
      {
        hole: cards('2c 3c'),
        board: cards('As Ks Qs Js Ts'),
        opponents: 3,
        range: 'tight',
        trials: 100,
      },
      seeded(2),
    );
    assert.equal(r.equity, 0.25);
    assert.equal(r.tie, 1);
    assert.equal(r.win, 0);
  });
  it('aces have plausible heads-up preflop equity', () => {
    const r = calculateEquity(
      { hole: cards('As Ah'), board: [], opponents: 1, range: 'random', trials: 10000 },
      seeded(100),
    );
    assert.ok(r.equity > 0.83 && r.equity < 0.88, `equity ${r.equity}`);
    assert.ok(Math.abs(r.win + r.tie + r.loss - 1) < 1e-10);
    assert.ok(Math.abs(r.distribution.reduce((a, b) => a + b, 0) - 1) < 1e-10);
  });
  it('rejects duplicated cards and impossible streets', () => {
    assert.throws(() =>
      calculateEquity({
        hole: cards('As As'),
        board: [],
        opponents: 1,
        range: 'random',
        trials: 100,
      }),
    );
    assert.throws(() =>
      calculateEquity({
        hole: cards('As Ah'),
        board: cards('2s'),
        opponents: 1,
        range: 'random',
        trials: 100,
      }),
    );
  });
  it('computes correct pot odds and incremental call EV', () => {
    const a = advice(0.4, 100, 50);
    assert.equal(a.threshold, 1 / 3);
    assert.equal(a.callEV, 10);
    assert.equal(advice(0.1, 100, 50).action, 'Fold');
  });
});
describe('heads-up no-limit engine', () => {
  it('posts blinds and gives button first action', () => {
    const g = newHand();
    assert.equal(g.actor, 0);
    assert.equal(g.pot, 3);
    assert.equal(legal(g).call, 1);
    assert.equal(legal(g).min, 4);
  });
  it('preserves the big blind option after a limp', () => {
    let g = act(newHand(), 'call');
    assert.equal(g.street, 'Preflop');
    assert.equal(g.actor, 1);
    g = act(g, 'check');
    assert.equal(g.street, 'Flop');
    assert.equal(g.actor, 1);
    assert.equal(g.pot, 4);
  });
  it('fold awards the pot and conserves chips', () => {
    const g = act(newHand(), 'fold');
    assert.equal(g.players[0].stack, 199);
    assert.equal(g.players[1].stack, 201);
    assert.ok(g.complete);
  });
  it('enforces check, min-raise, and effective stack limits', () => {
    const g = newHand();
    assert.throws(() => act(g, 'check'));
    assert.throws(() => act(g, 'raise', 3));
    assert.throws(() => act(g, 'raise', 201));
    assert.equal(legal(newHand(1, [20, 200])).max, 20);
  });
  it('runs out all-ins with no uncallable excess', () => {
    let g = act(newHand(1, [30, 200], 0, seeded(9)), 'raise', 30);
    g = act(g, 'call');
    assert.ok(g.complete);
    assert.ok(g.showdown);
    assert.equal(g.board.length, 5);
    assert.equal(g.pot, 60);
    assert.equal(
      g.players.reduce((s, p) => s + p.stack, 0),
      230,
    );
  });
  it('handles one-chip blind all-ins', () => {
    const g = newHand(1, [1, 200]);
    assert.ok(g.complete);
    assert.equal(g.pot, 2);
    assert.equal(
      g.players.reduce((s, p) => s + p.stack, 0),
      201,
    );
  });
  it('short-stack small blind can call the all-in big blind', () => {
    const g = act(newHand(1, [200, 2]), 'call');
    assert.ok(g.complete);
    assert.equal(g.pot, 4);
  });
  it('supports short all-in raises below a full raise', () => {
    let g = newHand(1, [5, 200]);
    g = act(g, 'raise', 4);
    assert.equal(legal(g).min, 5);
    g = act(g, 'raise', 5);
    g = act(g, 'call');
    assert.ok(g.complete);
    assert.equal(g.pot, 10);
  });
  it('conserves chips and finishes 1,000 randomized games', () => {
    const rng = seeded(723);
    for (let h = 0; h < 1000; h++) {
      const stacks = [1 + Math.floor(rng() * 200), 1 + Math.floor(rng() * 200)];
      let g = newHand(h, stacks, h % 2, rng),
        steps = 0;
      while (!g.complete) {
        assert.equal(g.players.reduce((s, p) => s + p.stack, 0) + g.pot, stacks[0] + stacks[1]);
        const l = legal(g);
        const roll = rng();
        const d =
          roll < 0.1
            ? { action: 'fold' as const }
            : l.canRaise && roll > 0.75
              ? {
                  action: 'raise' as const,
                  target: l.min + Math.floor(rng() * (l.max - l.min + 1)),
                }
              : { action: l.check ? ('check' as const) : ('call' as const) };
        g = act(g, d.action, 'target' in d ? d.target : undefined);
        assert.ok(++steps < 60);
        assert.ok(g.players.every((p) => p.stack >= 0));
      }
      assert.equal(
        g.players.reduce((s, p) => s + p.stack, 0),
        stacks[0] + stacks[1],
      );
    }
  });
  it('bot only chooses legal actions', () => {
    const rng = seeded(8);
    for (let i = 0; i < 100; i++) {
      let g = newHand(i, [200, 200], i % 2, rng);
      while (!g.complete) {
        const d = botAction(g, rng(), rng);
        g = act(g, d.action, d.target);
      }
    }
  });
});
