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
})();
