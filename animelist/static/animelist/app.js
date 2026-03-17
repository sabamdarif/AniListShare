let currentCategoryId = null;

function switchTab(catId) {
  currentCategoryId = catId;
  document
    .querySelectorAll(".tab-wrapper")
    .forEach((t) => t.classList.toggle("active", t.dataset.catId == catId));
  document
    .querySelectorAll(".category-panel")
    .forEach((p) => p.classList.toggle("active", p.dataset.catId == catId));
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

function renderStars(n, max = 10) {
  if (n === null || n === undefined)
    return '<span class="stars-display text-muted">—</span>';
  let html = '<span class="stars-display">';
  for (let i = 1; i <= max; i++) {
    html +=
      i <= n
        ? '<i class="fa-solid fa-star"></i>'
        : '<span class="empty"><i class="fa-solid fa-star"></i></span>';
  }
  html += ` <span style="color:var(--text-muted);font-size:0.75rem">${n}/10</span></span>`;
  return html;
}

function buildSeasonBadges(animeId, seasons) {
  return seasons
    .map((s) => {
      let progressAttr = "";
      let progressText = "";
      let classes = "season-badge";
      let commentAttr = s.comment
        ? ` data-comment="${s.comment.replace(/"/g, "&quot;")}"`
        : ' data-comment=""';

      if (
        s.episodes_watched !== null &&
        s.episodes_total !== null &&
        s.episodes_total > 0
      ) {
        const pct = Math.min(
          100,
          Math.max(0, (s.episodes_watched / s.episodes_total) * 100),
        );
        progressAttr = `--progress: ${pct}%;`;
        progressText = ` <span class="season-progress">(${s.episodes_watched}/${s.episodes_total})</span>`;
        classes += " has-progress";
      } else if (s.episodes_watched !== null) {
        progressText = ` <span class="season-progress">(${s.episodes_watched}/?)</span>`;
      }

      const w = s.episodes_watched !== null ? s.episodes_watched : "";
      const t = s.episodes_total !== null ? s.episodes_total : "";
      const safeLabel = s.label
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;");
      const safeComment = s.comment
        ? s.comment
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/"/g, "&quot;")
        : "";
      const onClickAttr = ` onclick="openQuickSeasonModal(${animeId}, ${s.id}, '${safeLabel}', '${w}', '${t}', '${safeComment}')"`;

      return `<div style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: top; margin: 2px 3px; max-width: 90px;">
        <span class="${classes}" style="margin: 0; width: 100%; justify-content: center; ${progressAttr}"${commentAttr}${onClickAttr} title="Click to quick-edit progress">${s.label}${progressText}</span>
        ${s.comment ? `<span class="text-muted" style="font-size: 0.65rem; margin-top: 2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;" title="${safeComment}">${s.comment}</span>` : ""}
      </div>`;
    })
    .join("");
}

function buildTableRow(anime, idx) {
  const thumb = anime.thumbnail_url
    ? `<img class="thumb" src="${anime.thumbnail_url}" alt="" loading="lazy">`
    : `<div class="thumb-placeholder" id="thumb-${anime.id}"><span>N/A</span><button class="thumb-load-btn" onclick="event.stopPropagation();fetchThumbnail(${anime.id})" title="Fetch thumbnail"><i class="fa-solid fa-download"></i> Load</button></div>`;
  return `<tr data-id="${anime.id}">
    <td class="col-num drag-handle" title="Drag to reorder">${idx + 1}</td>
    <td class="col-thumb">${thumb}</td>
    <td class="col-name">
      <div class="anime-title" style="font-weight: 500;">${anime.name}</div>
      ${anime.reason ? `<div class="anime-reason text-muted" style="font-size: 0.75rem; margin-top: 4px;">${anime.reason}</div>` : ""}
    </td>
    <td class="col-seasons">${buildSeasonBadges(anime.id, anime.seasons)}</td>
    <td class="col-lang">
      ${
        anime.language
          ? anime.language
              .split(",")
              .map((lang) => `<span class="lang-badge">${lang.trim()}</span>`)
              .join("")
          : '<span class="text-muted">—</span>'
      }
    </td>
    <td class="col-stars">${renderStars(anime.stars)}</td>
    <td class="col-actions">
      <div class="actions-cell">
        <button class="btn-icon" onclick="openEditModal(${anime.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
      </div>
    </td>
  </tr>`;
}

async function fetchThumbnail(animeId) {
  const placeholder = document.getElementById(`thumb-${animeId}`);
  if (!placeholder) return;

  const btn = placeholder.querySelector(".thumb-load-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  try {
    const resp = await fetch(`/api/anime/${animeId}/fetch-thumbnail/`, {
      method: "POST",
    });
    const data = await resp.json();

    if (data.thumbnail_url) {
      const td = placeholder.parentElement;
      td.innerHTML = `<img class="thumb" src="${data.thumbnail_url}" alt="" loading="lazy">`;
      showToast("Thumbnail loaded!");
    } else {
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Not found';
        btn.classList.add("error");
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-download"></i> Load';
          btn.classList.remove("error");
          btn.disabled = false;
        }, 2000);
      }
    }
  } catch {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-download"></i> Load';
      btn.disabled = false;
    }
    showToast("Failed to fetch thumbnail");
  }
}

async function loadCategory(catId) {
  const panel = document.querySelector(
    `.category-panel[data-cat-id="${catId}"]`,
  );
  const tbody = panel.querySelector("tbody");
  try {
    const resp = await fetch(`/api/anime/?category_id=${catId}`);
    const data = await resp.json();
    if (data.anime.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No anime in this category yet</p></div></td></tr>`;
    } else {
      tbody.innerHTML = data.anime.map((a, i) => buildTableRow(a, i)).join("");

      if (tbody._sortable) {
        tbody._sortable.destroy();
      }
      tbody._sortable = new Sortable(tbody, {
        handle: ".drag-handle",
        animation: 150,
        onEnd: async function (evt) {
          if (evt.oldIndex === evt.newIndex) return;

          const itemEl = evt.item;
          const animeId = itemEl.dataset.id;
          const direction = evt.newIndex > evt.oldIndex ? "down" : "up";

          const rows = tbody.querySelectorAll("tr[data-id]");
          rows.forEach((row, i) => {
            row.querySelector(".col-num").textContent = i + 1;
          });

          const siblingIds = Array.from(rows).map((r) =>
            parseInt(r.dataset.id),
          );
          await updateOrderBackend(siblingIds);
        },
      });
    }
    panel._animeData = data.anime;
  } catch {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>Failed to load</p></div></td></tr>`;
  }
}

async function updateOrderBackend(animeIds) {
  try {
    await fetch("/api/anime/reorder_bulk/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anime_ids: animeIds }),
    });
  } catch (e) {
    console.error("Failed to reorder", e);
  }
}

function updateThumbnailPreview() {
  const url = document.getElementById("thumbnailInput").value.trim();
  const preview = document.getElementById("thumbnailPreview");
  if (url) {
    preview.src = url;
  } else {
    preview.style.display = "none";
    preview.src = "";
  }
}

function updateLanguagePreview() {
  const input = document.getElementById("languageInput").value.trim();
  const preview = document.getElementById("languagePreview");
  if (!input) {
    preview.innerHTML = "";
    return;
  }

  const langs = input.split(",").filter((l) => l.trim() !== "");
  preview.innerHTML = langs
    .map((lang) => `<span class="lang-badge">${lang.trim()}</span>`)
    .join("");
}

function setStars(val) {
  const input = document.getElementById("starsInput");
  const stars = document.querySelectorAll(".interactive-stars .star");

  input.value = val === null ? "" : val;

  stars.forEach((star) => {
    const starVal = parseInt(star.dataset.val);
    if (val !== null && starVal <= val) {
      star.classList.add("active");
    } else {
      star.classList.remove("active");
    }
  });
}

function openAddModal() {
  document.getElementById("modalTitle").textContent = "Add Anime";
  document.getElementById("animeForm").reset();
  document.getElementById("animeIdField").value = "";
  document.getElementById("thumbnailInput").value = "";
  updateThumbnailPreview();
  document.getElementById("languageInput").value = "";
  updateLanguagePreview();
  document.getElementById("categorySelect").value = currentCategoryId || "";
  document.getElementById("seasonsContainer").innerHTML = "";
  document.getElementById("deleteSection").style.display = "none";
  setStars(null);
  addSeasonRow();
  document.getElementById("modalOverlay").classList.add("open");
}

function openEditModal(animeId) {
  const panel = document.querySelector(
    `.category-panel[data-cat-id="${currentCategoryId}"]`,
  );
  const anime = panel._animeData.find((a) => a.id === animeId);
  if (!anime) return;

  document.getElementById("modalTitle").textContent = "Edit Anime";
  document.getElementById("animeIdField").value = anime.id;
  document.getElementById("nameInput").value = anime.name;
  document.getElementById("thumbnailInput").value = anime.thumbnail_url || "";
  updateThumbnailPreview();
  document.getElementById("malIdInput").value = anime.mal_id || "";
  document.getElementById("categorySelect").value =
    anime.category_id || currentCategoryId;
  document.getElementById("languageInput").value = anime.language || "";
  updateLanguagePreview();
  setStars(anime.stars);
  document.getElementById("reasonInput").value = anime.reason || "";

  const sc = document.getElementById("seasonsContainer");
  sc.innerHTML = "";
  if (anime.seasons.length > 0) {
    anime.seasons.forEach((s) =>
      addSeasonRow(s.label, s.episodes_watched, s.episodes_total, s.comment),
    );
  } else {
    addSeasonRow();
  }

  document.getElementById("deleteSection").style.display = "block";
  document.getElementById("modalOverlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  document.getElementById("autocompleteResults").classList.remove("show");
}

function closeQuickSeasonModal() {
  document.getElementById("quickSeasonModalOverlay").classList.remove("open");
}

let quickEditAnimeId = null;
let quickEditSeasonId = null;

function openQuickSeasonModal(
  animeId,
  seasonId,
  label,
  watched,
  total,
  comment,
) {
  quickEditAnimeId = animeId;
  quickEditSeasonId = seasonId;
  const panel = document.querySelector(
    `.category-panel[data-cat-id="${currentCategoryId}"]`,
  );
  const anime = panel._animeData.find((a) => a.id === animeId);
  if (!anime) return;

  document.getElementById("qsLabel").textContent = "Edit " + label;
  document.getElementById("qsTotalInput").value = total;
  document.getElementById("qsWatchedInput").value = watched;
  document.getElementById("qsCommentInput").value = comment || "";

  document.getElementById("quickSeasonModalOverlay").classList.add("open");
}

async function saveQuickSeason() {
  if (!quickEditAnimeId || !quickEditSeasonId) return;

  const panel = document.querySelector(
    `.category-panel[data-cat-id="${currentCategoryId}"]`,
  );
  const anime = panel._animeData.find((a) => a.id === quickEditAnimeId);
  if (!anime) return;

  const wStr = document.getElementById("qsWatchedInput").value.trim();
  const tStr = document.getElementById("qsTotalInput").value.trim();
  const w = wStr !== "" ? parseInt(wStr, 10) : null;
  const t = tStr !== "" ? parseInt(tStr, 10) : null;
  const cStr = document.getElementById("qsCommentInput").value.trim();

  const seasonsPayload = anime.seasons.map((s) => ({
    label: s.label,
    comment: s.id === quickEditSeasonId ? cStr : s.comment,
    episodes_watched: s.id === quickEditSeasonId ? w : s.episodes_watched,
    episodes_total: s.id === quickEditSeasonId ? t : s.episodes_total,
  }));

  const body = {
    category_id: parseInt(anime.category_id || currentCategoryId, 10),
    name: anime.name,
    thumbnail_url: anime.thumbnail_url || "",
    mal_id: anime.mal_id,
    language: anime.language || "",
    stars: anime.stars,
    reason: anime.reason || "",
    seasons: seasonsPayload,
  };

  const resp = await fetch(`/api/anime/${anime.id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (resp.ok) {
    closeQuickSeasonModal();
    showToast("Progress Saved!");
    await loadCategory(currentCategoryId);
  } else {
    showToast("Failed to save progress.");
  }
}

function processQuickComplete() {
  const tInput = document.getElementById("qsTotalInput");
  const wInput = document.getElementById("qsWatchedInput");
  if (tInput.value) {
    wInput.value = tInput.value;
  }
}

function processCompleteButton(btn) {
  const row = btn.closest(".season-row");
  const tInput = row.querySelector(".season-ep.total");
  const wInput = row.querySelector(".season-ep.watched");
  if (tInput.value) {
    wInput.value = tInput.value;
  }
}

function addSeasonRow(label = "", watched = "", total = "", comment = "") {
  const sc = document.getElementById("seasonsContainer");
  const row = document.createElement("div");
  row.className = "season-row";

  const w = watched !== null ? watched : "";
  const t = total !== null ? total : "";

  row.innerHTML = `
    <input type="text" class="form-input season-label" placeholder="e.g. S1, OVA" value="${label.replace(/"/g, "&quot;")}">
    <div class="ep-inputs-wrapper">
      <input type="number" class="form-input season-ep watched" placeholder="Watched" value="${w}" min="0">
      <span class="ep-sep">/</span>
      <input type="number" class="form-input season-ep total" placeholder="Total" value="${t}" min="1">
      <button type="button" class="btn btn-accent btn-sm btn-complete" onclick="processCompleteButton(this)" title="Mark Complete"><i class="fa-solid fa-check-double"></i></button>
    </div>
    <input type="text" class="form-input season-comment" placeholder="Comment (optional)" value="${comment.replace(/"/g, "&quot;")}">
    <button type="button" class="remove-season" onclick="this.parentElement.remove()" title="Remove Season"><i class="fa-solid fa-xmark"></i></button>`;
  sc.appendChild(row);
}

async function saveAnime() {
  const id = document.getElementById("animeIdField").value;
  const seasons = [];
  document.querySelectorAll(".season-row").forEach((row) => {
    const label = row.querySelector(".season-label").value.trim();
    const comment = row.querySelector(".season-comment").value.trim();
    const w = row.querySelector(".season-ep.watched").value.trim();
    const t = row.querySelector(".season-ep.total").value.trim();

    if (label) {
      seasons.push({
        label,
        comment,
        episodes_watched: w !== "" ? parseInt(w, 10) : null,
        episodes_total: t !== "" ? parseInt(t, 10) : null,
      });
    }
  });

  const starsVal = document.getElementById("starsInput").value;
  const body = {
    category_id: parseInt(document.getElementById("categorySelect").value),
    name: document.getElementById("nameInput").value.trim(),
    thumbnail_url: document.getElementById("thumbnailInput").value.trim(),
    mal_id: parseInt(document.getElementById("malIdInput").value) || null,
    language: document.getElementById("languageInput").value.trim(),
    stars: starsVal !== "" ? parseInt(starsVal) : null,
    reason: document.getElementById("reasonInput").value.trim(),
    seasons,
  };

  if (!body.name) {
    showToast("Name is required");
    return;
  }
  if (body.stars !== null && (body.stars < 0 || body.stars > 10)) {
    showToast("Stars must be 0-10");
    return;
  }

  let url, method;
  if (id) {
    url = `/api/anime/${id}/`;
    method = "PUT";
  } else {
    url = "/api/anime/create/";
    method = "POST";
  }

  const resp = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();

  if (resp.ok) {
    closeModal();
    showToast(id ? "Updated!" : "Added!");
    await loadCategory(currentCategoryId);
  } else {
    showToast(data.error || "Error");
  }
}

async function deleteAnime() {
  const id = document.getElementById("animeIdField").value;
  if (!id) return;
  if (!confirm("Delete this anime entry?")) return;

  const resp = await fetch(`/api/anime/${id}/delete/`, { method: "DELETE" });
  if (resp.ok) {
    closeModal();
    showToast("Deleted");
    await loadCategory(currentCategoryId);
  }
}

let editingCatId = null;

function openCategoryModal(catId, catName) {
  editingCatId = catId || null;
  const isEdit = !!editingCatId;

  document.getElementById("categoryModalTitle").textContent = isEdit
    ? "Edit Category"
    : "Add Category";
  document.getElementById("categoryNameInput").value = catName || "";
  document.getElementById("categoryDeleteSection").style.display = isEdit
    ? ""
    : "none";

  document.getElementById("categoryFormSection").style.display = "";
  document.getElementById("categoryDeleteConfirm").style.display = "none";
  document.getElementById("categoryModalFooter").style.display = "";

  document.getElementById("categoryModalOverlay").classList.add("open");

  setTimeout(function () {
    document.getElementById("categoryNameInput").focus();
  }, 50);
}

function addCategory() {
  openCategoryModal(null, "");
}

function closeCategoryModal() {
  document.getElementById("categoryModalOverlay").classList.remove("open");
  editingCatId = null;
}

async function saveCategoryModal() {
  var nameInput = document.getElementById("categoryNameInput");
  var name = nameInput.value.trim();
  if (!name) {
    showToast("Category name is required");
    nameInput.focus();
    return;
  }

  var resp;
  if (editingCatId) {
    resp = await fetch("/api/category/" + editingCatId + "/update/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name }),
    });
    if (!resp.ok) {
      showToast("Failed to rename category");
      return;
    }
  } else {
    resp = await fetch("/api/category/create/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name }),
    });
    if (!resp.ok) {
      showToast("Failed to create category");
      return;
    }
  }

  closeCategoryModal();
  location.reload();
}

function startDeleteCategory() {
  var nameInput = document.getElementById("categoryNameInput");
  document.getElementById("confirmDeleteCatName").textContent =
    '"' + (nameInput.value.trim() || "this category") + '"';

  document.getElementById("categoryFormSection").style.display = "none";
  document.getElementById("categoryDeleteConfirm").style.display = "";
  document.getElementById("categoryModalFooter").style.display = "none";
}

function cancelDeleteCategory() {
  document.getElementById("categoryFormSection").style.display = "";
  document.getElementById("categoryDeleteConfirm").style.display = "none";
  document.getElementById("categoryModalFooter").style.display = "";
}

async function confirmDeleteCategory() {
  if (!editingCatId) return;

  var resp = await fetch("/api/category/" + editingCatId + "/delete/", {
    method: "DELETE",
  });

  if (resp.ok) {
    closeCategoryModal();
    showToast("Category deleted");
    location.reload();
  } else {
    showToast("Failed to delete category");
  }
}

let searchTimeout;
function setupAutocomplete() {
  const input = document.getElementById("nameInput");
  const results = document.getElementById("autocompleteResults");

  input.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      results.classList.remove("show");
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/mal-search/?q=${encodeURIComponent(q)}`);
        const data = await resp.json();
        if (data.results.length === 0) {
          results.classList.remove("show");
          return;
        }
        results.innerHTML = data.results
          .map(
            (r) => `
          <div class="autocomplete-item" data-mal-id="${r.mal_id}" data-title="${(r.title || "").replace(/"/g, "&quot;")}" data-english="${(r.title_english || "").replace(/"/g, "&quot;")}" data-image="${r.image_url || ""}">
            <img src="${r.image_url || ""}" alt="" onerror="this.style.display='none'">
            <div class="ac-info">
              <div class="ac-title">${r.title}</div>
              <div class="ac-sub">${r.title_english ? r.title_english + " · " : ""}${r.type || ""} · ${r.episodes || "?"} eps</div>
            </div>
          </div>
        `,
          )
          .join("");
        results.classList.add("show");
        results.querySelectorAll(".autocomplete-item").forEach((item) => {
          item.addEventListener("click", () => {
            const jpTitle = item.dataset.title.toLowerCase();
            const enTitle = item.dataset.english.toLowerCase();
            const query = input.value.trim().toLowerCase();

            if (
              item.dataset.english &&
              enTitle.includes(query) &&
              !jpTitle.includes(query)
            ) {
              input.value = item.dataset.english;
            } else {
              input.value = item.dataset.title;
            }

            document.getElementById("thumbnailInput").value =
              item.dataset.image;
            updateThumbnailPreview();
            document.getElementById("malIdInput").value = item.dataset.malId;
            results.classList.remove("show");
          });
        });
      } catch {
        results.classList.remove("show");
      }
    }, 400);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-wrapper"))
      results.classList.remove("show");
  });
}

function setupInteractiveStars() {
  const stars = document.querySelectorAll(".interactive-stars .star");
  const clearBtn = document.getElementById("starsClear");
  const container = document.getElementById("interactiveStars");

  stars.forEach((star) => {
    star.addEventListener("mouseover", () => {
      const val = parseInt(star.dataset.val);
      stars.forEach((s) => {
        if (parseInt(s.dataset.val) <= val) {
          s.classList.add("hover");
        } else {
          s.classList.remove("hover");
        }
      });
    });

    star.addEventListener("click", () => {
      const val = parseInt(star.dataset.val);
      setStars(val);
    });
  });

  container.addEventListener("mouseleave", () => {
    stars.forEach((s) => s.classList.remove("hover"));
  });

  clearBtn.addEventListener("click", () => {
    setStars(null);
  });
}

let localSearchTimeout;
function setupLocalSearch() {
  const input = document.getElementById("localSearchInput");
  const results = document.getElementById("localSearchResults");
  const wrapper = document.getElementById("localSearchWrapper");

  if (!input || !results || !wrapper) return;

  function performSearch() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      results.classList.remove("show");
      return;
    }

    const allAnime = [];
    document.querySelectorAll(".category-panel").forEach((panel) => {
      if (panel._animeData) {
        panel._animeData.forEach((a) => {
          allAnime.push({
            ...a,
            catId: panel.dataset.catId,
          });
        });
      }
    });

    if (allAnime.length === 0) {
      results.innerHTML =
        '<div class="autocomplete-item"><div class="ac-info"><div class="ac-title text-muted">No data loaded yet</div></div></div>';
      results.classList.add("show");
      return;
    }

    const matches = allAnime.filter((a) => {
      const nameMatch = a.name && a.name.toLowerCase().includes(q);
      const enMatch =
        a.title_english && a.title_english.toLowerCase().includes(q);
      const malMatch = a.mal_title && a.mal_title.toLowerCase().includes(q);
      return nameMatch || enMatch || malMatch;
    });

    if (matches.length === 0) {
      results.innerHTML =
        '<div class="autocomplete-item"><div class="ac-info"><div class="ac-title text-muted">No matches found</div></div></div>';
      results.classList.add("show");
      return;
    }

    results.innerHTML = matches
      .slice(0, 10)
      .map(
        (r) => `
      <div class="autocomplete-item local-search-item" data-id="${r.id}" data-cat-id="${r.catId}">
        <img src="${r.thumbnail_url || ""}" alt="" onerror="this.style.display='none'">
        <div class="ac-info">
          <div class="ac-title">${r.name.replace(/"/g, "&quot;")}</div>
          <div class="ac-sub">${r.language || "—"} · ${r.stars !== null ? r.stars + "/10" : "Unrated"}</div>
        </div>
      </div>
    `,
      )
      .join("");

    results.classList.add("show");

    results.querySelectorAll(".local-search-item").forEach((item) => {
      item.addEventListener("click", () => {
        const catId = item.dataset.catId;
        const animeId = item.dataset.id;

        if (currentCategoryId !== catId) {
          switchTab(catId);
        }

        results.classList.remove("show");
        input.value = "";

        setTimeout(() => {
          const row = document.querySelector(`tr[data-id="${animeId}"]`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });

            row.classList.remove("highlighted-row");
            void row.offsetWidth;
            row.classList.add("highlighted-row");

            setTimeout(() => row.classList.remove("highlighted-row"), 2000);
          }
        }, 100);
      });
    });
  }

  input.addEventListener("input", () => {
    clearTimeout(localSearchTimeout);
    localSearchTimeout = setTimeout(performSearch, 200);
  });

  input.addEventListener("focus", performSearch);

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#localSearchWrapper")) {
      results.classList.remove("show");
    }
  });
}

function openMobileSearch() {
  const overlay = document.getElementById("mobileSearchOverlay");
  const input = document.getElementById("mobileSearchInput");
  const results = document.getElementById("mobileSearchResults");

  input.value = "";
  results.innerHTML = `<div class="mobile-search-placeholder">
    <i class="fa-solid fa-magnifying-glass"></i>
    <p>Type to search your anime list</p>
  </div>`;

  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("open");

  document.body.style.overflow = "hidden";

  setTimeout(() => input.focus(), 100);
}

function closeMobileSearch() {
  const overlay = document.getElementById("mobileSearchOverlay");
  overlay.classList.remove("open");
  document.body.style.overflow = "";

  setTimeout(() => {
    if (!overlay.classList.contains("open")) {
      overlay.style.display = "none";
    }
  }, 300);
}

function renderMobileStars(n, max = 10) {
  if (n === null || n === undefined)
    return '<span class="msc-stars" style="color:var(--text-muted)">—</span>';
  let html = '<span class="msc-stars">';
  for (let i = 1; i <= max; i++) {
    html +=
      i <= n
        ? '<i class="fa-solid fa-star"></i>'
        : '<span class="empty"><i class="fa-solid fa-star"></i></span>';
  }
  html += ` <span style="color:var(--text-muted);font-size:0.7rem">${n}/10</span></span>`;
  return html;
}

let mobileSearchTimeout;

function setupMobileSearch() {
  const input = document.getElementById("mobileSearchInput");
  const results = document.getElementById("mobileSearchResults");

  if (!input || !results) return;

  function performMobileSearch() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      results.innerHTML = `<div class="mobile-search-placeholder">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>Type to search your anime list</p>
      </div>`;
      return;
    }

    const allAnime = [];
    document.querySelectorAll(".category-panel").forEach((panel) => {
      if (panel._animeData) {
        panel._animeData.forEach((a) => {
          allAnime.push({ ...a, catId: panel.dataset.catId });
        });
      }
    });

    if (allAnime.length === 0) {
      results.innerHTML = `<div class="mobile-search-no-results">
        <i class="fa-solid fa-database"></i>
        <p>No data loaded yet</p>
      </div>`;
      return;
    }

    const matches = allAnime.filter((a) => {
      const nameMatch = a.name && a.name.toLowerCase().includes(q);
      const enMatch =
        a.title_english && a.title_english.toLowerCase().includes(q);
      const malMatch = a.mal_title && a.mal_title.toLowerCase().includes(q);
      return nameMatch || enMatch || malMatch;
    });

    if (matches.length === 0) {
      results.innerHTML = `<div class="mobile-search-no-results">
        <i class="fa-solid fa-face-sad-tear"></i>
        <p>No matches found for "${input.value.trim()}"</p>
      </div>`;
      return;
    }

    results.innerHTML = matches
      .slice(0, 20)
      .map((r) => {
        const thumbHtml = r.thumbnail_url
          ? `<img src="${r.thumbnail_url}" alt="" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="msc-placeholder">N/A</div>`;

        const langHtml = r.language
          ? r.language
              .split(",")
              .map((l) => `<span class="lang-badge">${l.trim()}</span>`)
              .join("")
          : '<span style="color:var(--text-muted);font-size:0.75rem">—</span>';

        return `<div class="mobile-search-card" data-id="${r.id}" data-cat-id="${r.catId}">
          ${thumbHtml}
          <div class="msc-info">
            <div class="msc-title">${r.name.replace(/"/g, "&quot;")}</div>
            <div class="msc-meta">
              ${langHtml}
            </div>
            <div style="margin-top:4px">${renderMobileStars(r.stars)}</div>
          </div>
        </div>`;
      })
      .join("");

    results.querySelectorAll(".mobile-search-card").forEach((card) => {
      card.addEventListener("click", () => {
        const catId = card.dataset.catId;
        const animeId = card.dataset.id;

        closeMobileSearch();

        if (currentCategoryId !== catId) {
          switchTab(catId);
        }

        setTimeout(() => {
          const row = document.querySelector(`tr[data-id="${animeId}"]`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.remove("highlighted-row");
            void row.offsetWidth;
            row.classList.add("highlighted-row");
            setTimeout(() => row.classList.remove("highlighted-row"), 2000);
          }
        }, 150);
      });
    });
  }

  input.addEventListener("input", () => {
    clearTimeout(mobileSearchTimeout);
    mobileSearchTimeout = setTimeout(performMobileSearch, 200);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 2) {
      performMobileSearch();
    }
  });
}

let importSelectedFile = null;

function openImportModal() {
  importSelectedFile = null;
  document.getElementById("dropZone").style.display = "";
  document.getElementById("importFileInfo").style.display = "none";
  document.getElementById("importProgress").style.display = "none";
  document.getElementById("importUploadBtn").disabled = true;
  document.getElementById("autoFetchToggle").checked = false;
  document.getElementById("importFileInput").value = "";
  document.getElementById("importModalOverlay").classList.add("open");
}

function closeImportModal() {
  document.getElementById("importModalOverlay").classList.remove("open");
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("dropZone").classList.add("dragover");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("dropZone").classList.remove("dragover");
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById("dropZone").classList.remove("dragover");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.name.endsWith(".ods")) {
      setImportFile(file);
    } else {
      showToast("Only .ods files are supported");
    }
  }
}

function handleFileSelect(input) {
  if (input.files.length > 0) {
    setImportFile(input.files[0]);
  }
}

function setImportFile(file) {
  importSelectedFile = file;
  document.getElementById("dropZone").style.display = "none";
  document.getElementById("importFileInfo").style.display = "flex";
  document.getElementById("importFileName").textContent = file.name;
  document.getElementById("importUploadBtn").disabled = false;
}

function clearImportFile() {
  importSelectedFile = null;
  document.getElementById("dropZone").style.display = "";
  document.getElementById("importFileInfo").style.display = "none";
  document.getElementById("importUploadBtn").disabled = true;
  document.getElementById("importFileInput").value = "";
}

async function uploadImportFile() {
  if (!importSelectedFile) return;

  const autoFetch = document.getElementById("autoFetchToggle").checked;
  const uploadBtn = document.getElementById("importUploadBtn");
  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading…";

  const formData = new FormData();
  formData.append("file", importSelectedFile);
  formData.append("auto_fetch", autoFetch ? "true" : "false");

  try {
    const resp = await fetch("/api/import-ods/", {
      method: "POST",
      body: formData,
    });
    const data = await resp.json();

    if (!resp.ok) {
      showToast(data.error || "Import failed");
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload";
      return;
    }

    if (data.task_id && data.thumbnails_needed > 0) {
      showToast(
        `Imported ${data.imported} anime! Fetching ${data.thumbnails_needed} thumbnails…`,
      );
      showFetchProgressOverlay();
      pollThumbnailStatus();
    } else {
      showToast(`Imported ${data.imported} anime!`);
      location.reload();
    }
  } catch (e) {
    showToast("Upload failed: " + e.message);
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload";
  }
}

function showFetchProgressOverlay() {
  document.getElementById("importModalOverlay").classList.add("open");
  document.getElementById("dropZone").style.display = "none";
  document.getElementById("importFileInfo").style.display = "none";
  document.getElementById("importProgress").style.display = "block";
  document.getElementById("importUploadBtn").style.display = "none";
}

let _pollTimer = null;

function pollThumbnailStatus() {
  if (_pollTimer) clearInterval(_pollTimer);

  const progressFill = document.getElementById("progressBarFill");
  const progressCount = document.getElementById("progressCount");
  const progressText = document.getElementById("progressText");

  _pollTimer = setInterval(async () => {
    try {
      const resp = await fetch("/api/thumbnail-fetch-status/");
      const info = await resp.json();

      if (!info.active) {
        clearInterval(_pollTimer);
        _pollTimer = null;
        progressFill.style.width = "100%";
        progressText.textContent = "Done! Reloading…";
        setTimeout(() => location.reload(), 1000);
        return;
      }

      const pct =
        info.total > 0 ? Math.round((info.current / info.total) * 100) : 0;
      progressFill.style.width = pct + "%";
      progressCount.textContent = `${info.current} / ${info.total}`;
      progressText.textContent = info.current_name
        ? `${pct}% — ${info.current_name}`
        : `${pct}% complete`;

      if (info.done) {
        clearInterval(_pollTimer);
        _pollTimer = null;
        progressFill.style.width = "100%";
        progressText.textContent = "Done! Reloading…";
        setTimeout(() => location.reload(), 1000);
      }
    } catch {}
  }, 3000);
}

async function checkActiveFetchTask() {
  try {
    const resp = await fetch("/api/thumbnail-fetch-status/");
    const info = await resp.json();
    if (info.active && !info.done) {
      showFetchProgressOverlay();
      pollThumbnailStatus();
    }
  } catch {}
}

function exportOds() {
  window.location.href = "/api/export-ods/";
}

document.addEventListener("DOMContentLoaded", () => {
  setupAutocomplete();
  setupLocalSearch();
  setupMobileSearch();
  setupInteractiveStars();

  checkActiveFetchTask();

  const firstTab = document.querySelector(".tab");
  if (firstTab) {
    switchTab(firstTab.dataset.catId);
    loadCategory(firstTab.dataset.catId);
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.catId);
      loadCategory(tab.dataset.catId);
    });
  });

  const tabsBar = document.querySelector(".tabs-bar");
  if (tabsBar) {
    Sortable.create(tabsBar, {
      animation: 150,
      filter: ".edit-cat-btn",
      onEnd: async function (evt) {
        if (evt.oldIndex === evt.newIndex) return;

        const tabWrappers = tabsBar.querySelectorAll(".tab-wrapper");
        const categoryIds = Array.from(tabWrappers).map((w) =>
          parseInt(w.dataset.catId, 10),
        );

        try {
          await fetch("/api/category/reorder/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category_ids: categoryIds }),
          });
        } catch (e) {
          console.error("Failed to reorder categories", e);
          showToast("Failed to save category order.");
        }
      },
    });
  }

  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const headerActions = document.getElementById("headerActions");
  if (mobileMenuBtn && headerActions) {
    mobileMenuBtn.addEventListener("click", () => {
      headerActions.classList.toggle("show");
    });
  }

  document.querySelectorAll(".category-panel").forEach((panel) => {
    const catId = panel.dataset.catId;
    if (catId && catId !== (firstTab && firstTab.dataset.catId)) {
      loadCategory(catId);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var mobileOverlay = document.getElementById("mobileSearchOverlay");
      if (mobileOverlay && mobileOverlay.classList.contains("open")) {
        closeMobileSearch();
        return;
      }

      var catOverlay = document.getElementById("categoryModalOverlay");
      if (catOverlay && catOverlay.classList.contains("open")) {
        closeCategoryModal();
      }
    }
  });

  var catOverlay = document.getElementById("categoryModalOverlay");
  if (catOverlay) {
    catOverlay.addEventListener("click", function (e) {
      if (e.target === catOverlay) {
        closeCategoryModal();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var shareOverlay = document.getElementById("shareModalOverlay");
      if (shareOverlay && shareOverlay.classList.contains("open")) {
        closeShareModal();
      }
    }
  });

  var shareOverlay = document.getElementById("shareModalOverlay");
  if (shareOverlay) {
    shareOverlay.addEventListener("click", function (e) {
      if (e.target === shareOverlay) {
        closeShareModal();
      }
    });
  }
});

function openShareModal() {
  document.getElementById("shareModalOverlay").classList.add("open");
  fetch("/api/share/status/")
    .then((res) => res.json())
    .then((data) => {
      const toggle = document.getElementById("shareToggleInput");
      const linkContainer = document.getElementById("shareLinkContainer");
      const linkInput = document.getElementById("shareLinkInput");

      if (data.error) {
        showToast("Error getting share status");
        return;
      }

      toggle.checked = data.is_enabled;
      linkInput.value = data.share_url;
      linkContainer.style.display = data.is_enabled ? "block" : "none";
    })
    .catch((err) => showToast("Error connecting to server"));
}

function closeShareModal() {
  document.getElementById("shareModalOverlay").classList.remove("open");
}

function toggleShareState(isEnabled) {
  fetch("/api/share/toggle/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_enabled: isEnabled }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        showToast("Error toggling share state");
        document.getElementById("shareToggleInput").checked = !isEnabled;
        return;
      }
      document.getElementById("shareLinkInput").value = data.share_url;
      document.getElementById("shareLinkContainer").style.display =
        data.is_enabled ? "block" : "none";
      showToast(data.is_enabled ? "Sharing enabled" : "Sharing disabled");
    })
    .catch((err) => {
      showToast("Error connecting to server");
      document.getElementById("shareToggleInput").checked = !isEnabled;
    });
}

function copyShareLink() {
  const lnk = document.getElementById("shareLinkInput");
  lnk.select();
  lnk.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(lnk.value);
  showToast("Link copied to clipboard!");
}
