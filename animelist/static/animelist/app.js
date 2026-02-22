let currentCategoryId = null;

function switchTab(catId) {
    currentCategoryId = catId;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.catId == catId));
    document.querySelectorAll('.category-panel').forEach(p => p.classList.toggle('active', p.dataset.catId == catId));
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

function renderStars(n, max = 10) {
    if (n === null || n === undefined) return '<span class="stars-display text-muted">—</span>';
    let html = '<span class="stars-display">';
    for (let i = 1; i <= max; i++) {
        html += i <= n ? '★' : '<span class="empty">★</span>';
    }
    html += ` <span style="color:var(--text-muted);font-size:0.75rem">${n}/10</span></span>`;
    return html;
}

function buildSeasonBadges(seasons) {
    return seasons.map(s => {
        const c = s.comment ? ` data-comment="${s.comment.replace(/"/g, '&quot;')}"` : ' data-comment=""';
        return `<span class="season-badge"${c}>${s.label}</span>`;
    }).join('');
}

function buildTableRow(anime, idx) {
    const thumb = anime.thumbnail_url
        ? `<img class="thumb" src="${anime.thumbnail_url}" alt="" loading="lazy">`
        : `<div class="thumb-placeholder">N/A</div>`;
    return `<tr data-id="${anime.id}">
    <td class="col-num">${idx + 1}</td>
    <td class="col-thumb">${thumb}</td>
    <td class="col-name">${anime.name}</td>
    <td class="col-seasons">${buildSeasonBadges(anime.seasons)}</td>
    <td class="col-lang">${anime.language || '—'}</td>
    <td class="col-stars">${renderStars(anime.stars)}</td>
    <td class="col-actions">
      <div class="actions-cell">
        <button class="btn-icon" onclick="reorder(${anime.id},'up')" title="Move up">▲</button>
        <button class="btn-icon" onclick="reorder(${anime.id},'down')" title="Move down">▼</button>
        <button class="btn-icon" onclick="openEditModal(${anime.id})" title="Edit">✏️</button>
      </div>
    </td>
  </tr>`;
}

async function loadCategory(catId) {
    const panel = document.querySelector(`.category-panel[data-cat-id="${catId}"]`);
    const tbody = panel.querySelector('tbody');
    try {
        const resp = await fetch(`/api/anime/?category_id=${catId}`);
        const data = await resp.json();
        if (data.anime.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>No anime in this category yet</p></div></td></tr>`;
        } else {
            tbody.innerHTML = data.anime.map((a, i) => buildTableRow(a, i)).join('');
        }
        panel._animeData = data.anime;
    } catch {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>Failed to load</p></div></td></tr>`;
    }
}

async function reorder(animeId, direction) {
    await fetch('/api/anime/reorder/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anime_id: animeId, direction })
    });
    await loadCategory(currentCategoryId);
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Anime';
    document.getElementById('animeForm').reset();
    document.getElementById('animeIdField').value = '';
    document.getElementById('categorySelect').value = currentCategoryId || '';
    document.getElementById('seasonsContainer').innerHTML = '';
    document.getElementById('deleteSection').style.display = 'none';
    addSeasonRow();
    document.getElementById('modalOverlay').classList.add('open');
}

function openEditModal(animeId) {
    const panel = document.querySelector(`.category-panel[data-cat-id="${currentCategoryId}"]`);
    const anime = panel._animeData.find(a => a.id === animeId);
    if (!anime) return;

    document.getElementById('modalTitle').textContent = 'Edit Anime';
    document.getElementById('animeIdField').value = anime.id;
    document.getElementById('nameInput').value = anime.name;
    document.getElementById('thumbnailInput').value = anime.thumbnail_url || '';
    document.getElementById('malIdInput').value = anime.mal_id || '';
    document.getElementById('categorySelect').value = anime.category_id || currentCategoryId;
    document.getElementById('languageInput').value = anime.language || '';
    document.getElementById('starsInput').value = anime.stars !== null ? anime.stars : '';
    document.getElementById('reasonInput').value = anime.reason || '';

    const sc = document.getElementById('seasonsContainer');
    sc.innerHTML = '';
    if (anime.seasons.length > 0) {
        anime.seasons.forEach(s => addSeasonRow(s.label, s.comment));
    } else {
        addSeasonRow();
    }

    document.getElementById('deleteSection').style.display = 'block';
    document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('autocompleteResults').classList.remove('show');
}

function addSeasonRow(label = '', comment = '') {
    const sc = document.getElementById('seasonsContainer');
    const row = document.createElement('div');
    row.className = 'season-row';
    row.innerHTML = `
    <input type="text" class="form-input season-label" placeholder="e.g. S1, OVA" value="${label.replace(/"/g, '&quot;')}">
    <input type="text" class="form-input season-comment" placeholder="Comment (optional)" value="${comment.replace(/"/g, '&quot;')}">
    <button type="button" class="remove-season" onclick="this.parentElement.remove()">×</button>`;
    sc.appendChild(row);
}

async function saveAnime() {
    const id = document.getElementById('animeIdField').value;
    const seasons = [];
    document.querySelectorAll('.season-row').forEach(row => {
        const label = row.querySelector('.season-label').value.trim();
        const comment = row.querySelector('.season-comment').value.trim();
        if (label) seasons.push({ label, comment });
    });

    const starsVal = document.getElementById('starsInput').value;
    const body = {
        category_id: parseInt(document.getElementById('categorySelect').value),
        name: document.getElementById('nameInput').value.trim(),
        thumbnail_url: document.getElementById('thumbnailInput').value.trim(),
        mal_id: parseInt(document.getElementById('malIdInput').value) || null,
        language: document.getElementById('languageInput').value.trim(),
        stars: starsVal !== '' ? parseInt(starsVal) : null,
        reason: document.getElementById('reasonInput').value.trim(),
        seasons
    };

    if (!body.name) { showToast('Name is required'); return; }
    if (body.stars !== null && (body.stars < 0 || body.stars > 10)) { showToast('Stars must be 0-10'); return; }

    let url, method;
    if (id) {
        url = `/api/anime/${id}/`;
        method = 'PUT';
    } else {
        url = '/api/anime/create/';
        method = 'POST';
    }

    const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await resp.json();

    if (resp.ok) {
        closeModal();
        showToast(id ? 'Updated!' : 'Added!');
        await loadCategory(currentCategoryId);
    } else {
        showToast(data.error || 'Error');
    }
}

async function deleteAnime() {
    const id = document.getElementById('animeIdField').value;
    if (!id) return;
    if (!confirm('Delete this anime entry?')) return;

    const resp = await fetch(`/api/anime/${id}/delete/`, { method: 'DELETE' });
    if (resp.ok) {
        closeModal();
        showToast('Deleted');
        await loadCategory(currentCategoryId);
    }
}

async function addCategory() {
    const name = prompt('Category name:');
    if (!name || !name.trim()) return;

    const resp = await fetch('/api/category/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
    });
    if (resp.ok) {
        location.reload();
    }
}

let searchTimeout;
function setupAutocomplete() {
    const input = document.getElementById('nameInput');
    const results = document.getElementById('autocompleteResults');

    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = input.value.trim();
        if (q.length < 2) { results.classList.remove('show'); return; }
        searchTimeout = setTimeout(async () => {
            try {
                const resp = await fetch(`/api/mal-search/?q=${encodeURIComponent(q)}`);
                const data = await resp.json();
                if (data.results.length === 0) { results.classList.remove('show'); return; }
                results.innerHTML = data.results.map(r => `
          <div class="autocomplete-item" data-mal-id="${r.mal_id}" data-title="${(r.title || '').replace(/"/g, '&quot;')}" data-image="${r.image_url || ''}">
            <img src="${r.image_url || ''}" alt="" onerror="this.style.display='none'">
            <div class="ac-info">
              <div class="ac-title">${r.title}</div>
              <div class="ac-sub">${r.title_english ? r.title_english + ' · ' : ''}${r.type || ''} · ${r.episodes || '?'} eps</div>
            </div>
          </div>
        `).join('');
                results.classList.add('show');
                results.querySelectorAll('.autocomplete-item').forEach(item => {
                    item.addEventListener('click', () => {
                        input.value = item.dataset.title;
                        document.getElementById('thumbnailInput').value = item.dataset.image;
                        document.getElementById('malIdInput').value = item.dataset.malId;
                        results.classList.remove('show');
                    });
                });
            } catch { results.classList.remove('show'); }
        }, 400);
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.autocomplete-wrapper')) results.classList.remove('show');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupAutocomplete();
    const firstTab = document.querySelector('.tab');
    if (firstTab) {
        switchTab(firstTab.dataset.catId);
        loadCategory(firstTab.dataset.catId);
    }
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.catId);
            loadCategory(tab.dataset.catId);
        });
    });
});
