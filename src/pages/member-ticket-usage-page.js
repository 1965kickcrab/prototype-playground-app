import { ensureMemberDefaults, loadIssueMembers } from "../storage/ticket-issue-members.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import { findMemberById } from "../services/member-detail-service.js";
import { buildTicketUsageDetailViewModel } from "../services/member-ticket-usage-detail-service.js";
import { setupSidebarToggle } from "../utils/sidebar.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { getTimeZone } from "../utils/timezone.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function getElements() {
  return {
    back: document.querySelector("[data-member-ticket-usage-back]"),
    content: document.querySelector("[data-member-ticket-usage-content]"),
    missing: document.querySelector("[data-member-ticket-usage-missing]"),
    notice: document.querySelector("[data-member-ticket-usage-notice]"),
    name: document.querySelector("[data-member-ticket-usage-name]"),
    meta: document.querySelector("[data-member-ticket-usage-meta]"),
    issued: document.querySelector("[data-member-ticket-usage-issued]"),
    start: document.querySelector("[data-member-ticket-usage-start]"),
    expiry: document.querySelector("[data-member-ticket-usage-expiry]"),
    range: document.querySelector("[data-member-ticket-usage-range]"),
    tabs: document.querySelectorAll("[data-member-ticket-usage-tab]"),
    panels: document.querySelectorAll("[data-member-ticket-usage-panel]"),
    history: document.querySelector("[data-member-ticket-usage-history]"),
    empty: document.querySelector("[data-member-ticket-usage-empty]"),
  };
}

function renderHistory(container, rows) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const item = document.createElement("article");
    item.className = "member-ticket-usage-page__history-row";
    const isCanceled = String(row.status?.key || "").trim() === "CANCELED";
    item.innerHTML = `
      <strong>${escapeHtml(row.serviceLabel ? `다이얼독 ${row.serviceLabel}` : "-")}</strong>
      <p>${escapeHtml(row.visitDateWithWeekdayLabel || row.visitDateLabel || "-")}</p>
      ${isCanceled ? '<span class="member-ticket-usage-page__history-badge">취소</span>' : ""}
    `;
    container.appendChild(item);
  });
}

function setActiveTab(elements, activeTab) {
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.memberTicketUsageTab === activeTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  elements.panels.forEach((panel) => {
    const isActive = panel.dataset.memberTicketUsagePanel === activeTab;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function bindTabs(elements) {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveTab(elements, tab.dataset.memberTicketUsageTab || "status");
    });
  });
}

function renderViewModel(elements, viewModel) {
  if (!viewModel) {
    if (elements.content) {
      elements.content.hidden = true;
    }
    if (elements.missing) {
      elements.missing.hidden = false;
    }
    return;
  }

  if (elements.content) {
    elements.content.hidden = false;
  }
  if (elements.missing) {
    elements.missing.hidden = true;
  }

  if (elements.notice) {
    elements.notice.textContent = viewModel.noticeText;
    elements.notice.classList.remove(
      "member-ticket-usage-page__notice--before",
      "member-ticket-usage-page__notice--active",
      "member-ticket-usage-page__notice--danger"
    );
    const noticeClass = viewModel.noticeTone === "member-detail__ticket-status--success"
      ? "member-ticket-usage-page__notice--active"
      : viewModel.noticeTone === "member-detail__ticket-status--danger"
        ? "member-ticket-usage-page__notice--danger"
        : "member-ticket-usage-page__notice--before";
    elements.notice.classList.add(noticeClass);
  }
  setText(elements.name, viewModel.displayName || "-");
  setText(elements.meta, viewModel.metaText || "-");
  setText(elements.issued, viewModel.issuedText);
  setText(elements.start, viewModel.startText);
  setText(elements.expiry, viewModel.expiryText);
  setText(elements.range, viewModel.reservationRangeText);
  renderHistory(elements.history, viewModel.historyRows);
  if (elements.empty) {
    elements.empty.hidden = viewModel.historyRows.length > 0;
  }
}

function initMemberTicketUsagePage() {
  ensureMemberDefaults();
  recalculateTicketCounts();

  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("memberId") || "";
  const ticketId = params.get("ticketId") || "";
  const elements = getElements();
  const reservationStorage = initReservationStorage();
  const ticketStorage = initTicketStorage();
  const member = findMemberById(loadIssueMembers(), memberId);
  const viewModel = buildTicketUsageDetailViewModel({
    member,
    issuedTicketId: ticketId,
    catalogTickets: ticketStorage.loadTickets(),
    reservations: reservationStorage.loadReservations(),
  });

  elements.back?.addEventListener("click", () => {
    const backParams = memberId ? `?${new URLSearchParams({ memberId }).toString()}` : "";
    window.location.href = `./member-detail.html${backParams}`;
  });
  bindTabs(elements);
  renderViewModel(elements, viewModel);
}

function bootstrapMemberTicketUsagePage() {
  const storage = initReservationStorage();
  const timeZone = getTimeZone();
  setupSidebarToggle({
    iconOpen: "../../assets/menuIcon_sidebar_open.svg",
    iconClose: "../../assets/menuIcon_sidebar_close.svg",
  });
  setupSidebarReservationBadges({ storage, timeZone });
  initMemberTicketUsagePage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMemberTicketUsagePage);
} else {
  bootstrapMemberTicketUsagePage();
}
