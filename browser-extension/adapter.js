/* Visible DOM only. No page runtime, network interception, storage, or betting actions. */
(() => {
  const suits = { '♣': 'c', '♦': 'd', '♥': 'h', '♠': 's' };
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const s = node.ownerDocument.defaultView.getComputedStyle(node);
      if (
        s.display === 'none' ||
        s.visibility === 'hidden' ||
        s.visibility === 'collapse' ||
        s.opacity === '0' ||
        node.classList.contains('pt-visibility-hidden') ||
        node.getAttribute('aria-hidden') === 'true'
      )
        return false;
    }
    return true;
  }
  function text(el) {
    if (!visible(el)) return '';
    const walk = el.ownerDocument.createTreeWalker(el, 4);
    let n,
      output = [];
    while ((n = walk.nextNode()))
      if (n.textContent.trim() && visible(n.parentElement)) output.push(n.textContent.trim());
    return output.join(' ').replace(/\s+/g, ' ').trim();
  }
  function money(value) {
    const matches = [
      ...value.matchAll(/([€£$])\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d.,])/g),
    ];
    if (!matches.length) return null;
    const unique = [...new Set(matches.map((m) => `${m[1]}:${m[2].replaceAll(',', '')}`))];
    if (unique.length !== 1) return null;
    const [currency, number] = unique[0].split(':');
    return { currency, value: Number(number) };
  }
  function actionKind(label) {
    if (/^(?:fold\s*){1,2}$/i.test(label)) return 'fold';
    if (/^(?:check\s*){1,2}$/i.test(label)) return 'check';
    return /^(call|bet|raise)\b/i.exec(label)?.[1].toLowerCase() || null;
  }
  const isAllIn = (label) => /^all[\s-]*in\b/i.test(label);
  function actionForButton(button, snapshot) {
    const label = text(button),
      kind = actionKind(label);
    if (kind) return kind;
    const amount = money(label);
    return isAllIn(label) &&
      snapshot?.allInCall &&
      amount?.currency === snapshot.currency &&
      Math.round(amount.value * 100) === Math.round(snapshot.call * 100)
      ? 'call'
      : null;
  }
  function cards(container) {
    if (!container) throw new Error('A required card region is not mapped.');
    const result = [];
    for (const card of container.querySelectorAll('.card-wrapper')) {
      if (!visible(card) || card.closest('.folded,.cardset-folded-cards-hero')) continue;
      const image = card.querySelector('img.card-image');
      if (
        image &&
        /(?:^|\/)card-back_[^/]+\.svg(?:[?#].*)?$/.test(image.getAttribute('src') || '')
      ) {
        if (container.matches('.community-cards'))
          throw new Error('A community card is being revealed. Advice paused.');
        continue;
      }
      const r = text(card.querySelector('.card-rank')).toUpperCase();
      const s = text(card.querySelector('.card-suit'));
      if (!/^(?:[2-9TJQKA]|10)$/.test(r) || !suits[s])
        throw new Error('A visible card is unreadable. Waiting for the deal to finish.');
      result.push((r === '10' ? 'T' : r) + suits[s]);
    }
    return result;
  }
  function table(doc) {
    const roots = [...doc.querySelectorAll('.table-area')].filter(visible);
    return roots.length === 1 ? roots[0] : null;
  }
  function defaults(root) {
    const list = [
      {
        id: 'hero',
        kind: 'hero',
        label: 'My hand',
        selector: '.player-area.my-player .cards-holder-hero',
      },
      { id: 'board', kind: 'board', label: 'Flop · turn · river', selector: '.community-cards' },
      { id: 'pot', kind: 'pot', label: 'Total pot', selector: '.total-pot' },
      {
        id: 'actions',
        kind: 'actions',
        label: 'My action buttons',
        selector: '.table-actions-wrapper',
      },
      { id: 'dealer', kind: 'dealer', label: 'Dealer button', selector: '.dealer' },
    ];
    for (const seat of root.querySelectorAll('.player-area')) {
      const cls = [...seat.classList].find((v) => /^player-seat-\d+$/.test(v));
      if (cls)
        list.push({
          id: cls,
          kind: 'player',
          label: seat.classList.contains('my-player')
            ? 'My seat'
            : `Player ${cls.split('-').at(-1)}`,
          selector: `.${cls}`,
        });
    }
    return list;
  }
  function resolve(doc, selector) {
    if (typeof selector !== 'string' || selector.length > 180) return null;
    try {
      const nodes = [...doc.querySelectorAll(selector)];
      return nodes.find(visible) || (nodes.length === 1 ? nodes[0] : null);
    } catch {
      return null;
    }
  }
  function rootFor(doc, mapping, id) {
    return resolve(doc, mapping.find((m) => m.id === id)?.selector);
  }
  let sizeContext = '',
    sizeMinimum = null;
  function decisionKey(s) {
    return JSON.stringify({
      handId: s.handId,
      hole: s.hole,
      board: s.board,
      pot: s.pot,
      call: s.call,
      callPot: s.callPot,
      allInCall: s.allInCall,
      currency: s.currency,
      heroBet: s.heroBet,
      opponents: s.opponents,
      heroTurn: s.heroTurn,
      actions: s.actions,
      seats: s.seats.map((p) => ({
        id: p.id,
        hero: p.hero,
        username: p.username,
        stack: p.stack,
        bet: p.bet,
        inHand: p.inHand,
      })),
      sizing: s.sizing
        ? { min: s.sizing.min, max: s.sizing.max, editable: s.sizing.editable }
        : null,
      sittingOut: s.sittingOut,
      errors: s.errors,
      mapping: s.mapping,
    });
  }
  function read(doc, mapping) {
    const snapshot = {
      version: 1,
      source: 'update-com.p365play.com',
      handId: '',
      hole: [],
      board: [],
      pot: null,
      call: null,
      currency: '',
      heroBet: null,
      actionAmounts: {},
      actorSeat: null,
      timeLeft: null,
      sittingOut: false,
      sizing: { min: null, max: null, editable: false },
      opponents: 0,
      heroTurn: false,
      actions: [],
      seats: [],
      dealer: null,
      errors: [],
      mapping: { mapped: 0, total: mapping.length },
    };
    const root = table(doc);
    if (!root) snapshot.errors.push('Open one visible poker table to connect the reader.');
    const fullTable = root?.closest('.table') || doc;
    for (const marker of mapping) if (resolve(doc, marker.selector)) snapshot.mapping.mapped++;
    if (root) {
      for (const id of ['hero', 'board', 'pot', 'actions'])
        if (!rootFor(doc, mapping, id))
          snapshot.errors.push(`Map the ${id === 'hero' ? 'My hand' : id} region first.`);
      const handLabels = [...fullTable.querySelectorAll('.hand-id')].filter(visible);
      const pageHandLabels = handLabels.length
        ? handLabels
        : [...doc.querySelectorAll('.hand-id')].filter(visible);
      snapshot.handId =
        pageHandLabels.length === 1 ? text(pageHandLabels[0]).replace(/[^\d]/g, '') : '';
      try {
        snapshot.hole = cards(rootFor(doc, mapping, 'hero'));
        snapshot.board = cards(rootFor(doc, mapping, 'board'));
      } catch (e) {
        snapshot.errors.push(e.message);
      }
      const pot = money(text(rootFor(doc, mapping, 'pot')));
      if (pot) {
        snapshot.pot = pot.value;
        snapshot.currency = pot.currency;
      }
      const actionsRoot = rootFor(doc, mapping, 'actions');
      const buttons = actionsRoot
        ? [
            ...actionsRoot.querySelectorAll(
              '.actions-area:not(.pre-actions) .base-button.action-button',
            ),
          ].filter(
            (b) =>
              visible(b) &&
              !b.classList.contains('disabled') &&
              b.getAttribute('aria-disabled') !== 'true' &&
              !b.hasAttribute('disabled'),
          )
        : [];
      for (const button of buttons) {
        const label = text(button);
        if (/^(?:fold\s*){1,2}$/i.test(label)) snapshot.actions.push('fold');
        else if (/^(?:check\s*){1,2}$/i.test(label)) {
          snapshot.actions.push('check');
          snapshot.call = 0;
        } else if (/^call\b/i.test(label)) {
          snapshot.actions.push('call');
          const m = money(label);
          if (m && m.currency === snapshot.currency) snapshot.call = m.value;
        } else if (/^raise\b/i.test(label)) snapshot.actions.push('raise');
        else if (/^bet\b/i.test(label)) snapshot.actions.push('bet');
      }
      for (const button of buttons) {
        const label = text(button),
          amount = money(label),
          kind = /^call\b/i.test(label)
            ? 'call'
            : /^raise\b/i.test(label)
              ? 'raise'
              : /^bet\b/i.test(label)
                ? 'bet'
                : null;
        if (kind && amount && amount.currency === snapshot.currency)
          snapshot.actionAmounts[kind] = amount.value;
      }
      const heroSeat = root.querySelector('.player-area.my-player');
      const heroSeatClass =
        heroSeat && [...heroSeat.classList].find((c) => /^player-seat-\d+$/.test(c));
      const betNode = heroSeatClass
        ? root.querySelector('.player-bet-' + heroSeatClass.split('-').at(-1))
        : null;
      if (betNode) {
        const value = text(betNode);
        snapshot.heroBet = value ? (money(value)?.value ?? null) : 0;
      }
      snapshot.actions = [...new Set(snapshot.actions)];
      snapshot.heroTurn =
        snapshot.actions.includes('fold') &&
        snapshot.actions.some((a) => a === 'check' || a === 'call');
      for (const seatEl of root.querySelectorAll('.player-area')) {
        const id = [...seatEl.classList].find((c) => /^player-seat-\d+$/.test(c));
        if (!id || !visible(seatEl.querySelector('.player-nameplate'))) continue;
        const anchor = mapping.find((m) => m.id === id);
        if (!anchor || resolve(doc, anchor.selector) !== seatEl)
          snapshot.errors.push(
            `Map Player ${id.split('-').at(-1)} so active seats can be confirmed.`,
          );
        const hero = seatEl.classList.contains('my-player');
        const label = text(seatEl.querySelector('.nickname'));
        const chipNode = seatEl.querySelector('.player-nameplate .amount');
        const chipName = visible(chipNode) ? /^chips-(.+)"-"\d+$/.exec(chipNode.id)?.[1] : null;
        const username =
          chipName || (label && !/^(Time:|Sit out|Sitting out|Empty)/i.test(label) ? label : null);
        const lastAction = actionKind(text(seatEl.querySelector('.player-action .action-text')));
        const inHand =
          lastAction !== 'fold' &&
          [...seatEl.querySelectorAll('.card-wrapper')].filter(
            (c) => visible(c) && !c.closest('.folded,.cardset-folded-cards-hero'),
          ).length >= 2;
        const betElement = root.querySelector('.player-bet-' + id.split('-').at(-1));
        const betText = text(betElement),
          bet = !betElement ? null : betText ? (money(betText)?.value ?? null) : 0;
        const timer = text(seatEl.querySelector('.countdown-text'));
        if (/^\d{1,3}$/.test(timer)) {
          snapshot.actorSeat = id;
          if (hero) snapshot.timeLeft = Number(timer);
        }
        let shown = [];
        if (!hero)
          try {
            shown = cards(seatEl);
          } catch {}
        snapshot.seats.push({
          id,
          label: hero ? 'You' : username || `Player ${id.split('-').at(-1)}`,
          username,
          hero,
          inHand,
          bet,
          lastAction,
          shown: shown.length === 2 ? shown : [],
          stack: money(text(chipNode || seatEl.querySelector('.player-nameplate')))?.value ?? null,
        });
      }
      const hero = snapshot.seats.find((p) => p.hero);
      // The primary All In button can be a stack-limited call, not a raise.
      // Require matching visible chips and a covering wager. Never alias a preset.
      const allInButtons = buttons.filter((b) => isAllIn(text(b)));
      if (allInButtons.length) {
        const amount = allInButtons.length === 1 ? money(text(allInButtons[0])) : null;
        const opponents = snapshot.seats.filter((p) => !p.hero && p.inHand);
        const facing = Math.max(0, ...opponents.map((p) => p.bet ?? 0)) - (snapshot.heroBet ?? 0);
        const proven =
          amount &&
          amount.currency === snapshot.currency &&
          hero?.stack > 0 &&
          snapshot.heroBet != null &&
          Math.round(amount.value * 100) === Math.round(hero.stack * 100) &&
          Math.round(facing * 100) >= Math.round(hero.stack * 100) &&
          snapshot.actions.length === 1 &&
          snapshot.actions[0] === 'fold';
        if (proven) {
          snapshot.allInCall = true;
          snapshot.call = amount.value;
          snapshot.actionAmounts.call = amount.value;
          snapshot.actions.push('call');
          snapshot.heroTurn = true;
          if (opponents.length !== 1 || opponents[0].bet == null)
            snapshot.errors.push(
              'All-in call detected. Multiway side-pot eligibility needs manual review.',
            );
          else {
            const excess = Math.max(0, opponents[0].bet - snapshot.heroBet - amount.value);
            snapshot.callPot =
              snapshot.pot == null ? null : Math.round((snapshot.pot - excess) * 100) / 100;
            if (snapshot.callPot == null || snapshot.callPot < amount.value)
              snapshot.errors.push(
                'All-in call detected, but the eligible pot cannot be verified.',
              );
          }
        } else if (!snapshot.heroTurn)
          snapshot.errors.push(
            'All-in button detected. Waiting for matching stack and wager amounts.',
          );
      }
      const context = JSON.stringify([
        snapshot.handId,
        snapshot.board,
        snapshot.call,
        snapshot.seats.filter((p) => !p.hero).map((p) => p.bet),
      ]);
      if (context !== sizeContext) {
        sizeContext = context;
        sizeMinimum = null;
      }
      if (snapshot.heroBet == null && snapshot.heroTurn) {
        const oppBets = snapshot.seats
          .filter((p) => !p.hero && p.inHand && p.bet != null)
          .map((p) => p.bet);
        if (
          (snapshot.actions.includes('bet') && snapshot.call === 0) ||
          (!snapshot.allInCall &&
            snapshot.call != null &&
            snapshot.call > 0 &&
            oppBets.length > 0 &&
            Math.round(Math.max(...oppBets) * 100) === Math.round(snapshot.call * 100))
        )
          snapshot.heroBet = 0;
      }
      const controlsRoot = actionsRoot?.closest('.table-actions-wrapper') || actionsRoot;
      const amount = snapshot.actionAmounts.raise ?? snapshot.actionAmounts.bet;
      const thumb = controlsRoot?.querySelector('.betting-slider-thumb');
      if (amount != null) {
        if (visible(thumb) && Math.abs(parseFloat(thumb.style.left || '0')) < 0.5)
          sizeMinimum = amount;
        else if (!visible(thumb) && sizeMinimum == null) sizeMinimum = amount;
        else if (sizeMinimum != null && amount < sizeMinimum) sizeMinimum = amount;
      }
      snapshot.sizing = {
        min: sizeMinimum,
        max:
          hero?.stack != null && snapshot.heroBet != null
            ? Math.round((hero.stack + snapshot.heroBet) * 100) / 100
            : null,
        editable: visible(controlsRoot?.querySelector('input.betting-input')),
      };
      snapshot.sittingOut =
        /^Sit(?:ting)? out$/i.test(text(heroSeat?.querySelector('.nickname'))) ||
        [...doc.querySelectorAll('.base-button')].some((b) => /^Deal Me In$/i.test(text(b)));
      snapshot.opponents = snapshot.seats.filter((s) => !s.hero && s.inHand).length;
      const dealer = rootFor(doc, mapping, 'dealer');
      if (visible(dealer)) {
        const parent = dealer.closest('.game-position');
        snapshot.dealer = parent
          ? [...parent.classList]
              .find((c) => /^game-position-\d+$/.test(c))
              ?.replace('game-position', 'player-seat') || null
          : null;
      }
      if (snapshot.hole.length > 2 || snapshot.board.length > 5) {
        snapshot.errors.push('Overlapping or duplicate card regions. Re-map the table.');
        snapshot.hole = [];
        snapshot.board = [];
      }
    }
    snapshot.errors = [...new Set(snapshot.errors)].slice(0, 12);
    snapshot.key = decisionKey(snapshot);
    return snapshot;
  }
  globalThis.RiverReader = {
    decisionKey,
    visible,
    text,
    money,
    actionKind,
    actionForButton,
    cards,
    table,
    defaults,
    resolve,
    read,
  };
})();
