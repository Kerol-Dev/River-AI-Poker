/* River design tokens and the single stylesheet for the in-page panel.
 * Palette "Tide": cool slate neutrals, one blue accent, green/red reserved for results.
 * The same tokens are used by the macOS app (src/style.css) and the popup. */
(() => {
  const dark = `--bg:#0f1215;--surface:#151a1f;--surface-2:#1b2128;--surface-3:#232a32;--line:#262e37;--line-strong:#35404b;--text:#e9eef3;--text-2:#a3afbb;--text-3:#6f7c89;--accent:#5aa9ff;--accent-strong:#3b8ef0;--on-accent:#06182c;--accent-soft:rgba(90,169,255,.14);--win:#36d39a;--win-soft:rgba(54,211,154,.14);--loss:#ff6b76;--loss-soft:rgba(255,107,118,.13);--warn:#f2b84b;--warn-soft:rgba(242,184,75,.14);--card:#f7f5f0;--card-line:#f7f5f0;--card-ink:#14181d;--card-red:#d9343f;--shadow:0 18px 50px rgba(0,0,0,.5);color-scheme:dark;`;
  const light = `--bg:#f3f5f8;--surface:#ffffff;--surface-2:#f4f6f9;--surface-3:#e9edf2;--line:#e3e8ee;--line-strong:#cdd5de;--text:#0f1720;--text-2:#4a5867;--text-3:#7d8a97;--accent:#1d6fe0;--accent-strong:#155bbd;--on-accent:#ffffff;--accent-soft:rgba(29,111,224,.10);--win:#0f8a5f;--win-soft:rgba(15,138,95,.10);--loss:#d6334a;--loss-soft:rgba(214,51,74,.09);--warn:#b06d00;--warn-soft:rgba(176,109,0,.10);--card:#ffffff;--card-line:#cdd5de;--card-ink:#111820;--card-red:#d0263a;--shadow:0 14px 40px rgba(15,23,32,.16);color-scheme:light;`;
  const css = `
:host{${dark}font:12px/1.4 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Arial,sans-serif;color:var(--text)}
:host(.light){${light}}
*{box-sizing:border-box}
button,select,input{font:inherit;color:inherit}
button{cursor:pointer}
button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible,.marker:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* Shell */
.bar{pointer-events:auto;position:absolute;right:14px;top:12px;width:340px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;padding:14px 16px 12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.header{display:flex;align-items:center;gap:8px;height:24px;cursor:move;touch-action:none;user-select:none}
.brand{font-size:13px;font-weight:800;letter-spacing:2.4px;color:var(--text)}
.brand b{color:var(--accent);margin-right:2px}
.mode{display:none}
.header #live{margin-left:auto;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-strong);border-radius:999px;padding:3px 10px;background:var(--surface-2);color:var(--text-2);font-size:10px;font-weight:700}
.header #live:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--text-3)}
.header #live.active{color:var(--win);border-color:color-mix(in srgb,var(--win) 40%,transparent);background:var(--win-soft)}
.header #live.active:before{background:var(--win);box-shadow:0 0 0 3px var(--win-soft)}
.header #minimize{border:0;background:none;color:var(--text-3);font-size:16px;padding:0 2px;line-height:1}
.header #minimize:hover{color:var(--text)}

/* Tabs */
.river-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:2px;margin:12px 0 10px;padding:3px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px}
.river-tabs button{border:0;background:none;border-radius:7px;padding:7px 2px;font-size:11px;font-weight:650;color:var(--text-3);display:inline-flex;align-items:center;justify-content:center;gap:4px}
.river-tabs button:hover{color:var(--text-2)}
.river-tabs button[aria-selected=true]{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18)}
.river-tabs button.running{color:var(--win)}
.river-tabs button.running:before{content:'';width:5px;height:5px;border-radius:50%;background:var(--win);box-shadow:0 0 0 2px var(--win-soft)}
.river-pane{overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--line-strong) transparent;margin:0 -4px;padding:0 4px 2px}
.river-pane[hidden]{display:none!important}
.pane-title{font-size:15px;font-weight:750;letter-spacing:-.2px;margin:2px 0 3px}
.pane-description{font-size:11px;color:var(--text-3);margin:0 0 10px;line-height:1.5}
.section-title{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-3);margin:14px 0 8px}
.section-title:first-child{margin-top:2px}

/* Cards */
.reader-cards{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;align-items:start;margin:2px 0 0}
.reader-cards>div{min-width:0}
.reader-label{display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-3);margin-bottom:8px}
.reader-street{font-size:10px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--text-2)}
.reader-card-row{display:flex;gap:4px;align-items:center;min-height:64px}
.reader-card{position:relative;flex:0 0 36px;width:36px;height:52px;background:var(--card);color:var(--card-ink);border:1px solid var(--card-line);border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.18);overflow:hidden}
.reader-card.red{color:var(--card-red)}
.reader-card-rank{position:absolute;top:5px;left:5px;font:800 15px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;letter-spacing:-.6px}
.reader-card-suit{position:absolute;right:5px;bottom:6px;width:18px;height:18px;fill:currentColor}
.reader-card.hero-card{flex-basis:45px;width:45px;height:64px;border-radius:7px}
.hero-card .reader-card-rank{font-size:20px;top:6px;left:6px}
.hero-card .reader-card-suit{width:24px;height:24px;right:6px;bottom:7px}
.reader-card.empty{background:transparent;border:1px dashed var(--line-strong);box-shadow:none}
.reader-card.empty:after{display:none}

/* Key numbers */
.reader-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:12px 0 0;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.reader-stats>div{min-width:0}
.reader-stats span{display:block;font-size:10px;color:var(--text-3)}
.reader-stats b{display:block;font-size:15px;font-weight:750;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reader-opp b{display:flex!important;align-items:center;gap:5px}
.reader-stats .reader-opp .opp-n{display:inline;font-size:inherit;color:inherit}
.reader-opp small{font-size:9px;font-weight:600;color:var(--text-3)}
.reader-opp button{width:18px;height:18px;padding:0;border-radius:50%;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center}
.reader-opp button:hover{border-color:var(--accent);color:var(--accent)}
.reader-opp button[hidden]{display:none!important}

/* Decision */
.decision-surface{margin-top:12px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:12px}
.decision-kicker{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent)}
.advice{display:block;margin:4px 0 2px;padding:0;border:0;min-height:0}
.action{display:block;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.6px;color:var(--text);font-variant-numeric:tabular-nums}
#auto-confirm-btn{display:inline-flex;align-items:center;justify-content:center;margin-top:8px;width:100%;padding:10px 14px;background:#10b981;color:#fff;border:1px solid #059669;border-radius:9px;font-size:13px;font-weight:800;letter-spacing:.5px;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,.35);transition:transform .1s,background .15s}
#auto-confirm-btn:hover{background:#059669;transform:translateY(-1px)}
#auto-confirm-btn[hidden]{display:none!important}
.equity{display:none}
.decision-subtitle{font-size:12px;font-weight:650;color:var(--text);margin:0 0 3px}
.hint{font-size:11px;line-height:1.5;color:var(--text-2);margin:0;min-height:0}
.decision-numbers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.decision-numbers span{display:block;font-size:10px;line-height:1.25;color:var(--text-3)}.decision-numbers>div{min-width:0}
.decision-numbers strong{display:block;font-size:15px;font-weight:750;margin-top:3px;font-variant-numeric:tabular-nums}
.reader-intent{display:none}
.reader-analysis{margin-top:10px}
.reader-analysis summary{font-size:11px;font-weight:650;color:var(--text-2);cursor:pointer;list-style:none}
.reader-analysis summary:before{content:'›';display:inline-block;margin-right:6px;transition:transform .15s}
.reader-analysis[open] summary:before{transform:rotate(90deg)}
.reader-analysis summary::-webkit-details-marker{display:none}
.reader-analysis p{font-size:11px;line-height:1.55;color:var(--text-2);margin:6px 0 0}

/* Players */
.reader-profiles>summary{display:none}
.reader-profile-list{font-size:11px;color:var(--text-3)}
.reader-profile{padding:10px 0;border-bottom:1px solid var(--line)}
.reader-profile:last-child{border-bottom:0}
.reader-profile strong{display:block;font-size:12px;font-weight:700;color:var(--text);overflow-wrap:anywhere}
.reader-profile span{display:block;font-size:10px;color:var(--text-2);margin-top:3px;font-variant-numeric:tabular-nums}
.reader-profile p{font-size:10px;line-height:1.5;color:var(--text-3);margin:4px 0 0}
.reader-event-list:not(:empty){margin-top:6px}
.reader-event{font-size:11px;color:var(--text-2);padding:7px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}

/* Session */
.reader-performance{margin:0}
.reader-perf-head{display:flex;justify-content:space-between;align-items:flex-end;gap:8px}
.reader-perf-head .reader-label{margin-bottom:4px}
.reader-net{font-size:28px;font-weight:800;letter-spacing:-.6px;font-variant-numeric:tabular-nums}
.reader-net.up{color:var(--win)}.reader-net.down{color:var(--loss)}
.reader-perf-controls{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:170px}
.reader-perf-controls button,.reader-perf-controls select{font-size:10px;font-weight:650;color:var(--text-2);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:6px;padding:5px 7px}
.reader-perf-controls button:hover{color:var(--text)}
.reader-graph{display:block;width:100%;height:110px;margin-top:10px;cursor:crosshair;touch-action:none;background:var(--surface-2);border-radius:10px}
.reader-tooltip{margin-top:6px;font-size:11px;color:var(--text-2);min-height:18px;font-variant-numeric:tabular-nums}
.reader-note{font-size:10px;color:var(--text-3);margin-top:4px}

/* Settings and controls */
.tools{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0}
.btn,.tools button{border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);border-radius:8px;padding:8px 10px;font-size:11px;font-weight:650}
.btn:hover,.tools button:hover{border-color:var(--accent)}
.tools button.active{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.segmented{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:3px;background:var(--surface-2);border:1px solid var(--line);border-radius:9px}
.segmented button{border:0;background:none;border-radius:6px;padding:6px 4px;font-size:11px;font-weight:650;color:var(--text-3)}
.segmented button[aria-pressed=true]{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18)}
.settings-note{font-size:11px;line-height:1.5;color:var(--text-3);margin:8px 0 0}
.reader-error{font-size:11px;color:var(--loss);margin:8px 0 0}
.reader-error:empty{display:none}

/* Automatic play (Bet365 only): dedicated Auto tab */
.auto-panel{margin:0;padding:0;border:0;display:flex;flex-direction:column;gap:10px}
.auto-hero{padding:11px 12px;background:var(--surface-2);border:1px solid var(--line);border-radius:11px}
.auto-hero-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}
.auto-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;background:var(--surface-3);color:var(--text-2);border:1px solid var(--line-strong)}
.auto-badge.active{background:var(--win-soft);color:var(--win);border-color:color-mix(in srgb,var(--win) 45%,transparent)}
.auto-badge.stopped{background:var(--warn-soft);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
.auto-esc{font-size:10px;color:var(--text-3);font-weight:600}
.auto-status{font-size:11px;font-weight:600;color:var(--text);line-height:1.45;font-variant-numeric:tabular-nums}
.auto-live-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px;padding-top:9px;border-top:1px solid var(--line)}
.auto-live-grid>div{min-width:0}
.auto-live-grid span{display:block;font-size:9px;font-weight:650;text-transform:uppercase;letter-spacing:.4px;color:var(--text-3)}
.auto-live-grid strong{display:block;font-size:13px;font-weight:750;margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.auto-buttons{display:grid;grid-template-columns:1.35fr 1fr;gap:6px}
.auto-buttons button{border-radius:9px;padding:9px 10px;font-size:11px;font-weight:800;letter-spacing:.3px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text)}
.auto-buttons #auto-start{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.auto-buttons #auto-start:hover:not(:disabled){background:var(--accent-strong);border-color:var(--accent-strong)}
.auto-buttons #auto-start:disabled{opacity:.45;cursor:default}
.auto-buttons #auto-stop:hover{border-color:var(--warn);color:var(--warn)}
.auto-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.auto-presets button{border:1px solid var(--line);background:var(--surface-2);color:var(--text-2);border-radius:7px;padding:5px 6px;font-size:10px;font-weight:650}
.auto-presets button:hover{border-color:var(--accent);color:var(--text)}
.auto-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0}
.auto-fields label{display:flex;flex-direction:column;gap:4px;font-size:10px;font-weight:650;color:var(--text-2)}
.auto-fields input,.auto-fields select{display:block;width:100%;padding:7px 9px;background:var(--surface-2);border:1px solid var(--line-strong);border-radius:8px;font-size:12px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums}
.auto-options{display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--text-2);margin:0;padding:8px 10px;background:var(--surface-2);border:1px solid var(--line);border-radius:9px}
.auto-options label{display:flex;align-items:center;gap:7px;margin:0;cursor:pointer}
.auto-options input[type=checkbox]{accent-color:var(--accent);margin:0}
.tiny{display:none}
.auto-panel .tiny{display:block;font-size:10px;color:var(--text-3);line-height:1.45;margin:0}
.auto-active{border-color:var(--warn)}
.auto-notice{font-size:11px;line-height:1.5;color:var(--warn);margin:0 0 10px;padding:8px 10px;border-radius:8px;background:var(--warn-soft)}

/* Footer */
.river-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:9px;border-top:1px solid var(--line);font-size:10px;color:var(--text-3)}
.river-footer button{border:0;border-radius:6px;padding:4px 9px;font-size:10px;font-weight:750;background:var(--warn);color:#1a1300}

/* Collapsed */
.minimized{width:auto!important;padding:10px 14px!important}
.minimized .river-tabs,.minimized .river-pane,.minimized .river-footer,.minimized .auto-notice{display:none!important}

/* Table markers */
.marker{pointer-events:auto;position:absolute;border:2px solid var(--accent);background:var(--accent-soft);border-radius:8px;cursor:grab;touch-action:none}
.marker.unmapped{border-style:dashed;opacity:.7}
.marker.dragging{cursor:grabbing;z-index:4}
.marker.player{border-color:var(--text-3);background:transparent}
.marker.dealer{border-color:var(--text)}
.marker span{position:absolute;left:-2px;top:-22px;background:var(--accent);color:var(--on-accent);font-size:10px;font-weight:700;line-height:18px;padding:1px 7px;border-radius:5px 5px 0 0;white-space:nowrap}
.marker.player span{background:var(--text-3)}
`;
  // mode: 'system' | 'light' | 'dark'
  function apply(host, mode) {
    const light =
      mode === 'light' ||
      (mode !== 'dark' && globalThis.matchMedia?.('(prefers-color-scheme: light)').matches);
    host.classList.toggle('light', !!light);
  }
  globalThis.RiverTheme = { css, dark, light, apply };
})();
