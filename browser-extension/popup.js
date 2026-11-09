// Theme shared with the in-page panel: system, light or dark.
const themeButtons = document.querySelectorAll('[data-theme]');
function showTheme(mode) {
  const light =
    mode === 'light' || (mode !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.classList.toggle('light', light);
  themeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === mode)));
}
chrome.storage.local.get('theme').then((v) => showTheme(v.theme || 'system'));
themeButtons.forEach((b) => {
  b.onclick = () => {
    chrome.storage.local.set({ theme: b.dataset.theme });
    showTheme(b.dataset.theme);
  };
});
const status = document.querySelector('#status'),
  toggle = document.querySelector('#toggle'),
  pair = document.querySelector('#pair');
let enabled = false;
async function refresh() {
  try {
    const s = await chrome.runtime.sendMessage({ type: 'settings' });
    enabled = !!s.enabled;
    toggle.textContent = enabled ? 'Pause reader' : 'Start reader';
    toggle.className = enabled ? 'secondary' : '';
    toggle.disabled = !s.paired;
    document.querySelector('#connection').classList.toggle('ready', !!s.paired);
    document.querySelector('#connection-title').textContent = s.paired
      ? enabled
        ? 'Reader enabled'
        : 'Browser paired'
      : 'Not connected';
    document.querySelector('#connection-detail').textContent = s.paired
      ? 'Ready for a supported browser table.'
      : 'Open the macOS app to get started.';
    document.querySelector('#pairing').open = !s.paired;
  } catch {
    status.textContent = 'Reload the extension to reconnect.';
  }
}
pair.onclick = async () => {
  pair.disabled = true;
  try {
    const r = await chrome.runtime.sendMessage({
      type: 'pair',
      token: document.querySelector('#token').value.trim(),
    });
    status.textContent = r.ok ? 'Connected. Open your table, then start the reader.' : r.error;
    if (r.ok) document.querySelector('#token').value = '';
    await refresh();
  } catch {
    status.textContent = 'Could not connect. Check that River is open.';
  } finally {
    pair.disabled = false;
  }
};
toggle.onclick = async () => {
  toggle.disabled = true;
  try {
    const r = await chrome.runtime.sendMessage({ type: 'enabled', enabled: !enabled });
    status.textContent = r.ok
      ? !enabled
        ? 'Reader started. Look for River beside your table.'
        : 'Reader paused.'
      : r.error;
    await refresh();
  } catch {
    status.textContent = 'Connection lost. Open River and try again.';
    toggle.disabled = false;
  }
};
refresh();

// Any-site support: the user turns River on per site. Chrome asks once for that site's
// frames, then the reader runs there on every visit until it is turned off here.
const siteButton = document.querySelector('#site'),
  siteTitle = document.querySelector('#site-title'),
  siteDetail = document.querySelector('#site-detail');
const BET365 = 'update-com.p365play.com';
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function frameOrigins(tabId) {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [];
  return [
    ...new Set(
      frames
        .map((f) => {
          try {
            return new URL(f.url).origin;
          } catch {
            return null;
          }
        })
        .filter((o) => o && /^https?:\/\//.test(o)),
    ),
  ].slice(0, 12);
}
async function refreshSite() {
  const tab = await currentTab();
  let url;
  try {
    url = new URL(tab?.url || '');
  } catch {}
  if (!url || !/^https?:$/.test(url.protocol)) {
    siteTitle.textContent = 'This site';
    siteDetail.textContent = 'Open a poker table in this tab.';
    siteButton.hidden = true;
    return;
  }
  siteTitle.textContent = url.hostname;
  const { sites = [] } = await chrome.storage.local.get('sites');
  const on = sites.some((s) => s.origin === url.origin);
  if (url.hostname === BET365 || (await frameOrigins(tab.id)).some((o) => o.endsWith(BET365))) {
    siteDetail.textContent = 'Supported table. River reads it automatically.';
    siteButton.hidden = true;
    return;
  }
  siteDetail.textContent = on
    ? 'River finds your cards, the board, pot and buttons here automatically.'
    : 'Turn River on to detect this table automatically. Chrome asks to allow this site once.';
  siteButton.hidden = false;
  siteButton.textContent = on ? 'Turn off on this site' : 'Use River on this site';
  siteButton.dataset.on = on ? '1' : '';
}
siteButton.onclick = async () => {
  siteButton.disabled = true;
  try {
    const tab = await currentTab();
    const origin = new URL(tab.url).origin;
    if (siteButton.dataset.on) {
      const r = await chrome.runtime.sendMessage({ type: 'disable-site', origin });
      status.textContent = r.ok ? 'River is off for this site.' : r.error;
    } else {
      const origins = [origin, ...(await frameOrigins(tab.id))].filter(
        (v, i, a) => a.indexOf(v) === i,
      );
      const granted = await chrome.permissions.request({ origins: origins.map((o) => o + '/*') });
      if (!granted) throw Error('Chrome permission was not granted for this site.');
      const r = await chrome.runtime.sendMessage({
        type: 'enable-site',
        origin,
        origins,
        tabId: tab.id,
      });
      status.textContent = r.ok
        ? 'River is on for this site. Look for the panel beside your table.'
        : r.error;
    }
  } catch (e) {
    status.textContent = e.message;
  } finally {
    siteButton.disabled = false;
    refreshSite();
  }
};
refreshSite().catch(() => {});
