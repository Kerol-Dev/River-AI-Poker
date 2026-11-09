/* Presentation only. Poker controls are owned by the verified adapter. */
(() => {
  function copy(decision, s) {
    if (!decision)
      return {
        title: s?.sittingOut
          ? 'You’re sitting out'
          : s?.heroTurn
            ? 'Reading your table'
            : 'Waiting for your turn',
        body: s?.sittingOut
          ? 'Resume at the table when you’re ready.'
          : 'Your next decision appears here when the cards and price are clear.',
      };
    const equity = Math.round(decision.equity * 100),
      needed = Math.round(decision.threshold * 100);
    if (decision.preflop) {
      const spot = decision.preflop.spot,
        a = decision.action;
      return {
        title: /Raise|Bet/.test(a)
          ? {
              unopened: 'Raise first in',
              limped: 'Raise the limpers',
              raised: 'Re-raise for value',
            }[spot] || 'Raise again'
          : a === 'Call'
            ? spot === 'limped'
              ? 'Limp along cheaply'
              : 'Call and see the flop'
            : a === 'Check'
              ? 'Check your option'
              : 'Fold this hand',
        body: decision.explanation,
      };
    }
    if (decision.intent === 'bluff' || decision.intent === 'semi-bluff')
      return {
        title:
          decision.intent === 'semi-bluff'
            ? 'A draw with another way to win'
            : 'An occasional bluff opportunity',
        body: 'This opponent has often folded to bets. This is a mixed strategy suggestion, not a read on their cards.',
      };
    switch (decision.action) {
      case 'Fold':
        return {
          title: 'The price is too high',
          body: `Your estimated share of the pot is ${equity}%. Calling needs about ${needed}%.`,
        };
      case 'Call':
        return {
          title: s?.allInCall
            ? 'Calling uses your remaining stack'
            : 'Call clears the model’s price',
          body: `About ${equity}% action-weighted equity against ${needed}% needed to call after accounting for bet pressure and remaining streets.`,
        };
      case 'Check':
        return {
          title: s?.board?.length === 5 ? 'No need to add chips' : 'Take the free card',
          body: 'There is nothing to call. Checking keeps the pot at its current size.',
        };
      default:
        return {
          title: 'Consider betting for value',
          body: 'Your hand compares well with the assumed ranges. The size shown is a starting point, not a solved strategy.',
        };
    }
  }
  function automation(root, status) {
    if (!status) return;
    const notice = root.querySelector('.auto-notice'),
      footer = root.querySelector('.river-footer');
    if (!notice || !footer) return;
    const stopped = !status.running && status.reason !== 'Manual mode';
    notice.hidden = !stopped;
    notice.textContent = stopped ? 'Auto stopped: ' + status.reason : '';
    footer.querySelector('button').hidden = !status.running;
    footer.querySelector('span').textContent = status.running
      ? 'Automatic run active'
      : stopped
        ? 'Auto stopped · restart in Settings'
        : 'Hold’em · analysis on your computer';
  }
  function mount(root) {
    const bar = root.querySelector('.bar'),
      header = root.querySelector('.header'),
      tools = root.querySelector('.tools'),
      cards = root.querySelector('.reader-cards'),
      stats = root.querySelector('.reader-stats'),
      advice = root.querySelector('.advice'),
      hint = root.querySelector('.hint'),
      analysis = root.querySelector('.reader-analysis'),
      profiles = root.querySelector('.reader-profiles'),
      performance = root.querySelector('.reader-performance'),
      auto = root.querySelector('.auto-panel');
    if (!cards) return { refresh() {} };
    // Styles live in theme.js; the Live switch is already in the header.
    const tabs = document.createElement('nav');
    tabs.className = 'river-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'River views');
    header.after(tabs);
    const panes = {};
    for (const [id, name] of [
      ['table', 'Table'],
      ['players', 'Players'],
      ['session', 'Session'],
      ['settings', 'Settings'],
    ]) {
      const b = document.createElement('button');
      b.textContent = name;
      b.id = 'river-tab-' + id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'river-pane-' + id);
      const pane = document.createElement('section');
      pane.className = 'river-pane';
      pane.id = 'river-pane-' + id;
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', b.id);
      panes[id] = pane;
      bar.append(pane);
      tabs.append(b);
      b.onclick = () => {
        for (const [key, p] of Object.entries(panes)) {
          p.hidden = key !== id;
          const button = tabs.querySelector('#river-tab-' + key);
          button.setAttribute('aria-selected', String(key === id));
          button.tabIndex = key === id ? 0 : -1;
        }
      };
      b.onkeydown = (e) => {
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const buttons = [...tabs.children],
            next = buttons[(buttons.indexOf(b) + (e.key === 'ArrowRight' ? 1 : 3)) % 4];
          next.click();
          next.focus();
        }
      };
    }
    function title(pane, name, description) {
      const h = document.createElement('h3');
      h.className = 'pane-title';
      h.textContent = name;
      const p = document.createElement('p');
      p.className = 'pane-description';
      p.textContent = description;
      pane.append(h, p);
    }
    const surface = document.createElement('div');
    surface.className = 'decision-surface';
    surface.innerHTML =
      '<span class="decision-kicker">Your move</span><div class="decision-subtitle"></div><div class="decision-numbers"><div title="Winning outright, excluding ties"><span>Win outright</span><strong id="read-win">—</strong></div><div title="Sharing the best hand"><span>Tie</span><strong id="read-tie">—</strong></div><div title="Includes your share of split pots"><span>Pot share</span><strong id="read-equity">—</strong></div><div><span>Needed to call</span><strong id="read-threshold">—</strong></div></div>';
    surface.querySelector('.decision-subtitle').before(advice);
    surface.querySelector('.decision-numbers').before(hint);
    panes.table.append(cards, stats, surface, analysis);
    analysis.querySelector('summary').textContent = 'Why this move';
    title(panes.players, 'At your table', 'Patterns from visible play. Hidden cards stay unknown.');
    const section = (pane, text) => {
      const h = document.createElement('h4');
      h.className = 'section-title';
      h.textContent = text;
      pane.append(h);
    };
    profiles.open = true;
    panes.players.append(profiles);
    title(panes.session, 'Your session', 'Results from completed hand checkpoints.');
    panes.session.append(performance);
    section(panes.settings, 'Table map');
    panes.settings.append(tools);
    const mapNote = document.createElement('p');
    mapNote.className = 'settings-note';
    mapNote.textContent = 'River maps the table by itself. Drag a marker to correct it.';
    panes.settings.append(mapNote);
    section(panes.settings, 'Appearance');
    const theme = document.createElement('div');
    theme.className = 'segmented';
    theme.setAttribute('role', 'group');
    theme.setAttribute('aria-label', 'Theme');
    for (const [value, label] of [
      ['system', 'System'],
      ['light', 'Light'],
      ['dark', 'Dark'],
    ]) {
      const b = document.createElement('button');
      b.dataset.theme = value;
      b.textContent = label;
      b.onclick = () => store?.set({ theme: value });
      theme.append(b);
    }
    const showTheme = (mode) =>
      theme
        .querySelectorAll('button')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === mode)));
    const store = globalThis.chrome?.storage?.local;
    (store ? store.get('theme') : Promise.resolve({}))
      .then((v) => showTheme(v.theme || 'system'))
      .catch(() => showTheme('system'));
    globalThis.chrome?.storage?.onChanged?.addListener((c, area) => {
      if (area === 'local' && c.theme) showTheme(c.theme.newValue || 'system');
    });
    panes.settings.append(theme);
    if (auto) {
      section(panes.settings, 'Automatic play');
      panes.settings.append(auto);
    }
    const screen = document.createElement('p');
    screen.className = 'settings-note';
    screen.textContent =
      'Table drawn as one image or in another app? Use Screen reader in the River app.';
    panes.settings.append(screen);
    const error = document.createElement('p');
    error.className = 'reader-error';
    panes.settings.append(error);
    const footer = document.createElement('footer');
    footer.className = 'river-footer';
    footer.innerHTML =
      '<span>Hold’em · analysis on your computer</span><button hidden>Stop auto</button>';
    footer.querySelector('button').onclick = () => root.querySelector('#auto-stop').click();
    bar.append(footer);
    const notice = document.createElement('p');
    notice.className = 'auto-notice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    tabs.after(notice);
    tabs.children[0].click();
    return {
      refresh(panel, s, decision) {
        const fresh =
          panel &&
          s &&
          panel.key === s.key &&
          Date.now() - panel.at >= 0 &&
          Date.now() - panel.at < 3500 &&
          !s.errors?.length;
        const current = fresh ? panel : null;
        automation(root, s?.automation);
        const c = copy(decision, s);
        surface.querySelector('.decision-subtitle').textContent = decision ? c.title : '';
        if (decision) hint.textContent = c.body;
        for (const metric of ['win', 'tie'])
          surface.querySelector('#read-' + metric).textContent =
            current?.[metric] != null ? (current[metric] * 100).toFixed(1) + '%' : '—';
        surface.querySelector('#read-equity').textContent = decision
          ? Math.round(decision.equity * 100) + '%'
          : current?.equity != null
            ? Math.round(current.equity * 100) + '%'
            : '—';
        surface.querySelector('.decision-kicker').textContent = decision
          ? 'Your move'
          : current?.win != null
            ? 'Win chance'
            : 'Your move';
        if (!decision && current?.win != null) {
          advice.querySelector('.action').textContent = Math.round(current.win * 100) + '%';
          hint.textContent = 'Your hand is being evaluated while the other players act.';
          surface.querySelector('.decision-subtitle').textContent =
            current.tie > 0
              ? Math.round(current.tie * 100) + '% chance of a tie'
              : 'Against the players still in this hand';
        }
        if (!decision && current?.win == null) {
          advice.querySelector('.action').textContent = 'Waiting';
          surface.querySelector('.decision-subtitle').textContent = '';
        }
        surface.querySelector('#read-threshold').textContent = decision
          ? Math.round(decision.threshold * 100) + '%'
          : '—';
        error.textContent = panel?.storageError || '';
      },
    };
  }
  globalThis.RiverInterface = { mount, copy, automation };
})();
