/**
 * app.js — main controller
 * ---------------------------------------------------------------------------
 * Wires together speech.js (voice I/O), nlp.js (intent parsing), and
 * data.js (catalog / suggestions) and renders the UI. Kept framework-free
 * on purpose: the whole app is a static bundle of HTML/CSS/JS that can be
 * dropped on any static host (see README "Deployment").
 * ---------------------------------------------------------------------------
 */

(function () {
  "use strict";

  const { categorize, SUBSTITUTES, getSeasonalSuggestions, getRunningLowSuggestions, searchCatalog } = window.AssistantData;
  const { parseCommand } = window.AssistantNLP;
  const { SpeechController, SUPPORTED_LANGUAGES } = window.AssistantSpeech;

  // ---- State --------------------------------------------------------------
  /** @type {{id:string, name:string, qty:number, category:string, icon:string, done:boolean}[]} */
  let list = [];
  let dismissedSuggestions = new Set();

  // ---- DOM refs -------------------------------------------------------------
  const el = {
    micBtn: document.getElementById("micBtn"),
    micStatus: document.getElementById("micStatus"),
    waveform: document.getElementById("waveform"),
    transcriptFeed: document.getElementById("transcriptFeed"),
    listContainer: document.getElementById("listContainer"),
    emptyState: document.getElementById("emptyState"),
    itemCount: document.getElementById("itemCount"),
    langSelect: document.getElementById("langSelect"),
    suggestionsTray: document.getElementById("suggestionsTray"),
    textFallbackForm: document.getElementById("textFallbackForm"),
    textFallbackInput: document.getElementById("textFallbackInput"),
    searchResults: document.getElementById("searchResults"),
    searchResultsList: document.getElementById("searchResultsList"),
    closeSearch: document.getElementById("closeSearch"),
    toast: document.getElementById("toast"),
  };

  // ---- Speech setup -----------------------------------------------------
  const speech = new SpeechController();

  function populateLanguages() {
    el.langSelect.innerHTML = SUPPORTED_LANGUAGES.map(
      (l) => `<option value="${l.code}">${l.label}</option>`
    ).join("");
  }

  el.langSelect.addEventListener("change", (e) => speech.setLanguage(e.target.value));

  speech.onStateChange = (isListening) => {
    el.micBtn.classList.toggle("listening", isListening);
    el.waveform.classList.toggle("active", isListening);
    el.micStatus.textContent = isListening ? "Listening…" : "Tap to speak";
  };

  speech.onInterim = (text) => {
    setLiveLine(text, true);
  };

  speech.onFinal = (text) => {
    setLiveLine(text, false);
    handleUtterance(text);
  };

  speech.onError = (message) => {
    showToast(message, "error");
    el.micStatus.textContent = "Tap to speak";
  };

  el.micBtn.addEventListener("click", () => {
    if (!speech.supported) {
      showToast("Voice recognition isn't supported here — use the text box below instead.", "error");
      return;
    }
    if (speech.listening) speech.stop();
    else speech.start();
  });

  // Text fallback (also useful for desktop demos / accessibility)
  el.textFallbackForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = el.textFallbackInput.value.trim();
    if (!text) return;
    el.textFallbackInput.value = "";
    handleUtterance(text);
  });

  el.closeSearch.addEventListener("click", () => el.searchResults.classList.add("hidden"));

  // ---- Transcript feed (live visual feedback, "receipt tape") -------------
  let liveLineEl = null;
  function setLiveLine(text, interim) {
    if (!liveLineEl) {
      liveLineEl = document.createElement("div");
      liveLineEl.className = "transcript-line interim";
      el.transcriptFeed.prepend(liveLineEl);
    }
    liveLineEl.textContent = `“${text}”`;
    liveLineEl.classList.toggle("interim", interim);
    if (!interim) liveLineEl = null; // next utterance starts a fresh line
  }

  function logAction(message, tone = "ok") {
    const line = document.createElement("div");
    line.className = `transcript-line action ${tone}`;
    line.textContent = message;
    el.transcriptFeed.prepend(line);
    // Cap history so the DOM doesn't grow unbounded during a long session
    while (el.transcriptFeed.children.length > 25) {
      el.transcriptFeed.removeChild(el.transcriptFeed.lastChild);
    }
  }

  // ---- Core command handling ------------------------------------------------
  function handleUtterance(rawText) {
    let parsed;
    try {
      parsed = parseCommand(rawText);
    } catch (err) {
      showToast("Something went wrong understanding that command.", "error");
      return;
    }

    switch (parsed.intent) {
      case "ADD":
        if (!parsed.item) return logAction(`Didn't catch an item name in "${rawText}".`, "error");
        addItem(parsed.item, parsed.qty);
        break;
      case "REMOVE":
        if (!parsed.item) return logAction(`Didn't catch what to remove in "${rawText}".`, "error");
        removeItemByName(parsed.item);
        break;
      case "MODIFY_QTY":
        modifyQuantity(parsed.item, parsed.qty);
        break;
      case "SEARCH":
        runSearch(parsed);
        break;
      default:
        logAction(`Sorry, I didn't understand "${rawText}".`, "error");
        speech.speak("Sorry, I didn't catch that.");
    }
  }

  function addItem(name, qty = 1) {
    const clean = name.trim().toLowerCase();
    const existing = list.find((i) => i.name === clean);
    if (existing) {
      existing.qty += qty;
    } else {
      const { category, icon } = categorize(clean);
      list.push({ id: crypto.randomUUID(), name: clean, qty, category, icon, done: false });
    }
    render();
    const msg = `Added ${qty > 1 ? qty + " " : ""}${clean}`;
    logAction(`✅ ${msg}`, "ok");
    speech.speak(msg);
    maybeOfferSubstitute(clean);
  }

  function removeItemByName(name) {
    const clean = name.trim().toLowerCase();
    const idx = list.findIndex((i) => i.name.includes(clean) || clean.includes(i.name));
    if (idx === -1) {
      logAction(`⚠️ "${clean}" isn't on your list.`, "error");
      speech.speak(`I couldn't find ${clean} on your list.`);
      return;
    }
    const [removed] = list.splice(idx, 1);
    render();
    logAction(`🗑️ Removed ${removed.name}`, "ok");
    speech.speak(`Removed ${removed.name}`);
  }

  function modifyQuantity(name, qty) {
    const clean = name.trim().toLowerCase();
    const item = list.find((i) => i.name.includes(clean) || clean.includes(i.name));
    if (!item) {
      logAction(`⚠️ "${clean}" isn't on your list yet — adding it.`, "error");
      addItem(clean, qty);
      return;
    }
    item.qty = qty;
    render();
    logAction(`✏️ Updated ${item.name} to ${qty}`, "ok");
    speech.speak(`${item.name} is now ${qty}`);
  }

  function toggleDone(id) {
    const item = list.find((i) => i.id === id);
    if (item) item.done = !item.done;
    render();
  }

  function removeById(id) {
    list = list.filter((i) => i.id !== id);
    render();
  }

  // ---- Substitutes -----------------------------------------------------
  function maybeOfferSubstitute(itemName) {
    const key = Object.keys(SUBSTITUTES).find((k) => itemName.includes(k));
    if (!key) return;
    const options = SUBSTITUTES[key];
    logAction(`💡 Prefer an alternative to ${key}? Try: ${options.join(", ")}`, "info");
  }

  // ---- Voice-activated search -------------------------------------------
  function runSearch(parsed) {
    const results = searchCatalog({ term: parsed.term, maxPrice: parsed.maxPrice, minPrice: parsed.minPrice });
    logAction(`🔎 Searching for "${parsed.term}"${parsed.maxPrice ? ` under $${parsed.maxPrice}` : ""}`, "info");
    renderSearchResults(parsed.term, results);
  }

  function renderSearchResults(term, results) {
    el.searchResults.classList.remove("hidden");
    if (!results.length) {
      el.searchResultsList.innerHTML = `<p class="muted">No matches for "${escapeHtml(term)}". Try a different term.</p>`;
      return;
    }
    el.searchResultsList.innerHTML = results
      .map(
        (p) => `
        <div class="result-row">
          <div>
            <div class="result-name">${escapeHtml(p.name)}</div>
            <div class="result-meta">${escapeHtml(p.brand)} · ${escapeHtml(p.category)}</div>
          </div>
          <div class="result-price">$${p.price.toFixed(2)}</div>
          <button class="btn-small" data-add-search="${escapeHtml(p.name)}">Add</button>
        </div>`
      )
      .join("");

    el.searchResultsList.querySelectorAll("[data-add-search]").forEach((btn) => {
      btn.addEventListener("click", () => {
        addItem(btn.dataset.addSearch, 1);
        el.searchResults.classList.add("hidden");
      });
    });
  }

  // ---- Smart suggestions tray --------------------------------------------
  function renderSuggestions() {
    const seasonal = getSeasonalSuggestions().map((name) => ({ name, reason: "in season" }));
    const runningLow = getRunningLowSuggestions().map((name) => ({ name, reason: "running low" }));
    const combined = [...runningLow, ...seasonal]
      .filter((s) => !dismissedSuggestions.has(s.name))
      .filter((s) => !list.some((i) => i.name === s.name))
      // de-dupe by name, keep first reason
      .filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i)
      .slice(0, 6);

    if (!combined.length) {
      el.suggestionsTray.innerHTML = `<p class="muted small">No suggestions right now — your list looks complete.</p>`;
      return;
    }

    el.suggestionsTray.innerHTML = combined
      .map(
        (s) => `
        <div class="suggestion-chip" data-name="${escapeHtml(s.name)}">
          <span>${s.reason === "running low" ? "📉" : "🌱"} ${escapeHtml(s.name)}</span>
          <span class="chip-reason">${s.reason}</span>
          <button class="chip-add" data-add="${escapeHtml(s.name)}" aria-label="Add ${escapeHtml(s.name)}">+</button>
          <button class="chip-dismiss" data-dismiss="${escapeHtml(s.name)}" aria-label="Dismiss">×</button>
        </div>`
      )
      .join("");

    el.suggestionsTray.querySelectorAll("[data-add]").forEach((btn) =>
      btn.addEventListener("click", () => addItem(btn.dataset.add, 1))
    );
    el.suggestionsTray.querySelectorAll("[data-dismiss]").forEach((btn) =>
      btn.addEventListener("click", () => {
        dismissedSuggestions.add(btn.dataset.dismiss);
        renderSuggestions();
      })
    );
  }

  // ---- List rendering (grouped by category) --------------------------------
  function render() {
    el.itemCount.textContent = list.length;
    el.emptyState.classList.toggle("hidden", list.length > 0);

    const groups = {};
    for (const item of list) {
      groups[item.category] = groups[item.category] || [];
      groups[item.category].push(item);
    }

    el.listContainer.innerHTML = Object.entries(groups)
      .map(([category, items]) => {
        const icon = items[0].icon;
        return `
        <section class="category-group">
          <h3 class="category-title">${icon} ${escapeHtml(category)}</h3>
          <ul class="item-list">
            ${items
              .map(
                (item) => `
              <li class="item-row ${item.done ? "done" : ""}">
                <button class="check" data-toggle="${item.id}" aria-label="Mark ${escapeHtml(item.name)} done">
                  ${item.done ? "✓" : ""}
                </button>
                <span class="item-name">${escapeHtml(item.name)}</span>
                <span class="item-qty">×${item.qty}</span>
                <button class="item-remove" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">🗑</button>
              </li>`
              )
              .join("")}
          </ul>
        </section>`;
      })
      .join("");

    el.listContainer.querySelectorAll("[data-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => toggleDone(btn.dataset.toggle))
    );
    el.listContainer.querySelectorAll("[data-remove]").forEach((btn) =>
      btn.addEventListener("click", () => removeById(btn.dataset.remove))
    );

    renderSuggestions();
  }

  // ---- Small utils -----------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let toastTimer = null;
  function showToast(message, tone = "ok") {
    el.toast.textContent = message;
    el.toast.className = `toast show ${tone}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 3200);
  }

  // ---- Init -----------------------------------------------------------
  populateLanguages();
  render();
  logAction("👋 Say something like “Add milk” or “I need 2 apples” to get started.", "info");
})();
