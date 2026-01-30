export function setupSidebarGroups(options = {}) {
  const root = options.root instanceof Element ? options.root : document;
  const groups = Array.from(root.querySelectorAll("[data-sidebar-group]"));

  if (groups.length === 0) {
    return;
  }

  const applyState = (group, expanded) => {
    const toggle = group.querySelector(".sidebar__group-toggle");
    const list = group.querySelector(".sidebar__group-list");
    const caret = toggle?.querySelector("[data-sidebar-caret]");

    if (!toggle || !list) {
      return;
    }

    toggle.setAttribute("aria-expanded", String(expanded));
    list.hidden = !expanded;

    if (caret) {
      const openSrc = caret.dataset.openSrc;
      const closedSrc = caret.dataset.closedSrc;
      if (openSrc && closedSrc) {
        caret.src = expanded ? openSrc : closedSrc;
      }
    }
  };

  groups.forEach((group) => {
    const toggle = group.querySelector(".sidebar__group-toggle");
    if (!toggle) {
      return;
    }
    const expanded = toggle.getAttribute("aria-expanded") !== "false";
    applyState(group, expanded);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const toggle = target.closest(".sidebar__group-toggle");
    if (!toggle) {
      return;
    }
    const group = toggle.closest("[data-sidebar-group]");
    if (!group) {
      return;
    }
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    applyState(group, expanded);
  });
}
