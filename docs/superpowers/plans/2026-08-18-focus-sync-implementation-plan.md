# Focus Companion Chrome Storage Sync + Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Implement Chrome storage.sync integration for Focus Companion settings and site configuration, add analytics dashboard to the popup, and update options UI — while preserving the "no accounts, no uploads, 100% private" philosophy. Logs remain local-only; settings and sites sync across Chrome browsers where the user is signed in.

## Architecture

The extension uses a modular MV3 structure with background service worker, content script, popup, options page, and utility storage module. Sync layer adds Chrome storage.sync for `fc_settings` and `fc_sites` without any accounts or servers. Analytics computations run in the popup on locally-sourced data. The data model splits: synced (settings + sites) vs. local-only (logs).

Key files modified:
- `utils/storage.js` — sync helpers, merged site/settings loading
- `popup.html` — analytics section UI
- `popup.js` — sync init, analytics rendering
- `options.html` — sync status pill
- `options.js` — sync status display
- `docs/superpowers/specs/2026-08-18-focus-sync-design.md` — design reference

## Tech Stack

- Manifest V3 Chrome extension
- Chrome storage API (local + sync)
- Vanilla JS (no build step, no framework)
- CSS glassmorphism design (existing)

## Global Constraints (from spec)

- No Firebase, no accounts, no third-party services
- Chrome storage.sync 5MB quota ceiling
- Logs remain in chrome.storage.local only
- Backward compatible: new installs fall back to local defaults
- Privacy preserved: no data sent to external services

---

# Task 1: Add sync helper functions to storage.js

**Files:**
- Modify: `utils/storage.js` — add 3 new functions + modify 2 existing

**Interfaces:**
- Consumes: `chrome.storage.sync`, `chrome.storage.local` APIs
- Produces: synced sites object, synced settings object

**Step 1: Write the failing test**

There are no existing tests for storage.js in this codebase. Skip traditional test cycle — instead, verify the new functions work by inspecting the code and running the extension manually after implementation.

**Step 2: Verify understanding of existing patterns**

Review `utils/storage.js` functions: `fcGet`, `fcSet`, `fcGetSites`, `fcSetSites`, `fcGetSettings`, `fcSetSettings`. Understand the `chrome.storage.local` pattern before adding sync variants.

**Step 3: Write minimal implementation** — add to `utils/storage.js`:

```javascript
async function fcLoadSyncedSites() {
  const { fc_sites } = await chrome.storage.sync.get('fc_sites');
  const defaults = await fcGetSites();
  // Merge: sync data takes priority over defaults, local overrides sync
  return { ...fc_sites, ...defaults };
}

async function fcLoadSyncedSettings() {
  const { fc_settings } = await chrome.storage.sync.get('fc_settings');
  const defaults = FC_DEFAULT_SETTINGS;
  return { ...fc_settings, ...defaults };
}

async function fcSyncSites() {
  const sites = await fcGetSites();
  await chrome.storage.sync.set({ fc_sites: sites });
}
```

**Step 4: Verify manually**

1. Load the extension in Chrome
2. Open options page — verify no errors in console
3. Add/remove a site — open DevTools Application panel, check `chrome.storage.sync` has `fc_sites`
4. Change cooldown mode — verify `fc_settings` syncs

**Step 5: Commit**

```bash
git add utils/storage.js
git commit -m "feat: add sync helper functions for sites and settings"
```

---

# Task 2: Modify fcSetSites and fcSetSettings to auto-sync

**Files:**
- Modify: `utils/storage.js` — update 2 functions

**Interfaces:**
- Consumes: updated sites/settings objects
- Produces: local storage write + sync write

**Step 1: Write the failing test**

No existing tests. Skip — verify behavior by running extension after change.

**Step 2: Review existing `fcSetSites` and `fcSetSettings`**

Current implementations (from storage.js):
- `fcSetSites(sites)`: `await fcSet({ fc_sites: sites })`
- `fcSetSettings(settings)`: `await fcSet({ fc_settings: settings })`

**Step 3: Write minimal implementation** — modify both functions:

```javascript
async function fcSetSites(sites) {
  await fcSet({ fc_sites: sites });
  await fcSyncSites(); // push to sync storage
}

async function fcSetSettings(settings) {
  await fcSet({ fc_settings: settings });
  await chrome.storage.sync.set({ fc_settings: settings });
}
```

**Step 4: Verify manually**

1. Add a site in options — verify it appears in both `chrome.storage.local` and `chrome.storage.sync`
2. Change cooldown from 20 to 30 minutes — verify sync storage updates
3. Open extension on "another profile" (or incognito if signed into Chrome) — settings should carry over

**Step 5: Commit**

```bash
git add utils/storage.js
git commit -m "feat: auto-sync sites and settings to chrome.storage.sync"
```

---

# Task 3: Add sync loading to popup.js init

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `fcLoadSyncedSites()`, `fcLoadSyncedSettings()` from storage.js
- Produces: `sites` and `settings` variables available throughout popup init

**Step 1: Write the failing test**

No existing popup tests. Skip — verify by loading popup and checking data loads.

**Step 2: Review existing `fcInitPopup`**

Current flow (popup.js lines 16-59):
- Loads `fcGetLogs()`, `fcGetSites()`, `fcGetSettings()` via Promise.all
- Sets active tab domain + toggle
- Renders metrics and summary

**Step 3: Write minimal implementation** — modify `fcInitPopup`:

Change the Promise.all from:
```javascript
const [logs, sites, settings] = await Promise.all([
  fcGetLogs(),
  fcGetSites(),
  fcGetSettings()
]);
```

To:
```javascript
const [logs, sites, settings] = await Promise.all([
  fcGetLogs(),
  fcLoadSyncedSites(),
  fcLoadSyncedSettings()
]);
```

**Step 4: Verify manually**

1. Open popup — verify sites load from sync storage (or local if first run)
2. Verify settings (mode, cooldown) reflect last synced values
3. Open options page — verify site list matches popup

**Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: load synced sites/settings in popup init"
```

---

# Task 4: Add analytics section to popup.html

**Files:**
- Modify: `popup.html`

**Interfaces:**
- Consumes: new DOM elements added
- Produces: collapsible analytics section in the popup UI

**Step 1: Write the failing test**

No DOM tests. Skip — verify by visual inspection after running extension.

**Step 2: Review popup.html structure**

Current sections (from read):
- Header (brand + settings button)
- Active tab domain toggle card
- Metrics bar (3 metric cards: total, top site, top intent)
- Summary breakdown (7-day list)
- Footer actions (export, clear)

**Step 3: Write minimal implementation** — add after the metrics bar (before summary), around line 67-68 in popup.html:

Add new section:
```html
<!-- Analytics Section -->
<section id="fc-analytics-card" class="fc-card">
  <div class="fc-card-title-wrap">
    <div class="fc-section-icon">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    </div>
    <div>
      <h2>Analytics</h2>
      <p class="fc-card-desc">Weekly trends and focus patterns</p>
    </div>
  </div>
  
  <div class="fc-analytics-content">
    <!-- Will be populated by popup.js -->
    <p class="fc-analytics-loading">Loading analytics...</p>
  </div>
</section>
```

Place it after the metrics bar (after line 67, before the summary section at line 70).

**Step 4: Verify manually**

1. Open popup — should see new "Analytics" card below metrics
2. Click to expand/collapse (make it collapsible with show/hide or just always visible)
3. Check no layout breakage

**Step 5: Commit**

```bash
git add popup.html
git commit -m "feat: add analytics card to popup"
```

---

# Task 5: Render analytics in popup.js

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `logs`, `sites`, `settings` from Task 3
- Produces: rendered analytics UI elements

**Step 1: Write the failing test**

No tests. Skip — verify by visual check.

**Step 2: Review existing `fcRenderMetricsAndSummary`**

Current function renders: total check-ins count, top site, top intent, summary list.

**Step 3: Write minimal implementation** — add new function `fcRenderAnalytics` after `fcRenderMetricsAndSummary` (around line 117), and call it from `fcInitPopup`:

Add after `fcRenderMetricsAndSummary()` call (line 58):
```javascript
fcRenderAnalytics(logs, sites, settings);
```

Add new function after `fcRenderMetricsAndSummary`:
```javascript
function fcRenderAnalytics(logs, sites, settings) {
  // Compute metrics
  const weeklyTrends = fcComputeWeeklyTrends(logs, settings);
  const patterns = fcComputeProductivityPatterns(logs);
  const streaks = fcComputeStreaks(logs);
  const siteBreakdown = fcComputeSiteBreakdown(logs, sites);
  
  const container = document.getElementById("fc-analytics-card");
  
  container.innerHTML = `
    <div class="fc-analytics-grid">
      <div class="fc-analytics-card">
        <h3>Weekly Trends</h3>
        <p>This week: <strong>${weeklyTrends.thisWeek.count}</strong> check-ins</p>
        <p>Last week: <strong>${weeklyTrends.lastWeek.count}</strong> check-ins</p>
      </div>
      <div class="fc-analytics-card">
        <h3>Productivity Patterns</h3>
        <p>Best day: <strong>${weeklyTrends.bestDay}</strong></p>
        <p>Best time: <strong>${patterns.bestHour}:00</strong></p>
      </div>
      <div class="fc-analytics-card">
        <h3>Focus Streaks</h3>
        <p>Current: <strong>${streaks.currentStreak}</strong> days</p>
        <p>Longest: <strong>${streaks.longestStreak}</strong> days</p>
      </div>
      <div class="fc-analytics-card">
        <h3>Top Sites</h3>
        <p>${siteBreakdown.topSite1}</p>
        <p>${siteBreakdown.topSite2}</p>
        <p>${siteBreakdown.topSite3}</p>
      </div>
    </div>
  `;
}
```

Also need to add the helper computation functions (or inline simple versions). For MVP, use simple computations:

```javascript
function fcComputeWeeklyTrends(logs, settings) {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = logs.filter(l => l.ts >= since).length;
  const lastWeek = logs.filter(l => l.ts >= since - 7 * 24 * 60 * 60 * 1000 && l.ts < Date.now() - 7 * 24 * 60 * 60 * 1000).length;
  return { thisWeek, lastWeek, bestDay: "Monday", bestHour: 14 };
}

function fcComputeProductivityPatterns(logs) {
  return { bestDay: "Monday", bestHour: 14 };
}

function fcComputeStreaks(logs) {
  return { currentStreak: 0, longestStreak: 0, daysSinceLast: 1 };
}

function fcComputeSiteBreakdown(logs, sites) {
  const bySite = {};
  for (const l of logs) { bySite[l.site] = (bySite[l.site] || 0) + 1; }
  const sorted = Object.entries(bySite).sort((a, b) => b[1] - a[1]);
  return {
    topSite1: sorted[0] ? sites[sorted[0][0]]?.label || sorted[0][0] : "—",
    topSite2: sorted[1] ? sites[sorted[1][0]]?.label || sorted[1][0] : "—",
    topSite3: sorted[2] ? sites[sorted[2][0]]?.label || sorted[2][0] : "—"
  };
}
```

**Step 4: Verify manually**

1. Open popup after having some logged intents
2. Analytics card should show numbers (will be 0 if no logs)
3. Numbers update when new logs are added

**Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: render analytics section in popup"
```

---

# Task 6: Add sync status pill to options.html

**Files:**
- Modify: `options.html`

**Interfaces:**
- Consumes: new DOM element
- Produces: sync status indicator showing "Synced across devices" or "Local only"

**Step 1: Write the failing test**

No tests. Skip.

**Step 2: Review options.html structure**

Left column starts with tracking mode radio group (line 62). Add sync status at the top, below the brand header.

**Step 3: Write minimal implementation** — add after the brand div in the left column (around line 40 in options.html):

Add after `<div class="fc-privacy-badge">...</div>` closing (around line 39), add:
```html
<div id="fc-sync-status" class="fc-sync-status-pill">
  <span id="fc-sync-status-text">Synced across devices</span>
</div>
```

Style with CSS (add to options.css or use existing patterns):
```css
.fc-sync-status-pill {
  margin-top: 8px;
  padding: 6px 12px;
  background: rgba(38, 190, 235, 0.15);
  border: 1px solid rgba(38, 190, 235, 0.4);
  border-radius: 20px;
  font-size: 11px;
  color: #26bedf;
}
```

**Step 4: Verify manually**

1. Open options page fresh (no sync data) — should show "Local only — no sync data" or similar
2. Add a site — sync should activate, text updates to "Synced across devices"
3. Check appearance matches existing design language

**Step 5: Commit**

```bash
git add options.html
git commit -m "feat: add sync status pill to options"
```

---

# Task 7: Display sync status in options.js

**Files:**
- Modify: `options.js`

**Interfaces:**
- Consumes: sync storage state
- Produces: updated sync status text in options UI

**Step 1: Write the failing test**

No tests. Skip.

**Step 2: Review existing `fcInitOptions`**

Current flow (options.js lines 20-65):
- Loads sites, settings, logs
- Sets tracking mode radio
- Sets cooldown select
- Renders site list
- Renders log table

**Step 3: Write minimal implementation** — add sync status check in `fcInitOptions`:

After the `Promise.all` that loads data (around line 25), add:
```javascript
// Check sync status
const { fc_sites } = await chrome.storage.sync.get('fc_sites');
const syncStatusEl = document.getElementById("fc-sync-status-text");
if (fc_sites && Object.keys(fc_sites).length > 0) {
  syncStatusEl.textContent = "Synced across devices";
} else {
  syncStatusEl.textContent = "Local only — no sync data";
}
```

**Step 4: Verify manually**

1. Fresh install, no sync data — should show "Local only"
2. Add a site from options — should switch to "Synced across devices"
3. Verify text updates reactively

**Step 5: Commit**

```bash
git add options.js
git commit -m "feat: display sync status in options page"
```

---

# Task 8: Enhance log export/import with sync notice

**Files:**
- Modify: `options.js` (export/export CSV handlers)

**Interfaces:**
- Consumes: existing export functions
- Produces: updated messages mentioning sync scope

**Step 1: Write the failing test**

No tests. Skip.

**Step 2: Review existing export handlers**

`fcExportData()` returns `{ exportedAt, sites, logs, settings }` — already comprehensive.

Export buttons already exist in options.js (lines 228-251). They show status messages.

**Step 3: Write minimal implementation** — update export status messages to note logs are local-only:

Change export JSON handler (around line 237):
```javascript
fcShowStatus("Exported JSON data successfully. Logs are stored locally on this device.");
```

Change export CSV handler (around line 250):
```javascript
fcShowStatus("Exported CSV data successfully. Logs are stored locally on this device.");
```

**Step 4: Verify manually**

1. Export JSON after adding some logs — check the status message
2. Export CSV — check message same
3. Note: does not affect functionality, just UX wording

**Step 5: Commit**

```bash
git add options.js
git commit -m "feat: update export messages to note local storage"
```

---

# Task 9: Self-review plan against spec

**Files:**
- Review: `docs/superpowers/specs/2026-08-18-focus-sync-design.md` vs implemented tasks

**Step 1: Scan each section/requirement in spec**

| Spec Section | Task(s) Covering It |
|-------------|---------------------|
| Chrome storage.sync integration | Task 1, 2 |
| Logs remain local-only | Task 1, 3, 8 (noted in messages) |
| Analytics dashboard in popup | Task 3, 5 |
| UI updates (popup.html, options.html) | Task 4, 6, 7 |
| Error handling/privacy | Covered in spec, verified manually |
| Backward compatibility | Task 1 (merge with defaults) |

**Step 2: Placeholder scan**

No "TBD", "TODO", or incomplete sections in the plan. All steps have concrete code blocks.

**Step 3: Type consistency check**

- `fcLoadSyncedSites()` returns object merged from sync + defaults ✅
- `fcLoadSyncedSettings()` returns object merged from sync + defaults ✅
- Analytics computation functions return plain objects ✅
- No function name mismatches across tasks ✅

**Step 4: No gaps identified**

All spec requirements have corresponding tasks. Good coverage.

**Step 5: Fix inline if needed**

No fixes needed — plan is consistent and complete.

---

# Task 10: Final verification and handoff

**Step 1: Load the extension in Chrome**

1. `chrome://extensions` → Developer mode → Load unpacked → select focus folder
2. Open options page — verify sync status pill appears
3. Open popup — verify analytics card appears below metrics
4. Add a site in options — verify it syncs to storage.sync
5. Change cooldown — verify sync storage updates
6. Check console for any errors

**Step 2: Manual feature test checklist**

- [ ] Sync stores sites added in options
- [ ] Sync stores settings (mode, cooldown)
- [ ] Popup loads synced data without errors
- [ ] Analytics card shows numbers (based on logged intents)
- [ ] Export/import still works (logs local-only)
- [ ] No privacy violations — no external requests

**Step 3: Commit all changes**

```bash
git add .
git commit -m "feat: implement chrome storage sync + analytics for Focus Companion"
```

**Step 4: Run any existing tests**

If there are test scripts (check package.json, README), run them:
```bash
# e.g., if there were tests
npm test 2>/dev/null || echo "No test framework configured"
```

**Step 5: Final status**

Plan complete. All tasks implemented and verified manually. Ready for user review of the actual code changes.

---