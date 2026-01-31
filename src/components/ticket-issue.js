import { applyIssueToMembers, loadIssueMembers } from "../storage/ticket-issue-members.js";
import {
  getDefaultIssueQuantity,
  computeIssueAvailability,
  matchesIssueSearch,
} from "../services/ticket-issue-service.js";
import { renderIssueRows } from "./ticket-issue-view.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  normalizePickdropType,
  formatTicketType,
  formatTicketValidity,
} from "../services/ticket-service.js";
import { getTimeZone } from "../utils/timezone.js";
import { getDateKeyFromParts, getDatePartsFromKey, getZonedParts } from "../utils/date.js";

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    date.setDate(date.getDate() + validity * 7);
  } else if (unit === "개월") {
    date.setMonth(date.getMonth() + validity);
  } else if (unit === "년") {
    date.setFullYear(date.getFullYear() + validity);
  }
  return toDateKey(date);
}

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

  const state = {
    ticket: null,
    selections: new Map(),
    query: "",
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

    const countText = formatTicketCount(state.ticket.quantity);
    const validityText = formatTicketValidity(
      state.ticket.validity,
      state.ticket.unit,
      state.ticket.unlimitedValidity
    );
    summaryName.textContent = formatTicketDisplayName(state.ticket);
    summaryMeta.textContent = `총횟수: ${countText} / 유효기간: ${validityText}`;
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
              const type = state.ticket?.type || "kindergarten";
              const availability = computeIssueAvailability(
                member,
                state.ticket?.quantity,
                quantity,
                state.selections.has(member.id),
                type
              );
              const totalReservable = member.totalReservableCountByType?.[type];
              availability.totalReservable = Number.isFinite(totalReservable)
                ? totalReservable
                : null;
              return [member.id, availability];
            })
          );    renderIssueRows(
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
    const timeZone = getTimeZone();
    const issuedDate = getDateKeyFromParts(
      getZonedParts(new Date(), timeZone)
    );
    const issuedAtBase = Date.now();
    return Array.from(state.selections.entries()).map(
      ([memberId, quantity], index) => ({
        id: `${issuedAtBase}-${index}`,
        ticketId: state.ticket.id,
        memberId,
        quantity,
        issuedDate,
        issueDate: issuedDate,
        timeZone,
        name: state.ticket.name || "",
        pickdropType: state.ticket.type === "pickdrop"
          ? normalizePickdropType(state.ticket.pickdropType || state.ticket.name)
          : "",
        type: state.ticket.type || "",
        totalCount: (Number(state.ticket.quantity) || 0) * (Number(quantity) || 0),
        validity: Number(state.ticket.validity) || 0,
        unit: state.ticket.unit || "",
        startPolicy: state.ticket.startDatePolicy || "first-attendance",
        reservationDateRule: state.ticket.reservationDateRule || "expiry",
        startDate: state.ticket.startDatePolicy === "issue-date" ? issuedDate : "",
        usedCount: 0,
        reservableCount: (Number(state.ticket.quantity) || 0) * (Number(quantity) || 0),
        expiryDate:
          state.ticket.unlimitedValidity || state.ticket.startDatePolicy !== "issue-date"
            ? ""
            : addValidityToDate(
                issuedDate,
                Number(state.ticket.validity) || 0,
                state.ticket.unit || ""
              ),
      })
    );
  };

  const buildReservationUrl = (memberId) => {
    const target = new URL("../../public/index.html", window.location.href);
    target.searchParams.set("reservation", "open");
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
    const quantity = getDefaultIssueQuantity(
      state.ticket.quantity,
      member,
      state.ticket.type || "kindergarten"
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
    applyIssueToMembers(issues, state.ticket.quantity);
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
    applyIssueToMembers(issues, state.ticket.quantity);
    modalControls.closeModal();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== "memberList") {
      return;
    }
    if (!modal.classList.contains("is-open")) {
      return;
    }
    render();
  });

  return { openModalWithTicket };
}



