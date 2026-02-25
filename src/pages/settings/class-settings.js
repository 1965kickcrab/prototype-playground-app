import { initClassStorage } from "../../storage/class-storage.js";
import { initReservationStorage } from "/src/storage/reservation-storage.js";
import { initOperationsStorage } from "../../storage/operations-storage.js";
import { initHotelOperationsStorage } from "../../storage/hotel-operations-storage.js";
import { initHotelRoomStorage } from "../../storage/hotel-room-storage.js";
import { initTicketStorage } from "../../storage/ticket-storage.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketValidity,
} from "../../services/ticket-service.js";
import { MEMBERS } from "../../storage/members.js";
import { setupSidebarToggle } from "../../utils/sidebar.js";
import { setupSidebarGroups } from "../../utils/sidebar-groups.js";
import {
  collectClassFormData,
  fillClassForm,
  renderMemberOptions,
  renderTicketOptions,
  resetClassForm,
  setActiveClassTab,
  toggleMemberSelection,
  toggleTicketSelection,
  updateMemberCount,
  updateMemberSelectAllState,
  updateTicketCount,
  updateTicketSelectAllState,
} from "../../components/class-form.js";
import { renderClassRows } from "../../components/class-list.js";
import {
  addClass,
  deleteClass,
  getDefaultClassType,
  setupClassList,
  updateClass,
} from "../../services/class-management.js";

function setupClassModal(
  storage,
  classes,
  tickets,
  weeklyDefaults,
  holidayDefault,
  onUpdate,
  ticketStorage,
  config
) {
  const modal = document.querySelector("[data-class-modal]");
  if (!modal) {
    return;
  }

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-class-tab]");
    if (tabButton && modal.contains(tabButton)) {
      setActiveClassTab(modal, tabButton.dataset.classTab);
      return;
    }
    const dayToggle = event.target.closest("[data-class-day]");
    if (dayToggle && modal.contains(dayToggle)) {
      dayToggle.classList.toggle("is-selected");
      return;
    }
    const memberSelectAll = event.target.closest("[data-class-member-select-all]");
    if (memberSelectAll && modal.contains(memberSelectAll)) {
      toggleMemberSelection(modal);
      return;
    }
    const ticketSelectAll = event.target.closest("[data-class-ticket-select-all]");
    if (ticketSelectAll && modal.contains(ticketSelectAll)) {
      toggleTicketSelection(modal);
      return;
    }
    if (event.target.closest("[data-class-modal-open]")) {
      resetClassForm(modal, weeklyDefaults, holidayDefault, config.defaultClassType);
      renderTicketOptions(
        modal,
        tickets,
        formatTicketDisplayName,
        formatTicketCount,
        formatTicketValidity,
        config.defaultClassType
      );
      setActiveClassTab(modal, "basic");
      openModal();
      return;
    }

    if (event.target.closest("[data-class-submit]")) {
      const classData = collectClassFormData(modal, config);
      const nextClasses = addClass({
        storage,
        classes,
        classData,
        ticketStorage,
      });
      onUpdate(nextClasses);
      closeModal();
      return;
    }

    if (
      event.target.closest("[data-class-modal-close]") ||
      event.target.closest("[data-class-modal-overlay]")
    ) {
      closeModal();
    }
  });

  modal.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const ticketRow = target ? target.closest("[data-class-ticket]") : null;
    if (ticketRow && modal.contains(ticketRow)) {
      ticketRow.classList.toggle("is-checked");
      updateTicketCount(modal);
      updateTicketSelectAllState(modal);
      return;
    }
    const memberRow = target ? target.closest("[data-class-member]") : null;
    if (!memberRow || !modal.contains(memberRow)) {
      return;
    }
    memberRow.classList.toggle("is-checked");
    updateMemberCount(modal);
    updateMemberSelectAllState(modal);
  });

  renderMemberOptions(modal, MEMBERS);
  renderTicketOptions(
    modal,
    tickets,
    formatTicketDisplayName,
    formatTicketCount,
    formatTicketValidity,
    config.defaultClassType
  );
}

function setupClassDetailModal(
  storage,
  classes,
  tickets,
  holidayDefault,
  onUpdate,
  reservationStorage,
  ticketStorage,
  config
) {
  const modal = document.querySelector("[data-class-detail-modal]");
  const listContainer = document.querySelector("[data-class-rows]");
  if (!modal || !listContainer) {
    return;
  }

  let activeClassId = "";
  let initialSnapshot = "";

  const updateDirtyState = () => {
    const updateButton = modal.querySelector("[data-class-update]");
    if (!updateButton) {
      return;
    }
    const currentSnapshot = JSON.stringify(collectClassFormData(modal, config));
    const isDirty = currentSnapshot !== initialSnapshot;
    updateButton.disabled = !isDirty;
  };

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  listContainer.addEventListener("click", (event) => {
    const row = event.target.closest(".list-table__row--class");
    if (!row) {
      return;
    }

    const classId = row.dataset.classId;
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem) {
      return;
    }

    activeClassId = classItem.id;
    renderTicketOptions(
      modal,
      tickets,
      formatTicketDisplayName,
      formatTicketCount,
      formatTicketValidity,
      classItem.type || config.defaultClassType
    );
    fillClassForm(modal, classItem, holidayDefault, config.defaultClassType);
    setActiveClassTab(modal, "basic");
    initialSnapshot = JSON.stringify(collectClassFormData(modal, config));
    updateDirtyState();
    openModal();
  });

  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-class-tab]");
    if (tabButton && modal.contains(tabButton)) {
      setActiveClassTab(modal, tabButton.dataset.classTab);
      return;
    }
    const dayToggle = event.target.closest("[data-class-day]");
    if (dayToggle && modal.contains(dayToggle)) {
      dayToggle.classList.toggle("is-selected");
      updateDirtyState();
      return;
    }
    const memberSelectAll = event.target.closest("[data-class-member-select-all]");
    if (memberSelectAll && modal.contains(memberSelectAll)) {
      toggleMemberSelection(modal);
      updateDirtyState();
      return;
    }
    const ticketSelectAll = event.target.closest("[data-class-ticket-select-all]");
    if (ticketSelectAll && modal.contains(ticketSelectAll)) {
      toggleTicketSelection(modal);
      updateDirtyState();
      return;
    }
    if (
      event.target.closest("[data-class-detail-close]") ||
      event.target.closest("[data-class-detail-overlay]")
    ) {
      closeModal();
      return;
    }

    if (event.target.closest("[data-class-delete]")) {
      if (!window.confirm("반을 삭제할까요?")) {
        return;
      }
      const nextClasses = deleteClass({
        storage,
        classes,
        classId: activeClassId,
        ticketStorage,
        reservationStorage,
      });
      onUpdate(nextClasses);
      closeModal();
      return;
    }

    if (event.target.closest("[data-class-update]")) {
      const updated = collectClassFormData(modal, config);
      const nextClasses = updateClass({
        storage,
        classes,
        classId: activeClassId,
        classData: updated,
        ticketStorage,
        reservationStorage,
      });
      onUpdate(nextClasses);
      closeModal();
    }
  });

  modal.addEventListener("input", updateDirtyState);
  modal.addEventListener("change", updateDirtyState);

  modal.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const ticketRow = target ? target.closest("[data-class-ticket]") : null;
    if (ticketRow && modal.contains(ticketRow)) {
      ticketRow.classList.toggle("is-checked");
      updateTicketCount(modal);
      updateTicketSelectAllState(modal);
      updateDirtyState();
      return;
    }
    const memberRow = target ? target.closest("[data-class-member]") : null;
    if (!memberRow || !modal.contains(memberRow)) {
      return;
    }
    memberRow.classList.toggle("is-checked");
    updateMemberCount(modal);
    updateMemberSelectAllState(modal);
    updateDirtyState();
  });

  renderMemberOptions(modal, MEMBERS);
  renderTicketOptions(
    modal,
    tickets,
    formatTicketDisplayName,
    formatTicketCount,
    formatTicketValidity,
    config.defaultClassType
  );
}

const initClassSettingsPage = () => {
  const isHotelScope = document.body?.dataset?.settingsScope === "hotel";
  const storage = isHotelScope ? initHotelRoomStorage() : initClassStorage();
  const reservationStorage = isHotelScope ? null : initReservationStorage();
  const operationsStorage = isHotelScope ? initHotelOperationsStorage() : initOperationsStorage();
  const ticketStorage = initTicketStorage();
  let classes = setupClassList(storage, isHotelScope);
  if (!Array.isArray(classes) || classes.length === 0) {
    const seeded = storage.ensureDefaults();
    classes = Array.isArray(seeded) ? seeded : [];
  }
  const tickets = ticketStorage.ensureDefaults();
  const operationsSettings = operationsStorage.loadSettings();
  const listContainer = document.querySelector("[data-class-rows]");
  const config = {
    isHotelScope,
    defaultClassType: getDefaultClassType(isHotelScope),
  };

  const updateClasses = (nextClasses) => {
    classes.length = 0;
    classes.push(...nextClasses);
  };

  const updateList = (nextClasses) => {
    updateClasses(nextClasses);
    if (!listContainer) {
      return;
    }
    renderClassRows(listContainer, nextClasses, isHotelScope);
    if (listContainer.children.length === 0) {
      const fallback = storage.ensureDefaults();
      if (Array.isArray(fallback) && fallback.length > 0) {
        updateClasses(fallback);
        renderClassRows(listContainer, fallback, isHotelScope);
      }
    }
  };

  setupSidebarToggle({
    iconOpen: "../assets/menuIcon_sidebar_open.svg",
    iconClose: "../assets/menuIcon_sidebar_close.svg",
  });
  setupSidebarGroups({ navigateToFirstItemOnToggle: true });
  setupClassModal(
    storage,
    classes,
    tickets,
    operationsSettings.weekly,
    operationsSettings.publicHolidayOff,
    updateList,
    ticketStorage,
    config
  );
  setupClassDetailModal(
    storage,
    classes,
    tickets,
    operationsSettings.publicHolidayOff,
    updateList,
    reservationStorage,
    ticketStorage,
    config
  );
  updateList(classes);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClassSettingsPage);
} else {
  initClassSettingsPage();
}
