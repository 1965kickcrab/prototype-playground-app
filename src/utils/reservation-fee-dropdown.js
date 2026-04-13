function switchTab(tabButton, onTabChanged) {
  const tabGroup = tabButton.closest(".reservation-fee-tabs");
  const tabValue = tabButton.dataset.feeTab || "";
  if (!tabGroup || !tabValue) {
    return false;
  }

  tabGroup.querySelectorAll("[data-fee-tab]").forEach((button) => {
    const isActive = button === tabButton;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  const scope = tabGroup.closest(".reservation-fee-group__body") || tabGroup;
  scope.querySelectorAll("[data-fee-panel]").forEach((panel) => {
    const isActive = panel.dataset.feePanel === tabValue;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  if (typeof onTabChanged === "function") {
    onTabChanged(tabValue);
  }
  return true;
}

function toggleFold(target, bodySelector, arrowSelector, iconOpen, iconFold) {
  const container = target.closest(bodySelector === ".reservation-fee-group__body"
    ? ".reservation-fee-group"
    : ".reservation-fee-segment");
  const body = container?.querySelector(bodySelector);
  const arrow = target.querySelector(arrowSelector) || container?.querySelector(arrowSelector);
  if (!body) {
    return false;
  }
  const willOpen = body.hidden || body.hasAttribute("hidden");
  body.hidden = !willOpen;
  if (arrow && iconOpen && iconFold) {
    arrow.src = willOpen ? iconOpen : iconFold;
  }
  return true;
}

function resetDefaultState(root, iconOpen, iconFold) {
  const defaultTab = root.querySelector('[data-fee-tab="ticket"]');
  if (defaultTab instanceof HTMLElement) {
    switchTab(defaultTab);
  }

  root.querySelectorAll(".reservation-fee-group").forEach((group) => {
    const body = group.querySelector(".reservation-fee-group__body");
    const arrow = group.querySelector(".reservation-fee-group__arrow");
    if (body) {
      body.hidden = true;
    }
    if (arrow) {
      arrow.src = iconFold || iconOpen || arrow.src;
    }
  });

  root.querySelectorAll(".reservation-fee-segment").forEach((segment) => {
    const body = segment.querySelector(".reservation-fee-segment__body");
    const arrow = segment.querySelector(".reservation-fee-segment__arrow");
    if (body) {
      body.hidden = false;
    }
    if (arrow && iconOpen) {
      arrow.src = iconOpen;
    }
  });
}

export function setupReservationFeeDropdowns(root, options = {}) {
  if (!(root instanceof HTMLElement)) {
    return { reset: () => {} };
  }

  const iconOpen = options.iconOpen || "";
  const iconFold = options.iconFold || "";
  const onTabChanged = options.onTabChanged;

  if (root.dataset.feeDropdownBound === "true") {
    return {
      reset: () => resetDefaultState(root, iconOpen, iconFold),
    };
  }

  root.dataset.feeDropdownBound = "true";

  root.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }

    const tabButton = target.closest("[data-fee-tab]");
    if (tabButton && root.contains(tabButton)) {
      if (switchTab(tabButton, onTabChanged)) {
        return;
      }
    }

    const groupToggle = target.closest("[data-fee-group-toggle]");
    if (groupToggle && root.contains(groupToggle)) {
      if (toggleFold(groupToggle, ".reservation-fee-group__body", ".reservation-fee-group__arrow", iconOpen, iconFold)) {
        return;
      }
    }

    const segmentToggle = target.closest("[data-fee-toggle]");
    if (segmentToggle && root.contains(segmentToggle)) {
      toggleFold(segmentToggle, ".reservation-fee-segment__body", ".reservation-fee-segment__arrow", iconOpen, iconFold);
    }
  });

  return {
    reset: () => resetDefaultState(root, iconOpen, iconFold),
  };
}
