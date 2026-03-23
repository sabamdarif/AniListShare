// ── Anime table tab switching & rendering ─────────────────────────────────
(function () {
  const tabsContainer = document.getElementById("category_tabs");
  const tableBody = document.getElementById("anime_table_body");
  const tableEl = document.getElementById("anime_table");
  if (!tabsContainer || !tableBody || !tableEl) return;

  const tabs = tabsContainer.querySelectorAll(".category_tab");
  const MOBILE_BP = 768;
  let lastList = [];

  const isMobile = () => window.innerWidth <= MOBILE_BP;

  function setActiveTab(btn) {
    tabs.forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
  }

  /* ── skeleton ── */
  function showSkeleton(rows) {
    if (isMobile()) {
      tableEl.style.display = "none";
      let wrapper = document.getElementById("mobile_card_list");
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "mobile_card_list";
        wrapper.className = "mobile_card_list";
        tableEl.parentElement.appendChild(wrapper);
      }
      let html = "";
      for (let i = 0; i < rows; i++) {
        html += `<div class="m_card m_card_skel">
          <div class="skel skel_thumb_m"></div>
          <div class="m_card_body">
            <div class="skel skel_text" style="width:60%"></div>
            <div class="skel skel_text" style="width:80%;margin-top:6px"></div>
            <div class="skel skel_badge" style="margin-top:8px"></div>
          </div>
        </div>`;
      }
      wrapper.innerHTML = html;
    } else {
      removeMobileList();
      tableEl.style.display = "";
      let html = "";
      for (let i = 0; i < rows; i++) {
        html += `<tr class="skeleton_row">
          <td class="col_id"><span class="skel"></span></td>
          <td class="col_thumb"><span class="skel skel_thumb"></span></td>
          <td class="col_name"><span class="skel skel_text"></span></td>
          <td class="col_season"><span class="skel skel_badge"></span></td>
          <td class="col_lang"><span class="skel skel_badge"></span></td>
          <td class="col_stars"><span class="skel skel_text_sm"></span></td>
          <td class="col_edit"><span class="skel skel_btn"></span></td>
        </tr>`;
      }
      tableBody.innerHTML = html;
    }
  }

  function removeMobileList() {
    const el = document.getElementById("mobile_card_list");
    if (el) el.remove();
  }

  function parseLanguages(raw) {
    if (!raw) return [];
    const map = {
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
    return raw
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
      .map((l) => map[l] || l.charAt(0).toUpperCase() + l.slice(1));
  }

  function renderSeasonsDesktop(seasons) {
    if (!seasons || !seasons.length)
      return '<span class="season_pill" style="opacity:.5">—</span>';
    return seasons
      .map((s) => {
        if (s.completed) {
          return `<span class="season_pill">S${s.number}<span class="s_check">✓</span></span>`;
        }
        const pct = s.total > 0 ? Math.round((s.watched / s.total) * 100) : 0;
        return `<span class="season_progress_box">
          <span class="season_progress_top">
            <span class="season_progress_label">S${s.number}</span>
            <span class="season_progress_frac">${s.watched}/${s.total}</span>
          </span>
          <span class="season_progress_track">
            <span class="season_progress_fill" style="width:${pct}%"></span>
          </span>
        </span>`;
      })
      .join("");
  }

  function renderSeasonsMobile(seasons) {
    if (!seasons || !seasons.length) return "";
    return seasons
      .map((s) => {
        const pct = s.completed ? 100 : Math.round((s.watched / s.total) * 100);
        const checkmark = s.completed
          ? '<span class="m_season_check">✓</span>'
          : "";
        const label = s.completed
          ? `Season ${s.number}`
          : `Season ${s.number} <span class="m_season_progress_text">${s.watched}/${s.total}</span>`;
        return `<div class="m_season_item">
                  <div class="m_season_label">${label}${checkmark}</div>
                  <div class="m_season_bar_track">
                    <div class="m_season_bar_fill${s.completed ? " m_bar_done" : ""}" style="width:${pct}%"></div>
                  </div>
                </div>`;
      })
      .join("");
  }

  function renderStars(val) {
    if (val == null) return '<span class="star_display">—</span>';
    const rating = parseFloat(val);
    let stars = "";
    for (let i = 1; i <= 5; i++) {
      if (rating >= i) stars += '<span class="star filled">★</span>';
      else if (rating >= i - 0.5) stars += '<span class="star half">★</span>';
      else stars += '<span class="star empty">★</span>';
    }
    return `<span class="star_display">${stars}<span class="star_num">${rating.toFixed(1)}</span></span>`;
  }

  function renderTable(animeList) {
    removeMobileList();
    tableEl.style.display = "";
    if (!animeList.length) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="empty_msg">No anime found in this category.</td></tr>';
      return;
    }

    let html = "";
    animeList.forEach((a, idx) => {
      const langs = parseLanguages(a.language);
      const seasonBadges = renderSeasonsDesktop(a.seasons);
      const langBadges = langs
        .map((l) => `<span class="badge badge_lang">${l}</span>`)
        .join("");

      html += `<tr>
        <td class="col_id">${idx + 1}</td>
        <td class="col_thumb">
          <img src="${a.thumbnail_url}" alt="${a.name}" class="thumb_img" loading="lazy" onerror="this.style.display='none'">
        </td>
        <td class="col_name">${a.name}</td>
        <td class="col_season"><div class="season_wrap">${seasonBadges}</div></td>
        <td class="col_lang"><div class="badge_wrap">${langBadges}</div></td>
        <td class="col_stars">${renderStars(a.stars)}</td>
        <td class="col_edit">
          <button class="edit_btn" title="Edit">
            <i class="nf nf-fa-pencil"></i>
          </button>
        </td>
      </tr>`;
    });
    tableBody.innerHTML = html;
  }

  function renderCards(animeList) {
    tableEl.style.display = "none"; // hide the table entirely
    let wrapper = document.getElementById("mobile_card_list");
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

    let html = "";
    animeList.forEach((a, idx) => {
      const langs = parseLanguages(a.language);
      const langBadges = langs
        .map((l) => `<span class="badge badge_lang">${l}</span>`)
        .join("");
      const seasonsHtml = renderSeasonsMobile(a.seasons);
      const rating = a.stars != null ? parseFloat(a.stars).toFixed(1) : "—";

      html += `<div class="m_card">
        <img src="${a.thumbnail_url}" alt="${a.name}" class="m_card_thumb" loading="lazy" onerror="this.style.display='none'">
        <div class="m_card_body">
          <span class="m_card_id">ID: ${a.id || idx + 1}</span>
          <h3 class="m_card_title">${a.name}</h3>
          <div class="m_card_seasons">${seasonsHtml}</div>
          <div class="badge_wrap m_card_langs">${langBadges}</div>
          <div class="m_card_footer">
            <span class="m_card_rating"><span class="star filled">★</span> ${rating}</span>
            <button class="edit_btn" title="Edit"><i class="nf nf-fa-pencil"></i></button>
          </div>
        </div>
      </div>`;
    });
    wrapper.innerHTML = html;
  }

  function render(animeList) {
    lastList = animeList;
    if (isMobile()) {
      renderCards(animeList);
    } else {
      renderTable(animeList);
    }
  }

  async function loadCategory(categoryId) {
    showSkeleton(4);
    try {
      const res = await fetch(
        `/api/anime-list/?category_id=${encodeURIComponent(categoryId)}`,
      );
      const data = await res.json();
      render(data.anime || []);
    } catch {
      if (isMobile()) {
        removeMobileList();
        const w = document.createElement("div");
        w.id = "mobile_card_list";
        w.className = "mobile_card_list";
        w.innerHTML = '<p class="empty_msg">Failed to load anime.</p>';
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

  let wasMobile = isMobile();
  window.addEventListener("resize", () => {
    const nowMobile = isMobile();
    if (nowMobile !== wasMobile) {
      wasMobile = nowMobile;
      if (lastList.length) render(lastList);
    }
  });

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn);
      loadCategory(btn.dataset.categoryId);
    });
  });

  if (tabs.length > 0) {
    setActiveTab(tabs[0]);
    loadCategory(tabs[0].dataset.categoryId);
  }
})();
