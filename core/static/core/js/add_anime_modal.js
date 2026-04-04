/**
 * Add Anime Modal — uses AnimeModalBase for shared UI logic.
 * Handles POST to create new anime in a category.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    /* ── helpers: category gate ── */
    function hasCategories() {
      return document.querySelectorAll(".category_tab").length > 0;
    }

    function updateAddAnimeButtonState() {
      const disabled = !hasCategories();
      const deskBtn = document.querySelector(".btn_add_anime");
      const mobBtn = document.getElementById("m_fab_add_anime");
      if (deskBtn) {
        deskBtn.classList.toggle("btn_add_anime_disabled", disabled);
      }
      if (mobBtn) {
        mobBtn.classList.toggle("m_fab_option_disabled", disabled);
      }
    }
    window.updateAddAnimeButtonState = updateAddAnimeButtonState;
    updateAddAnimeButtonState();

    /* ── create modal via shared base ── */
    const modal = window.AnimeModalBase({
      title: "Add Anime",
      saveBtnText: "Save",
      showDeleteBtn: false,

      onSave: async (payload, catId, ctx) => {
        const tempId = window.SyncQueue.generateTempId();

        // Optimistic UI Data preparation
        const optimisticData = { ...payload };
        optimisticData.id = tempId;
        optimisticData.temp_id = tempId;
        if (!optimisticData.seasons) optimisticData.seasons = [];

        const action = {
          type: "CREATE",
          temp_id: tempId,
          data: { ...payload, category_id: parseInt(catId, 10) },
        };

        window.SyncQueue.pushAction(action);
        ctx.close();

        if (typeof window.addLocalAnime === "function") {
          window.addLocalAnime(optimisticData);
        } else if (typeof window.refreshCurrentCategory === "function") {
          window.refreshCurrentCategory();
        }

        ctx.showToast(`"${payload.name}" added`);
      },
    });

    /* ── open triggers ── */
    function openAdd() {
      if (!hasCategories()) {
        modal.showToast("Please create a category first");
        return;
      }
      modal.open();
    }

    document
      .querySelector(".btn_add_anime")
      ?.addEventListener("click", openAdd);
    document
      .getElementById("m_fab_add_anime")
      ?.addEventListener("click", () => {
        const container = document.getElementById("m_fab_container");
        if (container) container.classList.remove("m_fab_open");
        openAdd();
      });
  });
})();
