import { applyIssueToMembers, loadIssueMembers } from "../storage/ticket-issue-members.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import {
  buildTicketIssueEntries,
  createTicketIssueDateContext,
} from "../services/ticket-issue-entry-service.js";
import {
  getDefaultIssueQuantity,
  matchesIssueSearch,
} from "../services/ticket-issue-service.js";
import {
  buildActiveReservationCountByMemberType,
  getMemberReservableCountByTypeFromReservations,
} from "../services/member-reservable-count.js";
import {
  formatMemberReservableStatusCount,
} from "../services/member-status.js";
import {
  getTicketQuantityValue,
  normalizePickdropType,
} from "../services/ticket-service.js";

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

function getTicketStatusKey(ticket) {
  const type = String(ticket?.type || "").trim();
  if (type === "pickdrop") {
    const pickdropType = normalizePickdropType(ticket?.pickdropType || ticket?.name);
    return pickdropType === "왕복" ? "roundtrip" : "oneway";
  }
  return type || "school";
}

function clampIssueQuantity(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(99, Math.max(1, parsed));
}

export function initTicketIssueModal({ modal, ticket, onIssued } = {}) {
  if (!modal || !ticket) {
    return null;
  }

  const reservationStorage = initReservationStorage();
  const searchInput = modal.querySelector("[data-ticket-issue-search]");
  const rowsEl = modal.querySelector("[data-ticket-issue-rows]");
  const statusEl = modal.querySelector("[data-ticket-issue-status]");
  const submitEl = modal.querySelector("[data-ticket-issue-submit]");
  const overlayEl = modal.querySelector("[data-ticket-issue-overlay]");
  const closeEl = modal.querySelector("[data-ticket-issue-close]");

  const state = {
    members: [],
    selectedMemberId: "",
    selectedQuantity: 1,
    query: "",
    activeReservationCountsByMemberType: new Map(),
  };

  const getCurrentTicketStatusKey = () => getTicketStatusKey(ticket);

  const getCurrentTicketQuantity = () => getTicketQuantityValue(ticket);

  const refreshMembers = () => {
    state.members = loadIssueMembers();
    state.activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
  };

  const getBaseReservableCount = (member) => getMemberReservableCountByTypeFromReservations(
    member,
    getCurrentTicketStatusKey(),
    state.activeReservationCountsByMemberType
  );

  const getSelectedMember = () => state.members.find(
    (member) => String(member?.id || "") === state.selectedMemberId
  );

  const getIssueQuantity = (member) => {
    const ticketStatusKey = getCurrentTicketStatusKey();
    const ticketQuantity = getCurrentTicketQuantity();
    const baseReservable = getMemberReservableCountByTypeFromReservations(
      member,
      ticketStatusKey,
      state.activeReservationCountsByMemberType
    );
    return getDefaultIssueQuantity(
      ticketQuantity,
      member,
      ticketStatusKey,
      baseReservable
    );
  };

  const renderSummary = () => {
    if (!statusEl) {
      return;
    }
    const member = getSelectedMember();
    if (!member) {
      statusEl.innerHTML = "<span>예약 가능</span><strong>-회</strong>";
      return;
    }
    const ticketStatusKey = getCurrentTicketStatusKey();
    const beforeCount = Number(getBaseReservableCount(member));
    const issueDelta = getCurrentTicketQuantity() * state.selectedQuantity;
    const afterCount = Number.isFinite(beforeCount) ? beforeCount + issueDelta : issueDelta;
    const beforeText = formatMemberReservableStatusCount(
      Number.isFinite(beforeCount) ? beforeCount : 0,
      ticketStatusKey
    );
    const afterText = formatMemberReservableStatusCount(afterCount, ticketStatusKey);
    const beforeToneClass = beforeCount < 0 ? " is-overbooked" : "";
    const afterToneClass = afterCount < 0 ? " is-overbooked" : "";
    statusEl.classList.remove("member-ticket-issue__total--overbooked");
    statusEl.innerHTML = `
      <span>예약 가능</span>
      <strong class="ticket-issue-modal__availability">
        <span class="ticket-issue-modal__availability-before${beforeToneClass}">${escapeHtml(beforeText)}</span>
        <span class="ticket-issue-modal__availability-arrow" aria-hidden="true">→</span>
        <span class="ticket-issue-modal__availability-after${afterToneClass}">${escapeHtml(afterText)}</span>
      </strong>
    `;
  };

  const renderRows = () => {
    if (!rowsEl) {
      return;
    }
    const filteredMembers = state.members.filter((member) =>
      matchesIssueSearch(member, state.query)
    );
    rowsEl.innerHTML = "";
    if (!filteredMembers.length) {
      const empty = document.createElement("div");
      empty.className = "member-ticket-issue__row member-ticket-issue__row--empty";
      empty.textContent = "검색 결과가 없습니다.";
      rowsEl.appendChild(empty);
      return;
    }

    filteredMembers.forEach((member) => {
      const memberId = String(member?.id || "");
      const isSelected = memberId === state.selectedMemberId;
      const quantity = isSelected ? state.selectedQuantity : getIssueQuantity(member);
      const isDecreaseDisabled = quantity <= 1;
      const isIncreaseDisabled = quantity >= 99;
      const row = document.createElement("div");
      row.className = `member-ticket-issue__row${isSelected ? " is-selected" : ""}`;
      row.dataset.ticketIssueMemberId = memberId;
      row.innerHTML = `
        <button class="member-ticket-issue__select" type="button" data-ticket-issue-select aria-pressed="${isSelected}" aria-label="${escapeHtml(member?.dogName || "-")} 선택">
          <span class="member-ticket-issue__radio" aria-hidden="true"></span>
        </button>
        <div class="member-ticket-issue__content">
          <div class="member-ticket-issue__copy">
            <strong>${escapeHtml(member?.dogName || "-")}</strong>
            <span>${escapeHtml(member?.breed || "-")} / ${escapeHtml(member?.owner || "-")}</span>
          </div>
          <div class="member-ticket-issue__quantity" ${isSelected ? "" : "hidden"}>
            <span>수량</span>
            <div class="member-ticket-issue__quantity-controls">
              <button type="button" data-ticket-issue-quantity="decrease" ${isDecreaseDisabled ? "disabled" : ""} aria-label="수량 감소">-</button>
              <input type="number" min="1" max="99" step="1" inputmode="numeric" value="${quantity}" data-ticket-issue-quantity-input aria-label="지급 수량">
              <button type="button" data-ticket-issue-quantity="increase" ${isIncreaseDisabled ? "disabled" : ""} aria-label="수량 증가">+</button>
            </div>
          </div>
        </div>
      `;
      rowsEl.appendChild(row);
    });
  };

  const updateSubmitState = () => {
    if (submitEl) {
      submitEl.disabled = !state.selectedMemberId;
    }
  };

  const render = () => {
    renderRows();
    renderSummary();
    updateSubmitState();
  };

  const issueSelectedTicket = () => {
    const member = getSelectedMember();
    if (!member) {
      return;
    }
    const issueContext = createTicketIssueDateContext();
    const issues = buildTicketIssueEntries({
      memberId: member.id,
      ticket,
      quantity: state.selectedQuantity,
      ...issueContext,
    });
    if (!issues.length) {
      return;
    }
    applyIssueToMembers(issues, getCurrentTicketQuantity() || 1);
    recalculateTicketCounts();
    closeModal(modal);
    if (typeof onIssued === "function") {
      onIssued();
    }
  };

  rowsEl?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const quantityButton = target?.closest("[data-ticket-issue-quantity]");
    if (quantityButton) {
      const action = quantityButton.dataset.ticketIssueQuantity;
      const next = action === "increase"
        ? Math.min(99, state.selectedQuantity + 1)
        : Math.max(1, state.selectedQuantity - 1);
      state.selectedQuantity = next;
      render();
      return;
    }
    if (target?.closest(".member-ticket-issue__quantity")) {
      return;
    }
    const row = target?.closest("[data-ticket-issue-member-id]");
    const memberId = row?.dataset.ticketIssueMemberId || "";
    if (!memberId) {
      return;
    }
    if (state.selectedMemberId === memberId) {
      state.selectedMemberId = "";
      state.selectedQuantity = 1;
    } else {
      const member = state.members.find((item) => String(item?.id || "") === memberId);
      state.selectedMemberId = memberId;
      state.selectedQuantity = getIssueQuantity(member);
    }
    render();
  });

  rowsEl?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-ticket-issue-quantity-input]")) {
      return;
    }
    state.selectedQuantity = clampIssueQuantity(target.value);
    renderSummary();
    updateSubmitState();
  });

  rowsEl?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-ticket-issue-quantity-input]")) {
      return;
    }
    state.selectedQuantity = clampIssueQuantity(target.value);
    render();
  });

  searchInput?.addEventListener("input", (event) => {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    state.query = target?.value || "";
    render();
  });

  submitEl?.addEventListener("click", issueSelectedTicket);
  overlayEl?.addEventListener("click", () => closeModal(modal));
  closeEl?.addEventListener("click", () => closeModal(modal));

  return {
    open() {
      refreshMembers();
      state.selectedMemberId = "";
      state.selectedQuantity = 1;
      state.query = "";
      if (searchInput instanceof HTMLInputElement) {
        searchInput.value = "";
      }
      render();
      openModal(modal);
    },
  };
}
