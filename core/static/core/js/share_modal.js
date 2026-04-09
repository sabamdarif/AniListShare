/**
 * Share Modal — toggle public link and copy URL.
 */
(function () {
  "use strict";

  /* ── DOM refs ────────────────────────────────────── */
  var shareBtn = document.querySelector(".user_dropdown_item#share_btn");
  if (!shareBtn) return;

  /* ── Build modal markup ──────────────────────────── */
  var overlay = document.createElement("div");
  overlay.className = "share_modal_overlay";
  document.body.appendChild(overlay);

  var modal = document.createElement("div");
  modal.className = "share_modal";
  modal.innerHTML =
    '<div class="share_modal_header">' +
    '  <span class="share_modal_title">' +
    '    <i class="nf nf-md-share_all"></i> Share Your List' +
    "  </span>" +
    '  <button class="share_modal_close" aria-label="Close">' +
    '    <i class="nf nf-md-close"></i>' +
    "  </button>" +
    "</div>" +
    '<div class="share_modal_body">' +
    '  <div class="share_loading" id="share_loading">' +
    '    <div class="share_spinner"></div>' +
    "  </div>" +
    '  <div id="share_content" style="display:none">' +
    '    <div class="share_toggle_row">' +
    '      <div class="share_toggle_label">' +
    '        <span class="share_toggle_text">Enable Public Link</span>' +
    '        <span class="share_toggle_hint">Anyone with the link can view your list</span>' +
    "      </div>" +
    '      <label class="share_toggle_switch">' +
    '        <input type="checkbox" id="share_toggle_input">' +
    '        <span class="share_toggle_slider"></span>' +
    "      </label>" +
    "    </div>" +
    '    <div class="share_link_section" id="share_link_section">' +
    '      <div class="share_link_label">Your public link</div>' +
    '      <div class="share_link_box">' +
    '        <input class="share_link_url" id="share_link_url" readonly>' +
    '        <button class="share_copy_btn" id="share_copy_btn">' +
    '          <i class="nf nf-md-content_copy"></i> Copy' +
    "        </button>" +
    "      </div>" +
    "    </div>" +
    '    <div class="share_error" id="share_error" style="display:none"></div>' +
    "  </div>" +
    "</div>";
  document.body.appendChild(modal);

  var loading = document.getElementById("share_loading");
  var content = document.getElementById("share_content");
  var toggleInput = document.getElementById("share_toggle_input");
  var linkSection = document.getElementById("share_link_section");
  var linkUrl = document.getElementById("share_link_url");
  var copyBtn = document.getElementById("share_copy_btn");
  var errorEl = document.getElementById("share_error");
  var closeBtn = modal.querySelector(".share_modal_close");

  /* ── CSRF helper ─────────────────────────────────── */

  /* ── Open / Close ────────────────────────────────── */
  function openModal() {
    overlay.classList.add("open");
    modal.classList.add("open");
    fetchStatus();
  }

  function closeModal() {
    overlay.classList.remove("open");
    modal.classList.remove("open");
  }

  shareBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    // Close the dropdown first
    var dropdown = document.getElementById("user_dropdown_menu");
    if (dropdown) dropdown.classList.remove("open");
    openModal();
  });

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
  });

  /* ── API calls ───────────────────────────────────── */
  async function fetchStatus() {
    loading.style.display = "";
    content.style.display = "none";
    errorEl.style.display = "none";

    try {
      var res = await apiFetch("/api/v1/share/", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();

      toggleInput.checked = !!data.enabled;
      if (data.enabled) {
        linkUrl.value = data.url;
        linkSection.classList.add("visible");
      } else {
        linkSection.classList.remove("visible");
      }

      loading.style.display = "none";
      content.style.display = "";
    } catch (err) {
      loading.style.display = "none";
      content.style.display = "";
      errorEl.textContent = "Failed to load share status.";
      errorEl.style.display = "";
    }
  }

  async function toggleShare(enable) {
    toggleInput.disabled = true;
    errorEl.style.display = "none";

    try {
      var res = await apiFetch("/api/v1/share/", {
        method: enable ? "POST" : "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: enable ? JSON.stringify({}) : null,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();

      toggleInput.checked = !!data.enabled;
      if (data.enabled) {
        linkUrl.value = data.url;
        linkSection.classList.add("visible");
      } else {
        linkUrl.value = "";
        linkSection.classList.remove("visible");
      }
    } catch (err) {
      // Revert toggle on failure
      toggleInput.checked = !enable;
      errorEl.textContent = "Failed to update share settings.";
      errorEl.style.display = "";
    } finally {
      toggleInput.disabled = false;
    }
  }

  toggleInput.addEventListener("change", function () {
    toggleShare(this.checked);
  });

  /* ── Copy button ─────────────────────────────────── */
  copyBtn.addEventListener("click", function () {
    var url = linkUrl.value;
    if (!url) return;

    navigator.clipboard.writeText(url).then(function () {
      copyBtn.innerHTML = '<i class="nf nf-md-check"></i> Copied!';
      copyBtn.classList.add("copied");
      setTimeout(function () {
        copyBtn.innerHTML = '<i class="nf nf-md-content_copy"></i> Copy';
        copyBtn.classList.remove("copied");
      }, 2000);
    });
  });
})();
