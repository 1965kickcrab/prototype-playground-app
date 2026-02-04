import { readStorageArray, writeStorageValue } from "./storage-utils.js";
import { createId } from "../utils/id.js";

const UNIFIED_STORAGE_KEY = "reservations";

// Unified status keys mapped to Display Labels (Korean).
// list.js expects STATUS values to be the display labels for tone mapping.
const STATUS = Object.freeze({
  // Daycare statuses
  PLANNED: "예약",
  CHECKIN: "등원",
  CHECKOUT: "하원",
  ABSENT: "결석",
  CANCELED: "예약 취소",
  // Hoteling specific
  NO_SHOW: "노쇼",
});

// Map legacy text/keys/labels to Unified KEYS (e.g. "PLANNED")
const STATUS_KEY_MAP = {
    "예약": "PLANNED",
    "입실 예정": "PLANNED",
    "PLANNED": "PLANNED",
    
    "등원": "CHECKIN",
    "입실": "CHECKIN",
    "CHECKIN": "CHECKIN",
    
    "하원": "CHECKOUT",
    "퇴실": "CHECKOUT",
    "CHECKOUT": "CHECKOUT",
    
    "결석": "ABSENT",
    "ABSENT": "ABSENT",
    
    "예약 취소": "CANCELED",
    "CANCELED": "CANCELED",
    
    "노쇼": "NO_SHOW",
    "NO_SHOW": "NO_SHOW"
};


function normalizeTicketUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const ticketId = String(usage.ticketId ?? "");
  const sequence = Number(usage.sequence);
  if (!ticketId || !Number.isFinite(sequence) || sequence <= 0) return null;
  return { ticketId, sequence };
}

function normalizeTicketUsages(value, fallbackSingle = null) {
  if (Array.isArray(value)) {
    return value
      .map((usage) => normalizeTicketUsage(usage))
      .filter(Boolean);
  }
  const single = normalizeTicketUsage(value ?? fallbackSingle);
  return single ? [single] : [];
}

function normalizePickdropFlags(entry = {}, fallback = {}) {
  return {
    pickup: Boolean(
      entry.pickup
      ?? entry?.pickdrop?.pickup
      ?? fallback.pickup
      ?? fallback.hasPickup
      ?? false
    ),
    dropoff: Boolean(
      entry.dropoff
      ?? entry?.pickdrop?.dropoff
      ?? fallback.dropoff
      ?? fallback.hasDropoff
      ?? false
    ),
  };
}

function normalizeTimeOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Normalizes a reservation from either the old daycare or old hoteling format
 * into the new unified format.
 */
function normalizeReservation(item = {}) {
  const isHoteling = item.type === "hoteling" || item.room;
  const id = item.id || createId();

  let type, dates, service, room, memo;

  if (isHoteling) {
    type = 'hoteling';
    room = item.room || "";
    service = null;
    memo = item.memo || "";

    // Resolve status to KEY
    const rawStatus = item.status;
    const topLevelStatusKey = STATUS_KEY_MAP[rawStatus] || "PLANNED";

    dates = (item.dates || []).map(d => {
        const entryRawStatus = d.baseStatusKey || d.statusText || d.status || rawStatus;
        const entryStatusKey = STATUS_KEY_MAP[entryRawStatus] || topLevelStatusKey;
        return {
            date: d.date,
            kind: d.kind, // 'checkin', 'checkout', 'stay'
            baseStatusKey: entryStatusKey,
            statusText: STATUS[entryStatusKey], // Ensure statusText is set
            ticketUsages: normalizeTicketUsages(d.ticketUsages, d.ticketUsage),
            ...normalizePickdropFlags(d, item),
            checkinTime: normalizeTimeOrNull(
              d.checkinTime
                ?? (d.kind === "checkin" ? d.time : null)
                ?? (d.kind === "checkin" ? item.checkinTime : null)
            ),
            checkoutTime: normalizeTimeOrNull(
              d.checkoutTime
                ?? (d.kind === "checkout" ? d.time : null)
                ?? (d.kind === "checkout" ? item.checkoutTime : null)
            ),
        };
    });
    
  } else { // Is Daycare
    type = item.type || 'daycare';
    room = null;
    service = item.service || item.class || "";
    memo = item.memo || "";

    dates = (item.dates || []).map(d => {
        // Resolve status to KEY
        // Prioritize baseStatusKey, then statusText, then fallback
        const rawStatus = d.baseStatusKey || d.statusText;
        const statusKey = STATUS_KEY_MAP[rawStatus] || "PLANNED";
        
        return {
            date: d.date,
            service: d.service || service,
            baseStatusKey: statusKey,
            statusText: STATUS[statusKey], // Ensure statusText is synced with key
            ticketUsages: normalizeTicketUsages(d.ticketUsages, d.ticketUsage),
            ...normalizePickdropFlags(d, item),
            checkinTime: normalizeTimeOrNull(d.checkinTime ?? item.checkinTime),
            checkoutTime: normalizeTimeOrNull(d.checkoutTime ?? item.checkoutTime),
        };
    });
  }

  return {
    id,
    type,
    dogName: item.dogName || "",
    owner: item.owner || "",
    breed: item.breed || "",
    memo,
    service,
    room,
    dates,
  };
}

function readReservations() {
  return readStorageArray(UNIFIED_STORAGE_KEY);
}

function writeReservations(reservations) {
  writeStorageValue(UNIFIED_STORAGE_KEY, reservations);
}

export function initReservationStorage() {
  return {
    STATUS,
    resolveStatus(status) {
        return status;
    },
    loadReservations: readReservations,
    saveReservations(reservations) {
      const normalized = Array.isArray(reservations)
        ? reservations.map(normalizeReservation)
        : [];
      writeReservations(normalized);
      return normalized;
    },
    addReservation(reservation) {
        const existing = readReservations();
        const normalized = normalizeReservation(reservation);
        const next = [...existing, normalized];
        writeReservations(next);
        return next;
    },
    updateReservation(id, updater) {
        if (!id || typeof updater !== 'function') {
            return readReservations();
        }
        const existing = readReservations();
        const next = existing.map(item => {
            if (item.id !== id) return item;
            // The updater provides the complete new version of the item
            const updatedItem = updater(item);
            // Re-normalize to ensure data integrity
            return normalizeReservation(updatedItem);
        });
        writeReservations(next);
        return next;
    }
  };
}
