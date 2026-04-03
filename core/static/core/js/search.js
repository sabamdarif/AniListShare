(function () {
  "use strict";

  /* ────────────────────────────────────────────
   *  Configuration
   * ──────────────────────────────────────────── */
  var DEBOUNCE_MS = 200;
  var MAX_RESULTS = 15;
  var HIGHLIGHT_MS = 1800;

  /* ────────────────────────────────────────────
   *  State
   * ──────────────────────────────────────────── */
  var searchIndex = [];
  var indexReady = false;
  var indexLoading = false;
  var indexDirty = true; // needs (re)fetch
  var activeIdx = -1;

  /* ────────────────────────────────────────────
   *  DOM refs
   * ──────────────────────────────────────────── */
  var desktopInput = document.querySelector("#header_search_section input");
  var suggestionsBox = document.getElementById("search_suggestions");
  var desktopLoader = document.getElementById("search_loader");
  var mSearchBtn = document.getElementById("m_search_btn");
  var mOverlay = document.getElementById("m_search_overlay");
  var mPanel = document.getElementById("m_search_panel");
  var mInput = mPanel ? mPanel.querySelector(".m_search_bar input") : null;
  var mCancel = mPanel ? mPanel.querySelector(".m_search_cancel") : null;
  var mResults = mPanel ? mPanel.querySelector(".m_search_results") : null;
  var mLoader = mPanel ? mPanel.querySelector(".m_search_loader") : null;

  /* ────────────────────────────────────────────
   *  Helpers
   * ──────────────────────────────────────────── */
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  function sanitizeUrl(url) {
    if (!url) return "";
    try {
      var parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.href;
      }
    } catch (_) {}
    return "";
  }

  /* ────────────────────────────────────────────
   *  Loading Indicator
   * ──────────────────────────────────────────── */
  function showLoading() {
    if (desktopLoader) desktopLoader.classList.add("search_loading");
    if (mLoader) mLoader.classList.add("search_loading");
  }

  function hideLoading() {
    if (desktopLoader) desktopLoader.classList.remove("search_loading");
    if (mLoader) mLoader.classList.remove("search_loading");
  }

  /* ────────────────────────────────────────────
   *  Build Search Index (lazy — called on first interaction)
   * ──────────────────────────────────────────── */
  function ensureIndex(callback) {
    // Already loaded and clean
    if (indexReady && !indexDirty) {
      if (callback) callback();
      return;
    }
    // Already in-flight
    if (indexLoading) return;

    indexLoading = true;
    showLoading();

    fetch("/api/anime/search/", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : data.results || [];
        searchIndex = list.map(function (item) {
          return {
            id: item.id,
            name: item.name || "",
            nameLower: (item.name || "").toLowerCase(),
            thumbnail_url: item.thumbnail_url || "",
            category_id: item.category_id,
            category_name: item.category_name || "",
          };
        });
        indexReady = true;
        indexDirty = false;
      })
      .catch(function () {
        searchIndex = [];
        indexReady = false;
      })
      .finally(function () {
        indexLoading = false;
        hideLoading();
        if (callback) callback();
      });
  }

  /* Mark index as dirty (will re-fetch on next interaction) */
  function invalidateIndex() {
    indexDirty = true;
  }

  /* ────────────────────────────────────────────
   *  Search / Filter
   * ──────────────────────────────────────────── */
  function search(query) {
    if (!indexReady || !query) return [];
    var q = query.toLowerCase().trim();
    if (!q) return [];

    var results = [];
    for (
      var i = 0;
      i < searchIndex.length && results.length < MAX_RESULTS;
      i++
    ) {
      if (searchIndex[i].nameLower.indexOf(q) !== -1) {
        results.push(searchIndex[i]);
      }
    }
    return results;
  }

  /* ────────────────────────────────────────────
   *  Highlight matched text
   * ──────────────────────────────────────────── */
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var q = query.trim();
    if (!q) return escapeHtml(text);

    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escapeHtml(text);

    var before = escapeHtml(text.substring(0, idx));
    var match = escapeHtml(text.substring(idx, idx + q.length));
    var after = escapeHtml(text.substring(idx + q.length));
    return before + "<mark>" + match + "</mark>" + after;
  }

  /* ────────────────────────────────────────────
   *  Debounce
   * ──────────────────────────────────────────── */
  function debounce(fn, ms) {
    var timer;
    return function () {
      var ctx = this,
        args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }

  /* ════════════════════════════════════════════
   *  DESKTOP SEARCH
   * ════════════════════════════════════════════ */

  function renderDesktopSuggestions(results, query) {
    if (!suggestionsBox) return;
    activeIdx = -1;

    if (!query || !query.trim()) {
      suggestionsBox.classList.remove("search_open");
      suggestionsBox.innerHTML = "";
      return;
    }

    if (!results.length) {
      suggestionsBox.innerHTML =
        '<div class="search_empty">No results for "' +
        escapeHtml(query) +
        '"</div>';
      suggestionsBox.classList.add("search_open");
      return;
    }

    var html = "";
    results.forEach(function (item, idx) {
      var safeUrl = sanitizeUrl(item.thumbnail_url);
      var thumbHtml = safeUrl
        ? '<img src="' +
          escapeHtml(safeUrl) +
          '" alt="" class="search_item_thumb" loading="lazy">'
        : '<div class="search_item_thumb"></div>';

      html +=
        '<div class="search_item" data-index="' +
        idx +
        '" data-anime-id="' +
        item.id +
        '" data-category-id="' +
        item.category_id +
        '">' +
        thumbHtml +
        '<div class="search_item_info">' +
        '<div class="search_item_name">' +
        highlightMatch(item.name, query) +
        "</div>" +
        '<div class="search_item_category">' +
        escapeHtml(item.category_name) +
        "</div>" +
        "</div></div>";
    });

    suggestionsBox.innerHTML = html;
    suggestionsBox.classList.add("search_open");
  }

  function closeDesktopSuggestions() {
    if (suggestionsBox) {
      suggestionsBox.classList.remove("search_open");
      suggestionsBox.innerHTML = "";
    }
    activeIdx = -1;
  }

  function doDesktopSearch() {
    var q = desktopInput.value;
    var results = search(q);
    renderDesktopSuggestions(results, q);
  }

  if (desktopInput && suggestionsBox) {
    desktopInput.placeholder = "search anime from any category...";

    var debouncedDesktop = debounce(function () {
      if (!indexReady) {
        // Index is loading — will search after it arrives
        ensureIndex(doDesktopSearch);
        return;
      }
      doDesktopSearch();
    }, DEBOUNCE_MS);

    desktopInput.addEventListener("input", debouncedDesktop);

    // Lazy-load index on first focus
    desktopInput.addEventListener("focus", function () {
      ensureIndex(function () {
        if (desktopInput.value.trim()) {
          doDesktopSearch();
        }
      });
    });

    // Keyboard navigation
    desktopInput.addEventListener("keydown", function (e) {
      var items = suggestionsBox.querySelectorAll(".search_item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        updateActiveItem(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        updateActiveItem(items);
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        items[activeIdx].click();
      } else if (e.key === "Escape") {
        closeDesktopSuggestions();
        desktopInput.blur();
      }
    });

    function updateActiveItem(items) {
      items.forEach(function (el, i) {
        el.classList.toggle("search_active", i === activeIdx);
        if (i === activeIdx) {
          el.scrollIntoView({ block: "nearest" });
        }
      });
    }

    // Click on suggestion
    suggestionsBox.addEventListener("click", function (e) {
      var item = e.target.closest(".search_item");
      if (!item) return;
      var animeId = parseInt(item.dataset.animeId, 10);
      var categoryId = parseInt(item.dataset.categoryId, 10);
      desktopInput.value = "";
      closeDesktopSuggestions();
      navigateToAnime(categoryId, animeId);
    });

    // Close on click outside
    document.addEventListener("click", function (e) {
      if (
        !suggestionsBox.contains(e.target) &&
        !desktopInput.contains(e.target)
      ) {
        closeDesktopSuggestions();
      }
    });
  }

  /* ════════════════════════════════════════════
   *  MOBILE SEARCH
   * ════════════════════════════════════════════ */

  function openMobileSearch() {
    if (!mOverlay || !mPanel) return;
    mOverlay.classList.add("m_search_visible");
    mPanel.classList.add("m_search_visible");
    document.body.style.overflow = "hidden";

    // Lazy-load index when mobile panel opens
    ensureIndex(function () {
      if (mInput && mInput.value.trim()) {
        doMobileSearch();
      }
    });

    if (mInput) {
      setTimeout(function () {
        mInput.focus();
      }, 350);
    }
  }

  function closeMobileSearch() {
    if (!mOverlay || !mPanel) return;
    mPanel.classList.remove("m_search_visible");
    mOverlay.classList.remove("m_search_visible");
    document.body.style.overflow = "";
    if (mInput) mInput.value = "";
    if (mResults)
      mResults.innerHTML =
        '<div class="m_search_hint">Type to search across all categories</div>';
  }

  function renderMobileSuggestions(results, query) {
    if (!mResults) return;

    if (!query || !query.trim()) {
      mResults.innerHTML =
        '<div class="m_search_hint">Type to search across all categories</div>';
      return;
    }

    if (!results.length) {
      mResults.innerHTML =
        '<div class="m_search_empty">No results for "' +
        escapeHtml(query) +
        '"</div>';
      return;
    }

    var html = "";
    results.forEach(function (item) {
      var safeUrl = sanitizeUrl(item.thumbnail_url);
      var thumbHtml = safeUrl
        ? '<img src="' +
          escapeHtml(safeUrl) +
          '" alt="" class="m_search_item_thumb" loading="lazy">'
        : '<div class="m_search_item_thumb"></div>';

      html +=
        '<div class="m_search_item" data-anime-id="' +
        item.id +
        '" data-category-id="' +
        item.category_id +
        '">' +
        thumbHtml +
        '<div class="m_search_item_info">' +
        '<div class="m_search_item_name">' +
        highlightMatch(item.name, query) +
        "</div>" +
        '<div class="m_search_item_category">' +
        escapeHtml(item.category_name) +
        "</div>" +
        "</div>" +
        '<span class="m_search_item_arrow"><i class="nf nf-cod-arrow_right"></i></span>' +
        "</div>";
    });

    mResults.innerHTML = html;
  }

  function doMobileSearch() {
    if (!mInput) return;
    var q = mInput.value;
    var results = search(q);
    renderMobileSuggestions(results, q);
  }

  if (mSearchBtn) {
    mSearchBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openMobileSearch();
    });
  }

  if (mCancel) {
    mCancel.addEventListener("click", closeMobileSearch);
  }

  if (mOverlay) {
    mOverlay.addEventListener("click", function (e) {
      if (e.target === mOverlay) closeMobileSearch();
    });
  }

  if (mInput) {
    var debouncedMobile = debounce(function () {
      if (!indexReady) {
        ensureIndex(doMobileSearch);
        return;
      }
      doMobileSearch();
    }, DEBOUNCE_MS);

    mInput.addEventListener("input", debouncedMobile);
  }

  if (mResults) {
    mResults.addEventListener("click", function (e) {
      var item = e.target.closest(".m_search_item");
      if (!item) return;
      var animeId = parseInt(item.dataset.animeId, 10);
      var categoryId = parseInt(item.dataset.categoryId, 10);
      closeMobileSearch();
      navigateToAnime(categoryId, animeId);
    });
  }

  /* ════════════════════════════════════════════
   *  NAVIGATE TO ANIME (switch tab + scroll + highlight)
   * ════════════════════════════════════════════ */

  function navigateToAnime(categoryId, animeId) {
    var tabsContainer = document.getElementById("category_tabs");
    if (!tabsContainer) return;

    var targetTab = tabsContainer.querySelector(
      '.category_tab[data-category-id="' + categoryId + '"]',
    );
    if (!targetTab) return;

    var currentActiveTab = tabsContainer.querySelector(".category_tab.active");
    var needsLoad =
      !currentActiveTab ||
      currentActiveTab.dataset.categoryId !== String(categoryId);

    if (needsLoad) {
      targetTab.click();
      waitForAnimeAndHighlight(animeId);
    } else {
      scrollAndHighlight(animeId);
    }
  }

  function waitForAnimeAndHighlight(animeId) {
    var attempts = 0;
    var maxAttempts = 30;

    var checker = setInterval(function () {
      attempts++;
      var el = findAnimeElement(animeId);
      if (el) {
        clearInterval(checker);
        scrollAndHighlight(animeId);
      } else if (attempts >= maxAttempts) {
        clearInterval(checker);
      }
    }, 100);
  }

  function findAnimeElement(animeId) {
    var tr = document.querySelector('tr[data-anime-id="' + animeId + '"]');
    if (tr) return tr;
    var card = document.querySelector(
      '.m_card[data-anime-id="' + animeId + '"]',
    );
    return card || null;
  }

  function scrollAndHighlight(animeId) {
    var el = findAnimeElement(animeId);
    if (!el) return;

    var stickyHeader = document.querySelector(".sticky_header");
    var headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
    var rect = el.getBoundingClientRect();
    var scrollTo = window.scrollY + rect.top - headerHeight - 20;

    window.scrollTo({ top: scrollTo, behavior: "smooth" });

    el.classList.remove("search_highlight");
    void el.offsetWidth;
    el.classList.add("search_highlight");

    setTimeout(function () {
      el.classList.remove("search_highlight");
    }, HIGHLIGHT_MS);
  }

  /* ════════════════════════════════════════════
   *  INDEX REFRESH HOOK
   * ════════════════════════════════════════════ */

  // Expose for other modules — marks index as stale
  window.refreshSearchIndex = function () {
    invalidateIndex();
  };

  // Wrap existing refreshCurrentCategory to also invalidate search index
  var origRefresh = window.refreshCurrentCategory;
  window.refreshCurrentCategory = function () {
    if (typeof origRefresh === "function") origRefresh();
    invalidateIndex();
  };
})();
