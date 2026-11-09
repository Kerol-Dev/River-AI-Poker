import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function editor(type = 'text', clamp = Infinity) {
  const dom = new JSDOM(
    `<form><input class="betting-input" type="${type}" value="${type === 'number' ? '2.50' : '€2.50'}"><button type="button">Raise To €2.50</button></form>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const w = dom.window as any,
    doc = w.document,
    input = doc.querySelector('input'),
    button = doc.querySelector('button');
  w.RiverReader = {
    visible: (e: HTMLElement) => e.isConnected && !e.hidden,
    decisionKey: (s: unknown) => JSON.stringify(s),
  };
  for (const file of ['bet-sizing.js', 'autoplay.js'])
    w.eval(readFileSync(new URL('../browser-extension/' + file, import.meta.url), 'utf8'));
  let pending: number | null = null,
    focused = false,
    submits = 0;
  input.addEventListener('focus', () => {
    focused = true;
    input.value = input.value.replace('€', '');
  });
  input.addEventListener('input', () => {
    pending =
      focused && /^\d+\.\d{2}$/.test(input.value) ? Math.min(clamp, Number(input.value)) : null;
  });
  input.addEventListener('blur', () => {
    if (pending !== null) {
      button.textContent = 'Raise To €' + pending.toFixed(2);
      input.value = (type === 'text' ? '€' : '') + pending.toFixed(2);
    }
    focused = false;
  });
  doc.querySelector('form').addEventListener('submit', (e: Event) => {
    e.preventDefault();
    submits++;
  });
  return {
    dom,
    w,
    doc,
    input,
    button,
    prepare: (target: number) => w.RiverBetSizing.prepare(doc.querySelector('form'), target),
    submits: () => submits,
  };
}
describe('actual amount-entry path on synthetic tables', () => {
  it('commits a decimal through focus, input and blur without submitting the form', () => {
    const f = editor();
    // Reproduce the former currency-prefixed, unfocused write: no client commit.
    Object.getOwnPropertyDescriptor(f.w.HTMLInputElement.prototype, 'value')!.set!.call(
      f.input,
      '€5.25',
    );
    f.input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
    f.input.dispatchEvent(new f.w.Event('change', { bubbles: true }));
    assert.equal(f.button.textContent, 'Raise To €2.50');
    assert.equal(f.prepare(5.25), true);
    assert.equal(f.button.textContent, 'Raise To €5.25');
    assert.notEqual(f.doc.activeElement, f.input);
    assert.equal(f.submits(), 0);
    f.dom.window.close();
  });
  it('supports numeric fields without passing a currency symbol', () => {
    const f = editor('number');
    assert.equal(f.prepare(5.25), true);
    assert.equal(f.input.value, '5.25');
    assert.equal(f.button.textContent, 'Raise To €5.25');
    f.dom.window.close();
  });
  it('rejects invalid, ambiguous, disabled and cancelled edits', () => {
    const f = editor();
    for (const target of [NaN, Infinity, -1, 0, 1.001]) assert.equal(f.prepare(target), false);
    f.input.disabled = true;
    assert.equal(f.prepare(5.25), false);
    f.input.disabled = false;
    f.doc.querySelector('form').append(f.input.cloneNode());
    assert.equal(f.prepare(5.25), false);
    f.doc.querySelectorAll('input')[1].remove();
    f.input.addEventListener('beforeinput', (e: Event) => e.preventDefault());
    assert.equal(f.prepare(5.25), false);
    assert.equal(f.button.textContent, 'Raise To €2.50');
    f.dom.window.close();
  });
  for (const clamp of [Infinity, 4.5])
    it(
      clamp === Infinity
        ? 'submits one raise only after the committed button echoes the target'
        : 'does not submit a clamped or unconfirmed target',
      () => {
        const f = editor('text', clamp);
        let now = 10000,
          clicks = 0;
        const read = () => ({
          handId: 'fake-1',
          currency: '€',
          heroTurn: true,
          hole: ['As', 'Ah'],
          board: [],
          pot: 4,
          call: 1,
          heroBet: 0.5,
          actions: ['fold', 'call', 'raise'],
          actionAmounts: { raise: Number(f.button.textContent!.split('€')[1]) },
          errors: [],
          seats: [{ id: 'hero', hero: true, stack: 10, bet: 0.5, inHand: true }],
          sizing: { editable: true, min: 2.5, max: 10.5 },
        });
        const controller = f.w.RiverAutoplay.create({
          read,
          now: () => now,
          prepare: f.prepare,
          click: () => {
            clicks++;
            return true;
          },
        });
        const tick = () => {
          const s = read();
          controller.observe(s, {
            key: f.w.RiverAutoplay.keyOf(s),
            action: 'Raise',
            target: 5.25,
            updatedAt: now,
          });
        };
        controller.start({ perAction: 5, budget: 10, actions: 10 });
        tick();
        assert.equal(clicks, 0);
        tick();
        now += 900;
        tick();
        if (clamp === Infinity) {
          assert.equal(clicks, 1);
          assert.equal(controller.status().spent, 475);
          now += 1000;
          tick();
          assert.equal(clicks, 1);
        } else {
          assert.equal(clicks, 0);
          now += 2200;
          tick();
          assert.equal(controller.status().running, false);
          assert.match(controller.status().reason, /confirm the requested bet size/);
        }
        assert.equal(f.submits(), 0);
        f.dom.window.close();
      },
    );
});
