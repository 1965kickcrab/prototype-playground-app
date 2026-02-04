export function renderMemberOptions(root, members) {
  const container = root.querySelector("[data-class-members]");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  members.forEach((member) => {
    const label = document.createElement("label");
    label.className = "class-member-row settings-selection-item settings-selection-item--member";
    label.dataset.classMember = "";
    label.dataset.memberId = member.id;

    const profile = document.createElement("img");
    profile.className = "class-member-row__profile";
    profile.src = "/assets/defaultProfile.svg";
    profile.alt = "";
    profile.setAttribute("aria-hidden", "true");

    const info = document.createElement("span");
    info.className = "class-member-row__info";

    const dogName = document.createElement("span");
    dogName.className = "class-member-row__dog";
    dogName.textContent = member.dogName || "-";

    const owner = document.createElement("span");
    owner.className = "class-member-row__owner";
    owner.textContent = member.owner || "-";

    info.appendChild(dogName);
    info.appendChild(owner);

    label.appendChild(profile);
    label.appendChild(info);

    container.appendChild(label);
  });

  updateMemberCount(root);
}

export function renderTicketOptions(
  root,
  tickets,
  formatTicketDisplayName,
  formatTicketCount,
  formatTicketValidity,
  classType
) {
  const container = root.querySelector("[data-class-tickets]");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  const activeType = typeof classType === "string" && classType
    ? classType
    : root.dataset.classType || "school";

  const validTickets = Array.isArray(tickets)
    ? tickets.filter((ticket) => {
      if (!ticket || typeof ticket !== "object") {
        return false;
      }
      return ticket.type === activeType;
    })
    : [];

  validTickets.forEach((ticket) => {
    const row = document.createElement("label");
    row.className = "class-ticket-row settings-selection-item settings-selection-item--ticket";
    row.dataset.classTicket = "";
    row.dataset.ticketId = String(ticket.id ?? "");

    const name = document.createElement("span");
    name.className = "class-ticket-row__name";
    name.textContent = formatTicketDisplayName(ticket);

    const meta = document.createElement("span");
    meta.className = "class-ticket-row__meta";
    meta.textContent = `${formatTicketCount(ticket.quantity)} · ${formatTicketValidity(
      ticket.validity,
      ticket.unit,
      ticket.unlimitedValidity
    )}`;

    row.appendChild(name);
    row.appendChild(meta);
    container.appendChild(row);
  });

  updateTicketCount(root);
}

export function collectMemberIds(root) {
  return Array.from(root.querySelectorAll("[data-class-member]"))
    .filter((element) => element.classList.contains("is-checked"))
    .map((element) => element.dataset.memberId || "")
    .filter((value) => value);
}

export function collectTicketIds(root) {
  return Array.from(root.querySelectorAll("[data-class-ticket]"))
    .filter((element) => element.classList.contains("is-checked"))
    .map((element) => element.dataset.ticketId || "")
    .filter((value) => value);
}

export function updateMemberSelectAllState(root) {
  const button = root.querySelector("[data-class-member-select-all]");
  if (!button) {
    return;
  }
  const rows = Array.from(root.querySelectorAll("[data-class-member]"));
  const allSelected = rows.length > 0
    && rows.every((row) => row.classList.contains("is-checked"));
  button.classList.toggle("is-active", allSelected);
}

export function updateTicketSelectAllState(root) {
  const button = root.querySelector("[data-class-ticket-select-all]");
  if (!button) {
    return;
  }
  const rows = Array.from(root.querySelectorAll("[data-class-ticket]"));
  const allSelected = rows.length > 0
    && rows.every((row) => row.classList.contains("is-checked"));
  button.classList.toggle("is-active", allSelected);
}

export function toggleMemberSelection(root) {
  const rows = Array.from(root.querySelectorAll("[data-class-member]"));
  if (rows.length === 0) {
    return;
  }
  const shouldSelectAll = rows.some((row) => !row.classList.contains("is-checked"));
  rows.forEach((row) => {
    row.classList.toggle("is-checked", shouldSelectAll);
  });
  updateMemberCount(root);
  updateMemberSelectAllState(root);
}

export function toggleTicketSelection(root) {
  const rows = Array.from(root.querySelectorAll("[data-class-ticket]"));
  if (rows.length === 0) {
    return;
  }
  const shouldSelectAll = rows.some((row) => !row.classList.contains("is-checked"));
  rows.forEach((row) => {
    row.classList.toggle("is-checked", shouldSelectAll);
  });
  updateTicketCount(root);
  updateTicketSelectAllState(root);
}

export function updateTicketCount(root) {
  const target = root.querySelector("[data-class-ticket-count]");
  if (!target) {
    return;
  }
  const count = collectTicketIds(root).length;
  target.textContent = `${count}개`;
}

export function updateMemberCount(root) {
  const target = root.querySelector("[data-class-member-count]");
  if (!target) {
    return;
  }
  const count = collectMemberIds(root).length;
  target.textContent = `${count}마리`;
}

export function applyMemberSelection(root, memberIds) {
  const selected = new Set(Array.isArray(memberIds) ? memberIds : []);
  const rows = root.querySelectorAll("[data-class-member]");
  rows.forEach((row) => {
    const memberId = row.dataset.memberId || "";
    row.classList.toggle("is-checked", selected.has(memberId));
  });
  updateMemberCount(root);
  updateMemberSelectAllState(root);
}

export function applyTicketSelection(root, ticketIds) {
  const selected = new Set(Array.isArray(ticketIds) ? ticketIds : []);
  const rows = root.querySelectorAll("[data-class-ticket]");
  rows.forEach((row) => {
    const ticketId = row.dataset.ticketId || "";
    row.classList.toggle("is-checked", selected.has(ticketId));
  });
  updateTicketCount(root);
  updateTicketSelectAllState(root);
}

export function collectClassFormData(root, config) {
  const name = root.querySelector("[data-class-name]")?.value.trim() || "";
  const capacityValue =
    root.querySelector("[data-class-capacity]")?.value.trim() || "";
  const description =
    root.querySelector("[data-class-description]")?.value.trim() || "";
  const ticketIds = collectTicketIds(root);
  const classType = root.dataset.classType || config.defaultClassType;

  const capacity = Number.parseInt(capacityValue, 10);
  if (config.isHotelScope) {
    const weightMinValue =
      root.querySelector("[data-class-weight-min]")?.value.trim() || "";
    const weightMaxValue =
      root.querySelector("[data-class-weight-max]")?.value.trim() || "";
    const weightMin = Number.parseFloat(weightMinValue);
    const weightMax = Number.parseFloat(weightMaxValue);
    return {
      name,
      capacity: Number.isNaN(capacity) ? 0 : capacity,
      description,
      weightMin: Number.isNaN(weightMin) ? "" : weightMin,
      weightMax: Number.isNaN(weightMax) ? "" : weightMax,
      ticketIds,
      type: classType,
    };
  }

  const teacher =
    root.querySelector("[data-class-teacher]")?.value.trim() || "";
  const startTime = root.querySelector("[data-class-start]")?.value || "";
  const endTime = root.querySelector("[data-class-end]")?.value || "";
  const publicHolidayOff =
    root.querySelector("[data-class-public-holiday]")?.checked || false;
  const memberIds = collectMemberIds(root);
  const dayButtons = Array.from(
    root.querySelectorAll("[data-class-day]")
  );
  const days = dayButtons
    .filter((button) => button.classList.contains("is-selected"))
    .map((button) => button.dataset.classDay);

  return {
    name,
    teacher,
    capacity: Number.isNaN(capacity) ? 0 : capacity,
    days,
    startTime,
    endTime,
    description,
    memberIds,
    ticketIds,
    type: classType,
    publicHolidayOff,
  };
}

export function setActiveClassTab(modal, tabId) {
  if (!modal) {
    return;
  }
  const tabs = Array.from(modal.querySelectorAll("[data-class-tab]"));
  const panels = Array.from(modal.querySelectorAll("[data-class-tab-panel]"));
  if (tabs.length === 0 || panels.length === 0) {
    return;
  }
  const targetId = tabs.some((tab) => tab.dataset.classTab === tabId)
    ? tabId
    : tabs[0].dataset.classTab;

  tabs.forEach((tab) => {
    const isActive = tab.dataset.classTab === targetId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  panels.forEach((panel) => {
    const isActive = panel.dataset.classTabPanel === targetId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

export function updateClassTypeVisibility(root, classType) {
  const memberSection = root.querySelector("[data-class-members-section]");
  const ticketSection = root.querySelector("[data-class-tickets-section]");
  const isDaycare = classType === "daycare";
  if (memberSection) {
    memberSection.hidden = isDaycare;
  }
  if (ticketSection) {
    ticketSection.hidden = isDaycare;
  }
}

export function resetClassForm(root, weeklyDefaults, holidayDefault, defaultClassType) {
  const name = root.querySelector("[data-class-name]");
  const teacher = root.querySelector("[data-class-teacher]");
  const capacity = root.querySelector("[data-class-capacity]");
  const description = root.querySelector("[data-class-description]");
  const weightMin = root.querySelector("[data-class-weight-min]");
  const weightMax = root.querySelector("[data-class-weight-max]");
  const startTime = root.querySelector("[data-class-start]");
  const endTime = root.querySelector("[data-class-end]");
  const holidayInput = root.querySelector("[data-class-public-holiday]");
  const dayButtons = Array.from(
    root.querySelectorAll("[data-class-day]")
  );
  root.dataset.classType = defaultClassType;

  if (name) {
    name.value = "";
  }
  if (teacher) {
    teacher.value = "";
  }
  if (capacity) {
    capacity.value = "";
  }
  if (description) {
    description.value = "";
  }
  if (weightMin) {
    weightMin.value = "";
  }
  if (weightMax) {
    weightMax.value = "";
  }
  if (startTime) {
    startTime.value = "09:00";
  }
  if (endTime) {
    endTime.value = "18:00";
  }
  dayButtons.forEach((button) => {
    const dayKey = button.dataset.classDay;
    const isSelected = typeof weeklyDefaults?.[dayKey] === "boolean"
      ? weeklyDefaults[dayKey]
      : ["mon", "tue", "wed", "thu", "fri"].includes(dayKey);
    button.classList.toggle("is-selected", isSelected);
  });
  if (holidayInput) {
    holidayInput.checked = Boolean(holidayDefault);
  }
  updateClassTypeVisibility(root, defaultClassType);
  applyMemberSelection(root, []);
  applyTicketSelection(root, []);
}

export function fillClassForm(root, classItem, holidayDefault, defaultClassType) {
  const name = root.querySelector("[data-class-name]");
  const teacher = root.querySelector("[data-class-teacher]");
  const capacity = root.querySelector("[data-class-capacity]");
  const description = root.querySelector("[data-class-description]");
  const weightMin = root.querySelector("[data-class-weight-min]");
  const weightMax = root.querySelector("[data-class-weight-max]");
  const startTime = root.querySelector("[data-class-start]");
  const endTime = root.querySelector("[data-class-end]");
  const holidayInput = root.querySelector("[data-class-public-holiday]");
  const dayButtons = Array.from(
    root.querySelectorAll("[data-class-day]")
  );

  if (name) {
    name.value = classItem?.name || "";
  }
  if (teacher) {
    teacher.value = classItem?.teacher || "";
  }
  if (capacity) {
    capacity.value = classItem?.capacity ? String(classItem.capacity) : "";
  }
  if (description) {
    description.value = classItem?.description || "";
  }
  if (weightMin) {
    weightMin.value = classItem?.weightMin ? String(classItem.weightMin) : "";
  }
  if (weightMax) {
    weightMax.value = classItem?.weightMax ? String(classItem.weightMax) : "";
  }
  if (startTime) {
    startTime.value = classItem?.startTime || "09:00";
  }
  if (endTime) {
    endTime.value = classItem?.endTime || "18:00";
  }
  dayButtons.forEach((button) => {
    const isSelected = Array.isArray(classItem?.days)
      ? classItem.days.includes(button.dataset.classDay)
      : ["mon", "tue", "wed", "thu", "fri"].includes(button.dataset.classDay);
    button.classList.toggle("is-selected", isSelected);
  });
  if (holidayInput) {
    holidayInput.checked = typeof classItem?.publicHolidayOff === "boolean"
      ? classItem.publicHolidayOff
      : Boolean(holidayDefault);
  }
  const nextType = classItem?.type || defaultClassType;
  root.dataset.classType = nextType;
  updateClassTypeVisibility(root, nextType);
  applyMemberSelection(root, classItem?.memberIds);
  applyTicketSelection(root, classItem?.ticketIds);
}

