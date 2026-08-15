# Focus Companion — Privacy, in plain terms

**Everything stays on this device.** Your answers are written to this
browser profile's local storage (`chrome.storage.local`). Focus Companion
has no server, makes no network requests, and has no account or sign-in.
You can verify this yourself: `content.js`, `background.js`, `popup.js`,
and `options.js` contain no `fetch`, no `XMLHttpRequest`, and no remote URLs.

**What's collected.** Only what you type or tap into the overlay: a reason
(bored / curious / studying / news / other), an optional short note, which
configured site it happened on, and a timestamp. Skipping the overlay logs
nothing beyond "don't ask again for a while" on that site.

**What's not collected.** No browsing history outside the sites you enable,
no page content, no keystrokes elsewhere on the page, no identifiers tied to
you personally, no analytics or crash reporting.

**Where it's visible.** Only in this browser profile, in the extension's own
popup and settings. Uninstalling the extension or clearing the browser's
extension storage removes it. Other extensions can't read it — Chrome
isolates each extension's local storage.

**Your controls.**
- **Export** — the settings page and popup both have an "Export data" button
  that downloads everything as a plain JSON file you keep.
- **Delete everything** — one button, in settings or the popup, wipes all
  logs, site settings, and cooldown state immediately. There's no "soft
  delete" or retention period; the data is just gone.
- **Turn off a site** — uncheck it in settings; the overlay stops appearing
  there and no more entries are logged for it.

**Permissions, and why.** The extension asks for access only to the specific
sites listed in settings (e.g. `*.instagram.com`), not "all sites," and the
`storage` permission to save your answers locally. It does not ask for
history, tabs, bookmarks, or browsing-data permissions.

**If a future version adds sync.** Any cross-device sync will be opt-in,
off by default, and described here before it ships — the plan (see the
phased roadmap) is client-side encryption so the sync provider cannot read
your logs either.
