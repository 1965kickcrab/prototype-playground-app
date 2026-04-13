import { markReady } from "../utils/dom.js";
import {
  getActiveServices,
  normalizeService,
} from "../utils/service-selection.js";
import {
  bindSharedCalendarNavigation,
  createCalendarDayoffTag,
  createCalendarStatusDot,
  formatCalendarDateISO,
  renderSharedCalendarMonth,
} from "./calendar-shared.js";
import { getActiveTeachers, normalizeTeacher } from "../utils/teacher-selection.js";
import { isCanceledStatus } from "../utils/status.js";
import { initOperationsStorage } from "../storage/operations-storage.js";
import { getTimeZone } from "../utils/timezone.js";
import { isDayoffDate } from "../utils/dayoff.js";
import { getReservationEntries } from "../services/reservation-entries.js";
import { getReservationPaymentStatus } from "../services/reservation-payment-status.js";
import { loadIssueMembers } from "../storage/ticket-issue-members.js";
import { hasTagValue, sanitizeTagList } from "../utils/tags.js";

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

function getActiveTags(state) {
  const tagMap = state?.selectedTags;
  if (!tagMap || typeof tagMap !== "object") {
    return [];
  }
  return sanitizeTagList(
    Object.keys(tagMap).filter((tag) => tagMap[tag] === true)
  );
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
  const operationsStorage = initOperationsStorage();
  const timeZone = getTimeZone();

  const render = () => {
    const dayoffSettings = operationsStorage.loadSettings();
    const activeServices = new Set(getActiveServices(state));
    const activeTeachers = new Set(getActiveTeachers(state));
    const activePayments = getActivePaymentStatuses(state);
    const activeTags = getActiveTags(state);
    const members = loadIssueMembers();
    const reservationCounts = getReservationEntries(state.reservations).reduce((acc, entry) => {
      const key = formatCalendarDateISO(entry.date);
      if (!key) return acc;
      const service = normalizeService(entry.className, state);
      if (!activeServices.has(service)) return acc;
      const teacher = normalizeTeacher(service, state);
      if (!activeTeachers.has(teacher)) return acc;
      const paymentStatus = getReservationPaymentStatus(entry?.reservation);
      if (!activePayments.has(paymentStatus)) return acc;
      if (activeTags.length > 0) {
        const memberId = String(entry?.reservation?.memberId || "");
        const member = members.find((item) => String(item?.id || "") === memberId) || null;
        const memberTags = sanitizeTagList([
          ...(Array.isArray(member?.ownerTags) ? member.ownerTags : []),
          ...(Array.isArray(member?.petTags) ? member.petTags : []),
        ]);
        const tagMatched = activeTags.some((tag) => hasTagValue(memberTags, tag));
        if (!tagMatched) return acc;
      }
      if (isCanceledStatus(entry.baseStatusKey, entry.statusText, storage)) return acc;
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

    const renderedMonth = renderSharedCalendarMonth({
      grid,
      currentLabel: currentText,
      currentDate: state.currentDate,
      selectedDate: state.selectedDate,
      todayDate: today,
      renderCellContent: ({ cell, cellData, dateKey }) => {
        const count = reservationCounts.get(dateKey) || 0;
        if (!cellData.muted) {
          const isDayoff = isDayoffDate(dateKey, dayoffSettings, timeZone);
          if (count > 0) {
            cell.appendChild(createCalendarStatusDot("reservation"));
          } else if (isDayoff) {
            cell.appendChild(createCalendarStatusDot("dayoff"));
          }
          if (isDayoff) {
            cell.appendChild(createCalendarDayoffTag(count));
          } else if (count > 0) {
            const tag = document.createElement("span");
            tag.className = "calendar__reservation-count";
            tag.textContent = `예약 ${count}건`;
            cell.appendChild(tag);
          }
        }
      },
    });

    if (renderedMonth) {
      calendar.dataset.month = String(renderedMonth.month);
      calendar.dataset.year = String(renderedMonth.year);
    }
  };

  bindSharedCalendarNavigation({
    grid,
    prevButton,
    nextButton,
    todayButton,
    getCurrentDate: () => state.currentDate,
    setCurrentDate: (nextDate) => {
      state.currentDate = nextDate;
    },
    setSelectedDate: (nextDate) => {
      state.selectedDate = nextDate;
    },
    onDateChange: emitDateChange,
    onRender: render,
  });

  if (searchInput) {
    searchInput.addEventListener("focus", () => {
      calendar.classList.add("is-searching");
    });

    searchInput.addEventListener("blur", () => {
      calendar.classList.remove("is-searching");
    });
  }

  render();

  document.addEventListener("reservation:updated", render);
  document.addEventListener("service-filter:change", render);
  document.addEventListener("teacher-filter:change", render);
  document.addEventListener("payment-filter:change", render);
  document.addEventListener("tag-filter:change", render);
  void storage;
}




