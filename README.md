# Focus Companion — MVP scaffold

A Manifest V3 Chrome extension: a non-punitive "why are you here?" overlay on
a small set of sites, logged locally, summarized weekly. No blocking, no
server, no accounts.

## Load it (Chrome/Chromium)

1. `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. The options page opens automatically on first install — Instagram and
   YouTube are enabled by default, everything else is off until you turn it on
5. Visit an enabled site; the overlay appears once, then respects the
   cooldown window (default 20 minutes) before it can appear again
6. Click the toolbar icon for the weekly summary

No icons are bundled — Chrome will use a placeholder puzzle-piece icon for
unpacked testing. Add `icons/16.png`, `48.png`, `128.png` and an `"icons"`
block in `manifest.json` before shipping to the Web Store.

## File map

```
manifest.json        MV3 manifest — narrow host_permissions, no remote code
background.js         first-run defaults only, no polling, no network
content.js             decides whether to show the overlay, injects shadow DOM
content.css            overlay visual design (dusk theme + breathing glow)
popup.html/js/css       toolbar popup — weekly summary
options.html/js/css     settings — site toggles, cooldown, export/delete
utils/storage.js        the entire chrome.storage.local data model in one file
```

`utils/storage.js` is loaded by both the content script and the popup/options
pages as a plain (non-module) script, so every context gets its own copy of
the same functions — there's no message-passing needed for the MVP because
nothing needs to be coordinated in real time.

## Adding a site

Sites are matched by hostname, not URL, and are seeded from a fixed list in
`background.js` and mirrored in `manifest.json`'s `host_permissions` /
`content_scripts.matches`. To add a site for the MVP: add it to both places
and to `FC_DEFAULT_SITES` in `utils/storage.js`, then reload the extension.
Phase 2 replaces this with `chrome.permissions.request()` so people can add
arbitrary sites without a new build — see the phased plan in the write-up.
# focus
