import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { assessSnapshot, ReaderSnapshot } from '../src/reader/model';
const source = readFileSync(
  new URL('../browser-extension/generic-adapter.js', import.meta.url),
  'utf8',
);

// Elements carry data-box="x y w h". Unboxed elements use their children, then their parent.
function page(body: string) {
  const dom = new JSDOM(`<body>${body}</body>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://tables.example.test/play',
  });
  const w = dom.window as any;
  w.innerWidth = 1000;
  w.innerHeight = 700;
  const rect = (
    el: Element,
    up = true,
  ): { x: number; y: number; width: number; height: number } => {
    const attr = el.getAttribute('data-box');
    if (attr) {
      const [x, y, width, height] = attr.split(/\s+/).map(Number);
      return { x, y, width, height };
    }
    const kids = [...el.children].map((c) => rect(c, false)).filter((r) => r.width > 0);
    if (kids.length) {
      const x = Math.min(...kids.map((r) => r.x)),
        y = Math.min(...kids.map((r) => r.y));
      return {
        x,
        y,
        width: Math.max(...kids.map((r) => r.x + r.width)) - x,
        height: Math.max(...kids.map((r) => r.y + r.height)) - y,
      };
    }
    return up && el.parentElement && el.parentElement.tagName !== 'BODY'
      ? rect(el.parentElement)
      : { x: 0, y: 0, width: 0, height: 0 };
  };
  w.Element.prototype.getBoundingClientRect = function () {
    const r = rect(this);
    return {
      ...r,
      left: r.x,
      top: r.y,
      right: r.x + r.width,
      bottom: r.y + r.height,
      toJSON() {},
    };
  };
  w.eval(source);
  const R = w.RiverReader;
  const read = (mapping: unknown[] = []) =>
    JSON.parse(
      JSON.stringify({ ...R.read(w.document, mapping), receivedAt: Date.now() }),
    ) as ReaderSnapshot & {
      detection: { cards: number; opponentsDetected: boolean };
    };
  return { dom, w, R, read, doc: w.document as Document };
}
const at = (x: number, y: number, w = 50, h = 72) => `data-box="${x} ${y} ${w} ${h}"`;

describe('any-site table reader', () => {
  it('reads unicode cards, card backs, pot and live buttons without mapping', () => {
    const p = page(`
      <div class="seat" ${at(100, 120, 200, 90)}><div class="cardback" ${at(110, 130, 30, 44)}></div><div class="cardback" ${at(135, 130, 30, 44)}></div></div>
      <div class="seat" ${at(700, 120, 200, 90)}><div class="card back" ${at(710, 130, 30, 44)}></div><div class="card back" ${at(735, 130, 30, 44)}></div></div>
      <div class="board">
        <div class="pc" ${at(380, 290)}><span>J</span><span>♠</span></div>
        <div class="pc" ${at(440, 290)}><span>10</span><span>♣</span></div>
        <div class="pc" ${at(500, 290)}><span>2</span><span>♦</span></div>
      </div>
      <div class="pot" ${at(430, 250, 140, 24)}>Pot: $12.50</div>
      <div class="hero">
        <div class="pc" ${at(440, 520, 60, 86)}>A<i>♠</i></div>
        <div class="pc" ${at(470, 520, 60, 86)}>K<i>♥</i></div>
      </div>
      <div class="controls">
        <button ${at(600, 630, 80, 40)}>Fold</button>
        <button ${at(690, 630, 90, 40)}>Call $2.50</button>
        <button ${at(790, 630, 110, 40)}>Raise to $7</button>
        <label ${at(600, 600, 120, 20)}><input type="checkbox"> Check/Fold</label>
      </div>`);
    const s = p.read();
    assert.deepEqual(s.hole, ['As', 'Kh']);
    assert.deepEqual(s.board, ['Js', 'Tc', '2d']);
    assert.equal(s.pot, 12.5);
    assert.equal(s.currency, '$');
    assert.equal(s.call, 2.5);
    assert.deepEqual(s.actions, ['fold', 'call', 'raise']);
    assert.equal(s.actionAmounts?.raise, 7);
    assert.equal(s.heroTurn, true);
    assert.equal(s.opponents, 2);
    assert.equal(s.detection.opponentsDetected, true);
    assert.ok(s.source.startsWith('web:'));
    assert.match(s.handId, /^auto-/);
    assert.deepEqual(s.errors, []);
    assert.equal(assessSnapshot(s).valid, true);
    p.dom.window.close();
  });

  it('reads image file names, aria labels and split rank/suit classes', () => {
    const p = page(`
      <img src="/assets/cards/ace_of_spades.png" alt="" ${at(420, 300)}>
      <img src="/img/deck/10h.svg" ${at(480, 300)}>
      <div class="card rank-q suit-hearts" ${at(540, 300)}></div>
      <div role="img" aria-label="Seven of clubs" ${at(600, 300)}></div>
      <img src="/cards/s13.png" ${at(440, 520, 64, 90)}>
      <img src="/cards/d1.png" ${at(510, 520, 64, 90)}>
      <img src="/cards/card_back.png" ${at(140, 140, 30, 44)}>
      <div ${at(400, 250, 200, 24)}>Total pot <b>1.234,50 €</b></div>
      <div role="button" ${at(600, 630, 80, 40)}>Fold</div>
      <div role="button" ${at(690, 630, 80, 40)}><span>Check</span></div>
      <div role="button" ${at(780, 630, 80, 40)}>Bet</div>`);
    const s = p.read();
    assert.deepEqual(s.board, ['As', 'Th', 'Qh', '7c']);
    assert.deepEqual(s.hole, ['Ks', 'Ad']);
    assert.equal(s.pot, 1234.5);
    assert.equal(s.currency, '€');
    assert.equal(s.call, 0);
    assert.deepEqual(s.actions, ['fold', 'check', 'bet']);
    assert.equal(s.opponents, 1);
    p.dom.window.close();
  });

  it('never treats ordinary classes, links or pre-actions as cards or live buttons', () => {
    const p = page(`
      <h1 class="h1 js as" ${at(10, 10, 300, 40)}>Welcome</h1>
      <a href="/contact" ${at(10, 60, 80, 20)}>Call us</a>
      <span class="ks" ${at(10, 90, 30, 40)}>Ks</span>
      <div class="pre-actions"><div role="button" ${at(10, 120, 80, 20)}>Fold</div></div>`);
    const s = p.read();
    assert.deepEqual(s.hole, []);
    assert.deepEqual(s.board, []);
    assert.deepEqual(s.actions, []);
    assert.equal(s.heroTurn, false);
    assert.equal(p.R.cardFromToken('/deck/h1.png'), 'Ah');
    assert.equal(p.R.cardFromLabel('Ace of Spades'), 'As');
    assert.equal(p.R.cardFromToken('/c/spades_queen.webp'), 'Qs');
    assert.equal(p.R.actionKind('Raise To €24.00'), 'raise');
    assert.equal(p.R.actionKind('Check/Fold'), null);
    assert.equal(p.R.actionKind('Call any'), null);
    p.dom.window.close();
  });

  it('picks your hand near the controls at showdown and follows the auto map', () => {
    const p = page(`
      <div class="pc" ${at(120, 140, 40, 58)}>9♣</div><div class="pc" ${at(160, 140, 40, 58)}>9♦</div>
      <div class="pc" ${at(380, 290)}>J♠</div><div class="pc" ${at(440, 290)}>T♣</div><div class="pc" ${at(500, 290)}>2♦</div><div class="pc" ${at(560, 290)}>3♥</div><div class="pc" ${at(620, 290)}>4♥</div>
      <div class="pc" ${at(440, 520, 60, 86)}>A♠</div><div class="pc" ${at(500, 520, 60, 86)}>K♥</div>
      <button ${at(600, 630, 80, 40)}>Fold</button><button ${at(690, 630, 80, 40)}>Check</button>`);
    const map = JSON.parse(JSON.stringify(p.R.defaults()));
    assert.deepEqual(
      map.map((m: { id: string }) => m.id),
      ['hero', 'board', 'pot', 'actions'],
    );
    assert.ok(map.find((m: { id: string }) => m.id === 'hero').box.y > 0.7);
    const s = p.read(map);
    assert.deepEqual(s.hole, ['As', 'Kh']);
    assert.equal(s.board.length, 5);
    p.dom.window.close();
  });

  it('pauses while a community card is face down and keeps the hand id within a hand', () => {
    const p = page(`
      <div class="pc" ${at(380, 290)}>J♠</div><div class="pc" ${at(440, 290)}>T♣</div><div class="pc" ${at(500, 290)}>2♦</div><div class="card-back" ${at(560, 290)}></div>
      <div class="pc" ${at(440, 520, 60, 86)}>A♠</div><div class="pc" ${at(500, 520, 60, 86)}>K♥</div>`);
    const first = p.read();
    assert.ok(first.errors.some((e) => /being revealed/.test(e)));
    assert.equal(p.read().handId, first.handId);
    p.dom.window.close();
  });

  it('counts unlabeled face-down pairs as opponents but not single images or avatars', () => {
    const p = page(`
      <img src="/img/x91.png" ${at(100, 120, 30, 44)}><img src="/img/x91.png" ${at(128, 120, 30, 44)}>
      <img src="/img/x91.png" ${at(820, 120, 30, 44)}><img src="/img/x91.png" ${at(848, 120, 30, 44)}>
      <img src="/img/avatar.png" ${at(400, 60, 48, 48)}><img src="/img/logo.png" ${at(600, 40, 40, 60)}>
      <div class="pc" ${at(440, 520, 60, 86)}>A♠</div><div class="pc" ${at(500, 520, 60, 86)}>K♥</div>
      <button ${at(600, 630, 80, 40)}>Fold</button><button ${at(690, 630, 80, 40)}>Check</button>`);
    const s = p.read();
    assert.equal(s.opponents, 2);
    assert.equal(s.detection.opponentsDetected, true);
    assert.deepEqual(s.hole, ['As', 'Kh']);
    p.dom.window.close();
  });

  it('parses amounts with optional currency, thousands and chip suffixes', () => {
    const p = page('');
    const money = (v: string) => JSON.parse(JSON.stringify(p.R.money(v)));
    assert.deepEqual(money('Pot: 1,250'), { currency: '', value: 1250 });
    assert.deepEqual(money('£0.40'), { currency: '£', value: 0.4 });
    assert.deepEqual(money('2.5K'), { currency: '', value: 2500 });
    assert.deepEqual(money('12,50 €'), { currency: '€', value: 12.5 });
    assert.equal(p.R.money('Pot $10 Side $5'), null);
    p.dom.window.close();
  });
});

describe('River connection accepts any-site readings', () => {
  it('keeps the site name and rejects unknown sources', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const { sanitize } = require('../electron/reader-bridge.cjs');
    const base = {
      version: 1,
      key: 'k',
      heroTurn: true,
      opponents: 1,
      seats: [],
      hole: ['As', 'Kh'],
      board: [],
      pot: 3,
      call: 1,
      actions: ['fold', 'call'],
      errors: [],
    };
    assert.equal(
      sanitize({ ...base, source: 'web:tables.example.test' }).source,
      'web:tables.example.test',
    );
    assert.equal(
      sanitize({ ...base, source: 'update-com.p365play.com' }).source,
      'update-com.p365play.com',
    );
    assert.throws(() => sanitize({ ...base, source: 'web:bad host/../' }));
    assert.throws(() => sanitize({ ...base, source: 'elsewhere' }));
  });
});
