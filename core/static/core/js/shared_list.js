/**
 * Shared list page — read-only rendering with search.
 * Reads data from window.__SHARED_DATA__ (server-injected JSON).
 * Uses AnimeRenderer for all rendering.
 */
(function () {
  "use strict";

  var DATA = window.__SHARED_DATA__ || [];
  var AR = window.AnimeRenderer;
  var isMobile = AR.isMobile;
  var normalizeSeason = AR.normalizeSeason;
  var escapeHtml = AR.escapeHtml;

  var tabsContainer = document.getElementById("category_tabs");
  var tableBody = document.getElementById("anime_table_body");
  var tableEl = document.getElementById("anime_table");
  var searchInput = document.getElementById("shared_search_input");
  if (!tabsContainer || !tableBody || !tableEl) return;

  var renderer = new AR(tableEl, tableBody, {
    showEditColumn: false,
    colSpan: 6,
    emptyMessage: "No anime in this category.",
  });

  var _activeCatIdx = 0;

  function buildTabs() {
    var html = "";
    DATA.forEach(function (cat, idx) {
      html +=
        '<div class="category_tab_wrapper' +
        (idx === 0 ? " active" : "") +
        '">' +
        '<button class="category_tab' +
        (idx === 0 ? " active" : "") +
        '" data-cat-idx="' +
        idx +
        '">' +
        escapeHtml(cat.name) +
        "</button></div>";
    });
    tabsContainer.innerHTML = html;
  }

  function getCurrentAnimeList(query) {
    if (_activeCatIdx < 0 || _activeCatIdx >= DATA.length) return [];
    var list = DATA[_activeCatIdx].animes || [];
    if (!query) return list;
    var q = query.toLowerCase();
    return list.filter(function (a) {
      return (a.name || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderCurrent() {
    var list = getCurrentAnimeList(searchInput ? searchInput.value : "");
    // Normalize seasons for each anime before rendering
    var normalized = list.map(function (a) {
      return Object.assign({}, a, {
        seasons: (a.seasons || []).map(normalizeSeason),
      });
    });
    renderer.render(normalized);
  }

  function showCategory(idx) {
    _activeCatIdx = idx;
    var allTabs = tabsContainer.querySelectorAll(".category_tab");
    var allWrappers = tabsContainer.querySelectorAll(".category_tab_wrapper");
    allTabs.forEach(function (t, i) {
      t.classList.toggle("active", i === idx);
    });
    allWrappers.forEach(function (w, i) {
      w.classList.toggle("active", i === idx);
    });
    renderCurrent();
  }

  tabsContainer.addEventListener("click", function (e) {
    var btn = e.target.closest(".category_tab");
    if (!btn) return;
    var idx = parseInt(btn.getAttribute("data-cat-idx"), 10);
    if (!isNaN(idx)) showCategory(idx);
  });

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      renderCurrent();
    });
  }

  var _prevMobile = isMobile();
  window.addEventListener("resize", function () {
    var m = isMobile();
    if (m !== _prevMobile) {
      _prevMobile = m;
      renderCurrent();
    }
  });

  if (DATA.length) {
    buildTabs();
    showCategory(0);
  } else {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="empty_msg">This list is empty.</td></tr>';
  }
})();
