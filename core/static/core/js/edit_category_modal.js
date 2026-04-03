(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    let editingCategoryId = null;

    /* ── build modal DOM ── */
    function createModal() {
      const overlay = document.createElement("div");
      overlay.className = "acm_overlay"; // Reuse add category style
      overlay.innerHTML = `
        <div class="acm_card">
          <div class="acm_header">
            <span class="acm_title">Edit Category</span>
            <button class="acm_close_btn ecm_close_btn" aria-label="Close">&times;</button>
          </div>
          <div class="acm_body">
            <div class="acm_section">
              <label class="acm_label" for="ecm_name_input">Category Name</label>
              <input class="acm_name_input" id="ecm_name_input" type="text"
                     placeholder="e.g., Favorites, Winter 2024" autocomplete="off">
            </div>
          </div>
          <div class="acm_footer" style="justify-content: space-between;">
            <button class="acm_cancel_btn ecm_delete_btn" style="color: var(--danger); border-color: var(--danger); background: transparent;">Delete</button>
            <div style="display: flex; gap: 8px;">
              <span class="acm_error ecm_error"></span>
              <button class="acm_cancel_btn ecm_cancel_btn">Cancel</button>
              <button class="acm_save_btn ecm_save_btn">Save</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      return overlay;
    }

    const OV = createModal();
    const $ = (s) => OV.querySelector(s);

    const nameInput = $("#ecm_name_input");
    const errorEl = $(".ecm_error");
    const saveBtn = $(".ecm_save_btn");
    const deleteBtn = $(".ecm_delete_btn");

    /* ── open / close ── */
    function open(categoryId, currentName) {
      editingCategoryId = categoryId;
      nameInput.value = currentName;
      errorEl.textContent = "";
      saveBtn.disabled = false;
      deleteBtn.disabled = false;
      OV.style.display = "flex";
      requestAnimationFrame(() => OV.classList.add("acm_visible"));
      nameInput.focus();
    }

    function close() {
      OV.classList.remove("acm_visible");
      setTimeout(() => (OV.style.display = "none"), 250);
      editingCategoryId = null;
    }

    OV.style.display = "none";

    $(".ecm_close_btn").addEventListener("click", close);
    $(".ecm_cancel_btn").addEventListener("click", close);
    OV.addEventListener("click", (e) => {
      if (e.target === OV) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && OV.classList.contains("acm_visible")) {
        close();
      }
    });

    /* ── Event Triggers ── */

    // Desktop: Click Edit Icon
    document.querySelectorAll(".category_edit_btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent triggering tab select
        const categoryId = btn.getAttribute("data-category-id");
        const categoryName = btn.getAttribute("data-category-name");
        open(categoryId, categoryName);
      });
    });

    // Mobile: Long Press on Category Tab
    document.querySelectorAll(".category_tab_wrapper").forEach((wrapper) => {
      let pressTimer;
      const btn = wrapper.querySelector(".category_edit_btn");
      if (!btn) return;

      const categoryId = btn.getAttribute("data-category-id");
      const categoryName = btn.getAttribute("data-category-name");

      const clearTimer = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      wrapper.addEventListener(
        "touchstart",
        (e) => {
          clearTimer();
          pressTimer = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            open(categoryId, categoryName);
          }, 600); // 600ms long press
        },
        { passive: true },
      );

      wrapper.addEventListener("touchend", clearTimer);
      wrapper.addEventListener("touchmove", clearTimer);
      wrapper.addEventListener("touchcancel", clearTimer);

      // Also prevent native context menu on long press text selection
      wrapper.addEventListener("contextmenu", (e) => {
        if (window.innerWidth <= 768) {
          e.preventDefault();
        }
      });
    });

    /* ── Save (Edit) ── */
    saveBtn.addEventListener("click", async () => {
      errorEl.textContent = "";
      const name = nameInput.value.trim();
      if (!name) {
        errorEl.textContent = "Name is required";
        nameInput.focus();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.classList.add("btn_loading");
      saveBtn.innerHTML = '<span class="btn_spinner"></span> Saving\u2026';
      deleteBtn.disabled = true;
      try {
        const r = await apiFetch(
          `/api/anime/category/${encodeURIComponent(editingCategoryId)}/`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name }),
          },
        );
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          let msg = "Save failed";
          if (j) {
            if (j.detail) msg = j.detail;
            else if (j.name) msg = Array.isArray(j.name) ? j.name[0] : j.name;
            else if (j.non_field_errors) msg = j.non_field_errors[0];
          }
          errorEl.textContent = msg;
          return;
        }
        close();
        location.reload();
      } catch {
        errorEl.textContent = "Network error";
      } finally {
        saveBtn.disabled = false;
        saveBtn.classList.remove("btn_loading");
        saveBtn.textContent = "Save";
        deleteBtn.disabled = false;
      }
    });

    /* ── Delete ── */
    deleteBtn.addEventListener("click", async () => {
      if (
        !confirm(
          "Are you sure you want to delete this category and all its anime?",
        )
      )
        return;

      errorEl.textContent = "";
      saveBtn.disabled = true;
      deleteBtn.disabled = true;
      deleteBtn.classList.add("btn_loading");
      deleteBtn.innerHTML = '<span class="btn_spinner"></span> Deleting\u2026';

      try {
        const r = await apiFetch(
          `/api/anime/category/${encodeURIComponent(editingCategoryId)}/`,
          {
            method: "DELETE",
            headers: {},
          },
        );
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          errorEl.textContent = (j && j.detail) || "Delete failed";
          return;
        }
        close();
        // Clear active category if we deleted it
        try {
          if (
            localStorage.getItem("active_category") ===
            String(editingCategoryId)
          ) {
            localStorage.removeItem("active_category");
          }
        } catch (e) {}
        location.reload();
      } catch {
        errorEl.textContent = "Network error";
      } finally {
        saveBtn.disabled = false;
        deleteBtn.disabled = false;
        deleteBtn.classList.remove("btn_loading");
        deleteBtn.textContent = "Delete";
      }
    });

    /* ── Enter key submits ── */
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveBtn.click();
      }
    });
  });
})();
