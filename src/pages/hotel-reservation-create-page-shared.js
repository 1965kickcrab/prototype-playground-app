import {
  collectHotelingReservationFormData,
  renderHotelingRoomOptions,
} from "../components/hoteling-reservation-modal.js";
import { getCalendarDayNamesMarkup } from "../components/calendar-shared.js";
import { renderMemberSearchResults } from "../components/member-search.js";
import { renderTicketOptions } from "../components/reservation-ticket-view.js";
import {
  renderHotelingFeeBreakdown,
  renderPickdropTickets,
  renderPricingBreakdown,
} from "../components/reservation-fee.js";
import { showToast } from "../components/toast.js";
import { syncFilterChip } from "../utils/dom.js";
import { setupReservationFeeDropdowns } from "../utils/reservation-fee-dropdown.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import {
  ensureMemberDefaults,
  loadIssueMembers,
  applyReservationToMember,
  applyReservationToMemberTickets,
} from "../storage/ticket-issue-members.js";
import {
  getDefaultHotelingTicketSelection,
  getEligibleHotelingTicketOptions,
  getHotelingDateKey,
  getNextHotelingCheckinKey,
  getHotelingTicketOptions,
  getHotelingRoomIdsForTickets,
  STATUS,
  isHotelingDateDisabled,
  getHotelingNightKeys,
  buildHotelingDateEntries,
} from "../services/hoteling-reservation-service.js";
import { getMemberRoomHotelingReservationSummary } from "../services/member-reservation-summary.js";
import {
  allocateTicketUsage,
  buildPickdropUsagePlan,
  getIssuedTicketOptions,
} from "../services/ticket-reservation-service.js";
import {
  buildDateTicketUsageMap,
  buildDateTicketUsagesMap,
  buildTicketUsageCountMap,
  getEntryTicketUsages,
  mergeTicketUsagesForDate,
} from "../services/ticket-usage-service.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import { getPickdropReservableTotal } from "../services/pickdrop-policy.js";
import {
  PAYMENT_METHODS,
  parsePaymentAmount,
  normalizeReservationPayment,
} from "../services/reservation-payment.js";
import { buildReservationWithBilling } from "../services/reservation-billing.js";
import { getTimeZone } from "../utils/timezone.js";
import { createId } from "../utils/id.js";
import {
  createHotelingReservationModalElements,
  getHotelingReservationModalMarkup,
  renderReservationModal,
} from "../components/reservation-modal.js";
import {
  applyReservationTicketMetaAmount,
  bindReservationMemberSearchEvents,
  formatReservationCurrencyInput,
  getSelectedReservationTicketMetaElement,
  setReservationAmountRange,
} from "../components/reservation-modal-dom.js";
import { getDatePartsFromKey } from "../utils/date.js";

function buildHotelsPageUrl(dateKey = "", toastKey = "") {
  const nextUrl = new URL("./hotels.html", window.location.href);
  if (dateKey) {
    nextUrl.searchParams.set("dateKey", dateKey);
  }
  if (toastKey) {
    nextUrl.searchParams.set("toast", toastKey);
  }
  return nextUrl.toString();
}

const HOTELING_ASSET_PREFIX = "../../assets/";

function setSheetOpen(sheet, backdrop, open) {
  if (sheet) {
    sheet.hidden = !open;
  }
  if (backdrop) {
    backdrop.hidden = !open;
  }
}

export function setupHotelingReservationCreatePage({
  rootSelector,
  onBack,
  onReservationUpdated,
} = {}) {
  renderReservationModal({
    rootSelector,
    modalHtml: getHotelingReservationModalMarkup({ assetPrefix: "../../" }),
  });

  const root = document.querySelector(rootSelector);
  if (!root) {
    return null;
  }

  const {
    reservationModal,
    dateInput,
    dateTrigger,
    dateSheet,
    dateSheetBackdrop,
    dateSheetClose,
    dateSheetSummary,
    dateSheetMonths,
    dateSheetSubmit,
    nightSummaryEl,
    memberInput,
    memberResults,
    memberClear,
    hotelingMemoInput,
    ticketList,
    ticketEmpty,
    hotelingFeeList,
    hotelingFeeTotal,
    hotelingTicketTotal,
    pickdropFeeList,
    pickdropFeeTotal,
    pickdropTicketTotal,
    paymentTotalAll,
    reservationPaymentTypeInput,
    reservationOtherAmountInput,
    hotelingTotalAll,
    hotelingFeeStep,
    pickdropTicketField,
    pickdropTicketEmpty,
    pickdropInputs,
    submitButton,
    balanceRow,
    balanceTotal,
  } = createHotelingReservationModalElements(root);

  if (!reservationModal) {
    return null;
  }

  reservationModal.dataset.reservationPage = "true";
  reservationModal.setAttribute("aria-hidden", "false");

  const timeZone = getTimeZone();
  const reservationStorage = initReservationStorage();
  const roomStorage = initHotelRoomStorage();
  const ticketStorage = initTicketStorage();
  const pricingStorage = initPricingStorage();
  const classStorage = initClassStorage();

  const rooms = roomStorage.ensureDefaults();
  const tickets = ticketStorage.ensureDefaults();
  const classes = classStorage.ensureDefaults();
  ensureMemberDefaults();

  const reservationState = {
    reservations: reservationStorage
      .loadReservations()
      .filter((item) => item?.type === "hoteling"),
  };

  const feeDropdownController = setupReservationFeeDropdowns(reservationModal, {
    iconOpen: "../../assets/iconDropdown.svg",
    iconFold: "../../assets/iconDropdown_fold.svg",
    onTabChanged: () => {
      syncHotelingFees();
    },
  });

  const modalState = {
    checkin: null,
    checkout: null,
    selectedMember: null,
    ticketOptions: [],
    ticketSelections: [],
    pickdropTicketOptions: [],
    pickdropTicketSelections: [],
    pickdrops: new Set(),
    preferredRoomIds: null,
    selectedTagFilters: [],
  };

  const dateSheetState = {
    checkin: null,
    checkout: null,
    currentDate: new Date(),
  };

  const getDateKey = (date) => getHotelingDateKey(date, timeZone);

  const getDateFromKey = (key) => {
    const parts = getDatePartsFromKey(key);
    if (!parts) {
      return null;
    }
    return new Date(parts.year, parts.month - 1, parts.day);
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

  const getNightKeys = () =>
    getHotelingNightKeys(modalState.checkin, modalState.checkout, timeZone);

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
      if (key < baseKey && (!pastCheckout || key > pastCheckout)) {
        pastCheckout = key;
      }
    });
    checkinKeys.forEach((key) => {
      if (!key || key === baseKey) {
        return;
      }
      if (key > baseKey && (!futureCheckin || key < futureCheckin)) {
        futureCheckin = key;
      }
    });
    return { pastCheckout, futureCheckin };
  };

  const getMonthStart = (date = new Date()) =>
    new Date(date.getFullYear(), date.getMonth(), 1);

  const cloneDate = (date) =>
    date instanceof Date && !Number.isNaN(date.getTime())
      ? new Date(date.getTime())
      : null;

  const formatDateLabel = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  const formatHotelingDateRangeValue = (checkin, checkout) => {
    if (!checkin || !checkout) {
      return "";
    }
    return `${formatDateLabel(checkin)} - ${formatDateLabel(checkout)}`;
  };

  const formatHotelingMonthLabel = (date) =>
    `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}`;

  const formatHotelingNightSummary = (checkin, checkout) => {
    if (!checkin || !checkout) {
      return "-박 -일";
    }
    const nightCount = getNightCount(checkin, checkout);
    if (typeof nightCount === "number" && nightCount >= 0) {
      return `${nightCount}박 ${nightCount + 1}일`;
    }
    return "-";
  };

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
    const selected = reservationModal.querySelector("[data-hoteling-room]:checked");
    return selected ? String(selected.value || "") : "";
  };

  const normalizeRoomId = (value) => {
    const raw = String(value || "");
    if (!raw) {
      return "";
    }
    if (raw.includes(":")) {
      const [, id] = raw.split(":");
      return id || "";
    }
    return raw;
  };

  const hasOverbookedAllocations = (allocations) =>
    Array.from(allocations?.values?.() || []).some(
      (allocation) => Number(allocation?.overbooked) > 0
    );

  const setPaymentTab = (tabKey = "ticket") => {
    const nextTabKey = tabKey === "other" ? "other" : "ticket";
    const feeTabs = reservationModal.querySelectorAll("[data-fee-tab]");
    const feePanels = reservationModal.querySelectorAll("[data-fee-panel]");
    feeTabs.forEach((button) => {
      const isActive = button.dataset.feeTab === nextTabKey;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    feePanels.forEach((panel) => {
      const isActive = panel.dataset.feePanel === nextTabKey;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  };

  const syncSubmitState = () => {
    if (!submitButton) {
      return;
    }
    const hasMember = Boolean(modalState.selectedMember);
    const hasRoom = Boolean(getSelectedRoomId());
    const hasDates = Boolean(modalState.checkin) && Boolean(modalState.checkout);
    submitButton.disabled = !(hasMember && hasRoom && hasDates);
  };

  const getDisplayedHotelingTicketOptions = (roomId = getSelectedRoomId()) =>
    getEligibleHotelingTicketOptions(rooms, modalState.ticketOptions, roomId);

  const renderRoomOptions = (preferredRoomIds = modalState.preferredRoomIds) => {
    renderHotelingRoomOptions(reservationModal, rooms, {
      preferredRoomIds,
      selectedRoomId: getSelectedRoomId(),
    });

    const roomInputs = reservationModal.querySelectorAll("[data-hoteling-room]");
    if (
      !reservationModal.querySelector("[data-hoteling-room]:checked")
      && preferredRoomIds instanceof Set
      && preferredRoomIds.size > 0
    ) {
      const fallbackInput = Array.from(roomInputs).find((input) =>
        preferredRoomIds.has(normalizeRoomId(input.value))
      );
      if (fallbackInput instanceof HTMLInputElement) {
        fallbackInput.checked = true;
        syncFilterChip(fallbackInput);
      }
    }
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

  const applyDefaultTicketsForSelectedRoom = (force = false) => {
    const selectedRoomId = getSelectedRoomId();
    const displayedOptions = getDisplayedHotelingTicketOptions(selectedRoomId);
    const availableIds = new Set(displayedOptions.map((option) => option.id));
    modalState.ticketSelections = modalState.ticketSelections.filter((id) => availableIds.has(id));

    if (!selectedRoomId) {
      return;
    }

    const normalizedSelectedRoomId = normalizeRoomId(selectedRoomId);
    const selectedRoom = rooms.find(
      (room) => normalizeRoomId(room?.id) === normalizedSelectedRoomId
    ) || null;
    if (!selectedRoom) {
      return;
    }

    const defaults = getDefaultHotelingTicketSelection([selectedRoom], modalState.ticketOptions)
      .filter((id) => availableIds.has(id));
    if ((force || modalState.ticketSelections.length === 0) && defaults.length > 0) {
      modalState.ticketSelections = defaults;
    }
  };

  const renderHotelingTickets = () => {
    if (!ticketList || !ticketEmpty) {
      return;
    }
    const displayOptions = getDisplayedHotelingTicketOptions();
    const availableIds = new Set(displayOptions.map((option) => option.id));
    modalState.ticketSelections = modalState.ticketSelections.filter((id) => availableIds.has(id));
    const nightCount = getNightCount(modalState.checkin, modalState.checkout) || 0;
    const optionMap = new Map(displayOptions.map((option) => [option.id, option]));
    const allocationResult = allocateTicketUsage(
      modalState.ticketSelections,
      optionMap,
      nightCount
    );
    renderTicketOptions(
      ticketList,
      ticketEmpty,
      displayOptions,
      modalState.ticketSelections,
      allocationResult.allocations,
      Boolean(modalState.selectedMember),
      nightCount,
      new Set()
    );
  };

  const updateRoomsForTickets = () => {
    const roomIds = getHotelingRoomIdsForTickets(
      rooms,
      modalState.ticketOptions,
      modalState.ticketSelections
    );
    modalState.preferredRoomIds = roomIds.size > 0 ? roomIds : null;
    renderRoomOptions(modalState.preferredRoomIds);
  };

  const applyMemberSelection = (member) => {
    const previousMemberId = String(modalState.selectedMember?.id || "");
    const nextMemberId = String(member?.id || "");
    if (previousMemberId !== nextMemberId) {
      modalState.checkin = null;
      modalState.checkout = null;
    }

    modalState.selectedMember = member || null;
    modalState.ticketOptions = member
      ? getHotelingTicketOptions(tickets, member.tickets)
      : [];
    modalState.ticketSelections = member
      ? getDefaultHotelingTicketSelection(rooms, modalState.ticketOptions)
      : [];
    modalState.pickdropTicketOptions = member
      ? getIssuedTicketOptions(tickets, member.tickets).filter(
        (option) => option.type === "pickdrop"
      )
      : [];
    modalState.pickdropTicketSelections = [];
    updateRoomsForTickets();
    applyDefaultTicketsForSelectedRoom(true);
    renderHotelingTickets();
    syncHotelingFees();
    closeHotelingDateSheet();
    syncCommittedDateUi();
    syncSubmitState();
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

    const roomId = getSelectedRoomId();
    const nightKeys = getNightKeys();
    const nightCount = getNightCount(modalState.checkin, modalState.checkout) || 0;
    const pickdropCount = getPickdropDateCount();

    renderHotelingFeeBreakdown({
      hotelingFeeContainer: hotelingFeeList,
      hotelingTotalEl: hotelingFeeTotal,
      totalEl: null,
      pricingItems: pricingStorage.loadPricingItems(),
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
      pricingItems: pricingStorage.loadPricingItems(),
      classes,
      services: new Set(),
      pickdrops: modalState.pickdrops,
      dateCount: pickdropCount,
      serviceDateCount: 0,
      pickdropDateCount: pickdropCount,
      selectedWeekdayCounts: new Map(),
      memberWeight: modalState.selectedMember?.weight,
    });

    const hotelingAmount = parseInt(hotelingFeeTotal?.dataset.feeAmount || "0", 10);
    const pickdropAmount = parseInt(pickdropFeeTotal?.dataset.feeAmount || "0", 10);
    const expectedTotal = hotelingAmount + pickdropAmount;
    hotelingTotalAll.textContent = expectedTotal > 0 ? `${expectedTotal.toLocaleString()}원` : "-";
    hotelingTotalAll.dataset.feeAmount = String(expectedTotal);

    const pickdropMap = new Map(modalState.pickdropTicketOptions.map((option) => [option.id, option]));
    const pickdropAllocation = allocateTicketUsage(
      modalState.pickdropTicketSelections,
      pickdropMap,
      pickdropCount
    );
    const hotelingOptionMap = new Map(modalState.ticketOptions.map((option) => [option.id, option]));
    const hotelingAllocation = allocateTicketUsage(
      modalState.ticketSelections,
      hotelingOptionMap,
      nightCount
    );

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

    const activeTab = reservationModal.querySelector(".reservation-fee-tab.is-active")?.dataset.feeTab;

    if (activeTab === "ticket") {
      if (modalState.ticketSelections.length > 0) {
        const meta = getSelectedReservationTicketMetaElement(ticketList);
        if (meta) {
          applyReservationTicketMetaAmount(hotelingTicketTotal, meta, {
            includeOverbooked: true,
          });
          const total = modalState.selectedMember?.totalReservableCountByType?.hoteling || 0;
          setReservationAmountRange(hotelingTicketTotal, total, total - nightCount, "박");
        }
      } else if (hotelingTicketTotal) {
        hotelingTicketTotal.innerHTML = `
          <span class="reservation-ticket-row__meta">
            <span class="as-is">-</span>
          </span>
        `;
      }

      if (modalState.pickdropTicketSelections.length > 0) {
        const meta = getSelectedReservationTicketMetaElement(pickdropTicketField);
        if (meta) {
          applyReservationTicketMetaAmount(pickdropTicketTotal, meta, {
            includeOverbooked: true,
          });
          const total = getPickdropReservableTotal(modalState.selectedMember?.totalReservableCountByType);
          setReservationAmountRange(pickdropTicketTotal, total, total - pickdropCount, "회");
        }
      } else if (pickdropTicketTotal) {
        pickdropTicketTotal.innerHTML = `
          <span class="reservation-ticket-row__meta">
            <span class="as-is">-</span>
          </span>
        `;
      }

      paymentTotalAll.textContent =
        modalState.ticketSelections.length > 0 || modalState.pickdropTicketSelections.length > 0
          ? "이용권 사용"
          : "-";
    } else if (activeTab === "other") {
      const otherValue = reservationOtherAmountInput?.value.replace(/,/g, "") || "0";
      paymentTotalAll.textContent = `${Number(otherValue).toLocaleString()}원`;
    }

    if (balanceTotal) {
      const paymentText = paymentTotalAll?.textContent || "-";
      if (paymentText === "이용권 사용") {
        balanceTotal.textContent = "이용권 사용";
        balanceRow?.classList.remove("is-positive");
      } else if (paymentText === "-") {
        balanceTotal.textContent = expectedTotal > 0 ? `${expectedTotal.toLocaleString()}원` : "0원";
        balanceRow?.classList.toggle("is-positive", expectedTotal > 0);
      } else {
        const paymentAmount = parseInt(paymentText.replace(/[^0-9]/g, "") || "0", 10);
        const balance = expectedTotal - paymentAmount;
        balanceTotal.textContent = `${balance.toLocaleString()}원`;
        balanceRow?.classList.toggle("is-positive", balance > 0);
      }
    }

    hotelingFeeStep?.classList.toggle(
      "is-overbooked",
      hasOverbookedAllocations(hotelingAllocation.allocations)
      || hasOverbookedAllocations(pickdropAllocation.allocations)
    );
  };

  const buildModalCells = (viewDate) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDay; i += 1) {
      cells.push({
        day: "",
        date: null,
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

    const trailing = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells.push({
        day: "",
        date: null,
        muted: true,
      });
    }

    return { year, month, cells };
  };

  const getDateSelectionContext = (selectionState) => {
    const checkinKey = selectionState.checkin ? getDateKey(selectionState.checkin) : "";
    const checkoutKey = selectionState.checkout ? getDateKey(selectionState.checkout) : "";
    const selectedRoomId = getSelectedRoomId();
    const isRoomUnselected = selectedRoomId.length === 0;
    const summary = getMemberRoomHotelingReservationSummary(
      reservationState.reservations,
      modalState.selectedMember,
      selectedRoomId
    );
    const nearestCheckoutSelectionKeys = getNearestCheckoutSelectionKeys(
      checkinKey,
      summary.checkoutKeys,
      summary.checkinKeys
    );
    const nextCheckinKey = checkinKey
      ? getNextHotelingCheckinKey(checkinKey, summary.checkinKeys)
      : "";
    const isSelectingCheckout = Boolean(checkinKey) && !checkoutKey;

    return {
      checkinKey,
      checkoutKey,
      summary,
      nextCheckinKey,
      nearestCheckoutSelectionKeys,
      isRoomUnselected,
      isSelectingCheckout,
    };
  };

  const applyDateSelection = (selectionState, nextDate) => {
    if (!(nextDate instanceof Date) || Number.isNaN(nextDate.getTime())) {
      return false;
    }
    const {
      checkinKey,
      summary,
      nearestCheckoutSelectionKeys,
      isSelectingCheckout,
    } = getDateSelectionContext(selectionState);
    const value = getDateKey(nextDate);
    const reservedCheckin = Boolean(summary?.checkinKeys?.has?.(value));
    const reservedCheckout = Boolean(summary?.checkoutKeys?.has?.(value));
    const isSelectingCheckin = !selectionState.checkin || Boolean(selectionState.checkout);
    const isNearestCheckoutException = isSelectingCheckout
      && (
        value === nearestCheckoutSelectionKeys.pastCheckout
        || value === nearestCheckoutSelectionKeys.futureCheckin
      );

    if (isSelectingCheckin && reservedCheckin && !reservedCheckout) {
      return false;
    }
    if (isSelectingCheckout && reservedCheckout && !reservedCheckin && !isNearestCheckoutException) {
      return false;
    }

    const isPastReservedCheckinBlocked = isSelectingCheckout
      && Boolean(checkinKey)
      && Boolean(value)
      && value < checkinKey
      && reservedCheckin;
    if (isPastReservedCheckinBlocked) {
      return false;
    }

    if (selectionState.checkin && !selectionState.checkout) {
      if (value && value === checkinKey) {
        return false;
      }
      if (value && checkinKey && value < checkinKey) {
        selectionState.checkin = nextDate;
        selectionState.checkout = null;
        return true;
      }
    }

    if (!selectionState.checkin || (selectionState.checkin && selectionState.checkout)) {
      selectionState.checkin = nextDate;
      selectionState.checkout = null;
      return true;
    }

    selectionState.checkout = nextDate;
    return true;
  };

  const syncCommittedDateUi = () => {
    if (dateInput) {
      dateInput.value = formatHotelingDateRangeValue(
        modalState.checkin,
        modalState.checkout
      );
    }
    if (nightSummaryEl) {
      nightSummaryEl.textContent = formatHotelingNightSummary(
        modalState.checkin,
        modalState.checkout
      );
    }
    renderHotelingTickets();
    syncHotelingFees();
    syncSubmitState();
  };

  const renderHotelingDateSheet = () => {
    if (!dateSheetMonths) {
      return;
    }

    const {
      checkinKey,
      checkoutKey,
      summary,
      nextCheckinKey,
      nearestCheckoutSelectionKeys,
      isRoomUnselected,
      isSelectingCheckout,
    } = getDateSelectionContext(dateSheetState);

    if (dateSheetSummary) {
      dateSheetSummary.value = formatHotelingDateRangeValue(
        dateSheetState.checkin,
        dateSheetState.checkout
      );
    }
    if (dateSheetSubmit) {
      dateSheetSubmit.disabled = !(dateSheetState.checkin && dateSheetState.checkout);
    }

    dateSheetMonths.innerHTML = "";

    const monthStart = getMonthStart(dateSheetState.currentDate);
    for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
      const viewDate = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + monthOffset,
        1
      );
      const { cells } = buildModalCells(viewDate);
      const section = document.createElement("section");
      section.className = "hoteling-date-sheet__month";
      section.innerHTML = `
        <h3 class="hoteling-date-sheet__month-title">${formatHotelingMonthLabel(viewDate)}</h3>
        ${getCalendarDayNamesMarkup("hoteling-date-sheet__day-names")}
      `;

      const grid = document.createElement("div");
      grid.className = "hoteling-date-sheet__grid";

      cells.forEach((cellData) => {
        if (!cellData.date) {
          const blankCell = document.createElement("span");
          blankCell.className = "hoteling-date-sheet__cell hoteling-date-sheet__cell--blank";
          grid.appendChild(blankCell);
          return;
        }

        const dateKey = getDateKey(cellData.date);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "hoteling-date-sheet__cell";
        cell.dataset.hotelingDateSheetDate = dateKey;
        cell.textContent = String(cellData.day);

        if (dateKey === checkinKey || dateKey === checkoutKey) {
          cell.classList.add("is-selected");
        }
        if (
          checkinKey
          && checkoutKey
          && dateKey > checkinKey
          && dateKey < checkoutKey
        ) {
          cell.classList.add("is-in-range");
        }

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

        if (isPastReservedCheckinBlocked || (((isDisabled || isRoomUnselected) && !isNearestCheckoutException))) {
          cell.classList.add("is-disabled");
          cell.disabled = true;
        }

        const hasCheckin = summary.checkinKeys.has(dateKey);
        const hasCheckout = summary.checkoutKeys.has(dateKey);
        const appendMark = (kind, iconName, label) => {
          const icon = document.createElement("img");
          icon.className = `hoteling-calendar__mark hoteling-calendar__mark--${kind}`;
          if (hasCheckin && hasCheckout) {
            icon.classList.add("hoteling-calendar__mark--stacked");
          }
          icon.src = `${HOTELING_ASSET_PREFIX}${iconName}`;
          icon.alt = label;
          cell.appendChild(icon);
        };

        if (hasCheckout) {
          appendMark("checkout", "iconCheckout.svg", "퇴실");
        }
        if (hasCheckin) {
          appendMark("checkin", "iconCheckin.svg", "입실");
        }

        grid.appendChild(cell);
      });

      section.appendChild(grid);
      dateSheetMonths.appendChild(section);
    }
  };

  const closeHotelingDateSheet = () => {
    setSheetOpen(dateSheet, dateSheetBackdrop, false);
  };

  const openHotelingDateSheet = () => {
    dateSheetState.checkin = cloneDate(modalState.checkin);
    dateSheetState.checkout = cloneDate(modalState.checkout);
    dateSheetState.currentDate = getMonthStart(
      dateSheetState.checkin || new Date()
    );
    setSheetOpen(dateSheet, dateSheetBackdrop, true);
    renderHotelingDateSheet();
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

  const resetFormState = () => {
    const now = new Date();
    modalState.checkin = null;
    modalState.checkout = null;
    modalState.preferredRoomIds = null;
    modalState.pickdrops = new Set();
    modalState.selectedTagFilters = [];

    const checkinTimeInput = reservationModal.querySelector("[data-hoteling-checkin-time]");
    const checkoutTimeInput = reservationModal.querySelector("[data-hoteling-checkout-time]");
    if (checkinTimeInput) {
      checkinTimeInput.value = "10:00";
    }
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

    reservationModal.querySelectorAll("[data-hoteling-room]").forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
        syncFilterChip(input);
      }
    });

    feeDropdownController.reset();
    closeHotelingDateSheet();
    applyMemberSelection(null);
  };

  const navigateBack = (dateKey = "", toastKey = "") => {
    const nextUrl = buildHotelsPageUrl(dateKey, toastKey);
    if (typeof onBack === "function") {
      onBack(nextUrl);
      return;
    }
    window.location.href = nextUrl;
  };

  document.querySelector("[data-reservation-page-back]")?.addEventListener("click", () => {
    navigateBack();
  });

  dateInput?.addEventListener("focus", () => {
    dateInput.blur();
    openHotelingDateSheet();
  });

  bindReservationMemberSearchEvents({
    memberInput,
    memberResults,
    renderMemberResults,
  });

  memberClear?.addEventListener("click", () => {
    if (memberInput) {
      memberInput.value = "";
    }
    applyMemberSelection(null);
    memberResults?.classList.remove("is-open");
  });

  reservationModal.addEventListener("input", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) {
      return;
    }
    if (input.matches("[data-reservation-other-amount]")) {
      formatReservationCurrencyInput(input);
      syncHotelingFees();
    }
  });

  reservationModal.addEventListener("change", (event) => {
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
      updateRoomsForTickets();
      renderHotelingTickets();
      syncHotelingFees();
      return;
    }
    if (input.matches("[data-hoteling-room]")) {
      modalState.checkin = null;
      modalState.checkout = null;
      closeHotelingDateSheet();
      reservationModal.querySelectorAll("[data-hoteling-room]").forEach((roomInput) => {
        syncFilterChip(roomInput);
      });
      applyDefaultTicketsForSelectedRoom(true);
      renderHotelingTickets();
      syncHotelingFees();
      syncCommittedDateUi();
      syncSubmitState();
    }
  });

  reservationModal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-hoteling-date-trigger]")) {
      event.preventDefault();
      openHotelingDateSheet();
      return;
    }

    if (
      target.closest("[data-hoteling-date-sheet-close]")
      || target.closest("[data-hoteling-date-sheet-backdrop]")
    ) {
      closeHotelingDateSheet();
      return;
    }

    const dateCell = target.closest("[data-hoteling-date-sheet-date]");
    if (dateCell && dateSheetMonths?.contains(dateCell)) {
      const nextDate = getDateFromKey(dateCell.getAttribute("data-hoteling-date-sheet-date"));
      if (applyDateSelection(dateSheetState, nextDate)) {
        renderHotelingDateSheet();
      }
      return;
    }

    if (target.closest("[data-hoteling-date-sheet-submit]")) {
      if (!dateSheetState.checkin || !dateSheetState.checkout) {
        return;
      }
      modalState.checkin = cloneDate(dateSheetState.checkin);
      modalState.checkout = cloneDate(dateSheetState.checkout);
      closeHotelingDateSheet();
      syncCommittedDateUi();
      return;
    }

    if (!target.closest("[data-hoteling-submit]")) {
      return;
    }

    const formData = collectHotelingReservationFormData(reservationModal, modalState);
    const { checkinDate, checkoutDate, checkinTime, checkoutTime } = formData;
    if (!formData.room || !checkinDate || !checkoutDate) {
      return;
    }

    const activePaymentTab =
      reservationModal.querySelector(".reservation-fee-tab.is-active")?.dataset?.feeTab || "ticket";
    const rawPaymentMethod = activePaymentTab === "other"
      ? (
        reservationPaymentTypeInput instanceof HTMLSelectElement
          ? reservationPaymentTypeInput.value
          : PAYMENT_METHODS.CASH
      )
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

    const newReservation = {
      id: createId(),
      type: "hoteling",
      memberId: String(formData.memberId || modalState.selectedMember?.id || ""),
      room: formData.room,
      memo: formData.memo,
      status: STATUS.PLANNED,
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
      const builtUsageMap = buildDateTicketUsageMap(
        getNightKeys(),
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
    const reservationWithBilling = applyHotelingDateFees(newReservation, memberWeight);
    const savedReservations = reservationStorage.addReservation(reservationWithBilling);
    reservationState.reservations = savedReservations.filter((item) => item?.type === "hoteling");

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

    const updateDetail = {
      reservationId: reservationWithBilling.id,
      dateKey: checkinDate,
      kind: "checkin",
    };
    if (typeof onReservationUpdated === "function") {
      onReservationUpdated(updateDetail);
    }
    document.dispatchEvent(new CustomEvent("reservation:updated", { detail: updateDetail }));
    showToast("예약이 등록되었습니다.");
    resetFormState();
  });

  const params = new URLSearchParams(window.location.search);
  const selectedMemberId = params.get("memberId") || "";
  if (selectedMemberId) {
    const member = loadIssueMembers().find(
      (item) => String(item?.id || "") === String(selectedMemberId)
    ) || null;
    if (member) {
      applyMemberSelection(member);
      if (memberInput) {
        memberInput.value = `${member.dogName} / ${member.owner}`;
      }
    }
  } else {
    resetFormState();
  }

  if (selectedMemberId) {
    syncCommittedDateUi();
  }

  return {
    applyMemberSelection,
  };
}
