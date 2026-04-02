(function () {
  "use strict";

  var tabsContainer = document.getElementById("category_tabs");
  var tableBody = document.getElementById("anime_table_body");
  var tableEl = document.getElementById("anime_table");
  if (!tabsContainer || !tableBody || !tableEl) return;

  var AR = window.AnimeRenderer;
  var isMobile = AR.isMobile;
  var normalizeAnime = AR.normalizeAnime;
  var renderer = new AR(tableEl, tableBody, {
    showEditColumn: true,
    colSpan: 7,
    emptyMessage: "No anime found in this category.",
    displayIdFn: function (a, idx) {
      return "ID: " + (a.id || idx + 1);
    },
  });

  var tabs = tabsContainer.querySelectorAll(".category_tab");
  var MOBILE_BP = 768;
  var lastList = [];
  var _currentCategoryId = null;

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
      renderer.removeMobileList();
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

  function render(animeList) {
    lastList = animeList;
    renderer.render(animeList);
  }

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
      var serverList = Array.isArray(data) ? data : data.results || [];
      var normalized = serverList.map(normalizeAnime);

      render(normalized);
    } catch (_) {
      if (isMobile()) {
        renderer.removeMobileList();
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
        renderer.removeMobileList();
        tableEl.style.display = "";
        tableBody.innerHTML =
          '<tr><td colspan="7" class="empty_msg">Failed to load anime.</td></tr>';
      }
    }
  }

  window.refreshCurrentCategory = function () {
    if (_currentCategoryId != null) loadCategory(_currentCategoryId);
  };

  function findAnimeById(id) {
    return lastList.find(function (a) {
      return String(a.id) === String(id);
    });
  }

  function handleEditClick(e) {
    var btn = e.target.closest(".edit_btn");
    if (!btn) return;
    e.stopPropagation();

    var container = btn.closest("[data-anime-id]");
    if (!container) return;

    var animeId = container.getAttribute("data-anime-id");
    var anime = findAnimeById(animeId);
    if (!anime || !_currentCategoryId) return;

    if (typeof window.openEditAnimeModal === "function") {
      window.openEditAnimeModal(anime, _currentCategoryId);
    }
  }

  tableBody.addEventListener("click", handleEditClick);

  document.addEventListener("animeThumbLoaded", function (e) {
    if (e.detail && e.detail.animeId) {
      var anime = findAnimeById(e.detail.animeId);
      if (anime) {
        anime.thumbnail_url = e.detail.thumbUrl || "";
      }
    }
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".edit_btn");
    if (!btn) return;

    var mobileCard = btn.closest(".m_card[data-anime-id]");
    if (!mobileCard) return;

    e.stopPropagation();
    var animeId = mobileCard.getAttribute("data-anime-id");
    var anime = findAnimeById(animeId);
    if (!anime || !_currentCategoryId) return;

    if (typeof window.openEditAnimeModal === "function") {
      window.openEditAnimeModal(anime, _currentCategoryId);
    }
  });

  var REORDER_API = "/api/anime/list/category/";
  var MOBILE_HOLD_MS = 400;
  var DRAG_DEAD_ZONE = 4;

  function getCSRF() {
    var el = document.querySelector("[name=csrfmiddlewaretoken]");
    if (el) return el.value;
    var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function reorderList(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx === toIdx - 1) return null;
    var copy = lastList.slice();
    var item = copy.splice(fromIdx, 1)[0];
    var insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
    copy.splice(insertAt, 0, item);
    return copy;
  }

  async function persistOrder(newList) {
    if (!_currentCategoryId || !newList) return;
    var ids = newList.map(function (a) {
      return a.id;
    });
    try {
      var resp = await fetch(REORDER_API + _currentCategoryId + "/reorder/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRF(),
        },
        body: JSON.stringify({ order: ids }),
      });
      if (!resp.ok) throw new Error("Reorder failed");
      lastList = newList;
      render(lastList);
    } catch (_) {
      if (_currentCategoryId) loadCategory(_currentCategoryId);
    }
  }

  /* Desktop drag-and-drop on .col_id */
  (function () {
    var state = null;

    function removeIndicator() {
      var el = tableBody.querySelector(".anime_drop_indicator");
      if (el) el.remove();
    }

    function getDropIdx(clientY) {
      var rows = tableBody.querySelectorAll("tr[data-anime-id]");
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return i;
      }
      return rows.length;
    }

    function showIndicator(idx) {
      removeIndicator();
      var rows = tableBody.querySelectorAll("tr[data-anime-id]");
      var ind = document.createElement("tr");
      ind.className = "anime_drop_indicator";
      ind.innerHTML =
        '<td colspan="7"><div class="anime_drop_line"></div></td>';
      if (idx < rows.length) {
        tableBody.insertBefore(ind, rows[idx]);
      } else {
        tableBody.appendChild(ind);
      }
    }

    tableBody.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      var td = e.target.closest(".col_id");
      if (!td) return;
      var tr = td.closest("tr[data-anime-id]");
      if (!tr) return;

      e.preventDefault();

      var rows = tableBody.querySelectorAll("tr[data-anime-id]");
      var fromIdx = Array.prototype.indexOf.call(rows, tr);
      if (fromIdx < 0) return;

      var startX = e.clientX;
      var startY = e.clientY;
      var rect = tr.getBoundingClientRect();

      state = {
        tr: tr,
        fromIdx: fromIdx,
        startX: startX,
        startY: startY,
        offsetY: e.clientY - rect.top,
        offsetX: e.clientX - rect.left,
        ghost: null,
        dragging: false,
      };
    });

    document.addEventListener("mousemove", function (e) {
      if (!state) return;

      if (!state.dragging) {
        var dx = Math.abs(e.clientX - state.startX);
        var dy = Math.abs(e.clientY - state.startY);
        if (dx < DRAG_DEAD_ZONE && dy < DRAG_DEAD_ZONE) return;

        state.dragging = true;
        state.tr.classList.add("anime_dragging");
        document.body.classList.add("anime_reorder_active");

        var ghost = state.tr.cloneNode(true);
        ghost.className = "anime_drag_ghost";
        ghost.style.width = state.tr.offsetWidth + "px";
        document.body.appendChild(ghost);
        state.ghost = ghost;
      }

      e.preventDefault();
      state.ghost.style.top = e.clientY - state.offsetY + "px";
      state.ghost.style.left = e.clientX - state.offsetX + "px";
      showIndicator(getDropIdx(e.clientY));
    });

    document.addEventListener("mouseup", function (e) {
      if (!state) return;
      var s = state;
      state = null;

      if (!s.dragging) return;

      var dropIdx = getDropIdx(e.clientY);
      removeIndicator();
      s.tr.classList.remove("anime_dragging");
      s.ghost.remove();
      document.body.classList.remove("anime_reorder_active");

      var newList = reorderList(s.fromIdx, dropIdx);
      if (newList) persistOrder(newList);
    });
  })();

  /* Mobile long-press drag on .m_card */
  (function () {
    var state = null;
    var pressTimer = null;

    function removeIndicator(wrapper) {
      if (!wrapper) return;
      var el = wrapper.querySelector(".anime_drop_indicator_mobile");
      if (el) el.remove();
    }

    function getDropIdx(wrapper, clientY) {
      var cards = wrapper.querySelectorAll(".m_card[data-anime-id]");
      for (var i = 0; i < cards.length; i++) {
        var r = cards[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return i;
      }
      return cards.length;
    }

    function showIndicator(wrapper, idx) {
      removeIndicator(wrapper);
      var cards = wrapper.querySelectorAll(".m_card[data-anime-id]");
      var ind = document.createElement("div");
      ind.className = "anime_drop_indicator_mobile";
      if (idx < cards.length) {
        wrapper.insertBefore(ind, cards[idx]);
      } else {
        wrapper.appendChild(ind);
      }
    }

    function cancelPress() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }

    function cleanup() {
      cancelPress();
      if (state) {
        state.card.classList.remove("anime_dragging_mobile");
        if (state.ghost) state.ghost.remove();
        removeIndicator(state.wrapper);
        document.body.classList.remove("anime_reorder_active");
        state = null;
      }
    }

    document.addEventListener(
      "touchstart",
      function (e) {
        if (!isMobile()) return;
        var card = e.target.closest(".m_card[data-anime-id]");
        if (!card) return;
        if (e.target.closest(".edit_btn")) return;

        var touch = e.touches[0];
        var startX = touch.clientX;
        var startY = touch.clientY;
        var moved = false;

        pressTimer = setTimeout(function () {
          pressTimer = null;
          if (moved) return;

          if (navigator.vibrate) navigator.vibrate(50);

          var wrapper = document.getElementById("mobile_card_list");
          if (!wrapper) return;
          var cards = wrapper.querySelectorAll(".m_card[data-anime-id]");
          var fromIdx = Array.prototype.indexOf.call(cards, card);
          if (fromIdx < 0) return;

          var rect = card.getBoundingClientRect();
          var ghost = card.cloneNode(true);
          ghost.className = "m_card anime_drag_ghost_mobile";
          ghost.style.width = rect.width + "px";
          ghost.style.top = rect.top + "px";
          ghost.style.left = rect.left + "px";
          document.body.appendChild(ghost);

          card.classList.add("anime_dragging_mobile");
          document.body.classList.add("anime_reorder_active");

          state = {
            card: card,
            ghost: ghost,
            wrapper: wrapper,
            fromIdx: fromIdx,
            offsetY: touch.clientY - rect.top,
            offsetX: touch.clientX - rect.left,
            dropIdx: fromIdx,
          };
        }, MOBILE_HOLD_MS);

        var onTouchMove = function (ev) {
          var t = ev.touches[0];
          if (!state) {
            if (
              Math.abs(t.clientX - startX) > 10 ||
              Math.abs(t.clientY - startY) > 10
            ) {
              moved = true;
              cancelPress();
            }
          }
        };
        card.addEventListener("touchmove", onTouchMove, { passive: true });
        card.addEventListener(
          "touchend",
          function () {
            cancelPress();
            card.removeEventListener("touchmove", onTouchMove);
          },
          { once: true },
        );
        card.addEventListener(
          "touchcancel",
          function () {
            cleanup();
            card.removeEventListener("touchmove", onTouchMove);
          },
          { once: true },
        );
      },
      { passive: true },
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        if (!state) return;
        e.preventDefault();
        var touch = e.touches[0];
        state.ghost.style.top = touch.clientY - state.offsetY + "px";
        state.ghost.style.left = touch.clientX - state.offsetX + "px";

        var dropIdx = getDropIdx(state.wrapper, touch.clientY);
        state.dropIdx = dropIdx;
        showIndicator(state.wrapper, dropIdx);
      },
      { passive: false },
    );

    document.addEventListener("touchend", function () {
      if (!state) return;
      var s = state;
      cleanup();

      var newList = reorderList(s.fromIdx, s.dropIdx);
      if (newList) persistOrder(newList);
    });
  })();

  /* Responsive re-render */
  var wasMobile = isMobile();
  window.addEventListener("resize", function () {
    var nowMobile = isMobile();
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      if (lastList.length) render(lastList);
    }
  });

  /* Category tab drag-and-drop reorder */
  var CAT_REORDER_API = "/api/anime/category/reorder/";
  var CAT_HOLD_MS = 400;
  var CAT_DEAD_ZONE = 4;

  var tabsNav = document.getElementById("category_tabs");

  function getCatWrappers() {
    return tabsNav ? tabsNav.querySelectorAll(".category_tab_wrapper") : [];
  }

  function catReorderList(wrappers, fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx === toIdx - 1) return null;
    var arr = Array.prototype.slice.call(wrappers);
    var item = arr.splice(fromIdx, 1)[0];
    var insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
    arr.splice(insertAt, 0, item);
    return arr;
  }

  async function persistCatOrder(orderedWrappers) {
    var ids = orderedWrappers.map(function (w) {
      return parseInt(w.dataset.categoryId, 10);
    });
    try {
      var resp = await fetch(CAT_REORDER_API, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRF(),
        },
        body: JSON.stringify({ order: ids }),
      });
      if (!resp.ok) throw new Error("Reorder failed");
      window.location.reload();
    } catch (_) {
      window.location.reload();
    }
  }

  // Desktop: immediate drag on category tab
  if (tabsNav) {
    (function () {
      var state = null;

      function getCatDropIdx(clientX) {
        var wrappers = getCatWrappers();
        for (var i = 0; i < wrappers.length; i++) {
          var r = wrappers[i].getBoundingClientRect();
          if (clientX < r.left + r.width / 2) return i;
        }
        return wrappers.length;
      }

      function removeCatIndicator() {
        var el = tabsNav.querySelector(".cat_drop_indicator");
        if (el) el.remove();
      }

      function showCatIndicator(idx) {
        removeCatIndicator();
        var wrappers = getCatWrappers();
        var ind = document.createElement("div");
        ind.className = "cat_drop_indicator";
        if (idx < wrappers.length) {
          tabsNav.insertBefore(ind, wrappers[idx]);
        } else {
          tabsNav.appendChild(ind);
        }
      }

      tabsNav.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        var wrapper = e.target.closest(".category_tab_wrapper");
        if (!wrapper) return;
        if (e.target.closest(".category_edit_btn")) return;

        e.preventDefault();

        var wrappers = getCatWrappers();
        var fromIdx = Array.prototype.indexOf.call(wrappers, wrapper);
        if (fromIdx < 0) return;

        var rect = wrapper.getBoundingClientRect();

        state = {
          wrapper: wrapper,
          fromIdx: fromIdx,
          startX: e.clientX,
          startY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          ghost: null,
          dragging: false,
        };
      });

      document.addEventListener("mousemove", function (e) {
        if (!state) return;

        if (!state.dragging) {
          var dx = Math.abs(e.clientX - state.startX);
          var dy = Math.abs(e.clientY - state.startY);
          if (dx < CAT_DEAD_ZONE && dy < CAT_DEAD_ZONE) return;

          state.dragging = true;
          state.wrapper.classList.add("cat_dragging");
          document.body.classList.add("anime_reorder_active");

          var ghost = state.wrapper.cloneNode(true);
          ghost.className = "category_tab_wrapper cat_drag_ghost";
          ghost.style.width = state.wrapper.offsetWidth + "px";
          ghost.style.height = state.wrapper.offsetHeight + "px";
          document.body.appendChild(ghost);
          state.ghost = ghost;
        }

        e.preventDefault();
        state.ghost.style.top = e.clientY - state.offsetY + "px";
        state.ghost.style.left = e.clientX - state.offsetX + "px";
        showCatIndicator(getCatDropIdx(e.clientX));
      });

      document.addEventListener("mouseup", function (e) {
        if (!state) return;
        var s = state;
        state = null;

        if (!s.dragging) return;

        var dropIdx = getCatDropIdx(e.clientX);
        removeCatIndicator();
        s.wrapper.classList.remove("cat_dragging");
        s.ghost.remove();
        document.body.classList.remove("anime_reorder_active");

        var wrappers = getCatWrappers();
        var newOrder = catReorderList(wrappers, s.fromIdx, dropIdx);
        if (newOrder) persistCatOrder(newOrder);
      });
    })();

    // Mobile: long-press on category tab
    (function () {
      var state = null;
      var pressTimer = null;

      function getCatDropIdx(clientX) {
        var wrappers = getCatWrappers();
        for (var i = 0; i < wrappers.length; i++) {
          var r = wrappers[i].getBoundingClientRect();
          if (clientX < r.left + r.width / 2) return i;
        }
        return wrappers.length;
      }

      function removeCatIndicator() {
        var el = tabsNav.querySelector(".cat_drop_indicator");
        if (el) el.remove();
      }

      function showCatIndicator(idx) {
        removeCatIndicator();
        var wrappers = getCatWrappers();
        var ind = document.createElement("div");
        ind.className = "cat_drop_indicator";
        if (idx < wrappers.length) {
          tabsNav.insertBefore(ind, wrappers[idx]);
        } else {
          tabsNav.appendChild(ind);
        }
      }

      function cancelPress() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }

      function cleanup() {
        cancelPress();
        if (state) {
          state.wrapper.classList.remove("cat_dragging");
          if (state.ghost) state.ghost.remove();
          removeCatIndicator();
          document.body.classList.remove("anime_reorder_active");
          state = null;
        }
      }

      tabsNav.addEventListener(
        "touchstart",
        function (e) {
          var wrapper = e.target.closest(".category_tab_wrapper");
          if (!wrapper) return;
          if (e.target.closest(".category_edit_btn")) return;

          var touch = e.touches[0];
          var startX = touch.clientX;
          var startY = touch.clientY;
          var moved = false;

          pressTimer = setTimeout(function () {
            pressTimer = null;
            if (moved) return;

            if (navigator.vibrate) navigator.vibrate(50);

            var wrappers = getCatWrappers();
            var fromIdx = Array.prototype.indexOf.call(wrappers, wrapper);
            if (fromIdx < 0) return;

            var rect = wrapper.getBoundingClientRect();
            var ghost = wrapper.cloneNode(true);
            ghost.className = "category_tab_wrapper cat_drag_ghost";
            ghost.style.width = rect.width + "px";
            ghost.style.height = rect.height + "px";
            ghost.style.top = rect.top + "px";
            ghost.style.left = rect.left + "px";
            document.body.appendChild(ghost);

            wrapper.classList.add("cat_dragging");
            document.body.classList.add("anime_reorder_active");

            state = {
              wrapper: wrapper,
              ghost: ghost,
              fromIdx: fromIdx,
              offsetX: touch.clientX - rect.left,
              offsetY: touch.clientY - rect.top,
              dropIdx: fromIdx,
            };
          }, CAT_HOLD_MS);

          var onTouchMove = function (ev) {
            var t = ev.touches[0];
            if (!state) {
              if (
                Math.abs(t.clientX - startX) > 10 ||
                Math.abs(t.clientY - startY) > 10
              ) {
                moved = true;
                cancelPress();
              }
            }
          };
          wrapper.addEventListener("touchmove", onTouchMove, {
            passive: true,
          });
          wrapper.addEventListener(
            "touchend",
            function () {
              cancelPress();
              wrapper.removeEventListener("touchmove", onTouchMove);
            },
            { once: true },
          );
          wrapper.addEventListener(
            "touchcancel",
            function () {
              cleanup();
              wrapper.removeEventListener("touchmove", onTouchMove);
            },
            { once: true },
          );
        },
        { passive: true },
      );

      document.addEventListener(
        "touchmove",
        function (e) {
          if (!state) return;
          e.preventDefault();
          var touch = e.touches[0];
          state.ghost.style.top = touch.clientY - state.offsetY + "px";
          state.ghost.style.left = touch.clientX - state.offsetX + "px";

          var dropIdx = getCatDropIdx(touch.clientX);
          state.dropIdx = dropIdx;
          showCatIndicator(dropIdx);
        },
        { passive: false },
      );

      document.addEventListener("touchend", function () {
        if (!state) return;
        var s = state;
        cleanup();

        var wrappers = getCatWrappers();
        var newOrder = catReorderList(wrappers, s.fromIdx, s.dropIdx);
        if (newOrder) persistCatOrder(newOrder);
      });
    })();
  }

  /* Tab click handlers & initial load */
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var wrapper = btn.closest(".category_tab_wrapper");

      if (btn.classList.contains("active")) {
        if (wrapper) wrapper.classList.toggle("category_edit_visible");
        return;
      }

      document
        .querySelectorAll(".category_edit_visible")
        .forEach(function (el) {
          el.classList.remove("category_edit_visible");
        });

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
})();
