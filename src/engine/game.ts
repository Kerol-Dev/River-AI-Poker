import { Card, evaluate, shuffled } from './cards';
import { advice } from './equity';
export type Player = {
  name: string;
  stack: number;
  hole: Card[];
  streetBet: number;
  invested: number;
};
export type Action = 'fold' | 'check' | 'call' | 'raise';
export type Street = 'Preflop' | 'Flop' | 'Turn' | 'River' | 'Showdown';
export type Game = {
  id: number;
  players: [Player, Player];
  deck: Card[];
  board: Card[];
  button: number;
  actor: number;
  street: Street;
  pot: number;
  lastRaise: number;
  acted: boolean[];
  complete: boolean;
  winner: number | null;
  result: string;
  log: { street: string; player: string; text: string }[];
  startStacks: number[];
  vpip: boolean[];
  pfr: boolean[];
  showdown: boolean;
};
export function newHand(id = 1, stacks = [200, 200], button = 0, rng = Math.random): Game {
  if (stacks.some((s) => !Number.isInteger(s) || s <= 0))
    throw new Error('Both players need chips to deal.');
  const deck = shuffled(rng);
  const players = ['You', 'Atlas'].map((name, i) => ({
    name,
    stack: stacks[i],
    hole: [deck.pop()!, deck.pop()!],
    streetBet: 0,
    invested: 0,
  })) as [Player, Player];
  const g: Game = {
    id,
    players,
    deck,
    board: [],
    button,
    actor: button,
    street: 'Preflop',
    pot: 0,
    lastRaise: 2,
    acted: [false, false],
    complete: false,
    winner: null,
    result: '',
    log: [],
    startStacks: [...stacks],
    vpip: [false, false],
    pfr: [false, false],
    showdown: false,
  };
  const effective = Math.min(...stacks);
  for (const [p, amount] of [
    [button, Math.min(1, effective)],
    [1 - button, Math.min(2, effective)],
  ]) {
    pay(g, p, amount);
    g.log.push({
      street: g.street,
      player: players[p].name,
      text: `posts ${p === button ? 'small' : 'big'} blind ${amount}`,
    });
  }
  if (players[0].streetBet === players[1].streetBet && players.some((p) => p.stack === 0))
    runout(g);
  return g;
}
function pay(g: Game, p: number, amount: number) {
  g.players[p].stack -= amount;
  g.players[p].streetBet += amount;
  g.players[p].invested += amount;
  g.pot += amount;
}
export function legal(g: Game) {
  const me = g.players[g.actor],
    other = g.players[1 - g.actor];
  const call = Math.min(me.stack, Math.max(0, other.streetBet - me.streetBet));
  const max = Math.min(me.stack + me.streetBet, other.stack + other.streetBet);
  const current = Math.max(me.streetBet, other.streetBet);
  const min = Math.min(max, current + g.lastRaise);
  return {
    call,
    check: call === 0,
    min,
    max,
    canRaise: !g.complete && max > current && other.stack > 0,
  };
}
function dealStreet(g: Game) {
  g.deck.pop(); // burn
  const count = g.board.length === 0 ? 3 : 1;
  for (let i = 0; i < count; i++) g.board.push(g.deck.pop()!);
  g.street = g.board.length === 3 ? 'Flop' : g.board.length === 4 ? 'Turn' : 'River';
}
function settle(g: Game, winner: number | null, showdown: boolean) {
  g.complete = true;
  g.winner = winner;
  g.showdown = showdown;
  if (showdown) g.street = 'Showdown';
  if (winner === null) {
    const half = Math.floor(g.pot / 2);
    g.players[0].stack += half;
    g.players[1].stack += half;
    g.players[1 - g.button].stack += g.pot % 2;
    g.result = 'Split pot';
  } else {
    g.players[winner].stack += g.pot;
    g.result = `${g.players[winner].name} ${winner === 0 ? 'win' : 'wins'} ${g.pot} chips${showdown ? ` · ${evaluate([...g.players[winner].hole, ...g.board]).name}` : ' · opponent folded'}`;
  }
  g.log.push({ street: g.street, player: 'Table', text: g.result });
}
function runout(g: Game) {
  while (g.board.length < 5) dealStreet(g);
  const a = evaluate([...g.players[0].hole, ...g.board]).score;
  const b = evaluate([...g.players[1].hole, ...g.board]).score;
  settle(g, a === b ? null : a > b ? 0 : 1, true);
}
export function act(original: Game, action: Action, target?: number): Game {
  if (original.complete) throw new Error('This hand is complete.');
  const g = structuredClone(original),
    p = g.actor,
    options = legal(g);
  if (action === 'fold') {
    g.log.push({ street: g.street, player: g.players[p].name, text: 'folds' });
    settle(g, 1 - p, false);
    return g;
  }
  if (action === 'check' && !options.check)
    throw new Error('You must call or fold when facing a bet.');
  if (action === 'call' && !options.call) throw new Error('There is no bet to call.');
  if (action === 'raise') {
    if (
      !options.canRaise ||
      target === undefined ||
      !Number.isInteger(target) ||
      target < options.min ||
      target > options.max
    )
      throw new Error(`Raise must be between ${options.min} and ${options.max}.`);
    const previous = Math.max(...g.players.map((x) => x.streetBet));
    g.lastRaise = Math.max(g.lastRaise, target - previous);
    pay(g, p, target - g.players[p].streetBet);
    g.acted[1 - p] = false;
    g.log.push({
      street: g.street,
      player: g.players[p].name,
      text: `${previous ? 'raises to' : 'bets'} ${target}`,
    });
  } else {
    if (action === 'call') pay(g, p, options.call);
    g.log.push({
      street: g.street,
      player: g.players[p].name,
      text: action === 'call' ? `calls ${options.call}` : 'checks',
    });
  }
  if (g.street === 'Preflop') {
    if (action === 'call' || action === 'raise') g.vpip[p] = true;
    if (action === 'raise') g.pfr[p] = true;
  }
  g.acted[p] = true;
  if (
    g.players[0].streetBet === g.players[1].streetBet &&
    (g.acted.every(Boolean) || g.players.some((x) => x.stack === 0))
  ) {
    if (g.board.length === 5 || g.players.some((x) => x.stack === 0)) runout(g);
    else {
      dealStreet(g);
      g.players.forEach((x) => (x.streetBet = 0));
      g.acted = [false, false];
      g.lastRaise = 2;
      g.actor = 1 - g.button;
    }
  } else g.actor = 1 - p;
  return g;
}
export function botAction(
  g: Game,
  equity: number,
  rng = Math.random,
): { action: Action; target?: number } {
  const options = legal(g);
  const line = advice(equity, g.pot, options.call);
  if (line.action === 'Fold') return { action: 'fold' };
  if (options.canRaise && ['Raise', 'Bet'].includes(line.action)) {
    const current = Math.max(...g.players.map((p) => p.streetBet));
    const target = Math.max(
      options.min,
      Math.min(options.max, current + Math.max(2, Math.round((g.pot + options.call) * 0.5))),
    );
    return { action: 'raise', target };
  }
  return { action: options.check ? 'check' : 'call' };
}
