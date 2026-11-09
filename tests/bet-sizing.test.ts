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
        : 'submits at the clamped table amount after timeout if within limits',
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
          now += 1400;
          tick();
          now += 1000;
          tick();
          assert.equal(clicks, 1);
          assert.equal(controller.status().spent, 400);
        }
        assert.equal(f.submits(), 0);
        f.dom.window.close();
      },
    );
  it('completes an automatic raise end-to-end with adapter.js without invalidating decisionKey or stopping Auto', () => {
    const dom = new JSDOM(
      `<div class="table"><div class="hand-id">#987654</div><div class="table-area"><div class="player-area player-seat-1"><div class="table-player"><div class="player-nameplate">Villain €100.00</div><div class="cards-holder-other-hidden"><div class="card-wrapper"></div><div class="card-wrapper"></div></div></div></div><div class="bet player-bet-1">€4.00</div><div class="player-area player-seat-3 my-player"><div class="table-player my-player"><div class="player-nameplate">You €96.00</div><div class="cards-holder-hero"><div class="card card-animation-finished"><div class="card-wrapper"><div class="card-image-backup"><span class="card-rank">A</span><span class="card-suit">♠</span></div></div></div><div class="card card-animation-finished"><div class="card-wrapper"><div class="card-image-backup"><span class="card-rank">Q</span><span class="card-suit">♥</span></div></div></div></div></div></div><div class="bet player-bet-3"></div><div class="table-root"><div class="total-pot">Pot: €9.50</div><div class="community-cards"><div class="card card-animation-finished"><div class="card-wrapper"><div class="card-image-backup"><span class="card-rank">Q</span><span class="card-suit">♠</span></div></div></div><div class="card card-animation-finished"><div class="card-wrapper"><div class="card-image-backup"><span class="card-rank">7</span><span class="card-suit">♦</span></div></div></div><div class="card card-animation-finished"><div class="card-wrapper"><div class="card-image-backup"><span class="card-rank">2</span><span class="card-suit">♣</span></div></div></div></div></div></div><div class="table-actions-wrapper"><div class="betting-slider-wrapper"><input class="betting-input" type="text" value="€8.00"><div class="betting-slider-thumb" style="left: 0px"></div></div><div class="actions-area single-actions"><div class="base-button action-button">Fold</div><div class="base-button action-button">Call €4.00</div><div class="base-button action-button">Raise To €8.00</div></div></div></div>`,
      { runScripts: 'outside-only', pretendToBeVisual: true },
    );
    const w = dom.window as any,
      doc = w.document;
    w.Element.prototype.getBoundingClientRect = () => ({
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
    for (const file of ['adapter.js', 'bet-sizing.js', 'autoplay.js'])
      w.eval(readFileSync(new URL('../browser-extension/' + file, import.meta.url), 'utf8'));
    const input = doc.querySelector('input.betting-input') as HTMLInputElement;
    const raiseBtn = doc.querySelectorAll('.single-actions .action-button')[2] as HTMLElement;
    const thumb = doc.querySelector('.betting-slider-thumb') as HTMLElement;
    let focused = false;
    input.addEventListener('focusin', () => {
      focused = true;
    });
    input.addEventListener('input', () => {
      if (focused && /^\d+\.\d{2}$/.test(input.value)) {
        raiseBtn.textContent = 'Raise To €' + Number(input.value).toFixed(2);
        thumb.style.left = '42px';
      }
    });
    input.addEventListener('focusout', () => {
      focused = false;
    });
    // Simulate backgrounded window where input.focus() does not change activeElement
    input.focus = () => {};
    input.blur = () => {};
    const mapping = w.RiverReader.defaults(w.RiverReader.table(doc));
    const read = () => w.RiverReader.read(doc, mapping);
    const initial = read();
    assert.equal(initial.heroBet, 0);
    assert.equal(initial.sizing.min, 8);
    assert.equal(initial.sizing.editable, true);

    let now = 10000,
      raised = 0;
    const controller = w.RiverAutoplay.create({
      read,
      now: () => now,
      prepare: (target: number) =>
        w.RiverBetSizing.prepare(doc.querySelector('.single-actions'), target),
      click: (kind: string, s: any) => {
        if (kind === 'raise' && w.RiverReader.actionForButton(raiseBtn, s) === 'raise') {
          raised++;
          return true;
        }
        return false;
      },
    });
    controller.start({ perAction: 50, budget: 200, actions: 10 });
    const decision = {
      key: initial.key,
      action: 'Raise',
      target: 14.75,
      updatedAt: now,
    };
    controller.observe(initial, decision);
    assert.equal(raiseBtn.textContent, 'Raise To €14.75');
    const afterPrepare = read();
    // Decision key and min raise bound must remain stable after slider/input update
    assert.equal(afterPrepare.key, initial.key);
    assert.equal(afterPrepare.sizing.min, 8);
    assert.equal(controller.status().running, true);

    controller.observe(afterPrepare, decision);
    now += 900;
    controller.observe(read(), decision);
    assert.equal(raised, 1);
    assert.equal(controller.status().running, true);
    assert.equal(controller.status().spent, 1475);
    dom.window.close();
  });
  it('commits bet size when React 18 batches synchronous state updates across macrotasks and tracks values in a separate world', async () => {
    const dom = new JSDOM(
      `<div class="table-actions-wrapper"><div class="betting-slider-wrapper"><input class="betting-input" type="text" value="€1"></div><div class="actions-area single-actions"><div class="base-button action-button">Fold</div><div class="base-button action-button">Check</div><div class="base-button action-button">Bet €1</div></div></div>`,
      { runScripts: 'outside-only', pretendToBeVisual: true },
    );
    const w = dom.window as any,
      doc = w.document;
    w.RiverReader = {
      visible: (e: HTMLElement) => Boolean(e && e.isConnected && !e.hidden),
      decisionKey: (s: unknown) => JSON.stringify(s),
    };
    for (const file of ['bet-sizing.js', 'autoplay.js'])
      w.eval(readFileSync(new URL('../browser-extension/' + file, import.meta.url), 'utf8'));

    const input = doc.querySelector('input.betting-input') as HTMLInputElement;
    const betBtn = doc.querySelectorAll('.single-actions .action-button')[2] as HTMLElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      w.HTMLInputElement.prototype,
      'value',
    )!.set!;

    // Simulate React 18 Main World _valueTracker (inaccessible as input._valueTracker)
    // and React 18 automatic batching where state updates only flush in a macrotask.
    let mainWorldTrackedValue = '€1';
    let queuedState = { isOnFocus: false, text: '1' };
    let renderedState = { ...queuedState };
    let flushScheduled = false;
    const scheduleReactFlush = () => {
      if (flushScheduled) return;
      flushScheduled = true;
      w.setTimeout(() => {
        flushScheduled = false;
        renderedState = { ...queuedState };
        const display = renderedState.isOnFocus ? renderedState.text : `€${renderedState.text}`;
        mainWorldTrackedValue = display;
        nativeSetter.call(input, display);
      }, 0);
    };

    input.addEventListener('focusin', () => {
      queuedState.isOnFocus = true;
      scheduleReactFlush();
    });
    input.addEventListener('input', () => {
      // React 18 Wa(U): ignore if DOM value equals Main World tracked value
      if (input.value === mainWorldTrackedValue) return;
      mainWorldTrackedValue = input.value;
      // Ignore if React has not yet rendered the focus state
      if (!renderedState.isOnFocus) return;
      if (/^\d*(?:\.\d{1,2})?$/.test(input.value)) {
        queuedState.text = input.value;
        scheduleReactFlush();
      }
    });
    input.addEventListener('focusout', () => {
      queuedState.isOnFocus = false;
      // React onBlur callback closure reads renderedState.text from the last completed render
      const n = Number(renderedState.text);
      if (renderedState.isOnFocus && Number.isFinite(n) && n >= 1) {
        const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2);
        queuedState.text = formatted;
        betBtn.textContent = `Bet €${formatted}`;
      }
      scheduleReactFlush();
    });

    assert.equal(w.RiverBetSizing.prepare(doc.querySelector('.single-actions'), 2), true);
    // Synchronous tick 0 cannot commit because React 18 batches focus+input+blur
    assert.equal(betBtn.textContent, 'Bet €1');
    // Wait for the staged macrotask commit (focus -> input -> blur across separate ticks).
    // Slower machines (Windows CI) need longer than the usual ~100 ms.
    for (let t = 0; t < 2000 && (betBtn.textContent as string) !== 'Bet €2'; t += 20)
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(betBtn.textContent, 'Bet €2');
    assert.equal(input.value, '€2');
    dom.window.close();
  });
  it('falls back to the confirmed table raise amount instead of stopping when timeoutFallback is true', () => {
    const f = editor('text', 4.5);
    let now = 10000,
      clicks = 0;
    const read = () => ({
      handId: 'fake-fallback-1',
      currency: '€',
      heroTurn: true,
      hole: ['As', '9h'],
      board: [],
      pot: 1.5,
      call: 0.5,
      heroBet: 0.5,
      actions: ['fold', 'call', 'raise'],
      actionAmounts: { raise: 2.0 },
      errors: [],
      seats: [{ id: 'hero', hero: true, stack: 75, bet: 0.5, inHand: true }],
      sizing: { editable: true, min: 2.0, max: 75.5 },
    });
    const controller = f.w.RiverAutoplay.create({
      read,
      now: () => now,
      prepare: () => true, // simulates input entry that table does not echo
      click: (action: string) => {
        if (action === 'raise') clicks++;
        return true;
      },
    });
    const tick = () => {
      const s = read();
      controller.observe(s, {
        key: f.w.RiverAutoplay.keyOf(s),
        action: 'Raise',
        target: 2.2, // requested target differs from table's confirmed 2.0
        updatedAt: now,
      });
    };
    controller.start({ perRound: 10, maxLoss: 50, rounds: 50, minutes: 60, timeoutFallback: true });
    tick();
    assert.equal(clicks, 0);
    // After 3100ms, the table still shows 2.00. Since timeoutFallback is enabled,
    // it falls back to confirmed €2.00 raise rather than killing Auto Mode!
    now += 3100;
    tick();
    assert.equal(controller.status().running, true);
    now += 900;
    tick();
    assert.equal(clicks, 1);
    assert.equal(controller.status().spent, 150); // €2.00 - €0.50 heroBet = €1.50
    assert.equal(controller.status().running, true);
    f.dom.window.close();
  });
  it('detects and clicks matching preset buttons for preflop and postflop bets', () => {
    const dom = new JSDOM(
      `<div class="table-actions-wrapper"><div class="preset-buttons"><div class="preset-size">2.5 BB</div><div class="preset-size">3 BB</div><div class="preset-size">All-in</div></div><div class="betting-slider-wrapper"><input class="betting-input" type="text" value="€2"></div><div class="actions-area single-actions"><div class="base-button action-button">Fold</div><div class="base-button action-button">Call €0.50</div><div class="base-button action-button">Raise To €2</div></div></div>`,
      { runScripts: 'outside-only', pretendToBeVisual: true },
    );
    const w = dom.window as any,
      doc = w.document;
    w.RiverReader = {
      visible: (e: HTMLElement) => Boolean(e && e.isConnected && !e.hidden),
      decisionKey: (s: unknown) => JSON.stringify(s),
    };
    for (const file of ['bet-sizing.js'])
      w.eval(readFileSync(new URL('../browser-extension/' + file, import.meta.url), 'utf8'));

    let presetClicked = '';
    for (const el of doc.querySelectorAll('.preset-size')) {
      el.addEventListener('click', () => {
        presetClicked = el.textContent;
      });
    }

    const s = {
      sizing: { min: 2.0, max: 100 },
      call: 0.5,
      pot: 1.5,
      heroBet: 0.5,
    };
    // Sizing 2.5 BB (2.5 * 1.0 = 2.50)
    assert.equal(
      w.RiverBetSizing.prepare(doc.querySelector('.table-actions-wrapper'), 2.5, s),
      true,
    );
    assert.equal(presetClicked, '2.5 BB');

    // Sizing 3 BB (3.0 * 1.0 = 3.00)
    assert.equal(
      w.RiverBetSizing.prepare(doc.querySelector('.table-actions-wrapper'), 3.0, s),
      true,
    );
    assert.equal(presetClicked, '3 BB');

    // Postflop table with 50% and 100% presets
    const postDom = new JSDOM(
      `<div class="table-actions-wrapper"><div class="preset-buttons"><div class="preset-size">50% of pot</div><div class="preset-size">100% of pot</div><div class="preset-size">All-in</div></div><div class="betting-slider-wrapper"><input class="betting-input" type="text" value="€1"></div><div class="actions-area single-actions"><div class="base-button action-button">Check</div><div class="base-button action-button">Bet €1</div></div></div>`,
      { runScripts: 'outside-only', pretendToBeVisual: true },
    );
    const postW = postDom.window as any,
      postDoc = postW.document;
    postW.RiverReader = w.RiverReader;
    postW.eval(
      readFileSync(new URL('../browser-extension/bet-sizing.js', import.meta.url), 'utf8'),
    );
    let postClicked = '';
    for (const el of postDoc.querySelectorAll('.preset-size')) {
      el.addEventListener('click', () => {
        postClicked = el.textContent;
      });
    }

    const postS = {
      sizing: { min: 1.0, max: 100 },
      call: 0,
      pot: 10,
      heroBet: 0,
    };
    // 50% pot = 5.0
    assert.equal(
      postW.RiverBetSizing.prepare(postDoc.querySelector('.table-actions-wrapper'), 5.0, postS),
      true,
    );
    assert.equal(postClicked, '50% of pot');

    // 100% pot = 10.0
    assert.equal(
      postW.RiverBetSizing.prepare(postDoc.querySelector('.table-actions-wrapper'), 10.0, postS),
      true,
    );
    assert.equal(postClicked, '100% of pot');

    // 75% pot (7.5) snaps to 100% pot (closer to pot than 50% pot)
    assert.equal(
      postW.RiverBetSizing.prepare(postDoc.querySelector('.table-actions-wrapper'), 8.0, postS),
      true,
    );
    assert.equal(postClicked, '100% of pot');

    // Over-pot (12.0) snaps to 100% of pot
    assert.equal(
      postW.RiverBetSizing.prepare(postDoc.querySelector('.table-actions-wrapper'), 12.0, postS),
      true,
    );
    assert.equal(postClicked, '100% of pot');

    postDom.window.close();
    dom.window.close();
  });
});
