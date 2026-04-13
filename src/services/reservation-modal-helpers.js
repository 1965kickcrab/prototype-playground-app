import { initClassStorage } from "../storage/class-storage.js";
import {
  getTicketReservableValue,
  normalizePickdropType,
} from "./ticket-service.js";
import { getReservationEntries } from "./reservation-entries.js";
import {
  getMemberDaycareReservationDates,
  getMemberReservationConflictDates,
} from "./member-reservation-summary.js";
import { getSelectedTicketWeekdays, getAutoSelectedDateKeys } from "./ticket-reservation-service.js";
import {
  getDateKeyFromParts,
  getDatePartsFromKey,
  getZonedTodayParts,
  getWeekdayIndex,
  sortDateKeys,
} from "../utils/date.js";
import { isCanceledStatus } from "../utils/status.js";
import { isDayoffDate } from "../utils/dayoff.js";

export const SERVICE_OPTIONS = [
  { value: "school", label: "유치원" },
  { value: "daycare", label: "데이케어" },
];

export const RESERVATION_LIMIT = 0;
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const RESERVATION_SCOPE_CONFIG = {
  school: {
    activeServiceLabel: "유치원",
    usesCountLimit: true,
    usesTimeRange: false,
    calendarConflictMode: "school_conflict",
  },
  daycare: {
    activeServiceLabel: "데이케어",
    usesCountLimit: false,
    usesTimeRange: true,
    calendarConflictMode: "daycare_info",
  },
  pickdrop: {
    activeServiceLabel: "유치원",
    usesCountLimit: false,
    usesTimeRange: false,
    calendarConflictMode: "pickdrop",
  },
};

function normalizeContextKey(value) {
  return String(value || "").trim().toLowerCase() === "daycare"
    ? "daycare"
    : "school";
}

export function formatDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

export function buildCalendarCells(viewDate) {
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

export function getNumericValue(element, fallback = 0) {
  if (!element) return fallback;
  const source = element.dataset.value ?? element.textContent ?? "";
  const value = Number(source);
  return Number.isFinite(value) ? value : fallback;
}

export function setCountValue(element, value, options = {}) {
  if (!element) return;
  const numericValue = Number(value);
  const isNumeric = Number.isFinite(numericValue);
  const normalized = isNumeric ? String(numericValue) : String(value);
  const minDisplayValue = Number(options.minDisplayValue);
  const hasMinDisplayValue = Number.isFinite(minDisplayValue);
  const displayNumericValue = isNumeric && hasMinDisplayValue
    ? Math.max(numericValue, minDisplayValue)
    : numericValue;
  const displayText = isNumeric ? String(displayNumericValue) : String(value);
  const shouldMarkExceeded = Boolean(options.negativeAsExceeded && isNumeric && numericValue < 0);

  element.dataset.value = normalized;
  element.textContent = shouldMarkExceeded
    ? `초과 ${Math.abs(numericValue)}`
    : displayText;

  if (options.negativeClassName) {
    element.classList.toggle(options.negativeClassName, shouldMarkExceeded);
  }
}

export function getMemberReservableCountByType(member, type) {
  if (!member || !type || !Array.isArray(member.tickets)) {
    return null;
  }
  const matches = member.tickets.filter((ticket) => ticket?.type === type);
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((sum, ticket) => {
    const value = Number(getTicketReservableValue(ticket));
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

export function getReservationMode(elements) {
  return elements?.modal?.classList?.contains("is-pickdrop")
    ? "pickdrop"
    : "school";
}

export function resolveReservationModalScope(state, classes, elements, options = {}) {
  const ignorePickdrop = options.ignorePickdrop === true;
  const mode = getReservationMode(elements);
  const contextKey = normalizeContextKey(state?.context);
  const selectedName = Array.from(state?.services || [])[0] || "";
  const selectedClass = Array.isArray(classes)
    ? classes.find((item) => item.name === selectedName)
    : null;
  const selectedClassType = normalizeContextKey(selectedClass?.type);
  const entryType = !ignorePickdrop && mode === "pickdrop"
    ? "pickdrop"
    : contextKey;
  const serviceType = entryType === "pickdrop" ? "pickdrop" : contextKey;
  const scopeConfig = RESERVATION_SCOPE_CONFIG[serviceType] || RESERVATION_SCOPE_CONFIG.school;

  return {
    mode,
    contextKey,
    entryType,
    serviceType,
    selectedClassName: selectedName,
    selectedClassType: selectedClassType || contextKey,
    usesCountLimit: scopeConfig.usesCountLimit,
    usesTimeRange: scopeConfig.usesTimeRange,
    calendarConflictMode: scopeConfig.calendarConflictMode,
    activeServiceLabel: scopeConfig.activeServiceLabel,
  };
}

export function getSelectedServiceType(state, classes, elements, ignorePickdrop = false) {
  return resolveReservationModalScope(state, classes, elements, { ignorePickdrop }).serviceType;
}

export function filterConflictingDates(dates, conflicts) {
  if (!(dates instanceof Set) || !(conflicts instanceof Set)) {
    return dates;
  }
  if (conflicts.size === 0) {
    return dates;
  }
  return new Set(Array.from(dates).filter((dateKey) => !conflicts.has(dateKey)));
}

export function getActiveDates(state, elements) {
  const baseDates = getReservationMode(elements) === "pickdrop"
    ? state.pickdropDates
    : state.selectedDates;
  return filterConflictingDates(baseDates, state.conflicts);
}

export function getMemberTotalReservableCount(state, serviceType) {
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

export function getReservableTicketOptions(ticketOptions) {
  if (!Array.isArray(ticketOptions)) {
    return [];
  }
  return ticketOptions.filter((ticket) => {
    const reservableCount = Number(getTicketReservableValue(ticket));
    const remainingCount = Number(ticket?.remainingCount);
    return reservableCount >= 1 || remainingCount >= 1;
  });
}

export function isDaycareSelected(state, classes) {
  return resolveReservationModalScope(state, classes, null, { ignorePickdrop: true }).serviceType === "daycare";
}

export function getSelectedReservationCount(state, dateCountOverride = null) {
  const dateCount = Number.isFinite(dateCountOverride)
    ? dateCountOverride
    : state.selectedDates?.size || 0;
  const serviceCount = state.services?.size || 0;
  return dateCount * serviceCount;
}

export function getEffectiveTicketLimit(state, classes, dateCountOverride = null) {
  const limit = Number.isFinite(state.ticketLimit)
    ? state.ticketLimit
    : RESERVATION_LIMIT;
  const isDaycare = isDaycareSelected(state, classes);
  if (!isDaycare && state.ticketSelections.length === 0) {
    return getSelectedReservationCount(state, dateCountOverride);
  }
  return limit;
}

export function getReservationCount(state, elements) {
  const activeDates = getActiveDates(state, elements);
  const dateCount = activeDates?.size || 0;
  if (getReservationMode(elements) === "pickdrop") {
    return dateCount;
  }
  return getSelectedReservationCount(state, dateCount);
}

export function getSelectedDateLimit(limit, serviceCount) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  if (serviceCount <= 0) {
    return limit;
  }
  return Math.floor(limit / serviceCount);
}

export function buildClassTicketMap(classes, selectedServices, ticketOptions = []) {
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

export function getUsedReservationCountByClass(storage, member, selectedServices) {
  const results = new Map();
  if (!member || !selectedServices || selectedServices.size === 0) {
    return results;
  }
  const reservations = storage?.loadReservations?.() || [];
  const memberId = String(member.id || "");
  if (!memberId) {
    return results;
  }
  getReservationEntries(reservations).forEach((entry) => {
    const { reservation, className, baseStatusKey, statusText } = entry;
    if (!reservation || isCanceledStatus(baseStatusKey, statusText, storage)) {
      return;
    }
    if (String(reservation.memberId || "") !== memberId) {
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

export function allocateCountsByClass({
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

export function getClassRemainingMinimum({
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

export function getSortedDateKeys(dateSet) {
  return sortDateKeys(Array.from(dateSet || []));
}

export function toggleDate(state, dateKey, targetDates = state.selectedDates) {
  if (targetDates.has(dateKey)) {
    targetDates.delete(dateKey);
  } else {
    targetDates.add(dateKey);
  }
  state.autoSelected = false;
}

export function getServiceOptions(state) {
  const services = Array.isArray(state?.serviceOptions) ? state.serviceOptions : [];
  if (services.length) {
    return services.map((name) => ({ value: name, label: name }));
  }

  return SERVICE_OPTIONS;
}

export function getContextFilteredServiceOptions(serviceOptions, classes, context = "school") {
  if (!Array.isArray(serviceOptions) || !Array.isArray(classes)) {
    return [];
  }
  return serviceOptions.filter((option) => {
    const optionValue = typeof option === "string" ? option : option?.value;
    const match = classes.find((item) => item.name === optionValue);
    const type = String(match?.type || "school").trim().toLowerCase();
    return type === "school" || type === "daycare";
  });
}

export function applyServiceSelection(state, value, checked) {
  if (!checked) {
    return;
  }
  state.services = new Set([value]);
}

export function applyPickdropSelection(state, value, checked) {
  if (checked) {
    state.pickdrops.add(value);
  } else {
    state.pickdrops.delete(value);
  }
}

export function hasPickdropPricing(pricingItems, key) {
  if (!Array.isArray(pricingItems) || !key) {
    return false;
  }
  return pricingItems.some(
    (item) =>
      item?.serviceType === "pickdrop"
      && normalizePickdropType(item?.pickdropType || item?.title) === key
  );
}

export function getMemberTicketClassNames(classes, ticketOptions, serviceOptions) {
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

export function getEligibleTicketOptions(ticketOptions, selectedServices, classes, serviceTypeOverride = "") {
  if (!Array.isArray(ticketOptions) || ticketOptions.length === 0) {
    return [];
  }
  if (!selectedServices || selectedServices.size === 0) {
    return [];
  }
  const ticketIdSet = new Set();
  const selectedName = Array.from(selectedServices)[0] || "";
  const selectedType = String(serviceTypeOverride || "").trim().toLowerCase()
    || classes.find((item) => item.name === selectedName)?.type
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
  return linkedOptions.filter((ticket) => ticket.type === selectedType);
}

export function getSchoolBlockedDates(state, storage) {
  return getMemberReservationConflictDates({
    reservations: storage?.loadReservations?.() || [],
    member: state.selectedMember,
    services: state.services,
    storage,
  });
}

export function getDaycareInfoDates(state, storage) {
  return getMemberDaycareReservationDates({
    reservations: storage?.loadReservations?.() || [],
    member: state.selectedMember,
    services: state.services,
    storage,
  });
}

export function getModalCalendarState(state, storage, scope = null, elements = null) {
  const classes = initClassStorage().ensureDefaults();
  const resolvedScope = scope || resolveReservationModalScope(state, classes, elements);
  if (resolvedScope.calendarConflictMode === "school_conflict") {
    return {
      blockedDates: getSchoolBlockedDates(state, storage),
      infoDates: new Set(),
    };
  }
  if (resolvedScope.calendarConflictMode === "daycare_info") {
    return {
      blockedDates: new Set(),
      infoDates: getDaycareInfoDates(state, storage),
    };
  }
  return {
    blockedDates: new Set(),
    infoDates: new Set(),
  };
}

export function getConflictDates(state, storage, scope = null, elements = null) {
  return getModalCalendarState(state, storage, scope, elements).blockedDates;
}

export function pruneConflictingDates(state, storage, scope = null, elements = null) {
  const conflicts = getConflictDates(state, storage, scope, elements);
  if (conflicts.size === 0) {
    return conflicts;
  }
  state.selectedDates = new Set(
    Array.from(state.selectedDates).filter((dateKey) => !conflicts.has(dateKey))
  );
  state.pickdropDatesInitialized = false;
  return conflicts;
}

export function isSameDateList(selectedDates, nextDates) {
  if (selectedDates.size !== nextDates.length) {
    return false;
  }
  return nextDates.every((dateKey) => selectedDates.has(dateKey));
}

export function applyAutoWeekdaySelection(
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
  const count = Number.isFinite(overrides.count)
    ? overrides.count
    : getSelectedDateLimit(
      state.ticketLimit,
      Math.max(state.services?.size || 0, 1)
    );
  if (!force && state.selectedDates?.size > 0 && !state.autoSelected) {
    return false;
  }
  const startKey = overrides.startKey || null;
  const nextDates = getAutoSelectedDateKeys({
    weekdays,
    count,
    conflicts,
    timeZone,
    startKey,
    dayoffSettings,
  });
  if (!force && isSameDateList(state.selectedDates, nextDates)) {
    return false;
  }
  state.selectedDates = new Set(nextDates);
  state.autoSelected = true;
  return true;
}

export function getTodayKey(timeZone) {
  return getDateKeyFromParts(getZonedTodayParts(timeZone));
}

export function getSelectedWeekdayCounts(selectedDates, timeZone) {
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

export function getMemberAutoSelectionOptions(state, classes, timeZone) {
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
  const candidates = eligibleOptions.filter((ticket) => {
    const remaining = availableMap.get(ticket.id) ?? 0;
    return remaining > 0 && Array.isArray(ticket.weekdays) && ticket.weekdays.length > 0;
  });
  if (candidates.length === 0) {
    return null;
  }
  let totalCount = 0;
  const allWeekdays = new Set();
  candidates.forEach((ticket) => {
    totalCount += (availableMap.get(ticket.id) ?? 0);
    ticket.weekdays.forEach((day) => allWeekdays.add(day));
  });
  return {
    weekdays: Array.from(allWeekdays),
    count: totalCount,
    startKey: getTodayKey(timeZone),
  };
}

export function getBillingExpectedByDateMap(billing) {
  const allocationsByDate =
    billing && typeof billing === "object" && billing.allocationsByDate && typeof billing.allocationsByDate === "object"
      ? billing.allocationsByDate
      : {};
  return Object.entries(allocationsByDate).reduce((acc, [dateKey, allocation]) => {
    const expected = Number(allocation?.expected);
    acc.set(dateKey, Number.isFinite(expected) && expected > 0 ? expected : 0);
    return acc;
  }, new Map());
}

export function splitPaymentAmountByEntries(totalAmount, entries, expectedByDate) {
  const safeTotal = Math.max(0, Math.round(Number(totalAmount) || 0));
  const targetEntries = Array.isArray(entries) ? entries : [];
  if (safeTotal <= 0 || targetEntries.length === 0) {
    return targetEntries.map(() => 0);
  }

  const dateExpectedList = targetEntries.map((entry) => {
    const dateKey = String(entry?.date || "");
    const expected = Number(expectedByDate?.get?.(dateKey));
    return Number.isFinite(expected) && expected > 0 ? expected : 0;
  });
  const expectedTotal = dateExpectedList.reduce((sum, expected) => sum + expected, 0);

  if (expectedTotal <= 0) {
    const baseAmount = Math.floor(safeTotal / targetEntries.length);
    return targetEntries.map((_, index) =>
      index === targetEntries.length - 1
        ? safeTotal - baseAmount * (targetEntries.length - 1)
        : baseAmount
    );
  }

  const splitAmounts = targetEntries.map(() => 0);
  let assignedTotal = 0;
  for (let index = 0; index < targetEntries.length - 1; index += 1) {
    const expected = dateExpectedList[index];
    const allocated = Math.round((safeTotal * expected) / expectedTotal);
    splitAmounts[index] = Math.max(0, allocated);
    assignedTotal += splitAmounts[index];
  }
  if (assignedTotal > safeTotal) {
    let overflow = assignedTotal - safeTotal;
    for (let index = targetEntries.length - 2; index >= 0 && overflow > 0; index -= 1) {
      const reducible = Math.min(splitAmounts[index], overflow);
      splitAmounts[index] -= reducible;
      overflow -= reducible;
      assignedTotal -= reducible;
    }
  }
  splitAmounts[targetEntries.length - 1] = Math.max(0, safeTotal - assignedTotal);
  return splitAmounts;
}

export function createReservationFormState(currentDate) {
  return {
    services: new Set(),
    pickdrops: new Set(),
    selectedMember: null,
    selectedDates: new Set(),
    pickdropDates: new Set(),
    ticketSelections: [],
    schoolSelections: [],
    pickdropSelectionsInitialized: false,
    pickdropDatesInitialized: false,
    daycareDefaultsInitialized: false,
    daycareTimesEdited: false,
    conflicts: new Set(),
    calendarInfoDates: new Set(),
    ticketOptions: [],
    ticketLimit: RESERVATION_LIMIT,
    schoolAllocationMap: new Map(),
    schoolRemainingMap: new Map(),
    pickdropAllocationMap: new Map(),
    pickdropRemainingMap: new Map(),
    miniViewDate: new Date(currentDate),
    autoSelected: false,
    context: "school",
    selectedTagFilters: [],
  };
}

export function resetReservationFormState(state, currentDate = new Date()) {
  state.services = new Set();
  state.pickdrops = new Set();
  state.selectedMember = null;
  state.selectedDates = new Set();
  state.pickdropDates = new Set();
  state.conflicts = new Set();
  state.calendarInfoDates = new Set();
  state.ticketSelections = [];
  state.schoolSelections = [];
  state.ticketOptions = [];
  state.ticketLimit = RESERVATION_LIMIT;
  state.miniViewDate = new Date(currentDate);
  state.autoSelected = false;
  state.context = "school";
  state.pickdropSelectionsInitialized = false;
  state.pickdropDatesInitialized = false;
  state.daycareDefaultsInitialized = false;
  state.daycareTimesEdited = false;
  state.schoolAllocationMap = new Map();
  state.schoolRemainingMap = new Map();
  state.pickdropAllocationMap = new Map();
  state.pickdropRemainingMap = new Map();
}
