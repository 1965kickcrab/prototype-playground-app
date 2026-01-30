import { readStorageValue, writeStorageValue } from "./storage-utils.js";

const STORAGE_NAMESPACE = "daycare-reservations";

const STATUS = Object.freeze({
  PLANNED: "예약",
  CHECKIN: "등원",
  CHECKOUT: "하원",
  ABSENT: "결석",
  CANCELED: "예약 취소",
});

const STATUS_OPTIONS = Object.freeze([
  STATUS.PLANNED,
  STATUS.CHECKIN,
  STATUS.CHECKOUT,
  STATUS.ABSENT,
  STATUS.CANCELED,
]);

const STORAGE_KEY = `${STORAGE_NAMESPACE}:reservations`;

function resolveStatus(baseStatus) {
  return baseStatus;
}

function normalizeTicketUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const ticketId = String(usage.ticketId ?? "");
  const sequence = Number(usage.sequence);
  if (!ticketId || !Number.isFinite(sequence) || sequence <= 0) {
    return null;
  }
  return { ticketId, sequence };
}

function normalizePickdrop(pickdrop, fallback = {}) {
  if (!pickdrop || typeof pickdrop !== "object") {
    return {
      pickup: Boolean(fallback.hasPickup),
      dropoff: Boolean(fallback.hasDropoff),
    };
  }
  return {
    pickup: Boolean(pickdrop.pickup),
    dropoff: Boolean(pickdrop.dropoff),
  };
}

function ensureId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeReservation(item = {}) {
  const defaultStatusKey = item.baseStatusKey || "PLANNED";
  const defaultStatusText = item.statusText || "";
  const defaultClass = item.class || item.service || "";
  const defaultService = item.service || item.class || "";
  const defaultCheckin = item.checkinTime || "";
  const defaultCheckout = item.checkoutTime || "";
  const defaultFee = Number(item.daycareFee) || 0;
  const dates = Array.isArray(item.dates) && item.dates.length > 0
    ? item.dates
    : item.date
      ? [
          {
            date: item.date,
            class: defaultClass,
            service: defaultService,
            baseStatusKey: defaultStatusKey,
            statusText: defaultStatusText,
            checkinTime: defaultCheckin,
            checkoutTime: defaultCheckout,
            daycareFee: defaultFee,
            ticketUsage: normalizeTicketUsage(item.ticketUsage),
          },
        ]
      : [];
  return {
    id: item.id || ensureId(),
    class: defaultClass,
    service: defaultService,
    baseStatusKey: defaultStatusKey,
    statusText: defaultStatusText,
    dogName: item.dogName || "",
    breed: item.breed || "",
    owner: item.owner || "",
    memo: item.memo || "",
    checkinTime: defaultCheckin,
    checkoutTime: defaultCheckout,
    daycareFee: defaultFee,
    hasPickup: Boolean(item.hasPickup),
    hasDropoff: Boolean(item.hasDropoff),
    pickupChecked:
      typeof item.pickupChecked === "boolean"
        ? item.pickupChecked
        : Boolean(item.hasPickup),
    dropoffChecked:
      typeof item.dropoffChecked === "boolean"
        ? item.dropoffChecked
        : Boolean(item.hasDropoff),
    address: item.address || "",
    dates: dates.map((entry) => ({
      date: entry?.date || "",
      class: entry?.class ?? defaultClass,
      service: entry?.service ?? defaultService,
      baseStatusKey: entry?.baseStatusKey ?? defaultStatusKey,
      statusText: entry?.statusText ?? defaultStatusText,
      checkinTime: entry?.checkinTime ?? defaultCheckin,
      checkoutTime: entry?.checkoutTime ?? defaultCheckout,
      daycareFee: Number(entry?.daycareFee ?? defaultFee) || 0,
      ticketUsage: normalizeTicketUsage(entry?.ticketUsage),
      pickdrop: normalizePickdrop(entry?.pickdrop, item),
    })),
    ticketUsage: normalizeTicketUsage(item.ticketUsage),
  };
}

function readReservations(storage) {
  const parsed = readStorageValue(STORAGE_KEY, {
    storage,
    fallback: [],
    onError: (error) => {
      console.error("Failed to read reservations", error);
    },
  });
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((item) => normalizeReservation(item));
}

function writeReservations(storage, reservations) {
  writeStorageValue(STORAGE_KEY, reservations, {
    storage,
    onError: (error) => {
      console.error("Failed to save reservations", error);
    },
  });
}

function saveReservations(storage, reservations) {
  const normalized = Array.isArray(reservations)
    ? reservations.map((item) => normalizeReservation(item))
    : [];
  writeReservations(storage, normalized);
  return normalized;
}

function addReservations(storage, reservationsToAdd = []) {
  const existing = readReservations(storage);
  const next = [...existing, ...reservationsToAdd.map((item) => normalizeReservation(item))];
  writeReservations(storage, next);
  return next;
}

function updateReservation(storage, id, updater) {
  if (!id || typeof updater !== "function") {
    return readReservations(storage);
  }
  const existing = readReservations(storage);
  const next = existing.map((item) => {
    if (item.id !== id) {
      return item;
    }
    return normalizeReservation(updater(item));
  });
  writeReservations(storage, next);
  return next;
}

export function initStorage() {
  const storage = window.localStorage;

  return {
    namespace: STORAGE_NAMESPACE,
    STATUS,
    getStorage() {
      return storage;
    },
    getStatusOptions() {
      return STATUS_OPTIONS;
    },
    resolveStatus(baseStatus, services) {
      return resolveStatus(baseStatus, services);
    },
    loadReservations() {
      return readReservations(storage);
    },
    saveReservations(reservations) {
      return saveReservations(storage, reservations);
    },
    addReservations(reservations) {
      return addReservations(storage, reservations);
    },
    updateReservation(id, updater) {
      return updateReservation(storage, id, updater);
    },
  };
}
