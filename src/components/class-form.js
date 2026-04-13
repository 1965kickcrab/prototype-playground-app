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
    meta.textContent = `${formatTicketCount(
      Number(ticket?.totalHours) > 0 && ticket?.type === "daycare"
        ? Number(ticket.totalHours)
        : Number(ticket.quantity) || 0,
      ticket?.type || ""
    )} · ${formatTicketValidity(ticket.validity, ticket.unit, ticket.unlimitedValidity)}`;

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

function collectRoomPricingExtraFees(root) {
  const result = {};
  root.querySelectorAll("[data-room-pricing-extra-fee]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const key = input.dataset.roomPricingExtraFee || "";
    if (!key) {
      return;
    }
    result[key] = input.value.trim();
  });
  return result;
}

export function syncRoomPricingExtraModeVisibility(root) {
  const enabledToggle = root.querySelector("[data-room-pricing-extra-enabled]");
  const modeToggleRow = root.querySelector("[data-room-pricing-extra-mode-toggle]");
  const customModeButton = root.querySelector(
    "[data-room-pricing-extra-mode='daily'].is-selected"
  );
  const groupedSection = root.querySelector("[data-room-pricing-extra-grouped]");
  const dailySection = root.querySelector("[data-room-pricing-extra-daily]");
  const isEnabled = enabledToggle instanceof HTMLInputElement
    ? enabledToggle.checked
    : false;
  const isCustom = customModeButton instanceof HTMLButtonElement;

  if (modeToggleRow) {
    modeToggleRow.hidden = !isEnabled;
  }

  if (groupedSection) {
    groupedSection.hidden = !isEnabled || isCustom;
  }
  if (dailySection) {
    dailySection.hidden = !isEnabled || !isCustom;
  }
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
      root.querySelector("[data-room-pricing-weight-min]")?.value.trim() || "";
    const weightMaxValue =
      root.querySelector("[data-room-pricing-weight-max]")?.value.trim() || "";
    const pricingPrice =
      root.querySelector("[data-room-pricing-price]")?.value.trim() || "";
    const pricingVatSeparate =
      root.querySelector("[data-room-pricing-vat]")?.checked || false;
    const pricingExtraEnabled = root.querySelector("[data-room-pricing-extra-enabled]")?.checked
      || false;
    const pricingExtraMode = root.querySelector(
      "[data-room-pricing-extra-mode='daily'].is-selected"
    )
      ? "daily"
      : "grouped";
    const pricingExtraFees = collectRoomPricingExtraFees(root);
    const weightMin = Number.parseFloat(weightMinValue);
    const weightMax = Number.parseFloat(weightMaxValue);
    return {
      name,
      capacity: Number.isNaN(capacity) ? 0 : capacity,
      description,
      ticketIds,
      type: classType,
      pricing: {
        weightMin: Number.isNaN(weightMin) ? "" : weightMin,
        weightMax: Number.isNaN(weightMax) ? "" : weightMax,
        weekdays: [],
        price: pricingPrice,
        vatSeparate: pricingVatSeparate,
        extraFeeEnabled: pricingExtraEnabled,
        extraFeeMode: pricingExtraMode,
        extraFees: pricingExtraFees,
      },
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
    ticketSection.hidden = false;
  }
}

export function resetClassForm(root, weeklyDefaults, holidayDefault, defaultClassType) {
  const name = root.querySelector("[data-class-name]");
  const teacher = root.querySelector("[data-class-teacher]");
  const capacity = root.querySelector("[data-class-capacity]");
  const description = root.querySelector("[data-class-description]");
  const roomPricingWeightMin = root.querySelector("[data-room-pricing-weight-min]");
  const roomPricingWeightMax = root.querySelector("[data-room-pricing-weight-max]");
  const roomPricingPrice = root.querySelector("[data-room-pricing-price]");
  const roomPricingVat = root.querySelector("[data-room-pricing-vat]");
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
  if (roomPricingWeightMin) {
    roomPricingWeightMin.value = "";
  }
  if (roomPricingWeightMax) {
    roomPricingWeightMax.value = "";
  }
  if (roomPricingPrice) {
    roomPricingPrice.value = "";
  }
  if (roomPricingVat) {
    roomPricingVat.checked = false;
  }
  const roomPricingExtraEnabled = root.querySelector("[data-room-pricing-extra-enabled]");
  if (roomPricingExtraEnabled instanceof HTMLInputElement) {
    roomPricingExtraEnabled.checked = false;
  }
  root.querySelectorAll("[data-room-pricing-extra-mode]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const isSelected = button.dataset.roomPricingExtraMode === "grouped";
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  });
  root.querySelectorAll("[data-room-pricing-extra-fee]").forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  });
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
  syncRoomPricingExtraModeVisibility(root);
  updateClassTypeVisibility(root, defaultClassType);
  applyMemberSelection(root, []);
  applyTicketSelection(root, []);
}

export function fillClassForm(root, classItem, holidayDefault, defaultClassType, pricingItem = null) {
  const name = root.querySelector("[data-class-name]");
  const teacher = root.querySelector("[data-class-teacher]");
  const capacity = root.querySelector("[data-class-capacity]");
  const description = root.querySelector("[data-class-description]");
  const roomPricingWeightMin = root.querySelector("[data-room-pricing-weight-min]");
  const roomPricingWeightMax = root.querySelector("[data-room-pricing-weight-max]");
  const roomPricingPrice = root.querySelector("[data-room-pricing-price]");
  const roomPricingVat = root.querySelector("[data-room-pricing-vat]");
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
  if (roomPricingWeightMin) {
    roomPricingWeightMin.value = pricingItem?.weightMin === "" || pricingItem?.weightMin == null
      ? "0"
      : String(pricingItem.weightMin);
  }
  if (roomPricingWeightMax) {
    roomPricingWeightMax.value = pricingItem?.weightMax === "" || pricingItem?.weightMax == null
      ? "99"
      : String(pricingItem.weightMax);
  }
  if (roomPricingPrice) {
    roomPricingPrice.value = pricingItem?.price || "";
  }
  if (roomPricingVat) {
    roomPricingVat.checked = Boolean(pricingItem?.vatSeparate);
  }
  const roomPricingExtraEnabled = root.querySelector("[data-room-pricing-extra-enabled]");
  const extraMode = pricingItem?.extraFeeMode === "daily" ? "daily" : "grouped";
  root.querySelectorAll("[data-room-pricing-extra-mode]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const isSelected = button.dataset.roomPricingExtraMode === extraMode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  });
  const extraFees = pricingItem?.extraFees && typeof pricingItem.extraFees === "object"
    ? pricingItem.extraFees
    : {};
  if (roomPricingExtraEnabled instanceof HTMLInputElement) {
    roomPricingExtraEnabled.checked = Boolean(pricingItem?.extraFeeEnabled);
  }
  root.querySelectorAll("[data-room-pricing-extra-fee]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const key = input.dataset.roomPricingExtraFee || "";
    input.value = key ? String(extraFees[key] ?? "") : "";
  });
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
  syncRoomPricingExtraModeVisibility(root);
  const nextType = classItem?.type || defaultClassType;
  root.dataset.classType = nextType;
  updateClassTypeVisibility(root, nextType);
  applyMemberSelection(root, classItem?.memberIds);
  applyTicketSelection(root, classItem?.ticketIds);
}
