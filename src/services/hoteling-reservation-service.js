import { getDateKeyFromParts, getDatePartsFromKey, getZonedParts, sortDateKeys } from "../utils/date.js";
import { getTimeZone } from "../utils/timezone.js";
import { getIssuedTicketOptions } from "./ticket-reservation-service.js";

export const HOTELING_STATUS = Object.freeze({
  PLANNED: "입실 예정",
  CHECKIN: "입실",
  CHECKOUT: "퇴실",
  CANCELED: "예약 취소",
});

export const HOTELING_STATUS_OPTIONS = Object.freeze([
  HOTELING_STATUS.PLANNED,
  HOTELING_STATUS.CHECKIN,
  HOTELING_STATUS.CHECKOUT,
  HOTELING_STATUS.CANCELED,
]);

function buildDateRange(startKey, endKey) {
  const startParts = getDatePartsFromKey(startKey);
  const endParts = getDatePartsFromKey(endKey);
  if (!startParts) {
    return [];
  }
  const safeEnd = endParts || startParts;
  const startDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const endDate = new Date(Date.UTC(safeEnd.year, safeEnd.month - 1, safeEnd.day));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }
  const range = [];
  const from = startDate.getTime();
  const to = endDate.getTime();
  const direction = from <= to ? 1 : -1;
  const days = Math.abs(Math.round((to - from) / 86400000));
  for (let offset = 0; offset <= days; offset += 1) {
    const date = new Date(from + offset * direction * 86400000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    range.push(getDateKeyFromParts({ year, month, day }));
  }
  return range;
}

export function getHotelingNightKeys(checkinDate, checkoutDate, timeZone = getTimeZone()) {
  const checkinKey = getHotelingDateKey(checkinDate, timeZone);
  const checkoutKey = getHotelingDateKey(checkoutDate, timeZone);
  if (!checkinKey || !checkoutKey) {
    return [];
  }
  const startParts = getDatePartsFromKey(checkinKey);
  const endParts = getDatePartsFromKey(checkoutKey);
  if (!startParts || !endParts) {
    return [];
  }
  const startDate = new Date(
    Date.UTC(startParts.year, startParts.month - 1, startParts.day)
  );
  const endDate = new Date(
    Date.UTC(endParts.year, endParts.month - 1, endParts.day)
  );
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }
  if (endDate <= startDate) {
    return [];
  }
  const nights = [];
  const diffDays = Math.round((endDate - startDate) / 86400000);
  for (let offset = 0; offset < diffDays; offset += 1) {
    const date = new Date(startDate.getTime() + offset * 86400000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    nights.push(getDateKeyFromParts({ year, month, day }));
  }
  return nights;
}

export function getHotelingDateKey(date, timeZone = getTimeZone()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = getZonedParts(date, timeZone);
  return getDateKeyFromParts(parts);
}

export function buildHotelingDateEntries(checkinDate, checkoutDate) {
  const entries = [];
  const dateKeys = buildDateRange(checkinDate, checkoutDate);
  if (dateKeys.length === 0) {
    return entries;
  }
  if (dateKeys.length === 1) {
    const singleKey = dateKeys[0];
    entries.push(
      { date: singleKey, kind: "checkin" },
      { date: singleKey, kind: "checkout" }
    );
    return entries;
  }

  dateKeys.forEach((dateKey, index) => {
    if (index === 0) {
      entries.push({ date: dateKey, kind: "checkin" });
      return;
    }
    if (index === dateKeys.length - 1) {
      entries.push({ date: dateKey, kind: "checkout" });
      return;
    }
    entries.push({ date: dateKey, kind: "stay" });
  });

  return entries;
}

export function getHotelingReservationSummary(reservations) {
  const summary = {
    reservedKeys: new Set(),
    checkinKeys: new Set(),
    checkoutKeys: new Set(),
  };

  const list = Array.isArray(reservations) ? reservations : [];
  list.forEach((reservation) => {
    if (!reservation || reservation.status === HOTELING_STATUS.CANCELED) {
      return;
    }
    const entries = Array.isArray(reservation.dates) && reservation.dates.length > 0
      ? reservation.dates
      : buildHotelingDateEntries(
          reservation.checkinDate,
          reservation.checkoutDate
        );
    entries.forEach((entry) => {
      if (!entry || !entry.date) {
        return;
      }
      summary.reservedKeys.add(entry.date);
      if (entry.kind === "checkin") {
        summary.checkinKeys.add(entry.date);
      }
      if (entry.kind === "checkout") {
        summary.checkoutKeys.add(entry.date);
      }
    });
  });

  return summary;
}

export function getHotelingCalendarStats(reservations) {
  const statsMap = new Map();
  const list = Array.isArray(reservations) ? reservations : [];

  list.forEach((reservation) => {
    if (!reservation || reservation.status === HOTELING_STATUS.CANCELED) {
      return;
    }
    const entries = Array.isArray(reservation.dates) && reservation.dates.length > 0
      ? reservation.dates
      : buildHotelingDateEntries(reservation.checkinDate, reservation.checkoutDate);

    entries.forEach((entry) => {
      if (!entry || !entry.date) {
        return;
      }
      const current = statsMap.get(entry.date) || {
        total: 0,
        checkin: 0,
        checkout: 0,
        stay: 0,
      };
      current.total += 1;
      if (entry.kind === "checkin") {
        current.checkin += 1;
      } else if (entry.kind === "checkout") {
        current.checkout += 1;
      } else {
        current.stay += 1;
      }
      statsMap.set(entry.date, current);
    });
  });

  return statsMap;
}

export function getNextHotelingCheckinKey(checkinKey, checkinKeys) {
  if (!checkinKey || !(checkinKeys instanceof Set)) {
    return "";
  }
  const candidates = sortDateKeys(
    Array.from(checkinKeys).filter((key) => key > checkinKey)
  );
  return candidates[0] || "";
}

export function isHotelingDateDisabled({
  dateKey,
  reservedKeys,
  checkinKeys,
  checkoutKeys,
  checkinKey,
  checkoutKey,
  nextCheckinKey,
}) {
  if (!dateKey) {
    return false;
  }
  if (reservedKeys instanceof Set && reservedKeys.has(dateKey)) {
    const isCheckin = checkinKeys instanceof Set && checkinKeys.has(dateKey);
    const isCheckout = checkoutKeys instanceof Set && checkoutKeys.has(dateKey);
    if (!isCheckin && !isCheckout) {
      return true;
    }
  }
  if (checkinKey && !checkoutKey) {
    if (nextCheckinKey && dateKey >= nextCheckinKey) {
      return true;
    }
  }
  return false;
}

function normalizeRoomId(value) {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }
  if (raw.includes(":")) {
    const [prefix, id] = raw.split(":");
    if (prefix === "room") {
      return id || "";
    }
  }
  return raw;
}

export function getHotelingTicketOptions(tickets, memberTickets) {
  const options = getIssuedTicketOptions(tickets, memberTickets);
  return options.filter((option) => option.type === "hoteling");
}

export function getHotelingRoomIdsForTickets(tickets, ticketOptions, selectionOrder) {
  const list = Array.isArray(ticketOptions) ? ticketOptions : [];
  const ticketMap = new Map(
    (Array.isArray(tickets) ? tickets : []).map((ticket) => [
      String(ticket?.id ?? ""),
      ticket,
    ])
  );
  const optionMap = new Map(list.map((option) => [option.id, option]));
  const selected = Array.isArray(selectionOrder) && selectionOrder.length > 0
    ? selectionOrder
    : list.map((option) => option.id);
  const roomIds = new Set();

  selected.forEach((optionId) => {
    const option = optionMap.get(optionId);
    const ticketId = String(option?.ticketId ?? "");
    if (!ticketId) {
      return;
    }
    const ticket = ticketMap.get(ticketId);
    if (!ticket || ticket.type !== "hoteling") {
      return;
    }
    const classIds = Array.isArray(ticket.classIds) ? ticket.classIds : [];
    classIds.forEach((id) => {
      const normalized = normalizeRoomId(id);
      if (normalized) {
        roomIds.add(normalized);
      }
    });
  });

  return roomIds;
}

export function buildHotelingEntriesForDate(reservations, dateKey) {
  const groups = {
    checkin: [],
    checkout: [],
    stay: [],
  };

  if (!dateKey) {
    return groups;
  }

  const list = Array.isArray(reservations) ? reservations : [];
  list.forEach((reservation) => {
    if (!reservation || reservation.status === HOTELING_STATUS.CANCELED) {
      return;
    }
    const dates = Array.isArray(reservation.dates) ? reservation.dates : [];
    const checkinTime = reservation.checkinTime || "";
    const checkoutTime = reservation.checkoutTime || "";
    dates.forEach((entry) => {
      if (!entry || entry.date !== dateKey) {
        return;
      }
      if (entry.kind === "checkin") {
        groups.checkin.push({
          reservation,
          entry: {
            ...entry,
            time: checkinTime,
          },
        });
        return;
      }
      if (entry.kind === "checkout") {
        groups.checkout.push({
          reservation,
          entry: {
            ...entry,
            time: checkoutTime,
          },
        });
        return;
      }
      groups.stay.push({
        reservation,
        entry: {
          ...entry,
          time: "-",
        },
      });
    });
  });

  return groups;
}




