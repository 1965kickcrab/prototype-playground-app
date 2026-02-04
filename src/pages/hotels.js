import { setupSidebarToggle } from "../utils/sidebar.js";
import { setupHotelingCalendar } from "../components/hoteling-calendar.js";
import { renderHotelingRoomOptions } from "../components/hoteling-room-options.js";
import { renderHotelingList } from "../components/hoteling-list.js";
import { collectHotelingReservationFormData } from "../components/hoteling-reservation-form.js";
import { renderMemberSearchResults } from "../components/member-search.js";
import { renderTicketOptions } from "../components/reservation-ticket-view.js";
import { renderHotelingFeeBreakdown, renderPickdropTickets, renderPricingBreakdown } from "../components/reservation-fee.js";
import { showToast } from "../components/toast.js";
import { syncFilterChip } from "../utils/dom.js";
import { syncReservationFeeTotal } from "../utils/reservation-fee-total.js";
import { renderSelectableChips, setSelectedChip } from "../components/selection-chips.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import {
  ensureMemberDefaults,
  loadIssueMembers,
  applyReservationToMember,
  applyReservationToMemberTickets,
  rollbackReservationMemberTickets,
  applyReservationStatusChange,
} from "../storage/ticket-issue-members.js";
import {
  buildHotelingDateEntries,
  buildHotelingEntriesForDate,
  getHotelingCalendarStats,
  getHotelingDateKey,
  getNextHotelingCheckinKey,
  getHotelingTicketOptions,
  getHotelingRoomIdsForTickets,
  STATUS,
  isHotelingDateDisabled,
  getHotelingNightKeys,
} from "../services/hoteling-reservation-service.js";
import {
  getMemberHotelingReservationSummary,
} from "../services/member-reservation-summary.js";
import { allocateTicketUsage, getIssuedTicketOptions } from "../services/ticket-reservation-service.js";
import {
  buildDateTicketUsageMap,
  buildDateTicketUsagesMap,
  buildTicketUsageCountMap,
  buildTicketUsageEntries,
  getEntryTicketUsages,
  getPrimaryTicketUsage,
  buildTicketUsageMapFromEntries,
  mergeTicketUsageCountMap,
} from "../services/ticket-usage-service.js";
import { initState } from "../services/state.js";
import { setupReservationModal } from "./reservation.js";
import { getDatePartsFromKey } from "../utils/date.js";
import { getTimeZone } from "../utils/timezone.js";
import { createId } from "../utils/id.js";
import { initReservationStorage } from "/src/storage/reservation-storage.js";
import { getPickdropReservableTotal } from "../services/pickdrop-policy.js";

document.addEventListener("DOMContentLoaded", () => {
  const timeZone = getTimeZone();
  const reservationStorage = initReservationStorage();
  const roomStorage = initHotelRoomStorage();
  const ticketStorage = initTicketStorage();
  const pricingStorage = initPricingStorage();
  const classStorage = initClassStorage();

  const allReservations = reservationStorage.loadReservations();

  const rooms = roomStorage.ensureDefaults();
  const getTotalRoomCapacity = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, room) => {
      const value = Number(room?.capacity);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  const tickets = ticketStorage.ensureDefaults();
  const pricingItems = pricingStorage.loadPricingItems();
  ensureMemberDefaults();
  const classes = classStorage.ensureDefaults();
  const classNames = classes
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0);
  const defaultService = classNames[0] || "";
  const selectedServices = {};
  classNames.forEach((name) => {
    selectedServices[name] = true;
  });
  const classTeachers = classes.reduce((acc, item) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      return acc;
    }
    acc[name] = item.teacher || "";
    return acc;
  }, {});

  const roomFilterState = {
    options: [],
    selected: new Set(),
  };

  const setupHotelingFilterPanel = (roomsList, onChange) => {
    const panel = document.querySelector(".filter-panel-wrap");
    if (!panel) {
      return;
    }
    const toggle = panel.querySelector("[data-filter-toggle]");
    const body = panel.querySelector("[data-filter-panel-body]");
    const menu = panel.querySelector("[data-filter-menu='room']");
    const button = panel.querySelector("[data-filter-button='room']");
    const reset = panel.querySelector("[data-filter-reset]");
    const badge = panel.querySelector("[data-filter-badge]");
    if (!menu || !button) {
      return;
    }
    const roomOptions = (Array.isArray(roomsList) ? roomsList : [])
      .map((room) => room?.name)
      .filter((name) => typeof name === "string" && name.trim().length > 0);
    const options = roomOptions.length ? roomOptions : ["호실"];
    roomFilterState.options = options.slice();
    roomFilterState.selected = new Set(options);
    const selectedMap = {};
    options.forEach((name) => {
      selectedMap[name] = true;
    });

    const renderMenu = () => {
      menu.innerHTML = "";
      options.forEach((name) => {
        const label = document.createElement("label");
        label.className = "menu-option is-selected";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = name;
        input.checked = selectedMap[name] !== false;
        input.setAttribute("data-room-filter", "");
        const text = document.createElement("div");
        const title = document.createElement("div");
        title.className = "menu-option__title";
        title.textContent = name;
        text.appendChild(title);
        label.appendChild(input);
        label.appendChild(text);
        menu.appendChild(label);
      });
    };

    const updateSummary = (skipChange = false) => {
      const selected = Object.keys(selectedMap).filter((key) => selectedMap[key] !== false);
      if (selected.length === options.length) {
        button.textContent = "전체 호실";
      } else if (selected.length === 1) {
        button.textContent = selected[0];
      } else if (selected.length > 1) {
        const sorted = [...selected].sort((a, b) => a.localeCompare(b, "ko"));
        button.textContent = `${sorted[0]} 외 ${selected.length - 1}`;
      } else {
        button.textContent = "전체 호실";
      }
      if (badge) {
        const activeCount = selected.length === options.length ? 0 : 1;
        badge.textContent = String(activeCount);
        badge.hidden = activeCount === 0;
      }
      roomFilterState.selected = new Set(selected);
      if (!skipChange && typeof onChange === "function") {
        onChange();
      }
    };

    renderMenu();
    updateSummary(true);
    if (body) {
      body.hidden = true;
    }

    toggle?.addEventListener("click", () => {
      const isOpen = body?.hasAttribute("hidden") === false;
      if (body) {
        body.hidden = isOpen;
      }
      toggle.setAttribute("aria-expanded", String(!isOpen));
      if (isOpen && menu) {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });

    panel.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const dropdownButton = target?.closest("[data-filter-button='room']");
      if (dropdownButton) {
        const isOpen = menu.hasAttribute("hidden") === false;
        menu.hidden = isOpen;
        dropdownButton.setAttribute("aria-expanded", String(!isOpen));
        return;
      }
      const resetButton = target?.closest("[data-filter-reset]");
      if (resetButton) {
        options.forEach((name) => {
          selectedMap[name] = true;
        });
        renderMenu();
        updateSummary();
      }
    });

    panel.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      if (input.matches("[data-room-filter]")) {
        selectedMap[input.value] = input.checked;
        const hasActive = Object.values(selectedMap).some(Boolean);
        if (!hasActive) {
          selectedMap[input.value] = true;
          input.checked = true;
        }
        input.closest(".menu-option")?.classList.toggle("is-selected", input.checked);
        updateSummary();
      }
    });

    document.addEventListener("click", (event) => {
      if (!panel.contains(event.target)) {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
  };

  const getRoomNameFromReservation = (reservation) => {
    const roomId = String(reservation?.room || "");
    if (!roomId) {
      return "";
    }
    const room = rooms.find((item) => String(item.id) === roomId);
    return room?.name || roomId;
  };

  const getFilteredReservations = () => {
    const selected = roomFilterState.selected;
    const total = roomFilterState.options.length;
    if (!selected || selected.size === 0 || selected.size === total) {
      return reservationState.reservations;
    }
    return reservationState.reservations.filter((item) =>
      selected.has(getRoomNameFromReservation(item))
    );
  };

  const reservationState = {
    reservations: allReservations.filter(r => r.type === 'hoteling'),
    selectedDateKey: "",
  };
  let calendarStats = getHotelingCalendarStats(reservationState.reservations);

  const getCalendarStatsForDate = (dateKey) => calendarStats.get(dateKey) || null;
  const refreshCalendarStats = () => {
    calendarStats = getHotelingCalendarStats(getFilteredReservations());
    hotelingCalendar?.refresh?.();
  };

  const onRoomFilterChange = () => {
    refreshCalendarStats();
    if (reservationState.selectedDateKey) {
      renderListForKey(reservationState.selectedDateKey);
    } else if (reservationState.reservations.length > 0) {
      const firstReservation = reservationState.reservations[0];
      const firstCheckinDate = Array.isArray(firstReservation?.dates)
        ? firstReservation.dates.find((entry) => entry?.kind === "checkin")?.date || ""
        : "";
      renderListForKey(firstCheckinDate || firstReservation?.checkinDate || "");
    }
  };

  setupHotelingFilterPanel(rooms, onRoomFilterChange);

  setupSidebarToggle({
    iconOpen: "../../assets/menuIcon_sidebar_open.svg",
    iconClose: "../../assets/menuIcon_sidebar_close.svg",
  });

  const listCard = document.querySelector(".hoteling-list-card");
  const listToggle = document.querySelector("[data-hoteling-list-toggle]");
  const layout = document.querySelector(".hoteling-layout");
  const listDate = document.querySelector("[data-hoteling-list-date]");
  const totalCountEl = document.querySelector("[data-hoteling-total-count]");
  const checkinCountEl = document.querySelector("[data-hoteling-checkin-count]");
  const checkoutCountEl = document.querySelector("[data-hoteling-checkout-count]");
  const stayCountEl = document.querySelector("[data-hoteling-stay-count]");
  const listEmptyEl = document.querySelector("[data-hoteling-list-empty]");
  const cancelOpenButton = document.querySelector("[data-hoteling-cancel-open]");
  const checkinTable = document.querySelector("[data-hoteling-table=\"checkin\"]");
  const checkoutTable = document.querySelector("[data-hoteling-table=\"checkout\"]");
  const stayTable = document.querySelector("[data-hoteling-table=\"stay\"]");
  const checkinEmptyRow = document.querySelector("[data-hoteling-empty=\"checkin\"]");
  const checkoutEmptyRow = document.querySelector("[data-hoteling-empty=\"checkout\"]");
  const stayEmptyRow = document.querySelector("[data-hoteling-empty=\"stay\"]");
  const checkinSection = checkinTable?.closest(".hoteling-section");
  const checkoutSection = checkoutTable?.closest(".hoteling-section");
  const staySection = stayTable?.closest(".hoteling-section");
  const cancelModal = document.querySelector("[data-hoteling-cancel-modal]");
  const cancelOverlay = document.querySelector("[data-hoteling-cancel-overlay]");
  const cancelCloseButtons = document.querySelectorAll("[data-hoteling-cancel-close]");
  const cancelConfirmButton = document.querySelector("[data-hoteling-cancel-confirm]");
  const detailModal = document.querySelector("[data-hoteling-detail-modal]");
  const detailOverlay = document.querySelector("[data-hoteling-detail-overlay]");
  const detailCloseButtons = document.querySelectorAll("[data-hoteling-detail-close]");
  const detailOwnerEl = document.querySelector("[data-hoteling-detail-owner]");
  const detailPhoneEl = document.querySelector("[data-hoteling-detail-phone]");
  const detailStatusTrigger = document.querySelector("[data-hoteling-detail-status-trigger]");
  const detailStatusValue = document.querySelector("[data-hoteling-detail-status-value]");
  const detailStatusMenu = document.querySelector("[data-hoteling-detail-status-menu]");
  const detailDogNameEl = document.querySelector("[data-hoteling-detail-dog-name]");
  const detailBreedEl = document.querySelector("[data-hoteling-detail-breed]");
  const detailWeightEl = document.querySelector("[data-hoteling-detail-weight]");
  const detailNightsEl = document.querySelector("[data-hoteling-detail-nights]");
  const detailRoomChips = document.querySelector("[data-hoteling-detail-room-chips]");
  const detailCheckinDateEl = document.querySelector("[data-hoteling-detail-checkin-date]");
  const detailCheckinTimeEl = document.querySelector("[data-hoteling-detail-checkin-time]");
  const detailCheckoutDateEl = document.querySelector("[data-hoteling-detail-checkout-date]");
  const detailCheckoutTimeEl = document.querySelector("[data-hoteling-detail-checkout-time]");
  const detailPickdropOptions = document.querySelector("[data-hoteling-detail-pickdrop-options]");
  const detailMemoEl = document.querySelector("[data-hoteling-detail-memo]");
  const detailSaveButton = document.querySelector("[data-hoteling-detail-save]");
  const detailTabButtons = document.querySelectorAll("[data-hoteling-detail-tab]");
  const detailTabPanels = document.querySelectorAll("[data-hoteling-detail-panel]");
  const detailPaymentButtons = document.querySelectorAll(
    "[data-hoteling-detail-payment-method]"
  );
  const detailTicketInfo = document.querySelector("[data-hoteling-detail-ticket-info]");
  const detailPaymentTicketRow = document.querySelector(
    "[data-hoteling-detail-payment-ticket]"
  );
  const headerBadgeValue = document.querySelector(".hoteling-header__badge-value");

  const detailState = {
    reservationId: "",
    initial: null,
    statusKey: "PLANNED",
    statusDateKey: "",
    statusKind: "",
  };
  let activePaymentMethod = "ticket";
  const detailRoomDataKey = "hotelingDetailRoom";
  const getSelectedDetailRoomId = () =>
    detailRoomChips
      ?.querySelector("[data-hoteling-detail-room].is-selected")
      ?.dataset?.hotelingDetailRoom || "";

  if (listCard && listToggle) {
    const updateToggleState = () => {
      const isHidden = listCard.classList.contains("is-hidden");
      listToggle.setAttribute("aria-expanded", String(!isHidden));
      listToggle.setAttribute(
        "aria-label",
        isHidden ? "호텔링 목록 표시" : "호텔링 목록 숨기기"
      );
      if (layout) {
        layout.classList.toggle("is-list-hidden", isHidden);
      }
    };

    listToggle.addEventListener("click", () => {
      listCard.classList.toggle("is-hidden");
      updateToggleState();
    });

    updateToggleState();
  }

  if (headerBadgeValue) {
    headerBadgeValue.textContent = String(getTotalRoomCapacity(rooms));
  }

  const getTableCheckboxes = (table) => {
    if (!table) {
      return null;
    }
    const headerCheckbox = table.querySelector(
      ".hoteling-table__header input[type=\"checkbox\"]"
    );
    const rowCheckboxes = table.querySelectorAll(
      ".hoteling-table__row--data input[type=\"checkbox\"]"
    );
    return { headerCheckbox, rowCheckboxes };
  };

  const syncTableHeaderCheckbox = (table) => {
    const refs = getTableCheckboxes(table);
    if (!refs?.headerCheckbox) {
      return;
    }
    const total = refs.rowCheckboxes.length;
    const checked = Array.from(refs.rowCheckboxes).filter((box) => box.checked)
      .length;
    refs.headerCheckbox.checked = total > 0 && checked === total;
    refs.headerCheckbox.indeterminate = checked > 0 && checked < total;
  };

  const getSelectedReservationIds = () => {
    if (!listCard) {
      return [];
    }
    const checkedBoxes = listCard.querySelectorAll(
      ".hoteling-table__row--data input[type=\"checkbox\"]:checked"
    );
    const ids = new Set();
    checkedBoxes.forEach((box) => {
      const row = box.closest(".hoteling-table__row--data");
      const id = row?.dataset?.reservationId;
      if (id) {
        ids.add(id);
      }
    });
    return Array.from(ids);
  };

  const syncCancelButtonState = () => {
    if (!cancelOpenButton) {
      return;
    }
    const hasSelection = getSelectedReservationIds().length > 0;
    cancelOpenButton.disabled = !hasSelection;
    cancelOpenButton.classList.toggle("button-secondary--disabled", !hasSelection);
  };

  const openCancelModal = () => {
    if (!cancelModal) {
      return;
    }
    cancelModal.setAttribute("aria-hidden", "false");
    cancelModal.classList.add("is-open");
  };

  const closeCancelModal = () => {
    if (!cancelModal) {
      return;
    }
    cancelModal.setAttribute("aria-hidden", "true");
    cancelModal.classList.remove("is-open");
  };

  const cancelSelectedReservations = () => {
    const idsToCancel = new Set(getSelectedReservationIds());
    if (idsToCancel.size === 0) {
      return;
    }

    const usageByMember = new Map();

    allReservations.forEach(reservation => {
      if (!idsToCancel.has(reservation.id)) {
        return;
      }
      
      // Keep status source-of-truth on baseStatusKey for ticket recount.
      reservation.dates.forEach(entry => {
        entry.baseStatusKey = "CANCELED";
        entry.statusText = reservationStorage.STATUS.CANCELED;
        entry.status = reservationStorage.STATUS.CANCELED;
      });

      const memberId = getMemberIdFromReservation(reservation);
      if (memberId) {
        const usageMap = buildTicketUsageCountMap(reservation.dates);
        if (usageMap.size > 0) {
          const memberUsage = usageByMember.get(memberId) || new Map();
          mergeTicketUsageCountMap(memberUsage, usageMap);
          usageByMember.set(memberId, memberUsage);
        }
      }
    });
    
    // Save the whole updated list
    reservationStorage.saveReservations(allReservations);
    
    // Update local state and re-render
    reservationState.reservations = allReservations.filter(r => r.type === 'hoteling');

    usageByMember.forEach((usageMap, memberId) => {
      rollbackReservationMemberTickets(memberId, usageMap);
    });

    refreshCalendarStats();
    renderListForKey(reservationState.selectedDateKey);
  };

  const getMemberIdFromReservation = (reservation) => {
    if (!reservation) {
      return "";
    }
    const dogName = reservation.dogName || "";
    const owner = reservation.owner || "";
    const breed = reservation.breed || "";
    const match = loadIssueMembers().find((member) =>
      member.dogName === dogName
      && member.owner === owner
      && (!breed || member.breed === breed)
    );
    return match?.id || "";
  };

  const closeDetailModal = () => {
    if (!detailModal) {
      return;
    }
    closeDetailStatusMenu();
    detailModal.setAttribute("aria-hidden", "true");
    detailModal.classList.remove("is-open");
  };

  const setActiveDetailTab = (value) => {
    const target = value || "product";
    detailTabButtons.forEach((button) => {
      const isActive = button.dataset.hotelingDetailTab === target;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    detailTabPanels.forEach((panel) => {
      const isActive = panel.dataset.hotelingDetailPanel === target;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  };

  const setPaymentMethod = (value) => {
    activePaymentMethod = value || "ticket";
    detailPaymentButtons.forEach((button) => {
      const isSelected =
        button.dataset.hotelingDetailPaymentMethod === activePaymentMethod;
      button.classList.toggle("is-selected", isSelected);
    });
    if (detailPaymentTicketRow) {
      detailPaymentTicketRow.hidden = activePaymentMethod !== "ticket";
    }
  };

  const HOTELING_DETAIL_STATUS_ORDER = [
    "PLANNED",
    "CHECKIN",
    "CHECKOUT",
    "NO_SHOW",
    "CANCELED",
  ];

  const HOTELING_STATUS_CLASS_MAP = {
    PLANNED: "hoteling-detail__status--planned",
    CHECKIN: "hoteling-detail__status--checkin",
    CHECKOUT: "hoteling-detail__status--checkout",
    NO_SHOW: "hoteling-detail__status--noshow",
    CANCELED: "hoteling-detail__status--canceled",
  };

  const getHotelingStatusLabel = (statusKey) => {
    if (statusKey === "CHECKIN") {
      return "입실";
    }
    if (statusKey === "CHECKOUT") {
      return "퇴실";
    }
    return STATUS[statusKey] || "-";
  };

  const closeDetailStatusMenu = () => {
    if (!detailStatusMenu) {
      return;
    }
    detailStatusMenu.hidden = true;
    detailStatusTrigger?.setAttribute("aria-expanded", "false");
  };

  const updateDetailStatusDisplay = (statusKey) => {
    const nextKey = String(statusKey || "PLANNED");
    detailState.statusKey = nextKey;
    if (detailStatusValue) {
      detailStatusValue.textContent = getHotelingStatusLabel(nextKey);
    }
    if (detailStatusTrigger) {
      detailStatusTrigger.classList.remove(
        "hoteling-detail__status--planned",
        "hoteling-detail__status--checkin",
        "hoteling-detail__status--checkout",
        "hoteling-detail__status--noshow",
        "hoteling-detail__status--canceled"
      );
      detailStatusTrigger.classList.add(
        HOTELING_STATUS_CLASS_MAP[nextKey] || HOTELING_STATUS_CLASS_MAP.PLANNED
      );
    }
  };

  const renderDetailStatusMenu = () => {
    if (!detailStatusMenu) {
      return;
    }
    detailStatusMenu.innerHTML = HOTELING_DETAIL_STATUS_ORDER
      .map((key) => {
        const label = getHotelingStatusLabel(key);
        if (!label) {
          return "";
        }
        const isSelected = key === detailState.statusKey ? " is-selected" : "";
        return `
          <button class="menu-option reservation-detail__status-option${isSelected}" type="button" data-hoteling-detail-status-option="${key}">
            <span class="menu-option__title">${label}</span>
          </button>
        `;
      })
      .join("");
  };

  const toggleDetailStatusMenu = () => {
    if (!detailStatusMenu) {
      return;
    }
    const shouldOpen = detailStatusMenu.hidden;
    if (!shouldOpen) {
      closeDetailStatusMenu();
      return;
    }
    renderDetailStatusMenu();
    detailStatusMenu.hidden = false;
    detailStatusTrigger?.setAttribute("aria-expanded", "true");
  };

  const renderDetailTicketInfo = (reservation) => {
    if (!detailTicketInfo) {
      return;
    }
    detailTicketInfo.textContent = "";
    const memberId = getMemberIdFromReservation(reservation);
    const member = loadIssueMembers().find(
      (item) => String(item.id) === String(memberId)
    );
    const usageEntry = Array.isArray(reservation?.dates)
      ? reservation.dates.find((entry) => getEntryTicketUsages(entry).length > 0)
      : null;
    const usage = getPrimaryTicketUsage(usageEntry || {}) || null;
    if (!memberId || !usage?.ticketId || !usage?.sequence) {
      const card = document.createElement("div");
      card.className =
        "reservation-detail__ticket-card reservation-detail__ticket-card--empty";
      card.innerHTML = `
        <div class="reservation-detail__ticket-col reservation-detail__ticket-col--name">
          <span class="reservation-detail__ticket-value" data-ticket-cell="name">-</span>
        </div>
        <div class="reservation-detail__ticket-col reservation-detail__ticket-col--sequence">
          <span class="reservation-detail__ticket-label">회차</span>
          <span class="reservation-detail__ticket-value" data-ticket-cell="sequence">-</span>
        </div>
        <div class="reservation-detail__ticket-col reservation-detail__ticket-col--total">
          <span class="reservation-detail__ticket-label">총횟수</span>
          <span class="reservation-detail__ticket-value" data-ticket-cell="total">-</span>
        </div>
      `;
      detailTicketInfo.appendChild(card);
      return;
    }
    const options = getIssuedTicketOptions(
      tickets,
      Array.isArray(member?.tickets) ? member.tickets : []
    );
    const optionMap = new Map(options.map((option) => [option.id, option]));
    const ticketName = optionMap.get(String(usage.ticketId))?.name || "-";
    const totalCount = optionMap.get(String(usage.ticketId))?.totalCount;
    const totalText = Number.isFinite(Number(totalCount)) && Number(totalCount) > 0
      ? `${Number(totalCount)}`
      : "-";
    const card = document.createElement("div");
    card.className = "reservation-detail__ticket-card";
    card.innerHTML = `
      <div class="reservation-detail__ticket-col reservation-detail__ticket-col--name">
        <span class="reservation-detail__ticket-value" data-ticket-cell="name">${ticketName}</span>
      </div>
      <div class="reservation-detail__ticket-col reservation-detail__ticket-col--sequence">
        <span class="reservation-detail__ticket-label">회차</span>
        <span class="reservation-detail__ticket-value" data-ticket-cell="sequence">${usage.sequence}</span>
      </div>
      <div class="reservation-detail__ticket-col reservation-detail__ticket-col--total">
        <span class="reservation-detail__ticket-label">총횟수</span>
        <span class="reservation-detail__ticket-value" data-ticket-cell="total">${totalText}</span>
      </div>
    `;
    detailTicketInfo.appendChild(card);
  };

  const getDetailPickdropFlags = () => {
    const pickupChip = detailPickdropOptions?.querySelector(
      "[data-hoteling-detail-pickdrop=\"pickup\"]"
    );
    const dropoffChip = detailPickdropOptions?.querySelector(
      "[data-hoteling-detail-pickdrop=\"dropoff\"]"
    );
    return {
      pickup: Boolean(pickupChip?.classList?.contains("is-selected")),
      dropoff: Boolean(dropoffChip?.classList?.contains("is-selected")),
    };
  };

  const openDetailModal = (reservation, context = {}) => {
    if (!detailModal || !reservation) {
      return;
    }
    const schedule = getHotelingScheduleSnapshot(reservation);
    const status = getHotelingDetailStatus(reservation, context);
    const pickdropFlags = getHotelingPickdropFlags(reservation);
    detailState.reservationId = reservation.id || "";
    detailState.initial = {
      room: String(reservation.room || ""),
      checkinDate: schedule.checkinDate,
      checkoutDate: schedule.checkoutDate,
      checkinTime: schedule.checkinTime,
      checkoutTime: schedule.checkoutTime,
      statusKey: status.key,
      memo: reservation.memo || "",
      pickup: pickdropFlags.hasPickup,
      dropoff: pickdropFlags.hasDropoff,
    };
    const owner = reservation.owner || "-";
    const dogName = reservation.dogName || "-";
    const breed = reservation.breed || "-";
    const weight =
      reservation.weight || reservation.memberWeight || reservation.petWeight || "-";
    const roomId = String(reservation.room || "");
    const roomName = roomId
      ? (rooms.find((item) => String(item.id) === roomId)?.name || roomId)
      : "";
    const room = roomName || "-";
    if (detailOwnerEl) {
      detailOwnerEl.textContent = owner;
    }
    if (detailPhoneEl) {
      detailPhoneEl.textContent = "-";
    }
    if (detailDogNameEl) {
      detailDogNameEl.textContent = dogName;
    }
    if (detailBreedEl) {
      detailBreedEl.textContent = breed;
    }
    if (detailWeightEl) {
      detailWeightEl.textContent = weight;
    }
    if (detailRoomChips) {
      renderSelectableChips(
        detailRoomChips,
        rooms.map((item) => ({
          value: String(item.id ?? ""),
          label: item.name || String(item.id ?? ""),
        })),
        { dataKey: detailRoomDataKey, selectedValue: roomId }
      );
    }
    detailState.statusDateKey = context?.dateKey || "";
    detailState.statusKind = context?.kind || "";
    updateDetailStatusDisplay(status.key);
    closeDetailStatusMenu();
    const nights = getNightCount(
      getDateFromKey(schedule.checkinDate),
      getDateFromKey(schedule.checkoutDate)
    );
    if (detailNightsEl) {
      detailNightsEl.textContent =
        typeof nights === "number"
          ? `${nights}박 ${nights + 1}일`
          : "-";
    }
    if (detailCheckinDateEl) {
      detailCheckinDateEl.value = schedule.checkinDate;
    }
    if (detailCheckoutDateEl) {
      detailCheckoutDateEl.value = schedule.checkoutDate;
    }
    if (detailCheckinTimeEl) {
      detailCheckinTimeEl.value = schedule.checkinTime;
    }
    if (detailCheckoutTimeEl) {
      detailCheckoutTimeEl.value = schedule.checkoutTime;
    }
    if (detailPickdropOptions) {
      const { hasPickup, hasDropoff } = pickdropFlags;
      const pickupChip = detailPickdropOptions.querySelector(
        "[data-hoteling-detail-pickdrop=\"pickup\"]"
      );
      const dropoffChip = detailPickdropOptions.querySelector(
        "[data-hoteling-detail-pickdrop=\"dropoff\"]"
      );
      if (pickupChip) {
        pickupChip.classList.toggle("is-selected", hasPickup);
      }
      if (dropoffChip) {
        dropoffChip.classList.toggle("is-selected", hasDropoff);
      }
    }
    if (detailMemoEl) {
      const memoValue = String(reservation.memo || "").trim();
      if (detailMemoEl instanceof HTMLTextAreaElement) {
        detailMemoEl.value = memoValue;
      } else {
        detailMemoEl.textContent = memoValue || "-";
      }
    }
    renderDetailTicketInfo(reservation);
    const hasTicketUsage = Array.isArray(reservation?.dates)
      ? reservation.dates.some((entry) => getEntryTicketUsages(entry).length > 0)
      : false;
    setPaymentMethod(hasTicketUsage ? "ticket" : "cash");
    setActiveDetailTab("product");
    if (detailSaveButton) {
      detailSaveButton.disabled = true;
    }

    detailModal.setAttribute("aria-hidden", "false");
    detailModal.classList.add("is-open");
  };

  const syncDetailNights = () => {
    if (!detailNightsEl) {
      return;
    }
    const nights = getNightCount(
      getDateFromKey(detailCheckinDateEl?.value),
      getDateFromKey(detailCheckoutDateEl?.value)
    );
    detailNightsEl.textContent =
      typeof nights === "number" ? `${nights}박 ${nights + 1}일` : "-";
  };

  const syncDetailSaveState = () => {
    if (!detailSaveButton || !detailState.initial) {
      return;
    }
    const next = {
      room: getSelectedDetailRoomId(),
      checkinDate: detailCheckinDateEl?.value || "",
      checkoutDate: detailCheckoutDateEl?.value || "",
      checkinTime: detailCheckinTimeEl?.value || "",
      checkoutTime: detailCheckoutTimeEl?.value || "",
      statusKey: detailState.statusKey || "PLANNED",
      memo: detailMemoEl instanceof HTMLTextAreaElement
        ? detailMemoEl.value.trim()
        : detailState.initial.memo || "",
      ...getDetailPickdropFlags(),
    };
    const hasChanges =
      next.room !== (detailState.initial.room || "")
      || next.checkinDate !== detailState.initial.checkinDate
      || next.checkoutDate !== detailState.initial.checkoutDate
      || next.checkinTime !== detailState.initial.checkinTime
      || next.checkoutTime !== detailState.initial.checkoutTime
      || next.statusKey !== (detailState.initial.statusKey || "PLANNED")
      || next.memo !== (detailState.initial.memo || "")
      || next.pickup !== Boolean(detailState.initial.pickup)
      || next.dropoff !== Boolean(detailState.initial.dropoff);
    detailSaveButton.disabled = !hasChanges;
  };

  const saveDetailChanges = () => {
    if (!detailState.reservationId) {
      return;
    }
    const payload = {
      room: getSelectedDetailRoomId(),
      checkinDate: detailCheckinDateEl?.value || "",
      checkoutDate: detailCheckoutDateEl?.value || "",
      checkinTime: detailCheckinTimeEl?.value || "",
      checkoutTime: detailCheckoutTimeEl?.value || "",
      statusKey: detailState.statusKey || "PLANNED",
      memo: detailMemoEl instanceof HTMLTextAreaElement
        ? detailMemoEl.value.trim()
        : "",
      ...getDetailPickdropFlags(),
    };
    reservationState.reservations = reservationStorage.updateReservation(
      detailState.reservationId,
      (item) => {
        const { statusKey, ...nextPayload } = payload;
        const nextDates = buildHotelingDateEntries(
          payload.checkinDate,
          payload.checkoutDate,
          payload.checkinTime,
          payload.checkoutTime
        );
        const usageMap = new Map(
          (Array.isArray(item.dates) ? item.dates : []).map((entry) => [
            `${entry.date}-${entry.kind}`,
            getEntryTicketUsages(entry),
          ])
        );
        return {
          ...item,
          ...nextPayload,
          dates: nextDates.map((entry) => {
            const key = `${entry.date}-${entry.kind}`;
            const nextStatusKey = statusKey;
            return {
              ...entry,
              baseStatusKey: nextStatusKey,
              statusText: getHotelingStatusLabel(nextStatusKey),
              status: getHotelingStatusLabel(nextStatusKey),
              ticketUsages: usageMap.get(key) || [],
              pickup: entry.kind === "checkin" ? payload.pickup : false,
              dropoff: entry.kind === "checkout" ? payload.dropoff : false,
            };
          }),
          hasPickup: Boolean(payload.pickup),
          hasDropoff: Boolean(payload.dropoff),
        };
      }
    );
    detailState.initial = { ...payload };
    syncDetailSaveState();
    refreshCalendarStats();
    renderListForKey(reservationState.selectedDateKey);
    showToast("저장되었습니다.");
    closeDetailModal();
  };

  const renderListForKey = (dateKey) => {
    reservationState.selectedDateKey = dateKey || "";
    const groups = buildHotelingEntriesForDate(
      getFilteredReservations(),
      reservationState.selectedDateKey
    );
    renderHotelingList(
      {
        checkinTable,
        checkoutTable,
        stayTable,
        checkinSection,
        checkoutSection,
        staySection,
        checkinEmptyRow,
        checkoutEmptyRow,
        stayEmptyRow,
        totalCountEl,
        checkinCountEl,
        checkoutCountEl,
        stayCountEl,
        listEmptyEl,
      },
      groups
    );
    syncTableHeaderCheckbox(checkinTable);
    syncTableHeaderCheckbox(checkoutTable);
    syncTableHeaderCheckbox(stayTable);
    syncCancelButtonState();
  };

  const renderListForDate = (date) => {
    const dateKey = getHotelingDateKey(date, timeZone);
    renderListForKey(dateKey);
  };

  const showListCard = () => {
    if (!listCard) {
      return;
    }
    listCard.classList.remove("is-hidden");
    if (layout) {
      layout.classList.remove("is-list-hidden");
    }
    if (listToggle) {
      listToggle.setAttribute("aria-expanded", "true");
      listToggle.setAttribute("aria-label", "호텔링 목록 숨기기");
    }
  };

  if (listCard) {
    listCard.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
        return;
      }
      const table = target.closest(".hoteling-table");
      if (!table) {
        return;
      }
      const refs = getTableCheckboxes(table);
      if (!refs?.headerCheckbox) {
        return;
      }
      if (target === refs.headerCheckbox) {
        refs.rowCheckboxes.forEach((box) => {
          box.checked = target.checked;
        });
        refs.headerCheckbox.indeterminate = false;
        syncCancelButtonState();
        return;
      }
      syncTableHeaderCheckbox(table);
      syncCancelButtonState();
    });

    listCard.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest("[data-hoteling-detail-open]");
      if (!button) {
        return;
      }
      const row = button.closest(".hoteling-table__row--data");
      const reservationId = row?.dataset?.reservationId;
      if (!reservationId) {
        return;
      }
      const reservation = reservationState.reservations.find(
        (item) => item.id === reservationId
      );
      if (!reservation) {
        return;
      }
      openDetailModal(reservation, {
        dateKey: reservationState.selectedDateKey || "",
        kind: row?.dataset?.entryKind || "",
      });
    });
  }

  if (cancelOpenButton) {
    cancelOpenButton.addEventListener("click", () => {
      if (getSelectedReservationIds().length === 0) {
        syncCancelButtonState();
        return;
      }
      openCancelModal();
    });
  }

  if (cancelOverlay) {
    cancelOverlay.addEventListener("click", closeCancelModal);
  }

  if (cancelCloseButtons.length > 0) {
    cancelCloseButtons.forEach((button) => {
      button.addEventListener("click", closeCancelModal);
    });
  }

  if (cancelConfirmButton) {
    cancelConfirmButton.addEventListener("click", () => {
      cancelSelectedReservations();
      closeCancelModal();
    });
  }

  if (detailOverlay) {
    detailOverlay.addEventListener("click", closeDetailModal);
  }

  if (detailCloseButtons.length > 0) {
  detailCloseButtons.forEach((button) => {
    button.addEventListener("click", closeDetailModal);
  });

  detailModal?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const statusTrigger = target?.closest("[data-hoteling-detail-status-trigger]");
    if (statusTrigger && detailStatusTrigger?.contains(statusTrigger)) {
      toggleDetailStatusMenu();
      return;
    }
    const statusOption = target?.closest("[data-hoteling-detail-status-option]");
    if (statusOption && detailStatusMenu?.contains(statusOption)) {
      updateDetailStatusDisplay(statusOption.dataset.hotelingDetailStatusOption || "PLANNED");
      closeDetailStatusMenu();
      syncDetailSaveState();
      return;
    }
    const tabButton = target?.closest("[data-hoteling-detail-tab]");
    if (tabButton && detailModal.contains(tabButton)) {
      setActiveDetailTab(tabButton.dataset.hotelingDetailTab);
      return;
    }
    const roomChip = target?.closest("[data-hoteling-detail-room]");
    if (roomChip && detailRoomChips?.contains(roomChip)) {
      setSelectedChip(
        detailRoomChips,
        detailRoomDataKey,
        roomChip.dataset.hotelingDetailRoom
      );
      syncDetailSaveState();
      return;
    }
    const pickdropChip = target?.closest("[data-hoteling-detail-pickdrop]");
    if (pickdropChip && detailPickdropOptions?.contains(pickdropChip)) {
      pickdropChip.classList.toggle("is-selected");
      syncDetailSaveState();
      return;
    }
    const paymentButton = target?.closest("[data-hoteling-detail-payment-method]");
    if (paymentButton && detailModal.contains(paymentButton)) {
      setPaymentMethod(paymentButton.dataset.hotelingDetailPaymentMethod);
      return;
    }
    if (
      detailStatusMenu
      && !detailStatusMenu.hidden
      && !target?.closest("[data-hoteling-detail-status-menu]")
      && !target?.closest("[data-hoteling-detail-status-trigger]")
    ) {
      closeDetailStatusMenu();
    }
  });
  }

  [
    detailCheckinDateEl,
    detailCheckoutDateEl,
    detailCheckinTimeEl,
    detailCheckoutTimeEl,
    detailMemoEl,
  ]
    .filter(Boolean)
    .forEach((input) => {
      const eventName = input instanceof HTMLTextAreaElement ? "input" : "change";
      input.addEventListener(eventName, () => {
        syncDetailNights();
        syncDetailSaveState();
      });
    });

  if (detailSaveButton) {
    detailSaveButton.addEventListener("click", saveDetailChanges);
  }

  const hotelingCalendar = setupHotelingCalendar({
    gridSelector: "[data-hoteling-calendar-grid]",
    currentLabelSelector: "[data-hoteling-current-month]",
    prevButtonSelector: ".month-button--prev",
    nextButtonSelector: ".month-button--next",
    todayButtonSelector: "[data-hoteling-today]",
    getDateStats: getCalendarStatsForDate,
    onDateSelect: (selectedDate) => {
      if (listDate && selectedDate instanceof Date) {
        const month = selectedDate.getMonth() + 1;
        const day = selectedDate.getDate();
        listDate.textContent = `${month}월 ${day}일`;
      }
      renderListForDate(selectedDate);
      showListCard();
    },
  });

  const initialDate = new Date();
  renderListForDate(initialDate);
  if (listDate) {
    listDate.textContent = `${initialDate.getMonth() + 1}월 ${initialDate.getDate()}일`;
  }

  const reservationOpen = document.querySelector("[data-hoteling-reservation-open]");
  const reservationModal = document.querySelector("[data-hoteling-reservation-modal]");
  const reservationOverlay = document.querySelector("[data-hoteling-reservation-overlay]");
  const reservationClose = document.querySelector("[data-hoteling-reservation-close]");
  const modalGrid = document.querySelector("[data-hoteling-modal-calendar-grid]");
  const modalCurrent = document.querySelector("[data-hoteling-modal-current]");
  const modalPrev = document.querySelector("[data-hoteling-modal-prev]");
  const modalNext = document.querySelector("[data-hoteling-modal-next]");
  const checkinDateEl = document.querySelector("[data-hoteling-checkin-date]");
  const checkoutDateEl = document.querySelector("[data-hoteling-checkout-date]");
  const memberInput = document.querySelector("[data-hoteling-member-input]");
  const memberResults = document.querySelector("[data-hoteling-member-results]");
  const memberClear = document.querySelector("[data-hoteling-member-clear]");
  const hotelingMemoInput = reservationModal?.querySelector("[data-hoteling-memo]");
  const ticketList = document.querySelector("[data-hoteling-tickets]");
  const ticketEmpty = document.querySelector("[data-hoteling-tickets-empty]");
  const hotelingFeeList = document.querySelector("[data-hoteling-fee-list]");
  const hotelingTotalValue = document.querySelector("[data-hoteling-hoteling-total]");
  const pickdropFeeList = document.querySelector("[data-hoteling-pickdrop-fee-list]");
  const pickdropTotalValue = document.querySelector("[data-hoteling-pickdrop-total]");
  const hotelingTotalAll = document.querySelector("[data-hoteling-total]");
  const hotelingFeeStep = reservationModal?.querySelector(".reservation-step--fee.hoteling-fee-card");
  const hotelingFeeSection = hotelingFeeList?.closest(".reservation-fee-section");
  const hotelingFeeCard = reservationModal?.querySelector("[data-hoteling-fee-hoteling]");
  const pickdropFeeCard = reservationModal?.querySelector("[data-hoteling-fee-pickdrop]");
  const pickdropTicketField = reservationModal?.querySelector("[data-hoteling-pickdrop-tickets]");
  const pickdropTicketEmpty = reservationModal?.querySelector("[data-hoteling-pickdrop-tickets-empty]");
  const pickdropInputs = reservationModal?.querySelectorAll("[data-hoteling-pickdrop-option]");
  const submitButton = reservationModal?.querySelector(".hoteling-modal__submit");

  const modalState = {
    currentDate: new Date(),
    checkin: null,
    checkout: null,
    selectedMember: null,
    ticketOptions: [],
    ticketSelections: [],
    pickdropTicketOptions: [],
    pickdropTicketSelections: [],
    pickdrops: new Set(),
    availableRoomIds: null,
    reservationSummary: null,
  };

  const getSelectedTicketMetaElement = (container) =>
    container?.querySelector?.(
      ".reservation-ticket-row.is-selected .reservation-ticket-row__meta"
    );

  const applyTicketMetaAmount = (amountEl, metaEl) => {
    if (!amountEl || !metaEl) {
      return false;
    }
    const clone = metaEl.cloneNode(true);
    const overbooked = Number(clone.dataset.overbooked) || 0;
    const unitLabel = clone.dataset.unitLabel || "회";
    if (overbooked > 0) {
      const overbookEl = document.createElement("span");
      overbookEl.className = "reservation-ticket-row__meta-overbook";
      overbookEl.textContent = `(초과 ${overbooked}${unitLabel})`;
      clone.append(" ", overbookEl);
    }
    amountEl.replaceChildren(clone);
    delete amountEl.dataset.feeAmount;
    return true;
  };

  const hasOverbookedAllocations = (allocations) =>
    Array.from(allocations?.values?.() || []).some(
      (allocation) => Number(allocation?.overbooked) > 0
    );

  const syncSubmitState = () => {
    if (!submitButton) {
      return;
    }
    const hasMember = Boolean(modalState.selectedMember);
    const hasRoom = Boolean(getSelectedRoomId());
    const hasDates = Boolean(modalState.checkin) && Boolean(modalState.checkout);
    submitButton.disabled = !(hasMember && hasRoom && hasDates);
  };

  const formatDateLabel = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "-월 -일";
    }
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  const getDateKey = (date) => getHotelingDateKey(date, timeZone);

  const getDateFromKey = (key) => {
    const parts = getDatePartsFromKey(key);
    if (!parts) {
      return null;
    }
    return new Date(parts.year, parts.month - 1, parts.day);
  };

  const getHotelingScheduleSnapshot = (reservation) => {
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    const checkinEntry = entries.find((entry) => entry?.kind === "checkin");
    const checkoutEntry = entries.find((entry) => entry?.kind === "checkout");
    return {
      checkinDate: checkinEntry?.date || reservation?.checkinDate || "",
      checkoutDate: checkoutEntry?.date || reservation?.checkoutDate || "",
      checkinTime:
        checkinEntry?.checkinTime
        || checkinEntry?.time
        || reservation?.checkinTime
        || "",
      checkoutTime:
        checkoutEntry?.checkoutTime
        || checkoutEntry?.time
        || reservation?.checkoutTime
        || "",
    };
  };

  const getStatusKeyByLabel = (label) => {
    if (label === "입실") {
      return "CHECKIN";
    }
    if (label === "퇴실") {
      return "CHECKOUT";
    }
    return Object.entries(STATUS).find(([, value]) => value === label)?.[0] || "";
  };

  const getHotelingDetailStatus = (reservation, context = {}) => {
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    const dateKey = context?.dateKey || "";
    const kind = context?.kind || "";
    const targetEntry = entries.find((entry) =>
      entry?.date === dateKey && (!kind || entry?.kind === kind)
    ) || entries.find((entry) => entry?.date === dateKey) || entries[0] || null;
    const statusKey = String(
      targetEntry?.baseStatusKey
      || getStatusKeyByLabel(targetEntry?.statusText || "")
      || getStatusKeyByLabel(targetEntry?.status || "")
      || "PLANNED"
    );
    return {
      key: statusKey,
      label: getHotelingStatusLabel(statusKey) || targetEntry?.statusText || targetEntry?.status || "-",
    };
  };

  const getHotelingPickdropFlags = (reservation) => {
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    const hasPickup = entries.some((entry) => entry?.pickup)
      || Boolean(reservation?.hasPickup);
    const hasDropoff = entries.some((entry) => entry?.dropoff)
      || Boolean(reservation?.hasDropoff);
    return { hasPickup, hasDropoff };
  };

  const getNightCount = (checkin, checkout) => {
    const checkinKey = getHotelingDateKey(checkin, timeZone);
    const checkoutKey = getHotelingDateKey(checkout, timeZone);
    if (!checkinKey || !checkoutKey) {
      return null;
    }
    const checkinParts = getDatePartsFromKey(checkinKey);
    const checkoutParts = getDatePartsFromKey(checkoutKey);
    if (!checkinParts || !checkoutParts) {
      return null;
    }
    const checkinDate = new Date(
      Date.UTC(checkinParts.year, checkinParts.month - 1, checkinParts.day)
    );
    const checkoutDate = new Date(
      Date.UTC(checkoutParts.year, checkoutParts.month - 1, checkoutParts.day)
    );
    const diff = Math.round((checkoutDate - checkinDate) / 86400000);
    return Math.max(0, diff);
  };

  const formatFullDateLabel = (dateKey) => {
    const date = getDateFromKey(dateKey);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "-";
    }
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  const formatTimeLabel = (value) => {
    if (!value) {
      return "-";
    }
    const [rawHour, rawMinute] = String(value).split(":");
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return "-";
    }
    const period = hour < 12 ? "오전" : "오후";
    const normalizedHour = ((hour + 11) % 12) + 1;
    const minuteLabel = String(minute).padStart(2, "0");
    return `${period} ${normalizedHour}시 ${minuteLabel}분`;
  };

  const getNightKeys = () =>
    getHotelingNightKeys(modalState.checkin, modalState.checkout, timeZone);

  const getSelectedRoomId = () => {
    if (!reservationModal) {
      return "";
    }
    const selected = reservationModal.querySelector("[data-hoteling-room]:checked");
    return selected ? String(selected.value || "") : "";
  };

  const renderRoomOptions = (availableRoomIds = modalState.availableRoomIds) => {
    renderHotelingRoomOptions(reservationModal, rooms, {
      availableRoomIds,
      selectedRoomId: getSelectedRoomId(),
    });
    if (!reservationModal) {
      return;
    }
    const roomInputs = reservationModal.querySelectorAll("[data-hoteling-room]");
    if (roomInputs.length === 1) {
      const input = roomInputs[0];
      const wasChecked = input.checked;
      input.checked = true;
      syncFilterChip(input);
      if (!wasChecked) {
        syncHotelingFees();
      }
    }
    syncSubmitState();
  };

  const renderHotelingTickets = () => {
    if (!ticketList || !ticketEmpty) {
      return;
    }
    const nightCount = getNightCount(modalState.checkin, modalState.checkout) || 0;
    const optionMap = new Map(
      modalState.ticketOptions.map((option) => [option.id, option])
    );
    const allocationResult = allocateTicketUsage(
      modalState.ticketSelections,
      optionMap,
      nightCount
    );
    renderTicketOptions(
      ticketList,
      ticketEmpty,
      modalState.ticketOptions,
      modalState.ticketSelections,
      allocationResult.allocations,
      Boolean(modalState.selectedMember),
      nightCount,
      new Set()
    );
  };

  const updateRoomsForTickets = () => {
    const roomIds = getHotelingRoomIdsForTickets(
      tickets,
      modalState.ticketOptions,
      modalState.ticketSelections
    );
    modalState.availableRoomIds = roomIds.size > 0 ? roomIds : null;
    renderRoomOptions(modalState.availableRoomIds);
  };

  const applyMemberSelection = (member) => {
    modalState.selectedMember = member || null;
    modalState.ticketSelections = [];
    modalState.ticketOptions = member
      ? getHotelingTicketOptions(tickets, member.tickets)
      : [];
    modalState.pickdropTicketOptions = member
      ? getIssuedTicketOptions(tickets, member.tickets).filter(
          (option) => option.type === "pickdrop"
        )
      : [];
    modalState.pickdropTicketSelections = [];
    renderHotelingTickets();
    updateRoomsForTickets();
    syncHotelingFees();
    renderModalCalendar();
    syncSubmitState();
  };

  const syncHotelingTickets = () => {
    renderHotelingTickets();
  };

  const getPickdropDateCount = () => {
    const hasPickup = modalState.pickdrops.has("pickup");
    const hasDropoff = modalState.pickdrops.has("dropoff");
    const hasCheckin = Boolean(modalState.checkin);
    const hasCheckout = Boolean(modalState.checkout);
    if (hasPickup && hasDropoff) {
      return hasCheckin || hasCheckout ? 1 : 0;
    }
    let count = 0;
    if (hasPickup && hasCheckin) {
      count += 1;
    }
    if (hasDropoff && hasCheckout) {
      count += 1;
    }
    return count;
  };

  const syncHotelingFees = () => {
    if (!hotelingFeeList || !hotelingTotalAll) {
      return;
    }
    const roomId = getSelectedRoomId();
    renderHotelingFeeBreakdown({
      hotelingFeeContainer: hotelingFeeList,
      hotelingTotalEl: hotelingTotalValue,
      totalEl: hotelingTotalAll,
      pricingItems,
      rooms,
      roomId,
      nightKeys: getNightKeys(),
      timeZone,
    });
    const pickdropCount = getPickdropDateCount();
    const pickdropMap = new Map(
      modalState.pickdropTicketOptions.map((option) => [option.id, option])
    );
    modalState.pickdropTicketSelections = modalState.pickdropTicketSelections.filter(
      (id) => pickdropMap.has(id)
    );
    const pickdropLimit = getPickdropReservableTotal(
      modalState.selectedMember?.totalReservableCountByType
    );
    const hasNoPickdropTickets = Number.isFinite(pickdropLimit) && pickdropLimit <= 0;
    if (hasNoPickdropTickets) {
      modalState.pickdropTicketSelections = [];
    }
    const pickdropAllocation = allocateTicketUsage(
      modalState.pickdropTicketSelections,
      pickdropMap,
      pickdropCount
    );
    const nightCount = getNightCount(modalState.checkin, modalState.checkout) || 0;
    const hotelingOptionMap = new Map(
      modalState.ticketOptions.map((option) => [option.id, option])
    );
    const hotelingAllocation = allocateTicketUsage(
      modalState.ticketSelections,
      hotelingOptionMap,
      nightCount
    );
    renderPricingBreakdown({
      schoolFeeContainer: null,
      pickdropFeeContainer: pickdropFeeList,
      schoolTotalEl: null,
      pickdropTotalEl: pickdropTotalValue,
      totalEl: hotelingTotalAll,
      pricingItems,
      classes,
      services: new Set(),
      pickdrops: modalState.pickdrops,
      dateCount: pickdropCount,
      serviceDateCount: 0,
      pickdropDateCount: pickdropCount,
      selectedWeekdayCounts: new Map(),
      memberWeight: modalState.selectedMember?.weight,
    });
    renderPickdropTickets(
      pickdropTicketField,
      modalState.pickdropTicketOptions,
      modalState.pickdropTicketSelections,
      pickdropAllocation.allocations,
      Boolean(modalState.selectedMember),
      true,
      pickdropTicketEmpty,
      hasNoPickdropTickets || pickdropCount === 0
    );
    if (hotelingFeeCard) {
      hotelingFeeCard.classList.toggle(
        "is-overbooked",
        hasOverbookedAllocations(hotelingAllocation.allocations)
      );
    }
    if (pickdropFeeCard) {
      pickdropFeeCard.classList.toggle(
        "is-overbooked",
        hasOverbookedAllocations(pickdropAllocation.allocations)
      );
    }
    const hasTicketSelection = modalState.ticketSelections.length > 0;
    const hasPickdropSelection = modalState.pickdropTicketSelections.length > 0;
    if (hotelingFeeCard) {
      hotelingFeeCard.classList.remove("is-disabled");
    }
    if (pickdropFeeCard) {
      pickdropFeeCard.classList.remove("is-disabled");
    }
    if (hotelingFeeSection) {
      hotelingFeeSection.classList.toggle("is-disabled", hasTicketSelection);
    }
    if (hotelingFeeStep && hasTicketSelection) {
      const metaElement = getSelectedTicketMetaElement(ticketList);
      const hotelingAmount = hotelingFeeCard
        ?.querySelector(".reservation-fee-card__amount");
      if (metaElement) {
        applyTicketMetaAmount(hotelingAmount, metaElement);
        applyTicketMetaAmount(hotelingTotalValue, metaElement);

        const usage = modalState.ticketSelections.reduce((sum, id) => {
          const alloc = hotelingAllocation.allocations.get(id);
          return sum + (Number(alloc?.remainingBefore || 0) - Number(alloc?.remainingAfter || 0));
        }, 0);
        const total = modalState.selectedMember?.totalReservableCountByType?.hoteling;
        const fallbackBefore = modalState.ticketSelections.reduce((sum, id) => {
          const alloc = hotelingAllocation.allocations.get(id);
          return sum + (Number(alloc?.remainingBefore) || 0);
        }, 0);
        const realBefore = Number.isFinite(Number(total)) ? Number(total) : fallbackBefore;

        const updateValues = (el) => {
          if (!el) return;
          const vals = el.querySelectorAll(".reservation-ticket-row__meta-value");
          if (vals.length >= 2) {
            vals[0].textContent = `${realBefore}박`;
            vals[1].textContent = `${realBefore - usage}박`;
            vals[0].classList.toggle("is-low", realBefore <= 2);
            vals[1].classList.toggle("is-low", (realBefore - usage) <= 2);
          }
        };
        updateValues(hotelingAmount);
        updateValues(hotelingTotalValue);
      }
    }
    if (hotelingFeeStep && hasPickdropSelection) {
      const metaElement = getSelectedTicketMetaElement(pickdropTicketField);
      if (metaElement) {
        applyTicketMetaAmount(pickdropTotalValue, metaElement);

        const usage = modalState.pickdropTicketSelections.reduce((sum, id) => {
          const alloc = pickdropAllocation.allocations.get(id);
          return sum + (Number(alloc?.remainingBefore || 0) - Number(alloc?.remainingAfter || 0));
        }, 0);
        const total = getPickdropReservableTotal(
          modalState.selectedMember?.totalReservableCountByType
        );
        const fallbackBefore = modalState.pickdropTicketSelections.reduce((sum, id) => {
          const alloc = pickdropAllocation.allocations.get(id);
          return sum + (Number(alloc?.remainingBefore) || 0);
        }, 0);
        const realBefore = Number.isFinite(Number(total)) ? Number(total) : fallbackBefore;

        const updateValues = (el) => {
          if (!el) return;
          const vals = el.querySelectorAll(".reservation-ticket-row__meta-value");
          if (vals.length >= 2) {
            vals[0].textContent = `${realBefore}회`;
            vals[1].textContent = `${realBefore - usage}회`;
            vals[0].classList.toggle("is-low", realBefore <= 2);
            vals[1].classList.toggle("is-low", (realBefore - usage) <= 2);
          }
        };
        updateValues(pickdropTotalValue);
      }
    }
    syncReservationFeeTotal(reservationModal, hotelingTotalAll);
  };

  const buildModalCells = (viewDate) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];

    for (let i = firstDay - 1; i >= 0; i -= 1) {
      const day = prevMonthDays - i;
      cells.push({
        day,
        date: new Date(year, month - 1, day),
        muted: true,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        day,
        date: new Date(year, month, day),
        muted: false,
      });
    }

    const totalCells = cells.length;
    const trailing = (7 - (totalCells % 7)) % 7;

    for (let day = 1; day <= trailing; day += 1) {
      cells.push({
        day,
        date: new Date(year, month + 1, day),
        muted: true,
      });
    }

    return { year, month, cells };
  };

  const appendCalendarMark = (cell, iconName, alt, className = "") => {
    if (!cell) {
      return;
    }
    const icon = document.createElement("img");
    icon.className = className
      ? `hoteling-calendar__mark ${className}`
      : "hoteling-calendar__mark";
    icon.src = `/assets/${iconName}`;
    icon.alt = alt;
    cell.appendChild(icon);
  };

  const renderModalCalendar = () => {
    if (!modalGrid || !modalCurrent) {
      return;
    }
    const { year, month, cells } = buildModalCells(modalState.currentDate);
    modalCurrent.textContent = `${year}년 ${month + 1}월`;
    modalGrid.innerHTML = "";

    const checkinKey = modalState.checkin ? getDateKey(modalState.checkin) : "";
    const checkoutKey = modalState.checkout ? getDateKey(modalState.checkout) : "";
    const summary = getMemberHotelingReservationSummary(
      reservationState.reservations,
      modalState.selectedMember
    );
    modalState.reservationSummary = summary;
    const nextCheckinKey = checkinKey
      ? getNextHotelingCheckinKey(checkinKey, summary.checkinKeys)
      : "";

    cells.forEach((cellData) => {
      const cell = document.createElement("div");
      cell.className = "mini-calendar__cell";
      if (cellData.muted) {
        cell.classList.add("mini-calendar__cell--muted");
      }
      const dateKey = getDateKey(cellData.date);
      cell.dataset.date = dateKey;

      const dateLabel = document.createElement("span");
      dateLabel.className = "mini-calendar__date";
      dateLabel.textContent = String(cellData.day);
      cell.appendChild(dateLabel);

      const isDisabled = isHotelingDateDisabled({
        dateKey,
        reservedKeys: summary.reservedKeys,
        checkinKeys: summary.checkinKeys,
        checkoutKeys: summary.checkoutKeys,
        checkinKey,
        checkoutKey,
        nextCheckinKey,
      });
      if (isDisabled) {
        cell.classList.add("mini-calendar__cell--disabled");
        cell.setAttribute("aria-disabled", "true");
      }

      const isExistingCheckin = summary.checkinKeys.has(dateKey);
      const isExistingCheckout = summary.checkoutKeys.has(dateKey);
      const hasCheckinMark = Boolean(dateKey)
        && (isExistingCheckin || (dateKey === checkinKey && !isExistingCheckin));
      const hasCheckoutMark = Boolean(dateKey)
        && (isExistingCheckout || (dateKey === checkoutKey && !isExistingCheckout));
      const getReservedMarkClass = (isReserved) =>
        isReserved ? "hoteling-calendar__mark--reserved" : "";
      const mergeMarkClass = (...classes) => classes.filter(Boolean).join(" ");

      if (hasCheckinMark && hasCheckoutMark) {
        appendCalendarMark(
          cell,
          "iconCheckout.svg",
          "?댁떎",
          mergeMarkClass(
            "hoteling-calendar__mark--stacked",
            "hoteling-calendar__mark--checkout",
            getReservedMarkClass(isExistingCheckout)
          )
        );
        appendCalendarMark(
          cell,
          "iconCheckin.svg",
          "?낆떎",
          mergeMarkClass(
            "hoteling-calendar__mark--stacked",
            "hoteling-calendar__mark--checkin",
            getReservedMarkClass(isExistingCheckin)
          )
        );
      } else if (hasCheckinMark) {
        appendCalendarMark(
          cell,
          "iconCheckin.svg",
          "?낆떎",
          getReservedMarkClass(isExistingCheckin)
        );
      } else if (hasCheckoutMark) {
        appendCalendarMark(
          cell,
          "iconCheckout.svg",
          "?댁떎",
          getReservedMarkClass(isExistingCheckout)
        );
      }

      modalGrid.appendChild(cell);
    });

    if (checkinDateEl) {
      checkinDateEl.textContent = formatDateLabel(modalState.checkin);
    }
    if (checkoutDateEl) {
      checkoutDateEl.textContent = formatDateLabel(modalState.checkout);
    }
    syncHotelingTickets();
    syncHotelingFees();
    syncSubmitState();
  };

  const renderMemberResults = () => {
    renderMemberSearchResults({
      memberInput,
      memberResults,
      members: loadIssueMembers(),
      onSelect: (member) => {
        applyMemberSelection(member);
        if (memberInput) {
          memberInput.value = `${member.dogName} / ${member.owner}`;
        }
        if (memberResults) {
          memberResults.innerHTML = "";
          memberResults.classList.remove("is-open");
        }
      },
    });
  };

  applyMemberSelection(null);

  const resetModalState = () => {
    const now = new Date();
    modalState.currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    modalState.checkin = null;
    modalState.checkout = null;
    modalState.availableRoomIds = null;
    modalState.pickdrops = new Set();
    const checkinTimeInput = reservationModal?.querySelector(
      "[data-hoteling-checkin-time]"
    );
    if (checkinTimeInput) {
      checkinTimeInput.value = "10:00";
    }
    const checkoutTimeInput = reservationModal?.querySelector(
      "[data-hoteling-checkout-time]"
    );
    if (checkoutTimeInput) {
      checkoutTimeInput.value = "10:00";
    }
    if (memberInput) {
      memberInput.value = "";
    }
    if (memberResults) {
      memberResults.innerHTML = "";
      memberResults.classList.remove("is-open");
    }
    if (hotelingMemoInput instanceof HTMLTextAreaElement) {
      hotelingMemoInput.value = "";
    }
    if (pickdropInputs && pickdropInputs.length) {
      pickdropInputs.forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.checked = false;
          syncFilterChip(input);
        }
      });
    }
    if (reservationModal) {
      reservationModal
        .querySelectorAll("[data-hoteling-room]")
        .forEach((input) => {
          if (input instanceof HTMLInputElement) {
            input.checked = false;
            syncFilterChip(input);
          }
        });
    }
    applyMemberSelection(null);
    renderModalCalendar();
    syncSubmitState();
  };

  const openModal = () => {
    if (!reservationModal) {
      return;
    }
    reservationModal.classList.add("is-open");
    reservationModal.setAttribute("aria-hidden", "false");
    resetModalState();
  };

  const openModalFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("hotelingReservation") !== "open") {
      return;
    }
    const memberId = params.get("memberId");
    openModal();
    if (memberId) {
      const member = loadIssueMembers().find(
        (item) => String(item.id) === String(memberId)
      );
      if (member) {
        applyMemberSelection(member);
        if (memberInput) {
          memberInput.value = `${member.dogName} / ${member.owner}`;
        }
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("hotelingReservation");
    url.searchParams.delete("memberId");
    window.history.replaceState({}, "", url.toString());
  };

  const closeModal = () => {
    if (!reservationModal) {
      return;
    }
    reservationModal.classList.remove("is-open");
    reservationModal.setAttribute("aria-hidden", "true");
  };

  if (reservationOpen) {
    reservationOpen.addEventListener("click", openModal);
  }

  if (reservationOverlay) {
    reservationOverlay.addEventListener("click", closeModal);
  }

  if (reservationClose) {
    reservationClose.addEventListener("click", closeModal);
  }

  openModalFromQuery();

  if (modalPrev) {
    modalPrev.addEventListener("click", () => {
      const current = modalState.currentDate;
      modalState.currentDate = new Date(
        current.getFullYear(),
        current.getMonth() - 1,
        1
      );
      renderModalCalendar();
    });
  }

  if (modalNext) {
    modalNext.addEventListener("click", () => {
      const current = modalState.currentDate;
      modalState.currentDate = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        1
      );
      renderModalCalendar();
    });
  }

  if (modalGrid) {
    modalGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const cell = target.closest("[data-date]");
      if (!cell || !modalGrid.contains(cell)) {
        return;
      }
      if (cell.classList.contains("mini-calendar__cell--disabled")) {
        return;
      }
      const value = cell.getAttribute("data-date");
      if (!value) {
        return;
      }
      const summary = modalState.reservationSummary;
      const reservedCheckin = Boolean(summary?.checkinKeys?.has?.(value));
      const reservedCheckout = Boolean(summary?.checkoutKeys?.has?.(value));
      const nextDate = getDateFromKey(value);
      if (!nextDate) {
        return;
      }
      const isSelectingCheckin = !modalState.checkin || Boolean(modalState.checkout);
      const isSelectingCheckout = Boolean(modalState.checkin) && !modalState.checkout;
      if (isSelectingCheckin && reservedCheckin && !reservedCheckout) {
        return;
      }
      if (isSelectingCheckout && reservedCheckout && !reservedCheckin) {
        return;
      }
      const nextKey = getDateKey(nextDate);
      const checkinKey = modalState.checkin ? getDateKey(modalState.checkin) : "";
      if (modalState.checkin && !modalState.checkout) {
        if (nextKey && nextKey === checkinKey) {
          return;
        }
        if (nextKey && checkinKey && nextKey < checkinKey) {
          modalState.checkin = nextDate;
          modalState.checkout = null;
          renderModalCalendar();
          return;
        }
      }
      if (!modalState.checkin || (modalState.checkin && modalState.checkout)) {
        modalState.checkin = nextDate;
        modalState.checkout = null;
      } else {
        modalState.checkout = nextDate;
      }
      renderModalCalendar();
    });
  }

  if (memberInput) {
    memberInput.addEventListener("input", () => {
      renderMemberResults();
      memberResults?.classList.add("is-open");
    });
    memberInput.addEventListener("focus", () => {
      renderMemberResults();
      memberResults?.classList.add("is-open");
    });
    memberInput.addEventListener("blur", () => {
      setTimeout(() => {
        memberResults?.classList.remove("is-open");
      }, 100);
    });
  }
  memberClear?.addEventListener("click", () => {
    if (memberInput) {
      memberInput.value = "";
    }
    applyMemberSelection(null);
    memberResults?.classList.remove("is-open");
  });

  reservationModal?.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) {
      return;
    }
    if (input.matches("[data-hoteling-pickdrop-option]")) {
      if (input.checked) {
        modalState.pickdrops.add(input.value);
      } else {
        modalState.pickdrops.delete(input.value);
      }
      syncFilterChip(input);
      syncHotelingFees();
      return;
    }
    if (input.matches("[data-reservation-ticket]")) {
      if (pickdropTicketField?.contains(input)) {
        const ticketId = input.value;
        if (input.checked) {
          if (!modalState.pickdropTicketSelections.includes(ticketId)) {
            modalState.pickdropTicketSelections.push(ticketId);
          }
        } else {
          modalState.pickdropTicketSelections = modalState.pickdropTicketSelections.filter(
            (id) => id !== ticketId
          );
        }
        syncHotelingFees();
        return;
      }
      const ticketId = input.value;
      if (input.checked) {
        if (!modalState.ticketSelections.includes(ticketId)) {
          modalState.ticketSelections.push(ticketId);
        }
      } else {
        modalState.ticketSelections = modalState.ticketSelections.filter(
          (id) => id !== ticketId
        );
      }
      syncHotelingTickets();
      updateRoomsForTickets();
      syncHotelingFees();
      return;
    }
    if (input.matches("[data-hoteling-room]")) {
      reservationModal
        ?.querySelectorAll?.("[data-hoteling-room]")
        ?.forEach?.((roomInput) => {
          syncFilterChip(roomInput);
        });
      syncHotelingFees();
      syncSubmitState();
    }
  });

  const pickdropStart = document.querySelector("[data-hoteling-pickdrop-start]");
  if (pickdropStart) {
    pickdropStart.addEventListener("click", (event) => {
      event.stopPropagation();
      const memberId = modalState.selectedMember?.id;
      if (!memberId) {
        return;
      }
      closeModal();
      reservationModalController?.openPickdropModal?.(memberId, { context: "hoteling" });
    });
  }

    if (reservationModal) {
      reservationModal.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(".hoteling-modal__submit")) return;

        const formData = collectHotelingReservationFormData(reservationModal, modalState);
        const { checkinDate, checkoutDate, checkinTime, checkoutTime } = formData;
        if (!formData.room || !checkinDate || !checkoutDate) {
            return;
        }

        // Build the new unified reservation object
        const newReservation = {
            id: createId(), // Assuming createId is available or imported
            type: 'hoteling',
            dogName: formData.dogName,
            owner: formData.owner,
            breed: formData.breed,
            room: formData.room,
            memo: formData.memo,
            dates: buildHotelingDateEntries(checkinDate, checkoutDate, checkinTime, checkoutTime),
        };
        const hasPickup = modalState.pickdrops.has("pickup");
        const hasDropoff = modalState.pickdrops.has("dropoff");
        newReservation.hasPickup = hasPickup;
        newReservation.hasDropoff = hasDropoff;
        newReservation.dates = newReservation.dates.map((entry) => ({
          ...entry,
          pickup: entry.kind === "checkin" ? hasPickup : false,
          dropoff: entry.kind === "checkout" ? hasDropoff : false,
        }));

        const nights = getNightCount(modalState.checkin, modalState.checkout) || 0;
        
        // Logic for applying tickets remains similar, but will be applied to the new object
        let dateTicketUsageMap = null;
        if (modalState.selectedMember?.id && modalState.ticketSelections.length > 0 && nights > 0) {
            const optionMap = new Map(modalState.ticketOptions.map(o => [o.id, o]));
            const allocationResult = allocateTicketUsage(modalState.ticketSelections, optionMap, nights);
            const nightKeys = getNightKeys();
            dateTicketUsageMap = buildDateTicketUsageMap(nightKeys, modalState.ticketSelections, allocationResult.allocations, optionMap);

            newReservation.dates.forEach(entry => {
                if (dateTicketUsageMap.has(entry.date)) {
                    const usage = dateTicketUsageMap.get(entry.date);
                    entry.ticketUsages = usage ? [usage] : [];
                }
            });
        }
        
        reservationStorage.addReservation(newReservation);
        allReservations.push(newReservation);
        reservationState.reservations = allReservations.filter(r => r.type === 'hoteling');
        refreshCalendarStats();

        // Recalculate counts which is now handled by applyReservationToMemberTickets
        const usageMap = buildTicketUsageCountMap(newReservation.dates);
        if (modalState.selectedMember?.id && nights > 0) {
            applyReservationToMember(modalState.selectedMember.id, nights, "hoteling");
        }
        if (modalState.selectedMember?.id && hasPickup && hasDropoff) {
            applyReservationToMember(modalState.selectedMember.id, 1, "roundtrip");
        } else if (modalState.selectedMember?.id && (hasPickup || hasDropoff)) {
            applyReservationToMember(modalState.selectedMember.id, 1, "oneway");
        }
        if (modalState.selectedMember?.id && usageMap.size > 0) {
            applyReservationToMemberTickets(modalState.selectedMember.id, usageMap);
        }

        if (reservationState.selectedDateKey) {
            renderListForKey(reservationState.selectedDateKey);
        }
        resetModalState();
        closeModal();
        showToast("예약이 등록되었습니다.");
      });
    }
});
