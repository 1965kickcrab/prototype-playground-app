import { MEMBERS } from "../../storage/members.js";
import { initClassStorage } from "../../storage/class-storage.js";
import { initHotelRoomStorage } from "../../storage/hotel-room-storage.js";
import { initOperationsStorage } from "../../storage/operations-storage.js";
import { initHotelOperationsStorage } from "../../storage/hotel-operations-storage.js";
import { initPricingStorage } from "../../storage/pricing-storage.js";
import { initReservationStorage } from "../../storage/reservation-storage.js";
import { initTicketStorage } from "../../storage/ticket-storage.js";
import {
  collectClassFormData,
  fillClassForm,
  renderMemberOptions,
  renderTicketOptions,
  resetClassForm,
  setActiveClassTab,
  syncRoomPricingExtraModeVisibility,
  toggleMemberSelection,
  toggleTicketSelection,
  updateMemberCount,
  updateMemberSelectAllState,
  updateTicketCount,
  updateTicketSelectAllState,
} from "../../components/class-form.js";
import {
  addClass,
  deleteClass,
  getDefaultClassType,
  setupClassList,
  updateClass,
} from "../../services/class-management.js";
import {
  buildRoomHotelingPricingItem,
  countRoomHotelingPricings,
  findRoomHotelingPricing,
  removeRoomHotelingPricing,
  upsertRoomHotelingPricing,
} from "../../services/room-pricing-sync.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketValidity,
} from "../../services/ticket-service.js";
import { formatNumericInputWithCommas } from "../../utils/number.js";

const SERVICE_TYPES = new Set(["school", "hoteling"]);
const ROOM_PRICING_DUPLICATE_MESSAGE =
  "해당 호실에 연결된 호텔링 요금이 2개 이상입니다. 요금표에서 정리 후 다시 시도해주세요.";
const SELECTION_SHEET_CONFIG = Object.freeze({
  members: {
    sectionSelector: "[data-class-members-section]",
    countSelector: "[data-class-member-count]",
    itemSelector: "[data-class-member]",
    idKey: "memberId",
    unitLabel: "마리",
  },
  tickets: {
    sectionSelector: "[data-class-tickets-section]",
    countSelector: "[data-class-ticket-count]",
    itemSelector: "[data-class-ticket]",
    idKey: "ticketId",
    unitLabel: "개",
  },
});

function normalizeType(value) {
  return SERVICE_TYPES.has(value) ? value : "school";
}

function getPageMode() {
  const mode = document.body?.dataset?.centerSettingsMode;
  return mode === "edit" ? "edit" : "create";
}

function getCurrentType() {
  return normalizeType(new URLSearchParams(window.location.search).get("type") || "school");
}

function getCurrentId() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

function getStorage(type) {
  return type === "hoteling" ? initHotelRoomStorage() : initClassStorage();
}

function getBackUrl(type) {
  return `./center.html?type=${encodeURIComponent(type)}`;
}

function getDetailUrl(type, id) {
  return `./center-settings-detail.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
}

function getTitle(type, mode) {
  const target = type === "hoteling" ? "호실" : "클래스";
  return `${target} ${mode === "create" ? "등록" : "수정"}`;
}

function getFormContext(type) {
  const isHotelScope = type === "hoteling";
  const storage = getStorage(type);
  const operationsStorage = isHotelScope ? initHotelOperationsStorage() : initOperationsStorage();
  const ticketStorage = initTicketStorage();
  const pricingStorage = initPricingStorage();
  return {
    isHotelScope,
    storage,
    reservationStorage: isHotelScope ? null : initReservationStorage(),
    operationsSettings: operationsStorage.loadSettings(),
    ticketStorage,
    tickets: ticketStorage.ensureDefaults(),
    pricingStorage,
    pricingItems: pricingStorage.loadPricingItems(),
    config: {
      isHotelScope,
      defaultClassType: getDefaultClassType(isHotelScope),
    },
  };
}

function stripPricing(data) {
  const next = { ...data };
  if ("pricing" in next) {
    delete next.pricing;
  }
  return next;
}

function saveRoomPricing(context, roomId, pricingInput) {
  const existingItem = findRoomHotelingPricing(context.pricingItems, roomId);
  const nextPricingItem = buildRoomHotelingPricingItem({
    existingItem,
    roomId,
    pricingInput,
  });
  const nextItems = upsertRoomHotelingPricing(context.pricingItems, roomId, nextPricingItem);
  context.pricingStorage.savePricingItems(nextItems);
  context.pricingItems = nextItems;
}

function getSelectionBackdrop(form) {
  let backdrop = document.querySelector("[data-center-settings-selection-backdrop]");
  if (backdrop instanceof HTMLElement) {
    return backdrop;
  }
  backdrop = document.createElement("div");
  backdrop.className = "center-settings-selection-backdrop";
  backdrop.dataset.centerSettingsSelectionBackdrop = "";
  backdrop.hidden = true;
  form.after(backdrop);
  return backdrop;
}

function closeSelectionSheet(form, restoreSelection = true) {
  form.querySelectorAll(".settings-selection-stack.is-sheet-open").forEach((stack) => {
    const section = stack.closest("[data-class-members-section], [data-class-tickets-section]");
    const config = getSelectionSheetConfig(section);
    if (restoreSelection) {
      restoreSelectionSheetSelection(form, section, config);
    }
    stack.classList.remove("is-sheet-open");
  });
  const backdrop = document.querySelector("[data-center-settings-selection-backdrop]");
  if (backdrop instanceof HTMLElement) {
    backdrop.hidden = true;
  }
}

function openSelectionSheet(form, section) {
  const stack = section?.querySelector(".settings-selection-stack");
  if (!(stack instanceof HTMLElement)) {
    return;
  }
  syncSelectionSheetState(form);
  closeSelectionSheet(form);
  const config = getSelectionSheetConfig(section);
  const count = getSelectionCountElement(section, config);
  if (count instanceof HTMLElement) {
    section.dataset.selectionCommittedCount = count.textContent || "";
  }
  section.dataset.selectionCommittedIds = JSON.stringify(getSelectedSelectionIds(section, config));
  stack.classList.add("is-sheet-open");
  getSelectionBackdrop(form).hidden = false;
}

function getSelectionSheetConfig(section) {
  if (!(section instanceof HTMLElement)) {
    return null;
  }
  if (section.matches(SELECTION_SHEET_CONFIG.members.sectionSelector)) {
    return SELECTION_SHEET_CONFIG.members;
  }
  if (section.matches(SELECTION_SHEET_CONFIG.tickets.sectionSelector)) {
    return SELECTION_SHEET_CONFIG.tickets;
  }
  return null;
}

function getSelectedSelectionCount(section, config) {
  if (!(section instanceof HTMLElement) || !config) {
    return 0;
  }
  return section.querySelectorAll(`${config.itemSelector}.is-checked`).length;
}

function getSelectedSelectionIds(section, config) {
  if (!(section instanceof HTMLElement) || !config) {
    return [];
  }
  return Array.from(section.querySelectorAll(`${config.itemSelector}.is-checked`))
    .map((item) => item.dataset?.[config.idKey] || "")
    .filter((value) => value);
}

function getSelectionCountElement(section, config) {
  if (!(section instanceof HTMLElement) || !config) {
    return null;
  }
  const count = section.querySelector(config.countSelector);
  return count instanceof HTMLElement ? count : null;
}

function updateSelectionConfirmButton(section, config) {
  const confirmButton = section?.querySelector("[data-center-settings-selection-confirm]");
  if (!(confirmButton instanceof HTMLButtonElement) || !config) {
    return;
  }
  const count = getSelectedSelectionCount(section, config);
  confirmButton.textContent = `${count}${config.unitLabel} 선택`;
}

function updateSelectionSummaryCount(section, config) {
  const count = getSelectionCountElement(section, config);
  if (!(count instanceof HTMLElement) || !config) {
    return;
  }
  const selectedCount = getSelectedSelectionCount(section, config);
  count.textContent = `${selectedCount}${config.unitLabel}`;
  section.dataset.selectionCommittedCount = count.textContent;
  section.dataset.selectionCommittedIds = JSON.stringify(getSelectedSelectionIds(section, config));
}

function restoreOpenSelectionSummaryCount(section, config) {
  const stack = section?.querySelector(".settings-selection-stack.is-sheet-open");
  const count = getSelectionCountElement(section, config);
  if (!(stack instanceof HTMLElement) || !(count instanceof HTMLElement)) {
    return;
  }
  count.textContent = section.dataset.selectionCommittedCount || count.textContent;
}

function getCommittedSelectionIds(section) {
  try {
    const ids = JSON.parse(section?.dataset?.selectionCommittedIds || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function restoreSelectionSheetSelection(form, section, config) {
  if (!(section instanceof HTMLElement) || !config) {
    return;
  }
  const committedIds = new Set(getCommittedSelectionIds(section));
  section.querySelectorAll(config.itemSelector).forEach((item) => {
    const id = item.dataset?.[config.idKey] || "";
    item.classList.toggle("is-checked", committedIds.has(id));
  });
  if (config === SELECTION_SHEET_CONFIG.members) {
    updateMemberSelectAllState(form);
  }
  if (config === SELECTION_SHEET_CONFIG.tickets) {
    updateTicketSelectAllState(form);
  }
  updateSelectionConfirmButton(section, config);
  restoreOpenSelectionSummaryCount(section, config);
}

function restoreOpenSelectionSummaryCounts(form) {
  form.querySelectorAll("[data-class-members-section], [data-class-tickets-section]").forEach((section) => {
    const config = getSelectionSheetConfig(section);
    restoreOpenSelectionSummaryCount(section, config);
  });
}

function syncSelectionSheetState(form) {
  form.querySelectorAll("[data-class-members-section], [data-class-tickets-section]").forEach((section) => {
    const config = getSelectionSheetConfig(section);
    updateSelectionConfirmButton(section, config);
  });
}

function setupSelectionSheets(form) {
  getSelectionBackdrop(form).addEventListener("click", () => closeSelectionSheet(form));
  form.querySelectorAll("[data-class-members-section], [data-class-tickets-section]").forEach((section) => {
    const actions = section.querySelector(".settings-selection-actions");
    const stack = section.querySelector(".settings-selection-stack");
    const labelRow = section.querySelector(".form-field__label--row");
    const config = getSelectionSheetConfig(section);
    if (!actions || !stack || !labelRow || !config) {
      return;
    }
    const title = labelRow.firstElementChild;
    if (title instanceof HTMLElement) {
      title.classList.add("settings-selection-title");
    }
    actions.classList.add("settings-selection-summary-actions");
    if (actions.querySelector("[data-center-settings-selection-open]")) {
      updateSelectionConfirmButton(section, config);
      return;
    }

    const openButton = document.createElement("button");
    openButton.className = "button-secondary button-secondary--small center-settings-selection-open";
    openButton.type = "button";
    openButton.dataset.centerSettingsSelectionOpen = "";
    openButton.textContent = "선택";

    const closeButton = document.createElement("button");
    closeButton.className = "icon-button icon-button--secondary center-settings-selection-close";
    closeButton.type = "button";
    closeButton.dataset.centerSettingsSelectionClose = "";
    closeButton.setAttribute("aria-label", "닫기");
    closeButton.innerHTML = '<img src="../../../assets/iconClose.svg" alt="" aria-hidden="true">';

    const footer = document.createElement("div");
    footer.className = "center-settings-selection-footer";

    const confirmButton = document.createElement("button");
    confirmButton.className = "primary-button center-settings-selection-confirm";
    confirmButton.type = "button";
    confirmButton.dataset.centerSettingsSelectionConfirm = "";
    footer.appendChild(confirmButton);

    actions.appendChild(openButton);
    actions.appendChild(closeButton);
    stack.appendChild(footer);
    updateSelectionConfirmButton(section, config);
  });
}

function setupInteractiveControls(form) {
  form.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const openSelection = target.closest("[data-center-settings-selection-open]");
    if (openSelection) {
      const section = openSelection.closest("[data-class-members-section], [data-class-tickets-section]");
      openSelectionSheet(form, section);
      return;
    }
    if (target.closest("[data-center-settings-selection-close]")) {
      closeSelectionSheet(form);
      return;
    }
    if (target.closest("[data-center-settings-selection-confirm]")) {
      const section = target.closest("[data-class-members-section], [data-class-tickets-section]");
      const config = getSelectionSheetConfig(section);
      updateSelectionSummaryCount(section, config);
      closeSelectionSheet(form, false);
      return;
    }
    const dayToggle = target.closest("[data-class-day]");
    if (dayToggle && form.contains(dayToggle)) {
      dayToggle.classList.toggle("is-selected");
      return;
    }
    if (target.closest("[data-class-member-select-all]")) {
      if (form.classList.contains("is-readonly")) {
        return;
      }
      toggleMemberSelection(form);
      syncSelectionSheetState(form);
      restoreOpenSelectionSummaryCounts(form);
      return;
    }
    if (target.closest("[data-class-ticket-select-all]")) {
      if (form.classList.contains("is-readonly")) {
        return;
      }
      toggleTicketSelection(form);
      syncSelectionSheetState(form);
      restoreOpenSelectionSummaryCounts(form);
      return;
    }
    const ticketRow = target.closest("[data-class-ticket]");
    if (ticketRow && form.contains(ticketRow)) {
      if (form.classList.contains("is-readonly")) {
        return;
      }
      ticketRow.classList.toggle("is-checked");
      updateTicketCount(form);
      updateTicketSelectAllState(form);
      syncSelectionSheetState(form);
      restoreOpenSelectionSummaryCounts(form);
      return;
    }
    const memberRow = target.closest("[data-class-member]");
    if (memberRow && form.contains(memberRow)) {
      if (form.classList.contains("is-readonly")) {
        return;
      }
      memberRow.classList.toggle("is-checked");
      updateMemberCount(form);
      updateMemberSelectAllState(form);
      syncSelectionSheetState(form);
      restoreOpenSelectionSummaryCounts(form);
      return;
    }
    const extraModeButton = target.closest("[data-room-pricing-extra-mode]");
    if (!extraModeButton || !form.contains(extraModeButton)) {
      return;
    }
    const selectedMode = extraModeButton.dataset.roomPricingExtraMode || "grouped";
    form.querySelectorAll("[data-room-pricing-extra-mode]").forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isSelected = button.dataset.roomPricingExtraMode === selectedMode;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-selected", String(isSelected));
    });
    syncRoomPricingExtraModeVisibility(form);
  });

  form.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches("[data-room-pricing-price-input], [data-room-pricing-extra-fee]")) {
      return;
    }
    formatNumericInputWithCommas(input);
  });

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches("[data-room-pricing-extra-enabled]")) {
      return;
    }
    syncRoomPricingExtraModeVisibility(form);
  });
}

function hydrateForm(form, context, type, mode, activeItem = null, pricingItem = null) {
  renderMemberOptions(form, MEMBERS);
  renderTicketOptions(
    form,
    context.tickets,
    formatTicketDisplayName,
    formatTicketCount,
    formatTicketValidity,
    context.config.defaultClassType
  );
  if (mode === "edit") {
    fillClassForm(
      form,
      activeItem,
      context.operationsSettings.publicHolidayOff,
      context.config.defaultClassType,
      pricingItem
    );
  } else {
    resetClassForm(
      form,
      context.operationsSettings.weekly,
      context.operationsSettings.publicHolidayOff,
      context.config.defaultClassType
    );
  }
  setActiveClassTab(form, "basic");
  syncRoomPricingExtraModeVisibility(form);
}

function initCenterSettingsFormPage() {
  const type = getCurrentType();
  const mode = getPageMode();
  const activeId = getCurrentId();
  const form = document.querySelector("[data-center-settings-form]");
  const title = document.querySelector("[data-center-settings-title]");
  const back = document.querySelector("[data-center-settings-back]");
  if (!form) {
    return;
  }
  if (title) {
    title.textContent = getTitle(type, mode);
  }
  if (back) {
    back.href = getBackUrl(type);
  }

  form.dataset.classType = getDefaultClassType(type === "hoteling");
  const schoolFields = form.querySelector("[data-school-fields]");
  const hotelingFields = form.querySelector("[data-hoteling-fields]");
  if (schoolFields) schoolFields.hidden = type !== "school";
  if (hotelingFields) hotelingFields.hidden = type !== "hoteling";

  setupSelectionSheets(form);
  setupInteractiveControls(form);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSelectionSheet(form);
    }
  });

  const context = getFormContext(type);
  let classes = setupClassList(context.storage, context.isHotelScope);
  const activeItem = mode === "edit"
    ? classes.find((item) => item.id === activeId)
    : null;
  if (mode === "edit" && !activeItem) {
    window.alert(type === "hoteling" ? "호실을 찾을 수 없습니다." : "클래스를 찾을 수 없습니다.");
    window.location.replace(getBackUrl(type));
    return;
  }
  const pricingItem = context.isHotelScope && activeItem
    ? findRoomHotelingPricing(context.pricingItems, activeItem.id)
    : null;
  hydrateForm(form, context, type, mode, activeItem, pricingItem);
  syncSelectionSheetState(form);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      context.isHotelScope
      && mode === "edit"
      && countRoomHotelingPricings(context.pricingItems, activeId) > 1
    ) {
      window.alert(ROOM_PRICING_DUPLICATE_MESSAGE);
      return;
    }
    const formData = collectClassFormData(form, context.config);
    const roomPricingInput = formData?.pricing;
    const classData = context.isHotelScope ? stripPricing(formData) : formData;
    const nextClasses = mode === "edit"
      ? updateClass({
        storage: context.storage,
        classes,
        classId: activeId,
        classData,
        ticketStorage: context.ticketStorage,
        reservationStorage: context.reservationStorage,
      })
      : addClass({
        storage: context.storage,
        classes,
        classData,
        ticketStorage: context.ticketStorage,
      });
    const savedId = mode === "edit"
      ? activeId
      : nextClasses[nextClasses.length - 1]?.id || "";

    if (context.isHotelScope) {
      const roomId = mode === "edit"
        ? activeId
        : nextClasses[nextClasses.length - 1]?.id || "";
      if (roomId) {
        saveRoomPricing(context, roomId, roomPricingInput);
      }
    }
    classes = nextClasses;
    window.location.href = savedId ? getDetailUrl(type, savedId) : getBackUrl(type);
  });

  form.addEventListener("click", (event) => {
    if (!event.target.closest("[data-center-settings-delete]")) {
      return;
    }
    if (mode !== "edit") {
      return;
    }
    const label = type === "hoteling" ? "호실" : "클래스";
    if (!window.confirm(`${label}을 삭제할까요?`)) {
      return;
    }
    const nextClasses = deleteClass({
      storage: context.storage,
      classes,
      classId: activeId,
      ticketStorage: context.ticketStorage,
      reservationStorage: context.reservationStorage,
    });
    if (context.isHotelScope) {
      const nextPricingItems = removeRoomHotelingPricing(context.pricingItems, activeId);
      context.pricingStorage.savePricingItems(nextPricingItems);
    }
    classes = nextClasses;
    window.location.href = getBackUrl(type);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCenterSettingsFormPage);
} else {
  initCenterSettingsFormPage();
}
