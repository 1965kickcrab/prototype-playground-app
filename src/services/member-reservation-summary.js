import { isCanceledStatus } from "../utils/status.js";
import { getReservationEntries } from "./reservation-entries.js";
import { getHotelingReservationSummary } from "./hoteling-reservation-service.js";
import { getReservationIdsByMemberId } from "../storage/member-reservation-index-storage.js";
import { parseTimeToMinutes } from "./daycare-duration.js";

function isReservationForMember(reservation, member) {
  if (!reservation || !member) {
    return false;
  }
  const memberId = String(member.id || "");
  if (!memberId) {
    return false;
  }
  return String(reservation.memberId || "") === memberId;
}

function isReservationForRoom(reservation, roomId) {
  const normalizedRoomId = String(roomId || "").trim();
  if (!normalizedRoomId) {
    return false;
  }
  return String(reservation?.room || "").trim() === normalizedRoomId;
}

export function filterReservationsByMember(reservations, member) {
  if (!member) {
    return [];
  }
  const list = Array.isArray(reservations) ? reservations : [];
  const memberId = String(member.id || "");
  if (!memberId) {
    return [];
  }
  const reservationIds = getReservationIdsByMemberId(memberId);
  if (reservationIds.length > 0) {
    const reservationMap = new Map(
      list.map((reservation) => [String(reservation?.id || ""), reservation])
    );
    const linked = reservationIds
      .map((id) => reservationMap.get(String(id)))
      .filter((reservation) => isReservationForMember(reservation, member));
    if (linked.length > 0) {
      return linked;
    }
  }
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
  const targetReservations = filterReservationsByMember(reservations || [], member);
  getReservationEntries(targetReservations).forEach((entry) => {
    const { reservation, date, className, baseStatusKey, statusText } = entry;
    if (!reservation || isCanceledStatus(baseStatusKey, statusText, storage)) {
      return;
    }
    if (!services.has(className)) {
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

export function hasMemberDaycareTimeConflict({
  reservations,
  member,
  dateKey,
  checkinTime,
  checkoutTime,
  storage,
  excludeReservationId = "",
} = {}) {
  const targetDateKey = String(dateKey || "").trim();
  if (!targetDateKey || !member) {
    return false;
  }
  const targetStart = parseTimeToMinutes(checkinTime);
  const targetEnd = parseTimeToMinutes(checkoutTime);
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) {
    return false;
  }
  const excludedId = String(excludeReservationId || "");
  const memberReservations = filterReservationsByMember(reservations || [], member).filter(
    (reservation) => String(reservation?.type || "") === "daycare"
      && String(reservation?.id || "") !== excludedId
  );

  return getReservationEntries(memberReservations).some((entry) => {
    if (!entry?.reservation) {
      return false;
    }
    if (isCanceledStatus(entry.baseStatusKey, entry.statusText, storage)) {
      return false;
    }
    if (String(entry.date || "") !== targetDateKey) {
      return false;
    }
    const existingStart = parseTimeToMinutes(entry.checkinTime);
    const existingEnd = parseTimeToMinutes(entry.checkoutTime);
    if (!Number.isFinite(existingStart) || !Number.isFinite(existingEnd) || existingEnd <= existingStart) {
      return false;
    }
    return targetStart < existingEnd && existingStart < targetEnd;
  });
}

export function getMemberRoomHotelingReservationSummary(
  reservations,
  member,
  roomId
) {
  const list = filterReservationsByMember(reservations, member).filter(
    (reservation) => isReservationForRoom(reservation, roomId)
  );
  return getHotelingReservationSummary(list);
}
