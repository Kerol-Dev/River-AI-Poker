const status = document.querySelector('#status'),
  toggle = document.querySelector('#toggle'),
  pair = document.querySelector('#pair');
let enabled = false;
async function refresh() {
  try {
    const s = await chrome.runtime.sendMessage({ type: 'settings' });
    enabled = !!s.enabled;
    toggle.textContent = enabled ? 'Pause reader' : 'Start reader';
    toggle.disabled = !s.paired;
    document.querySelector('#connection').classList.toggle('ready', !!s.paired);
    document.querySelector('#connection-title').textContent = s.paired
      ? enabled
        ? 'Reader enabled'
        : 'Browser paired'
      : 'Connect to River';
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
