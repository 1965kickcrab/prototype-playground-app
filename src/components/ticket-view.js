import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  formatTicketValidity,
  getTicketQuantityValue,
} from "../services/ticket-service.js";

function createMetaText(ticket) {
  return [
    formatTicketCount(getTicketQuantityValue(ticket), ticket.type),
    formatTicketValidity(ticket.validity, ticket.unit, ticket.unlimitedValidity),
    formatTicketPrice(ticket.price),
  ].join(" / ");
}

export function renderTicketRows(container, tickets) {
  container.innerHTML = "";

  tickets.forEach((ticket) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ticket-list-page__item";
    row.setAttribute("role", "listitem");
    row.dataset.ticketRow = "";
    row.dataset.ticketId = ticket.id || "";

    const copy = document.createElement("span");
    copy.className = "ticket-list-page__item-copy";

    const title = document.createElement("strong");
    title.textContent = formatTicketDisplayName(ticket);
    const meta = document.createElement("span");
    meta.textContent = createMetaText(ticket);

    const icon = document.createElement("img");
    icon.className = "ticket-list-page__item-chevron";
    icon.src = "../../assets/iconChevronRight.svg";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");

    copy.append(title, meta);
    row.append(copy, icon);

    container.appendChild(row);
  });
}

