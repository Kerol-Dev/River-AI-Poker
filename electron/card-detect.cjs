// Platform-independent port of native/recognize.swift detectCards(): finds face-up cards by
// their light faces, reads the corner index shapes, classifies the suit by colour and shape and
// the rank by shape (optionally confirmed by the platform's text recognition).
// Reference shapes come from electron/card-templates.json, exported by `river-ocr --templates`.
const TEMPLATES = require('./card-templates.json');
const N = TEMPLATES.size;
const decode = (list) =>
  list.map((t) => ({ code: t.code, mask: [...t.mask].map((c) => c === '1') }));
const SUITS = decode(TEMPLATES.suits);
const RANKS = decode(TEMPLATES.ranks);

function pixels(img, order = 'rgba') {
  const { width: w, height: h, data } = img;
  const [ri, gi, bi] = order === 'bgra' ? [2, 1, 0] : [0, 1, 2];
  const rgb = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i + ri], data[i + gi], data[i + bi]];
  };
  return {
    w,
    h,
    rgb,
    // Card faces: bright and nearly colourless (white or cream).
    face(x, y) {
      const [r, g, b] = rgb(x, y);
      const mn = Math.min(r, g, b),
        mx = Math.max(r, g, b);
      return mn > 190 && mx - mn < 48;
    },
    // Index ink: dark, or strongly coloured (red, blue or green four-colour suits).
    ink(x, y) {
      const [r, g, b] = rgb(x, y);
      const mn = Math.min(r, g, b),
        mx = Math.max(r, g, b);
      return (r + g + b) / 3 < 140 || (mx - mn > 90 && mx > 110);
    },
  };
}

// 4-connected components of test() inside a window sampled every `step` pixels.
function components(px, x0, y0, x1, y1, step, test) {
  const gw = Math.max(1, Math.floor((x1 - x0) / step)),
    gh = Math.max(1, Math.floor((y1 - y0) / step));
  const mask = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++)
      mask[gy * gw + gx] = test(x0 + gx * step, y0 + gy * step) ? 1 : 0;
  const labels = new Int32Array(gw * gh).fill(-1);
  const boxes = [];
  const stack = [];
  for (let start = 0; start < gw * gh; start++) {
    if (!mask[start] || labels[start] >= 0) continue;
    const id = boxes.length;
    const b = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, count: 0 };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop(),
        gx = i % gw,
        gy = (i / gw) | 0;
      if (gx < b.x0) b.x0 = gx;
      if (gx > b.x1) b.x1 = gx;
      if (gy < b.y0) b.y0 = gy;
      if (gy > b.y1) b.y1 = gy;
      b.count++;
      for (const j of [
        gx > 0 ? i - 1 : -1,
        gx < gw - 1 ? i + 1 : -1,
        gy > 0 ? i - gw : -1,
        gy < gh - 1 ? i + gw : -1,
      ])
        if (j >= 0 && mask[j] && labels[j] < 0) {
          labels[j] = id;
          stack.push(j);
        }
    }
    b.w = b.x1 - b.x0 + 1;
    b.h = b.y1 - b.y0 + 1;
    boxes.push(b);
  }
  return { boxes, labels, gw, gh };
}

function normalise(inside, w, h) {
  const out = new Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      out[y * N + x] = inside(
        Math.min(w - 1, Math.floor((x * w + Math.floor(w / 2)) / N)),
        Math.min(h - 1, Math.floor((y * h + Math.floor(h / 2)) / N)),
      );
  return out;
}
function overlap(a, b) {
  let both = 0,
    either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) both++;
    if (a[i] || b[i]) either++;
  }
  return either ? both / either : 0;
}
// Top rows relative to the widest row: a spade or diamond starts at a point; a club or heart
// starts with rounded lobes. Measured 0.10-0.21 versus 0.26-0.86.
function topRatio(m) {
  const widths = [];
  for (let y = 0; y < N; y++) {
    let x0 = N,
      x1 = -1;
    for (let x = 0; x < N; x++)
      if (m[y * N + x]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    widths.push(x1 >= x0 ? x1 - x0 + 1 : 0);
  }
  const maxW = Math.max(...widths);
  const first = widths.findIndex((v) => v > 0);
  if (first < 0 || !maxW) return 0;
  const top = widths.slice(first, Math.min(N, first + 3));
  return top.reduce((a, b) => a + b, 0) / top.length / maxW;
}

function classifySuit(px, comp, labels, gw, id, ox, oy) {
  let red = 0,
    blue = 0,
    green = 0,
    all = 0;
  for (let y = comp.y0; y <= comp.y1; y++)
    for (let x = comp.x0; x <= comp.x1; x++) {
      if (labels[y * gw + x] !== id) continue;
      const [r, g, b] = px.rgb(ox + x, oy + y);
      all++;
      if (r - Math.max(g, b) > 50) red++;
      else if (b - Math.max(r, g) > 35) blue++;
      else if (g - Math.max(r, b) > 35) green++;
    }
  if (!all) return null;
  const shape = normalise(
    (x, y) => labels[(comp.y0 + y) * gw + comp.x0 + x] === id,
    comp.w,
    comp.h,
  );
  const allowed =
    blue * 2 > all ? ['d'] : green * 2 > all ? ['c'] : red * 2 > all ? ['h', 'd'] : ['s', 'c'];
  const best = {};
  for (const t of SUITS)
    if (allowed.includes(t.code))
      best[t.code] = Math.max(best[t.code] || 0, overlap(shape, t.mask));
  const top = Object.entries(best).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] <= 0.42) return null;
  if (allowed.length === 1) return [top[0], Math.max(top[1], 0.9)];
  const ratio = topRatio(shape);
  const pointed = allowed.includes('s') ? 's' : 'd',
    rounded = allowed.includes('s') ? 'c' : 'h';
  const [low, high] = allowed.includes('s') ? [0.21, 0.25] : [0.4, 0.55];
  if (ratio <= low) return [pointed, best[pointed] ?? top[1]];
  if (ratio >= high) return [rounded, best[rounded] ?? top[1]];
  return top;
}

const rankTokens = (s) => {
  const out = [];
  const chars = [...String(s).toUpperCase().replace(/\s/g, '')];
  for (let i = 0; i < chars.length; i++) {
    if ('1IL|'.includes(chars[i]) && '0O'.includes(chars[i + 1] || '')) {
      out.push('T');
      i++;
    } else if ('AKQJ23456789'.includes(chars[i])) out.push(chars[i]);
  }
  return out;
};

function rankScores(shape) {
  const scores = {};
  for (const t of RANKS) scores[t.code] = Math.max(scores[t.code] || 0, overlap(shape, t.mask));
  return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}
// Same rule as the Swift helper: text recognition wins unless the shape clearly disagrees;
// without text the shape alone needs a clear match.
function decideRank(shape, text) {
  const ranked = rankScores(shape);
  const [topCode, topScore] = ranked[0] || [];
  const second = ranked[1]?.[1] || 0;
  const tokens = text ? rankTokens(text) : [];
  if (tokens.length === 1) {
    const v = tokens[0];
    const vScore = ranked.find((r) => r[0] === v)?.[1] || 0;
    if (topCode !== v && topScore > 0.78 && vScore < topScore - 0.15) return null;
    return [v, 0.95];
  }
  if (topScore >= 0.6 && topScore - second >= 0.05) return [topCode, topScore];
  return null;
}

/**
 * img: { width, height, data } with 4 bytes per pixel. order: 'rgba' or 'bgra'.
 * ocr (optional): async (glyphs: { width, height, data: Uint8Array grayscale }[]) => string[]
 * Returns cards like the Swift helper: fractions of the frame plus their card area.
 */
async function detectCards(img, { order = 'rgba', ocr } = {}) {
  const px = pixels(img, order);
  const W = px.w,
    H = px.h;
  const step = Math.max(1, Math.floor(W / 1400));
  const { boxes: blobs } = components(px, 0, 0, W - 1, H - 1, step, (x, y) => px.face(x, y));
  const pending = [];
  let group = 0;
  for (const blob of blobs) {
    const bx = blob.x0 * step,
      by = blob.y0 * step,
      bw = blob.w * step,
      bh = blob.h * step;
    const fill = blob.count / (blob.w * blob.h);
    const aspect = bh / Math.max(1, bw);
    if (
      bh < 0.025 * H ||
      bh > 0.42 * H ||
      bw < 0.008 * W ||
      aspect < 0.3 ||
      aspect > 3.6 ||
      fill < 0.3
    )
      continue;
    const top = Math.floor(bh * 0.55);
    const {
      boxes: inks,
      labels,
      gw,
    } = components(px, bx, by, bx + bw - 1, by + top, 1, (x, y) => px.ink(x, y));
    const minH = Math.floor(bh * 0.07),
      maxH = Math.floor(bh * 0.36);
    const glyphs = inks
      .map((k, i) => [i, k])
      .filter(
        ([, k]) =>
          k.h >= minH &&
          k.h <= maxH &&
          k.w <= maxH * 2 &&
          k.count >= 10 &&
          k.x0 > 0 &&
          k.x1 < gw - 1,
      )
      .sort((a, b) => a[1].x0 - b[1].x0);
    // Join side-by-side parts of one rank such as "1" and "0".
    const merged = [];
    for (const [i, k] of glyphs) {
      const j = merged.findLastIndex(
        ([b]) =>
          Math.abs(b.y0 - k.y0) < Math.max(3, k.h / 5) &&
          Math.abs(b.h - k.h) < Math.max(3, k.h / 4) &&
          k.x0 - b.x1 < Math.max(3, (k.h * 2) / 5) &&
          k.x0 > b.x0,
      );
      if (j >= 0) {
        const b = { ...merged[j][0] };
        b.x0 = Math.min(b.x0, k.x0);
        b.x1 = Math.max(b.x1, k.x1);
        b.y0 = Math.min(b.y0, k.y0);
        b.y1 = Math.max(b.y1, k.y1);
        b.w = b.x1 - b.x0 + 1;
        b.h = b.y1 - b.y0 + 1;
        b.count += k.count;
        merged[j] = [b, [...merged[j][1], i]];
      } else merged.push([{ ...k }, [i]]);
    }
    const found = [];
    for (const [rankBox, parts] of merged) {
      const h = rankBox.h;
      if (aspect >= 1.15 && (rankBox.x0 + rankBox.x1) / 2 > bw * 0.5) continue;
      let best = null;
      inks.forEach((k, j) => {
        if (parts.includes(j)) return;
        if (
          k.h < Math.max(3, (h * 3) / 10) ||
          k.h > (h * 17) / 10 ||
          k.w < Math.max(3, (h * 3) / 10) ||
          k.w > h * 2 ||
          k.count < 8
        )
          return;
        const below =
          k.y0 >= rankBox.y1 - h / 6 &&
          k.y0 - rankBox.y1 <= (h * 7) / 10 &&
          Math.abs((k.x0 + k.x1) / 2 - (rankBox.x0 + rankBox.x1) / 2) <=
            Math.max((h * 6) / 10, rankBox.w / 2);
        const beside =
          k.x0 >= rankBox.x1 - h / 8 &&
          k.x0 - rankBox.x1 <= (h * 6) / 10 &&
          k.y0 < rankBox.y1 &&
          k.y1 > rankBox.y0;
        if (!below && !beside) return;
        const gap = below ? k.y0 - rankBox.y1 : k.x0 - rankBox.x1;
        if (!best || gap < best.gap) best = { j, k, gap };
      });
      if (!best) continue;
      const suit = classifySuit(px, best.k, labels, gw, best.j, bx, by);
      if (!suit) continue;
      const ids = new Set(parts);
      const inRank = (x, y) => ids.has(labels[(rankBox.y0 + y) * gw + rankBox.x0 + x]);
      pending.push({
        group,
        suit,
        shape: normalise(inRank, rankBox.w, rankBox.h),
        glyph: glyphImage(inRank, rankBox.w, rankBox.h),
        rect: { x: bx + rankBox.x0, y: by + rankBox.y0, w: rankBox.w, h: rankBox.h },
        area: { x: bx, y: by, w: bw, h: bh },
        found,
      });
    }
    group++;
  }
  let texts = [];
  if (ocr && pending.length)
    try {
      texts = await ocr(pending.map((p) => p.glyph));
    } catch {
      texts = [];
    }
  const cards = [];
  const groups = new Map();
  pending.forEach((p, i) => {
    const rank = decideRank(p.shape, texts[i]);
    if (!rank) return;
    const list = groups.get(p.group) || [];
    if (list.some((c) => c.rank === rank[0] && c.suit === p.suit[0])) return;
    list.push({
      rank: rank[0],
      suit: p.suit[0],
      confidence: rank[1] * Math.min(1, p.suit[1] + 0.25),
      x: p.rect.x / W,
      y: p.rect.y / H,
      width: p.rect.w / W,
      height: p.rect.h / H,
      group: p.group,
      gx: p.area.x / W,
      gy: p.area.y / H,
      gw: p.area.w / W,
      gh: p.area.h / H,
    });
    groups.set(p.group, list);
  });
  // Renumber groups that produced cards, keeping order, like the Swift helper.
  let next = 0;
  for (const list of groups.values()) {
    const g = next++;
    for (const c of list.sort((a, b) => a.x - b.x)) cards.push({ ...c, group: g });
  }
  return cards;
}
// A clean, enlarged black-on-white copy of a rank shape for text recognition.
function glyphImage(inside, w, h) {
  const scale = Math.max(1, Math.floor(110 / Math.max(1, h))),
    pad = 30;
  const cw = w * scale + pad * 2,
    ch = h * scale + pad * 2;
  const data = new Uint8Array(cw * ch).fill(255);
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++)
      if (inside(Math.floor(x / scale), Math.floor(y / scale))) data[(y + pad) * cw + x + pad] = 0;
  return { width: cw, height: ch, data };
}

module.exports = { detectCards, decideRank, rankTokens, topRatio };
