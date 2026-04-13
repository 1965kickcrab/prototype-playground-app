import { loadIssueMembers } from "../storage/ticket-issue-members.js";
import { renderMemberTagChips } from "../components/member-tags.js";
import { getMemberPhone } from "../services/member-page-service.js";
import { getDatePartsFromKey } from "../utils/date.js";
import { formatTicketPrice } from "../services/ticket-service.js";
import { getEntryTicketUsages } from "../services/ticket-usage-service.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const BILLING_LABELS = {
  HOTELING_NIGHT: "숙박 요금",
  PICKDROP_ONEWAY: "픽드랍 요금 (편도)",
  PICKDROP_ROUNDTRIP: "픽드랍 요금 (왕복)",
  SCHOOL: "유치원 요금",
  DAYCARE: "데이케어 요금",
};

export function getMemberIdFromReservation(reservation) {
  return String(reservation?.memberId || "").trim();
}

export function getMemberByReservation(reservation, members = null) {
  const targetMembers = Array.isArray(members) ? members : loadIssueMembers();
  const memberId = getMemberIdFromReservation(reservation);
  if (memberId) {
    const matchedById =
      targetMembers.find((member) => String(member?.id || "") === memberId) || null;
    if (matchedById) {
      return matchedById;
    }
  }
  const dogName = String(reservation?.dogName || "").trim();
  const owner = String(reservation?.owner || "").trim();
  if (!dogName && !owner) {
    return null;
  }
  return (
    targetMembers.find((member) => {
      const sameDogName = dogName && String(member?.dogName || "").trim() === dogName;
      const sameOwner = owner && String(member?.owner || "").trim() === owner;
      return sameDogName && sameOwner;
    }) || null
  );
}

export function formatDateKeyLabel(dateKey) {
  const parts = getDatePartsFromKey(dateKey);
  if (!parts) {
    return "-";
  }
  const targetDate = new Date(parts.year, parts.month - 1, parts.day);
  if (Number.isNaN(targetDate.getTime())) {
    return "-";
  }
  const weekday = WEEKDAY_LABELS[targetDate.getDay()] || "";
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 (${weekday})`;
}

export function formatTimeLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "-";
  }
  const [hourText = "", minuteText = ""] = normalized.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return normalized;
  }
  const meridiem = hour >= 12 ? "오후" : "오전";
  const normalizedHour = hour % 12 || 12;
  return `${meridiem} ${normalizedHour}시 ${String(minute).padStart(2, "0")}분`;
}

function toAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildAmountLabel(amount, options = {}) {
  const numeric = toAmount(amount);
  const prefix = options.prefix || "";
  if (numeric === 0 && options.zeroText) {
    return options.zeroText;
  }
  return `${prefix}${formatTicketPrice(numeric)}`;
}

export function buildReservationChargeLabel(code, options = {}) {
  if (code === "HOTELING_NIGHT") {
    const nightCount = Number(options.nightCount) || 0;
    return nightCount > 0 ? `${nightCount}박 요금` : BILLING_LABELS.HOTELING_NIGHT;
  }
  return BILLING_LABELS[code] || "기타 요금";
}

export function buildReservationBillingBreakdown(reservation, options = {}) {
  const charges = Array.isArray(reservation?.billing?.charges)
    ? reservation.billing.charges
    : [];
  const basicCodes = new Set(Array.isArray(options.basicCodes) ? options.basicCodes : []);
  const grouped = charges.reduce((acc, charge) => {
    const code = String(charge?.code || "ETC");
    if (!acc[code]) {
      acc[code] = {
        code,
        amount: 0,
        count: 0,
      };
    }
    acc[code].amount += toAmount(charge?.amount);
    acc[code].count += 1;
    return acc;
  }, {});

  const basicRows = [];
  const discountRows = [];
  const extraRows = [];

  Object.values(grouped).forEach((group) => {
    const amount = toAmount(group.amount);
    const row = {
      label: buildReservationChargeLabel(group.code, {
        nightCount: group.code === "HOTELING_NIGHT" ? group.count : 0,
      }),
      amount: Math.abs(amount),
      prefix: amount < 0 ? "- " : "",
    };

    if (amount < 0) {
      discountRows.push(row);
      return;
    }
    if (basicCodes.has(group.code)) {
      basicRows.push(row);
      return;
    }
    extraRows.push(row);
  });

  return {
    basicRows,
    discountRows,
    extraRows,
  };
}

function getTicketUsageUnit(ticket) {
  const explicitUnit = String(ticket?.unit || "").trim();
  if (explicitUnit) {
    return explicitUnit;
  }
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    return "시간";
  }
  if (type === "hoteling") {
    return "박";
  }
  return "회";
}

function getTicketUsageLabel(ticket, ticketId) {
  const explicitName = String(ticket?.name || "").trim();
  if (explicitName) {
    return explicitName;
  }
  const type = String(ticket?.type || "").trim();
  if (type === "daycare") {
    return "데이케어 이용권";
  }
  if (type === "hoteling") {
    return "호텔링 이용권";
  }
  if (type === "oneway" || String(ticket?.pickdropType || "").trim() === "편도") {
    return "픽드랍 이용권 (편도)";
  }
  if (type === "roundtrip" || String(ticket?.pickdropType || "").trim() === "왕복") {
    return "픽드랍 이용권 (왕복)";
  }
  if (type === "school") {
    return "유치원 이용권";
  }
  return ticketId ? `이용권 ${ticketId}` : "이용권";
}

export function buildReservationTicketUsageRows(reservation, member) {
  const entries = Array.isArray(reservation?.dates)
    ? reservation.dates
    : reservation?.date
      ? [reservation]
      : [];
  const usageCounts = new Map();

  entries.forEach((entry) => {
    getEntryTicketUsages(entry).forEach((usage) => {
      const ticketId = String(usage?.ticketId || "").trim();
      if (!ticketId) {
        return;
      }
      usageCounts.set(ticketId, (usageCounts.get(ticketId) || 0) + 1);
    });
  });

  const memberTickets = Array.isArray(member?.tickets) ? member.tickets : [];
  return Array.from(usageCounts.entries()).map(([ticketId, count]) => {
    const ticket =
      memberTickets.find((item) => String(item?.id || "").trim() === ticketId)
      || null;
    return {
      label: getTicketUsageLabel(ticket, ticketId),
      valueText: `${count}${getTicketUsageUnit(ticket)}`,
    };
  });
}

export function renderReservationBillingRows(container, rows, emptyText) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "reservation-detail-page__billing-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "reservation-detail-page__billing-row";

    const label = document.createElement("span");
    label.textContent = row.label || "-";

    const amount = document.createElement("span");
    amount.textContent = row.valueText || buildAmountLabel(row.amount, {
      prefix: row.prefix || "",
    });

    item.appendChild(label);
    item.appendChild(amount);
    container.appendChild(item);
  });
}

export function renderReservationMemberInfo(refs, reservation, member) {
  if (!refs) {
    return;
  }
  const dogName = member?.dogName || reservation?.dogName || "-";
  const breed = member?.breed || reservation?.breed || "-";
  const weight =
    member?.weight
    || reservation?.weight
    || reservation?.memberWeight
    || reservation?.petWeight
    || "-";
  const owner = member?.owner || reservation?.owner || "-";
  const memberPhone = member ? getMemberPhone(member) : "";
  const phone = memberPhone && memberPhone !== "-" ? memberPhone : reservation?.phone || "-";
  const weightText = weight === "-"
    ? "-"
    : /kg$/i.test(String(weight).trim())
      ? String(weight).trim()
      : `${weight}kg`;

  if (refs.dogName) {
    refs.dogName.textContent = dogName;
  }
  if (refs.breed) {
    refs.breed.textContent = breed;
  }
  if (refs.weight) {
    refs.weight.textContent = weightText;
  }
  if (refs.owner) {
    refs.owner.textContent = owner;
  }
  if (refs.phone) {
    refs.phone.textContent = phone;
  }
  renderMemberTagChips(refs.petTags, member?.petTags, { hiddenWhenEmpty: true });
}

export function navigateBackOrFallback(fallbackUrl) {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = fallbackUrl;
}
