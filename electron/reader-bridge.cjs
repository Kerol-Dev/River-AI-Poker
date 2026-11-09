const http = require('node:http');
const crypto = require('node:crypto');
const SOURCE = 'update-com.p365play.com';
// Bet365 uses its dedicated reader; other sites send "web:<hostname>" from the any-site reader.
const validSource = (v) =>
  v === SOURCE || (typeof v === 'string' && /^web:[a-z0-9.-]{1,253}$/i.test(v));
function sanitize(data, receivedAt = Date.now()) {
  if (
    !data ||
    data.version !== 1 ||
    !validSource(data.source) ||
    typeof data.key !== 'string' ||
    data.key.length > 16000 ||
    typeof data.heroTurn !== 'boolean'
  )
    throw new Error('Invalid table packet');
  const strings = (value, max, length) => {
    if (
      !Array.isArray(value) ||
      value.length > max ||
      value.some((v) => typeof v !== 'string' || v.length > length)
    )
      throw new Error('Invalid packet field');
    return value;
  };
  const num = (value) =>
    value === null
      ? null
      : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9
        ? value
        : (() => {
            throw new Error('Invalid amount');
          })();
  if (!Number.isInteger(data.opponents) || data.opponents < 0 || data.opponents > 9)
    throw new Error('Invalid seat count');
  if (!Array.isArray(data.seats) || data.seats.length > 10) throw new Error('Invalid seats');
  const seats = data.seats.map((s) => ({
    id: String(s.id).slice(0, 40),
    label: String(s.label).slice(0, 60),
    hero: s.hero === true,
    inHand: s.inHand === true,
    stack: num(s.stack),
    username: typeof s.username === 'string' ? s.username.slice(0, 80) : null,
    bet: s.bet == null ? null : num(s.bet),
    lastAction: ['fold', 'check', 'call', 'bet', 'raise'].includes(s.lastAction)
      ? s.lastAction
      : null,
    shown: s.shown ? strings(s.shown, 2, 2) : [],
  }));
  return {
    version: 1,
    key: data.key,
    automation: data.automation
      ? {
          running: data.automation.running === true,
          reason: String(data.automation.reason || '').slice(0, 180),
          count: Math.max(0, Math.min(10000, Number(data.automation.count) || 0)),
          spent: Math.max(0, Math.min(1e9, Number(data.automation.spent) || 0)),
          rounds: Math.max(0, Math.min(10000, Number(data.automation.rounds) || 0)),
          maxRounds: Math.max(0, Math.min(10000, Number(data.automation.maxRounds) || 0)),
          roundSpent: Math.max(0, Math.min(1e9, Number(data.automation.roundSpent) || 0)),
          maxBetPerRound: Math.max(0, Math.min(1e9, Number(data.automation.maxBetPerRound) || 0)),
          loss: Math.max(0, Math.min(1e9, Number(data.automation.loss) || 0)),
          maxLoss: Math.max(0, Math.min(1e9, Number(data.automation.maxLoss) || 0)),
          timeRemaining: Math.max(0, Math.min(10800, Number(data.automation.timeRemaining) || 0)),
          maxMinutes: Math.max(0, Math.min(180, Number(data.automation.maxMinutes) || 0)),
        }
      : undefined,
    source: data.source,
    handId: String(data.handId || '').slice(0, 30),
    actorSeat: data.actorSeat == null ? null : String(data.actorSeat).slice(0, 40),
    timeLeft: data.timeLeft == null ? null : num(data.timeLeft),
    sittingOut: data.sittingOut === true,
    sizing: data.sizing
      ? {
          min: data.sizing.min == null ? null : num(data.sizing.min),
          max: data.sizing.max == null ? null : num(data.sizing.max),
          editable: data.sizing.editable === true,
        }
      : undefined,
    hole: strings(data.hole, 2, 2),
    board: strings(data.board, 5, 2),
    pot: num(data.pot),
    callPot: data.callPot == null ? null : num(data.callPot),
    allInCall: data.allInCall === true,
    call: num(data.call),
    currency: String(data.currency || '').slice(0, 4),
    heroBet: data.heroBet == null ? null : num(data.heroBet),
    actionAmounts: Object.fromEntries(
      ['call', 'bet', 'raise']
        .filter((k) => data.actionAmounts?.[k] != null)
        .map((k) => [k, num(data.actionAmounts[k])]),
    ),
    opponents: data.opponents,
    heroTurn: data.heroTurn,
    actions: strings(data.actions, 5, 6),
    seats,
    dealer: data.dealer === null ? null : String(data.dealer).slice(0, 30),
    errors: strings(data.errors, 12, 220),
    mapping: {
      mapped: Math.min(20, Math.max(0, Number(data.mapping?.mapped) || 0)),
      total: Math.min(20, Math.max(0, Number(data.mapping?.total) || 0)),
    },
    receivedAt,
  };
}
function createReaderBridge({
  port = 17864,
  onSnapshot = () => {},
  onStatus = () => {},
  onCommand = () => {},
} = {}) {
  let token = crypto.randomBytes(24).toString('hex'),
    pairedId = null,
    lastSeen = null,
    latest = null,
    decision = null,
    error = null,
    stopAutoRequested = false,
    panel = null;
  const state = () => ({
    running: server.listening,
    port: server.address()?.port || port,
    token,
    connected: lastSeen !== null && Date.now() - lastSeen < 3500,
    lastSeen,
    ...(error ? { error } : {}),
  });
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const extensionId = req.headers['x-river-extension'];
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-River-Extension');
      res.writeHead(204).end();
      return;
    }
    const provided = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (
      provided.length !== token.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    ) {
      res.writeHead(401).end();
      return;
    }
    if (
      typeof extensionId !== 'string' ||
      !/^[a-p]{32}$/.test(extensionId) ||
      (origin && origin !== `chrome-extension://${extensionId}`) ||
      (pairedId && pairedId !== extensionId)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== 'POST' || !['/pair', '/snapshot', '/pause', '/command'].includes(req.url)) {
      res.writeHead(404).end();
      return;
    }
    let body = '',
      size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 80000) {
        res.writeHead(413).end();
        req.destroy();
      } else body += chunk;
    });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        if (req.url === '/snapshot') {
          latest = sanitize(data);
          pairedId = extensionId;
          lastSeen = latest.receivedAt;
          onSnapshot(latest);
        } else if (req.url === '/command') {
          if (data.action !== 'reset-session') throw new Error('Invalid command');
          onCommand(data.action);
        } else if (req.url === '/pause') {
          lastSeen = null;
          latest = null;
          decision = null;
          onSnapshot(null);
        } else pairedId = extensionId;
        onStatus(state());
        const active =
          req.url === '/snapshot' &&
          decision &&
          decision.key === latest?.key &&
          Date.now() - decision.updatedAt < 3500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            decision: active ? decision : null,
            stopAuto: stopAutoRequested,
            panel: panel && Date.now() - panel.at < 5000 ? panel : null,
          }),
        );
        if (req.url === '/snapshot' && data.automation?.running === false)
          stopAutoRequested = false;
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: 'Invalid table reading' }));
      }
    });
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxConnections = 8;
  server.on('error', (e) => {
    error =
      e.code === 'EADDRINUSE'
        ? 'Reader port 17864 is in use. Close other River instances and reopen this app.'
        : 'The local browser bridge could not start.';
    onStatus(state());
  });
  server.listen(port, '127.0.0.1', () => onStatus(state()));
  return {
    server,
    setPanel(data) {
      panel = data;
    },
    stopAuto() {
      stopAutoRequested = true;
      decision = null;
    },
    status: state,
    latest: () => latest,
    setDecision(value) {
      decision =
        value && latest && value.key === latest.key && Date.now() - lastSeen < 3500
          ? { ...value, updatedAt: Date.now() }
          : null;
    },
    rotate() {
      token = crypto.randomBytes(24).toString('hex');
      pairedId = null;
      lastSeen = null;
      latest = null;
      decision = null;
      onSnapshot(null);
      onStatus(state());
      return state();
    },
    close() {
      server.close();
    },
  };
}
module.exports = { createReaderBridge, sanitize, validSource };
