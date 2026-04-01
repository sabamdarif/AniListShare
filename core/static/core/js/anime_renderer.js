/**
 * AnimeRenderer — shared rendering module for anime lists.
 * Used by both anime_table.js (editable) and shared_list.js (read-only).
 *
 * Usage:
 *   var renderer = new AnimeRenderer(tableEl, tableBody, { showEditColumn: true });
 *   renderer.render(animeList);
 */
window.AnimeRenderer = (function () {
  "use strict";

  var MOBILE_BP = 768;

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

  function isMobile() {
    return window.innerWidth <= MOBILE_BP;
  }

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

  function langBadgesHtml(langs) {
    return langs
      .map(function (l) {
        return '<span class="badge badge_lang">' + escapeHtml(l) + "</span>";
      })
      .join("");
  }

  function thumbHtml(url, name, cssClass) {
    var safeUrl = sanitizeUrl(url);
    if (!safeUrl) return "";
    return (
      '<img src="' +
      escapeHtml(safeUrl) +
      '" alt="' +
      escapeHtml(name) +
      '" class="' +
      cssClass +
      '" loading="lazy">'
    );
  }

  // ── Image error handler (shared, runs once) ──
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

  // ── Constructor ──
  function AnimeRenderer(tableEl, tableBody, opts) {
    this.tableEl = tableEl;
    this.tableBody = tableBody;
    this.opts = Object.assign(
      {
        showEditColumn: false,
        colSpan: 7,
        emptyMessage: "No anime found in this category.",
        emptyListMessage: "This list is empty.",
        displayIdFn: null,
      },
      opts || {},
    );
  }

  AnimeRenderer.prototype.removeMobileList = function () {
    var el = document.getElementById("mobile_card_list");
    if (el) el.remove();
  };

  AnimeRenderer.prototype.renderTable = function (animeList) {
    this.removeMobileList();
    this.tableEl.style.display = "";
    if (!animeList.length) {
      this.tableBody.innerHTML =
        '<tr><td colspan="' +
        this.opts.colSpan +
        '" class="empty_msg">' +
        escapeHtml(this.opts.emptyMessage) +
        "</td></tr>";
      return;
    }
    var showEdit = this.opts.showEditColumn;
    var html = "";
    animeList.forEach(function (a, idx) {
      var langs = parseLanguages(a.language);
      var seasons = Array.isArray(a.seasons)
        ? a.seasons
        : (a.seasons || []).map(normalizeSeason);
      var seasonBadges = renderSeasonsDesktop(seasons);
      var safeName = escapeHtml(a.name);

      html +=
        "<tr" +
        (showEdit ? ' data-anime-id="' + a.id + '"' : "") +
        ">" +
        '<td class="col_id">' +
        (idx + 1) +
        "</td>" +
        '<td class="col_thumb">' +
        thumbHtml(a.thumbnail_url, a.name, "thumb_img") +
        "</td>" +
        '<td class="col_name">' +
        safeName +
        "</td>" +
        '<td class="col_season"><div class="season_wrap">' +
        seasonBadges +
        "</div></td>" +
        '<td class="col_lang"><div class="badge_wrap">' +
        langBadgesHtml(langs) +
        "</div></td>" +
        '<td class="col_stars">' +
        renderStars(a.stars) +
        "</td>";

      if (showEdit) {
        html +=
          '<td class="col_edit">' +
          '<button class="edit_btn" title="Edit">' +
          '<i class="nf nf-fa-pencil"></i></button></td>';
      }

      html += "</tr>";
    });
    this.tableBody.innerHTML = html;
  };

  AnimeRenderer.prototype.renderCards = function (animeList) {
    this.tableEl.style.display = "none";
    var wrapper = document.getElementById("mobile_card_list");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "mobile_card_list";
      wrapper.className = "mobile_card_list";
      this.tableEl.parentElement.appendChild(wrapper);
    }
    if (!animeList.length) {
      wrapper.innerHTML =
        '<p class="empty_msg">' + escapeHtml(this.opts.emptyMessage) + "</p>";
      return;
    }
    var showEdit = this.opts.showEditColumn;
    var displayIdFn = this.opts.displayIdFn;
    var html = "";
    animeList.forEach(function (a, idx) {
      var langs = parseLanguages(a.language);
      var seasons = Array.isArray(a.seasons)
        ? a.seasons
        : (a.seasons || []).map(normalizeSeason);
      var seasonsHtml = renderSeasonsMobile(seasons);
      var rating = a.stars != null ? parseFloat(a.stars).toFixed(1) : "\u2014";
      var safeName = escapeHtml(a.name);
      var displayId = displayIdFn ? displayIdFn(a, idx) : "#" + (idx + 1);

      html +=
        '<div class="m_card"' +
        (showEdit ? ' data-anime-id="' + a.id + '"' : "") +
        ">" +
        thumbHtml(a.thumbnail_url, a.name, "m_card_thumb") +
        '<div class="m_card_body">' +
        '<span class="m_card_id">' +
        escapeHtml(displayId) +
        "</span>" +
        '<h3 class="m_card_title">' +
        safeName +
        "</h3>" +
        '<div class="m_card_seasons">' +
        seasonsHtml +
        "</div>" +
        '<div class="badge_wrap m_card_langs">' +
        langBadgesHtml(langs) +
        "</div>" +
        '<div class="m_card_footer">' +
        '<span class="m_card_rating"><span class="star filled">\u2605</span> ' +
        escapeHtml(String(rating)) +
        "</span>";

      if (showEdit) {
        html +=
          '<button class="edit_btn" title="Edit">' +
          '<i class="nf nf-fa-pencil"></i></button>';
      }

      html += "</div></div></div>";
    });
    wrapper.innerHTML = html;
  };

  AnimeRenderer.prototype.render = function (animeList) {
    if (isMobile()) this.renderCards(animeList);
    else this.renderTable(animeList);
  };

  // Static helpers exposed for external use
  AnimeRenderer.escapeHtml = escapeHtml;
  AnimeRenderer.sanitizeUrl = sanitizeUrl;
  AnimeRenderer.isMobile = isMobile;
  AnimeRenderer.parseLanguages = parseLanguages;
  AnimeRenderer.normalizeSeason = normalizeSeason;
  AnimeRenderer.normalizeAnime = normalizeAnime;
  AnimeRenderer.renderSeasonsDesktop = renderSeasonsDesktop;
  AnimeRenderer.renderSeasonsMobile = renderSeasonsMobile;
  AnimeRenderer.renderStars = renderStars;

  // ── Desktop comment tooltips ──
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

  // ── Mobile comment popups ──
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

  return AnimeRenderer;
})();
