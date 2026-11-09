import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import {
  assessSnapshot,
  assessEquitySnapshot,
  readerDecision,
  ReaderSnapshot,
  situationFromSnapshot,
} from '../src/reader/model';
import { makePlan } from '../src/reader/strategy';
import { emptyBook, OpponentBook } from '../src/reader/opponents';
import { calculateEquity } from '../src/engine/equity';
import { parseCard } from '../src/engine/cards';
const require = createRequire(import.meta.url);
const { createReaderBridge } = require('../electron/reader-bridge.cjs');
const adapter = readFileSync(new URL('../browser-extension/adapter.js', import.meta.url), 'utf8');
const card = (rank: string, suit: string, hidden = false) =>
  `<div class="card ${hidden ? 'pt-visibility-hidden' : 'card-animation-finished'}"><div class="card-wrapper"><div class="card-image-backup"><span class="card-rank">${rank}</span><span class="card-suit">${suit}</span></div></div></div>`;
function fixture() {
  const dom = new JSDOM(
    `<div class="table"><div class="hand-id">#123456789</div><div class="table-area"><div class="player-area player-seat-1"><div class="table-player"><div class="player-nameplate">Player 1 €180.00</div><div class="cards-holder-other-hidden"><div class="card-wrapper"></div><div class="card-wrapper"></div></div></div></div><div class="player-area player-seat-2"><div class="table-player"><div class="player-nameplate inactive">Player 2 €120.00</div><div class="cards-holder-other-hidden pt-visibility-hidden"><div class="card-wrapper"></div><div class="card-wrapper"></div></div></div></div><div class="player-area player-seat-3 my-player"><div class="table-player my-player"><div class="player-nameplate">You €200.00</div><div class="cards-holder-hero">${card('A', '♠')}${card('Q', '♥')}</div></div></div><div class="table-root"><div class="total-pot">Pot: €40.00</div><div class="community-cards">${card('J', '♠')}${card('10', '♣')}${card('2', '♦')}${card('A', '♦', true)}</div><div class="game-position game-position-1"><div class="dealer"></div></div></div></div><div class="table-actions-wrapper"><div class="actions-area single-actions"><div class="base-button action-button">Fold<span style="display:none">Fold</span></div><div class="base-button action-button">Call €12.00</div><div class="base-button action-button">Raise To €24.00<span style="display:none">Raise To €24.00</span></div></div><div class="actions-area pre-actions"><div class="base-button pre-action">Check</div></div></div></div>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  dom.window.Element.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 40,
    right: 100,
    width: 100,
    height: 40,
    toJSON() {},
  });
  dom.window.eval(adapter);
  const r = (dom.window as any).RiverReader,
    mapping = r.defaults(r.table(dom.window.document));
  const read = () =>
    JSON.parse(
      JSON.stringify({ ...r.read(dom.window.document, mapping), receivedAt: Date.now() }),
    ) as ReaderSnapshot;
  return { dom, r, mapping, read, doc: dom.window.document };
}
describe('visible Bet365 table adapter', () => {
  it('matches exact action labels with adjacent currency or duplicate visual labels', () => {
    const f = fixture();
    assert.equal(f.r.actionKind('Call€0.12'), 'call');
    assert.equal(f.r.actionKind('Fold Fold'), 'fold');
    assert.equal(f.r.actionKind('Raise To€0.24'), 'raise');
    assert.equal(f.r.actionKind('All-in'), null);
    assert.equal(f.r.actionKind('Check/Fold'), null);
    f.dom.window.close();
  });
  it('reads verified action sizes and posted hero chips for boundary accounting', () => {
    const f = fixture();
    const bet = f.doc.createElement('div');
    bet.className = 'bet player-bet-3';
    bet.textContent = '€0.04';
    f.doc.querySelector('.table-area')!.append(bet);
    assert.equal(f.read().heroBet, 0.04);
    assert.deepEqual(f.read().actionAmounts, { call: 12, raise: 24 });
    bet.classList.add('pt-visibility-hidden');
    assert.equal(f.read().heroBet, 0);
    bet.remove();
    assert.equal(f.read().heroBet, null);
    f.dom.window.close();
  });
  it('reads the visible hand header outside the table container', () => {
    const f = fixture();
    f.doc.body.prepend(f.doc.querySelector('.hand-id')!);
    assert.equal(f.read().handId, '123456789');
    f.dom.window.close();
  });
  it('reads visible cards, pot, call, active opponents and dealer', () => {
    const f = fixture();
    const s = f.read();
    assert.deepEqual(s.hole, ['As', 'Qh']);
    assert.deepEqual(s.board, ['Js', 'Tc', '2d']);
    assert.equal(s.pot, 40);
    assert.equal(s.call, 12);
    assert.equal(s.opponents, 1);
    assert.equal(s.heroTurn, true);
    assert.equal(s.dealer, 'player-seat-1');
    assert.deepEqual(s.errors, []);
    assert.equal(assessSnapshot(s).valid, true);
    f.dom.window.close();
  });
  it('never reads cards under a hidden ancestor', () => {
    const f = fixture();
    f.doc.querySelector('.cards-holder-hero')!.classList.add('pt-visibility-hidden');
    assert.deepEqual(f.read().hole, []);
    assert.equal(assessSnapshot(f.read()).valid, false);
    f.dom.window.close();
  });
  it('does not treat advance Check choices as the current turn', () => {
    const f = fixture();
    f.doc.querySelector('.single-actions')!.remove();
    const s = f.read();
    assert.equal(s.heroTurn, false);
    assert.equal(s.call, null);
    assert.deepEqual(s.actions, []);
    assert.match(assessSnapshot(s).reason, /your turn/);
    f.dom.window.close();
  });
  it('reads Check as exactly zero to call', () => {
    const f = fixture();
    f.doc.querySelectorAll('.single-actions .base-button')[1].textContent = 'Check';
    assert.equal(f.read().call, 0);
    assert.ok(f.read().actions.includes('check'));
    f.dom.window.close();
  });
  it('does not count folded seats or hidden dealing animations', () => {
    const f = fixture();
    f.doc
      .querySelector('.player-seat-2 .cards-holder-other-hidden')!
      .classList.remove('pt-visibility-hidden');
    assert.equal(f.read().opponents, 2);
    f.doc.querySelector('.player-seat-1')!.setAttribute('style', 'opacity:0');
    assert.equal(f.read().opponents, 1);
    f.dom.window.close();
  });
  it('fails closed when a required mapping is detached', () => {
    const f = fixture();
    f.mapping.find((m: any) => m.id === 'pot').selector = '';
    assert.match(f.read().errors[0], /pot/);
    assert.equal(assessSnapshot(f.read()).valid, false);
    f.dom.window.close();
  });
  it('rejects conflicting call amounts instead of guessing', () => {
    const f = fixture();
    f.doc.querySelectorAll('.single-actions .base-button')[1].textContent = 'Call €12.00 €24.00';
    assert.equal(f.read().call, null);
    assert.equal(assessSnapshot(f.read()).valid, false);
    f.dom.window.close();
  });
  it('does not use a disabled Call button', () => {
    const f = fixture();
    f.doc.querySelectorAll('.single-actions .base-button')[1].setAttribute('aria-disabled', 'true');
    assert.equal(f.read().heroTurn, false);
    f.dom.window.close();
  });
  it('blocks duplicate cards and partial flops', () => {
    const f = fixture();
    const s = f.read();
    s.board[0] = 'As';
    assert.equal(assessSnapshot(s).valid, false);
    s.board = ['Js', 'Tc'];
    assert.equal(assessSnapshot(s).valid, false);
    f.dom.window.close();
  });
  it('parses currency values without confusing usernames with chip values', () => {
    const f = fixture();
    assert.deepEqual(structuredClone(f.r.money('Player 765 €1,234.56')), {
      currency: '€',
      value: 1234.56,
    });
    assert.deepEqual(structuredClone(f.r.money('€0.08 Raise To €0.08')), {
      currency: '€',
      value: 0.08,
    });
    assert.equal(f.r.money('€0,08'), null);
    f.dom.window.close();
  });
  it('suppresses advice after the feed expires', () => {
    const f = fixture();
    const s = f.read();
    assert.equal(assessSnapshot(s, s.receivedAt + 3501).valid, false);
    f.dom.window.close();
  });
  it('downgrades an unavailable raise to a legal call', () => {
    const f = fixture();
    const s = f.read();
    s.actions = ['fold', 'call'];
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
    const d = readerDecision(s, result);
    assert.equal(d?.action, 'Call');
    assert.equal(d?.amount, 12);
    f.dom.window.close();
  });
});
describe('local authenticated reader bridge', () => {
  it('rejects websites and bad tokens, accepts only paired packets and clears stale decisions', async () => {
    const f = fixture();
    const received: unknown[] = [];
    const commands: string[] = [];
    const bridge = createReaderBridge({
      port: 0,
      onSnapshot: (s: unknown) => received.push(s),
      onCommand: (command: string) => commands.push(command),
    });
    await new Promise<void>((resolve) => bridge.server.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${bridge.status().port}`;
      const token = bridge.status().token,
        id = 'a'.repeat(32);
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-River-Extension': id,
      };
      assert.equal(
        (
          await fetch(url + '/pair', {
            method: 'POST',
            headers: { ...headers, Origin: 'https://example.com' },
            body: '{}',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(url + '/pair', {
            method: 'POST',
            headers: { ...headers, Authorization: 'Bearer wrong' },
            body: '{}',
          })
        ).status,
        401,
      );
      assert.equal(
        (await fetch(url + '/pair', { method: 'POST', headers, body: '{}' })).status,
        200,
      );
      assert.equal(
        (
          await fetch(url + '/pair', {
            method: 'POST',
            headers: { ...headers, 'X-River-Extension': 'b'.repeat(32) },
            body: '{}',
          })
        ).status,
        403,
      );
      const s = f.read();
      assert.equal(
        (await fetch(url + '/snapshot', { method: 'POST', headers, body: JSON.stringify(s) }))
          .status,
        200,
      );
      assert.equal(received.length, 1);
      assert.equal(
        (
          await fetch(url + '/command', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'reset-session' }),
          })
        ).status,
        200,
      );
      assert.deepEqual(commands, ['reset-session']);
      assert.equal(
        (
          await fetch(url + '/command', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'other' }),
          })
        ).status,
        400,
      );
      bridge.stopAuto();
      const stopReply = (await (
        await fetch(url + '/snapshot', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...s,
            automation: { running: true, reason: 'Fixture', count: 0, spent: 0 },
          }),
        })
      ).json()) as any;
      assert.equal(stopReply.stopAuto, true);
      await fetch(url + '/snapshot', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...s, automation: { running: false } }),
      });
      assert.equal(
        (
          (await (
            await fetch(url + '/snapshot', { method: 'POST', headers, body: JSON.stringify(s) })
          ).json()) as any
        ).stopAuto,
        false,
      );
      bridge.setDecision({ key: s.key, action: 'Call' });
      let response = (await (
        await fetch(url + '/snapshot', { method: 'POST', headers, body: JSON.stringify(s) })
      ).json()) as any;
      assert.equal(response.decision.action, 'Call');
      response = await (
        await fetch(url + '/snapshot', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...s, key: 'changed', pot: 80 }),
        })
      ).json();
      assert.equal(response.decision, null);
      await fetch(url + '/pause', { method: 'POST', headers, body: '{}' });
      assert.equal(bridge.latest(), null);
      bridge.rotate();
      assert.equal(
        (await fetch(url + '/pair', { method: 'POST', headers, body: '{}' })).status,
        401,
      );
    } finally {
      bridge.close();
      f.dom.window.close();
    }
  });
});

describe('draggable browser overlay', () => {
  it('requires a stable reading, invalidates changed decisions and saves dragged anchors without game clicks', async () => {
    const f = fixture();
    let shadow: ShadowRoot | undefined;
    const original = f.dom.window.Element.prototype.attachShadow;
    f.dom.window.Element.prototype.attachShadow = function (options: ShadowRootInit) {
      const root = original.call(this, options);
      shadow = root;
      return root;
    };
    f.dom.window.Element.prototype.setPointerCapture = () => {};
    f.dom.window.Element.prototype.releasePointerCapture = () => {};
    const sent: any[] = [];
    (f.dom.window as any).chrome = {
      storage: { onChanged: { addListener() {} } },
      runtime: {
        async sendMessage(m: any) {
          sent.push(m);
          if (m.type === 'settings') return { enabled: true, paired: true, profile: null };
          if (m.type === 'snapshot')
            return {
              ok: true,
              decision: {
                key: m.snapshot.key,
                action: 'Call',
                amount: 12,
                equity: 0.55,
                explanation: 'Fixture decision',
                updatedAt: Date.now(),
              },
            };
          return { ok: true };
        },
      },
    };
    let gameClicks = 0;
    f.doc.querySelector('.table-actions-wrapper')!.addEventListener('click', () => gameClicks++);
    for (const file of ['interface.js', 'panel.js'])
      f.dom.window.eval(
        readFileSync(new URL('../browser-extension/' + file, import.meta.url), 'utf8'),
      );
    f.dom.window.eval(
      readFileSync(new URL('../browser-extension/content.js', import.meta.url), 'utf8'),
    );
    try {
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(shadow!.querySelector('.action')!.textContent, 'Waiting');
      await new Promise((r) => setTimeout(r, 850));
      assert.match(shadow!.querySelector('.action')!.textContent!, /Call/);
      f.doc.querySelectorAll('.single-actions .base-button')[1].textContent = 'Call €20.00';
      await new Promise((r) => setTimeout(r, 130));
      assert.equal(shadow!.querySelector('.action')!.textContent, 'Waiting');
      assert.ok(sent.some((m) => m.type === 'invalidate'));
      (shadow!.querySelector('#map') as HTMLButtonElement).click();
      const marker = shadow!.querySelector('.marker.dealer') as HTMLElement;
      assert.ok(marker);
      const pointer = (type: string, x: number, y: number) => {
        const e = new f.dom.window.MouseEvent(type, {
          clientX: x,
          clientY: y,
          button: 0,
          bubbles: true,
        });
        Object.defineProperty(e, 'pointerId', { value: 1 });
        return e;
      };
      marker.dispatchEvent(pointer('pointerdown', 10, 10));
      marker.dispatchEvent(pointer('pointermove', 45, 45));
      assert.equal(marker.style.left, '35px');
      marker.dispatchEvent(pointer('pointerup', 45, 45));
      assert.ok(sent.filter((m) => m.type === 'profile').length >= 2);
      assert.equal(gameClicks, 0);
    } finally {
      f.dom.window.close();
    }
  });
});

describe('table animation regression', () => {
  it('ignores cosmetic animation while the poker reading remains unchanged', async () => {
    const f = fixture();
    let shadow: ShadowRoot | undefined;
    const original = f.dom.window.Element.prototype.attachShadow;
    f.dom.window.Element.prototype.attachShadow = function (options: ShadowRootInit) {
      const r = original.call(this, options);
      shadow = r;
      return r;
    };
    (f.dom.window as any).chrome = {
      storage: { onChanged: { addListener() {} } },
      runtime: {
        async sendMessage(m: any) {
          if (m.type === 'settings') return { enabled: true, paired: true, profile: null };
          if (m.type === 'snapshot')
            return {
              ok: true,
              decision: {
                key: m.snapshot.key,
                action: 'Call',
                amount: 12,
                equity: 0.55,
                explanation: 'Fixture',
                updatedAt: Date.now(),
              },
            };
          return { ok: true };
        },
      },
    };
    for (const file of ['interface.js', 'panel.js'])
      f.dom.window.eval(
        readFileSync(new URL('../browser-extension/' + file, import.meta.url), 'utf8'),
      );
    f.dom.window.eval(
      readFileSync(new URL('../browser-extension/content.js', import.meta.url), 'utf8'),
    );
    let n = 0;
    const animation = setInterval(() => {
      (f.doc.querySelector('.cards-holder-hero') as HTMLElement).style.transform =
        `translateX(${n++ % 2}px)`;
    }, 50);
    try {
      await new Promise((r) => setTimeout(r, 1700));
      assert.match(shadow!.querySelector('.action')!.textContent!, /Call/);
    } finally {
      clearInterval(animation);
      f.dom.window.close();
    }
  });
});

describe('folded layers and public timer regressions', () => {
  it('ignores folded hero layers and recognises card backs without inventing hole cards', () => {
    const f = fixture();
    const holder = f.doc.querySelector('.cards-holder-hero')!;
    holder.innerHTML = `<div class="cardset-folded-cards-hero">${card('8', '♣')}${card('2', '♠')}</div><div class="card-wrapper"><img class="card-image" src="https://example.com/card-back_00.svg"></div><div class="card-wrapper"><img class="card-image" src="https://example.com/card-back_00.svg"></div>`;
    const s = f.read();
    assert.deepEqual(s.hole, []);
    assert.deepEqual(s.errors, []);
    assert.equal(assessSnapshot(s).valid, false);
    f.dom.window.close();
  });
  it('pauses on a community card back until its face is readable', () => {
    const f = fixture();
    f.doc
      .querySelector('.community-cards')!
      .insertAdjacentHTML(
        'beforeend',
        '<div class="card-wrapper"><img class="card-image" src="https://example.com/card-back_00.svg"></div>',
      );
    assert.match(f.read().errors.join(' '), /community card/i);
    f.dom.window.close();
  });
  it('keeps decision identity stable when only the countdown changes', () => {
    const f = fixture();
    const s = f.read();
    assert.equal(f.r.decisionKey({ ...s, timeLeft: 18 }), f.r.decisionKey({ ...s, timeLeft: 17 }));
    assert.notEqual(f.r.decisionKey(s), f.r.decisionKey({ ...s, call: 15 }));
    f.dom.window.close();
  });
  it('keeps the username from the visible balance when nickname becomes a timer', () => {
    const f = fixture();
    f.doc.querySelector('.player-seat-1 .player-nameplate')!.innerHTML =
      '<span class="nickname">Time: 18</span><span class="amount" id=\'chips-Atlas"-"1\'>€180.00</span>';
    assert.equal(f.read().seats.find((p) => p.id === 'player-seat-1')!.username, 'Atlas');
    f.dom.window.close();
  });
});

describe('compact reader chart', () => {
  it('scrubs nearest checkpoints, reads period P/L, and resets through its callback', async () => {
    const dom = new JSDOM('<div id="host"></div>', { runScripts: 'outside-only' });
    const root = dom.window.document.querySelector('#host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="bar"><div class="tools"></div><div class="advice"></div></div>';
    dom.window.eval(
      readFileSync(new URL('../browser-extension/panel.js', import.meta.url), 'utf8'),
    );
    let resets = 0;
    const view = (dom.window as any).RiverCompactPanel.create(root, {
      reset: async () => {
        resets++;
      },
    });
    const performance = {
      currency: '€',
      net: -100,
      start: 1000,
      count: 2,
      points: [
        { at: 1000, net: 0 },
        { at: 2000, net: 200 },
        { at: 3000, net: -100 },
      ],
      ten: [
        { at: 1000, net: 200, delta: 200 },
        { at: 2000, net: -100, delta: -300 },
      ],
      hour: [],
    };
    view.update({ at: Date.now(), hole: [], board: [], performance }, null);
    const svg = root.querySelector('svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, width: 300 }) as DOMRect;
    svg.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 150 }));
    assert.match(root.querySelector('.reader-tooltip')!.textContent!, /Net \+€2.00/);
    svg.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
    assert.match(root.querySelector('.reader-tooltip')!.textContent!, /Net −€1.00/);
    (root.querySelector('#chart-view') as HTMLButtonElement).click();
    svg.dispatchEvent(new dom.window.MouseEvent('pointermove', { clientX: 292 }));
    assert.match(root.querySelector('.reader-tooltip')!.textContent!, /Period −€3.00/);
    (root.querySelector('#chart-reset') as HTMLButtonElement).click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(resets, 1);
    assert.equal(root.querySelector('.reader-net')!.textContent, '—');
    dom.window.close();
  });
});

function allInFixture() {
  const f = fixture();
  f.doc.querySelector('.my-player .player-nameplate')!.textContent = 'You €60.57';
  f.doc.querySelector('.total-pot')!.textContent = 'Pot: €91';
  f.doc.querySelector('.cards-holder-hero')!.innerHTML = card('10', '♦') + card('9', '♦');
  f.doc.querySelector('.community-cards')!.innerHTML =
    card('10', '♠') + card('A', '♠') + card('6', '♥') + card('J', '♦') + card('J', '♥');
  f.doc
    .querySelector('.table-area')!
    .insertAdjacentHTML(
      'beforeend',
      '<div class="bet player-bet-3 pt-visibility-hidden"></div><div class="bet player-bet-1">€78</div>',
    );
  f.doc.querySelector('.single-actions')!.innerHTML =
    '<div class="base-button action-button">Fold</div><div class="base-button action-button">All In €60.57</div>';
  return f;
}
describe('stack-limited all-in call regression', () => {
  it('recognizes the screenshot position as a turn with a 60.57 call and excludes the uncallable excess', () => {
    const f = allInFixture(),
      s = f.read();
    assert.equal(s.heroTurn, true);
    assert.equal(s.allInCall, true);
    assert.equal(s.call, 60.57);
    assert.equal(s.pot, 91);
    assert.equal(s.callPot, 73.57);
    assert.deepEqual(s.actions, ['fold', 'call']);
    assert.equal(assessSnapshot(s).valid, true);
    assert.equal(
      f.r.actionForButton(f.doc.querySelectorAll('.single-actions .action-button')[1], s),
      'call',
    );
    const d = readerDecision(s, {
      equity: 0.43,
      win: 0.43,
      tie: 0,
      loss: 0.57,
      margin: 0.01,
      trials: 6000,
      distribution: [],
      made: 'Two pair',
    })!;
    assert.ok(Math.abs(d.threshold - 60.57 / 134.14) < 0.00001);
    assert.equal(d.action, 'Fold');
    const plan = makePlan(
      s,
      {
        equity: 0.43,
        win: 0.43,
        tie: 0,
        loss: 0.57,
        margin: 0.01,
        trials: 6000,
        distribution: [],
        made: 'Two pair',
      },
      emptyBook(),
    )!;
    assert.equal(plan.action, 'Fold');
    assert.equal(plan.threshold, d.threshold);
    assert.match(plan.explanation, /unmatched/);
    const clean = require('../electron/reader-bridge.cjs').sanitize(s);
    assert.equal(clean.callPot, 73.57);
    assert.equal(clean.allInCall, true);
    assert.equal(assessSnapshot({ ...s, callPot: undefined }).valid, false);
    f.dom.window.close();
  });
  it('does not confuse a shove with a call, or accept mismatching/ambiguous amounts', () => {
    for (const label of ['All In €60.56', 'All In €60.57 €78', 'All In $60.57', 'All In']) {
      const f = allInFixture();
      f.doc.querySelectorAll('.single-actions .action-button')[1].textContent = label;
      assert.equal(f.read().allInCall, undefined);
      assert.equal(assessSnapshot(f.read()).valid, false);
      f.dom.window.close();
    }
    const f = allInFixture();
    f.doc.querySelector('.player-bet-1')!.textContent = '€20';
    assert.equal(f.read().allInCall, undefined);
    assert.equal(f.r.actionKind('All In €60.57'), null);
    f.dom.window.close();
  });
  it('ignores all-in sizing presets and disabled primary buttons', () => {
    const f = fixture();
    f.doc
      .querySelector('.single-actions')!
      .insertAdjacentHTML('beforeend', '<div class="pre-configured-action-button">All In</div>');
    assert.equal(f.read().allInCall, undefined);
    assert.equal(f.read().call, 12);
    f.dom.window.close();
    const g = allInFixture();
    g.doc.querySelectorAll('.single-actions .action-button')[1].setAttribute('disabled', '');
    assert.equal(g.read().heroTurn, false);
    g.dom.window.close();
  });
  it('keeps multiway pot uncertainty explicit instead of silently waiting for a turn', () => {
    const f = allInFixture();
    f.doc
      .querySelector('.player-seat-2 .cards-holder-other-hidden')!
      .classList.remove('pt-visibility-hidden');
    const s = f.read();
    assert.equal(s.heroTurn, true);
    assert.equal(s.call, 60.57);
    assert.match(assessSnapshot(s).reason, /side-pot/);
    f.dom.window.close();
  });
  it('routes only the verified primary button through the same call spend cap, once', () => {
    for (const cap of [60, 61]) {
      const f = allInFixture();
      f.dom.window.eval(
        readFileSync(new URL('../browser-extension/autoplay.js', import.meta.url), 'utf8'),
      );
      let time = 10000,
        clicks = 0;
      const button = f.doc.querySelectorAll('.single-actions .action-button')[1];
      button.addEventListener('click', () => clicks++);
      const c = (f.dom.window as any).RiverAutoplay.create({
        read: f.read,
        now: () => time,
        click: (kind: string, s: ReaderSnapshot) => {
          const matches = [...f.doc.querySelectorAll('.single-actions .action-button')].filter(
            (b) => f.r.actionForButton(b, s) === kind,
          );
          if (matches.length !== 1) return false;
          (matches[0] as HTMLElement).click();
          return true;
        },
      });
      c.start({ perAction: cap, budget: 100, actions: 10 });
      const observe = () => {
        const s = f.read();
        c.observe(s, { key: s.key, action: 'Call', updatedAt: time });
      };
      observe();
      time += 900;
      observe();
      time += 900;
      observe();
      assert.equal(clicks, cap === 61 ? 1 : 0);
      assert.equal(c.status().spent, cap === 61 ? 6057 : 0);
      f.dom.window.close();
    }
  });
});

describe('equity before the hero turn', () => {
  it('permits fresh card analysis while blocking action advice', () => {
    const f = fixture();
    const s = { ...f.read(), heroTurn: false, call: null, actions: [] };
    assert.equal(assessEquitySnapshot(s).valid, true);
    assert.equal(assessSnapshot(s).valid, false);
    assert.equal(assessEquitySnapshot({ ...s, board: ['Js', 'Tc'] }).valid, false);
    assert.equal(assessEquitySnapshot(s, s.receivedAt + 4000).valid, false);
    f.dom.window.close();
  });
});

describe('always-visible compact win chance', () => {
  it('shows fresh idle-turn odds and removes mismatched or stale estimates', () => {
    const dom = new JSDOM('<div id="host"></div>', { runScripts: 'outside-only' }),
      root = dom.window.document.querySelector('#host')!.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<div class="bar"><div class="header"><button id="minimize"></button></div><div class="tools"><button id="live"></button></div><div class="reader-cards"></div><div class="reader-stats"></div><div class="advice"><span class="action">Waiting</span></div><div class="hint"></div><details class="reader-analysis"><summary></summary></details><details class="reader-profiles"></details><div class="reader-performance"></div><div class="auto-panel"><button id="auto-stop"></button></div></div>';
    dom.window.eval(
      readFileSync(new URL('../browser-extension/interface.js', import.meta.url), 'utf8'),
    );
    const ui = (dom.window as any).RiverInterface.mount(root),
      s = { key: 'hand-a', heroTurn: false, errors: [] },
      panel = { key: 'hand-a', at: Date.now(), win: 0.59, equity: 0.61, tie: 0.04 };
    assert.ok(root.querySelector('#river-tab-auto'));
    assert.ok(root.querySelector('#river-pane-auto .auto-panel'));
    ui.refresh(panel, s, null);
    assert.equal(root.querySelector('.action')!.textContent, '59%');
    assert.equal(root.querySelector('#read-equity')!.textContent, '61%');
    assert.equal(root.querySelector('#read-threshold')!.textContent, '—');
    for (const [p, snapshot] of [
      [{ ...panel, key: 'hand-b' }, s],
      [{ ...panel, at: Date.now() - 5000 }, s],
      [panel, { ...s, errors: ['Dealing'] }],
      [null, s],
    ]) {
      ui.refresh(p, snapshot, null);
      assert.equal(root.querySelector('.action')!.textContent, 'Waiting');
      assert.equal(root.querySelector('#read-equity')!.textContent, '—');
    }
    dom.window.close();
  });
});

describe('live action-conditioned range and postflop value discipline', () => {
  it('folds Queen-Four offsuit on the 8d 2s 9c Js turn facing a €4.00 bet into €9.49', () => {
    const f = fixture();
    const s: ReaderSnapshot = {
      ...f.read(),
      hole: ['Qd', '4c'],
      board: ['8d', '2s', '9c', 'Js'],
      pot: 9.49,
      call: 4,
      heroBet: 0,
      actionAmounts: { call: 4, raise: 8 },
      sizing: { min: 8, max: 50.73, editable: true },
      seats: [
        {
          id: 'player-seat-1',
          label: 'beedark738',
          username: 'beedark738',
          hero: false,
          inHand: true,
          stack: 43.38,
          bet: 4,
          lastAction: 'bet',
        },
        {
          id: 'player-seat-3',
          label: 'You',
          hero: true,
          inHand: true,
          stack: 50.73,
          bet: 0,
        },
      ],
    };
    const eq = calculateEquity({
      hole: s.hole.map(parseCard),
      board: s.board.map(parseCard),
      opponents: s.opponents,
      range: 'random',
      trials: 8000,
      situation: situationFromSnapshot(s),
    });
    assert.ok(eq.equity < 0.26, `expected action-weighted equity < 26%, got ${eq.equity}`);
    const plan = makePlan(s, eq, emptyBook(), s.receivedAt)!;
    assert.equal(plan.action, 'Fold');
    assert.equal(readerDecision(s, eq, s.receivedAt)?.action, 'Fold');
    f.dom.window.close();
  });

  it('folds Ace-King high on the 2d 6h 4h 7s 3s river facing €12.50 into €26.04 and never value-raises high card', () => {
    const f = fixture();
    const s: ReaderSnapshot = {
      ...f.read(),
      hole: ['Ad', 'Kh'],
      board: ['2d', '6h', '4h', '7s', '3s'],
      pot: 26.04,
      call: 12.5,
      heroBet: 0,
      actionAmounts: { call: 12.5, raise: 25 },
      sizing: { min: 25, max: 90.99, editable: true },
      seats: [
        {
          id: 'player-seat-1',
          label: 'Voodooman123',
          username: 'Voodooman123',
          hero: false,
          inHand: true,
          stack: 33.07,
          bet: 12.5,
          lastAction: 'bet',
        },
        {
          id: 'player-seat-3',
          label: 'You',
          hero: true,
          inHand: true,
          stack: 90.99,
          bet: 0,
        },
      ],
    };
    const book: OpponentBook = {
      profiles: {
        Voodooman123: {
          name: 'Voodooman123',
          hands: 40,
          actions: 40,
          checks: 10,
          calls: 10,
          bets: 10,
          raises: 5,
          folds: 5,
          pricedPre: 40,
          enteredPre: 10,
          faced: 20,
          foldedFacing: 8,
          showdowns: 2,
          riverBluffCandidates: 0,
          updated: s.receivedAt,
        },
      },
      events: [],
    };
    for (const range of ['random', 'wide', 'balanced', 'tight'] as const) {
      const eq = calculateEquity({
        hole: s.hole.map(parseCard),
        board: s.board.map(parseCard),
        opponents: 1,
        range,
        opponentRanges: [range],
        trials: 8000,
        situation: situationFromSnapshot(s),
      });
      const plan = makePlan(s, eq, book, s.receivedAt)!;
      assert.equal(plan.action, 'Fold', `expected Fold for range ${range}, got ${plan.action}`);
      assert.equal(readerDecision(s, eq, s.receivedAt)?.action, 'Fold');
    }
    // Even if raw unconditioned 74% equity is passed on the river with High card, it must never Raise
    const rawUnconditioned = {
      equity: 0.741,
      win: 0.73,
      tie: 0.025,
      loss: 0.245,
      margin: 0,
      trials: 990,
      distribution: [],
      made: 'High card',
    };
    assert.notEqual(makePlan(s, rawUnconditioned, book, s.receivedAt)?.action, 'Raise');
    f.dom.window.close();
  });
});
