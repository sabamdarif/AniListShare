document.addEventListener("DOMContentLoaded", () => {
  // --- Constants & Config ---
  const JIKAN_BASE_URL = "https://api.jikan.moe/v4";
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // TODO: Backend Proxy
  // In the future, this direct fetching from Jikan might be replaced by a Django backend proxy.
  // Why? Jikan enforces a 60 requests/minute IP rate limit. While sessionStorage helps mitigate
  // this for individual users, a backend proxy would cache responses globally, allowing thousands
  // of users to load the page while only consuming 1 Jikan request per 15-30 minutes.

  // --- State ---
  let latestPage = 1; // 1 = Today, 2 = Yesterday, etc.
  let latestFilter = "all"; // all, sub, dub
  let trendingFilter = "day"; // day (airing), week (bypopularity), month (favorite)
  const animeDataMap = new Map(); // Stores full anime objects by mal_id

  // --- DOM Elements ---
  const latestGrid = document.getElementById("latest_grid");
  const trendingList = document.getElementById("trending_list");
  const upcomingList = document.getElementById("upcoming_list");
  const prevDayBtn = document.getElementById("prev_day_btn");
  const nextDayBtn = document.getElementById("next_day_btn");
  const currentDayLabel = document.getElementById("current_day_label");

  // --- Utils ---

  // Simple sessionStorage cache with TTL
  const fetchCached = async (cacheKey, url) => {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          return parsed.data;
        }
      } catch (e) {
        console.error("Cache parsing error", e);
      }
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      // Artificial delay to respect rate limit globally (rudimentary)
      await new Promise((r) => setTimeout(r, 500));

      const data = await res.json();
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          data: data,
        }),
      );
      return data;
    } catch (e) {
      console.error("Fetch error:", e);
      return null;
    }
  };

  const parseDuration = (durationStr) => {
    if (!durationStr || durationStr === "Unknown") return "?m";
    const match = durationStr.match(/(\d+)\s*min/);
    return match ? `${match[1]}m` : "?m";
  };

  const parseRating = (ratingStr) => {
    if (!ratingStr) return null;
    const mapping = {
      "G - All Ages": "G",
      "PG - Children": "PG",
      "PG-13 - Teens 13 or older": "PG-13",
      "R - 17+ (violence & profanity)": "R-17+",
      "R+ - Mild Nudity": "R+",
      "Rx - Hentai": "Rx",
    };
    return mapping[ratingStr] || ratingStr.split(" ")[0];
  };

  const getTargetDate = (pageOffset) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (pageOffset - 1));
    return d;
  };

  const formatDayLabel = (pageOffset, dateObj) => {
    if (pageOffset === 1) return "Today";
    if (pageOffset === 2) return "Yesterday";
    const options = { month: "short", day: "numeric" };
    return dateObj.toLocaleDateString("en-US", options);
  };

  const calculateAiredEpisodes = (item) => {
    const total = item.episodes || "?";
    if (item.status === "Finished Airing") return `${total} / ${total}`;
    if (item.status === "Not yet aired") return `0 / ${total}`;

    const airedFrom = item.aired?.from;
    if (!airedFrom) return `? / ${total}`;

    const start = new Date(airedFrom);
    const now = new Date();
    if (now < start) return `0 / ${total}`;

    // Assume 1 episode per week
    const weeksPassed = Math.floor((now - start) / (1000 * 60 * 60 * 24 * 7));
    const currentAired = weeksPassed + 1;

    if (total !== "?" && currentAired > total) return `${total} / ${total}`;
    return `${currentAired} / ${total}`;
  };

  // --- Renderers ---

  const renderGridSkeleton = (listElement, count = 18) => {
    listElement.innerHTML = "";
    for (let i = 0; i < count; i++) {
      listElement.innerHTML += `
                <div class="anime_card">
                    <div class="card_cover_wrapper skel"></div>
                    <div class="card_info">
                        <div class="skel skel_text"></div>
                        <div class="skel skel_text_sm" style="margin-top: 4px;"></div>
                    </div>
                </div>
            `;
    }
  };

  const renderTrendingSkeleton = (listElement) => {
    listElement.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      listElement.innerHTML += `
                <div class="trending_card">
                    <div class="trending_content">
                        <div class="skel skel_text" style="margin-bottom:6px;"></div>
                        <div class="skel skel_text_sm"></div>
                    </div>
                </div>
            `;
    }
  };

  const renderGridCards = (items, listElement) => {
    listElement.innerHTML = "";

    // Deduplicate items by mal_id to prevent API glitches from showing duplicates
    const uniqueItems = [];
    const seenIds = new Set();
    (items || []).forEach((item) => {
      if (!seenIds.has(item.mal_id)) {
        seenIds.add(item.mal_id);
        uniqueItems.push(item);
      }
    });

    if (uniqueItems.length === 0) {
      listElement.innerHTML = `<div class="empty_msg" style="grid-column: 1 / -1;">No entries found.</div>`;
      return;
    }

    uniqueItems.forEach((item) => {
      // Apply Sub/Dub heuristic filtering
      // TODO: Implement Dub info. Jikan v4 doesn't split sub/dub directly.
      // Currently, 'sub' shows all, 'dub' is disabled or filtered heavily heuristically.
      if (latestFilter === "dub") {
        // If the user wants dubs, we strictly check for English title as a loose heuristic,
        // but actually, skipping Dub entirely for now as requested.
        // We'll just show nothing for "dub" until implemented.
        return;
      }

      const title = item.title_english || item.title;
      const img =
        item.images?.webp?.large_image_url ||
        item.images?.jpg?.large_image_url ||
        "";
      const score = item.score ? item.score.toFixed(1) : "";
      const rating = parseRating(item.rating);
      const duration = parseDuration(item.duration);
      const epsDisplay = calculateAiredEpisodes(item);

      let badgesHtml = "";
      if (score)
        badgesHtml += `<span class="card_badge card_badge_star"><i class="nf nf-fa-star"></i> ${score}</span>`;
      if (rating) badgesHtml += `<span class="card_badge">${rating}</span>`;

      animeDataMap.set(item.mal_id.toString(), item);

      listElement.innerHTML += `
                <div class="anime_card" data-id="${item.mal_id}">
                    <div class="card_cover_wrapper" style="background-image: url('${img}')">
                        <div class="card_overlay_top">
                            ${badgesHtml}
                        </div>
                        <div class="card_stats_bar">
                            <!-- Only showing sub episodes for now -->
                            <div class="stat_item"><i class="nf nf-md-subtitles"></i> ${epsDisplay}</div>
                        </div>
                    </div>
                    <div class="card_info">
                        <div class="card_title">${title}</div>
                        <div class="card_meta">${item.type} · ${duration}</div>
                    </div>
                </div>
            `;
    });

    // If after filtering it's empty
    if (listElement.innerHTML.trim() === "") {
      listElement.innerHTML = `<div class="empty_msg" style="grid-column: 1 / -1;">No entries match the filter.</div>`;
    }
  };

  const renderTrendingCards = (items, listElement) => {
    listElement.innerHTML = "";

    // Deduplicate items by mal_id to prevent API glitches from showing duplicates
    const uniqueItems = [];
    const seenIds = new Set();
    (items || []).forEach((item) => {
      if (!seenIds.has(item.mal_id)) {
        seenIds.add(item.mal_id);
        uniqueItems.push(item);
      }
    });

    if (uniqueItems.length === 0) {
      listElement.innerHTML = `<div class="empty_msg">Failed to load data.</div>`;
      return;
    }

    uniqueItems.forEach((item, index) => {
      const rank = index + 1; // item.rank might be available, but we enforce 1-10 ordered by API
      const title = item.title_english || item.title;
      const img =
        item.images?.webp?.large_image_url ||
        item.images?.jpg?.large_image_url ||
        "";
      const score = item.score ? item.score.toFixed(1) : "?";
      const epsDisplay = calculateAiredEpisodes(item);

      animeDataMap.set(item.mal_id.toString(), item);

      listElement.innerHTML += `
                <div class="trending_card" data-id="${item.mal_id}">
                    <div class="trending_bg_bleed" style="background-image: url('${img}')"></div>
                    <div class="trending_rank">${rank}</div>
                    <div class="trending_content">
                        <div class="trending_title">${title}</div>
                        <div class="trending_meta">
                            <span class="stat_item"><i class="nf nf-fa-star" style="color:var(--star);"></i> ${score}</span>
                            <span>·</span>
                            <span>${item.type}</span>
                            <span>·</span>
                            <!-- Only showing sub episodes for now -->
                            <span class="stat_item"><i class="nf nf-md-subtitles"></i> ${epsDisplay}</span>
                        </div>
                    </div>
                </div>
            `;
    });
  };

  // --- Fetch Controllers ---

  const loadLatestEpisodes = async () => {
    renderGridSkeleton(latestGrid, 18);

    const targetDate = getTargetDate(latestPage);
    const dayStr = targetDate
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();

    currentDayLabel.textContent = formatDayLabel(latestPage, targetDate);
    nextDayBtn.disabled = latestPage === 1;

    const cacheKey = `jikan_schedules_${dayStr}`;
    const url = `${JIKAN_BASE_URL}/schedules?filter=${dayStr}&limit=24&page=1`;

    const response = await fetchCached(cacheKey, url);
    renderGridCards(response?.data || [], latestGrid);
  };

  const loadTrending = async () => {
    renderTrendingSkeleton(trendingList);

    const filterMap = {
      day: "airing",
      week: "bypopularity",
      month: "favorite",
    };
    const jikanFilter = filterMap[trendingFilter] || "airing";

    const cacheKey = `jikan_trending_${jikanFilter}`;
    const url = `${JIKAN_BASE_URL}/top/anime?filter=${jikanFilter}&limit=10`;

    const response = await fetchCached(cacheKey, url);
    renderTrendingCards(response?.data || [], trendingList);
  };

  const loadUpcoming = async () => {
    renderTrendingSkeleton(upcomingList);

    const cacheKey = `jikan_upcoming`;
    const url = `${JIKAN_BASE_URL}/seasons/upcoming?limit=10`;

    const response = await fetchCached(cacheKey, url);
    renderTrendingCards(response?.data || [], upcomingList);
  };

  // --- Event Listeners ---

  // Pagination
  prevDayBtn.addEventListener("click", () => {
    latestPage++;
    loadLatestEpisodes();
  });

  nextDayBtn.addEventListener("click", () => {
    if (latestPage > 1) {
      latestPage--;
      loadLatestEpisodes();
    }
  });

  // Latest Tabs
  // TODO: Re-enable when Dub support is added
  /*
    document.getElementById("latest_tabs").addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") {
            document.querySelectorAll("#latest_tabs .tab_btn").forEach(btn => btn.classList.remove("active"));
            e.target.classList.add("active");
            latestFilter = e.target.dataset.filter;
            // We re-render from the current cached data without fetching again
            const targetDate = getTargetDate(latestPage);
            const dayStr = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const cacheKey = `jikan_schedules_${dayStr}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                renderGridCards(JSON.parse(cached).data || [], latestGrid);
            }
        }
    });
    */

  // Trending Tabs
  document.getElementById("trending_tabs").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      document
        .querySelectorAll("#trending_tabs .tab_btn")
        .forEach((btn) => btn.classList.remove("active"));
      e.target.classList.add("active");
      trendingFilter = e.target.dataset.filter;
      loadTrending();
    }
  });

  // --- Hover Popup Logic ---
  const popup = document.getElementById("anime_hover_popup");
  const popupImage = document.getElementById("popup_image");
  const popupTitle = document.getElementById("popup_title");
  const popupMeta = document.getElementById("popup_meta");
  const popupGenres = document.getElementById("popup_genres");
  const popupSynopsis = document.getElementById("popup_synopsis");
  const popupStudio = document.getElementById("popup_studio");
  let hoverTimeout = null;
  let isMobile = window.matchMedia(
    "(hover: none) or (pointer: coarse)",
  ).matches;

  const showPopup = (targetEl, animeId) => {
    const item = animeDataMap.get(animeId);
    if (!item) return;

    // Populate data
    popupTitle.textContent = item.title_english || item.title;

    // Set thumbnail
    popupImage.src =
      item.images?.webp?.large_image_url ||
      item.images?.jpg?.large_image_url ||
      "";

    const score = item.score
      ? `<span class="stat_item"><i class="nf nf-fa-star" style="color:var(--star);"></i> ${item.score.toFixed(1)}</span>`
      : "";
    const eps = calculateAiredEpisodes(item);
    const year = item.year || item.aired?.prop?.from?.year || "?";

    popupMeta.innerHTML = `
        ${score}
        ${score ? "<span>·</span>" : ""}
        <span>${item.type}</span>
        <span>·</span>
        <span>${year}</span>
        <span>·</span>
        <span class="stat_item"><i class="nf nf-md-subtitles"></i> ${eps}</span>
    `;

    popupGenres.innerHTML = (item.genres || [])
      .slice(0, 3)
      .map((g) => `<span class="popup_genre_tag">${g.name}</span>`)
      .join("");
    popupSynopsis.textContent = item.synopsis
      ? item.synopsis.split("[Written by")[0].trim()
      : "No synopsis available.";

    const studio = item.studios?.[0]?.name || "";
    popupStudio.textContent = studio ? `Studio: ${studio}` : "";

    // Position popup
    popup.style.display = "block";
    const rect = targetEl.getBoundingClientRect();
    const popupWidth = popup.offsetWidth;

    // Default: show to the right
    let left = rect.right + 16;
    let top = rect.top + rect.height / 2 - popup.offsetHeight / 2;

    // If it overflows right, show on the left
    if (left + popupWidth > window.innerWidth) {
      left = rect.left - popupWidth - 16;
    }

    // Clamp top and bottom
    top = Math.max(16, top);
    if (top + popup.offsetHeight > window.innerHeight - 16) {
      top = window.innerHeight - popup.offsetHeight - 16;
    }

    if (isMobile) {
      // Center on mobile
      left = (window.innerWidth - popupWidth) / 2;
      top = (window.innerHeight - popup.offsetHeight) / 2;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Trigger animation
    requestAnimationFrame(() => {
      popup.classList.add("active");
    });
  };

  const hidePopup = () => {
    popup.classList.remove("active");
    setTimeout(() => {
      if (!popup.classList.contains("active")) {
        popup.style.display = "none";
      }
    }, 200); // match CSS transition
  };

  // Event Delegation for Cards
  document.addEventListener("mouseover", (e) => {
    if (isMobile) return;
    const card = e.target.closest(".anime_card, .trending_card");
    if (card) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        showPopup(card, card.dataset.id);
      }, 300); // 300ms delay to prevent flicker when moving quickly
    }
  });

  document.addEventListener("mouseout", (e) => {
    if (isMobile) return;
    const card = e.target.closest(".anime_card, .trending_card");
    if (card) {
      clearTimeout(hoverTimeout);
      hidePopup();
    }
  });

  document.addEventListener("click", (e) => {
    const card = e.target.closest(".anime_card, .trending_card");
    if (card) {
      e.preventDefault(); // Prevent default if any anchor wrapping remains
      if (isMobile) {
        if (popup.classList.contains("active")) {
          hidePopup();
        } else {
          showPopup(card, card.dataset.id);
        }
      } else {
        // Desktop click logic (e.g. Add to list later)
        console.log("Desktop click on anime", card.dataset.id);
      }
    } else if (isMobile && popup.classList.contains("active")) {
      // Click outside on mobile hides popup
      hidePopup();
    }
  });

  // --- Init ---
  loadLatestEpisodes();
  loadTrending();
  loadUpcoming();
});
