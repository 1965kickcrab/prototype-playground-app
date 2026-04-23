import { markReady, syncFilterChip } from "../utils/dom.js";
import {
  getActiveServices,
  normalizeService,
} from "../utils/service-selection.js";
import {
  getActiveTeachers,
  normalizeTeacher,
} from "../utils/teacher-selection.js";
import { isCanceledStatus } from "../utils/status.js";
import { getTimeZone } from "../utils/timezone.js";
import { initOperationsStorage } from "../storage/operations-storage.js";
import { isDayoffDate } from "../utils/dayoff.js";
import { notifyReservationUpdated } from "../utils/reservation-events.js";
import { initClassStorage } from "../storage/class-storage.js";
import { formatTicketPrice } from "../services/ticket-service.js";
import {
  addTicketUsagesCount,
  getEntryTicketUsages,
} from "../services/ticket-usage-service.js";
import {
  applyReservationStatusChange,
  loadIssueMembers,
  rollbackReservationMemberTickets,
} from "../storage/ticket-issue-members.js";
import {
  getReservationEntries,
  removeReservationDateEntry,
  updateReservationDateEntry,
} from "../services/reservation-entries.js";
import { getPickdropCountType } from "../services/pickdrop-policy.js";
import { hasTagValue, sanitizeTagList } from "../utils/tags.js";
import {
  shouldClearTicketPaymentOnCancellation,
} from "../services/reservation-payment.js";
import {
  getReservationPaymentStatus,
} from "../services/reservation-payment-status.js";
import {
  buildReservationWithBilling,
} from "../services/reservation-billing.js";
import {
  bindListCountFilterBar,
  renderListCountFilterBar,
} from "./list-count-filter-bar.js";

const STATUS_CLASSES = [
  "list-table__status--primary",
  "list-table__status--warning",
  "list-table__status--success",
  "list-table__status--danger",
];

const STATUS_ORDER = ["PLANNED", "CHECKIN", "CHECKOUT", "ABSENT", "CANCELED"];

const PICKDROP_TYPES = {
  PICKUP: "pickup",
  DROPOFF: "dropoff",
};

const STATUS_MENU_ORDER = ["PLANNED", "CHECKIN", "CHECKOUT", "ABSENT", "CANCELED"];
const STATUSES_WITHOUT_TIMES = new Set(["PLANNED", "ABSENT"]);

const SERVICE_RESERVATION_TYPES = new Set(["school", "daycare", "pickdrop"]);
const SCHEDULE_CLASS_FILTER_ALL = "all";

const filterSchoolReservations = (reservations) =>
  (Array.isArray(reservations) ? reservations : []).filter(
    (item) => SERVICE_RESERVATION_TYPES.has(String(item?.type || ""))
  );

const loadSchoolReservationsFromStorage = (storage) =>
  storage && typeof storage.loadReservations === "function"
    ? filterSchoolReservations(storage.loadReservations())
    : [];

const resolveSchoolReservations = (storage, reservations) => {
  const stored = loadSchoolReservationsFromStorage(storage);
  if (stored.length > 0) {
    return stored;
  }
  return filterSchoolReservations(reservations);
};

const mergeSchoolReservations = (storage, nextSchoolReservations, fallbackReservations) => {
  const nextSchool = filterSchoolReservations(nextSchoolReservations);
  const allReservations =
    storage && typeof storage.loadReservations === "function"
      ? storage.loadReservations()
      : (Array.isArray(fallbackReservations) ? fallbackReservations : []);
  const nonSchool = (Array.isArray(allReservations) ? allReservations : []).filter(
    (item) => !SERVICE_RESERVATION_TYPES.has(String(item?.type || ""))
  );
  return [...nonSchool, ...nextSchool];
};

function saveSchoolReservations(state, storage, nextSchoolReservations, fallbackReservations) {
  const mergedReservations = mergeSchoolReservations(
    storage,
    nextSchoolReservations,
    fallbackReservations
  );
  if (storage && typeof storage.saveReservations === "function") {
    storage.saveReservations(mergedReservations);
  }
  const nextStateReservations = filterSchoolReservations(mergedReservations);
  if (state) {
    state.reservations = nextStateReservations;
  }
  return nextStateReservations;
}

function updateSchoolReservation(state, storage, reservationId, updateReservationItem) {
  if (storage && typeof storage.updateReservation === "function") {
    const updatedReservations = storage.updateReservation(
      reservationId,
      updateReservationItem
    );
    const nextStateReservations = filterSchoolReservations(updatedReservations);
    if (state) {
      state.reservations = nextStateReservations;
    }
    return nextStateReservations;
  }

  const currentReservations = filterSchoolReservations(state?.reservations);
  const nextReservations = currentReservations.map((item) => {
    if (item.id !== reservationId) {
      return item;
    }
    return updateReservationItem(item);
  });
  return saveSchoolReservations(
    state,
    storage,
    nextReservations,
    state?.reservations
  );
}

function findSchoolReservation(storage, state, reservationId) {
  return resolveSchoolReservations(storage, state?.reservations).find(
    (item) => item.id === reservationId
  ) || null;
}

function findReservationEntryByDate(reservation, dateKey) {
  if (!reservation || !dateKey) {
    return null;
  }
  return getReservationEntries([reservation]).find((entry) => entry.date === dateKey) || null;
}

function openLayer(modal) {
  if (!modal) {
    return;
  }
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeLayer(modal) {
  if (!modal) {
    return;
  }
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function bindLayerClose(overlay, closeButtons, close) {
  overlay?.addEventListener("click", close);
  closeButtons.forEach((button) => {
    button.addEventListener("click", close);
  });
}

function formatDateKey(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSubtitleDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getCurrentTimeString(timeZone) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date());
}

const TARGET_TO_BASE_STATUS = {
  PLANNED: "PLANNED",
  CHECKIN: "CHECKIN",
  CHECKOUT: "CHECKOUT",
  ABSENT: "ABSENT",
  CANCELED: "CANCELED",
};

function getStatusTone(resolvedStatus, STATUS) {
  switch (resolvedStatus) {
    case STATUS.PLANNED:
      return "primary";
    case STATUS.CHECKIN:
      return "warning";
    case STATUS.CHECKOUT:
      return "success";
    case STATUS.ABSENT:
      return "danger";
    case STATUS.CANCELED:
      return "danger";
    default:
      return null;
  }
}

function applyTone(statusCell, tone) {
  statusCell.classList.remove(...STATUS_CLASSES);

  if (tone) {
    statusCell.classList.add(`list-table__status--${tone}`);
  }
}

function applyCancelVisibility(row, isCanceled) {
  row.classList.toggle("list-table__row--canceled", isCanceled);
  const checkCell = row.querySelector(".list-table__check-cell");
  if (checkCell) {
    checkCell.classList.toggle("is-hidden", isCanceled);
  }
}

function getStatusOrderIndex(statusKey) {
  const index = STATUS_ORDER.indexOf(statusKey);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function resolveStatusKey(statusValue, STATUS) {
  const entry = Object.entries(STATUS).find(([, value]) => value === statusValue);
  return entry ? entry[0] : null;
}

function getReservationPickdropSummary(entries) {
  if (!Array.isArray(entries)) {
    return { hasPickup: false, hasDropoff: false };
  }
  return entries.reduce(
    (acc, entry) => ({
      hasPickup: acc.hasPickup || Boolean(entry?.pickup),
      hasDropoff: acc.hasDropoff || Boolean(entry?.dropoff),
    }),
    { hasPickup: false, hasDropoff: false }
  );
}

function extractPickdropData(rows) {
  const items = [];

  rows.forEach((row) => {
    const hasPickup = row.dataset.hasPickup === "true";
    const hasDropoff = row.dataset.hasDropoff === "true";
    const pickupChecked = row.dataset.pickupChecked !== "false";
    const dropoffChecked = row.dataset.dropoffChecked !== "false";

    if (!hasPickup && !hasDropoff) {
      return;
    }

    const cells = row.querySelectorAll('[role="cell"]');
    const dogName = cells[4]?.textContent.trim() || "";
    const ownerName = row.dataset.owner || "";
    const address = row.dataset.address || "주소 미정";

    if (hasPickup && pickupChecked) {
      items.push({
        type: PICKDROP_TYPES.PICKUP,
        dogName,
        ownerName,
        address,
      });
    }

    if (hasDropoff && dropoffChecked) {
      items.push({
        type: PICKDROP_TYPES.DROPOFF,
        dogName,
        ownerName,
        address,
      });
    }
  });

  return items;
}

function findReachableStatuses(storage) {
  const { STATUS } = storage;
  return STATUS_ORDER.filter((key) => Boolean(STATUS[key]));
}

function cycleRowStatus(row, storage) {
  const { STATUS } = storage;
  const baseStatusKey = row.dataset.baseStatus;
  if (!baseStatusKey || !STATUS[baseStatusKey]) {
    return;
  }

  const currentResolved = storage.resolveStatus(STATUS[baseStatusKey]);
  const currentResolvedKey = resolveStatusKey(currentResolved, STATUS);
  if (!currentResolvedKey) {
    return;
  }

  const reachable = findReachableStatuses(storage);
  if (!reachable.length) {
    return;
  }

  const currentIndex = reachable.indexOf(currentResolvedKey);
  const nextKey = reachable[(currentIndex + 1) % reachable.length];
  const nextBaseKey = TARGET_TO_BASE_STATUS[nextKey];

  if (nextBaseKey) {
    row.dataset.baseStatus = nextBaseKey;
  }
}

function groupByHousehold(items) {
  const grouped = new Map();

  items.forEach((item) => {
    const key = `${item.ownerName}|${item.address}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        ownerName: item.ownerName,
        address: item.address,
        dogs: [],
        types: new Set(),
      });
    }

    const household = grouped.get(key);
    if (!household.dogs.includes(item.dogName)) {
      household.dogs.push(item.dogName);
    }
    household.types.add(item.type);
  });

  return Array.from(grouped.values());
}

function formatDogs(dogs) {
  if (!dogs.length) {
    return "";
  }

  if (dogs.length === 1) {
    return dogs[0];
  }

  return `${dogs[0]} 외 ${dogs.length - 1}`;
}

function applyStatusToRows(rows, storage) {
  const { STATUS } = storage;
  const rowsWithData = [];

  rows.forEach((row) => {
    const baseStatusKey = row.dataset.baseStatus;
    const statusCell = row.querySelector(".list-table__status");

    if (!baseStatusKey || !statusCell) {
      return;
    }

    const baseStatus = STATUS[baseStatusKey];
    if (!baseStatus) {
      return;
    }

    const resolvedStatus = storage.resolveStatus(baseStatus);
    statusCell.textContent = resolvedStatus;
    const tone = getStatusTone(resolvedStatus, STATUS);
    applyTone(statusCell, tone);
    applyCancelVisibility(row, resolvedStatus === STATUS.CANCELED);

    const cells = row.querySelectorAll('[role="cell"]');
    const dogName = cells[4]?.textContent.trim() || "";
    const resolvedStatusKey = resolveStatusKey(resolvedStatus, STATUS);

    rowsWithData.push({
      row,
      resolvedStatusKey,
      dogName,
    });
  });

  const parent = rowsWithData[0]?.row.parentElement;
  if (!parent) {
    return;
  }

  rowsWithData
    .sort((a, b) => {
      const statusDiff =
        getStatusOrderIndex(a.resolvedStatusKey) -
        getStatusOrderIndex(b.resolvedStatusKey);

      if (statusDiff !== 0) {
        return statusDiff;
      }

      return a.dogName.localeCompare(b.dogName, "ko");
    })
    .forEach(({ row }) => parent.appendChild(row));
}

function getActivePaymentStatuses(state) {
  const paymentMap = state?.selectedPaymentStatuses;
  if (!paymentMap || typeof paymentMap !== "object") {
    return new Set(["paid", "unpaid"]);
  }
  const selected = Object.entries(paymentMap)
    .filter(([, checked]) => checked === true)
    .map(([status]) => status);
  return selected.length > 0 ? new Set(selected) : new Set(["paid", "unpaid"]);
}

function getActiveTags(state) {
  const tagMap = state?.selectedTags;
  if (!tagMap || typeof tagMap !== "object") {
    return [];
  }
  return sanitizeTagList(
    Object.keys(tagMap).filter((tag) => tagMap[tag] === true)
  );
}

function updateListCounts(list, visibleEntries, storage) {
  const countSpan = list.querySelector(".list-card__title .text-primary");
  if (countSpan) {
    const count = (Array.isArray(visibleEntries) ? visibleEntries : []).filter(
      (entry) => !isReservationEntryCanceled(entry, storage)
    ).length;
    countSpan.textContent = String(count);
  }
}

function updateSubtitle(list, state, dayoffSettings, timeZone) {
  const subtitle = list.querySelector(".list-card-date");
  if (subtitle) {
    const dateLabel = formatSubtitleDate(state.selectedDate);
    subtitle.innerHTML = "";
    subtitle.append(document.createTextNode(dateLabel));
    const dateKey = formatDateKey(state.selectedDate);
    if (dateKey && isDayoffDate(dateKey, dayoffSettings, timeZone)) {
      const offTag = document.createElement("span");
      offTag.className = "list-card-date__off";
      offTag.textContent = "휴무";
      subtitle.appendChild(offTag);
    }
  }
}

function isReservationEntryCanceled(entry, storage) {
  const statusKey = String(entry?.baseStatusKey || "").trim();
  const statusText = String(entry?.statusText || entry?.status || "").trim();
  return isCanceledStatus(statusKey, statusText, storage);
}

function getVisibleReservationEntries(entries, state, storage, members, options = {}) {
  const activeServices = new Set(getActiveServices(state));
  const activeTeachers = new Set(getActiveTeachers(state));
  const activePayments = getActivePaymentStatuses(state);
  const activeTags = getActiveTags(state);
  const targetDateKey = formatDateKey(state?.selectedDate);
  const includeCanceled = Object.prototype.hasOwnProperty.call(options, "includeCanceled")
    ? Boolean(options.includeCanceled)
    : false;
  const ignoreServiceFilter = Boolean(options?.ignoreServiceFilter);

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const dateKey = formatDateKey(entry?.date);
    const service = normalizeService(entry?.className, state);
    const teacher = normalizeTeacher(service, state);
    const paymentStatus = getReservationPaymentStatus(entry?.reservation);
    const member = getMemberByReservation(entry?.reservation, members);
    const memberTags = sanitizeTagList([
      ...(Array.isArray(member?.ownerTags) ? member.ownerTags : []),
      ...(Array.isArray(member?.petTags) ? member.petTags : []),
    ]);
    const tagMatched = activeTags.length === 0
      ? true
      : activeTags.some((tag) => hasTagValue(memberTags, tag));

    if (dateKey !== targetDateKey) {
      return false;
    }
    if (!ignoreServiceFilter && !activeServices.has(service)) {
      return false;
    }
    if (!activeTeachers.has(teacher) || !activePayments.has(paymentStatus) || !tagMatched) {
      return false;
    }
    if (!includeCanceled && isReservationEntryCanceled(entry, storage)) {
      return false;
    }
    return true;
  });
}

function getScheduleClassFilterSet(state, classNames) {
  if (!state.selectedScheduleClassFilters) {
    state.selectedScheduleClassFilters = new Set(classNames);
  }
  if (!(state.selectedScheduleClassFilters instanceof Set)) {
    state.selectedScheduleClassFilters = new Set(
      Array.isArray(state.selectedScheduleClassFilters)
        ? state.selectedScheduleClassFilters
        : [state.selectedScheduleClassFilters]
    );
  }
  const validNames = new Set(classNames);
  state.selectedScheduleClassFilters = new Set(
    Array.from(state.selectedScheduleClassFilters).filter((name) => validNames.has(name))
  );
  if (state.selectedScheduleClassFilters.size === 0 && classNames.length > 0) {
    state.selectedScheduleClassFilters = new Set(classNames);
  }
  return state.selectedScheduleClassFilters;
}

function getScheduleClassNames(classes, state) {
  const names = (Array.isArray(classes) ? classes : [])
    .map((item) => String(item?.name || "").trim())
    .filter((name) => name.length > 0);
  if (names.length > 0) {
    return names;
  }
  return (Array.isArray(state?.serviceOptions) ? state.serviceOptions : [])
    .map((name) => String(name || "").trim())
    .filter((name) => name.length > 0);
}

function renderScheduleClassCountFilters(container, entries, classes, state) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const classNames = getScheduleClassNames(classes, state);
  const selected = getScheduleClassFilterSet(state, classNames);
  const allSelected = classNames.length === 0 || selected.size === classNames.length;
  const countByClass = new Map(classNames.map((name) => [name, 0]));
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const className = normalizeService(entry?.className, state);
    if (!countByClass.has(className)) {
      countByClass.set(className, 0);
    }
    countByClass.set(className, (countByClass.get(className) || 0) + 1);
  });
  renderListCountFilterBar(container, {
    allValue: SCHEDULE_CLASS_FILTER_ALL,
    allLabel: "전체",
    totalCount: Array.isArray(entries) ? entries.length : 0,
    allSelected,
    items: classNames.map((name) => ({
      value: name,
      label: name,
      count: countByClass.get(name) || 0,
      selected: allSelected || selected.has(name),
    })),
  });
}

function applyScheduleClassFilter(entries, state, classNames) {
  const selected = getScheduleClassFilterSet(state, classNames);
  if (classNames.length === 0 || selected.size === classNames.length) {
    return entries;
  }
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => selected.has(normalizeService(entry?.className, state))
  );
}

function renderReservations(list, storage, state, dayoffSettings, timeZone) {
  const body = list.querySelector("[data-reservation-rows]");
  if (!body) {
    return;
  }

  body.innerHTML = "";

  state.reservations = filterSchoolReservations(state.reservations);
  const classes = initClassStorage().ensureDefaults();
  const classMap = new Map(
    classes.map((item) => [String(item?.name || ""), item])
  );
  const members = loadIssueMembers();
  const visibleReservations = getVisibleReservationEntries(
    getReservationEntries(state.reservations),
    state,
    storage,
    members
  );
  const scheduleClassNames = getScheduleClassNames(classes, state);
  renderScheduleClassCountFilters(
    document.querySelector("[data-school-class-count-filters]"),
    visibleReservations,
    classes,
    state
  );
  const reservations = applyScheduleClassFilter(visibleReservations, state, scheduleClassNames);
  const useMobileFeedLayout = list.dataset.reservationLayout === "mobile-feed";

  reservations.forEach((entry) => {
    const { reservation } = entry;
    const member = getMemberByReservation(reservation, members);
    const pickupChecked = entry.pickup === true;
    const dropoffChecked = entry.dropoff === true;
    const hasPickup = pickupChecked;
    const hasDropoff = dropoffChecked;

    const row = document.createElement("div");
    row.className = useMobileFeedLayout
      ? "list-table__row list-table__row--feed"
      : "list-table__row";
    row.setAttribute("role", "row");
    row.dataset.reservationRow = "";
    row.dataset.reservationId = reservation.id || "";
    row.dataset.reservationDate = formatDateKey(entry.date);
    row.dataset.baseStatus = entry.baseStatusKey || "PLANNED";
    row.dataset.hasPickup = hasPickup ? "true" : "false";
    row.dataset.hasDropoff = hasDropoff ? "true" : "false";
    row.dataset.pickupChecked = pickupChecked ? "true" : "false";
    row.dataset.dropoffChecked = dropoffChecked ? "true" : "false";
    row.dataset.address = reservation.address || "";
    row.dataset.owner = member?.owner || reservation.owner || "";
    row.dataset.memberTags = sanitizeTagList([
      ...(Array.isArray(member?.ownerTags) ? member.ownerTags : []),
      ...(Array.isArray(member?.petTags) ? member.petTags : []),
    ]).join("|");
    const service = normalizeService(entry.className, state);
    const teacher = normalizeTeacher(service, state);
    const hasService = typeof entry.className === "string" && entry.className.trim().length > 0;
    const displayService = hasService ? service : "-";
    const reservationType = String(reservation?.type || "school");
    const classInfo = classMap.get(String(entry.className || reservation?.class || reservation?.service || ""));
    const schoolStart = String(classInfo?.startTime || "").trim();
    const schoolEnd = String(classInfo?.endTime || "").trim();
    const daycareStart = String(entry.checkinTime || "").trim();
    const daycareEnd = String(entry.checkoutTime || "").trim();
    const plannedTimeText = reservationType === "daycare"
      ? ((daycareStart && daycareEnd) ? `${daycareStart} ~ ${daycareEnd}` : "")
      : ((schoolStart && schoolEnd) ? `${schoolStart} ~ ${schoolEnd}` : "");
    const breedText = member?.breed || reservation?.breed || "-";
    row.dataset.service = service;
    row.dataset.teacher = teacher;
    row.dataset.paymentStatus = getReservationPaymentStatus(reservation);
    row.dataset.checkinTime = entry.checkinTime || "";
    row.dataset.checkoutTime = entry.checkoutTime || "";
    row.dataset.date = formatDateKey(entry.date);

    row.innerHTML = useMobileFeedLayout
      ? `
        <span role="cell" class="list-table__check-cell reservation-feed__select"><input type="checkbox" aria-label="예약 선택" data-reservation-select></span>
        <button role="cell" class="reservation-feed__item" type="button" data-reservation-detail-open aria-label="${member?.dogName || reservation.dogName || "예약"} 예약 상세 열기">
          <span class="reservation-feed__text">
            <span class="reservation-feed__name">${member?.dogName || reservation.dogName || "-"}</span>
            <span class="reservation-feed__breed">${breedText}</span>
          </span>
          <img src="../assets/iconChevronRight.svg" alt="" aria-hidden="true">
        </button>
      `
      : `
        <span role="cell" class="list-table__check-cell"><input type="checkbox" aria-label="예약 선택" data-reservation-select></span>
        <span role="cell" class="list-table__service-cell">
          <span>${displayService}</span>
        </span>
        <span role="cell">
        <span class="list-table__tags">
          ${
            hasPickup
              ? `<span class="list-table__tag list-table__tag--pickup${pickupChecked ? "" : " list-table__tag--inactive"}">픽업</span>`
              : ""
          }
          ${
            hasDropoff
              ? `<span class="list-table__tag list-table__tag--dropoff${dropoffChecked ? "" : " list-table__tag--inactive"}">드랍</span>`
              : ""
          }
          ${
            !hasPickup && !hasDropoff
              ? `<span class="list-table__tag list-table__tag--empty">-</span>`
              : ""
          }
        </span>
        </span>
        <span role="cell" class="list-table__status">${storage?.STATUS?.[entry.baseStatusKey || "PLANNED"] || entry.statusText || ""}</span>
        <span role="cell">${member?.dogName || reservation.dogName || "-"}</span>
        <span role="cell">${plannedTimeText || "-"}</span>
        <span role="cell" class="list-table__memo" data-reservation-memo>${reservation.memo ? reservation.memo : "-"}</span>
        <span role="cell" class="list-table__more-cell">
          <button class="icon-button reservation-more-button" type="button" data-reservation-detail-open aria-label="예약 상세 열기">
            <img src="../assets/iconChevronRight.svg" alt="" aria-hidden="true">
          </button>
        </span>
      `;

    body.appendChild(row);
  });

  const rows = body.querySelectorAll("[data-reservation-row]");
  applyStatusToRows(rows, storage);
  updateListCounts(list, reservations, storage);
  updateSubtitle(list, state, dayoffSettings, timeZone);
}

function formatDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return formatDateKey(date);
}

function parseDateInputValue(value) {
  if (!value) {
    return null;
  }
  const parts = value.split("-");
  if (parts.length !== 3) {
    return null;
  }
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10) - 1;
  const day = Number.parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  return new Date(year, month, day);
}

function setupPickdropModal(list, state, getRows) {
  const openButton = list.querySelector("[data-pickdrop-open]");
  const modal = document.querySelector("[data-pickdrop-modal]");

  if (!openButton || !modal) {
    return;
  }

  const overlay = modal.querySelector("[data-pickdrop-overlay]");
  const closeButton = modal.querySelector("[data-pickdrop-close]");
  const filters = modal.querySelectorAll("[data-pickdrop-filter]");
  const listContainer = modal.querySelector("[data-pickdrop-list]");
  const datePicker = modal.querySelector("[data-pickdrop-date-picker]");
  const prevButton = modal.querySelector("[data-pickdrop-prev]");
  const nextButton = modal.querySelector("[data-pickdrop-next]");
  const activeFilters = new Set([PICKDROP_TYPES.PICKUP, PICKDROP_TYPES.DROPOFF]);

  const getActiveDateKey = () => {
    if (!(datePicker instanceof HTMLInputElement)) {
      return "";
    }
    const parsed = parseDateInputValue(datePicker.value);
    return parsed ? formatDateKey(parsed) : "";
  };

  const setDate = (value) => {
    if (datePicker) {
      datePicker.value = value;
    }
  };

  const shiftDate = (offset) => {
    const currentValue = datePicker instanceof HTMLInputElement
      ? datePicker.value
      : "";
    const baseDate = currentValue ? parseDateInputValue(currentValue) : new Date();
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
      return;
    }
    baseDate.setDate(baseDate.getDate() + offset);
    setDate(formatDateInputValue(baseDate));
  };

  const initializeDate = () => {
    const initial =
      (state && formatDateInputValue(state.selectedDate)) ||
      (state && formatDateInputValue(state.currentDate)) ||
      formatDateInputValue(new Date());
    setDate(initial);
  };

  const renderList = () => {
    const activeServices = new Set(getActiveServices(state));
    const activeTeachers = new Set(getActiveTeachers(state));
    const targetDateKey = getActiveDateKey();
    const reservations = getReservationEntries(state.reservations);
    const members = loadIssueMembers();
    const items = reservations
      .filter((entry) => formatDateKey(entry.date) === targetDateKey)
      .filter((entry) => {
        const service = normalizeService(entry.className, state);
        const teacher = normalizeTeacher(service, state);
        return activeServices.has(service) && activeTeachers.has(teacher);
      })
      .flatMap((entry) => {
        const reservation = entry.reservation;
        const member = getMemberByReservation(reservation, members);
        const pickupChecked = entry.pickup === true;
        const dropoffChecked = entry.dropoff === true;
        const ownerName = member?.owner || reservation.owner || "";
        const address = reservation.address || "주소 미정";
        const dogName = member?.dogName || reservation.dogName || "";
        const nextItems = [];
        if (pickupChecked) {
          nextItems.push({
            type: PICKDROP_TYPES.PICKUP,
            dogName,
            ownerName,
            address,
          });
        }
        if (dropoffChecked) {
          nextItems.push({
            type: PICKDROP_TYPES.DROPOFF,
            dogName,
            ownerName,
            address,
          });
        }
        return nextItems;
      })
      .filter((item) => activeFilters.has(item.type));
    const households = groupByHousehold(items).filter((household) =>
      Array.from(activeFilters).every((type) => household.types.has(type))
    );

    if (!households.length) {
      listContainer.innerHTML =
        '<div class="pickdrop-empty">조건에 맞는 회원이 없습니다.</div>';
      return;
    }

    listContainer.innerHTML = households
      .map(
        (household) => `
        <div class="pickdrop-card">
          <div class="pickdrop-card__owner">
            <span>${household.ownerName}</span>
            <span class="pickdrop-card__dogs">${formatDogs(household.dogs)}</span>
          </div>
          <div class="pickdrop-card__address">${household.address}</div>
        </div>
      `
      )
      .join("");
  };

  filters.forEach((filter) => {
    syncFilterChip(filter);
  });

  const openModal = () => {
    setDate(
      (state && formatDateInputValue(state.selectedDate)) ||
      (state && formatDateInputValue(state.currentDate)) ||
      formatDateInputValue(new Date())
    );
    openLayer(modal);
    renderList();
  };

  const closeModal = () => closeLayer(modal);

  openButton.addEventListener("click", openModal);
  bindLayerClose(overlay, closeButton ? [closeButton] : [], closeModal);
  prevButton?.addEventListener("click", () => {
    shiftDate(-1);
    renderList();
  });
  nextButton?.addEventListener("click", () => {
    shiftDate(1);
    renderList();
  });

  datePicker?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    setDate(target.value);
    renderList();
  });

  filters.forEach((filter) => {
    filter.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const { value, checked } = target;
      if (checked) {
        activeFilters.add(value);
      } else {
        activeFilters.delete(value);
      }

      if (activeFilters.size === 0) {
        filters.forEach((input) => {
          if (input instanceof HTMLInputElement) {
            activeFilters.add(input.value);
            input.checked = true;
            syncFilterChip(input);
          }
        });
      }

      syncFilterChip(target);
      renderList();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  initializeDate();
}

function getStatusLabelFromKey(statusKey, STATUS) {
  return STATUS[statusKey] || statusKey;
}

function getMemberIdFromReservation(reservation) {
  return String(reservation?.memberId || "").trim();
}

function getMemberByReservation(reservation, members = null) {
  const memberId = getMemberIdFromReservation(reservation);
  if (!memberId) {
    return null;
  }
  const targetMembers = Array.isArray(members) ? members : loadIssueMembers();
  return targetMembers.find((member) => String(member?.id || "") === memberId) || null;
}

function getMemberById(memberId, members = null) {
  const resolvedId = String(memberId || "").trim();
  if (!resolvedId) {
    return null;
  }
  const targetMembers = Array.isArray(members) ? members : loadIssueMembers();
  return targetMembers.find((member) => String(member?.id || "") === resolvedId) || null;
}

function getClassInfoByName(classStorage, className) {
  const classes = classStorage.ensureDefaults();
  const classInfo = classes.find((item) => item.name === className) || null;
  return {
    classes,
    classInfo,
  };
}

function buildClassIdByNameMap(classes = []) {
  return new Map(
    classes.map((classItem) => [
      String(classItem?.name || ""),
      String(classItem?.id || ""),
    ])
  );
}

function resolveReservationServiceTypes(reservation, entry, classStorage) {
  const types = [];
  const className =
    entry?.className
    || entry?.class
    || reservation?.class
    || reservation?.service
    || "";
  if (className) {
    const classes = classStorage.ensureDefaults();
    const match = classes.find((item) => item.name === className);
    types.push(match?.type || "school");
  }
  const hasPickdrop = Boolean(
    entry?.pickup
    || entry?.dropoff
    || reservation?.hasPickup
    || reservation?.hasDropoff
  );
  if (hasPickdrop) {
    const countType = getPickdropCountType({
      pickup: Boolean(entry?.pickup || reservation?.hasPickup),
      dropoff: Boolean(entry?.dropoff || reservation?.hasDropoff),
    });
    if (countType) {
      types.push(countType);
    }
  }
  return types.length > 0 ? types : ["school"];
}

function applyMemberStatusDelta(
  reservation,
  beforeStatusKey,
  afterStatusKey,
  count = 1,
  serviceType = "school"
) {
  const memberId = getMemberIdFromReservation(reservation);
  if (!memberId) {
    return;
  }
  applyReservationStatusChange(memberId, beforeStatusKey, afterStatusKey, count, serviceType);
}

function applyMemberStatusDeltas(reservation, beforeStatusKey, afterStatusKey, count, serviceTypes) {
  const types = Array.isArray(serviceTypes) && serviceTypes.length > 0
    ? serviceTypes
    : ["school"];
  types.forEach((type) => {
    applyMemberStatusDelta(reservation, beforeStatusKey, afterStatusKey, count, type);
  });
}

function clearTicketPaymentIfCanceledReservation(reservation) {
  if (!shouldClearTicketPaymentOnCancellation(reservation)) {
    return reservation;
  }
  return {
    ...reservation,
    payment: null,
  };
}

function createReservationFeeLine(labelText, calcContent) {
  const line = document.createElement("div");
  line.className = "reservation-fee-line";
  const calc = document.createElement("span");
  calc.className = "reservation-fee-line__calc";
  if (labelText) {
    const label = document.createElement("span");
    label.className = "reservation-fee-line__label";
    label.textContent = labelText;
    line.appendChild(label);
  }
  if (calcContent instanceof Node) {
    calc.appendChild(calcContent);
  } else {
    calc.textContent = String(calcContent ?? "");
  }
  line.appendChild(calc);
  return line;
}

function buildAllocationItems(allocation = {}) {
  const items = [];
  const school = Number(allocation?.school) || 0;
  const daycare = Number(allocation?.daycare) || 0;
  const hoteling = Number(allocation?.hoteling) || 0;
  const oneway = Number(allocation?.oneway) || 0;
  const roundtrip = Number(allocation?.roundtrip) || 0;
  if (school > 0) {
    items.push(`유치원 ${formatTicketPrice(school)}`);
  }
  if (daycare > 0) {
    items.push(`데이케어 ${formatTicketPrice(daycare)}`);
  }
  if (hoteling > 0) {
    items.push(`호텔링 ${formatTicketPrice(hoteling)}`);
  }
  if (oneway > 0) {
    items.push(`픽드랍(편도) ${formatTicketPrice(oneway)}`);
  }
  if (roundtrip > 0) {
    items.push(`픽드랍(왕복) ${formatTicketPrice(roundtrip)}`);
  }
  return items;
}

function createReservationFeeItems(items = []) {
  const fragment = document.createDocumentFragment();
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("span");
    empty.className = "reservation-fee-line__item reservation-fee-line__item--empty";
    empty.textContent = "0원";
    fragment.appendChild(empty);
    return fragment;
  }
  items.forEach((item) => {
    const node = document.createElement("span");
    node.className = "reservation-fee-line__item";
    node.textContent = item;
    fragment.appendChild(node);
  });
  return fragment;
}

function renderReservationDetailFeeLines(container, reservation) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const dateKeys = Array.from(
    new Set(
      (Array.isArray(reservation?.dates) ? reservation.dates : [])
        .map((entry) => String(entry?.date || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  if (dateKeys.length === 0) {
    container.appendChild(createReservationFeeLine("요금 정보", "-"));
    return;
  }
  const allocations =
    reservation?.billing && typeof reservation.billing.allocationsByDate === "object"
      ? reservation.billing.allocationsByDate
      : {};
  const mergedAllocation = dateKeys.reduce(
    (acc, dateKey) => {
      const allocation = allocations?.[dateKey] || {};
      acc.school += Number(allocation?.school) || 0;
      acc.daycare += Number(allocation?.daycare) || 0;
      acc.hoteling += Number(allocation?.hoteling) || 0;
      acc.oneway += Number(allocation?.oneway) || 0;
      acc.roundtrip += Number(allocation?.roundtrip) || 0;
      return acc;
    },
    { school: 0, daycare: 0, hoteling: 0, oneway: 0, roundtrip: 0 }
  );
  container.appendChild(
    createReservationFeeLine(
      "",
      createReservationFeeItems(buildAllocationItems(mergedAllocation))
    )
  );
}

function applySelectedStatus(row, selectedKey) {
  const nextState = {
    baseStatus: TARGET_TO_BASE_STATUS[selectedKey] || "PLANNED",
  };

  row.dataset.baseStatus = nextState.baseStatus;

  return nextState;
}

function shouldClearTimesForStatus(statusKey) {
  return STATUSES_WITHOUT_TIMES.has(String(statusKey || "").trim().toUpperCase());
}

function resolveStatusTimeValues(statusKey, timeZone, current = {}) {
  if (shouldClearTimesForStatus(statusKey) || statusKey === "CANCELED") {
    return {
      checkinTime: "",
      checkoutTime: "",
    };
  }

  const nextTimes = {
    checkinTime: current.checkinTime || "",
    checkoutTime: current.checkoutTime || "",
  };

  if (statusKey === "CHECKIN" && !nextTimes.checkinTime) {
    nextTimes.checkinTime = getCurrentTimeString(timeZone);
  }
  if (statusKey === "CHECKOUT" && !nextTimes.checkoutTime) {
    nextTimes.checkoutTime = getCurrentTimeString(timeZone);
  }

  return nextTimes;
}

function applyRowStatusTimeDatasets(row, statusKey, timeZone) {
  const nextTimes = resolveStatusTimeValues(statusKey, timeZone, {
    checkinTime: row?.dataset?.checkinTime || "",
    checkoutTime: row?.dataset?.checkoutTime || "",
  });
  if (nextTimes.checkinTime) {
    row.dataset.checkinTime = nextTimes.checkinTime;
  } else {
    delete row.dataset.checkinTime;
  }
  if (nextTimes.checkoutTime) {
    row.dataset.checkoutTime = nextTimes.checkoutTime;
  } else {
    delete row.dataset.checkoutTime;
  }
}

function addEntryUsageRollback(usageByMember, reservation, dateEntry) {
  const memberId = getMemberIdFromReservation(reservation);
  if (!memberId) {
    return;
  }
  const memberUsage = usageByMember.get(memberId) || new Map();
  addTicketUsagesCount(memberUsage, getEntryTicketUsages(dateEntry), 1);
  usageByMember.set(memberId, memberUsage);
}

function rollbackEntryTicketUsage(reservation, dateEntry) {
  const memberId = getMemberIdFromReservation(reservation);
  if (!memberId) {
    return;
  }
  const usageMap = new Map();
  addTicketUsagesCount(usageMap, getEntryTicketUsages(dateEntry), 1);
  rollbackReservationMemberTickets(memberId, usageMap);
}

function syncReservationRow(row, state, storage) {
  if (!state) {
    return;
  }
  const id = row.dataset.reservationId;
  if (!id) {
    return;
  }
  const dateKey = row.dataset.reservationDate;
  if (!dateKey) {
    return;
  }

  const baseStatusKey = row.dataset.baseStatus || "PLANNED";
  const shouldClearTimes = shouldClearTimesForStatus(baseStatusKey);
  const checkinTime = shouldClearTimes ? "" : (row.dataset.checkinTime || "");
  const checkoutTime = shouldClearTimes ? "" : (row.dataset.checkoutTime || "");

  const updateReservationItem = (item) => {
    const updated = updateReservationDateEntry(
      item,
      dateKey,
      (entry) => ({
        baseStatusKey,
        checkinTime,
        checkoutTime,
      })
    );
    const pickdropSummary = getReservationPickdropSummary(updated.dates);
    return {
      ...updated,
      hasPickup: pickdropSummary.hasPickup,
      hasDropoff: pickdropSummary.hasDropoff,
      pickupChecked: pickdropSummary.hasPickup,
      dropoffChecked: pickdropSummary.hasDropoff,
    };
  };

  updateSchoolReservation(state, storage, id, updateReservationItem);
}

function setupStatusMenu(list, storage, state, onUpdate) {
  const menu = document.createElement("div");
  menu.className = "status-menu";
  menu.dataset.statusMenu = "true";
  document.body.appendChild(menu);

  let activeRow = null;
  const timeZone = getTimeZone();
  const classStorage = initClassStorage();

  const closeMenu = () => {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    activeRow = null;
  };

  const renderMenu = () => {
    const { STATUS } = storage;

    menu.innerHTML = STATUS_MENU_ORDER
      .map(
        (key) => `
        <button class="status-menu__option" type="button" data-status-option="${key}">
          ${getStatusLabelFromKey(key, STATUS)}
        </button>
      `
      )
      .join("");
  };

  const positionMenu = (trigger) => {
    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
  };

  const openMenu = (row, trigger) => {
    activeRow = row;
    renderMenu();
    positionMenu(trigger);
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
  };

  menu.addEventListener("click", (event) => {
    const option = event.target instanceof HTMLElement
      ? event.target.closest("[data-status-option]")
      : null;
    if (!option || !activeRow) {
      return;
    }

    const nextKey = option.dataset.statusOption;
    const previousKey = activeRow.dataset.baseStatus || "PLANNED";
    const reservationId = activeRow.dataset.reservationId || "";
    const reservationDate = activeRow.dataset.reservationDate || "";
    const reservation = findSchoolReservation(storage, state, reservationId);
    const dateEntry = findReservationEntryByDate(reservation, reservationDate);
    const beforeStatusKey =
      dateEntry?.baseStatusKey
      || resolveStatusKey(dateEntry?.statusText || "", storage?.STATUS || {})
      || previousKey;
    if (nextKey && beforeStatusKey && nextKey !== beforeStatusKey) {
      const serviceTypes = resolveReservationServiceTypes(
        reservation,
        dateEntry,
        classStorage
      );
      applyMemberStatusDeltas(reservation, beforeStatusKey, nextKey, 1, serviceTypes);
      if (nextKey === "CANCELED" && beforeStatusKey !== "CANCELED") {
        rollbackEntryTicketUsage(reservation, dateEntry);
      }
    }
    applySelectedStatus(activeRow, nextKey);
    applyRowStatusTimeDatasets(activeRow, nextKey, timeZone);
    syncReservationRow(activeRow, state, storage);

    applyStatusToRows(list.querySelectorAll("[data-reservation-row]"), storage);
    if (typeof onUpdate === "function") {
      onUpdate();
    }
    notifyReservationUpdated();
    closeMenu();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    const isStatusCell =
      target instanceof HTMLElement &&
      target.closest(".list-table__status");
    const clickedMenu =
      target instanceof HTMLElement &&
      target.closest("[data-status-menu]");

    if (clickedMenu || isStatusCell) {
      return;
    }

    if (menu.classList.contains("is-open")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      closeMenu();
    }
  });

  return {
    openMenu,
    closeMenu,
  };
}

export function setupList(state, storage) {
  const list = document.querySelector("[data-reservation-list]");

  if (!list) {
    return;
  }

  markReady(list, "reservation-list");

  const operationsStorage = initOperationsStorage();
  const timeZone = getTimeZone();
  const classFilters = document.querySelectorAll("[data-class-filter]");
  const teacherFilters = document.querySelectorAll("[data-teacher-filter]");
  const paymentFilters = document.querySelectorAll("[data-payment-filter]");
  const tagFilters = document.querySelectorAll("[data-tag-filter]");
  const getRows = () => list.querySelectorAll("[data-reservation-row]");
  const selectAll = list.querySelector("[data-reservation-select-all]");
  const scheduleClassFilterBar = document.querySelector("[data-school-class-count-filters]");

  const updateSelectAllState = () => {
    if (!(selectAll instanceof HTMLInputElement)) {
      return;
    }

    const selectable = Array.from(getRows()).filter((row) => {
      const checkbox = row.querySelector("[data-reservation-select]");
      return checkbox instanceof HTMLInputElement && !row.hidden && !checkbox.disabled;
    });

    if (selectable.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }

    const selectedCount = selectable.filter((row) => {
      const checkbox = row.querySelector("[data-reservation-select]");
      return checkbox instanceof HTMLInputElement && checkbox.checked;
    }).length;

    selectAll.checked = selectedCount === selectable.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
  };

  const refresh = () => {
    const dayoffSettings = operationsStorage.loadSettings();
    if (storage && typeof storage.loadReservations === "function") {
      state.reservations = loadSchoolReservationsFromStorage(storage);
    } else {
      state.reservations = filterSchoolReservations(state.reservations);
    }
    renderReservations(list, storage, state, dayoffSettings, timeZone);
    updateSubtitle(list, state, dayoffSettings, timeZone);
    updateSelectAllState();
  };

  const handleClassFilterChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const { value, checked } = target;
    state.selectedServices[value] = checked;

    const hasActive = Object.values(state.selectedServices || {}).some(Boolean);
    if (!hasActive) {
      // prevent zero selection
      state.selectedServices[value] = true;
      target.checked = true;
    }

    syncFilterChip(target);
    document.dispatchEvent(new CustomEvent("service-filter:change"));
    refresh();
  };

  const handleTeacherFilterChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const { value, checked } = target;
    state.selectedTeachers[value] = checked;

    const hasActive = Object.values(state.selectedTeachers || {}).some(Boolean);
    if (!hasActive) {
      state.selectedTeachers[value] = true;
      target.checked = true;
    }

    syncFilterChip(target);
    document.dispatchEvent(new CustomEvent("teacher-filter:change"));
    refresh();
  };


  const handlePaymentFilterChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const { value, checked } = target;
    state.selectedPaymentStatuses = state.selectedPaymentStatuses || {};
    state.selectedPaymentStatuses[value] = checked;

    const hasActive = Object.values(state.selectedPaymentStatuses || {}).some(Boolean);
    if (!hasActive) {
      state.selectedPaymentStatuses[value] = true;
      target.checked = true;
    }

    syncFilterChip(target);
    document.dispatchEvent(new CustomEvent("payment-filter:change"));
    refresh();
  };
  const handleTagFilterChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    state.selectedTags = state.selectedTags || {};
    state.selectedTags[target.value] = target.checked;
    syncFilterChip(target);
    document.dispatchEvent(new CustomEvent("tag-filter:change"));
    refresh();
  };
  classFilters.forEach((filter) => {
    filter.addEventListener("change", handleClassFilterChange);
  });

  teacherFilters.forEach((filter) => {
    filter.addEventListener("change", handleTeacherFilterChange);
  });

  paymentFilters.forEach((filter) => {
    filter.addEventListener("change", handlePaymentFilterChange);
  });
  tagFilters.forEach((filter) => {
    filter.addEventListener("change", handleTagFilterChange);
  });
  bindListCountFilterBar(scheduleClassFilterBar, (value) => {
    const classNames = getScheduleClassNames(initClassStorage().ensureDefaults(), state);
    const selected = getScheduleClassFilterSet(state, classNames);
    if (value === SCHEDULE_CLASS_FILTER_ALL) {
      state.selectedScheduleClassFilters = new Set(classNames);
    } else if (selected.has(value)) {
      selected.delete(value);
      state.selectedScheduleClassFilters = selected.size > 0 ? selected : new Set([value]);
    } else {
      selected.add(value);
      state.selectedScheduleClassFilters = selected;
    }
    refresh();
  });
  document.addEventListener("service-filter:change", refresh);
  document.addEventListener("teacher-filter:change", refresh);
  document.addEventListener("payment-filter:change", refresh);
  document.addEventListener("tag-filter:change", refresh);

  list.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.matches("[data-reservation-select-all]")) {
      const shouldCheck = target.checked;
      getRows().forEach((row) => {
        const checkbox = row.querySelector("[data-reservation-select]");
        if (checkbox instanceof HTMLInputElement && !row.hidden) {
          checkbox.checked = shouldCheck;
        }
      });
      updateSelectAllState();
      return;
    }

    if (target.matches("[data-reservation-select]")) {
      updateSelectAllState();
    }
  });

  setupPickdropModal(list, state, getRows);
  const statusMenu = setupStatusMenu(list, storage, state, refresh);
  refresh();

  document.addEventListener("calendar:date-change", (event) => {
    const { detail } = event;
    if (!detail?.date) {
      return;
    }
    state.selectedDate = new Date(detail.date);
    refresh();
  });

  document.addEventListener("reservation:updated", () => {
    refresh();
  });

  list.addEventListener("click", (event) => {
    const target = event.target;
    const detailButton = target instanceof HTMLElement
      ? target.closest("[data-reservation-detail-open]")
      : null;
    if (detailButton) {
      const row = detailButton.closest("[data-reservation-row]");
      const reservationId = row?.dataset?.reservationId || "";
      const reservationDate = row?.dataset?.reservationDate || "";
      if (reservationId) {
        const targetUrl = new URL("../src/pages/school-detail.html", window.location.href);
        targetUrl.searchParams.set("reservationId", reservationId);
        if (reservationDate) {
          targetUrl.searchParams.set("dateKey", reservationDate);
        }
        window.location.href = targetUrl.toString();
      }
      return;
    }

    const statusCell = target instanceof HTMLElement
      ? target.closest(".list-table__status")
      : null;
    if (!statusCell) {
      return;
    }

    const row = statusCell.closest("[data-reservation-row]");
    if (!row) {
      return;
    }

    statusMenu.openMenu(row, statusCell);
  });

  void state;
}
