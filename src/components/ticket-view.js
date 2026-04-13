import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  formatTicketType,
  formatTicketValidity,
  formatTicketWeekdays,
  getTicketQuantityValue,
} from "../services/ticket-service.js";

function createCell(value, className) {
  const cell = document.createElement("span");
  cell.setAttribute("role", "cell");
  if (className) {
    cell.className = className;
  }
  cell.textContent = value;
  return cell;
}

function createIssueButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ticket-issue-button";
  button.textContent = "지급";
  return button;
}

export function renderTicketRows(container, tickets) {
  container.innerHTML = "";

  tickets.forEach((ticket) => {
    const row = document.createElement("div");
    row.className = "ticket-table__row";
    row.setAttribute("role", "row");
    row.dataset.ticketId = ticket.id || "";

    row.appendChild(createCell(formatTicketType(ticket.type), "ticket-table__type"));
    row.appendChild(
      createCell(formatTicketDisplayName(ticket), "ticket-table__name")
    );
    row.appendChild(
      createCell(
        formatTicketCount(getTicketQuantityValue(ticket), ticket.type),
        "ticket-table__count"
      )
    );
    row.appendChild(
      createCell(
        formatTicketValidity(
          ticket.validity,
          ticket.unit,
          ticket.unlimitedValidity
        ),
        "ticket-table__validity"
      )
    );
    row.appendChild(
      createCell(
        formatTicketWeekdays(ticket.weekdays),
        "ticket-table__weekdays"
      )
    );
    row.appendChild(
      createCell(formatTicketPrice(ticket.price), "ticket-table__price")
    );

    const issueCell = document.createElement("span");
    issueCell.setAttribute("role", "cell");
    issueCell.appendChild(createIssueButton());
    row.appendChild(issueCell);

    container.appendChild(row);
  });
}

