import { initOperationsStorage } from "../../storage/operations-storage.js";
import { initHotelOperationsStorage } from "../../storage/hotel-operations-storage.js";
import { setupSidebarGroups } from "../../utils/sidebar-groups.js";
import { POLICY_SECTIONS } from "../../config/policy-sections.js";
import {
  applyOpenDaySelection,
  applyOpenSettings,
  applyOpenToggleState,
  applyPolicy,
  getPolicySectionElements,
  getSelectedPolicyType,
  readOpenSettings,
  readPolicy,
  setActivePolicyType,
} from "../../components/policy-form.js";
import { getPoliciesSignature, normalizeDaysValue } from "../../services/policy-utils.js";

function getPoliciesFromForm(sectionMap) {
  return POLICY_SECTIONS.reduce((acc, section) => {
    acc[section.key] = readPolicy(sectionMap.get(section.section));
    return acc;
  }, {});
}

function setupPolicyPage() {
  setupSidebarGroups();
  const isHotel = document.body?.dataset?.settingsScope === "hotel";
  const storage = isHotel ? initHotelOperationsStorage() : initOperationsStorage();
  const page = document.querySelector("[data-policy-page]");
  const saveButton = document.querySelector("[data-policy-save]");

  if (!page || !saveButton) {
    return;
  }

  const saveBar = saveButton.closest(".settings-save");
  const openToggle = page.querySelector("[data-policy-open-toggle]");
  const openBody = page.querySelector("[data-policy-open-body]");
  const sectionMap = new Map();

  POLICY_SECTIONS.forEach((section) => {
    sectionMap.set(section.section, getPolicySectionElements(section.section));
  });

  let initialSignature = "";

  const applySettings = () => {
    const settings = storage.loadSettings();
    POLICY_SECTIONS.forEach((section) => {
      const elements = sectionMap.get(section.section);
      applyPolicy(elements, settings[section.key]);
    });
    applyOpenSettings(openToggle, openBody, settings);
    initialSignature = getPoliciesSignature({
      reservationPolicy: settings.reservationPolicy,
      cancellationPolicy: settings.cancellationPolicy,
      reservationOpen: settings.reservationOpen,
    });
    saveBar?.classList.remove("settings-save--visible");
  };

  const updateDirtyState = () => {
    const policies = getPoliciesFromForm(sectionMap);
    const currentSignature = getPoliciesSignature({
      ...policies,
      reservationOpen: readOpenSettings(openToggle, openBody),
    });
    saveBar?.classList.toggle("settings-save--visible", currentSignature !== initialSignature);
  };

  page.addEventListener("change", (event) => {
    const target = event.target;
    if (target === openToggle) {
      applyOpenToggleState(openToggle, openBody);
      updateDirtyState();
      return;
    }
    if (target instanceof HTMLSelectElement) {
      updateDirtyState();
      return;
    }
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.matches("[data-policy-type]")) {
      updateDirtyState();
      return;
    }
    const sectionRoot = target.closest("[data-policy-section]");
    const sectionName = sectionRoot?.getAttribute("data-policy-section");
    const elements = sectionName ? sectionMap.get(sectionName) : null;
    if (!elements) {
      return;
    }
    setActivePolicyType(elements, target.value);
    if (target.value === "days") {
      elements.daysInput?.focus();
    }
    updateDirtyState();
  });

  page.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const sectionRoot = target.closest("[data-policy-section]");
    const sectionName = sectionRoot?.getAttribute("data-policy-section");
    const elements = sectionName ? sectionMap.get(sectionName) : null;

    if (target.matches("[data-policy-days]")) {
      if (elements && getSelectedPolicyType(elements) !== "days") {
        setActivePolicyType(elements, "days");
      }
      const normalized = normalizeDaysValue(target.value);
      target.value = normalized ? String(normalized) : "";
    }

    updateDirtyState();
  });

  page.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-policy-open-day]")
      : null;
    if (!target) {
      return;
    }
    applyOpenDaySelection(openBody, target);
    updateDirtyState();
  });

  saveButton.addEventListener("click", () => {
    const settings = storage.loadSettings();
    const policies = getPoliciesFromForm(sectionMap);
    const openSettings = readOpenSettings(openToggle, openBody);
    settings.reservationPolicy = policies.reservationPolicy;
    settings.cancellationPolicy = policies.cancellationPolicy;
    settings.reservationOpen = openSettings;
    const saved = storage.saveSettings(settings);
    initialSignature = getPoliciesSignature({
      reservationPolicy: saved.reservationPolicy,
      cancellationPolicy: saved.cancellationPolicy,
      reservationOpen: saved.reservationOpen,
    });
    saveBar?.classList.remove("settings-save--visible");
  });

  applySettings();
  applyOpenToggleState(openToggle, openBody);
}

document.addEventListener("DOMContentLoaded", () => {
  setupPolicyPage();
});