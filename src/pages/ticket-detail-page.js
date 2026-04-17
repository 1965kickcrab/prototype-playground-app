import {
  fillTicketForm,
  isTicketFormValid,
  readTicketForm,
  renderTicketServiceOptions,
  setupTicketClassSelection,
  setupTicketPriceInput,
  setupTicketTypeDefaults,
  setupTicketUnlimitedToggle,
  setupTicketWeekdayChips,
} from "../components/ticket-form.js";
import { initTicketIssueModal } from "../components/ticket-issue-modal.js";
import { setupTicketServiceTabSwipe } from "../components/ticket-service-tabs.js";
import { initClassStorage } from "../storage/class-storage.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { syncClassesFromTickets } from "../services/class-ticket-sync.js";
import {
  formatReservationRule,
  formatStartDatePolicy,
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  formatTicketValidity,
  getTicketQuantityValue,
  getTicketUnitLabel,
} from "../services/ticket-service.js";

function getElements() {
  return {
    title: document.querySelector("[data-ticket-detail-title]"),
    back: document.querySelector("[data-ticket-detail-back]"),
    editAction: document.querySelector("[data-ticket-detail-edit]"),
    view: document.querySelector("[data-ticket-detail-view]"),
    empty: document.querySelector("[data-ticket-detail-empty]"),
    name: document.querySelector("[data-ticket-detail-name]"),
    kind: document.querySelector("[data-ticket-detail-kind]"),
    infoToggle: document.querySelector("[data-ticket-detail-info-toggle]"),
    infoContent: document.querySelector("[data-ticket-detail-info-content]"),
    infoList: document.querySelector("[data-ticket-detail-info-list]"),
    issue: document.querySelector("[data-ticket-detail-issue]"),
    issueModal: document.querySelector("[data-ticket-issue-modal]"),
    editSection: document.querySelector("[data-ticket-detail-edit-section]"),
    editForm: document.querySelector("[data-ticket-edit-form]"),
    editSubmit: document.querySelector("[data-ticket-edit-submit]"),
    editDelete: document.querySelector("[data-ticket-edit-delete]"),
  };
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function getTicketIdFromUrl() {
  return new URLSearchParams(window.location.search).get("ticketId") || "";
}

function goToList() {
  window.location.href = "./tickets.html";
}

function buildTicketKind(ticket) {
  const unitLabel = getTicketUnitLabel(ticket?.type || "");
  if (unitLabel === "시간") {
    return "시간권";
  }
  if (unitLabel === "박") {
    return "숙박권";
  }
  return "횟수권";
}

function buildValidityDetail(ticket) {
  if (ticket?.unlimitedValidity) {
    return "무제한";
  }
  const validity = formatTicketValidity(
    Number(ticket?.validity),
    ticket?.unit,
    ticket?.unlimitedValidity
  );
  if (validity === "-") {
    return "-";
  }
  return `${formatStartDatePolicy(ticket?.startDatePolicy)}부터 ${validity}`;
}

function buildReservationRuleDetail(ticket) {
  if (ticket?.reservationDateRule === "expiry") {
    return "만료일까지";
  }
  return formatReservationRule(ticket?.reservationDateRule);
}

function buildDetailRows(ticket) {
  const quantity = formatTicketCount(getTicketQuantityValue(ticket), ticket?.type);
  return [
    `${getTicketUnitLabel(ticket?.type || "") === "시간" ? "시간" : "횟수"} : ${quantity}`,
    `금액 : ${formatTicketPrice(Number(ticket?.price))}`,
    `유효기간 : ${buildValidityDetail(ticket)}`,
    `예약 가능 날짜 : ${buildReservationRuleDetail(ticket)}`,
  ];
}

function renderDetail(elements, ticket) {
  setText(elements.name, formatTicketDisplayName(ticket));
  setText(elements.kind, buildTicketKind(ticket));
  if (elements.infoList) {
    elements.infoList.innerHTML = "";
    buildDetailRows(ticket).forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      elements.infoList.appendChild(item);
    });
  }
}

function setInfoExpanded(elements, expanded) {
  elements.infoToggle?.setAttribute("aria-expanded", String(expanded));
  if (elements.infoContent) {
    elements.infoContent.hidden = !expanded;
  }
}

function syncLinkedSelections(tickets, classStorage, roomStorage) {
  const syncedClasses = syncClassesFromTickets(
    tickets,
    classStorage.loadClasses()
  );
  classStorage.saveClasses(syncedClasses);
  const syncedRooms = syncClassesFromTickets(
    tickets,
    roomStorage.loadClasses()
  );
  roomStorage.saveClasses(syncedRooms);
}

function initTicketDetailPage() {
  const elements = getElements();
  const storage = initTicketStorage();
  const classStorage = initClassStorage();
  const roomStorage = initHotelRoomStorage();
  const ticketId = getTicketIdFromUrl();
  const tickets = storage.ensureDefaults();
  const ticket = tickets.find((item) => String(item?.id || "") === ticketId);

  roomStorage.ensureDefaults();

  if (!ticket || !elements.view || !elements.editSection) {
    if (elements.view) {
      elements.view.hidden = true;
    }
    if (elements.empty) {
      elements.empty.hidden = false;
    }
    if (elements.editAction) {
      elements.editAction.hidden = true;
    }
    elements.back?.addEventListener("click", goToList);
    return;
  }

  let editSnapshot = "";
  let isEditMode = false;

  const showDetailMode = () => {
    isEditMode = false;
    elements.view.hidden = false;
    elements.editSection.hidden = true;
    if (elements.title) {
      elements.title.textContent = "이용권 상세";
    }
    if (elements.editAction) {
      elements.editAction.hidden = false;
    }
    renderDetail(elements, ticket);
  };

  const updateEditButtonState = () => {
    if (!elements.editForm || !elements.editSubmit) {
      return;
    }
    const isDirty = editSnapshot !== JSON.stringify(readTicketForm(elements.editForm));
    elements.editSubmit.disabled = !isTicketFormValid(elements.editForm) || !isDirty;
  };

  const showEditMode = () => {
    if (!elements.editForm) {
      return;
    }
    isEditMode = true;
    renderTicketServiceOptions(elements.editForm, {
      type: ticket.type,
      classes: classStorage.loadClasses(),
      rooms: roomStorage.loadClasses(),
    });
    fillTicketForm(elements.editForm, ticket);
    editSnapshot = JSON.stringify(readTicketForm(elements.editForm));
    updateEditButtonState();
    elements.view.hidden = true;
    elements.editSection.hidden = false;
    if (elements.title) {
      elements.title.textContent = "이용권 수정";
    }
    if (elements.editAction) {
      elements.editAction.hidden = true;
    }
  };

  if (elements.editForm) {
    setupTicketPriceInput(elements.editForm);
    setupTicketUnlimitedToggle(elements.editForm);
    setupTicketWeekdayChips(elements.editForm);
    setupTicketTypeDefaults(elements.editForm);
    setupTicketClassSelection(elements.editForm);
    setupTicketServiceTabSwipe(elements.editForm);
    elements.editForm.addEventListener("change", (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.matches("[data-ticket-type]")) {
        return;
      }
      renderTicketServiceOptions(elements.editForm, {
        type: input.value,
        classes: classStorage.loadClasses(),
        rooms: roomStorage.loadClasses(),
      });
    });
    elements.editForm.addEventListener("input", updateEditButtonState);
    elements.editForm.addEventListener("change", updateEditButtonState);
    elements.editForm.addEventListener("ticket-class-change", updateEditButtonState);
  }

  elements.back?.addEventListener("click", () => {
    if (isEditMode) {
      showDetailMode();
      return;
    }
    goToList();
  });
  elements.editAction?.addEventListener("click", showEditMode);
  elements.infoToggle?.addEventListener("click", () => {
    const expanded = elements.infoToggle?.getAttribute("aria-expanded") === "true";
    setInfoExpanded(elements, !expanded);
  });
  const issueModalController = initTicketIssueModal({
    modal: elements.issueModal,
    ticket,
  });
  elements.issue?.addEventListener("click", () => {
    issueModalController?.open();
  });

  elements.editSubmit?.addEventListener("click", () => {
    if (!elements.editForm || !isTicketFormValid(elements.editForm)) {
      return;
    }
    const targetIndex = tickets.findIndex((item) => String(item?.id || "") === ticketId);
    if (targetIndex === -1) {
      return;
    }
    const updated = readTicketForm(elements.editForm);
    tickets[targetIndex] = { id: tickets[targetIndex].id, ...updated };
    Object.assign(ticket, tickets[targetIndex]);
    storage.saveTickets(tickets);
    syncLinkedSelections(tickets, classStorage, roomStorage);
    showDetailMode();
  });

  elements.editDelete?.addEventListener("click", () => {
    if (!window.confirm("이용권을 삭제할까요?")) {
      return;
    }
    storage.saveTickets(tickets.filter((item) => String(item?.id || "") !== ticketId));
    syncLinkedSelections(storage.loadTickets(), classStorage, roomStorage);
    goToList();
  });

  setInfoExpanded(elements, false);
  renderDetail(elements, ticket);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTicketDetailPage);
} else {
  initTicketDetailPage();
}
