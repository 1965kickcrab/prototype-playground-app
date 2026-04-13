export function renderWeekdayToggles(container, settings, weekdays) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  weekdays.forEach((day) => {
    const label = document.createElement("label");
    label.className = "toggle-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.weekdayToggle = day.key;
    input.checked = Boolean(settings?.weekly?.[day.key]);

    const slider = document.createElement("span");
    slider.className = "toggle-switch";
    slider.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "toggle-row__label";
    text.textContent = day.label;

    const status = document.createElement("span");
    status.className = "toggle-row__status";
    status.textContent = "정기 휴무";

    label.classList.toggle("is-closed", !input.checked);

    label.appendChild(input);
    label.appendChild(slider);
    label.appendChild(text);
    label.appendChild(status);
    container.appendChild(label);
  });
}

export function renderDayoffCalendar(container, model) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "dayoff-calendar__grid";

  const dayNames = document.createElement("div");
  dayNames.className = "dayoff-calendar__day-names";
  (model?.dayLabels || []).forEach((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    dayNames.appendChild(span);
  });
  grid.appendChild(dayNames);

  (model?.cells || []).forEach((cellData) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "dayoff-calendar__cell";
    cell.dataset.date = cellData.key;

    if (cellData.muted) {
      cell.classList.add("dayoff-calendar__cell--muted");
    }

    if (cellData.isPast) {
      cell.classList.add("dayoff-calendar__cell--past");
      cell.disabled = true;
    }

    const dateLabel = document.createElement("span");
    dateLabel.className = "dayoff-calendar__date";
    dateLabel.textContent = String(cellData.day);
    cell.appendChild(dateLabel);

    if (cellData.isOff) {
      cell.classList.add("dayoff-calendar__cell--off");
      const tag = document.createElement("span");
      tag.className = "dayoff-calendar__tag";
      tag.textContent = "휴무";
      const tagRow = document.createElement("div");
      tagRow.className = "dayoff-calendar__tag-row";
      tagRow.appendChild(tag);
      if (!cellData.isPast) {
        const remove = document.createElement("span");
        remove.className = "dayoff-calendar__remove";
        remove.setAttribute("aria-hidden", "true");
        const removeIcon = document.createElement("img");
        removeIcon.src = "/../../assets/iconClose.svg";
        removeIcon.alt = "";
        removeIcon.setAttribute("aria-hidden", "true");
        remove.appendChild(removeIcon);
        tagRow.appendChild(remove);
      }
      cell.appendChild(tagRow);
    }

    grid.appendChild(cell);
  });

  container.appendChild(grid);
}

export function syncPublicHolidayToggle(input, isChecked) {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  input.checked = Boolean(isChecked);
  const row = input.closest(".checkbox-row");
  row?.classList.toggle("is-checked", input.checked);
}

