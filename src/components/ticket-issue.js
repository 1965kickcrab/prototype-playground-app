import { applyIssueToMembers, loadIssueMembers } from "../storage/ticket-issue-members.js";
import {
  getDefaultIssueQuantity,
  computeIssueAvailability,
  matchesIssueSearch,
} from "../services/ticket-issue-service.js";
import {
  buildActiveReservationCountByMemberType,
  getMemberReservableCountByTypeFromReservations,
} from "../services/member-reservable-count.js";
import {
  buildTicketIssueEntries,
  createTicketIssueDateContext,
} from "../services/ticket-issue-entry-service.js";
import { renderIssueRows } from "./ticket-issue-view.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  getTicketQuantityValue,
  normalizePickdropType,
  formatTicketType,
  formatTicketValidity,
} from "../services/ticket-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";

function setupModal(modal, options = {}) {
  const overlay = modal.querySelector(options.overlaySelector || "");
  const closeButton = modal.querySelector(options.closeSelector || "");

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);

  return { openModal, closeModal };
}

export function initTicketIssueModal({ modal }) {
  if (!modal) {
    return null;
  }

  let members = [];
  let membersById = new Map();
  const reservationStorage = initReservationStorage();

  const state = {
    ticket: null,
    selections: new Map(),
    query: "",
    activeReservationCountsByMemberType: new Map(),
  };

  const summaryName = modal.querySelector("[data-ticket-issue-name]");
  const summaryMeta = modal.querySelector("[data-ticket-issue-meta]");
  const summaryType = modal.querySelector("[data-ticket-issue-type]");
  const rowsContainer = modal.querySelector("[data-ticket-issue-rows]");
  const searchInput = modal.querySelector("[data-ticket-issue-search]");
  const selectAll = modal.querySelector("[data-ticket-issue-select-all]");
  const reserveButton = modal.querySelector("[data-ticket-issue-reserve]");
  const submitButton = modal.querySelector("[data-ticket-issue-submit]");
  const modalControls = setupModal(modal, {
    overlaySelector: "[data-ticket-issue-overlay]",
    closeSelector: "[data-ticket-issue-close]",
  });

  const refreshMembers = () => {
    members = loadIssueMembers();
    membersById = new Map(members.map((member) => [member.id, member]));
  };

  const syncMembers = () => {
    const latest = loadIssueMembers();
    const latestMap = new Map(latest.map((member) => [member.id, member]));
    const hasSameCount = latest.length === members.length;
    const hasAllIds =
      hasSameCount
      && latest.every((member) => membersById.has(member.id));
    if (hasAllIds) {
      return false;
    }
    members = latest;
    membersById = latestMap;
    state.selections.forEach((_value, memberId) => {
      if (!membersById.has(memberId)) {
        state.selections.delete(memberId);
      }
    });
    return true;
  };

  const getFilteredMembers = () =>
    members.filter((member) => matchesIssueSearch(member, state.query));

  const getSelectedTicketCountType = () =>
    state.ticket?.type === "pickdrop"
      ? (normalizePickdropType(state.ticket?.pickdropType || state.ticket?.name) === "왕복"
        ? "roundtrip"
        : "oneway")
      : (state.ticket?.type || "school");

  const refreshActiveReservationCounts = () => {
    const reservations = reservationStorage.loadReservations();
    state.activeReservationCountsByMemberType =
      buildActiveReservationCountByMemberType(reservations);
  };

  const updateSummary = () => {
    if (!summaryName || !summaryMeta || !summaryType) {
      return;
    }

    if (!state.ticket) {
      summaryName.textContent = "-";
      summaryMeta.textContent = "";
      summaryType.textContent = "-";
      summaryType.removeAttribute("data-type");
      return;
    }

    const ticketUnits = getTicketQuantityValue(state.ticket);
    const countText = formatTicketCount(ticketUnits, state.ticket?.type || "");
    const validityText = formatTicketValidity(
      state.ticket.validity,
      state.ticket.unit,
      state.ticket.unlimitedValidity
    );
    summaryName.textContent = formatTicketDisplayName(state.ticket);
    summaryMeta.textContent = `총수량: ${countText} / 유효기간: ${validityText}`;
    summaryType.textContent = formatTicketType(state.ticket.type);
    if (state.ticket.type) {
      summaryType.setAttribute("data-type", state.ticket.type);
    } else {
      summaryType.removeAttribute("data-type");
    }
  };

  const updateSubmitState = () => {
    if (!submitButton) {
      return;
    }
    const selectionCount = state.selections.size;
    const isDisabled = selectionCount === 0;
    submitButton.disabled = isDisabled;
    if (reserveButton) {
      reserveButton.hidden = selectionCount >= 2;
      reserveButton.disabled = isDisabled;
    }
  };

  const updateSelectAll = (filteredMembers) => {
    if (!selectAll) {
      return;
    }
    if (filteredMembers.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
      return;
    }

    const selectedCount = filteredMembers.filter((member) =>
      state.selections.has(member.id)
    ).length;
    selectAll.checked = selectedCount === filteredMembers.length;
    selectAll.indeterminate =
      selectedCount > 0 && selectedCount < filteredMembers.length;
    selectAll.disabled = false;
  };

  const render = () => {
    if (!rowsContainer) {
      return;
    }
    syncMembers();
    const filteredMembers = getFilteredMembers();
    const availabilityMap = new Map(
      filteredMembers.map((member) => {
        const quantity = state.selections.get(member.id) || 1;
        const type = getSelectedTicketCountType();
        const baseReservable = getMemberReservableCountByTypeFromReservations(
          member,
          type,
          state.activeReservationCountsByMemberType
        );
        const availability = computeIssueAvailability(
          member,
          getTicketQuantityValue(state.ticket),
          quantity,
          state.selections.has(member.id),
          type,
          baseReservable
        );
        availability.totalReservable = Number.isFinite(availability.overage)
          && availability.overage > 0
          ? -availability.overage
          : availability.remaining;
        return [member.id, availability];
      })
    );
    renderIssueRows(
      rowsContainer,
      filteredMembers,
      state.selections,
      availabilityMap,
      state.ticket?.type
    );
    updateSelectAll(filteredMembers);
    updateSubmitState();
  };

  const buildIssues = () => {
    if (!state.ticket || state.selections.size === 0) {
      return [];
    }
    const issueContext = createTicketIssueDateContext();
    const issues = [];
    let issueIndex = 0;
    Array.from(state.selections.entries()).forEach(([memberId, quantity]) => {
      const nextIssues = buildTicketIssueEntries({
        memberId,
        ticket: state.ticket,
        quantity,
        ...issueContext,
        startIndex: issueIndex,
      });
      issues.push(...nextIssues);
      issueIndex += nextIssues.length;
    });
    return issues;
  };

  const buildReservationUrl = (memberId) => {
    const ticketType = state.ticket?.type || "";
    const isHoteling = ticketType === "hoteling";
    const target = new URL(
      isHoteling ? "./hotels.html" : "../../public/index.html",
      window.location.href
    );
    if (isHoteling) {
      target.searchParams.set("hotelingReservation", "open");
    } else {
      target.searchParams.set("reservation", "open");
    }
    target.searchParams.set("memberId", String(memberId));
    return target.toString();
  };

  const resetState = () => {
    state.selections.clear();
    state.query = "";
    if (searchInput) {
      searchInput.value = "";
    }
  };

  const openModalWithTicket = (ticket) => {
    state.ticket = ticket;
    resetState();
    refreshMembers();
    refreshActiveReservationCounts();
    updateSummary();
    render();
    modalControls.openModal();
  };

  const applySelection = (memberId, isSelected) => {
    if (!state.ticket || !memberId) {
      return;
    }
    if (!isSelected) {
      state.selections.delete(memberId);
      return;
    }
    const member = membersById.get(memberId);
    if (!member) {
      return;
    }
    const ticketCountType = getSelectedTicketCountType();
    const baseReservable = getMemberReservableCountByTypeFromReservations(
      member,
      ticketCountType,
      state.activeReservationCountsByMemberType
    );
    const quantity = getDefaultIssueQuantity(
      getTicketQuantityValue(state.ticket),
      member,
      ticketCountType,
      baseReservable
    );
    state.selections.set(memberId, quantity);
  };

  const setQuantity = (memberId, quantity) => {
    if (!state.selections.has(memberId)) {
      return;
    }
    state.selections.set(memberId, Math.max(1, quantity));
  };

  rowsContainer?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.matches("[data-issue-select]")) {
      return;
    }
    const row = target.closest(".ticket-issue-table__row");
    const memberId = row?.dataset.memberId || "";
    applySelection(memberId, target.checked);
    render();
  });

  rowsContainer?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest("[data-issue-quantity]");
    if (!button) {
      return;
    }
    const row = button.closest(".ticket-issue-table__row");
    const memberId = row?.dataset.memberId || "";
    if (!memberId || !state.selections.has(memberId)) {
      return;
    }

    const current = state.selections.get(memberId) || 1;
    const action = button.dataset.issueQuantity || "";
    const nextValue = action === "increase" ? current + 1 : current - 1;
    setQuantity(memberId, nextValue);
    render();
  });

  searchInput?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    state.query = target.value;
    render();
  });

  selectAll?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const filteredMembers = getFilteredMembers();
    if (target.checked) {
      filteredMembers.forEach((member) => {
        applySelection(member.id, true);
      });
    } else {
      filteredMembers.forEach((member) => {
        state.selections.delete(member.id);
      });
    }
    render();
  });

  reserveButton?.addEventListener("click", () => {
    const issues = buildIssues();
    if (!issues.length || !state.ticket) {
      return;
    }
    applyIssueToMembers(issues, getTicketQuantityValue(state.ticket));
    const memberId = Array.from(state.selections.keys())[0];
    if (!memberId) {
      return;
    }
    window.location.href = buildReservationUrl(memberId);
  });

  submitButton?.addEventListener("click", () => {
    const issues = buildIssues();
    if (!issues.length || !state.ticket) {
      return;
    }
    applyIssueToMembers(issues, getTicketQuantityValue(state.ticket));
    modalControls.closeModal();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== "memberList" && event.key !== "reservations") {
      return;
    }
    if (!modal.classList.contains("is-open")) {
      return;
    }
    if (event.key === "reservations") {
      refreshActiveReservationCounts();
    }
    render();
  });

  return { openModalWithTicket };
}



