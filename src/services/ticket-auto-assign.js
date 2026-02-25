/**
 * ticket-auto-assign.js
 * - Auto-apply newly issued tickets to existing reservations
 * - Fill unassigned reservation dates chronologically
 * Side effects: updates reservations + recalculates ticket counts
 */
import { readStorageArray } from "../storage/storage-utils.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { getReservationIdsByMemberId } from "../storage/member-reservation-index-storage.js";
import { getEntryTicketUsages } from "./ticket-usage-service.js";
import { PAYMENT_METHODS, normalizeReservationPayment } from "./reservation-payment.js";
import { syncReservationBillingCache } from "./reservation-billing.js";

const MEMBERS_KEY = "memberList";

function readMemberId(member) {
  return String(member?.id ?? member?.memberId ?? "");
}

function getReservationMemberId(reservation) {
  return String(reservation?.memberId ?? "").trim();
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

function hasAnyTicketUsages(reservation) {
  const dates = Array.isArray(reservation?.dates) ? reservation.dates : [];
  return dates.some((entry) => getEntryTicketUsages(entry).length > 0);
}

function hasUsageForTicketType(entry, ticketType, memberTicketTypeById) {
  const targetType = String(ticketType || "").trim();
  if (!targetType) {
    return false;
  }
  const usages = getEntryTicketUsages(entry);
  return usages.some((usage) => {
    const usageTicketType = String(memberTicketTypeById.get(String(usage?.ticketId || "")) || "").trim();
    return usageTicketType === targetType;
  });
}

function hasPositivePaidAmount(reservation) {
  const billingPaid = Number(reservation?.billing?.totals?.paid);
  if (Number.isFinite(billingPaid) && billingPaid > 0) {
    return billingPaid > 0;
  }
  const payment = reservation?.payment && typeof reservation.payment === "object"
    ? normalizeReservationPayment(reservation.payment)
    : null;
  if (!payment || payment.method === PAYMENT_METHODS.TICKET) {
    return false;
  }
  return Number(payment.amount) > 0;
}

function forceReservationPaymentToTicket(reservation) {
  if (!reservation) {
    return reservation;
  }
  const nextReservation = {
    ...reservation,
    payment: normalizeReservationPayment({
      method: PAYMENT_METHODS.TICKET,
      amount: 0,
    }),
  };
  return syncReservationBillingCache(nextReservation);
}

export function autoApplyIssuedTicketsToReservations(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return;
  }

  const reservationStorage = initReservationStorage();

  // 1. Read all necessary data from storage
  const reservations = reservationStorage.loadReservations();
  const members = readStorageArray(MEMBERS_KEY);
  const reservationMap = new Map(
    reservations.map((reservation) => [String(reservation?.id || ""), reservation])
  );
  const touchedReservationIds = new Set();
  const touchedReservationTicketTypes = new Map();

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
    const reservationIds = getReservationIdsByMemberId(memberId);
    const memberReservations = reservationIds.length > 0
      ? reservationIds
        .map((id) => reservationMap.get(String(id)))
        .filter((reservation) => getReservationMemberId(reservation) === memberId)
      : reservations.filter((reservation) => getReservationMemberId(reservation) === memberId);
    for (const reservation of memberReservations) {
      if (!reservation) continue;

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
      const memberTicketTypeById = new Map(
        memberTickets.map((ticket) => [
          String(ticket?.id ?? ""),
          String(ticket?.type ?? ""),
        ])
      );
      const memberTicket = memberTickets.find(
        (ticket) => String(ticket?.id ?? "") === String(issuedTicket?.id ?? "")
      );
      if (!memberTicket) continue;

      let assignedInThisRun = 0;
      const updatedReservationIds = new Set();

      for (const unassigned of unassignedDates) {
        if (availableUses <= 0) break;

        const { reservation, dateEntry } = unassigned;
        if (!isTicketApplicableToDate(ticketType, reservation)) {
          continue;
        }
        const isServiceTicket =
          ticketType === "school" || ticketType === "daycare" || ticketType === "hoteling";
        if (isServiceTicket && hasPositivePaidAmount(reservation)) {
          continue;
        }
        if (hasUsageForTicketType(dateEntry, ticketType, memberTicketTypeById)) {
          continue;
        }

        // Apply the ticket
        const existingUsages = getEntryTicketUsages(dateEntry);
        dateEntry.ticketUsages = [...existingUsages, {
          ticketId: issuedTicket.id,
          sequence: (memberTicket.usedCount || 0) + assignedInThisRun + 1,
        }];
        if (reservation?.id) {
          const reservationId = String(reservation.id);
          updatedReservationIds.add(reservationId);
          touchedReservationIds.add(reservationId);
          if (!touchedReservationTicketTypes.has(reservationId)) {
            touchedReservationTicketTypes.set(reservationId, new Set());
          }
          touchedReservationTicketTypes.get(reservationId).add(String(ticketType || ""));
        }

        assignedInThisRun += 1;
        availableUses -= 1;
      }

      void updatedReservationIds;
    }
  }

  // 7. Post-process touched reservations so billing/payment are synced with newly assigned ticket usages.
  touchedReservationIds.forEach((reservationId) => {
    const currentReservation = reservationMap.get(reservationId);
    if (!currentReservation || !hasAnyTicketUsages(currentReservation)) {
      return;
    }
    const assignedTypes = touchedReservationTicketTypes.get(reservationId) || new Set();
    const hasServiceTicketAssigned =
      assignedTypes.has("school")
      || assignedTypes.has("daycare")
      || assignedTypes.has("hoteling");
    const convertedReservation = hasServiceTicketAssigned && !hasPositivePaidAmount(currentReservation)
      ? forceReservationPaymentToTicket(currentReservation)
      : currentReservation;
    const syncedReservation = syncReservationBillingCache(convertedReservation);
    reservationMap.set(reservationId, syncedReservation);
    const targetIndex = reservations.findIndex(
      (reservation) => String(reservation?.id || "") === reservationId
    );
    if (targetIndex >= 0) {
      reservations[targetIndex] = syncedReservation;
    }
  });

  // 8. Write modified reservations back to the single unified storage
  reservationStorage.saveReservations(reservations);

  // 9. Recalculate all counts based on the new state
  recalculateTicketCounts();
}
