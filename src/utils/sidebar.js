export function setupSidebarToggle(options = {}) {
  const app = document.querySelector(".app");
  const toggleButton = document.querySelector("[data-sidebar-toggle]");
  const toggleIcon = toggleButton?.querySelector("[data-sidebar-toggle-icon]");
  const iconOpen = options.iconOpen || "assets/menuIcon_sidebar_open.svg";
  const iconClose = options.iconClose || "assets/menuIcon_sidebar_close.svg";

  if (!app || !toggleButton) {
    return;
  }

  const updateLabel = () => {
    const collapsed = app.classList.contains("sidebar-collapsed");
    toggleButton.setAttribute("aria-expanded", String(!collapsed));
    toggleButton.setAttribute(
      "aria-label",
      collapsed ? "사이드바 열기" : "사이드바 숨기기"
    );

    if (toggleIcon) {
      toggleIcon.src = collapsed ? iconOpen : iconClose;
    }
  };

  toggleButton.addEventListener("click", () => {
    app.classList.toggle("sidebar-collapsed");
    updateLabel();
  });

  updateLabel();
}

