/**
 * ticket-auto-assign.js
 * - Auto-apply newly issued tickets to existing reservations
 * - Fill unassigned reservation dates chronologically
 * Side effects: updates reservations + recalculates ticket counts
 */
import { readStorageArray } from "../storage/storage-utils.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { getEntryTicketUsages } from "./ticket-usage-service.js";

const MEMBERS_KEY = "memberList";

function readMemberId(member) {
  return String(member?.id ?? member?.memberId ?? "");
}

function readMemberDogName(member) {
  return String(member?.dogName ?? member?.petName ?? member?.name ?? "").trim();
}

function readMemberOwner(member) {
  return String(
    member?.owner
      ?? member?.guardian
      ?? member?.guardianName
      ?? member?.ownerName
      ?? ""
  ).trim();
}

function readMemberBreed(member) {
  return String(member?.breed ?? member?.petBreed ?? "").trim();
}

function isSameMemberByProfile(member, reservation) {
  if (!member || !reservation) {
    return false;
  }

  const memberDogName = readMemberDogName(member);
  const memberOwner = readMemberOwner(member);
  const memberBreed = readMemberBreed(member);
  const reservationDogName = String(reservation?.dogName ?? "").trim();
  const reservationOwner = String(reservation?.owner ?? "").trim();
  const reservationBreed = String(reservation?.breed ?? "").trim();

  if (!memberDogName || !memberOwner) {
    return false;
  }

  if (memberDogName !== reservationDogName || memberOwner !== reservationOwner) {
    return false;
  }

  if (!reservationBreed || !memberBreed) {
    return true;
  }

  return memberBreed === reservationBreed;
}

// Helper to find a member by profile, as memberId is not on the reservation object.
function findMember(members, reservation) {
  return members.find((member) => isSameMemberByProfile(member, reservation));
}

function isTicketApplicableToDate(ticketType, reservation) {
  if (ticketType === "hoteling") {
    return reservation.type === "hoteling";
  }

  if (ticketType === "school" || ticketType === "daycare") {
    return reservation.type === ticketType;
  }

  return reservation.type === ticketType;
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
    const member = members.find((m) => readMemberId(m) === memberId);
    if (!member) continue;

    // 4. Find all unassigned reservation dates for this member from the unified list
    const unassignedDates = [];
    for (const reservation of reservations) {
      const memberForReservation = findMember(members, reservation);
      if (readMemberId(memberForReservation) !== memberId) continue;

      const dates = Array.isArray(reservation?.dates) ? reservation.dates : [];
      for (const dateEntry of dates) {
        if (getEntryTicketUsages(dateEntry).length === 0) {
          unassignedDates.push({
            reservation,
            dateEntry,
          });
        }
      }
    }

    // 5. Sort unassigned dates chronologically
    unassignedDates.sort((a, b) =>
      String(a?.dateEntry?.date ?? "").localeCompare(String(b?.dateEntry?.date ?? ""))
    );

    if (unassignedDates.length === 0) continue;

    // 6. Iterate through new tickets and apply them to unassigned dates
    for (const issuedTicket of memberIssues) {
      let availableUses = Number(issuedTicket?.reservableCount) || 0;
      if (availableUses <= 0) continue;

      const ticketType = issuedTicket.type;
      const memberTickets = Array.isArray(member?.tickets) ? member.tickets : [];
      const memberTicket = memberTickets.find(
        (ticket) => String(ticket?.id ?? "") === String(issuedTicket?.id ?? "")
      );
      if (!memberTicket) continue;

      let assignedInThisRun = 0;

      for (const unassigned of unassignedDates) {
        if (availableUses <= 0) break;
        if (getEntryTicketUsages(unassigned.dateEntry).length > 0) continue; // Already filled by another ticket

        const { reservation, dateEntry } = unassigned;
        if (!isTicketApplicableToDate(ticketType, reservation)) {
          continue;
        }

        // Apply the ticket
        dateEntry.ticketUsages = [{
          ticketId: issuedTicket.id,
          sequence: (memberTicket.usedCount || 0) + assignedInThisRun + 1,
        }];

        assignedInThisRun += 1;
        availableUses -= 1;
      }
    }
  }

  // 7. Write modified reservations back to the single unified storage
  reservationStorage.saveReservations(reservations);

  // 8. Recalculate all counts based on the new state
  recalculateTicketCounts();
}
