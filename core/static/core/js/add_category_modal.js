(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    /* ── build modal DOM ── */
    function createModal() {
      const overlay = document.createElement("div");
      overlay.className = "acm_overlay";
      overlay.innerHTML = `
        <div class="acm_card">
          <div class="acm_header">
            <span class="acm_title">Add New Category</span>
            <button class="acm_close_btn" aria-label="Close">&times;</button>
          </div>
          <div class="acm_body">
            <div class="acm_section">
              <label class="acm_label" for="acm_name_input">Category Name</label>
              <input class="acm_name_input" id="acm_name_input" type="text"
                     placeholder="e.g., Favorites, Winter 2024" autocomplete="off">
            </div>
          </div>
          <div class="acm_footer">
            <span class="acm_error"></span>
            <button class="acm_cancel_btn">Cancel</button>
            <button class="acm_save_btn">Add Category</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      return overlay;
    }

    const OV = createModal();
    const $ = (s) => OV.querySelector(s);

    const nameInput = $(".acm_name_input");
    const errorEl = $(".acm_error");
    const saveBtn = $(".acm_save_btn");

    /* ── open / close ── */
    function open() {
      nameInput.value = "";
      errorEl.textContent = "";
      saveBtn.disabled = false;
      OV.style.display = "flex";
      requestAnimationFrame(() => OV.classList.add("acm_visible"));
      nameInput.focus();
    }

    function close() {
      OV.classList.remove("acm_visible");
      setTimeout(() => (OV.style.display = "none"), 250);
    }

    OV.style.display = "none";

    $(".acm_close_btn").addEventListener("click", close);
    $(".acm_cancel_btn").addEventListener("click", close);
    OV.addEventListener("click", (e) => {
      if (e.target === OV) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && OV.classList.contains("acm_visible")) {
        close();
      }
    });

    /* ── Hook up triggers ── */
    // Desktop header button
    document.querySelector(".btn_category")?.addEventListener("click", open);
    // Mobile FAB option
    document
      .getElementById("m_fab_add_category")
      ?.addEventListener("click", () => {
        closeFab();
        open();
      });

    /* ── Close mobile FAB helper ── */
    function closeFab() {
      const container = document.getElementById("m_fab_container");
      if (container) container.classList.remove("m_fab_open");
    }

    /* ── Save ── */
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
      try {
        const r = await apiFetch("/api/anime/category/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          // DRF field errors: {name: ["error"]} or {detail: "error"}
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
        // Set localStorage to new category so it becomes active after reload
        if (j && j.id) {
          try {
            localStorage.setItem("active_category", String(j.id));
          } catch (e) {}
        }
        location.reload();
      } catch {
        errorEl.textContent = "Network error";
      } finally {
        saveBtn.disabled = false;
        saveBtn.classList.remove("btn_loading");
        saveBtn.textContent = "Add Category";
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
