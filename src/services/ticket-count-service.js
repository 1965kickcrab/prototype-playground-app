import { readStorageArray, writeStorageValue } from "../storage/storage-utils.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { getEntryTicketUsages } from "./ticket-usage-service.js";
import { getPickdropCountType, resolvePickdropTicketCountType } from "./pickdrop-policy.js";
import { PAYMENT_METHODS, normalizeReservationPayment } from "./reservation-payment.js";
import {
  addValidityToDateKey,
  getTicketReservedValue,
  getTicketTotalValue,
  getTicketUsedValue,
} from "./ticket-service.js";
import { getDaycareDurationMinutes } from "./daycare-duration.js";

const MEMBERS_KEY = "memberList";
const TICKETS_KEY = "ticketList";
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

function getDaycareUsageUnits(entry = {}) {
  const durationMinutes = getDaycareDurationMinutes(
    entry?.checkinTime || "",
    entry?.checkoutTime || ""
  );
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationMinutes / 60));
}

function isTicketPaymentReservation(reservation) {
  if (!reservation?.payment || typeof reservation.payment !== "object") {
    return false;
  }
  const payment = normalizeReservationPayment(reservation.payment);
  return payment.method === PAYMENT_METHODS.TICKET;
}

function getDateKeyFromDateTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function createTicketDateUsageAccumulator(member) {
  const map = new Map();
  const tickets = Array.isArray(member?.tickets) ? member.tickets : [];
  tickets.forEach((ticket) => {
    const ticketId = String(ticket?.id || "").trim();
    if (!ticketId) {
      return;
    }
    map.set(ticketId, {
      firstReservationDate: "",
      firstAttendanceDate: "",
    });
  });
  return map;
}

function updateTicketStartDateAccumulator(accumulator, reservation, entry) {
  if (!(accumulator instanceof Map)) {
    return;
  }
  const statusKey = String(entry?.baseStatusKey || "PLANNED").trim();
  if (statusKey === "CANCELED") {
    return;
  }
  const usages = getEntryTicketUsages(entry);
  if (usages.length === 0) {
    return;
  }
  const reservationDateKey = getDateKeyFromDateTime(
    reservation?.createdAt || reservation?.createdDate || reservation?.createdDateKey
  );
  const attendanceDateKey = String(entry?.date || "").trim();
  usages.forEach((usage) => {
    const ticketId = String(usage?.ticketId || "").trim();
    if (!ticketId || !accumulator.has(ticketId)) {
      return;
    }
    const current = accumulator.get(ticketId);
    if (reservationDateKey && (!current.firstReservationDate || reservationDateKey < current.firstReservationDate)) {
      current.firstReservationDate = reservationDateKey;
    }
    if (attendanceDateKey && (!current.firstAttendanceDate || attendanceDateKey < current.firstAttendanceDate)) {
      current.firstAttendanceDate = attendanceDateKey;
    }
  });
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
  const ticketCatalog = readStorageArray(TICKETS_KEY, { fallback: [] });
  const reservations = reservationStorage.loadReservations();

  if (!members.length) {
    return;
  }
  const reservationReservedByMember = new Map();
  const startDateByMemberTicket = new Map();
  members.forEach((member) => {
    reservationReservedByMember.set(String(member?.id || ""), createEmptyCountMap());
    startDateByMemberTicket.set(
      String(member?.id || ""),
      createTicketDateUsageAccumulator(member)
    );
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
      ticket.usedHours = 0;
      ticket.reservedHours = 0;
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
    const ticketDateAccumulator = startDateByMemberTicket.get(ownerMemberId) || null;
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
      const serviceUnits = serviceType === "daycare"
        ? getDaycareUsageUnits(dateEntry)
        : 1;
      if (reservedByType && serviceType && reservedByType[serviceType] !== undefined) {
        reservedByType[serviceType] += serviceUnits;
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
      updateTicketStartDateAccumulator(ticketDateAccumulator, reservation, dateEntry);
      if (reservation?.type === "hoteling" && String(dateEntry?.kind || "").trim() === "checkout") {
        continue;
      }
      const usages = getEntryTicketUsages(dateEntry);
      if (usages.length === 0) continue;

      for (const usage of usages) {
        const ticketId = usage?.ticketId;
        if (!ticketId) continue;

        const ticket = ticketMap.get(ticketId);
        if (!ticket) continue;

        // Use baseStatusKey which contains the unified status KEY (e.g., "PLANNED")
        const statusKey = dateEntry.baseStatusKey || "PLANNED";
        const usageUnits = 1;

        if (RESERVED_STATUSES.has(statusKey)) {
          if (ticket?.type === "daycare") {
            ticket.reservedHours = (Number(ticket.reservedHours) || 0) + usageUnits;
          } else {
            ticket.reservedCount++;
          }
        } else if (USED_STATUSES.has(statusKey)) {
          if (ticket?.type === "daycare") {
            ticket.usedHours = (Number(ticket.usedHours) || 0) + usageUnits;
          } else {
            ticket.usedCount++;
          }
        }
      }
    }
  }

  const ticketCatalogMap = new Map(
    ticketCatalog.map((ticket) => [String(ticket?.id || ""), ticket])
  );

  // 4. Calculate the final reservableCount for all tickets AND aggregate by type
  for (const member of members) {
    const ticketTotalCountAggregates = {};
    const remainingAggregates = {};
    const reservedAggregates = reservationReservedByMember.get(String(member?.id || "")) || createEmptyCountMap();
    const startDateAccumulator = startDateByMemberTicket.get(String(member?.id || "")) || new Map();
    SERVICE_TYPES.forEach(type => {
      ticketTotalCountAggregates[type] = 0;
      remainingAggregates[type] = 0;
    });

    for (const ticket of member.tickets) {
      const totalCount = getTicketTotalValue(ticket);
      const usedCount = getTicketUsedValue(ticket);
      const reservedCount = getTicketReservedValue(ticket);
      const reservableCount = totalCount - (usedCount + reservedCount);
      const remainingCount = totalCount - usedCount;
      if (ticket?.type === "daycare") {
        ticket.reservableHours = reservableCount;
      } else {
        ticket.reservableCount = reservableCount;
      }

      const catalogTicket = ticketCatalogMap.get(String(ticket?.ticketId || "")) || {};
      const startPolicy = String(ticket?.startPolicy || catalogTicket?.startDatePolicy || "").trim();
      const unlimitedValidity = Boolean(catalogTicket?.unlimitedValidity);
      const validity = Number(ticket?.validity ?? catalogTicket?.validity);
      const unit = String(ticket?.unit || catalogTicket?.unit || "").trim();
      const accumulatedDates = startDateAccumulator.get(String(ticket?.id || "").trim()) || {
        firstReservationDate: "",
        firstAttendanceDate: "",
      };
      let nextStartDate = "";
      if (startPolicy === "issue-date" || startPolicy === "purchase-date") {
        nextStartDate = String(ticket?.issueDate || "").trim();
      } else if (startPolicy === "first-reservation") {
        nextStartDate = accumulatedDates.firstReservationDate || "";
      } else if (startPolicy === "first-attendance") {
        nextStartDate = accumulatedDates.firstAttendanceDate || "";
      }
      ticket.startDate = nextStartDate;
      ticket.expiryDate = unlimitedValidity
        ? ""
        : addValidityToDateKey(nextStartDate, validity, unit);

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
