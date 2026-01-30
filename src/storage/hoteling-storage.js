import { readStorageValue, writeStorageValue } from "./storage-utils.js";
import {
  buildHotelingDateEntries,
  HOTELING_STATUS,
} from "../services/hoteling-reservation-service.js";
import { createId } from "../utils/id.js";

const STORAGE_NAMESPACE = "hoteling-reservations";
const STORAGE_KEY = `${STORAGE_NAMESPACE}:reservations`;

const DEFAULT_TIME = "10:00";

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

function normalizeDates(item) {
  if (Array.isArray(item.dates) && item.dates.length > 0) {
    return item.dates
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        date: entry.date || "",
        kind: entry.kind || "stay",
        ticketUsage: normalizeTicketUsage(entry.ticketUsage),
        pickdrop: entry.pickdrop && typeof entry.pickdrop === "object"
          ? {
              pickup: Boolean(entry.pickdrop.pickup),
              dropoff: Boolean(entry.pickdrop.dropoff),
            }
          : {
              pickup: Boolean(item.hasPickup),
              dropoff: Boolean(item.hasDropoff),
            },
      }))
      .filter((entry) => entry.date);
  }
  return buildHotelingDateEntries(item.checkinDate, item.checkoutDate);
}

function normalizePickdropUsage(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => ({
      ticketId: String(entry?.ticketId ?? ""),
      count: Number(entry?.count) || 0,
    }))
    .filter((entry) => entry.ticketId && Number(entry.count) > 0);
}

function normalizeReservation(item = {}) {
  const status =
    typeof item.status === "string" && item.status
      ? item.status
      : HOTELING_STATUS.PLANNED;
  const checkinDate = item.checkinDate || "";
  const checkoutDate = item.checkoutDate || "";
  const checkinTime = item.checkinTime || DEFAULT_TIME;
  const checkoutTime = item.checkoutTime || DEFAULT_TIME;

  return {
    id: item.id || createId(),
    type: "hoteling",
    room: item.room || "",
    dogName: item.dogName || "",
    breed: item.breed || "",
    owner: item.owner || "",
    memo: item.memo || "",
    status,
    checkinDate,
    checkoutDate,
    checkinTime,
    checkoutTime,
    hasPickup: Boolean(item.hasPickup),
    hasDropoff: Boolean(item.hasDropoff),
    pickdropTicketUsage: normalizePickdropUsage(item.pickdropTicketUsage),
    dates: normalizeDates({
      ...item,
      status,
      checkinDate,
      checkoutDate,
    }),
  };
}

function readReservations(storage) {
  const parsed = readStorageValue(STORAGE_KEY, {
    storage,
    fallback: [],
    onError: (error) => {
      console.error("Failed to read hoteling reservations", error);
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
      console.error("Failed to save hoteling reservations", error);
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
  const next = [
    ...existing,
    ...reservationsToAdd.map((item) => normalizeReservation(item)),
  ];
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

export function initHotelingStorage() {
  const storage = window.localStorage;

  return {
    namespace: STORAGE_NAMESPACE,
    getStorage() {
      return storage;
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
