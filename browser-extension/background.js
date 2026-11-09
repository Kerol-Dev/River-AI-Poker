const ORIGIN = 'http://127.0.0.1:17864';
const POKER_HOST = 'update-com.p365play.com';
const SITE_FILES = ['generic-adapter.js', 'theme.js', 'interface.js', 'panel.js', 'content.js'];
let activeFrame = null;
const siteId = (origin) => 'river-site-' + origin.replace(/[^a-z0-9]/gi, '_').slice(0, 90);
async function allowedSite(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname === POKER_HOST) return { origin: parsed.origin, bet365: true };
  const { sites = [] } = await chrome.storage.local.get('sites');
  return sites.some((s) => s.origins.includes(parsed.origin))
    ? { origin: parsed.origin, bet365: false }
    : null;
}
async function enableSite(origin, origins, tabId) {
  if (!/^https?:\/\/[^/]+$/.test(origin) || !Array.isArray(origins) || origins.length > 12)
    throw new Error('Unsupported site.');
  const clean = [...new Set([origin, ...origins])].filter(
    (o) => /^https?:\/\/[^/]+$/.test(o) && new URL(o).hostname !== POKER_HOST,
  );
  if (!(await chrome.permissions.contains({ origins: clean.map((o) => o + '/*') })))
    throw new Error('Allow this site in Chrome first.');
  const { sites = [] } = await chrome.storage.local.get('sites');
  await chrome.storage.local.set({
    sites: [...sites.filter((s) => s.origin !== origin), { origin, origins: clean }].slice(-40),
  });
  const id = siteId(origin);
  await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: clean.map((o) => o + '/*'),
      js: SITE_FILES,
      allFrames: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
  if (Number.isInteger(tabId)) {
    const frames = (await chrome.webNavigation.getAllFrames({ tabId }).catch(() => [])) || [];
    for (const frame of frames) {
      let frameOrigin;
      try {
        frameOrigin = new URL(frame.url).origin;
      } catch {
        continue;
      }
      if (!clean.includes(frameOrigin)) continue;
      await chrome.scripting
        .executeScript({ target: { tabId, frameIds: [frame.frameId] }, files: SITE_FILES })
        .catch(() => {});
    }
  }
  return { ok: true };
}
async function disableSite(origin) {
  const { sites = [] } = await chrome.storage.local.get('sites');
  const site = sites.find((s) => s.origin === origin);
  await chrome.scripting.unregisterContentScripts({ ids: [siteId(origin)] }).catch(() => {});
  await chrome.storage.local.set({ sites: sites.filter((s) => s.origin !== origin) });
  if (site)
    await chrome.permissions.remove({ origins: site.origins.map((o) => o + '/*') }).catch(() => {});
  return { ok: true };
}
let pendingSend = Promise.resolve();
async function performSend(path, data, token) {
  const r = await fetch(ORIGIN + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-River-Extension': chrome.runtime.id,
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(2500),
  });
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? 'Pairing expired. Copy a new code from River.'
        : r.status === 403
          ? 'This River session is paired to another connector.'
          : 'River rejected this reading.',
    );
  return r.json();
}
function send(path, data, token) {
  const request = pendingSend.catch(() => {}).then(() => performSend(path, data, token));
  pendingSend = request;
  return request;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    const settings = await chrome.storage.local.get(['token', 'enabled', 'profile', 'profiles']);
    // Popup and other extension pages are trusted; pages only reach the table handlers.
    const fromExtension =
      sender.id === chrome.runtime.id && (sender.url || '').startsWith(chrome.runtime.getURL(''));
    const site = !fromExtension ? await allowedSite(sender.url) : null;
    const profiles = settings.profiles || {};
    if (message.type === 'pair') {
      if (!fromExtension || !/^[a-f0-9]{48}$/.test(message.token || ''))
        throw new Error('Enter the pairing code copied from River.');
      const result = await send('/pair', {}, message.token);
      await chrome.storage.local.set({ token: message.token, enabled: false });
      return result;
    }
    if (message.type === 'settings')
      return {
        enabled: !!settings.enabled,
        paired: !!settings.token,
        profile: site && !site.bet365 ? profiles[site.origin] || null : settings.profile || null,
      };
    if (fromExtension && message.type === 'enable-site')
      return enableSite(message.origin, message.origins, message.tabId);
    if (fromExtension && message.type === 'disable-site') return disableSite(message.origin);
    if (!fromExtension) {
      if (!site) throw new Error('River is not turned on for this site.');
      if (message.type === 'reset-session') {
        if (!settings.token) throw Error('Pair first');
        return send('/command', { action: 'reset-session' }, settings.token);
      }
      if (message.type === 'profile') {
        if (!Array.isArray(message.profile) || message.profile.length > 15)
          throw new Error('Invalid mapping.');
        if (site.bet365) await chrome.storage.local.set({ profile: message.profile });
        else
          await chrome.storage.local.set({
            profiles: Object.fromEntries(
              [
                ...Object.entries(profiles).filter(([k]) => k !== site.origin),
                [site.origin, message.profile],
              ].slice(-40),
            ),
          });
        return { ok: true };
      }
      if (message.type === 'invalidate') {
        if (settings.token && activeFrame?.id === `${sender.tab.id}:${sender.frameId}`)
          return send('/pause', {}, settings.token);
        return { ok: true };
      }
      if (message.type === 'snapshot') {
        if (!settings.enabled || !settings.token)
          return { ok: false, error: 'Reader is paused. Pair and enable it from the extension.' };
        const frame = `${sender.tab.id}:${sender.frameId}`;
        if (activeFrame && activeFrame.id !== frame && Date.now() - activeFrame.at < 4000)
          return { ok: false, error: 'Another poker table is connected. Pause that reader first.' };
        activeFrame = { id: frame, at: Date.now() };
        return send('/snapshot', message.snapshot, settings.token);
      }
    }
    if (message.type === 'enabled') {
      if (typeof message.enabled !== 'boolean') throw new Error('Invalid setting.');
      if (message.enabled && !settings.token) throw new Error('Pair with River first.');
      await chrome.storage.local.set({ enabled: message.enabled });
      if (!message.enabled) {
        activeFrame = null;
        if (settings.token)
          try {
            await send('/pause', {}, settings.token);
          } catch {}
      }
      return { ok: true };
    }
    throw new Error('Unsupported connector request.');
  })()
    .then(reply)
    .catch((e) =>
      reply({
        ok: false,
        error: e.message === 'Failed to fetch' ? 'Open the River macOS app to connect.' : e.message,
      }),
    );
  return true;
});
