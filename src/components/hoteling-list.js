function clearDataRows(table) {
  if (!table) {
    return;
  }
  const rows = table.querySelectorAll(".hoteling-table__row--data");
  rows.forEach((row) => row.remove());
}

function getEntryTimeText(entry) {
  if (!entry || typeof entry !== "object") {
    return "-";
  }
  if (entry.kind === "checkin") {
    return entry.checkinTime || entry.time || "-";
  }
  if (entry.kind === "checkout") {
    return entry.checkoutTime || entry.time || "-";
  }
  return "-";
}

function resolveRoomName(roomValue, roomNameById) {
  const key = String(roomValue || "").trim();
  if (!key) {
    return "-";
  }
  if (roomNameById instanceof Map && roomNameById.has(key)) {
    return roomNameById.get(key) || "-";
  }
  return key;
}

function buildRow({ reservation, entry }, roomNameById, memberById) {
  const memberId = String(reservation?.memberId || "");
  const member = memberById instanceof Map ? memberById.get(memberId) : null;
  const row = document.createElement("div");
  row.className = "hoteling-table__row hoteling-table__row--data";
  row.setAttribute("role", "row");
  row.dataset.reservationId = reservation.id;
  row.dataset.entryDate = entry.date || "";
  row.dataset.entryKind = entry.kind || "";

  const checkCell = document.createElement("span");
  checkCell.className = "hoteling-table__check";
  checkCell.setAttribute("role", "cell");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "선택");
  checkCell.appendChild(checkbox);

  const roomCell = document.createElement("span");
  roomCell.className = "hoteling-table__room";
  roomCell.setAttribute("role", "cell");
  roomCell.textContent = resolveRoomName(reservation.room, roomNameById);

  const nameCell = document.createElement("span");
  nameCell.className = "hoteling-table__name-wrap";
  nameCell.setAttribute("role", "cell");

  const name = document.createElement("span");
  name.className = "hoteling-table__name";
  name.textContent = member?.dogName || reservation.dogName || "-";

  const meta = document.createElement("span");
  meta.className = "hoteling-table__meta";
  meta.textContent = member?.owner || reservation.owner || "-";

  nameCell.appendChild(name);
  nameCell.appendChild(meta);

  const timeCell = document.createElement("span");
  timeCell.className = "hoteling-table__time";
  timeCell.setAttribute("role", "cell");
  if (entry.kind === "checkin" || entry.kind === "checkout") {
    timeCell.dataset.hotelingTimeEdit = "true";
    timeCell.tabIndex = 0;
    timeCell.setAttribute("aria-label", "시간 수정");
  }
  timeCell.textContent = getEntryTimeText(entry);

  const moreCell = document.createElement("span");
  moreCell.className = "hoteling-table__more";
  moreCell.setAttribute("role", "cell");

  const detailButton = document.createElement("button");
  detailButton.type = "button";
  detailButton.className = "hoteling-table__detail-button";
  detailButton.setAttribute("aria-label", "예약 상세 열기");
  detailButton.dataset.hotelingDetailOpen = "";
  const detailIcon = document.createElement("img");
  detailIcon.src = "../../assets/iconChevronRight.svg";
  detailIcon.alt = "";
  detailIcon.setAttribute("aria-hidden", "true");
  detailButton.appendChild(detailIcon);
  moreCell.appendChild(detailButton);

  row.appendChild(checkCell);
  row.appendChild(roomCell);
  row.appendChild(nameCell);
  row.appendChild(timeCell);
  row.appendChild(moreCell);

  return row;
}

function renderTable(table, entries, emptyRow, roomNameById, memberById) {
  if (!table) {
    return;
  }
  clearDataRows(table);

  if (!Array.isArray(entries) || entries.length === 0) {
    if (emptyRow) {
      emptyRow.hidden = false;
    }
    return;
  }

  if (emptyRow) {
    emptyRow.hidden = true;
  }

  entries.forEach((entry) => {
    const row = buildRow(entry, roomNameById, memberById);
    table.appendChild(row);
  });
}

export function renderHotelingList(elements, groups, options = {}) {
  const roomNameById = options.roomNameById instanceof Map
    ? options.roomNameById
    : new Map();
  const memberById = options.memberById instanceof Map
    ? options.memberById
    : new Map();
  const checkin = Array.isArray(groups?.checkin) ? groups.checkin : [];
  const checkout = Array.isArray(groups?.checkout) ? groups.checkout : [];
  const stay = Array.isArray(groups?.stay) ? groups.stay : [];
  const total = checkin.length + checkout.length + stay.length;
  const hasEntries = total > 0;

  if (elements.checkinCountEl) {
    elements.checkinCountEl.textContent = String(checkin.length);
  }
  if (elements.checkoutCountEl) {
    elements.checkoutCountEl.textContent = String(checkout.length);
  }
  if (elements.stayCountEl) {
    elements.stayCountEl.textContent = String(stay.length);
  }
  if (elements.totalCountEl) {
    elements.totalCountEl.textContent = String(total);
  }
  if (elements.listEmptyEl) {
    elements.listEmptyEl.hidden = hasEntries;
  }
  if (elements.checkinSection) {
    elements.checkinSection.hidden = !hasEntries || checkin.length === 0;
  }
  if (elements.checkoutSection) {
    elements.checkoutSection.hidden = !hasEntries || checkout.length === 0;
  }
  if (elements.staySection) {
    elements.staySection.hidden = !hasEntries || stay.length === 0;
  }

  renderTable(
    elements.checkinTable,
    checkin,
    elements.checkinEmptyRow,
    roomNameById,
    memberById
  );
  renderTable(
    elements.checkoutTable,
    checkout,
    elements.checkoutEmptyRow,
    roomNameById,
    memberById
  );
  renderTable(
    elements.stayTable,
    stay,
    elements.stayEmptyRow,
    roomNameById,
    memberById
  );
}
