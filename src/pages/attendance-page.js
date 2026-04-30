import { initReservationStorage } from "../storage/reservation-storage.js";
import { getReservationEntries } from "../services/reservation-entries.js";
import { updateReservationAttendanceStatus } from "../services/attendance-status-service.js";
import { getMemberByReservation } from "./reservation-detail-page-shared.js";
import { notifyReservationUpdated } from "../utils/reservation-events.js";
import { getTimeZone } from "../utils/timezone.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";

const ATTENDANCE_TYPES = new Set(["school", "daycare", "pickdrop"]);
const ALL_FILTER = "ALL";
const ATTENDED_FILTER = "ATTENDED";

function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAttendanceDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return "-";
  }
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}. ${month}. ${day} (${weekdays[date.getDay()]})`;
}

function parseDateKey(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const [year, month, day] = text.split("-").map((item) => Number.parseInt(item, 10));
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStatusLabel(statusKey, storage) {
  const key = String(statusKey || "").trim().toUpperCase();
  return storage?.STATUS?.[key] || key;
}

function formatAttendanceTimeLabel(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})[:시]\s*(\d{1,2})/);
  if (!match) {
    return text;
  }
  const hour = match[1].padStart(2, "0");
  const minute = match[2].padStart(2, "0");
  return `${hour}:${minute}`;
}

function getAttendanceEntries(storage, dateKey) {
  return getReservationEntries(storage.loadReservations())
    .filter((item) => ATTENDANCE_TYPES.has(String(item?.reservation?.type || "")))
    .filter((item) => String(item?.date || "") === dateKey)
    .filter((item) => String(item?.baseStatusKey || "").trim().toUpperCase() !== "CANCELED")
    .sort((a, b) => {
      const serviceDiff = String(a?.className || "").localeCompare(String(b?.className || ""), "ko");
      if (serviceDiff !== 0) {
        return serviceDiff;
      }
      return String(a?.reservation?.dogName || "").localeCompare(
        String(b?.reservation?.dogName || ""),
        "ko"
      );
    });
}

function getEntryClassName(entry) {
  return String(entry?.className || entry?.reservation?.service || "-").trim() || "-";
}

function getEntryStatusKey(entry) {
  return String(entry?.baseStatusKey || "PLANNED").trim().toUpperCase();
}

function hasAttendanceTimeForStatus(entry, statusKey) {
  const key = String(statusKey || "").trim().toUpperCase();
  if (key === "CHECKIN") {
    return String(entry?.checkinTime || "").trim().length > 0;
  }
  if (key === "CHECKOUT") {
    return String(entry?.checkoutTime || "").trim().length > 0;
  }
  return false;
}

function matchesStatusFilter(entry, filterKey) {
  const statusKey = getEntryStatusKey(entry);
  if (filterKey === ALL_FILTER) {
    return true;
  }
  if (filterKey === ATTENDED_FILTER) {
    return statusKey === "CHECKIN" || statusKey === "CHECKOUT";
  }
  return statusKey === filterKey;
}

function buildStatusCounts(entries) {
  const counts = new Map([[ALL_FILTER, entries.length]]);
  counts.set("PLANNED", 0);
  counts.set(ATTENDED_FILTER, 0);
  counts.set("ABSENT", 0);
  entries.forEach((entry) => {
    const key = getEntryStatusKey(entry);
    if (key === "CHECKIN" || key === "CHECKOUT") {
      counts.set(ATTENDED_FILTER, (counts.get(ATTENDED_FILTER) || 0) + 1);
      return;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function renderClassFilters(container, entries, selectedClass) {
  if (!container) {
    return;
  }
  const classNames = Array.from(new Set(entries.map((entry) => getEntryClassName(entry))))
    .sort((a, b) => a.localeCompare(b, "ko"));
  container.hidden = classNames.length === 0;
  const fragment = document.createDocumentFragment();
  const allButton = document.createElement("button");
  allButton.className = selectedClass === ALL_FILTER
    ? "filter-chip is-selected"
    : "filter-chip";
  allButton.type = "button";
  allButton.dataset.attendanceClassFilter = ALL_FILTER;
  allButton.textContent = "전체";
  fragment.appendChild(allButton);

  classNames.forEach((className) => {
    const button = document.createElement("button");
    button.className = selectedClass === className
      ? "filter-chip is-selected"
      : "filter-chip";
    button.type = "button";
    button.dataset.attendanceClassFilter = className;
    button.textContent = className;
    fragment.appendChild(button);
  });

  container.replaceChildren(fragment);
}

function updateStatusFilters(container, selectedStatus, counts) {
  container?.querySelectorAll("[data-attendance-filter]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const key = String(button.dataset.attendanceFilter || ALL_FILTER).trim().toUpperCase() || ALL_FILTER;
    const isSelected = key === selectedStatus;
    button.classList.toggle("is-selected", isSelected);
    const count = button.querySelector("[data-attendance-filter-count]");
    if (count) {
      count.textContent = String(counts.get(key) || 0);
    }
  });
}

function renderAttendanceCard(entry, storage) {
  const reservation = entry?.reservation || {};
  const member = getMemberByReservation(reservation);
  const dogName = member?.dogName || reservation?.dogName || "-";
  const breed = member?.breed || reservation?.breed || "-";
  const className = getEntryClassName(entry);
  const statusKey = getEntryStatusKey(entry);
  const actionButtons = ["CHECKIN", "CHECKOUT"].map((key) => {
    const buttonClass = key === "CHECKOUT"
      ? "attendance-card__status-action attendance-card__status-action--checkout"
      : "attendance-card__status-action attendance-card__status-action--checkin";
    const timeValue = key === "CHECKOUT" ? entry?.checkoutTime : entry?.checkinTime;
    const label = timeValue ? formatAttendanceTimeLabel(timeValue) : getStatusLabel(key, storage);
    const timeClass = timeValue ? " is-time" : "";
    return `
      <button
        class="${buttonClass}${timeClass}"
        type="button"
        data-attendance-status="${key}"
      >${label}</button>
    `;
  }).join("");

  return `
    <article
      class="attendance-card"
      data-attendance-row
      data-reservation-id="${reservation.id || ""}"
      data-reservation-date="${entry?.date || ""}"
    >
      <button class="attendance-card__summary" type="button" data-attendance-detail-open>
        <span class="attendance-card__copy">
          <span class="attendance-card__name-row">
            <strong>${dogName}</strong>
            <img src="../../assets/iconChevronRight.svg" alt="" aria-hidden="true">
          </span>
          <span>${breed}</span>
        </span>
      </button>
      <div class="attendance-card__meta">
        <span>${className}</span>
      </div>
      <div class="attendance-card__actions">${actionButtons}</div>
    </article>
  `;
}

function bootstrapAttendancePage() {
  const storage = initReservationStorage();
  const timeZone = getTimeZone();
  const dateLabel = document.querySelector("[data-attendance-date-label]");
  const dateTrigger = document.querySelector("[data-attendance-date-trigger]");
  const dateInput = document.querySelector("[data-attendance-date-input]");
  const list = document.querySelector("[data-attendance-list]");
  const empty = document.querySelector("[data-attendance-empty]");
  const filterGroup = document.querySelector("[data-attendance-status-filters]");
  const classFilterGroup = document.querySelector("[data-attendance-class-filters]");
  const params = new URLSearchParams(window.location.search);
  const state = {
    date: parseDateKey(params.get("dateKey")) || new Date(),
    statusFilter: ALL_FILTER,
    classFilter: ALL_FILTER,
    visibleEntries: [],
  };

  const syncUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("dateKey", formatDateKey(state.date));
    window.history.replaceState(
      window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {},
      "",
      url.toString()
    );
  };

  const render = () => {
    const dateKey = formatDateKey(state.date);
    const entries = getAttendanceEntries(storage, dateKey);
    if (
      state.classFilter !== ALL_FILTER
      && !entries.some((entry) => getEntryClassName(entry) === state.classFilter)
    ) {
      state.classFilter = ALL_FILTER;
    }
    const classFilteredEntries = state.classFilter === ALL_FILTER
      ? entries
      : entries.filter((entry) => getEntryClassName(entry) === state.classFilter);
    const statusCounts = buildStatusCounts(classFilteredEntries);
    const visibleEntries = state.statusFilter === ALL_FILTER
      ? classFilteredEntries
      : classFilteredEntries.filter((entry) => matchesStatusFilter(entry, state.statusFilter));
    state.visibleEntries = visibleEntries;
    if (dateLabel) {
      dateLabel.textContent = formatAttendanceDateLabel(dateKey);
    }
    if (dateInput instanceof HTMLInputElement) {
      dateInput.value = dateKey;
    }
    renderClassFilters(classFilterGroup, entries, state.classFilter);
    updateStatusFilters(filterGroup, state.statusFilter, statusCounts);
    if (list) {
      list.innerHTML = visibleEntries.map((entry) => renderAttendanceCard(entry, storage)).join("");
    }
    if (empty) {
      empty.hidden = visibleEntries.length > 0;
    }
    if (list) {
      list.hidden = visibleEntries.length === 0;
    }
    syncUrl();
  };

  const updateStatus = (reservationId, reservationDate, nextStatusKey) => {
    if (!reservationId || !reservationDate || !nextStatusKey) {
      return;
    }
    storage.updateReservation(reservationId, (reservation) =>
      updateReservationAttendanceStatus(
        reservation,
        reservationDate,
        nextStatusKey,
        timeZone
      )
    );
    recalculateTicketCounts();
    notifyReservationUpdated({
      reservationId,
      dateKey: reservationDate,
      source: "attendance-page",
    });
    render();
  };

  const updateVisibleStatuses = (nextStatusKey) => {
    if (!nextStatusKey || !Array.isArray(state.visibleEntries) || state.visibleEntries.length === 0) {
      return;
    }
    state.visibleEntries.forEach((entry) => {
      if (hasAttendanceTimeForStatus(entry, nextStatusKey)) {
        return;
      }
      const reservationId = String(entry?.reservation?.id || "").trim();
      const reservationDate = String(entry?.date || "").trim();
      if (!reservationId || !reservationDate) {
        return;
      }
      storage.updateReservation(reservationId, (reservation) =>
        updateReservationAttendanceStatus(
          reservation,
          reservationDate,
          nextStatusKey,
          timeZone
        )
      );
      notifyReservationUpdated({
        reservationId,
        dateKey: reservationDate,
        source: "attendance-page",
      });
    });
    recalculateTicketCounts();
    render();
  };

  document.querySelector("[data-attendance-back]")?.addEventListener("click", () => {
    const targetUrl = new URL("../../public/index.html", window.location.href);
    targetUrl.searchParams.set("dateKey", formatDateKey(state.date));
    window.location.href = targetUrl.toString();
  });
  document.querySelectorAll("[data-attendance-all-status]").forEach((button) => {
    button.addEventListener("click", () => {
      updateVisibleStatuses(button.dataset.attendanceAllStatus || "");
    });
  });
  document.querySelector("[data-attendance-prev]")?.addEventListener("click", () => {
    state.date.setDate(state.date.getDate() - 1);
    state.date = new Date(state.date);
    render();
  });
  document.querySelector("[data-attendance-next]")?.addEventListener("click", () => {
    state.date.setDate(state.date.getDate() + 1);
    state.date = new Date(state.date);
    render();
  });
  dateTrigger?.addEventListener("click", () => {
    if (!(dateInput instanceof HTMLInputElement)) {
      return;
    }
    if (typeof dateInput.showPicker === "function") {
      dateInput.showPicker();
      return;
    }
    dateInput.click();
  });
  dateInput?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const nextDate = parseDateKey(target.value);
    if (!nextDate) {
      target.value = formatDateKey(state.date);
      return;
    }
    state.date = nextDate;
    render();
  });
  filterGroup?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-attendance-filter]")
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    state.statusFilter = String(button.dataset.attendanceFilter || ALL_FILTER).trim().toUpperCase() || ALL_FILTER;
    render();
  });
  classFilterGroup?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-attendance-class-filter]")
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    state.classFilter = String(button.dataset.attendanceClassFilter || ALL_FILTER).trim() || ALL_FILTER;
    render();
  });
  list?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const targetRow = target.closest("[data-attendance-row]");
    const statusButton = target.closest("[data-attendance-status]");
    if (statusButton instanceof HTMLButtonElement) {
      updateStatus(
        targetRow?.dataset?.reservationId || "",
        targetRow?.dataset?.reservationDate || "",
        statusButton.dataset.attendanceStatus || ""
      );
      return;
    }
    const detailButton = target.closest("[data-attendance-detail-open]");
    if (!(detailButton instanceof HTMLButtonElement)) {
      return;
    }
    const reservationId = targetRow?.dataset?.reservationId || "";
    const reservationDate = targetRow?.dataset?.reservationDate || "";
    if (!reservationId) {
      return;
    }
    const targetUrl = new URL("./school-detail.html", window.location.href);
    targetUrl.searchParams.set("reservationId", reservationId);
    if (reservationDate) {
      targetUrl.searchParams.set("dateKey", reservationDate);
    }
    window.location.href = targetUrl.toString();
  });
  document.addEventListener("reservation:updated", () => {
    render();
  });

  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapAttendancePage);
} else {
  bootstrapAttendancePage();
}
