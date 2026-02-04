/**
 * pricing-service.js
 * - Normalize, serialize, and format pricing rows
 * - Convert DOM input rows into pricing data objects
 * Scope: pricing data helpers (no storage writes)
 */
import { formatNumberWithCommas, normalizeNumericInput } from "../utils/number.js";
import { formatPickdropType, normalizePickdropType } from "./ticket-service.js";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일", "공휴일"];
const PICKDROP_ROOM_PREFIX = "room:";
function normalizePickdropTypeValue(value) {
  return normalizePickdropType(value);
}

function ensureId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getInputValue(input) {
  return input?.value?.trim() || "";
}

function serializeRange(min, max) {
  if (!min && !max) {
    return "";
  }
  if (min && max) {
    return `${min}~${max}`;
  }
  if (min) {
    return `${min}~`;
  }
  return `~${max}`;
}

function parseRange(value) {
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

function getSelectedWeekdays(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(".filter-chip.is-selected"))
    .map((chip) => chip.textContent?.trim() || "")
    .filter(Boolean);
}

function getSelectedClassIds(row) {
  if (!row) {
    return [];
  }

  return Array.from(row.querySelectorAll("[data-pricing-class].is-checked"))
    .map((element) => element.dataset.classId || "")
    .filter(Boolean);
}

function isPricingRowEmpty(item) {
  if (item.serviceType === "pickdrop") {
    return (
      !item.pickdropType &&
      !item.distance &&
      !item.price &&
      !item.vatSeparate &&
      item.classIds.length === 0
    );
  }

  return (
    !item.weightMin &&
    !item.weightMax &&
    item.weekdays.length === 0 &&
    !item.price &&
    !item.vatSeparate &&
    item.classIds.length === 0
  );
}

export function createPricingItemFromRow(row) {
  if (!row) {
    return null;
  }

  const serviceType =
    getInputValue(row.querySelector("[data-pricing-service]")) || "school";
  const typeInput = row.querySelector("[data-pricing-pickdrop-type]");
  const pickdropType = normalizePickdropTypeValue(getInputValue(typeInput));
  const typeDefault = normalizePickdropTypeValue(
    typeInput?.dataset?.defaultSelect || ""
  );
  const distanceMin = getInputValue(
    row.querySelector("[data-pricing-distance-min]")
  );
  const distanceMax = getInputValue(
    row.querySelector("[data-pricing-distance-max]")
  );
  const distance = serializeRange(distanceMin, distanceMax);
  const weightMin = getInputValue(row.querySelector("[data-pricing-weight-min]"));
  const weightMax = getInputValue(row.querySelector("[data-pricing-weight-max]"));
  const weekdays = getSelectedWeekdays(
    row.querySelector(".pricing-weekday-chips")
  );
  const deductionValue = getInputValue(
    row.querySelector("[data-pricing-deduction-value]")
  );
  const deductionUnit = getInputValue(
    row.querySelector("[data-pricing-deduction-unit]")
  );
  const price = getInputValue(row.querySelector("[data-pricing-price]"));
  const vatSeparate = Boolean(row.querySelector("[data-pricing-vat]")?.checked);
  const classIds = getSelectedClassIds(row);

  const isPickdrop = serviceType === "pickdrop";
  const item = {
    id: ensureId(),
    serviceType,
    pickdropType: isPickdrop ? pickdropType : "",
    distance: isPickdrop ? distance : "",
    weightMin: isPickdrop ? "" : weightMin,
    weightMax: isPickdrop ? "" : weightMax,
    weekdays: isPickdrop ? [] : weekdays,
    deductionValue,
    deductionUnit,
    price,
    vatSeparate,
    classIds,
  };

  if (
    isPickdrop
    && typeDefault
    && item.pickdropType === typeDefault
    && !item.distance
    && !item.price
    && !item.vatSeparate
    && item.classIds.length === 0
  ) {
    item.pickdropType = "";
  }

  if (isPricingRowEmpty(item)) {
    return null;
  }

  return item;
}

export function createPricingItemsFromRows(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(".list-table__row"))
    .map((row) => createPricingItemFromRow(row))
    .filter(Boolean);
}

export function getWeekdayLabels() {
  return [...WEEKDAY_LABELS];
}

export function formatWeightRange(item = {}) {
  const min = item.weightMin || "";
  const max = item.weightMax || "";

  if (min && max) {
    return `${min} 이상 ~ ${max} 미만`;
  }

  if (min) {
    return `${min} 이상`;
  }

  if (max) {
    return `${max} 미만`;
  }

  return "-";
}

export function formatDeduction(item = {}) {
  const value = item.deductionValue || "";
  const unit = item.deductionUnit || "";

  if (!value && !unit) {
    return "-";
  }

  if (!value) {
    return unit || "-";
  }

  return unit ? `${value} ${unit}` : value;
}

export function formatPrice(item = {}) {
  const price = item.price || "";

  if (!price) {
    return "-";
  }

  const digits = normalizeNumericInput(price);
  if (!digits) {
    return "-";
  }
  return `${formatNumberWithCommas(digits)}원`;
}

export function formatVat(item = {}) {
  return item.vatSeparate ? "별도" : "-";
}

export function formatWeekdays(item = {}) {
  const weekdays = Array.isArray(item.weekdays) ? item.weekdays : [];
  if (weekdays.length === 0) {
    return "-";
  }

  return weekdays.join(", ");
}

export function formatPickdropTypeValue(item = {}) {
  return formatPickdropType(item.pickdropType || item.title) || "-";
}

export function formatDistance(item = {}) {
  const { min, max } = parseRange(item.distance || "");
  if (!min && !max) {
    return "-";
  }

  if (min && max) {
    return `${min} 이상 ~ ${max} 미만`;
  }

  if (min) {
    return `${min} 이상`;
  }

  return `${max} 미만`;
}

export function formatClassNames(item = {}, classes = [], rooms = []) {
  const classIds = Array.isArray(item.classIds) ? item.classIds : [];
  if (classIds.length === 0) {
    return "-";
  }

  if (item.serviceType === "pickdrop") {
    const classMap = new Map(
      (Array.isArray(classes) ? classes : []).map((classItem) => [
        String(classItem?.id ?? ""),
        classItem?.name || "-",
      ])
    );
    const roomMap = new Map(
      (Array.isArray(rooms) ? rooms : []).map((roomItem) => [
        `${PICKDROP_ROOM_PREFIX}${String(roomItem?.id ?? "")}`,
        roomItem?.name || "-",
      ])
    );
    const names = classIds
      .map((classId) => {
        const key = String(classId);
        return classMap.get(key) || roomMap.get(key) || "";
      })
      .filter(Boolean);

    return names.length ? names.join(", ") : "-";
  }

  const source = item.serviceType === "hoteling" ? rooms : classes;
  const classMap = new Map(
    (Array.isArray(source) ? source : []).map((classItem) => [
      String(classItem?.id ?? ""),
      classItem?.name || "-",
    ])
  );
  const names = classIds
    .map((classId) => classMap.get(String(classId)) || "")
    .filter(Boolean);

  return names.length ? names.join(", ") : "-";
}


