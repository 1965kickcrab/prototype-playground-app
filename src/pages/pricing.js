import { initClassStorage } from "../storage/class-storage.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { syncClassesFromPricing } from "../services/class-pricing-sync.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import {
  createPricingItemFromRow,
  createPricingItemsFromRows,
} from "../services/pricing-service.js";
import { normalizePickdropType } from "../services/ticket-service.js";
import { renderPricingDetail } from "../components/pricing-view.js";
import { formatNumericInputWithCommas } from "../utils/number.js";
import { setupSidebarToggle } from "../utils/sidebar.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { getTimeZone } from "../utils/timezone.js";
import { initReservationStorage } from "../storage/reservation-storage.js";

const SERVICE_TYPES = ["school", "daycare", "hoteling", "pickdrop"];
const DEFAULT_SERVICE_TYPE = "school";
const SERVICE_DEDUCTIONS = {
  daycare: { value: "1", unit: "시간" },
  hoteling: { value: "24", unit: "시간" },
  pickdrop: { value: "1", unit: "회" },
};
const SERVICE_LINKAGE_HEADERS = {
  school: "적용 클래스",
  daycare: "적용 클래스",
  hoteling: "적용 호실",
  pickdrop: "적용 클래스/호실",
};
const PICKDROP_ROOM_PREFIX = "room:";

function showToast(message) {
  let toast = document.querySelector("[data-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.dataset.toast = "true";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2000);
}

function getServiceTypeFromTable(table) {
  return table?.dataset.pricingService || DEFAULT_SERVICE_TYPE;
}

function getServiceTypeFromRow(row, fallback = DEFAULT_SERVICE_TYPE) {
  const input = row?.querySelector("[data-pricing-service]");
  const inputValue = input?.value || "";
  if (inputValue) {
    return inputValue;
  }
  const rowValue = row?.dataset?.pricingService || "";
  return rowValue || fallback;
}

function setServiceTypeOnTable(table, serviceType) {
  if (table) {
    table.dataset.pricingService = serviceType;
  }
}

function parseTimeToMinutes(value) {
  if (!value) {
    return null;
  }
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return parts[0] * 60 + parts[1];
}

function parseDistanceRange(value) {
  const raw = value?.trim() || "";
  if (!raw) {
    return { min: "", max: "" };
  }
  if (raw.includes("~")) {
    const [min, max] = raw.split("~");
    return { min: (min || "").trim(), max: (max || "").trim() };
  }
  return { min: raw, max: "" };
}

function formatDurationHours(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function getSchoolDeduction(row, classes) {
  const classIds = Array.from(
    row.querySelectorAll("[data-pricing-class].is-checked")
  )
    .map((element) => element.dataset.classId || "")
    .filter(Boolean);
  if (classIds.length === 0) {
    return { value: "", unit: "시간" };
  }

  const classMap = new Map(
    (classes || []).map((classItem) => [String(classItem?.id ?? ""), classItem])
  );
  const classItem = classMap.get(String(classIds[0]));
  if (!classItem) {
    return { value: "", unit: "시간" };
  }
  const start = parseTimeToMinutes(classItem.startTime);
  const end = parseTimeToMinutes(classItem.endTime);
  if (start === null || end === null) {
    return { value: "", unit: "시간" };
  }
  let minutes = end - start;
  if (minutes <= 0) {
    minutes += 24 * 60;
  }

  return {
    value: formatDurationHours(minutes),
    unit: "시간",
  };
}

function applyServiceDefaultsToRow(row, serviceType, classes) {
  if (!row) {
    return;
  }
  const serviceInput = row.querySelector("[data-pricing-service]");
  if (serviceInput) {
    serviceInput.value = serviceType;
  }
  row.dataset.pricingService = serviceType;

  const deductionValue = row.querySelector("[data-pricing-deduction-value]");
  const deductionUnit = row.querySelector("[data-pricing-deduction-unit]");
  if (!deductionValue || !deductionUnit) {
    return;
  }

  if (serviceType === "school") {
    const deduction = getSchoolDeduction(row, classes);
    deductionValue.value = deduction.value;
    deductionUnit.value = deduction.unit;
    return;
  }

  const defaults = SERVICE_DEDUCTIONS[serviceType];
  deductionValue.value = defaults?.value || "";
  deductionUnit.value = defaults?.unit || "";
}

function applyServiceDefaultsToRows(container, serviceType, classes) {
  if (!container) {
    return;
  }
  container.querySelectorAll(".list-table__row").forEach((row) => {
    const rowServiceType = getServiceTypeFromRow(row, serviceType);
    applyServiceDefaultsToRow(row, rowServiceType, classes);
  });
}

function ensureServiceRowExists(container, serviceType, classes, rooms) {
  if (!container) {
    return;
  }
  const hasRow = Array.from(container.querySelectorAll(".list-table__row"))
    .some((row) => getServiceTypeFromRow(row, serviceType) === serviceType);
  if (hasRow) {
    return;
  }

  const templateRow = container.querySelector(".list-table__row");
  if (!templateRow) {
    return;
  }

  const newRow = templateRow.cloneNode(true);
  resetPricingRow(newRow, serviceType, classes);
  renderPricingClassOptions(newRow, classes, rooms);
  container.appendChild(newRow);
}

function applyPricingItemToRow(row, item, classes) {
  if (!row || !item) {
    return;
  }

  const serviceType = item.serviceType || DEFAULT_SERVICE_TYPE;
  applyServiceDefaultsToRow(row, serviceType, classes);

  const typeInput = row.querySelector("[data-pricing-pickdrop-type]");
  if (typeInput) {
    const pickdropType = normalizePickdropType(item.pickdropType || item.title);
    typeInput.value = pickdropType || typeInput.dataset.defaultSelect || "편도";
  }

  const weightMinInput = row.querySelector("[data-pricing-weight-min]");
  if (weightMinInput) {
    weightMinInput.value = item.weightMin || "";
  }

  const weightMaxInput = row.querySelector("[data-pricing-weight-max]");
  if (weightMaxInput) {
    weightMaxInput.value = item.weightMax || "";
  }

  const { min: distanceMin, max: distanceMax } = parseDistanceRange(
    item.distance || ""
  );
  const distanceMinInput = row.querySelector("[data-pricing-distance-min]");
  if (distanceMinInput) {
    distanceMinInput.value = distanceMin;
  }
  const distanceMaxInput = row.querySelector("[data-pricing-distance-max]");
  if (distanceMaxInput) {
    distanceMaxInput.value = distanceMax;
  }

  const priceInput = row.querySelector("[data-pricing-price]");
  if (priceInput) {
    priceInput.value = item.price || "";
  }

  const vatInput = row.querySelector("[data-pricing-vat]");
  if (vatInput) {
    vatInput.checked = Boolean(item.vatSeparate);
  }

  const deductionValue = row.querySelector("[data-pricing-deduction-value]");
  if (deductionValue) {
    deductionValue.value = item.deductionValue || "";
  }
  const deductionUnit = row.querySelector("[data-pricing-deduction-unit]");
  if (deductionUnit) {
    deductionUnit.value = item.deductionUnit || "";
  }

  const weekdays = Array.isArray(item.weekdays) ? item.weekdays : [];
  row.querySelectorAll(".pricing-weekday-chips .filter-chip").forEach((chip) => {
    const label = chip.textContent?.trim() || "";
    const isSelected = weekdays.includes(label);
    chip.classList.toggle("is-selected", isSelected);
    chip.setAttribute("aria-pressed", String(isSelected));
  });

  const classIds = Array.isArray(item.classIds) ? item.classIds : [];
  row.querySelectorAll("[data-pricing-class]").forEach((classRow) => {
    const classId = classRow.dataset.classId || "";
    classRow.classList.toggle("is-checked", classIds.includes(classId));
  });
  syncPricingClassSelectionState(row);
}

function loadPricingRowsFromStorage(classes, rooms) {
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!rowsContainer) {
    return;
  }
  const templateRow = rowsContainer.querySelector(".list-table__row");
  if (!templateRow) {
    return;
  }

  const storage = initPricingStorage();
  const items = storage.loadPricingItems();
  const rowTemplate = templateRow.cloneNode(true);

  rowsContainer.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    resetPricingRow(rowTemplate, DEFAULT_SERVICE_TYPE, classes);
    renderPricingClassOptions(rowTemplate, classes, rooms);
    rowsContainer.appendChild(rowTemplate);
    return;
  }

  items.forEach((item) => {
    const row = rowTemplate.cloneNode(true);
    resetPricingRow(row, item.serviceType || DEFAULT_SERVICE_TYPE, classes);
    renderPricingClassOptions(row, classes, rooms);
    applyPricingItemToRow(row, item, classes);
    rowsContainer.appendChild(row);
  });
}

function updatePricingRowVisibility(container, serviceType) {
  if (!container) {
    return;
  }
  container.querySelectorAll(".list-table__row").forEach((row) => {
    const rowServiceType = getServiceTypeFromRow(row, serviceType);
    row.hidden = rowServiceType !== serviceType;
  });
}

const setupPricingWeekdayChips = () => {
  document.addEventListener("click", (event) => {
    const chip = event.target.closest(".filter-chip");
    if (!chip) {
      return;
    }

    const container = chip.closest(".pricing-weekday-chips");
    if (!container || container.dataset.readonly === "true") {
      return;
    }

    const isSelected = chip.classList.toggle("is-selected");
    chip.setAttribute("aria-pressed", String(isSelected));
  });
};

const setupPricingPriceInputs = () => {
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!rowsContainer) {
    return;
  }

  const handleInput = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.matches("[data-pricing-price]")) {
      return;
    }
    formatNumericInputWithCommas(input);
  };

  rowsContainer.addEventListener("input", handleInput);
  rowsContainer.addEventListener("blur", handleInput, true);

  rowsContainer.querySelectorAll("[data-pricing-price]").forEach((input) => {
    formatNumericInputWithCommas(input);
  });
};

const setupPricingTabs = (classes, rooms) => {
  const tabs = document.querySelector(".ticket-tabs");
  const table = document.querySelector(".list-table--pricing-form");
  const linkageHeader = document.querySelector("[data-pricing-linkage-header]");
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!tabs || !table || !rowsContainer) {
    return {
      getServiceType: () => DEFAULT_SERVICE_TYPE,
    };
  }

  const buttons = Array.from(tabs.querySelectorAll(".ticket-tab"));
  const getServiceType = () => getServiceTypeFromTable(table);

  const setActiveTab = (serviceType) => {
    buttons.forEach((button) => {
      const isActive = button.dataset.pricingService === serviceType;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    setServiceTypeOnTable(table, serviceType);
    if (linkageHeader) {
      linkageHeader.textContent = SERVICE_LINKAGE_HEADERS[serviceType] || SERVICE_LINKAGE_HEADERS.school;
    }
    applyServiceDefaultsToRows(rowsContainer, serviceType, classes);
    ensureServiceRowExists(rowsContainer, serviceType, classes, rooms);
    updatePricingRowVisibility(rowsContainer, serviceType);
  };

  const initialButton = buttons.find((button) =>
    button.classList.contains("is-active")
  );
  const initialType = initialButton?.dataset.pricingService || DEFAULT_SERVICE_TYPE;
  setActiveTab(initialType);

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest(".ticket-tab");
    if (!button) {
      return;
    }
    const nextType = button.dataset.pricingService || DEFAULT_SERVICE_TYPE;
    if (nextType === getServiceType()) {
      return;
    }
    setActiveTab(nextType);
  });

  return { getServiceType };
};

const resetPricingRow = (row, serviceType, classes) => {
  if (!row) {
    return;
  }

  const defaultValueInputs = row.querySelectorAll("[data-default-value]");
  defaultValueInputs.forEach((input) => {
    input.value = input.dataset.defaultValue || "";
  });

  const defaultSelects = row.querySelectorAll("[data-default-select]");
  defaultSelects.forEach((select) => {
    select.value = select.dataset.defaultSelect || select.value;
  });

  row.querySelectorAll("input").forEach((input) => {
    if (input.type === "checkbox") {
      input.checked = false;
    } else if (!input.dataset.defaultValue) {
      input.value = "";
    }
  });

  row.querySelectorAll("select").forEach((select) => {
    if (!select.dataset.defaultSelect) {
      select.value = "월";
    }
  });

  row.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.remove("is-selected");
    chip.setAttribute("aria-pressed", "false");
  });

  row.querySelectorAll("[data-pricing-class]").forEach((classRow) => {
    classRow.classList.remove("is-checked");
  });
  syncPricingClassSelectionState(row);
  applyServiceDefaultsToRow(row, serviceType, classes);
};

const setupPricingRowAdd = (classes, rooms, getServiceType) => {
  const addButton = document.querySelector("[data-pricing-add-row]");
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!addButton || !rowsContainer) {
    return;
  }

  addButton.addEventListener("click", () => {
    const templateRow = rowsContainer.querySelector(".list-table__row");
    if (!templateRow) {
      return;
    }

    const newRow = templateRow.cloneNode(true);
    resetPricingRow(newRow, getServiceType(), classes);

    renderPricingClassOptions(newRow, classes, rooms);
    rowsContainer.appendChild(newRow);
  });
};

const copyPricingRowValues = (sourceRow, targetRow) => {
  const sourceInputs = sourceRow.querySelectorAll("input");
  const targetInputs = targetRow.querySelectorAll("input");

  sourceInputs.forEach((input, index) => {
    const target = targetInputs[index];
    if (!target) {
      return;
    }

    if (input.type === "checkbox") {
      target.checked = input.checked;
    } else {
      target.value = input.value;
    }
  });

  const sourceSelects = sourceRow.querySelectorAll("select");
  const targetSelects = targetRow.querySelectorAll("select");

  sourceSelects.forEach((select, index) => {
    const target = targetSelects[index];
    if (target) {
      target.value = select.value;
    }
  });

  const sourceChips = sourceRow.querySelectorAll(".filter-chip");
  const targetChips = targetRow.querySelectorAll(".filter-chip");

  sourceChips.forEach((chip, index) => {
    const target = targetChips[index];
    if (!target) {
      return;
    }

    const isSelected = chip.classList.contains("is-selected");
    target.classList.toggle("is-selected", isSelected);
    target.setAttribute("aria-pressed", String(isSelected));
  });

  const sourceClasses = sourceRow.querySelectorAll("[data-pricing-class]");
  const targetClasses = targetRow.querySelectorAll("[data-pricing-class]");

  sourceClasses.forEach((classRow, index) => {
    const target = targetClasses[index];
    if (!target) {
      return;
    }

    target.classList.toggle(
      "is-checked",
      classRow.classList.contains("is-checked")
    );
  });
};

const setupPricingRowDelete = () => {
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!rowsContainer) {
    return;
  }

  rowsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pricing-delete-row]");
    if (!button) {
      return;
    }

    const row = button.closest(".list-table__row");
    if (row) {
      row.remove();
    }
  });
};

const setupPricingRowDuplicate = (classes, rooms, getServiceType) => {
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!rowsContainer) {
    return;
  }

  rowsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pricing-duplicate-row]");
    if (!button) {
      return;
    }

    const row = button.closest(".list-table__row");
    if (!row) {
      return;
    }

    const newRow = row.cloneNode(true);
    renderPricingClassOptions(newRow, classes, rooms);
    copyPricingRowValues(row, newRow);
    syncPricingClassSelectionState(newRow);
    applyServiceDefaultsToRow(newRow, getServiceType(), classes);
    rowsContainer.insertBefore(newRow, row.nextSibling);
  });
};

const getPricingClassRows = (row) => {
  if (!row) {
    return [];
  }
  return Array.from(row.querySelectorAll("[data-pricing-class]"));
};

const updatePricingClassCount = (row) => {
  const target = row.querySelector("[data-pricing-class-count]");
  if (!target) {
    return;
  }
  const selected = getPricingClassRows(row).filter((classRow) =>
    classRow.classList.contains("is-checked")
  ).length;
  target.textContent = `${selected}개`;
};

const updatePricingClassSelectAll = (row) => {
  const button = row.querySelector("[data-pricing-class-select-all]");
  if (!button) {
    return;
  }
  const rows = getPricingClassRows(row);
  const allSelected = rows.length > 0
    && rows.every((classRow) => classRow.classList.contains("is-checked"));
  button.classList.toggle("is-active", allSelected);
};

const syncPricingClassSelectionState = (row) => {
  getPricingClassRows(row).forEach((classRow) => {
    classRow.setAttribute(
      "aria-pressed",
      String(classRow.classList.contains("is-checked"))
    );
  });
  updatePricingClassCount(row);
  updatePricingClassSelectAll(row);
  updatePricingClassInput(row);
};

const updatePricingClassInput = (row) => {
  const input = row.querySelector("[data-pricing-class-input]");
  if (!input) {
    return;
  }
  const selectedNames = getPricingClassRows(row)
    .filter((classRow) => classRow.classList.contains("is-checked"))
    .map((classRow) =>
      classRow.querySelector(".class-ticket-row__name")?.textContent?.trim() || ""
    )
    .filter(Boolean);

  input.value = selectedNames.length ? selectedNames.join(", ") : "";
};

function renderPricingClassOptions(row, classes, rooms) {
  const container = row.querySelector("[data-pricing-class-list]");
  const emptyText = row.querySelector("[data-pricing-class-empty]");
  if (!container || !emptyText) {
    return;
  }

  const serviceType = getServiceTypeFromRow(row, DEFAULT_SERVICE_TYPE);
  const isPickdrop = serviceType === "pickdrop";
  const classList = Array.isArray(classes) ? classes : [];
  const roomList = Array.isArray(rooms) ? rooms : [];
  const source = isPickdrop
    ? [
      ...classList.map((classItem) => ({
        id: classItem?.id,
        name: classItem?.name,
        type: "class",
      })),
      ...roomList.map((roomItem) => ({
        id: roomItem?.id,
        name: roomItem?.name,
        type: "room",
      })),
    ]
    : serviceType === "hoteling"
      ? roomList
      : classList;

  container.innerHTML = "";
  if (!Array.isArray(source) || source.length === 0) {
    if (serviceType === "hoteling") {
      emptyText.textContent = "연동할 호실이 없습니다.";
    } else if (serviceType === "pickdrop") {
      emptyText.textContent = "연동할 클래스/호실이 없습니다.";
    } else {
      emptyText.textContent = "연동할 클래스가 없습니다.";
    }
    emptyText.hidden = false;
    syncPricingClassSelectionState(row);
    return;
  }

  emptyText.hidden = true;
  source.forEach((classItem) => {
    const classRow = document.createElement("label");
    classRow.className = "class-ticket-row";
    classRow.dataset.pricingClass = "";
    classRow.tabIndex = 0;
    classRow.setAttribute("role", "button");
    classRow.setAttribute("aria-pressed", "false");
    if (isPickdrop) {
      const baseId = String(classItem.id ?? "");
      const type = classItem.type === "room" ? "room" : "class";
      classRow.dataset.classType = type;
      classRow.dataset.baseId = baseId;
      classRow.dataset.classId = type === "room"
        ? `${PICKDROP_ROOM_PREFIX}${baseId}`
        : baseId;
    } else {
      classRow.dataset.classId = String(classItem.id ?? "");
    }

    const name = document.createElement("span");
    name.className = "class-ticket-row__name";
    name.textContent = classItem.name || "-";

    classRow.appendChild(name);
    container.appendChild(classRow);
  });

  syncPricingClassSelectionState(row);
}

const setupPricingClassSelection = (classes, rooms, getServiceType) => {
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!rowsContainer) {
    return;
  }

  const toggleClassSelection = (classRow) => {
    if (!(classRow instanceof Element)) {
      return;
    }
    classRow.classList.toggle("is-checked");
    classRow.setAttribute(
      "aria-pressed",
      String(classRow.classList.contains("is-checked"))
    );
    const row = classRow.closest(".list-table__row");
    if (row) {
      syncPricingClassSelectionState(row);
      if (getServiceType() === "school") {
        applyServiceDefaultsToRow(row, "school", classes);
      }
    }
  };

  rowsContainer.addEventListener("pointerdown", (event) => {
    const classRow = event.target.closest("[data-pricing-class]");
    if (!classRow) {
      return;
    }
    // Handle row toggle here to avoid click+mousedown double toggles.
    event.preventDefault();
    toggleClassSelection(classRow);
  });

  rowsContainer.addEventListener("click", (event) => {
    const selectAll = event.target.closest("[data-pricing-class-select-all]");
    if (selectAll) {
      const row = selectAll.closest(".list-table__row");
      if (!row) {
        return;
      }
      const classRows = getPricingClassRows(row);
      if (!classRows.length) {
        return;
      }
      const shouldSelect = !classRows.every((classRow) =>
        classRow.classList.contains("is-checked")
      );
      classRows.forEach((classRow) => {
        classRow.classList.toggle("is-checked", shouldSelect);
      });
      syncPricingClassSelectionState(row);
      if (getServiceType() === "school") {
        applyServiceDefaultsToRow(row, "school", classes);
      }
      return;
    }

    // Row toggle is handled in pointerdown to prevent double-toggling on click.
  });

  rowsContainer.addEventListener("keydown", (event) => {
    const classRow = event.target.closest("[data-pricing-class]");
    if (!classRow) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleClassSelection(classRow);
  });
};

const setupPricingClassPopupPositioning = () => {
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!rowsContainer) {
    return;
  }

  let activeCell = null;

  const closePopup = () => {
    if (!activeCell) {
      return;
    }
    activeCell.classList.remove("is-popup-open");
    activeCell = null;
  };

  const positionPopup = (cell) => {
    if (!(cell instanceof HTMLElement)) {
      return;
    }

    const input = cell.querySelector("[data-pricing-class-input]");
    const popup = cell.querySelector("[data-pricing-class-popup]");
    if (!(input instanceof HTMLElement) || !(popup instanceof HTMLElement)) {
      return;
    }

    const spacing = 6;
    const viewportPadding = 8;
    const inputRect = input.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const popupWidth = popupRect.width || 320;
    const popupHeight = popupRect.height || 220;

    let left = inputRect.left;
    const maxLeft = window.innerWidth - popupWidth - viewportPadding;
    left = Math.min(Math.max(viewportPadding, left), Math.max(viewportPadding, maxLeft));

    let top = inputRect.bottom + spacing;
    if (top + popupHeight > window.innerHeight - viewportPadding) {
      top = inputRect.top - popupHeight - spacing;
    }
    if (top < viewportPadding) {
      top = viewportPadding;
    }

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  };

  const openPopup = (cell) => {
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    if (activeCell && activeCell !== cell) {
      activeCell.classList.remove("is-popup-open");
    }
    activeCell = cell;
    activeCell.classList.add("is-popup-open");
    window.requestAnimationFrame(() => {
      if (!activeCell || !document.body.contains(activeCell)) {
        closePopup();
        return;
      }
      positionPopup(activeCell);
    });
  };

  const positionActivePopup = () => {
    if (!activeCell) {
      return;
    }
    if (!document.body.contains(activeCell)) {
      closePopup();
      return;
    }
    positionPopup(activeCell);
  };

  rowsContainer.addEventListener("focusin", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const input = event.target.closest("[data-pricing-class-input]");
    if (!input) {
      return;
    }
    const cell = input.closest(".pricing-class-cell");
    if (!cell) {
      return;
    }
    openPopup(cell);
  });

  rowsContainer.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const input = event.target.closest("[data-pricing-class-input]");
    if (!input) {
      return;
    }
    const cell = input.closest(".pricing-class-cell");
    if (!cell) {
      return;
    }
    openPopup(cell);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!activeCell) {
      return;
    }
    if (event.target instanceof Element && event.target.closest(".pricing-class-cell") === activeCell) {
      return;
    }
    closePopup();
  });

  document.addEventListener("focusin", (event) => {
    if (!activeCell) {
      return;
    }
    if (event.target instanceof Element && event.target.closest(".pricing-class-cell") === activeCell) {
      return;
    }
    closePopup();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopup();
    }
  });

  window.addEventListener("resize", positionActivePopup);
  window.addEventListener("scroll", positionActivePopup, true);
};

const setupPricingSubmit = (onSaved, options = {}) => {
  const submitButton = document.querySelector("[data-pricing-submit]");
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!submitButton || !rowsContainer) {
    return;
  }

  const storage = initPricingStorage();
  const classStorage = initClassStorage();
  const getServiceType = options.getServiceType || (() => DEFAULT_SERVICE_TYPE);
  const classes = options.classes || [];

  submitButton.addEventListener("click", () => {
    applyServiceDefaultsToRows(rowsContainer, getServiceType(), classes);
    const items = createPricingItemsFromRows(rowsContainer);
    if (items.length === 0) {
      return;
    }

    const nextItems = storage.savePricingItems(items);
    const storedClasses = classStorage.ensureDefaults();
    const syncedClasses = syncClassesFromPricing(nextItems, storedClasses);
    classStorage.saveClasses(syncedClasses);
    if (typeof onSaved === "function") {
      onSaved();
    }
  });
};

const setupPricingDetailModal = (classes, rooms) => {
  const modal = document.querySelector("[data-pricing-detail-modal]");
  const overlay = modal?.querySelector("[data-pricing-detail-overlay]");
  const closeButton = modal?.querySelector("[data-pricing-detail-close]");
  const content = modal?.querySelector("[data-pricing-detail-content]");
  const rowsContainer = document.querySelector("[data-pricing-form-rows]");
  if (!modal || !overlay || !closeButton || !content || !rowsContainer) {
    return;
  }

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  const openModal = (item) => {
    renderPricingDetail(content, item, classes, rooms);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  rowsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pricing-detail-open]");
    if (!button) {
      return;
    }
    const row = button.closest(".list-table__row");
    const item = createPricingItemFromRow(row);
    if (item) {
      openModal(item);
    }
  });

  overlay.addEventListener("click", closeModal);
  closeButton.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const reservationStorage = initReservationStorage();
  const timeZone = getTimeZone();
  setupSidebarToggle({
    iconOpen: "../../assets/menuIcon_sidebar_open.svg",
    iconClose: "../../assets/menuIcon_sidebar_close.svg",
  });
  setupSidebarReservationBadges({ storage: reservationStorage, timeZone });
  setupPricingWeekdayChips();
  const classStorage = initClassStorage();
  const roomStorage = initHotelRoomStorage();
  const classes = classStorage.ensureDefaults();
  const rooms = roomStorage.ensureDefaults();
  loadPricingRowsFromStorage(classes, rooms);
  setupPricingPriceInputs();
  const { getServiceType } = setupPricingTabs(classes, rooms);
  setupPricingClassSelection(classes, rooms, getServiceType);
  setupPricingClassPopupPositioning();
  setupPricingRowAdd(classes, rooms, getServiceType);
  setupPricingRowDelete();
  setupPricingRowDuplicate(classes, rooms, getServiceType);
  setupPricingSubmit(() => {
    showToast("변경된 설정을 저장했습니다.");
  }, { getServiceType, classes });
  setupPricingDetailModal(classes, rooms);
});
