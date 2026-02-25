function formatDateISO(date) {
  const target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) {
    return "";
  }
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export function setupHotelingCalendar(options = {}) {
  const grid = document.querySelector(options.gridSelector);
  const currentLabel = document.querySelector(options.currentLabelSelector);
  const prevButton = document.querySelector(options.prevButtonSelector);
  const nextButton = document.querySelector(options.nextButtonSelector);
  const todayButton = document.querySelector(options.todayButtonSelector);
  const onDateSelect = typeof options.onDateSelect === "function" ? options.onDateSelect : null;
  const getDateStats = typeof options.getDateStats === "function" ? options.getDateStats : null;

  if (!grid || !currentLabel) {
    return null;
  }

  const now = new Date();
  const state = {
    currentDate: new Date(now.getFullYear(), now.getMonth(), 1),
    selectedDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  };
  const todayKey = formatDateISO(now);

  const render = () => {
    const { year, month, cells } = buildCalendarCells(state.currentDate);
    const selectedKey = formatDateISO(state.selectedDate);

    currentLabel.textContent = `${year}년 ${month + 1}월`;
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

      const stats = getDateStats ? getDateStats(dateKey) : null;
      if (stats && Number(stats.total) > 0) {
        const counts = document.createElement("div");
        counts.className = "hoteling-calendar__counts";

        const total = document.createElement("span");
        total.className = "hoteling-calendar__count-total";
        total.textContent = String(stats.total);
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

        cell.appendChild(counts);
      }

      grid.appendChild(cell);
    });

    if (onDateSelect) {
      onDateSelect(new Date(state.selectedDate));
    }
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
      render();
    });
  }

  if (todayButton) {
    todayButton.addEventListener("click", () => {
      const today = new Date();
      state.currentDate = new Date(today.getFullYear(), today.getMonth(), 1);
      state.selectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      render();
    });
  }

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
    state.selectedDate = new Date(dateValue);
    render();
  });

  render();

  return {
    refresh: () => render(),
  };
}

