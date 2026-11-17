// Loads the real extension into Chromium, serves small local pages, and
// checks the rendered pixels.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import pngjs from 'pngjs';
import { EXT_ID, launchWithExtension } from './browser.mjs';

const { PNG } = pngjs;

const tall = '<div style="height:200vh"></div>';
const PAGES = {
  '/light': `<style>body{background:#fff;color:#000}</style><h1>Light</h1>${tall}`,
  '/dark': `<style>body{background:#121212;color:#eee}</style><h1>Dark</h1>${tall}`,
  '/bare': '<p>No styles at all</p>',
  '/image': `<style>body{margin:0;background:#fff}</style>
    <img id=i width=300 height=300>
    <script>
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const g = c.getContext('2d');
      g.fillStyle = '#d03030';
      g.fillRect(0, 0, 4, 4);
      i.src = c.toDataURL('image/png');
    </script>`,
  '/transparent-root': `<style>html,body{background:transparent!important}</style><p>LinkedIn-style page</p>${tall}`,
  '/icon': `<style>body{margin:0;background:#fff}</style>
    <button style="all:unset;display:block;width:80px;height:80px"><img id=i width=80 height=80></button>
    <script>
      const c = document.createElement('canvas');
      c.width = c.height = 80;
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(20, 10, 40, 60); // black glyph, transparent around it
      i.src = c.toDataURL('image/png');
    </script>`,
  '/accent': `<style>body{margin:0;background:#fff}</style>
    <div style="background:#d03030;width:100px;height:100px"></div>${tall}`,
  '/fixed': `<style>body{background:#fff}</style>
    <div id=bar style="position:fixed;top:0;left:0;right:0;height:40px;background:#eee"></div>${tall}`,
  '/dark-band': `<style>body{margin:0;background:#fff}</style>
    <header style="background:linear-gradient(to right,#0d1df6,#010d33);height:120px;color:#fff">Brand</header>${tall}`,
  '/dark-frame': `<style>body{margin:0;background:#fff}</style>
    <div style="background:#111;padding:20px"><div style="background:#fff;height:300px">App</div></div>${tall}`,
  '/app-frame': `<style>body{margin:0;background:#fff}iframe{border:0;width:600px;height:600px}</style>
    <iframe srcdoc="<body style='margin:0'><div style='background:#fff;height:200px'></div><h1 style='color:#001191'>Welcome</h1></body>"></iframe>`,
  '/red': `<style>body{margin:0;background:#d03030}</style>`,
  '/form': `<style>body{margin:0;background:#fff;color:#222}</style><p>Payment method</p>`,
  '/dialog': `<style>body{background:#fff}dialog{background:#fff;width:200px;height:120px;border:0}</style>
    <dialog id=d>Modal</dialog><script>d.showModal()</script>`,
};

// 80x80 PNG: a black block on a transparent background, like an icon glyph.
const GLYPH_PNG = (() => {
  const png = new PNG({ width: 80, height: 80 });
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 80; x++) {
      const i = (y * 80 + x) * 4;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 17;
      png.data[i + 3] = x >= 20 && x < 60 && y >= 10 && y < 70 ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
})();

let server, origin, context;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/glyph.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(GLYPH_PNG);
    }
    if (req.url === '/video-frame') {
      const src = `http://localhost:${server.address().port}/red`;
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><html><body style="margin:0;background:#fff"><iframe src="${src}" style="border:0;width:200px;height:150px"></iframe></body></html>`);
    }
    if (req.url === '/pay-frame') {
      const src = `http://localhost:${server.address().port}/form`;
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><html><body style="margin:0;background:#fff"><iframe src="${src}" style="border:0;width:300px;height:200px"></iframe></body></html>`);
    }
    if (req.url === '/icon-cross-origin') {
      const src = `http://localhost:${server.address().port}/glyph.png`;
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<!doctype html><html><body style="margin:0;background:#fff"><img src="${src}" width=80 height=80></body></html>`);
    }
    const body = PAGES[req.url];
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
    res.end(body ? `<!doctype html><html><body>${body}</body></html>` : '');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;

  context = await launchWithExtension({ viewport: { width: 600, height: 600 } });
});

after(async () => {
  await context?.close();
  server?.close();
});

async function setSettings(settings) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await page.evaluate(async (s) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(s);
  }, settings);
  await page.close();
}

async function open(path) {
  const page = await context.newPage();
  await page.goto(origin + path);
  await page.waitForTimeout(250); // let the load-time detection and settings settle
  return page;
}

const isDarkened = (page) =>
  page.evaluate(() => document.documentElement.hasAttribute('data-dia-dark'));

async function pixel(page, x, y) {
  const { data } = PNG.sync.read(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
  return [data[0], data[1], data[2]];
}

const looksDark = ([r, g, b]) => Math.max(r, g, b) < 50;

test('extension loads', async () => {
  const page = await context.newPage();
  const res = await page.goto(`chrome-extension://${EXT_ID}/manifest.json`);
  assert.equal(res.status(), 200);
  await page.close();
});

test('light page is darkened', async () => {
  await setSettings({});
  const page = await open('/light');
  assert.equal(await isDarkened(page), true);
  assert.ok(looksDark(await pixel(page, 300, 300)), 'background should render dark');
  await page.close();
});

test('already-dark page is left alone', async () => {
  await setSettings({});
  const page = await open('/dark');
  assert.equal(await isDarkened(page), false);
  assert.deepEqual(await pixel(page, 300, 300), [18, 18, 18]);
  await page.close();
});

test('page with no background still renders dark', async () => {
  await setSettings({});
  const page = await open('/bare');
  assert.equal(await isDarkened(page), true);
  assert.ok(looksDark(await pixel(page, 300, 550)), 'empty canvas area should render dark');
  await page.close();
});

test('photos keep their colours', async () => {
  await setSettings({});
  const page = await open('/image');
  assert.equal(await isDarkened(page), true);
  const [r, g, b] = await pixel(page, 150, 150);
  // #d03030 = (208, 48, 48). The double hue-rotate clips very saturated
  // colours a little (about rgb(172, 75, 75)); it must stay clearly the same red.
  assert.ok(Math.abs(r - 208) < 45 && r - g > 80 && r - b > 80, `got rgb(${r}, ${g}, ${b})`);
  await page.close();
});

test('page with explicitly transparent <html> and <body> still renders dark', async () => {
  await setSettings({});
  const page = await open('/transparent-root');
  assert.ok(looksDark(await pixel(page, 300, 550)), 'background should render dark');
  await page.close();
});

test('see-through icon inverts with the page instead of vanishing', async () => {
  await setSettings({});
  const page = await open('/icon');
  await page.waitForTimeout(300);
  const [r, g, b] = await pixel(page, 40, 40); // inside the black glyph
  assert.ok(Math.min(r, g, b) > 180, `glyph should turn light, got rgb(${r}, ${g}, ${b})`);
  await page.close();
});

test('cross-origin see-through icon is judged by the background worker', async () => {
  await setSettings({});
  const page = await open('/icon-cross-origin');
  await page.waitForTimeout(500);
  const [r, g, b] = await pixel(page, 40, 40);
  assert.ok(Math.min(r, g, b) > 180, `glyph should turn light, got rgb(${r}, ${g}, ${b})`);
  await page.close();
});

test('accent colours keep their hue', async () => {
  await setSettings({});
  const page = await open('/accent');
  const [r, g, b] = await pixel(page, 50, 50);
  // A light page's red button should still read as red (lighter is fine), not cyan or grey.
  assert.ok(r - g > 60 && r - b > 60, `got rgb(${r}, ${g}, ${b})`);
  await page.close();
});

test('areas the site already paints dark stay dark', async () => {
  await setSettings({});
  const page = await open('/dark-band');
  assert.equal(await isDarkened(page), true);
  // Left end of the gradient, #0d1df6. Restoring loses some saturation (about
  // rgb(44, 54, 89)); it must stay a dark blue, not flip to light lavender.
  const [r, g, b] = await pixel(page, 20, 60);
  assert.ok(Math.max(r, g, b) < 130 && b - r > 25, `band should stay dark blue, got rgb(${r}, ${g}, ${b})`);
  assert.ok(looksDark(await pixel(page, 300, 400)), 'the rest of the page should still be dark');
  await page.close();
});

test('a dark frame around a white app does not bring the white back', async () => {
  await setSettings({});
  const page = await open('/dark-frame');
  assert.ok(looksDark(await pixel(page, 300, 150)), 'white panel should render dark');
  await page.close();
});

test('same-site iframe darkens with the page', async () => {
  await setSettings({});
  const page = await open('/app-frame');
  await page.waitForTimeout(300);
  assert.ok(looksDark(await pixel(page, 300, 100)), 'white card inside the frame should render dark');
  // The navy heading sits on the frame's see-through part: it must turn light, not stay navy on black.
  const h = await page.frames()[1].evaluate(() => document.querySelector('h1').getBoundingClientRect().toJSON());
  const shot = PNG.sync.read(await page.screenshot({ clip: { x: h.x, y: h.y, width: 150, height: h.height } }));
  let brightest = 0;
  for (let i = 0; i < shot.data.length; i += 4) brightest = Math.max(brightest, shot.data[i], shot.data[i + 1], shot.data[i + 2]);
  assert.ok(brightest > 150, `heading should be light on the dark page, brightest channel ${brightest}`);
  await page.close();
});

test('cross-origin light iframe (a payment form) darkens with the page', async () => {
  await setSettings({});
  const page = await open('/pay-frame');
  await page.waitForTimeout(500);
  assert.ok(looksDark(await pixel(page, 150, 150)), 'white form inside the frame should render dark');
  await page.close();
});

test('cross-origin embeds keep their colours', async () => {
  await setSettings({});
  const page = await open('/video-frame');
  await page.waitForTimeout(500);
  const [r, g, b] = await pixel(page, 100, 75);
  assert.ok(r - g > 80 && r - b > 80, `embed should stay red, got rgb(${r}, ${g}, ${b})`);
  await page.close();
});

test('position: fixed still sticks to the viewport', async () => {
  await setSettings({});
  const page = await open('/fixed');
  await page.evaluate(() => scrollTo(0, 2000));
  assert.equal(await page.evaluate(() => document.getElementById('bar').getBoundingClientRect().top), 0);
  await page.close();
});

test('modal dialogs are darkened', async () => {
  await setSettings({});
  const page = await open('/dialog');
  assert.ok(looksDark(await pixel(page, 300, 300)), 'dialog should render dark');
  await page.close();
});

test('per-site Original turns it off; Dark forces it on', async () => {
  await setSettings({ sites: { '127.0.0.1': 'off' } });
  let page = await open('/light');
  assert.equal(await isDarkened(page), false);
  await page.close();

  await setSettings({ sites: { '127.0.0.1': 'on' } });
  page = await open('/dark');
  assert.equal(await isDarkened(page), true);
  await page.close();
});

test('global switch off leaves every page alone', async () => {
  await setSettings({ enabled: false });
  const page = await open('/light');
  assert.equal(await isDarkened(page), false);
  await page.close();
});

test('page reports its status to the popup', async () => {
  await setSettings({});
  const light = await open('/light');
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${EXT_ID}/popup.html`);
  // The same call popup.js makes, sent to every tab; only pages with the content script answer.
  const replies = await ext.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const all = await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, 'status').catch(() => null)));
    return all.filter(Boolean);
  });
  assert.deepEqual(replies, [{ host: '127.0.0.1', pageIsDark: false }]);
  await ext.close();
  await light.close();
});

test('changing settings applies to open tabs without reload', async () => {
  await setSettings({});
  const page = await open('/light');
  assert.equal(await isDarkened(page), true);
  await setSettings({ enabled: false });
  await page.waitForTimeout(150);
  assert.equal(await isDarkened(page), false);
  await page.close();
});
