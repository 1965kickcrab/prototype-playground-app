import { getTicketUnitLabel } from "../services/ticket-service.js";

function createCell(content, className) {
  const cell = document.createElement("span");
  cell.setAttribute("role", "cell");
  if (className) {
    cell.className = className;
  }
  if (typeof content === "string") {
    cell.textContent = content;
  } else if (content) {
    cell.appendChild(content);
  }
  return cell;
}

function createCheckbox(isChecked, label) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = isChecked;
  input.dataset.issueSelect = "true";
  input.setAttribute("aria-label", label);
  return input;
}

function getAvailabilityUnit(ticketType) {
  return getTicketUnitLabel(ticketType);
}

function createAvailability(availability, ticketType) {
  const wrapper = document.createElement("span");
  wrapper.className = "ticket-issue-table__availability";
  const { totalReservable } = availability || {};
  const unit = getAvailabilityUnit(ticketType);

  const appendValue = (valueText, options = {}) => {
    const value = document.createElement("span");
    value.className = "ticket-issue-table__availability-value";
    if (options.isOverage) {
      value.classList.add("ticket-issue-table__overage");
    }
    value.textContent = valueText;
    wrapper.appendChild(value);

    if (valueText !== "-" && options.appendUnit !== false) {
      const unitEl = document.createElement("span");
      unitEl.className = "ticket-issue-table__availability-unit";
      unitEl.textContent = unit;
      wrapper.appendChild(unitEl);
    }
  };

  if (Number.isFinite(totalReservable)) {
    if (totalReservable <= 2) {
      wrapper.classList.add("is-low");
    }
    if (totalReservable < 0) {
      wrapper.classList.add("is-overage");
      appendValue(`초과 ${Math.abs(totalReservable)}`, {
        isOverage: true,
      });
    } else {
      appendValue(String(totalReservable));
    }
  } else {
    appendValue("-");
  }

  return wrapper;
}

function createQuantityControl(quantity, isSelected) {
  const wrapper = document.createElement("div");
  wrapper.className = "ticket-issue-quantity";
  if (!isSelected) {
    wrapper.classList.add("is-disabled");
  }

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "ticket-issue-quantity__button";
  minus.textContent = "-";
  minus.dataset.issueQuantity = "decrease";
  minus.disabled = !isSelected || quantity <= 1;

  const value = document.createElement("span");
  value.className = "ticket-issue-quantity__value";
  value.dataset.issueQuantityValue = "true";
  value.textContent = String(isSelected ? quantity : 1);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "ticket-issue-quantity__button";
  plus.textContent = "+";
  plus.dataset.issueQuantity = "increase";
  plus.disabled = !isSelected;

  wrapper.appendChild(minus);
  wrapper.appendChild(value);
  wrapper.appendChild(plus);

  return wrapper;
}

export function renderIssueRows(container, members, selections, availabilityMap, ticketType) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  members.forEach((member) => {
    const row = document.createElement("div");
    row.className = "ticket-issue-table__row";
    row.setAttribute("role", "row");
    row.dataset.memberId = member.id;

    const isSelected = selections.has(member.id);
    if (isSelected) {
      row.classList.add("is-selected");
    }

    const quantity = selections.get(member.id) || 1;

    row.appendChild(createCell(createCheckbox(isSelected, `${member.dogName} 선택`)));
    row.appendChild(createCell(member.dogName || "-"));
    row.appendChild(createCell(member.breed || "-"));
    row.appendChild(createCell(member.owner || "-"));
    row.appendChild(
      createCell(createAvailability(availabilityMap.get(member.id), ticketType))
    );
    row.appendChild(createCell(createQuantityControl(quantity, isSelected)));

    fragment.appendChild(row);
  });

  container.appendChild(fragment);
}
