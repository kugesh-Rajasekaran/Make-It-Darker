// Runs at document_start in every top-level page. Decides whether the page
// should be dark and flips the attributes that dark.css keys off.
(() => {
  const ON = 'data-dia-dark';
  const BG = 'data-dia-dark-bg';
  const DEFAULTS = { enabled: true, sites: {} };

  const root = document.documentElement;
  if (!root) return;
  const host = location.hostname;

  let settings = DEFAULTS;
  let pageIsDark = false;

  // Most pages are light. Start dark so there is no white flash while the
  // settings and the page's own styles load.
  root.setAttribute(ON, '');

  // A canvas resolves any CSS colour (rgb, hsl, oklch, named) to RGBA.
  const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  function read(color) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#0000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { light: (0.299 * r + 0.587 * g + 0.114 * b) / 255, alpha: a / 255 };
  }
  const background = (el) => read(getComputedStyle(el).backgroundColor);

  // Judge the background the user actually sees: walk up from the element in
  // the middle of the viewport to the first opaque background.
  function detectDark() {
    const x = innerWidth / 2;
    const y = innerHeight / 2;
    for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
      if (el === root && root.hasAttribute(BG)) break; // our white base, not the site's
      const bg = background(el);
      if (bg.alpha >= 0.5) return bg.light < 0.4;
    }
    // Nothing opaque: the page shows the browser canvas. Light default text
    // means the canvas is dark (color-scheme: dark).
    return read(getComputedStyle(document.body || root).color).light > 0.6;
  }

  function wanted() {
    if (!settings.enabled) return false;
    // Fullscreen content (usually video) sits outside the page filter. Show
    // it untouched instead of half-inverted.
    const fs = document.fullscreenElement;
    if (fs && fs !== root) return false;
    const mode = settings.sites[host];
    return mode === 'on' || (mode !== 'off' && !pageIsDark);
  }

  // Images with see-through areas (icons, glyphs, logos on transparency) sit
  // on the page's background, which the filter inverts. They must invert with
  // it or they vanish (a black icon on a now-black page). Only opaque images
  // such as photos keep their real colours. Small images only: that is where
  // icons live, and it bounds the work.
  const GLYPH = 'data-dia-dark-glyph';
  const ICON_MAX = 160;
  const checked = new WeakMap(); // img -> src it was last judged on
  const pending = new WeakSet(); // imgs waiting for their first load
  const verdicts = new Map(); // src -> Promise<boolean>
  const sample = new OffscreenCanvas(48, 48).getContext('2d', { willReadFrequently: true });

  // Same test as background.js: more than 30% of a 48x48 sample see-through.
  function measure(img) {
    sample.clearRect(0, 0, 48, 48);
    sample.drawImage(img, 0, 0, 48, 48);
    const data = sample.getImageData(0, 0, 48, 48).data; // throws for cross-origin images
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 26) clear++;
    return clear / (48 * 48) > 0.3;
  }

  function seeThrough(img, src) {
    if (!verdicts.has(src)) {
      let verdict;
      try {
        verdict = Promise.resolve(measure(img));
      } catch {
        // Cross-origin: ask the background worker. Wrapped so a stale tab
        // (extension reloaded under it) gets "no" instead of throwing.
        verdict = Promise.resolve()
          .then(() => chrome.runtime.sendMessage({ type: 'see-through', src }))
          .catch(() => false);
      }
      verdicts.set(src, verdict);
    }
    return verdicts.get(src);
  }

  function check(img) {
    const src = img.currentSrc || img.src;
    if (!src || checked.get(img) === src) return;
    if (/^data:image\/svg|\.svg([?#]|$)|\.jpe?g([?#]|$)/i.test(src)) return; // decided by CSS / never transparent
    if (!img.complete || !img.naturalWidth) {
      if (!pending.has(img)) {
        pending.add(img);
        img.addEventListener('load', () => (pending.delete(img), check(img)), { once: true });
      }
      return;
    }
    checked.set(img, src);
    const r = img.getBoundingClientRect();
    if (Math.max(r.width, r.height) > ICON_MAX) return;
    seeThrough(img, src).then((yes) => img.toggleAttribute(GLYPH, Boolean(yes)));
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'IMG') check(node);
    else for (const img of node.getElementsByTagName('img')) check(img);
  }

  // An iframe that is part of the site (an app shell that loads its pages in a
  // frame) must darken with the page. Restored like a video, it shows its
  // original colours, and where it is see-through the backdrop behind it is
  // now dark: dark text on dark. Same origin or most of the screen = the site;
  // anything else (videos, maps, ads) keeps its real colours.
  const FRAME = 'data-dia-dark-frame';
  const framesSeen = new WeakSet();
  function checkFrame(frame) {
    if (!framesSeen.has(frame)) {
      framesSeen.add(frame);
      frame.addEventListener('load', () => checkFrame(frame)); // it may navigate cross-origin
    }
    const r = frame.getBoundingClientRect();
    const sameSite = Boolean(frame.contentDocument); // null when cross-origin
    frame.toggleAttribute(FRAME, sameSite || r.width * r.height > 0.5 * innerWidth * innerHeight);
  }

  // Large areas the site already paints dark (brand bars, heroes, sidebars)
  // would flip to light. dark.css shows the ones marked here as designed.
  // Only opaque paint counts, so a see-through overlay is left alone and the
  // dialog on it still darkens. An area mostly covered by a light child (a
  // dark frame around a white app) is not kept, or the white would come back.
  const KEEP = 'data-dia-dark-keep';
  const COLOR = /(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b|transparent/gi;
  function tone(el) {
    const cs = getComputedStyle(el);
    const stops = cs.backgroundImage.includes('gradient') ? (cs.backgroundImage.match(COLOR) || []).map(read) : [];
    const paint = stops.length && stops.every((c) => c.alpha >= 0.9) ? stops : [read(cs.backgroundColor)];
    if (paint.some((c) => c.alpha < 0.9)) return null;
    if (paint.every((c) => c.light < 0.35)) return 'dark';
    return paint.every((c) => c.light > 0.6) ? 'light' : null;
  }

  function findDarkAreas() {
    const min = 0.04 * innerWidth * innerHeight;
    const dark = [];
    const light = [];
    for (const el of document.body?.getElementsByTagName('*') ?? []) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < min / 2 || Math.min(r.width, r.height) < 32) continue;
      const t = tone(el);
      if (t) (t === 'dark' ? dark : light).push({ el, area });
    }
    const keep = new Set(
      dark
        .filter((d) => d.area >= min && !light.some((l) => l.area > d.area / 2 && d.el.contains(l.el)))
        .map((d) => d.el),
    );
    for (const el of document.querySelectorAll(`[${KEEP}]`)) if (!keep.has(el)) el.removeAttribute(KEEP);
    for (const el of keep) el.setAttribute(KEEP, '');
    for (const frame of document.getElementsByTagName('iframe')) checkFrame(frame);
  }

  // Pages keep changing after load (single-page apps, carousels): look again,
  // at most twice a second.
  let areasTimer = 0;
  const scheduleAreas = () => {
    areasTimer ||= setTimeout(() => {
      areasTimer = 0;
      if (root.hasAttribute(ON)) findDarkAreas();
    }, 500);
  };
  addEventListener('resize', scheduleAreas);

  new MutationObserver((records) => {
    if (!root.hasAttribute(ON)) return;
    for (const r of records) {
      if (r.type === 'attributes') r.target.tagName === 'IMG' && check(r.target);
      else for (const n of r.addedNodes) scan(n);
    }
    scheduleAreas();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] });

  function apply() {
    const on = wanted();
    root.toggleAttribute(ON, on);
    const bodyClear = !document.body || background(document.body).alpha === 0;
    const rootClear = root.hasAttribute(BG) || background(root).alpha === 0;
    root.toggleAttribute(BG, on && bodyClear && rootClear);
    if (on) {
      scan(root);
      findDarkAreas();
    }
  }

  function refresh() {
    pageIsDark = detectDark();
    apply();
  }

  // The first frame runs just before first paint, once head stylesheets have
  // loaded, so a dark page is caught before it ever shows inverted.
  requestAnimationFrame(refresh);
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
  addEventListener('load', refresh, { once: true });
  document.addEventListener('fullscreenchange', apply);

  const load = () =>
    chrome.storage.local.get(DEFAULTS).then((s) => {
      settings = s;
      apply();
    });
  load();
  chrome.storage.onChanged.addListener((_, area) => area === 'local' && load());

  // Some frameworks rewrite <html> attributes on hydration. Put ours back.
  new MutationObserver(() => {
    if (root.hasAttribute(ON) !== wanted()) apply();
  }).observe(root, { attributes: true, attributeFilter: [ON] });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg === 'status') reply({ host, pageIsDark });
  });
})();
