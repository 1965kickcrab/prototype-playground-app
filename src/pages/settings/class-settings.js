import { initClassStorage } from "../../storage/class-storage.js";
import { initReservationStorage } from "../../storage/reservation-storage.js";
import { initOperationsStorage } from "../../storage/operations-storage.js";
import { initHotelOperationsStorage } from "../../storage/hotel-operations-storage.js";
import { initHotelRoomStorage } from "../../storage/hotel-room-storage.js";
import { initTicketStorage } from "../../storage/ticket-storage.js";
import { initPricingStorage } from "../../storage/pricing-storage.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketValidity,
} from "../../services/ticket-service.js";
import { MEMBERS } from "../../storage/members.js";
import { setupSidebarToggle } from "../../utils/sidebar.js";
import { setupSidebarGroups } from "../../utils/sidebar-groups.js";
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
import { renderClassRows } from "../../components/class-list.js";
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
import { formatNumericInputWithCommas } from "../../utils/number.js";

const ROOM_PRICING_DUPLICATE_MESSAGE =
  "해당 호실에 연결된 호텔링 요금이 2개 이상입니다. 요금표에서 정리 후 다시 시도해주세요.";
const ROOM_PRICING_RANGE_MIN = 0;
const ROOM_PRICING_RANGE_MAX = 99;
const ROOM_PRICING_MIN_GAP = 0.1;
const ROOM_PRICING_MAX_SEGMENTS = 10;
const ROOM_PRICING_ROW_DELETE_ICON_URL = new URL(
  "../../../assets/iconDelete.svg",
  import.meta.url
).href;

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatRangeValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  const rounded = Math.round(numeric * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded.toFixed(1));
}

function parsePriceValue(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickLowerPriceValue(leftValue, rightValue) {
  const left = parsePriceValue(leftValue);
  const right = parsePriceValue(rightValue);
  if (left == null && right == null) {
    return "";
  }
  if (left == null) {
    return String(rightValue ?? "");
  }
  if (right == null) {
    return String(leftValue ?? "");
  }
  return left <= right ? String(leftValue ?? "") : String(rightValue ?? "");
}

function setupRoomPricingEditor(modal) {
  const editor = modal?.querySelector("[data-room-pricing-editor]");
  const rowsContainer = editor?.querySelector("[data-room-pricing-rows]");
  const track = editor?.querySelector("[data-room-pricing-track]");
  const addButton = editor?.querySelector("[data-room-pricing-add-segment]");
  if (!editor || !rowsContainer || !track || !addButton) {
    return {
      reset: () => {},
      syncFromPrimaryInputs: () => {},
    };
  }

  const state = {
    rows: [],
  };

  const notifyInput = () => {
    modal.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const getBoundaryText = (boundaryIndex) => {
    if (state.rows.length === 0) {
      return "";
    }
    if (boundaryIndex === 0) {
      return String(state.rows[0]?.start ?? "").trim();
    }
    const previousRow = state.rows[boundaryIndex - 1];
    return String(previousRow?.end ?? "").trim();
  };

  const getBoundaryNumber = (boundaryIndex) => {
    const parsed = Number.parseFloat(getBoundaryText(boundaryIndex));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const enforceBoundaryUpperBound = (boundaryIndex) => {
    const numeric = getBoundaryNumber(boundaryIndex);
    if (numeric === null || numeric <= ROOM_PRICING_RANGE_MAX) {
      return;
    }
    setBoundaryText(boundaryIndex, formatRangeValue(ROOM_PRICING_RANGE_MAX));
  };

  const enforceAllBoundaryUpperBounds = () => {
    for (let boundaryIndex = 0; boundaryIndex <= state.rows.length; boundaryIndex += 1) {
      enforceBoundaryUpperBound(boundaryIndex);
    }
  };

  const setBoundaryText = (boundaryIndex, valueText) => {
    const text = String(valueText ?? "");
    if (state.rows.length === 0) {
      return;
    }
    if (boundaryIndex > 0) {
      const previousRow = state.rows[boundaryIndex - 1];
      if (previousRow) {
        previousRow.end = text;
      }
    }
    if (boundaryIndex < state.rows.length) {
      const nextRow = state.rows[boundaryIndex];
      if (nextRow) {
        nextRow.start = text;
      }
    }
  };

  const normalizeBoundaryValue = (boundaryIndex, nextValue) => {
    const previous = boundaryIndex > 0
      ? getBoundaryNumber(boundaryIndex - 1)
      : null;
    const next = boundaryIndex < state.rows.length
      ? getBoundaryNumber(boundaryIndex + 1)
      : null;

    let min = ROOM_PRICING_RANGE_MIN;
    let max = ROOM_PRICING_RANGE_MAX;
    if (previous !== null) {
      min = Math.max(min, previous + ROOM_PRICING_MIN_GAP);
    }
    if (next !== null) {
      max = Math.min(max, next - ROOM_PRICING_MIN_GAP);
    }
    if (min > max) {
      return null;
    }
    const clamped = clampNumber(nextValue, min, max);
    return Math.round(clamped * 10) / 10;
  };

  const syncBoundaryInputs = (boundaryIndex, sourceInput = null) => {
    const text = getBoundaryText(boundaryIndex);
    if (boundaryIndex > 0) {
      const previousEnd = rowsContainer.querySelector(
        `[data-room-pricing-template-field="end"][data-room-pricing-template-row-index="${boundaryIndex - 1}"]`
      );
      if (
        previousEnd instanceof HTMLInputElement
        && previousEnd !== sourceInput
        && previousEnd !== document.activeElement
      ) {
        previousEnd.value = text;
      }
    }
    if (boundaryIndex < state.rows.length) {
      const nextStart = rowsContainer.querySelector(
        `[data-room-pricing-template-field="start"][data-room-pricing-template-row-index="${boundaryIndex}"]`
      );
      if (
        nextStart instanceof HTMLInputElement
        && nextStart !== sourceInput
        && nextStart !== document.activeElement
      ) {
        nextStart.value = text;
      }
    }
  };

  const clearMirroredHighlights = () => {
    rowsContainer
      .querySelectorAll(".room-pricing-table__range-input--mirrored")
      .forEach((element) => element.classList.remove("room-pricing-table__range-input--mirrored"));
  };

  const highlightMirroredBoundaryInput = (boundaryIndex, sourceInput = null) => {
    clearMirroredHighlights();
    if (boundaryIndex > 0) {
      const previousEnd = rowsContainer.querySelector(
        `[data-room-pricing-template-field="end"][data-room-pricing-template-row-index="${boundaryIndex - 1}"]`
      );
      if (previousEnd instanceof HTMLInputElement && previousEnd !== sourceInput) {
        previousEnd.classList.add("room-pricing-table__range-input--mirrored");
      }
    }
    if (boundaryIndex < state.rows.length) {
      const nextStart = rowsContainer.querySelector(
        `[data-room-pricing-template-field="start"][data-room-pricing-template-row-index="${boundaryIndex}"]`
      );
      if (nextStart instanceof HTMLInputElement && nextStart !== sourceInput) {
        nextStart.classList.add("room-pricing-table__range-input--mirrored");
      }
    }
  };

  const renderTrackSpots = () => {
    track.innerHTML = "";
    if (state.rows.length <= 1) {
      return;
    }
    for (let boundaryIndex = 1; boundaryIndex < state.rows.length; boundaryIndex += 1) {
      const value = getBoundaryNumber(boundaryIndex);
      if (value === null) {
        continue;
      }
      const ratio =
        (value - ROOM_PRICING_RANGE_MIN)
        / (ROOM_PRICING_RANGE_MAX - ROOM_PRICING_RANGE_MIN);
      const spot = document.createElement("span");
      spot.className = "room-pricing-range__spot";
      spot.style.left = `${clampNumber(ratio, 0, 1) * 100}%`;
      track.appendChild(spot);
    }
  };

  const render = () => {
    enforceAllBoundaryUpperBounds();
    addButton.disabled = state.rows.length >= ROOM_PRICING_MAX_SEGMENTS;
    rowsContainer.innerHTML = "";
    state.rows.forEach((segment, index) => {
      const row = document.createElement("div");
      row.className = "room-pricing-table__row";
      row.dataset.roomPricingTemplateRowIndex = String(index);

      const startCell = document.createElement("span");
      const startGroup = document.createElement("div");
      startGroup.className = "ticket-input-group";
      const startInput = document.createElement("input");
      startInput.className = "form-field__control";
      startInput.type = "number";
      startInput.min = String(ROOM_PRICING_RANGE_MIN);
      startInput.max = String(ROOM_PRICING_RANGE_MAX);
      startInput.step = "0.1";
      startInput.placeholder = "0";
      startInput.value = segment?.start || "";
      startInput.dataset.roomPricingTemplateField = "start";
      startInput.dataset.roomPricingTemplateRowIndex = String(index);
      if (index === 0) {
        startInput.dataset.roomPricingWeightMin = "";
      }
      const startSuffix = document.createElement("span");
      startSuffix.className = "ticket-input-suffix";
      startSuffix.textContent = "kg";
      startGroup.appendChild(startInput);
      startGroup.appendChild(startSuffix);
      startCell.appendChild(startGroup);

      const endCell = document.createElement("span");
      const endGroup = document.createElement("div");
      endGroup.className = "ticket-input-group";
      const endInput = document.createElement("input");
      endInput.className = "form-field__control";
      endInput.type = "number";
      endInput.min = String(ROOM_PRICING_RANGE_MIN);
      endInput.max = String(ROOM_PRICING_RANGE_MAX);
      endInput.step = "0.1";
      endInput.placeholder = "0";
      endInput.value = segment?.end || "";
      endInput.dataset.roomPricingTemplateField = "end";
      endInput.dataset.roomPricingTemplateRowIndex = String(index);
      if (index === 0) {
        endInput.dataset.roomPricingWeightMax = "";
      }
      const endSuffix = document.createElement("span");
      endSuffix.className = "ticket-input-suffix";
      endSuffix.textContent = "kg";
      endGroup.appendChild(endInput);
      endGroup.appendChild(endSuffix);
      endCell.appendChild(endGroup);

      const priceCell = document.createElement("span");
      const priceGroup = document.createElement("div");
      priceGroup.className = "ticket-input-group";
      const priceInput = document.createElement("input");
      priceInput.className = "form-field__control";
      priceInput.type = "text";
      priceInput.inputMode = "numeric";
      priceInput.placeholder = "0";
      priceInput.value = segment?.price || "";
      priceInput.dataset.roomPricingPriceInput = "";
      priceInput.dataset.roomPricingTemplateField = "price";
      priceInput.dataset.roomPricingTemplateRowIndex = String(index);
      if (index === 0) {
        priceInput.dataset.roomPricingPrice = "";
      }
      const priceSuffix = document.createElement("span");
      priceSuffix.className = "ticket-input-suffix";
      priceSuffix.textContent = "원";
      priceGroup.appendChild(priceInput);
      priceGroup.appendChild(priceSuffix);
      priceCell.appendChild(priceGroup);

      const removeCell = document.createElement("span");
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "icon-button room-pricing-table__delete";
      removeButton.dataset.roomPricingTemplateRowDelete = "";
      removeButton.dataset.roomPricingTemplateRowIndex = String(index);
      removeButton.setAttribute("aria-label", "구간 삭제");
      removeButton.disabled = state.rows.length <= 1;
      const removeIcon = document.createElement("img");
      removeIcon.src = ROOM_PRICING_ROW_DELETE_ICON_URL;
      removeIcon.alt = "";
      removeIcon.setAttribute("aria-hidden", "true");
      removeButton.appendChild(removeIcon);
      removeCell.appendChild(removeButton);

      row.appendChild(startCell);
      row.appendChild(endCell);
      row.appendChild(priceCell);
      row.appendChild(removeCell);
      rowsContainer.appendChild(row);
    });
    renderTrackSpots();
  };

  const addSegment = () => {
    if (state.rows.length >= ROOM_PRICING_MAX_SEGMENTS) {
      return;
    }
    const previousTemplate = state.rows[state.rows.length - 1];
    const previousEnd = String(previousTemplate?.end ?? "").trim();
    const previousEndNumber = Number.parseFloat(previousEnd);
    const normalizedPreviousEnd = Number.isFinite(previousEndNumber)
      ? formatRangeValue(clampNumber(previousEndNumber, ROOM_PRICING_RANGE_MIN, ROOM_PRICING_RANGE_MAX))
      : previousEnd;
    state.rows.push({
      start: normalizedPreviousEnd || "",
      end: "",
      price: "",
    });
    render();
    notifyInput();
  };

  addButton.addEventListener("click", () => {
    addSegment();
  });

  rowsContainer.addEventListener("click", (event) => {
    const templateRemoveButton = event.target.closest(
      "[data-room-pricing-template-row-delete]"
    );
    if (!(templateRemoveButton instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const rowIndex = Number.parseInt(
      templateRemoveButton.dataset.roomPricingTemplateRowIndex || "-1",
      10
    );
    if (Number.isNaN(rowIndex) || rowIndex < 0) {
      return;
    }
    if (state.rows.length <= 1) {
      return;
    }
    state.rows.splice(rowIndex, 1);
    if (rowIndex > 0 && rowIndex < state.rows.length) {
      const previousEnd = String(state.rows[rowIndex - 1]?.end ?? "").trim();
      state.rows[rowIndex].start = previousEnd;
    }
    render();
    notifyInput();
  });

  rowsContainer.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches("[data-room-pricing-template-field]")) {
      return;
    }
    const rowIndex = Number.parseInt(
      input.dataset.roomPricingTemplateRowIndex || "-1",
      10
    );
    if (Number.isNaN(rowIndex) || rowIndex < 0) {
      return;
    }
    const field = input.dataset.roomPricingTemplateField || "";
    if (!["start", "end", "price"].includes(field)) {
      return;
    }
    const target = state.rows[rowIndex];
    if (!target) {
      return;
    }
    if (field === "price") {
      target.price = input.value;
      clearMirroredHighlights();
      notifyInput();
      return;
    }
    const boundaryIndex = field === "start" ? rowIndex : rowIndex + 1;
    const raw = input.value.trim();
    const parsed = Number.parseFloat(raw);
    const normalizedInput = Number.isFinite(parsed)
      ? formatRangeValue(clampNumber(parsed, ROOM_PRICING_RANGE_MIN, ROOM_PRICING_RANGE_MAX))
      : input.value;
    setBoundaryText(boundaryIndex, normalizedInput);
    if (normalizedInput !== input.value) {
      input.value = normalizedInput;
    }
    syncBoundaryInputs(boundaryIndex, input);
    highlightMirroredBoundaryInput(boundaryIndex, input);
    renderTrackSpots();
    notifyInput();
  });

  rowsContainer.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches("[data-room-pricing-template-field]")) {
      return;
    }
    const rowIndex = Number.parseInt(
      input.dataset.roomPricingTemplateRowIndex || "-1",
      10
    );
    if (Number.isNaN(rowIndex) || rowIndex < 0) {
      return;
    }
    const field = input.dataset.roomPricingTemplateField || "";
    if (!["start", "end"].includes(field)) {
      return;
    }
    const target = state.rows[rowIndex];
    if (!target) {
      return;
    }
    const boundaryIndex = field === "start" ? rowIndex : rowIndex + 1;
    const raw = input.value.trim();
    if (!raw) {
      setBoundaryText(boundaryIndex, "");
      syncBoundaryInputs(boundaryIndex, input);
      renderTrackSpots();
      notifyInput();
      return;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const normalized = normalizeBoundaryValue(boundaryIndex, parsed);
    if (normalized === null) {
      setBoundaryText(boundaryIndex, formatRangeValue(ROOM_PRICING_RANGE_MAX));
      input.value = formatRangeValue(ROOM_PRICING_RANGE_MAX);
      syncBoundaryInputs(boundaryIndex, input);
      renderTrackSpots();
      clearMirroredHighlights();
      notifyInput();
      return;
    }
    const formatted = formatRangeValue(normalized);
    setBoundaryText(boundaryIndex, formatted);
    input.value = formatted;
    syncBoundaryInputs(boundaryIndex, input);
    renderTrackSpots();
    clearMirroredHighlights();
    notifyInput();
  });

  rowsContainer.addEventListener("focusout", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches("[data-room-pricing-template-field='start'], [data-room-pricing-template-field='end']")) {
      return;
    }
    clearMirroredHighlights();
  });

  const reset = () => {
    state.rows = [{ start: "", end: "", price: "" }];
    render();
  };

  const syncFromPrimaryInputs = () => {
    const minInput = rowsContainer.querySelector("[data-room-pricing-weight-min]");
    const maxInput = rowsContainer.querySelector("[data-room-pricing-weight-max]");
    const priceInput = rowsContainer.querySelector("[data-room-pricing-price]");
    state.rows = [{
      start: String(minInput?.value || "").trim(),
      end: String(maxInput?.value || "").trim(),
      price: String(priceInput?.value || "").trim(),
    }];
    enforceAllBoundaryUpperBounds();
    render();
  };

  reset();
  return { reset, syncFromPrimaryInputs };
}

function setupClassModal(
  storage,
  classes,
  tickets,
  weeklyDefaults,
  holidayDefault,
  onUpdate,
  ticketStorage,
  config,
  pricingStorage,
  pricingState
) {
  const modal = document.querySelector("[data-class-modal]");
  if (!modal) {
    return;
  }
  const roomPricingEditor = setupRoomPricingEditor(modal);

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-class-tab]");
    if (tabButton && modal.contains(tabButton)) {
      setActiveClassTab(modal, tabButton.dataset.classTab);
      return;
    }
    const dayToggle = event.target.closest("[data-class-day]");
    if (dayToggle && modal.contains(dayToggle)) {
      dayToggle.classList.toggle("is-selected");
      return;
    }
    const memberSelectAll = event.target.closest("[data-class-member-select-all]");
    if (memberSelectAll && modal.contains(memberSelectAll)) {
      toggleMemberSelection(modal);
      return;
    }
    const ticketSelectAll = event.target.closest("[data-class-ticket-select-all]");
    if (ticketSelectAll && modal.contains(ticketSelectAll)) {
      toggleTicketSelection(modal);
      return;
    }
    if (event.target.closest("[data-class-modal-open]")) {
      roomPricingEditor.reset();
      resetClassForm(modal, weeklyDefaults, holidayDefault, config.defaultClassType);
      roomPricingEditor.syncFromPrimaryInputs();
      renderTicketOptions(
        modal,
        tickets,
        formatTicketDisplayName,
        formatTicketCount,
        formatTicketValidity,
        config.defaultClassType
      );
      setActiveClassTab(modal, "basic");
      openModal();
      return;
    }

    if (event.target.closest("[data-class-submit]")) {
      const classData = collectClassFormData(modal, config);
      const roomPricingInput = classData?.pricing;
      const roomData = config.isHotelScope
        ? { ...classData, pricing: undefined }
        : classData;
      if (roomData && "pricing" in roomData) {
        delete roomData.pricing;
      }
      const nextClasses = addClass({
        storage,
        classes,
        classData: roomData,
        ticketStorage,
      });
      if (config.isHotelScope && pricingStorage && pricingState) {
        const createdRoom = nextClasses[nextClasses.length - 1];
        const roomId = createdRoom?.id || "";
        const existingItem = findRoomHotelingPricing(pricingState.items, roomId);
        const nextPricingItem = buildRoomHotelingPricingItem({
          existingItem,
          roomId,
          pricingInput: roomPricingInput,
        });
        pricingState.items = upsertRoomHotelingPricing(
          pricingState.items,
          roomId,
          nextPricingItem
        );
        pricingStorage.savePricingItems(pricingState.items);
      }
      onUpdate(nextClasses);
      closeModal();
      return;
    }

    if (
      event.target.closest("[data-class-modal-close]") ||
      event.target.closest("[data-class-modal-overlay]")
    ) {
      closeModal();
    }
  });

  modal.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const extraModeButton = target
      ? target.closest("[data-room-pricing-extra-mode]")
      : null;
    if (extraModeButton && modal.contains(extraModeButton)) {
      const selectedMode = extraModeButton.dataset.roomPricingExtraMode || "grouped";
      modal.querySelectorAll("[data-room-pricing-extra-mode]").forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const isSelected = button.dataset.roomPricingExtraMode === selectedMode;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-selected", String(isSelected));
      });
      syncRoomPricingExtraModeVisibility(modal);
      return;
    }
    const ticketRow = target ? target.closest("[data-class-ticket]") : null;
    if (ticketRow && modal.contains(ticketRow)) {
      ticketRow.classList.toggle("is-checked");
      updateTicketCount(modal);
      updateTicketSelectAllState(modal);
      return;
    }
    const memberRow = target ? target.closest("[data-class-member]") : null;
    if (!memberRow || !modal.contains(memberRow)) {
      return;
    }
    memberRow.classList.toggle("is-checked");
    updateMemberCount(modal);
    updateMemberSelectAllState(modal);
  });

  modal.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches(
      "[data-room-pricing-price-input], [data-room-pricing-template-price-input], [data-room-pricing-extra-fee]"
    )) {
      return;
    }
    formatNumericInputWithCommas(input);
  });
  modal.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.matches("[data-room-pricing-extra-enabled]")) {
      return;
    }
    syncRoomPricingExtraModeVisibility(modal);
  });

  renderMemberOptions(modal, MEMBERS);
  renderTicketOptions(
    modal,
    tickets,
    formatTicketDisplayName,
    formatTicketCount,
    formatTicketValidity,
    config.defaultClassType
  );
}

function setupClassDetailModal(
  storage,
  classes,
  tickets,
  holidayDefault,
  onUpdate,
  reservationStorage,
  ticketStorage,
  config,
  pricingStorage,
  pricingState
) {
  const modal = document.querySelector("[data-class-detail-modal]");
  const listContainer = document.querySelector("[data-class-rows]");
  if (!modal || !listContainer) {
    return;
  }
  const roomPricingEditor = setupRoomPricingEditor(modal);

  let activeClassId = "";
  let initialSnapshot = "";

  const updateDirtyState = () => {
    const updateButton = modal.querySelector("[data-class-update]");
    if (!updateButton) {
      return;
    }
    const currentSnapshot = JSON.stringify(collectClassFormData(modal, config));
    const isDirty = currentSnapshot !== initialSnapshot;
    updateButton.disabled = !isDirty;
  };

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  listContainer.addEventListener("click", (event) => {
    const row = event.target.closest(".list-table__row--class");
    if (!row) {
      return;
    }

    const classId = row.dataset.classId;
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem) {
      return;
    }

    activeClassId = classItem.id;
    roomPricingEditor.reset();
    renderTicketOptions(
      modal,
      tickets,
      formatTicketDisplayName,
      formatTicketCount,
      formatTicketValidity,
      classItem.type || config.defaultClassType
    );
    const pricingItem = config.isHotelScope && pricingState
      ? findRoomHotelingPricing(pricingState.items, classItem.id)
      : null;
    fillClassForm(
      modal,
      classItem,
      holidayDefault,
      config.defaultClassType,
      pricingItem
    );
    roomPricingEditor.syncFromPrimaryInputs();
    setActiveClassTab(modal, "basic");
    initialSnapshot = JSON.stringify(collectClassFormData(modal, config));
    updateDirtyState();
    openModal();
  });

  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-class-tab]");
    if (tabButton && modal.contains(tabButton)) {
      setActiveClassTab(modal, tabButton.dataset.classTab);
      return;
    }
    const dayToggle = event.target.closest("[data-class-day]");
    if (dayToggle && modal.contains(dayToggle)) {
      dayToggle.classList.toggle("is-selected");
      updateDirtyState();
      return;
    }
    const memberSelectAll = event.target.closest("[data-class-member-select-all]");
    if (memberSelectAll && modal.contains(memberSelectAll)) {
      toggleMemberSelection(modal);
      updateDirtyState();
      return;
    }
    const ticketSelectAll = event.target.closest("[data-class-ticket-select-all]");
    if (ticketSelectAll && modal.contains(ticketSelectAll)) {
      toggleTicketSelection(modal);
      updateDirtyState();
      return;
    }
    if (
      event.target.closest("[data-class-detail-close]") ||
      event.target.closest("[data-class-detail-overlay]")
    ) {
      closeModal();
      return;
    }

    if (event.target.closest("[data-class-delete]")) {
      if (!window.confirm("반을 삭제할까요?")) {
        return;
      }
      const nextClasses = deleteClass({
        storage,
        classes,
        classId: activeClassId,
        ticketStorage,
        reservationStorage,
      });
      if (config.isHotelScope && pricingStorage && pricingState) {
        pricingState.items = removeRoomHotelingPricing(pricingState.items, activeClassId);
        pricingStorage.savePricingItems(pricingState.items);
      }
      onUpdate(nextClasses);
      closeModal();
      return;
    }

    if (event.target.closest("[data-class-update]")) {
      if (config.isHotelScope && pricingState) {
        const count = countRoomHotelingPricings(pricingState.items, activeClassId);
        if (count > 1) {
          window.alert(ROOM_PRICING_DUPLICATE_MESSAGE);
          return;
        }
      }
      const updated = collectClassFormData(modal, config);
      const roomPricingInput = updated?.pricing;
      const roomData = config.isHotelScope
        ? { ...updated, pricing: undefined }
        : updated;
      if (roomData && "pricing" in roomData) {
        delete roomData.pricing;
      }
      const nextClasses = updateClass({
        storage,
        classes,
        classId: activeClassId,
        classData: roomData,
        ticketStorage,
        reservationStorage,
      });
      if (config.isHotelScope && pricingStorage && pricingState) {
        const existingItem = findRoomHotelingPricing(pricingState.items, activeClassId);
        const nextPricingItem = buildRoomHotelingPricingItem({
          existingItem,
          roomId: activeClassId,
          pricingInput: roomPricingInput,
        });
        pricingState.items = upsertRoomHotelingPricing(
          pricingState.items,
          activeClassId,
          nextPricingItem
        );
        pricingStorage.savePricingItems(pricingState.items);
      }
      onUpdate(nextClasses);
      closeModal();
    }
  });

  modal.addEventListener("input", updateDirtyState);
  modal.addEventListener("change", updateDirtyState);
  modal.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches(
      "[data-room-pricing-price-input], [data-room-pricing-template-price-input], [data-room-pricing-extra-fee]"
    )) {
      return;
    }
    formatNumericInputWithCommas(input);
  });
  modal.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.matches("[data-room-pricing-extra-enabled]")) {
      return;
    }
    syncRoomPricingExtraModeVisibility(modal);
    updateDirtyState();
  });

  modal.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const extraModeButton = target
      ? target.closest("[data-room-pricing-extra-mode]")
      : null;
    if (extraModeButton && modal.contains(extraModeButton)) {
      const selectedMode = extraModeButton.dataset.roomPricingExtraMode || "grouped";
      modal.querySelectorAll("[data-room-pricing-extra-mode]").forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const isSelected = button.dataset.roomPricingExtraMode === selectedMode;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-selected", String(isSelected));
      });
      syncRoomPricingExtraModeVisibility(modal);
      updateDirtyState();
      return;
    }
    const ticketRow = target ? target.closest("[data-class-ticket]") : null;
    if (ticketRow && modal.contains(ticketRow)) {
      ticketRow.classList.toggle("is-checked");
      updateTicketCount(modal);
      updateTicketSelectAllState(modal);
      updateDirtyState();
      return;
    }
    const memberRow = target ? target.closest("[data-class-member]") : null;
    if (!memberRow || !modal.contains(memberRow)) {
      return;
    }
    memberRow.classList.toggle("is-checked");
    updateMemberCount(modal);
    updateMemberSelectAllState(modal);
    updateDirtyState();
  });

  renderMemberOptions(modal, MEMBERS);
  renderTicketOptions(
    modal,
    tickets,
    formatTicketDisplayName,
    formatTicketCount,
    formatTicketValidity,
    config.defaultClassType
  );
}

const initClassSettingsPage = () => {
  const isHotelScope = document.body?.dataset?.settingsScope === "hotel";
  const storage = isHotelScope ? initHotelRoomStorage() : initClassStorage();
  const reservationStorage = isHotelScope ? null : initReservationStorage();
  const operationsStorage = isHotelScope ? initHotelOperationsStorage() : initOperationsStorage();
  const ticketStorage = initTicketStorage();
  const pricingStorage = initPricingStorage();
  const pricingState = {
    items: pricingStorage.loadPricingItems(),
  };
  let classes = setupClassList(storage, isHotelScope);
  if (!Array.isArray(classes) || classes.length === 0) {
    const seeded = storage.ensureDefaults();
    classes = Array.isArray(seeded) ? seeded : [];
  }
  const tickets = ticketStorage.ensureDefaults();
  const operationsSettings = operationsStorage.loadSettings();
  const listContainer = document.querySelector("[data-class-rows]");
  const config = {
    isHotelScope,
    defaultClassType: getDefaultClassType(isHotelScope),
  };

  const updateClasses = (nextClasses) => {
    classes.length = 0;
    classes.push(...nextClasses);
  };

  const updateList = (nextClasses) => {
    updateClasses(nextClasses);
    if (!listContainer) {
      return;
    }
    renderClassRows(listContainer, nextClasses, isHotelScope);
    if (listContainer.children.length === 0) {
      const fallback = storage.ensureDefaults();
      if (Array.isArray(fallback) && fallback.length > 0) {
        updateClasses(fallback);
        renderClassRows(listContainer, fallback, isHotelScope);
      }
    }
  };

  setupSidebarToggle({
    iconOpen: "../assets/menuIcon_sidebar_open.svg",
    iconClose: "../assets/menuIcon_sidebar_close.svg",
  });
  setupSidebarGroups({ navigateToFirstItemOnToggle: true });
  setupClassModal(
    storage,
    classes,
    tickets,
    operationsSettings.weekly,
    operationsSettings.publicHolidayOff,
    updateList,
    ticketStorage,
    config,
    pricingStorage,
    pricingState
  );
  setupClassDetailModal(
    storage,
    classes,
    tickets,
    operationsSettings.publicHolidayOff,
    updateList,
    reservationStorage,
    ticketStorage,
    config,
    pricingStorage,
    pricingState
  );
  updateList(classes);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClassSettingsPage);
} else {
  initClassSettingsPage();
}
