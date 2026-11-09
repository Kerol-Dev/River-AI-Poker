/* Edit only the visible amount field. Submission and echo verification belong to autoplay. */
(() => {
  let stagedTimers = [];
  function clearStaged(view) {
    for (const id of stagedTimers) {
      try {
        view?.clearTimeout?.(id);
      } catch {}
    }
    stagedTimers = [];
  }
  function actionScope(root) {
    return root && !root.querySelector?.('input.betting-input')
      ? root.closest?.('.table-actions-wrapper') || root
      : root;
  }
  function findInput(root) {
    const scope = actionScope(root);
    const inputs = scope
      ? [...scope.querySelectorAll('input.betting-input')].filter(
          (input) => globalThis.RiverReader.visible(input) && !input.disabled && !input.readOnly,
        )
      : [];
    return inputs.length === 1 && ['text', 'number', 'tel'].includes(inputs[0].type)
      ? inputs[0]
      : null;
  }
  function buttonMatchesTarget(root, target) {
    const scope = actionScope(root);
    if (!scope) return false;
    const buttons = [
      ...scope.querySelectorAll(
        '.actions-area:not(.pre-actions) .base-button.action-button, button',
      ),
    ].filter((b) => globalThis.RiverReader?.visible?.(b));
    return buttons.some((b) => {
      const label = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^(?:bet|raise)\b/i.test(label)) return false;
      const match = /([€£$])\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d.,])/.exec(label);
      if (!match) return false;
      const amount = Number(match[2].replaceAll(',', ''));
      return Number.isFinite(amount) && Math.abs(amount - target) <= 0.005;
    });
  }
  function focusStep(input, view) {
    let sawFocus = false;
    const onFocus = () => {
      sawFocus = true;
    };
    input.addEventListener('focus', onFocus, { once: true });
    input.focus({ preventScroll: true });
    input.removeEventListener('focus', onFocus);
    if (!sawFocus) {
      input.dispatchEvent(new view.FocusEvent('focus', { bubbles: false }));
      input.dispatchEvent(new view.FocusEvent('focusin', { bubbles: true }));
    }
  }
  function writeStep(input, view, setter, value) {
    if (input.type !== 'number') {
      try {
        input.select();
      } catch {}
    }
    const before = new view.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: value,
    });
    if (!input.dispatchEvent(before)) {
      blurStep(input, view);
      return false;
    }
    try {
      input._valueTracker?.setValue?.('');
    } catch {}
    // In Chrome's Isolated World, React's Main World _valueTracker is on the
    // page wrapper. Clearing to '' and firing input first guarantees the Main
    // World _valueTracker sees a transition when we set the target value next.
    if (input.value !== '') {
      setter.call(input, '');
      input.dispatchEvent(
        new view.InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContentBackward',
          data: null,
        }),
      );
    }
    setter.call(input, value);
    input.dispatchEvent(
      new view.InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: value,
      }),
    );
    input.dispatchEvent(new view.Event('change', { bubbles: true }));
    return true;
  }
  function blurStep(input, view) {
    // Commit through blur, never Enter: Enter could submit a wager or a form.
    let sawBlur = false;
    const onBlur = () => {
      sawBlur = true;
    };
    input.addEventListener('blur', onBlur, { once: true });
    input.blur();
    input.removeEventListener('blur', onBlur);
    if (!sawBlur) {
      input.dispatchEvent(new view.FocusEvent('blur', { bubbles: false }));
      input.dispatchEvent(new view.FocusEvent('focusout', { bubbles: true }));
    }
  }
  function commitValue(input, view, setter, value) {
    focusStep(input, view);
    if (!writeStep(input, view, setter, value)) return false;
    blurStep(input, view);
    return true;
  }
  function scheduleStagedCommit(root, input, view, setter, target, value) {
    if (typeof view?.setTimeout !== 'function') return;
    const schedule = (fn, delay) => {
      const id = view.setTimeout(() => {
        try {
          if (!input.isConnected || findInput(root) !== input) return;
          fn();
        } catch {}
      }, delay);
      id?.unref?.();
      stagedTimers.push(id);
    };
    const queueCycle = (val, startMs) => {
      schedule(() => {
        if (buttonMatchesTarget(root, target)) return;
        focusStep(input, view);
      }, startMs);
      schedule(() => {
        if (buttonMatchesTarget(root, target)) return;
        writeStep(input, view, setter, val);
      }, startMs + 35);
      schedule(() => {
        if (buttonMatchesTarget(root, target)) return;
        blurStep(input, view);
      }, startMs + 70);
    };
    // React 18 batches synchronous focus + input + blur into a single render.
    // Separating focus, input, and blur across macrotasks lets React render
    // isOnFocus=true first, then render the new input state, then commit on blur.
    queueCycle(value, 20);
    if (Number.isInteger(target)) {
      queueCycle(String(target), 130);
    }
    queueCycle(value, 240);
  }
  function prepare(root, target) {
    if (
      !Number.isFinite(target) ||
      target <= 0 ||
      Math.abs(target * 100 - Math.round(target * 100)) > 1e-6
    )
      return false;
    const input = findInput(root);
    if (!input) return false;
    const view = input.ownerDocument.defaultView;
    clearStaged(view);
    const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
    if (!setter || findInput(root) !== input) return false;
    // The client formats a resting field with a currency prefix, but its edit
    // handlers expect a decimal. Focus also initialises controlled-input tracking.
    const value = target.toFixed(2);
    if (!commitValue(input, view, setter, value)) return false;
    if (!buttonMatchesTarget(root, target)) {
      scheduleStagedCommit(root, input, view, setter, target, value);
    }
    return true; // This means "entry attempted", not "the table accepted it".
  }
  globalThis.RiverBetSizing = { findInput, prepare };
})();
