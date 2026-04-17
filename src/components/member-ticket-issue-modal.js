import { applyIssueToMembers } from "../storage/ticket-issue-members.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import {
  buildTicketIssueEntries,
  createTicketIssueDateContext,
} from "../services/ticket-issue-entry-service.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  formatTicketValidity,
  getTicketQuantityValue,
  normalizePickdropType,
} from "../services/ticket-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import {
  buildActiveReservationCountByMemberType,
} from "../services/member-reservable-count.js";
import {
  buildMemberReservableCountsByType,
  formatMemberReservableStatusCount,
  MEMBER_STATUS_TYPES,
} from "../services/member-status.js";

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTicketReservableDelta(ticket) {
  return getTicketQuantityValue(ticket);
}

function getTicketStatusKey(ticket) {
  const type = String(ticket?.type || "").trim();
  if (type === "pickdrop") {
    const pickdropType = normalizePickdropType(ticket?.pickdropType || ticket?.name);
    if (pickdropType === "왕복") {
      return "roundtrip";
    }
    if (pickdropType === "편도") {
      return "oneway";
    }
    return "";
  }
  if (type === "school" || type === "daycare" || type === "hoteling") {
    return type;
  }
  return "";
}

function clampIssueQuantity(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(99, Math.max(1, parsed));
}

function getMemberStatusLabel(type) {
  return MEMBER_STATUS_TYPES.find((item) => item.key === type)?.label || "유치원";
}

export function initMemberTicketIssueModal({ modal, onIssued } = {}) {
  if (!modal) {
    return null;
  }

  const ticketStorage = initTicketStorage();
  const reservationStorage = initReservationStorage();
  const memberStatusEl = modal.querySelector("[data-member-ticket-issue-status]");
  const serviceTabsEl = modal.querySelector("[data-member-ticket-issue-service-tabs]");
  const rowsEl = modal.querySelector("[data-member-ticket-issue-rows]");
  const submitEl = modal.querySelector("[data-member-ticket-issue-submit]");
  const overlayEl = modal.querySelector("[data-member-ticket-issue-overlay]");
  const closeEl = modal.querySelector("[data-member-ticket-issue-close]");

  const state = {
    member: null,
    tickets: [],
    selections: new Map(),
    selectedType: "school",
    activeReservationCountsByMemberType: new Map(),
  };

  const updateSubmitState = () => {
    if (!submitEl) {
      return;
    }
    submitEl.disabled = state.selections.size === 0;
  };

  const getVisibleTickets = () => state.tickets.filter((ticket) => getTicketStatusKey(ticket) === state.selectedType);

  const renderServiceTabs = () => {
    if (!serviceTabsEl) {
      return;
    }
    serviceTabsEl.innerHTML = "";
    MEMBER_STATUS_TYPES.forEach(({ key, label }) => {
      const button = document.createElement("button");
      button.className = `member-ticket-issue__service-tab${state.selectedType === key ? " is-active" : ""}`;
      button.type = "button";
      button.dataset.memberTicketIssueServiceType = key;
      button.setAttribute("aria-pressed", String(state.selectedType === key));
      button.textContent = label;
      serviceTabsEl.appendChild(button);
    });
  };

  const renderRows = () => {
    if (!rowsEl) {
      return;
    }
    rowsEl.innerHTML = "";
    const visibleTickets = getVisibleTickets();

    if (visibleTickets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "member-ticket-issue__row member-ticket-issue__row--empty";
      empty.textContent = "지급 가능한 이용권이 없습니다.";
      rowsEl.appendChild(empty);
      renderSummary();
      updateSubmitState();
      return;
    }

    visibleTickets.forEach((ticket) => {
      const ticketId = String(ticket.id || "");
      const isSelected = state.selections.has(ticketId);
      const quantity = state.selections.get(ticketId) || 1;
      const isDecreaseDisabled = quantity <= 1;
      const isIncreaseDisabled = quantity >= 99;
      const displayName = formatTicketDisplayName(ticket);
      const ticketMeta = `${formatTicketCount(getTicketQuantityValue(ticket), ticket.type)} / ${formatTicketValidity(ticket.validity, ticket.unit, ticket.unlimitedValidity)} / ${formatTicketPrice(Number(ticket.price))}`;

      const row = document.createElement("div");
      row.className = `member-ticket-issue__row${isSelected ? " is-selected" : ""}`;
      row.dataset.ticketId = ticketId;
      row.innerHTML = `
        <button class="member-ticket-issue__select" type="button" data-member-ticket-issue-select aria-pressed="${isSelected}" aria-label="${escapeHtml(displayName)} 선택">
          <span class="member-ticket-issue__radio" aria-hidden="true"></span>
        </button>
        <div class="member-ticket-issue__content">
          <div class="member-ticket-issue__copy">
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(ticketMeta)}</span>
          </div>
          <div class="member-ticket-issue__quantity" ${isSelected ? "" : "hidden"}>
            <span>수량</span>
            <div class="member-ticket-issue__quantity-controls">
              <button type="button" data-member-ticket-issue-quantity="decrease" ${isDecreaseDisabled ? "disabled" : ""} aria-label="수량 감소">-</button>
              <input type="number" min="1" max="99" step="1" inputmode="numeric" value="${quantity}" data-member-ticket-issue-quantity-input aria-label="지급 수량">
              <button type="button" data-member-ticket-issue-quantity="increase" ${isIncreaseDisabled ? "disabled" : ""} aria-label="수량 증가">+</button>
            </div>
          </div>
        </div>
      `;
      rowsEl.appendChild(row);
    });

    renderSummary();
    updateSubmitState();
  };

  const renderSummary = () => {
    if (memberStatusEl) {
      const countsByType = buildMemberReservableCountsByType(
        state.member,
        state.activeReservationCountsByMemberType
      );
      Array.from(state.selections.entries()).forEach(([ticketId, issueQty]) => {
        const ticket = state.tickets.find((item) => String(item?.id || "") === String(ticketId));
        if (!ticket) {
          return;
        }
        const statusKey = getTicketStatusKey(ticket);
        if (!statusKey) {
          return;
        }
        countsByType[statusKey] = (Number(countsByType[statusKey]) || 0)
          + (getTicketReservableDelta(ticket) * (Number(issueQty) || 0));
      });
      const selectedCount = Number(countsByType[state.selectedType]) || 0;
      memberStatusEl.classList.toggle("member-ticket-issue__total--overbooked", selectedCount < 0);
      memberStatusEl.innerHTML = `
        <span>${escapeHtml(getMemberStatusLabel(state.selectedType))}</span>
        <strong>${escapeHtml(formatMemberReservableStatusCount(selectedCount, state.selectedType))}</strong>
      `;
    }
  };

  const openModalWithMember = (member) => {
    state.member = member || null;
    state.tickets = ticketStorage.ensureDefaults();
    state.selections.clear();
    state.selectedType = MEMBER_STATUS_TYPES.find(({ key }) => (
      state.tickets.some((ticket) => getTicketStatusKey(ticket) === key)
    ))?.key || "school";
    state.activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    renderServiceTabs();
    renderSummary();
    renderRows();
    openModal(modal);
  };

  overlayEl?.addEventListener("click", () => closeModal(modal));
  closeEl?.addEventListener("click", () => closeModal(modal));

  serviceTabsEl?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest("[data-member-ticket-issue-service-type]");
    const type = button?.dataset.memberTicketIssueServiceType || "";
    if (!type || type === state.selectedType) {
      return;
    }
    state.selectedType = type;
    state.selections.clear();
    renderServiceTabs();
    renderRows();
  });

  rowsEl?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(".member-ticket-issue__quantity")) {
      return;
    }
    const row = target?.closest("[data-ticket-id]");
    const ticketId = row?.dataset.ticketId || "";
    if (!ticketId) {
      return;
    }
    if (state.selections.has(ticketId)) {
      state.selections.delete(ticketId);
    } else {
      state.selections.set(ticketId, 1);
    }
    renderRows();
  });

  rowsEl?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest("[data-member-ticket-issue-quantity]");
    if (!button) {
      return;
    }
    const row = button.closest("[data-ticket-id]");
    const ticketId = row?.dataset.ticketId || "";
    if (!ticketId || !state.selections.has(ticketId)) {
      return;
    }
    const current = state.selections.get(ticketId) || 1;
    const action = button.dataset.memberTicketIssueQuantity;
    const next = action === "increase" ? Math.min(99, current + 1) : Math.max(1, current - 1);
    state.selections.set(ticketId, next);
    renderRows();
  });

  rowsEl?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-member-ticket-issue-quantity-input]")) {
      return;
    }
    const row = target.closest("[data-ticket-id]");
    const ticketId = row?.dataset.ticketId || "";
    if (!ticketId || !state.selections.has(ticketId)) {
      return;
    }
    state.selections.set(ticketId, clampIssueQuantity(target.value));
    renderSummary();
    updateSubmitState();
  });

  rowsEl?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-member-ticket-issue-quantity-input]")) {
      return;
    }
    const next = clampIssueQuantity(target.value);
    target.value = String(next);
    const row = target.closest("[data-ticket-id]");
    const ticketId = row?.dataset.ticketId || "";
    if (!ticketId || !state.selections.has(ticketId)) {
      return;
    }
    state.selections.set(ticketId, next);
    renderRows();
  });

  submitEl?.addEventListener("click", () => {
    if (!state.member || state.selections.size === 0) {
      return;
    }
    const issueContext = createTicketIssueDateContext();
    let issueOffset = 0;
    const selected = Array.from(state.selections.entries());
    selected.forEach(([ticketId, quantity]) => {
      const ticket = state.tickets.find((item) => String(item?.id || "") === ticketId);
      if (!ticket) {
        return;
      }
      const issues = buildTicketIssueEntries({
        memberId: state.member.id,
        ticket,
        quantity,
        ...issueContext,
        startIndex: issueOffset,
      });
      issueOffset += issues.length;
      applyIssueToMembers(issues, getTicketQuantityValue(ticket) || 1);
    });
    recalculateTicketCounts();
    closeModal(modal);
    if (typeof onIssued === "function") {
      onIssued();
    }
  });

  return { openModalWithMember };
}
