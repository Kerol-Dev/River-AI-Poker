(() => {
  if (document.getElementById('river-table-mapper')) return;
  const R = globalThis.RiverReader;
  const host = document.createElement('div');
  host.id = 'river-table-mapper';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${globalThis.RiverTheme?.css || ''}
  </style><div id="markers"></div><section class="bar"><div class="header"><span class="brand"><b>♠</b> RIVER</span><span class="mode">READER 1.6.1</span><button id="live">Live off</button><button id="minimize" aria-label="Collapse River toolbar">−</button></div><div class="tools"><button id="map">Map table</button><button id="reset" title="Place markers on what River detected">Auto-map</button></div><div class="hint">Pair this connector with River, then enable reading.</div><div class="advice"><span class="action">Waiting</span><span class="equity">—</span></div><details class="auto-panel"><summary>Automatic play · user controlled</summary><div class="auto-fields"><label>Max / action<input id="auto-cap" type="number" min="0.01" max="1000" step="0.01" value="1000"></label><label>Spend limit<input id="auto-budget" type="number" min="0.01" step="0.01" placeholder="0.00"></label><label>Max actions<input id="auto-count" type="number" min="1" max="1000" value="1000"></label></div><div class="tiny">Amounts use the table currency. Exact bet sizes are confirmed before submission. Press Escape to stop.</div><div class="auto-options"><label>Run duration <select id="auto-minutes"><option value="10">10 min</option><option value="30">30 min</option><option value="60" selected>1 hour</option><option value="120">2 hours</option></select></label><label><input type="checkbox" id="auto-fallback" checked> Check/fold at 3 seconds if analysis is late</label><label><input type="checkbox" id="auto-bluffs"> Allow evidence-based bluff candidates</label></div><div class="auto-buttons"><button id="auto-start">START AUTO</button><button id="auto-stop">STOP</button></div><div class="auto-status">Manual mode · no automatic clicks</div></details></section>`;
  document.documentElement.append(host);
  // Theme: 'system' follows macOS; the choice is shared with the popup.
  let themeMode = 'system';
  const applyTheme = () => globalThis.RiverTheme?.apply(host, themeMode);
  Promise.resolve(chrome.storage?.local?.get?.('theme'))
    .then((v) => {
      themeMode = ['light', 'dark'].includes(v?.theme) ? v.theme : 'system';
      applyTheme();
    })
    .catch(applyTheme);
  globalThis.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.theme) {
      themeMode = changes.theme.newValue || 'system';
      applyTheme();
    }
  });
  const generic = !!R.generic;
  if (generic) {
    shadow.querySelector('.mode').textContent = 'AUTO-DETECT 1.6.1';
  }
  const bar = shadow.querySelector('.bar'),
    markers = shadow.querySelector('#markers'),
    hint = shadow.querySelector('.hint'),
    action = shadow.querySelector('.action'),
    eq = shadow.querySelector('.equity');
  let mapping = [],
    editing = false,
    dragging = false,
    enabled = false,
    paired = false,
    previousKey = '',
    stable = 0,
    lastPacket = 0,
    lastDecision = null,
    destroyed = false,
    autoTable = null;
  const auto = generic
    ? null
    : globalThis.RiverAutoplay?.create({
        read: currentSnapshot,
        prepare: (target) => {
          const root =
            R.resolve(document, mapping.find((m) => m.id === 'actions')?.selector) ||
            R.table(document)?.closest('.table');
          return globalThis.RiverBetSizing?.prepare(root, target) ?? false;
        },
        click: (kind, snapshot) => {
          const root = R.resolve(document, mapping.find((m) => m.id === 'actions')?.selector);
          const buttons = root
            ? [
                ...root.querySelectorAll(
                  '.actions-area:not(.pre-actions) .base-button.action-button',
                ),
              ].filter(
                (b) =>
                  R.visible(b) &&
                  !b.classList.contains('disabled') &&
                  !b.hasAttribute('disabled') &&
                  b.getAttribute('aria-disabled') !== 'true' &&
                  R.actionForButton(b, snapshot) === kind,
              )
            : [];
          if (buttons.length !== 1 || !snapshot.heroTurn) return false;
          const button = buttons[0],
            rect = button.getBoundingClientRect(),
            opts = {
              bubbles: true,
              cancelable: true,
              clientX: rect.x + rect.width / 2,
              clientY: rect.y + rect.height / 2,
              button: 0,
            };
          button.dispatchEvent(
            new PointerEvent('pointerdown', {
              ...opts,
              pointerType: 'mouse',
              isPrimary: true,
              buttons: 1,
            }),
          );
          button.dispatchEvent(new MouseEvent('mousedown', { ...opts, buttons: 1 }));
          button.dispatchEvent(
            new PointerEvent('pointerup', {
              ...opts,
              pointerType: 'mouse',
              isPrimary: true,
              buttons: 0,
            }),
          );
          button.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
          button.click();
          return true;
        },
        changed: (status) => {
          shadow.querySelector('.auto-status').textContent =
            `${status.running ? 'AUTO ON · ' : ''}${status.reason} · ${status.count} actions · ${(status.spent / 100).toFixed(2)} spent`;
          globalThis.RiverInterface?.automation(shadow, status);
          bar.classList.toggle('auto-active', status.running);
          bar.classList.toggle('auto-stopped', !status.running && status.count > 0);
          shadow.querySelector('#auto-start').disabled = status.running;
        },
      });
  if (!auto) shadow.querySelector('.auto-panel').remove();
  const oppKey = 'river.opponents.' + location.origin;
  if (generic)
    chrome.storage.local
      .get(oppKey)
      .then((v) => {
        const n = Number(v[oppKey]);
        if (Number.isInteger(n) && n >= 1 && n <= 5) R.settings.opponents = n;
      })
      .catch(() => {});
  // Used by the panel only when this site does not show opponents' hidden cards.
  const stepOpponents = generic
    ? (d) => {
        R.settings.opponents = Math.max(1, Math.min(5, R.settings.opponents + d));
        chrome.storage.local.set({ [oppKey]: R.settings.opponents }).catch(() => {});
        stable = 0;
        return R.settings.opponents;
      }
    : null;
  shadow.querySelector('#auto-start')?.addEventListener('click', (e) => {
    if (!e.isTrusted || !auto) return;
    try {
      if (!enabled || !paired || editing) throw Error('Enable Live and finish mapping first.');
      autoTable = R.table(document);
      auto.start({
        perAction: Number(shadow.querySelector('#auto-cap').value),
        budget: Number(shadow.querySelector('#auto-budget').value),
        actions: Number(shadow.querySelector('#auto-count').value),
        minutes: Number(shadow.querySelector('#auto-minutes').value),
        timeoutFallback: shadow.querySelector('#auto-fallback').checked,
        allowBluffs: shadow.querySelector('#auto-bluffs').checked,
      });
    } catch (error) {
      shadow.querySelector('.auto-status').textContent = error.message;
    }
  });
  shadow.querySelector('#auto-stop')?.addEventListener('click', () => auto?.stop('Stopped by you'));
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') auto?.stop('Stopped by Escape');
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.isTrusted && e.target.closest?.('.table-actions-wrapper'))
        auto?.stop('Manual table input detected');
    },
    true,
  );
  addEventListener('pagehide', () => auto?.stop('Table closed'));
  const invoke = (message) => chrome.runtime.sendMessage(message);
  const compact = globalThis.RiverCompactPanel?.create(shadow, {
    stepOpponents,
    reset: async () => {
      const r = await invoke({ type: 'reset-session' });
      if (!r.ok) throw Error(r.error);
    },
  });
  const clear = (message) => {
    lastDecision = null;
    action.textContent = 'Waiting';
    eq.textContent = '—';
    if (message) hint.textContent = message;
  };
  const load = async () => {
    const s = await invoke({ type: 'settings' });
    enabled = !!s.enabled;
    paired = !!s.paired;
    if (Array.isArray(s.profile)) mapping = s.profile;
    updateButtons();
  };
  const save = () => invoke({ type: 'profile', profile: mapping }).catch(() => {});
  const updateButtons = () => {
    shadow.querySelector('#map').textContent = editing ? 'Done mapping' : 'Map table';
    shadow.querySelector('#map').classList.toggle('active', editing);
    shadow.querySelector('#live').textContent = enabled ? 'Live on' : 'Live off';
    shadow.querySelector('#live').classList.toggle('active', enabled);
  };
  shadow.querySelector('#map').onclick = () => {
    editing = !editing;
    auto?.stop('Mapping changed');
    stable = 0;
    clear(
      editing
        ? 'Drag each marker onto its matching table element. Markers snap to readable elements.'
        : 'Mapping saved. Waiting for a stable table.',
    );
    updateButtons();
    renderMarkers();
  };
  shadow.querySelector('#reset').onclick = () => {
    const root = R.table(document);
    if (root) {
      auto?.stop('Mapping changed');
      mapping = R.defaults(root);
      save();
      editing = true;
      stable = 0;
      clear('Detected anchors restored. Drag a marker to adjust, then choose Done mapping.');
      updateButtons();
      renderMarkers();
    } else clear('Open a single poker table first.');
  };
  shadow.querySelector('#live').onclick = async () => {
    auto?.stop('Reader mode changed');
    const result = await invoke({ type: 'enabled', enabled: !enabled });
    if (!result.ok) clear(result.error);
    else {
      enabled = !enabled;
      stable = 0;
      clear(enabled ? 'Waiting for two consistent table readings.' : 'Reader paused.');
      updateButtons();
    }
  };
  shadow.querySelector('#minimize').onclick = (e) => {
    e.stopPropagation();
    bar.classList.toggle('minimized');
    shadow.querySelector('#minimize').textContent = bar.classList.contains('minimized') ? '+' : '−';
  };
  function dragBar(e) {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const start = bar.getBoundingClientRect(),
      x = e.clientX,
      y = e.clientY;
    const move = (event) => {
      bar.style.right = 'auto';
      bar.style.left =
        Math.max(0, Math.min(innerWidth - bar.offsetWidth, start.left + event.clientX - x)) + 'px';
      bar.style.top = Math.max(0, Math.min(innerHeight - 35, start.top + event.clientY - y)) + 'px';
    };
    const done = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', done, true);
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', done, true);
  }
  shadow.querySelector('.header').addEventListener('pointerdown', dragBar);
  function candidates(kind) {
    const root = R.table(document);
    return root
      ? R.defaults(root)
          .filter((m) => m.kind === kind)
          .map((m) => ({ ...m, element: R.resolve(document, m.selector) }))
          .filter((m) => R.visible(m.element))
      : [];
  }
  function renderMarkers() {
    if (dragging) return;
    markers.replaceChildren();
    if (!editing) return;
    mapping.forEach((marker, index) => {
      const target = R.resolve(document, marker.selector),
        box = R.visible(target)
          ? target.getBoundingClientRect()
          : marker.box
            ? {
                x: marker.box.x * innerWidth,
                y: marker.box.y * innerHeight,
                width: marker.box.w * innerWidth,
                height: marker.box.h * innerHeight,
              }
            : {
                x: 25 + (index % 4) * 160,
                y: 40 + Math.floor(index / 4) * 100,
                width: 135,
                height: 60,
              };
      const node = document.createElement('div');
      node.className = `marker ${marker.kind} ${target || marker.box ? '' : 'unmapped'}`;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `Move ${marker.label} marker`);
      node.tabIndex = 0;
      Object.assign(node.style, {
        left: box.x + 'px',
        top: box.y + 'px',
        width: Math.max(30, box.width) + 'px',
        height: Math.max(28, box.height) + 'px',
      });
      const title = document.createElement('span');
      title.textContent = marker.label;
      node.append(title);
      markers.append(node);
      node.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        node.classList.add('dragging');
        node.setPointerCapture(e.pointerId);
        stable = 0;
        clear('Mapping in progress. Advice paused.');
        const startX = e.clientX,
          startY = e.clientY,
          start = node.getBoundingClientRect();
        node.onpointermove = (ev) => {
          node.style.left =
            Math.max(0, Math.min(innerWidth - 30, start.x + ev.clientX - startX)) + 'px';
          node.style.top =
            Math.max(22, Math.min(innerHeight - 28, start.y + ev.clientY - startY)) + 'px';
        };
        node.onpointerup = (ev) => {
          node.releasePointerCapture(ev.pointerId);
          node.onpointermove = null;
          node.onpointerup = null;
          dragging = false;
          const b = node.getBoundingClientRect(),
            cx = b.x + b.width / 2,
            cy = b.y + b.height / 2;
          if (generic) {
            // Any site: pin the marker where it was dropped; detection reads inside it.
            mapping[index] = {
              ...marker,
              selector: '',
              box: {
                x: b.x / innerWidth,
                y: b.y / innerHeight,
                w: b.width / innerWidth,
                h: b.height / innerHeight,
              },
            };
            clear(`${marker.label} pinned here. River reads this area first.`);
            save();
            renderMarkers();
            return;
          }
          const near = candidates(marker.kind)
            .map((c) => {
              const r = c.element.getBoundingClientRect();
              const dx = Math.max(r.left - cx, 0, cx - r.right),
                dy = Math.max(r.top - cy, 0, cy - r.bottom);
              return { ...c, distance: Math.hypot(dx, dy) };
            })
            .sort((a, b) => a.distance - b.distance)[0];
          if (near && near.distance < 65) {
            mapping[index] = {
              id: marker.id,
              kind: marker.kind,
              label: marker.label,
              selector: near.selector,
            };
            clear(`${marker.label} attached. It will follow that table element.`);
          } else {
            mapping[index] = { ...marker, selector: '' };
            clear(
              `${marker.label} did not match a readable element. Drag it directly onto the matching item or choose Auto-map.`,
            );
          }
          save();
          renderMarkers();
        };
        node.onpointercancel = () => {
          dragging = false;
          node.onpointermove = null;
          renderMarkers();
        };
      };
      node.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const candidate = candidates(marker.kind).find((c) => c.id === marker.id);
          if (candidate) {
            mapping[index] = {
              id: marker.id,
              kind: marker.kind,
              label: marker.label,
              selector: candidate.selector,
            };
            save();
            renderMarkers();
          }
        }
      };
    });
  }
  function currentSnapshot() {
    const snapshot = R.read(document, mapping);
    if (document.hidden) snapshot.errors.unshift('Poker tab is not visible. Advice paused.');
    if (editing || dragging) snapshot.errors.unshift('Finish mapping before using live advice.');
    return snapshot;
  }
  const semanticKey = (snapshot) => R.decisionKey(snapshot);
  async function tick() {
    if (destroyed) return;
    try {
      const root = R.table(document);
      if (auto?.status().running && root && root !== autoTable)
        auto.stop('Table window changed. Review the table and restart Auto.');
      if (!mapping.length && root) {
        mapping = R.defaults(root);
        await save();
      } else if (generic && root && !editing) {
        const refined = R.refine?.(mapping);
        if (refined) {
          mapping = refined;
          await save();
        }
      }
      renderMarkers();
      if (!enabled || !paired) {
        clear(
          paired
            ? 'Reader paused. Turn Live on when ready.'
            : 'Open the extension button and paste the pairing code from River.',
        );
        return;
      }
      const snapshot = currentSnapshot();
      snapshot.automation = auto?.status();
      const rawKey = semanticKey(snapshot);
      stable = rawKey === previousKey ? stable + 1 : 1;
      previousKey = rawKey;
      if (stable < 3) snapshot.errors.unshift('Table changed. Confirming the new reading.');
      snapshot.key = semanticKey(snapshot);
      if (
        lastDecision?.key !== snapshot.key &&
        (lastDecision || stable < 3 || snapshot.errors.length)
      )
        clear(
          snapshot.errors[0] ||
            (snapshot.heroTurn ? 'Reading your current decision…' : 'Waiting for your turn.'),
        );
      const { detection, ...packet } = snapshot;
      const response = await invoke({
        type: 'snapshot',
        snapshot: { ...packet, automation: auto?.status() },
      });
      if (response.stopAuto) auto?.stop('Stopped from River');
      const validDecision =
        response.ok &&
        !editing &&
        response.decision?.key === snapshot.key &&
        snapshot.heroTurn &&
        !snapshot.errors.length &&
        Date.now() - response.decision.updatedAt < 3500
          ? response.decision
          : null;
      compact?.update(response.ok ? response.panel : null, snapshot, validDecision);
      lastPacket = Date.now();
      if (!response.ok) {
        auto?.stop(response.error || 'Connection unavailable. Open River and check pairing.');
        clear(response.error || 'Reader unavailable.');
      } else if (
        !editing &&
        response.decision &&
        response.decision.key === snapshot.key &&
        snapshot.heroTurn &&
        snapshot.errors.length === 0 &&
        Date.now() - response.decision.updatedAt < 3500
      ) {
        lastDecision = response.decision;
        const panel = response.panel;
        const manualRaise =
          !snapshot.automation?.running &&
          panel?.key === snapshot.key &&
          Date.now() - panel.at >= 0 &&
          Date.now() - panel.at < 3500
            ? panel.manualRaise
            : undefined;
        const awaitingSize =
          !snapshot.automation?.running &&
          ['Bet', 'Raise'].includes(response.decision.action) &&
          manualRaise === undefined;
        const displayTarget = awaitingSize
          ? null
          : manualRaise
            ? manualRaise.target
            : response.decision.target;
        action.textContent =
          (snapshot.allInCall && response.decision.action === 'Call'
            ? 'Call all-in'
            : response.decision.action) +
          (displayTarget != null
            ? ` to ${snapshot.currency}${displayTarget.toFixed(2)}`
            : !awaitingSize && !manualRaise && response.decision.amount > 0
              ? ` ${snapshot.currency}${response.decision.amount.toFixed(2)}`
              : '');
        eq.textContent = `${(response.decision.equity * 100).toFixed(1)}% equity`;
        hint.textContent =
          globalThis.RiverInterface?.copy(response.decision, snapshot).body ||
          response.decision.explanation;
        if (manualRaise?.note) hint.textContent += ` ${manualRaise.note}`;
        if (awaitingSize) hint.textContent += ' Waiting for a confirmed size suggestion.';
      }
      auto?.observe(snapshot, response.ok ? response.decision : null);
    } catch {
      auto?.stop('Connection lost');
      clear('Connection lost. Open River and check pairing.');
    } finally {
      setTimeout(tick, 250);
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) {
      enabled = !!changes.enabled.newValue;
      stable = 0;
      if (!enabled) auto?.stop('Reader paused');
      clear(enabled ? 'Reader started.' : 'Reader paused.');
    }
    if (changes.token) paired = !!changes.token.newValue;
    updateButtons();
  });
  let lastInvalidation = 0,
    checkPending = false;
  const observer = new MutationObserver((mutations) => {
    if (!enabled || !paired || checkPending) return;
    const critical =
      '.total-pot,.community-cards,.cards-holder-hero,.cards-holder-other-hidden,.actions-area,.hand-id';
    if (
      !mutations.some((m) => {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        return generic ? el && el !== host && !host.contains(el) : el?.closest?.(critical);
      })
    )
      return;
    checkPending = true;
    setTimeout(() => {
      checkPending = false;
      if (!enabled || !paired) return;
      // Animations change classes/styles continuously. Invalidate only when the
      // actual cards, money, legal actions or seat participation have changed.
      if (semanticKey(currentSnapshot()) === previousKey) return;
      stable = 0;
      previousKey = '';
      clear('Table changed. Confirming the new reading.');
      if (Date.now() - lastInvalidation > 200) {
        lastInvalidation = Date.now();
        invoke({ type: 'invalidate' }).catch(() => {});
      }
    }, 80);
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled'],
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      auto?.stop('Poker tab hidden');
      stable = 0;
      clear('Poker tab is not visible. Advice paused.');
    }
  });
  setInterval(() => {
    if (Date.now() - lastPacket > 3500) {
      if (lastDecision) clear('Table feed is stale. Waiting for a fresh reading.');
      compact?.update(null, null);
    }
  }, 500);
  load()
    .then(tick)
    .catch(() => clear('Reload this table after enabling the extension.'));
})();
