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
export type Frame = {
  at: number;
  sourceId: string;
  image: string;
  width: number;
  height: number;
  readings: { id: string; words: Word[] }[];
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
