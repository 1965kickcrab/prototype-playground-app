import { readStorageValue, writeStorageValue } from "./storage-utils.js";

const STORAGE_NAMESPACE = "daycare-operations";
const STORAGE_KEY = `${STORAGE_NAMESPACE}:settings`;

const DEFAULT_WEEKLY = Object.freeze({
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: true,
  sun: true,
});

const DEFAULT_DAYCARE_PRICING = Object.freeze({
  hourlyRate: 0,
  billingUnit: 60,
});

const DEFAULT_RESERVATION_POLICY = Object.freeze({
  type: "days",
  days: 1,
  time: "23:59",
});

const DEFAULT_CANCELLATION_POLICY = Object.freeze({
  type: "days",
  days: 2,
  time: "23:59",
});

const DEFAULT_RESERVATION_OPEN = Object.freeze({
  enabled: false,
  day: "",
  time: "00:00",
  length: 4,
  unit: "week",
});

function normalizePolicy(policy = {}, defaults) {
  const type = typeof policy.type === "string" ? policy.type : defaults.type;
  const daysValue = Number(policy.days);
  const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : defaults.days;
  const time = typeof policy.time === "string" && policy.time ? policy.time : defaults.time;

  return {
    type,
    days,
    time,
  };
}

function normalizeReservationOpen(data = {}) {
  const enabled = Boolean(data.enabled);
  const day = typeof data.day === "string" ? data.day : DEFAULT_RESERVATION_OPEN.day;
  const time = typeof data.time === "string" && data.time ? data.time : DEFAULT_RESERVATION_OPEN.time;
  const lengthValue = Number(data.length);
  const length = Number.isFinite(lengthValue) && lengthValue > 0
    ? lengthValue
    : DEFAULT_RESERVATION_OPEN.length;
  const unit = ["day", "week", "month"].includes(data.unit)
    ? data.unit
    : DEFAULT_RESERVATION_OPEN.unit;

  return {
    enabled,
    day,
    time,
    length,
    unit,
  };
}

function normalizeSettings(data = {}) {
  const weekly = { ...DEFAULT_WEEKLY, ...(data.weekly || {}) };
  const publicHolidayOff = Boolean(data.publicHolidayOff);
  const tempDayoffs = Array.isArray(data.tempDayoffs) ? data.tempDayoffs : [];
  const tempDayoffExceptions = Array.isArray(data.tempDayoffExceptions)
    ? data.tempDayoffExceptions
    : [];
  const pricing = data.daycarePricing || {};

  return {
    weekly,
    publicHolidayOff,
    tempDayoffs: Array.from(new Set(tempDayoffs)),
    tempDayoffExceptions: Array.from(new Set(tempDayoffExceptions)),
    reservationPolicy: normalizePolicy(data.reservationPolicy, DEFAULT_RESERVATION_POLICY),
    cancellationPolicy: normalizePolicy(data.cancellationPolicy, DEFAULT_CANCELLATION_POLICY),
    reservationOpen: normalizeReservationOpen(data.reservationOpen),
    daycarePricing: {
      hourlyRate: Number(pricing.hourlyRate) || DEFAULT_DAYCARE_PRICING.hourlyRate,
      billingUnit: Number(pricing.billingUnit) || DEFAULT_DAYCARE_PRICING.billingUnit,
    },
  };
}

function readSettings(storage) {
  const parsed = readStorageValue(STORAGE_KEY, {
    storage,
    fallback: null,
    onError: (error) => {
      console.error("Failed to read operations settings", error);
    },
  });
  if (!parsed) {
    return normalizeSettings();
  }
  return normalizeSettings(parsed);
}

function writeSettings(storage, settings) {
  writeStorageValue(STORAGE_KEY, settings, {
    storage,
    onError: (error) => {
      console.error("Failed to save operations settings", error);
    },
  });
}

export function initOperationsStorage() {
  const storage = window.localStorage;

  return {
    loadSettings() {
      return readSettings(storage);
    },
    saveSettings(settings) {
      const normalized = normalizeSettings(settings);
      writeSettings(storage, normalized);
      return normalized;
    },
  };
}
