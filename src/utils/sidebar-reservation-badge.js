import { getDateKeyFromParts, getZonedTodayParts } from "./date.js";
import { isCanceledStatus } from "./status.js";

function getReservationEntriesForCount(reservation) {
  if (Array.isArray(reservation?.dates) && reservation.dates.length > 0) {
    return reservation.dates;
  }
  if (reservation?.date) {
    return [
      {
        date: reservation.date,
        baseStatusKey: reservation.baseStatusKey || "",
        statusText: reservation.statusText || "",
      },
    ];
  }
  return [];
}

function isSchoolType(type) {
  const value = String(type || "").trim().toLowerCase();
  return value === "school" || value === "daycare";
}

export function setupSidebarReservationBadges({ storage, timeZone }) {
  const schoolBadge = document.querySelector("[data-sidebar-school-count]");
  const hotelingBadge = document.querySelector("[data-sidebar-hoteling-count]");
  const todayTotalBadge = document.querySelector("[data-topbar-today-count]");
  if (!schoolBadge && !hotelingBadge && !todayTotalBadge) {
    return { refresh: () => {} };
  }

  const refresh = () => {
    if (!storage || typeof storage.loadReservations !== "function") {
      if (schoolBadge) schoolBadge.textContent = "0";
      if (hotelingBadge) hotelingBadge.textContent = "0";
      if (todayTotalBadge) todayTotalBadge.textContent = "0";
      return;
    }
    const todayKey = getDateKeyFromParts(getZonedTodayParts(timeZone));
    const reservations = storage.loadReservations();
    const schoolIds = new Set();
    const hotelingIds = new Set();

    reservations.forEach((reservation, index) => {
      const entries = getReservationEntriesForCount(reservation);
      const hasTodayActiveEntry = entries.some(
        (entry) =>
          entry?.date === todayKey
          && !isCanceledStatus(entry?.baseStatusKey || "", entry?.statusText || "", storage)
      );
      if (!hasTodayActiveEntry) {
        return;
      }
      const reservationId = String(reservation?.id || `row-${index}`);
      if (String(reservation?.type || "").trim().toLowerCase() === "hoteling") {
        hotelingIds.add(reservationId);
        return;
      }
      if (isSchoolType(reservation?.type)) {
        schoolIds.add(reservationId);
      }
    });

    if (schoolBadge) {
      schoolBadge.textContent = String(schoolIds.size);
    }
    if (hotelingBadge) {
      hotelingBadge.textContent = String(hotelingIds.size);
    }
    if (todayTotalBadge) {
      todayTotalBadge.textContent = String(schoolIds.size + hotelingIds.size);
    }
  };

  refresh();
  document.addEventListener("reservation:updated", refresh);

  return { refresh };
}
