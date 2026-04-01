/**
 * Shared list page — read-only rendering with search.
 * Reads data from window.__SHARED_DATA__ (server-injected JSON).
 */
(function () {
  "use strict";

  var DATA = window.__SHARED_DATA__ || [];

  var tabsContainer = document.getElementById("category_tabs");
  var tableBody = document.getElementById("anime_table_body");
  var tableEl = document.getElementById("anime_table");
  var searchInput = document.getElementById("shared_search_input");
  if (!tabsContainer || !tableBody || !tableEl) return;

  var MOBILE_BP = 768;
  var _activeCatIdx = 0;

  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

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

  /* ── Image error handler ── */
  document.addEventListener(
    "error",
    function (e) {
      if (
        e.target.tagName === "IMG" &&
        (e.target.classList.contains("thumb_img") ||
          e.target.classList.contains("m_card_thumb"))
      ) {
        e.target.style.display = "none";
      }
    },
    true,
  );

  /* ── Language ── */
  var LANG_MAP = {
    jap: "Japanese",
    japanese: "Japanese",
    jp: "Japanese",
    eng: "English",
    english: "English",
    en: "English",
    kor: "Korean",
    korean: "Korean",
    chi: "Chinese",
    chinese: "Chinese",
  };

  function parseLanguages(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map(function (l) {
        return l.trim().toLowerCase();
      })
      .filter(Boolean)
      .map(function (l) {
        return LANG_MAP[l] || l.charAt(0).toUpperCase() + l.slice(1);
      });
  }

  /* ── Season rendering ── */
  function normalizeSeason(s) {
    var total =
      s.total_episodes != null
        ? Number(s.total_episodes)
        : Number(s.total || 0);
    var watched =
      s.watched_episodes != null
        ? Number(s.watched_episodes)
        : Number(s.watched || 0);
    var completed =
      s.is_completed != null
        ? Boolean(s.is_completed)
        : total > 0 && watched >= total;

    return {
      number: Number(s.number) || 1,
      total: total,
      watched: watched,
      completed: completed,
      comment: s.comment || "",
    };
  }

  function hasSeasonComment(s) {
    return s.comment != null && String(s.comment).trim().length > 0;
  }

  function renderSeasonsDesktop(seasons) {
    if (!seasons || !seasons.length)
      return '<span class="season_pill" style="opacity:.5">\u2014</span>';

    return seasons
      .map(function (s) {
        var has = hasSeasonComment(s);
        var icon = has
          ? '<i class="nf nf-fa-comment season_comment_icon"></i>'
          : "";
        var attr = has
          ? ' data-comment="' +
            escapeHtml(s.comment) +
            '" data-season="S' +
            escapeHtml(String(s.number)) +
            '"'
          : "";
        var cls = has ? " season_has_comment" : "";
        var num = escapeHtml(String(s.number));

        if (s.completed) {
          return (
            '<span class="season_pill season_has_tooltip' +
            cls +
            '"' +
            attr +
            ">S" +
            num +
            '<span class="s_check">\u2713</span>' +
            icon +
            "</span>"
          );
        }
        var pct = s.total > 0 ? Math.round((s.watched / s.total) * 100) : 0;
        return (
          '<span class="season_progress_box season_has_tooltip' +
          cls +
          '"' +
          attr +
          ">" +
          '<span class="season_progress_top">' +
          '<span class="season_progress_label">S' +
          num +
          "</span>" +
          '<span class="season_progress_frac">' +
          s.watched +
          "/" +
          s.total +
          "</span></span>" +
          '<span class="season_progress_track">' +
          '<span class="season_progress_fill" style="width:' +
          pct +
          '%"></span></span>' +
          icon +
          "</span>"
        );
      })
      .join("");
  }

  function renderSeasonsMobile(seasons) {
    if (!seasons || !seasons.length) return "";
    return seasons
      .map(function (s) {
        var pct = s.completed
          ? 100
          : s.total > 0
            ? Math.round((s.watched / s.total) * 100)
            : 0;
        var checkmark = s.completed
          ? '<span class="m_season_check">\u2713</span>'
          : "";
        var has = hasSeasonComment(s);
        var icon = has
          ? '<i class="nf nf-fa-comment m_season_comment_icon"></i>'
          : "";
        var attr = has
          ? ' data-comment="' +
            escapeHtml(s.comment) +
            '" data-season="Season ' +
            escapeHtml(String(s.number)) +
            '"'
          : "";
        var num = escapeHtml(String(s.number));
        var label = s.completed
          ? "Season " + num
          : "Season " +
            num +
            ' <span class="m_season_progress_text">' +
            s.watched +
            "/" +
            s.total +
            "</span>";

        return (
          '<div class="m_season_item m_season_has_popup"' +
          attr +
          ">" +
          '<div class="m_season_label">' +
          label +
          checkmark +
          icon +
          "</div>" +
          '<div class="m_season_bar_track">' +
          '<div class="m_season_bar_fill' +
          (s.completed ? " m_bar_done" : "") +
          '" style="width:' +
          pct +
          '%"></div></div></div>'
        );
      })
      .join("");
  }

  function renderStars(val) {
    if (val == null) return '<span class="star_display">\u2014</span>';
    var rating = parseFloat(val);
    if (isNaN(rating)) return '<span class="star_display">\u2014</span>';
    var stars = "";
    for (var i = 1; i <= 5; i++) {
      if (rating >= i) stars += '<span class="star filled">\u2605</span>';
      else if (rating >= i - 0.5)
        stars += '<span class="star half">\u2605</span>';
      else stars += '<span class="star empty">\u2605</span>';
    }
    return (
      '<span class="star_display">' +
      stars +
      '<span class="star_num">' +
      rating.toFixed(1) +
      "</span></span>"
    );
  }

  /* ── Build category tabs ── */
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

  /* ── Render animes ── */
  function removeMobileList() {
    var el = document.getElementById("mobile_card_list");
    if (el) el.remove();
  }

  function renderTable(animeList) {
    removeMobileList();
    tableEl.style.display = "";
    if (!animeList.length) {
      tableBody.innerHTML =
        '<tr><td colspan="6" class="empty_msg">No anime in this category.</td></tr>';
      return;
    }
    var html = "";
    animeList.forEach(function (a, idx) {
      var seasons = (a.seasons || []).map(normalizeSeason);
      var langs = parseLanguages(a.language);
      var seasonBadges = renderSeasonsDesktop(seasons);
      var langBadges = langs
        .map(function (l) {
          return '<span class="badge badge_lang">' + escapeHtml(l) + "</span>";
        })
        .join("");
      var safeUrl = sanitizeUrl(a.thumbnail_url);
      var safeName = escapeHtml(a.name);
      var thumbHtml = safeUrl
        ? '<img src="' +
          escapeHtml(safeUrl) +
          '" alt="' +
          safeName +
          '" class="thumb_img" loading="lazy">'
        : "";

      html +=
        "<tr>" +
        '<td class="col_id">' +
        (idx + 1) +
        "</td>" +
        '<td class="col_thumb">' +
        thumbHtml +
        "</td>" +
        '<td class="col_name">' +
        safeName +
        "</td>" +
        '<td class="col_season"><div class="season_wrap">' +
        seasonBadges +
        "</div></td>" +
        '<td class="col_lang"><div class="badge_wrap">' +
        langBadges +
        "</div></td>" +
        '<td class="col_stars">' +
        renderStars(a.stars) +
        "</td>" +
        "</tr>";
    });
    tableBody.innerHTML = html;
  }

  function renderCards(animeList) {
    tableEl.style.display = "none";
    var wrapper = document.getElementById("mobile_card_list");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "mobile_card_list";
      wrapper.className = "mobile_card_list";
      tableEl.parentElement.appendChild(wrapper);
    }
    if (!animeList.length) {
      wrapper.innerHTML = '<p class="empty_msg">No anime in this category.</p>';
      return;
    }
    var html = "";
    animeList.forEach(function (a, idx) {
      var seasons = (a.seasons || []).map(normalizeSeason);
      var langs = parseLanguages(a.language);
      var langBadges = langs
        .map(function (l) {
          return '<span class="badge badge_lang">' + escapeHtml(l) + "</span>";
        })
        .join("");
      var seasonsHtml = renderSeasonsMobile(seasons);
      var rating = a.stars != null ? parseFloat(a.stars).toFixed(1) : "\u2014";
      var safeUrl = sanitizeUrl(a.thumbnail_url);
      var safeName = escapeHtml(a.name);
      var thumbHtml = safeUrl
        ? '<img src="' +
          escapeHtml(safeUrl) +
          '" alt="' +
          safeName +
          '" class="m_card_thumb" loading="lazy">'
        : "";

      html +=
        '<div class="m_card">' +
        thumbHtml +
        '<div class="m_card_body">' +
        '<span class="m_card_id">#' +
        (idx + 1) +
        "</span>" +
        '<h3 class="m_card_title">' +
        safeName +
        "</h3>" +
        '<div class="m_card_seasons">' +
        seasonsHtml +
        "</div>" +
        '<div class="badge_wrap m_card_langs">' +
        langBadges +
        "</div>" +
        '<div class="m_card_footer">' +
        '<span class="m_card_rating"><span class="star filled">\u2605</span> ' +
        escapeHtml(String(rating)) +
        "</span>" +
        "</div></div></div>";
    });
    wrapper.innerHTML = html;
  }

  function render(animeList) {
    if (isMobile()) renderCards(animeList);
    else renderTable(animeList);
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
    render(getCurrentAnimeList(searchInput ? searchInput.value : ""));
  }

  /* ── Tab click ── */
  tabsContainer.addEventListener("click", function (e) {
    var btn = e.target.closest(".category_tab");
    if (!btn) return;
    var idx = parseInt(btn.getAttribute("data-cat-idx"), 10);
    if (!isNaN(idx)) showCategory(idx);
  });

  /* ── Search ── */
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      render(getCurrentAnimeList(this.value));
    });
  }

  /* ── Responsive re-render ── */
  var _prevMobile = isMobile();
  window.addEventListener("resize", function () {
    var m = isMobile();
    if (m !== _prevMobile) {
      _prevMobile = m;
      render(getCurrentAnimeList(searchInput ? searchInput.value : ""));
    }
  });

  /* ── Init ── */
  if (DATA.length) {
    buildTabs();
    showCategory(0);
  } else {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="empty_msg">This list is empty.</td></tr>';
  }
})();
