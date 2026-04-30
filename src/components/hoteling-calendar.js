import { initOperationsStorage } from "../storage/operations-storage.js";
import { getTimeZone } from "../utils/timezone.js";
import { isDayoffDate } from "../utils/dayoff.js";
import {
  bindSharedCalendarNavigation,
  createCalendarDayoffTag,
  createCalendarStatusDot,
  renderSharedCalendarMonth,
} from "./calendar-shared.js";

export function setupHotelingCalendar(options = {}) {
  const grid = document.querySelector(options.gridSelector);
  const currentLabel = document.querySelector(options.currentLabelSelector);
  const prevButton = document.querySelector(options.prevButtonSelector);
  const nextButton = document.querySelector(options.nextButtonSelector);
  const todayButton = document.querySelector(options.todayButtonSelector);
  const onDateSelect = typeof options.onDateSelect === "function" ? options.onDateSelect : null;
  const getDateStats = typeof options.getDateStats === "function" ? options.getDateStats : null;
  const formatCurrentLabel = typeof options.formatCurrentLabel === "function"
    ? options.formatCurrentLabel
    : null;

  if (!grid || !currentLabel) {
    return null;
  }

  const requestedInitialDate = options.initialDate instanceof Date
    && !Number.isNaN(options.initialDate.getTime())
    ? options.initialDate
    : null;
  const now = requestedInitialDate || new Date();
  const state = {
    currentDate: new Date(now.getFullYear(), now.getMonth(), 1),
    selectedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  };
  const operationsStorage = initOperationsStorage();
  const timeZone = getTimeZone();

  const render = () => {
    const dayoffSettings = operationsStorage.loadSettings();
    renderSharedCalendarMonth({
      grid,
      currentLabel,
      currentDate: state.currentDate,
      selectedDate: state.selectedDate,
      todayDate: now,
      formatCurrentLabel: formatCurrentLabel || undefined,
      renderCellContent: ({ statusSlot, cellData, dateKey }) => {
        const stats = getDateStats ? getDateStats(dateKey) : null;
        const totalCount = Number(stats?.total) || 0;
        const isDayoff = !cellData.muted && isDayoffDate(dateKey, dayoffSettings, timeZone);
        if (!cellData.muted && totalCount > 0) {
          statusSlot.appendChild(createCalendarStatusDot("reservation"));
        }
        if (isDayoff) {
          statusSlot.appendChild(createCalendarDayoffTag(totalCount));
        } else if (totalCount > 0) {
          const counts = document.createElement("div");
          counts.className = "hoteling-calendar__counts";

          const total = document.createElement("span");
          total.className = "hoteling-calendar__count-total";
          total.textContent = String(totalCount);
          counts.appendChild(total);

          const rows = document.createElement("div");
          rows.className = "hoteling-calendar__count-rows";

          const appendRow = (kind, iconName, label, value) => {
            if (!value || value <= 0) {
              return;
            }
            const row = document.createElement("div");
            row.className = `hoteling-calendar__count-row hoteling-calendar__count-row--${kind}`;

            const icon = document.createElement("img");
            icon.className = "hoteling-calendar__count-icon";
            icon.src = `../../assets/${iconName}`;
            icon.alt = label;
            row.appendChild(icon);

            const count = document.createElement("span");
            count.textContent = String(value);
            row.appendChild(count);

            rows.appendChild(row);
          };

          appendRow("checkin", "iconCheckin.svg", "입실", stats.checkin);
          appendRow("checkout", "iconCheckout.svg", "퇴실", stats.checkout);

          if (rows.childElementCount > 0) {
            counts.appendChild(rows);
          }

          statusSlot.appendChild(counts);
        }
      },
    });

    if (onDateSelect) {
      onDateSelect(new Date(state.selectedDate));
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
    onRender: render,
  });

  render();

  return {
    refresh: () => render(),
  };
}
