// End-to-end check of the any-site reader inside Chromium with the real extension loaded.
// A local sample table stands in for a poker site and a local stub stands in for the River
// app connection. Nothing reaches a real poker site and no wager actions are exercised.
import { chromium } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const work = await mkdtemp(path.join(tmpdir(), 'river-any-site-'));
const extension = path.join(work, 'extension');
await cp(path.resolve('browser-extension'), extension, { recursive: true });
// Tests cannot click Chrome's permission prompt, so the copy pre-grants the sample origin.
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
// The test copy talks to a stub on another port so a running River app is never touched.
const BRIDGE_PORT = 17999;
manifest.host_permissions = manifest.host_permissions.map((h) =>
  h.replace('17864', String(BRIDGE_PORT)),
);
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const bg = path.join(extension, 'background.js');
await writeFile(
  bg,
  (await readFile(bg, 'utf8')).replace('127.0.0.1:17864', `127.0.0.1:${BRIDGE_PORT}`),
);

const svg = (label, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="86"><rect width="60" height="86" rx="6" fill="#fff"/><text x="6" y="26" font-size="22" fill="${color}">${label}</text></svg>`;
const table = `<!doctype html><meta charset="utf-8"><title>Sample table</title>
<style>body{margin:0;background:#0d3b26;font:14px Arial;color:#fff}.felt{position:relative;width:1000px;height:680px}
.c{position:absolute;width:60px;height:86px;background:#fff;color:#111;border-radius:6px;font:700 22px Arial;padding:4px;box-sizing:border-box}.r{color:#c00}
.b{position:absolute;width:34px;height:48px;border-radius:4px;background:repeating-linear-gradient(45deg,#225,#225 4px,#338 4px,#338 8px)}
img{position:absolute;width:60px;height:86px}.pot{position:absolute;left:430px;top:250px}.acts{position:absolute;left:560px;top:610px;display:flex;gap:8px}
button{font:700 14px Arial;padding:10px 16px}</style>
<div class="felt">
<div class="b" style="left:120px;top:110px"></div><div class="b" style="left:156px;top:110px"></div>
<div class="b" style="left:520px;top:110px"></div><div class="b" style="left:556px;top:110px"></div>
<div class="board"><div class="c" style="left:350px;top:300px">J<span>♠</span></div><div class="c r" style="left:420px;top:300px">10<span>♥</span></div><img src="/cards/2d.svg" style="left:490px;top:300px"></div>
<div class="pot">Pot: €18.40</div>
<div class="hero"><img src="/cards/ace_of_spades.svg" style="left:430px;top:500px"><img src="/cards/king_of_hearts.svg" style="left:470px;top:500px"></div>
<div class="acts"><button>Fold</button><button>Call €4.20</button><button>Raise to €12</button></div>
</div>`;
const site = http.createServer((req, res) => {
  if (req.url.startsWith('/cards/')) {
    const name = req.url.slice(7);
    const art = {
      '2d.svg': svg('2♦', '#c00'),
      'ace_of_spades.svg': svg('A♠', '#111'),
      'king_of_hearts.svg': svg('K♥', '#c00'),
    };
    res.writeHead(art[name] ? 200 : 404, { 'Content-Type': 'image/svg+xml' }).end(art[name] || '');
  } else res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(table);
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${site.address().port}`;

const packets = [];
const bridge = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/snapshot') packets.push(JSON.parse(body));
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ ok: true, decision: null, panel: null }));
  });
});
await new Promise((r, j) => bridge.once('error', j).listen(BRIDGE_PORT, '127.0.0.1', r));

const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1000, height: 680 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
let failed = false;
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto(origin + '/play');
  const tabId = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url: url + '/*' });
    await chrome.storage.local.set({ token: 'a'.repeat(48), enabled: true });
    return tab.id;
  }, origin);
  // Same message the popup sends after Chrome grants the site.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
  const result = await popup.evaluate(
    ({ origin, tabId }) =>
      chrome.runtime.sendMessage({ type: 'enable-site', origin, origins: [origin], tabId }),
    { origin, tabId },
  );
  if (!result?.ok) throw Error('enable-site failed: ' + JSON.stringify(result));
  await popup.close();
  await page.bringToFront();
  const deadline = Date.now() + 15000;
  while (
    Date.now() < deadline &&
    !packets.some((p) => p.hole?.length === 2 && p.board?.length === 3)
  )
    await new Promise((r) => setTimeout(r, 200));
  const last = packets.filter((p) => p.hole?.length === 2).at(-1);
  if (!last) throw Error('No reading reached the River connection. Packets: ' + packets.length);
  const expect = (label, actual, wanted) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      failed = true;
      console.log(`FAIL ${label}: ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
    }
  };
  expect('source', last.source, 'web:127.0.0.1');
  expect('hole', last.hole, ['As', 'Kh']);
  expect('board', last.board, ['Js', 'Th', '2d']);
  expect('pot', last.pot, 18.4);
  expect('call', last.call, 4.2);
  expect('currency', last.currency, '€');
  expect('actions', last.actions, ['fold', 'call', 'raise']);
  expect('opponents', last.opponents, 2);
  expect('heroTurn', last.heroTurn, true);
  await page.screenshot({ path: 'artifacts/river-any-site.png' });
  // A site that hides opponents' cards falls back to the count you set (default 1).
  await page.evaluate(() => document.querySelectorAll('.b').forEach((e) => e.remove()));
  const hidden = Date.now() + 8000;
  while (Date.now() < hidden && packets.at(-1)?.opponents !== 1)
    await new Promise((r) => setTimeout(r, 200));
  expect('opponents fallback', packets.at(-1)?.opponents, 1);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'artifacts/river-any-site-manual.png' });
  // Reload: the registered script must start again without the popup.
  const before = packets.length;
  await page.reload();
  const again = Date.now() + 10000;
  while (Date.now() < again && packets.length === before)
    await new Promise((r) => setTimeout(r, 200));
  expect('runs again after reload', packets.length > before, true);
  // Theme screenshots: panel and popup in dark and light.
  for (const scheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: scheme });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `artifacts/river-panel-${scheme}.png` });
    const pop = await context.newPage();
    await pop.emulateMedia({ colorScheme: scheme });
    await pop.setViewportSize({ width: 320, height: 520 });
    await pop.goto(`chrome-extension://${worker.url().split('/')[2]}/popup.html`);
    await new Promise((r) => setTimeout(r, 400));
    await pop.screenshot({ path: `artifacts/river-popup-${scheme}.png` });
    await pop.close();
  }
  console.log(
    failed
      ? 'FAILED'
      : `PASS: any-site reading reached River (${packets.length} packets), survives reload.`,
  );
} finally {
  await context.close();
  site.close();
  bridge.close();
  await rm(work, { recursive: true, force: true });
}
if (failed) process.exit(1);
