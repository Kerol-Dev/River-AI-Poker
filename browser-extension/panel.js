(() => {
  function create(shadow, { reset }) {
    const style = document.createElement('style');
    style.textContent = `.bar{width:340px!important;max-height:calc(100vh - 24px);overflow-y:auto;scrollbar-width:thin}.minimized{width:auto!important}.minimized .reader-intent,.minimized .reader-cards,.minimized .reader-stats,.minimized .reader-analysis,.minimized .reader-performance,.minimized .reader-profiles{display:none}.reader-cards{display:grid;grid-template-columns:92px minmax(0,1fr);gap:16px;margin-top:18px;margin-bottom:3px;align-items:start}.reader-cards>div{min-width:0}.reader-label{font-size:8px;font-weight:750;color:#b9afa5;letter-spacing:1px;display:block;margin-bottom:9px}.reader-card-row{display:flex;gap:4px;align-items:center;min-height:64px}.reader-card{position:relative;flex:0 0 34px;width:34px;height:50px;background:linear-gradient(155deg,#fffaf0,#f4ede0);color:#1c1b1a;border:1px solid #fff9ed;border-radius:6px;box-shadow:0 2px 3px #0002;overflow:hidden}.reader-card.red{color:#cf4b42}.reader-card-rank{position:absolute;top:5px;left:5px;font:800 15px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;letter-spacing:-.7px}.reader-card-suit{position:absolute;right:5px;bottom:6px;width:20px;height:20px;fill:currentColor}.reader-card.hero-card{flex-basis:44px;width:44px;height:64px;border-radius:7px}.hero-card .reader-card-rank{font-size:20px;top:6px;left:6px}.hero-card .reader-card-suit{width:26px;height:26px;right:6px;bottom:7px}.reader-card.empty{background:#ffffff03;border:1px solid #9b8e8026;box-shadow:none;color:#847668}.reader-card.empty:after{content:'';position:absolute;left:50%;top:50%;width:8px;height:1px;background:currentColor;transform:translate(-50%,-50%);opacity:.45}.reader-board-label{display:flex;align-items:center;justify-content:space-between;gap:4px}.reader-street{font-size:8px;font-weight:500;letter-spacing:0;color:#9b8d7f}.reader-stats{display:flex;justify-content:space-between;font-size:10px;padding:12px 0;border-bottom:1px solid #534f4a}.reader-stats b{display:block;font-size:15px;margin-top:5px}.reader-stats span{color:#b9b0a6}.reader-analysis,.reader-profiles{border-top:1px solid #56514c;margin-top:10px;padding-top:10px}.reader-analysis summary,.reader-profiles summary{font-size:11px;font-weight:750;cursor:pointer}.reader-analysis p,.reader-profile p{font-size:10px;line-height:1.6;color:#bdb4ab;margin:7px 0}.reader-performance{margin-top:12px;padding-top:12px;border-top:1px solid #56514c}.reader-perf-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.reader-net{font-size:25px;font-weight:850;letter-spacing:-.5px}.reader-perf-controls{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.reader-perf-controls button,.reader-perf-controls select{font:700 9px -apple-system,sans-serif;color:#f4ede0;background:#433f3b;border:1px solid #6d6760;border-radius:5px;padding:6px;cursor:pointer}.reader-graph{width:100%;height:90px;display:block;cursor:crosshair;touch-action:none}.reader-graph:focus-visible{outline:2px solid #ff6b5b}.reader-tooltip{font-size:10px;background:#423e3b;padding:7px;border-radius:5px;min-height:28px;color:#f4ede0}.reader-profile{padding:10px 0;border-bottom:1px solid #4c4743}.reader-profile strong{font-size:12px;display:block;overflow-wrap:anywhere}.reader-profile span{font-size:10px;line-height:1.7;color:#c2bab1}.reader-event{font-size:9px;color:#b1a79c;margin-top:7px}.reader-intent{font-size:9px;color:#ffad9d;line-height:1.5;margin-top:7px}.reader-note{font-size:9px;color:#afa499;margin-top:5px}.auto-options{font-size:10px;line-height:1.6;margin:9px 0}.auto-options label{display:block;margin:5px 0}.auto-options input[type=checkbox]{vertical-align:middle}.auto-options select{background:#413e3a;color:#f4ede0;border:1px solid #69635d;border-radius:4px;margin-left:5px}.bar .hint{min-height:0;font-size:10px;margin-top:9px}.bar .advice{margin-top:9px;padding-top:9px;min-height:50px}.bar .action{font-size:30px}.bar .tools button{font-size:10px}.auto-status{position:sticky;bottom:0;background:#1c1b1a;padding:6px 0}.auto-stopped .auto-status{color:#ffb0a0;font-weight:800}`;
    shadow.append(style);
    const cards = document.createElement('section');
    cards.className = 'reader-cards';
    cards.innerHTML =
      '<div><span class="reader-label">YOUR HAND</span><div class="reader-card-row" id="mini-hole"></div></div><div><span class="reader-label reader-board-label">BOARD<small class="reader-street">Preflop</small></span><div class="reader-card-row" id="mini-board"></div></div>';
    shadow.querySelector('.tools').after(cards);
    const stats = document.createElement('section');
    stats.className = 'reader-stats';
    cards.after(stats);
    const extra = document.createElement('div');
    extra.innerHTML =
      '<div class="reader-intent"></div><details class="reader-analysis"><summary>Decision breakdown</summary><div></div></details><section class="reader-performance"><div class="reader-perf-head"><div><span class="reader-label">SESSION NET · OBSERVED</span><strong class="reader-net">—</strong></div><div class="reader-perf-controls"><select aria-label="Graph interval"><option value="10">10 min</option><option value="60">1 hour</option></select><button id="chart-view">Net curve</button><button id="chart-reset" title="Start a fresh baseline; archive the previous session">Reset graph</button></div></div><svg class="reader-graph" viewBox="0 0 300 90" tabindex="0" role="img" aria-label="Session performance. Drag or use arrow keys to inspect."></svg><div class="reader-tooltip">Drag the chart to inspect time and result</div><div class="reader-note">Current hand settles at the next checkpoint.</div></section><details class="reader-profiles"><summary>Opponents & live actions</summary><div class="reader-profile-list"></div><div class="reader-event-list"></div></details>';
    shadow.querySelector('.advice').after(extra);
    let data = null,
      snapshot = null,
      mode = 'curve',
      interval = 10,
      cursor = null,
      resetAt = 0;
    const svg = shadow.querySelector('.reader-graph'),
      tooltip = shadow.querySelector('.reader-tooltip');
    const el = (name, attrs) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
      return node;
    };
    const fmt = (n, currency) =>
      `${n > 0 ? '+' : n < 0 ? '−' : ''}${currency || '€'}${(Math.abs(n) / 100).toFixed(2)}`;
    const points = () =>
      !data?.performance
        ? []
        : mode === 'curve'
          ? data.performance.points
          : interval === 10
            ? data.performance.ten
            : data.performance.hour;
    function graph() {
      const p = data?.performance,
        pts = points(),
        w = 300,
        h = 90;
      svg.replaceChildren();
      shadow.querySelector('.reader-net').textContent = p ? fmt(p.net, p.currency) : '—';
      shadow.querySelector('.reader-net').style.color = p?.net < 0 ? '#ff9c8e' : '#f4ede0';
      const min = Math.min(0, ...pts.map((v) => v.net)),
        max = Math.max(0, ...pts.map((v) => v.net)),
        range = Math.max(100, max - min),
        start = pts[0]?.at || 0,
        duration = Math.max(1, (pts.at(-1)?.at || 0) - start),
        y = (v) => h - 12 - ((v - min) / range) * (h - 24),
        x = (v, i) =>
          mode === 'curve'
            ? 8 + ((v.at - start) / duration) * (w - 16)
            : 8 + ((i + 0.5) * (w - 16)) / Math.max(1, pts.length);
      svg.append(
        el('line', {
          x1: 8,
          x2: 292,
          y1: mode === 'curve' ? y(0) : 45,
          y2: mode === 'curve' ? y(0) : 45,
          stroke: '#84766855',
          'stroke-dasharray': '3 4',
        }),
      );
      if (mode === 'curve' && pts.length > 1)
        svg.append(
          el('polyline', {
            points: pts.map((v, i) => `${x(v, i)},${y(v.net)}`).join(' '),
            fill: 'none',
            stroke: p.net < 0 ? '#ff6b5b' : '#f4ede0',
            'stroke-width': 2,
          }),
        );
      if (mode === 'bars') {
        const bound = Math.max(1, ...pts.map((v) => Math.abs(v.delta))),
          bw = 284 / Math.max(1, pts.length);
        pts.forEach((v, i) => {
          const bh = (Math.abs(v.delta) / bound) * 33;
          svg.append(
            el('rect', {
              x: 8 + i * bw + 2,
              y: v.delta >= 0 ? 45 - bh : 45,
              width: Math.max(1, bw - 4),
              height: Math.max(1, bh),
              fill: v.delta >= 0 ? '#f4ede0' : '#ff6b5b',
              rx: 2,
            }),
          );
        });
      }
      if (cursor !== null && pts.length) {
        cursor = Math.max(0, Math.min(cursor, pts.length - 1));
        const v = pts[cursor];
        svg.append(
          el('line', { x1: x(v, cursor), x2: x(v, cursor), y1: 4, y2: 86, stroke: '#ffad9d' }),
        );
        tooltip.textContent = `${new Date(v.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Net ${fmt(v.net, p.currency)}${mode === 'bars' ? ' · Period ' + fmt(v.delta, p.currency) : ''}`;
      } else
        tooltip.textContent =
          pts.length > 1
            ? 'Drag the chart to inspect time and result'
            : 'Waiting for session checkpoints';
    }
    function pick(e) {
      const pts = points();
      if (!pts.length) return;
      const box = svg.getBoundingClientRect(),
        f = Math.max(0, Math.min(1, (((e.clientX - box.left) / box.width) * 300 - 8) / 284));
      if (mode === 'bars') cursor = Math.min(pts.length - 1, Math.floor(f * pts.length));
      else {
        const t = pts[0].at + f * (pts.at(-1).at - pts[0].at);
        cursor = 0;
        pts.forEach((p, i) => {
          if (Math.abs(p.at - t) < Math.abs(pts[cursor].at - t)) cursor = i;
        });
      }
      graph();
    }
    svg.onpointerdown = (e) => {
      svg.setPointerCapture(e.pointerId);
      pick(e);
    };
    svg.onpointermove = pick;
    svg.onpointerup = (e) => {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    };
    svg.onkeydown = (e) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        cursor = (cursor ?? 0) + (e.key === 'ArrowRight' ? 1 : -1);
        graph();
      }
    };
    shadow.querySelector('.reader-perf-controls select').onchange = (e) => {
      interval = Number(e.target.value);
      mode = 'bars';
      shadow.querySelector('#chart-view').textContent = 'Period P/L';
      cursor = null;
      graph();
    };
    shadow.querySelector('#chart-view').onclick = (e) => {
      mode = mode === 'curve' ? 'bars' : 'curve';
      e.target.textContent = mode === 'curve' ? 'Net curve' : 'Period P/L';
      cursor = null;
      graph();
    };
    shadow.querySelector('#chart-reset').onclick = async () => {
      try {
        await reset();
        resetAt = Date.now();
        if (data) data = { ...data, performance: undefined };
        cursor = null;
        graph();
        tooltip.textContent = 'Graph reset. Previous session kept in history.';
      } catch {
        tooltip.textContent = 'Reset failed. Check the River connection.';
      }
    };
    const suitPaths = {
      s: 'M12 1C9 5 2 8 2 14a6 6 0 0 0 9 5c0 2-1 3-3 4h8c-2-1-3-2-3-4a6 6 0 0 0 9-5c0-6-7-9-10-13Z',
      h: 'M12 22C9 19 1 13 1 7a6 6 0 0 1 11-3A6 6 0 0 1 23 7c0 6-8 12-11 15Z',
      d: 'M12 1 23 12 12 23 1 12Z',
      c: 'M12 1a5 5 0 0 0-4 8 6 6 0 1 0 3 10c0 2-1 3-3 4h8c-2-1-3-2-3-4a6 6 0 1 0 3-10 5 5 0 0 0-4-8Z',
    };
    const suitCodes = {
      '♠': 's',
      '♥': 'h',
      '♦': 'd',
      '♣': 'c',
      s: 's',
      h: 'h',
      d: 'd',
      c: 'c',
    };
    const suitNames = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
    function cardRow(id, values, count) {
      const row = cards.querySelector(id),
        signature = JSON.stringify(values || []);
      if (row.dataset.cards === signature) return;
      row.dataset.cards = signature;
      row.replaceChildren();
      for (let i = 0; i < count; i++) {
        const c = document.createElement('span'),
          match = /^(10|[2-9TJQKA])([shdc♠♥♦♣])$/i.exec(values?.[i] || '');
        const rank = match?.[1].toUpperCase().replace('T', '10'),
          suit = match ? suitCodes[match[2].toLowerCase()] : null;
        c.className =
          'reader-card' +
          (id === '#mini-hole' ? ' hero-card' : '') +
          (!suit ? ' empty' : ['h', 'd'].includes(suit) ? ' red' : '');
        c.setAttribute('role', 'img');
        c.setAttribute(
          'aria-label',
          suit
            ? `${rank} of ${suitNames[suit]}`
            : id === '#mini-hole'
              ? 'Your card not dealt'
              : i < 3
                ? 'Flop card not dealt'
                : i === 3
                  ? 'Turn not dealt'
                  : 'River not dealt',
        );
        if (suit) {
          const r = document.createElement('span');
          r.className = 'reader-card-rank';
          r.textContent = rank;
          r.setAttribute('aria-hidden', 'true');
          const symbol = el('svg', {
            viewBox: '0 0 24 24',
            class: 'reader-card-suit',
            'aria-hidden': 'true',
          });
          symbol.append(el('path', { d: suitPaths[suit] }));
          c.append(r, symbol);
        }
        row.append(c);
      }
    }
    function update(panel, s, decision) {
      data = panel || { performance: data?.performance };
      if (data.performance && data.performance.start <= resetAt)
        data = { ...data, performance: undefined };
      snapshot = s;
      const fresh = panel && Date.now() - panel.at < 5000;
      cardRow('#mini-hole', fresh ? panel.hole : [], 2);
      cardRow('#mini-board', fresh ? panel.board : [], 5);
      cards.querySelector('.reader-street').textContent = !fresh
        ? 'Waiting'
        : { 0: 'Preflop', 3: 'Flop', 4: 'Turn', 5: 'River' }[panel.board.length] || 'Dealing';
      cards.style.opacity = panel?.holding ? '.75' : '1';
      stats.replaceChildren();
      for (const [label, value] of [
        ['Pot', s?.pot == null ? '—' : s.currency + s.pot.toFixed(2)],
        ['Call', s?.call == null ? '—' : s.currency + s.call.toFixed(2)],
        [
          'Turn',
          s?.timeLeft != null
            ? s.timeLeft + 's'
            : s?.sittingOut
              ? 'Sitting out'
              : s?.heroTurn
                ? 'You'
                : 'Waiting',
        ],
      ]) {
        const d = document.createElement('div'),
          l = document.createElement('span'),
          b = document.createElement('b');
        l.textContent = label;
        b.textContent = value;
        d.append(l, b);
        stats.append(d);
      }
      shadow.querySelector('.reader-intent').textContent = panel?.intent
        ? `${panel.intent.toUpperCase()}${panel.target != null ? ' · target ' + (s?.currency || '') + panel.target.toFixed(2) : ''}`
        : '';
      const reasons = shadow.querySelector('.reader-analysis>div');
      reasons.replaceChildren();
      for (const reason of decision
        ? [
            `You are facing ${s?.opponents || 1} opponent${s?.opponents === 1 ? '' : 's'}.`,
            `Calling needs ${Math.round(decision.threshold * 100)}% equity at the current price.`,
            'Estimates assume unknown cards within the selected ranges. They do not account for rake or future bets.',
          ]
        : panel?.reasoning || []) {
        const p = document.createElement('p');
        p.textContent = reason;
        reasons.append(p);
      }
      const list = shadow.querySelector('.reader-profile-list');
      list.replaceChildren();
      for (const p of panel?.profiles || []) {
        const item = document.createElement('div');
        item.className = 'reader-profile';
        const title = document.createElement('strong'),
          numbers = document.createElement('span'),
          note = document.createElement('p');
        title.textContent = p.name;
        numbers.textContent = `${p.hands} hands · ${p.actions} actions · aggression ${p.actions ? Math.round(((p.bets + p.raises) / p.actions) * 100) + '%' : '—'} · fold vs wager ${p.faced >= 20 ? Math.round((p.foldedFacing / p.faced) * 100) + '%' : 'unknown'} (n=${p.faced})`;
        note.textContent = `${p.range === 'random' ? 'Still learning this player’s starting hands.' : 'Observed starting-hand style: ' + p.range + '.'} ${p.riverBluffCandidates ? `${p.riverBluffCandidates} river bet${p.riverBluffCandidates === 1 ? '' : 's'} ended with a revealed high-card hand.` : ''}`;
        item.append(title, numbers, note);
        list.append(item);
      }
      if (!panel?.profiles?.length) list.textContent = 'Waiting for observed player actions.';
      const events = shadow.querySelector('.reader-event-list');
      events.replaceChildren();
      for (const e of (panel?.events || []).slice(-5).reverse()) {
        const d = document.createElement('div');
        d.className = 'reader-event';
        d.textContent = `${e.name} ${{ fold: 'folded', check: 'checked', call: 'called', bet: 'bet', raise: 'raised' }[e.action] || e.action}${e.amount != null && ['call', 'bet', 'raise'].includes(e.action) ? ' · ' + (s?.currency || '') + e.amount.toFixed(2) : ''}`;
        events.append(d);
      }
      graph();
      ui?.refresh(panel, s, decision);
    }
    const ui = globalThis.RiverInterface?.mount(shadow);
    return { update };
  }
  globalThis.RiverCompactPanel = { create };
})();
