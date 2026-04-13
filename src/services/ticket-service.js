import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "../utils/weekday.js";

function formatNumber(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTicketUnitLabel(type) {
  if (type === "daycare") {
    return "시간";
  }
  if (type === "hoteling") {
    return "박";
  }
  return "회";
}

export function getTicketQuantityValue(ticket = {}) {
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    const hours = toFiniteNumber(ticket?.totalHours);
    if (hours !== null && hours > 0) {
      return hours;
    }
  }
  const quantity = toFiniteNumber(ticket?.quantity);
  if (quantity !== null && quantity > 0) {
    return quantity;
  }
  if (type === "daycare") {
    const fallbackHours = toFiniteNumber(ticket?.quantity);
    if (fallbackHours !== null && fallbackHours > 0) {
      return fallbackHours;
    }
  }
  return 0;
}

export function getTicketTotalValue(ticket = {}) {
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    const totalHours = toFiniteNumber(ticket?.totalHours);
    if (totalHours !== null) {
      return totalHours;
    }
  }
  const totalCount = toFiniteNumber(ticket?.totalCount);
  if (totalCount !== null) {
    return totalCount;
  }
  return getTicketQuantityValue(ticket);
}

export function getTicketReservableValue(ticket = {}) {
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    const reservableHours = toFiniteNumber(ticket?.reservableHours);
    if (reservableHours !== null) {
      return reservableHours;
    }
  }
  const reservableCount = toFiniteNumber(ticket?.reservableCount);
  if (reservableCount !== null) {
    return reservableCount;
  }
  return getTicketTotalValue(ticket);
}

export function getTicketUsedValue(ticket = {}) {
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    const usedHours = toFiniteNumber(ticket?.usedHours);
    if (usedHours !== null) {
      return usedHours;
    }
  }
  const usedCount = toFiniteNumber(ticket?.usedCount);
  return usedCount !== null ? usedCount : 0;
}

export function getTicketReservedValue(ticket = {}) {
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    const reservedHours = toFiniteNumber(ticket?.reservedHours);
    if (reservedHours !== null) {
      return reservedHours;
    }
  }
  const reservedCount = toFiniteNumber(ticket?.reservedCount);
  return reservedCount !== null ? reservedCount : 0;
}

export function formatTicketCount(quantity, type = "") {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "-";
  }

  return `${quantity}${getTicketUnitLabel(type)}`;
}

export function formatTicketType(type) {
  const map = {
    school: "유치원",
    daycare: "데이케어",
    hoteling: "호텔링",
    pickdrop: "픽드랍",
  };

  return map[type] || "-";
}

export function normalizePickdropType(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  const lowered = trimmed.toLowerCase();
  if (trimmed === "왕복" || lowered === "roundtrip") {
    return "왕복";
  }
  return "편도";
}

export function formatPickdropType(value) {
  const normalized = normalizePickdropType(value);
  if (!normalized) {
    return "-";
  }
  if (normalized === "편도" || normalized === "왕복") {
    return normalized;
  }
  return normalized;
}

export function formatTicketDisplayName(ticket = {}) {
  if (ticket.type === "pickdrop") {
    return formatPickdropType(ticket.pickdropType || ticket.name);
  }
  return ticket.name || "-";
}

export function formatTicketValidity(validity, unit, unlimitedValidity) {
  if (unlimitedValidity) {
    return "무제한";
  }

  if (!Number.isFinite(validity) || !unit) {
    return "-";
  }

  return `${validity}${unit}`;
}

export function formatStartDatePolicy(policy) {
  const map = {
    "first-attendance": "첫 등원일",
    "first-reservation": "첫 예약일",
    "issue-date": "지급일",
    "purchase-date": "구매일",
  };

  return map[policy] || "-";
}

export function formatReservationRule(rule) {
  const map = {
    expiry: "만료일로 제한",
    none: "제한 없음",
    "fixed-window": "기간 내",
  };

  return map[rule] || "-";
}

export function formatTicketWeekdays(weekdays) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return "-";
  }
  const set = new Set(weekdays);
  const labels = WEEKDAY_ORDER
    .filter((key) => set.has(key))
    .map((key) => WEEKDAY_LABELS[key])
    .filter(Boolean);
  return labels.length ? labels.join(", ") : "-";
}

export function formatTicketPrice(price, options = {}) {
  if (!Number.isFinite(price)) {
    return "-";
  }

  const allowNegative = options?.allowNegative === true;
  const resolved = allowNegative ? price : Math.max(price, 0);
  const absolute = Math.abs(resolved);
  return `${resolved < 0 ? "-" : ""}${formatNumber(absolute)}원`;
}

export function addValidityToDateKey(dateKey, validity, unit) {
  const text = String(dateKey || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !Number.isFinite(Number(validity)) || Number(validity) <= 0 || !unit) {
    return "";
  }

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  const amount = Number(validity);

  if (unit === "일") {
    date.setDate(date.getDate() + amount);
  } else if (unit === "주") {
    date.setDate(date.getDate() + (amount * 7));
  } else if (unit === "개월") {
    date.setMonth(date.getMonth() + amount);
  } else if (unit === "년") {
    date.setFullYear(date.getFullYear() + amount);
  } else {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


