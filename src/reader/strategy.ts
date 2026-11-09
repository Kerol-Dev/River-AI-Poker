import { EquityResult } from '../engine/equity';
import { parseCard, suit } from '../engine/cards';
import { ReaderSnapshot, ReaderDecision, assessSnapshot, evaluateLiveDecision } from './model';
import { foldEstimate, OpponentBook, rangeFor } from './opponents';
const cents = (n: number) => Math.round(n * 100) / 100;
function mix(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100;
}
export function makePlan(
  s: ReaderSnapshot,
  result: EquityResult,
  book: OpponentBook,
  now = Date.now(),
): ReaderDecision | null {
  if (!assessSnapshot(s, now).valid) return null;
  const evaluated = evaluateLiveDecision(s, result),
    base = evaluated.line,
    hero = s.seats.find((p) => p.hero);
  let action = evaluated.action,
    intent: ReaderDecision['intent'] = action.toLowerCase() as any,
    explanation = evaluated.explanation;
  const opponents = s.seats.filter((p) => !p.hero && p.inHand),
    villain = opponents.length === 1 ? book.profiles[opponents[0].username || ''] : undefined,
    fold = foldEstimate(villain);
  const cards = [...s.hole, ...s.board].map(parseCard);
  const flushDraw =
    s.board.length >= 3 &&
    s.board.length < 5 &&
    [0, 1, 2, 3].some(
      (color) =>
        cards.filter((c) => suit(c) === color).length === 4 &&
        s.hole.map(parseCard).some((c) => suit(c) === color),
    );
  const canAggress = s.actions.includes('bet') || s.actions.includes('raise');
  const preflop = evaluated.preflop;
  let fraction = preflop ? preflop.fraction : result.equity > 0.85 ? 1.0 : 0.5;
  const foldNeeded = fraction / (1 + fraction);
  if (s.call === 0 && canAggress && s.opponents === 1 && fold && fold.lower > foldNeeded + 0.05) {
    if (flushDraw && result.equity > 0.2 && result.equity < 0.58 && mix(s.handId + 'semi') < 20) {
      action = s.actions.includes('bet') ? 'Bet' : 'Raise';
      intent = 'semi-bluff';
      explanation = `Semi-bluff candidate: flush draw plus ${fold.n} observed responses to wagers. The conservative fold estimate clears the ${Math.round(foldNeeded * 100)}% break-even fold rate. Mixed at 20% of eligible hands.`;
    } else if (
      s.board.length === 5 &&
      result.equity < 0.25 &&
      result.made === 'High card' &&
      fold.n >= 30 &&
      mix(s.handId + 'bluff') < 10
    ) {
      action = s.actions.includes('bet') ? 'Bet' : 'Raise';
      intent = 'bluff';
      explanation = `Occasional river bluff candidate against an opponent who folded ${villain!.foldedFacing}/${fold.n} observed priced decisions. Mixed at 10% of eligible hands; this is a heuristic, not knowledge of their cards.`;
    }
  }
  if (['Raise', 'Bet'].includes(action) && !canAggress) {
    action = s.call === 0 ? 'Check' : 'Call';
    intent = action === 'Check' ? 'check' : 'call';
    explanation = 'Raising is unavailable. The available continuation is the verified check/call.';
  }
  if (action === 'Raise' && s.actions.includes('bet') && !s.actions.includes('raise'))
    action = 'Bet';
  if (action === 'Bet' && s.actions.includes('raise') && !s.actions.includes('bet'))
    action = 'Raise';
  let amount: number | null = action === 'Call' ? s.call : 0,
    target: number | undefined;
  if (['Raise', 'Bet'].includes(action)) {
    if (!['bluff', 'semi-bluff'].includes(intent || '')) intent = 'value';
    const maximum = hero?.stack != null && s.heroBet != null ? hero.stack + s.heroBet : null;
    const buttonAmount = s.actionAmounts?.[action.toLowerCase() as 'raise' | 'bet'];
    const minimum = s.sizing?.min ?? buttonAmount;
    if (maximum == null || minimum == null || maximum < minimum) {
      action = s.call === 0 ? 'Check' : 'Call';
      intent = action.toLowerCase() as any;
      amount = s.call;
      explanation =
        'Aggression is not sized because legal bounds are unreadable. Use the verified check/call price.';
    } else {
      let desired = (s.heroBet || 0) + s.call! + fraction * (s.pot! + s.call!);
      if (
        preflop &&
        preflop.spot === 'unopened' &&
        buttonAmount != null &&
        buttonAmount >= minimum &&
        buttonAmount <= maximum
      ) {
        desired = buttonAmount;
      } else if (buttonAmount != null && Math.abs(buttonAmount - desired) <= 0.02) {
        desired = buttonAmount;
      }
      target =
        s.sizing?.editable === false && buttonAmount != null && buttonAmount <= maximum
          ? cents(buttonAmount)
          : cents(Math.min(maximum, Math.max(minimum, desired)));
      amount = cents(target - (s.heroBet || 0));
      if (intent === 'value' && preflop)
        explanation = `${preflop.explanation} Raise to ${s.currency}${target.toFixed(2)}.`;
      else if (intent === 'value')
        explanation = `Value sizing: ${Math.round(fraction * 100)}% of the pot after calling, bounded by the visible minimum and your remaining stack. Raise/bet to ${s.currency}${target.toFixed(2)}; ${s.currency}${amount.toFixed(2)} additional chips. This does not solve opponents’ continuing ranges.`;
    }
  }
  if (!s.actions.includes(action.toLowerCase() as 'fold' | 'check' | 'call' | 'bet' | 'raise'))
    return null;
  if (s.allInCall)
    explanation =
      `All-in call costs ${s.currency}${s.call!.toFixed(2)}. Eligible pot before calling: ${s.currency}${s.callPot!.toFixed(2)}, excluding unmatched opponent chips. ` +
      explanation;
  const ranges = opponents.map((p) => ({
    name: p.username || p.label,
    range: rangeFor(book.profiles[p.username || '']),
    samples: book.profiles[p.username || '']?.pricedPre || 0,
  }));
  return {
    key: s.key,
    action,
    amount,
    target,
    intent,
    equity: result.equity,
    threshold: base.threshold,
    callEV: base.callEV,
    explanation,
    updatedAt: now,
    preflop: preflop ? { spot: preflop.spot, code: preflop.code } : undefined,
    reasoning: [
      ...(preflop
        ? [
            `Preflop: ${preflop.code}, ${{ unopened: 'nobody has raised', limped: 'players limped', raised: 'facing a raise', reraised: 'facing a re-raise' }[preflop.spot]}. Decision from River's starting-hand ranges for this spot; equity shown counts only players who raised or called.`,
          ]
        : []),
      `Eligible pot ${s.currency}${(s.callPot ?? s.pot!).toFixed(2)} · call ${s.currency}${s.call!.toFixed(2)} · required equity ${(base.threshold * 100).toFixed(1)}%`,
      ...(result.analysis
        ? [
            `${result.analysis.label}: ${(result.equity * 100).toFixed(1)}% observed · ${(result.analysis.cautious.equity * 100).toFixed(1)}% cautious · ${(evaluated.decisionFloor * 100).toFixed(1)}% decision floor`,
          ]
        : []),
      ...ranges.map(
        (r) =>
          `${r.name}: ${r.range === 'random' ? 'unknown range' : r.range + ' heuristic range'} (${r.samples} observed priced preflop decisions)`,
      ),
      `Showdown-only call EV ${s.currency}${base.callEV.toFixed(2)}; no rake or future betting.`,
      target !== undefined
        ? `Table must confirm the exact ${s.currency}${target.toFixed(2)} target before automatic submission.`
        : 'Only current legal actions are considered.',
    ],
  };
}
