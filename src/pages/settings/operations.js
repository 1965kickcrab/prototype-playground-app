import { initOperationsStorage } from "../../storage/operations-storage.js";
import { initHotelOperationsStorage } from "../../storage/hotel-operations-storage.js";
import { getTimeZone } from "../../utils/timezone.js";
import { getMonthLabel, getZonedTodayParts } from "../../utils/date.js";
import { setupSidebarGroups } from "../../utils/sidebar-groups.js";
import { WEEKDAYS } from "../../config/weekdays.js";
import { showToast } from "../../components/toast.js";
import {
  renderDayoffCalendar,
  renderWeekdayToggles,
  syncPublicHolidayToggle,
} from "../../components/operations-view.js";
import { buildDayoffCalendarModel } from "../../services/operations-calendar.js";
import {
  getOperationsSettingsSignature,
  setPublicHolidayOff,
  setWeeklyAvailability,
  toggleDayoffDate,
} from "../../services/operations-settings.js";

function getTodayKey(timeZone) {
  const todayParts = getZonedTodayParts(timeZone);
  return `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(
    todayParts.day
  ).padStart(2, "0")}`;
}

function setupOperations() {
  setupSidebarGroups({ navigateToFirstItemOnToggle: true });
  const isHotel = document.body?.dataset?.settingsScope === "hotel";
  const storage = isHotel ? initHotelOperationsStorage() : initOperationsStorage();
  const timeZone = getTimeZone();
  const weekdayContainer = document.querySelector("[data-weekday-toggles]");
  const publicHolidayInput = document.querySelector("[data-public-holiday]");
  const calendarContainer = document.querySelector("[data-dayoff-calendar]");
  const prevButton = document.querySelector("[data-dayoff-prev]");
  const nextButton = document.querySelector("[data-dayoff-next]");
  const currentLabel = document.querySelector("[data-dayoff-current]");
  const saveButton = document.querySelector("[data-operations-save]");

  const todayParts = getZonedTodayParts(timeZone);
  const todayKey = getTodayKey(timeZone);

  const initialSettings = storage.loadSettings();
  const state = {
    settings: initialSettings,
    viewYear: todayParts.year,
    viewMonth: todayParts.month - 1,
    todayKey,
  };

  let savedSignature = getOperationsSettingsSignature(initialSettings);

  const updateDirtyState = () => {
    if (!saveButton) {
      return;
    }
    const isDirty = getOperationsSettingsSignature(state.settings) !== savedSignature;
    const container = saveButton.closest(".settings-save");
    container?.classList.toggle("settings-save--visible", isDirty);
    saveButton.setAttribute("aria-hidden", isDirty ? "false" : "true");
  };

  const syncMonthLabel = () => {
    if (currentLabel) {
      currentLabel.textContent = getMonthLabel(state.viewYear, state.viewMonth);
    }
  };

  const renderAll = () => {
    renderWeekdayToggles(weekdayContainer, state.settings, WEEKDAYS);
    syncPublicHolidayToggle(publicHolidayInput, state.settings.publicHolidayOff);
    syncMonthLabel();
    const model = buildDayoffCalendarModel({
      viewYear: state.viewYear,
      viewMonth: state.viewMonth,
      todayKey: state.todayKey,
      settings: state.settings,
      timeZone,
    });
    renderDayoffCalendar(calendarContainer, model);
    updateDirtyState();
  };

  weekdayContainer?.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input || !input.dataset.weekdayToggle) {
      return;
    }
    const key = input.dataset.weekdayToggle;
    state.settings = setWeeklyAvailability(state.settings, key, input.checked);
    const row = input.closest(".toggle-row");
    row?.classList.toggle("is-closed", !input.checked);
    const model = buildDayoffCalendarModel({
      viewYear: state.viewYear,
      viewMonth: state.viewMonth,
      todayKey: state.todayKey,
      settings: state.settings,
      timeZone,
    });
    renderDayoffCalendar(calendarContainer, model);
    updateDirtyState();
  });

  publicHolidayInput?.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) {
      return;
    }
    state.settings = setPublicHolidayOff(state.settings, input.checked);
    syncPublicHolidayToggle(publicHolidayInput, input.checked);
    updateDirtyState();
  });

  calendarContainer?.addEventListener("click", (event) => {
    const cell = event.target instanceof HTMLElement
      ? event.target.closest(".dayoff-calendar__cell")
      : null;
    if (!cell || cell.classList.contains("dayoff-calendar__cell--muted")) {
      return;
    }
    if (cell.classList.contains("dayoff-calendar__cell--past")) {
      return;
    }
    const key = cell.dataset.date;
    if (!key) {
      return;
    }

    state.settings = toggleDayoffDate(state.settings, key, todayKey, timeZone);
    const model = buildDayoffCalendarModel({
      viewYear: state.viewYear,
      viewMonth: state.viewMonth,
      todayKey: state.todayKey,
      settings: state.settings,
      timeZone,
    });
    renderDayoffCalendar(calendarContainer, model);
    updateDirtyState();
  });

  prevButton?.addEventListener("click", () => {
    const nextMonth = state.viewMonth - 1;
    if (nextMonth < 0) {
      state.viewMonth = 11;
      state.viewYear -= 1;
    } else {
      state.viewMonth = nextMonth;
    }
    syncMonthLabel();
    const model = buildDayoffCalendarModel({
      viewYear: state.viewYear,
      viewMonth: state.viewMonth,
      todayKey: state.todayKey,
      settings: state.settings,
      timeZone,
    });
    renderDayoffCalendar(calendarContainer, model);
  });

  nextButton?.addEventListener("click", () => {
    const nextMonth = state.viewMonth + 1;
    if (nextMonth > 11) {
      state.viewMonth = 0;
      state.viewYear += 1;
    } else {
      state.viewMonth = nextMonth;
    }
    syncMonthLabel();
    const model = buildDayoffCalendarModel({
      viewYear: state.viewYear,
      viewMonth: state.viewMonth,
      todayKey: state.todayKey,
      settings: state.settings,
      timeZone,
    });
    renderDayoffCalendar(calendarContainer, model);
  });

  saveButton?.addEventListener("click", () => {
    state.settings = storage.saveSettings(state.settings);
    savedSignature = getOperationsSettingsSignature(state.settings);
    showToast("저장되었습니다.");
    renderAll();
  });

  renderAll();
}

document.addEventListener("DOMContentLoaded", () => {
  setupOperations();
});
