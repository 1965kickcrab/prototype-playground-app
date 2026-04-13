import { initState } from "../services/state.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { ensureMemberDefaults } from "../storage/ticket-issue-members.js";
import { setupCalendar } from "../components/calendar.js";
import { setupList } from "../components/list.js";
import { setupReservationModal } from "./reservation.js";
import { setupFilterPanel } from "../components/filter-panel.js";
import { setupSidebarToggle } from "../utils/sidebar.js";
import { setupServiceSwitcher } from "../utils/service-switcher.js";
import { getTimeZone } from "../utils/timezone.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const storage = initReservationStorage();
  const timeZone = getTimeZone();
  const classStorage = initClassStorage();
  const hotelRoomStorage = initHotelRoomStorage();
  const classes = classStorage.ensureDefaults();
  hotelRoomStorage.ensureDefaults();
  ensureMemberDefaults();
  const selectedServices = {};
  const classNames = classes
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0);
  const defaultService = classNames[0] || "";
  const classTeachers = classes.reduce((acc, item) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      return acc;
    }
    acc[name] = item.teacher || "";
    return acc;
  }, {});

  classNames.forEach((name) => {
    selectedServices[name] = true;
  });
  const selectedTeachers = {};
  const selectedPaymentStatuses = {
    paid: true,
    unpaid: true,
  };
  const selectedTags = {};
  const existingReservations = storage.loadReservations().filter(
    (r) => r?.type === "school" || r?.type === "daycare" || r?.type === "pickdrop"
  );
  const state = initState(existingReservations, {
    selectedServices,
    defaultService,
    serviceOptions: classNames,
    selectedTeachers,
    selectedPaymentStatuses,
    paymentStatusOptions: ["paid", "unpaid"],
    selectedTags,
    tagOptions: loadMemberTagCatalog(),
    classTeachers,
  });
  const selectedDateParam = params.get("dateKey") || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDateParam)) {
    const [yearText, monthText, dayText] = selectedDateParam.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsedDate = new Date(year, month - 1, day);
    if (!Number.isNaN(parsedDate.getTime())) {
      state.currentDate = new Date(parsedDate);
      state.selectedDate = new Date(parsedDate);
    }
  }
  const filterPanel = document.querySelector("[data-filter-panel]");

  setupFilterPanel(filterPanel, classes, state);
  setupCalendar(state, storage);
  setupList(state, storage);
  setupSidebarToggle({
    iconOpen: "../assets/menuIcon_sidebar_open.svg",
    iconClose: "../assets/menuIcon_sidebar_close.svg",
  });
  setupServiceSwitcher(document);
  setupSidebarReservationBadges({ storage, timeZone });
  setupReservationModal(state, storage);
});




