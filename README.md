# Make It Darker

Dark mode for every website, in [Dia](https://www.diabrowser.com) and any Chromium browser, without hiding a single button or line of text.

## Principles

1. **Tiny.** Under 500 lines in total, with no dependencies and no build step. The `extension/` folder is the whole product.
2. **Never hides anything.** Every button, menu and line of text stays readable. An automated audit of live Google Sheets, LinkedIn and OVHcloud pages checks this.
3. **One click.** A global switch, plus **Auto / Dark / Original** for each site. Changes apply instantly, with no reload.
4. **Private.** No ads, no tracking and no account. Your settings never leave your browser.

## Install

It is not in a store yet, so load it from source:

1. Get the code: `git clone https://github.com/kugesh-Rajasekaran/Make-It-Darker.git`, or use **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions` (Dia, Chrome, Brave, Arc, Vivaldi) or `edge://extensions` (Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `extension/` folder.
5. Reload any tabs that were already open.

To update, run `git pull` (or download again), then click the reload arrow on the extension's card. Keep the folder where it is: the browser identifies an unpacked extension by its path, so moving the folder resets your saved site choices.

### Set it up with an AI coding agent

Paste this into Claude Code, Codex, Cursor or a similar agent. It installs the dependencies, runs the tests, and tells you where the extension folder is. Loading the folder into the browser is the one step you do yourself.

```text
Set up the Make It Darker browser extension from
https://github.com/kugesh-Rajasekaran/Make-It-Darker so I can use and test it.

1. If the current folder is not already a clone of that repo, clone it and work inside the clone.
2. Check `node -v`. It must be 20.11 or newer. If Node is missing or older, stop and
   tell me how to install it; do not change my system Node yourself.
3. Run `npm install`.
4. Run `npx playwright install chromium`. The tests need Playwright's Chromium;
   branded Google Chrome will not load an extension from the command line.
5. Run `npm test` and confirm every test passes. If any fail, show me the failing
   test names and errors; do not edit code to make them pass.
6. Do not run `npm run e2e` unless I ask. It opens live Google Sheets, LinkedIn and OVHcloud
   pages, and LinkedIn rate-limits repeated runs.
7. Do not modify, commit or push any files.

When you are done, tell me the Node version, how many tests passed, and the absolute
path of the `extension/` folder, with these steps to load it: open chrome://extensions
(edge://extensions in Edge), turn on Developer mode, click Load unpacked, and choose
that folder.
```

## Use

Click the moon icon in the toolbar.

| Control | What it does |
| --- | --- |
| Switch | Turns dark mode on or off for every site |
| **Auto** (default) | Darkens light pages and leaves pages that are already dark alone. It re-checks on every page load. |
| **Dark** | Always darkens this site |
| **Original** | Never changes this site |

## What it remembers

```js
{ enabled: true, sites: { "docs.google.com": "off", "www.linkedin.com": "on" } }
```

- **Choices are kept per exact hostname.** `docs.google.com` and `mail.google.com` are separate sites.
- **Auto stores nothing.** Choosing Auto deletes the site's entry.
- **Settings live on this device and this browser profile only.** They are kept in the extension's local storage, are not synced, and are deleted if you remove the extension.

## Privacy

- **Nothing to sell or watch:** no ads, analytics, accounts, or code loaded from a server.
- **Settings stay in your browser.** They are never sent anywhere.
- **The one network request the extension makes:** its background worker re-downloads small images that the page is already showing, without cookies. It does this to check whether an image has see-through areas, so icons don't vanish on a dark page. The result is not sent anywhere.
- **Why it asks for access to all sites:** the browser warns that it can "read and change all your data on all websites". It needs that access to darken pages, and to read those images when they come from another domain.

## Browser support

| Browser | Status |
| --- | --- |
| Dia, Chrome, Edge, Brave, Arc, Vivaldi, Opera | Works as-is (Manifest V3). Tested in Chromium and Dia. |
| Firefox | Needs a small manifest change: `background.scripts` instead of `service_worker`, plus a Firefox extension ID |
| Safari | Needs wrapping with Apple's `safari-web-extension-converter` and an Apple developer account |
| Chrome on Android or iOS | No; it doesn't support extensions |

## How it works

A content script marks `<html>` before the page first paints. `dark.css` then applies `invert(1) hue-rotate(180deg) contrast(0.85)` to the page. This flips light and dark, turns colours back to their own hue, and softens the result: white becomes `#131313` and black becomes `#ececec`. Photos and video get the inverse filter, so they keep their colours.

| Problem | Fix |
| --- | --- |
| White flash before dark mode kicks in | Applied at `document_start`, before first paint |
| Site is already dark, so inverting would make it light | Just before first paint, the script samples the background the user actually sees; dark pages are skipped |
| Photos and video get inverted | They get the inverse filter (very saturated colours lose a little saturation) |
| Icons drawn on transparency vanish when restored onto a dark page | Small images are checked for see-through pixels, and those invert with the page instead |
| Parts the site already paints dark (brand bars, heroes, sidebars) turn light | Large areas with an opaque dark background colour or gradient get the inverse filter, so they stay dark. An area mostly covered by a light child is skipped, so a white app inside a dark frame still darkens |
| Apps that load their pages in an iframe (OVHcloud's control panel) show original colours over a now-dark backdrop: dark text on dark | Iframes from the same site, or covering most of the screen, darken with the page; only other embeds (videos, maps) keep their colours |
| Modal dialogs and popovers render outside the page filter | They are filtered directly |
| Fullscreen video sits outside the page filter | Dark mode pauses while something is fullscreen |
| A page with no background shows the browser's white canvas, which filters can't reach | It gets a white base that inverts to dark. This is forced, because LinkedIn sets `html { background: transparent }` |
| Frameworks rewrite `<html>` attributes during hydration | A `MutationObserver` restores the attribute |

An exact, hue-preserving SVG filter was tried first. It was dropped because Chromium redraws SVG filters on `<html>` unreliably, which left Google Sheets' menu bar and toolbar blank.

## Known limits

- **Stylesheet background images** (not inline ones) get inverted. Set the site to **Original** if that looks wrong.
- **`<canvas>`** is not restored. Canvas-drawn apps such as Google Sheets go dark, but photo or game canvases invert.
- **Dark logos** keep their colours, so a logo's square outline can blend into the dark page. The logo itself stays visible.
- **Embedded frames from other sites** (videos, maps) are left as they are, so a light embed stays light.
- **Saturated dark colours lose some saturation** when kept dark: OVHcloud's bright brand blue comes back as a muted dark navy.
- **Browser pages** (`chrome://`, the Web Store, the PDF viewer) can't be changed by any extension.

## Develop

```sh
npm install
npx playwright install chromium   # or set CHROMIUM_PATH to a Chromium build
npm test                          # local pages, pixel checks
npm run e2e -- ./e2e-out          # live Google Sheets, LinkedIn and OVHcloud (needs network)
```

Both load the real extension into headless Chromium. Branded Google Chrome ignores `--load-extension`, so use Chromium or Chrome for Testing.

`npm run e2e` drives the pages like a user would: it opens menus, submenus, dropdowns, context menus, dialogs, filters and job pages. At each step it screenshots with dark mode off, then on, and fails if any control, image or patch of text that was clearly visible lost most of its contrast. On each "on" screenshot, red boxes mark controls that became hard to see and orange boxes mark other content. It uses public pages only: Google's sample spreadsheet, LinkedIn's signed-out pages and OVHcloud's home page.

`npm run icons` redraws the toolbar icons and needs Pillow.

## Package for the stores

1. Bump `version` in `extension/manifest.json`.
2. Run `npm test` and `npm run e2e`.
3. Run `npm run package` to create `make-it-darker.zip`, which contains only the `extension/` folder.
4. Upload the zip:
   - **Chrome Web Store:** a one-time $5 developer fee. This also covers Dia, Brave, Arc, Vivaldi and Opera.
   - **Edge Add-ons:** free.
   - **Firefox Add-ons:** free, after the manifest change above.

Store installs update automatically and get a permanent extension ID.

## Licence

MIT
