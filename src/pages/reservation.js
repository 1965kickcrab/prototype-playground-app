import { initClassStorage } from "../storage/class-storage.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { initOperationsStorage } from "../storage/operations-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import { renderPricingBreakdown, renderPickdropTickets } from "../components/reservation-fee.js";
import { renderTicketOptions } from "../components/reservation-ticket-view.js";
import { renderMemberSearchResults } from "../components/member-search.js";
import { syncReservationFeeTotal } from "../utils/reservation-fee-total.js";
import { syncFilterChip } from "../utils/dom.js";
import { isCanceledStatus } from "../utils/status.js";
import { notifyReservationUpdated } from "../utils/reservation-events.js";
import { getTimeZone } from "../utils/timezone.js";
import { isDayoffDate } from "../utils/dayoff.js";
import {
  applyReservationToMember,
  applyReservationToMemberTickets,
  loadIssueMembers,
} from "../storage/ticket-issue-members.js";
import {
  getDateKeyFromParts,
  getDatePartsFromKey,
  getZonedTodayParts,
  getWeekdayIndex,
  sortDateKeys,
} from "../utils/date.js";
import {
  allocateTicketUsage,
  getDefaultTicketSelection,
  getIssuedTicketOptions,
  getAutoSelectedDateKeys,
  getSelectedTicketWeekdays,
} from "../services/ticket-reservation-service.js";
import { formatTicketPrice, normalizePickdropType } from "../services/ticket-service.js";
import { getReservationEntries } from "../services/reservation-entries.js";
import { getMemberReservationConflictDates } from "../services/member-reservation-summary.js";
import { buildDateTicketUsageMap, buildDateTicketUsagesMap } from "../services/ticket-usage-service.js";
import { createId } from "../utils/id.js";
import {
  getPickdropReservableTotal,
  resolvePickdropTicketCountType,
} from "../services/pickdrop-policy.js";

const PICKDROP_OPTIONS = [
  { value: "pickup", label: "픽업" },
  { value: "dropoff", label: "드랍" },
];

const SERVICE_OPTIONS = [
  { value: "school", label: "유치원" },
  { value: "daycare", label: "데이케어" },
];

const RESERVATION_LIMIT = 0;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function buildCalendarCells(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const day = prevMonthDays - i;
    cells.push({ day, date: new Date(year, month - 1, day), muted: true });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, date: new Date(year, month, day), muted: false });
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= trailing; day += 1) {
    cells.push({ day, date: new Date(year, month + 1, day), muted: true });
  }

  return { year, month, cells };
}

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

function getNumericValue(element, fallback = 0) {
  if (!element) return fallback;
  const source = element.dataset.value ?? element.textContent ?? "";
  const value = Number(source);
  return Number.isFinite(value) ? value : fallback;
}

function setCountValue(element, value, options = {}) {
  if (!element) return;
  const numericValue = Number(value);
  const isNumeric = Number.isFinite(numericValue);
  const normalized = isNumeric ? String(numericValue) : String(value);
  const shouldMarkExceeded = Boolean(options.negativeAsExceeded && isNumeric && numericValue < 0);

  element.dataset.value = normalized;
  element.textContent = shouldMarkExceeded
    ? `초과 ${Math.abs(numericValue)}`
    : normalized;

  if (options.negativeClassName) {
    element.classList.toggle(options.negativeClassName, shouldMarkExceeded);
  }
}

function getMemberReservableCountByType(member, type) {
  if (!member || !type || !Array.isArray(member.tickets)) {
    return null;
  }
  const matches = member.tickets.filter((ticket) => ticket?.type === type);
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((sum, ticket) => {
    const value = Number(ticket?.reservableCount);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function getReservationMode(elements) {
  return elements?.modal?.classList?.contains("is-pickdrop")
    ? "pickdrop"
    : "school";
}

function getSelectedServiceType(state, classes, elements) {
  if (getReservationMode(elements) === "pickdrop") {
    return "pickdrop";
  }
  const selectedName = Array.from(state.services || [])[0] || "";
  if (!selectedName) {
    return "school";
  }
  const match = classes.find((item) => item.name === selectedName);
  return match?.type || "school";
}

function filterConflictingDates(dates, conflicts) {
  if (!(dates instanceof Set) || !(conflicts instanceof Set)) {
    return dates;
  }
  if (conflicts.size === 0) {
    return dates;
  }
  return new Set(Array.from(dates).filter((dateKey) => !conflicts.has(dateKey)));
}

function getActiveDates(state, elements) {
  const baseDates = getReservationMode(elements) === "pickdrop"
    ? state.pickdropDates
    : state.selectedDates;
  return filterConflictingDates(baseDates, state.conflicts);
}

function getMemberTotalReservableCount(state, serviceType) {
  const member = state?.selectedMember;
  if (!member) {
    return null;
  }
  const type = serviceType || "school";
  const totalValue = Number(member.totalReservableCountByType?.[type]);
  if (Number.isFinite(totalValue)) {
    return totalValue;
  }
  const typedCount = getMemberReservableCountByType(member, type);
  if (Number.isFinite(typedCount)) {
    return typedCount;
  }
  if (Array.isArray(member.tickets) && member.tickets.length > 0) {
    return 0;
  }
  return null;
}

function getReservableTicketOptions(ticketOptions) {
  if (!Array.isArray(ticketOptions)) {
    return [];
  }
  return ticketOptions.filter((ticket) => Number(ticket?.reservableCount) >= 1);
}

function getEffectiveTicketLimit(state, classes, dateCountOverride = null) {
  const limit = Number.isFinite(state.ticketLimit)
    ? state.ticketLimit
    : RESERVATION_LIMIT;
  const isDaycare = isDaycareSelected(state, classes);
  if (!isDaycare && state.ticketSelections.length === 0) {
    return getSelectedReservationCount(state, dateCountOverride);
  }
  return limit;
}

function getReservationCount(state, elements) {
  const activeDates = getActiveDates(state, elements);
  const dateCount = activeDates?.size || 0;
  if (getReservationMode(elements) === "pickdrop") {
    return dateCount;
  }
  return getSelectedReservationCount(state, dateCount);
}

function syncCounts(state, elements, classes = []) {
  const mode = getReservationMode(elements);
  const activeDates = getActiveDates(state, elements);
  const serviceType = getSelectedServiceType(state, classes, elements);
  const memberLimit = getMemberTotalReservableCount(state, serviceType);
  const current = memberLimit === null
    ? getReservationCount(state, elements)
    : activeDates?.size || 0;
  const limit = memberLimit === null
    ? getEffectiveTicketLimit(state, classes, activeDates?.size || 0)
    : memberLimit;

  setCountValue(elements.countCurrent, current);
  setCountValue(elements.countLimit, limit, {
    negativeAsExceeded: true,
    negativeClassName: "is-over-limit",
  });

  const currentValue = getNumericValue(elements.countCurrent, current);
  const limitValue = getNumericValue(elements.countLimit, limit);
  const exceedsLimit = currentValue > limitValue;
  const diff = exceedsLimit ? currentValue - limitValue : 0;

  elements.countError.hidden = !exceedsLimit;
  elements.countDiff.textContent = diff === 0 ? "" : String(diff);
  elements.overrideCheckbox.disabled = !exceedsLimit;
}

function isSubmitEnabled(state, elements) {
  const activeDates = getActiveDates(state, elements);
  const hasService = state.services.size > 0;
  const hasMember = Boolean(state.selectedMember);
  const hasDates = activeDates.size > 0;
  return hasService && hasMember && hasDates;
}

function syncActionState(state, elements, classes = []) {
  const { submitButton, nextButton, overrideCheckbox, pickdropToggle, modal } = elements;
  const mode = getReservationMode(elements);
  const activeDates = getActiveDates(state, elements);
  const limit = getNumericValue(elements.countLimit, RESERVATION_LIMIT);
  const serviceType = getSelectedServiceType(state, classes, elements);
  const memberLimit = getMemberTotalReservableCount(state, serviceType);
  const current = memberLimit === null
    ? getReservationCount(state, elements)
    : activeDates?.size || 0;
  const exceedsLimit = current > limit;
  const enabled = isSubmitEnabled(state, elements) && (!exceedsLimit || overrideCheckbox.checked);
  const isPickdropMode = Boolean(modal?.classList?.contains("is-pickdrop"));
  if (submitButton) {
    submitButton.disabled = isPickdropMode ? false : !enabled;
  }
  if (pickdropToggle) {
    pickdropToggle.disabled = !enabled;
  }
  if (nextButton) {
    nextButton.disabled = !enabled;
  }
  overrideCheckbox.disabled = !exceedsLimit;
}

function parseTimeToMinutes(value) {
  if (!value) {
    return null;
  }
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function getDaycarePricing(operationsStorage) {
  const settings = operationsStorage.loadSettings();
  const pricing = settings.daycarePricing || {};
  return {
    hourlyRate: Number(pricing.hourlyRate) || 0,
    billingUnit: Number(pricing.billingUnit) || 60,
  };
}

function calculateDaycareFee(startTime, endTime, pricing) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) {
    return 0;
  }
  const duration = endMinutes - startMinutes;
  if (duration <= 0) {
    return 0;
  }
  const unit = pricing.billingUnit || 60;
  const units = Math.ceil(duration / unit);
  const fee = units * (pricing.hourlyRate || 0) * (unit / 60);
  return Math.round(fee);
}

function isDaycareSelected(state, classes) {
  if (!state.services || state.services.size === 0) {
    return false;
  }
  const serviceNames = Array.from(state.services);
  return serviceNames.some((name) => {
    const match = classes.find((item) => item.name === name);
    return match?.type === "daycare";
  });
}

function getSelectedReservationCount(state, dateCountOverride = null) {
  const dateCount = Number.isFinite(dateCountOverride)
    ? dateCountOverride
    : state.selectedDates?.size || 0;
  const serviceCount = state.services?.size || 0;
  return dateCount * serviceCount;
}

function getSelectedDateLimit(limit, serviceCount) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  if (serviceCount <= 0) {
    return limit;
  }
  return Math.floor(limit / serviceCount);
}

function buildClassTicketMap(classes, selectedServices, ticketOptions = []) {
  const map = new Map();
  if (!Array.isArray(classes) || !selectedServices || selectedServices.size === 0) {
    return map;
  }
  const optionMap = new Map();
  if (Array.isArray(ticketOptions)) {
    ticketOptions.forEach((option) => {
      const ticketId = String(option?.ticketId ?? "");
      const optionId = String(option?.id ?? "");
      if (!ticketId || !optionId) {
        return;
      }
      if (!optionMap.has(ticketId)) {
        optionMap.set(ticketId, []);
      }
      optionMap.get(ticketId).push(optionId);
    });
  }
  classes.forEach((classItem) => {
    const name = classItem?.name || "";
    if (!selectedServices.has(name)) {
      return;
    }
    const ids = Array.isArray(classItem.ticketIds) ? classItem.ticketIds : [];
    if (optionMap.size === 0) {
      map.set(name, new Set(ids.map((id) => String(id))));
      return;
    }
    const optionIds = [];
    ids.forEach((id) => {
      const match = optionMap.get(String(id));
      if (Array.isArray(match)) {
        optionIds.push(...match);
      }
    });
    map.set(name, new Set(optionIds));
  });
  return map;
}

function getUsedReservationCountByClass(storage, member, selectedServices) {
  const results = new Map();
  if (!member || !selectedServices || selectedServices.size === 0) {
    return results;
  }
  const reservations = storage?.loadReservations?.() || [];
  const dogName = member.dogName || "";
  const owner = member.owner || "";
  getReservationEntries(reservations).forEach((entry) => {
    const { reservation, className, baseStatusKey, statusText } = entry;
    if (!reservation || isCanceledStatus(baseStatusKey, statusText, storage)) {
      return;
    }
    if (reservation.dogName !== dogName || reservation.owner !== owner) {
      return;
    }
    if (!selectedServices.has(className)) {
      return;
    }
    const next = (results.get(className) || 0) + 1;
    results.set(className, next);
  });
  return results;
}

function allocateCountsByClass({
  classCounts,
  classTicketMap,
  ticketOrder,
  ticketRemainingMap,
}) {
  const remainingMap = new Map(ticketRemainingMap);
  const usedMap = new Map();
  if (!(classCounts instanceof Map)) {
    return { usedMap, remainingMap };
  }
  classCounts.forEach((count, className) => {
    let remainingToAllocate = Number(count) || 0;
    if (remainingToAllocate <= 0) {
      return;
    }
    const allowedTickets = classTicketMap.get(className);
    const effectiveAllowed = allowedTickets && allowedTickets.size > 0
      ? allowedTickets
      : new Set(ticketOrder);
    if (effectiveAllowed.size === 0) {
      return;
    }
    ticketOrder.forEach((ticketId) => {
      if (remainingToAllocate <= 0) {
        return;
      }
      if (!effectiveAllowed.has(ticketId)) {
        return;
      }
      const before = remainingMap.get(ticketId) || 0;
      if (before <= 0) {
        return;
      }
      const used = Math.min(before, remainingToAllocate);
      remainingMap.set(ticketId, before - used);
      usedMap.set(ticketId, (usedMap.get(ticketId) || 0) + used);
      remainingToAllocate -= used;
    });
  });
  return { usedMap, remainingMap };
}

function getClassRemainingMinimum({
  services,
  classTicketMap,
  ticketRemainingMap,
}) {
  if (!services || services.size === 0) {
    return 0;
  }
  let minRemaining = null;
  services.forEach((className) => {
    const ticketIds = classTicketMap.get(className);
    let total = 0;
    if (!ticketIds || ticketIds.size === 0) {
      ticketRemainingMap.forEach((value) => {
        total += Number(value) || 0;
      });
    } else {
      ticketIds.forEach((ticketId) => {
        total += Number(ticketRemainingMap.get(ticketId)) || 0;
      });
    }
    if (minRemaining === null || total < minRemaining) {
      minRemaining = total;
    }
  });
  return minRemaining ?? 0;
}

function getSortedDateKeys(dateSet) {
  return sortDateKeys(Array.from(dateSet || []));
}

function buildPickdropUsagePlan({
  dateKeys,
  pickdropFlags,
  selectionOrder,
  optionMap,
}) {
  const planByDate = [];
  const usedByTicket = new Map();
  const mutableRemaining = new Map();
  const roundtripTickets = [];
  const onewayTickets = [];
  const orderedSelection = Array.isArray(selectionOrder) ? selectionOrder : [];

  orderedSelection.forEach((ticketId) => {
    const option = optionMap.get(ticketId);
    if (!option) {
      return;
    }
    const remaining = Number(option.reservableCount ?? option.remainingCount) || 0;
    if (remaining <= 0) {
      return;
    }
    mutableRemaining.set(ticketId, remaining);
    const countType = resolvePickdropTicketCountType(option);
    if (countType === "roundtrip") {
      roundtripTickets.push(ticketId);
      return;
    }
    onewayTickets.push(ticketId);
  });

  const pickFrom = (pool, quantity = 1) => {
    const selected = [];
    for (let i = 0; i < quantity; i += 1) {
      const ticketId = pool.find((id) => (mutableRemaining.get(id) || 0) > 0);
      if (!ticketId) {
        break;
      }
      const before = mutableRemaining.get(ticketId) || 0;
      mutableRemaining.set(ticketId, Math.max(before - 1, 0));
      selected.push(ticketId);
      usedByTicket.set(ticketId, (usedByTicket.get(ticketId) || 0) + 1);
    }
    return selected;
  };

  const dates = Array.isArray(dateKeys) ? dateKeys : [];
  dates.forEach(() => {
    const { hasPickup, hasDropoff } = pickdropFlags;
    if (!hasPickup && !hasDropoff) {
      planByDate.push([]);
      return;
    }
    if (hasPickup && hasDropoff) {
      const roundtrip = pickFrom(roundtripTickets, 1);
      if (roundtrip.length === 1) {
        planByDate.push(roundtrip);
        return;
      }
      const oneway = pickFrom(onewayTickets, 2);
      planByDate.push(oneway);
      return;
    }
    const oneway = pickFrom(onewayTickets, 1);
    if (oneway.length === 1) {
      planByDate.push(oneway);
      return;
    }
    const fallbackRoundtrip = pickFrom(roundtripTickets, 1);
    planByDate.push(fallbackRoundtrip);
  });

  return {
    planByDate,
    usedByTicket,
  };
}


function renderMiniCalendar(state, elements, conflicts = new Set(), options = {}) {
  const { miniGrid, miniCurrent } = elements;
  if (!miniGrid || !miniCurrent) return;

  const { year, month, cells } = buildCalendarCells(state.miniViewDate);
  const todayKey = formatDateKey(new Date());
  const dayoffSettings = options.dayoffSettings;
  const timeZone = options.timeZone;
  const selectedDates = options.selectedDates instanceof Set
    ? options.selectedDates
    : state.selectedDates;
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
    if (selectedDates.has(dateKey) || conflicts.has(dateKey)) {
      cell.classList.add("mini-calendar__cell--selected");
    }
    if (conflicts.has(dateKey)) {
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

function toggleDate(state, dateKey, targetDates = state.selectedDates) {
  if (targetDates.has(dateKey)) {
    targetDates.delete(dateKey);
  } else {
    targetDates.add(dateKey);
  }
  state.autoSelected = false;
}

function getServiceOptions(state) {
  const services = Array.isArray(state?.serviceOptions) ? state.serviceOptions : [];
  if (services.length) {
    return services.map((name) => ({ value: name, label: name }));
  }

  return SERVICE_OPTIONS;
}

function renderServiceOptions(container, serviceOptions, selectedServices) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  serviceOptions.forEach((option) => {
    const label = document.createElement("label");
    label.className = "filter-chip";

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

    syncFilterChip(input);
  });
}

function applyServiceSelection(state, value, checked) {
  if (!checked) {
    return;
  }
  state.services = new Set([value]);
}

function applyPickdropSelection(state, value, checked) {
  if (checked) {
    state.pickdrops.add(value);
  } else {
    state.pickdrops.delete(value);
  }
}

function hasPickdropPricing(pricingItems, key) {
  if (!Array.isArray(pricingItems) || !key) {
    return false;
  }
  return pricingItems.some(
    (item) =>
      item?.serviceType === "pickdrop"
      && normalizePickdropType(item?.pickdropType || item?.title) === key
  );
}

  function resetForm(state, elements, options = {}) {
    state.services = new Set();
    state.pickdrops = new Set();
    state.selectedMember = null;
  state.selectedDates = new Set();
  state.pickdropDates = new Set();
  state.conflicts = new Set();
  state.ticketSelections = [];
  state.ticketOptions = [];
  state.ticketLimit = RESERVATION_LIMIT;
  state.miniViewDate = new Date();
    state.autoSelected = false;
    state.context = "school";
    state.pickdropSelectionsInitialized = false;
    state.pickdropDatesInitialized = false;
  elements.memberInput.value = "";
  elements.memberResults.innerHTML = "";
  elements.overrideCheckbox.checked = false;
  if (elements.daycareStartTime instanceof HTMLInputElement) {
    elements.daycareStartTime.value = "";
  }
  if (elements.daycareEndTime instanceof HTMLInputElement) {
    elements.daycareEndTime.value = "";
  }
  if (elements.daycareFeeValue) {
    elements.daycareFeeValue.textContent = "-";
  }
  if (elements.memoInput) {
    elements.memoInput.value = "";
  }

  renderTicketOptions(
    elements.ticketContainer,
    elements.ticketPlaceholder,
    [],
    [],
    new Map(),
    false,
    0,
    new Set()
  );

  if (elements.serviceContainer) {
    elements.serviceContainer
      .querySelectorAll("[data-reservation-service]")
      .forEach((input) => {
        input.checked = false;
        syncFilterChip(input);
      });
    elements.serviceContainer
      .querySelectorAll(".filter-chip")
      .forEach((chip) => {
        chip.hidden = false;
      });
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
  if (elements.daycareFeeRow) {
    elements.daycareFeeRow.hidden = true;
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

function getMemberTicketClassNames(classes, ticketOptions, serviceOptions) {
  if (!Array.isArray(ticketOptions) || ticketOptions.length === 0) {
    return [];
  }
  const availableTicketIds = new Set(
    ticketOptions.map((option) => option.ticketId)
  );
  const matched = classes
    .filter((item) =>
      Array.isArray(item.ticketIds)
        && item.ticketIds.some((ticketId) => availableTicketIds.has(String(ticketId)))
    )
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0);
  const optionSet = new Set(serviceOptions.map((option) => option.value));
  const mappedMatches = matched.filter((name) => optionSet.has(name));
  if (mappedMatches.length > 0) {
    return mappedMatches;
  }

  const ticketTypeSet = new Set(
    ticketOptions
      .map((option) => String(option?.type || "").trim())
      .filter((type) => type)
  );
  if (ticketTypeSet.size === 0) {
    return [];
  }
  return classes
    .filter((item) => ticketTypeSet.has(String(item?.type || "").trim()))
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0)
    .filter((name) => optionSet.has(name));
}

function getEligibleTicketOptions(ticketOptions, selectedServices, classes) {
  if (!Array.isArray(ticketOptions) || ticketOptions.length === 0) {
    return [];
  }
  if (!selectedServices || selectedServices.size === 0) {
    return [];
  }
  const ticketIdSet = new Set();
  const selectedName = Array.from(selectedServices)[0] || "";
  const selectedType = classes.find((item) => item.name === selectedName)?.type
    || "school";
  classes.forEach((classItem) => {
    if (!selectedServices.has(classItem.name)) {
      return;
    }
    const ids = Array.isArray(classItem.ticketIds) ? classItem.ticketIds : [];
    ids.forEach((id) => {
      ticketIdSet.add(String(id));
    });
  });
  if (ticketIdSet.size === 0) {
    return ticketOptions.filter((ticket) => ticket.type === selectedType);
  }
  const linkedOptions = ticketOptions.filter((ticket) =>
    ticketIdSet.has(String(ticket.ticketId || ""))
  );
  if (linkedOptions.length > 0) {
    return linkedOptions;
  }
  return ticketOptions.filter((ticket) => ticket.type === selectedType);
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
      syncFilterChip(input);
    });
}

function getConflictDates(state, storage) {
  return getMemberReservationConflictDates({
    reservations: storage?.loadReservations?.() || [],
    member: state.selectedMember,
    services: state.services,
    storage,
  });
}

function pruneConflictingDates(state, storage) {
  const conflicts = getConflictDates(state, storage);
  if (conflicts.size === 0) {
    return conflicts;
  }
  state.selectedDates = new Set(
    Array.from(state.selectedDates).filter((dateKey) => !conflicts.has(dateKey))
  );
  state.pickdropDatesInitialized = false;
  return conflicts;
}

function isSameDateList(selectedDates, nextDates) {
  if (selectedDates.size !== nextDates.length) {
    return false;
  }
  return nextDates.every((dateKey) => selectedDates.has(dateKey));
}

function applyAutoWeekdaySelection(
  state,
  conflicts,
  timeZone,
  force = false,
  dayoffSettings,
  overrides = {}
) {
  const reservableOptions = getReservableTicketOptions(state.ticketOptions);
  if (reservableOptions.length === 0) {
    state.autoSelected = false;
    return false;
  }
  const overrideWeekdays = Array.isArray(overrides.weekdays)
    ? overrides.weekdays
    : [];
  const weekdays = overrideWeekdays.length
    ? overrideWeekdays
    : getSelectedTicketWeekdays(state.ticketSelections, reservableOptions);
  if (weekdays.length === 0) {
    state.autoSelected = false;
    return false;
  }
  if (!force && state.selectedDates.size > 0 && !state.autoSelected) {
    return false;
  }
  const overrideCount = Number.isFinite(Number(overrides.count))
    ? Math.max(Number(overrides.count), 0)
    : null;
  const limit = Math.max(Number(state.ticketLimit) || 0, 0);
  const dateLimit = overrideCount === null
    ? getSelectedDateLimit(limit, state.services?.size || 0)
    : overrideCount;
  if (dateLimit <= 0) {
    state.autoSelected = false;
    return false;
  }
  const nextDates = getAutoSelectedDateKeys({
    weekdays,
    count: dateLimit,
    conflicts,
    timeZone,
    dayoffSettings,
    startKey: overrides.startKey,
  });
  if (isSameDateList(state.selectedDates, nextDates)) {
    state.autoSelected = true;
    return false;
  }
  state.selectedDates = new Set(nextDates);
  state.autoSelected = true;
  state.pickdropDatesInitialized = false;
  return true;
}

function getTodayKey(timeZone) {
  return getDateKeyFromParts(getZonedTodayParts(timeZone));
}

function getSelectedWeekdayCounts(selectedDates, timeZone) {
  const counts = new Map();
  if (!(selectedDates instanceof Set)) {
    return counts;
  }
  selectedDates.forEach((dateKey) => {
    const parsed = getDatePartsFromKey(dateKey);
    if (!parsed) {
      return;
    }
    const weekdayIndex = getWeekdayIndex(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      timeZone
    );
    const label = WEEKDAY_LABELS[weekdayIndex];
    if (!label) {
      return;
    }
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return counts;
}

function getMemberAutoSelectionOptions(state, classes, timeZone) {
  if (!state.selectedMember || !state.services || state.services.size === 0) {
    return null;
  }
  const eligibleOptions = getEligibleTicketOptions(
    state.ticketOptions,
    state.services,
    classes
  );
  if (!eligibleOptions.length) {
    return null;
  }
  const availableMap = new Map(
    eligibleOptions.map((ticket) => {
      const remainingRaw = Number(ticket.remainingCount);
      const remainingAfter = Number.isFinite(remainingRaw)
        ? Math.max(remainingRaw, 0)
        : 0;
      return [ticket.id, Math.max(remainingAfter, 0)];
    })
  );
  const candidate = eligibleOptions.find((ticket) => {
    const remaining = availableMap.get(ticket.id) ?? 0;
    return remaining > 0 && Array.isArray(ticket.weekdays) && ticket.weekdays.length > 0;
  });
  if (!candidate) {
    return null;
  }
  return {
    weekdays: candidate.weekdays,
    count: availableMap.get(candidate.id) ?? 0,
    startKey: getTodayKey(timeZone),
  };
}

export function setupReservationModal(state, storage) {
  const openButton = document.querySelector("[data-reservation-open]");
  const modal = document.querySelector("[data-reservation-modal]");

  if (!modal) {
    return;
  }

  const timeZone = getTimeZone();
  const serviceOptions = getServiceOptions(state);
  const classStorage = initClassStorage();
  const ticketStorage = initTicketStorage();
  const operationsStorage = initOperationsStorage();
  const pricingStorage = initPricingStorage();
  const overlay = modal.querySelector("[data-reservation-overlay]");
  const closeButton = modal.querySelector("[data-reservation-close]");
  const serviceContainer = modal.querySelector("[data-reservation-services]");
  const ticketContainer = modal.querySelector("[data-reservation-tickets]");
  const ticketPlaceholder = modal.querySelector("[data-reservation-tickets-empty]");
  const memberInput = modal.querySelector("[data-member-input]");
  const memberResults = modal.querySelector("[data-member-results]");
  const memberClear = modal.querySelector("[data-member-clear]");
  const memberRow = modal.querySelector(".reservation-row--member");
  const miniGrid = modal.querySelector("[data-mini-grid]");
  const miniCurrent = modal.querySelector("[data-mini-current]");
  const miniPrev = modal.querySelector("[data-mini-prev]");
  const miniNext = modal.querySelector("[data-mini-next]");
  const pickdropInputs = modal.querySelectorAll("[data-reservation-pickdrop-option]");
  const countCurrent = modal.querySelector("[data-reservation-count-current]");
  const countLimit = modal.querySelector("[data-reservation-count-limit]");
  const countError = modal.querySelector("[data-reservation-count-error]");
  const countDiff = modal.querySelector("[data-reservation-count-diff]");
  const overrideCheckbox = modal.querySelector("[data-reservation-override]");
  const countsRow = modal.querySelector("[data-reservation-counts-row]");
  const daycareRow = modal.querySelector("[data-reservation-daycare-row]");
  const daycareFeeRow = modal.querySelector("[data-reservation-daycare-fee-row]");
  const daycareStartTime = modal.querySelector("[data-reservation-start-time]");
  const daycareEndTime = modal.querySelector("[data-reservation-end-time]");
  const daycareFeeValue = modal.querySelector("[data-reservation-daycare-fee]");
  const schoolFeeList = modal.querySelector("[data-reservation-fee-school-list]");
  const pickdropFeeList = modal.querySelector("[data-reservation-fee-pickdrop-list]");
  const schoolTotalValue = modal.querySelector("[data-reservation-school-total]");
  const pickdropTotalValue = modal.querySelector("[data-reservation-pickdrop-total]");
  const feeSchoolCard = modal.querySelector("[data-reservation-fee-school]");
  const feePickdropCard = modal.querySelector("[data-reservation-fee-pickdrop]");
  const pricingTotalValue = modal.querySelector("[data-reservation-total]");
  const pickdropTicketField = modal.querySelector("[data-reservation-pickdrop-tickets]");
  const pickdropTicketEmpty = modal.querySelector("[data-reservation-pickdrop-tickets-empty]");
  const memoInput = modal.querySelector("[data-reservation-memo]");
  const pickdropToggle = modal.querySelector("[data-reservation-pickdrop-toggle]");
  const stepOne = modal.querySelector("[data-reservation-step=\"1\"]");
  const stepTwo = modal.querySelector("[data-reservation-step=\"2\"]");
  const stepTitle = modal.querySelector("[data-reservation-step-title]");
  const progress = modal.querySelector("[data-reservation-progress]");
  const progressSteps = modal.querySelectorAll("[data-reservation-progress-step]");
  const nextButton = modal.querySelector("[data-reservation-next]");
  const submitButton = modal.querySelector("[data-reservation-submit]");
  const schoolFeeSection = schoolFeeList?.closest(".reservation-fee-section");
  const pickdropFeeSection = pickdropFeeList?.closest(".reservation-fee-section");

  const elements = {
    modal,
    memberInput,
    memberResults,
    miniGrid,
    miniCurrent,
    miniPrev,
    miniNext,
    serviceContainer,
    ticketContainer,
    ticketPlaceholder,
    pickdropInputs,
    countCurrent,
    countLimit,
    countError,
    countDiff,
    overrideCheckbox,
    countsRow,
    daycareRow,
    daycareFeeRow,
    daycareStartTime,
    daycareEndTime,
    daycareFeeValue,
    schoolFeeList,
    pickdropFeeList,
    schoolTotalValue,
    pickdropTotalValue,
    feeSchoolCard,
    feePickdropCard,
    pricingTotalValue,
    pickdropTicketField,
    pickdropTicketEmpty,
    memoInput,
    pickdropToggle,
    stepOne,
    stepTwo,
    stepTitle,
    progress,
    progressSteps,
    nextButton,
    submitButton,
  };

  const formState = {
    services: new Set(),
    pickdrops: new Set(),
    selectedMember: null,
    selectedDates: new Set(),
    pickdropDates: new Set(),
    ticketSelections: [],
    schoolSelections: [],
    pickdropSelectionsInitialized: false,
    pickdropDatesInitialized: false,
    conflicts: new Set(),
    ticketOptions: [],
    ticketLimit: RESERVATION_LIMIT,
    schoolAllocationMap: new Map(),
    schoolRemainingMap: new Map(),
    pickdropAllocationMap: new Map(),
    pickdropRemainingMap: new Map(),
    miniViewDate: new Date(state.currentDate),
    autoSelected: false,
    context: "school",
  };

  const renderContextualLabels = () => {
    const context = formState.context || "school";
    const baseLabel = context === "hoteling" ? "호텔링 예약" : "유치원 예약";
    if (stepTitle) {
      stepTitle.textContent = modal?.classList?.contains("is-pickdrop")
        ? "픽드랍 예약"
        : baseLabel;
    }
    if (progressSteps && progressSteps.length) {
      const firstStepLabel = progressSteps[0].querySelector(".reservation-progress__label");
      if (firstStepLabel) {
        firstStepLabel.textContent = context === "hoteling" ? "호텔링" : "유치원";
      }
    }
    if (modal) {
      if (context) {
        modal.dataset.reservationContext = context;
      } else {
        modal.removeAttribute("data-reservation-context");
      }
    }
  };

  const syncFeeDisclosure = (isPickdropMode) => {
    if (elements.feeSchoolCard instanceof HTMLDetailsElement) {
      elements.feeSchoolCard.open = !isPickdropMode;
    }
    if (elements.feePickdropCard instanceof HTMLDetailsElement) {
      elements.feePickdropCard.open = isPickdropMode;
    }
    if (elements.feeSchoolCard) {
      elements.feeSchoolCard.classList.toggle("is-disabled", isPickdropMode);
    }
    if (elements.feePickdropCard) {
      elements.feePickdropCard.classList.toggle("is-disabled", !isPickdropMode);
    }
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
      pickdropToggle.textContent = enabled ? "등록" : "픽드랍까지 예약";
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
    if (enabled) {
      if (!formState.pickdropDatesInitialized) {
        formState.pickdropDates = new Set(formState.selectedDates);
      }
      formState.conflicts = getConflictDates(formState, storage);
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
      syncPricingFee();
      formState.pickdropSelectionsInitialized = false;
      formState.pickdropDatesInitialized = true;
    } else {
      formState.pickdrops = new Set();
      formState.conflicts = getConflictDates(formState, storage);
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
    const conflicts = getConflictDates(formState, storage);
    formState.conflicts = conflicts;
    formState.conflicts = conflicts;
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
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

  const setAmountRange = (amountEl, before, after, unitLabel = "회") => {
    if (!amountEl) {
      return;
    }
    const values = amountEl.querySelectorAll(".reservation-ticket-row__meta-value");
    const beforeEl = values[0] || null;
    const afterEl = values[1] || null;
    if (!beforeEl || !afterEl) {
      amountEl.textContent = `${before}${unitLabel} → ${after}${unitLabel}`;
      return;
    }
    beforeEl.textContent = `${before}${unitLabel}`;
    afterEl.textContent = `${after}${unitLabel}`;
    beforeEl.classList.toggle("is-low", Number(before) <= 2);
    afterEl.classList.toggle("is-low", Number(after) <= 2);
    amountEl.classList.toggle("is-empty", false);
    delete amountEl.dataset.feeAmount;
  };

  const getSelectedTicketMetaElement = (container) =>
    container?.querySelector?.(
      ".reservation-ticket-row.is-selected .reservation-ticket-row__meta"
    );

  const applyTicketMetaAmount = (amountEl, metaEl) => {
    if (!amountEl || !metaEl) {
      return false;
    }
    amountEl.replaceChildren(metaEl.cloneNode(true));
    amountEl.classList.toggle("is-empty", false);
    delete amountEl.dataset.feeAmount;
    return true;
  };

  const applyFeeAmountText = (amountEl) => {
    if (!amountEl) {
      return;
    }
    const feeAmount = Number(amountEl.dataset.feeAmount);
    const hasFeeAmount = Number.isFinite(feeAmount);
    const text = hasFeeAmount ? formatTicketPrice(Math.max(feeAmount, 0)) : "-";
    amountEl.textContent = text;
    amountEl.classList.toggle("is-empty", text === "-");
  };

  const syncFeeCardState = () => {
    const mode = getReservationMode(elements);
    const schoolSelectionOrder = mode === "pickdrop"
      ? formState.schoolSelections
      : formState.ticketSelections;
    const pickdropSelectionOrder = mode === "pickdrop"
      ? formState.ticketSelections
      : [];

    const hasSchoolSelection = Array.isArray(schoolSelectionOrder)
      && schoolSelectionOrder.length > 0;
    const hasPickdropSelection = Array.isArray(pickdropSelectionOrder)
      && pickdropSelectionOrder.length > 0;

    if (schoolFeeSection) {
      schoolFeeSection.classList.toggle("is-disabled", hasSchoolSelection);
    }
    if (pickdropFeeSection) {
      pickdropFeeSection.classList.toggle("is-disabled", hasPickdropSelection);
    }

    const classes = classStorage.ensureDefaults();
    const selectedClassType = getSelectedServiceType(formState, classes, elements);

    if (schoolTotalValue) {
      if (hasSchoolSelection) {
        const totals = sumSelectionRemaining(
          schoolSelectionOrder,
          formState.schoolAllocationMap,
          formState.schoolRemainingMap
        );
        const totalReservable = formState.selectedMember?.totalReservableCountByType?.[selectedClassType];
        const beforeValue = Number.isFinite(Number(totalReservable))
          ? Number(totalReservable)
          : totals.remainingBefore;
        setAmountRange(
          schoolTotalValue,
          beforeValue,
          totals.remainingAfter
        );
      } else {
        applyFeeAmountText(schoolTotalValue);
      }
    }

    if (pickdropTotalValue) {
      if (hasPickdropSelection) {
        const selectedMeta = getSelectedTicketMetaElement(elements.pickdropTicketField);
        if (!applyTicketMetaAmount(pickdropTotalValue, selectedMeta)) {
          const totals = sumSelectionRemaining(
            pickdropSelectionOrder,
            formState.pickdropAllocationMap,
            formState.pickdropRemainingMap
          );
          const usage = totals.remainingBefore - totals.remainingAfter;
          const totalReservable = getPickdropReservableTotal(
            formState.selectedMember?.totalReservableCountByType
          );
          const beforeValue = Number.isFinite(Number(totalReservable))
            ? Number(totalReservable)
            : totals.remainingBefore;
          setAmountRange(
            pickdropTotalValue,
            beforeValue,
            beforeValue - usage
          );
        }
      } else {
        applyFeeAmountText(pickdropTotalValue);
      }
    }
  };

  const syncPricingFee = () => {
    const mode = getReservationMode(elements);
    const activeDates = getActiveDates(formState, elements);
    const serviceDates = mode === "pickdrop"
      ? formState.selectedDates
      : activeDates;
    const pickdropDates = mode === "pickdrop"
      ? formState.pickdropDates
      : activeDates;
    renderPricingBreakdown({
      schoolFeeContainer: elements.schoolFeeList,
      pickdropFeeContainer: elements.pickdropFeeList,
      schoolTotalEl: elements.schoolTotalValue,
      pickdropTotalEl: elements.pickdropTotalValue,
      totalEl: elements.pricingTotalValue,
      pricingItems: pricingStorage.loadPricingItems(),
      classes: classStorage.ensureDefaults(),
      services: formState.services,
      pickdrops: formState.pickdrops,
      dateCount: activeDates.size,
      serviceDateCount: serviceDates.size,
      pickdropDateCount: pickdropDates.size,
      selectedWeekdayCounts: getSelectedWeekdayCounts(
        serviceDates,
        timeZone
      ),
      memberWeight: formState.selectedMember?.weight,
    });
    syncFeeCardState();
    syncReservationFeeTotal(modal, elements.pricingTotalValue);
  };

  const syncDaycareUI = () => {
    const classes = classStorage.ensureDefaults();
    const isDaycare = isDaycareSelected(formState, classes);
    if (elements.countsRow) {
      elements.countsRow.hidden = isDaycare;
    }
    if (elements.daycareRow) {
      elements.daycareRow.hidden = !isDaycare;
    }
    if (elements.daycareFeeRow) {
      elements.daycareFeeRow.hidden = !isDaycare;
    }
    if (elements.daycareFeeValue) {
      if (!isDaycare) {
        elements.daycareFeeValue.textContent = "-";
      } else {
        const pricing = getDaycarePricing(operationsStorage);
        const fee = calculateDaycareFee(
          elements.daycareStartTime?.value || "",
          elements.daycareEndTime?.value || "",
          pricing
        );
        const activeDates = getActiveDates(formState, elements);
        const totalFee = fee * Math.max(activeDates.size, 0);
        elements.daycareFeeValue.textContent = formatTicketPrice(totalFee);
      }
    }
    syncPricingFee();
    return isDaycare;
  };

  const syncTicketSection = () => {
    const classes = classStorage.ensureDefaults();
    const mode = getReservationMode(elements);
    if (elements.ticketContainer) {
      elements.ticketContainer.hidden = false;
    }
    if (elements.ticketPlaceholder) {
      elements.ticketPlaceholder.hidden = !formState.selectedMember;
    }
    const selectedClassType = getSelectedServiceType(formState, classes, elements);
    const totalLimitValue = Number(
      formState.selectedMember?.totalReservableCountByType?.[selectedClassType]
    );
    const hasNoReservableTickets = Number.isFinite(totalLimitValue) && totalLimitValue <= 0;
    if (hasNoReservableTickets) {
      if (elements.ticketContainer) {
        elements.ticketContainer.textContent = "";
      }
      if (elements.ticketPlaceholder) {
        elements.ticketPlaceholder.hidden = !formState.selectedMember;
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
    const activeDates = getActiveDates(formState, elements);
    const serviceDates = filterConflictingDates(
      formState.selectedDates,
      formState.conflicts
    );
    const eligibleOptions = getEligibleTicketOptions(
      formState.ticketOptions,
      formState.services,
      classes
    );
    const pickdropOptions = formState.ticketOptions.filter(
      (ticket) => ticket.type === "pickdrop"
    );
    const serviceOptions = eligibleOptions.filter(
      (ticket) => ticket.type === selectedClassType
    );
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
            serviceDates.size,
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
        disabledIds
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
          serviceDates.size,
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
      formState.ticketLimit = minRemaining * Math.max(formState.services.size, 0);
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
    applyDefaultTickets(classes, forceDefaults);
    const conflicts = pruneConflictingDates(formState, storage);
    formState.conflicts = conflicts;
    const dayoffSettings = getDayoffSettings();
    syncTicketSection();
    syncPickdropTickets();
    const mode = getReservationMode(elements);
    const selectedClassType = getSelectedServiceType(formState, classes, elements);
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
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings,
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    if (autoChanged) {
      syncTicketSection();
    }
    syncDaycareUI();
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
      if (!classNames.length && serviceOptions.length > 0) {
        classNames.push(serviceOptions[0].value);
      }
      applyMemberClassSelection(formState, elements, classNames);
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
    if (elements.memberResults) {
      elements.memberResults.innerHTML = "";
    }
    if (typeof memberSelectOptions.onMemberSelect === "function") {
      memberSelectOptions.onMemberSelect(member);
    }
    return true;
  };

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    setPickdropMode(false);
    if (elements.stepOne) {
      elements.stepOne.hidden = false;
    }
    if (elements.stepTwo) {
      elements.stepTwo.hidden = false;
    }
    renderMemberResults(formState, elements, memberSelectOptions);
    const conflicts = pruneConflictingDates(formState, storage);
    formState.conflicts = conflicts;
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    syncDaycareUI();
    refreshTicketOptions();
    syncPricingFee();
    syncPickdropTickets();
  };

  const openModalFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reservation") !== "open") {
      return;
    }
    const memberId = params.get("memberId");
    openModal();
    if (memberId) {
      applyMemberSelection(memberId);
    }
    const pickdropMode = params.get("pickdrop") === "1";
    if (pickdropMode) {
      setPickdropMode(true);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("reservation");
    url.searchParams.delete("memberId");
    url.searchParams.delete("pickdrop");
    window.history.replaceState({}, "", url.toString());
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    setPickdropMode(false);
    resetForm(formState, elements, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    syncPricingFee();
  };

  renderServiceOptions(serviceContainer, serviceOptions, formState.services);
  pickdropInputs.forEach((input) => {
    syncFilterChip(input);
  });

  renderMiniCalendar(formState, elements, new Set(), {
    dayoffSettings: getDayoffSettings(),
    timeZone,
    selectedDates: getActiveDates(formState, elements),
  });

  openButton?.addEventListener("click", openModal);
  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);
  openModalFromQuery();

  const submitReservation = (options = {}) => {
    const includePickdrop = options.includePickdrop === true;
    const classes = classStorage.ensureDefaults();
    const mode = includePickdrop ? "pickdrop" : "school";
    const serviceType = includePickdrop
      ? "pickdrop"
      : getSelectedServiceType(formState, classes, elements);
    const activeDates = getActiveDates(formState, elements);
    const memberLimit = getMemberTotalReservableCount(formState, serviceType);
    const limit = memberLimit === null
      ? getEffectiveTicketLimit(formState, classes, activeDates.size)
      : memberLimit;
    const currentCount = memberLimit === null
      ? getReservationCount(formState, elements)
      : activeDates.size;
    const exceedsLimit = currentCount > limit;
    if (exceedsLimit && !overrideCheckbox.checked) {
      syncActionState(formState, elements, classes);
      return;
    }

    const isDaycare = isDaycareSelected(formState, classes);
    const pickdropFlags = includePickdrop
      ? {
          hasPickup: formState.pickdrops.has("pickup"),
          hasDropoff: formState.pickdrops.has("dropoff"),
        }
      : {
          hasPickup: false,
          hasDropoff: false,
        };
    const pricing = getDaycarePricing(operationsStorage);
    const daycareFee = isDaycare
      ? calculateDaycareFee(
          elements.daycareStartTime?.value || "",
          elements.daycareEndTime?.value || "",
          pricing
        )
      : 0;
    const reservationDates = [];
    const memo = memoInput instanceof HTMLTextAreaElement
      ? memoInput.value.trim()
      : "";
    const serviceName = Array.from(formState.services)[0] || "";
    const serviceClass = classes.find((item) => item.name === serviceName);
    const primaryServiceType = serviceClass?.type || "school";
    const serviceDates = getSortedDateKeys(formState.selectedDates);
    const pickdropDates = includePickdrop
      ? getSortedDateKeys(formState.pickdropDates)
      : [];
    const pickdropCount = includePickdrop
      && (pickdropFlags.hasPickup || pickdropFlags.hasDropoff)
      ? pickdropDates.length
      : 0;
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
              formState.selectedDates.size,
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
            formState.selectedDates.size,
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
    const serviceTicketUsageMap = buildDateTicketUsageMap(
      serviceDates,
      serviceSelectionOrder,
      serviceUsedMap,
      optionMap
    );
    const pickdropTicketUsagesMap = buildDateTicketUsagesMap(
      pickdropDates,
      pickdropUsagePlan,
      optionMap
    );

    const pickdropDateSet = includePickdrop ? formState.pickdropDates : new Set();
    const getPickdropForDate = (dateKey) => ({
      pickup: Boolean(pickdropFlags.hasPickup && pickdropDateSet.has(dateKey)),
      dropoff: Boolean(pickdropFlags.hasDropoff && pickdropDateSet.has(dateKey)),
    });

    serviceDates.forEach((dateKey) => {
      const pickdropForDate = getPickdropForDate(dateKey);
      const serviceUsage = serviceTicketUsageMap.get(dateKey) || null;
      reservationDates.push({
        date: dateKey,
        class: serviceName,
        service: serviceName,
        baseStatusKey: "PLANNED",
        statusText: "예약",
        checkinTime: elements.daycareStartTime?.value || "",
        checkoutTime: elements.daycareEndTime?.value || "",
        daycareFee: isDaycare ? daycareFee : 0,
        ticketUsages: serviceUsage ? [serviceUsage] : [],
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
          statusText: "예약",
          checkinTime: "",
          checkoutTime: "",
          daycareFee: 0,
          ticketUsages: pickdropTicketUsagesMap.get(dateKey) || [],
          ...pickdropForDate,
        });
      });
    }

    const hasAnyPickup = reservationDates.some((entry) => entry.pickup);
    const hasAnyDropoff = reservationDates.some((entry) => entry.dropoff);
    const reservationItem = {
      id: createId(),
      type: primaryServiceType,
      class: serviceName,
      service: serviceName,
      baseStatusKey: "PLANNED",
      statusText: "예약",
      dogName: formState.selectedMember?.dogName || "",
      breed: formState.selectedMember?.breed || "",
      owner: formState.selectedMember?.owner || "",
      memo,
      checkinTime: elements.daycareStartTime?.value || "",
      checkoutTime: elements.daycareEndTime?.value || "",
      daycareFee: isDaycare ? daycareFee : 0,
      hasPickup: hasAnyPickup,
      hasDropoff: hasAnyDropoff,
      pickupChecked: hasAnyPickup,
      dropoffChecked: hasAnyDropoff,
      address: "",
      dates: reservationDates,
    };

    state.reservations = persistReservations([reservationItem]);
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
    notifyReservationUpdated();
    showToast("예약이 등록되었습니다.");
    setPickdropMode(false);
    resetForm(formState, elements, {
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
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
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
          syncFilterChip(serviceInput);
        }
      });
    const conflicts = pruneConflictingDates(formState, storage);
    formState.conflicts = conflicts;
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    syncDaycareUI();
    refreshTicketOptions(true);
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
    const conflicts = getConflictDates(formState, storage);
    formState.conflicts = conflicts;
    formState.conflicts = conflicts;
    const dayoffSettings = getDayoffSettings();
    if (mode === "pickdrop") {
      renderMiniCalendar(formState, elements, conflicts, {
        dayoffSettings,
        timeZone,
        selectedDates: getActiveDates(formState, elements),
      });
      return;
    }
    const autoChanged = applyAutoWeekdaySelection(
      formState,
      conflicts,
      timeZone,
      true,
      dayoffSettings
    );
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings,
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    if (autoChanged) {
      syncTicketSection();
    }
  };

  ticketContainer?.addEventListener("change", handleTicketSelectionChange);
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

  elements.daycareStartTime?.addEventListener("input", () => {
    syncDaycareUI();
  });

  elements.daycareEndTime?.addEventListener("input", () => {
    syncDaycareUI();
  });

  memberInput?.addEventListener("input", () => {
    renderMemberResults(formState, elements, memberSelectOptions);
    elements.memberResults?.classList.add("is-open");
  });

  memberInput?.addEventListener("focus", () => {
    elements.memberResults?.classList.add("is-open");
  });

  memberInput?.addEventListener("blur", () => {
    setTimeout(() => {
      elements.memberResults?.classList.remove("is-open");
    }, 100);
  });

  const clearMember = modal.querySelector("[data-member-clear]");
  clearMember?.addEventListener("click", () => {
    setPickdropMode(false);
    resetForm(formState, elements, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      getClasses: () => classStorage.ensureDefaults(),
    });
    renderMemberResults(formState, elements, memberSelectOptions);
    elements.memberResults?.classList.remove("is-open");
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
    const conflicts = getConflictDates(formState, storage);
    formState.conflicts = conflicts;
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    syncTicketSection();
    if (mode === "pickdrop") {
      syncPricingFee();
      return;
    }
    syncDaycareUI();
    syncPricingFee();
  });

  miniPrev?.addEventListener("click", () => {
    const d = formState.miniViewDate;
    formState.miniViewDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const conflicts = getConflictDates(formState, storage);
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    syncPricingFee();
  });

  miniNext?.addEventListener("click", () => {
    const d = formState.miniViewDate;
    formState.miniViewDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const conflicts = getConflictDates(formState, storage);
    renderMiniCalendar(formState, elements, conflicts, {
      dayoffSettings: getDayoffSettings(),
      timeZone,
      selectedDates: getActiveDates(formState, elements),
    });
    syncPricingFee();
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
    if (modal.classList.contains("is-pickdrop")) {
      setPickdropMode(false);
      return;
    }
    submitReservation({ includePickdrop: false });
  });

  const openPickdropModal = (memberId, options = {}) => {
    resetForm(formState, elements, {
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

  return {
    openModal,
    openPickdropModal,
  };
}
