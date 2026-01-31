import { readStorageArray, writeStorageValue } from "./storage-utils.js";
import { createId } from "../utils/id.js";

const UNIFIED_STORAGE_KEY = "reservations";

// Unified status keys.
const STATUS = Object.freeze({
  // Daycare statuses
  PLANNED: "PLANNED", // '예약' / '입실 예정'
  CHECKIN: "CHECKIN", // '등원' / '입실'
  CHECKOUT: "CHECKOUT", // '하원' / '퇴실'
  ABSENT: "ABSENT", // '결석'
  CANCELED: "CANCELED", // '예약 취소'
  // Hoteling specific
  NO_SHOW: "NO_SHOW", // '노쇼'
});

const DAYCARE_STATUS_MAP = {
    "예약": STATUS.PLANNED,
    "등원": STATUS.CHECKIN,
    "하원": STATUS.CHECKOUT,
    "결석": STATUS.ABSENT,
    "예약 취소": STATUS.CANCELED,
};

const STATUS_MAP = {
    "입실 예정": STATUS.PLANNED,
    "입실": STATUS.CHECKIN,
    "퇴실": STATUS.CHECKOUT,
    "예약 취소": STATUS.CANCELED,
    "노쇼": STATUS.NO_SHOW,
};


function normalizeTicketUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const ticketId = String(usage.ticketId ?? "");
  const sequence = Number(usage.sequence);
  if (!ticketId || !Number.isFinite(sequence) || sequence <= 0) return null;
  return { ticketId, sequence };
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

    // Convert top-level status to per-date status
    const topLevelStatusKey = STATUS_MAP[item.status] || STATUS.PLANNED;

    dates = (item.dates || []).map(d => ({
        date: d.date,
        kind: d.kind, // 'checkin', 'checkout', 'stay'
        status: topLevelStatusKey,
        ticketUsage: normalizeTicketUsage(d.ticketUsage),
        time: d.kind === 'checkin' ? item.checkinTime : (d.kind === 'checkout' ? item.checkoutTime : null)
    }));
    
  } else { // Is Daycare
    type = 'daycare';
    room = null;
    service = item.service || item.class || "";
    memo = item.memo || "";

    dates = (item.dates || []).map(d => ({
        date: d.date,
        service: d.service || service,
        // Convert old status representation to new unified keys
        status: d.baseStatusKey || DAYCARE_STATUS_MAP[d.statusText] || STATUS.PLANNED,
        ticketUsage: normalizeTicketUsage(d.ticketUsage)
    }));
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

/**
 * One-time migration function to move from old data structure to the new unified one.
 */
export function migrateToUnifiedReservations() {
    const MIGRATION_FLAG_KEY = "reservation_migration_complete_v1";
    const OLD_DAYCARE_KEY = "daycare-reservations:reservations";
    const OLD_HOTELING_KEY = "hoteling-reservations:reservations";

    if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
        return; // Migration already done
    }

    const oldDaycareData = readStorageArray(OLD_DAYCARE_KEY, { fallback: [] });
    const oldHotelingData = readStorageArray(OLD_HOTELING_KEY, { fallback: [] });

    if (oldDaycareData.length === 0 && oldHotelingData.length === 0) {
        // No old data to migrate, just set flag and exit
        localStorage.setItem(MIGRATION_FLAG_KEY, "true");
        return;
    }

    const normalizedDaycare = oldDaycareData.map(item => normalizeReservation(item));
    const normalizedHoteling = oldHotelingData.map(item => normalizeReservation(item));

    const allReservations = [...normalizedDaycare, ...normalizedHoteling];

    writeReservations(allReservations);

    // Clean up old data
    localStorage.removeItem(OLD_DAYCARE_KEY);
    localStorage.removeItem(OLD_HOTELING_KEY);

    // Set flag to prevent re-running
    localStorage.setItem(MIGRATION_FLAG_KEY, "true");
    console.log("Reservation data migration complete.");
}