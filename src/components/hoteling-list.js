function clearDataRows(table) {
  if (!table) {
    return;
  }
  const rows = table.querySelectorAll(".hoteling-table__row--data");
  rows.forEach((row) => row.remove());
}

function buildRow({ reservation, entry }) {
  const row = document.createElement("div");
  row.className = "hoteling-table__row hoteling-table__row--data";
  row.setAttribute("role", "row");
  row.dataset.reservationId = reservation.id;
  row.dataset.entryKind = entry.kind || "";

  const checkCell = document.createElement("span");
  checkCell.className = "hoteling-table__check";
  checkCell.setAttribute("role", "cell");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "선택");
  checkCell.appendChild(checkbox);

  const nameCell = document.createElement("span");
  nameCell.className = "hoteling-table__name-wrap";
  nameCell.setAttribute("role", "cell");

  const name = document.createElement("span");
  name.className = "hoteling-table__name";
  name.textContent = reservation.dogName || "-";

  const meta = document.createElement("span");
  meta.className = "hoteling-table__meta";
  meta.textContent = reservation.owner || "-";

  nameCell.appendChild(name);
  nameCell.appendChild(meta);

  const timeCell = document.createElement("span");
  timeCell.className = "hoteling-table__time";
  timeCell.setAttribute("role", "cell");
  timeCell.textContent = entry.time || "-";

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
  row.appendChild(nameCell);
  row.appendChild(timeCell);
  row.appendChild(moreCell);

  return row;
}

function renderTable(table, entries, emptyRow) {
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
    const row = buildRow(entry);
    table.appendChild(row);
  });
}

export function renderHotelingList(elements, groups) {
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
    elements.checkinEmptyRow
  );
  renderTable(
    elements.checkoutTable,
    checkout,
    elements.checkoutEmptyRow
  );
  renderTable(
    elements.stayTable,
    stay,
    elements.stayEmptyRow
  );
}

