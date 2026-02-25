import { getDatePartsFromKey, getWeekdayIndex } from "../utils/date.js";
import { normalizePickdropType } from "./ticket-service.js";
import {
  calculateDaycareBillingUnits,
  getDaycareDurationMinutes,
} from "./daycare-duration.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function toAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(Math.round(numeric), 0);
}

function parsePriceValue(value) {
  const digits = String(value ?? "").replace(/[^0-9-]/g, "");
  if (!digits) {
    return null;
  }
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRangeValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLinkedClassId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("room:")) {
    return raw.slice(5);
  }
  if (raw.startsWith("class:")) {
    return raw.slice(6);
  }
  return raw;
}

function matchesWeightRange(item, memberWeight) {
  if (!Number.isFinite(memberWeight)) {
    return true;
  }
  const minValue = parseRangeValue(item?.weightMin);
  const maxValue = parseRangeValue(item?.weightMax);
  if (minValue !== null && memberWeight < minValue) {
    return false;
  }
  if (maxValue !== null && memberWeight > maxValue) {
    return false;
  }
  return true;
}

function matchesWeekday(item, dateKey, timeZone) {
  const weekdays = Array.isArray(item?.weekdays) ? item.weekdays : [];
  if (weekdays.length === 0) {
    return true;
  }
  const parts = getDatePartsFromKey(dateKey);
  if (!parts) {
    return false;
  }
  const index = getWeekdayIndex(parts.year, parts.month - 1, parts.day, timeZone);
  const label = WEEKDAY_LABELS[index] || "";
  return weekdays.includes(label);
}

function resolvePickdropPrice(pricingItems, pickup, dropoff) {
  const hasPickup = Boolean(pickup);
  const hasDropoff = Boolean(dropoff);
  if (!hasPickup && !hasDropoff) {
    return { type: "", amount: 0 };
  }
  const targetType = hasPickup && hasDropoff ? "왕복" : "편도";
  const pickdropItems = (Array.isArray(pricingItems) ? pricingItems : []).filter(
    (item) => item?.serviceType === "pickdrop"
  );
  const target = pickdropItems.find(
    (item) => normalizePickdropType(item?.pickdropType || item?.title) === targetType
  );
  const amount = parsePriceValue(target?.price);
  return {
    type: targetType === "왕복" ? "roundtrip" : "oneway",
    amount: amount === null ? 0 : amount,
  };
}

export function createDateEntryFee(raw = {}) {
  const school = toAmount(raw.school);
  const daycare = toAmount(raw.daycare);
  const hoteling = toAmount(raw.hoteling);
  const oneway = toAmount(raw.oneway);
  const roundtrip = toAmount(raw.roundtrip);
  return {
    expected: school + daycare + hoteling + oneway + roundtrip,
    school,
    daycare,
    hoteling,
    oneway,
    roundtrip,
  };
}

export function getDateEntryFeeExpected(fee) {
  return createDateEntryFee(fee).expected;
}

export function sumDateEntryFeeExpected(dates) {
  if (!Array.isArray(dates)) {
    return 0;
  }
  return dates.reduce(
    (total, entry) => total + getDateEntryFeeExpected(entry?.fee),
    0
  );
}

export function calculateDateEntryFee({
  dateKey,
  serviceType,
  classId,
  checkinTime,
  checkoutTime,
  pickup,
  dropoff,
  pricingItems,
  memberWeight,
  timeZone,
}) {
  const fee = createDateEntryFee();
  const resolvedServiceType = String(serviceType || "").trim();
  const items = Array.isArray(pricingItems) ? pricingItems : [];
  const hasDateKey = typeof dateKey === "string" && dateKey.length > 0;
  const weight = Number.isFinite(Number(memberWeight))
    ? Number(memberWeight)
    : null;

  if (
    resolvedServiceType === "school"
    || resolvedServiceType === "daycare"
    || resolvedServiceType === "hoteling"
  ) {
    const durationMinutes = resolvedServiceType === "daycare"
      ? getDaycareDurationMinutes(checkinTime, checkoutTime)
      : null;
    const serviceFee = items.reduce((sum, item) => {
      if (item?.serviceType !== resolvedServiceType) {
        return sum;
      }
      const classIds = Array.isArray(item?.classIds)
        ? item.classIds.map((id) => normalizeLinkedClassId(id))
        : [];
      const normalizedClassId = normalizeLinkedClassId(classId);
      if (classIds.length > 0 && !classIds.includes(normalizedClassId)) {
        return sum;
      }
      if (!matchesWeightRange(item, weight)) {
        return sum;
      }
      if (hasDateKey && !matchesWeekday(item, dateKey, timeZone)) {
        return sum;
      }
      const price = parsePriceValue(item?.price);
      if (price === null) {
        return sum;
      }
      if (resolvedServiceType !== "daycare") {
        return sum + Math.max(price, 0);
      }
      const units = calculateDaycareBillingUnits({
        durationMinutes,
        deductionValue: item?.deductionValue,
        deductionUnit: item?.deductionUnit,
      });
      if (!Number.isFinite(units) || units <= 0) {
        return sum;
      }
      return sum + Math.max(price, 0) * units;
    }, 0);
    fee[resolvedServiceType] = toAmount(serviceFee);
  }

  const pickdrop = resolvePickdropPrice(items, pickup, dropoff);
  if (pickdrop.type) {
    fee[pickdrop.type] = toAmount(pickdrop.amount);
  }

  return createDateEntryFee(fee);
}
