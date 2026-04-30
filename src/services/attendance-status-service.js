import { updateReservationDateEntry } from "./reservation-entries.js";

export const ATTENDANCE_STATUS_ORDER = Object.freeze([
  "PLANNED",
  "CHECKIN",
  "CHECKOUT",
  "ABSENT",
]);

const STATUSES_WITHOUT_TIMES = new Set(["PLANNED", "ABSENT", "CANCELED"]);

export function getCurrentTimeString(timeZone) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date());
}

export function shouldClearAttendanceTimes(statusKey) {
  return STATUSES_WITHOUT_TIMES.has(String(statusKey || "").trim().toUpperCase());
}

export function resolveAttendanceStatusTimeValues(statusKey, timeZone, current = {}) {
  if (shouldClearAttendanceTimes(statusKey)) {
    return {
      checkinTime: "",
      checkoutTime: "",
    };
  }

  const nextTimes = {
    checkinTime: String(current.checkinTime || "").trim(),
    checkoutTime: String(current.checkoutTime || "").trim(),
  };

  if (statusKey === "CHECKIN" && !nextTimes.checkinTime) {
    nextTimes.checkinTime = getCurrentTimeString(timeZone);
  }
  if (statusKey === "CHECKOUT" && !nextTimes.checkoutTime) {
    nextTimes.checkoutTime = getCurrentTimeString(timeZone);
  }

  return nextTimes;
}

export function getAttendanceStatusTone(statusKey) {
  const key = String(statusKey || "").trim().toUpperCase();
  if (key === "PLANNED") {
    return "primary";
  }
  if (key === "CHECKIN" || key === "CHECKOUT") {
    return "success";
  }
  if (key === "ABSENT" || key === "CANCELED") {
    return "danger";
  }
  return "";
}

export function updateReservationAttendanceStatus(
  reservation,
  dateKey,
  nextStatusKey,
  timeZone
) {
  if (!reservation || !dateKey || !nextStatusKey) {
    return reservation;
  }
  const normalizedStatusKey = String(nextStatusKey || "").trim().toUpperCase();
  return updateReservationDateEntry(reservation, dateKey, (entry) => {
    const nextTimes = resolveAttendanceStatusTimeValues(
      normalizedStatusKey,
      timeZone,
      {
        checkinTime: entry?.checkinTime || "",
        checkoutTime: entry?.checkoutTime || "",
      }
    );
    return {
      baseStatusKey: normalizedStatusKey,
      checkinTime: nextTimes.checkinTime,
      checkoutTime: nextTimes.checkoutTime,
    };
  });
}
