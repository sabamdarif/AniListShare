(function () {
  "use strict";

  var COOKIE_NAME = "anime_list_filters";
  var currentFilters = {
    sort: null,
    status: null,
    attr: [],
    lang: null,
  };

  function saveFilters() {
    var str = JSON.stringify(currentFilters);
    var d = new Date();
    d.setTime(d.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    document.cookie =
      COOKIE_NAME +
      "=" +
      encodeURIComponent(str) +
      ";expires=" +
      d.toUTCString() +
      ";path=/";
  }

  function loadFilters() {
    var name = COOKIE_NAME + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(";");
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == " ") {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        try {
          var val = JSON.parse(c.substring(name.length, c.length));
          if (val && typeof val === "object") {
            currentFilters.sort = val.sort || null;
            currentFilters.status = val.status || null;
            currentFilters.attr = Array.isArray(val.attr) ? val.attr : [];
            currentFilters.lang = val.lang || null;
          }
        } catch (e) {
          console.error("Failed to parse filter cookie", e);
        }
        return;
      }
    }
  }

  function updateUI() {
    var wrapper = document.getElementById("filter_controls_wrapper");
    if (!wrapper) return;

    var pills = wrapper.querySelectorAll(".filter_pill");
    pills.forEach(function (btn) {
      var type = btn.getAttribute("data-filter-type");
      var val = btn.getAttribute("data-filter-val");
      var isActive = false;

      if (type === "sort") isActive = currentFilters.sort === val;
      if (type === "status") isActive = currentFilters.status === val;
      if (type === "attr") isActive = currentFilters.attr.includes(val);
      if (type === "lang") isActive = currentFilters.lang === val;

      if (isActive) btn.classList.add("active");
      else btn.classList.remove("active");
    });

    var hasFilters =
      currentFilters.sort ||
      currentFilters.status ||
      currentFilters.attr.length > 0 ||
      currentFilters.lang;
    var clearBtn = document.getElementById("filter_clear_btn");
    if (clearBtn) {
      clearBtn.style.display = hasFilters ? "inline-flex" : "none";
    }

    var toggleBtn = document.getElementById("m_filter_toggle_btn");
    if (toggleBtn) {
      if (hasFilters) toggleBtn.classList.add("active");
      else toggleBtn.classList.remove("active");
    }
  }

  function clearFilters() {
    currentFilters = { sort: null, status: null, attr: [], lang: null };
    document.cookie =
      COOKIE_NAME + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/";
    updateUI();
  }

  function toggleFilter(type, val) {
    if (type === "sort") {
      currentFilters.sort = currentFilters.sort === val ? null : val;
    } else if (type === "status") {
      currentFilters.status = currentFilters.status === val ? null : val;
    } else if (type === "attr") {
      var idx = currentFilters.attr.indexOf(val);
      if (idx > -1) currentFilters.attr.splice(idx, 1);
      else currentFilters.attr.push(val);
    } else if (type === "lang") {
      currentFilters.lang = currentFilters.lang === val ? null : val;
    }
    saveFilters();
    updateUI();
  }

  function applyFilters(list) {
    if (!list) return [];

    // Check if any filter is active
    var hasFilters =
      currentFilters.sort ||
      currentFilters.status ||
      currentFilters.attr.length > 0 ||
      currentFilters.lang;
    if (!hasFilters) return list; // Preserve original array and order

    var result = list.slice();

    // 1. Status Filter
    if (currentFilters.status) {
      result = result.filter(function (a) {
        var isWatching = false;
        if (!a.seasons || a.seasons.length === 0) {
          isWatching = true; // No seasons -> assumed watching
        } else {
          for (var i = 0; i < a.seasons.length; i++) {
            var s = a.seasons[i];
            var total = Number(s.total) || Number(s.total_episodes) || 0;
            var watched = Number(s.watched) || Number(s.watched_episodes) || 0;
            if (watched < total || total === 0) {
              isWatching = true;
              break;
            }
          }
        }
        if (currentFilters.status === "watching") return isWatching;
        if (currentFilters.status === "completed") return !isWatching;
        return true;
      });
    }

    // 2. Attribute Filters
    if (currentFilters.attr.includes("ova")) {
      result = result.filter(function (a) {
        if (!a.seasons) return false;
        for (var i = 0; i < a.seasons.length; i++) {
          var s = a.seasons[i];
          if (s.isOva || s.number % 1 !== 0) return true;
        }
        return false;
      });
    }

    // 3. Language Filter
    // TODO: Implement language-based filtering.

    // 4. Sort
    if (currentFilters.sort) {
      result.sort(function (a, b) {
        if (currentFilters.sort === "az") {
          return (a.name || "").localeCompare(b.name || "");
        } else if (currentFilters.sort === "za") {
          return (b.name || "").localeCompare(a.name || "");
        } else if (currentFilters.sort === "rating_high") {
          return (parseFloat(b.stars) || 0) - (parseFloat(a.stars) || 0);
        } else if (currentFilters.sort === "rating_low") {
          return (parseFloat(a.stars) || 0) - (parseFloat(b.stars) || 0);
        }
        return 0;
      });
    }

    return result;
  }

  // Setup UI listeners
  var _onFilterChanged = null;

  function init(onChangeCb) {
    _onFilterChanged = onChangeCb;
    loadFilters();
    updateUI();

    var toggleBtn = document.getElementById("m_filter_toggle_btn");
    var wrapper = document.getElementById("filter_controls_wrapper");
    if (toggleBtn && wrapper) {
      toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        wrapper.classList.toggle("open");
      });

      document.addEventListener("click", function (e) {
        if (
          wrapper.classList.contains("open") &&
          !wrapper.contains(e.target) &&
          e.target !== toggleBtn
        ) {
          wrapper.classList.remove("open");
        }
      });
    }

    var toolbar = document.getElementById("anime_filter_toolbar");
    if (toolbar) {
      toolbar.addEventListener("click", function (e) {
        var pill = e.target.closest(".filter_pill");
        if (pill) {
          var type = pill.getAttribute("data-filter-type");
          var val = pill.getAttribute("data-filter-val");
          toggleFilter(type, val);
          if (_onFilterChanged) _onFilterChanged();
        }

        var clearBtn = e.target.closest(".filter_clear_btn");
        if (clearBtn) {
          clearFilters();
          if (_onFilterChanged) _onFilterChanged();
        }
      });
    }
  }

  // Expose
  window.AnimeFilter = {
    init: init,
    applyFilters: applyFilters,
  };
})();
