import { normalizeDaysValue, normalizeOpenLength } from "../services/policy-utils.js";

export function getPolicySectionElements(section) {
  const root = document.querySelector(`[data-policy-section="${section}"]`);
  if (!root) {
    return null;
  }

  const typeButtons = Array.from(root.querySelectorAll("[data-policy-type]"));
  const optionButtons = Array.from(root.querySelectorAll(".policy-option"));
  const daysInput = root.querySelector("[data-policy-days]");
  const timeInput = root.querySelector("[data-policy-time]");
  const row = root.querySelector("[data-policy-row]");
  const daysGroup = root.querySelector("[data-policy-days-group]");

  return {
    root,
    typeButtons,
    optionButtons,
    daysInput,
    timeInput,
    row,
    daysGroup,
  };
}

export function getSelectedPolicyType(elements) {
  if (elements?.root?.dataset?.policyType) {
    return elements.root.dataset.policyType;
  }
  const selected = elements?.typeButtons?.find((input) => input.checked);
  return selected ? selected.value || "" : "";
}

export function updatePolicyDaysState(elements, type) {
  if (!elements?.daysInput) {
    return;
  }
  const isDays = type === "days";
  elements.daysInput.disabled = !isDays;
  elements.daysInput.setAttribute("aria-disabled", String(!isDays));
}

export function setActivePolicyType(elements, type) {
  if (!elements) {
    return;
  }
  elements.root.dataset.policyType = type;
  elements.typeButtons.forEach((button) => {
    button.checked = button.value === type;
  });
  elements.optionButtons?.forEach((option) => {
    const input = option.querySelector("[data-policy-type]");
    const isActive = input ? input.value === type : false;
    option.classList.toggle("is-active", isActive);
    option.classList.toggle("is-muted", !isActive);
  });
  updatePolicyDaysState(elements, type);
}

export function applyPolicy(elements, policy) {
  if (!elements) {
    return;
  }

  const typeValue = policy?.type === "days"
    ? "days"
    : policy?.days
      ? "days"
      : "same-day";

  setActivePolicyType(elements, typeValue);

  if (elements.daysInput) {
    elements.daysInput.value = policy?.days ? String(policy.days) : "";
  }

  if (elements.timeInput) {
    elements.timeInput.value = policy?.time || "";
  }

  updatePolicyDaysState(elements, typeValue);
}

export function readPolicy(elements) {
  if (!elements) {
    return {
      type: "",
      days: null,
      time: "",
    };
  }

  const type = getSelectedPolicyType(elements);
  const days = type === "days" ? normalizeDaysValue(elements.daysInput?.value) : null;
  const time = elements.timeInput?.value || "";

  return {
    type,
    days,
    time,
  };
}

export function readOpenSettings(openToggle, openBody) {
  const timeInput = openBody?.querySelector(".policy-open-time");
  const lengthInput = openBody?.querySelector(".policy-open-length input");
  const unitSelect = openBody?.querySelector(".policy-open-unit");
  const activeDay = openBody?.querySelector("[data-policy-open-day].is-selected");

  return {
    enabled: Boolean(openToggle?.checked),
    day: activeDay?.dataset?.policyOpenDay || "",
    time: timeInput?.value || "",
    length: normalizeOpenLength(lengthInput?.value),
    unit: unitSelect?.value || "",
  };
}

export function applyOpenSettings(openToggle, openBody, settings) {
  if (!openToggle || !openBody) {
    return;
  }

  const openSettings = settings?.reservationOpen || {};
  const buttons = Array.from(openBody.querySelectorAll("[data-policy-open-day]"));
  const timeInput = openBody.querySelector(".policy-open-time");
  const lengthInput = openBody.querySelector(".policy-open-length input");
  const unitSelect = openBody.querySelector(".policy-open-unit");

  openToggle.checked = Boolean(openSettings.enabled);

  buttons.forEach((button) => {
    const isSelected = openSettings.day
      ? button.dataset.policyOpenDay === openSettings.day
      : false;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  if (timeInput) {
    timeInput.value = openSettings.time || "";
  }
  if (lengthInput) {
    lengthInput.value = openSettings.length ? String(openSettings.length) : "";
  }
  if (unitSelect) {
    unitSelect.value = openSettings.unit || "";
  }
}

export function applyOpenToggleState(openToggle, openBody) {
  if (!openToggle || !openBody) {
    return;
  }
  const isEnabled = openToggle.checked;
  openBody.classList.toggle("is-disabled", !isEnabled);
  openBody.querySelectorAll("input, select, button").forEach((control) => {
    if (
      control instanceof HTMLInputElement
      || control instanceof HTMLSelectElement
      || control instanceof HTMLButtonElement
    ) {
      control.disabled = !isEnabled;
    }
  });
}

export function applyOpenDaySelection(openBody, target) {
  if (!openBody || !target) {
    return;
  }
  const buttons = Array.from(openBody.querySelectorAll("[data-policy-open-day]"));
  if (!buttons.includes(target)) {
    return;
  }
  const willSelect = !target.classList.contains("is-selected");
  buttons.forEach((button) => {
    const isActive = willSelect && button === target;
    button.classList.toggle("is-selected", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}
