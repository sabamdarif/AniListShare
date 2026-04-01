(function () {
  "use strict";

  var tabsContainer = document.getElementById("category_tabs");
  var tableBody = document.getElementById("anime_table_body");
  var tableEl = document.getElementById("anime_table");
  if (!tabsContainer || !tableBody || !tableEl) return;

  var tabs = tabsContainer.querySelectorAll(".category_tab");
  var MOBILE_BP = 768;
  var lastList = [];
  var _currentCategoryId = null;

  var isMobile = function () {
    return window.innerWidth <= MOBILE_BP;
  };

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  /**
   * Only allow http / https URLs for thumbnails.
   * Blocks javascript:, data:, vbscript:, etc.
   */
  function sanitizeUrl(url) {
    if (!url) return "";
    try {
      var parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.href;
      }
    } catch (_) {
      /* invalid URL */
    }
    return "";
  }

  /* ────────────────────────────────────────────
   *  Image-error handler (replaces inline onerror)
   * ──────────────────────────────────────────── */
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

  /* ────────────────────────────────────────────
   *  Tab handling
   * ──────────────────────────────────────────── */

  function setActiveTab(btn) {
    tabs.forEach(function (t) {
      t.classList.remove("active");
      if (
        t.parentElement &&
        t.parentElement.classList.contains("category_tab_wrapper")
      ) {
        t.parentElement.classList.remove("active");
      }
    });
    btn.classList.add("active");
    if (
      btn.parentElement &&
      btn.parentElement.classList.contains("category_tab_wrapper")
    ) {
      btn.parentElement.classList.add("active");
    }
  }

  /* ────────────────────────────────────────────
   *  Skeleton loading
   * ──────────────────────────────────────────── */

  function showSkeleton(rows) {
    var i, html;
    if (isMobile()) {
      tableEl.style.display = "none";
      var wrapper = document.getElementById("mobile_card_list");
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "mobile_card_list";
        wrapper.className = "mobile_card_list";
        tableEl.parentElement.appendChild(wrapper);
      }
      html = "";
      for (i = 0; i < rows; i++) {
        html +=
          '<div class="m_card m_card_skel">' +
          '<div class="skel skel_thumb_m"></div>' +
          '<div class="m_card_body">' +
          '<div class="skel skel_text" style="width:60%"></div>' +
          '<div class="skel skel_text" style="width:80%;margin-top:6px"></div>' +
          '<div class="skel skel_badge" style="margin-top:8px"></div>' +
          "</div></div>";
      }
      wrapper.innerHTML = html;
    } else {
      removeMobileList();
      tableEl.style.display = "";
      html = "";
      for (i = 0; i < rows; i++) {
        html +=
          '<tr class="skeleton_row">' +
          '<td class="col_id"><span class="skel"></span></td>' +
          '<td class="col_thumb"><span class="skel skel_thumb"></span></td>' +
          '<td class="col_name"><span class="skel skel_text"></span></td>' +
          '<td class="col_season"><span class="skel skel_badge"></span></td>' +
          '<td class="col_lang"><span class="skel skel_badge"></span></td>' +
          '<td class="col_stars"><span class="skel skel_text_sm"></span></td>' +
          '<td class="col_edit"><span class="skel skel_btn"></span></td>' +
          "</tr>";
      }
      tableBody.innerHTML = html;
    }
  }

  function removeMobileList() {
    var el = document.getElementById("mobile_card_list");
    if (el) el.remove();
  }

  /* ────────────────────────────────────────────
   *  Data normalisation
   *
   *  The API returns seasons with:
   *    total_episodes, watched_episodes, is_completed
   *  Internal render functions expect:
   *    total, watched, completed
   * ──────────────────────────────────────────── */

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
        : s.completed != null
          ? Boolean(s.completed)
          : total > 0 && watched >= total;

    return {
      number: Number(s.number) || 1,
      total: total,
      watched: watched,
      completed: completed,
      comment: s.comment || "",
    };
  }

  function normalizeAnime(raw) {
    return {
      id: raw.id,
      name: raw.name || "",
      thumbnail_url: raw.thumbnail_url || "",
      language: raw.language || "",
      stars: raw.stars,
      order: raw.order || 0,
      seasons: (raw.seasons || []).map(normalizeSeason),
      _pending: Boolean(raw._pending),
    };
  }

  /* ────────────────────────────────────────────
   *  Language parsing
   * ──────────────────────────────────────────── */

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

  /* ────────────────────────────────────────────
   *  Rendering helpers
   * ──────────────────────────────────────────── */

  function hasSeasonComment(s) {
    return s.comment != null && String(s.comment).trim().length > 0;
  }

  function renderSeasonsDesktop(seasons) {
    if (!seasons || !seasons.length) {
      return '<span class="season_pill" style="opacity:.5">\u2014</span>';
    }

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
          Number(s.watched) +
          "/" +
          Number(s.total) +
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
            Number(s.watched) +
            "/" +
            Number(s.total) +
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

  /* ────────────────────────────────────────────
   *  Main renderers
   * ──────────────────────────────────────────── */

  function renderTable(animeList) {
    removeMobileList();
    tableEl.style.display = "";
    if (!animeList.length) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="empty_msg">No anime found in this category.</td></tr>';
      return;
    }
    var html = "";
    animeList.forEach(function (a, idx) {
      var langs = parseLanguages(a.language);
      var seasonBadges = renderSeasonsDesktop(a.seasons);
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
        '<td class="col_edit">' +
        '<button class="edit_btn" title="Edit">' +
        '<i class="nf nf-fa-pencil"></i></button></td>' +
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
      wrapper.innerHTML =
        '<p class="empty_msg">No anime found in this category.</p>';
      return;
    }
    var html = "";
    animeList.forEach(function (a, idx) {
      var langs = parseLanguages(a.language);
      var langBadges = langs
        .map(function (l) {
          return '<span class="badge badge_lang">' + escapeHtml(l) + "</span>";
        })
        .join("");
      var seasonsHtml = renderSeasonsMobile(a.seasons);
      var rating = a.stars != null ? parseFloat(a.stars).toFixed(1) : "\u2014";
      var safeUrl = sanitizeUrl(a.thumbnail_url);
      var safeName = escapeHtml(a.name);
      var displayId = escapeHtml(String(a.id || idx + 1));
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
        '<span class="m_card_id">ID: ' +
        displayId +
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
        '<button class="edit_btn" title="Edit">' +
        '<i class="nf nf-fa-pencil"></i></button>' +
        "</div></div></div>";
    });
    wrapper.innerHTML = html;
  }

  function render(animeList) {
    lastList = animeList;
    if (isMobile()) renderCards(animeList);
    else renderTable(animeList);
  }

  /* ────────────────────────────────────────────
   *  API communication
   * ──────────────────────────────────────────── */

  async function loadCategory(categoryId) {
    var catId = parseInt(categoryId, 10);
    if (isNaN(catId)) return;

    _currentCategoryId = catId;
    showSkeleton(4);

    try {
      var res = await fetch("/api/anime/list/category/" + catId + "/", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error("HTTP " + res.status);

      var data = await res.json();

      /* ListAPIView returns a plain array unless pagination is enabled,
         in which case results live under data.results.                  */
      var serverList = Array.isArray(data) ? data : data.results || [];
      var normalized = serverList.map(normalizeAnime);

      render(normalized);
    } catch (_) {
      if (isMobile()) {
        removeMobileList();
        var w = document.createElement("div");
        w.id = "mobile_card_list";
        w.className = "mobile_card_list";
        var p = document.createElement("p");
        p.className = "empty_msg";
        p.textContent = "Failed to load anime.";
        w.appendChild(p);
        tableEl.parentElement.appendChild(w);
        tableEl.style.display = "none";
      } else {
        removeMobileList();
        tableEl.style.display = "";
        tableBody.innerHTML =
          '<tr><td colspan="7" class="empty_msg">Failed to load anime.</td></tr>';
      }
    }
  }

  /* ────────────────────────────────────────────
   *  Global refresh
   * ──────────────────────────────────────────── */

  window.refreshCurrentCategory = function () {
    if (_currentCategoryId != null) loadCategory(_currentCategoryId);
  };

  /* ────────────────────────────────────────────
   *  Responsive re-render
   * ──────────────────────────────────────────── */

  var wasMobile = isMobile();
  window.addEventListener("resize", function () {
    var nowMobile = isMobile();
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      if (lastList.length) render(lastList);
    }
  });

  /* ────────────────────────────────────────────
   *  Tab click handlers & initial load
   * ──────────────────────────────────────────── */

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setActiveTab(btn);
      try {
        localStorage.setItem("active_category", btn.dataset.categoryId);
      } catch (_) {}
      loadCategory(btn.dataset.categoryId);
    });
  });

  if (tabs.length > 0) {
    var startTab = tabs[0];
    try {
      var savedId = localStorage.getItem("active_category");
      if (savedId) {
        var found = Array.prototype.find.call(tabs, function (t) {
          return t.dataset.categoryId === savedId;
        });
        if (found) startTab = found;
      }
    } catch (_) {}
    setActiveTab(startTab);
    loadCategory(startTab.dataset.categoryId);
  }

  /* ────────────────────────────────────────────
   *  Desktop comment tooltips
   *
   *  Built with DOM methods — no innerHTML with
   *  user content — to prevent XSS.
   * ──────────────────────────────────────────── */

  var activeTooltip = null;
  var hoverTimer = null;

  function removeTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltip(anchor) {
    var comment = anchor.getAttribute("data-comment");
    if (!comment) return;
    removeTooltip();

    var tip = document.createElement("div");
    tip.className = "season_comment_tooltip";

    var stem = document.createElement("div");
    stem.className = "season_comment_stem";
    tip.appendChild(stem);

    var header = document.createElement("div");
    header.className = "season_comment_header";
    header.textContent =
      (anchor.getAttribute("data-season") || "Season") + " Comment";
    tip.appendChild(header);

    var body = document.createElement("div");
    body.className = "season_comment_body";
    body.textContent = comment;
    tip.appendChild(body);

    var footer = document.createElement("div");
    footer.className = "season_comment_footer";
    var closeBtn = document.createElement("button");
    closeBtn.className = "season_comment_close_btn";
    closeBtn.type = "button";
    closeBtn.textContent = "Close";
    footer.appendChild(closeBtn);
    tip.appendChild(footer);

    document.body.appendChild(tip);
    activeTooltip = tip;

    /* Position */
    var rect = anchor.getBoundingClientRect();
    var stemH = 10;
    tip.style.visibility = "hidden";
    tip.style.display = "block";
    var tipRect = tip.getBoundingClientRect();
    tip.style.visibility = "";

    var left = rect.left + rect.width / 2 - tipRect.width / 2;
    if (left < 8) left = 8;
    if (left + tipRect.width > window.innerWidth - 8)
      left = window.innerWidth - tipRect.width - 8;

    tip.style.top = rect.bottom + stemH + window.scrollY + "px";
    tip.style.left = left + window.scrollX + "px";

    var stemLeft = rect.left + rect.width / 2 - left - 8;
    stem.style.left =
      Math.max(12, Math.min(stemLeft, tipRect.width - 28)) + "px";

    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      removeTooltip();
    });
  }

  document.addEventListener("mouseover", function (e) {
    if (isMobile()) return;
    if (activeTooltip && activeTooltip.contains(e.target)) {
      clearTimeout(hoverTimer);
      return;
    }
    var el = e.target.closest(".season_has_tooltip[data-comment]");
    if (el) {
      clearTimeout(hoverTimer);
      showTooltip(el);
    }
  });

  document.addEventListener("mouseout", function (e) {
    if (isMobile()) return;
    var fromAnchor = e.target.closest(".season_has_tooltip[data-comment]");
    var fromTooltip =
      activeTooltip &&
      (activeTooltip === e.target || activeTooltip.contains(e.target));
    if (fromAnchor || fromTooltip) {
      var related = e.relatedTarget;
      if (
        activeTooltip &&
        (activeTooltip === related || activeTooltip.contains(related))
      )
        return;
      if (
        related &&
        related.closest &&
        related.closest(".season_has_tooltip[data-comment]")
      )
        return;
      hoverTimer = setTimeout(removeTooltip, 150);
    }
  });

  document.addEventListener("click", function (e) {
    if (isMobile()) return;
    if (e.target.closest(".season_comment_close_btn")) return;
    var el = e.target.closest(".season_has_tooltip[data-comment]");
    if (el) {
      if (activeTooltip) removeTooltip();
      else showTooltip(el);
    } else if (activeTooltip && !activeTooltip.contains(e.target)) {
      removeTooltip();
    }
  });

  /* ────────────────────────────────────────────
   *  Mobile comment popups
   *
   *  Also built with DOM methods to avoid XSS.
   * ──────────────────────────────────────────── */

  var activeMobilePopup = null;

  function removeMobilePopup() {
    if (activeMobilePopup) {
      activeMobilePopup.remove();
      activeMobilePopup = null;
    }
  }

  document.addEventListener("click", function (e) {
    if (!isMobile()) return;

    if (
      activeMobilePopup &&
      !activeMobilePopup.contains(e.target) &&
      !e.target.closest(".m_season_has_popup[data-comment]")
    ) {
      removeMobilePopup();
      return;
    }
    if (e.target.closest(".m_season_popup_close")) {
      removeMobilePopup();
      return;
    }

    var el = e.target.closest(".m_season_has_popup[data-comment]");
    if (!el) return;
    removeMobilePopup();

    var overlay = document.createElement("div");
    overlay.className = "m_season_popup_overlay";

    var card = document.createElement("div");
    card.className = "m_season_popup_card";

    var title = document.createElement("div");
    title.className = "m_season_popup_title";
    title.textContent =
      (el.getAttribute("data-season") || "Season") + " Comment";

    var popupBody = document.createElement("div");
    popupBody.className = "m_season_popup_body";
    popupBody.textContent = el.getAttribute("data-comment");

    var closeBtn = document.createElement("button");
    closeBtn.className = "m_season_popup_close";
    closeBtn.type = "button";
    closeBtn.textContent = "Close";

    card.appendChild(title);
    card.appendChild(popupBody);
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    activeMobilePopup = overlay;

    requestAnimationFrame(function () {
      overlay.classList.add("m_popup_visible");
    });
  });
})();
