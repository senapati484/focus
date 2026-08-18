# Focus Companion — Chrome Storage Sync + Analytics Design

**Date:** 2026-08-18
**Author:** Collaborative design session
**Status:** Approved

---

## 1. Overview

Enable cross-device continuity for Focus Companion settings and site configuration via Chrome storage.sync, while preserving the "no accounts, no uploads, 100% private" philosophy. The full intent log history remains local-only on each device, with manual export/import available for users who want to transfer data.

## 2. Goals

| Goal | Description |
|------|-------------|
| **Cross-device settings sync** | `mode`, `cooldownMinutes`, and configured site list sync across Chrome profiles/browsers where user is signed into Chrome |
| **Zero-account sync** | No Google login, no Firebase, no user accounts required — syncs via Chrome's built-in storage.sync |
| **Privacy preserved** | Full intent logs (`fc_logs`) stay local; user controls what moves via manual export |
| **Analytics in popup** | New dashboard section showing weekly trends, productivity patterns, focus streaks, site breakdowns |
| **Backward compatible** | Existing behavior unchanged for new installs; sync optional and opt-in in spirit |

## 3. Non-Goals (Out of Scope)

- ❌ Firebase backend or any external server
- ❌ Google account authentication
- ❌ Real-time cross-device updates (Chrome storage.sync has eventual consistency)
- ❌ Cloud storage or third-party integration
- ❌ Automatic log sync (logs remain local-only)

## 4. Data Model

### 4.1 `chrome.storage.sync` — Synced Across Devices

| Key | Type | Description |
|-----|------|-------------|
| `fc_settings` | Object | `{ mode: "managed" \| "all", cooldownMinutes: number, lastShown: { [hostname]: timestamp } }` |
| `fc_sites` | Object | `{ [hostnameKey]: { label: string, enabled: boolean, custom: boolean } }` |

### 4.2 `chrome.storage.local` — Device-Local Only

| Key | Type | Description |
|-----|------|-------------|
| `fc_logs` | Array | `{ id, ts, site, intent, note }` — full intent history, never auto-synced |
| Transient UI state | Various | Open overlay state, popup open/closed, etc. |

### 4.3 Migration for New Installs

On first run (no `fc_sites` or `fc_settings` in sync storage):
- Fall back to `chrome.storage.local` defaults (`FC_DEFAULT_SITES`, `FC_DEFAULT_SETTINGS`)
- Begin syncing going forward; no manual migration needed

## 5. Sync Flow

### 5.1 Initialization

```javascript
// popup.js init
async function fcInitPopup() {
  const [logs, sites, settings] = await Promise.all([
    fcGetLogs(),                // local only
    fcLoadSyncedSites(),        // sync + local merge
    fcLoadSyncedSettings()      // sync + local merge
  ]);
  // ... rest of init
}
```

### 5.2 Settings Change → Sync

```javascript
// When user changes mode or cooldown in options
async function fcSetSettings(settings) {
  // Update local storage
  await fcSetSettingsLocal(settings);
  // Sync to other devices
  await chrome.storage.sync.set({ fc_settings: settings });
}
```

### 5.3 Site Configuration → Sync

```javascript
// When user adds/removes/toggles a site
async function fcSyncSitesAfterChange() {
  const sites = await fcGetSites();        // reads merged local+sync
  await chrome.storage.sync.set({ fc_sites: sites });
}
```

### 5.4 Logs — Never Auto-Synced

- `fc_logs` stays in `chrome.storage.local` only
- User can manually export via "Export JSON" in options
- User can manually import via "Import JSON" (adds to existing local logs)

## 6. Analytics Dashboard (New in Popup)

Added to `popup.html` and `popup.js`. Five metric categories:

| Category | Description |
|----------|-------------|
| **Weekly Trends** | This week vs. last week: check-in count, top site, top intent comparison |
| **Productivity Patterns** | Best day of week (most check-ins), best time of day (hour distribution heatmap) |
| **Focus Streaks** | Current streak (days in row with check-in), longest streak ever, days since last check-in |
| **Site Breakdown** | Top 3 sites by prompt count, intent distribution donut per site |
| **Total Logs** | Count of all logged intents (local only) |

### 6.1 Data Computation (popup.js)

```javascript
function fcComputeWeeklyTrends(logs, sites, days = 7) {
  // Returns: { thisWeek: { count, topSite, topIntent }, lastWeek: same }
}

function fcComputeProductivityPatterns(logs, sites) {
  // Returns: { bestDay: string, bestHour: number, distribution: { [hour]: count } }
}

function fcComputeStreaks(logs) {
  // Returns: { currentStreak: number, longestStreak: number, daysSinceLast: number }
}

function fcComputeSiteBreakdown(logs, sites) {
  // Returns: top 3 sites with counts and intent maps
}
```

## 7. UI Changes

### 7.1 `popup.html`

- Add new collapsible section `"Analytics"` below the metrics bar
- Include placeholders for: weekly comparison chart, productivity patterns, streaks info, site breakdown

### 7.2 `popup.js`

- `fcInitPopup()` — call `fcLoadSyncedSites()` and `fcLoadSyncedSettings()` 
- `fcRenderMetricsAndSummary()` — add analytics section rendering after metrics
- New function `fcRenderAnalytics()` — renders all five metric categories

### 7.3 `options.html`

- Add `"Sync Status"` pill at top of left column
  - Shows: `"Synced across devices"` or `"Local only — no sync data"`
- Add tooltip: `"Settings and site list sync across Chrome browsers. Logs remain on this device."`

### 7.4 `options.js`

- `fcInitOptions()` — show sync status based on whether `fc_sites` exists in sync storage
- Add manual export/import buttons for logs (already exist, enhance with sync notice)

## 8. Storage.js Modifications

### 8.1 New Functions

```javascript
async function fcLoadSyncedSites() {
  const { fc_sites } = await chrome.storage.sync.get('fc_sites');
  // Merge with defaults, return object
  const defaults = await fcGetSites();
  return { ...defaults, ...fc_sites };
}

async function fcLoadSyncedSettings() {
  const { fc_settings } = await chrome.storage.sync.get('fc_settings');
  // Merge with defaults
  const defaults = FC_DEFAULT_SETTINGS;
  return { ...defaults, ...fc_settings };
}

async function fcSyncSites() {
  const sites = await fcGetSites();
  await chrome.storage.sync.set({ fc_sites: sites });
}
```

### 8.2 Modified Functions

```javascript
// fcSetSites — also sync after write
async function fcSetSites(sites) {
  await fcSet({ fc_sites: sites });
  await fcSyncSites(); // push to sync storage
}

// fcSetSettings — also sync after write
async function fcSetSettings(settings) {
  await fcSet({ fc_settings: settings });
  await chrome.storage.sync.set({ fc_settings: settings });
}
```

## 9. Error Handling

| Scenario | Handling |
|----------|----------|
| **Sync quota exceeded** (rare, ~5MB limit) | Show warning in options page: "Sync storage nearly full. Some settings may not sync." Gracefully degrade to local-only. |
| **Sync fails** (network offline, permissions) | Log error to console. Continue with local data only. Show transient "Sync unavailable" badge in options. |
| **Conflict** (simultaneous changes on two devices) | Chrome storage.sync resolves via last-write-wins; minor race condition acceptable for MVP. |
| **First run, no sync data** | Show welcome message: `"Welcome! Your settings will sync across Chrome browsers where you're signed in."` |

## 10. Privacy & Safety

- ✅ No accounts, no passwords, no third-party services
- ✅ Data stored in Chrome storage (same security model as other site data)
- ✅ User can clear all data anytime via "Clear All Data"
- ✅ Logs never auto-uploaded; manual export only at user's request
- ✅ Sync opt-in by default — user must have Chrome signed in for sync to work
- ✅ No tracking, no analytics sent to external services

## 11. Implementation Checklist

- [ ] Add `fcLoadSyncedSites()` and `fcLoadSyncedSettings()` to `utils/storage.js`
- [ ] Add sync calls in `fcSetSites()` and `fcSetSettings()` 
- [ ] Modify `popup.js` — init sync loading, render analytics section
- [ ] Modify `popup.html` — add analytics collapsible section
- [ ] Modify `options.html` — add sync status pill
- [ ] Modify `options.js` — display sync status, enhance export/import
- [ ] Self-review spec for placeholders/contradictions
- [ ] User reviews written spec
- [ ] Invoke writing-plans skill to create implementation plan

## 12. Out of Scope for This Design

- Custom intent labels (beyond the 8 existing)
- Goal setting / daily targets
- "Focus mode" auto-blocking
- Any backend or server component
- Mobile/web app version

---