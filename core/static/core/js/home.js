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

  // --- DOM Elements ---
  const latestGrid = document.getElementById("latest_grid");
  const trendingList = document.getElementById("trending_list");
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

  const renderLatestSkeleton = () => {
    latestGrid.innerHTML = "";
    for (let i = 0; i < 18; i++) {
      latestGrid.innerHTML += `
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

  const renderTrendingSkeleton = () => {
    trendingList.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      trendingList.innerHTML += `
                <div class="trending_card">
                    <div class="trending_content">
                        <div class="skel skel_text" style="margin-bottom:6px;"></div>
                        <div class="skel skel_text_sm"></div>
                    </div>
                </div>
            `;
    }
  };

  const renderLatestCards = (items) => {
    latestGrid.innerHTML = "";

    if (!items || items.length === 0) {
      latestGrid.innerHTML = `<div class="empty_msg" style="grid-column: 1 / -1;">No episodes scheduled.</div>`;
      return;
    }

    items.forEach((item) => {
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

      latestGrid.innerHTML += `
                <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="anime_card">
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
                </a>
            `;
    });

    // If after filtering it's empty
    if (latestGrid.innerHTML.trim() === "") {
      latestGrid.innerHTML = `<div class="empty_msg" style="grid-column: 1 / -1;">No entries match the filter.</div>`;
    }
  };

  const renderTrendingCards = (items) => {
    trendingList.innerHTML = "";

    if (!items || items.length === 0) {
      trendingList.innerHTML = `<div class="empty_msg">Failed to load trending data.</div>`;
      return;
    }

    items.forEach((item, index) => {
      const rank = index + 1; // item.rank might be available, but we enforce 1-10 ordered by API
      const title = item.title_english || item.title;
      const img =
        item.images?.webp?.large_image_url ||
        item.images?.jpg?.large_image_url ||
        "";
      const score = item.score ? item.score.toFixed(1) : "?";
      const epsDisplay = calculateAiredEpisodes(item);

      trendingList.innerHTML += `
                <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="trending_card">
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
                </a>
            `;
    });
  };

  // --- Fetch Controllers ---

  const loadLatestEpisodes = async () => {
    renderLatestSkeleton();

    const targetDate = getTargetDate(latestPage);
    const dayStr = targetDate
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();

    currentDayLabel.textContent = formatDayLabel(latestPage, targetDate);
    nextDayBtn.disabled = latestPage === 1;

    const cacheKey = `jikan_schedules_${dayStr}`;
    const url = `${JIKAN_BASE_URL}/schedules?filter=${dayStr}&limit=24&page=1`;

    const response = await fetchCached(cacheKey, url);
    renderLatestCards(response?.data || []);
  };

  const loadTrending = async () => {
    renderTrendingSkeleton();

    const filterMap = {
      day: "airing",
      week: "bypopularity",
      month: "favorite",
    };
    const jikanFilter = filterMap[trendingFilter] || "airing";

    const cacheKey = `jikan_trending_${jikanFilter}`;
    const url = `${JIKAN_BASE_URL}/top/anime?filter=${jikanFilter}&limit=10`;

    const response = await fetchCached(cacheKey, url);
    renderTrendingCards(response?.data || []);
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
                renderLatestCards(JSON.parse(cached).data || []);
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

  // --- Init ---
  loadLatestEpisodes();
  loadTrending();
});
