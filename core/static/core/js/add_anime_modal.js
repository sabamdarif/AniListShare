(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const JIKAN = "https://api.jikan.moe/v4/anime";
    const LANG_PRESETS = [
      "Japanese",
      "English",
      "Spanish",
      "Hindi",
      "French",
      "German",
      "Korean",
      "Chinese",
      "Portuguese",
      "Italian",
    ];
    function getCSRF() {
      const el = document.querySelector("[name=csrfmiddlewaretoken]");
      if (el) return el.value;
      const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : "";
    }
    const CSRF = getCSRF();

    let _debounce = null;
    let _selected = null;
    let _selectedName = "";
    let _rating = 0;
    let _seasons = [];
    let _languages = [];

    /* ── build modal DOM ── */
    function createModal() {
      const overlay = document.createElement("div");
      overlay.className = "aam_overlay";
      overlay.innerHTML = `
        <div class="aam_card">
          <div class="aam_header">
            <span class="aam_title">Add Anime</span>
            <button class="aam_close_btn" aria-label="Close">&times;</button>
          </div>
          <div class="aam_body">

            <!-- thumbnail + name side-by-side -->
            <div class="aam_top_row">

              <!-- thumbnail -->
              <div class="aam_thumb_area">
                <div class="aam_thumb_box">
                  <img class="aam_thumb_img" src="" alt="">
                </div>
                <button type="button" class="aam_edit_url_btn">Edit Thumbnail URL</button>
                <div class="aam_url_editor" style="display:none">
                  <input class="aam_url_input" type="url" placeholder="Paste image URL…">
                  <button type="button" class="aam_url_done">Done</button>
                </div>
              </div>

              <!-- name input with search -->
              <div class="aam_name_wrap">
                <div class="aam_name_field">
                  <input class="aam_name_input" type="text"
                         placeholder="Anime Name" autocomplete="off">
                  <span class="aam_search_spinner"></span>
                </div>
                <div class="aam_suggestions"></div>
              </div>

            </div>

            <!-- category -->
            <div class="aam_section">
              <select class="aam_category_select"></select>
            </div>

            <!-- stars -->
            <div class="aam_section">
              <div class="aam_star_row">
                ${[1, 2, 3, 4, 5].map((i) => `<span class="aam_star" data-v="${i}">★</span>`).join("")}
              </div>
            </div>

            <!-- seasons -->
            <div class="aam_section">
              <div class="aam_seasons_header">
                <span class="aam_seasons_title">Seasons</span>
              </div>
              <div class="aam_seasons_cols">
                <span>Season</span><span>Episodes Watched</span><span>Season Comment</span>
              </div>
              <div class="aam_seasons_list"></div>
              <button type="button" class="aam_add_season_btn">+ Add Season</button>
            </div>

            <!-- language tags -->
            <div class="aam_section">
              <div class="aam_lang_wrap">
                <div class="aam_lang_tags"></div>
                <div class="aam_lang_input_wrap">
                  <input class="aam_lang_input" type="text"
                         placeholder="Type to add language…" autocomplete="off">
                </div>
              </div>
            </div>

          </div>
          <div class="aam_footer">
            <span class="aam_error"></span>
            <button class="aam_save_btn">Save</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      return overlay;
    }

    const OV = createModal();
    const $ = (s) => OV.querySelector(s);

    const nameInput = $(".aam_name_input");
    const spinner = $(".aam_search_spinner");
    const suggestions = $(".aam_suggestions");
    const thumbImg = $(".aam_thumb_img");
    const thumbBox = $(".aam_thumb_box");
    const editUrlBtn = $(".aam_edit_url_btn");
    const urlEditor = $(".aam_url_editor");
    const urlInput = $(".aam_url_input");
    const urlDone = $(".aam_url_done");
    const catSelect = $(".aam_category_select");
    const starRow = $(".aam_star_row");
    const seasonsList = $(".aam_seasons_list");
    const addSeasonBtn = $(".aam_add_season_btn");
    const langTags = $(".aam_lang_tags");
    const langInput = $(".aam_lang_input");
    const errorEl = $(".aam_error");

    const langDrop = document.createElement("div");
    langDrop.className = "aam_lang_dropdown";
    OV.appendChild(langDrop);
    const saveBtn = $(".aam_save_btn");

    /* ── open / close ── */
    function open() {
      reset();
      populateCategories();
      OV.style.display = "flex";
      requestAnimationFrame(() => OV.classList.add("aam_visible"));
      nameInput.focus();
    }
    function close() {
      OV.classList.remove("aam_visible");
      setTimeout(() => (OV.style.display = "none"), 250);
    }
    OV.style.display = "none";

    $(".aam_close_btn").addEventListener("click", close);
    OV.addEventListener("click", (e) => {
      if (e.target === OV) close();
    });

    // ★ Now these will always find the buttons because DOM is ready
    document.querySelector(".btn_add_anime")?.addEventListener("click", open);
    document
      .getElementById("m_fab_add_anime")
      ?.addEventListener("click", () => {
        const container = document.getElementById("m_fab_container");
        if (container) container.classList.remove("m_fab_open");
        open();
      });

    /* ── reset ── */
    function reset() {
      _selected = null;
      _selectedName = "";
      _rating = 0;
      _seasons = [];
      _languages = [];
      nameInput.value = "";
      suggestions.innerHTML = "";
      thumbImg.src = "";
      thumbImg.style.display = "none";
      thumbBox.classList.add("aam_thumb_empty");
      editUrlBtn.style.display = "none";
      urlEditor.style.display = "none";
      urlInput.value = "";
      errorEl.textContent = "";
      renderStars();
      renderSeasons();
      renderLangTags();
      addSeason();
    }

    /* ── categories ── */
    function populateCategories() {
      const tabs = document.querySelectorAll(".category_tab");
      const activeTab = document.querySelector(".category_tab.active");
      catSelect.innerHTML = "";
      tabs.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.dataset.categoryId;
        o.textContent = t.textContent.trim();
        catSelect.appendChild(o);
      });
      // Pre-select the currently active category
      if (activeTab) {
        catSelect.value = activeTab.dataset.categoryId;
      }
    }

    /* ── name search (Jikan) ── */
    nameInput.addEventListener("input", () => {
      clearTimeout(_debounce);
      _selectedName = "";
      const q = nameInput.value.trim();
      if (q.length < 2) {
        suggestions.innerHTML = "";
        return;
      }
      spinner.style.display = "block";
      _debounce = setTimeout(() => searchJikan(q), 400);
    });

    /* ── Esc hides suggestions ── */
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && suggestions.innerHTML.trim()) {
        suggestions.innerHTML = "";
        e.stopPropagation();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && suggestions.innerHTML.trim()) {
        suggestions.innerHTML = "";
        e.stopPropagation();
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".aam_name_wrap")) {
        suggestions.innerHTML = "";
      }
    });

    async function searchJikan(q) {
      try {
        const r = await fetch(
          `${JIKAN}?q=${encodeURIComponent(q)}&limit=6&sfw=true`,
        );
        const j = await r.json();
        renderSuggestions(j.data || [], nameInput.value.trim());
      } catch {
        suggestions.innerHTML = "";
      } finally {
        spinner.style.display = "none";
      }
    }

    function bestMatchName(item, query) {
      const jp = item.title || "";
      const en = item.title_english || "";
      const ql = query.toLowerCase();
      const jpMatch = jp && jp.toLowerCase().includes(ql);
      const enMatch = en && en.toLowerCase().includes(ql);
      if (jpMatch && !enMatch) return jp;
      if (enMatch && !jpMatch) return en;
      return en || jp;
    }

    function renderSuggestions(list, query) {
      if (!list.length) {
        suggestions.innerHTML = "";
        return;
      }
      suggestions.innerHTML = list
        .map((a) => {
          const displayName = bestMatchName(a, query);
          const thumbSrc =
            a.images?.jpg?.small_image_url || a.images?.jpg?.image_url || "";
          const fullImg = a.images?.jpg?.image_url || "";
          const esc = (s) => s.replace(/"/g, "&quot;");
          return `<div class="aam_sug_item" data-name="${esc(displayName)}" data-img="${esc(fullImg)}">
          ${thumbSrc ? `<img class="aam_sug_thumb" src="${esc(thumbSrc)}" alt="">` : `<span class="aam_sug_thumb_empty"></span>`}
          <span class="aam_sug_name">${displayName}</span>
        </div>`;
        })
        .join("");
    }

    suggestions.addEventListener("click", (e) => {
      const item = e.target.closest(".aam_sug_item");
      if (!item) return;
      pickAnime(item.dataset.name, item.dataset.img);
    });

    function pickAnime(name, img) {
      _selected = { name, image: img };
      _selectedName = name;
      nameInput.value = name;
      suggestions.innerHTML = "";
      if (img) {
        thumbImg.src = img;
        thumbImg.style.display = "block";
        thumbBox.classList.remove("aam_thumb_empty");
        urlInput.value = img;
      } else {
        thumbImg.src = "";
        thumbImg.style.display = "none";
        thumbBox.classList.add("aam_thumb_empty");
      }
      editUrlBtn.style.display = "block";
    }

    /* ── thumbnail url editor ── */
    editUrlBtn.addEventListener("click", () => {
      urlEditor.style.display =
        urlEditor.style.display === "none" ? "flex" : "none";
    });
    urlDone.addEventListener("click", () => {
      const u = urlInput.value.trim();
      if (u) {
        thumbImg.src = u;
        thumbImg.style.display = "block";
        thumbBox.classList.remove("aam_thumb_empty");
      } else {
        thumbImg.src = "";
        thumbImg.style.display = "none";
        thumbBox.classList.add("aam_thumb_empty");
      }
      urlEditor.style.display = "none";
    });

    /* ── stars ── */
    starRow.addEventListener("click", (e) => {
      const s = e.target.closest(".aam_star");
      if (!s) return;
      _rating = parseInt(s.dataset.v);
      renderStars();
    });
    function renderStars() {
      starRow.querySelectorAll(".aam_star").forEach((s) => {
        s.classList.toggle("aam_star_active", parseInt(s.dataset.v) <= _rating);
      });
    }

    /* ── seasons ── */
    function addSeason() {
      _seasons.push({ total: 0, watched: 0, comment: "" });
      renderSeasons();
    }
    function removeSeason(i) {
      _seasons.splice(i, 1);
      renderSeasons();
    }

    function renderSeasons() {
      seasonsList.innerHTML = _seasons
        .map(
          (s, i) => `
        <div class="aam_season_row" data-idx="${i}">
          <span class="aam_season_label">Season ${i + 1}</span>
          <div class="aam_ep_cell">
            <input type="number" class="aam_ep_watched" min="0" value="${s.watched}" placeholder="0">
            <span class="aam_ep_slash">/</span>
            <input type="number" class="aam_ep_total" min="0" value="${s.total}" placeholder="0">
          </div>
          <textarea class="aam_season_comment" placeholder="Enter your thoughts…" rows="1">${s.comment}</textarea>
          ${_seasons.length > 1 ? `<button class="aam_season_remove" data-idx="${i}">&times;</button>` : ""}
        </div>
      `,
        )
        .join("");

      seasonsList.querySelectorAll(".aam_ep_watched").forEach((el) => {
        el.addEventListener("change", (e) => {
          const idx = +e.target.closest(".aam_season_row").dataset.idx;
          _seasons[idx].watched = Math.max(0, +e.target.value);
        });
      });
      seasonsList.querySelectorAll(".aam_ep_total").forEach((el) => {
        el.addEventListener("change", (e) => {
          const idx = +e.target.closest(".aam_season_row").dataset.idx;
          _seasons[idx].total = Math.max(0, +e.target.value);
        });
      });
      seasonsList.querySelectorAll(".aam_season_comment").forEach((el) => {
        el.addEventListener("input", (e) => {
          const idx = +e.target.closest(".aam_season_row").dataset.idx;
          _seasons[idx].comment = e.target.value;
        });
      });
      seasonsList.querySelectorAll(".aam_season_remove").forEach((el) => {
        el.addEventListener("click", (e) =>
          removeSeason(+e.target.dataset.idx),
        );
      });
    }

    addSeasonBtn.addEventListener("click", addSeason);

    function updateLangDropPos() {
      if (langDrop.style.display === "none") return;
      const wrapRect = langInput.parentElement.getBoundingClientRect();
      const ovRect = OV.getBoundingClientRect();
      langDrop.style.top = wrapRect.bottom - ovRect.top + 4 + "px";
      langDrop.style.left = wrapRect.left - ovRect.left + "px";
      langDrop.style.width = wrapRect.width + "px";
    }

    $(".aam_body").addEventListener("scroll", () => {
      langDrop.style.display = "none";
    });
    window.addEventListener("resize", () => {
      langDrop.style.display = "none";
    });

    /* ── language tags ── */
    function renderLangTags() {
      langTags.innerHTML = _languages
        .map(
          (l, i) =>
            `<span class="aam_lang_chip">${l}<button class="aam_lang_chip_x" data-idx="${i}">&times;</button></span>`,
        )
        .join("");
      langTags.querySelectorAll(".aam_lang_chip_x").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          _languages.splice(+e.target.dataset.idx, 1);
          renderLangTags();
        });
      });
    }

    langInput.addEventListener("input", () => {
      const q = langInput.value.trim().toLowerCase();
      if (!q) {
        langDrop.innerHTML = "";
        langDrop.style.display = "none";
        return;
      }
      const available = LANG_PRESETS.filter(
        (l) => l.toLowerCase().includes(q) && !_languages.includes(l),
      );
      let html = available
        .map((l) => `<div class="aam_lang_opt" data-lang="${l}">${l}</div>`)
        .join("");
      if (
        !available.some((l) => l.toLowerCase() === q) &&
        !_languages.some((l) => l.toLowerCase() === q)
      ) {
        const cap = q.charAt(0).toUpperCase() + q.slice(1);
        html += `<div class="aam_lang_opt aam_lang_custom" data-lang="${cap}">Add "${cap}"</div>`;
      }
      langDrop.innerHTML = html;
      if (html) {
        langDrop.style.display = "block";
        updateLangDropPos();
      } else {
        langDrop.style.display = "none";
      }
    });

    langInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = langInput.value.trim();
        if (v && !_languages.some((l) => l.toLowerCase() === v.toLowerCase())) {
          _languages.push(v.charAt(0).toUpperCase() + v.slice(1));
          renderLangTags();
        }
        langInput.value = "";
        langDrop.innerHTML = "";
        langDrop.style.display = "none";
      }
    });

    langDrop.addEventListener("click", (e) => {
      const opt = e.target.closest(".aam_lang_opt");
      if (!opt) return;
      const lang = opt.dataset.lang;
      if (!_languages.includes(lang)) {
        _languages.push(lang);
        renderLangTags();
      }
      langInput.value = "";
      langDrop.innerHTML = "";
      langDrop.style.display = "none";
    });

    document.addEventListener("click", (e) => {
      if (
        !e.target.closest(".aam_lang_input_wrap") &&
        !e.target.closest(".aam_lang_dropdown")
      ) {
        langDrop.innerHTML = "";
        langDrop.style.display = "none";
      }
    });

    /* ── save ── */
    saveBtn.addEventListener("click", () => {
      errorEl.textContent = "";
      const name = _selectedName || nameInput.value.trim();
      if (!name) {
        errorEl.textContent = "Name is required";
        return;
      }
      const catId = catSelect.value;
      if (!catId) {
        errorEl.textContent = "Select a category";
        return;
      }

      const body = {
        name,
        thumbnail_url: thumbImg.src || urlInput.value.trim(),
        category_id: +catId,
        language: _languages.join(", "),
        stars: _rating || null,
        seasons: _seasons.map((s, i) => ({
          number: i + 1,
          total_episodes: s.total,
          watched_episodes: s.watched,
          comment: s.comment,
        })),
      };

      // Queue instead of direct POST — no page reload
      if (window.AnimeSaveQueue) {
        window.AnimeSaveQueue.enqueue(body);
      }

      close();

      // Refresh table to show the newly queued item
      if (typeof window.refreshCurrentCategory === "function") {
        window.refreshCurrentCategory();
      }

      // Show a brief success toast
      showToast(`"${name}" added`);
    });

    /* ── toast helper ── */
    function showToast(msg) {
      let container = document.getElementById("asq_toast_container");
      if (!container) {
        container = document.createElement("div");
        container.id = "asq_toast_container";
        container.className = "asq_toast_container";
        document.body.appendChild(container);
      }
      const toast = document.createElement("div");
      toast.className = "asq_toast";
      toast.textContent = msg;
      container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("asq_toast_visible"));
      setTimeout(() => {
        toast.classList.remove("asq_toast_visible");
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    }
  });
})();
