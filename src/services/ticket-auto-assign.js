import { readStorageArray, writeStorageValue } from "./storage-utils.js";

const DAYCARE_RESERVATIONS_KEY = "daycare-reservations:reservations";
const HOTELING_RESERVATIONS_KEY = "hoteling-reservations:reservations";
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

  // 1. Read all necessary data from storage
  let daycareReservations = readStorageArray(DAYCARE_RESERVATIONS_KEY);
  let hotelingReservations = readStorageArray(HOTELING_RESERVATIONS_KEY);
  let members = readStorageArray(MEMBERS_KEY);

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

    // 4. Find all unassigned reservation dates for this member
    const unassignedDates = [];

    // School reservations
    for (const reservation of daycareReservations) {
      const memberForReservation = findMember(members, reservation);
      if (memberForReservation?.id !== memberId) continue;

      for (const [dateIndex, dateEntry] of reservation.dates.entries()) {
        if (!dateEntry.ticketUsage) {
          unassignedDates.push({
            reservation,
            dateEntry,
            dateIndex,
            type: "daycare",
          });
        }
      }
    }

    // Hoteling reservations
    for (const reservation of hotelingReservations) {
        const memberForReservation = findMember(members, reservation);
        if (memberForReservation?.id !== memberId) continue;

      for (const [dateIndex, dateEntry] of reservation.dates.entries()) {
        // Hoteling reservations use 'stay' or other kinds, match any for simplicity
        if (!dateEntry.ticketUsage) {
          unassignedDates.push({
            reservation,
            dateEntry,
            dateIndex,
            type: "hoteling",
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

      // Find the member's ticket entry to update its counts
      const memberTicket = member.tickets.find(t => t.id === issuedTicket.id);

      for (const unassigned of unassignedDates) {
        if (availableUses <= 0) break;
        if (unassigned.dateEntry.ticketUsage) continue; // Already filled by another ticket in this run

        let ticketApplied = false;
        if (ticketType === 'hoteling' && unassigned.type === 'hoteling') {
            ticketApplied = true;
        } else if (unassigned.type === 'daycare' && unassigned.dateEntry.service === ticketType) {
            ticketApplied = true;
        }

        if (ticketApplied) {
            // Apply the ticket
            unassigned.dateEntry.ticketUsage = {
                ticketId: issuedTicket.id,
                sequence: (memberTicket.usedCount || 0) + 1,
            };

            // Update counts
            availableUses--;
            if(memberTicket) {
                memberTicket.usedCount = (memberTicket.usedCount || 0) + 1;
                memberTicket.reservableCount--;
            }
        }
      }
    }
  }

  // 7. Write all modified data back to storage
  writeStorageValue(DAYCARE_RESERVATIONS_KEY, daycareReservations);
  writeStorageValue(HOTELING_RESERVATIONS_KEY, hotelingReservations);
  writeStorageValue(MEMBERS_KEY, members);
}