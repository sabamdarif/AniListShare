/**
 * Add Anime Modal — uses AnimeModalBase for shared UI logic.
 * Handles POST to create new anime in a category.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "/api/anime/list/category/";

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
        const resp = await apiFetch(
          `${API_BASE}${encodeURIComponent(catId)}/`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const data = await resp.json().catch(() => null);

        if (!resp.ok) {
          let msg = "Save failed";
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
