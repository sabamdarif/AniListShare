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

  if (window.AnimeFilter) {
    window.AnimeFilter.init(function () {
      renderCurrent();
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

    var filtered = window.AnimeFilter
      ? window.AnimeFilter.applyFilters(normalized)
      : normalized;
    renderer.render(filtered);
  }

  function getScrollKey(idx) {
    var token = window.__SHARE_TOKEN__ || "local";
    return "shared_" + token + "_tab_" + idx;
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
    AR.restoreScroll(getScrollKey(idx));
  }

  tabsContainer.addEventListener("click", function (e) {
    var btn = e.target.closest(".category_tab");
    if (!btn) return;
    var idx = parseInt(btn.getAttribute("data-cat-idx"), 10);
    if (!isNaN(idx)) {
      if (idx !== _activeCatIdx) AR.clearScroll(getScrollKey(idx));
      showCategory(idx);
    }
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

  async function fetchSharedData() {
    var loader = document.getElementById("category_tabs_loader");
    if (loader) loader.style.display = "inline-block";

    var token = window.__SHARE_TOKEN__;
    if (!token) return;

    try {
      var res = await fetch("/api/v1/share/data/" + token + "/", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load list");
      var data = await res.json();
      DATA = data || [];

      if (loader) loader.style.display = "none";

      if (DATA.length) {
        buildTabs();
        showCategory(0);
      } else {
        tableBody.innerHTML =
          '<tr><td colspan="6" class="empty_msg">This list is empty.</td></tr>';
      }
    } catch (err) {
      console.error(err);
      if (tabsContainer) {
        tabsContainer.innerHTML =
          '<span style="color:red; margin-left:12px;">Failed to load list. Please refresh.</span>';
      }
      if (loader) loader.style.display = "none";
    }
  }

  fetchSharedData();

  window.addEventListener("beforeunload", function () {
    if (DATA.length && _activeCatIdx >= 0) {
      AR.saveScroll(getScrollKey(_activeCatIdx));
    }
  });

  // --- Dropdown and Copy Logic ---
  var dropdownBtn = document.getElementById("shared_dropdown_btn");
  var dropdownMenu = document.getElementById("shared_dropdown_menu");
  var copyListBtn = document.getElementById("copy_list_btn");
  var copyListLoginBtn = document.getElementById("copy_list_login_btn");
  var token = window.__SHARE_TOKEN__;
  var isAuthenticated = window.__IS_AUTHENTICATED__;

  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      dropdownMenu.classList.toggle("show");
    });
    document.addEventListener("click", function (e) {
      if (!dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove("show");
      }
    });
  }

  // Fallback toast alert
  function notify(msg) {
    if (typeof window.showToast === "function") {
      window.showToast(msg, "success");
    } else {
      alert(msg);
    }
  }

  function handleCopy() {
    if (!copyListBtn) return;
    copyListBtn.classList.add("loading");
    copyListBtn.innerHTML =
      '<i class="nf nf-fa-spinner fa-spin"></i> Copying...';

    apiFetch("/api/v1/share/copy/" + token + "/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        var res = result.status;
        var data = result.data;
        copyListBtn.classList.remove("loading");
        copyListBtn.innerHTML = '<i class="nf nf-fa-check"></i> Copied!';
        setTimeout(function () {
          copyListBtn.innerHTML =
            '<i class="nf nf-fa-copy"></i> Copy this list';
        }, 3000);

        if (res === 200 || res === 201) {
          notify(data.detail || "List copied successfully!");
        } else {
          alert("Error: " + (data.detail || "Failed to copy list."));
        }
      })
      .catch(function (err) {
        console.error(err);
        copyListBtn.classList.remove("loading");
        copyListBtn.innerHTML = '<i class="nf nf-fa-copy"></i> Copy this list';
        alert("A network error occurred while copying the list.");
      });
  }

  // Secure intent check for unauthenticated users
  if (copyListLoginBtn) {
    copyListLoginBtn.addEventListener("click", function () {
      sessionStorage.setItem("pending_share_copy", token);
      window.location.href = window.__LOGIN_URL__;
    });
  }

  // Copy action for authenticated users
  if (copyListBtn) {
    copyListBtn.addEventListener("click", function () {
      handleCopy();
    });
  }

  // Automatically execute pending copy when user returns after login
  if (
    isAuthenticated &&
    sessionStorage.getItem("pending_share_copy") === token
  ) {
    sessionStorage.removeItem("pending_share_copy");
    // Small delay to ensure UI is fully loaded before popping alert/toast
    setTimeout(handleCopy, 500);
  }
})();
