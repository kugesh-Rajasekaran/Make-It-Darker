// End-to-end visibility run against live Google Sheets and LinkedIn.
//
//   node test/live/e2e.mjs [outDir] [--headed]
//
// Needs network. Uses public pages only (no sign-in): Google's public sample
// spreadsheet and LinkedIn's guest pages. Writes off/on screenshots for every
// step to outDir; on the "on" image, red boxes mark controls that became hard to
// see and orange boxes mark any other content that did.
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { audit, launch } from './audit.mjs';

const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(tmpdir(), 'dia-dark-e2e'));
const headless = !process.argv.includes('--headed');

const SHEET = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
const LI_JOBS = 'https://www.linkedin.com/jobs/search?keywords=software%20engineer&location=United%20States';

const { context, setSite } = await launch({ headless });
context.setDefaultTimeout(8000);
const results = [];

class Skip extends Error {}

async function step(page, name, act) {
  try {
    await act();
    results.push(await audit(page, { setSite, outDir, name }));
  } catch (error) {
    if (error instanceof Skip) {
      console.log(`skip  ${name} (${error.message})`);
      return;
    }
    results.push({ name, error: error.message.split('\n')[0] });
  }
  const r = results.at(-1);
  console.log(
    r.error
      ? `ERR   ${name}: ${r.error}`
      : `${r.ok ? 'ok  ' : 'FAIL'}  ${name}  (controls ${r.controls}, hidden ${r.hiddenControls.length}; ` +
          `images ${r.media}, hidden ${r.hiddenMedia.length}; text tiles hidden ${r.hiddenTiles}/${r.contentTiles}; ` +
          `bright ${r.brightShare}%; image-outline only ${r.mediaEdges})`,
  );
}

const settle = (page, ms = 1200) => page.waitForTimeout(ms);
const visibleMenu = (page) => page.locator('.goog-menu:visible').first();

// ---- Google Sheets -------------------------------------------------------
{
  const page = await context.newPage();
  await page.goto(SHEET, { waitUntil: 'load' });
  await page.locator('#docs-menubar').waitFor({ timeout: 30000 });
  await settle(page, 2500);

  await step(page, 'sheets: grid', async () => {});

  for (const menu of ['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help']) {
    const item = page.locator(`#docs-menubar [role=menuitem]:text-is("${menu}")`);
    if ((await item.getAttribute('aria-disabled')) === 'true') {
      console.log(`skip  sheets: ${menu} menu (disabled for signed-out viewers)`);
      continue;
    }
    await step(page, `sheets: ${menu} menu`, async () => {
      await item.click();
      await visibleMenu(page).waitFor({ timeout: 4000 });
      await settle(page, 500);
    });
    await page.keyboard.press('Escape');
    await settle(page, 300);
  }

  await step(page, 'sheets: File > Download submenu', async () => {
    await page.locator('#docs-menubar [role=menuitem]:text-is("File")').click();
    await visibleMenu(page).locator('[role=menuitem]', { hasText: 'Download' }).hover();
    await page.locator('.goog-menu:visible').nth(1).waitFor({ timeout: 4000 });
    await settle(page, 500);
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await step(page, 'sheets: zoom dropdown', async () => {
    await page.getByRole('combobox', { name: 'Zoom' }).click();
    await settle(page, 700);
  });
  await page.keyboard.press('Escape');

  await step(page, 'sheets: cell selected', async () => {
    await page.mouse.click(230, 260);
    await settle(page, 700);
  });

  await step(page, 'sheets: cell context menu', async () => {
    await page.mouse.click(350, 300, { button: 'right' });
    await visibleMenu(page).waitFor({ timeout: 4000 });
    await settle(page, 500);
  });
  await page.keyboard.press('Escape');

  await step(page, 'sheets: sheet tab menu', async () => {
    await page.locator('.docs-sheet-tab').first().click({ button: 'right' });
    await visibleMenu(page).waitFor({ timeout: 4000 });
    await settle(page, 500);
  });
  await page.keyboard.press('Escape');

  await step(page, 'sheets: find bar', async () => {
    await page.mouse.click(230, 260);
    await page.keyboard.press('Meta+f');
    await settle(page, 1000);
  });
  await page.keyboard.press('Escape');

  await step(page, 'sheets: keyboard shortcuts dialog', async () => {
    await page.keyboard.press('Meta+/');
    await page.locator('[role=dialog]:visible').first().waitFor({ timeout: 5000 });
    await settle(page, 800);
  });
  await page.keyboard.press('Escape');
  await page.close();
}

// ---- LinkedIn (guest pages) ---------------------------------------------
{
  const page = await context.newPage();
  let lastStatus = 200;
  page.on('response', (res) => {
    if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) lastStatus = res.status();
  });
  const blocked = async () => {
    if (lastStatus === 999 || lastStatus === 403 || lastStatus === 429) {
      throw new Error(`blocked by LinkedIn bot protection (HTTP ${lastStatus}, "${await page.title()}")`);
    }
  };

  // LinkedIn sometimes bounces repeat guests to the home page instead.
  const onJobsList = async () => {
    if (!(await page.locator('ul.jobs-search__results-list').count())) {
      throw new Skip(`LinkedIn served ${new URL(page.url()).pathname} instead of the jobs list`);
    }
  };

  await step(page, 'linkedin: jobs search + sign-in dialog', async () => {
    await page.goto(LI_JOBS, { waitUntil: 'load' });
    await settle(page, 2500);
    await blocked();
    await onJobsList();
  });
  const dismiss = page.locator('[role=dialog]:visible button[aria-label*="Dismiss" i], .modal__dismiss:visible').first();
  if (await dismiss.count()) await dismiss.click();
  else await page.keyboard.press('Escape');
  await settle(page, 800);

  await step(page, 'linkedin: jobs search', onJobsList);

  await step(page, 'linkedin: "Date posted" filter open', async () => {
    await onJobsList();
    await page.locator('button', { hasText: 'Date posted' }).first().click();
    await settle(page, 800);
  });
  await page.keyboard.press('Escape');
  await page.mouse.click(1380, 300);

  await step(page, 'linkedin: second job opened', async () => {
    await onJobsList();
    await page.locator('ul.jobs-search__results-list > li').nth(1).click();
    await settle(page, 2000);
  });

  await step(page, 'linkedin: scrolled job list', async () => {
    await onJobsList();
    await page.mouse.wheel(0, 1500);
    await settle(page, 1500);
  });

  await step(page, 'linkedin: sign-in page', async () => {
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'load' });
    await settle(page, 2000);
    await blocked();
  });

  await step(page, 'linkedin: public job page', async () => {
    await page.goto(LI_JOBS, { waitUntil: 'load' });
    await onJobsList();
    const href = await page.locator('ul.jobs-search__results-list a[href*="/jobs/view/"]').first().getAttribute('href');
    await page.goto(href, { waitUntil: 'load' });
    await settle(page, 2500);
    await blocked();
  });

  await step(page, 'linkedin: home page', async () => {
    await page.goto('https://www.linkedin.com/', { waitUntil: 'load' });
    await settle(page, 2500);
    await blocked();
  });
  await page.close();
}

await context.close();
await writeFile(join(outDir, 'report.json'), JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.ok);
for (const r of failed.filter((r) => r.hiddenControls?.length || r.hiddenMedia?.length)) {
  console.log(`\n${r.name}: became hard to see`);
  for (const c of [...r.hiddenControls, ...r.hiddenMedia].slice(0, 15)) {
    console.log(`  - ${c.role} "${c.label}"  contrast ${c.before} -> ${c.after}`);
  }
}
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots and report.json in ${outDir}`);
process.exitCode = failed.length ? 1 : 0;
