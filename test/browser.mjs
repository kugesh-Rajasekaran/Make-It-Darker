// Shared by the local tests and the live audit: Chromium with the unpacked
// extension loaded.
//
// Uses Playwright's Chromium (npx playwright install chromium), or any
// Chromium / Chrome for Testing build via CHROMIUM_PATH. Branded Google
// Chrome ignores --load-extension and will not work.
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

export const EXT = resolve(import.meta.dirname, '../extension');

// Chrome derives an unpacked extension's id from its absolute path.
export const EXT_ID = [...createHash('sha256').update(EXT).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');

export async function launchWithExtension({ args = [], ...options } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dia-dark-'));
  const context = await chromium.launchPersistentContext(dataDir, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    headless: true,
    ...options,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, ...args],
  });
  // Chromium can still be flushing the profile when 'close' fires: retry, and
  // never fail a run over a temp folder.
  context.on('close', () =>
    rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {}),
  );
  return context;
}
