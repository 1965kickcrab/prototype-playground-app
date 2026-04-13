export function setupServiceSwitcher(root = document) {
  const trigger = root.querySelector("[data-service-switch-open]");
  const menu = root.querySelector("[data-service-switch-menu]");
  if (!(trigger instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
    return null;
  }

  const closeMenu = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };

  const toggleMenu = () => {
    if (menu.hidden) {
      openMenu();
      return;
    }
    closeMenu();
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    toggleMenu();
  });

  menu.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-service-switch-href]")
      : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const href = String(target.dataset.serviceSwitchHref || "").trim();
    closeMenu();
    if (href) {
      window.location.href = href;
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target) {
      return;
    }
    if (trigger.contains(target) || menu.contains(target)) {
      return;
    }
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  return {
    openMenu,
    closeMenu,
  };
}
