/**
 * Focus Companion — storage helpers
 * Single source of truth for the local data model. No network calls.
 *
 * chrome.storage.local shape:
 *   fc_sites:    { [hostnameKey]: { label: string, enabled: boolean, custom?: boolean } }
 *   fc_logs:     Array<{ id, ts, site, intent, note }>
 *   fc_settings: { cooldownMinutes: number, mode: "managed" | "all", lastShown: { [hostnameKey]: ts } }
 */

const FC_DEFAULT_SITES = {
  "instagram.com": { label: "Instagram", enabled: true },
  "youtube.com": { label: "YouTube", enabled: true },
  "x.com": { label: "X / Twitter", enabled: true },
  "twitter.com": { label: "Twitter", enabled: true },
  "reddit.com": { label: "Reddit", enabled: true },
  "tiktok.com": { label: "TikTok", enabled: true },
  "facebook.com": { label: "Facebook", enabled: false },
  "linkedin.com": { label: "LinkedIn", enabled: false },
  "twitch.tv": { label: "Twitch", enabled: false },
  "netflix.com": { label: "Netflix", enabled: false }
};

const FC_DEFAULT_SETTINGS = {
  cooldownMinutes: 20,
  mode: "managed", // "managed" (only listed enabled sites) or "all" (all sites except disabled ones)
  lastShown: {}
};

const FC_INTENT_MAP = {
  bored: { label: "Bored", icon: "🥱" },
  curious: { label: "Curious", icon: "🔍" },
  studying: { label: "Studying / work", icon: "📚" },
  news: { label: "Checking news", icon: "📰" },
  task: { label: "Quick task", icon: "⚡" },
  doomscroll: { label: "Doomscrolling", icon: "🌀" },
  social: { label: "Social", icon: "💬" },
  other: { label: "Something else", icon: "❓" }
};

// ---- low-level get/set ----------------------------------------------------

function fcGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function fcSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

// ---- domain formatting ---------------------------------------------------

function fcCleanDomain(hostname) {
  if (!hostname) return "";
  let clean = hostname.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  clean = clean.replace(/^www\./, "");
  return clean;
}

function fcFormatLabel(domain) {
  const clean = fcCleanDomain(domain);
  if (!clean) return "Website";
  const parts = clean.split(".");
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---- site config ------------------------------------------------------------

async function fcGetSites() {
  const { fc_sites } = await fcGet("fc_sites");
  return fc_sites ? { ...FC_DEFAULT_SITES, ...fc_sites } : FC_DEFAULT_SITES;
}

async function fcSetSites(sites) {
  await fcSet({ fc_sites: sites });
}

async function fcAddCustomSite(domain, customLabel) {
  const clean = fcCleanDomain(domain);
  if (!clean) return null;
  const sites = await fcGetSites();
  const label = (customLabel && customLabel.trim()) || sites[clean]?.label || fcFormatLabel(clean);
  sites[clean] = { label, enabled: true, custom: true };
  await fcSetSites(sites);
  return clean;
}

async function fcRemoveSite(domain) {
  const clean = fcCleanDomain(domain);
  if (!clean) return;
  const sites = await fcGetSites();
  if (sites[clean]) {
    delete sites[clean];
    await fcSetSites(sites);
  }
}

async function fcToggleSite(domain, enabled) {
  const clean = fcCleanDomain(domain);
  if (!clean) return;
  const sites = await fcGetSites();
  if (!sites[clean]) {
    sites[clean] = { label: fcFormatLabel(clean), enabled: Boolean(enabled) };
  } else {
    sites[clean].enabled = Boolean(enabled);
  }
  await fcSetSites(sites);
}

/**
 * Match a hostname against configured sites & settings mode.
 * Returns siteKey string or null if prompt shouldn't run.
 */
function fcMatchSiteKey(hostname, sites, settings) {
  const clean = fcCleanDomain(hostname);
  if (!clean) return null;

  // Check if domain matches an explicitly configured site
  const matchedKey = Object.keys(sites).find(
    (key) => clean === key || clean.endsWith("." + key)
  );

  const mode = settings?.mode || "managed";

  if (matchedKey) {
    const siteConfig = sites[matchedKey];
    if (siteConfig && siteConfig.enabled === false) {
      return null; // Explicitly disabled
    }
    return matchedKey;
  }

  // If in "all" websites mode, trigger for unconfigured sites as well
  if (mode === "all") {
    // Exclude extension pages, local files, chrome internal URLs
    if (clean === "localhost" || clean.endsWith(".local") || clean.includes("127.0.0.1")) {
      return null;
    }
    return clean;
  }

  return null;
}

// ---- settings / cooldown ---------------------------------------------------

async function fcGetSettings() {
  const { fc_settings } = await fcGet("fc_settings");
  return { ...FC_DEFAULT_SETTINGS, ...(fc_settings || {}) };
}

async function fcSetSettings(settings) {
  await fcSet({ fc_settings: settings });
}

async function fcShouldPrompt(siteKey) {
  const settings = await fcGetSettings();
  const last = settings.lastShown[siteKey] || 0;
  const cooldownMs = (settings.cooldownMinutes || 20) * 60 * 1000;
  return Date.now() - last >= cooldownMs;
}

async function fcMarkShown(siteKey) {
  const settings = await fcGetSettings();
  settings.lastShown = settings.lastShown || {};
  settings.lastShown[siteKey] = Date.now();
  await fcSetSettings(settings);
}

// ---- logs -------------------------------------------------------------------

async function fcGetLogs() {
  const { fc_logs } = await fcGet("fc_logs");
  return fc_logs || [];
}

async function fcAddLog({ site, intent, note }) {
  const logs = await fcGetLogs();
  logs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    site,
    intent,
    note: (note || "").slice(0, 280)
  });
  const MAX_ENTRIES = 5000;
  const trimmed = logs.length > MAX_ENTRIES ? logs.slice(logs.length - MAX_ENTRIES) : logs;
  await fcSet({ fc_logs: trimmed });
}

async function fcDeleteLog(id) {
  const logs = await fcGetLogs();
  const filtered = logs.filter((l) => l.id !== id);
  await fcSet({ fc_logs: filtered });
}

async function fcClearAllData() {
  await new Promise((resolve) => chrome.storage.local.clear(resolve));
}

async function fcExportData() {
  const [sites, logs, settings] = await Promise.all([
    fcGetSites(),
    fcGetLogs(),
    fcGetSettings()
  ]);
  return { exportedAt: new Date().toISOString(), sites, logs, settings };
}

function fcExportCSV(logs, sites) {
  const headers = ["Timestamp", "Date", "Site", "Site Label", "Intent", "Intent Label", "Note"];
  const rows = logs.map((l) => {
    const d = new Date(l.ts).toISOString();
    const siteLabel = sites[l.site]?.label || fcFormatLabel(l.site);
    const intentObj = FC_INTENT_MAP[l.intent] || { label: l.intent };
    const safeNote = (l.note || "").replace(/"/g, '""');
    return `"${d}","${d.slice(0, 10)}","${l.site}","${siteLabel}","${l.intent}","${intentObj.label}","${safeNote}"`;
  });
  return [headers.join(","), ...rows].join("\n");
}

// ---- weekly aggregation -----------------------------------------------------

function fcComputeWeekSummary(logs, sites, days = 7) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = logs.filter((l) => l.ts >= since);

  const bySite = {};
  for (const l of recent) {
    bySite[l.site] ??= { count: 0, intents: {} };
    bySite[l.site].count += 1;
    bySite[l.site].intents[l.intent] = (bySite[l.site].intents[l.intent] || 0) + 1;
  }

  return Object.entries(bySite)
    .map(([site, data]) => {
      const topIntent = Object.entries(data.intents).sort((a, b) => b[1] - a[1])[0];
      return {
        site,
        label: sites[site]?.label || fcFormatLabel(site),
        count: data.count,
        topIntent: topIntent ? topIntent[0] : null,
        topIntentCount: topIntent ? topIntent[1] : 0,
        intents: data.intents
      };
    })
    .sort((a, b) => b.count - a.count);
}
