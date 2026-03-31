(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    function getCSRF() {
      const el = document.querySelector("[name=csrfmiddlewaretoken]");
      if (el) return el.value;
      const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : "";
    }
    const CSRF = getCSRF();

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
      deleteBtn.disabled = true;
      try {
        const r = await fetch("/api/edit-category/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CSRF,
          },
          body: JSON.stringify({ category_id: editingCategoryId, name }),
        });
        const j = await r.json();
        if (!r.ok) {
          errorEl.textContent = j.error || "Save failed";
          return;
        }
        close();
        location.reload();
      } catch {
        errorEl.textContent = "Network error";
      } finally {
        saveBtn.disabled = false;
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

      try {
        const r = await fetch("/api/delete-category/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": CSRF,
          },
          body: JSON.stringify({ category_id: editingCategoryId }),
        });
        const j = await r.json();
        if (!r.ok) {
          errorEl.textContent = j.error || "Delete failed";
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
