const DEFAULTS = { enabled: true, sites: {} };
const $ = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const page = await chrome.tabs.sendMessage(tab.id, 'status').catch(() => null);

function describe(enabled, mode) {
  if (!enabled) return 'Off on every site.';
  if (mode === 'on') return 'Always dark on this site.';
  if (mode === 'off') return 'Never changed on this site.';
  return page.pageIsDark ? 'Already dark, left as is.' : 'Light page, darkened.';
}

async function render() {
  const { enabled, sites } = await chrome.storage.local.get(DEFAULTS);
  $('enabled').checked = enabled;
  $('site').hidden = !page;
  $('unavailable').hidden = Boolean(page);
  if (!page) return;

  const mode = sites[page.host] ?? 'auto';
  $('host').textContent = page.host || 'This page';
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }
  $('status').textContent = describe(enabled, mode);
}

$('enabled').addEventListener('change', async (event) => {
  await chrome.storage.local.set({ enabled: event.target.checked });
  render();
});

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', async () => {
    const { sites } = await chrome.storage.local.get(DEFAULTS);
    if (button.dataset.mode === 'auto') delete sites[page.host];
    else sites[page.host] = button.dataset.mode;
    await chrome.storage.local.set({ sites });
    render();
  });
}

render();
