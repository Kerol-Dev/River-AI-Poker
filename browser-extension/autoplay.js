/* User-started, bounded controller. Live activation belongs to the user. */
(() => {
  const keyOf = (s) =>
    globalThis.RiverReader?.decisionKey(s) ||
    JSON.stringify({
      ...s,
      key: undefined,
      automation: undefined,
      timeLeft: undefined,
      actorSeat: undefined,
    });
  const contextOf = (s) =>
    JSON.stringify([
      s.handId,
      s.board,
      s.pot,
      s.call,
      s.heroBet,
      s.seats.map((p) => [p.id, p.stack, p.bet, p.inHand]),
      s.actions,
    ]);
  function create({ read, click, prepare, now = Date.now, changed = () => {} }) {
    let state = { running: false, reason: 'Manual mode', count: 0, spent: 0 },
      limits,
      candidate = null,
      awaiting = null,
      sizing = null,
      identityMissingSince = null;
    const emit = () =>
      changed({ ...state, remaining: candidate ? Math.max(0, candidate.due - now()) : null });
    const stop = (reason) => {
      if (!state.running) return; // Keep the original stop reason until the next explicit start.
      state.running = false;
      state.reason = reason || 'Stopped';
      candidate = null;
      awaiting = null;
      sizing = null;
      emit();
    };
    function start(o) {
      if (
        !Number.isFinite(o.perAction) ||
        o.perAction <= 0 ||
        o.perAction > 1000 ||
        !Number.isFinite(o.budget) ||
        o.budget <= 0 ||
        !Number.isInteger(o.actions) ||
        o.actions < 1 ||
        o.actions > 1000
      )
        throw Error('Use an action cap up to 1,000, a positive spend budget, and 1–1,000 actions.');
      const s = read();
      if (
        !s.handId ||
        !s.currency ||
        s.sittingOut ||
        s.errors.length ||
        !s.seats.some((p) => p.hero && p.stack !== null)
      )
        throw Error('Wait for a readable active table and finish mapping first.');
      limits = {
        ...o,
        delay: Math.max(600, o.delay || 900),
        until: now() + Math.min(120, Math.max(1, o.minutes || 60)) * 60000,
        currency: s.currency,
        seat: s.seats.find((p) => p.hero).id,
      };
      state = { running: true, reason: 'Waiting for your turn', count: 0, spent: 0 };
      identityMissingSince = null;
      candidate = null;
      awaiting = null;
      sizing = null;
      emit();
    }
    function observe(s, decision) {
      if (!state.running) return;
      if (now() >= limits.until)
        return stop('Run duration reached. Restart explicitly when ready.');
      if (!s) return stop('Table reading lost. Check the reader and restart Auto.');
      const hero = s.seats.find((p) => p.hero);
      if ((s.currency && s.currency !== limits.currency) || (hero && hero.id !== limits.seat))
        return stop('Table identity changed');
      // Pot labels and seats can briefly disappear during the deal. Missing
      // identity is not evidence of a different table; no action is allowed here.
      if (!s.currency || !hero || !s.handId) {
        candidate = null;
        identityMissingSince ??= now();
        if (now() - identityMissingSince >= 3500)
          return stop('Table details stayed unreadable. Check the table and restart Auto.');
        state.reason = 'Paused while the table refreshes';
        emit();
        return;
      }
      identityMissingSince = null;
      if (s.sittingOut)
        return stop('Bet365 marked this seat sitting out. Resume at the table, then restart Auto.');
      const urgent =
        limits.timeoutFallback !== false &&
        s.heroTurn &&
        Number.isFinite(s.timeLeft) &&
        s.timeLeft > 0 &&
        s.timeLeft <= 3;
      const fallback =
        urgent && (!decision || decision.key !== keyOf(s) || now() - decision.updatedAt > 1800);
      if (
        s.errors.length &&
        !(fallback && s.errors.every((e) => /card|Confirming the new reading/i.test(e)))
      ) {
        candidate = null;
        state.reason = s.errors[0];
        emit();
        return;
      }
      if (awaiting) {
        if (
          s.handId !== awaiting.hand ||
          !s.heroTurn ||
          JSON.stringify(s.board) !== awaiting.board
        ) {
          awaiting = null;
        } else {
          if (now() - awaiting.at > 12000)
            stop('Click not acknowledged by Bet365. No retry sent; check the table.');
          return;
        }
      }
      if (fallback)
        decision = {
          key: keyOf(s),
          action: s.actions.includes('check') && s.call === 0 ? 'Check' : 'Fold',
          updatedAt: now(),
          intent: 'timeout',
        };
      if (
        !s.heroTurn ||
        !decision ||
        decision.key !== keyOf(s) ||
        now() - decision.updatedAt > 1800
      ) {
        candidate = null;
        state.reason = 'Waiting for your turn and fresh guidance';
        emit();
        return;
      }
      let action = decision.action.toLowerCase();
      if (['bluff', 'semi-bluff'].includes(decision.intent) && !limits.allowBluffs) {
        action = s.call === 0 ? 'check' : 'fold';
      }
      if (!s.actions.includes(action)) return stop('Recommended action is unavailable');
      const aggressive = action === 'raise' || action === 'bet',
        currentAmount = s.actionAmounts?.[action];
      let target = aggressive ? (decision.target ?? currentAmount) : null;
      let cost = action === 'call' ? s.call : action === 'fold' || action === 'check' ? 0 : target;
      if (aggressive) cost = cost != null && s.heroBet != null ? cost - s.heroBet : null;
      if (cost == null || !Number.isFinite(cost) || cost < 0)
        return stop('Action amount cannot be verified');
      const cents = Math.round(cost * 100);
      if (
        cents > Math.round(limits.perAction * 100) ||
        state.spent + cents > Math.round(limits.budget * 100)
      )
        return stop('Spend limit reached. No action placed.');
      if (state.count >= limits.actions) return stop('Action limit reached');
      if (aggressive && target != null && Math.abs((currentAmount ?? -1) - target) > 0.005) {
        const context = contextOf(s);
        if (sizing && sizing.context === context) {
          if (now() - sizing.at > 3000)
            return stop('Table did not confirm the requested bet size. No wager sent.');
          state.reason = 'Waiting for table to confirm the bet size';
          emit();
          return;
        }
        if (!s.sizing?.editable || !prepare)
          return stop('Exact size needs manual entry. No wager sent.');
        sizing = { context, at: now(), target };
        candidate = null;
        if (!prepare(target, s)) return stop('Sizing input unavailable');
        state.reason = `Preparing ${s.currency}${target.toFixed(2)} total`;
        emit();
        return;
      }
      sizing = null;
      const signature = `${keyOf(s)}:${action}:${cents}`;
      if (!candidate || candidate.signature !== signature)
        candidate = {
          signature,
          due: now() + (fallback ? 150 : urgent ? Math.min(350, limits.delay) : limits.delay),
        };
      state.reason = `${fallback ? 'Timeout fallback: ' : ''}${action.toUpperCase()} ${aggressive ? 'to ' + s.currency + target.toFixed(2) : ''} in ${Math.max(0, (candidate.due - now()) / 1000).toFixed(1)}s`;
      emit();
      if (now() < candidate.due) return;
      const current = read();
      if (current.sittingOut || keyOf(current) !== keyOf(s)) {
        candidate = null;
        return;
      }
      if (
        current.errors.length &&
        !(fallback && current.errors.every((e) => /card|Confirming the new reading/i.test(e)))
      ) {
        candidate = null;
        return;
      }
      candidate = null;
      awaiting = { hand: s.handId, board: JSON.stringify(s.board), at: now() };
      try {
        if (!click(action, current)) return stop('Could not uniquely identify the action button');
      } catch {
        return stop('Action could not be confirmed. Check the table.');
      }
      state.count++;
      state.spent += cents;
      state.reason = 'Submitted once; awaiting Bet365 acknowledgement';
      if (state.count >= limits.actions || state.spent >= Math.round(limits.budget * 100))
        stop('Run limit reached');
      else emit();
    }
    return { start, stop, observe, status: () => ({ ...state }) };
  }
  globalThis.RiverAutoplay = { create, keyOf };
})();
