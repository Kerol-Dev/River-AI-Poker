import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyBook,
  emptyObservation,
  observeOpponents,
  rangeFor,
  foldEstimate,
} from '../src/reader/opponents';
import { makePlan } from '../src/reader/strategy';
import { ReaderSnapshot } from '../src/reader/model';
import { calculateEquity } from '../src/engine/equity';
import { parseCard } from '../src/engine/cards';
const sample = (): ReaderSnapshot => ({
  version: 1,
  source: 'test',
  key: 'k',
  handId: '1',
  receivedAt: 10000,
  hole: ['As', 'Qh'],
  board: ['Qs', '7d', '2c'],
  pot: 4,
  call: 1,
  currency: '€',
  heroBet: 0.5,
  opponents: 1,
  heroTurn: true,
  actions: ['fold', 'call', 'raise'],
  actionAmounts: { call: 1, raise: 2.5 },
  sizing: { min: 2.5, max: 10.5, editable: true },
  seats: [
    { id: 'hero', hero: true, inHand: true, label: 'You', stack: 10, bet: 0.5 },
    {
      id: 'v',
      hero: false,
      inHand: true,
      label: 'Player',
      username: 'Atlas',
      stack: 10,
      bet: 1.5,
      lastAction: null,
    },
  ],
  dealer: null,
  errors: [],
  mapping: { mapped: 5, total: 5 },
});
const result = {
  equity: 0.9,
  win: 0.9,
  loss: 0.1,
  tie: 0,
  margin: 0.01,
  trials: 6000,
  distribution: [],
  made: 'One pair',
};
describe('public opponent observations', () => {
  it('deduplicates repeated packets and follows public usernames across seats', () => {
    let book = emptyBook();
    const state = emptyObservation();
    let s = sample();
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.hands, 1);
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.hands, 1);
    s = { ...s, seats: s.seats.map((p) => (p.hero ? p : { ...p, lastAction: 'check' })) };
    book = observeOpponents(book, state, s);
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.checks, 1);
    s = { ...s, handId: '2', seats: s.seats.map((p) => (p.hero ? p : { ...p, id: 'other' })) };
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.hands, 2);
  });
  it('does not invent a bluff from hidden cards or a duplicate-card reveal', () => {
    let book = emptyBook();
    const state = emptyObservation();
    let s = { ...sample(), board: ['Ks', 'Jd', '8h', '5c', '2s'] };
    book = observeOpponents(book, state, s);
    s = { ...s, seats: s.seats.map((p) => (p.hero ? p : { ...p, lastAction: 'bet', bet: 2 })) };
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.riverBluffCandidates, 0);
    s = { ...s, seats: s.seats.map((p) => (p.hero ? p : { ...p, shown: ['Ks', '3d'] })) };
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.showdowns, 0);
    s = { ...s, seats: s.seats.map((p) => (p.hero ? p : { ...p, shown: ['9c', '3d'] })) };
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.riverBluffCandidates, 1);
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.riverBluffCandidates, 1);
  });
  it('keeps unknown ranges and fold rates until minimum observed samples exist', () => {
    let book = observeOpponents(emptyBook(), emptyObservation(), sample());
    const p = book.profiles.Atlas;
    assert.equal(rangeFor(p), 'random');
    assert.equal(foldEstimate(p), null);
    assert.equal(rangeFor({ ...p, pricedPre: 30, enteredPre: 1 }), 'tight');
    const f = foldEstimate({ ...p, faced: 40, foldedFacing: 30 })!;
    assert.equal(f.n, 40);
    assert.ok(f.lower < 0.75 && f.upper > 0.75);
  });
  it('does not attribute a stale check label to a new chip commitment', () => {
    const state = emptyObservation();
    let s = {
      ...sample(),
      actorSeat: 'v',
      seats: sample().seats.map((p) => (p.hero ? p : { ...p, lastAction: 'check' })),
    };
    let book = observeOpponents(emptyBook(), state, s);
    s = { ...s, actorSeat: 'hero', seats: s.seats.map((p) => (p.hero ? p : { ...p, bet: 3 })) };
    book = observeOpponents(book, state, s);
    assert.equal(book.profiles.Atlas.actions, 0);
  });
});
describe('bounded readable sizing', () => {
  it('computes raise-to and incremental cost, within stack and minimum', () => {
    const p = makePlan(sample(), result, emptyBook(), 10000)!;
    assert.equal(p.action, 'Raise');
    assert.equal(p.target, 5.25);
    assert.equal(p.amount, 4.75);
    assert.equal(p.intent, 'value');
    const s = sample();
    s.seats[0].stack = 3;
    const short = makePlan(s, result, emptyBook(), 10000)!;
    assert.equal(short.target, 3.5);
    assert.equal(short.amount, 3);
  });
  it('falls back to a legal call if bounds cannot be read and blocks sitting out', () => {
    const s = { ...sample(), heroBet: null };
    assert.equal(makePlan(s, result, emptyBook(), 10000)?.action, 'Call');
    assert.equal(makePlan({ ...sample(), sittingOut: true }, result, emptyBook(), 10000), null);
  });
  it('accepts distinct opponent ranges and rejects mismatched range counts', () => {
    const input = {
      hole: ['As', 'Ah'].map(parseCard),
      board: [],
      opponents: 2,
      trials: 500,
      range: 'random' as const,
      opponentRanges: ['tight', 'wide'] as ('tight' | 'wide')[],
    };
    const r = calculateEquity(input);
    assert.ok(r.equity > 0 && r.equity < 1);
    assert.throws(() => calculateEquity({ ...input, opponentRanges: ['tight'] }));
  });
});
