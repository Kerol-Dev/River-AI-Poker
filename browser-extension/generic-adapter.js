/* Any-site reader. Visible DOM only: rendered text, labels, image names and class names.
 * No page runtime access, network interception or betting actions. Bet365 keeps its own adapter. */
(() => {
  // Bet365 frames always use the dedicated adapter, which automatic play depends on.
  if (globalThis.RiverReader || location.hostname === 'update-com.p365play.com') return;
  const SUITS = {
    '♠': 's',
    '♤': 's',
    '♥': 'h',
    '♡': 'h',
    '♦': 'd',
    '♢': 'd',
    '♣': 'c',
    '♧': 'c',
    s: 's',
    h: 'h',
    d: 'd',
    c: 'c',
    spade: 's',
    spades: 's',
    heart: 'h',
    hearts: 'h',
    diamond: 'd',
    diamonds: 'd',
    club: 'c',
    clubs: 'c',
  };
  const RANKS = {
    a: 'A',
    ace: 'A',
    1: 'A',
    14: 'A',
    k: 'K',
    king: 'K',
    13: 'K',
    q: 'Q',
    queen: 'Q',
    12: 'Q',
    j: 'J',
    jack: 'J',
    11: 'J',
    t: 'T',
    10: 'T',
    ten: 'T',
    9: '9',
    nine: '9',
    8: '8',
    eight: '8',
    7: '7',
    seven: '7',
    6: '6',
    six: '6',
    5: '5',
    five: '5',
    4: '4',
    four: '4',
    3: '3',
    three: '3',
    2: '2',
    two: '2',
    deuce: '2',
  };
  const RANK_WORD = 'ace|king|queen|jack|ten|nine|eight|seven|six|five|four|three|two|deuce';
  const SUIT_WORD = 'spades?|hearts?|diamonds?|clubs?';
  const SYMBOL = '♠♤♥♡♦♢♣♧';
  const card = (rank, suit) => {
    const r = RANKS[String(rank).toLowerCase()],
      s = SUITS[String(suit).toLowerCase()];
    return r && s ? r + s : null;
  };
  const clean = (value) =>
    String(value || '')
      .replace(/[︎️]/g, '')
      .trim()
      .toLowerCase();

  // A complete visible label such as "A♠", "10 ♣", "Ace of spades" or "K s".
  function cardFromLabel(value) {
    const v = clean(value).replace(/\s+/g, ' ');
    if (!v || v.length > 24) return null;
    let m = new RegExp(`^(10|[2-9tjqka])\\s?([${SYMBOL}])$`).exec(v);
    if (m) return card(m[1], m[2]);
    m = new RegExp(`^([${SYMBOL}])\\s?(10|[2-9tjqka])$`).exec(v);
    if (m) return card(m[2], m[1]);
    m = new RegExp(`^(${RANK_WORD}|10|[2-9]|[akqjt])\\s?(?:of\\s)?(${SUIT_WORD})$`).exec(v);
    if (m) return card(m[1], m[2].replace(/s$/, '') + 's');
    return null;
  }
  // Image file names, data values and class tokens: "As.png", "ace_of_spades", "card-10h",
  // "spades-13", "s12", "h10.svg", "2C".
  function cardFromToken(value) {
    let v = clean(value);
    if (!v || v.length > 120) return null;
    v = v
      .split(/[?#]/)[0]
      .split('/')
      .pop()
      .replace(/\.(?:png|svg|jpe?g|webp|gif|avif)$/, '');
    v = v.replace(
      /^(?:cards?|deck|playing|face|img|image|icon|sprite|big|small|mini|large|c)[-_ ]+/g,
      '',
    );
    if (!v || v.length > 40) return null;
    const sep = '[-_ .]?';
    let m = new RegExp(`^(10|[2-9tjqka])${sep}([shdc${SYMBOL}])$`).exec(v);
    if (m) return card(m[1], m[2]);
    m = new RegExp(`^([shdc${SYMBOL}])${sep}(1[0-4]|[1-9]|[tjqka])$`).exec(v);
    if (m) return card(m[2], m[1]);
    m = new RegExp(
      `(?:^|[-_ ])(${RANK_WORD}|1[0-4]|[1-9]|[akqjt])[-_ ]?(?:of[-_ ]?)?(${SUIT_WORD})(?:$|[-_ ])`,
    ).exec(v);
    if (m) return card(m[1], m[2].replace(/s$/, '') + 's');
    m = new RegExp(
      `(?:^|[-_ ])(${SUIT_WORD})[-_ ]?(${RANK_WORD}|1[0-4]|[1-9]|[akqjt])(?:$|[-_ ])`,
    ).exec(v);
    if (m) return card(m[2], m[1].replace(/s$/, '') + 's');
    return null;
  }
  const isBackToken = (value) =>
    /(?:^|[-_ /])(?:card)?[-_]?(?:back|backs|reverse|facedown|face-down|hidden-card|cardback)(?:$|[-_ .])/i.test(
      String(value || ''),
    );
  function rankOnly(value) {
    const v = clean(value);
    return /^(10|[2-9tjqka])$/.test(v) ? RANKS[v] : null;
  }
  function suitFromTokens(values) {
    for (const raw of values) {
      const v = clean(raw);
      if (!v) continue;
      if (v.length <= 2 && SUITS[v.replace(/\s/g, '')] && /[^\w]/.test(v))
        return SUITS[v.replace(/\s/g, '')];
      const m = new RegExp(`(?:^|[-_ /])(?:suit[-_]?)?(${SUIT_WORD})(?:$|[-_ .])`).exec(v);
      if (m) return SUITS[m[1]];
      const short = /(?:^|[-_ ])suit[-_]?([shdc])(?:$|[-_ ])/.exec(v);
      if (short) return short[1];
    }
    return null;
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    if (typeof el.checkVisibility === 'function')
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const s = node.ownerDocument.defaultView.getComputedStyle(node);
      const hidden =
        s.display === 'none' ||
        s.visibility === 'hidden' ||
        s.visibility === 'collapse' ||
        s.opacity === '0' ||
        node.getAttribute('aria-hidden') === 'true';
      if (hidden) return false;
    }
    return true;
  }
  function text(el) {
    if (!el || !visible(el)) return '';
    const walk = el.ownerDocument.createTreeWalker(el, 4);
    const output = [];
    let n;
    while ((n = walk.nextNode()))
      if (n.textContent.trim() && visible(n.parentElement)) output.push(n.textContent.trim());
    return output.join(' ').replace(/\s+/g, ' ').trim();
  }
  // Currency is optional so play-money tables work. Ambiguous strings return null.
  function money(value) {
    const v = String(value || '').replace(/ /g, ' ');
    const re =
      /([€£$¥₹])?\s*((?:\d{1,3}(?:[,.' ]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*([kmb])?(?![\d.,]*\d)\s*(€|eur|usd|gbp)?/gi;
    const found = [];
    for (const m of v.matchAll(re)) {
      let digits = m[2];
      if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(digits))
        digits = digits.replace(/\./g, '').replace(',', '.');
      else if (/^\d+,\d{1,2}$/.test(digits)) digits = digits.replace(',', '.');
      else digits = digits.replace(/[,' ]/g, '');
      let n = Number(digits);
      if (!Number.isFinite(n)) continue;
      const scale = { k: 1e3, m: 1e6, b: 1e9 }[(m[3] || '').toLowerCase()] || 1;
      n = Math.round(n * scale * 100) / 100;
      const currency = m[1] || (/(€|eur)/i.test(m[4] || '') ? '€' : '');
      found.push({ currency, value: n });
    }
    const unique = [...new Map(found.map((f) => [`${f.currency}:${f.value}`, f])).values()];
    return unique.length === 1 && unique[0].value <= 1e9 ? unique[0] : null;
  }
  function actionKind(label) {
    const v = String(label || '').trim();
    if (/[/\\]|\bany\b|\bauto\b|\bin turn\b/i.test(v)) return null;
    if (/^(?:fold\s*){1,2}$/i.test(v)) return 'fold';
    if (/^(?:check\s*){1,2}$/i.test(v)) return 'check';
    // "Call", "Call 2.50", "Raise to €24" — never "Call us" or "Bet history".
    return (
      /^(call|bet|raise)(?:\s*(?:to)?\s*[€£$]?\s*[\d.,' ]*\d[kmb]?\s*(?:€|eur|usd|gbp)?)?$/i
        .exec(v.replace(/\s+/g, ' '))?.[1]
        .toLowerCase() || null
    );
  }
  const isAllIn = (label) => /^all[\s-]*in\b/i.test(String(label || '').trim());
  function actionForButton(button) {
    return actionKind(text(button));
  }

  function* elements(root) {
    for (const el of root.querySelectorAll('*')) {
      yield el;
      if (el.shadowRoot) yield* elements(el.shadowRoot);
    }
  }
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  };
  // Typed tokens: labels are read as words, files and data values as names, and class or
  // id tokens only when they carry card context, so classes such as "h1" or "js" never match.
  function tokensOf(el) {
    const out = [];
    for (const name of ['aria-label', 'title', 'alt'])
      if (el.hasAttribute?.(name)) out.push({ type: 'label', value: el.getAttribute(name) });
    for (const name of ['data-card', 'data-value', 'data-name', 'data-testid'])
      if (el.hasAttribute?.(name)) out.push({ type: 'name', value: el.getAttribute(name) });
    const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal || '';
    for (const value of [...cls.split(/\s+/), el.id || ''])
      if (value) out.push({ type: 'class', value });
    const src =
      el.getAttribute?.('src') || el.getAttribute?.('href') || el.getAttribute?.('xlink:href');
    if (src && !src.startsWith('data:')) out.push({ type: 'file', value: src });
    const inline = el.getAttribute?.('style') || '';
    for (const m of inline.matchAll(/url\(["']?([^"')]+)["']?\)/g))
      if (!m[1].startsWith('data:')) out.push({ type: 'file', value: m[1] });
    return out;
  }
  function cardFromTyped(t) {
    if (t.type === 'label')
      return cardFromLabel(t.value) || cardFromLabel(t.value.replace(/^\s*card\s*:?\s*/i, ''));
    if (t.type === 'class') {
      const v = clean(t.value);
      if (
        !/(?:^|[-_])(?:card|rank|suit|of|spades?|hearts?|diamonds?|clubs?)(?:$|[-_])|^(?:card|c)[-_]/.test(
          v,
        )
      )
        return null;
      if (
        /^(?:card|c)[-_]?(?:back|wrapper|container|holder|image|img|area|deck|group|list|slot|face|front)/.test(
          v,
        )
      )
        return null;
    }
    return cardFromLabel(t.value) || cardFromToken(t.value);
  }
  function backgroundTokens(el) {
    const bg = el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage || '';
    return [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
      .map((m) => m[1])
      .filter((u) => !u.startsWith('data:'));
  }
  // Returns a card code, 'back', or null for one element.
  function readElement(el) {
    if (el.id === 'river-table-mapper') return null;
    const own = el.childElementCount <= 4 ? (el.textContent || '').trim() : '';
    if (own && own.length <= 24) {
      const fromLabel = cardFromLabel(own);
      if (fromLabel) return fromLabel;
    }
    const tokens = tokensOf(el);
    for (const t of tokens) {
      const c = cardFromTyped(t);
      if (c) return c;
    }
    const values = tokens.map((t) => t.value);
    // Separate rank and suit classes: "card rank-q suit-hearts", "card r-10 s-c".
    const classes = tokens.filter((t) => t.type === 'class').map((t) => clean(t.value));
    const rankClass = classes
      .map((v) => /^(?:rank|r|value|v)[-_]?(10|[2-9tjqka]|ace|king|queen|jack|ten)$/.exec(v)?.[1])
      .find(Boolean);
    if (rankClass) {
      const suitClass =
        suitFromTokens(classes) ||
        classes.map((v) => /^(?:suit|s)[-_]([shdc])$/.exec(v)?.[1]).find(Boolean);
      if (suitClass) return card(rankClass, suitClass);
    }
    if (el.childElementCount === 0 && !own) {
      const bg = backgroundTokens(el);
      for (const t of bg) {
        const c = cardFromToken(t);
        if (c) return c;
      }
      if ([...bg, ...values].some(isBackToken)) return 'back';
    }
    if (values.some(isBackToken) && el.childElementCount <= 2 && !own) return 'back';
    // Rank as text with the suit in a class, label or image of the element or its children.
    const rank = rankOnly(own.replace(/\s+/g, ' ').split(' ')[0]);
    if (rank && own.length <= 4) {
      const suitTokens = [...values];
      for (const child of el.querySelectorAll('*'))
        suitTokens.push(
          ...tokensOf(child).map((t) => t.value),
          child.childElementCount ? '' : child.textContent,
        );
      if (el.parentElement && el.parentElement.childElementCount <= 3)
        suitTokens.push(...tokensOf(el.parentElement).map((t) => t.value));
      const suit = suitFromTokens(suitTokens);
      if (suit) return rank + suit;
    }
    return null;
  }

  let cache = { at: 0, doc: null, value: null };
  function scan(doc) {
    const now = Date.now();
    if (cache.doc === doc && now - cache.at < 120) return cache.value;
    const found = [],
      buttons = [],
      pots = [],
      hands = [],
      blanks = [],
      canvases = [];
    for (const el of elements(doc)) {
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      if (tag === 'CANVAS') {
        canvases.push(el);
        continue;
      }
      const reading = readElement(el);
      if (reading) found.push({ el, reading });
      else if (tag === 'IMG' || (el.childElementCount === 0 && !(el.textContent || '').trim()))
        blanks.push(el);
      const own =
        el.childElementCount <= 6 ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (own && own.length <= 40) {
        if (actionKind(own) || isAllIn(own)) buttons.push(el);
        if (/\bpot\b/i.test(own) && /\d/.test(own)) pots.push(el);
        if (/\b(?:hand|game|deal)\s*(?:id|no\.?|number|#)\s*[:#]?\s*#?\s*[A-Z0-9-]{4,}/i.test(own))
          hands.push(el);
      }
    }
    // Keep the innermost element for each card; drop wrappers that repeat a child's card.
    const cards = [];
    for (const f of found.sort((a, b) => depth(b.el) - depth(a.el))) {
      if (cards.some((k) => f.el.contains(k.el))) continue;
      if (!visible(f.el)) continue;
      const b = box(f.el);
      if (b.w < 6 || b.h < 8) continue;
      cards.push({ ...f, box: cardBox(f.el, b) });
    }
    cards.push(...unlabeledBacks(blanks, cards));
    const value = {
      cards,
      buttons: dedupeButtons(buttons),
      pots: pots
        .filter(visible)
        .filter((p) => !pots.some((q) => q !== p && p.contains(q) && visible(q))),
      hands: hands.filter(visible),
      canvases: canvases.filter(visible).filter((c) => {
        const b = box(c);
        return b.w * b.h > 0.25 * innerWidth * innerHeight;
      }),
    };
    cache = { at: now, doc, value };
    return value;
  }
  // Face-down cards often have no telling name. Matching card-shaped images or patterned
  // blocks without text, side by side in pairs, are treated as an opponent's hidden hand.
  function unlabeledBacks(blanks, cards) {
    const shaped = [];
    for (const el of blanks) {
      const b = box(el);
      const ratio = b.h / Math.max(1, b.w);
      if (b.h < 14 || b.h > 180 || ratio < 1.2 || ratio > 1.8) continue;
      if (cards.some((c) => c.el.contains(el) || el.contains(c.el))) continue;
      if (el.tagName !== 'IMG') {
        const st = el.ownerDocument.defaultView.getComputedStyle(el);
        const solid =
          /rgba?\(/.test(st.backgroundColor) &&
          !/rgba\([^)]*,\s*0(?:\.\d+)?\)/.test(st.backgroundColor);
        if (st.backgroundImage === 'none' && !solid) continue;
      }
      if (!visible(el)) continue;
      shaped.push({ el, reading: 'back', box: b, inferred: true });
    }
    const near = (a, b) =>
      insideOne(a.box, {
        x: b.box.x - b.box.w,
        y: b.box.y - b.box.h,
        w: b.box.w * 3,
        h: b.box.h * 3,
      });
    return clusters(shaped)
      .filter((g) => g.cards.length >= 2 && g.cards.length <= 4)
      .filter(
        (g) =>
          Math.max(...g.cards.map((c) => c.box.h)) / Math.min(...g.cards.map((c) => c.box.h)) <
          1.15,
      )
      .filter((g) => !cards.some((c) => g.cards.some((k) => near(k, c))))
      .flatMap((g) => g.cards);
  }
  function depth(el) {
    let d = 0;
    for (let n = el; n; n = n.parentNode || n.host) d++;
    return d;
  }
  // Rank or suit labels can be tiny. Use the nearest card-shaped ancestor for geometry.
  function cardBox(el, b) {
    let best = b;
    for (let n = el.parentElement, i = 0; n && i < 3; n = n.parentElement, i++) {
      const p = box(n);
      if (p.w > b.w * 4 || p.h > b.h * 4) break;
      if (p.h / p.w >= 1.1 && p.h / p.w <= 2 && p.w >= b.w && p.h >= b.h) {
        if (n.querySelectorAll('*').length > 30) break;
        best = p;
      }
    }
    return best;
  }
  function dedupeButtons(list) {
    const out = [];
    for (const el of list) {
      const target = el.closest('button,[role="button"],a,input,label') || el;
      if (
        target.matches('label') ||
        target.querySelector?.('input[type="checkbox"],input[type="radio"]')
      )
        continue;
      if (target.closest('[class*="pre-action" i],[class*="preaction" i],[class*="advance" i]'))
        continue;
      if (!visible(target)) continue;
      if (
        target.disabled ||
        target.getAttribute('aria-disabled') === 'true' ||
        /(?:^|\s)disabled(?:$|\s)/i.test(target.className?.baseVal ?? target.className ?? '')
      )
        continue;
      if (!out.includes(target)) out.push(target);
    }
    return out.filter((b) => !out.some((o) => o !== b && b.contains(o)));
  }

  // Cards in one row with similar sizes belong to one group (hand, board or a seat).
  function clusters(list) {
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].box,
          b = list[j].box,
          h = Math.max(a.h, b.h),
          w = Math.max(a.w, b.w);
        const sameSize = Math.min(a.h, b.h) / h > 0.6;
        const sameRow = Math.abs(a.cy - b.cy) < 0.6 * h;
        const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
        if (sameSize && sameRow && gap < 1.2 * w) parent[find(i)] = find(j);
      }
    const groups = new Map();
    list.forEach((c, i) => {
      const k = find(i);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    });
    return [...groups.values()].map((g) => {
      g.sort((a, b) => a.box.x - b.box.x);
      const x = Math.min(...g.map((c) => c.box.x)),
        y = Math.min(...g.map((c) => c.box.y)),
        r = Math.max(...g.map((c) => c.box.x + c.box.w)),
        btm = Math.max(...g.map((c) => c.box.y + c.box.h));
      return {
        cards: g,
        faces: g.filter((c) => c.reading !== 'back').map((c) => c.reading),
        backs: g.filter((c) => c.reading === 'back').length,
        box: { x, y, w: r - x, h: btm - y, cx: (x + r) / 2, cy: (y + btm) / 2 },
        size: Math.max(...g.map((c) => c.box.h)),
      };
    });
  }
  const insideOne = (b, r, pad = 0) =>
    b.cx >= r.x - pad && b.cx <= r.x + r.w + pad && b.cy >= r.y - pad && b.cy <= r.y + r.h + pad;
  // A pin is either one rectangle or a list (the mapped element plus its saved position).
  const inside = (b, r, pad = 0) =>
    Array.isArray(r) ? r.some((v) => insideOne(b, v, pad)) : insideOne(b, r, pad);
  function pinned(doc, mapping, id) {
    const m = mapping.find((v) => v.id === id);
    if (!m) return null;
    const rects = [];
    const el = resolve(doc, m.selector);
    if (el && visible(el)) rects.push(box(el));
    if (m.box && innerWidth > 0)
      rects.push({
        x: m.box.x * innerWidth,
        y: m.box.y * innerHeight,
        w: m.box.w * innerWidth,
        h: m.box.h * innerHeight,
      });
    return rects.length ? rects : null;
  }
  function layout(doc, mapping = []) {
    const s = scan(doc);
    const groups = clusters(s.cards);
    const vw = innerWidth || 1000,
      vh = innerHeight || 700;
    const center = { x: vw / 2, y: vh / 2 };
    const buttonsBox = s.buttons.length ? s.buttons.map(box) : null;
    const boardPin = pinned(doc, mapping, 'board'),
      heroPin = pinned(doc, mapping, 'hero');
    const faceGroups = groups.filter((g) => g.faces.length);
    let board = null;
    const boardChoices = faceGroups.filter((g) =>
      boardPin
        ? inside(g.box, boardPin, g.size)
        : g.faces.length >= 3 && g.faces.length + g.backs <= 5,
    );
    if (boardChoices.length)
      board = boardChoices.sort(
        (a, b) =>
          Math.hypot(a.box.cx - center.x, a.box.cy - center.y) -
          Math.hypot(b.box.cx - center.x, b.box.cy - center.y),
      )[0];
    const heroChoices = faceGroups.filter(
      (g) => g !== board && (heroPin ? inside(g.box, heroPin, g.size) : g.faces.length === 2),
    );
    const score = (g) => {
      if (heroPin)
        return -Math.min(
          ...heroPin.map((p) => Math.hypot(g.box.cx - (p.x + p.w / 2), g.box.cy - (p.y + p.h / 2))),
        );
      let v = g.box.cy / vh + (g.size / vh) * 2;
      if (buttonsBox) {
        const near = Math.min(
          ...buttonsBox.map((b) => Math.hypot(b.cx - g.box.cx, b.cy - g.box.cy)),
        );
        v -= near / Math.hypot(vw, vh);
      }
      return v;
    };
    const hero = heroChoices.sort((a, b) => score(b) - score(a))[0] || null;
    const others = groups.filter((g) => g !== hero && g !== board);
    return { scan: s, groups, board, hero, others };
  }

  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    const esc = (v) => (globalThis.CSS?.escape ? CSS.escape(v) : v.replace(/[^\w-]/g, '\\$&'));
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n.tagName !== 'HTML'; n = n.parentElement) {
      if (
        n.id &&
        !/\d{4,}/.test(n.id) &&
        n.ownerDocument.querySelectorAll('#' + esc(n.id)).length === 1
      ) {
        parts.unshift('#' + esc(n.id));
        break;
      }
      const tag = n.tagName.toLowerCase();
      const same = n.parentElement
        ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName)
        : [];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
      if (tag === 'body') break;
    }
    return parts.join(' > ');
  }
  function commonAncestor(list) {
    if (!list.length) return null;
    let node = list[0];
    while (node && !list.every((el) => node.contains(el))) node = node.parentElement;
    return node;
  }
  function fraction(b) {
    const vw = innerWidth || 1,
      vh = innerHeight || 1;
    return { x: b.x / vw, y: b.y / vh, w: b.w / vw, h: b.h / vh };
  }
  function table(doc) {
    const s = scan(doc);
    return s.cards.length || s.buttons.length || s.pots.length ? doc.body : null;
  }
  // Automatic map. Each marker also keeps its relative position so it survives re-rendering.
  function defaults() {
    const doc = document;
    const l = layout(doc);
    const list = [];
    const add = (id, kind, label, els, b) => {
      const el = els.length === 1 ? els[0] : commonAncestor(els);
      list.push({
        id,
        kind,
        label,
        selector: el ? selectorFor(el) : '',
        box: b ? fraction(b) : null,
      });
    };
    if (l.hero)
      add(
        'hero',
        'hero',
        'My hand',
        l.hero.cards.map((c) => c.el),
        l.hero.box,
      );
    else list.push({ id: 'hero', kind: 'hero', label: 'My hand', selector: '', box: null });
    if (l.board)
      add(
        'board',
        'board',
        'Flop · turn · river',
        l.board.cards.map((c) => c.el),
        l.board.box,
      );
    else
      list.push({
        id: 'board',
        kind: 'board',
        label: 'Flop · turn · river',
        selector: '',
        box: null,
      });
    const pot = bestPot(l.scan.pots);
    list.push({
      id: 'pot',
      kind: 'pot',
      label: 'Total pot',
      selector: pot ? selectorFor(pot.el) : '',
      box: pot ? fraction(box(pot.el)) : null,
    });
    const buttons = l.scan.buttons;
    if (buttons.length) add('actions', 'actions', 'My action buttons', buttons, null);
    else
      list.push({
        id: 'actions',
        kind: 'actions',
        label: 'My action buttons',
        selector: '',
        box: null,
      });
    return list;
  }
  // Fill markers that were empty at first detection (for example, mapped between hands).
  function refine(mapping) {
    if (!mapping.some((m) => !m.selector && !m.box)) return null;
    const fresh = defaults();
    let changed = false;
    const next = mapping.map((m) => {
      if (m.selector || m.box) return m;
      const f = fresh.find((v) => v.id === m.id);
      if (f && (f.selector || f.box)) {
        changed = true;
        return f;
      }
      return m;
    });
    return changed ? next : null;
  }
  function bestPot(pots) {
    const read = pots
      .map((el) => ({
        el,
        label: text(el),
        amount: money(text(el).replace(/^.*?\bpot\b/i, '')) || money(text(el)),
      }))
      .filter((p) => p.amount && /\bpot\b/i.test(p.label));
    if (!read.length) return null;
    const total = read.filter((p) => /\btotal\b/i.test(p.label));
    const choices = total.length ? total : read;
    return choices.sort((a, b) => b.amount.value - a.amount.value)[0];
  }
  function resolve(doc, selector) {
    if (typeof selector !== 'string' || !selector || selector.length > 800) return null;
    try {
      const nodes = [...doc.querySelectorAll(selector)];
      return nodes.find(visible) || (nodes.length === 1 ? nodes[0] : null);
    } catch {
      return null;
    }
  }
  function decisionKey(s) {
    return JSON.stringify({
      handId: s.handId,
      hole: s.hole,
      board: s.board,
      pot: s.pot,
      call: s.call,
      currency: s.currency,
      heroBet: s.heroBet,
      opponents: s.opponents,
      heroTurn: s.heroTurn,
      actions: s.actions,
      seats: s.seats.map((p) => ({ id: p.id, hero: p.hero, stack: p.stack, inHand: p.inHand })),
      errors: s.errors,
      mapping: s.mapping,
    });
  }

  // Sites without a hand number get a local id that changes when a new deal appears.
  let hand = { id: '', hole: '', board: 0, count: 0, emptySince: 0 };
  function handIdFor(found, hole, board, now = Date.now()) {
    if (found) return found;
    const holeKey = hole.join('');
    if (!holeKey) {
      if (!hand.emptySince) hand.emptySince = now;
      if (now - hand.emptySince > 2000) hand.hole = '';
      return '';
    }
    hand.emptySince = 0;
    if (holeKey !== hand.hole || board.length < hand.board) {
      hand.count++;
      hand = {
        ...hand,
        id: `auto-${now.toString(36)}-${hand.count}`,
        hole: holeKey,
        board: board.length,
      };
    } else hand.board = board.length;
    return hand.id;
  }
  const settings = { opponents: 1 };

  function read(doc, mapping = []) {
    const snapshot = {
      version: 1,
      source: 'web:' + (location.hostname || 'local'),
      handId: '',
      hole: [],
      board: [],
      pot: null,
      call: null,
      currency: '',
      heroBet: null,
      actionAmounts: {},
      actorSeat: null,
      timeLeft: null,
      sittingOut: false,
      sizing: { min: null, max: null, editable: false },
      opponents: 0,
      heroTurn: false,
      actions: [],
      seats: [],
      dealer: null,
      errors: [],
      mapping: { mapped: 0, total: mapping.length },
      detection: { cards: 0, opponentsDetected: false },
    };
    for (const marker of mapping)
      if (resolve(doc, marker.selector) || marker.box) snapshot.mapping.mapped++;
    const l = layout(doc, mapping);
    const s = l.scan;
    snapshot.detection.cards = s.cards.length;
    if (!s.cards.length && !s.buttons.length && !s.pots.length) {
      snapshot.errors.push(
        s.canvases.length
          ? 'This table is drawn as an image. Choose Screen reading in River for this site.'
          : 'No poker table found in this page yet.',
      );
    }
    if (l.hero) snapshot.hole = l.hero.faces.slice(0, 2);
    if (l.board) snapshot.board = l.board.faces.slice(0, 5);
    if (l.hero && l.hero.faces.length !== 2)
      snapshot.errors.push('Your hand is partly hidden. Waiting for the deal to finish.');
    if (l.board && l.board.backs)
      snapshot.errors.push('A community card is being revealed. Advice paused.');
    const all = [...snapshot.hole, ...snapshot.board];
    if (new Set(all).size !== all.length) {
      snapshot.errors.push('The same card was read twice. Check the My hand and board markers.');
      snapshot.hole = [];
      snapshot.board = [];
    }
    const pot = bestPot(
      s.pots.filter(
        (p) => !pinned(doc, mapping, 'pot') || inside(box(p), pinned(doc, mapping, 'pot'), 20),
      ),
    );
    if (pot) {
      snapshot.pot = pot.amount.value;
      snapshot.currency = pot.amount.currency;
    }
    const actionsPin = pinned(doc, mapping, 'actions');
    const buttons = s.buttons.filter((b) => !actionsPin || inside(box(b), actionsPin, 40));
    for (const button of buttons) {
      const label = text(button),
        kind = actionKind(label),
        amount = money(label);
      if (!kind) continue;
      snapshot.actions.push(kind);
      if (kind === 'check') snapshot.call = 0;
      if (kind === 'call' && amount) {
        snapshot.call = amount.value;
        if (!snapshot.currency) snapshot.currency = amount.currency;
      }
      if (['call', 'bet', 'raise'].includes(kind) && amount)
        snapshot.actionAmounts[kind] = amount.value;
    }
    snapshot.actions = [...new Set(snapshot.actions)];
    if (snapshot.actions.includes('call') && snapshot.call == null)
      snapshot.errors.push('The call amount is not shown on the Call button.');
    snapshot.heroTurn =
      snapshot.actions.includes('fold') &&
      snapshot.actions.some((a) => a === 'check' || a === 'call');
    const handText = s.hands
      .map(text)
      .map((t) => /([A-Z0-9-]{4,})\s*$/i.exec(t)?.[1])
      .filter(Boolean);
    snapshot.handId = handIdFor(
      new Set(handText).size === 1 ? handText[0] : '',
      snapshot.hole,
      snapshot.board,
    );
    // Face-down pairs away from your hand are opponents still holding cards.
    const seats = l.others.filter((g) => g.backs >= 1 && !g.faces.length);
    const detected = seats.length;
    snapshot.detection.opponentsDetected = detected > 0;
    snapshot.opponents = Math.min(5, detected || settings.opponents);
    snapshot.seats.push({
      id: 'hero',
      label: 'You',
      hero: true,
      inHand: snapshot.hole.length === 2,
      stack: null,
      username: null,
      bet: null,
      lastAction: null,
      shown: [],
    });
    for (let i = 0; i < snapshot.opponents; i++)
      snapshot.seats.push({
        id: `seat-${i + 1}`,
        label: `Opponent ${i + 1}`,
        hero: false,
        inHand: true,
        stack: null,
        username: null,
        bet: null,
        lastAction: null,
        shown: [],
      });
    snapshot.errors = [...new Set(snapshot.errors)].slice(0, 12);
    snapshot.key = decisionKey(snapshot);
    return snapshot;
  }
  function cards(container) {
    if (!container) throw new Error('A required card region is not mapped.');
    return scan(container.ownerDocument)
      .cards.filter((c) => container.contains(c.el) && c.reading !== 'back')
      .map((c) => c.reading);
  }
  globalThis.RiverReader = {
    generic: true,
    decisionKey,
    visible,
    text,
    money,
    actionKind,
    actionForButton,
    cards,
    table,
    defaults,
    refine,
    resolve,
    read,
    settings,
    layout,
    cardFromLabel,
    cardFromToken,
  };
})();
