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
  let userCategories = []; // Fetched from API for authenticated+verified users
  let canAddToList = false; // True if user is auth+verified and has ≥1 category
  let currentPopupAnimeId = null; // Track which anime the popup is showing

  // --- DOM Elements ---
  const latestGrid = document.getElementById("latest_grid");
  const trendingList = document.getElementById("trending_list");
  const upcomingList = document.getElementById("upcoming_list");
  const prevDayBtn = document.getElementById("prev_day_btn");
  const nextDayBtn = document.getElementById("next_day_btn");
  const currentDayLabel = document.getElementById("current_day_label");

  // --- Utils ---

  // Simple sessionStorage cache with TTL
  const fetchCached = async (cacheKey, url, maxRetries = 3) => {
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

    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Exponential backoff: 0ms, 1500ms, 3000ms before each retry
        if (attempt > 0) {
          const backoffMs = attempt * 1500;
          console.warn(
            `Retry ${attempt}/${maxRetries - 1} for ${url} after ${backoffMs}ms`,
          );
          await new Promise((r) => setTimeout(r, backoffMs));
        }

        const res = await fetch(url);

        // Retry on server errors (5xx) and rate limits (429)
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          lastError = new Error(`HTTP error! status: ${res.status}`);
          console.warn(
            `Retryable status ${res.status} on attempt ${attempt + 1}`,
          );
          continue;
        }

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
        lastError = e;
        // Network errors (TypeError) are retryable; other errors are not
        if (e instanceof TypeError) {
          console.warn(`Network error on attempt ${attempt + 1}:`, e.message);
          continue;
        }
        // Non-retryable error (e.g., 4xx client error)
        console.error("Fetch error:", e);
        return null;
      }
    }

    // All retries exhausted — try returning stale cache if available
    if (cached) {
      try {
        const stale = JSON.parse(cached);
        console.warn("All retries failed, returning stale cache for", cacheKey);
        return stale.data;
      } catch (_) {
        // ignore
      }
    }

    console.error("All retries exhausted for:", url, lastError);
    return null;
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
    d.setDate(d.getDate() - (pageOffset - 1));
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

    let response = await fetchCached(cacheKey, url);

    // Fallback: if filtered endpoint fails (e.g. Jikan 504 on certain days),
    // fetch unfiltered schedules and filter client-side by broadcast.day
    if (!response || !response.data) {
      console.warn(
        `Filtered schedule fetch failed for "${dayStr}", falling back to unfiltered endpoint`,
      );
      const fallbackCacheKey = `jikan_schedules_all`;
      const fallbackUrl = `${JIKAN_BASE_URL}/schedules?limit=25&page=1`;
      const allResponse = await fetchCached(fallbackCacheKey, fallbackUrl);

      if (allResponse?.data) {
        // Jikan broadcast.day uses capitalized plural form: "Sundays", "Mondays", etc.
        const targetDay =
          dayStr.charAt(0).toUpperCase() + dayStr.slice(1) + "s";
        const filtered = [];

        // Collect from first page
        allResponse.data.forEach((item) => {
          if (
            item.broadcast?.day === targetDay ||
            item.broadcast?.string?.toLowerCase().includes(dayStr)
          ) {
            filtered.push(item);
          }
        });

        // If first page has_next_page, fetch more pages for complete results
        const totalPages = allResponse.pagination?.last_visible_page || 1;
        for (let page = 2; page <= totalPages && page <= 6; page++) {
          const pageUrl = `${JIKAN_BASE_URL}/schedules?limit=25&page=${page}`;
          const pageCacheKey = `jikan_schedules_all_p${page}`;
          const pageResponse = await fetchCached(pageCacheKey, pageUrl);
          if (pageResponse?.data) {
            pageResponse.data.forEach((item) => {
              if (
                item.broadcast?.day === targetDay ||
                item.broadcast?.string?.toLowerCase().includes(dayStr)
              ) {
                filtered.push(item);
              }
            });
          }
          // Small delay to respect rate limits between pages
          await new Promise((r) => setTimeout(r, 400));
        }

        response = { data: filtered.slice(0, 24) };
      }
    }

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
  const popupAddBtn = document.getElementById("popup_add_btn");
  const popupCategoryPicker = document.getElementById("popup_category_picker");
  const popupCategoryList = document.getElementById("popup_category_list");
  const popupAddFeedback = document.getElementById("popup_add_feedback");
  const popupCancelAddBtn = document.getElementById("popup_cancel_add_btn");
  let hoverTimeout = null;
  let hideTimeout = null;
  let isMouseInPopup = false;
  let isMobile = window.matchMedia(
    "(hover: none) or (pointer: coarse)",
  ).matches;

  const resetPopupAddState = () => {
    popupCategoryPicker.style.display = "none";
    popupAddFeedback.style.display = "none";
    if (popupAddBtn) {
      popupAddBtn.style.display = canAddToList ? "" : "none";
      popupAddBtn.disabled = false;
      popupAddBtn.innerHTML = '<i class="nf nf-fa-plus"></i> Add to List';
    }
  };

  if (popupCancelAddBtn) {
    popupCancelAddBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resetPopupAddState();
    });
  }

  const showPopup = (targetEl, animeId) => {
    const item = animeDataMap.get(animeId);
    if (!item) return;

    currentPopupAnimeId = animeId;

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

    // Reset add-to-list state
    resetPopupAddState();

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
    currentPopupAnimeId = null;
    setTimeout(() => {
      if (!popup.classList.contains("active")) {
        popup.style.display = "none";
        resetPopupAddState();
      }
    }, 200); // match CSS transition
  };

  const scheduleHide = () => {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isMouseInPopup) {
        hidePopup();
      }
    }, 150);
  };

  // Keep popup open when mouse enters popup
  popup.addEventListener("mouseenter", () => {
    isMouseInPopup = true;
    clearTimeout(hideTimeout);
    clearTimeout(hoverTimeout);
  });

  popup.addEventListener("mouseleave", () => {
    isMouseInPopup = false;
    scheduleHide();
  });

  // Event Delegation for Cards
  document.addEventListener("mouseover", (e) => {
    if (isMobile) return;
    const card = e.target.closest(".anime_card, .trending_card");
    if (card) {
      clearTimeout(hoverTimeout);
      clearTimeout(hideTimeout);
      hoverTimeout = setTimeout(() => {
        showPopup(card, card.dataset.id);
      }, 300);
    }
  });

  document.addEventListener("mouseout", (e) => {
    if (isMobile) return;
    const card = e.target.closest(".anime_card, .trending_card");
    if (card) {
      clearTimeout(hoverTimeout);
      scheduleHide();
    }
  });

  // Click outside hides popup (both mobile and desktop)
  document.addEventListener("click", (e) => {
    const clickedCard = e.target.closest(".anime_card, .trending_card");
    const clickedPopup = e.target.closest("#anime_hover_popup");

    if (clickedCard) {
      e.preventDefault();
      if (isMobile) {
        if (
          popup.classList.contains("active") &&
          clickedCard.dataset.id === currentPopupAnimeId
        ) {
          hidePopup();
        } else {
          showPopup(clickedCard, clickedCard.dataset.id);
        }
      }
      // Desktop: hover handles popup, click on card does nothing extra
      return;
    }

    // Click outside popup and outside card → close popup
    if (!clickedPopup && popup.classList.contains("active")) {
      hidePopup();
    }
  });

  // Hide popup on scroll to prevent it from floating detached
  window.addEventListener(
    "scroll",
    () => {
      if (popup.classList.contains("active")) {
        hidePopup();
      }
    },
    { passive: true },
  );

  // --- Add to List Logic ---

  // "Add to List" button click → show category picker
  if (popupAddBtn) {
    popupAddBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Populate category list
      popupCategoryList.innerHTML = "";
      userCategories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "popup_category_item";
        btn.dataset.categoryId = cat.id;
        btn.innerHTML = `<i class="nf nf-fa-folder"></i> ${cat.name}`;
        popupCategoryList.appendChild(btn);
      });
      popupAddBtn.style.display = "none";
      popupCategoryPicker.style.display = "block";

      // If the expanded picker causes the popup to overflow the screen bottom, push it up
      requestAnimationFrame(() => {
        const rect = popup.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 16) {
          const newTop = Math.max(16, window.innerHeight - rect.height - 16);
          popup.style.top = `${newTop}px`;
        }
      });
    });
  }

  // Category item click → add anime to that category
  if (popupCategoryList) {
    popupCategoryList.addEventListener("click", async (e) => {
      const catBtn = e.target.closest(".popup_category_item");
      if (!catBtn) return;
      e.stopPropagation();

      const categoryId = parseInt(catBtn.dataset.categoryId, 10);
      const item = animeDataMap.get(currentPopupAnimeId);
      if (!item) return;

      // Disable all buttons while loading
      popupCategoryList
        .querySelectorAll(".popup_category_item")
        .forEach((b) => (b.disabled = true));
      catBtn.innerHTML = '<i class="nf nf-fa-spinner"></i> Adding...';

      try {
        const animeName = item.title_english || item.title;
        const thumbnailUrl =
          item.images?.webp?.large_image_url ||
          item.images?.jpg?.large_image_url ||
          "";

        const response = await window.apiFetch("/api/v1/animes/bulk_sync/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: [
              {
                type: "CREATE",
                temp_id: `home_add_${Date.now()}`,
                data: {
                  category_id: categoryId,
                  name: animeName,
                  thumbnail_url: thumbnailUrl,
                  language: "",
                  stars: item.score || null,
                  order: 9999, // Will be placed at end by backend
                  seasons: [
                    {
                      number: 1,
                      total_episodes: item.episodes || 0,
                      watched_episodes: 0,
                    },
                  ],
                },
              },
            ],
          }),
        });

        if (response.ok) {
          // Show success feedback
          popupCategoryPicker.style.display = "none";
          popupAddFeedback.style.display = "flex";

          // Auto-hide feedback after 1.5s
          setTimeout(() => {
            if (popup.classList.contains("active")) {
              popupAddFeedback.style.display = "none";
              popupAddBtn.style.display = "";
              popupAddBtn.innerHTML = '<i class="nf nf-fa-check"></i> Added!';
              popupAddBtn.disabled = true;
            }
          }, 1500);
        } else {
          // Error — re-enable picker
          popupCategoryList
            .querySelectorAll(".popup_category_item")
            .forEach((b) => {
              b.disabled = false;
            });
          catBtn.innerHTML = `<i class="nf nf-fa-folder"></i> Failed — try again`;
        }
      } catch (err) {
        console.error("Add to list error:", err);
        popupCategoryList
          .querySelectorAll(".popup_category_item")
          .forEach((b) => {
            b.disabled = false;
          });
      }
    });
  }

  // --- Fetch User Categories (if authenticated + verified) ---
  const loadUserCategories = async () => {
    if (!window.__USER_IS_AUTHENTICATED__ || !window.__USER_EMAIL_VERIFIED__) {
      return;
    }

    try {
      const response = await window.apiFetch("/api/v1/categories/");
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          userCategories = data;
          canAddToList = true;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch categories for add-to-list:", err);
    }
  };

  // --- Init ---
  loadLatestEpisodes();
  loadTrending();
  loadUpcoming();
  loadUserCategories();
});
