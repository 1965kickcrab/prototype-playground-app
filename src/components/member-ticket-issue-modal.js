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
  buildMemberStatusMarkup,
} from "../services/member-status.js";

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
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

export function initMemberTicketIssueModal({ modal, onIssued } = {}) {
  if (!modal) {
    return null;
  }

  const ticketStorage = initTicketStorage();
  const reservationStorage = initReservationStorage();
  const memberNameEl = modal.querySelector("[data-member-ticket-issue-member]");
  const memberStatusEl = modal.querySelector("[data-member-ticket-issue-status]");
  const rowsEl = modal.querySelector("[data-member-ticket-issue-rows]");
  const submitEl = modal.querySelector("[data-member-ticket-issue-submit]");
  const selectAllEl = modal.querySelector("[data-member-ticket-issue-select-all]");
  const overlayEl = modal.querySelector("[data-member-ticket-issue-overlay]");
  const closeEl = modal.querySelector("[data-member-ticket-issue-close]");

  const state = {
    member: null,
    tickets: [],
    selections: new Map(),
    activeReservationCountsByMemberType: new Map(),
  };

  const updateSubmitState = () => {
    if (!submitEl) {
      return;
    }
    submitEl.disabled = state.selections.size === 0;
  };

  const updateSelectAllState = () => {
    if (!(selectAllEl instanceof HTMLInputElement)) {
      return;
    }
    const totalCount = Array.isArray(state.tickets) ? state.tickets.length : 0;
    if (totalCount === 0) {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = false;
      selectAllEl.disabled = true;
      return;
    }
    const selectedCount = state.selections.size;
    selectAllEl.disabled = false;
    selectAllEl.checked = selectedCount === totalCount;
    selectAllEl.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  };

  const renderRows = () => {
    if (!rowsEl) {
      return;
    }
    rowsEl.innerHTML = "";

    if (!Array.isArray(state.tickets) || state.tickets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "member-ticket-issue__row member-ticket-issue__row--empty";
      empty.textContent = "지급 가능한 이용권이 없습니다.";
      rowsEl.appendChild(empty);
      updateSubmitState();
      return;
    }

    state.tickets.forEach((ticket) => {
      const ticketId = String(ticket.id || "");
      const isSelected = state.selections.has(ticketId);
      const quantity = state.selections.get(ticketId) || 1;
      const isDecreaseDisabled = !isSelected || quantity <= 1;

      const row = document.createElement("div");
      row.className = "member-ticket-issue__row";
      row.dataset.ticketId = ticketId;
      row.innerHTML = `
        <span>
          <input type="checkbox" data-member-ticket-issue-select ${isSelected ? "checked" : ""} aria-label="이용권 선택">
        </span>
        <span>${formatTicketDisplayName(ticket)}</span>
        <span>${formatTicketCount(getTicketQuantityValue(ticket), ticket.type)}</span>
        <span>${formatTicketValidity(ticket.validity, ticket.unit, ticket.unlimitedValidity)}</span>
        <span>${formatTicketPrice(Number(ticket.price))}</span>
        <span>
          <div class="member-ticket-issue__quantity ${isSelected ? "" : "is-disabled"}">
            <button type="button" data-member-ticket-issue-quantity="decrease" ${isDecreaseDisabled ? "disabled" : ""}>-</button>
            <span>${quantity}</span>
            <button type="button" data-member-ticket-issue-quantity="increase" ${isSelected ? "" : "disabled"}>+</button>
          </div>
        </span>
      `;
      rowsEl.appendChild(row);
    });

    renderSummary();
    updateSelectAllState();
    updateSubmitState();
  };

  const renderSummary = () => {
    if (memberNameEl) {
      const dog = state.member?.dogName || "-";
      const breed = state.member?.breed || "-";
      const owner = state.member?.owner || "-";
      memberNameEl.textContent = `${dog}(${breed}) / ${owner}`;
    }
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
      memberStatusEl.innerHTML = buildMemberStatusMarkup(countsByType);
    }
  };

  const openModalWithMember = (member) => {
    state.member = member || null;
    state.tickets = ticketStorage.ensureDefaults();
    state.selections.clear();
    state.activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    renderSummary();
    renderRows();
    openModal(modal);
  };

  overlayEl?.addEventListener("click", () => closeModal(modal));
  closeEl?.addEventListener("click", () => closeModal(modal));

  rowsEl?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-member-ticket-issue-select]")) {
      return;
    }
    const row = target.closest("[data-ticket-id]");
    const ticketId = row?.dataset.ticketId || "";
    if (!ticketId) {
      return;
    }
    if (target.checked) {
      if (!state.selections.has(ticketId)) {
        state.selections.set(ticketId, 1);
      }
    } else {
      state.selections.delete(ticketId);
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
    const next = action === "increase" ? current + 1 : Math.max(1, current - 1);
    state.selections.set(ticketId, next);
    renderRows();
  });

  selectAllEl?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.checked) {
      state.tickets.forEach((ticket) => {
        const ticketId = String(ticket?.id || "");
        if (ticketId) {
          state.selections.set(ticketId, state.selections.get(ticketId) || 1);
        }
      });
    } else {
      state.selections.clear();
    }
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
