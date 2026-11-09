/* User-started, bounded controller. Live activation belongs to the user. */
(() => {
  const keyOf = (s) =>
    globalThis.RiverReader?.decisionKey(s) ||
    JSON.stringify({
      ...s,
      key: undefined,
      actionAmounts: undefined,
      sizing: s?.sizing
        ? { min: s.sizing.min, max: s.sizing.max, editable: s.sizing.editable }
        : undefined,
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
    let state = {
        running: false,
        reason: 'Manual mode',
        count: 0,
        spent: 0,
        rounds: 0,
        maxRounds: 0,
        roundSpent: 0,
        maxBetPerRound: 0,
        loss: 0,
        maxLoss: 0,
        maxMinutes: 60,
        awaitingConfirm: null,
      },
      limits,
      candidate = null,
      awaiting = null,
      sizing = null,
      identityMissingSince = null,
      roundHandId = '',
      playedHands = new Set(),
      startBalance = null,
      initialStackCents = null,
      stackMoved = false;
    const payload = () => ({
      ...state,
      timeRemaining:
        state.running && limits ? Math.max(0, Math.ceil((limits.until - now()) / 1000)) : 0,
      remaining: candidate ? Math.max(0, candidate.due - now()) : null,
    });
    const emit = () => changed(payload());
    const stop = (reason) => {
      if (!state.running) return; // Keep the original stop reason until the next explicit start.
      state.running = false;
      state.reason = reason || 'Stopped';
      candidate = null;
      awaiting = null;
      sizing = null;
      state.awaitingConfirm = null;
      emit();
    };
    function start(o = {}) {
      const perRound = o.perRound ?? o.maxBetPerRound ?? o.perAction,
        maxLoss = o.maxLoss ?? o.budget,
        maxRounds = o.rounds ?? o.maxRounds ?? o.actions,
        legacyActionCap = o.rounds == null && o.maxRounds == null && Number.isInteger(o.actions),
        minutes = o.minutes ?? 60;
      if (
        !Number.isFinite(perRound) ||
        perRound <= 0 ||
        perRound > 10000 ||
        !Number.isFinite(maxLoss) ||
        maxLoss <= 0 ||
        maxLoss > 100000 ||
        !Number.isInteger(maxRounds) ||
        maxRounds < 1 ||
        maxRounds > 10000 ||
        (o.minutes != null && (!Number.isFinite(o.minutes) || o.minutes < 1 || o.minutes > 180))
      )
        throw Error(
          'Set a positive max bet per round, max total loss, 1–10,000 rounds, and up to 3 hours (180 min).',
        );
      const s = read();
      const hero = s?.seats?.find((p) => p.hero && p.stack !== null);
      if (!s?.handId || !s.currency || s.sittingOut || s.errors.length || !hero)
        throw Error('Wait for a readable active table and finish mapping first.');
      const maxMinutes = Math.min(180, Math.max(1, Math.round(minutes)));
      initialStackCents = Math.round((hero.stack || 0) * 100);
      startBalance = Math.round(((hero.stack || 0) + (s.heroBet || 0)) * 100);
      stackMoved = false;
      roundHandId = s.handId;
      playedHands = new Set();
      limits = {
        ...o,
        perRound,
        maxLoss,
        maxRounds,
        legacyActionCap,
        maxMinutes,
        confirmBets: Boolean(o.confirmBets),
        delay: Math.max(600, o.delay || 900),
        until: now() + maxMinutes * 60000,
        currency: s.currency,
        seat: hero.id,
      };
      state = {
        running: true,
        reason: 'Waiting for your turn',
        count: 0,
        spent: 0,
        rounds: 0,
        maxRounds,
        roundSpent: 0,
        maxBetPerRound: Math.round(perRound * 100),
        loss: 0,
        maxLoss: Math.round(maxLoss * 100),
        maxMinutes,
        awaitingConfirm: null,
      };
      identityMissingSince = null;
      candidate = null;
      awaiting = null;
      sizing = null;
      emit();
    }
    function observe(s, decision) {
      if (!state.running) return;
      if (now() >= limits.until) return stop('Max time reached. Restart explicitly when ready.');
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
      if (s.handId !== roundHandId) {
        roundHandId = s.handId;
        state.roundSpent = 0;
      }
      if (state.awaitingConfirm) {
        if (!s.heroTurn || s.handId !== roundHandId || (decision && decision.key !== keyOf(s))) {
          const { cents } = state.awaitingConfirm;
          state.count++;
          state.spent += cents;
          state.roundSpent += cents;
          playedHands.add(s.handId);
          state.rounds = playedHands.size;
          state.loss = stackMoved
            ? Math.max(0, startBalance - Math.round((hero?.stack || 0) * 100) + cents)
            : state.spent;
          state.awaitingConfirm = null;
          state.reason = 'Wager confirmed';
          emit();
        }
      }
      if (Number.isFinite(hero.stack)) {
        const heroStackCents = Math.round(hero.stack * 100);
        if (heroStackCents !== initialStackCents) stackMoved = true;
        state.loss = stackMoved ? Math.max(0, startBalance - heroStackCents) : state.spent;
      } else {
        state.loss = state.spent;
      }
      const maxRoundCents = Math.round(limits.perRound * 100),
        maxLossCents = Math.round(limits.maxLoss * 100);
      if (!limits.legacyActionCap && state.rounds >= limits.maxRounds && !playedHands.has(s.handId))
        return stop('Max rounds reached. Restart explicitly when ready.');
      if (state.loss >= maxLossCents && !playedHands.has(s.handId) && state.count > 0)
        return stop('Max loss limit reached. Restart explicitly when ready.');
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
      let cents = Math.round(cost * 100);
      if (limits.legacyActionCap && state.count >= limits.maxRounds)
        return stop('Action limit reached');
      if (!limits.legacyActionCap && state.rounds >= limits.maxRounds && !playedHands.has(s.handId))
        return stop('Max rounds reached. Restart explicitly when ready.');
      if (cents > 0 && state.roundSpent + cents > maxRoundCents)
        return stop('Max bet per round reached. No action placed.');
      const nextLoss = stackMoved
        ? Math.max(0, startBalance - Math.round((hero.stack || 0) * 100) + cents)
        : state.spent + cents;
      if (cents > 0 && nextLoss > maxLossCents)
        return stop('Max loss limit reached. No action placed.');
      if (aggressive && target != null && Math.abs((currentAmount ?? -1) - target) > 0.005) {
        const context = contextOf(s);
        const canFallback =
          currentAmount != null && Number.isFinite(currentAmount) && currentAmount > 0;
        const fallbackCost = canFallback
          ? Math.max(
              0,
              currentAmount >= (s.heroBet || 0) ? currentAmount - (s.heroBet || 0) : currentAmount,
            )
          : null;
        const fallbackCents = fallbackCost != null ? Math.round(fallbackCost * 100) : null;
        const fallbackAllowed =
          fallbackCents != null &&
          (fallbackCents === 0 || state.roundSpent + fallbackCents <= maxRoundCents) &&
          (fallbackCents === 0 ||
            (stackMoved
              ? Math.max(0, startBalance - Math.round((hero.stack || 0) * 100) + fallbackCents)
              : state.spent + fallbackCents) <= maxLossCents);

        if (sizing && sizing.context === context && sizing.fellBack) {
          target = currentAmount;
        } else if (sizing && sizing.context === context) {
          const timedOut = now() - sizing.at > 1200;
          const turnUrgent = Number.isFinite(s.timeLeft) && s.timeLeft > 0 && s.timeLeft <= 5;
          if (timedOut || turnUrgent) {
            if (fallbackAllowed) {
              target = currentAmount;
              sizing.fellBack = true;
            } else if (fallbackCents != null && state.roundSpent + fallbackCents > maxRoundCents) {
              return stop('Max bet per round reached. No action placed.');
            } else if (fallbackCents != null) {
              return stop('Max loss limit reached. No action placed.');
            } else {
              return stop('Table did not confirm the requested bet size. No wager sent.');
            }
          } else {
            state.reason = 'Waiting for table to confirm the bet size';
            emit();
            return;
          }
        } else if (!s.sizing?.editable || !prepare) {
          if (fallbackAllowed) {
            target = currentAmount;
            sizing = { context, at: now(), target: currentAmount, fellBack: true };
          } else {
            return stop('Exact size needs manual entry. No wager sent.');
          }
        } else {
          sizing = { context, at: now(), target };
          candidate = null;
          let prepared = false;
          try {
            prepared = prepare(target, s);
          } catch {
            prepared = false;
          }
          if (!prepared) {
            if (fallbackAllowed) {
              target = currentAmount;
              sizing.fellBack = true;
            } else {
              return stop('Sizing input unavailable');
            }
          } else {
            state.reason = `Preparing ${s.currency}${target.toFixed(2)} total`;
            emit();
            return;
          }
        }
      }
      if (sizing && !sizing.fellBack) sizing = null;
      cost = action === 'call' ? s.call : action === 'fold' || action === 'check' ? 0 : target;
      if (aggressive) cost = cost != null && s.heroBet != null ? cost - s.heroBet : null;
      if (cost == null || !Number.isFinite(cost) || cost < 0)
        return stop('Action amount cannot be verified');
      cents = Math.round(cost * 100);
      if (limits.confirmBets && aggressive && !fallback) {
        state.awaitingConfirm = { action, target, cost, cents };
        candidate = null;
        state.reason = `Ready: ${action.toUpperCase()} ${s.currency}${target.toFixed(2)} · Confirm on table or press Enter`;
        emit();
        return;
      }
      const signature = `${keyOf(s)}:${action}:${cents}`;
      if (!candidate || candidate.signature !== signature)
        candidate = {
          signature,
          due:
            now() +
            (fallback
              ? 150
              : urgent
                ? Math.min(350, limits.delay)
                : sizing?.fellBack
                  ? Math.min(300, limits.delay)
                  : limits.delay),
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
      sizing = null;
      awaiting = { hand: s.handId, board: JSON.stringify(s.board), at: now() };
      try {
        if (!click(action, current)) return stop('Could not uniquely identify the action button');
      } catch {
        return stop('Action could not be confirmed. Check the table.');
      }
      state.count++;
      state.spent += cents;
      state.roundSpent += cents;
      playedHands.add(s.handId);
      state.rounds = playedHands.size;
      state.loss = stackMoved
        ? Math.max(0, startBalance - Math.round((hero.stack || 0) * 100) + cents)
        : state.spent;
      state.reason = 'Submitted once; awaiting Bet365 acknowledgement';
      if (limits.legacyActionCap && state.count >= limits.maxRounds) stop('Run limit reached');
      else if (state.loss >= maxLossCents) stop('Max loss limit reached');
      else if (!limits.legacyActionCap && state.rounds >= limits.maxRounds && action === 'fold')
        stop('Max rounds reached');
      else emit();
    }
    function confirm() {
      if (!state.running || !state.awaitingConfirm) return false;
      const { action, cents } = state.awaitingConfirm;
      const current = read();
      state.awaitingConfirm = null;
      candidate = null;
      sizing = null;
      awaiting = { hand: current.handId, board: JSON.stringify(current.board), at: now() };
      try {
        if (!click(action, current)) {
          stop('Could not uniquely identify the action button');
          return false;
        }
      } catch {
        stop('Action could not be confirmed. Check the table.');
        return false;
      }
      state.count++;
      state.spent += cents;
      state.roundSpent += cents;
      playedHands.add(current.handId);
      state.rounds = playedHands.size;
      const hero = current?.seats?.find((p) => p.hero);
      state.loss = stackMoved
        ? Math.max(0, startBalance - Math.round((hero?.stack || 0) * 100) + cents)
        : state.spent;
      state.reason = 'Submitted once; awaiting Bet365 acknowledgement';
      if (limits.legacyActionCap && state.count >= limits.maxRounds) stop('Run limit reached');
      else if (state.loss >= maxLossCents) stop('Max loss limit reached');
      else emit();
      return true;
    }
    return { start, stop, observe, confirm, status: () => payload() };
  }
  globalThis.RiverAutoplay = { create, keyOf };
})();
