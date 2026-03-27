// ── User profile dropdown toggle ──────────────────────────────────────────
(function () {
  const profileBtn = document.getElementById("user_profile_btn");
  const dropdownMenu = document.getElementById("user_dropdown_menu");

  if (!profileBtn || !dropdownMenu) return;

  function openMenu() {
    dropdownMenu.classList.add("open");
    profileBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    dropdownMenu.classList.remove("open");
    profileBtn.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    dropdownMenu.classList.contains("open") ? closeMenu() : openMenu();
  }

  profileBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener("click", function (e) {
    if (!dropdownMenu.contains(e.target) && e.target !== profileBtn) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  /* ── Logout: flush pending anime queue before navigating ── */
  const logoutBtn = dropdownMenu.querySelector(".user_dropdown_logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function (e) {
      if (window.AnimeSaveQueue && window.AnimeSaveQueue.hasPending()) {
        e.preventDefault();
        e.stopPropagation();
        logoutBtn.disabled = true;
        logoutBtn.querySelector("span").textContent = "Syncing…";
        try {
          await window.AnimeSaveQueue.flushNow();
        } catch {
          // If flush fails, use beacon as fallback
          window.AnimeSaveQueue.flushBeacon();
        }
        logoutBtn.disabled = false;
        logoutBtn.querySelector("span").textContent = "Logout";
        // Now proceed with logout (no URL yet, but when added it will work)
        // For now just reload which will trigger Django's default behavior
      }
    });
  }
})();
