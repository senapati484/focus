/**
 * Focus Companion — background service worker.
 * Initializes default configuration on installation and opens options page.
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
  mode: "managed",
  lastShown: {}
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") return;

  const existing = await chrome.storage.local.get(["fc_sites", "fc_settings", "fc_logs"]);

  const toSet = {};
  if (!existing.fc_sites) toSet.fc_sites = FC_DEFAULT_SITES;
  if (!existing.fc_settings) toSet.fc_settings = FC_DEFAULT_SETTINGS;
  if (!existing.fc_logs) toSet.fc_logs = [];

  if (Object.keys(toSet).length) {
    await chrome.storage.local.set(toSet);
  }

  // Open options page on fresh install
  chrome.runtime.openOptionsPage();
});
