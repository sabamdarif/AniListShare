// ── Anime table tab switching & rendering ─────────────────────────────────
(function () {
  const tabsContainer = document.getElementById("category_tabs");
  const tableBody = document.getElementById("anime_table_body");
  if (!tabsContainer || !tableBody) return;

  const tabs = tabsContainer.querySelectorAll(".category_tab");

  function setActiveTab(btn) {
    tabs.forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
  }

  function showSkeleton(rows) {
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

  function parseSeasons(raw) {
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => {
        const m = s.match(/s?(?:eason)?\s*(\d+)/i);
        return m ? `S${m[1]}` : s.toUpperCase();
      });
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

  function renderStars(val) {
    if (val == null) return '<span class="star_display">—</span>';
    const rating = parseFloat(val);
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      if (rating >= i) {
        starsHtml += '<span class="star filled">★</span>';
      } else if (rating >= i - 0.5) {
        starsHtml += '<span class="star half">★</span>';
      } else {
        starsHtml += '<span class="star empty">★</span>';
      }
    }
    return `<span class="star_display">${starsHtml}<span class="star_num">${rating.toFixed(1)}</span></span>`;
  }

  function renderTable(animeList) {
    if (!animeList.length) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="empty_msg">No anime found in this category.</td></tr>';
      return;
    }

    let html = "";
    animeList.forEach((a, idx) => {
      const seasons = parseSeasons(a.season);
      const langs = parseLanguages(a.language);

      const seasonBadges = seasons
        .map(
          (s, si) =>
            `<span class="badge badge_season${si < seasons.length ? " badge_season_done" : ""}">${s} <span class="badge_check">✓</span></span>`,
        )
        .join("");

      const langBadges = langs
        .map((l) => `<span class="badge badge_lang">${l}</span>`)
        .join("");

      html += `<tr>
        <td class="col_id">${idx + 1}</td>
        <td class="col_thumb">
          <img src="${a.thumbnail_url}" alt="${a.name}" class="thumb_img" loading="lazy" onerror="this.style.display='none'">
        </td>
        <td class="col_name">${a.name}</td>
        <td class="col_season"><div class="badge_wrap">${seasonBadges}</div></td>
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

  async function loadCategory(categoryId) {
    showSkeleton(5);
    try {
      const res = await fetch(
        `/api/anime-list/?category_id=${encodeURIComponent(categoryId)}`,
      );
      const data = await res.json();
      renderTable(data.anime || []);
    } catch {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="empty_msg">Failed to load anime.</td></tr>';
    }
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn);
      loadCategory(btn.dataset.categoryId);
    });
  });

  // Activate first tab on load
  if (tabs.length > 0) {
    setActiveTab(tabs[0]);
    loadCategory(tabs[0].dataset.categoryId);
  }
})();
