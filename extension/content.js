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

  // OffscreenCanvas needs Safari 16.4 or later; older Safari gets a detached <canvas>.
  const canvas = (size) =>
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });

  // A canvas resolves any CSS colour (rgb, hsl, oklch, named) to RGBA.
  const ctx = canvas(1).getContext('2d', { willReadFrequently: true });
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
  const sample = canvas(48).getContext('2d', { willReadFrequently: true });

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

  new MutationObserver((records) => {
    if (!root.hasAttribute(ON)) return;
    for (const r of records) {
      if (r.type === 'attributes') r.target.tagName === 'IMG' && check(r.target);
      else for (const n of r.addedNodes) scan(n);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] });

  function apply() {
    const on = wanted();
    root.toggleAttribute(ON, on);
    const bodyClear = !document.body || background(document.body).alpha === 0;
    const rootClear = root.hasAttribute(BG) || background(root).alpha === 0;
    root.toggleAttribute(BG, on && bodyClear && rootClear);
    if (on) scan(root);
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
