/**
 * AnimeModalBase — shared modal factory for Add / Edit anime.
 *
 * Usage:
 *   const modal = AnimeModalBase({ title, saveBtnText, showDeleteBtn, onSave, onDelete });
 *   modal.open();           // blank
 *   modal.open(prefill);    // pre-filled for editing
 *   modal.close();
 */
(function () {
  "use strict";

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

  function sanitizeUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.href;
      }
    } catch (_) {}
    return "";
  }

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
      if (opts.html) node.innerHTML = opts.html;
      if (opts.children) {
        for (const c of opts.children) {
          if (c) node.appendChild(c);
        }
      }
    }
    return node;
  }

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

  /* ── constants ── */
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

  /**
   * Factory: creates one self-contained modal instance.
   *
   * @param {Object}   cfg
   * @param {string}   cfg.title          Header text
   * @param {string}   [cfg.saveBtnText]  Save button label (default "Save")
   * @param {boolean}  [cfg.showDeleteBtn] Show delete button (default false)
   * @param {Function} cfg.onSave         async (payload, catId, modal) => void
   * @param {Function} [cfg.onDelete]     async (animeId, catId, modal) => void
   */
  function AnimeModalBase(cfg) {
    const title = cfg.title || "Anime";
    const saveBtnLabel = cfg.saveBtnText || "Save";
    const showDelete = !!cfg.showDeleteBtn;

    let _debounce = null;
    let _selected = null;
    let _selectedName = "";
    let _rating = 0;
    let _entries = []; // { type: 'season'|'ova', total, watched, comment }
    let _languages = [];
    let _editingAnimeId = null;
    let _editingCategoryId = null;

    /* ── build modal DOM ── */
    function createModal() {
      const overlay = el("div", { className: "aam_overlay" });
      const card = el("div", { className: "aam_card" });

      // Header
      const header = el("div", { className: "aam_header" });
      header.appendChild(el("span", { className: "aam_title", text: title }));
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
      seasonsCols.appendChild(el("span", { text: "Season / OVA" }));
      seasonsCols.appendChild(el("span", { text: "Watched / Total" }));
      seasonsCols.appendChild(el("span", { text: "Comment" }));
      seasonSection.appendChild(seasonsCols);

      seasonSection.appendChild(el("div", { className: "aam_seasons_list" }));

      const seasonBtns = el("div", { className: "aam_season_btns" });
      seasonBtns.appendChild(
        el("button", {
          className: "aam_add_season_btn",
          attrs: { type: "button" },
          text: "+ Add Season",
        }),
      );
      seasonBtns.appendChild(
        el("button", {
          className: "aam_add_ova_btn",
          attrs: { type: "button" },
          text: "+ Add OVA",
        }),
      );
      seasonSection.appendChild(seasonBtns);
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

      if (showDelete) {
        footer.classList.add("aam_footer_with_delete");
        const deleteBtn = el("button", {
          className: "aam_delete_btn",
          attrs: { type: "button" },
          text: "Delete",
        });
        footer.appendChild(deleteBtn);
      }

      const footerRight = el("div", { className: "aam_footer_right" });
      footerRight.appendChild(el("span", { className: "aam_error" }));
      footerRight.appendChild(
        el("button", { className: "aam_save_btn", text: saveBtnLabel }),
      );
      footer.appendChild(footerRight);

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
    const addOvaBtn = $(".aam_add_ova_btn");
    const langTags = $(".aam_lang_tags");
    const langInput = $(".aam_lang_input");
    const errorEl = $(".aam_error");
    const langDrop = OV.querySelector(".aam_lang_dropdown");
    const saveBtn = $(".aam_save_btn");
    const deleteBtn = showDelete ? $(".aam_delete_btn") : null;
    const titleEl = $(".aam_title");

    /* ── open / close ── */
    function open(prefill) {
      reset();
      populateCategories();

      if (prefill) {
        _editingAnimeId = prefill.id || null;
        _editingCategoryId = prefill._categoryId || null;

        // Name
        nameInput.value = prefill.name || "";
        _selectedName = prefill.name || "";
        _selected = { name: prefill.name, image: prefill.thumbnail_url };

        // Thumbnail
        const safeImg = sanitizeUrl(prefill.thumbnail_url);
        if (safeImg) {
          thumbImg.src = safeImg;
          thumbImg.style.display = "block";
          thumbBox.classList.remove("aam_thumb_empty");
          urlInput.value = safeImg;
          editUrlBtn.style.display = "block";
        }

        // Category
        if (prefill._categoryId) {
          catSelect.value = String(prefill._categoryId);
        }

        // Rating
        _rating = prefill.stars || 0;
        renderStars();

        // Seasons & OVAs — reconstruct interleaved list
        if (prefill.seasons && prefill.seasons.length > 0) {
          _entries = [];
          // Sort by number to reconstruct order
          const sorted = [...prefill.seasons].sort(
            (a, b) => (Number(a.number) || 1) - (Number(b.number) || 1),
          );
          for (const s of sorted) {
            const num = Number(s.number) || 1;
            const isOva = num % 1 !== 0;
            _entries.push({
              type: isOva ? "ova" : "season",
              total: s.total_episodes != null ? s.total_episodes : s.total || 0,
              watched:
                s.watched_episodes != null
                  ? s.watched_episodes
                  : s.watched || 0,
              comment: s.comment || "",
            });
          }
          renderEntries();
        }

        // Languages
        if (prefill.language) {
          _languages = prefill.language
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean);
          renderLangTags();
        }
      }

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

    /* ── reset ── */
    function reset() {
      _selected = null;
      _selectedName = "";
      _rating = 0;
      _entries = [];
      _languages = [];
      _editingAnimeId = null;
      _editingCategoryId = null;
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
      saveBtn.textContent = saveBtnLabel;
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete";
      }
      renderStars();
      renderEntries();
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
      if (e.key === "Escape" && OV.classList.contains("aam_visible")) {
        if (suggestions.childElementCount > 0) {
          suggestions.textContent = "";
          e.stopPropagation();
        } else {
          close();
        }
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

    /* ── seasons & OVAs (unified list) ── */
    function addSeason() {
      _entries.push({ type: "season", total: 0, watched: 0, comment: "" });
      renderEntries();
    }
    function addOva() {
      _entries.push({ type: "ova", total: 0, watched: 0, comment: "" });
      renderEntries();
    }
    function removeEntry(i) {
      _entries.splice(i, 1);
      renderEntries();
    }

    function renderEntries() {
      seasonsList.textContent = "";
      let seasonCounter = 0;

      _entries.forEach((entry, i) => {
        const isOva = entry.type === "ova";
        if (!isOva) seasonCounter++;

        const rowCls = isOva ? "aam_season_row aam_ova_row" : "aam_season_row";
        const row = el("div", { className: rowCls });
        row.dataset.idx = String(i);

        const labelCls = isOva
          ? "aam_season_label aam_ova_label"
          : "aam_season_label";
        const labelText = isOva ? "OVA" : `Season ${seasonCounter}`;
        row.appendChild(el("span", { className: labelCls, text: labelText }));

        const epCell = el("div", { className: "aam_ep_cell" });

        const watchedInput = el("input", {
          className: "aam_ep_watched",
          attrs: {
            type: "number",
            min: "0",
            value: String(entry.watched),
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
            value: String(entry.total),
            placeholder: "0",
          },
        });
        epCell.appendChild(totalInput);

        row.appendChild(epCell);

        const commentArea = el("textarea", {
          className: "aam_season_comment",
          attrs: { placeholder: "Enter your thoughts\u2026", rows: "1" },
        });
        commentArea.value = entry.comment;
        row.appendChild(commentArea);

        if (_entries.length > 1) {
          const removeBtn = el("button", {
            className: "aam_season_remove",
            text: "\u00d7",
          });
          removeBtn.dataset.idx = String(i);
          row.appendChild(removeBtn);
        }

        watchedInput.addEventListener("change", () => {
          const val = Math.max(0, +watchedInput.value);
          _entries[i].watched = val;
          if (_entries[i].total > 0 && val > _entries[i].total) {
            _entries[i].watched = _entries[i].total;
            watchedInput.value = String(_entries[i].total);
          }
        });
        totalInput.addEventListener("change", () => {
          const val = Math.max(0, +totalInput.value);
          _entries[i].total = val;
          if (val > 0 && _entries[i].watched > val) {
            _entries[i].watched = val;
            watchedInput.value = String(val);
          }
        });
        commentArea.addEventListener("input", () => {
          _entries[i].comment = commentArea.value;
        });

        seasonsList.appendChild(row);
      });

      seasonsList.querySelectorAll(".aam_season_remove").forEach((btn) => {
        btn.addEventListener("click", (e) =>
          removeEntry(+e.target.dataset.idx),
        );
      });
    }

    addSeasonBtn.addEventListener("click", addSeason);
    addOvaBtn.addEventListener("click", addOva);

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

      // Validate & build seasons payload from unified entries
      const seasonEntries = [];
      let sNum = 0; // running season counter
      let sLabel = 0;
      for (let i = 0; i < _entries.length; i++) {
        const e = _entries[i];
        if (e.type === "season") {
          sNum++;
          sLabel++;
          if (e.total > 0 && e.watched > e.total) {
            errorEl.textContent = `Season ${sLabel}: watched cannot exceed total`;
            return;
          }
          seasonEntries.push({
            number: sNum,
            total_episodes: e.total,
            watched_episodes: e.watched,
            comment: e.comment,
          });
        } else {
          // OVA: number = lastSeason + 0.5 (e.g. 1.5 = OVA after Season 1)
          const afterSeason = Math.max(sNum, 1);
          if (e.total > 0 && e.watched > e.total) {
            errorEl.textContent = `OVA: watched cannot exceed total`;
            return;
          }
          seasonEntries.push({
            number: afterSeason + 0.5,
            total_episodes: e.total,
            watched_episodes: e.watched,
            comment: e.comment,
          });
        }
      }

      const payload = {
        name,
        thumbnail_url:
          (thumbImg.style.display !== "none"
            ? sanitizeUrl(thumbImg.src)
            : "") ||
          sanitizeUrl(urlInput.value.trim()) ||
          "",
        language: _languages.join(", "),
        stars: _rating || null,
        seasons: seasonEntries,
      };

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving\u2026";
      if (deleteBtn) deleteBtn.disabled = true;

      try {
        await cfg.onSave(payload, catId, {
          animeId: _editingAnimeId,
          close,
          showToast,
          getCSRF,
        });
      } catch (err) {
        errorEl.textContent = err.message || "Save failed";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = saveBtnLabel;
        if (deleteBtn) deleteBtn.disabled = false;
      }
    });

    /* ── delete ── */
    if (deleteBtn && cfg.onDelete) {
      deleteBtn.addEventListener("click", async () => {
        if (!_editingAnimeId) return;
        if (!confirm("Are you sure you want to delete this anime?")) return;

        errorEl.textContent = "";
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Deleting\u2026";
        saveBtn.disabled = true;

        try {
          const catId = _editingCategoryId || catSelect.value;
          await cfg.onDelete(_editingAnimeId, catId, {
            close,
            showToast,
            getCSRF,
          });
        } catch (err) {
          errorEl.textContent = err.message || "Delete failed";
        } finally {
          deleteBtn.disabled = false;
          deleteBtn.textContent = "Delete";
          saveBtn.disabled = false;
        }
      });
    }

    /* ── public API ── */
    return {
      open,
      close,
      reset,
      overlay: OV,
      showToast,
    };
  }

  // Expose globally
  window.AnimeModalBase = AnimeModalBase;
  window._animeModalShowToast = showToast;
})();
