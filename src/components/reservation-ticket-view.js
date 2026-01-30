import { formatTicketDisplayName, formatTicketType } from "../services/ticket-service.js";

export function renderTicketOptions(
  container,
  placeholder,
  tickets,
  selectionOrder,
  allocations,
  hasMember,
  selectedCount,
  usedAllocations,
  disabledIds = new Set()
) {
  if (!container || !placeholder) {
    return;
  }

  container.innerHTML = "";

  if (!tickets.length) {
    placeholder.hidden = !hasMember;
    return;
  }

  placeholder.hidden = true;
  const selectedSet = new Set(selectionOrder);
  const fragment = document.createDocumentFragment();

  tickets.forEach((ticket) => {
    const row = document.createElement("label");
    row.className = "reservation-ticket-row";
    row.dataset.ticketId = ticket.id;
    const isDisabled = disabledIds.has(ticket.id);
    if (selectedSet.has(ticket.id)) {
      row.classList.add("is-selected");
    }
    if (isDisabled) {
      row.classList.add("is-disabled");
    }

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = ticket.id;
    input.checked = selectedSet.has(ticket.id);
    input.disabled = isDisabled;
    input.setAttribute("data-reservation-ticket", "");

    const box = document.createElement("span");
    box.className = "reservation-ticket-row__box";

    const info = document.createElement("span");
    info.className = "reservation-ticket-row__info";

    const name = document.createElement("span");
    name.className = "reservation-ticket-row__name";
    const badge = document.createElement("span");
    badge.className = "reservation-ticket-row__badge";
    badge.textContent = formatTicketType(ticket.type);
    if (ticket.type) {
      badge.dataset.type = ticket.type;
    }
    const nameText = document.createElement("span");
    nameText.className = "reservation-ticket-row__name-text";
    nameText.textContent = formatTicketDisplayName(ticket);
    name.appendChild(badge);
    name.appendChild(nameText);

    const remainingBeforeRaw = Number(ticket.remainingCount);
    const remainingBefore = Number.isFinite(remainingBeforeRaw) ? remainingBeforeRaw : 0;
    const unitLabel = ticket.type === "hoteling" ? "박" : "회";
    const meta = document.createElement("span");
    meta.className = "reservation-ticket-row__meta";
    if (selectedSet.has(ticket.id)) {
      const remainingAfter = Math.max(remainingBefore - (Number(selectedCount) || 0), 0);
      const beforeValue = document.createElement("span");
      beforeValue.className = "reservation-ticket-row__meta-value";
      if (remainingBefore <= 2) {
        beforeValue.classList.add("is-low");
      }
      beforeValue.textContent = `${remainingBefore}${unitLabel}`;
      const afterValue = document.createElement("span");
      afterValue.className = "reservation-ticket-row__meta-value";
      if (remainingAfter <= 2) {
        afterValue.classList.add("is-low");
      }
      afterValue.textContent = `${remainingAfter}${unitLabel}`;
      meta.dataset.unitLabel = unitLabel;
      meta.append(beforeValue, " → ", afterValue);
      info.appendChild(name);
      info.appendChild(meta);
      row.appendChild(input);
      row.appendChild(box);
      row.appendChild(info);
      fragment.appendChild(row);
      return;
    }
    meta.textContent = `${remainingBefore}${unitLabel}`;

    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(input);
    row.appendChild(box);
    row.appendChild(info);

    fragment.appendChild(row);
  });

  container.appendChild(fragment);
}
