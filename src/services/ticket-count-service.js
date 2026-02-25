import { readStorageArray, writeStorageValue } from "../storage/storage-utils.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { getEntryTicketUsages } from "./ticket-usage-service.js";
import { getPickdropCountType, resolvePickdropTicketCountType } from "./pickdrop-policy.js";
import { PAYMENT_METHODS, normalizeReservationPayment } from "./reservation-payment.js";

const MEMBERS_KEY = "memberList";
const SERVICE_TYPES = ["school", "daycare", "hoteling", "oneway", "roundtrip"];

function createEmptyCountMap() {
  const map = {};
  SERVICE_TYPES.forEach((type) => {
    map[type] = 0;
  });
  return map;
}

function getReservationMemberId(reservation) {
  return String(reservation?.memberId || "").trim();
}

function resolveReservationServiceType(reservation, entry) {
  const type = String(reservation?.type || "school");
  if (type === "daycare") {
    return "daycare";
  }
  if (type === "hoteling") {
    return entry?.kind === "checkout" ? "" : "hoteling";
  }
  return "school";
}

function isTicketPaymentReservation(reservation) {
  if (!reservation?.payment || typeof reservation.payment !== "object") {
    return false;
  }
  const payment = normalizeReservationPayment(reservation.payment);
  return payment.method === PAYMENT_METHODS.TICKET;
}

/**
 * Recalculates used, reserved, and reservable counts for all tickets of all members
 * based on the current state of all reservations from the unified storage.
 */
export function recalculateTicketCounts() {
  const reservationStorage = initReservationStorage();

  // Use keys explicitly as they are stored in baseStatusKey
  const RESERVED_STATUSES = new Set(["PLANNED"]);
  const CANCELED_STATUSES = new Set(["CANCELED"]);
  // Keep ABSENT/NO_SHOW in used-count by policy (in addition to CHECKIN/CHECKOUT).
  const USED_STATUSES = new Set(["CHECKIN", "CHECKOUT", "ABSENT", "NO_SHOW"]);

  // 1. Read all data
  const members = readStorageArray(MEMBERS_KEY, { fallback: [] });
  const reservations = reservationStorage.loadReservations();

  if (!members.length) {
    return;
  }
  const reservationReservedByMember = new Map();
  members.forEach((member) => {
    reservationReservedByMember.set(String(member?.id || ""), createEmptyCountMap());
  });

  // 2. Create a map for quick ticket lookup and reset counts
  const ticketMap = new Map();
  for (const member of members) {
    if (!member.tickets) member.tickets = [];
    for (const ticket of member.tickets) {
      ticketMap.set(ticket.id, ticket);
      // Reset counts before recalculation
      ticket.usedCount = 0;
      ticket.reservedCount = 0;
    }
  }

  // 3. Process all reservations from the single source
  for (const reservation of reservations) {
    if (!isTicketPaymentReservation(reservation)) {
      continue;
    }
    const ownerMemberId = getReservationMemberId(reservation);
    if (!ownerMemberId) {
      continue;
    }
    if (!reservationReservedByMember.has(ownerMemberId)) {
      console.warn(`[ticket-count] Skipping reservation with unknown memberId: ${ownerMemberId}`);
      continue;
    }
    const reservedByType = reservationReservedByMember.get(ownerMemberId) || null;
    const reservationEntries = Array.isArray(reservation?.dates) ? reservation.dates : [];

    let reservationHasActiveEntry = false;
    let hotelingHasPickup = false;
    let hotelingHasDropoff = false;

    // Reservation count aggregates intentionally come from reservation/date status policy,
    // not from reservation.billing charges.
    for (const dateEntry of reservationEntries) {
      const statusKey = dateEntry?.baseStatusKey || "PLANNED";
      if (CANCELED_STATUSES.has(statusKey)) {
        continue;
      }
      reservationHasActiveEntry = true;
      const serviceType = resolveReservationServiceType(reservation, dateEntry);
      if (reservedByType && serviceType && reservedByType[serviceType] !== undefined) {
        reservedByType[serviceType] += 1;
      }
      if (reservation?.type === "hoteling") {
        hotelingHasPickup = hotelingHasPickup || Boolean(dateEntry?.pickup);
        hotelingHasDropoff = hotelingHasDropoff || Boolean(dateEntry?.dropoff);
      } else if (reservedByType) {
        const pickdropType = getPickdropCountType(dateEntry);
        if (pickdropType && reservedByType[pickdropType] !== undefined) {
          reservedByType[pickdropType] += 1;
        }
      }
    }

    if (reservedByType && reservation?.type === "hoteling" && reservationHasActiveEntry) {
      const hotelingPickdropType = getPickdropCountType({
        pickup: hotelingHasPickup,
        dropoff: hotelingHasDropoff,
      });
      if (hotelingPickdropType && reservedByType[hotelingPickdropType] !== undefined) {
        reservedByType[hotelingPickdropType] += 1;
      }
    }

    for (const dateEntry of reservationEntries) {
      const usages = getEntryTicketUsages(dateEntry);
      if (usages.length === 0) continue;

      for (const usage of usages) {
        const ticketId = usage?.ticketId;
        if (!ticketId) continue;

        const ticket = ticketMap.get(ticketId);
        if (!ticket) continue;

        // Use baseStatusKey which contains the unified status KEY (e.g., "PLANNED")
        const statusKey = dateEntry.baseStatusKey || "PLANNED";

        if (RESERVED_STATUSES.has(statusKey)) {
          ticket.reservedCount++;
        } else if (USED_STATUSES.has(statusKey)) {
          ticket.usedCount++;
        }
      }
    }
  }

  // 4. Calculate the final reservableCount for all tickets AND aggregate by type
  for (const member of members) {
    const ticketTotalCountAggregates = {};
    const remainingAggregates = {};
    const reservedAggregates = reservationReservedByMember.get(String(member?.id || "")) || createEmptyCountMap();
    SERVICE_TYPES.forEach(type => {
      ticketTotalCountAggregates[type] = 0;
      remainingAggregates[type] = 0;
    });

    for (const ticket of member.tickets) {
      const totalCount = Number(ticket.totalCount) || 0;
      const usedCount = Number(ticket.usedCount) || 0;
      const reservedCount = Number(ticket.reservedCount) || 0;
      const reservableCount = totalCount - (usedCount + reservedCount);
      const remainingCount = totalCount - usedCount;
      ticket.reservableCount = reservableCount;

      const type = ticket.type === "pickdrop"
        ? resolvePickdropTicketCountType(ticket)
        : (ticket.type || "school");
      if (ticketTotalCountAggregates[type] !== undefined) {
        ticketTotalCountAggregates[type] += totalCount;
        remainingAggregates[type] += remainingCount;
      }
    }

    // Always synchronize member aggregates from ticket data.
    if (!member.totalReservableCountByType) member.totalReservableCountByType = {};
    if (!member.remainingCountByType) member.remainingCountByType = {};
    if (!member.totalReservedCountByType) member.totalReservedCountByType = {};

    SERVICE_TYPES.forEach(type => {
      member.totalReservableCountByType[type] =
        ticketTotalCountAggregates[type] - reservedAggregates[type];
      member.remainingCountByType[type] = remainingAggregates[type];
      member.totalReservedCountByType[type] = reservedAggregates[type];
    });
  }

  // 5. Write the updated members list back to storage
  writeStorageValue(MEMBERS_KEY, members);
}
