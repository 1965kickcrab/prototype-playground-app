import {
  formatNumberWithCommas,
  formatNumericInputWithCommas,
  normalizeNumericInput,
} from "../utils/number.js";
import { syncFilterChip } from "../utils/dom.js";
import {
  getTicketQuantityValue,
  getTicketUnitLabel,
  normalizePickdropType,
} from "../services/ticket-service.js";

function getField(root, selector) {
  return root.querySelector(selector);
}

function getUnlimitedToggle(root) {
  return getField(root, "[data-ticket-unlimited]");
}

function getReservationField(root) {
  return getField(root, "[data-ticket-reservation-field]");
}

function getWeekdayInputs(root) {
  return Array.from(root.querySelectorAll("[data-ticket-weekday]"));
}

function getWeekdayRow(root) {
  return getField(root, "[data-ticket-weekday-row]");
}

function getPickdropRow(root) {
  return getField(root, "[data-ticket-pickdrop-row]");
}

function getPickdropTypeInputs(root) {
  return Array.from(root.querySelectorAll("[data-ticket-pickdrop-type]"));
}

function getClassRows(root) {
  return Array.from(root.querySelectorAll("[data-ticket-class]"));
}

function getClassLabel(root) {
  return getField(root, "[data-ticket-class-label]");
}

function getQuantitySuffix(root) {
  return getField(root, "[data-ticket-quantity-suffix]");
}

function getQuantityLabel(root) {
  return getField(root, "[data-ticket-quantity-label]");
}

function shouldHideWeekdayRow(type) {
  return type === "daycare" || type === "hoteling" || type === "pickdrop";
}

function updateClassCount(root) {
  const target = getField(root, "[data-ticket-class-count]");
  if (!target) {
    return;
  }
  const selected = getClassRows(root).filter((row) =>
    row.classList.contains("is-checked")
  ).length;
  target.textContent = `${selected}개`;
}

function updateClassSelectAll(root) {
  const button = getField(root, "[data-ticket-class-select-all]");
  if (!button) {
    return;
  }
  const rows = getClassRows(root);
  const allSelected = rows.length > 0
    && rows.every((row) => row.classList.contains("is-checked"));
  button.classList.toggle("is-active", allSelected);
}

function syncClassSelectionState(root) {
  updateClassCount(root);
  updateClassSelectAll(root);
}

function getCheckedValue(root, selector, fallback = "") {
  const checked = root.querySelector(`${selector}:checked`);
  return checked ? checked.value : fallback;
}

function setCheckedValue(root, selector, value) {
  const inputs = root.querySelectorAll(selector);
  inputs.forEach((input) => {
    input.checked = input.value === value;
  });
}

export function formatTicketPriceValue(value) {
  const normalized = normalizeNumericInput(value);
  if (!normalized) {
    return "";
  }
  return formatNumberWithCommas(normalized);
}

export function formatTicketPriceInput(input) {
  formatNumericInputWithCommas(input);
}

export function setupTicketPriceInput(root) {
  const price = getField(root, "[data-ticket-price]");
  if (!price) {
    return;
  }
  const handleInput = () => {
    formatTicketPriceInput(price);
  };
  price.addEventListener("input", handleInput);
  price.addEventListener("blur", handleInput);
  handleInput();
}

function parseTicketPriceValue(value) {
  const normalized = normalizeNumericInput(value);
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function readTicketForm(root) {
  const name = getField(root, "[data-ticket-name]")?.value.trim() || "";
  const type = getCheckedValue(root, "[data-ticket-type]");
  const pickdropType = type === "pickdrop"
    ? getCheckedValue(root, "[data-ticket-pickdrop-type]")
    : "";
  const quantityValue =
    getField(root, "[data-ticket-quantity]")?.value.trim() || "";
  const validityValue =
    getField(root, "[data-ticket-validity]")?.value.trim() || "";
  const unit = getField(root, "[data-ticket-unit]")?.value || "";
  const unlimitedValidity = getUnlimitedToggle(root)?.checked || false;
  const priceValue =
    getField(root, "[data-ticket-price]")?.value.trim() || "";
  const startDatePolicy = getCheckedValue(
    root,
    "[data-ticket-start-policy]"
  );
  const reservationDateRule = getCheckedValue(
    root,
    "[data-ticket-reservation-rule]"
  );
  const weekdays = getWeekdayInputs(root)
    .filter((input) => input.checked)
    .map((input) => input.value);
  const classIds = getClassRows(root)
    .filter((row) => row.classList.contains("is-checked"))
    .map((row) => row.dataset.classId || "")
    .filter((value) => value);

  const quantity = Number.parseInt(quantityValue, 10);
  const validity = Number.parseInt(validityValue, 10);
  const price = parseTicketPriceValue(priceValue);

  const baseData = {
    name,
    type,
    pickdropType,
    validity: Number.isNaN(validity) ? 0 : validity,
    unit,
    price: Number.isNaN(price) ? 0 : price,
    startDatePolicy,
    reservationDateRule,
    unlimitedValidity,
    weekdays,
    classIds,
  };

  const normalizedQuantity = Number.isNaN(quantity) ? 0 : quantity;
  if (type === "daycare") {
    return {
      ...baseData,
      totalHours: normalizedQuantity,
      quantity: 0,
    };
  }

  return {
    ...baseData,
    quantity: normalizedQuantity,
    totalHours: 0,
  };
}

function setUnlimitedState(root, isUnlimited) {
  const validity = getField(root, "[data-ticket-validity]");
  const unit = getField(root, "[data-ticket-unit]");
  const reservationRules = root.querySelectorAll("[data-ticket-reservation-rule]");
  const reservationField = getReservationField(root);

  if (validity) {
    validity.disabled = isUnlimited;
  }
  if (unit) {
    unit.disabled = isUnlimited;
  }
  reservationRules.forEach((input) => {
    input.disabled = isUnlimited;
  });

  if (reservationField) {
    reservationField.classList.toggle("is-disabled", isUnlimited);
  }
}

export function setupTicketUnlimitedToggle(root) {
  const toggle = getUnlimitedToggle(root);
  if (!toggle) {
    return;
  }
  const updateState = () => {
    setUnlimitedState(root, toggle.checked);
  };

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.matches("[data-ticket-unlimited]")) {
      updateState();
    }
  });

  updateState();
}

export function resetTicketForm(root) {
  const name = getField(root, "[data-ticket-name]");
  const quantity = getField(root, "[data-ticket-quantity]");
  const validity = getField(root, "[data-ticket-validity]");
  const unit = getField(root, "[data-ticket-unit]");
  const price = getField(root, "[data-ticket-price]");
  const unlimited = getUnlimitedToggle(root);
  const weekdays = getWeekdayInputs(root);
  const weekdayRow = getWeekdayRow(root);
  const pickdropRow = getPickdropRow(root);

  if (name) {
    name.value = "";
  }
  if (quantity) {
    quantity.value = "";
  }
  if (validity) {
    validity.value = "";
  }
  if (unit) {
    unit.value = "개월";
  }
  if (price) {
    price.value = "";
  }
  if (unlimited) {
    unlimited.checked = false;
  }
  weekdays.forEach((input) => {
    input.checked = false;
    syncFilterChip(input);
  });
  if (weekdayRow) {
    weekdayRow.hidden = false;
  }
  if (pickdropRow) {
    pickdropRow.hidden = true;
  }
  setCheckedValue(root, "[data-ticket-type]", "");
  setCheckedValue(root, "[data-ticket-pickdrop-type]", "편도");
  getClassRows(root).forEach((row) => {
    row.classList.remove("is-checked");
  });
  syncClassSelectionState(root);

  setCheckedValue(root, "[data-ticket-start-policy]", "first-attendance");
  setCheckedValue(root, "[data-ticket-reservation-rule]", "expiry");
  setUnlimitedState(root, false);
  const quantitySuffix = getQuantitySuffix(root);
  const quantityLabel = getQuantityLabel(root);
  if (quantitySuffix) {
    quantitySuffix.textContent = "회";
  }
  if (quantityLabel) {
    quantityLabel.textContent = "총 횟수";
  }
}

export function fillTicketForm(root, ticket) {
  const name = getField(root, "[data-ticket-name]");
  const quantity = getField(root, "[data-ticket-quantity]");
  const validity = getField(root, "[data-ticket-validity]");
  const unit = getField(root, "[data-ticket-unit]");
  const price = getField(root, "[data-ticket-price]");
  const unlimited = getUnlimitedToggle(root);
  const weekdays = getWeekdayInputs(root);

  if (name) {
    name.value = ticket?.name || "";
  }
  setCheckedValue(root, "[data-ticket-type]", ticket?.type || "");
  setCheckedValue(
    root,
    "[data-ticket-pickdrop-type]",
    normalizePickdropType(ticket?.pickdropType || ticket?.name) || "편도"
  );
  updateTicketTypeState(root);
  if (quantity) {
    const quantityValue = getTicketQuantityValue(ticket);
    quantity.value = quantityValue > 0 ? String(quantityValue) : "";
  }
  if (validity) {
    validity.value = ticket?.validity ? String(ticket.validity) : "";
  }
  if (unit) {
    unit.value = ticket?.unit || "개월";
  }
  if (price) {
    price.value = Number.isFinite(ticket?.price)
      ? formatTicketPriceValue(String(ticket.price))
      : "";
  }
  if (unlimited) {
    unlimited.checked = Boolean(ticket?.unlimitedValidity);
  }
  const selectedWeekdays = new Set(
    Array.isArray(ticket?.weekdays) ? ticket.weekdays : []
  );
  const allowWeekdaySelection = !shouldHideWeekdayRow(ticket?.type || "");
  weekdays.forEach((input) => {
    input.checked = allowWeekdaySelection && selectedWeekdays.has(input.value);
    syncFilterChip(input);
  });
  const selectedClasses = new Set(
    Array.isArray(ticket?.classIds) ? ticket.classIds : []
  );
  getClassRows(root).forEach((row) => {
    row.classList.toggle("is-checked", selectedClasses.has(row.dataset.classId));
  });
  syncClassSelectionState(root);

  setCheckedValue(
    root,
    "[data-ticket-start-policy]",
    ticket?.startDatePolicy || "first-attendance"
  );
  setCheckedValue(
    root,
    "[data-ticket-reservation-rule]",
    ticket?.reservationDateRule || "expiry"
  );

  setUnlimitedState(root, Boolean(ticket?.unlimitedValidity));
  const quantitySuffix = getQuantitySuffix(root);
  const quantityLabel = getQuantityLabel(root);
  if (quantitySuffix) {
    quantitySuffix.textContent = getTicketUnitLabel(ticket?.type || "");
  }
  if (quantityLabel) {
    quantityLabel.textContent = ticket?.type === "daycare" ? "총 시간" : "총 횟수";
  }
}

export function isTicketFormValid(root) {
  const data = readTicketForm(root);
  const validityOk = data.unlimitedValidity
    ? true
    : data.validity > 0 && data.unit.length > 0;
  const quantityValue = data.type === "daycare"
    ? Number(data.totalHours)
    : Number(data.quantity);

  return (
    data.name.length > 0 &&
    quantityValue > 0 &&
    validityOk &&
    data.price >= 0
  );
}

export function setupTicketWeekdayChips(root) {
  const inputs = getWeekdayInputs(root);
  if (!inputs.length) {
    return;
  }
  inputs.forEach((input) => {
    syncFilterChip(input);
  });
  root.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement
      ? event.target
      : null;
    if (!input || !input.matches("[data-ticket-weekday]")) {
      return;
    }
    syncFilterChip(input);
  });
}

function clearTicketWeekdays(root) {
  const inputs = getWeekdayInputs(root);
  inputs.forEach((input) => {
    input.checked = false;
    syncFilterChip(input);
  });
}

function updateTicketTypeState(root) {
  const type = getCheckedValue(root, "[data-ticket-type]");
  const isPickdrop = type === "pickdrop";
  const hideWeekday = shouldHideWeekdayRow(type);
  const quantitySuffix = getQuantitySuffix(root);
  const quantityLabel = getQuantityLabel(root);
  const weekdayRow = getWeekdayRow(root);
  const pickdropRow = getPickdropRow(root);

  if (weekdayRow) {
    weekdayRow.hidden = hideWeekday;
    if (hideWeekday) {
      clearTicketWeekdays(root);
    }
  }

  if (pickdropRow) {
    pickdropRow.hidden = !isPickdrop;
  }

  if (quantitySuffix) {
    quantitySuffix.textContent = getTicketUnitLabel(type);
  }
  if (quantityLabel) {
    quantityLabel.textContent = type === "daycare" ? "총 시간" : "총 횟수";
  }
  if (!isPickdrop) {
    return;
  }

  const pickdropInputs = getPickdropTypeInputs(root);
  if (pickdropInputs.length > 0 && !pickdropInputs.some((input) => input.checked)) {
    pickdropInputs[0].checked = true;
  }
  const pickdropType = getCheckedValue(root, "[data-ticket-pickdrop-type]") || "편도";
  const name = getField(root, "[data-ticket-name]");
  if (!name) {
    return;
  }
  const previousDefault = name.dataset.pickdropDefault || "";
  if (!name.value.trim() || name.value.trim() === previousDefault) {
    name.value = pickdropType;
    name.dispatchEvent(new Event("input", { bubbles: true }));
  }
  name.dataset.pickdropDefault = pickdropType;
}

function updatePickdropTypeState(root) {
  const type = getCheckedValue(root, "[data-ticket-type]");
  if (type !== "pickdrop") {
    return;
  }
  const pickdropType = getCheckedValue(root, "[data-ticket-pickdrop-type]") || "편도";
  const name = getField(root, "[data-ticket-name]");
  if (!name) {
    return;
  }
  const previousDefault = name.dataset.pickdropDefault || "";
  if (!name.value.trim() || name.value.trim() === previousDefault) {
    name.value = pickdropType;
    name.dispatchEvent(new Event("input", { bubbles: true }));
  }
  name.dataset.pickdropDefault = pickdropType;
}

export function setupTicketTypeDefaults(root) {
  const inputs = root.querySelectorAll("[data-ticket-type]");
  if (!inputs.length) {
    return;
  }

  root.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input || !input.matches("[data-ticket-type]")) {
      return;
    }
    updateTicketTypeState(root);
  });

  root.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input || !input.matches("[data-ticket-pickdrop-type]")) {
      return;
    }
    updatePickdropTypeState(root);
  });

  updateTicketTypeState(root);
}

function updateTicketClassLabel(root, type) {
  const label = getClassLabel(root);
  const emptyText = getField(root, "[data-ticket-class-empty]");
  if (!label || !emptyText) {
    return;
  }
  const isHoteling = type === "hoteling";
  const isPickdrop = type === "pickdrop";
  if (isPickdrop) {
    label.textContent = "예약 가능 상품";
    emptyText.textContent = "예약할 수 있는 상품이 없습니다.";
    return;
  }
  label.textContent = isHoteling ? "예약 가능한 호실" : "예약 가능한 클래스";
  emptyText.textContent = isHoteling
    ? "예약할 수 있는 호실이 없습니다."
    : "예약할 수 있는 클래스가 없습니다.";
}

export function renderTicketServiceOptions(root, options = {}) {
  const container = getField(root, "[data-ticket-class-list]");
  const emptyText = getField(root, "[data-ticket-class-empty]");
  if (!container || !emptyText) {
    return;
  }

  const type = options.type || getCheckedValue(root, "[data-ticket-type]");
  const classes = Array.isArray(options.classes) ? options.classes : [];
  const rooms = Array.isArray(options.rooms) ? options.rooms : [];
  const source =
    type === "pickdrop"
      ? [
          ...classes.map((item) => ({ ...item, _sourceType: "class" })),
          ...rooms.map((item) => ({ ...item, _sourceType: "room" })),
        ]
      : type === "hoteling"
        ? rooms.map((item) => ({ ...item, _sourceType: "room" }))
        : classes.map((item) => ({ ...item, _sourceType: "class" }));

  updateTicketClassLabel(root, type);
  container.innerHTML = "";
  if (!Array.isArray(source) || source.length === 0) {
    emptyText.hidden = false;
    syncClassSelectionState(root);
    root.dispatchEvent(new CustomEvent("ticket-class-change"));
    return;
  }

  emptyText.hidden = true;
  source.forEach((classItem) => {
    const row = document.createElement("label");
    row.className = "class-ticket-row settings-selection-item settings-selection-item--ticket";
    row.dataset.ticketClass = "";
    const isPickdrop = type === "pickdrop";
    const sourceType = classItem._sourceType || "class";
    const baseId = String(classItem.id ?? "");
    row.dataset.classId = isPickdrop ? `${sourceType}:${baseId}` : baseId;

    const name = document.createElement("span");
    name.className = "class-ticket-row__name";
    name.textContent = classItem.name || "-";

    row.appendChild(name);
    if (type === "pickdrop") {
      const meta = document.createElement("span");
      meta.className = "class-ticket-row__meta";
      meta.textContent = sourceType === "room" ? "호실" : "클래스";
      row.appendChild(meta);
    }
    container.appendChild(row);
  });
  syncClassSelectionState(root);
  root.dispatchEvent(new CustomEvent("ticket-class-change"));
}

export function renderTicketClassOptions(root, classes = []) {
  renderTicketServiceOptions(root, { type: "school", classes });
}

export function setupTicketClassSelection(root) {
  const container = getField(root, "[data-ticket-class-list]");
  const selectAll = getField(root, "[data-ticket-class-select-all]");
  if (!container || !selectAll) {
    return;
  }

  const notifyChange = () => {
    root.dispatchEvent(new CustomEvent("ticket-class-change"));
  };

  container.addEventListener("click", (event) => {
    const row = event.target instanceof HTMLElement
      ? event.target.closest("[data-ticket-class]")
      : null;
    if (!row) {
      return;
    }
    row.classList.toggle("is-checked");
    syncClassSelectionState(root);
    notifyChange();
  });

  selectAll.addEventListener("click", () => {
    const rows = getClassRows(root);
    if (!rows.length) {
      return;
    }
    const shouldSelect = !rows.every((row) => row.classList.contains("is-checked"));
    rows.forEach((row) => {
      row.classList.toggle("is-checked", shouldSelect);
    });
    syncClassSelectionState(root);
    notifyChange();
  });
}



