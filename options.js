/**
 * Focus Companion — options & management dashboard.
 */

let allLogs = [];
let allSites = {};
let currentSettings = {};

const FC_INTENT_CONFIG = {
  bored: { label: "Bored", badgeClass: "fc-intent-bored" },
  curious: { label: "Curious", badgeClass: "fc-intent-curious" },
  studying: { label: "Study / Work", badgeClass: "fc-intent-study" },
  news: { label: "Checking News", badgeClass: "fc-intent-news" },
  task: { label: "Quick Task", badgeClass: "fc-intent-task" },
  doomscroll: { label: "Doomscrolling", badgeClass: "fc-intent-doomscroll" },
  social: { label: "Social", badgeClass: "fc-intent-social" },
  other: { label: "Something Else", badgeClass: "fc-intent-other" }
};

async function fcInitOptions() {
  const [sites, settings, logs] = await Promise.all([
    fcGetSites(),
    fcGetSettings(),
    fcGetLogs()
  ]);

  allSites = sites;
  currentSettings = settings;
  allLogs = logs;

  // Check sync status
  const { fc_sites } = await chrome.storage.sync.get('fc_sites');
  const syncStatusEl = document.getElementById("fc-sync-status-text");
  if (fc_sites && Object.keys(fc_sites).length > 0) {
    syncStatusEl.textContent = "Synced across devices";
  } else {
    syncStatusEl.textContent = "Local only — no sync data";
  }

  // 1. Set Tracking Mode Radio
  const modeManagedRadio = document.getElementById("fc-mode-managed");
  const modeAllRadio = document.getElementById("fc-mode-all");
  
  if (settings.mode === "all") {
    modeAllRadio.checked = true;
  } else {
    modeManagedRadio.checked = true;
  }

  [modeManagedRadio, modeAllRadio].forEach((radio) => {
    radio.addEventListener("change", async (e) => {
      if (e.target.checked) {
        currentSettings.mode = e.target.value;
        await fcSetSettings(currentSettings);
        fcShowStatus(`Tracking mode set to ${e.target.value === "all" ? "All Websites Mode" : "Managed Sites Only"}`);
      }
    });
  });

  // 2. Set Cooldown Select
  const cooldownSelect = document.getElementById("fc-cooldown-select");
  cooldownSelect.value = String(settings.cooldownMinutes || 20);
  cooldownSelect.addEventListener("change", async (e) => {
    currentSettings.cooldownMinutes = Number(e.target.value);
    await fcSetSettings(currentSettings);
    fcShowStatus(`Cooldown set to ${e.target.value} minutes.`);
  });

  // 3. Render Site Directory
  fcRenderSiteList();

  // 4. Render Log History Table
  fcRenderLogTable();
}

function fcRenderSiteList() {
  const container = document.getElementById("fc-site-list");
  const entries = Object.entries(allSites);

  if (entries.length === 0) {
    container.innerHTML = `<p class="fc-empty-state-cell">No sites configured. Add one above.</p>`;
    return;
  }

  container.innerHTML = entries
    .map(([key, site]) => {
      const isCustom = site.custom;
      return `
        <div class="fc-site-item">
          <div class="fc-site-info">
            <label class="fc-switch" title="Toggle tracking for ${site.label}">
              <input type="checkbox" data-site="${key}" ${site.enabled !== false ? "checked" : ""} />
              <span class="fc-slider"></span>
            </label>
            <span class="fc-site-name">${site.label}</span>
            <code class="fc-site-domain">${key}</code>
          </div>
          ${isCustom ? `
            <button class="fc-btn-icon fc-btn-remove-site" data-remove="${key}" title="Delete site from directory">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ""}
        </div>
      `;
    })
    .join("");

  // Attach toggle listeners
  container.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const siteKey = e.target.dataset.site;
      await fcToggleSite(siteKey, e.target.checked);
      allSites = await fcGetSites();
    });
  });

  // Attach remove listeners
  container.querySelectorAll(".fc-btn-remove-site").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const siteKey = e.currentTarget.dataset.remove;
      if (confirm(`Remove ${siteKey} from site directory?`)) {
        await fcRemoveSite(siteKey);
        allSites = await fcGetSites();
        fcRenderSiteList();
        fcShowStatus(`Removed site: ${siteKey}`);
      }
    });
  });
}

// Handle Add Site Form
document.getElementById("fc-add-site-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const domainInput = document.getElementById("fc-new-domain");
  const labelInput = document.getElementById("fc-new-label");

  const domain = domainInput.value;
  const label = labelInput.value;

  const addedKey = await fcAddCustomSite(domain, label);
  if (addedKey) {
    domainInput.value = "";
    labelInput.value = "";
    allSites = await fcGetSites();
    fcRenderSiteList();
    fcShowStatus(`Added ${addedKey} to directory`);
  }
});

function fcRenderLogTable() {
  const searchQuery = document.getElementById("fc-log-search").value.toLowerCase().trim();
  const intentFilter = document.getElementById("fc-intent-filter").value;
  const tbody = document.getElementById("fc-log-table-body");
  const countBadge = document.getElementById("fc-log-count");

  let filtered = [...allLogs];

  if (intentFilter) {
    filtered = filtered.filter((l) => l.intent === intentFilter);
  }

  if (searchQuery) {
    filtered = filtered.filter((l) => {
      const siteLabel = (allSites[l.site]?.label || l.site).toLowerCase();
      const note = (l.note || "").toLowerCase();
      return l.site.toLowerCase().includes(searchQuery) || siteLabel.includes(searchQuery) || note.includes(searchQuery);
    });
  }

  countBadge.textContent = `${filtered.length} log${filtered.length === 1 ? "" : "s"}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="fc-empty-state-cell">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-dim);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>No intent logs found matching your filters.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  // Sort descending by timestamp
  filtered.sort((a, b) => b.ts - a.ts);

  tbody.innerHTML = filtered
    .map((log) => {
      const d = new Date(log.ts);
      const timeFormatted = d.toLocaleDateString([], { month: "short", day: "numeric" }) + " • " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const siteLabel = allSites[log.site]?.label || fcFormatLabel(log.site);
      const intentInfo = FC_INTENT_CONFIG[log.intent] || { label: log.intent };

      return `
        <tr>
          <td class="fc-time-cell">${timeFormatted}</td>
          <td>
            <div class="fc-site-cell">
              <strong>${siteLabel}</strong>
              <small>${log.site}</small>
            </div>
          </td>
          <td>
            <span class="fc-intent-badge">
              ${intentInfo.label}
            </span>
          </td>
          <td class="fc-note-cell" title="${log.note ? log.note.replace(/"/g, '&quot;') : ''}">${log.note ? `"${log.note}"` : "—"}</td>
          <td class="fc-action-cell">
            <button class="fc-btn-icon fc-btn-del-log" data-id="${log.id}" title="Delete log entry">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Attach log delete listeners
  tbody.querySelectorAll(".fc-btn-del-log").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.dataset.id;
      await fcDeleteLog(id);
      allLogs = await fcGetLogs();
      fcRenderLogTable();
    });
  });
}

// Search and Filter Listeners
document.getElementById("fc-log-search").addEventListener("input", fcRenderLogTable);
document.getElementById("fc-intent-filter").addEventListener("change", fcRenderLogTable);

// Export JSON
document.getElementById("fc-export-json-btn").addEventListener("click", async () => {
  const data = await fcExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focus-companion-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  fcShowStatus("Exported JSON data successfully. Logs are stored locally on this device.");
});

// Export CSV
document.getElementById("fc-export-csv-btn").addEventListener("click", async () => {
  const csv = fcExportCSV(allLogs, allSites);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focus-companion-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  fcShowStatus("Exported CSV data successfully. Logs are stored locally on this device.");
});

// Clear All Data
document.getElementById("fc-clear-all-btn").addEventListener("click", async () => {
  const ok = confirm("Are you sure you want to delete ALL local data? This action cannot be undone.");
  if (!ok) return;
  await fcClearAllData();
  allLogs = [];
  allSites = await fcGetSites();
  currentSettings = await fcGetSettings();
  fcInitOptions();
  fcShowStatus("All local data has been erased.");
});

function fcShowStatus(msg) {
  const el = document.getElementById("fc-status-msg");
  el.textContent = msg;
  setTimeout(() => {
    if (el.textContent === msg) el.textContent = "";
  }, 3500);
}

fcInitOptions();
