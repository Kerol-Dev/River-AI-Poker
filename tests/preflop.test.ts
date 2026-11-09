import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReaderSnapshot } from '../src/reader/model';
import { situationFromSnapshot } from '../src/reader/model';
import { makePlan } from '../src/reader/strategy';
import {
  expandRange,
  handCode,
  preflopPlan,
  preflopSpot,
  preflopView,
  RANGES,
} from '../src/reader/preflop';
import { emptyBook } from '../src/reader/opponents';
import { calculateEquity } from '../src/engine/equity';
import { parseCard } from '../src/engine/cards';

// Bet365-shaped snapshots at €0.05/€0.10 blinds.
const seat = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  label: id,
  username: id,
  inHand: true,
  hero: false,
  stack: 10,
  bet: 0,
  lastAction: null,
  shown: [],
  ...o,
});
const folded = (id: string) => seat(id, { inHand: false, lastAction: 'fold' });
function snap(hole: string[], seats: ReturnType<typeof seat>[], o: Record<string, unknown> = {}) {
  return {
    version: 1,
    key: 'k',
    source: 'update-com.p365play.com',
    handId: '1',
    hole,
    board: [],
    currency: '€',
    heroBet: 0,
    actions: ['fold', 'call', 'raise'],
    heroTurn: true,
    dealer: null,
    errors: [],
    mapping: { mapped: 9, total: 9 },
    receivedAt: Date.now(),
    sizing: { min: 0.2, max: 10, editable: true },
    actionAmounts: {},
    pot: 0.15,
    call: 0.1,
    ...o,
    seats: [
      ...seats,
      seat('hero', {
        hero: true,
        label: 'You',
        bet: (o.heroBet as number) ?? 0,
        lastAction: (o.heroAction as string) ?? null,
      }),
    ],
    opponents: seats.filter((p) => p.inHand).length,
  } as unknown as ReaderSnapshot;
}
const unopened = () => [
  seat('hj'),
  seat('co'),
  seat('btn'),
  seat('sb', { bet: 0.05 }),
  seat('bb', { bet: 0.1 }),
];
function decide(s: ReaderSnapshot) {
  const view = preflopView(s);
  const r = calculateEquity(
    {
      hole: s.hole.map(parseCard),
      board: [],
      opponents: view.opponents,
      range: 'random',
      trials: 4000,
      situation: situationFromSnapshot(view),
    },
    (() => {
      let x = 7;
      return () => (x = (x * 16807) % 2147483647) / 2147483647;
    })(),
  );
  return makePlan(view, r, emptyBook(), Date.now());
}

describe('preflop hand notation and ranges', () => {
  it('names hands and expands range shorthand', () => {
    assert.equal(handCode(['Ah', 'Qc']), 'AQo');
    assert.equal(handCode(['Qs', 'As']), 'AQs');
    assert.equal(handCode(['9d', '9c']), '99');
    assert.equal(handCode(['10h', 'Js']), 'JTo');
    assert.deepEqual([...expandRange('QQ+')].sort(), ['AA', 'KK', 'QQ']);
    assert.deepEqual([...expandRange('ATs+')].sort(), ['AJs', 'AKs', 'AQs', 'ATs']);
    assert.deepEqual([...expandRange('A5s-A3s')].sort(), ['A3s', 'A4s', 'A5s']);
    assert.ok(RANGES.open.has('AQo') && RANGES.open.has('22') && !RANGES.open.has('72o'));
  });
});

describe('preflop spots', () => {
  it('reads unopened, raised and re-raised pots; posted blinds are not actions', () => {
    assert.equal(preflopSpot(snap(['Ah', 'Qc'], unopened())).spot, 'unopened');
    const raised = snap(
      ['Ah', 'Qc'],
      [
        seat('utg', { bet: 0.3, lastAction: 'raise' }),
        seat('sb', { bet: 0.05 }),
        seat('bb', { bet: 0.1 }),
      ],
      { pot: 0.45, call: 0.3 },
    );
    assert.equal(preflopSpot(raised).spot, 'raised');
    // Only the raiser realistically plays; the blinds have not acted.
    assert.equal(preflopView(raised).opponents, 1);
    assert.equal(preflopView(snap(['Ah', 'Qc'], unopened())).opponents, 1);
    assert.equal(
      preflopSpot(
        snap(['Ah', 'Qc'], [seat('bb', { bet: 0.9, lastAction: 'raise' })], {
          heroBet: 0.3,
          heroAction: 'raise',
          pot: 1.25,
          call: 0.6,
        }),
      ).spot,
      'reraised',
    );
  });
  it('reads any price as a raise on sites without visible actions', () => {
    const s = { ...snap(['Ah', 'Qc'], [seat('a'), seat('b'), seat('c')]), source: 'web:x.test' };
    assert.deepEqual(preflopSpot(s), { spot: 'raised', known: false });
    assert.equal(preflopView(s).opponents, 2);
  });
});

describe('preflop decisions', () => {
  it('raises AQo first in to about 2.5 big blinds', () => {
    const d = decide(snap(['Ah', 'Qc'], unopened()))!;
    assert.equal(d.action, 'Raise');
    assert.equal(d.target, 0.25);
    assert.deepEqual(d.preflop, { spot: 'unopened', code: 'AQo' });
  });
  it('calls AQo against one raise even with the blinds still to act', () => {
    const d = decide(
      snap(
        ['Ah', 'Qc'],
        [
          seat('utg', { bet: 0.3, lastAction: 'raise' }),
          folded('hj'),
          seat('sb', { bet: 0.05 }),
          seat('bb', { bet: 0.1 }),
        ],
        { pot: 0.45, call: 0.3 },
      ),
    )!;
    assert.equal(d.action, 'Call');
  });
  it('re-raises premiums, folds junk and defends the big blind at a good price', () => {
    assert.equal(decide(snap(['7h', '2c'], unopened()))!.action, 'Fold');
    const vsRaise = (hole: string[]) =>
      decide(
        snap(hole, [seat('btn', { bet: 0.25, lastAction: 'raise' }), folded('sb')], {
          pot: 0.4,
          call: 0.15,
          heroBet: 0.1,
        }),
      )!.action;
    assert.equal(vsRaise(['Ah', 'Ac']), 'Raise');
    assert.equal(vsRaise(['Kh', '9c']), 'Call');
    assert.equal(vsRaise(['7h', '2c']), 'Fold');
  });
  it('checks the big blind option with a weak hand and raises limpers with a strong one', () => {
    const limped = (hole: string[]) =>
      decide(
        snap(
          hole,
          [
            seat('utg', { bet: 0.1, lastAction: 'call' }),
            seat('btn', { bet: 0.1, lastAction: 'call' }),
          ],
          { pot: 0.35, call: 0, heroBet: 0.1, actions: ['check', 'raise'] },
        ),
      )!.action;
    assert.equal(limped(['8h', '6c']), 'Check');
    assert.equal(limped(['Ah', 'Qc']), 'Raise');
  });
  it('only commits a large share of the stack with the strongest hands', () => {
    const shove = (hole: string[]) =>
      preflopPlan(
        snap(hole, [seat('btn', { bet: 5, lastAction: 'raise' })], {
          pot: 5.15,
          call: 5,
          heroBet: 0,
        }),
        0.45,
        0.49,
      ).action;
    assert.equal(shove(['Kh', 'Kc']), 'Call');
    assert.equal(shove(['Ah', 'Jc']), 'Fold');
  });
});
