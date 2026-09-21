/* Header and mobile search: queries the server, never holds a local index.
 *
 * Ranking and typo tolerance live in api/search.py, so this file only debounces,
 * caches per query string, and aborts the request a newer keystroke replaced.
 * The cache is dropped whenever a list mutator runs, which is what keeps results
 * in step with an edit that has not been synced yet.
 */
(function () {
  "use strict";

  var DEBOUNCE_MS = 150;
  var MAX_RESULTS = 15;
  var HIGHLIGHT_MS = 1800;
  var CACHE_MAX = 40;
  var RENDER_WAIT_MS = 4000;
  var SCROLL_GAP = 20;

  var cache = new Map();
  var inFlight = null;
  var activeIdx = -1;

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

  function showLoading() {
    if (desktopLoader) desktopLoader.classList.add("search_loading");
    if (mLoader) mLoader.classList.add("search_loading");
  }

  function hideLoading() {
    if (desktopLoader) desktopLoader.classList.remove("search_loading");
    if (mLoader) mLoader.classList.remove("search_loading");
  }

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

  /* ── Query ── */

  function applyFilters(results) {
    return window.AnimeFilter ? window.AnimeFilter.applyFilters(results) : results;
  }

  function remember(key, results) {
    if (cache.size >= CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, results);
  }

  /* Push queued edits first, so the server is searched with what the user sees. */
  function settled() {
    var queue = window.SyncQueue;
    if (!queue || !queue.hasPending()) return Promise.resolve();
    return Promise.resolve(queue.flushNow()).catch(function () {});
  }

  /* Resolve with cached results when there are any, otherwise ask the server. */
  function query(text, done) {
    var q = text.trim();
    if (!q) {
      done([], q);
      return;
    }

    var key = q.toLowerCase();
    if (cache.has(key)) {
      done(cache.get(key), q);
      return;
    }

    if (inFlight) inFlight.abort();
    var controller = new AbortController();
    inFlight = controller;
    showLoading();

    settled().then(function () {
      if (controller.signal.aborted) return;
      fetchResults(q, key, controller, done);
    });
  }

  function fetchResults(q, key, controller, done) {
    apiFetch(
      "/api/v1/animes/search/?limit=" +
        MAX_RESULTS +
        "&q=" +
        encodeURIComponent(q),
      {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    )
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : data.results || [];
        remember(key, list);
        if (inFlight === controller) {
          inFlight = null;
          hideLoading();
        }
        done(list, q);
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (inFlight === controller) {
          inFlight = null;
          hideLoading();
        }
        done([], q);
      });
  }

  function highlightMatch(text, q) {
    var needle = (q || "").trim();
    if (!needle) return escapeHtml(text);

    var idx = text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx === -1) return escapeHtml(text);

    return (
      escapeHtml(text.substring(0, idx)) +
      "<mark>" +
      escapeHtml(text.substring(idx, idx + needle.length)) +
      "</mark>" +
      escapeHtml(text.substring(idx + needle.length))
    );
  }

  /* ── Desktop ── */

  function renderDesktopSuggestions(results, q) {
    if (!suggestionsBox) return;
    activeIdx = -1;

    if (!q || !q.trim()) {
      suggestionsBox.classList.remove("search_open");
      suggestionsBox.innerHTML = "";
      return;
    }

    if (!results.length) {
      suggestionsBox.innerHTML =
        '<div class="search_empty">No results for "' +
        escapeHtml(q) +
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
        highlightMatch(item.name, q) +
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
    var typed = desktopInput.value;
    query(typed, function (results, q) {
      if (desktopInput.value.trim() !== q) return;
      renderDesktopSuggestions(applyFilters(results), q);
    });
  }

  if (desktopInput && suggestionsBox) {
    desktopInput.placeholder = "search anime from any category...";
    desktopInput.addEventListener("input", debounce(doDesktopSearch, DEBOUNCE_MS));

    desktopInput.addEventListener("focus", function () {
      if (desktopInput.value.trim()) doDesktopSearch();
    });

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

    suggestionsBox.addEventListener("click", function (e) {
      var item = e.target.closest(".search_item");
      if (!item) return;
      var animeId = parseInt(item.dataset.animeId, 10);
      var categoryId = parseInt(item.dataset.categoryId, 10);
      desktopInput.value = "";
      closeDesktopSuggestions();
      navigateToAnime(categoryId, animeId);
    });

    document.addEventListener("click", function (e) {
      if (
        !suggestionsBox.contains(e.target) &&
        !desktopInput.contains(e.target)
      ) {
        closeDesktopSuggestions();
      }
    });
  }

  /* ── Mobile ── */

  function openMobileSearch() {
    if (!mOverlay || !mPanel) return;
    mOverlay.classList.add("m_search_visible");
    mPanel.classList.add("m_search_visible");
    document.body.style.overflow = "hidden";

    var wrapper = document.getElementById("filter_controls_wrapper");
    if (wrapper && wrapper.classList.contains("mobile_embedded")) {
      wrapper.style.display = "flex";
      if (mResults) mResults.style.display = "none";
    }

    if (mInput) {
      setTimeout(function () {
        mInput.focus();
      }, 350);
      if (mInput.value.trim()) doMobileSearch();
    }
  }

  function closeMobileSearch() {
    if (!mOverlay || !mPanel) return;
    mPanel.classList.remove("m_search_visible");
    mOverlay.classList.remove("m_search_visible");
    document.body.style.overflow = "";
    if (mInput) mInput.value = "";

    var wrapper = document.getElementById("filter_controls_wrapper");
    if (wrapper && wrapper.classList.contains("mobile_embedded")) {
      wrapper.style.display = "flex";
      if (mResults) mResults.style.display = "none";
    } else if (mResults) {
      mResults.style.display = "block";
      mResults.innerHTML =
        '<div class="m_search_hint">Type to search across all categories</div>';
    }
  }

  function renderMobileSuggestions(results, q) {
    if (!mResults) return;

    var wrapper = document.getElementById("filter_controls_wrapper");

    if (!q || !q.trim()) {
      if (wrapper && wrapper.classList.contains("mobile_embedded")) {
        mResults.style.display = "none";
        wrapper.style.display = "flex";
      } else {
        mResults.style.display = "block";
        mResults.innerHTML =
          '<div class="m_search_hint">Type to search across all categories</div>';
      }
      return;
    }

    if (wrapper && wrapper.classList.contains("mobile_embedded")) {
      wrapper.style.display = "none";
    }
    mResults.style.display = "block";

    if (!results.length) {
      mResults.innerHTML =
        '<div class="m_search_empty">No results for "' +
        escapeHtml(q) +
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
        highlightMatch(item.name, q) +
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
    query(mInput.value, function (results, q) {
      if (mInput.value.trim() !== q) return;
      renderMobileSuggestions(applyFilters(results), q);
    });
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
    mInput.addEventListener("input", debounce(doMobileSearch, DEBOUNCE_MS));
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

  /* ── Navigate to a result ── */

  // Scoped to rows and cards: suggestion items carry data-anime-id too, and they
  // sit above the table in the document.
  function findAnimeElement(animeId) {
    return document.querySelector(
      'tr[data-anime-id="' +
        animeId +
        '"], .m_card[data-anime-id="' +
        animeId +
        '"]',
    );
  }

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

    if (!needsLoad) {
      scrollAndHighlight(animeId);
      return;
    }

    // Drop the saved offset first: restoring it would fight the scroll below.
    if (window.AnimeRenderer) window.AnimeRenderer.clearScroll(categoryId);
    targetTab.click();
    whenRendered(animeId, scrollAndHighlight);
  }

  /* Wait for the row or card to exist, however many renders the load takes. */
  function whenRendered(animeId, callback) {
    if (findAnimeElement(animeId)) {
      callback(animeId);
      return;
    }

    var timer = null;
    var observer = new MutationObserver(function () {
      if (!findAnimeElement(animeId)) return;
      observer.disconnect();
      clearTimeout(timer);
      callback(animeId);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(function () {
      observer.disconnect();
    }, RENDER_WAIT_MS);
  }

  function scrollAndHighlight(animeId) {
    var el = findAnimeElement(animeId);
    if (!el) return;

    var stickyHeader = document.querySelector(".sticky_header");
    var offset = (stickyHeader ? stickyHeader.offsetHeight : 0) + SCROLL_GAP;
    el.style.scrollMarginTop = offset + "px";
    el.scrollIntoView({ block: "start", behavior: "smooth" });

    // Lazy thumbnails above the target settle after the smooth scroll starts,
    // which shifts it. One correction once they have.
    setTimeout(function () {
      var top = el.getBoundingClientRect().top;
      if (Math.abs(top - offset) > 4) {
        el.scrollIntoView({ block: "start", behavior: "auto" });
      }
    }, 600);

    el.classList.remove("search_highlight");
    void el.offsetWidth;
    el.classList.add("search_highlight");

    setTimeout(function () {
      el.classList.remove("search_highlight");
    }, HIGHLIGHT_MS);
  }

  /* ── Staleness ── */

  function invalidate() {
    cache.clear();
  }

  window.refreshSearchIndex = invalidate;

  // Every list write goes through one of these, so wrapping them is what keeps
  // search from serving a name the user just renamed or deleted.
  ["addLocalAnime", "updateLocalAnime", "removeLocalAnime", "resolveAnimeIds",
   "refreshCurrentCategory"].forEach(function (name) {
    var original = window[name];
    window[name] = function () {
      invalidate();
      if (typeof original === "function") {
        return original.apply(this, arguments);
      }
    };
  });
})();
