import {
  formatCapacity,
  formatDays,
  formatMemberCount,
  formatTicketSelectionCount,
  formatTimeRange,
} from "../services/class-display.js";

export function renderClassRows(container, classes, isHotelScope) {
  container.innerHTML = "";

  classes.forEach((classItem) => {
    const row = document.createElement("div");
    row.className = "list-table__row list-table__row--class";
    row.setAttribute("role", "row");
    row.dataset.classId = classItem.id;

    const cells = isHotelScope
      ? [
          classItem.name,
          formatCapacity(classItem.capacity),
          formatTicketSelectionCount(classItem.ticketIds),
        ]
      : [
          classItem.name,
          classItem.teacher,
          formatCapacity(classItem.capacity),
          formatDays(classItem.days),
          formatTimeRange(classItem.startTime, classItem.endTime),
          formatMemberCount(classItem.memberIds),
          formatTicketSelectionCount(classItem.ticketIds),
        ];

    cells.forEach((value) => {
      const cell = document.createElement("span");
      cell.setAttribute("role", "cell");
      cell.textContent = value || "-";
      row.appendChild(cell);
    });

    container.appendChild(row);
  });
}
