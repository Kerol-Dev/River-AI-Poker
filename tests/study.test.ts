import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, evaluate } from '../src/engine/cards';
import { calculateEquity, EquityInput } from '../src/study/equity';
import { drawStrength } from '../src/study/range-model';
import { reviewHand } from '../src/study/review';
import { studyExamples } from '../src/study/examples';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserDecision } from '../src/components/BrowserDecision';
const cards = (s: string) => s.split(' ').map(parseCard);
function example(i: number) {
  const e = studyExamples[i];
  const input: EquityInput = {
    hole: e.hole,
    board: e.board,
    range: 'random',
    trials: 8000,
    opponents: 1,
    situation: { actions: [e.action], pressure: e.call / (e.pot - e.call) },
  };
  const result = calculateEquity(input);
  return { input, result, review: reviewHand(input, result, e.pot, e.call) };
}
describe('offline range sensitivity', () => {
  it('separates zero outright wins from split equity in the counterfeited-pair example', () => {
    const { result, review } = example(0);
    assert.equal(result.win, 0);
    assert.equal(result.exact, true);
    assert.equal(result.margin, 0);
    assert.ok(Math.abs(result.analysis!.baseline.equity - 667 / 1980) < 1e-12);
    assert.ok(result.equity < result.analysis!.baseline.equity);
    assert.ok(result.analysis!.cautious.equity < result.equity);
    assert.equal(review.action, 'Fold candidate');
    assert.equal(review.boardOnly, true);
    assert.ok(Math.abs(review.breakEvenTie! - 6 / 11) < 1e-12);
  });
  it('does not call the high-card flop example on random-range equity alone', () => {
    const { result, review } = example(1);
    assert.ok(result.analysis!.baseline.equity > 0.35);
    assert.ok(result.equity < 0.3);
    assert.equal(review.backdoorsOnly, true);
    assert.equal(review.action, 'Fold candidate');
    assert.equal(review.threshold, 1 / 3);
  });
  for (const index of [5, 6])
    it(`tests the betting range for ${studyExamples[index].name}`, () => {
      const { result, review } = example(index);
      assert.ok(result.analysis!.baseline.equity > review.threshold);
      assert.ok(result.equity < review.threshold);
      assert.equal(review.action, 'Fold candidate');
    });
  it('allows a profitable split-only call instead of folding every zero-win hand', () => {
    const { result, review } = example(2);
    assert.equal(result.win, 0);
    assert.equal(result.tie, 1);
    assert.equal(result.equity, 0.5);
    assert.equal(review.action, 'Call candidate');
  });
  it('preserves the nuts and a cheaply priced strong draw', () => {
    const nuts = example(3),
      draw = example(4);
    assert.equal(nuts.result.win, 1);
    assert.equal(nuts.result.analysis!.continuation.equity, 1);
    assert.equal(nuts.review.action, 'Call candidate');
    assert.equal(draw.review.action, 'Call candidate');
    assert.equal(draw.review.backdoorsOnly, false);
  });
  it('uses exact enumeration independent of seed or requested sample count on a heads-up river', () => {
    const { input, result } = example(0);
    assert.deepEqual(
      calculateEquity({ ...input, trials: 1 }, () => 0.5),
      result,
    );
    assert.equal(result.trials, 990);
    const available = Array.from({ length: 52 }, (_, i) => i).filter(
      (c) => ![...input.hole, ...input.board].includes(c),
    );
    let wins = 0,
      ties = 0,
      count = 0;
    const score = evaluate([...input.hole, ...input.board]).score;
    for (let i = 0; i < available.length; i++)
      for (let j = i + 1; j < available.length; j++) {
        const other = evaluate([available[i], available[j], ...input.board]).score;
        wins += +(score > other);
        ties += +(score === other);
        count++;
      }
    assert.equal(result.analysis!.baseline.equity, (wins + ties / 2) / count);
  });
  it('keeps repeated sampled analysis stable', () => {
    const { input, result } = example(1);
    assert.deepEqual(calculateEquity(input), result);
  });
  it('splits multiway pots by the number of winners, not a fixed half', () => {
    const input: EquityInput = {
      hole: cards('2c 3d'),
      board: cards('Ah Kh Qh Jh Th'),
      opponents: 3,
      range: 'random',
      trials: 1000,
      situation: { actions: ['bet', 'unknown', 'unknown'], pressure: 1 },
    };
    const result = calculateEquity(input);
    assert.equal(result.equity, 0.25);
    assert.equal(result.tie, 1);
    assert.equal(result.exact, false);
    assert.equal(result.analysis!.cautious.equity, 0.25);
  });
  it('normalizes outcomes and distributions for multiple weighted opponents', () => {
    const { input } = example(4);
    const result = calculateEquity({
      ...input,
      opponents: 3,
      opponentRanges: ['tight', 'balanced', 'wide'],
      trials: 2000,
      situation: { actions: ['raise', 'call', 'unknown'], pressure: 0.8 },
    });
    for (const r of [
      result,
      result.analysis!.baseline,
      result.analysis!.cautious,
      result.analysis!.continuation,
    ]) {
      assert.ok(Math.abs(r.win + r.tie + r.loss - 1) < 1e-10);
      assert.ok(r.equity >= r.win && r.equity <= r.win + r.tie);
    }
    assert.ok(Math.abs(result.distribution.reduce((a, b) => a + b, 0) - 1) < 1e-10);
  });
  it('keeps aces plausible preflop and does not rank backdoors as immediate draws', () => {
    const result = calculateEquity({
      hole: cards('As Ah'),
      board: [],
      opponents: 1,
      range: 'random',
      trials: 8000,
      situation: { actions: ['unknown'], pressure: 0 },
    });
    assert.ok(result.equity > 0.82 && result.equity < 0.89);
    assert.equal(drawStrength(cards('Jh 5h'), cards('Qh Ac 7s')), 0);
    assert.ok(drawStrength(cards('Jh Th'), cards('Qh 9h 2s')) > 0);
    assert.equal(
      drawStrength(cards('2c 7d'), cards('5s 6c 7h 8s')),
      0,
      'a duplicated board rank does not create a private straight draw',
    );
  });
  it('makes price and the adjustable reserve explicit, and checks for free', () => {
    const { input, result } = example(2);
    assert.equal(reviewHand(input, result, 10, 0).action, 'Check candidate');
    assert.equal(reviewHand(input, result, 10, 2, 0).action, 'Call candidate');
    assert.equal(reviewHand(input, result, 10, 2, 40).action, 'Fold candidate');
    assert.equal(reviewHand(input, result, 10, 20).action, 'Fold candidate');
    assert.equal(reviewHand(input, result, 10, 2, 0).conservativeEV, 4);
    assert.equal(reviewHand(input, result, 10, 2, 100).decisionFloor, 0);
  });
  it('rejects impossible cards, malformed ranges, actions, and prices', () => {
    const { input, result } = example(0);
    assert.throws(() => calculateEquity({ ...input, hole: [input.hole[0], input.hole[0]] }));
    assert.throws(() => calculateEquity({ ...input, range: 'toString' as any }));
    assert.throws(() => calculateEquity({ ...input, situation: { actions: [], pressure: 1 } }));
    assert.throws(() =>
      calculateEquity({ ...input, situation: { actions: ['unknown'], pressure: Infinity } }),
    );
    assert.throws(() => calculateEquity({ ...input, trials: 0 }));
    for (const bad of [-1, NaN, Infinity]) {
      assert.throws(() => reviewHand(input, result, bad, 1));
      assert.throws(() => reviewHand(input, result, 1, bad));
      assert.throws(() => reviewHand(input, result, 1, 0, bad));
    }
  });
});
describe('read-only outcome presentation', () => {
  it('keeps win, tie and pot share distinct with an action present', () => {
    const html = renderToStaticMarkup(
      createElement(BrowserDecision, {
        action: 'Call',
        equity: 1 / 3,
        win: 0,
        tie: 2 / 3,
        threshold: 0.27,
      }),
    );
    for (const label of ['Win outright', 'Tie', 'Pot share', '0.0%', '66.7%', '33.3%'])
      assert.ok(html.includes(label));
  });
  it('does not label missing outcomes as zero', () => {
    const html = renderToStaticMarkup(createElement(BrowserDecision, { equity: 0.5 }));
    assert.ok(!html.includes('>0.0%</strong>'));
    assert.ok(html.includes('—'));
  });
});
