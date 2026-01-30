import { isCanceledStatus } from "../utils/status.js";
import { getReservationEntries } from "./reservation-entries.js";
import { getHotelingReservationSummary } from "./hoteling-reservation-service.js";

function isReservationForMember(reservation, member) {
  if (!reservation || !member) {
    return false;
  }
  const dogName = String(member.dogName || "");
  const owner = String(member.owner || "");
  if (!dogName || !owner) {
    return false;
  }
  return reservation.dogName === dogName && reservation.owner === owner;
}

export function filterReservationsByMember(reservations, member) {
  if (!member) {
    return [];
  }
  const list = Array.isArray(reservations) ? reservations : [];
  return list.filter((reservation) => isReservationForMember(reservation, member));
}

export function getMemberReservationConflictDates({
  reservations,
  member,
  services,
  storage,
}) {
  const conflicts = new Set();
  if (!member || !(services instanceof Set) || services.size === 0) {
    return conflicts;
  }
  getReservationEntries(reservations || []).forEach((entry) => {
    const { reservation, date, className, baseStatusKey, statusText } = entry;
    if (!reservation || isCanceledStatus(baseStatusKey, statusText, storage)) {
      return;
    }
    if (!services.has(className)) {
      return;
    }
    if (!isReservationForMember(reservation, member)) {
      return;
    }
    if (date) {
      conflicts.add(date);
    }
  });
  return conflicts;
}

export function getMemberHotelingReservationSummary(reservations, member) {
  const list = filterReservationsByMember(reservations, member);
  return getHotelingReservationSummary(list);
}
