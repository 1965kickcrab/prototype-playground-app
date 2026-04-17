import {
  setupTicketPriceInput,
  setupTicketTypeDefaults,
  setupTicketUnlimitedToggle,
  isTicketFormValid,
  readTicketForm,
  renderTicketServiceOptions,
  setupTicketClassSelection,
  setupTicketWeekdayChips,
} from "../components/ticket-form.js";
import { setupTicketServiceTabSwipe } from "../components/ticket-service-tabs.js";
import { initClassStorage } from "../storage/class-storage.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { syncClassesFromTickets } from "../services/class-ticket-sync.js";

function getElements() {
  return {
    close: document.querySelector("[data-ticket-create-close]"),
    form: document.querySelector("[data-ticket-create-form]"),
    submit: document.querySelector("[data-ticket-create-submit]"),
  };
}

function goBackToTickets() {
  window.location.href = "./tickets.html";
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

function initTicketCreatePage() {
  const elements = getElements();
  const storage = initTicketStorage();
  const classStorage = initClassStorage();
  const roomStorage = initHotelRoomStorage();

  if (!elements.form || !elements.submit) {
    return;
  }

  const classes = classStorage.ensureDefaults();
  const rooms = roomStorage.ensureDefaults();
  setupTicketPriceInput(elements.form);
  setupTicketUnlimitedToggle(elements.form);
  setupTicketWeekdayChips(elements.form);
  setupTicketTypeDefaults(elements.form);
  setupTicketClassSelection(elements.form);
  setupTicketServiceTabSwipe(elements.form);
  renderTicketServiceOptions(elements.form, {
    type: "school",
    classes,
    rooms,
  });

  const updateSubmitState = () => {
    elements.submit.disabled = !isTicketFormValid(elements.form);
  };

  elements.form.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input || !input.matches("[data-ticket-type]")) {
      return;
    }
    renderTicketServiceOptions(elements.form, {
      type: input.value,
      classes: classStorage.loadClasses(),
      rooms: roomStorage.loadClasses(),
    });
  });
  elements.form.addEventListener("input", updateSubmitState);
  elements.form.addEventListener("change", updateSubmitState);
  elements.form.addEventListener("ticket-class-change", updateSubmitState);
  elements.close?.addEventListener("click", goBackToTickets);

  elements.submit.addEventListener("click", () => {
    if (!isTicketFormValid(elements.form)) {
      return;
    }
    const tickets = storage.loadTickets();
    const nextTicket = {
      id: String(Date.now()),
      ...readTicketForm(elements.form),
    };
    tickets.push(nextTicket);
    storage.saveTickets(tickets);
    syncLinkedSelections(tickets, classStorage, roomStorage);
    goBackToTickets();
  });

  updateSubmitState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTicketCreatePage);
} else {
  initTicketCreatePage();
}
