(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const JIKAN = "https://api.jikan.moe/v4/anime";
    const API_BASE = "/api/anime/list/category/";
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

    let _debounce = null;
    let _selected = null;
    let _selectedName = "";
    let _rating = 0;
    let _seasons = [];
    let _languages = [];

    /* ── security helpers ── */

    function getCSRF() {
      const el = document.querySelector("[name=csrfmiddlewaretoken]");
      if (el) return el.value;
      const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : "";
    }

    function escapeAttr(s) {
      if (s == null) return "";
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    /**
     * Only allow http / https URLs.
     * Blocks javascript:, data:, vbscript:, etc.
     */
    function sanitizeUrl(url) {
      if (!url) return "";
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          return parsed.href;
        }
      } catch (_) {
        /* invalid URL */
      }
      return "";
    }

    /**
     * Create a DOM element with optional attributes, classes, text.
     * Avoids innerHTML entirely.
     */
    function el(tag, opts) {
      const node = document.createElement(tag);
      if (opts) {
        if (opts.className) node.className = opts.className;
        if (opts.text != null) node.textContent = opts.text;
        if (opts.attrs) {
          for (const [k, v] of Object.entries(opts.attrs)) {
            node.setAttribute(k, v);
          }
        }
        if (opts.html) node.innerHTML = opts.html; // only for static/safe HTML
        if (opts.children) {
          for (const c of opts.children) {
            if (c) node.appendChild(c);
          }
        }
      }
      return node;
    }

    /* ── build modal DOM (all static — no user data) ── */
    function createModal() {
      const overlay = el("div", { className: "aam_overlay" });

      const card = el("div", { className: "aam_card" });

      // Header
      const header = el("div", { className: "aam_header" });
      header.appendChild(
        el("span", { className: "aam_title", text: "Add Anime" }),
      );
      const closeBtn = el("button", {
        className: "aam_close_btn",
        attrs: { "aria-label": "Close" },
        text: "\u00d7",
      });
      header.appendChild(closeBtn);
      card.appendChild(header);

      // Body
      const body = el("div", { className: "aam_body" });

      // Top row: thumbnail + name
      const topRow = el("div", { className: "aam_top_row" });

      // Thumbnail area
      const thumbArea = el("div", { className: "aam_thumb_area" });
      const thumbBox = el("div", { className: "aam_thumb_box" });
      const thumbImg = el("img", {
        className: "aam_thumb_img",
        attrs: { src: "", alt: "" },
      });
      thumbBox.appendChild(thumbImg);
      thumbArea.appendChild(thumbBox);

      const editUrlBtn = el("button", {
        className: "aam_edit_url_btn",
        attrs: { type: "button" },
        text: "Edit Thumbnail URL",
      });
      thumbArea.appendChild(editUrlBtn);

      const urlEditor = el("div", {
        className: "aam_url_editor",
        attrs: { style: "display:none" },
      });
      const urlInput = el("input", {
        className: "aam_url_input",
        attrs: { type: "url", placeholder: "Paste image URL\u2026" },
      });
      urlEditor.appendChild(urlInput);
      const urlDoneBtn = el("button", {
        className: "aam_url_done",
        attrs: { type: "button" },
        text: "Done",
      });
      urlEditor.appendChild(urlDoneBtn);
      thumbArea.appendChild(urlEditor);
      topRow.appendChild(thumbArea);

      // Name input with search
      const nameWrap = el("div", { className: "aam_name_wrap" });
      const nameField = el("div", { className: "aam_name_field" });
      const nameInput = el("input", {
        className: "aam_name_input",
        attrs: { type: "text", placeholder: "Anime Name", autocomplete: "off" },
      });
      nameField.appendChild(nameInput);
      nameField.appendChild(el("span", { className: "aam_search_spinner" }));
      nameWrap.appendChild(nameField);
      nameWrap.appendChild(el("div", { className: "aam_suggestions" }));
      topRow.appendChild(nameWrap);
      body.appendChild(topRow);

      // Category section
      const catSection = el("div", { className: "aam_section" });
      catSection.appendChild(
        el("select", { className: "aam_category_select" }),
      );
      body.appendChild(catSection);

      // Stars section
      const starSection = el("div", { className: "aam_section" });
      const starRow = el("div", { className: "aam_star_row" });
      for (let i = 1; i <= 5; i++) {
        starRow.appendChild(
          el("span", {
            className: "aam_star",
            attrs: { "data-v": String(i) },
            text: "\u2605",
          }),
        );
      }
      starSection.appendChild(starRow);
      body.appendChild(starSection);

      // Seasons section
      const seasonSection = el("div", { className: "aam_section" });
      const seasonsHeader = el("div", { className: "aam_seasons_header" });
      seasonsHeader.appendChild(
        el("span", { className: "aam_seasons_title", text: "Seasons" }),
      );
      seasonSection.appendChild(seasonsHeader);

      const seasonsCols = el("div", { className: "aam_seasons_cols" });
      seasonsCols.appendChild(el("span", { text: "Season" }));
      seasonsCols.appendChild(el("span", { text: "Episodes Watched" }));
      seasonsCols.appendChild(el("span", { text: "Season Comment" }));
      seasonSection.appendChild(seasonsCols);

      seasonSection.appendChild(el("div", { className: "aam_seasons_list" }));
      seasonSection.appendChild(
        el("button", {
          className: "aam_add_season_btn",
          attrs: { type: "button" },
          text: "+ Add Season",
        }),
      );
      body.appendChild(seasonSection);

      // Language section
      const langSection = el("div", { className: "aam_section" });
      const langWrap = el("div", { className: "aam_lang_wrap" });
      langWrap.appendChild(el("div", { className: "aam_lang_tags" }));
      const langInputWrap = el("div", { className: "aam_lang_input_wrap" });
      langInputWrap.appendChild(
        el("input", {
          className: "aam_lang_input",
          attrs: {
            type: "text",
            placeholder: "Type to add language\u2026",
            autocomplete: "off",
          },
        }),
      );
      langWrap.appendChild(langInputWrap);
      langSection.appendChild(langWrap);
      body.appendChild(langSection);

      card.appendChild(body);

      // Footer
      const footer = el("div", { className: "aam_footer" });
      footer.appendChild(el("span", { className: "aam_error" }));
      footer.appendChild(
        el("button", { className: "aam_save_btn", text: "Save" }),
      );
      card.appendChild(footer);

      overlay.appendChild(card);

      // Language dropdown (appended to overlay for positioning)
      const langDropdown = el("div", { className: "aam_lang_dropdown" });
      overlay.appendChild(langDropdown);

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
    const langDrop = OV.querySelector(".aam_lang_dropdown");
    const saveBtn = $(".aam_save_btn");

    /* ── helpers: category gate ── */
    function hasCategories() {
      return document.querySelectorAll(".category_tab").length > 0;
    }

    function updateAddAnimeButtonState() {
      const disabled = !hasCategories();
      const deskBtn = document.querySelector(".btn_add_anime");
      const mobBtn = document.getElementById("m_fab_add_anime");
      if (deskBtn) {
        deskBtn.classList.toggle("btn_add_anime_disabled", disabled);
      }
      if (mobBtn) {
        mobBtn.classList.toggle("m_fab_option_disabled", disabled);
      }
    }
    // Expose globally so other scripts (e.g. add_category_modal) can refresh
    window.updateAddAnimeButtonState = updateAddAnimeButtonState;
    // Set initial state
    updateAddAnimeButtonState();

    /* ── open / close ── */
    function open() {
      if (!hasCategories()) {
        showToast("Please create a category first");
        return;
      }
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
      suggestions.textContent = "";
      thumbImg.src = "";
      thumbImg.style.display = "none";
      thumbBox.classList.add("aam_thumb_empty");
      editUrlBtn.style.display = "none";
      urlEditor.style.display = "none";
      urlInput.value = "";
      errorEl.textContent = "";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
      renderStars();
      renderSeasons();
      renderLangTags();
      addSeason();
    }

    /* ── categories ── */
    function populateCategories() {
      const tabs = document.querySelectorAll(".category_tab");
      const activeTab = document.querySelector(".category_tab.active");
      catSelect.textContent = "";
      tabs.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.dataset.categoryId;
        o.textContent = t.textContent.trim();
        catSelect.appendChild(o);
      });
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
        suggestions.textContent = "";
        return;
      }
      spinner.style.display = "block";
      _debounce = setTimeout(() => searchJikan(q), 400);
    });

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && suggestions.childElementCount > 0) {
        suggestions.textContent = "";
        e.stopPropagation();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && suggestions.childElementCount > 0) {
        suggestions.textContent = "";
        e.stopPropagation();
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".aam_name_wrap")) {
        suggestions.textContent = "";
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
        suggestions.textContent = "";
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

    /**
     * Render suggestion items using safe DOM methods.
     * No innerHTML with user data — all text set via textContent/src.
     */
    function renderSuggestions(list, query) {
      suggestions.textContent = "";
      if (!list.length) return;

      for (const a of list) {
        const displayName = bestMatchName(a, query);
        const thumbSrc = sanitizeUrl(
          a.images?.jpg?.small_image_url || a.images?.jpg?.image_url || "",
        );
        const fullImg = sanitizeUrl(a.images?.jpg?.image_url || "");

        const item = el("div", { className: "aam_sug_item" });
        item.dataset.name = displayName;
        item.dataset.img = fullImg;

        if (thumbSrc) {
          const img = el("img", {
            className: "aam_sug_thumb",
            attrs: { src: thumbSrc, alt: "" },
          });
          item.appendChild(img);
        } else {
          item.appendChild(el("span", { className: "aam_sug_thumb_empty" }));
        }

        item.appendChild(
          el("span", { className: "aam_sug_name", text: displayName }),
        );
        suggestions.appendChild(item);
      }
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
      suggestions.textContent = "";

      const safeImg = sanitizeUrl(img);
      if (safeImg) {
        thumbImg.src = safeImg;
        thumbImg.style.display = "block";
        thumbBox.classList.remove("aam_thumb_empty");
        urlInput.value = safeImg;
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
      const u = sanitizeUrl(urlInput.value.trim());
      if (u) {
        thumbImg.src = u;
        thumbImg.style.display = "block";
        thumbBox.classList.remove("aam_thumb_empty");
        urlInput.value = u;
      } else {
        thumbImg.src = "";
        thumbImg.style.display = "none";
        thumbBox.classList.add("aam_thumb_empty");
        urlInput.value = "";
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

    /**
     * Render season rows using safe DOM methods.
     * No innerHTML with user data.
     */
    function renderSeasons() {
      seasonsList.textContent = "";

      _seasons.forEach((s, i) => {
        const row = el("div", { className: "aam_season_row" });
        row.dataset.idx = String(i);

        row.appendChild(
          el("span", {
            className: "aam_season_label",
            text: `Season ${i + 1}`,
          }),
        );

        const epCell = el("div", { className: "aam_ep_cell" });

        const watchedInput = el("input", {
          className: "aam_ep_watched",
          attrs: {
            type: "number",
            min: "0",
            value: String(s.watched),
            placeholder: "0",
          },
        });
        epCell.appendChild(watchedInput);

        epCell.appendChild(
          el("span", { className: "aam_ep_slash", text: "/" }),
        );

        const totalInput = el("input", {
          className: "aam_ep_total",
          attrs: {
            type: "number",
            min: "0",
            value: String(s.total),
            placeholder: "0",
          },
        });
        epCell.appendChild(totalInput);

        row.appendChild(epCell);

        const commentArea = el("textarea", {
          className: "aam_season_comment",
          attrs: { placeholder: "Enter your thoughts\u2026", rows: "1" },
        });
        commentArea.value = s.comment;
        row.appendChild(commentArea);

        if (_seasons.length > 1) {
          const removeBtn = el("button", {
            className: "aam_season_remove",
            text: "\u00d7",
          });
          removeBtn.dataset.idx = String(i);
          row.appendChild(removeBtn);
        }

        // Attach event listeners directly
        watchedInput.addEventListener("change", () => {
          _seasons[i].watched = Math.max(0, +watchedInput.value);
        });
        totalInput.addEventListener("change", () => {
          _seasons[i].total = Math.max(0, +totalInput.value);
        });
        commentArea.addEventListener("input", () => {
          _seasons[i].comment = commentArea.value;
        });

        seasonsList.appendChild(row);
      });

      // Remove button listeners
      seasonsList.querySelectorAll(".aam_season_remove").forEach((btn) => {
        btn.addEventListener("click", (e) =>
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

    /**
     * Render language chips using safe DOM methods.
     * No innerHTML with user data — all text via textContent.
     */
    function renderLangTags() {
      langTags.textContent = "";

      _languages.forEach((lang, i) => {
        const chip = el("span", { className: "aam_lang_chip", text: lang });
        const xBtn = el("button", {
          className: "aam_lang_chip_x",
          text: "\u00d7",
        });
        xBtn.dataset.idx = String(i);
        xBtn.addEventListener("click", () => {
          _languages.splice(i, 1);
          renderLangTags();
        });
        chip.appendChild(xBtn);
        langTags.appendChild(chip);
      });
    }

    /**
     * Render language dropdown options using safe DOM methods.
     */
    function renderLangDropdown(available, customCap) {
      langDrop.textContent = "";

      for (const lang of available) {
        const opt = el("div", { className: "aam_lang_opt", text: lang });
        opt.dataset.lang = lang;
        langDrop.appendChild(opt);
      }

      if (customCap) {
        const customOpt = el("div", {
          className: "aam_lang_opt aam_lang_custom",
          text: `Add "${customCap}"`,
        });
        customOpt.dataset.lang = customCap;
        langDrop.appendChild(customOpt);
      }

      if (langDrop.childElementCount > 0) {
        langDrop.style.display = "block";
        updateLangDropPos();
      } else {
        langDrop.style.display = "none";
      }
    }

    langInput.addEventListener("input", () => {
      const q = langInput.value.trim().toLowerCase();
      if (!q) {
        langDrop.textContent = "";
        langDrop.style.display = "none";
        return;
      }
      const available = LANG_PRESETS.filter(
        (l) => l.toLowerCase().includes(q) && !_languages.includes(l),
      );
      let customCap = null;
      if (
        !available.some((l) => l.toLowerCase() === q) &&
        !_languages.some((l) => l.toLowerCase() === q)
      ) {
        customCap = q.charAt(0).toUpperCase() + q.slice(1);
      }
      renderLangDropdown(available, customCap);
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
        langDrop.textContent = "";
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
      langDrop.textContent = "";
      langDrop.style.display = "none";
    });

    document.addEventListener("click", (e) => {
      if (
        !e.target.closest(".aam_lang_input_wrap") &&
        !e.target.closest(".aam_lang_dropdown")
      ) {
        langDrop.textContent = "";
        langDrop.style.display = "none";
      }
    });

    /* ── save ── */
    saveBtn.addEventListener("click", async () => {
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

      const payload = {
        name,
        thumbnail_url:
          sanitizeUrl(thumbImg.src) || sanitizeUrl(urlInput.value.trim()),
        language: _languages.join(", "),
        stars: _rating || null,
        seasons: _seasons.map((s, i) => ({
          number: i + 1,
          total_episodes: s.total,
          watched_episodes: s.watched,
          comment: s.comment,
        })),
      };

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving\u2026";

      try {
        const resp = await fetch(`${API_BASE}${encodeURIComponent(catId)}/`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRF(),
          },
          body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          // DRF returns field errors as { "field": ["error"] }
          // or non-field errors as { "non_field_errors": ["error"] }
          // or detail as { "detail": "error" }
          let msg = "Save failed";
          if (data) {
            if (data.detail) {
              msg = data.detail;
            } else if (data.non_field_errors) {
              msg = data.non_field_errors.join(", ");
            } else {
              // Collect first field error
              const firstKey = Object.keys(data).find(
                (k) => Array.isArray(data[k]) && data[k].length > 0,
              );
              if (firstKey) {
                msg = `${firstKey}: ${data[firstKey][0]}`;
              }
            }
          }
          throw new Error(msg);
        }

        close();

        if (typeof window.refreshCurrentCategory === "function") {
          window.refreshCurrentCategory();
        }

        showToast(`"${name}" added`);
      } catch (err) {
        errorEl.textContent = err.message || "Save failed";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
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
