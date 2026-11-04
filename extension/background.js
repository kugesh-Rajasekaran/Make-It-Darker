// Answers "is this image see-through?" for cross-origin images the content
// script cannot read itself (the page's canvas would be tainted). Same test
// as measure() in content.js: more than 30% of a 48x48 sample see-through.
const SIZE = 48;
const verdicts = new Map();

async function seeThrough(src) {
  const res = await fetch(src, { credentials: 'omit' });
  const bitmap = await createImageBitmap(await res.blob(), { resizeWidth: SIZE, resizeHeight: SIZE });
  const ctx = new OffscreenCanvas(SIZE, SIZE).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 26) clear++;
  return clear / (SIZE * SIZE) > 0.3;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'see-through') return false;
  if (!verdicts.has(msg.src)) verdicts.set(msg.src, seeThrough(msg.src).catch(() => false));
  verdicts.get(msg.src).then(reply);
  return true; // reply asynchronously
});
