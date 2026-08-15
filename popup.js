/**
 * Focus Companion — popup dashboard logic.
 */

const FC_INTENT_LABELS = {
  bored: "Bored",
  curious: "Curious",
  studying: "Study / Work",
  news: "News",
  task: "Quick Task",
  doomscroll: "Doomscrolling",
  social: "Social",
  other: "Other"
};

async function fcInitPopup() {
  const [logs, sites, settings] = await Promise.all([
    fcGetLogs(),
    fcGetSites(),
    fcGetSettings()
  ]);

  // 1. Handle Active Tab Detection & Quick Site Toggle
  let currentDomain = "";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url) {
      const url = new URL(tabs[0].url);
      if (url.protocol.startsWith("http")) {
        currentDomain = fcCleanDomain(url.hostname);
      }
    }
  } catch (e) {
    console.error("Focus Companion: Active tab lookup error", e);
  }

  const activeDomainEl = document.getElementById("fc-active-domain");
  const activeToggleEl = document.getElementById("fc-active-toggle");

  if (currentDomain) {
    activeDomainEl.textContent = currentDomain;
    const isExplicitlyDisabled = sites[currentDomain] && sites[currentDomain].enabled === false;
    const isEnabled = sites[currentDomain]?.enabled ?? (settings.mode === "all" ? true : false);
    
    activeToggleEl.checked = isEnabled && !isExplicitlyDisabled;
    activeToggleEl.disabled = false;

    activeToggleEl.addEventListener("change", async (e) => {
      await fcToggleSite(currentDomain, e.target.checked);
      fcRenderMetricsAndSummary();
    });
  } else {
    activeDomainEl.textContent = "Browser Page";
    activeToggleEl.disabled = true;
  }

  // 2. Render Metrics and Summary
  fcRenderMetricsAndSummary();
}

async function fcRenderMetricsAndSummary() {
  const [logs, sites] = await Promise.all([fcGetLogs(), fcGetSites()]);
  const summary = fcComputeWeekSummary(logs, sites, 7);

  // Metrics computation
  const totalLogsWeek = summary.reduce((sum, item) => sum + item.count, 0);
  const topSiteItem = summary[0];
  
  // Find top intent overall
  const intentCounts = {};
  logs.forEach((l) => {
    intentCounts[l.intent] = (intentCounts[l.intent] || 0) + 1;
  });
  const topOverallIntentKey = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topIntentLabel = FC_INTENT_LABELS[topOverallIntentKey] || topOverallIntentKey || "—";

  document.getElementById("fc-metric-total").textContent = totalLogsWeek;
  document.getElementById("fc-metric-top-site").textContent = topSiteItem ? topSiteItem.label : "—";
  document.getElementById("fc-metric-top-intent").textContent = topIntentLabel;

  const container = document.getElementById("fc-summary-list");

  if (summary.length === 0) {
    container.innerHTML = `
      <div class="fc-empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 6px; color: #64748B;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <p class="fc-empty-text">No check-ins yet this week. When you visit tracked websites, your intent responses will be summarized here.</p>
      </div>
    `;
    return;
  }

  const maxCount = summary[0].count || 1;

  container.innerHTML = summary
    .map((row) => {
      const intentLabel = FC_INTENT_LABELS[row.topIntent] || row.topIntent || "—";
      const pct = Math.max(8, Math.round((row.count / maxCount) * 100));

      return `
        <div class="fc-summary-row">
          <div class="fc-summary-top">
            <span class="fc-site-label">${row.label}</span>
            <span class="fc-site-count">${row.count}×</span>
          </div>
          <div class="fc-bar-track">
            <div class="fc-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="fc-summary-sub">
            <span>Mostly <strong>${intentLabel}</strong></span>
            <span>${row.topIntentCount}/${row.count}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

// Button Listeners
document.getElementById("fc-settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("fc-export-json").addEventListener("click", async () => {
  const data = await fcExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focus-companion-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("fc-export-csv").addEventListener("click", async () => {
  const [logs, sites] = await Promise.all([fcGetLogs(), fcGetSites()]);
  const csv = fcExportCSV(logs, sites);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focus-companion-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("fc-clear-btn").addEventListener("click", async () => {
  const ok = confirm("Are you sure you want to clear all local data? This cannot be undone.");
  if (!ok) return;
  await fcClearAllData();
  fcInitPopup();
});

fcInitPopup();
