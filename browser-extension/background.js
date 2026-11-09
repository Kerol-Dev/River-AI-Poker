const ORIGIN = 'http://127.0.0.1:17864';
const POKER_HOST = 'update-com.p365play.com';
let activeFrame = null;
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
    const settings = await chrome.storage.local.get(['token', 'enabled', 'profile']);
    if (message.type === 'pair') {
      if (sender.tab || !/^[a-f0-9]{48}$/.test(message.token || ''))
        throw new Error('Enter the pairing code copied from River.');
      const result = await send('/pair', {}, message.token);
      await chrome.storage.local.set({ token: message.token, enabled: false });
      return result;
    }
    if (message.type === 'settings')
      return {
        enabled: !!settings.enabled,
        paired: !!settings.token,
        profile: settings.profile || null,
      };
    if (sender.tab) {
      if (new URL(sender.url).hostname !== POKER_HOST) throw new Error('Unsupported table origin.');
      if (message.type === 'reset-session') {
        if (!settings.token) throw Error('Pair first');
        return send('/command', { action: 'reset-session' }, settings.token);
      }
      if (message.type === 'profile') {
        if (!Array.isArray(message.profile) || message.profile.length > 15)
          throw new Error('Invalid mapping.');
        await chrome.storage.local.set({ profile: message.profile });
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
