import { applyIssueToMembers } from "../storage/ticket-issue-members.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  formatTicketValidity,
  normalizePickdropType,
} from "../services/ticket-service.js";
import { getTimeZone } from "../utils/timezone.js";
import { getDateKeyFromParts, getDatePartsFromKey, getZonedParts } from "../utils/date.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import {
  buildActiveReservationCountByMemberType,
  getMemberReservableCountFromReservations,
} from "../services/member-reservable-count.js";

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function getTicketReservableDelta(ticket) {
  const type = String(ticket?.type || "");
  if (type !== "school" && type !== "daycare") {
    return 0;
  }
  return Number(ticket?.quantity) || 0;
}

function addValidityToDate(dateKey, validity, unit) {
  const parsed = getDatePartsFromKey(dateKey);
  if (!parsed || !Number.isFinite(validity) || validity <= 0 || !unit) {
    return "";
  }
  const date = new Date(parsed.year, parsed.month - 1, parsed.day);
  if (unit === "일") {
    date.setDate(date.getDate() + validity);
  } else if (unit === "주") {
    date.setDate(date.getDate() + (validity * 7));
  } else if (unit === "개월") {
    date.setMonth(date.getMonth() + validity);
  } else if (unit === "년") {
    date.setFullYear(date.getFullYear() + validity);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildIssueEntries(memberId, ticket, quantity) {
  const count = Math.max(1, Number(quantity) || 1);
  const now = Date.now();
  const timeZone = getTimeZone();
  const issuedDate = getDateKeyFromParts(getZonedParts(new Date(), timeZone));
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const startPolicy = ticket.startDatePolicy || "first-attendance";
    const startDate = startPolicy === "issue-date" ? issuedDate : "";
    const validity = Number(ticket.validity) || 0;
    const unit = ticket.unit || "";
    const hasUnlimitedValidity = Boolean(ticket.unlimitedValidity);
    entries.push({
      id: `${now}-${ticket.id}-${index}`,
      ticketId: String(ticket.id || ""),
      memberId: String(memberId || ""),
      quantity: 1,
      issuedDate,
      issueDate: issuedDate,
      timeZone,
      name: ticket.name || "",
      pickdropType: ticket.type === "pickdrop"
        ? normalizePickdropType(ticket.pickdropType || ticket.name)
        : "",
      type: ticket.type || "",
      totalCount: Number(ticket.quantity) || 0,
      validity,
      unit,
      startPolicy,
      reservationDateRule: ticket.reservationDateRule || "expiry",
      startDate,
      usedCount: 0,
      reservableCount: Number(ticket.quantity) || 0,
      expiryDate:
        hasUnlimitedValidity || startPolicy !== "issue-date"
          ? ""
          : addValidityToDate(issuedDate, validity, unit),
    });
  }
  return entries;
}

export function initMemberTicketIssueModal({ modal, onIssued } = {}) {
  if (!modal) {
    return null;
  }

  const ticketStorage = initTicketStorage();
  const reservationStorage = initReservationStorage();
  const memberNameEl = modal.querySelector("[data-member-ticket-issue-member]");
  const reservableCountEl = modal.querySelector("[data-member-ticket-issue-reservable]");
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
        <span>${formatTicketCount(Number(ticket.quantity) || 0)}</span>
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
    if (reservableCountEl) {
      const baseCount = getMemberReservableCountFromReservations(
        state.member,
        state.activeReservationCountsByMemberType
      );
      const addedCount = Array.from(state.selections.entries()).reduce((sum, [ticketId, issueQty]) => {
        const ticket = state.tickets.find((item) => String(item?.id || "") === String(ticketId));
        if (!ticket) {
          return sum;
        }
        return sum + (getTicketReservableDelta(ticket) * (Number(issueQty) || 0));
      }, 0);
      const count = baseCount + addedCount;
      reservableCountEl.textContent = count < 0 ? `초과 ${Math.abs(count)}회` : `${count}회`;
      reservableCountEl.classList.toggle("member-table__count-over", count <= 2);
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
    const selected = Array.from(state.selections.entries());
    selected.forEach(([ticketId, quantity]) => {
      const ticket = state.tickets.find((item) => String(item?.id || "") === ticketId);
      if (!ticket) {
        return;
      }
      const issues = buildIssueEntries(state.member.id, ticket, quantity);
      applyIssueToMembers(issues, Number(ticket.quantity) || 1);
    });
    recalculateTicketCounts();
    closeModal(modal);
    if (typeof onIssued === "function") {
      onIssued();
    }
  });

  return { openModalWithMember };
}
