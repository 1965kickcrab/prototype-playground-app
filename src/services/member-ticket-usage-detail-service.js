import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  getTicketReservedValue,
  getTicketReservableValue,
  getTicketTotalValue,
  getTicketUnitLabel,
  getTicketUsedValue,
} from "./ticket-service.js";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return text;
  }
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

export function formatDateWithWeekdayLabel(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return formatDateLabel(text);
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const weekday = WEEKDAY_LABELS[date.getDay()] || "";
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일 (${weekday})`;
}

export function formatDateTimeLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return formatDateLabel(text);
  }
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");
  return `${parsed.getFullYear()}년 ${parsed.getMonth() + 1}월 ${parsed.getDate()}일 ${hours}:${minutes}:${seconds}`;
}

export function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateKeyLabelDiff(targetDateKey, baseDateKey = getTodayDateKey()) {
  const targetMatch = String(targetDateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const baseMatch = String(baseDateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!targetMatch || !baseMatch) {
    return "";
  }
  const target = new Date(Number(targetMatch[1]), Number(targetMatch[2]) - 1, Number(targetMatch[3]));
  const base = new Date(Number(baseMatch[1]), Number(baseMatch[2]) - 1, Number(baseMatch[3]));
  const diff = Math.ceil((target.getTime() - base.getTime()) / 86400000);
  if (diff < 0) {
    return "";
  }
  return `${diff}일 남음`;
}

function getTicketExhaustedDateKey(ticket, historyRows = []) {
  const total = getTicketTotalValue(ticket);
  if (!Number.isFinite(total) || total <= 0) {
    return "";
  }
  let used = 0;
  const rows = (Array.isArray(historyRows) ? historyRows : [])
    .filter((row) => {
      const statusKey = String(row?.status?.key || "").trim();
      return statusKey !== "PLANNED" && statusKey !== "CANCELED" && statusKey !== "ABSENT";
    })
    .sort((a, b) => String(a.visitSortDate || "").localeCompare(String(b.visitSortDate || "")));
  for (const row of rows) {
    used += 1;
    if (used >= total) {
      return String(row.visitSortDate || "").trim();
    }
  }
  return "";
}

export function getTicketHistoryStatus(ticket, todayKey = getTodayDateKey(), historyRows = []) {
  const reservable = getTicketReservableValue(ticket);
  const used = getTicketUsedValue(ticket);
  const expiryDate = String(ticket?.expiryDate || "").trim();
  const isExpired = Boolean(expiryDate && expiryDate < todayKey);
  const isExhausted = reservable <= 0;

  if (isExpired && isExhausted) {
    const exhaustedDate = getTicketExhaustedDateKey(ticket, historyRows);
    if (exhaustedDate && exhaustedDate <= expiryDate) {
      return { label: "횟수 소진", tone: "member-detail__ticket-status--danger", rank: 3 };
    }
    return { label: "만료", tone: "member-detail__ticket-status--danger", rank: 2 };
  }
  if (isExpired) {
    return { label: "만료", tone: "member-detail__ticket-status--danger", rank: 2 };
  }
  if (isExhausted) {
    return { label: "횟수 소진", tone: "member-detail__ticket-status--danger", rank: 3 };
  }
  if (used > 0 || getTicketReservedValue(ticket) > 0) {
    return { label: "사용 중", tone: "member-detail__ticket-status--success", rank: 0 };
  }
  return { label: "사용 전", tone: "member-detail__ticket-status--primary", rank: 1 };
}

export function compareTicketHistoryRows(a, b) {
  const rankDiff = (a.status.rank || 0) - (b.status.rank || 0);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const aExpiry = String(a.ticket?.expiryDate || "");
  const bExpiry = String(b.ticket?.expiryDate || "");
  if (aExpiry && bExpiry && aExpiry !== bExpiry) {
    return aExpiry.localeCompare(bExpiry);
  }
  if (aExpiry || bExpiry) {
    return aExpiry ? -1 : 1;
  }

  const aIssue = String(a.ticket?.issueDate || "");
  const bIssue = String(b.ticket?.issueDate || "");
  return bIssue.localeCompare(aIssue);
}

export function buildTicketHistoryRows(member, ticketCatalogMap) {
  const tickets = Array.isArray(member?.tickets) ? member.tickets : [];
  const todayKey = getTodayDateKey();
  return tickets
    .map((ticket, index) => {
      const catalog = ticketCatalogMap.get(String(ticket?.ticketId || "")) || {};
      const type = String(ticket?.type || catalog?.type || "").trim();
      const unitLabel = getTicketUnitLabel(type);
      const reservable = getTicketReservableValue(ticket);
      const expiryDate = String(ticket?.expiryDate || "").trim();
      const validity = Number(ticket?.validity || catalog?.validity);
      const validityUnit = String(ticket?.unit || catalog?.unit || "").trim();
      const unlimitedValidity = Boolean(catalog?.unlimitedValidity);
      const status = getTicketHistoryStatus(ticket, todayKey);
      return {
        id: String(ticket?.id || `${ticket?.ticketId || "ticket"}-${ticket?.issueDate || index}`),
        index,
        type,
        displayName: formatTicketDisplayName({
          ...catalog,
          ...ticket,
          name: ticket?.name || catalog?.name || "",
        }),
        price: Number(catalog?.price),
        reservableLabel: Number.isFinite(reservable) ? `${reservable}${unitLabel}` : "-",
        validityLabel: expiryDate
          ? formatDateLabel(expiryDate)
          : (unlimitedValidity
            ? "무제한"
            : (Number.isFinite(validity) && validity > 0 && validityUnit ? `${validity}${validityUnit}` : "-")),
        priceLabel: formatTicketPrice(Number(catalog?.price)),
        status,
        ticket,
      };
    })
    .sort(compareTicketHistoryRows);
}

function getReservationServiceLabel(reservation) {
  const type = String(reservation?.type || "").trim();
  if (type === "hoteling") {
    return "호텔링";
  }
  if (type === "daycare") {
    return "데이케어";
  }
  return "유치원";
}

function normalizeTicketUsageStatus(statusKey) {
  const key = String(statusKey || "").trim();
  if (key === "ABSENT") {
    return { key, label: "결석", tone: "member-ticket-usage-page__history-status--danger" };
  }
  if (key === "CANCELED") {
    return { key, label: "예약 취소", tone: "member-ticket-usage-page__history-status--danger" };
  }
  if (key === "PLANNED") {
    return { key, label: "예약", tone: "member-ticket-usage-page__history-status--primary" };
  }
  if (key === "CHECKIN") {
    return { key, label: "등원", tone: "member-ticket-usage-page__history-status--success" };
  }
  if (key === "CHECKOUT") {
    return { key, label: "하원", tone: "member-ticket-usage-page__history-status--success" };
  }
  return { key, label: "등원", tone: "member-ticket-usage-page__history-status--success" };
}

function getHotelingUsageStatus(entry = {}) {
  const statusKey = String(entry?.baseStatusKey || "").trim();
  if (statusKey === "CANCELED") {
    return { key: statusKey, label: "예약 취소", tone: "member-ticket-usage-page__history-status--danger" };
  }
  const kind = String(entry?.kind || "").trim();
  if (kind === "checkin") {
    return { key: kind, label: "입실", tone: "member-ticket-usage-page__history-status--success" };
  }
  if (kind === "stay") {
    return { key: kind, label: "숙박", tone: "member-ticket-usage-page__history-status--success" };
  }
  if (kind === "checkout") {
    return { key: kind, label: "퇴실", tone: "member-ticket-usage-page__history-status--success" };
  }
  return normalizeTicketUsageStatus(statusKey || "PLANNED");
}

export function buildMemberTicketUsageHistory(ticket, reservations = []) {
  const issuedTicketId = String(ticket?.id || "").trim();
  if (!issuedTicketId) {
    return [];
  }
  const rows = [];
  (Array.isArray(reservations) ? reservations : []).forEach((reservation) => {
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    entries.forEach((entry) => {
      const usages = Array.isArray(entry?.ticketUsages) ? entry.ticketUsages : [];
      const hasIssuedTicket = usages.some((usage) => String(usage?.ticketId || "").trim() === issuedTicketId);
      if (!hasIssuedTicket) {
        return;
      }
      const status = reservation?.type === "hoteling"
        ? getHotelingUsageStatus(entry)
        : normalizeTicketUsageStatus(entry?.baseStatusKey || "PLANNED");
      const timestamp = String(entry?.baseStatusKey || "").trim() === "CANCELED"
        ? String(entry?.canceledAt || reservation?.updatedAt || reservation?.createdAt || "").trim()
        : String(reservation?.createdAt || "").trim();
      rows.push({
        status,
        serviceLabel: getReservationServiceLabel(reservation),
        visitDateLabel: formatDateLabel(entry?.date),
        visitDateWithWeekdayLabel: formatDateWithWeekdayLabel(entry?.date),
        reservationDateLabel: formatDateTimeLabel(timestamp),
        sortDate: timestamp,
        visitSortDate: String(entry?.date || "").trim(),
      });
    });
  });
  return rows.sort((a, b) => {
    const dateDiff = String(b.visitSortDate || "").localeCompare(String(a.visitSortDate || ""));
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return String(b.sortDate || "").localeCompare(String(a.sortDate || ""));
  });
}

export function buildTicketUsageSummary(historyRows = [], ticket = {}) {
  const summary = {
    planned: 0,
    completed: 0,
    canceled: 0,
  };
  historyRows.forEach((row) => {
    const statusKey = String(row?.status?.key || "").trim();
    if (statusKey === "PLANNED") {
      summary.planned += 1;
    } else if (statusKey === "CANCELED" || statusKey === "ABSENT") {
      summary.canceled += 1;
    } else {
      summary.completed += 1;
    }
  });
  return [
    { key: "reservable", label: "예약 가능", value: getTicketReservableValue(ticket), unit: getTicketUnitLabel(ticket?.type || ""), tone: "is-accent" },
    { key: "planned", label: "예약", value: summary.planned, unit: getTicketUnitLabel(ticket?.type || "") },
    { key: "completed", label: "이용 완료", value: summary.completed, unit: getTicketUnitLabel(ticket?.type || "") },
    { key: "canceled", label: "취소", value: summary.canceled, unit: getTicketUnitLabel(ticket?.type || "") },
  ];
}

export function buildTicketValidityText(ticket, catalogTicket) {
  if (catalogTicket?.unlimitedValidity) {
    return "무제한";
  }
  const validity = Number(ticket?.validity || catalogTicket?.validity);
  const unit = String(ticket?.unit || catalogTicket?.unit || "").trim();
  return Number.isFinite(validity) && validity > 0 && unit ? `${validity}${unit}` : "-";
}

export function buildTicketMetaText(ticket, catalogTicket) {
  const totalLabel = formatTicketCount(
    String(ticket?.type || catalogTicket?.type || "").trim() === "daycare"
      ? Number(ticket?.totalHours)
      : Number(ticket?.totalCount),
    ticket?.type || catalogTicket?.type || ""
  );
  const validityText = buildTicketValidityText(ticket, catalogTicket);
  return `${totalLabel} / ${validityText} / ${formatTicketPrice(Number(catalogTicket?.price))}`;
}

export function buildTicketCardValidityLabel(ticket, fallbackText) {
  const expiryDate = String(ticket?.expiryDate || "").trim();
  const remainText = expiryDate ? getDateKeyLabelDiff(expiryDate) : "";
  return remainText || String(fallbackText || "-");
}

export function buildTicketExpiryText(ticket, catalogTicket) {
  const expiryDate = String(ticket?.expiryDate || "").trim();
  if (!expiryDate) {
    return buildTicketValidityText(ticket, catalogTicket);
  }
  const remainText = getDateKeyLabelDiff(expiryDate);
  return remainText
    ? `${formatDateLabel(expiryDate)} (${remainText})`
    : formatDateLabel(expiryDate);
}

export function buildTicketStartText(ticket) {
  const startDate = String(ticket?.startDate || "").trim();
  if (startDate) {
    return formatDateLabel(startDate);
  }
  return "-\n(첫 등원일)";
}

export function buildTicketReservationRangeText(ticket, catalogTicket) {
  const startText = String(ticket?.startDate || "").trim() ? formatDateLabel(ticket.startDate) : "개시일 이후";
  const expiryDate = String(ticket?.expiryDate || "").trim();
  if (expiryDate) {
    return `${startText} ~ ${formatDateLabel(expiryDate)}`;
  }
  if (catalogTicket?.unlimitedValidity || !String(ticket?.expiryDate || "").trim()) {
    return `${startText} ~ 제한 없음`;
  }
  return `${startText} ~ ${buildTicketExpiryText(ticket, catalogTicket)}`;
}

export function buildTicketUsageDetailViewModel({
  member,
  issuedTicketId,
  catalogTickets,
  reservations,
} = {}) {
  const targetId = String(issuedTicketId || "").trim();
  const issuedTicket = (Array.isArray(member?.tickets) ? member.tickets : [])
    .find((ticket) => String(ticket?.id || "").trim() === targetId);
  if (!issuedTicket) {
    return null;
  }
  const catalogTicket = (Array.isArray(catalogTickets) ? catalogTickets : [])
    .find((ticket) => String(ticket?.id || "").trim() === String(issuedTicket?.ticketId || "").trim()) || {};
  const historyRows = buildMemberTicketUsageHistory(issuedTicket, reservations);
  const summaryItems = buildTicketUsageSummary(historyRows, issuedTicket);
  const status = getTicketHistoryStatus(issuedTicket, getTodayDateKey(), historyRows);
  const displayName = formatTicketDisplayName({
    ...catalogTicket,
    ...issuedTicket,
    name: issuedTicket?.name || catalogTicket?.name || "",
  });
  return {
    ticket: issuedTicket,
    catalogTicket,
    displayName,
    metaText: buildTicketMetaText(issuedTicket, catalogTicket),
    status,
    noticeTone: status.tone,
    noticeText: `[${status.label}] 예약 가능 ${getTicketReservableValue(issuedTicket)}${getTicketUnitLabel(issuedTicket?.type || "")}`,
    issuedText: formatDateLabel(issuedTicket?.issueDate),
    startText: buildTicketStartText(issuedTicket),
    expiryText: buildTicketExpiryText(issuedTicket, catalogTicket),
    reservationRangeText: buildTicketReservationRangeText(issuedTicket, catalogTicket),
    historyRows,
    summaryItems,
  };
}
