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
            : 'You have the equity to continue',
          body: `About ${equity}% estimated equity against ${needed}% needed to call. Future betting and rake can change the result.`,
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
    const style = document.createElement('style');
    style.textContent = `
  .bar{width:336px!important;padding:16px!important;background:#1c1b1a!important;border:1px solid #45413c!important;border-radius:17px!important;box-shadow:0 14px 45px #0007!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif!important;color:#f4ede0!important;max-height:calc(100vh - 24px)}
  .bar .header{height:23px;gap:8px}.brand{font-size:13px!important;letter-spacing:2.5px!important}.mode{display:none}.header #live{margin-left:auto;border:1px solid #56504a;border-radius:20px;padding:4px 9px;color:#bcb4a9;background:#272522;font-size:9px;font-weight:750;cursor:pointer}.header #live.active{background:#ff6b5b18;border-color:#ff6b5b55;color:#ff9b8d}.header #minimize{font-size:18px;color:#a49b90}
  .river-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;background:#141312;padding:4px;border:1px solid #36322e;border-radius:9px;margin:14px 0}.river-tabs button{border:0;border-radius:6px;padding:8px 3px;color:#a9a197;background:none;font-size:10px;font-weight:700;cursor:pointer}.river-tabs button[aria-selected=true]{background:#39332d;color:#fff4e5;box-shadow:0 1px 4px #0003}.river-pane{max-height:calc(100vh - 160px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#65574c transparent}.river-pane[hidden]{display:none!important}
  .reader-cards{margin:0 0 12px;grid-template-columns:92px minmax(0,1fr);gap:12px}.reader-label{color:#b2a89b;font-size:8px;letter-spacing:1.3px}.reader-card{color:#1c1b1a;border-color:#fff9ed}.reader-card.empty{background:#ffffff03;border-color:#71625344;color:#867565}.reader-street{color:#9d8b79}.reader-stats{padding:10px 0 12px;border-color:#403930}.reader-stats span{color:#a99e90;font-size:9px}.reader-stats b{font-size:16px;margin-top:4px;color:#f4ede0}
  .decision-surface{margin-top:12px;padding:14px;border:1px solid #ff6b5b30;background:linear-gradient(135deg,#342a24,#27231f);border-radius:11px}.decision-kicker{font-size:8px;letter-spacing:1.6px;color:#c5a58b;font-weight:700}.bar .advice{margin:6px 0 9px;padding:0;border:0;min-height:0;display:block}.bar .action{font-size:30px;line-height:1.15;letter-spacing:-.9px;font-weight:850;display:block;color:#f4ede0}.bar .equity{display:none}.bar .hint{margin:0;color:#c4b7a7;font-size:11px;line-height:1.55;min-height:0}.decision-subtitle{font-size:12px;font-weight:650;margin:0 0 5px;color:#f4ede0}.decision-numbers{display:flex;gap:24px;margin-top:12px;padding-top:10px;border-top:1px solid #75604e44}.decision-numbers span{font-size:8px;color:#af9f8d;display:block}.decision-numbers strong{font-size:17px;display:block;margin-top:4px}.reader-intent{display:none}.reader-analysis{margin-top:12px;border:0;padding:0}.reader-analysis summary{font-size:10px;color:#bfb1a0}.reader-analysis p{font-size:11px;color:#c3b6a6;line-height:1.6}.reader-profiles{margin:0;border:0;padding:0}.reader-profiles>summary{display:none}.reader-profile{border-color:#3d352e;padding:12px 0}.reader-profile strong{font-size:12px}.reader-profile span{color:#b6a794;font-size:10px}.reader-profile p{color:#ad9e8c;font-size:10px;line-height:1.5}.reader-event{color:#cbbba8;padding:9px 0;border-bottom:1px solid #39312a;font-size:10px}.reader-event-list{margin-top:6px}.pane-title{font-size:17px;letter-spacing:-.4px;margin:0 0 7px;font-weight:750}.pane-description{color:#ad9e8c;font-size:10px;line-height:1.6;margin:0 0 9px}.reader-performance{border:0;padding:0;margin:12px 0 0}.reader-net{font-size:29px}.reader-perf-controls{max-width:160px}.reader-perf-controls button,.reader-perf-controls select{background:#2b2621;border-color:#574a3e;color:#eadbca;font-size:9px}.reader-graph{height:100px;margin-top:12px}.reader-tooltip{background:#302820;color:#e8d6c0;font-size:10px;min-height:28px}.reader-note{color:#a59380;font-size:9px;margin:10px 0 0}.tools{margin:12px 0;gap:6px}.tools button{background:#322b24!important;border-color:#58483a!important;color:#eddfcd!important;font-size:10px!important;padding:9px!important;flex:1}.auto-panel{border-color:#45382c;margin-top:15px;padding-top:13px}.auto-panel summary{font-size:11px}.auto-fields label{color:#bba68e;font-size:9px}.auto-fields input{background:#171412;border-color:#554334;color:#f4ede0;font-size:11px}.auto-options{color:#c5b199}.auto-options select{background:#30261e;border-color:#604b38;color:#f4ede0}.auto-status{position:static;background:none!important;font-size:10px;color:#cbb291}.auto-buttons button{font-size:11px}.tiny{display:none}.auto-panel .tiny{display:block;font-size:9px;color:#ac937b}
  .river-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:12px;margin-top:12px;border-top:1px solid #3d3329;font-size:8px;color:#988675}.river-footer button{border:0;border-radius:5px;font-size:9px;font-weight:800;padding:5px 9px;color:#221a14;background:#ff6b5b;cursor:pointer}.reader-error{font-size:10px;color:#ffb3a4;line-height:1.5;margin:10px 0}.minimized{width:auto!important}.minimized .river-tabs,.minimized .river-pane,.minimized .river-footer{display:none!important}.bar button:focus-visible,.bar select:focus-visible{outline:2px solid #ff9f89;outline-offset:2px}
  `;
    root.append(style);
    const live = tools.querySelector('#live');
    header.insertBefore(live, header.querySelector('#minimize'));
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
      '<span class="decision-kicker">YOUR NEXT MOVE</span><div class="decision-subtitle"></div><div class="decision-numbers"><div><span>Estimated equity</span><strong id="read-equity">—</strong></div><div><span>Needed to call</span><strong id="read-threshold">—</strong></div></div>';
    surface.querySelector('.decision-subtitle').before(advice);
    surface.querySelector('.decision-numbers').before(hint);
    panes.table.append(cards, stats, surface, analysis);
    analysis.querySelector('summary').textContent = 'Why this move';
    title(panes.players, 'At your table', 'Patterns from visible play. Hidden cards stay unknown.');
    profiles.open = true;
    panes.players.append(profiles);
    title(panes.session, 'Your session', 'Results from completed hand checkpoints.');
    panes.session.append(performance);
    title(panes.settings, 'Make River yours', 'Map the table or set up a bounded automatic run.');
    panes.settings.append(tools, auto);
    const screen = document.createElement('p');
    screen.className = 'pane-description';
    screen.textContent =
      'Another app or poker room? Open Screen reader in the River app to map a window with OCR.';
    panes.settings.append(screen);
    const error = document.createElement('p');
    error.className = 'reader-error';
    panes.settings.append(error);
    const footer = document.createElement('footer');
    footer.className = 'river-footer';
    footer.innerHTML = '<span>HOLD’EM · ON YOUR MAC</span><button hidden>STOP AUTO</button>';
    footer.querySelector('button').onclick = () => root.querySelector('#auto-stop').click();
    bar.append(footer);
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
        const active = s?.automation?.running;
        footer.querySelector('button').hidden = !active;
        footer.querySelector('span').textContent = active
          ? 'AUTOMATIC RUN ACTIVE'
          : 'HOLD’EM · ON YOUR MAC';
        const c = copy(decision, s);
        surface.querySelector('.decision-subtitle').textContent = decision ? c.title : '';
        if (decision) hint.textContent = c.body;
        surface.querySelector('#read-equity').textContent = decision
          ? Math.round(decision.equity * 100) + '%'
          : current?.equity != null
            ? Math.round(current.equity * 100) + '%'
            : '—';
        surface.querySelector('.decision-kicker').textContent = decision
          ? 'YOUR NEXT MOVE'
          : current?.win != null
            ? 'WIN CHANCE'
            : 'YOUR NEXT MOVE';
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
  globalThis.RiverInterface = { mount, copy };
})();
