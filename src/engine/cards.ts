export type Card = number;
export const SUITS = ['♣', '♦', '♥', '♠'];
export const RANKS = '23456789TJQKA';
export const CATEGORIES = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
];
export const rank = (c: Card) => (c % 13) + 2;
export const suit = (c: Card) => Math.floor(c / 13);
export const cardText = (c: Card) => RANKS[c % 13] + 'cdhs'[suit(c)];
export function parseCard(value: string): Card {
  const s = value.trim().replace(/^10/, 'T');
  const r = RANKS.indexOf(s[0]?.toUpperCase());
  const u = 'cdhs'.indexOf(s[1]?.toLowerCase());
  if (s.length !== 2 || r < 0 || u < 0) throw new Error(`Invalid card: ${value}`);
  return u * 13 + r;
}
export function assertCards(cards: Card[]) {
  if (cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51))
    throw new Error('Cards must be valid deck indices.');
  if (new Set(cards).size !== cards.length) throw new Error('The same card cannot appear twice.');
}
export function shuffled(rng = Math.random): Card[] {
  const cards = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function straightHigh(values: number[]) {
  const set = new Set(values);
  if (set.has(14)) set.add(1);
  for (let h = 14; h >= 5; h--) if ([0, 1, 2, 3, 4].every((d) => set.has(h - d))) return h;
  return 0;
}
function score(category: number, kickers: number[]) {
  let value = category;
  for (let i = 0; i < 5; i++) value = value * 15 + (kickers[i] || 0);
  return { category, kickers, score: value, name: CATEGORIES[category] };
}
/** Best five cards out of 5–7, or a partial made-hand description for 2–4. */
export function evaluate(cards: Card[]) {
  const counts = new Map<number, number>();
  const suits: number[][] = [[], [], [], []];
  for (const c of cards) {
    const r = rank(c);
    counts.set(r, (counts.get(r) || 0) + 1);
    suits[suit(c)].push(r);
  }
  const values = [...counts.keys()].sort((a, b) => b - a);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = suits.find((s) => s.length >= 5)?.sort((a, b) => b - a);
  const sf = flush && straightHigh(flush);
  if (sf) return score(8, [sf]);
  const quad = groups.find((g) => g[1] === 4)?.[0];
  if (quad) return score(7, [quad, ...values.filter((r) => r !== quad).slice(0, 1)]);
  const trips = groups.filter((g) => g[1] >= 3).map((g) => g[0]);
  const fullPair = trips.length
    ? groups.find((g) => g[1] >= 2 && g[0] !== trips[0])?.[0]
    : undefined;
  if (trips.length && fullPair) return score(6, [trips[0], fullPair]);
  if (flush) return score(5, flush.slice(0, 5));
  const straight = straightHigh(values);
  if (straight) return score(4, [straight]);
  if (trips.length)
    return score(3, [trips[0], ...values.filter((r) => r !== trips[0]).slice(0, 2)]);
  const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0]);
  if (pairs.length >= 2)
    return score(2, [
      ...pairs.slice(0, 2),
      ...values.filter((r) => !pairs.slice(0, 2).includes(r)).slice(0, 1),
    ]);
  if (pairs.length)
    return score(1, [pairs[0], ...values.filter((r) => r !== pairs[0]).slice(0, 3)]);
  return score(0, values.slice(0, 5));
}
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
