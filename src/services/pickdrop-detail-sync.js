import { getIssuedTicketOptions } from "./ticket-reservation-service.js";
import { getEntryTicketUsages } from "./ticket-usage-service.js";

function normalizeMemberTickets(member) {
  return Array.isArray(member?.tickets) ? member.tickets : [];
}

function appendUnique(target, value) {
  const id = String(value ?? "");
  if (!id || target.includes(id)) {
    return;
  }
  target.push(id);
}

export function buildPickdropRepairContext({
  reservation,
  memberId,
  tickets,
  members,
}) {
  if (!reservation || !Array.isArray(reservation?.dates)) {
    return {
      pickdropOptions: [],
      selectionOrder: [],
      skipReason: "invalid-reservation",
    };
  }

  const normalizedMemberId = String(memberId ?? "");
  if (!normalizedMemberId) {
    return {
      pickdropOptions: [],
      selectionOrder: [],
      skipReason: "missing-member-id",
    };
  }

  const memberList = Array.isArray(members) ? members : [];
  const member = memberList.find(
    (item) => String(item?.id ?? "") === normalizedMemberId
  );
  if (!member) {
    return {
      pickdropOptions: [],
      selectionOrder: [],
      skipReason: "member-not-found",
    };
  }

  const issuedOptions = getIssuedTicketOptions(
    Array.isArray(tickets) ? tickets : [],
    normalizeMemberTickets(member)
  );
  const pickdropOptions = issuedOptions.filter((option) => option?.type === "pickdrop");
  if (pickdropOptions.length === 0) {
    return {
      pickdropOptions: [],
      selectionOrder: [],
      skipReason: "no-pickdrop-options",
    };
  }

  const memberPickdropTicketIds = new Set(
    normalizeMemberTickets(member)
      .filter((ticket) => ticket?.type === "pickdrop")
      .map((ticket) => String(ticket?.id ?? ""))
      .filter((id) => Boolean(id))
  );

  const selectionOrder = [];
  reservation.dates.forEach((entry) => {
    getEntryTicketUsages(entry).forEach((usage) => {
      const ticketId = String(usage?.ticketId ?? "");
      if (!ticketId || !memberPickdropTicketIds.has(ticketId)) {
        return;
      }
      appendUnique(selectionOrder, ticketId);
    });
  });
  pickdropOptions.forEach((option) => {
    appendUnique(selectionOrder, option?.id);
  });

  return {
    pickdropOptions,
    selectionOrder,
    skipReason: "",
  };
}
