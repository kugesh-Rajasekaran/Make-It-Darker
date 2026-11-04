# Make It Darker

Dark mode for every website, in [Dia](https://www.diabrowser.com), any Chromium browser, and Safari on iPhone, iPad and Mac, without hiding a single button or line of text.

## Principles

1. **Tiny.** About 400 lines in total, with no dependencies and no build step. The `extension/` folder is the whole product.
2. **Never hides anything.** Every button, menu and line of text stays readable. An automated audit of live Google Sheets and LinkedIn pages checks this.
3. **One click.** A global switch, plus **Auto / Dark / Original** for each site. Changes apply instantly, with no reload.
4. **Private.** No ads, no tracking and no account. Your settings never leave your browser.

## Install

It is not in a store yet, so load it from source.

### Dia, Chrome, Edge, Brave, Arc and Vivaldi

1. Get the code: `git clone https://github.com/kugesh-Rajasekaran/Make-It-Darker.git`, or use **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions` (Dia, Chrome, Brave, Arc, Vivaldi) or `edge://extensions` (Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `extension/` folder.
5. Reload any tabs that were already open.

To update, run `git pull` (or download again), then click the reload arrow on the extension's card. Keep the folder where it is: the browser identifies an unpacked extension by its path, so moving the folder resets your saved site choices.

### Safari on iPhone and iPad

Safari only installs extensions that come inside an app, so the `extension/` folder gets wrapped in a small app that Xcode builds. You need a Mac with Xcode and an Apple ID.

1. Get the code as above, then run `sh scripts/make-safari.sh` (or `npm run safari`). It creates an Xcode project in `safari/`, which is not committed, and opens it. The project points at `extension/` rather than copying it, so edits there show up on the next build.
2. In Xcode, select the project, then the **Signing & Capabilities** tab. Set **Team** to your Apple ID for the iOS app target and the iOS extension target.
3. Connect your iPhone, choose the **Make It Darker (iOS)** scheme and your iPhone as the destination, and click **Run**. The first time, iOS asks you to turn on **Settings → Privacy & Security → Developer Mode**. If it then says the developer is not trusted, allow it under **Settings → General → VPN & Device Management**.
4. On the iPhone, open **Settings → Apps → Safari → Extensions** (**Settings → Safari → Extensions** before iOS 18), turn on **Make It Darker**, and set **All Websites** to **Allow**. Otherwise Safari asks on every site.
5. Reload any open tabs. The switch and the **Auto / Dark / Original** buttons are under **Make It Darker** in Safari's extensions menu, which you open from the address bar.

The bundle ID defaults to `com.<your Mac username>.MakeItDarker`. If Xcode says it is not available, run the script again with `BUNDLE_ID=com.something.unique`.

Apple's documentation says testing on a device needs the [Apple Developer Program](https://developer.apple.com/programs/) ($99 a year). A free Apple ID usually works for your own iPhone, but the install expires after 7 days; run it from Xcode again to renew. Xcode's iOS Simulator needs neither a paid account nor an iPhone.

No Mac? With the Developer Program, you can upload the zip from `npm run package` to the Safari Web Extension Packager in [App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect), then install it on your iPhone through TestFlight.

### Safari on a Mac

- **To try it quickly:** in Safari, turn on **Settings → Advanced → Show features for web developers**. Then, in **Settings → Developer**, tick **Allow unsigned extensions**, click **Add Temporary Extension…**, and choose the `extension/` folder. Safari removes it after 24 hours or when you quit.
- **To keep it:** in the Xcode project from step 1 above, run the **Make It Darker (macOS)** scheme, then turn it on in **Safari → Settings → Extensions**.

### Chrome and Arc on iPhone

Not possible. Chrome, Arc Search, Edge and Firefox on iPhone and iPad don't support extensions, so no extension can run there. iOS's **Smart Invert** (**Settings → Accessibility → Display & Text Size**) darkens every app, these browsers included, and keeps photos in their real colours. Unlike Make It Darker, it also inverts pages that are already dark.

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
6. Do not run `npm run e2e` unless I ask. It opens live Google Sheets and LinkedIn
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
| Safari on iPhone, iPad and Mac | Works once wrapped in an app with Xcode ([see Install](#safari-on-iphone-and-ipad)). Checked in WebKit, Safari's engine, but not yet on a real iPhone. |
| Firefox | Needs a small manifest change: `background.scripts` instead of `service_worker`, plus a Firefox extension ID |
| Chrome, Arc Search, Edge or Firefox on iPhone and iPad | No; they don't support extensions |
| Chrome on Android | No; it doesn't support extensions |

## How it works

A content script marks `<html>` before the page first paints. `dark.css` then applies `invert(1) hue-rotate(180deg) contrast(0.85)` to the page. This flips light and dark, turns colours back to their own hue, and softens the result: white becomes `#131313` and black becomes `#ececec`. Photos and video get the inverse filter, so they keep their colours.

| Problem | Fix |
| --- | --- |
| White flash before dark mode kicks in | Applied at `document_start`, before first paint |
| Site is already dark, so inverting would make it light | Just before first paint, the script samples the background the user actually sees; dark pages are skipped |
| Photos and video get inverted | They get the inverse filter (very saturated colours lose a little saturation) |
| Icons drawn on transparency vanish when restored onto a dark page | Small images are checked for see-through pixels, and those invert with the page instead |
| Modal dialogs and popovers render outside the page filter | They are filtered directly |
| Fullscreen video sits outside the page filter | Dark mode pauses while something is fullscreen |
| A page with no background shows the browser's white canvas, which filters can't reach | It gets a white base that inverts to dark. This is forced, because LinkedIn sets `html { background: transparent }` |
| Frameworks rewrite `<html>` attributes during hydration | A `MutationObserver` restores the attribute |
| Safari leaves an extension's CSS off pages that have no stylesheet of their own | The manifest sets `css_origin: user`, which Safari applies to every page. Chromium ignores it. |

An exact, hue-preserving SVG filter was tried first. It was dropped because Chromium redraws SVG filters on `<html>` unreliably, which left Google Sheets' menu bar and toolbar blank.

## Known limits

- **Stylesheet background images** (not inline ones) get inverted. Set the site to **Original** if that looks wrong.
- **`<canvas>`** is not restored. Canvas-drawn apps such as Google Sheets go dark, but photo or game canvases invert.
- **Dark logos** keep their colours, so a logo's square outline can blend into the dark page. The logo itself stays visible.
- **Embedded frames** are left as they are, so a light embed stays light.
- **Browser pages** (`chrome://`, the Web Store, the PDF viewer) can't be changed by any extension.

## Develop

```sh
npm install
npx playwright install chromium   # or set CHROMIUM_PATH to a Chromium build
npm test                          # local pages, pixel checks
npm run e2e -- ./e2e-out          # live Google Sheets and LinkedIn (needs network)
```

Both load the real extension into headless Chromium. Branded Google Chrome ignores `--load-extension`, so use Chromium or Chrome for Testing.

`npm run e2e` drives the pages like a user would: it opens menus, submenus, dropdowns, context menus, dialogs, filters and job pages. At each step it screenshots with dark mode off, then on, and fails if any control, image or patch of text that was clearly visible lost most of its contrast. On each "on" screenshot, red boxes mark controls that became hard to see and orange boxes mark other content. It uses public pages only: Google's sample spreadsheet and LinkedIn's signed-out pages.

`npm run icons` redraws the toolbar icons and needs Pillow. `npm run safari` builds the Xcode project for Safari and needs a Mac with Xcode.

## Package for the stores

1. Bump `version` in `extension/manifest.json`.
2. Run `npm test` and `npm run e2e`.
3. Run `npm run package` to create `make-it-darker.zip`, which contains only the `extension/` folder.
4. Upload the zip:
   - **Chrome Web Store:** a one-time $5 developer fee. This also covers Dia, Brave, Arc, Vivaldi and Opera.
   - **Edge Add-ons:** free.
   - **Firefox Add-ons:** free, after the manifest change above.
   - **App Store (Safari on iPhone, iPad and Mac):** needs the Apple Developer Program ($99 a year). Archive the Xcode project from `npm run safari`, or upload the zip to the Safari Web Extension Packager in App Store Connect.

Store installs update automatically and get a permanent extension ID.

## Licence

MIT
