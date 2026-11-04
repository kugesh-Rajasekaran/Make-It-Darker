# Dia Dark Mode

A browser extension that turns every website dark in [Dia](https://www.diabrowser.com) without hiding any of the page's controls. Pages that are already dark are left alone, and photos and videos keep their colours.

It is a plain Manifest V3 extension with no build step and no dependencies, so it should work in any Chromium-based browser.

## Install

1. Open `chrome://extensions` in Dia.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension/` folder.
4. Reload any tabs that were already open.

After pulling changes, click the reload arrow on the extension's card.

Click the moon icon to turn it off everywhere, or to set the current site to **Auto**, **Dark** or **Original**.

## How it works

A content script adds an attribute to `<html>` before the page renders. `dark.css` then applies `invert(1) hue-rotate(180deg) contrast(0.85)` to the whole page. That flips light and dark, rotates colours back to their own hue, and softens the result to `#131313` text backgrounds and `#ececec` text. Photos and video get the inverse filter, so they come back with their real colours.

| Problem | Fix |
| --- | --- |
| White flash before dark mode kicks in | Dark is applied at `document_start`, before first paint |
| Site is already dark, so inverting makes it light | Just before first paint, the script samples the background the user actually sees; dark pages are skipped |
| Photos and video get inverted | They get the inverse filter and come back with their colours (very saturated colours lose a little saturation) |
| Icons drawn on transparency (a black PNG glyph) vanish when restored onto a dark page | Small images are checked for see-through pixels; those invert with the page instead. Cross-origin images are checked by the background worker, which is why the extension asks for access to all sites |
| Modal dialogs and popovers render outside the page filter | They are filtered directly |
| Fullscreen video sits outside the page filter | Dark mode pauses while something is fullscreen |
| A page with no background shows the browser's white canvas, which filters can't reach | It gets a white base that inverts to dark, forced with `!important` because LinkedIn sets `html { background: transparent }` |
| Frameworks rewrite `<html>` attributes during hydration | A `MutationObserver` restores the attribute |

An exact, hue-preserving SVG filter (`out = x + 1 − max − min`) was tried first and kept photo colours perfect. It was dropped because Chromium paints SVG filters on `<html>` through a slower path that left Google Sheets' menu bar and toolbar blank until the next repaint.

## Tested on Google Sheets and LinkedIn

`npm run e2e` drives live Google Sheets and LinkedIn pages and checks that dark mode hides nothing. At each step it takes two screenshots, one with dark mode off and one with it on, without reloading. It then compares contrast inside every visible control, every image, and every 24 px tile of the viewport. Anything that was clearly visible before and lost most of its contrast after fails the step.

Steps covered:

- **Google Sheets** (Google's public sample sheet):
  - the grid
  - every enabled menu
  - the File › Download submenu
  - the zoom dropdown
  - a selected cell
  - the cell context menu
  - the sheet-tab menu
  - the find bar
  - the keyboard-shortcuts dialog
- **LinkedIn** (guest pages):
  - jobs search with the sign-in dialog
  - the "Date posted" filter
  - opening a job
  - scrolling the job list
  - the sign-in page
  - a public job page
  - the home page

Screenshots go to `$TMPDIR/dia-dark-e2e` unless you pass a folder. On each "on" image, red boxes mark controls or images that became hard to see and orange boxes mark other content that did.

Signed-in pages (an editable sheet, the LinkedIn feed and messaging) are not covered yet.

## Known limits

- Background images set in stylesheets (not inline) get inverted. Set the site to **Original** if that looks wrong.
- `<canvas>` is not restored: canvas-drawn documents such as Google Sheets go dark, but photo or game canvases invert.
- A dark logo keeps its colours, so its square outline can blend into the dark page (the logo itself stays visible).
- Iframes are left as they are, so a light embed stays light.
- Browser pages (`chrome://`, the Web Store, the PDF viewer) can't be changed by any extension.
- Dia's own sidebar and chat are part of the browser, not the page, so they are unaffected.

## Develop

```sh
npm install
npx playwright install chromium   # or set CHROMIUM_PATH to a Chromium build
npm test                          # local pages, pixel checks
npm run e2e -- ./e2e-out          # live Google Sheets and LinkedIn (needs network)
```

Both load the real extension into headless Chromium. Branded Google Chrome ignores `--load-extension`, so use Chromium or Chrome for Testing.

`npm run icons` redraws the toolbar icons and needs Pillow.

## Licence

MIT
