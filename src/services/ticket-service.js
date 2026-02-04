import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "../utils/weekday.js";

function formatNumber(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatTicketCount(quantity) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "-";
  }

  return `${quantity}회`;
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

export function formatTicketPrice(price) {
  if (!Number.isFinite(price)) {
    return "-";
  }

  return `${formatNumber(Math.max(price, 0))}원`;
}


