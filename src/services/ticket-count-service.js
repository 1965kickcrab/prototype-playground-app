import { readStorageArray, writeStorageValue } from "../storage/storage-utils.js";
import { initReservationStorage } from "../storage/reservation-storage.js";

const MEMBERS_KEY = "memberList";

/**
 * Recalculates used, reserved, and reservable counts for all tickets of all members
 * based on the current state of all reservations from the unified storage.
 */
export function recalculateTicketCounts() {
  const reservationStorage = initReservationStorage();
  const { STATUS } = reservationStorage;

  // Define status sets
  const RESERVED_STATUSES = new Set([STATUS.PLANNED]);
  const USED_STATUSES = new Set([STATUS.CHECKIN, STATUS.CHECKOUT, STATUS.ABSENT, STATUS.NO_SHOW]);

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
      const ticketId = dateEntry.ticketUsage?.ticketId;
      if (!ticketId) continue;

      const ticket = ticketMap.get(ticketId);
      if (!ticket) continue;

      // The status is now consistently in the dateEntry
      const statusKey = dateEntry.status || STATUS.PLANNED;

      if (RESERVED_STATUSES.has(statusKey)) {
        ticket.reservedCount++;
      } else if (USED_STATUSES.has(statusKey)) {
        ticket.usedCount++;
      }
    }
  }

  // 4. Calculate the final reservableCount for all tickets
  for (const member of members) {
    for (const ticket of member.tickets) {
      ticket.reservableCount =
        ticket.totalCount - (ticket.usedCount + ticket.reservedCount);
    }
  }

  // 5. Write the updated members list back to storage
  writeStorageValue(MEMBERS_KEY, members);
}