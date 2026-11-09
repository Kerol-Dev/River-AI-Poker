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
  function findPresetButton(root, target, s) {
    const scope = actionScope(root);
    if (!scope) return null;
    const candidates = [
      ...scope.querySelectorAll(
        '.preset-size, .betclic-native-button, button, [role="button"], .base-button',
      ),
    ].filter((b) => {
      if (!globalThis.RiverReader?.visible?.(b)) return false;
      if (b.classList.contains('disabled') || b.hasAttribute('disabled')) return false;
      if (b.classList.contains('action-button') || b.closest('.actions-area')) return false;
      return true;
    });
    if (!candidates.length) return null;

    let bb = null;
    if (s?.sizing?.min != null && s.sizing.min > 0) {
      bb = s.sizing.min / 2;
    } else if (s?.call != null && s.call > 0) {
      bb = s.call;
    }

    let pot50 = null,
      pot100 = null;
    if (s?.pot != null && s.pot > 0) {
      const match = (s.heroBet || 0) + (s.call || 0);
      const totalPot = s.pot + (s.call || 0);
      pot50 = match + 0.5 * totalPot;
      pot100 = match + 1.0 * totalPot;
    }

    for (const b of candidates) {
      const txt = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (/^2\.5\s*bb$/i.test(txt) && bb != null && Math.abs(target - 2.5 * bb) <= 0.15) {
        return b;
      }
      if (/^3\s*bb$/i.test(txt) && bb != null && Math.abs(target - 3.0 * bb) <= 0.15) {
        return b;
      }
      if (
        /^50%\s*(?:of\s*pot|pot)?$/i.test(txt) &&
        pot50 != null &&
        Math.abs(target - pot50) <= 0.25
      ) {
        return b;
      }
      if (
        /^(?:100%|pot)\s*(?:of\s*pot)?$/i.test(txt) &&
        pot100 != null &&
        Math.abs(target - pot100) <= 0.25
      ) {
        return b;
      }
      if (
        /^all[\s-]*in$/i.test(txt) &&
        s?.sizing?.max != null &&
        Math.abs(target - s.sizing.max) <= 0.1
      ) {
        return b;
      }
    }

    // Proximity matching: never let custom solver targets fall through to a tiny min-bet.
    // Snap to the closest confirmed preset button.
    if (pot50 != null || pot100 != null) {
      const b50 = candidates.find((b) =>
        /^50%\s*(?:of\s*pot|pot)?$/i.test((b.textContent || '').replace(/\s+/g, ' ').trim()),
      );
      const b100 = candidates.find((b) =>
        /^(?:100%|pot)\s*(?:of\s*pot)?$/i.test((b.textContent || '').replace(/\s+/g, ' ').trim()),
      );
      if (b50 && b100) {
        const diff50 = pot50 != null ? Math.abs(target - pot50) : Infinity;
        const diff100 = pot100 != null ? Math.abs(target - pot100) : Infinity;
        return diff50 <= diff100 ? b50 : b100;
      }
      if (b50 && pot50 != null && target <= pot50 * 1.4) return b50;
      if (b100 && pot100 != null) return b100;
      if (b50) return b50;
    }

    if (bb != null) {
      const b25 = candidates.find((b) =>
        /^2\.5\s*bb$/i.test((b.textContent || '').replace(/\s+/g, ' ').trim()),
      );
      const b30 = candidates.find((b) =>
        /^3\s*bb$/i.test((b.textContent || '').replace(/\s+/g, ' ').trim()),
      );
      if (b25 && b30) {
        return Math.abs(target - 2.5 * bb) <= Math.abs(target - 3.0 * bb) ? b25 : b30;
      }
      if (b25) return b25;
      if (b30) return b30;
    }

    return null;
  }
  function clickPreset(button) {
    const view = button.ownerDocument?.defaultView || globalThis;
    const rect = button.getBoundingClientRect
      ? button.getBoundingClientRect()
      : { x: 0, y: 0, width: 0, height: 0 };
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: (rect.x || 0) + (rect.width || 0) / 2,
      clientY: (rect.y || 0) + (rect.height || 0) / 2,
      button: 0,
    };
    try {
      if (typeof view.PointerEvent === 'function') {
        button.dispatchEvent(
          new view.PointerEvent('pointerdown', { ...opts, pointerType: 'mouse', buttons: 1 }),
        );
      }
      button.dispatchEvent(new view.MouseEvent('mousedown', { ...opts, buttons: 1 }));
      if (typeof view.PointerEvent === 'function') {
        button.dispatchEvent(
          new view.PointerEvent('pointerup', { ...opts, pointerType: 'mouse', buttons: 0 }),
        );
      }
      button.dispatchEvent(new view.MouseEvent('mouseup', { ...opts, buttons: 0 }));
    } catch {}
    button.click();
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
  function prepare(root, target, s) {
    if (
      !Number.isFinite(target) ||
      target <= 0 ||
      Math.abs(target * 100 - Math.round(target * 100)) > 1e-6
    )
      return false;
    const preset = findPresetButton(root, target, s);
    if (preset) {
      clickPreset(preset);
      return true;
    }
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
  globalThis.RiverBetSizing = { findInput, findPresetButton, prepare };
})();
