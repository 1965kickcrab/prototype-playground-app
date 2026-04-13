const queryFirst = (root, selectors) => {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match) {
      return match;
    }
  }
  return null;
};

const queryAll = (root, selectors) => root.querySelectorAll(selectors.join(", "));

const SELECTORS = {
  schoolFeeList: [
    "[data-reservation-fee-service-list]",
    "[data-reservation-fee-school-list]",
  ],
  schoolTicketContainer: [
    "[data-reservation-service-tickets]",
    "[data-reservation-school-tickets]",
    "[data-reservation-tickets]",
  ],
  schoolTicketPlaceholder: [
    "[data-reservation-service-tickets-empty]",
    "[data-reservation-school-tickets-empty]",
    "[data-reservation-tickets-empty]",
  ],
  schoolFeeTotal: [
    "[data-reservation-service-fee-total]",
    "[data-reservation-school-fee-total]",
  ],
  schoolTicketTotal: [
    "[data-reservation-service-ticket-total]",
    "[data-reservation-school-ticket-total]",
  ],
};

const CONTEXT_CONFIG = {
  school: {
    modalLabel: "유치원 예약",
    stepLabel: "유치원",
    serviceLabel: "유치원",
  },
  daycare: {
    modalLabel: "데이케어 예약",
    stepLabel: "데이케어",
    serviceLabel: "데이케어",
  },
  hoteling: {
    modalLabel: "호텔링 예약",
    stepLabel: "호텔링",
    serviceLabel: "유치원",
  },
};

const SERVICE_TARGET_KEYS = {
  school: {
    feeList: "schoolFeeList",
    feeTotal: "schoolFeeTotal",
    ticketContainer: "schoolTicketContainer",
    ticketPlaceholder: "schoolTicketPlaceholder",
    ticketTotal: "schoolTicketTotal",
    inactiveContextKey: "daycare",
  },
  daycare: {
    feeList: "daycareFeeList",
    feeTotal: "daycareFeeTotal",
    ticketContainer: "daycareTicketContainer",
    ticketPlaceholder: "daycareTicketPlaceholder",
    ticketTotal: "daycareTicketTotal",
    inactiveContextKey: "school",
  },
};

export function createReservationModalElements(modal) {
  const schoolFeeList = queryFirst(modal, SELECTORS.schoolFeeList);
  const pickdropFeeList = modal.querySelector("[data-reservation-fee-pickdrop-list]");

  return {
    modal,
    memberInput: modal.querySelector("[data-member-input]"),
    memberResults: modal.querySelector("[data-member-results]"),
    miniGrid: modal.querySelector("[data-mini-grid]"),
    miniCurrent: modal.querySelector("[data-mini-current]"),
    miniPrev: modal.querySelector("[data-mini-prev]"),
    miniNext: modal.querySelector("[data-mini-next]"),
    serviceContainer: modal.querySelector("[data-reservation-services]"),
    serviceTrigger: modal.querySelector("[data-reservation-service-trigger]"),
    serviceValue: modal.querySelector("[data-reservation-service-value]"),
    serviceSheet: modal.querySelector("[data-reservation-service-sheet]"),
    serviceSheetBackdrop: modal.querySelector("[data-reservation-service-sheet-backdrop]"),
    serviceSheetClose: modal.querySelector("[data-reservation-service-sheet-close]"),
    schoolTicketContainer: queryFirst(modal, SELECTORS.schoolTicketContainer),
    schoolTicketPlaceholder: queryFirst(modal, SELECTORS.schoolTicketPlaceholder),
    daycareTicketContainer: modal.querySelector("[data-reservation-daycare-tickets]"),
    daycareTicketPlaceholder: modal.querySelector("[data-reservation-daycare-tickets-empty]"),
    pickdropInputs: queryAll(modal, ["[data-reservation-pickdrop-option]"]),
    countCurrent: modal.querySelector("[data-reservation-count-current]"),
    countLimit: modal.querySelector("[data-reservation-count-limit]"),
    countError: modal.querySelector("[data-reservation-count-error]"),
    countDiff: modal.querySelector("[data-reservation-count-diff]"),
    overrideCheckbox: modal.querySelector("[data-reservation-override]"),
    countsSummary: modal.querySelector(".reservation-counts"),
    countsRow: modal.querySelector("[data-reservation-counts-row]"),
    daycareRow: modal.querySelector("[data-reservation-daycare-row]"),
    daycareStartTime: modal.querySelector("[data-reservation-start-time]"),
    daycareEndTime: modal.querySelector("[data-reservation-end-time]"),
    schoolFeeList,
    daycareFeeList: modal.querySelector("[data-reservation-fee-daycare-list]"),
    pickdropFeeList,
    schoolFeeTotal: queryFirst(modal, SELECTORS.schoolFeeTotal),
    daycareFeeTotal: modal.querySelector("[data-reservation-daycare-fee-total]"),
    pickdropFeeTotal: modal.querySelector("[data-reservation-pickdrop-fee-total]"),
    schoolTicketTotal: queryFirst(modal, SELECTORS.schoolTicketTotal),
    daycareTicketTotal: modal.querySelector("[data-reservation-daycare-ticket-total]"),
    pickdropTicketTotal: modal.querySelector("[data-reservation-pickdrop-ticket-total]"),
    paymentTotalAll: modal.querySelector("[data-reservation-payment-total]"),
    otherPaymentType: modal.querySelector("[data-reservation-other-type]"),
    otherPaymentAmount: modal.querySelector("[data-reservation-other-amount]"),
    pricingTotalValue: modal.querySelector("[data-reservation-total]"),
    balanceRow: modal.querySelector("[data-reservation-fee-balance-row]"),
    balanceTotal: modal.querySelector("[data-reservation-fee-balance-total]"),
    pickdropTicketField: modal.querySelector("[data-reservation-pickdrop-tickets]"),
    pickdropTicketEmpty: modal.querySelector("[data-reservation-pickdrop-tickets-empty]"),
    serviceFeeTitle: modal.querySelector("[data-reservation-service-fee-title]"),
    serviceTicketTitle: modal.querySelector("[data-reservation-service-ticket-title]"),
    memoInput: modal.querySelector("[data-reservation-memo]"),
    pickdropToggle: modal.querySelector("[data-reservation-pickdrop-toggle]"),
    stepOne: modal.querySelector("[data-reservation-step=\"1\"]"),
    stepTwo: modal.querySelector("[data-reservation-step=\"2\"]"),
    stepTitle: modal.querySelector("[data-reservation-step-title]"),
    progress: modal.querySelector("[data-reservation-progress]"),
    progressSteps: modal.querySelectorAll("[data-reservation-progress-step]"),
    nextButton: modal.querySelector("[data-reservation-next]"),
    submitBar: modal.querySelector("[data-reservation-submit-bar]"),
    submitSummary: modal.querySelector("[data-reservation-submit-summary]"),
    submitSummaryCurrent: modal.querySelector("[data-reservation-submit-current]"),
    submitSummaryLimit: modal.querySelector("[data-reservation-submit-limit]"),
    submitButton: modal.querySelector("[data-reservation-submit]"),
    schoolFeeSection: schoolFeeList?.closest(".reservation-fee-section"),
    pickdropFeeSection: pickdropFeeList?.closest(".reservation-fee-section"),
  };
}

export function getServiceContextKey(context) {
  return context === "daycare" ? "daycare" : "school";
}

export function getReservationContextConfig(contextOrScope) {
  const contextKey = typeof contextOrScope === "object" && contextOrScope
    ? contextOrScope.contextKey
    : contextOrScope;
  return CONTEXT_CONFIG[contextKey] || CONTEXT_CONFIG.school;
}

const getServiceTargetSet = (elements, contextOrScope) => {
  const contextKey = typeof contextOrScope === "object" && contextOrScope
    ? contextOrScope.contextKey
    : getServiceContextKey(contextOrScope);
  const activeKeys = SERVICE_TARGET_KEYS[contextKey] || SERVICE_TARGET_KEYS.school;
  const inactiveKeys = SERVICE_TARGET_KEYS[activeKeys.inactiveContextKey];

  return {
    contextKey,
    activeKeys,
    inactiveKeys,
    elements,
  };
};

export function renderReservationContextualLabels({
  modal,
  progressSteps,
  stepTitle,
  serviceFeeTitle,
  serviceTicketTitle,
  context,
  scope = null,
  isPickdropMode,
}) {
  const contextKey = scope?.contextKey || context || "school";
  const config = getReservationContextConfig(contextKey);

  if (stepTitle) {
    stepTitle.textContent = isPickdropMode ? "픽드랍 예약" : config.modalLabel;
  }
  if (progressSteps && progressSteps.length) {
    const firstStepLabel = progressSteps[0].querySelector(".reservation-progress__label");
    if (firstStepLabel) {
      firstStepLabel.textContent = config.stepLabel;
    }
  }
  if (serviceFeeTitle) {
    serviceFeeTitle.textContent = config.serviceLabel;
  }
  if (serviceTicketTitle) {
    serviceTicketTitle.textContent = config.serviceLabel;
  }
  if (modal) {
    if (contextKey) {
      modal.dataset.reservationContext = contextKey;
    } else {
      modal.removeAttribute("data-reservation-context");
    }
  }
}

export function getActiveServiceFeeTargets(elements, contextOrScope) {
  const { contextKey, activeKeys, inactiveKeys } = getServiceTargetSet(elements, contextOrScope);
  return {
    contextKey,
    activeList: elements[activeKeys.feeList],
    activeTotal: elements[activeKeys.feeTotal],
    inactiveList: elements[inactiveKeys.feeList],
    inactiveTotal: elements[inactiveKeys.feeTotal],
  };
}

export function getActiveServiceTicketTargets(elements, contextOrScope) {
  const { contextKey, activeKeys, inactiveKeys } = getServiceTargetSet(elements, contextOrScope);
  return {
    contextKey,
    activeContainer: elements[activeKeys.ticketContainer],
    activePlaceholder: elements[activeKeys.ticketPlaceholder],
    activeTotal: elements[activeKeys.ticketTotal],
    inactiveContainer: elements[inactiveKeys.ticketContainer],
    inactivePlaceholder: elements[inactiveKeys.ticketPlaceholder],
    inactiveTotal: elements[inactiveKeys.ticketTotal],
  };
}

export function setReservationModalVisibility(modal, isOpen) {
  if (!modal) {
    return;
  }
  modal.classList.toggle("is-open", isOpen);
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

export function consumeReservationModalQuery({
  flagKey,
  expectedValue = "open",
  extraKeys = [],
}) {
  const params = new URLSearchParams(window.location.search);
  if (params.get(flagKey) !== expectedValue) {
    return null;
  }

  const values = {};
  extraKeys.forEach((key) => {
    values[key] = params.get(key);
  });

  const url = new URL(window.location.href);
  url.searchParams.delete(flagKey);
  extraKeys.forEach((key) => {
    url.searchParams.delete(key);
  });
  window.history.replaceState({}, "", url.toString());

  return values;
}

export function bindReservationMemberSearchEvents({
  memberInput,
  memberResults,
  renderMemberResults,
  disabled = false,
}) {
  if (
    disabled
    || !(memberInput instanceof HTMLElement)
    || typeof renderMemberResults !== "function"
  ) {
    return;
  }

  const openResults = () => {
    renderMemberResults();
    memberResults?.classList.add("is-open");
  };

  memberInput.addEventListener("input", openResults);
  memberInput.addEventListener("focus", openResults);
  memberInput.addEventListener("blur", () => {
    setTimeout(() => {
      memberResults?.classList.remove("is-open");
    }, 100);
  });
}

export function bindReservationMonthNavigation({
  prevButton,
  nextButton,
  getCurrentDate,
  setCurrentDate,
  onChange,
}) {
  const shiftMonth = (delta) => {
    if (typeof getCurrentDate !== "function" || typeof setCurrentDate !== "function") {
      return;
    }
    const current = getCurrentDate();
    if (!(current instanceof Date) || Number.isNaN(current.getTime())) {
      return;
    }
    setCurrentDate(new Date(current.getFullYear(), current.getMonth() + delta, 1));
    if (typeof onChange === "function") {
      onChange();
    }
  };

  prevButton?.addEventListener("click", () => shiftMonth(-1));
  nextButton?.addEventListener("click", () => shiftMonth(1));
}

export function formatReservationCurrencyInput(inputEl) {
  if (!(inputEl instanceof HTMLInputElement)) {
    return false;
  }
  const digits = inputEl.value.replace(/[^0-9]/g, "");
  inputEl.value = digits ? parseInt(digits, 10).toLocaleString() : "";
  return true;
}

export function setReservationAmountRange(amountEl, before, after, unitLabel = "회") {
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
}

export function getSelectedReservationTicketMetaElement(container) {
  return container?.querySelector?.(
    ".reservation-ticket-row.is-selected .reservation-ticket-row__meta"
  );
}

export function applyReservationTicketMetaAmount(amountEl, metaEl, options = {}) {
  if (!amountEl || !metaEl) {
    return false;
  }
  const clone = metaEl.cloneNode(true);
  if (options.includeOverbooked === true) {
    const overbooked = Number(clone.dataset.overbooked) || 0;
    const unitLabel = clone.dataset.unitLabel || "회";
    if (overbooked > 0) {
      const overbookEl = document.createElement("span");
      overbookEl.className = "reservation-ticket-row__meta-overbook";
      overbookEl.textContent = `(초과 ${overbooked}${unitLabel})`;
      clone.append(" ", overbookEl);
    }
  }
  amountEl.replaceChildren(clone);
  amountEl.classList.toggle("is-empty", false);
  delete amountEl.dataset.feeAmount;
  return true;
}
