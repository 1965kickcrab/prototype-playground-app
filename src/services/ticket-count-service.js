import { readStorageArray, writeStorageValue } from "../storage/storage-utils.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { getEntryTicketUsages } from "./ticket-usage-service.js";
import { resolvePickdropTicketCountType } from "./pickdrop-policy.js";

const MEMBERS_KEY = "memberList";
const SERVICE_TYPES = ["school", "daycare", "hoteling", "oneway", "roundtrip"];

/**
 * Recalculates used, reserved, and reservable counts for all tickets of all members
 * based on the current state of all reservations from the unified storage.
 */
export function recalculateTicketCounts() {
  const reservationStorage = initReservationStorage();
  
  // Use keys explicitly as they are stored in baseStatusKey
  const RESERVED_STATUSES = new Set(["PLANNED"]);
  // Keep ABSENT/NO_SHOW in used-count by policy (in addition to CHECKIN/CHECKOUT).
  const USED_STATUSES = new Set(["CHECKIN", "CHECKOUT", "ABSENT", "NO_SHOW"]);

  // 1. Read all data
  const members = readStorageArray(MEMBERS_KEY, { fallback: [] });
  const reservations = reservationStorage.loadReservations();

  if (!members.length) {
    return;
  }

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
    for (const dateEntry of reservation.dates) {
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
    const totalAggregates = {};
    const remainingAggregates = {};
    SERVICE_TYPES.forEach(type => {
        totalAggregates[type] = 0;
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
      if (totalAggregates[type] !== undefined) {
          totalAggregates[type] += reservableCount;
          remainingAggregates[type] += remainingCount;
      }
    }

    // Always synchronize member aggregates from ticket data.
    if (!member.totalReservableCountByType) member.totalReservableCountByType = {};
    if (!member.remainingCountByType) member.remainingCountByType = {};

    SERVICE_TYPES.forEach(type => {
        member.totalReservableCountByType[type] = totalAggregates[type];
        member.remainingCountByType[type] = remainingAggregates[type];
    });
  }

  // 5. Write the updated members list back to storage
  writeStorageValue(MEMBERS_KEY, members);
}
