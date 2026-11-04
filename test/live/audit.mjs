// Visibility audit: does dark mode hide anything that was visible before?
//
// For each step it screenshots the page with the extension switched off for
// the site, then with it back on (no reload, so the layout is identical), and
// compares contrast inside:
//   - every visible control (buttons, links, menu items, tabs, inputs...)
//   - every 24px tile of the viewport, to catch text and icons that aren't controls
// Something is "hidden" when it had clear contrast before and lost most of it after.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pngjs from 'pngjs';
import { EXT_ID, launchWithExtension } from '../browser.mjs';

const { PNG } = pngjs;

const VISIBLE = 60; // contrast (0-255 luminance) that counts as clearly visible
const KEEP = 0.45; // after must keep at least this share of the original contrast
const FLOOR = 35; // ...and never drop below this
const TILE = 24;

export async function launch({ headless = true } = {}) {
  const context = await launchWithExtension({
    headless,
    viewport: { width: 1440, height: 900 },
    // Headless Chrome announces itself in the user agent and many sites refuse it.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const control = await context.newPage();
  await control.goto(`chrome-extension://${EXT_ID}/popup.html`);
  const setSite = (host, mode) =>
    control.evaluate(
      async ([h, m]) => {
        const { sites = {} } = await chrome.storage.local.get('sites');
        if (m) sites[h] = m;
        else delete sites[h];
        await chrome.storage.local.set({ sites });
      },
      [host, mode],
    );
  return { context, setSite };
}

const isDark = (page) => page.evaluate(() => document.documentElement.hasAttribute('data-dia-dark'));

async function waitDark(page, want) {
  try {
    await page.waitForFunction((w) => document.documentElement.hasAttribute('data-dia-dark') === w, want, { timeout: 3000 });
  } catch {}
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(250);
}

// Every visible, unobstructed control in the viewport, with a readable label.
function collectControls() {
  const SEL = [
    'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    '[role=button]', '[role=link]', '[role=menuitem]', '[role=menuitemcheckbox]', '[role=menuitemradio]',
    '[role=tab]', '[role=checkbox]', '[role=radio]', '[role=switch]', '[role=option]', '[role=combobox]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    const box = [Math.max(0, r.left), Math.max(0, r.top), Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)].map(Math.round);
    if (box[2] - box[0] < 6 || box[3] - box[1] < 6) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const hit = document.elementFromPoint((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
    const key = box.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const text = (el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.getAttribute('alt') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 50);
    out.push({ label: text || `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}>`, role: el.getAttribute('role') || el.tagName.toLowerCase(), box });
  }
  return out;
}

// Images, video and other media the extension restores to their original
// colours. Their outline can blend into a dark page; their content must not.
function collectMedia() {
  const out = [];
  for (const el of document.querySelectorAll('img, video, iframe, embed, object, [style*="url("]')) {
    const r = el.getBoundingClientRect();
    const box = [Math.max(0, r.left), Math.max(0, r.top), Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)].map(Math.round);
    if (box[2] - box[0] < 8 || box[3] - box[1] < 8) continue;
    // Can't judge an image that is mostly scrolled out of view.
    if ((box[2] - box[0]) * (box[3] - box[1]) < 0.9 * r.width * r.height) continue;
    const label = (el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('src') || el.tagName).slice(0, 50);
    out.push({ label, role: el.tagName.toLowerCase(), box });
  }
  return out;
}

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// The middle 60% of an image: its content, without transparent margins.
const core = ([x0, y0, x1, y1]) => {
  const dx = Math.max(2, Math.round((x1 - x0) * 0.2));
  const dy = Math.max(2, Math.round((y1 - y0) * 0.2));
  return [x0 + dx, y0 + dy, x1 - dx, y1 - dy];
};

const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

// 99th-percentile distance from the box's median luminance: how much "ink"
// stands out from the background, robust to a few stray pixels.
function contrast(png, [x0, y0, x1, y1]) {
  const area = (x1 - x0) * (y1 - y0);
  const step = Math.max(1, Math.floor(Math.sqrt(area / 20000)));
  const v = [];
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) v.push(lum(png.data, (y * png.width + x) * 4));
  if (!v.length) return 0;
  const sorted = Float64Array.from(v).sort();
  const median = sorted[sorted.length >> 1];
  const dev = Float64Array.from(v, (l) => Math.abs(l - median)).sort();
  return dev[Math.floor(0.99 * (dev.length - 1))];
}

const lost = (before, after) => before >= VISIBLE && after < Math.max(FLOOR, before * KEEP);

function frame(png, [x0, y0, x1, y1], [r, g, b]) {
  for (let t = 0; t < 2; t++) {
    for (let x = x0; x < x1; x++) for (const y of [y0 + t, y1 - 1 - t]) paint(png, x, y, r, g, b);
    for (let y = y0; y < y1; y++) for (const x of [x0 + t, x1 - 1 - t]) paint(png, x, y, r, g, b);
  }
}
function paint(png, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
}

export async function audit(page, { setSite, outDir, name }) {
  const host = new URL(page.url()).hostname;
  await setSite(host, 'off');
  await waitDark(page, false);
  // Only judge elements that hold still: anything mid-animation would be
  // measured in the wrong place.
  const stable = async (collect) => {
    const first = await page.evaluate(collect);
    await page.waitForTimeout(300);
    const keys = new Set(first.map((e) => e.box.join(',')));
    return (await page.evaluate(collect)).filter((e) => keys.has(e.box.join(',')));
  };
  const controls = await stable(collectControls);
  const media = await stable(collectMedia);
  const before = PNG.sync.read(await page.screenshot());

  await setSite(host, null); // back to Auto, what a user gets by default
  await waitDark(page, true);
  const darkened = await isDark(page);
  const after = PNG.sync.read(await page.screenshot());

  // Media whose own content stayed visible: only its outline can blend in.
  // Media whose content vanished (a dark icon on a now-dark page) is a failure.
  const hiddenMedia = [];
  const intactMedia = [];
  for (const m of media) {
    const inner = core(m.box);
    if (inner[2] - inner[0] < 4 || inner[3] - inner[1] < 4) continue;
    const b = contrast(before, inner);
    const a = contrast(after, inner);
    if (lost(b, a)) hiddenMedia.push({ ...m, before: Math.round(b), after: Math.round(a) });
    else intactMedia.push(m);
  }
  const onlyMediaEdge = (box) =>
    media.some((m) => overlaps(m.box, box)) &&
    !hiddenMedia.some((m) => overlaps(m.box, box));

  const hiddenControls = [];
  const mediaEdges = [];
  for (const c of controls) {
    const b = contrast(before, c.box);
    const a = contrast(after, c.box);
    if (!lost(b, a)) continue;
    const item = { ...c, before: Math.round(b), after: Math.round(a) };
    (onlyMediaEdge(c.box) ? mediaEdges : hiddenControls).push(item);
  }

  let contentTiles = 0;
  const hiddenTiles = [];
  let mediaEdgeTiles = 0;
  for (let y = 0; y + TILE <= after.height; y += TILE) {
    for (let x = 0; x + TILE <= after.width; x += TILE) {
      const box = [x, y, x + TILE, y + TILE];
      const b = contrast(before, box);
      if (b < VISIBLE) continue;
      contentTiles++;
      if (!lost(b, contrast(after, box))) continue;
      if (onlyMediaEdge(box)) mediaEdgeTiles++;
      else hiddenTiles.push(box);
    }
  }

  // How much of the page is still bright: a dark mode that leaves big white areas failed.
  // Images keep their real colours, so only page pixels count.
  let bright = 0;
  let counted = 0;
  for (let y = 0; y < after.height; y += 2) {
    for (let x = 0; x < after.width; x += 2) {
      if (media.some((m) => x >= m.box[0] && x < m.box[2] && y >= m.box[1] && y < m.box[3])) continue;
      counted++;
      if (lum(after.data, (y * after.width + x) * 4) > 200) bright++;
    }
  }
  const brightShare = counted ? bright / counted : 0;

  for (const box of hiddenTiles) frame(after, box, [255, 170, 0]);
  for (const c of [...hiddenControls, ...hiddenMedia]) frame(after, c.box, [255, 0, 60]);
  await mkdir(outDir, { recursive: true });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await writeFile(join(outDir, `${slug}-off.png`), PNG.sync.write(before));
  await writeFile(join(outDir, `${slug}-on.png`), PNG.sync.write(after));

  return {
    name,
    url: page.url(),
    darkened,
    controls: controls.length,
    hiddenControls,
    media: media.length,
    hiddenMedia,
    mediaEdges: mediaEdges.length + mediaEdgeTiles,
    contentTiles,
    hiddenTiles: hiddenTiles.length,
    brightShare: Math.round(brightShare * 100),
    ok:
      darkened &&
      hiddenControls.length === 0 &&
      hiddenMedia.length === 0 &&
      hiddenTiles.length <= Math.max(2, contentTiles * 0.01) &&
      brightShare < 0.15,
  };
}
