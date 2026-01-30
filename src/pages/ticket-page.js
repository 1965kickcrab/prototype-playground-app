import { initTicketStorage } from "../storage/ticket-storage.js";
import { renderTicketRows } from "../components/ticket-view.js";
import {
  fillTicketForm,
  isTicketFormValid,
  readTicketForm,
  resetTicketForm,
  setupTicketUnlimitedToggle,
  setupTicketPriceInput,
  setupTicketWeekdayChips,
  setupTicketTypeDefaults,
  renderTicketServiceOptions,
  setupTicketClassSelection,
} from "../components/ticket-form.js";
import { initTicketIssueModal } from "../components/ticket-issue.js";
import { setupSidebarToggle } from "../utils/sidebar.js";
import { initClassStorage } from "../storage/class-storage.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { syncClassesFromTickets } from "../services/class-ticket-sync.js";

const PAGE_SIZE = 10;

function getPageCount(totalCount) {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

function getPageTickets(tickets, page) {
  const startIndex = (page - 1) * PAGE_SIZE;
  return tickets.slice(startIndex, startIndex + PAGE_SIZE);
}

function createPageButton(label, page, isActive = false, isArrow = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.page = String(page);
  button.className = isArrow
    ? "ticket-pagination__arrow"
    : "ticket-pagination__page";
  if (isActive) {
    button.classList.add("is-active");
    button.setAttribute("aria-current", "page");
  }
  return button;
}

function renderPagination(container, totalPages, currentPage) {
  container.innerHTML = "";

  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  const prevButton = createPageButton("‹", prevPage, false, true);
  prevButton.disabled = currentPage === 1;
  prevButton.setAttribute("aria-label", "이전 페이지");
  container.appendChild(prevButton);

  for (let page = 1; page <= totalPages; page += 1) {
    container.appendChild(createPageButton(String(page), page, page === currentPage));
  }

  const nextButton = createPageButton("›", nextPage, false, true);
  nextButton.disabled = currentPage === totalPages;
  nextButton.setAttribute("aria-label", "다음 페이지");
  container.appendChild(nextButton);
}

function setupTicketModal(modal, options = {}) {
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

  return {
    openModal,
    closeModal,
  };
}

export function initTicketPage(options = {}) {
  const storage = initTicketStorage();
  const classStorage = initClassStorage();
  const roomStorage = initHotelRoomStorage();
  const tickets = storage.ensureDefaults();
  const listContainer = document.querySelector("[data-ticket-rows]");
  const countTarget = document.querySelector("[data-ticket-count]");
  const pagination = document.querySelector("[data-ticket-pagination]");
  const createButton = document.querySelector("[data-ticket-create-open]");
  const createModal = document.querySelector("[data-ticket-create-modal]");
  const editModal = document.querySelector("[data-ticket-edit-modal]");
  const issueModal = document.querySelector("[data-ticket-issue-modal]");
  const rooms = roomStorage.ensureDefaults();

  if (!listContainer || !countTarget || !pagination) {
    return;
  }

  let currentPage = 1;
  let activeTicketId = "";
  let editSnapshot = "";

  const updateView = () => {
    const totalPages = getPageCount(tickets.length);
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    const pageTickets = getPageTickets(tickets, currentPage);
    renderTicketRows(listContainer, pageTickets);
    countTarget.textContent = String(tickets.length);
    renderPagination(pagination, totalPages, currentPage);
  };

  pagination.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-page]")
      : null;
    if (!target) {
      return;
    }
    const nextPage = Number.parseInt(target.dataset.page || "", 10);
    if (Number.isNaN(nextPage) || nextPage === currentPage) {
      return;
    }
    currentPage = nextPage;
    updateView();
  });

  const createForm = createModal?.querySelector("[data-ticket-create-form]");
  const createSubmit = createModal?.querySelector("[data-ticket-create-submit]");
  const editForm = editModal?.querySelector("[data-ticket-edit-form]");
  const editSubmit = editModal?.querySelector("[data-ticket-edit-submit]");
  const editDelete = editModal?.querySelector("[data-ticket-edit-delete]");
  if (createForm) {
    setupTicketPriceInput(createForm);
    setupTicketUnlimitedToggle(createForm);
    setupTicketWeekdayChips(createForm);
    setupTicketTypeDefaults(createForm);
    setupTicketClassSelection(createForm);
    createForm.addEventListener("change", (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.matches("[data-ticket-type]")) {
        return;
      }
      renderTicketServiceOptions(createForm, {
        type: input.value,
        classes: classStorage.loadClasses(),
        rooms,
      });
    });
  }
  if (editForm) {
    setupTicketPriceInput(editForm);
    setupTicketUnlimitedToggle(editForm);
    setupTicketWeekdayChips(editForm);
    setupTicketTypeDefaults(editForm);
    setupTicketClassSelection(editForm);
    editForm.addEventListener("change", (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.matches("[data-ticket-type]")) {
        return;
      }
      renderTicketServiceOptions(editForm, {
        type: input.value,
        classes: classStorage.loadClasses(),
        rooms,
      });
    });
  }

  const createModalControls = createModal
    ? setupTicketModal(createModal, {
        overlaySelector: "[data-ticket-create-overlay]",
        closeSelector: "[data-ticket-create-close]",
      })
    : null;

  const editModalControls = editModal
    ? setupTicketModal(editModal, {
        overlaySelector: "[data-ticket-edit-overlay]",
        closeSelector: "[data-ticket-edit-close]",
      })
    : null;

  const issueModalControls = issueModal
    ? initTicketIssueModal({ modal: issueModal })
    : null;

  const updateCreateButtonState = () => {
    if (!createForm || !createSubmit) {
      return;
    }
    createSubmit.disabled = !isTicketFormValid(createForm);
  };

  const updateEditButtonState = () => {
    if (!editForm || !editSubmit) {
      return;
    }
    const isDirty = editSnapshot !== JSON.stringify(readTicketForm(editForm));
    editSubmit.disabled = !isTicketFormValid(editForm) || !isDirty;
  };

  createForm?.addEventListener("input", updateCreateButtonState);
  editForm?.addEventListener("input", updateEditButtonState);
  createForm?.addEventListener("ticket-class-change", updateCreateButtonState);
  editForm?.addEventListener("ticket-class-change", updateEditButtonState);

  createButton?.addEventListener("click", () => {
    if (!createForm || !createModalControls) {
      return;
    }
    resetTicketForm(createForm);
    renderTicketServiceOptions(createForm, {
      type: "kindergarten",
      classes: classStorage.loadClasses(),
      rooms,
    });
    updateCreateButtonState();
    createModalControls.openModal();
  });

  createSubmit?.addEventListener("click", () => {
    if (!createForm) {
      return;
    }
    const data = readTicketForm(createForm);
    if (!isTicketFormValid(createForm)) {
      return;
    }
    const nextId = String(Date.now());
    tickets.push({ id: nextId, ...data });
    storage.saveTickets(tickets);
    const syncedClasses = syncClassesFromTickets(
      tickets,
      classStorage.loadClasses()
    );
    classStorage.saveClasses(syncedClasses);
    updateView();
    createModalControls?.closeModal();
  });

  listContainer.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const issueButton = target.closest(".ticket-issue-button");
    if (issueButton) {
      const row = issueButton.closest(".ticket-table__row");
      const ticketId = row?.dataset.ticketId || "";
      const ticket = tickets.find((item) => String(item.id) === ticketId);
      if (ticket && issueModalControls) {
        issueModalControls.openModalWithTicket(ticket);
      }
      return;
    }
    const row = target.closest(".ticket-table__row");
    if (!row || !editModalControls || !editForm) {
      return;
    }
    const ticketId = row.dataset.ticketId || "";
    const ticket = tickets.find((item) => String(item.id) === ticketId);
    if (!ticket) {
      return;
    }
    activeTicketId = ticketId;
    renderTicketServiceOptions(editForm, {
      type: ticket.type,
      classes: classStorage.loadClasses(),
      rooms,
    });
    fillTicketForm(editForm, ticket);
    editSnapshot = JSON.stringify(readTicketForm(editForm));
    updateEditButtonState();
    editModalControls.openModal();
  });

  editSubmit?.addEventListener("click", () => {
    if (!editForm || !activeTicketId) {
      return;
    }
    if (!isTicketFormValid(editForm)) {
      return;
    }
    const updated = readTicketForm(editForm);
    const targetIndex = tickets.findIndex(
      (item) => String(item.id) === activeTicketId
    );
    if (targetIndex === -1) {
      return;
    }
    tickets[targetIndex] = { ...tickets[targetIndex], ...updated };
    storage.saveTickets(tickets);
    const syncedClasses = syncClassesFromTickets(
      tickets,
      classStorage.loadClasses()
    );
    classStorage.saveClasses(syncedClasses);
    updateView();
    editSnapshot = JSON.stringify(readTicketForm(editForm));
    editModalControls?.closeModal();
  });

  editDelete?.addEventListener("click", () => {
    if (!activeTicketId) {
      return;
    }
    if (!window.confirm("이용권을 삭제할까요?")) {
      return;
    }
    const nextTickets = tickets.filter(
      (item) => String(item.id) !== activeTicketId
    );
    tickets.length = 0;
    tickets.push(...nextTickets);
    storage.saveTickets(tickets);
    const syncedClasses = syncClassesFromTickets(
      tickets,
      classStorage.loadClasses()
    );
    classStorage.saveClasses(syncedClasses);
    updateView();
    editModalControls?.closeModal();
  });

  setupSidebarToggle(options);
  updateView();
}


