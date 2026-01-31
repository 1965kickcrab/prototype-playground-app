import { readStorageArray, writeStorageValue } from "../storage/storage-utils.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";

const MEMBERS_KEY = "memberList";

// Helper to find a member by dogName and owner, as memberId is not on the reservation object
function findMember(members, reservation) {
  return members.find(
    (m) =>
      m.dogName === reservation.dogName && m.owner === reservation.owner
  );
}

export function autoApplyIssuedTicketsToReservations(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return;
  }

  const reservationStorage = initReservationStorage();

  // 1. Read all necessary data from storage
  const reservations = reservationStorage.loadReservations();
  const members = readStorageArray(MEMBERS_KEY);

  // 2. Group new issues by memberId
  const issuesByMember = new Map();
  for (const issue of issues) {
    const memberId = String(issue?.memberId ?? "");
    if (!memberId) continue;
    if (!issuesByMember.has(memberId)) {
      issuesByMember.set(memberId, []);
    }
    issuesByMember.get(memberId).push(issue);
  }

  // 3. Process each member who received new tickets
  for (const [memberId, memberIssues] of issuesByMember.entries()) {
    const member = members.find((m) => m.id === memberId);
    if (!member) continue;

    // 4. Find all unassigned reservation dates for this member from the unified list
    const unassignedDates = [];
    for (const reservation of reservations) {
      const memberForReservation = findMember(members, reservation);
      if (memberForReservation?.id !== memberId) continue;

      for (const dateEntry of reservation.dates) {
        if (!dateEntry.ticketUsage) {
          unassignedDates.push({
            reservation,
            dateEntry,
          });
        }
      }
    }

    // 5. Sort unassigned dates chronologically
    unassignedDates.sort((a, b) =>
      a.dateEntry.date.localeCompare(b.dateEntry.date)
    );

    if (unassignedDates.length === 0) continue;

    // 6. Iterate through new tickets and apply them to unassigned dates
    for (const issuedTicket of memberIssues) {
      let availableUses = issuedTicket.reservableCount;
      if (availableUses <= 0) continue;

      const ticketType = issuedTicket.type;
      const memberTicket = member.tickets.find(t => t.id === issuedTicket.id);
      if (!memberTicket) continue;

      let assignedInThisRun = 0;

      for (const unassigned of unassignedDates) {
        if (availableUses <= 0) break;
        if (unassigned.dateEntry.ticketUsage) continue; // Already filled by another ticket

        const { reservation, dateEntry } = unassigned;
        let ticketApplied = false;

        // Check if the ticket type matches the reservation type/service
        if (ticketType === 'hoteling' && reservation.type === 'hoteling') {
            ticketApplied = true;
        } else if (reservation.type === 'daycare' && reservation.service === ticketType) {
            ticketApplied = true;
        }

        if (ticketApplied) {
            // Apply the ticket
            dateEntry.ticketUsage = {
                ticketId: issuedTicket.id,
                sequence: (memberTicket.usedCount || 0) + assignedInThisRun + 1,
            };
            
            assignedInThisRun++;
            availableUses--;
        }
      }
    }
  }

  // 7. Write modified reservations back to the single unified storage
  reservationStorage.saveReservations(reservations);
  
  // 8. Recalculate all counts based on the new state
  recalculateTicketCounts();
}
