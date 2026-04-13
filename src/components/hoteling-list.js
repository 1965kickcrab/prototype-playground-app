import {
  PAYMENT_FILTER_STATUS,
  getReservationPaymentStatus,
} from "../services/reservation-payment-status.js";

function clearFeedItems(feed) {
  if (!feed) {
    return;
  }
  const rows = feed.querySelectorAll(".hoteling-feed-item");
  rows.forEach((row) => row.remove());
}

function isCanceledEntry(item) {
  const entry = item?.entry;
  return String(entry?.baseStatusKey || entry?.status || "").trim() === "CANCELED";
}

function getEntryTimeText(entry) {
  if (!entry || typeof entry !== "object") {
    return "-";
  }
  if (entry.kind === "checkin") {
    return entry.checkinTime || entry.time || "-";
  }
  if (entry.kind === "checkout") {
    return entry.checkoutTime || entry.time || "-";
  }
  return "-";
}

function formatTimeForDisplay(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return text || "-";
  }

  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour)) {
    return text;
  }

  const meridiem = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${meridiem} ${displayHour}:${minute}`;
}

function getEntryHeadline(entry) {
  const kind = String(entry?.kind || "").trim();
  if (kind === "checkin") {
    return {
      text: `입실 ${formatTimeForDisplay(getEntryTimeText(entry))}`,
      tone: "checkin",
      editable: true,
      icon: "../../assets/iconCheckin.svg",
    };
  }
  if (kind === "checkout") {
    return {
      text: `퇴실 ${formatTimeForDisplay(getEntryTimeText(entry))}`,
      tone: "checkout",
      editable: true,
      icon: "../../assets/iconCheckout.svg",
    };
  }
  return {
    text: "숙박",
    tone: "stay",
    editable: false,
    icon: "",
  };
}

function getPaymentBadge(reservation) {
  const paymentStatus = getReservationPaymentStatus(reservation);
  if (paymentStatus === PAYMENT_FILTER_STATUS.PAID) {
    return {
      text: "정산 완료",
      tone: "paid",
    };
  }

  return {
    text: "정산 대기",
    tone: "unpaid",
  };
}

function buildFeedItem({ reservation, entry }, memberById) {
  const memberId = String(reservation?.memberId || "");
  const member = memberById instanceof Map ? memberById.get(memberId) : null;
  const dogName = member?.dogName || reservation?.dogName || "-";
  const breed = member?.breed || reservation?.breed || "-";
  const headline = getEntryHeadline(entry);
  const paymentBadge = getPaymentBadge(reservation);

  const row = document.createElement("article");
  row.className = "hoteling-feed-item hoteling-table__row--data";
  row.setAttribute("role", "listitem");
  row.dataset.reservationId = reservation.id;
  row.dataset.entryDate = entry.date || "";
  row.dataset.entryKind = entry.kind || "";

  const header = document.createElement("div");
  header.className = "hoteling-feed-item__header";

  const status = document.createElement(headline.editable ? "button" : "span");
  status.className = [
    "hoteling-feed-item__status",
    `hoteling-feed-item__status--${headline.tone}`,
  ].join(" ");
  if (headline.editable) {
    status.type = "button";
    status.dataset.hotelingTimeEdit = "true";
    status.setAttribute("aria-label", "시간 수정");
  }
  if (headline.icon) {
    const statusIcon = document.createElement("img");
    statusIcon.className = "hoteling-feed-item__status-icon";
    statusIcon.src = headline.icon;
    statusIcon.alt = "";
    statusIcon.setAttribute("aria-hidden", "true");
    status.appendChild(statusIcon);
  }
  const statusText = document.createElement("span");
  statusText.textContent = headline.text;
  status.appendChild(statusText);

  const badge = document.createElement("span");
  badge.className = [
    "hoteling-feed-item__badge",
    `hoteling-feed-item__badge--${paymentBadge.tone}`,
  ].join(" ");
  badge.textContent = paymentBadge.text;

  header.appendChild(status);
  header.appendChild(badge);

  const body = document.createElement("div");
  body.className = "hoteling-feed-item__body";

  const copy = document.createElement("div");
  copy.className = "hoteling-feed-item__copy";

  const name = document.createElement("strong");
  name.className = "hoteling-feed-item__name";
  name.textContent = dogName;

  const meta = document.createElement("span");
  meta.className = "hoteling-feed-item__meta";
  meta.textContent = breed;

  copy.appendChild(name);
  copy.appendChild(meta);

  const detailButton = document.createElement("button");
  detailButton.type = "button";
  detailButton.className = "hoteling-table__detail-button hoteling-feed-item__detail";
  detailButton.setAttribute("aria-label", "예약 상세 열기");
  detailButton.dataset.hotelingDetailOpen = "";

  const detailIcon = document.createElement("img");
  detailIcon.src = "../../assets/iconChevronRight.svg";
  detailIcon.alt = "";
  detailIcon.setAttribute("aria-hidden", "true");
  detailButton.appendChild(detailIcon);

  body.appendChild(copy);
  body.appendChild(detailButton);

  row.appendChild(header);
  row.appendChild(body);
  return row;
}

function renderFeed(feed, entries, memberById) {
  if (!feed) {
    return;
  }

  clearFeedItems(feed);
  if (!Array.isArray(entries) || entries.length === 0) {
    feed.hidden = true;
    return;
  }

  feed.hidden = false;
  entries.forEach((item) => {
    const row = buildFeedItem(item, memberById);
    feed.appendChild(row);
  });
}

export function renderHotelingList(elements, groups, options = {}) {
  const memberById = options.memberById instanceof Map
    ? options.memberById
    : new Map();
  const checkin = Array.isArray(groups?.checkin) ? groups.checkin : [];
  const checkout = Array.isArray(groups?.checkout) ? groups.checkout : [];
  const stay = Array.isArray(groups?.stay) ? groups.stay : [];
  const activeCheckin = checkin.filter((item) => !isCanceledEntry(item));
  const activeCheckout = checkout.filter((item) => !isCanceledEntry(item));
  const activeStay = stay.filter((item) => !isCanceledEntry(item));
  const feedEntries = [
    ...activeCheckin,
    ...activeCheckout,
    ...activeStay,
  ];
  const total = feedEntries.length;
  const hasEntries = total > 0;

  if (elements.checkinCountEl) {
    elements.checkinCountEl.textContent = String(activeCheckin.length);
  }
  if (elements.checkoutCountEl) {
    elements.checkoutCountEl.textContent = String(activeCheckout.length);
  }
  if (elements.stayCountEl) {
    elements.stayCountEl.textContent = String(activeStay.length);
  }
  if (elements.totalCountEl) {
    elements.totalCountEl.textContent = String(total);
  }
  if (elements.listEmptyEl) {
    elements.listEmptyEl.hidden = hasEntries;
  }

  renderFeed(elements.feed, feedEntries, memberById);
}
