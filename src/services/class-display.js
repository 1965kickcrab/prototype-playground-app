const DAY_LABELS = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
};

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function formatDays(days) {
  if (!Array.isArray(days) || days.length === 0) {
    return "-";
  }

  return DAY_ORDER.filter((day) => days.includes(day))
    .map((day) => DAY_LABELS[day])
    .join("·");
}

export function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) {
    return "-";
  }

  return `${startTime} ~ ${endTime}`;
}

export function formatCapacity(capacity) {
  if (!capacity) {
    return "-";
  }

  return `${capacity}`;
}

export function formatMemberCount(memberIds) {
  const count = Array.isArray(memberIds) ? memberIds.length : 0;
  return `${count}마리`;
}

export function formatTicketSelectionCount(ticketIds) {
  const count = Array.isArray(ticketIds) ? ticketIds.length : 0;
  return `${count}개`;
}
