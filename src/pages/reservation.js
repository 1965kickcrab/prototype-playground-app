import { initClassStorage } from "../storage/class-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { initOperationsStorage } from "../storage/operations-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import {
  applyReservationTicketMetaAmount,
  bindReservationMemberSearchEvents,
  bindReservationMonthNavigation,
  consumeReservationModalQuery,
  formatReservationCurrencyInput,
  getSelectedReservationTicketMetaElement,
  getActiveServiceFeeTargets as resolveActiveServiceFeeTargets,
  getActiveServiceTicketTargets as resolveActiveServiceTicketTargets,
  getServiceContextKey as resolveServiceContextKey,
  renderReservationContextualLabels,
  setReservationAmountRange,
  setReservationModalVisibility,
  createReservationModalElements,
} from "../components/reservation-modal-dom.js";
import { renderPricingBreakdown, renderPickdropTickets } from "../components/reservation-fee.js";
import { renderTicketOptions } from "../components/reservation-ticket-view.js";
import { renderMemberSearchResults } from "../components/member-search.js";
import { syncReservationFeeTotal } from "../utils/reservation-fee-total.js";
import { setupReservationFeeDropdowns } from "../utils/reservation-fee-dropdown.js";
import { syncFilterChip } from "../utils/dom.js";
import { notifyReservationUpdated } from "../utils/reservation-events.js";
import { getTimeZone } from "../utils/timezone.js";
import { isDayoffDate } from "../utils/dayoff.js";
import {
  applyReservationToMember,
  applyReservationToMemberTickets,
  loadIssueMembers,
} from "../storage/ticket-issue-members.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import {
  allocateTicketUsage,
  buildPickdropUsagePlan,
  getDefaultTicketSelection,
  getIssuedTicketOptions,
} from "../services/ticket-reservation-service.js";
import { formatTicketPrice, getTicketUnitLabel } from "../services/ticket-service.js";
import { hasMemberDaycareTimeConflict } from "../services/member-reservation-summary.js";
import {
  buildDateTicketUsagesMap,
  getEntryTicketUsages,
  mergeTicketUsagesForDate,
} from "../services/ticket-usage-service.js";
import { createId } from "../utils/id.js";
import {
  getPickdropReservableTotal,
  normalizePickdropFlags,
  resolvePickdropTicketCountType,
} from "../services/pickdrop-policy.js";
import {
  PAYMENT_METHODS,
  parsePaymentAmount,
  normalizeReservationPayment,
} from "../services/reservation-payment.js";
import {
  getDefaultDaycareTimes,
  getDaycareDurationMinutes,
} from "../services/daycare-duration.js";
import { calculateDateEntryFee } from "../services/reservation-date-fee.js";
import { buildReservationWithBilling } from "../services/reservation-billing.js";
import {
  RESERVATION_LIMIT,
  allocateCountsByClass,
  applyAutoWeekdaySelection,
  applyPickdropSelection,
  applyServiceSelection,
  buildCalendarCells,
  buildClassTicketMap,
  createReservationFormState,
  filterConflictingDates,
  formatDateKey,
  formatMonthLabel,
  getActiveDates,
  getBillingExpectedByDateMap,
  getClassRemainingMinimum,
  getConflictDates,
  getContextFilteredServiceOptions,
  getEffectiveTicketLimit,
  getEligibleTicketOptions,
  getMemberAutoSelectionOptions,
  getMemberTicketClassNames,
  getMemberTotalReservableCount,
  getNumericValue,
  getReservationCount,
  getReservationMode,
  getReservableTicketOptions,
  getSelectedReservationCount,
  getSelectedServiceType,
  getSelectedWeekdayCounts,
  getServiceOptions,
  getSortedDateKeys,
  getModalCalendarState,
  hasPickdropPricing,
  pruneConflictingDates,
  resetReservationFormState,
  resolveReservationModalScope,
  setCountValue,
  splitPaymentAmountByEntries,
  toggleDate,
} from "../services/reservation-modal-helpers.js";

const PICKDROP_OPTIONS = [
  { value: "pickup", label: "픽업" },
  { value: "dropoff", label: "드랍" },
];

function showToast(message) {
  let toast = document.querySelector("[data-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.dataset.toast = "true";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");

  setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function syncCounts(state, elements, classes = []) {
  const scope = resolveReservationModalScope(state, classes, elements);
  const mode = getReservationMode(elements);
  const activeDates = getActiveDates(state, elements);
  const serviceType = scope.serviceType;
  const memberLimit = getMemberTotalReservableCount(state, serviceType);
  const current = memberLimit === null
    ? getReservationCount(state, elements)
    : activeDates?.size || 0;
  const limit = memberLimit === null
    ? getEffectiveTicketLimit(state, classes, activeDates?.size || 0)
    : memberLimit;

  setCountValue(elements.countCurrent, current);
  setCountValue(elements.countLimit, limit, {
    minDisplayValue: 0,
    negativeClassName: "is-over-limit",
  });

  const currentValue = getNumericValue(elements.countCurrent, current);
  const limitValue = getNumericValue(elements.countLimit, limit);
  const exceedsLimit = currentValue > limitValue;
  const diff = exceedsLimit ? currentValue - limitValue : 0;
  const shouldHighlightCounts = exceedsLimit
    && Boolean(state.selectedMember)
    && scope.usesCountLimit;

  elements.countError.hidden = !exceedsLimit;
  elements.countDiff.textContent = diff === 0 ? "" : String(diff);
  elements.overrideCheckbox.disabled = !exceedsLimit;
  elements.countsSummary?.classList.toggle("is-over-limit", shouldHighlightCounts);
}

function isSubmitEnabled(state, elements) {
  const scope = resolveReservationModalScope(state, [], elements);
  const activeDates = getActiveDates(state, elements);
  const hasService = state.services.size > 0;
  const hasMember = Boolean(state.selectedMember);
  const hasDates = activeDates.size > 0;
  const hasDaycareTime = !scope.usesTimeRange || (
    Boolean(elements.daycareStartTime?.value || "")
    && Boolean(elements.daycareEndTime?.value || "")
  );
  return hasService && hasMember && hasDates && hasDaycareTime;
}

function getPickdropCtaLabel(modal, activeDateCount) {
  if (modal?.dataset?.reservationPage === "true" && modal?.dataset?.reservationPageType === "school") {
    return "픽드랍까지";
  }
  return activeDateCount > 0 ? "픽드랍까지 예약" : "픽드랍만 예약";
}

function isDedicatedPickdropPage(modal) {
  return modal?.dataset?.reservationPage === "true"
    && modal?.dataset?.reservationPageType === "pickdrop";
}

function syncActionState(state, elements, classes = []) {
  const {
    submitBar,
    submitSummary,
    submitSummaryCurrent,
    submitSummaryLimit,
    submitButton,
    nextButton,
    overrideCheckbox,
    pickdropToggle,
    modal,
  } = elements;
  const scope = resolveReservationModalScope(state, classes, elements);
  const mode = getReservationMode(elements);
  const activeDates = getActiveDates(state, elements);
  const limit = getNumericValue(elements.countLimit, RESERVATION_LIMIT);
  const serviceType = scope.serviceType;
  const memberLimit = getMemberTotalReservableCount(state, serviceType);
  const current = memberLimit === null
    ? getReservationCount(state, elements)
    : activeDates?.size || 0;
  const exceedsLimit = current > limit;
  const pageSubmitOverride = modal?.dataset?.reservationPage === "true";
  const summarySelectedCount = activeDates?.size || 0;
  const summaryReservableCount = Boolean(state.selectedMember) && state.services?.size
    ? (
      Number.isFinite(memberLimit)
        ? Math.max(memberLimit, 0)
        : (Number.isFinite(state.ticketLimit) ? Math.max(state.ticketLimit, 0) : 0)
    )
    : 0;
  const pageExceedsLimit = scope.usesCountLimit && summarySelectedCount > summaryReservableCount;
  const effectiveExceedsLimit = pageSubmitOverride ? pageExceedsLimit : exceedsLimit;
  const allowOverLimit = !scope.usesCountLimit || pageSubmitOverride;
  const enabled = isSubmitEnabled(state, elements)
    && (!effectiveExceedsLimit || allowOverLimit || overrideCheckbox.checked);
  const isPickdropMode = Boolean(modal?.classList?.contains("is-pickdrop"));
  const dedicatedPickdropPage = isDedicatedPickdropPage(modal);
  if (submitBar && pageSubmitOverride) {
    submitBar.hidden = summarySelectedCount === 0;
  }
  if (submitSummary && pageSubmitOverride) {
    submitSummary.classList.toggle("is-over-limit", pageExceedsLimit);
  }
  if (submitSummaryCurrent && pageSubmitOverride) {
    submitSummaryCurrent.textContent = String(summarySelectedCount);
  }
  if (submitSummaryLimit && pageSubmitOverride) {
    submitSummaryLimit.textContent = `${summaryReservableCount}회`;
  }
  if (submitButton) {
    submitButton.disabled = isPickdropMode ? false : !enabled;
    if (dedicatedPickdropPage) {
      submitButton.textContent = "이전";
      submitButton.classList.remove("button-secondary--danger");
    } else if (pageSubmitOverride) {
      submitButton.textContent = pageExceedsLimit ? "초과 등록" : "등록";
      submitButton.classList.toggle("button-secondary--danger", pageExceedsLimit);
    }
  }
  const hasMember = Boolean(state.selectedMember);
  const canGoToPickdrop = hasMember;
  if (pickdropToggle) {
    pickdropToggle.disabled = isPickdropMode ? !enabled : !canGoToPickdrop;
    if (!isPickdropMode) {
      pickdropToggle.textContent = getPickdropCtaLabel(modal, activeDates.size);
    }
  }
  if (nextButton) {
    nextButton.disabled = !enabled;
  }
  overrideCheckbox.disabled = !scope.usesCountLimit || !exceedsLimit;
}

function renderMiniCalendar(state, elements, calendarState = {}, options = {}) {
  const { miniGrid, miniCurrent } = elements;
  if (!miniGrid || !miniCurrent) return;

  const { year, month, cells } = buildCalendarCells(state.miniViewDate);
  const todayKey = formatDateKey(new Date());
  const dayoffSettings = options.dayoffSettings;
  const timeZone = options.timeZone;
  const selectedDates = options.selectedDates instanceof Set
    ? options.selectedDates
    : state.selectedDates;
  const blockedDates = calendarState?.blockedDates instanceof Set
    ? calendarState.blockedDates
    : new Set();
  const infoDates = calendarState?.infoDates instanceof Set
    ? calendarState.infoDates
    : new Set();
  miniCurrent.textContent = formatMonthLabel(state.miniViewDate);
  miniGrid.innerHTML = "";

  cells.forEach((cellData, idx) => {
    const cell = document.createElement("div");
    cell.className = "mini-calendar__cell";
    if (cellData.muted) cell.classList.add("mini-calendar__cell--muted");
    const dateKey = formatDateKey(cellData.date);
    if (dateKey === todayKey && !cellData.muted) {
      cell.classList.add("mini-calendar__cell--today");
    }
    if (selectedDates.has(dateKey) || blockedDates.has(dateKey)) {
      cell.classList.add("mini-calendar__cell--selected");
    }
    if (blockedDates.has(dateKey) || infoDates.has(dateKey)) {
      cell.classList.add("mini-calendar__cell--disabled");
      cell.setAttribute("aria-disabled", "true");
    }
    cell.dataset.index = String(idx);
    cell.dataset.date = dateKey;
    const dateLabel = document.createElement("span");
    dateLabel.className = "mini-calendar__date";
    dateLabel.textContent = String(cellData.day);
    cell.appendChild(dateLabel);
    const isDayoff = !cellData.muted
      && dayoffSettings
      && isDayoffDate(dateKey, dayoffSettings, timeZone);
    if (isDayoff) {
      const tag = document.createElement("span");
      tag.className = "mini-calendar__dayoff";
      tag.textContent = "휴무";
      cell.appendChild(tag);
    }
    miniGrid.appendChild(cell);
  });
}

function renderServiceOptions(container, serviceOptions, selectedServices) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  const modal = container.closest("[data-reservation-modal]");
  const selectedOption = serviceOptions.find((option) => selectedServices.has(option.value));
  const hasSelectedMember = Boolean(selectedOption) || Boolean(modal?.querySelector("[data-member-input]")?.value);
  const serviceFieldValue = modal?.querySelector("[data-reservation-service-value]");
  if (serviceFieldValue) {
    serviceFieldValue.textContent = hasSelectedMember
      ? (selectedOption?.label || "클래스를 선택하세요")
      : "회원을 먼저 선택해 주세요.";
  }

  serviceOptions.forEach((option) => {
    const label = document.createElement("label");
    label.className = "reservation-service-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "reservation-service";
    input.value = option.value;
    input.checked = selectedServices.has(option.value);
    input.setAttribute("data-reservation-service", "");

    const text = document.createElement("span");
    text.textContent = option.label;

    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function resetForm(state, elements, options = {}) {
  resetReservationFormState(state, options.currentDate);
  elements.memberInput.value = "";
  if (elements.memberResults) {
    elements.memberResults.innerHTML = "";
  }
  elements.overrideCheckbox.checked = false;
  if (elements.daycareStartTime instanceof HTMLInputElement) {
    elements.daycareStartTime.value = "";
  }
  if (elements.daycareEndTime instanceof HTMLInputElement) {
    elements.daycareEndTime.value = "";
  }
  if (elements.memoInput) {
    elements.memoInput.value = "";
  }

  [ 
    [elements.schoolTicketContainer, elements.schoolTicketPlaceholder],
    [elements.daycareTicketContainer, elements.daycareTicketPlaceholder],
  ].forEach(([container, placeholder]) => {
    renderTicketOptions(
      container,
      placeholder,
      [],
      [],
      new Map(),
      false,
      0,
      new Set()
    );
    if (container) {
      container.hidden = true;
      container.textContent = "";
    }
    if (placeholder) {
      placeholder.hidden = true;
    }
  });

  if (elements.serviceContainer) {
    elements.serviceContainer
      .querySelectorAll("[data-reservation-service]")
      .forEach((input) => {
        input.checked = false;
      });
  }
  if (elements.serviceValue) {
    elements.serviceValue.textContent = "회원을 먼저 선택해 주세요.";
  }
  elements.pickdropInputs.forEach((input) => {
    input.checked = false;
    syncFilterChip(input);
  });

  renderMiniCalendar(
    state,
    elements,
    new Set(),
    {
      dayoffSettings: options.dayoffSettings,
      timeZone: options.timeZone,
      selectedDates: getActiveDates(state, elements),
    }
  );
  if (elements.daycareRow) {
    elements.daycareRow.hidden = true;
  }
  if (elements.countsRow) {
    elements.countsRow.hidden = false;
  }
  const classes = typeof options.getClasses === "function"
    ? options.getClasses()
    : [];
  syncCounts(state, elements, classes);
  syncActionState(state, elements, classes);
  if (elements.stepOne) {
    elements.stepOne.hidden = false;
  }
  if (elements.stepTwo) {
    elements.stepTwo.hidden = false;
  }
}

function applyMemberClassSelection(state, elements, classNames) {
  const selectedName = Array.isArray(classNames) ? classNames[0] : "";
  state.services = selectedName ? new Set([selectedName]) : new Set();
  if (!elements.serviceContainer) {
    return;
  }
  elements.serviceContainer
    .querySelectorAll("[data-reservation-service]")
    .forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.checked = input.value === selectedName;
    });
}

export function setupReservationModal(state, storage, options = {}) {
  const {
    pageMode = false,
    openOnInit = false,
    initialContext = "school",
    onClose = null,
    memberSearchMode = "inline",
  } = options;
  const openButton = document.querySelector("[data-reservation-open]");
  const serviceMenu = document.querySelector("[data-reservation-service-menu]");
  const modal = document.querySelector("[data-reservation-modal]");

  if (!modal) {
    return;
  }
  if (pageMode) {
    modal.dataset.reservationPage = "true";
  } else {
    delete modal.dataset.reservationPage;
  }

  const timeZone = getTimeZone();
  const serviceOptions = getServiceOptions(state);
  const classStorage = initClassStorage();
  const ticketStorage = initTicketStorage();
  const operationsStorage = initOperationsStorage();
  const pricingStorage = initPricingStorage();
  const overlay = modal.querySelector("[data-reservation-overlay]");
  const closeButton = modal.querySelector("[data-reservation-close]");
  const entryOptionButtons = serviceMenu
    ? Array.from(serviceMenu.querySelectorAll("[data-reservation-entry-option]"))
    : [];
  const elements = createReservationModalElements(modal);
  const {
    serviceContainer,
    serviceTrigger,
    serviceSheet,
    serviceSheetBackdrop,
    serviceSheetClose,
    memberInput,
    memberResults,
    miniGrid,
    miniPrev,
    miniNext,
    pickdropInputs,
    overrideCheckbox,
    progress,
    progressSteps,
    pickdropToggle,
    submitButton,
  } = elements;
  let lastModalTrigger = null;
  const memberClear = modal.querySelector("[data-member-clear]");
  const memberRow = modal.querySelector(".reservation-row--member");
  const feeDropdownController = setupReservationFeeDropdowns(modal, {
    iconOpen: "../assets/iconDropdown.svg",
    iconFold: "../assets/iconDropdown_fold.svg",
    onTabChanged: () => {
      syncPricingFee();
    },
  });

  const formState = createReservationFormState(state.currentDate);

  const getModalScope = (options = {}) => resolveReservationModalScope(
    formState,
    classStorage.ensureDefaults(),
    elements,
    options
  );

  const syncCalendarState = (scope = getModalScope()) => {
    const calendarState = getModalCalendarState(formState, storage, scope, elements);
    formState.conflicts = calendarState.blockedDates;
    formState.calendarInfoDates = calendarState.infoDates;
    renderMiniCalendar(formState, elements, calendarState, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    return calendarState;
  };

  const renderContextualLabels = () => {
    const scope = getModalScope({ ignorePickdrop: true });
    renderReservationContextualLabels({
      modal,
      progressSteps: elements.progressSteps,
      stepTitle: elements.stepTitle,
      serviceFeeTitle: elements.serviceFeeTitle,
      serviceTicketTitle: elements.serviceTicketTitle,
      context: formState.context || "school",
      scope,
      isPickdropMode: modal?.classList?.contains("is-pickdrop"),
    });
  };

  const getServiceContextKey = () =>
    resolveServiceContextKey(getModalScope({ ignorePickdrop: true }).contextKey);

  const getActiveServiceFeeTargets = () => {
    return resolveActiveServiceFeeTargets(elements, getModalScope({ ignorePickdrop: true }));
  };

  const getActiveServiceTicketTargets = () => {
    return resolveActiveServiceTicketTargets(elements, getModalScope({ ignorePickdrop: true }));
  };

  const resetAmountDisplay = (amountEl) => {
    if (!amountEl) {
      return;
    }
    amountEl.innerHTML = `
      <span class="reservation-ticket-row__meta">
        <span class="as-is">-</span>
      </span>
    `;
    amountEl.classList.toggle("is-empty", false);
    delete amountEl.dataset.feeAmount;
  };

  const syncServiceOptionsForContext = (fallbackToFirst = false) => {
    const classes = classStorage.ensureDefaults();
    const filteredServiceOptions = getContextFilteredServiceOptions(
      serviceOptions,
      classes,
      formState.context
    );
    if (!formState.selectedMember) {
      formState.services = new Set();
    }
    const selectedName = Array.from(formState.services)[0] || "";
    const validValues = new Set(
      filteredServiceOptions.map((option) => String(option?.value || ""))
    );
    if (selectedName && !validValues.has(selectedName)) {
      formState.services = new Set();
    }
    if (
      fallbackToFirst
      && !formState.services.size
      && formState.selectedMember
      && filteredServiceOptions.length > 0
    ) {
      formState.services = new Set([filteredServiceOptions[0].value]);
    }
    renderServiceOptions(serviceContainer, filteredServiceOptions, formState.services);
  };

  const syncFeeDisclosure = (isPickdropMode) => {
    // Replaced by segmented layout, but keeping for compatibility if needed.
    // In new layout, Area 1 (Total) and Area 2 (Payment) are always open.
  };

  const setPickdropMode = (enabled, options = {}) => {
    if (enabled) {
      formState.context = options.context
        || formState.context
        || "school";
    }
    modal.classList.toggle("is-pickdrop", enabled);
    renderContextualLabels();
    if (progress) {
      progress.classList.toggle("is-pickdrop", enabled);
    }
    if (progressSteps && progressSteps.length) {
      progressSteps.forEach((step) => {
        const target = step.dataset.reservationProgressStep;
        const shouldActivate = enabled ? target === "2" : target === "1";
        const shouldComplete = enabled && target === "1";
        step.classList.toggle("is-active", shouldActivate);
        step.classList.toggle("is-complete", shouldComplete);
      });
    }
    if (pickdropToggle) {
      pickdropToggle.classList.toggle("is-active", enabled);
      pickdropToggle.setAttribute("aria-pressed", String(enabled));
      if (enabled) {
        pickdropToggle.textContent = "등록";
      } else {
        const activeDates = getActiveDates(formState, elements);
        pickdropToggle.textContent = getPickdropCtaLabel(modal, activeDates.size);
      }
    }
    if (submitButton) {
      submitButton.textContent = enabled ? "이전" : "등록";
    }
    if (memberInput) {
      memberInput.disabled = enabled;
    }
    if (memberClear) {
      memberClear.disabled = enabled;
    }
    if (memberRow) {
      memberRow.classList.toggle("is-disabled", enabled);
    }
    if (memberResults && enabled) {
      memberResults.classList.remove("is-open");
    }
    syncFeeDisclosure(enabled);

    // Context-aware Fee Segment Folding
    // Area 2 (Payment) Segments:
    const schoolTicketSegment = modal.querySelector('[data-reservation-fee-segment="school-ticket"]');
    const daycareTicketSegment = modal.querySelector('[data-reservation-fee-segment="daycare-ticket"]');
    const pickdropTicketSegment = modal.querySelector('[data-reservation-fee-segment="pickdrop-ticket"]');

    // Area 1 (Fee) Segments:
    const schoolFeeSegment = modal.querySelector('[data-reservation-fee-segment="school-fee"]');
    const daycareFeeSegment = modal.querySelector('[data-reservation-fee-segment="daycare-fee"]');
    const pickdropFeeSegment = modal.querySelector('[data-reservation-fee-segment="pickdrop-fee"]');

    const toggleSegment = (segment, shouldOpen) => {
      if (!segment) return;
      const body = segment.querySelector(".reservation-fee-segment__body");
      const arrow = segment.querySelector(".reservation-fee-segment__arrow");
      if (body) body.hidden = !shouldOpen;
      if (arrow) {
        arrow.src = shouldOpen ? "../assets/iconDropdown.svg" : "../assets/iconDropdown_fold.svg";
        // Ensure no rotation class conflicts if any
        arrow.classList.toggle("is-rotated", false);
      }
    };

    const serviceContextKey = getServiceContextKey();
    const activeServiceTicketSegment = serviceContextKey === "daycare"
      ? daycareTicketSegment
      : schoolTicketSegment;
    const inactiveServiceTicketSegment = serviceContextKey === "daycare"
      ? schoolTicketSegment
      : daycareTicketSegment;
    const activeServiceFeeSegment = serviceContextKey === "daycare"
      ? daycareFeeSegment
      : schoolFeeSegment;
    const inactiveServiceFeeSegment = serviceContextKey === "daycare"
      ? schoolFeeSegment
      : daycareFeeSegment;

    if (enabled) {
      // Pickdrop Mode: Fold School, Open Pickdrop
      toggleSegment(activeServiceTicketSegment, false);
      toggleSegment(activeServiceFeeSegment, false);
      toggleSegment(inactiveServiceTicketSegment, false);
      toggleSegment(inactiveServiceFeeSegment, false);

      toggleSegment(pickdropTicketSegment, true);
      toggleSegment(pickdropFeeSegment, true);
    } else {
      // Service Mode: Open active context segment, fold others/pickdrop
      toggleSegment(activeServiceTicketSegment, true);
      toggleSegment(activeServiceFeeSegment, true);
      toggleSegment(inactiveServiceTicketSegment, false);
      toggleSegment(inactiveServiceFeeSegment, false);

      toggleSegment(pickdropTicketSegment, false);
      toggleSegment(pickdropFeeSegment, false);
    }
    if (enabled) {
      formState.schoolSelections = [...formState.ticketSelections];
      formState.ticketSelections = [];

      if (!formState.pickdropDatesInitialized) {
        const pickdropLimit = getPickdropReservableTotal(formState.selectedMember?.totalReservableCountByType);
        let initialDates = Array.from(formState.selectedDates);
        initialDates.sort();

        if (Number.isFinite(pickdropLimit) && pickdropLimit > 0 && initialDates.length > pickdropLimit) {
          initialDates = initialDates.slice(0, pickdropLimit);
        }
        formState.pickdropDates = new Set(initialDates);
      }
      formState.conflicts = getConflictDates(formState, storage, getModalScope(), elements);
      if (options.preservePickdropSelection === true) {
        pickdropInputs.forEach((input) => {
          if (!(input instanceof HTMLInputElement)) {
            return;
          }
          input.checked = formState.pickdrops.has(input.value);
          syncFilterChip(input);
        });
      } else {
        const pricingItems = pricingStorage.loadPricingItems();
        const hasOneway = hasPickdropPricing(pricingItems, "편도");
        const hasRoundtrip = hasPickdropPricing(pricingItems, "왕복");
        const shouldSelectPickup = hasOneway || hasRoundtrip;
        const shouldSelectDropoff = hasOneway || hasRoundtrip;
        formState.pickdrops = new Set();
        pickdropInputs.forEach((input) => {
          if (!(input instanceof HTMLInputElement)) {
            return;
          }
          const shouldCheck = input.value === "pickup"
            ? shouldSelectPickup
            : input.value === "dropoff" && shouldSelectDropoff;
          input.checked = shouldCheck;
          if (shouldCheck) {
            formState.pickdrops.add(input.value);
          }
          syncFilterChip(input);
        });
      }
      syncPricingFee();
      formState.pickdropSelectionsInitialized = options.preservePickdropSelection === true
        ? formState.pickdrops.size > 0
        : false;
      formState.pickdropDatesInitialized = true;
    } else {
      formState.pickdrops = new Set();
      formState.conflicts = getConflictDates(formState, storage, getModalScope(), elements);
      pickdropInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) {
          return;
        }
        input.checked = false;
        syncFilterChip(input);
      });
      syncPricingFee();
      formState.ticketSelections = [...formState.schoolSelections];
    }
    const scope = getModalScope();
    const conflicts = getConflictDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    syncCalendarState(scope);
    syncTicketSection();
    syncPickdropTickets();
  };

  const getTickets = () => ticketStorage.ensureDefaults();
  const getDayoffSettings = () => operationsStorage.loadSettings();
  const getMemberTickets = (memberId) => {
    if (!memberId) {
      return [];
    }
    const members = loadIssueMembers();
    const member = members.find((item) => String(item.id) === String(memberId));
    if (member) {
      formState.selectedMember = member;
    }
    return Array.isArray(member?.tickets) ? member.tickets : [];
  };

  const syncPickdropTickets = () => {
    const mode = getReservationMode(elements);
    if (elements.pickdropTicketField) {
      elements.pickdropTicketField.hidden = mode !== "pickdrop";
    }
    if (mode !== "pickdrop") {
      if (elements.pickdropTicketField) {
        elements.pickdropTicketField.textContent = "";
      }
      if (elements.pickdropTicketEmpty) {
        elements.pickdropTicketEmpty.hidden = true;
      }
      formState.pickdropAllocationMap = new Map();
      formState.pickdropRemainingMap = new Map();
      return;
    }
    const pickdropLimit = getPickdropReservableTotal(
      formState.selectedMember?.totalReservableCountByType
    );
    const forceEmpty = Number.isFinite(pickdropLimit) && pickdropLimit <= 0;
    const pickdropOptions = formState.ticketOptions.filter(
      (ticket) => ticket.type === "pickdrop"
    );
    const pickdropMap = new Map(
      pickdropOptions.map((ticket) => [ticket.id, ticket])
    );
    const activeDates = getActiveDates(formState, elements);
    const allocationResult = allocateTicketUsage(
      formState.ticketSelections,
      pickdropMap,
      activeDates.size
    );
    formState.pickdropAllocationMap = new Map(allocationResult.allocations);
    formState.pickdropRemainingMap = new Map(
      pickdropOptions.map((ticket) => [
        ticket.id,
        Number(ticket.remainingCount) || 0,
      ])
    );
    renderPickdropTickets(
      elements.pickdropTicketField,
      formState.ticketOptions,
      formState.ticketSelections,
      allocationResult.allocations,
      Boolean(formState.selectedMember),
      true,
      elements.pickdropTicketEmpty,
      forceEmpty
    );
    if (elements.feePickdropCard) {
      const hasOverbooked = Array.from(allocationResult.allocations.values()).some(
        (allocation) => Number(allocation?.overbooked) > 0
      );
      elements.feePickdropCard.classList.toggle("is-overbooked", hasOverbooked);
    }
  };

  const sumSelectionRemaining = (selectionOrder, allocations, remainingMap) => {
    if (!Array.isArray(selectionOrder) || selectionOrder.length === 0) {
      return { remainingBefore: 0, remainingAfter: 0 };
    }
    let remainingBefore = 0;
    let remainingAfter = 0;
    selectionOrder.forEach((ticketId) => {
      const allocation = allocations?.get?.(ticketId);
      if (allocation) {
        remainingBefore += Number(allocation.remainingBefore) || 0;
        remainingAfter += Number(allocation.remainingAfter) || 0;
        return;
      }
      const fallback = Number(remainingMap?.get?.(ticketId)) || 0;
      remainingBefore += fallback;
      remainingAfter += fallback;
    });
    return { remainingBefore, remainingAfter };
  };

  const getServiceUsageUnitsPerDate = (serviceType) => {
    if (serviceType !== "daycare") {
      return 1;
    }
    const durationMinutes = getDaycareDurationMinutes(
      elements.daycareStartTime?.value || "",
      elements.daycareEndTime?.value || ""
    );
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(durationMinutes / 60));
  };

  const getServiceRequestedUsageCount = (serviceType, dateCount) => {
    const safeDateCount = Math.max(0, Number(dateCount) || 0);
    return safeDateCount * getServiceUsageUnitsPerDate(serviceType);
  };

  const buildServiceUsagePlanByDate = ({
    dateKeys,
    selectionOrder,
    usedMap,
    unitsPerDate,
  }) => {
    const dates = Array.isArray(dateKeys) ? dateKeys : [];
    const perDateUnits = Math.max(1, Number(unitsPerDate) || 1);
    const usagePool = [];
    if (usedMap instanceof Map && Array.isArray(selectionOrder)) {
      selectionOrder.forEach((ticketId) => {
        const count = Number(usedMap.get(ticketId)) || 0;
        for (let index = 0; index < count; index += 1) {
          usagePool.push(ticketId);
        }
      });
    }
    return dates.map((_dateKey, index) => {
      const startIndex = index * perDateUnits;
      return usagePool.slice(startIndex, startIndex + perDateUnits);
    });
  };

  const applyFeeAmountText = (amountEl) => {
    if (!amountEl) return;
    const feeAmount = Number(amountEl.dataset.feeAmount);
    const hasFeeAmount = Number.isFinite(feeAmount);
    const text = hasFeeAmount ? formatTicketPrice(Math.max(feeAmount, 0)) : "-";
    amountEl.textContent = text;
    amountEl.classList.toggle("is-empty", text === "-");
  };

  const syncFeeCardState = () => {
    const mode = getReservationMode(elements);
    const scope = getModalScope({ ignorePickdrop: true });
    const activeDates = getActiveDates(formState, elements);
    const serviceSelectionOrder = mode === "pickdrop" ? formState.schoolSelections : formState.ticketSelections;
    const pickdropSelectionOrder = mode === "pickdrop" ? formState.ticketSelections : [];

    const hasServiceSelection = serviceSelectionOrder.length > 0;
    const hasPickdropSelection = pickdropSelectionOrder.length > 0;

    const serviceType = scope.serviceType;
    const serviceTicketTargets = getActiveServiceTicketTargets();

    // 1. Service Payment Area (Area 2) by current context
    if (serviceTicketTargets.inactiveTotal) {
      resetAmountDisplay(serviceTicketTargets.inactiveTotal);
    }
    if (serviceTicketTargets.activeTotal) {
      if (hasServiceSelection) {
        const totalReservable = formState.selectedMember?.totalReservableCountByType?.[serviceType] || 0;
        const requestedUsage = getServiceRequestedUsageCount(serviceType, activeDates.size);
        setReservationAmountRange(
          serviceTicketTargets.activeTotal,
          totalReservable,
          totalReservable - requestedUsage,
          getTicketUnitLabel(serviceType)
        );
      } else {
        resetAmountDisplay(serviceTicketTargets.activeTotal);
      }
    }

    // 2. Pickdrop Payment Area (Area 2)
    if (elements.pickdropTicketTotal) {
      if (hasPickdropSelection) {
        const selectedMeta = getSelectedReservationTicketMetaElement(elements.pickdropTicketField);
        if (selectedMeta) {
          applyReservationTicketMetaAmount(elements.pickdropTicketTotal, selectedMeta);

          const totalReservable = getPickdropReservableTotal(formState.selectedMember?.totalReservableCountByType) || 0;
          // Calculate pickdrop usage
          const pickdropFlags = normalizePickdropFlags({
            pickup: formState.pickdrops.has("pickup"),
            dropoff: formState.pickdrops.has("dropoff"),
          });
          const hasAnyPickdrop = pickdropFlags.pickup || pickdropFlags.dropoff;
          const pickdropUsageCount = hasAnyPickdrop ? formState.pickdropDates?.size || 0 : 0;
          setReservationAmountRange(
            elements.pickdropTicketTotal,
            totalReservable,
            totalReservable - pickdropUsageCount
          );
        }
      } else {
        elements.pickdropTicketTotal.innerHTML = `
          <span class="reservation-ticket-row__meta">
            <span class="reservation-ticket-row__meta-value">-</span>
          </span>
        `;
      }
    }

    // 3. Area 2 Group Total (결제 영역 상단)
    if (elements.paymentTotalAll) {
      const activeTab = modal.querySelector(".reservation-fee-tab.is-active")?.dataset.feeTab;
      if (activeTab === "ticket") {
        if (hasServiceSelection || hasPickdropSelection) {
          elements.paymentTotalAll.textContent = "이용권 사용";
        } else {
          elements.paymentTotalAll.textContent = "-";
        }
      } else if (activeTab === "other") {
        const otherInput = modal.querySelector("[data-reservation-other-amount]");
        // Remove commas before parsing for logic, but for display (if used raw) keep formatting
        const otherValue = otherInput?.value.replace(/,/g, "") || "0";
        elements.paymentTotalAll.textContent = `${Number(otherValue).toLocaleString()}원`;
      }
    }

    // Sync Balance (잔여)
    if (elements.balanceTotal) {
      let totalPricing = parseInt(elements.pricingTotalValue?.dataset.feeAmount || "0", 10);
      if (totalPricing === 0 && elements.pricingTotalValue?.textContent) {
        totalPricing = parseInt(elements.pricingTotalValue.textContent.replace(/[^0-9]/g, "") || "0", 10);
      }
      const paymentText = elements.paymentTotalAll?.textContent || "0";
      let paymentAmount = 0;

      // Logic Update: If Ticket is used for payment, Balance should say "이용권 사용"
      if (paymentText === "이용권 사용") {
        elements.balanceTotal.textContent = "이용권 사용";
        elements.balanceRow?.classList.remove("is-positive");
      } else {
        // Cash/Card/Transfer payment
        paymentAmount = parseInt(paymentText.replace(/[^0-9]/g, "") || "0", 10);
        const balance = totalPricing - paymentAmount;
        const balanceText = `${balance.toLocaleString()}원`;
        // Handle negative balance display if needed, or just show signed value
        elements.balanceTotal.textContent = balanceText; // User reported only minus sign attached, meaning simple calc.
        // If balance > 0 => Red
        if (balance > 0) {
          elements.balanceRow?.classList.add("is-positive");
        } else {
          elements.balanceRow?.classList.remove("is-positive");
        }
      }
    }
  };

  const syncPricingFee = () => {
    const mode = getReservationMode(elements);
    const activeDates = getActiveDates(formState, elements);
    const serviceDates = mode === "pickdrop" ? formState.selectedDates : activeDates;
    const pickdropDates = mode === "pickdrop" ? formState.pickdropDates : activeDates;
    const serviceFeeTargets = getActiveServiceFeeTargets();
    const classes = classStorage.ensureDefaults();
    const scope = getModalScope({ ignorePickdrop: true });
    const serviceType = scope.serviceType;

    if (serviceFeeTargets.inactiveList) {
      serviceFeeTargets.inactiveList.textContent = "";
    }
    if (serviceFeeTargets.inactiveTotal) {
      resetAmountDisplay(serviceFeeTargets.inactiveTotal);
    }

    if (!isDaycareFeeReady()) {
      if (serviceFeeTargets.activeList) {
        serviceFeeTargets.activeList.textContent = "";
      }
      if (serviceFeeTargets.activeTotal) {
        resetAmountDisplay(serviceFeeTargets.activeTotal);
      }
      if (elements.pricingTotalValue) {
        resetAmountDisplay(elements.pricingTotalValue);
        delete elements.pricingTotalValue.dataset.feeAmount;
      }
      syncFeeCardState();
      const feeTotalGroup = modal.querySelector('[data-fee-group="total"]');
      syncReservationFeeTotal(feeTotalGroup, elements.pricingTotalValue);
      return;
    }

    renderPricingBreakdown({
      schoolFeeContainer: serviceFeeTargets.activeList,
      pickdropFeeContainer: elements.pickdropFeeList,
      schoolTotalEl: serviceFeeTargets.activeTotal,
      pickdropTotalEl: elements.pickdropFeeTotal,
      totalEl: elements.pricingTotalValue,
      pricingItems: pricingStorage.loadPricingItems(),
      classes,
      services: formState.services,
      pickdrops: formState.pickdrops,
      dateCount: activeDates.size,
      serviceDateCount: serviceDates.size,
      pickdropDateCount: pickdropDates.size,
      selectedWeekdayCounts: getSelectedWeekdayCounts(serviceDates, timeZone),
      memberWeight: formState.selectedMember?.weight,
      timeZone,
      serviceTimeRange: {
        checkinTime: elements.daycareStartTime?.value || "",
        checkoutTime: elements.daycareEndTime?.value || "",
      },
      serviceLabelOverride: scope.activeServiceLabel,
      serviceTypeOverride: serviceType,
    });
    syncFeeCardState();
    const feeTotalGroup = modal.querySelector('[data-fee-group="total"]');
    syncReservationFeeTotal(feeTotalGroup, elements.pricingTotalValue);
  };

  const applyDaycareDefaultTimes = () => {
    if (!(elements.daycareStartTime instanceof HTMLInputElement)) {
      return;
    }
    if (!(elements.daycareEndTime instanceof HTMLInputElement)) {
      return;
    }
    if (formState.daycareDefaultsInitialized || formState.daycareTimesEdited) {
      return;
    }
    if (elements.daycareStartTime.value || elements.daycareEndTime.value) {
      formState.daycareDefaultsInitialized = true;
      return;
    }
    const defaults = getDefaultDaycareTimes(new Date(), timeZone);
    elements.daycareStartTime.value = defaults.checkinTime;
    elements.daycareEndTime.value = defaults.checkoutTime;
    formState.daycareDefaultsInitialized = true;
  };

  const syncScopeUI = (scope = getModalScope({ ignorePickdrop: true })) => {
    const isDaycareContext = scope.usesTimeRange;
    if (elements.countsRow) {
      elements.countsRow.hidden = !scope.usesCountLimit;
    }
    if (elements.daycareRow) {
      elements.daycareRow.hidden = !scope.usesTimeRange;
    }
    if (isDaycareContext) {
      applyDaycareDefaultTimes();
    }
    syncPricingFee();
    return isDaycareContext;
  };

  const isDaycareFeeReady = () => {
    const scope = getModalScope({ ignorePickdrop: true });
    if (!scope.usesTimeRange) {
      return true;
    }
    const activeDates = getActiveDates(formState, elements);
    const startTime = elements.daycareStartTime?.value || "";
    const endTime = elements.daycareEndTime?.value || "";
    const durationMinutes = getDaycareDurationMinutes(startTime, endTime);
    return Boolean(formState.selectedMember)
      && activeDates.size > 0
      && Boolean(startTime)
      && Boolean(endTime)
      && Number.isFinite(durationMinutes)
      && durationMinutes > 0;
  };

  const syncTicketSection = () => {
    const classes = classStorage.ensureDefaults();
    const mode = getReservationMode(elements);
    const scope = getModalScope({ ignorePickdrop: true });
    const serviceTicketTargets = getActiveServiceTicketTargets();
    const ticketContainer = serviceTicketTargets.activeContainer;
    const ticketPlaceholder = serviceTicketTargets.activePlaceholder;
    if (ticketContainer) {
      ticketContainer.hidden = false;
    }
    if (ticketPlaceholder) {
      ticketPlaceholder.hidden = !formState.selectedMember;
    }
    if (serviceTicketTargets.inactiveContainer) {
      serviceTicketTargets.inactiveContainer.hidden = true;
      serviceTicketTargets.inactiveContainer.textContent = "";
    }
    if (serviceTicketTargets.inactivePlaceholder) {
      serviceTicketTargets.inactivePlaceholder.hidden = true;
    }
    const schoolType = scope.serviceType;
    const activeDates = getActiveDates(formState, elements);
    const serviceDates = filterConflictingDates(
      formState.selectedDates,
      formState.conflicts
    );
    const serviceUsageCount = getServiceRequestedUsageCount(
      schoolType,
      serviceDates.size
    );
    const eligibleOptions = getEligibleTicketOptions(
      formState.ticketOptions,
      formState.services,
      classes,
      schoolType
    );
    const pickdropOptions = formState.ticketOptions.filter(
      (ticket) => ticket.type === "pickdrop"
    );
    const serviceOptions = eligibleOptions.filter(
      (ticket) => ticket.type === schoolType
    );
    const hasNoReservableTickets = mode !== "pickdrop" && serviceOptions.length === 0;
    if (hasNoReservableTickets) {
      if (ticketContainer) {
        ticketContainer.textContent = "";
      }
      if (ticketPlaceholder) {
        ticketPlaceholder.hidden = !formState.selectedMember;
      }
      formState.ticketSelections = [];
      formState.schoolSelections = [];
      formState.ticketLimit = 0;
      formState.schoolAllocationMap = new Map();
      formState.schoolRemainingMap = new Map();
      syncPickdropTickets();
      syncCounts(formState, elements, classes);
      syncActionState(formState, elements, classes);
      syncPricingFee();
      return;
    }
    const displayOptions = serviceOptions;
    const disabledIds = mode === "pickdrop"
      ? new Set(serviceOptions.map((ticket) => ticket.id))
      : new Set();
    const schoolAllocationMap = new Map();
    const schoolRemainingMap = new Map();

    if (mode === "pickdrop") {
      const pickdropMap = new Map(
        pickdropOptions.map((ticket) => [ticket.id, ticket])
      );
      formState.ticketSelections = formState.ticketSelections.filter((id) =>
        pickdropMap.has(id)
      );
      if (
        !formState.pickdropSelectionsInitialized
        && formState.ticketSelections.length === 0
        && pickdropOptions.length > 0
      ) {
        formState.ticketSelections = pickdropOptions.map((ticket) => ticket.id);
        formState.pickdropSelectionsInitialized = true;
      }
      formState.ticketLimit = pickdropOptions.reduce(
        (sum, ticket) => sum + (Number(ticket.remainingCount) || 0),
        0
      );
      if (serviceOptions.length > 0) {
        const classTicketMap = buildClassTicketMap(
          classes,
          formState.services,
          serviceOptions
        );
        const availableMap = new Map(
          serviceOptions.map((ticket) => {
            const remainingRaw = Number(ticket.remainingCount);
            const remainingAfter = Number.isFinite(remainingRaw)
              ? Math.max(remainingRaw, 0)
              : 0;
            return [
              ticket.id,
              {
                ...ticket,
                remainingCount: remainingAfter,
              },
            ];
          })
        );
        availableMap.forEach((ticket, ticketId) => {
          schoolRemainingMap.set(
            ticketId,
            Number(ticket.remainingCount) || 0
          );
        });
        const selectedRemainingMap = new Map(
          formState.schoolSelections.map((ticketId) => [
            ticketId,
            availableMap.get(ticketId)?.remainingCount ?? 0,
          ])
        );
        const selectionCounts = new Map(
          Array.from(formState.services).map((className) => [
            className,
            serviceUsageCount,
          ])
        );
        const selectionAllocation = allocateCountsByClass({
          classCounts: selectionCounts,
          classTicketMap,
          ticketOrder: formState.schoolSelections,
          ticketRemainingMap: selectedRemainingMap,
        });
        formState.schoolSelections.forEach((ticketId) => {
          const remainingBefore = selectedRemainingMap.get(ticketId) || 0;
          const remainingAfter = selectionAllocation.remainingMap.get(ticketId)
            ?? remainingBefore;
          schoolAllocationMap.set(ticketId, {
            remainingBefore,
            remainingAfter,
            used: Math.max(remainingBefore - remainingAfter, 0),
          });
        });
      }
      renderTicketOptions(
        ticketContainer,
        ticketPlaceholder,
        displayOptions,
        formState.schoolSelections,
        schoolAllocationMap,
        Boolean(formState.selectedMember),
        getReservationCount(formState, elements),
        disabledIds,
        mode === "pickdrop"
      );
      formState.schoolAllocationMap = schoolAllocationMap;
      formState.schoolRemainingMap = schoolRemainingMap;
    } else {
      const classTicketMap = buildClassTicketMap(
        classes,
        formState.services,
        displayOptions
      );
      const availableMap = new Map(
        displayOptions.map((ticket) => {
          const remainingRaw = Number(ticket.remainingCount);
          const remainingAfter = Number.isFinite(remainingRaw)
            ? Math.max(remainingRaw, 0)
            : 0;
          return [
            ticket.id,
            {
              ...ticket,
              remainingCount: remainingAfter,
            },
          ];
        })
      );
      const availableIds = displayOptions
        .map((ticket) => ({
          id: ticket.id,
          remaining: availableMap.get(ticket.id)?.remainingCount ?? 0,
        }))
        .filter((item) => Number(item.remaining) > 0)
        .map((item) => item.id);
      formState.ticketSelections = formState.ticketSelections.filter((id) =>
        availableIds.includes(id)
      );
      const selectedRemainingMap = new Map(
        formState.ticketSelections.map((ticketId) => [
          ticketId,
          availableMap.get(ticketId)?.remainingCount ?? 0,
        ])
      );
      const selectionCounts = new Map(
        Array.from(formState.services).map((className) => [
          className,
          serviceUsageCount,
        ])
      );
      const selectionAllocation = allocateCountsByClass({
        classCounts: selectionCounts,
        classTicketMap,
        ticketOrder: formState.ticketSelections,
        ticketRemainingMap: selectedRemainingMap,
      });
      const selectionAllocations = new Map(
        formState.ticketSelections.map((ticketId) => {
          const remainingBefore = selectedRemainingMap.get(ticketId) || 0;
          const remainingAfter = selectionAllocation.remainingMap.get(ticketId)
            ?? remainingBefore;
          return [
            ticketId,
            {
              remainingBefore,
              remainingAfter,
              used: Math.max(remainingBefore - remainingAfter, 0),
            },
          ];
        })
      );
      availableMap.forEach((ticket, ticketId) => {
        schoolRemainingMap.set(
          ticketId,
          Number(ticket.remainingCount) || 0
        );
      });
      const minRemaining = getClassRemainingMinimum({
        services: formState.services,
        classTicketMap,
        ticketRemainingMap: selectedRemainingMap,
      });
      formState.ticketLimit = scope.usesTimeRange
        ? minRemaining
        : minRemaining * Math.max(formState.services.size, 0);
      renderTicketOptions(
        ticketContainer,
        ticketPlaceholder,
        displayOptions,
        formState.ticketSelections,
        selectionAllocations,
        Boolean(formState.selectedMember),
        getReservationCount(formState, elements),
        disabledIds
      );
      formState.schoolSelections = [...formState.ticketSelections];
      formState.schoolAllocationMap = selectionAllocations;
      formState.schoolRemainingMap = schoolRemainingMap;
    }
    syncPickdropTickets();
    syncCounts(formState, elements, classes);
    syncActionState(formState, elements, classes);
    syncPricingFee();
  };

  const applyDefaultTickets = (classes, force = false) => {
    const defaults = getDefaultTicketSelection(
      classes,
      formState.services,
      formState.ticketOptions
    );
    if (!defaults.length) {
      return;
    }
    if (force || formState.ticketSelections.length === 0) {
      formState.ticketSelections = defaults;
    }
  };

  const refreshTicketOptions = (forceDefaults = false, autoOverrides = null) => {
    const tickets = getTickets();
    const memberId = formState.selectedMember?.id;
    const memberTickets = getMemberTickets(memberId);
    formState.ticketOptions = getReservableTicketOptions(
      getIssuedTicketOptions(
        tickets,
        memberTickets
      )
    );
    const availableIds = formState.ticketOptions.map((ticket) => ticket.id);
    formState.ticketSelections = formState.ticketSelections.filter((id) =>
      availableIds.includes(id)
    );
    const classes = classStorage.ensureDefaults();
    const scope = getModalScope();
    applyDefaultTickets(classes, forceDefaults);
    const conflicts = pruneConflictingDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    const dayoffSettings = getDayoffSettings();
    syncTicketSection();
    syncPickdropTickets();
    const mode = getReservationMode(elements);
    const selectedClassType = scope.serviceType;
    const totalLimitValue = Number(
      formState.selectedMember?.totalReservableCountByType?.[selectedClassType]
    );
    const shouldAutoSelect =
      !(Number.isFinite(totalLimitValue) && totalLimitValue <= 0);
    const autoChanged = mode === "pickdrop" || !shouldAutoSelect
      ? false
      : applyAutoWeekdaySelection(
        formState,
        conflicts,
        timeZone,
        true,
        dayoffSettings,
        autoOverrides || {}
      );
    syncCalendarState(scope);
    if (autoChanged) {
      syncTicketSection();
    }
    syncScopeUI(scope);
  };

  const memberSelectOptions = {
    onMemberSelect: (member) => {
      const tickets = getTickets();
      formState.ticketOptions = getReservableTicketOptions(
        getIssuedTicketOptions(
          tickets,
          getMemberTickets(member.id)
        )
      );
      formState.ticketSelections = [];
      const classes = classStorage.ensureDefaults();
      const classNames = getMemberTicketClassNames(
        classes,
        formState.ticketOptions,
        serviceOptions
      );
      applyMemberClassSelection(formState, elements, classNames);
      syncServiceOptionsForContext(false);
      const autoOverrides = getMemberAutoSelectionOptions(
        formState,
        classes,
        timeZone
      );
      refreshTicketOptions(true, autoOverrides);
    },
    getClasses: () => classStorage.ensureDefaults(),
  };

  const renderMemberResults = () => {
    renderMemberSearchResults({
      memberInput: elements.memberInput,
      memberResults: elements.memberResults,
      members: loadIssueMembers(),
      tagCatalog: loadMemberTagCatalog(),
      selectedTags: formState.selectedTagFilters,
      tagFilterMode: "all",
      onTagFilterChange: (tags) => {
        formState.selectedTagFilters = Array.isArray(tags) ? tags : [];
        renderMemberResults();
        elements.memberResults?.classList.add("is-open");
      },
      onSelect: (member) => {
        formState.selectedMember = member;
        if (elements.memberInput) {
          elements.memberInput.value = `${member.dogName} / ${member.owner}`;
        }
        if (elements.memberResults) {
          elements.memberResults.innerHTML = "";
        }
        if (typeof memberSelectOptions.onMemberSelect === "function") {
          memberSelectOptions.onMemberSelect(member);
        }
        const classes = typeof memberSelectOptions.getClasses === "function"
          ? memberSelectOptions.getClasses()
          : [];
        syncActionState(formState, elements, classes);
      },
    });
  };

  const syncMemberInputValue = (value = "") => {
    if (elements.memberInput instanceof HTMLInputElement) {
      elements.memberInput.value = value;
    }
  };

  const setPaymentTab = (tabKey = "ticket") => {
    const nextTabKey = tabKey === "other" ? "other" : "ticket";
    const feeTabs = modal.querySelectorAll("[data-fee-tab]");
    const feePanels = modal.querySelectorAll("[data-fee-panel]");
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

  const buildMemberSearchDraft = () => ({
    context: formState.context,
    selectedMemberId: String(formState.selectedMember?.id || ""),
    services: Array.from(formState.services),
    pickdrops: Array.from(formState.pickdrops),
    selectedDates: Array.from(formState.selectedDates),
    pickdropDates: Array.from(formState.pickdropDates),
    selectedTagFilters: Array.isArray(formState.selectedTagFilters)
      ? [...formState.selectedTagFilters]
      : [],
    ticketSelections: [...formState.ticketSelections],
    schoolSelections: [...formState.schoolSelections],
    miniViewDate: formState.miniViewDate instanceof Date
      ? formState.miniViewDate.toISOString()
      : "",
    memberInputValue: elements.memberInput?.value || "",
    memo: elements.memoInput?.value || "",
    daycareStartTime: elements.daycareStartTime?.value || "",
    daycareEndTime: elements.daycareEndTime?.value || "",
    paymentTab: modal.querySelector(".reservation-fee-tab.is-active")?.dataset?.feeTab || "ticket",
    paymentMethod: elements.otherPaymentType?.value || "",
    paymentAmount: elements.otherPaymentAmount?.value || "",
    overrideChecked: Boolean(overrideCheckbox?.checked),
    pickdropMode: modal.classList.contains("is-pickdrop"),
  });

  const restoreMemberSearchDraft = (draft = {}, options = {}) => {
    if (!draft || typeof draft !== "object") {
      return false;
    }
    const nextMemberId = String(options.selectedMemberId || draft.selectedMemberId || "");
    const sameMember = nextMemberId && nextMemberId === String(draft.selectedMemberId || "");
    resetForm(formState, elements, {
      currentDate: state.currentDate,
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    formState.context = String(draft.context || "").trim().toLowerCase() === "daycare"
      ? "daycare"
      : "school";
    formState.selectedTagFilters = Array.isArray(draft.selectedTagFilters)
      ? [...draft.selectedTagFilters]
      : [];
    if (draft.miniViewDate) {
      const nextDate = new Date(draft.miniViewDate);
      if (!Number.isNaN(nextDate.getTime())) {
        formState.miniViewDate = nextDate;
      }
    }
    syncMemberInputValue(draft.memberInputValue || "");
    if (elements.memoInput) {
      elements.memoInput.value = String(draft.memo || "");
    }
    if (elements.daycareStartTime instanceof HTMLInputElement) {
      elements.daycareStartTime.value = String(draft.daycareStartTime || "");
    }
    if (elements.daycareEndTime instanceof HTMLInputElement) {
      elements.daycareEndTime.value = String(draft.daycareEndTime || "");
    }
    if (elements.otherPaymentType instanceof HTMLSelectElement) {
      const nextMethod = String(draft.paymentMethod || "").trim().toLowerCase();
      elements.otherPaymentType.value = nextMethod === "transfer" ? "bank" : (nextMethod || "cash");
    }
    if (elements.otherPaymentAmount instanceof HTMLInputElement) {
      const nextAmount = String(draft.paymentAmount || "").trim();
      elements.otherPaymentAmount.value = nextAmount;
      formatReservationCurrencyInput(elements.otherPaymentAmount);
    }
    if (overrideCheckbox instanceof HTMLInputElement) {
      overrideCheckbox.checked = Boolean(draft.overrideChecked);
    }
    formState.pickdrops = new Set(Array.isArray(draft.pickdrops) ? draft.pickdrops : []);
    pickdropInputs.forEach((input) => {
      input.checked = formState.pickdrops.has(input.value);
      syncFilterChip(input);
    });
    if (nextMemberId) {
      applyMemberSelection(nextMemberId);
    }
    const restoredServices = Array.isArray(draft.services)
      ? draft.services.filter((value) => typeof value === "string" && value.trim().length > 0)
      : [];
    if (restoredServices.length > 0) {
      formState.services = new Set(restoredServices);
    }
    syncServiceOptionsForContext(false);
    formState.selectedDates = new Set(
      Array.isArray(draft.selectedDates)
        ? draft.selectedDates.filter((value) => typeof value === "string" && value)
        : []
    );
    formState.pickdropDates = new Set(
      Array.isArray(draft.pickdropDates)
        ? draft.pickdropDates.filter((value) => typeof value === "string" && value)
        : []
    );
    formState.pickdropSelectionsInitialized = formState.pickdrops.size > 0;
    formState.pickdropDatesInitialized = formState.pickdropDates.size > 0;
    formState.ticketSelections = sameMember && Array.isArray(draft.ticketSelections)
      ? [...draft.ticketSelections]
      : [];
    formState.schoolSelections = sameMember && Array.isArray(draft.schoolSelections)
      ? [...draft.schoolSelections]
      : [];
    const scope = getModalScope();
    const conflicts = pruneConflictingDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    syncCalendarState(scope);
    syncScopeUI(scope);
    refreshTicketOptions(true);
    if (draft.pickdropMode) {
      setPickdropMode(true, {
        preservePickdropSelection: Boolean(draft.useSchoolPickdropDefaults)
          || (Array.isArray(draft.pickdrops) && draft.pickdrops.length > 0),
      });
    } else {
      setPickdropMode(false);
    }
    setPaymentTab(draft.paymentTab);
    syncActionState(formState, elements, classStorage.ensureDefaults());
    syncPricingFee();
    syncPickdropTickets();
    return true;
  };

  const applyMemberSelection = (memberId) => {
    const members = loadIssueMembers();
    const member = members.find((item) => String(item.id) === String(memberId));
    if (!member) {
      return false;
    }
    formState.selectedMember = member;
    if (elements.memberInput) {
      elements.memberInput.value = `${member.dogName} / ${member.owner}`;
    }
    elements.memberResults?.replaceChildren();
    if (typeof memberSelectOptions.onMemberSelect === "function") {
      memberSelectOptions.onMemberSelect(member);
    }
    const classes = typeof memberSelectOptions.getClasses === "function"
      ? memberSelectOptions.getClasses()
      : [];
    syncActionState(formState, elements, classes);
    return true;
  };

  const openModal = (options = {}) => {
    const activeElement = document.activeElement;
    lastModalTrigger = activeElement instanceof HTMLElement && !modal.contains(activeElement)
      ? activeElement
      : openButton;
    if (options.context) {
      formState.context = String(options.context).trim().toLowerCase() === "daycare"
        ? "daycare"
        : "school";
    }
    setReservationModalVisibility(modal, true);
    formState.selectedTagFilters = [];
    setPickdropMode(false);
    syncServiceOptionsForContext(false);
    if (elements.stepOne) {
      elements.stepOne.hidden = false;
    }
    if (elements.stepTwo) {
      elements.stepTwo.hidden = false;
    }
    if (memberSearchMode !== "page") {
      renderMemberResults(formState, elements, memberSelectOptions);
    }
    const scope = getModalScope();
    const conflicts = pruneConflictingDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    syncCalendarState(scope);
    syncScopeUI(scope);
    refreshTicketOptions();
    syncPricingFee();
    syncPickdropTickets();
  };

  const closeServiceMenu = () => {
    if (!serviceMenu) {
      return;
    }
    serviceMenu.classList.remove("is-open");
    serviceMenu.hidden = true;
    openButton?.setAttribute("aria-expanded", "false");
  };

  const setServiceSheetOpen = (open) => {
    const isOpen = Boolean(open);
    if (serviceSheet) {
      serviceSheet.hidden = !isOpen;
    }
    if (serviceSheetBackdrop) {
      serviceSheetBackdrop.hidden = !isOpen;
    }
    if (serviceTrigger instanceof HTMLButtonElement) {
      serviceTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  };

  const toggleServiceMenu = () => {
    if (!serviceMenu) {
      openModal();
      return;
    }
    const shouldOpen = !serviceMenu.classList.contains("is-open");
    serviceMenu.classList.toggle("is-open", shouldOpen);
    serviceMenu.hidden = !shouldOpen;
    openButton?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  };

  const pickServiceNameByType = (targetType) => {
    const classes = classStorage.ensureDefaults();
    const availableOptions = getContextFilteredServiceOptions(
      serviceOptions,
      classes,
      targetType
    );
    const firstOption = availableOptions[0];
    return typeof firstOption === "string"
      ? firstOption
      : String(firstOption?.value || "");
  };

  const applyEntryServiceType = (targetType) => {
    formState.context = String(targetType || "").trim().toLowerCase() === "daycare"
      ? "daycare"
      : "school";
    renderContextualLabels();
    syncServiceOptionsForContext(false);
    const serviceName = pickServiceNameByType(targetType);
    if (!serviceName) {
      syncScopeUI(getModalScope({ ignorePickdrop: true }));
      return;
    }
    formState.services = new Set([serviceName]);
    syncServiceOptionsForContext(false);
    const scope = getModalScope();
    const conflicts = pruneConflictingDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    syncCalendarState(scope);
    syncScopeUI(scope);
    refreshTicketOptions(true);
  };

  const openModalFromQuery = () => {
    const queryValues = consumeReservationModalQuery({
      flagKey: "reservation",
      extraKeys: ["memberId", "pickdrop"],
    });
    if (!queryValues) {
      return;
    }
    const memberId = queryValues.memberId;
    openModal();
    if (memberId) {
      applyMemberSelection(memberId);
    }
    const pickdropMode = queryValues.pickdrop === "1";
    if (pickdropMode) {
      setPickdropMode(true);
    }
  };

  const closeModal = () => {
    setServiceSheetOpen(false);
    if (pageMode) {
      if (typeof onClose === "function") {
        onClose();
        return;
      }
      window.history.back();
      return;
    }
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && modal.contains(activeElement)) {
      const focusTarget = lastModalTrigger instanceof HTMLElement && document.contains(lastModalTrigger)
        ? lastModalTrigger
        : openButton;
      if (focusTarget instanceof HTMLElement && !modal.contains(focusTarget)) {
        focusTarget.focus();
      } else {
        activeElement.blur();
      }
    }
    setReservationModalVisibility(modal, false);
    setPickdropMode(false);
    resetForm(formState, elements, {
      currentDate: state.currentDate,
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    renderMemberResults();
    syncPricingFee();
  };

  const getMemberMaxTicketUsageSequence = (member) => {
    if (!member) {
      return 0;
    }
    const memberId = String(member.id || "");
    if (!memberId) {
      return 0;
    }
    const reservations = storage?.loadReservations?.() || [];
    let maxSequence = 0;
    reservations.forEach((reservation) => {
      if (!reservation) {
        return;
      }
      if (String(reservation.memberId || "") !== memberId) {
        return;
      }
      const dateEntries = Array.isArray(reservation.dates) ? reservation.dates : [];
      dateEntries.forEach((dateEntry) => {
        const usages = Array.isArray(dateEntry?.ticketUsages) ? dateEntry.ticketUsages : [];
        usages.forEach((usage) => {
          const sequence = Number(usage?.sequence);
          if (Number.isFinite(sequence) && sequence > maxSequence) {
            maxSequence = sequence;
          }
        });
      });
    });
    return maxSequence;
  };

  syncServiceOptionsForContext(false);
  pickdropInputs.forEach((input) => {
    syncFilterChip(input);
  });

  syncCalendarState();

  openButton?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleServiceMenu();
  });
  entryOptionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const entryHref = String(button.dataset.reservationEntryHref || "").trim();
      if (entryHref) {
        window.location.href = entryHref;
        return;
      }
      const targetType = String(button.dataset.reservationEntryOption || "school");
      closeServiceMenu();
      openModal({ context: targetType });
      applyEntryServiceType(targetType);
    });
  });
  document.addEventListener("click", (event) => {
    if (!serviceMenu?.classList.contains("is-open")) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      closeServiceMenu();
      return;
    }
    if (target.closest("[data-reservation-open]") || target.closest("[data-reservation-service-menu]")) {
      return;
    }
    closeServiceMenu();
  });
  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);
  openModalFromQuery();

  const submitReservation = (options = {}) => {
    const includePickdrop = options.includePickdrop === true;
    const classes = classStorage.ensureDefaults();
    const scope = includePickdrop
      ? { ...getModalScope({ ignorePickdrop: true }), entryType: "pickdrop", serviceType: "pickdrop" }
      : getModalScope();
    const serviceType = scope.serviceType;
    const activeDates = getActiveDates(formState, elements);
    const memberLimit = getMemberTotalReservableCount(formState, serviceType);
    const limit = memberLimit === null
      ? getEffectiveTicketLimit(formState, classes, activeDates.size)
      : memberLimit;
    const currentCount = memberLimit === null
      ? getReservationCount(formState, elements)
      : activeDates.size;
    const exceedsLimit = currentCount > limit;
    const allowOverLimit = (!scope.usesCountLimit || includePickdrop || pageMode) && exceedsLimit;
    if (exceedsLimit && !overrideCheckbox.checked && !allowOverLimit) {
      syncActionState(formState, elements, classes);
      return;
    }

    const isDaycare = scope.usesTimeRange;
    const daycareStartTime = elements.daycareStartTime?.value || "";
    const daycareEndTime = elements.daycareEndTime?.value || "";
    if (isDaycare) {
      const durationMinutes = getDaycareDurationMinutes(daycareStartTime, daycareEndTime);
      if (!daycareStartTime || !daycareEndTime) {
        showToast("데이케어 시작/종료 시간을 입력하세요.");
        return;
      }
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        showToast("데이케어 시간은 시작보다 종료가 늦어야 합니다.");
        return;
      }
      const allReservations = storage?.loadReservations?.() || [];
      const conflictDateKey = Array.from(activeDates).find((dateKey) =>
        hasMemberDaycareTimeConflict({
          reservations: allReservations,
          member: formState.selectedMember,
          dateKey,
          checkinTime: daycareStartTime,
          checkoutTime: daycareEndTime,
          storage,
        })
      );
      if (conflictDateKey) {
        showToast(`데이케어 시간 중복 예약이 있습니다. (${conflictDateKey})`);
        return;
      }
    }
    const pickdropFlags = {
      hasPickup: formState.pickdrops.has("pickup"),
      hasDropoff: formState.pickdrops.has("dropoff"),
    };
    const reservationDates = [];
    let nextTicketUsageSequence = getMemberMaxTicketUsageSequence(formState.selectedMember) + 1;
    const assignNextUsageSequence = (usage) => {
      if (!usage || !usage.ticketId) {
        return null;
      }
      const sequence = nextTicketUsageSequence;
      nextTicketUsageSequence += 1;
      return {
        ...usage,
        sequence,
      };
    };
    const assignNextUsageSequences = (usages) => {
      if (!Array.isArray(usages) || usages.length === 0) {
        return [];
      }
      return usages
        .map((usage) => assignNextUsageSequence(usage))
        .filter(Boolean);
    };
    const memo = elements.memoInput instanceof HTMLTextAreaElement
      ? elements.memoInput.value.trim()
      : "";
    const activePaymentTab = modal.querySelector(".reservation-fee-tab.is-active")?.dataset?.feeTab || "ticket";
    const rawMethod = activePaymentTab === "other"
      ? (elements.otherPaymentType instanceof HTMLSelectElement
        ? elements.otherPaymentType.value
        : PAYMENT_METHODS.CASH)
      : PAYMENT_METHODS.TICKET;
    const paymentMethod = rawMethod === "bank" ? PAYMENT_METHODS.TRANSFER : rawMethod;
    const paymentAmount = activePaymentTab === "other"
      ? parsePaymentAmount(
        elements.otherPaymentAmount instanceof HTMLInputElement
          ? elements.otherPaymentAmount.value
          : 0
      )
      : 0;
    const serviceName = Array.from(formState.services)[0] || "";
    const serviceClass = classes.find((item) => item.name === serviceName);
    const primaryServiceType = scope.entryType === "pickdrop" ? "pickdrop" : scope.entryType;
    const serviceClassId = String(serviceClass?.id || "");
    const pricingItems = pricingStorage.loadPricingItems();
    const memberWeight = Number(formState.selectedMember?.weight);
    const serviceDates = getSortedDateKeys(formState.selectedDates);
    const serviceUnitsPerDate = getServiceUsageUnitsPerDate(serviceType);
    const serviceUsageCount = getServiceRequestedUsageCount(
      serviceType,
      formState.selectedDates.size
    );
    const hasAnyPickdrop = pickdropFlags.hasPickup || pickdropFlags.hasDropoff;
    const pickdropDates = includePickdrop
      ? getSortedDateKeys(formState.pickdropDates)
      : (hasAnyPickdrop ? serviceDates : []);
    const pickdropCount = hasAnyPickdrop ? pickdropDates.length : 0;
    const hasMember = Boolean(formState.selectedMember?.id);
    const optionMap = new Map();
    const usageMap = new Map();
    let serviceUsedMap = new Map();
    let pickdropUsedMap = new Map();
    let pickdropUsagePlan = [];
    let pickdropMemberCount = { oneway: 0, roundtrip: 0 };

    if (hasMember) {
      const tickets = getTickets();
      const memberTickets = getMemberTickets(formState.selectedMember.id);
      const options = getIssuedTicketOptions(tickets, memberTickets);
      options.forEach((option) => {
        optionMap.set(option.id, option);
      });

      const applyUsage = (nextMap) => {
        nextMap.forEach((value, key) => {
          usageMap.set(key, (usageMap.get(key) || 0) + (Number(value) || 0));
        });
      };

      if (includePickdrop) {
        if (formState.schoolSelections.length > 0) {
          const selectedRemainingMap = new Map(
            formState.schoolSelections.map((ticketId) => [
              ticketId,
              Number(optionMap.get(ticketId)?.remainingCount) || 0,
            ])
          );
          const selectionCounts = new Map(
            Array.from(formState.services).map((className) => [
              className,
              serviceUsageCount,
            ])
          );
          const classTicketMap = buildClassTicketMap(
            classes,
            formState.services,
            formState.ticketOptions
          );
          const selectionAllocation = allocateCountsByClass({
            classCounts: selectionCounts,
            classTicketMap,
            ticketOrder: formState.schoolSelections,
            ticketRemainingMap: selectedRemainingMap,
          });
          serviceUsedMap = selectionAllocation.usedMap;
          applyUsage(selectionAllocation.usedMap);
        }

        if (formState.ticketSelections.length > 0) {
          const pickdropOptions = options.filter((option) => option.type === "pickdrop");
          const pickdropMap = new Map(
            pickdropOptions.map((option) => [option.id, option])
          );
          const built = buildPickdropUsagePlan({
            dateKeys: pickdropDates,
            pickdropFlags,
            selectionOrder: formState.ticketSelections,
            optionMap: pickdropMap,
          });
          pickdropUsagePlan = built.planByDate;
          pickdropUsedMap = built.usedByTicket;
          pickdropUsedMap.forEach((used, ticketId) => {
            const option = pickdropMap.get(ticketId);
            const countType = resolvePickdropTicketCountType(option);
            pickdropMemberCount[countType] += Number(used) || 0;
          });
          applyUsage(pickdropUsedMap);
        }
      } else if (formState.ticketSelections.length > 0) {
        const selectedRemainingMap = new Map(
          formState.ticketSelections.map((ticketId) => [
            ticketId,
            Number(optionMap.get(ticketId)?.remainingCount) || 0,
          ])
        );
        const selectionCounts = new Map(
          Array.from(formState.services).map((className) => [
            className,
            serviceUsageCount,
          ])
        );
        const classTicketMap = buildClassTicketMap(
          classes,
          formState.services,
          formState.ticketOptions
        );
        const selectionAllocation = allocateCountsByClass({
          classCounts: selectionCounts,
          classTicketMap,
          ticketOrder: formState.ticketSelections,
          ticketRemainingMap: selectedRemainingMap,
        });
        serviceUsedMap = selectionAllocation.usedMap;
        applyUsage(selectionAllocation.usedMap);
      }
    }

    const serviceSelectionOrder = includePickdrop
      ? formState.schoolSelections
      : formState.ticketSelections;
    const serviceUsagePlan = buildServiceUsagePlanByDate({
      dateKeys: serviceDates,
      selectionOrder: serviceSelectionOrder,
      usedMap: serviceUsedMap,
      unitsPerDate: serviceUnitsPerDate,
    });
    const serviceTicketUsageMap = buildDateTicketUsagesMap(
      serviceDates,
      serviceUsagePlan,
      optionMap
    );
    const pickdropTicketUsagesMap = buildDateTicketUsagesMap(
      pickdropDates,
      pickdropUsagePlan,
      optionMap
    );

    const pickdropDateSet = new Set(pickdropDates);
    const getPickdropForDate = (dateKey) => ({
      pickup: Boolean(pickdropFlags.hasPickup && pickdropDateSet.has(dateKey)),
      dropoff: Boolean(pickdropFlags.hasDropoff && pickdropDateSet.has(dateKey)),
    });

    serviceDates.forEach((dateKey) => {
      const pickdropForDate = getPickdropForDate(dateKey);
      const serviceUsages = assignNextUsageSequences(serviceTicketUsageMap.get(dateKey) || []);
      const pickdropUsages = assignNextUsageSequences(pickdropTicketUsagesMap.get(dateKey) || []);
      reservationDates.push({
        date: dateKey,
        class: serviceName,
        service: serviceName,
        baseStatusKey: "PLANNED",
        checkinTime: elements.daycareStartTime?.value || "",
        checkoutTime: elements.daycareEndTime?.value || "",
        ticketUsages: mergeTicketUsagesForDate(serviceUsages, pickdropUsages),
        ...pickdropForDate,
      });
    });

    if (includePickdrop) {
      pickdropDates.forEach((dateKey) => {
        if (formState.selectedDates.has(dateKey)) {
          return;
        }
        const pickdropForDate = getPickdropForDate(dateKey);
        reservationDates.push({
          date: dateKey,
          class: "",
          service: "",
          baseStatusKey: "PLANNED",
          checkinTime: "",
          checkoutTime: "",
          ticketUsages: mergeTicketUsagesForDate(
            null,
            assignNextUsageSequences(pickdropTicketUsagesMap.get(dateKey) || [])
          ),
          ...pickdropForDate,
        });
      });
    }

    const hasAnyPickup = reservationDates.some((entry) => entry.pickup);
    const hasAnyDropoff = reservationDates.some((entry) => entry.dropoff);
    const classIdByName = new Map(
      classes.map((item) => [String(item?.name || ""), String(item?.id || "")])
    );
    const aggregateReservationDraft = {
      id: createId(),
      type: primaryServiceType,
      memberId: String(formState.selectedMember?.id || ""),
      class: serviceName,
      service: serviceName,
      baseStatusKey: "PLANNED",
      memo,
      checkinTime: elements.daycareStartTime?.value || "",
      checkoutTime: elements.daycareEndTime?.value || "",
      hasPickup: hasAnyPickup,
      hasDropoff: hasAnyDropoff,
      pickupChecked: hasAnyPickup,
      dropoffChecked: hasAnyDropoff,
      dates: reservationDates,
    };
    const hasTicketPaymentUsage = reservationDates.some(
      (entry) => getEntryTicketUsages(entry).length > 0
    );
    if (paymentMethod === PAYMENT_METHODS.TICKET) {
      aggregateReservationDraft.payment = hasTicketPaymentUsage
        ? normalizeReservationPayment(
          {
            method: PAYMENT_METHODS.TICKET,
            amount: 0,
          },
          aggregateReservationDraft
        )
        : null;
    } else {
      aggregateReservationDraft.payment = paymentAmount > 0
        ? normalizeReservationPayment(
          {
            method: paymentMethod,
            amount: paymentAmount,
          },
          aggregateReservationDraft
        )
        : null;
    }

    const aggregateReservationWithBilling = buildReservationWithBilling(
      aggregateReservationDraft,
      {
        pricingItems,
        memberWeight: Number.isFinite(memberWeight) ? memberWeight : null,
        timeZone,
        classId: serviceClassId,
        classIdByName,
        payment: aggregateReservationDraft.payment,
      }
    );
    const splitDateEntries = Array.isArray(aggregateReservationWithBilling?.dates)
      ? aggregateReservationWithBilling.dates
      : [];
    const expectedByDate = getBillingExpectedByDateMap(aggregateReservationWithBilling?.billing);
    const splitPaymentAmounts = paymentMethod !== PAYMENT_METHODS.TICKET && paymentAmount > 0
      ? splitPaymentAmountByEntries(paymentAmount, splitDateEntries, expectedByDate)
      : splitDateEntries.map(() => 0);

    const splitReservations = splitDateEntries.map((entry, index) => {
      const entryPickup = Boolean(entry?.pickup);
      const entryDropoff = Boolean(entry?.dropoff);
      const entryClass = String(entry?.class || entry?.service || "");
      const singleReservationDraft = {
        id: createId(),
        type: primaryServiceType,
        memberId: String(formState.selectedMember?.id || ""),
        class: entryClass,
        service: entryClass,
        baseStatusKey: "PLANNED",
        memo,
        checkinTime: entry?.checkinTime || "",
        checkoutTime: entry?.checkoutTime || "",
        hasPickup: entryPickup,
        hasDropoff: entryDropoff,
        pickupChecked: entryPickup,
        dropoffChecked: entryDropoff,
        dates: [{ ...entry }],
      };
      const hasEntryTicketUsage = getEntryTicketUsages(entry).length > 0;
      let entryPayment = null;
      if (paymentMethod === PAYMENT_METHODS.TICKET) {
        entryPayment = hasEntryTicketUsage
          ? normalizeReservationPayment(
            {
              method: PAYMENT_METHODS.TICKET,
              amount: 0,
            },
            singleReservationDraft
          )
          : null;
      } else {
        const entryAmount = Number(splitPaymentAmounts[index]) || 0;
        entryPayment = entryAmount > 0
          ? normalizeReservationPayment(
            {
              method: paymentMethod,
              amount: entryAmount,
            },
            singleReservationDraft
          )
          : null;
      }
      singleReservationDraft.payment = entryPayment;
      return buildReservationWithBilling(singleReservationDraft, {
        pricingItems,
        memberWeight: Number.isFinite(memberWeight) ? memberWeight : null,
        timeZone,
        classId: serviceClassId,
        classIdByName,
        payment: entryPayment,
      });
    });
    state.reservations = persistReservations(splitReservations);
    if (hasMember && usageMap.size > 0) {
      applyReservationToMemberTickets(formState.selectedMember.id, usageMap);
    }
    if (hasMember) {
      if (serviceDates.length > 0) {
        applyReservationToMember(
          formState.selectedMember.id,
          serviceDates.length,
          primaryServiceType
        );
      }
      if (pickdropCount > 0 && pickdropFlags.hasPickup && pickdropFlags.hasDropoff && pickdropMemberCount.oneway === 0 && pickdropMemberCount.roundtrip === 0) {
        pickdropMemberCount.roundtrip = pickdropCount;
      } else if (pickdropCount > 0 && (pickdropFlags.hasPickup || pickdropFlags.hasDropoff) && pickdropMemberCount.oneway === 0 && pickdropMemberCount.roundtrip === 0) {
        pickdropMemberCount.oneway = pickdropCount;
      }
      if (pickdropMemberCount.oneway > 0) {
        applyReservationToMember(
          formState.selectedMember.id,
          pickdropMemberCount.oneway,
          "oneway"
        );
      }
      if (pickdropMemberCount.roundtrip > 0) {
        applyReservationToMember(
          formState.selectedMember.id,
          pickdropMemberCount.roundtrip,
          "roundtrip"
        );
      }
    }
    const updatedDateKey = splitReservations[0]?.dates?.[0]?.date || "";
    notifyReservationUpdated({
      reservationId: splitReservations[0]?.id || "",
      dateKey: updatedDateKey,
    });
    showToast("예약이 등록되었습니다.");
    setPickdropMode(false);
    resetForm(formState, elements, {
      currentDate: state.currentDate,
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    syncPricingFee();
  };

  pickdropToggle?.addEventListener("click", () => {
    const isPickdrop = modal.classList.contains("is-pickdrop");
    if (isPickdrop) {
      submitReservation({ includePickdrop: true });
      const firstStep = progressSteps?.[0];
      const secondStep = progressSteps?.[1];
      firstStep?.classList.remove("is-complete", "is-active");
      secondStep?.classList.remove("is-active", "is-complete");
      firstStep?.classList.add("is-active");
      return;
    }
    setPickdropMode(true);
    const firstStep = progressSteps?.[0];
    const secondStep = progressSteps?.[1];
    firstStep?.classList.add("is-complete");
    firstStep?.classList.remove("is-active");
    secondStep?.classList.add("is-active");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && serviceMenu?.classList.contains("is-open")) {
      closeServiceMenu();
      return;
    }
    if (event.key === "Escape" && serviceSheet && !serviceSheet.hidden) {
      setServiceSheetOpen(false);
      return;
    }
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  serviceTrigger?.addEventListener("click", () => {
    setServiceSheetOpen(true);
  });
  serviceSheetBackdrop?.addEventListener("click", () => {
    setServiceSheetOpen(false);
  });
  serviceSheetClose?.addEventListener("click", () => {
    setServiceSheetOpen(false);
  });

  serviceContainer?.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement
      ? event.target
      : event.target.closest("[data-reservation-service]");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    applyServiceSelection(formState, input.value, input.checked);
    serviceContainer
      .querySelectorAll("[data-reservation-service]")
      .forEach((serviceInput) => {
        if (serviceInput instanceof HTMLInputElement) {
          serviceInput.checked = serviceInput === input;
        }
      });
    if (elements.serviceValue) {
      const selectedLabel = input.closest("label")?.textContent?.trim();
      elements.serviceValue.textContent = selectedLabel || input.value;
    }
    const scope = getModalScope();
    const conflicts = pruneConflictingDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    syncCalendarState(scope);
    syncScopeUI(scope);
    refreshTicketOptions(true);
    setServiceSheetOpen(false);
  });

  const handleTicketSelectionChange = (event) => {
    const input = event.target instanceof HTMLInputElement
      ? event.target
      : null;
    if (!input || !input.matches("[data-reservation-ticket]")) {
      return;
    }
    if (getReservationMode(elements) === "pickdrop") {
      formState.pickdropSelectionsInitialized = true;
    }
    const ticketId = input.value;
    if (input.checked) {
      if (!formState.ticketSelections.includes(ticketId)) {
        formState.ticketSelections.push(ticketId);
      }
    } else {
      formState.ticketSelections = formState.ticketSelections.filter(
        (id) => id !== ticketId
      );
    }
    syncTicketSection();
    const mode = getReservationMode(elements);
    const scope = getModalScope();
    const conflicts = getConflictDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    const dayoffSettings = getDayoffSettings();
    if (mode === "pickdrop") {
      syncCalendarState(scope);
      return;
    }
    const autoChanged = applyAutoWeekdaySelection(
      formState,
      conflicts,
      timeZone,
      true,
      dayoffSettings
    );
    syncCalendarState(scope);
    if (autoChanged) {
      syncTicketSection();
    }
  };

  const handleTicketRowClick = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    if (target instanceof HTMLInputElement && target.matches("[data-reservation-ticket]")) {
      return;
    }
    const row = target.closest(".reservation-ticket-row");
    if (!row) {
      return;
    }
    const input = row.querySelector("input[data-reservation-ticket]");
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return;
    }
    event.preventDefault();
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  elements.schoolTicketContainer?.addEventListener("click", handleTicketRowClick);
  elements.daycareTicketContainer?.addEventListener("click", handleTicketRowClick);
  elements.pickdropTicketField?.addEventListener("click", handleTicketRowClick);
  elements.schoolTicketContainer?.addEventListener("change", handleTicketSelectionChange);
  elements.daycareTicketContainer?.addEventListener("change", handleTicketSelectionChange);
  elements.pickdropTicketField?.addEventListener("change", handleTicketSelectionChange);

  pickdropInputs.forEach((input) => {
    input.addEventListener("change", () => {
      applyPickdropSelection(formState, input.value, input.checked);
      syncFilterChip(input);
      const classes = classStorage.ensureDefaults();
      syncActionState(formState, elements, classes);
      syncPricingFee();
    });
  });

  const handleDaycareTimeChange = () => {
    formState.daycareTimesEdited = true;
    const classes = classStorage.ensureDefaults();
    syncScopeUI(getModalScope({ ignorePickdrop: true }));
    syncActionState(formState, elements, classes);
  };

  elements.daycareStartTime?.addEventListener("input", handleDaycareTimeChange);
  elements.daycareStartTime?.addEventListener("change", handleDaycareTimeChange);
  elements.daycareEndTime?.addEventListener("input", handleDaycareTimeChange);
  elements.daycareEndTime?.addEventListener("change", handleDaycareTimeChange);

  bindReservationMemberSearchEvents({
    memberInput,
    memberResults: elements.memberResults,
    renderMemberResults,
    disabled: memberSearchMode === "page",
  });

  if (memberSearchMode === "page" && elements.memberInput instanceof HTMLInputElement) {
    elements.memberInput.readOnly = true;
  }

  const clearMember = modal.querySelector("[data-member-clear]");
  clearMember?.addEventListener("click", () => {
    setPickdropMode(false);
    resetForm(formState, elements, {
      currentDate: state.currentDate,
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    syncMemberInputValue("");
    if (memberSearchMode !== "page") {
      renderMemberResults(formState, elements, memberSelectOptions);
      elements.memberResults?.classList.remove("is-open");
    }
  });

  miniGrid?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest(".mini-calendar__cell");
    if (!cell || !cell.dataset.date) return;
    if (cell.classList.contains("mini-calendar__cell--disabled")) {
      return;
    }
    const dateKey = cell.dataset.date;
    const mode = getReservationMode(elements);
    const baseDates = mode === "pickdrop"
      ? formState.pickdropDates
      : formState.selectedDates;
    toggleDate(formState, dateKey, baseDates);
    if (mode === "pickdrop") {
      formState.pickdropDatesInitialized = true;
    } else {
      formState.pickdropDatesInitialized = false;
    }
    const scope = getModalScope();
    const conflicts = getConflictDates(formState, storage, scope, elements);
    formState.conflicts = conflicts;
    syncCalendarState(scope);
    syncTicketSection();
    if (mode === "pickdrop") {
      syncPricingFee();
      return;
    }
    syncScopeUI(scope);
    syncPricingFee();
  });

  bindReservationMonthNavigation({
    prevButton: miniPrev,
    nextButton: miniNext,
    getCurrentDate: () => formState.miniViewDate,
    setCurrentDate: (nextDate) => {
      formState.miniViewDate = nextDate;
    },
    onChange: () => {
      syncCalendarState(getModalScope());
      syncPricingFee();
    },
  });

  overrideCheckbox?.addEventListener("change", () => {
    const classes = classStorage.ensureDefaults();
    syncActionState(formState, elements, classes);
  });

  const filterVisibleReservations = (reservations) =>
    (Array.isArray(reservations) ? reservations : []).filter(
      (item) => item?.type !== "hoteling"
    );

  const persistReservations = (items) => {
    if (storage && typeof storage.addReservation === "function") {
      items.forEach((item) => {
        storage.addReservation(item);
      });
      return filterVisibleReservations(storage.loadReservations());
    }
    return filterVisibleReservations([...(state.reservations || []), ...items]);
  };

  submitButton?.addEventListener("click", () => {
    if (pageMode && isDedicatedPickdropPage(modal) && typeof onClose === "function") {
      onClose();
      return;
    }
    if (modal.classList.contains("is-pickdrop")) {
      if (pageMode && modal.dataset.reservationPageType === "pickdrop" && typeof onClose === "function") {
        onClose();
        return;
      }
      setPickdropMode(false);
      return;
    }
    submitReservation({ includePickdrop: false });
  });

  const openPickdropModal = (memberId, options = {}) => {
    resetForm(formState, elements, {
      currentDate: state.currentDate,
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    openModal();
    if (memberId) {
      applyMemberSelection(memberId);
    }
    setPickdropMode(true, options);
  };

  modal.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.matches("[data-reservation-other-amount]")) {
      formatReservationCurrencyInput(event.target);
      syncPricingFee();
    }
  });

  // Initialize form
  resetForm(formState, elements, {
    currentDate: state.currentDate,
    dayoffSettings: getDayoffSettings(),
    timeZone,
    getClasses: () => classStorage.ensureDefaults(),
  });
  feeDropdownController.reset();
  setPickdropMode(false);
  if (openOnInit) {
    openModal({ context: initialContext });
    applyEntryServiceType(initialContext);
  }

  return {
    openModal,
    openPickdropModal,
    buildMemberSearchDraft,
    restoreMemberSearchDraft,
    applyMemberSelection,
    elements,
  };
}
