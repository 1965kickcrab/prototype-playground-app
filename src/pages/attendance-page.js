import { initReservationStorage } from "../storage/reservation-storage.js";
import { getReservationEntries } from "../services/reservation-entries.js";
import {
  ATTENDANCE_STATUS_ORDER,
  getAttendanceStatusTone,
  updateReservationAttendanceStatus,
} from "../services/attendance-status-service.js";
import {
  formatDateKeyLabel,
  formatTimeLabel,
  getMemberByReservation,
} from "./reservation-detail-page-shared.js";
import { notifyReservationUpdated } from "../utils/reservation-events.js";
import { getTimeZone } from "../utils/timezone.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";

const ATTENDANCE_TYPES = new Set(["school", "daycare", "pickdrop"]);

function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function renderAttendanceCard(entry, storage) {
  const reservation = entry?.reservation || {};
  const member = getMemberByReservation(reservation);
  const dogName = member?.dogName || reservation?.dogName || "-";
  const breed = member?.breed || reservation?.breed || "-";
  const owner = member?.owner || reservation?.owner || "-";
  const className = entry?.className || reservation?.service || "-";
  const statusKey = String(entry?.baseStatusKey || "PLANNED").trim().toUpperCase();
  const statusTone = getAttendanceStatusTone(statusKey);
  const plannedTime = entry?.checkinTime && entry?.checkoutTime
    ? `${formatTimeLabel(entry.checkinTime)} ~ ${formatTimeLabel(entry.checkoutTime)}`
    : entry?.checkinTime
      ? `${formatTimeLabel(entry.checkinTime)} ~ -`
      : "-";
  const actionButtons = ATTENDANCE_STATUS_ORDER.map((key) => {
    const isActive = key === statusKey;
    const buttonClass = isActive
      ? "filter-chip is-selected"
      : "filter-chip";
    const label = key === "PLANNED" ? "예약" : getStatusLabel(key, storage);
    return `
      <button
        class="${buttonClass}"
        type="button"
        data-attendance-status="${key}"
        ${isActive ? "disabled" : ""}
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
          <strong>${dogName}</strong>
          <span>${breed} / ${owner}</span>
        </span>
        <img src="../../assets/iconChevronRight.svg" alt="" aria-hidden="true">
      </button>
      <div class="attendance-card__meta">
        <span>${className}</span>
        <span class="attendance-card__status attendance-card__status--${statusTone}">${getStatusLabel(statusKey, storage)}</span>
      </div>
      <div class="attendance-card__times">
        <span>기록 시간</span>
        <strong>${plannedTime}</strong>
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
  const params = new URLSearchParams(window.location.search);
  const state = {
    date: parseDateKey(params.get("dateKey")) || new Date(),
    statusFilter: "ALL",
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
    const visibleEntries = state.statusFilter === "ALL"
      ? entries
      : entries.filter(
        (entry) => String(entry?.baseStatusKey || "").trim().toUpperCase() === state.statusFilter
      );
    if (dateLabel) {
      dateLabel.textContent = formatDateKeyLabel(dateKey);
    }
    if (dateInput instanceof HTMLInputElement) {
      dateInput.value = dateKey;
    }
    filterGroup?.querySelectorAll("[data-attendance-filter]").forEach((button) => {
      const isSelected = button instanceof HTMLButtonElement
        && button.dataset.attendanceFilter === state.statusFilter;
      button.classList.toggle("is-selected", Boolean(isSelected));
    });
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

  document.querySelector("[data-attendance-back]")?.addEventListener("click", () => {
    const targetUrl = new URL("../../public/index.html", window.location.href);
    targetUrl.searchParams.set("dateKey", formatDateKey(state.date));
    window.location.href = targetUrl.toString();
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
    state.statusFilter = String(button.dataset.attendanceFilter || "ALL").trim().toUpperCase() || "ALL";
    render();
  });
  list?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const statusButton = target.closest("[data-attendance-status]");
    if (statusButton instanceof HTMLButtonElement) {
      const row = statusButton.closest("[data-attendance-row]");
      updateStatus(
        row?.dataset?.reservationId || "",
        row?.dataset?.reservationDate || "",
        statusButton.dataset.attendanceStatus || ""
      );
      return;
    }
    const detailButton = target.closest("[data-attendance-detail-open]");
    if (!(detailButton instanceof HTMLButtonElement)) {
      return;
    }
    const row = detailButton.closest("[data-attendance-row]");
    const reservationId = row?.dataset?.reservationId || "";
    const reservationDate = row?.dataset?.reservationDate || "";
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
