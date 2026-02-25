import { markReady } from "../utils/dom.js";
import {
  getActiveServices,
  normalizeService,
} from "../utils/service-selection.js";
import { getActiveTeachers, normalizeTeacher } from "../utils/teacher-selection.js";
import { isCanceledStatus } from "../utils/status.js";
import { initOperationsStorage } from "../storage/operations-storage.js";
import { getTimeZone } from "../utils/timezone.js";
import { isDayoffDate } from "../utils/dayoff.js";
import { getReservationEntries } from "../services/reservation-entries.js";
import { getReservationPaymentStatus } from "../services/reservation-payment-status.js";

function formatDateISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildCalendarCells(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const day = prevMonthDays - i;
    cells.push({
      day,
      date: new Date(year, month - 1, day),
      muted: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      date: new Date(year, month, day),
      muted: false,
    });
  }

  const totalCells = cells.length;
  const trailing = (7 - (totalCells % 7)) % 7;

  for (let day = 1; day <= trailing; day += 1) {
    cells.push({
      day,
      date: new Date(year, month + 1, day),
      muted: true,
    });
  }

  return { year, month, cells };
}

function emitDateChange(date) {
  document.dispatchEvent(
    new CustomEvent("calendar:date-change", {
      detail: { date: new Date(date) },
    })
  );
}

function getActivePaymentStatuses(state) {
  const paymentMap = state?.selectedPaymentStatuses;
  if (!paymentMap || typeof paymentMap !== "object") {
    return new Set(["paid", "unpaid"]);
  }
  const selected = Object.entries(paymentMap)
    .filter(([, checked]) => checked === true)
    .map(([status]) => status);
  return selected.length > 0 ? new Set(selected) : new Set(["paid", "unpaid"]);
}

export function setupCalendar(state, storage) {
  const calendar = document.querySelector("[data-calendar]");

  if (!calendar) {
    return;
  }

  const grid = calendar.querySelector("[data-calendar-grid]");
  const currentText = calendar.querySelector("[data-calendar-current-text]");
  const prevButton = calendar.querySelector(".month-button--prev");
  const nextButton = calendar.querySelector(".month-button--next");
  const todayButton = calendar.querySelector("[data-calendar-today]");
  const searchInput = calendar.querySelector('input[type="search"]');

  if (!grid || !currentText) {
    return;
  }

  markReady(calendar, "calendar");

  const today = new Date();
  const todayKey = formatDateISO(today);
  const operationsStorage = initOperationsStorage();
  const timeZone = getTimeZone();

  const render = () => {
    const dayoffSettings = operationsStorage.loadSettings();
    const { year, month, cells } = buildCalendarCells(state.currentDate);
    const selectedKey = formatDateISO(state.selectedDate);
    const activeServices = new Set(getActiveServices(state));
    const activeTeachers = new Set(getActiveTeachers(state));
    const activePayments = getActivePaymentStatuses(state);
    const reservationCounts = getReservationEntries(state.reservations).reduce((acc, entry) => {
      const key = formatDateISO(entry.date);
      if (!key) return acc;
      const service = normalizeService(entry.className, state);
      if (!activeServices.has(service)) return acc;
      const teacher = normalizeTeacher(service, state);
      if (!activeTeachers.has(teacher)) return acc;
      const paymentStatus = getReservationPaymentStatus(entry?.reservation);
      if (!activePayments.has(paymentStatus)) return acc;
      if (isCanceledStatus(entry.baseStatusKey, entry.statusText, storage)) return acc;
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

    calendar.dataset.month = String(month);
    calendar.dataset.year = String(year);
    currentText.textContent = `${year}년 ${month + 1}월`;

    grid.innerHTML = "";

    const dayNames = document.createElement("div");
    dayNames.className = "calendar__day-names";
    ["일", "월", "화", "수", "목", "금", "토"].forEach((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      dayNames.appendChild(span);
    });
    grid.appendChild(dayNames);

    cells.forEach((cellData) => {
      const cell = document.createElement("div");
      cell.className = "calendar__cell";

      if (cellData.muted) {
        cell.classList.add("calendar__cell--muted");
      }

      const dateKey = formatDateISO(cellData.date);
      cell.dataset.date = dateKey;
      if (dateKey === todayKey && !cellData.muted) {
        cell.classList.add("calendar__cell--today");
      }
      if (dateKey === selectedKey) {
        cell.classList.add("calendar__cell--selected");
      }

      const dateLabel = document.createElement("span");
      dateLabel.className = "calendar__date";
      dateLabel.textContent = String(cellData.day);
      cell.appendChild(dateLabel);

      const count = reservationCounts.get(dateKey) || 0;
      if (!cellData.muted) {
        const isDayoff = isDayoffDate(dateKey, dayoffSettings, timeZone);
        if (isDayoff) {
          const tag = document.createElement("span");
          tag.className = "calendar__dayoff";
          tag.textContent = "휴무";
          if (count > 0) {
            const countTag = document.createElement("span");
            countTag.className = "calendar__dayoff-count";
            countTag.textContent = `(예약 ${count}건)`;
            tag.appendChild(countTag);
          }
          cell.appendChild(tag);
        } else if (count > 0) {
          const tag = document.createElement("span");
          tag.className = "calendar__reservation-count";
          tag.textContent = `예약 ${count}건`;
          cell.appendChild(tag);
        }
      }
      grid.appendChild(cell);
    });
  };

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      const current = state.currentDate;
      state.currentDate = new Date(
        current.getFullYear(),
        current.getMonth() - 1,
        1
      );
      state.selectedDate = new Date(state.currentDate);
      emitDateChange(state.selectedDate);
      render();
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const current = state.currentDate;
      state.currentDate = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        1
      );
      state.selectedDate = new Date(state.currentDate);
      emitDateChange(state.selectedDate);
      render();
    });
  }

  if (todayButton) {
    todayButton.addEventListener("click", () => {
      const now = new Date();
      state.currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
      state.selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      emitDateChange(state.selectedDate);
      render();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("focus", () => {
      calendar.classList.add("is-searching");
    });

    searchInput.addEventListener("blur", () => {
      calendar.classList.remove("is-searching");
    });
  }

  grid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const cell = target.closest(".calendar__cell");
    if (!cell || !cell.dataset.date) {
      return;
    }

    state.selectedDate = new Date(cell.dataset.date);
    emitDateChange(state.selectedDate);
    render();
  });

  render();

  document.addEventListener("reservation:updated", render);
  document.addEventListener("service-filter:change", render);
  document.addEventListener("teacher-filter:change", render);
  document.addEventListener("payment-filter:change", render);
  void storage;
}




