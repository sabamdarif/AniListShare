/**
 * Edit Anime Modal — uses AnimeModalBase for shared UI logic.
 * Handles PUT to update and DELETE to remove anime.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    /* ── create modal via shared base ── */
    const modal = window.AnimeModalBase({
      title: "Edit Anime",
      saveBtnText: "Update",
      showDeleteBtn: true,

      onSave: async (payload, catId, ctx) => {
        const animeId = ctx.animeId;
        const oldCatId = ctx.oldCategoryId || catId;
        if (!animeId) throw new Error("No anime selected");

        const targetCatId = parseInt(catId, 10);
        const action = {
          type: "UPDATE",
          data: { ...payload, category_id: targetCatId },
        };

        // determine if this was a temp anime
        if (typeof animeId === "string" && animeId.startsWith("temp_")) {
          action.temp_id = animeId;
        } else {
          action.id = parseInt(animeId, 10);
        }

        window.SyncQueue.pushAction(action);
        ctx.close();

        const optimisticData = { ...payload, id: animeId };
        if (action.temp_id) optimisticData.temp_id = action.temp_id;

        if (oldCatId != targetCatId) {
          if (typeof window.removeLocalAnime === "function") {
            window.removeLocalAnime(animeId);
          } else if (typeof window.refreshCurrentCategory === "function") {
            window.refreshCurrentCategory();
          }
        } else {
          if (typeof window.updateLocalAnime === "function") {
            window.updateLocalAnime(optimisticData);
          } else if (typeof window.refreshCurrentCategory === "function") {
            window.refreshCurrentCategory();
          }
        }

        ctx.showToast(`"${payload.name}" updated`);
      },

      onDelete: async (animeId, catId, ctx) => {
        const action = { type: "DELETE" };
        if (typeof animeId === "string" && animeId.startsWith("temp_")) {
          action.temp_id = animeId;
        } else {
          action.id = parseInt(animeId, 10);
        }

        window.SyncQueue.pushAction(action);
        ctx.close();

        if (typeof window.removeLocalAnime === "function") {
          window.removeLocalAnime(animeId);
        } else if (typeof window.refreshCurrentCategory === "function") {
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
