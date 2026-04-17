import { initTicketStorage } from "../storage/ticket-storage.js";
import { setupTicketServiceTabSwipe } from "../components/ticket-service-tabs.js";
import { renderTicketRows } from "../components/ticket-view.js";

export function initTicketPage(options = {}) {
  const storage = initTicketStorage();
  const tickets = storage.ensureDefaults();
  const listContainer = document.querySelector("[data-ticket-rows]");
  const empty = document.querySelector("[data-ticket-empty]");
  const serviceTabs = document.querySelector("[data-ticket-service-tabs]");
  let selectedType = "all";

  if (!listContainer) {
    return;
  }

  const updateView = () => {
    const visibleTickets = selectedType === "all"
      ? tickets
      : tickets.filter((ticket) => ticket?.type === selectedType);
    renderTicketRows(listContainer, visibleTickets);
    if (empty) {
      empty.hidden = visibleTickets.length > 0;
    }
  };

  const updateServiceTabs = () => {
    serviceTabs?.querySelectorAll("[data-ticket-service-filter]").forEach((button) => {
      const isActive = button instanceof HTMLElement
        && button.dataset.ticketServiceFilter === selectedType;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  serviceTabs?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest("[data-ticket-service-filter]");
    const type = button?.dataset.ticketServiceFilter || "";
    if (!type || type === selectedType) {
      return;
    }
    selectedType = type;
    updateServiceTabs();
    updateView();
  });

  listContainer.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const row = target.closest("[data-ticket-row]");
    if (!row) {
      return;
    }
    const ticketId = row.dataset.ticketId || "";
    const ticket = tickets.find((item) => String(item.id) === ticketId);
    if (!ticket) {
      return;
    }
    window.location.href = `./ticket-detail.html?ticketId=${encodeURIComponent(ticketId)}`;
  });

  setupTicketServiceTabSwipe();
  updateServiceTabs();
  updateView();
}

function bootstrapTicketPage() {
  initTicketPage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapTicketPage);
} else {
  bootstrapTicketPage();
}


