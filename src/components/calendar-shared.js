const CALENDAR_DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatCalendarDateISO(date) {
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) {
    return "";
  }
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildCalendarCells(viewDate) {
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

export function getCalendarDayNamesMarkup(className = "calendar__day-names") {
  const labelsHtml = CALENDAR_DAY_LABELS.map((label) => `<span>${label}</span>`).join("");
  return `<div class="${className}">${labelsHtml}</div>`;
}

export function createCalendarDayNames(className = "calendar__day-names") {
  const dayNames = document.createElement("div");
  dayNames.className = className;
  CALENDAR_DAY_LABELS.forEach((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    dayNames.appendChild(span);
  });
  return dayNames;
}

export function createCalendarDateLabel(day) {
  const dateLabel = document.createElement("span");
  dateLabel.className = "calendar__date";
  dateLabel.textContent = String(day);
  return dateLabel;
}

export function createCalendarCellDateSlot(day) {
  const slot = document.createElement("div");
  slot.className = "calendar__date-slot";
  slot.appendChild(createCalendarDateLabel(day));
  return slot;
}

export function createCalendarCellStatusSlot() {
  const slot = document.createElement("div");
  slot.className = "calendar__status";
  return slot;
}

export function createCalendarStatusDot(type = "reservation") {
  const dot = document.createElement("span");
  dot.className = `calendar__status-dot calendar__status-dot--${type}`;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

export function createCalendarDayoffTag(count = 0) {
  const tag = document.createElement("span");
  tag.className = "calendar__dayoff";
  tag.textContent = "휴무";
  if (Number(count) > 0) {
    const countTag = document.createElement("span");
    countTag.className = "calendar__dayoff-count";
    countTag.textContent = `(예약 ${Number(count)}건)`;
    tag.appendChild(countTag);
  }
  return tag;
}

export function renderSharedCalendarMonth({
  grid,
  currentLabel = null,
  currentDate,
  selectedDate,
  todayDate = new Date(),
  dayNamesClassName = "calendar__day-names",
  formatCurrentLabel = (year, month) => `${year}년 ${month + 1}월`,
  renderCellContent = null,
}) {
  if (!(grid instanceof HTMLElement) || !(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) {
    return null;
  }

  const todayKey = formatCalendarDateISO(todayDate);
  const selectedKey = formatCalendarDateISO(selectedDate);
  const { year, month, cells } = buildCalendarCells(currentDate);

  if (currentLabel instanceof HTMLElement) {
    currentLabel.textContent = formatCurrentLabel(year, month);
  }

  grid.innerHTML = "";
  grid.appendChild(createCalendarDayNames(dayNamesClassName));

  cells.forEach((cellData) => {
    const cell = document.createElement("div");
    cell.className = "calendar__cell";
    if (cellData.muted) {
      cell.classList.add("calendar__cell--muted");
    }

    const dateKey = formatCalendarDateISO(cellData.date);
    cell.dataset.date = dateKey;
    if (dateKey === todayKey && !cellData.muted) {
      cell.classList.add("calendar__cell--today");
    }
    if (dateKey === selectedKey) {
      cell.classList.add("calendar__cell--selected");
    }

    const dateSlot = createCalendarCellDateSlot(cellData.day);
    const statusSlot = createCalendarCellStatusSlot();
    cell.appendChild(dateSlot);
    cell.appendChild(statusSlot);
    if (typeof renderCellContent === "function") {
      renderCellContent({
        cell,
        dateSlot,
        statusSlot,
        cellData,
        dateKey,
        isToday: dateKey === todayKey && !cellData.muted,
        isSelected: dateKey === selectedKey,
      });
    }
    grid.appendChild(cell);
  });

  return { year, month, cells };
}

export function bindSharedCalendarNavigation({
  grid,
  prevButton = null,
  nextButton = null,
  todayButton = null,
  getCurrentDate,
  setCurrentDate,
  setSelectedDate,
  onDateChange = null,
  onRender = null,
}) {
  if (!(grid instanceof HTMLElement)) {
    return;
  }

  const applyNextSelectedDate = (nextDate) => {
    if (typeof setSelectedDate === "function") {
      setSelectedDate(nextDate);
    }
    if (typeof onDateChange === "function") {
      onDateChange(new Date(nextDate));
    }
    if (typeof onRender === "function") {
      onRender();
    }
  };

  const shiftMonth = (delta) => {
    if (typeof getCurrentDate !== "function" || typeof setCurrentDate !== "function") {
      return;
    }
    const current = getCurrentDate();
    if (!(current instanceof Date) || Number.isNaN(current.getTime())) {
      return;
    }
    const nextMonthDate = new Date(current.getFullYear(), current.getMonth() + delta, 1);
    setCurrentDate(nextMonthDate);
    applyNextSelectedDate(new Date(nextMonthDate));
  };

  prevButton?.addEventListener("click", () => shiftMonth(-1));
  nextButton?.addEventListener("click", () => shiftMonth(1));

  todayButton?.addEventListener("click", () => {
    if (typeof setCurrentDate !== "function") {
      return;
    }
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    applyNextSelectedDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  });

  grid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const cell = target.closest("[data-date]");
    if (!cell || !grid.contains(cell)) {
      return;
    }
    const dateValue = cell.getAttribute("data-date");
    if (!dateValue) {
      return;
    }
    applyNextSelectedDate(new Date(dateValue));
  });
}
