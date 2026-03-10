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
import { setupReservationFeeDropdowns } from "../utils/reservation-fee-dropdown.js";
import { renderSelectableChips, setSelectedChip } from "../components/selection-chips.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import { formatTicketPrice } from "../services/ticket-service.js";
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
  getMemberRoomHotelingReservationSummary,
} from "../services/member-reservation-summary.js";
import {
  allocateTicketUsage,
  buildPickdropUsagePlan,
  getIssuedTicketOptions,
} from "../services/ticket-reservation-service.js";
import { repairReservationPickdropUsages } from "../services/pickdrop-usage-repair-service.js";
import { buildPickdropRepairContext } from "../services/pickdrop-detail-sync.js";
import {
  buildDateTicketUsageMap,
  buildDateTicketUsagesMap,
  buildTicketUsageCountMap,
  buildTicketUsageEntries,
  getEntryTicketUsages,
  mergeTicketUsagesForDate,
  buildTicketUsageMapFromEntries,
  mergeTicketUsageCountMap,
} from "../services/ticket-usage-service.js";
import { initState } from "../services/state.js";
import { setupReservationModal } from "./reservation.js";
import { getDatePartsFromKey } from "../utils/date.js";
import { getTimeZone } from "../utils/timezone.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { createId } from "../utils/id.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import { getPickdropReservableTotal } from "../services/pickdrop-policy.js";
import {
  PAYMENT_METHODS,
  parsePaymentAmount,
  normalizeReservationPayment,
  shouldClearTicketPaymentOnCancellation,
} from "../services/reservation-payment.js";
import {
  buildReservationWithBilling,
  sumBillingAllocationsExpected,
} from "../services/reservation-billing.js";
import {
  getReservationPaymentStatus,
} from "../services/reservation-payment-status.js";

document.addEventListener("DOMContentLoaded", () => {
  const timeZone = getTimeZone();
  const reservationStorage = initReservationStorage();
  const roomStorage = initHotelRoomStorage();
  const ticketStorage = initTicketStorage();
  const pricingStorage = initPricingStorage();
  const classStorage = initClassStorage();

  const allReservations = reservationStorage.loadReservations();
  const sidebarReservationBadges = setupSidebarReservationBadges({
    storage: reservationStorage,
    timeZone,
  });

  const rooms = roomStorage.ensureDefaults();
  const getTotalRoomCapacity = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, room) => {
      const value = Number(room?.capacity);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  const tickets = ticketStorage.ensureDefaults();
  ensureMemberDefaults();
  const classes = classStorage.ensureDefaults();
  const repairHotelingBillingIfNeeded = () => {
    const pricingItems = pricingStorage.loadPricingItems();
    if (!Array.isArray(pricingItems) || pricingItems.length === 0) {
      return;
    }
    const members = loadIssueMembers();
    let changed = false;
    const repairedReservations = allReservations.map((reservation) => {
      if (reservation?.type !== "hoteling") {
        return reservation;
      }
      const expected = Number(reservation?.billing?.totals?.expected);
      const charges = Array.isArray(reservation?.billing?.charges)
        ? reservation.billing.charges
        : [];
      const allocationsExpected = sumBillingAllocationsExpected(reservation?.billing);
      const hasEmptyBilling =
        charges.length === 0
        && allocationsExpected === 0
        && (!Number.isFinite(expected) || expected === 0);
      if (!hasEmptyBilling) {
        return reservation;
      }
      const memberId = String(reservation?.memberId || "").trim();
      const member = members.find(
        (item) => String(item?.id || "") === memberId
      ) || null;
      const parsedWeight = Number(member?.weight);
      const memberWeight = Number.isFinite(parsedWeight) ? parsedWeight : null;
      const rebuilt = buildReservationWithBilling(reservation, {
        pricingItems,
        memberWeight,
        timeZone,
        payment: reservation.payment,
      });
      const rebuiltExpected = Number(rebuilt?.billing?.totals?.expected);
      if (Number.isFinite(rebuiltExpected) && rebuiltExpected > 0) {
        changed = true;
        return rebuilt;
      }
      return reservation;
    });
    if (!changed) {
      return;
    }
    const saved = reservationStorage.saveReservations(repairedReservations);
    allReservations.splice(0, allReservations.length, ...saved);
  };
  repairHotelingBillingIfNeeded();
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
  const paymentFilterState = {
    options: [
      { value: "paid", label: "완료" },
      { value: "unpaid", label: "미결제" },
    ],
    selected: new Set(["paid", "unpaid"]),
  };

  const formatFilterButtonLabel = (selectedValues, options, allLabel, labelMap = null) => {
    const selected = Array.isArray(selectedValues) ? selectedValues : [];
    const total = Array.isArray(options) ? options.length : 0;
    if (total === 0 || selected.length === total) {
      return allLabel;
    }
    const labels = selected.map((value) => labelMap?.get(value) || value);
    if (labels.length === 1) {
      return labels[0];
    }
    if (labels.length > 1) {
      const sorted = [...labels].sort((a, b) => a.localeCompare(b, "ko"));
      return `${sorted[0]} 외 ${labels.length - 1}`;
    }
    return allLabel;
  };

  const setupHotelingFilterPanel = (roomsList, onChange) => {
    const panel = document.querySelector(".filter-panel-wrap");
    if (!panel) {
      return;
    }
    const toggle = panel.querySelector("[data-filter-toggle]");
    const body = panel.querySelector("[data-filter-panel-body]");
    const roomMenu = panel.querySelector("[data-filter-menu='room']");
    const roomButton = panel.querySelector("[data-filter-button='room']");
    const paymentMenu = panel.querySelector("[data-filter-menu='payment']");
    const paymentButton = panel.querySelector("[data-filter-button='payment']");
    const badge = panel.querySelector("[data-filter-badge]");
    if (!roomMenu || !roomButton || !paymentMenu || !paymentButton) {
      return;
    }

    const roomOptions = (Array.isArray(roomsList) ? roomsList : [])
      .map((room) => room?.name)
      .filter((name) => typeof name === "string" && name.trim().length > 0);
    const options = roomOptions.length ? roomOptions : ["호실"];
    roomFilterState.options = options.slice();
    roomFilterState.selected = new Set(options);
    const selectedRoomMap = {};
    options.forEach((name) => {
      selectedRoomMap[name] = true;
    });

    const selectedPaymentMap = {};
    paymentFilterState.options.forEach(({ value }) => {
      selectedPaymentMap[value] = true;
    });

    const roomLabelMap = new Map(options.map((name) => [name, name]));
    const paymentLabelMap = new Map(
      paymentFilterState.options.map((item) => [item.value, item.label])
    );

    const closeMenu = (menu, button) => {
      if (!menu || !button) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    };

    const closeAllMenus = () => {
      closeMenu(roomMenu, roomButton);
      closeMenu(paymentMenu, paymentButton);
    };

    const openExclusiveMenu = (menu, button) => {
      const isOpen = menu.hasAttribute("hidden") === false;
      closeAllMenus();
      if (!isOpen) {
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
      }
    };

    const renderRoomMenu = () => {
      roomMenu.innerHTML = "";
      options.forEach((name) => {
        const label = document.createElement("label");
        label.className = "menu-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = name;
        input.checked = selectedRoomMap[name] !== false;
        input.setAttribute("data-room-filter", "");
        const text = document.createElement("div");
        const title = document.createElement("div");
        title.className = "menu-option__title";
        title.textContent = name;
        text.appendChild(title);
        label.appendChild(input);
        label.appendChild(text);
        label.classList.toggle("is-selected", input.checked);
        roomMenu.appendChild(label);
      });
    };

    const renderPaymentMenu = () => {
      paymentMenu.innerHTML = "";
      paymentFilterState.options.forEach(({ value, label: labelText }) => {
        const label = document.createElement("label");
        label.className = "menu-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = value;
        input.checked = selectedPaymentMap[value] !== false;
        input.setAttribute("data-payment-filter", "");
        const title = document.createElement("span");
        title.className = "menu-option__title";
        title.textContent = labelText;
        label.appendChild(input);
        label.appendChild(title);
        label.classList.toggle("is-selected", input.checked);
        paymentMenu.appendChild(label);
      });
    };

    const updateSummary = (skipChange = false) => {
      const selectedRooms = Object.keys(selectedRoomMap).filter((key) => selectedRoomMap[key] !== false);
      const selectedPayments = Object.keys(selectedPaymentMap).filter((key) => selectedPaymentMap[key] !== false);

      roomButton.textContent = formatFilterButtonLabel(
        selectedRooms,
        options,
        "전체 호실",
        roomLabelMap
      );
      paymentButton.textContent = formatFilterButtonLabel(
        selectedPayments,
        paymentFilterState.options.map((item) => item.value),
        "결제 여부",
        paymentLabelMap
      );

      if (badge) {
        let activeCount = 0;
        if (selectedRooms.length !== options.length) {
          activeCount += 1;
        }
        if (selectedPayments.length !== paymentFilterState.options.length) {
          activeCount += 1;
        }
        badge.textContent = String(activeCount);
        badge.hidden = activeCount === 0;
      }

      roomFilterState.selected = new Set(selectedRooms);
      paymentFilterState.selected = new Set(selectedPayments);

      if (!skipChange && typeof onChange === "function") {
        onChange();
      }
    };

    renderRoomMenu();
    renderPaymentMenu();
    updateSummary(true);
    if (body) {
      body.hidden = true;
    }
    closeAllMenus();

    toggle?.addEventListener("click", () => {
      const isOpen = body?.hasAttribute("hidden") === false;
      if (body) {
        body.hidden = isOpen;
      }
      toggle.setAttribute("aria-expanded", String(!isOpen));
      if (isOpen) {
        closeAllMenus();
      }
    });

    panel.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }

      const roomDropdownButton = target.closest("[data-filter-button='room']");
      if (roomDropdownButton) {
        openExclusiveMenu(roomMenu, roomButton);
        return;
      }

      const paymentDropdownButton = target.closest("[data-filter-button='payment']");
      if (paymentDropdownButton) {
        openExclusiveMenu(paymentMenu, paymentButton);
        return;
      }

      const resetButton = target.closest("[data-filter-reset]");
      if (resetButton) {
        options.forEach((name) => {
          selectedRoomMap[name] = true;
        });
        paymentFilterState.options.forEach(({ value }) => {
          selectedPaymentMap[value] = true;
        });
        renderRoomMenu();
        renderPaymentMenu();
        updateSummary();
      }
    });

    panel.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      if (input.matches("[data-room-filter]")) {
        selectedRoomMap[input.value] = input.checked;
        const hasActive = Object.values(selectedRoomMap).some(Boolean);
        if (!hasActive) {
          selectedRoomMap[input.value] = true;
          input.checked = true;
        }
        input.closest(".menu-option")?.classList.toggle("is-selected", input.checked);
        updateSummary();
        return;
      }

      if (input.matches("[data-payment-filter]")) {
        selectedPaymentMap[input.value] = input.checked;
        const hasActive = Object.values(selectedPaymentMap).some(Boolean);
        if (!hasActive) {
          selectedPaymentMap[input.value] = true;
          input.checked = true;
        }
        input.closest(".menu-option")?.classList.toggle("is-selected", input.checked);
        updateSummary();
      }
    });

    document.addEventListener("click", (event) => {
      if (!panel.contains(event.target)) {
        closeAllMenus();
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
    const selectedRooms = roomFilterState.selected;
    const totalRooms = roomFilterState.options.length;
    const selectedPayments = paymentFilterState.selected;
    const totalPayments = paymentFilterState.options.length;

    return reservationState.reservations.filter((item) => {
      const roomMatched = !selectedRooms
        || selectedRooms.size === 0
        || selectedRooms.size === totalRooms
        || selectedRooms.has(getRoomNameFromReservation(item));
      if (!roomMatched) {
        return false;
      }

      const paymentStatus = getReservationPaymentStatus(item);
      const paymentMatched = !selectedPayments
        || selectedPayments.size === 0
        || selectedPayments.size === totalPayments
        || selectedPayments.has(paymentStatus);

      return paymentMatched;
    });
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

  const onFilterChange = () => {
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

  setupHotelingFilterPanel(rooms, onFilterChange);

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
  const detailDeleteButton = document.querySelector("[data-hoteling-detail-delete]");
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
  const detailPaymentAmountRow = document.querySelector(
    "[data-hoteling-detail-payment-amount-row]"
  );
  const detailPaymentAmountInput = document.querySelector(
    "[data-hoteling-detail-payment-amount]"
  );
  const detailTotalAmount = document.querySelector("[data-hoteling-detail-total]");
  const detailFeeLines = document.querySelector("[data-hoteling-detail-fee-lines]");
  const detailPaymentTotal = document.querySelector("[data-hoteling-detail-payment-total]");
  const detailBalanceRow = document.querySelector("[data-hoteling-detail-fee-balance-row]");
  const detailBalanceTotal = document.querySelector("[data-hoteling-detail-fee-balance-total]");
  const headerBadgeValue = document.querySelector(".hoteling-header__badge-value");

  const detailState = {
    reservationId: "",
    initial: null,
    statusKey: "PLANNED",
    statusDateKey: "",
    statusKind: "",
  };
  let activePaymentMethod = "";
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

  const listTimePicker = document.createElement("input");
  listTimePicker.type = "time";
  listTimePicker.className = "hoteling-time-editor";
  listTimePicker.setAttribute("aria-label", "시간 선택");
  listTimePicker.style.position = "fixed";
  listTimePicker.style.left = "0";
  listTimePicker.style.top = "0";
  document.body.appendChild(listTimePicker);

  let activeTimeEdit = null;

  const closeListTimePicker = () => {
    activeTimeEdit = null;
  };

  const updateListEntryTime = ({ reservationId, entryDate, entryKind, nextTime }) => {
    if (!reservationId || !entryDate || (entryKind !== "checkin" && entryKind !== "checkout")) {
      return;
    }
    reservationState.reservations = reservationStorage.updateReservation(
      reservationId,
      (item) => ({
        ...item,
        dates: (Array.isArray(item?.dates) ? item.dates : []).map((entry) => {
          if (entry?.date !== entryDate || entry?.kind !== entryKind) {
            return entry;
          }
          if (entryKind === "checkin") {
            return {
              ...entry,
              checkinTime: nextTime || null,
              time: nextTime || null,
            };
          }
          return {
            ...entry,
            checkoutTime: nextTime || null,
            time: nextTime || null,
          };
        }),
      })
    );
    renderListForKey(reservationState.selectedDateKey);
  };

  const openListTimePicker = ({ cell, reservationId, entryDate, entryKind }) => {
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    if (!reservationId || !entryDate || (entryKind !== "checkin" && entryKind !== "checkout")) {
      return;
    }
    if (activeTimeEdit) {
      const nextTime = listTimePicker.value || activeTimeEdit.previousValue || "";
      if (nextTime && nextTime !== activeTimeEdit.previousValue) {
        updateListEntryTime({
          reservationId: activeTimeEdit.reservationId,
          entryDate: activeTimeEdit.entryDate,
          entryKind: activeTimeEdit.entryKind,
          nextTime,
        });
      }
      closeListTimePicker();
    }
    const currentValue = (cell.textContent || "").trim();
    const initialValue = /^\d{2}:\d{2}$/.test(currentValue) ? currentValue : "10:00";
    activeTimeEdit = {
      reservationId,
      entryDate,
      entryKind,
      previousValue: initialValue,
    };
    listTimePicker.value = initialValue;
    const rect = cell.getBoundingClientRect();
    const nextLeft = Math.max(8, Math.round(rect.left));
    const nextTop = Math.max(8, Math.round(rect.bottom + 6));
    listTimePicker.style.left = `${nextLeft}px`;
    listTimePicker.style.top = `${nextTop}px`;
    listTimePicker.focus();
    if (typeof listTimePicker.showPicker === "function") {
      try {
        listTimePicker.showPicker();
      } catch (error) {
        // Some browsers block programmatic picker open without direct gesture.
      }
    }
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

  const clearTicketPaymentIfCanceledReservation = (reservation) => {
    if (!shouldClearTicketPaymentOnCancellation(reservation)) {
      return reservation;
    }
    return {
      ...reservation,
      payment: null,
    };
  };

  const cancelSelectedReservations = () => {
    const idsToCancel = new Set(getSelectedReservationIds());
    if (idsToCancel.size === 0) {
      return;
    }

    const usageByMember = new Map();
    const latestReservations = reservationStorage.loadReservations();
    latestReservations.forEach((reservation) => {
      if (reservation?.type !== "hoteling") {
        return;
      }
      if (!idsToCancel.has(reservation.id)) {
        return;
      }

      // Keep status source-of-truth on baseStatusKey for ticket recount.
      reservation.dates.forEach(entry => {
        entry.baseStatusKey = "CANCELED";
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
    const nextReservations = latestReservations.map((reservation) => {
      if (reservation?.type !== "hoteling" || !idsToCancel.has(reservation.id)) {
        return reservation;
      }
      const canceledReservation = {
        ...reservation,
        dates: (Array.isArray(reservation.dates) ? reservation.dates : []).map((entry) => ({
          ...entry,
          baseStatusKey: "CANCELED",
          status: reservationStorage.STATUS.CANCELED,
        })),
      };
      const paymentCleared = clearTicketPaymentIfCanceledReservation(canceledReservation);
      const member = getMemberByReservation(paymentCleared);
      const parsedWeight = Number(member?.weight);
      const memberWeight = Number.isFinite(parsedWeight) ? parsedWeight : null;
      return applyHotelingDateFees(paymentCleared, memberWeight);
    });
    const savedReservations = reservationStorage.saveReservations(nextReservations);
    allReservations.splice(0, allReservations.length, ...savedReservations);
    reservationState.reservations = allReservations.filter((r) => r.type === "hoteling");

    usageByMember.forEach((usageMap, memberId) => {
      rollbackReservationMemberTickets(memberId, usageMap);
    });

    refreshCalendarStats();
    renderListForKey(reservationState.selectedDateKey);
    document.dispatchEvent(new CustomEvent("reservation:updated"));
  };

  const getMemberIdFromReservation = (reservation) => {
    return String(reservation?.memberId || "").trim();
  };

  const getMemberByReservation = (reservation, members = null) => {
    const memberId = getMemberIdFromReservation(reservation);
    if (!memberId) {
      return null;
    }
    const targetMembers = Array.isArray(members) ? members : loadIssueMembers();
    return targetMembers.find((member) => String(member?.id || "") === memberId) || null;
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
    activePaymentMethod = String(value || "").trim();
    detailPaymentButtons.forEach((button) => {
      const isSelected =
        button.dataset.hotelingDetailPaymentMethod === activePaymentMethod;
      button.classList.toggle("is-selected", isSelected);
    });
    if (!activePaymentMethod) {
      if (detailPaymentTicketRow) {
        detailPaymentTicketRow.hidden = false;
      }
      if (detailPaymentAmountRow) {
        detailPaymentAmountRow.hidden = true;
      }
      if (detailPaymentAmountInput instanceof HTMLInputElement) {
        detailPaymentAmountInput.value = "";
        detailPaymentAmountInput.disabled = true;
      }
      syncDetailPaymentSummary();
      return;
    }
    const isTicket = activePaymentMethod === PAYMENT_METHODS.TICKET;
    if (detailPaymentTicketRow) {
      detailPaymentTicketRow.hidden = !isTicket;
    }
    if (detailPaymentAmountRow) {
      detailPaymentAmountRow.hidden = isTicket;
    }
    if (detailPaymentAmountInput instanceof HTMLInputElement) {
      detailPaymentAmountInput.disabled = isTicket;
    }
    syncDetailPaymentSummary();
  };

  const normalizeDetailPaymentAmountInput = () => {
    if (!(detailPaymentAmountInput instanceof HTMLInputElement)) {
      return;
    }
    if (!activePaymentMethod) {
      detailPaymentAmountInput.value = "";
      syncDetailPaymentSummary();
      return;
    }
    if (activePaymentMethod === PAYMENT_METHODS.TICKET) {
      detailPaymentAmountInput.value = "0";
      syncDetailPaymentSummary();
      return;
    }
    const amount = parsePaymentAmount(detailPaymentAmountInput.value);
    detailPaymentAmountInput.value = amount > 0 ? amount.toLocaleString() : "";
    syncDetailPaymentSummary();
  };

  const getDetailReservation = () =>
    reservationState.reservations.find(
      (item) => item.id === detailState.reservationId
    ) || null;

  const getDetailExpectedTotalAmount = () => {
    const reservation = getDetailReservation();
    if (!reservation) {
      return 0;
    }
    const expected = Number(reservation?.billing?.totals?.expected);
    if (Number.isFinite(expected) && expected >= 0) {
      return Math.round(expected);
    }
    return sumBillingAllocationsExpected(reservation?.billing);
  };

  const syncDetailPaymentSummary = () => {
    const totalAmount = getDetailExpectedTotalAmount();
    let paidAmount = 0;
    if (detailTotalAmount) {
      detailTotalAmount.textContent = formatTicketPrice(totalAmount);
    }
    if (activePaymentMethod === PAYMENT_METHODS.TICKET) {
      paidAmount = totalAmount;
    } else if (activePaymentMethod) {
      paidAmount = parsePaymentAmount(
        detailPaymentAmountInput instanceof HTMLInputElement
          ? detailPaymentAmountInput.value
          : 0
      );
    }
    if (detailPaymentTotal) {
      detailPaymentTotal.textContent = formatTicketPrice(paidAmount);
    }
    const balance = totalAmount - paidAmount;
    if (detailBalanceTotal) {
      detailBalanceTotal.textContent = formatTicketPrice(balance);
    }
    detailBalanceRow?.classList.toggle("is-positive", balance > 0);
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
    const member = getMemberByReservation(reservation);
    const ticketMap = new Map(
      (Array.isArray(member?.tickets) ? member.tickets : []).map((ticket) => [
        String(ticket?.id || ""),
        ticket,
      ])
    );
    const rows = [];
    (Array.isArray(reservation?.dates) ? reservation.dates : []).forEach((entry) => {
      const usages = getEntryTicketUsages(entry);
      usages.forEach((usage) => {
        const ticket = ticketMap.get(String(usage?.ticketId || ""));
        rows.push({
          ticketName: ticket?.name || "-",
          sequence: Number(usage?.sequence) || 0,
          totalCount: Number(ticket?.totalCount) || 0,
        });
      });
    });
    detailTicketInfo.textContent = "";
    if (rows.length === 0) {
      detailTicketInfo.innerHTML = `
        <p class="reservation-ticket-placeholder">예약에 사용한 이용권이 없습니다.</p>
      `;
      return;
    }
    rows.forEach((item) => {
      const card = document.createElement("div");
      card.className = "reservation-detail__ticket-card";
      card.innerHTML = `
        <div class="reservation-detail__ticket-col reservation-detail__ticket-col--name">
          <span class="reservation-detail__ticket-value">${item.ticketName}</span>
        </div>
        <div class="reservation-detail__ticket-col reservation-detail__ticket-col--sequence">
          <span class="reservation-detail__ticket-label">회차</span>
          <span class="reservation-detail__ticket-value">${item.sequence || "-"}</span>
        </div>
        <div class="reservation-detail__ticket-col reservation-detail__ticket-col--total">
          <span class="reservation-detail__ticket-label">총횟수</span>
          <span class="reservation-detail__ticket-value">${item.totalCount > 0 ? item.totalCount : "-"}</span>
        </div>
      `;
      detailTicketInfo.appendChild(card);
    });
  };

  const createReservationFeeLine = (labelText, calcText) => {
    const line = document.createElement("div");
    line.className = "reservation-fee-line";
    const label = document.createElement("span");
    label.className = "reservation-fee-line__label";
    label.textContent = labelText;
    const calc = document.createElement("span");
    calc.className = "reservation-fee-line__calc";
    calc.textContent = calcText;
    line.append(label, calc);
    return line;
  };

  const renderHotelingDetailFeeLines = (reservation) => {
    if (!detailFeeLines) {
      return;
    }
    detailFeeLines.innerHTML = "";
    const charges = Array.isArray(reservation?.billing?.charges)
      ? reservation.billing.charges
      : [];
    if (charges.length > 0) {
      const groups = new Map();
      charges.forEach((charge) => {
        const type = String(charge?.serviceType || "");
        if (!groups.has(type)) {
          groups.set(type, {
            amount: 0,
            qty: 0,
            unitPrice: 0,
          });
        }
        const current = groups.get(type);
        current.amount += Number(charge?.amount) || 0;
        current.qty += Number(charge?.qty) || 1;
        if (!current.unitPrice && Number(charge?.unitPrice) > 0) {
          current.unitPrice = Number(charge.unitPrice);
        }
      });
      const rows = [];
      if (groups.has("hoteling")) {
        const row = groups.get("hoteling");
        const qty = Math.max(Number(row.qty) || 0, 0);
        const unit = Number(row.unitPrice) > 0
          ? formatTicketPrice(row.unitPrice)
          : null;
        rows.push({
          label: "호텔링",
          calc: unit && qty > 0
            ? `${unit} x ${qty}박`
            : formatTicketPrice(row.amount),
        });
      }
      if (groups.has("oneway")) {
        const row = groups.get("oneway");
        const qty = Math.max(Number(row.qty) || 0, 0);
        const unit = Number(row.unitPrice) > 0
          ? formatTicketPrice(row.unitPrice)
          : null;
        rows.push({
          label: "픽드랍(편도)",
          calc: unit && qty > 0
            ? `${unit} x ${qty}회`
            : formatTicketPrice(row.amount),
        });
      }
      if (groups.has("roundtrip")) {
        const row = groups.get("roundtrip");
        const qty = Math.max(Number(row.qty) || 0, 0);
        const unit = Number(row.unitPrice) > 0
          ? formatTicketPrice(row.unitPrice)
          : null;
        rows.push({
          label: "픽드랍(왕복)",
          calc: unit && qty > 0
            ? `${unit} x ${qty}회`
            : formatTicketPrice(row.amount),
        });
      }
      if (rows.length > 0) {
        rows.forEach((row) => {
          detailFeeLines.appendChild(createReservationFeeLine(row.label, row.calc));
        });
        return;
      }
    }

    const allocations =
      reservation?.billing && typeof reservation.billing.allocationsByDate === "object"
        ? reservation.billing.allocationsByDate
        : {};
    const totals = Object.values(allocations).reduce(
      (acc, fee) => ({
        hoteling: acc.hoteling + (Number(fee?.hoteling) || 0),
        oneway: acc.oneway + (Number(fee?.oneway) || 0),
        roundtrip: acc.roundtrip + (Number(fee?.roundtrip) || 0),
      }),
      { hoteling: 0, oneway: 0, roundtrip: 0 }
    );
    const rows = [];
    if (totals.hoteling > 0) {
      rows.push({ label: "호텔링", calc: formatTicketPrice(totals.hoteling) });
    }
    if (totals.oneway > 0) {
      rows.push({ label: "픽드랍(편도)", calc: formatTicketPrice(totals.oneway) });
    }
    if (totals.roundtrip > 0) {
      rows.push({ label: "픽드랍(왕복)", calc: formatTicketPrice(totals.roundtrip) });
    }
    if (rows.length === 0) {
      rows.push({ label: "요금 정보", calc: "-" });
    }
    rows.forEach((row) => {
      detailFeeLines.appendChild(createReservationFeeLine(row.label, row.calc));
    });
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
    renderHotelingDetailFeeLines(reservation);
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
      paymentMethod: PAYMENT_METHODS.CASH,
      paymentAmount: "0",
    };
    const member = getMemberByReservation(reservation);
    const owner = member?.owner || reservation.owner || "-";
    const dogName = member?.dogName || reservation.dogName || "-";
    const breed = member?.breed || reservation.breed || "-";
    const weight =
      member?.weight
      || reservation.weight
      || reservation.memberWeight
      || reservation.petWeight
      || "-";
    const roomId = String(reservation.room || "");
    const roomName = roomId
      ? (rooms.find((item) => String(item.id) === roomId)?.name || roomId)
      : "";
    const room = roomName || "-";
    if (detailOwnerEl) {
      detailOwnerEl.textContent = owner;
    }
    if (detailPhoneEl) {
      detailPhoneEl.textContent = member?.phone || member?.ownerPhone || "-";
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
    const hasPersistedPayment = reservation?.payment && typeof reservation.payment === "object";
    const payment = hasPersistedPayment
      ? normalizeReservationPayment(reservation.payment, reservation)
      : null;
    setPaymentMethod(payment?.method || "");
    if (detailPaymentAmountInput instanceof HTMLInputElement) {
      detailPaymentAmountInput.value =
        payment?.method === PAYMENT_METHODS.TICKET
          ? "0"
          : (Number(payment?.amount) > 0 ? Number(payment.amount).toLocaleString() : "");
    }
    if (!payment) {
      if (detailTicketInfo) {
        detailTicketInfo.innerHTML = `
          <p class="reservation-ticket-placeholder">예약에 사용한 이용권이 없습니다.</p>
        `;
      }
    } else {
      renderDetailTicketInfo(reservation);
    }
    syncDetailPaymentSummary();
    detailState.initial.paymentMethod = payment?.method || "";
    detailState.initial.paymentAmount = payment
      ? String(payment.amount || 0)
      : "";
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
      paymentMethod: activePaymentMethod || "",
      paymentAmount: activePaymentMethod === PAYMENT_METHODS.TICKET
        ? "0"
        : activePaymentMethod
          ? (detailPaymentAmountInput instanceof HTMLInputElement
            ? String(parsePaymentAmount(detailPaymentAmountInput.value))
            : "0")
          : "",
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
      || next.paymentMethod !== (detailState.initial.paymentMethod || "")
      || next.paymentAmount !== (detailState.initial.paymentAmount || "")
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
      paymentMethod: activePaymentMethod || "",
      paymentAmount: activePaymentMethod === PAYMENT_METHODS.TICKET
        ? 0
        : activePaymentMethod
          ? parsePaymentAmount(
            detailPaymentAmountInput instanceof HTMLInputElement
              ? detailPaymentAmountInput.value
              : 0
          )
          : 0,
      ...getDetailPickdropFlags(),
    };
    const nextReservations = reservationStorage.updateReservation(
      detailState.reservationId,
      (item) => {
        const {
          statusKey,
          paymentMethod,
          paymentAmount,
          ...nextPayload
        } = payload;
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
        let updatedReservation = {
          ...item,
          ...nextPayload,
          dates: nextDates.map((entry) => {
            const key = `${entry.date}-${entry.kind}`;
            const nextStatusKey = statusKey;
            return {
              ...entry,
              baseStatusKey: nextStatusKey,
              status: getHotelingStatusLabel(nextStatusKey),
              ticketUsages: usageMap.get(key) || [],
              pickup: entry.kind === "checkin" ? payload.pickup : false,
              dropoff: entry.kind === "checkout" ? payload.dropoff : false,
            };
          }),
          hasPickup: Boolean(payload.pickup),
          hasDropoff: Boolean(payload.dropoff),
        };
        const memberId = getMemberIdFromReservation(updatedReservation);
        const repairContext = buildPickdropRepairContext({
          reservation: updatedReservation,
          memberId,
          tickets: ticketStorage.ensureDefaults(),
          members: loadIssueMembers(),
        });
        if (repairContext.skipReason) {
          console.debug(
            `[hoteling-detail] pickdrop usage repair skipped: ${repairContext.skipReason}`
          );
          const member = loadIssueMembers().find(
            (value) => String(value?.id || "") === String(memberId || "")
          );
          const parsedWeight = Number(member?.weight);
          const memberWeight = Number.isFinite(parsedWeight) ? parsedWeight : null;
          const nextPayment = paymentMethod
            ? normalizeReservationPayment(
              { method: paymentMethod, amount: paymentAmount },
              updatedReservation
            )
            : null;
          const reservationWithPayment = clearTicketPaymentIfCanceledReservation({
            ...updatedReservation,
            payment: nextPayment,
          });
          return applyHotelingDateFees(
            reservationWithPayment,
            memberWeight
          );
        }
        updatedReservation = repairReservationPickdropUsages({
          reservation: updatedReservation,
          pickdropOptions: repairContext.pickdropOptions,
          selectionOrder: repairContext.selectionOrder,
        });
        const member = loadIssueMembers().find(
          (value) => String(value?.id || "") === String(memberId || "")
        );
        const parsedWeight = Number(member?.weight);
        const memberWeight = Number.isFinite(parsedWeight) ? parsedWeight : null;
        const nextPayment = paymentMethod
          ? normalizeReservationPayment(
            { method: paymentMethod, amount: paymentAmount },
            updatedReservation
          )
          : null;
        const reservationWithPayment = clearTicketPaymentIfCanceledReservation({
          ...updatedReservation,
          payment: nextPayment,
        });
        return applyHotelingDateFees(
          reservationWithPayment,
          memberWeight
        );
      }
    );
    reservationState.reservations = nextReservations;
    const updatedReservation = nextReservations.find(
      (item) => item.id === detailState.reservationId
    );
    const memberId = getMemberIdFromReservation(updatedReservation);
    applyReservationToMemberTickets(memberId || "", new Map());
    detailState.initial = { ...payload };
    syncDetailSaveState();
    refreshCalendarStats();
    renderListForKey(reservationState.selectedDateKey);
    showToast("변경된 설정을 저장했습니다.");
    closeDetailModal();
  };

  const renderListForKey = (dateKey) => {
    reservationState.selectedDateKey = dateKey || "";
    const groups = buildHotelingEntriesForDate(
      getFilteredReservations(),
      reservationState.selectedDateKey
    );
    const members = loadIssueMembers();
    const memberById = new Map(
      members.map((member) => [String(member?.id || ""), member])
    );
    const roomNameById = new Map(
      roomStorage.ensureDefaults().map((room) => [
        String(room?.id ?? ""),
        String(room?.name ?? "").trim() || String(room?.id ?? ""),
      ])
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
      groups,
      { roomNameById, memberById }
    );
    sidebarReservationBadges.refresh();
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
      const timeCell = target.closest("[data-hoteling-time-edit='true']");
      if (timeCell && listCard.contains(timeCell)) {
        const row = timeCell.closest(".hoteling-table__row--data");
        openListTimePicker({
          cell: timeCell,
          reservationId: row?.dataset?.reservationId || "",
          entryDate: row?.dataset?.entryDate || "",
          entryKind: row?.dataset?.entryKind || "",
        });
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

    listCard.addEventListener("keydown", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || !target.matches("[data-hoteling-time-edit='true']")) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const row = target.closest(".hoteling-table__row--data");
      openListTimePicker({
        cell: target,
        reservationId: row?.dataset?.reservationId || "",
        entryDate: row?.dataset?.entryDate || "",
        entryKind: row?.dataset?.entryKind || "",
      });
    });
  }

  listTimePicker.addEventListener("blur", () => {
    if (!activeTimeEdit) {
      return;
    }
    const nextTime = listTimePicker.value || activeTimeEdit.previousValue || "";
    if (nextTime && nextTime !== activeTimeEdit.previousValue) {
      updateListEntryTime({
        reservationId: activeTimeEdit.reservationId,
        entryDate: activeTimeEdit.entryDate,
        entryKind: activeTimeEdit.entryKind,
        nextTime,
      });
    }
    closeListTimePicker();
  });

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
        syncDetailSaveState();
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
  if (detailDeleteButton) {
    detailDeleteButton.addEventListener("click", () => {
      const reservationId = detailState.reservationId;
      if (!reservationId) {
        return;
      }
      if (!window.confirm("예약을 삭제할까요?")) {
        return;
      }
      const latestReservations = reservationStorage.loadReservations();
      const target = latestReservations.find((item) => item.id === reservationId) || null;
      if (!target) {
        closeDetailModal();
        return;
      }
      const memberId = getMemberIdFromReservation(target);
      const usageMap = buildTicketUsageCountMap(Array.isArray(target.dates) ? target.dates : []);
      const nextReservations = latestReservations.filter((item) => item.id !== reservationId);
      const savedReservations = reservationStorage.saveReservations(nextReservations);
      allReservations.splice(0, allReservations.length, ...savedReservations);
      reservationState.reservations = allReservations.filter((item) => item.type === "hoteling");
      if (memberId && usageMap.size > 0) {
        rollbackReservationMemberTickets(memberId, usageMap);
      } else {
        applyReservationToMemberTickets(memberId || "", new Map());
      }
      refreshCalendarStats();
      renderListForKey(reservationState.selectedDateKey);
      closeDetailModal();
      showToast("삭제되었습니다.");
      document.dispatchEvent(new CustomEvent("reservation:updated"));
    });
  }
  detailPaymentAmountInput?.addEventListener("input", () => {
    normalizeDetailPaymentAmountInput();
    syncDetailSaveState();
  });

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
  const ticketList = reservationModal?.querySelector("[data-hoteling-tickets]");
  const ticketEmpty = reservationModal?.querySelector("[data-hoteling-tickets-empty]");
  const hotelingFeeList = reservationModal?.querySelector("[data-hoteling-fee-list]");
  const hotelingFeeTotal = reservationModal?.querySelector("[data-hoteling-hoteling-total]");
  const hotelingTicketTotal = reservationModal?.querySelector("[data-hoteling-ticket-total]");
  const pickdropFeeList = reservationModal?.querySelector("[data-hoteling-pickdrop-fee-list]");
  const pickdropFeeTotal = reservationModal?.querySelector("[data-hoteling-pickdrop-total]");
  const pickdropTicketTotal = reservationModal?.querySelector("[data-hoteling-pickdrop-ticket-total]");
  const paymentTotalAll = reservationModal?.querySelector("[data-payment-total-all]");
  const reservationPaymentTypeInput = reservationModal?.querySelector("[data-reservation-payment-type], [data-reservation-other-type]");
  const reservationOtherAmountInput = reservationModal?.querySelector("[data-reservation-other-amount]");
  const hotelingTotalAll = reservationModal?.querySelector("[data-hoteling-total]");
  const hotelingFeeStep = reservationModal?.querySelector(".reservation-step--fee.hoteling-fee-card");
  const hotelingFeeCard = reservationModal?.querySelector("[data-hoteling-fee-hoteling]");
  const pickdropFeeCard = reservationModal?.querySelector("[data-hoteling-fee-pickdrop]");
  const pickdropTicketField = reservationModal?.querySelector("[data-hoteling-pickdrop-tickets]");
  const pickdropTicketEmpty = reservationModal?.querySelector("[data-hoteling-pickdrop-tickets-empty]");
  const pickdropInputs = reservationModal?.querySelectorAll("[data-hoteling-pickdrop-option]");
  const submitButton = reservationModal?.querySelector(".hoteling-modal__submit");
  const balanceRow = reservationModal?.querySelector("[data-hoteling-fee-balance-row]");
  const balanceTotal = reservationModal?.querySelector("[data-hoteling-fee-balance-total]");
  const feeDropdownController = setupReservationFeeDropdowns(reservationModal, {
    iconOpen: "../../assets/iconDropdown.svg",
    iconFold: "../../assets/iconDropdown_fold.svg",
    onTabChanged: () => {
      syncHotelingFees();
    },
  });

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
    nearestCheckoutSelectionKeys: {
      pastCheckout: "",
      futureCheckin: "",
    },
    selectedTagFilters: [],
  };

  const getNearestCheckoutSelectionKeys = (baseKey, checkoutKeys, checkinKeys) => {
    if (
      !baseKey
      || !(checkoutKeys instanceof Set)
      || !(checkinKeys instanceof Set)
    ) {
      return { pastCheckout: "", futureCheckin: "" };
    }
    let pastCheckout = "";
    let futureCheckin = "";
    checkoutKeys.forEach((key) => {
      if (!key || key === baseKey) {
        return;
      }
      if (key < baseKey) {
        if (!pastCheckout || key > pastCheckout) {
          pastCheckout = key;
        }
      }
    });
    checkinKeys.forEach((key) => {
      if (!key || key === baseKey) {
        return;
      }
      if (key > baseKey) {
        if (!futureCheckin || key < futureCheckin) {
          futureCheckin = key;
        }
      }
    });
    return { pastCheckout, futureCheckin };
  };

  const getSelectedTicketMetaElement = (container) =>
    container?.querySelector?.(
      ".reservation-ticket-row.is-selected .reservation-ticket-row__meta"
    );

  const setAmountRange = (amountEl, before, after, unitLabel = "회") => {
    if (!amountEl) {
      return;
    }

    const beforeVal = `${before}${unitLabel}`;
    let afterVal = `${after}${unitLabel}`;
    if (after < 0) {
      afterVal = `초과 ${Math.abs(after)}${unitLabel}`;
    }
    const isBeforeLow = Number(before) <= 2;
    const isAfterLow = Number(after) <= 2;

    amountEl.innerHTML = `
      <span class="reservation-ticket-row__meta">
        <span class="as-is ${isBeforeLow ? "is-low" : ""}">${beforeVal}</span>
        →
        <span class="to-be ${isAfterLow ? "is-low" : ""}">${afterVal}</span>
      </span>
    `;

    amountEl.classList.toggle("is-empty", false);
    delete amountEl.dataset.feeAmount;
  };

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

  const applyHotelingDateFees = (reservation, memberWeight = null) => {
    if (!reservation || !Array.isArray(reservation.dates)) {
      return reservation;
    }
    return buildReservationWithBilling(reservation, {
      pricingItems: pricingStorage.loadPricingItems(),
      memberWeight,
      timeZone,
      payment: reservation.payment,
    });
  };

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
    const previousMemberId = String(modalState.selectedMember?.id || "");
    const nextMemberId = String(member?.id || "");
    const hasMemberChanged = previousMemberId !== nextMemberId;
    if (hasMemberChanged) {
      modalState.checkin = null;
      modalState.checkout = null;
    }

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

    if ((hasPickup && hasCheckin) || (hasDropoff && hasCheckout)) {
      return 1;
    }
    return 0;
  };

  const syncHotelingFees = () => {
    if (!hotelingTotalAll || !paymentTotalAll) {
      return;
    }
    const currentPricingItems = pricingStorage.loadPricingItems();
    const roomId = getSelectedRoomId();
    const nightKeys = getNightKeys();
    const nightCount = getNightCount(modalState.checkin, modalState.checkout) || 0;
    const pickdropCount = getPickdropDateCount();

    // 1. Fee breakdown (Area 1: Total Estimated Amount)
    renderHotelingFeeBreakdown({
      hotelingFeeContainer: hotelingFeeList,
      hotelingTotalEl: hotelingFeeTotal,
      totalEl: null,
      pricingItems: currentPricingItems,
      rooms,
      roomId,
      nightKeys,
      timeZone,
    });

    renderPricingBreakdown({
      schoolFeeContainer: null,
      pickdropFeeContainer: pickdropFeeList,
      schoolTotalEl: null,
      pickdropTotalEl: pickdropFeeTotal,
      totalEl: null,
      pricingItems: currentPricingItems,
      classes,
      services: new Set(),
      pickdrops: modalState.pickdrops,
      dateCount: pickdropCount,
      serviceDateCount: 0,
      pickdropDateCount: pickdropCount,
      selectedWeekdayCounts: new Map(),
      memberWeight: modalState.selectedMember?.weight,
    });

    // Sum Area 1 Totals
    const feeTotalGroup = reservationModal?.querySelector('[data-fee-group="total"]');
    if (feeTotalGroup) {
      const hotelingAmt = parseInt(hotelingFeeTotal?.dataset.feeAmount || "0", 10);
      const pickdropAmt = parseInt(pickdropFeeTotal?.dataset.feeAmount || "0", 10);
      const total = hotelingAmt + pickdropAmt;
      if (hotelingTotalAll) {
        hotelingTotalAll.textContent = total > 0 ? `${total.toLocaleString()}원` : "-";
        hotelingTotalAll.dataset.feeAmount = String(total);
      }
    }

    // 2. Ticket allocation (Area 2: Payment - Ticket panel)
    const pickdropMap = new Map(modalState.pickdropTicketOptions.map((o) => [o.id, o]));
    const pickdropAllocation = allocateTicketUsage(modalState.pickdropTicketSelections, pickdropMap, pickdropCount);

    const hotelingOptionMap = new Map(modalState.ticketOptions.map((o) => [o.id, o]));
    const hotelingAllocation = allocateTicketUsage(modalState.ticketSelections, hotelingOptionMap, nightCount);

    renderPickdropTickets(
      pickdropTicketField,
      modalState.pickdropTicketOptions,
      modalState.pickdropTicketSelections,
      pickdropAllocation.allocations,
      Boolean(modalState.selectedMember),
      true,
      pickdropTicketEmpty,
      pickdropCount === 0
    );

    // 3. Payment Totals (Area 2)
    const activeTab = reservationModal?.querySelector(".reservation-fee-tab.is-active")?.dataset.feeTab;

    if (activeTab === "ticket") {
      const hasTicketSelection = modalState.ticketSelections.length > 0;
      const hasPickdropSelection = modalState.pickdropTicketSelections.length > 0;

      if (hasTicketSelection) {
        const meta = getSelectedTicketMetaElement(ticketList);
        if (meta) {
          applyTicketMetaAmount(hotelingTicketTotal, meta);
          const total = modalState.selectedMember?.totalReservableCountByType?.hoteling || 0;
          setAmountRange(hotelingTicketTotal, total, total - nightCount, "박");
        }
      } else {
        if (hotelingTicketTotal) {
          hotelingTicketTotal.innerHTML = `
            <span class="reservation-ticket-row__meta">
              <span class="as-is">-</span>
            </span>
          `;
        }
      }

      if (hasPickdropSelection) {
        const meta = getSelectedTicketMetaElement(pickdropTicketField);
        if (meta) {
          applyTicketMetaAmount(pickdropTicketTotal, meta);
          const total = getPickdropReservableTotal(modalState.selectedMember?.totalReservableCountByType);
          setAmountRange(pickdropTicketTotal, total, total - pickdropCount, "회");
        }
      } else {
        if (pickdropTicketTotal) {
          pickdropTicketTotal.innerHTML = `
            <span class="reservation-ticket-row__meta">
              <span class="as-is">-</span>
            </span>
          `;
        }
      }

      if (hasTicketSelection || hasPickdropSelection) {
        paymentTotalAll.textContent = "이용권 사용";
      } else {
        paymentTotalAll.textContent = "-";
      }

    } else if (activeTab === "other") {
      const otherInput = reservationModal?.querySelector("[data-reservation-other-amount]");
      const otherValue = otherInput?.value.replace(/,/g, "") || "0";
      if (paymentTotalAll) {
        paymentTotalAll.textContent = `${Number(otherValue).toLocaleString()}원`;
      }
    }

    // 4. Sync Balance (잔여)
    if (balanceTotal) {
      let totalPricing = parseInt(hotelingTotalAll?.dataset.feeAmount || "0", 10);
      const paymentText = paymentTotalAll?.textContent || "-";

      if (paymentText === "이용권 사용") {
        balanceTotal.textContent = "이용권 사용";
        balanceRow?.classList.remove("is-positive");
      } else if (paymentText === "-") {
        balanceTotal.textContent = totalPricing > 0 ? `${totalPricing.toLocaleString()}원` : "0원";
        if (totalPricing > 0) {
          balanceRow?.classList.add("is-positive");
        } else {
          balanceRow?.classList.remove("is-positive");
        }
      } else {
        const paymentAmount = parseInt(paymentText.replace(/[^0-9]/g, "") || "0", 10);
        const balance = totalPricing - paymentAmount;
        balanceTotal.textContent = `${balance.toLocaleString()}원`;
        if (balance > 0) {
          balanceRow?.classList.add("is-positive");
        } else {
          balanceRow?.classList.remove("is-positive");
        }
      }
    }

    if (hotelingFeeStep) {
      hotelingFeeStep.classList.toggle("is-overbooked",
        hasOverbookedAllocations(hotelingAllocation.allocations) ||
        hasOverbookedAllocations(pickdropAllocation.allocations)
      );
    }
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
    const selectedRoomId = getSelectedRoomId();
    const isRoomUnselected = selectedRoomId.length === 0;
    const summary = getMemberRoomHotelingReservationSummary(
      reservationState.reservations,
      modalState.selectedMember,
      selectedRoomId
    );
    modalState.reservationSummary = summary;
    const nearestCheckoutSelectionKeys = getNearestCheckoutSelectionKeys(
      checkinKey,
      summary.checkoutKeys,
      summary.checkinKeys
    );
    modalState.nearestCheckoutSelectionKeys = nearestCheckoutSelectionKeys;
    const nextCheckinKey = checkinKey
      ? getNextHotelingCheckinKey(checkinKey, summary.checkinKeys)
      : "";
    const isSelectingCheckout = Boolean(checkinKey) && !checkoutKey;

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
      const isNearestCheckoutException = isSelectingCheckout
        && (
          dateKey === nearestCheckoutSelectionKeys.pastCheckout
          || dateKey === nearestCheckoutSelectionKeys.futureCheckin
        );
      const isPastReservedCheckinBlocked = isSelectingCheckout
        && Boolean(checkinKey)
        && Boolean(dateKey)
        && dateKey < checkinKey
        && summary.checkinKeys.has(dateKey);
      if (
        isPastReservedCheckinBlocked
        || (((isDisabled || isRoomUnselected) && !isNearestCheckoutException))
      ) {
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
      tagCatalog: loadMemberTagCatalog(),
      selectedTags: modalState.selectedTagFilters,
      tagFilterMode: "all",
      onTagFilterChange: (tags) => {
        modalState.selectedTagFilters = Array.isArray(tags) ? tags : [];
        renderMemberResults();
        memberResults?.classList.add("is-open");
      },
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
    modalState.selectedTagFilters = [];
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

      feeDropdownController.reset();
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
      const nearestCheckoutSelectionKeys = modalState.nearestCheckoutSelectionKeys || {
        pastCheckout: "",
        futureCheckin: "",
      };
      const nextDate = getDateFromKey(value);
      if (!nextDate) {
        return;
      }
      const isSelectingCheckin = !modalState.checkin || Boolean(modalState.checkout);
      const isSelectingCheckout = Boolean(modalState.checkin) && !modalState.checkout;
      const isNearestCheckoutException = isSelectingCheckout
        && (
          value === nearestCheckoutSelectionKeys.pastCheckout
          || value === nearestCheckoutSelectionKeys.futureCheckin
        );
      if (isSelectingCheckin && reservedCheckin && !reservedCheckout) {
        return;
      }
      if (isSelectingCheckout && reservedCheckout && !reservedCheckin && !isNearestCheckoutException) {
        return;
      }
      const nextKey = getDateKey(nextDate);
      const checkinKey = modalState.checkin ? getDateKey(modalState.checkin) : "";
      const isPastReservedCheckinBlocked = isSelectingCheckout
        && Boolean(checkinKey)
        && Boolean(nextKey)
        && nextKey < checkinKey
        && reservedCheckin;
      if (isPastReservedCheckinBlocked) {
        return;
      }
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

  const syncOtherAmountInput = (inputEl) => {
    if (!(inputEl instanceof HTMLInputElement)) {
      return;
    }
    let value = inputEl.value.replace(/[^0-9]/g, "");
    if (value) {
      inputEl.value = parseInt(value, 10).toLocaleString();
    } else {
      inputEl.value = "";
    }
    syncHotelingFees();
  };

  reservationModal?.addEventListener("input", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) {
      return;
    }
    if (input.matches("[data-reservation-other-amount]")) {
      syncOtherAmountInput(input);
    }
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
      modalState.checkin = null;
      modalState.checkout = null;
      reservationModal
        ?.querySelectorAll?.("[data-hoteling-room]")
        ?.forEach?.((roomInput) => {
          syncFilterChip(roomInput);
        });
      renderModalCalendar();
    }
    if (input.matches("[data-reservation-other-amount]")) {
      syncOtherAmountInput(input);
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

      const activePaymentTab =
        reservationModal?.querySelector(".reservation-fee-tab.is-active")?.dataset?.feeTab || "ticket";
      const rawPaymentMethod = activePaymentTab === "other"
        ? (reservationPaymentTypeInput instanceof HTMLSelectElement
          ? reservationPaymentTypeInput.value
          : PAYMENT_METHODS.CASH)
        : PAYMENT_METHODS.TICKET;
      const paymentMethod = rawPaymentMethod === "bank"
        ? PAYMENT_METHODS.TRANSFER
        : rawPaymentMethod;
      const paymentAmount = activePaymentTab === "other"
        ? parsePaymentAmount(
          reservationOtherAmountInput instanceof HTMLInputElement
            ? reservationOtherAmountInput.value
            : 0
        )
        : 0;

      // Build the new unified reservation object
      const newReservation = {
        id: createId(), // Assuming createId is available or imported
        type: 'hoteling',
        memberId: String(formData.memberId || modalState.selectedMember?.id || ""),
        room: formData.room,
        memo: formData.memo,
        dates: buildHotelingDateEntries(checkinDate, checkoutDate, checkinTime, checkoutTime),
      };
      const hasPickup = modalState.pickdrops.has("pickup");
      const hasDropoff = modalState.pickdrops.has("dropoff");
      newReservation.hasPickup = hasPickup;
      newReservation.hasDropoff = hasDropoff;
      const nights = getNightCount(modalState.checkin, modalState.checkout) || 0;
      const dateTicketUsageMap = new Map();
      if (modalState.selectedMember?.id && modalState.ticketSelections.length > 0 && nights > 0) {
        const optionMap = new Map(modalState.ticketOptions.map((option) => [option.id, option]));
        const allocationResult = allocateTicketUsage(modalState.ticketSelections, optionMap, nights);
        const nightKeys = getNightKeys();
        const builtUsageMap = buildDateTicketUsageMap(
          nightKeys,
          modalState.ticketSelections,
          allocationResult.allocations,
          optionMap
        );
        builtUsageMap.forEach((usage, dateKey) => {
          dateTicketUsageMap.set(dateKey, usage);
        });
      }

      const pickdropUsageByEntry = new Map();
      if (
        modalState.selectedMember?.id
        && modalState.pickdropTicketSelections.length > 0
        && (hasPickup || hasDropoff)
      ) {
        const pickdropOptionMap = new Map(
          modalState.pickdropTicketOptions.map((option) => [option.id, option])
        );
        const planDateKeys = hasPickup ? [checkinDate] : [checkoutDate];
        const builtPlan = buildPickdropUsagePlan({
          dateKeys: planDateKeys,
          pickdropFlags: { hasPickup, hasDropoff },
          selectionOrder: modalState.pickdropTicketSelections,
          optionMap: pickdropOptionMap,
        });
        const pickdropDateUsageMap = buildDateTicketUsagesMap(
          planDateKeys,
          builtPlan.planByDate,
          pickdropOptionMap
        );

        if (hasPickup && hasDropoff) {
          const combinedUsages = pickdropDateUsageMap.get(checkinDate) || [];
          const checkinUsages = combinedUsages.length > 1
            ? [combinedUsages[0]]
            : combinedUsages;
          const checkoutUsages = combinedUsages.length > 1
            ? combinedUsages.slice(1, 2)
            : [];
          if (checkinUsages.length > 0) {
            pickdropUsageByEntry.set(`${checkinDate}-checkin`, checkinUsages);
          }
          if (checkoutUsages.length > 0) {
            pickdropUsageByEntry.set(`${checkoutDate}-checkout`, checkoutUsages);
          }
        } else if (hasPickup) {
          const pickupUsages = pickdropDateUsageMap.get(checkinDate) || [];
          if (pickupUsages.length > 0) {
            pickdropUsageByEntry.set(`${checkinDate}-checkin`, pickupUsages);
          }
        } else if (hasDropoff) {
          const dropoffUsages = pickdropDateUsageMap.get(checkoutDate) || [];
          if (dropoffUsages.length > 0) {
            pickdropUsageByEntry.set(`${checkoutDate}-checkout`, dropoffUsages);
          }
        }
      }

      newReservation.dates = newReservation.dates.map((entry) => {
        const entryKey = `${entry.date}-${entry.kind}`;
        const serviceUsage = dateTicketUsageMap.get(entry.date) || null;
        const pickdropUsages = pickdropUsageByEntry.get(entryKey) || [];
        return {
          ...entry,
          pickup: entry.kind === "checkin" ? hasPickup : false,
          dropoff: entry.kind === "checkout" ? hasDropoff : false,
          ticketUsages: mergeTicketUsagesForDate(serviceUsage, pickdropUsages),
        };
      });
      const hasTicketPaymentUsage = newReservation.dates.some(
        (entry) => getEntryTicketUsages(entry).length > 0
      );
      newReservation.payment =
        !hasTicketPaymentUsage && paymentAmount <= 0
          ? null
          : normalizeReservationPayment(
            { method: paymentMethod, amount: paymentAmount },
            newReservation
          );
      const parsedWeight = Number(modalState.selectedMember?.weight);
      const memberWeight = Number.isFinite(parsedWeight) ? parsedWeight : null;
      const reservationWithBilling = applyHotelingDateFees(
        newReservation,
        memberWeight
      );

      const savedReservations = reservationStorage.addReservation(reservationWithBilling);
      allReservations.splice(0, allReservations.length, ...savedReservations);
      reservationState.reservations = allReservations.filter((r) => r.type === "hoteling");
      refreshCalendarStats();

      // Recalculate counts which is now handled by applyReservationToMemberTickets
      const usageMap = buildTicketUsageCountMap(reservationWithBilling.dates);
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

