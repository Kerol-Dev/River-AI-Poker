import { assertCards, parseCard } from '../engine/cards';
export type Role = 'hole' | 'board' | 'pot' | 'call' | 'actions' | 'player' | 'dealer';
export type Region = {
  id: string;
  role: Role;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Word = {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
// A face-up card found by the native helper: rank, suit and where its index was read.
// `group` is the light card area it belongs to; g* is that area's box. All values are fractions.
export type DetectedCard = {
  rank: string;
  suit: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  group: number;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
};
export type Frame = {
  at: number;
  sourceId: string;
  image: string;
  width: number;
  height: number;
  readings: { id: string; words: Word[] }[];
  cards?: DetectedCard[];
};
export type ScreenReading = {
  hole: string[];
  board: string[];
  pot: number | null;
  call: number | null;
  actions: string[];
  opponents: number;
  issues: string[];
  equityIssues: string[];
  cardSignature: string;
  confidence: number;
  signature: string;
  at: number;
};
export const roles: { role: Role; label: string }[] = [
  { role: 'hole', label: 'Your cards' },
  { role: 'board', label: 'Community cards' },
  { role: 'pot', label: 'Total pot' },
  { role: 'call', label: 'Call amount' },
  { role: 'actions', label: 'Action buttons' },
  { role: 'player', label: 'Player name' },
  { role: 'dealer', label: 'Dealer' },
];
export function readCards(text: string) {
  const suit: Record<string, string> = {
    '♠': 's',
    '♥': 'h',
    '♦': 'd',
    '♣': 'c',
    s: 's',
    h: 'h',
    d: 'd',
    c: 'c',
  };
  const values = [...text.matchAll(/(?:^|\s)(10|[2-9TJQKA])\s*([shdc♠♥♦♣])(?=\s|$)/gi)].map(
    (m) => (m[1].toUpperCase() === '10' ? 'T' : m[1].toUpperCase()) + suit[m[2].toLowerCase()],
  );
  return values;
}
export function readMoney(text: string): number | null {
  const cleaned = text
    .replace(/(?:€|£|\$)/g, ' ')
    .replace(/\b(?:pot|total|call|bet|raise|to|amount)\b/gi, ' ')
    .replace(/:/g, ' ')
    .trim();
  // Reject multiple values, locale ambiguity and guessed characters such as O/0.
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned.replaceAll(',', ''));
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : null;
}
export function parseFrame(
  frame: Frame,
  regions: Region[],
  opponents: number,
  expectedBoard: number,
): ScreenReading {
  const issues: string[] = [],
    values = new Map<string, string>(),
    confidences: number[] = [];
  for (const role of ['hole', 'board', 'pot', 'call', 'actions'] as Role[]) {
    const mapped = regions.filter((r) => r.role === role);
    if (mapped.length !== 1) {
      issues.push(`Map one ${roles.find((r) => r.role === role)!.label.toLowerCase()} region.`);
      continue;
    }
    const words = frame.readings.find((r) => r.id === mapped[0].id)?.words || [];
    values.set(role, words.map((w) => w.text).join(' '));
    if (words.length) {
      const confidence = Math.min(...words.map((w) => w.confidence));
      confidences.push(confidence);
      if (confidence < 0.85)
        issues.push(
          `${mapped[0].label} is hard to read. Tighten the region or increase the table size.`,
        );
    }
  }
  const hole = readCards(values.get('hole') || ''),
    board = readCards(values.get('board') || '');
  if (hole.length !== 2)
    issues.push('Both card ranks and suits must be readable. Adjust Your cards.');
  if (![0, 3, 4, 5].includes(expectedBoard) || board.length !== expectedBoard)
    issues.push(
      `Expected ${expectedBoard} board cards. Check the street and Community cards region.`,
    );
  try {
    assertCards([...hole, ...board].map(parseCard));
  } catch {
    issues.push('The same card was read twice. Check the card regions.');
  }
  if (expectedBoard === 0 && (values.get('board') || '').trim())
    issues.push('The board contains text. Check the street or tighten the empty-board region.');
  const pot = readMoney(values.get('pot') || ''),
    call = readMoney(values.get('call') || '');
  if (pot == null || pot <= 0)
    issues.push('The total pot is unclear. Map only its label and amount.');
  if (call == null)
    issues.push('The call amount is unclear. Include a visible 0 for a free check.');
  if (pot != null && call != null && call > pot)
    issues.push('The call is larger than the pot. Check both amounts.');
  const label = (values.get('actions') || '').toLowerCase(),
    actions = ['fold', 'check', 'call', 'bet', 'raise'].filter((a) =>
      new RegExp(`\\b${a}\\b`).test(label),
    );
  if (/all[ -]?in/.test(label))
    issues.push('An all-in or side pot needs manual review in screen mode.');
  if (
    /check\s*[/\\]\s*fold/.test(label) ||
    !actions.includes('fold') ||
    !actions.includes(call === 0 ? 'check' : 'call') ||
    (actions.includes('call') && actions.includes('check'))
  )
    issues.push(
      'Current action buttons are unclear. Map the live buttons, not advance-action choices.',
    );
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 5)
    issues.push('Set the number of opponents still in this hand.');
  const equityIssues: string[] = [];
  for (const role of ['hole', 'board']) {
    const maps = regions.filter((r) => r.role === role);
    if (maps.length !== 1) equityIssues.push('Map ' + role);
    for (const m of maps) {
      const words = frame.readings.find((r) => r.id === m.id)?.words || [];
      if (words.some((w) => w.confidence < 0.85)) equityIssues.push('Uncertain ' + role);
    }
  }
  if (
    hole.length !== 2 ||
    ![0, 3, 4, 5].includes(expectedBoard) ||
    board.length !== expectedBoard ||
    (expectedBoard === 0 && (values.get('board') || '').trim())
  )
    equityIssues.push('Cards incomplete');
  try {
    assertCards([...hole, ...board].map(parseCard));
  } catch {
    equityIssues.push('Duplicate cards');
  }
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 5)
    equityIssues.push('Unknown opponents');
  return {
    hole,
    board,
    pot,
    call,
    actions,
    opponents,
    issues,
    equityIssues,
    cardSignature: JSON.stringify([hole, board, opponents, expectedBoard]),
    confidence: confidences.length ? Math.min(...confidences) : 0,
    signature: JSON.stringify([hole, board, pot, call, actions, opponents, expectedBoard]),
    at: frame.at,
  };
}
export function suggestRegions(frame: Frame): Region[] {
  const words = frame.readings.flatMap((r) => r.words).filter((w) => w.confidence >= 0.85),
    out: Region[] = [];
  function add(role: Role, w: Word) {
    const x = Math.max(0, w.x - 0.015),
      y = Math.max(0, w.y - 0.015);
    out.push({
      id: role,
      role,
      label: roles.find((r) => r.role === role)!.label,
      x,
      y,
      width: Math.min(1 - x, w.width + 0.03),
      height: Math.min(1 - y, w.height + 0.03),
    });
  }
  for (const role of ['pot', 'call'] as Role[]) {
    const matches = words.filter(
      (w) =>
        new RegExp(role === 'pot' ? '\\bpot\\b' : '\\bcall\\b', 'i').test(w.text) &&
        /[0-9]/.test(w.text),
    );
    if (matches.length === 1) add(role, matches[0]);
  }
  const actionWords = words.filter((w) =>
    /^(?:fold|check|call|raise|bet)(?:\b|[€£$])/i.test(w.text),
  );
  if (actionWords.length >= 2) {
    const x = Math.min(...actionWords.map((w) => w.x)),
      y = Math.min(...actionWords.map((w) => w.y));
    add('actions', {
      text: '',
      confidence: 1,
      x,
      y,
      width: Math.max(...actionWords.map((w) => w.x + w.width)) - x,
      height: Math.max(...actionWords.map((w) => w.y + w.height)) - y,
    });
  }
  const cardWords = words.filter((w) => readCards(w.text).length > 0);
  const rows: Word[][] = [];
  for (const w of cardWords.sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - w.y) < 0.04);
    if (row) row.push(w);
    else rows.push([w]);
  }
  for (const role of ['hole', 'board'] as Role[]) {
    const choices = rows.filter((row) => {
      const n = row.reduce((sum, w) => sum + readCards(w.text).length, 0);
      return role === 'hole' ? n === 2 : [3, 4, 5].includes(n);
    });
    if (choices.length === 1) {
      const row = choices[0],
        x = Math.min(...row.map((w) => w.x)),
        y = Math.min(...row.map((w) => w.y));
      add(role, {
        text: '',
        confidence: 1,
        x,
        y,
        width: Math.max(...row.map((w) => w.x + w.width)) - x,
        height: Math.max(...row.map((w) => w.y + w.height)) - y,
      });
    }
  }
  return out;
}

type Area = { cards: DetectedCard[]; x: number; y: number; w: number; h: number };
const areaBox = (cards: DetectedCard[]): Area => {
  const x = Math.min(...cards.map((c) => c.gx)),
    y = Math.min(...cards.map((c) => c.gy)),
    r = Math.max(...cards.map((c) => c.gx + c.gw)),
    b = Math.max(...cards.map((c) => c.gy + c.gh));
  return { cards: [...cards].sort((a, b) => a.x - b.x), x, y, w: r - x, h: b - y };
};
// Card areas in one row with similar heights form a hand, the board or a shown hand.
export function cardRows(cards: DetectedCard[], aspect = 1.6): Area[] {
  const groups = [...new Set(cards.map((c) => c.group))].map((g) =>
    areaBox(cards.filter((c) => c.group === g)),
  );
  const parent = groups.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i],
        b = groups[j],
        h = Math.max(a.h, b.h);
      const gap = (Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)) * aspect;
      if (Math.min(a.h, b.h) / h > 0.7 && Math.abs(a.y - b.y) < 0.35 * h && gap < 0.9 * h)
        parent[find(i)] = find(j);
    }
  const rows = new Map<number, DetectedCard[]>();
  groups.forEach((g, i) => rows.set(find(i), [...(rows.get(find(i)) || []), ...g.cards]));
  return [...rows.values()].map(areaBox);
}
function lineOf(words: Word[], w: Word) {
  return words
    .filter(
      (v) =>
        Math.abs(v.y + v.height / 2 - (w.y + w.height / 2)) < Math.max(v.height, w.height) * 0.6,
    )
    .sort((a, b) => a.x - b.x);
}
const pad = (b: { x: number; y: number; w: number; h: number }, p = 0.01) => {
  const x = Math.max(0, b.x - p),
    y = Math.max(0, b.y - p);
  return { x, y, width: Math.min(1 - x, b.w + 2 * p), height: Math.min(1 - y, b.h + 2 * p) };
};
// Automatic reading for any window: cards from shape detection, amounts and buttons from text.
export function autoRead(
  frame: Frame,
  opponents: number,
): { reading: ScreenReading; regions: Region[] } {
  const words = frame.readings.flatMap((r) => r.words).filter((w) => w.confidence >= 0.5);
  const cards = (frame.cards || []).filter((c) => c.confidence >= 0.55);
  const rows = cardRows(cards, frame.width / Math.max(1, frame.height));
  const center = { x: 0.5, y: 0.45 };
  const dist = (a: Area) => Math.hypot(a.x + a.w / 2 - center.x, a.y + a.h / 2 - center.y);
  const board = rows
    .filter((r) => r.cards.length >= 3 && r.cards.length <= 5)
    .sort((a, b) => dist(a) - dist(b))[0];
  const issues: string[] = [],
    equityIssues: string[] = [],
    regions: Region[] = [];
  const add = (role: Role, b: { x: number; y: number; w: number; h: number }) =>
    regions.push({ id: role, role, label: roles.find((r) => r.role === role)!.label, ...pad(b) });
  // Live buttons: the lowest line holding at least two action words.
  const actionWords = words.filter((w) =>
    /^(?:fold|check|call|raise|bet|all[ -]?in)\b/i.test(w.text.trim()),
  );
  const lines = actionWords
    .map((w) => lineOf(actionWords, w))
    .filter((l) => l.length >= 2)
    .sort((a, b) => b[0].y - a[0].y);
  const buttons = lines[0] || [];
  const buttonsBox = buttons.length
    ? (() => {
        const x = Math.min(...buttons.map((w) => w.x)),
          y = Math.min(...buttons.map((w) => w.y));
        return {
          x,
          y,
          w: Math.max(...buttons.map((w) => w.x + w.width)) - x,
          h: Math.max(...buttons.map((w) => w.y + w.height)) - y,
        };
      })()
    : null;
  const heroChoices = rows.filter((r) => r !== board && r.cards.length === 2);
  const heroScore = (r: Area) =>
    r.y +
    r.h * 2 -
    (buttonsBox
      ? Math.hypot(
          r.x + r.w / 2 - (buttonsBox.x + buttonsBox.w / 2),
          r.y + r.h / 2 - (buttonsBox.y + buttonsBox.h / 2),
        ) / 2
      : 0);
  const hero = heroChoices.sort((a, b) => heroScore(b) - heroScore(a))[0];
  const code = (c: DetectedCard) => c.rank + c.suit;
  const hole = hero ? hero.cards.map(code) : [],
    boardCards = board ? board.cards.map(code) : [];
  if (hero) add('hole', hero);
  if (board) add('board', board);
  if (buttonsBox) add('actions', buttonsBox);
  // Pot: a "Pot" label with its amount, or the amount just to its right.
  const pots = words
    .filter((w) => /\bpot\b/i.test(w.text))
    .map((w) => {
      const own = readMoney(w.text);
      if (own != null) return { w, value: own, total: /total/i.test(w.text) };
      const line = lineOf(words, w);
      const next = line[line.indexOf(w) + 1];
      const value = next && next.x - (w.x + w.width) < 0.08 ? readMoney(next.text) : null;
      return { w, value, total: /total/i.test(w.text) };
    })
    .filter((p): p is { w: Word; value: number; total: boolean } => p.value != null);
  const potChoice = (pots.some((p) => p.total) ? pots.filter((p) => p.total) : pots).sort(
    (a, b) => b.value - a.value,
  )[0];
  const pot = potChoice?.value ?? null;
  if (potChoice)
    add('pot', { x: potChoice.w.x, y: potChoice.w.y, w: potChoice.w.width, h: potChoice.w.height });
  const labels = buttons.map((w) => w.text.trim().toLowerCase());
  const actions = ['fold', 'check', 'call', 'bet', 'raise'].filter((a) =>
    labels.some((l) => l.startsWith(a)),
  );
  let call: number | null = null;
  if (labels.some((l) => /^check\b/.test(l))) call = 0;
  const callWord = buttons.find((w) => /^call\b/i.test(w.text.trim()));
  if (callWord) {
    call = readMoney(callWord.text);
    if (call == null) {
      const near = words.find(
        (v) =>
          v !== callWord &&
          readMoney(v.text) != null &&
          Math.abs(v.x + v.width / 2 - (callWord.x + callWord.width / 2)) < 0.06 &&
          v.y > callWord.y - 0.01 &&
          v.y - (callWord.y + callWord.height) < 0.05,
      );
      call = near ? readMoney(near.text) : null;
    }
  }
  if (hole.length !== 2) issues.push('Your two cards are not visible yet.');
  if (![0, 3, 4, 5].includes(boardCards.length)) issues.push('The board is still being dealt.');
  try {
    assertCards([...hole, ...boardCards].map(parseCard));
  } catch {
    issues.push('The same card was read twice. Waiting for a clearer view.');
  }
  if (pot == null || pot <= 0) issues.push('The total pot is not readable yet.');
  if (call == null) issues.push('Waiting for your turn: no call or check button is visible.');
  if (pot != null && call != null && call > pot)
    issues.push('The call is larger than the pot. Check both amounts.');
  if (labels.some((l) => /^all[ -]?in/.test(l)))
    issues.push('An all-in or side pot needs manual review in screen mode.');
  if (!actions.includes('fold') || !actions.includes(call === 0 ? 'check' : 'call'))
    if (call != null) issues.push('Action buttons are unclear. Waiting for your turn.');
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 5)
    issues.push('Set the number of opponents still in this hand.');
  if (hole.length !== 2 || ![0, 3, 4, 5].includes(boardCards.length))
    equityIssues.push('Cards incomplete');
  try {
    assertCards([...hole, ...boardCards].map(parseCard));
  } catch {
    equityIssues.push('Duplicate cards');
  }
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 5)
    equityIssues.push('Unknown opponents');
  const used = [...(hero?.cards || []), ...(board?.cards || [])];
  const confidence = used.length ? Math.min(...used.map((c) => c.confidence)) : 0;
  return {
    regions,
    reading: {
      hole,
      board: boardCards,
      pot,
      call,
      actions,
      opponents,
      issues,
      equityIssues,
      cardSignature: JSON.stringify([hole, boardCards, opponents]),
      confidence,
      signature: JSON.stringify([hole, boardCards, pot, call, actions, opponents]),
      at: frame.at,
    },
  };
}
