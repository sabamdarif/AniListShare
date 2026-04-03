/**
 * Edit Anime Modal — uses AnimeModalBase for shared UI logic.
 * Handles PUT to update and DELETE to remove anime.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "/api/anime/list/category/";

    /* ── create modal via shared base ── */
    const modal = window.AnimeModalBase({
      title: "Edit Anime",
      saveBtnText: "Update",
      showDeleteBtn: true,

      onSave: async (payload, catId, ctx) => {
        const animeId = ctx.animeId;
        if (!animeId) throw new Error("No anime selected");

        const resp = await apiFetch(
          `${API_BASE}${encodeURIComponent(catId)}/${encodeURIComponent(animeId)}/`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          let msg = "Update failed";
          if (data) {
            if (data.detail) {
              msg = data.detail;
            } else if (data.non_field_errors) {
              msg = data.non_field_errors.join(", ");
            } else {
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

        ctx.close();

        if (typeof window.refreshCurrentCategory === "function") {
          window.refreshCurrentCategory();
        }

        ctx.showToast(`"${payload.name}" updated`);
      },

      onDelete: async (animeId, catId, ctx) => {
        const resp = await apiFetch(
          `${API_BASE}${encodeURIComponent(catId)}/${encodeURIComponent(animeId)}/`,
          {
            method: "DELETE",
            credentials: "same-origin",
            headers: {},
          },
        );

        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error((data && data.detail) || "Delete failed");
        }

        ctx.close();

        if (typeof window.refreshCurrentCategory === "function") {
          window.refreshCurrentCategory();
        }

        ctx.showToast("Anime deleted");
      },
    });

    /* ── expose edit opener globally ── */
    window.openEditAnimeModal = function (animeData, categoryId) {
      const prefill = Object.assign({}, animeData, {
        _categoryId: categoryId,
      });
      modal.open(prefill);
    };
  });
})();
