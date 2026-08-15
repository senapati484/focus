/**
 * Focus Companion — content script.
 * Injects a sleek Shadow DOM prompt when visiting distraction sites.
 * Supports keyboard shortcuts, SPA navigation, and tab visibility re-checks.
 */

(function () {
  let isOverlayActive = false;
  let lastCheckedHref = location.href;

  async function checkAndPrompt() {
    if (isOverlayActive) return;

    // Do not run on iframe embeds
    if (window !== window.top) return;

    const [sites, settings] = await Promise.all([fcGetSites(), fcGetSettings()]);
    const siteKey = fcMatchSiteKey(location.hostname, sites, settings);
    if (!siteKey) return;

    const siteLabel = sites[siteKey]?.label || fcFormatLabel(siteKey);

    const shouldPrompt = await fcShouldPrompt(siteKey);
    if (!shouldPrompt) return;

    await fcMarkShown(siteKey);
    renderOverlay(siteKey, siteLabel);
  }

  function renderOverlay(siteKey, siteLabel) {
    if (document.getElementById("fc-overlay-host")) return;

    isOverlayActive = true;

    const host = document.createElement("div");
    host.id = "fc-overlay-host";
    const shadow = host.attachShadow({ mode: "open" });

    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("content.css");
    shadow.appendChild(styleLink);

    const intentsList = [
      {
        key: "bored",
        label: "Bored",
        num: "1",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
      },
      {
        key: "curious",
        label: "Curious",
        num: "2",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`
      },
      {
        key: "studying",
        label: "Study / Work",
        num: "3",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`
      },
      {
        key: "news",
        label: "Checking News",
        num: "4",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2m-4-3H9M9 12h6m-6 4h6"></path></svg>`
      },
      {
        key: "task",
        label: "Quick Task",
        num: "5",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
      },
      {
        key: "doomscroll",
        label: "Doomscrolling",
        num: "6",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>`
      },
      {
        key: "social",
        label: "Social",
        num: "7",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`
      },
      {
        key: "other",
        label: "Something Else",
        num: "8",
        svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      }
    ];

    const wrap = document.createElement("div");
    wrap.className = "fc-wrap";
    wrap.innerHTML = `
      <div class="fc-backdrop"></div>
      <div class="fc-glow" aria-hidden="true"></div>
      <div class="fc-card" role="dialog" aria-modal="true" aria-label="Focus Companion Intent Check-in">
        <button class="fc-dismiss" aria-label="Close prompt" title="Skip (Esc)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div class="fc-header">
          <span class="fc-badge">${siteLabel}</span>
          <span class="fc-shortcut-hint">Press 1-8 to select</span>
        </div>

        <h1 class="fc-question">Why are you visiting ${siteLabel} right now?</h1>
        <p class="fc-subtitle">Log your intent to build mindful browsing habits.</p>

        <div class="fc-options" role="radiogroup" aria-label="Select your intent">
          ${intentsList
            .map(
              (item) => `
            <button class="fc-chip" data-intent="${item.key}" data-num="${item.num}" role="radio" aria-checked="false">
              <span class="fc-chip-icon">${item.svg}</span>
              <span class="fc-chip-label">${item.label}</span>
              <span class="fc-chip-num">${item.num}</span>
            </button>
          `
            )
            .join("")}
        </div>

        <div class="fc-note-wrap">
          <input class="fc-note" type="text" maxlength="140" placeholder="Add optional note (e.g. searching for a video)..." />
        </div>

        <div class="fc-actions">
          <button class="fc-submit" disabled>
            <span>Log Intent</span>
            <kbd class="fc-kbd">↵</kbd>
          </button>
          <button class="fc-skip">Skip for now</button>
        </div>

        <footer class="fc-footer">
          100% Private • Stored on this device only
        </footer>
      </div>
    `;
    shadow.appendChild(wrap);
    document.documentElement.appendChild(host);

    let selectedIntent = null;
    const chips = shadow.querySelectorAll(".fc-chip");
    const submitBtn = shadow.querySelector(".fc-submit");
    const noteInput = shadow.querySelector(".fc-note");

    function selectIntent(key) {
      chips.forEach((c) => {
        const isMatch = c.dataset.intent === key;
        c.classList.toggle("fc-chip-selected", isMatch);
        c.setAttribute("aria-checked", isMatch ? "true" : "false");
      });
      selectedIntent = key;
      submitBtn.disabled = false;
    }

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        selectIntent(chip.dataset.intent);
      });
    });

    const closeOverlay = () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      wrap.classList.add("fc-closing");
      setTimeout(() => {
        host.remove();
        isOverlayActive = false;
      }, 160);
    };

    async function handleLog() {
      if (!selectedIntent) return;
      submitBtn.disabled = true;
      submitBtn.innerText = "Saving...";
      await fcAddLog({ site: siteKey, intent: selectedIntent, note: noteInput.value });
      closeOverlay();
    }

    submitBtn.addEventListener("click", handleLog);
    shadow.querySelector(".fc-skip").addEventListener("click", closeOverlay);
    shadow.querySelector(".fc-dismiss").addEventListener("click", closeOverlay);

    // Keyboard Shortcuts handler
    function handleKeyDown(e) {
      if (e.target === noteInput) {
        if (e.key === "Enter" && selectedIntent) {
          e.preventDefault();
          handleLog();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeOverlay();
        }
        return;
      }

      if (e.key >= "1" && e.key <= "8") {
        const idx = parseInt(e.key, 10) - 1;
        if (intentsList[idx]) {
          e.preventDefault();
          selectIntent(intentsList[idx].key);
        }
      } else if (e.key === "Enter" && selectedIntent) {
        e.preventDefault();
        handleLog();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
  }

  // Initial check
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkAndPrompt);
  } else {
    checkAndPrompt();
  }

  // Tab visibility listener
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAndPrompt();
    }
  });

  // SPA navigation polling listener
  setInterval(() => {
    if (location.href !== lastCheckedHref) {
      lastCheckedHref = location.href;
      checkAndPrompt();
    }
  }, 2000);
})();
