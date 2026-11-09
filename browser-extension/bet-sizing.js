/* Edit only the visible amount field. Submission and echo verification belong to autoplay. */
(() => {
  function findInput(root) {
    const inputs = root
      ? [...root.querySelectorAll('input.betting-input')].filter(
          (input) => globalThis.RiverReader.visible(input) && !input.disabled && !input.readOnly,
        )
      : [];
    return inputs.length === 1 && ['text', 'number', 'tel'].includes(inputs[0].type)
      ? inputs[0]
      : null;
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
    const value = target.toFixed(2);
    // The client formats a resting field with a currency prefix, but its edit
    // handlers expect a decimal. Focus also initialises controlled-input tracking.
    input.focus({ preventScroll: true });
    if (findInput(root) !== input || input.ownerDocument.activeElement !== input) return false;
    if (input.type !== 'number') input.select();
    const before = new view.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: value,
    });
    if (!input.dispatchEvent(before)) {
      input.blur();
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) {
      input.blur();
      return false;
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
    // Commit through blur, never Enter: Enter could submit a wager or a form.
    input.blur();
    return true; // This means "entry attempted", not "the table accepted it".
  }
  globalThis.RiverBetSizing = { findInput, prepare };
})();
