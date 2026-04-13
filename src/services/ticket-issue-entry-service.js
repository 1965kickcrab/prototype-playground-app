import { getTimeZone } from "../utils/timezone.js";
import { getDateKeyFromParts, getZonedParts } from "../utils/date.js";
import {
  addValidityToDateKey,
  getTicketQuantityValue,
  normalizePickdropType,
} from "./ticket-service.js";

export function createTicketIssueDateContext(now = new Date()) {
  const timeZone = getTimeZone();
  return {
    timeZone,
    issuedDate: getDateKeyFromParts(getZonedParts(now, timeZone)),
    issuedAtBase: Date.now(),
  };
}

export function buildTicketIssueEntries({
  memberId,
  ticket,
  quantity,
  issuedDate,
  timeZone,
  issuedAtBase,
  startIndex = 0,
}) {
  if (!ticket) {
    return [];
  }

  const count = Math.max(1, Number(quantity) || 1);
  const resolvedTimeZone = String(timeZone || "").trim() || getTimeZone();
  const resolvedIssuedDate = String(issuedDate || "").trim()
    || getDateKeyFromParts(getZonedParts(new Date(), resolvedTimeZone));
  const resolvedIssuedAtBase = Number.isFinite(issuedAtBase) ? issuedAtBase : Date.now();
  const ticketUnitCount = getTicketQuantityValue(ticket);
  const validity = Number(ticket.validity) || 0;
  const unit = ticket.unit || "";
  const startPolicy = ticket.startDatePolicy || "first-attendance";
  const startDate = startPolicy === "issue-date" ? resolvedIssuedDate : "";
  const expiryDate =
    ticket.unlimitedValidity || startPolicy !== "issue-date"
      ? ""
      : addValidityToDateKey(resolvedIssuedDate, validity, unit);

  return Array.from({ length: count }, (_value, index) => ({
    id: `${resolvedIssuedAtBase}-${startIndex + index}`,
    ticketId: String(ticket.id || ""),
    memberId: String(memberId || ""),
    quantity: 1,
    issuedDate: resolvedIssuedDate,
    issueDate: resolvedIssuedDate,
    timeZone: resolvedTimeZone,
    name: ticket.name || "",
    pickdropType:
      ticket.type === "pickdrop"
        ? normalizePickdropType(ticket.pickdropType || ticket.name)
        : "",
    type: ticket.type || "",
    totalCount: ticket.type === "daycare" ? 0 : ticketUnitCount,
    totalHours: ticket.type === "daycare" ? ticketUnitCount : 0,
    validity,
    unit,
    startPolicy,
    reservationDateRule: ticket.reservationDateRule || "expiry",
    startDate,
    usedCount: 0,
    usedHours: 0,
    reservedHours: 0,
    reservableCount: ticket.type === "daycare" ? 0 : ticketUnitCount,
    reservableHours: ticket.type === "daycare" ? ticketUnitCount : 0,
    expiryDate,
  }));
}
