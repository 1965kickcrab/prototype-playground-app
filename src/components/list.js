import { markReady, syncFilterChip } from "../utils/dom.js";
import {
  getActiveServices,
  getDefaultService,
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
import { initTicketStorage } from "../storage/ticket-storage.js";
import { getIssuedTicketOptions } from "../services/ticket-reservation-service.js";
import { renderSelectableChips, setSelectedChip } from "./selection-chips.js";
import {
  addTicketUsageCount,
  addTicketUsagesCount,
  getEntryTicketUsages,
  getPrimaryTicketUsage,
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

const SCHOOL_RESERVATION_TYPE = "school";

const filterSchoolReservations = (reservations) =>
  (Array.isArray(reservations) ? reservations : []).filter(
    (item) => item?.type === SCHOOL_RESERVATION_TYPE
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

function applyServiceFilter(rows, state) {
  const activeServices = new Set(getActiveServices(state));
  const activeTeachers = new Set(getActiveTeachers(state));
  const visibleRows = [];

  rows.forEach((row) => {
    const service = normalizeService(row.dataset.service, state);
    const teacher = normalizeTeacher(service, state);
    const isActive = activeServices.has(service) && activeTeachers.has(teacher);
    row.hidden = !isActive;

    if (isActive) {
      visibleRows.push(row);
    }
  });

  return visibleRows;
}

function isCanceledRow(row, storage) {
  const baseStatusKey = row?.dataset?.baseStatus;
  const statusText = row?.querySelector(".list-table__status")?.textContent?.trim() || "";
  return isCanceledStatus(baseStatusKey, statusText, storage);
}

function updateListCounts(list, visibleRows, storage) {
  const countSpan = list.querySelector(".list-card__title .text-primary");
  if (countSpan) {
    const activeCount = visibleRows.filter(
      (row) => !isCanceledRow(row, storage)
    ).length;
    countSpan.textContent = String(activeCount);
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

function renderReservations(list, storage, state, dayoffSettings, timeZone) {
  const body = list.querySelector("[data-reservation-rows]");
  if (!body) {
    return;
  }

  body.innerHTML = "";

  state.reservations = filterSchoolReservations(state.reservations);

  const activeServices = new Set(getActiveServices(state));
  const targetDateKey = formatDateKey(state.selectedDate);
  const reservations = getReservationEntries(state.reservations).filter((entry) => {
    const dateKey = formatDateKey(entry.date);
    const service = normalizeService(entry.className, state);
    return dateKey === targetDateKey && activeServices.has(service);
  });

  reservations.forEach((entry) => {
    const { reservation } = entry;
    const pickupChecked = entry.pickup === true;
    const dropoffChecked = entry.dropoff === true;
    const hasPickup = pickupChecked;
    const hasDropoff = dropoffChecked;

    const row = document.createElement("div");
    row.className = "list-table__row";
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
    row.dataset.owner = reservation.owner || "";
    const service = normalizeService(entry.className, state);
    const teacher = normalizeTeacher(service, state);
    const hasService = typeof entry.className === "string" && entry.className.trim().length > 0;
    const displayService = hasService ? service : "-";
    row.dataset.service = service;
    row.dataset.teacher = teacher;
    row.dataset.checkinTime = entry.checkinTime || "";
    row.dataset.checkoutTime = entry.checkoutTime || "";
    row.dataset.date = formatDateKey(entry.date);

    row.innerHTML = `
        <span role="cell" class="list-table__check-cell"><input type="checkbox" aria-label="예약 선택" data-reservation-select></span>
        <span role="cell">${displayService}</span>
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
        <span role="cell" class="list-table__status">${entry.statusText || ""}</span>
        <span role="cell">${reservation.dogName || ""}</span>
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
  const visibleRows = applyServiceFilter(rows, state);
  updateListCounts(list, visibleRows, storage);
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
    const items = reservations
      .filter((entry) => formatDateKey(entry.date) === targetDateKey)
      .filter((entry) => {
        const service = normalizeService(entry.className, state);
        const teacher = normalizeTeacher(service, state);
        return activeServices.has(service) && activeTeachers.has(teacher);
      })
      .flatMap((entry) => {
        const reservation = entry.reservation;
        const pickupChecked = entry.pickup === true;
        const dropoffChecked = entry.dropoff === true;
        const ownerName = reservation.owner || "";
        const address = reservation.address || "주소 미정";
        const dogName = reservation.dogName || "";
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
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    renderList();
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  openButton.addEventListener("click", openModal);
  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);
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

function renderTicketInfoBadge(container, options) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const { ticketName, count, overCount, totalCount } = options || {};
  const card = document.createElement("div");
  card.className = "reservation-detail__ticket-card";
  const nameCol = document.createElement("div");
  nameCol.className = "reservation-detail__ticket-col reservation-detail__ticket-col--name";
  const sequenceCol = document.createElement("div");
  sequenceCol.className = "reservation-detail__ticket-col reservation-detail__ticket-col--sequence";
  const totalCol = document.createElement("div");
  totalCol.className = "reservation-detail__ticket-col reservation-detail__ticket-col--total";

  nameCol.innerHTML = `
    <span class="reservation-detail__ticket-value" data-ticket-cell="name">-</span>
  `;
  sequenceCol.innerHTML = `
    <span class="reservation-detail__ticket-label">회차</span>
    <span class="reservation-detail__ticket-value" data-ticket-cell="sequence">-</span>
  `;
  totalCol.innerHTML = `
    <span class="reservation-detail__ticket-label">총횟수</span>
    <span class="reservation-detail__ticket-value" data-ticket-cell="total">-</span>
  `;

  card.appendChild(nameCol);
  card.appendChild(sequenceCol);
  card.appendChild(totalCol);
  if (overCount) {
    card.classList.add("reservation-detail__ticket-card--over");
    card.querySelector("[data-ticket-cell='sequence']").textContent = `${overCount}회차 초과`;
    container.appendChild(card);
    return;
  }
  if (!ticketName || !count) {
    card.classList.add("reservation-detail__ticket-card--empty");
    container.appendChild(card);
    return;
  }
  const totalText = Number.isFinite(Number(totalCount)) && Number(totalCount) > 0
    ? `${Number(totalCount)}`
    : "-";
  card.querySelector("[data-ticket-cell='name']").textContent = ticketName;
  card.querySelector("[data-ticket-cell='sequence']").textContent = `${count}`;
  card.querySelector("[data-ticket-cell='total']").textContent = totalText;
  container.appendChild(card);
}

function applySelectedStatus(row, selectedKey) {
  const nextState = {
    baseStatus: TARGET_TO_BASE_STATUS[selectedKey] || "PLANNED",
  };

  row.dataset.baseStatus = nextState.baseStatus;

  return nextState;
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
  const statusText =
    storage?.STATUS?.[baseStatusKey]
    || row.querySelector(".list-table__status")?.textContent?.trim()
    || "";
  const checkinTime = row.dataset.checkinTime || "";
  const checkoutTime = row.dataset.checkoutTime || "";

  const updateReservationItem = (item) => {
    const updated = updateReservationDateEntry(
      item,
      dateKey,
      (entry) => ({
        baseStatusKey,
        statusText,
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

  if (storage && typeof storage.updateReservation === "function") {
    const updatedReservations = storage.updateReservation(id, updateReservationItem);
    state.reservations = filterSchoolReservations(updatedReservations);
    return;
  }

  if (state && Array.isArray(state.reservations)) {
    const targetIndex = state.reservations.findIndex((item) => item.id === id);
    if (targetIndex !== -1) {
      state.reservations[targetIndex] = updateReservationItem(state.reservations[targetIndex]);
    }

    if (storage && typeof storage.saveReservations === "function") {
      storage.saveReservations(state.reservations);
    }
  }
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
    const reservations = resolveSchoolReservations(storage, state.reservations);
    const reservation = reservations.find((item) => item.id === reservationId);
    const dateEntry = reservationDate
      ? getReservationEntries([reservation]).find((entry) => entry.date === reservationDate)
      : null;
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
        const memberId = getMemberIdFromReservation(reservation);
        if (memberId) {
          const usageMap = new Map();
          addTicketUsagesCount(usageMap, getEntryTicketUsages(dateEntry), 1);
          rollbackReservationMemberTickets(memberId, usageMap);
        }
      }
    }
    applySelectedStatus(activeRow, nextKey);
    if (nextKey === "CHECKIN") {
      activeRow.dataset.checkinTime = getCurrentTimeString(timeZone);
    }
    if (nextKey === "CHECKOUT") {
      activeRow.dataset.checkoutTime = getCurrentTimeString(timeZone);
    }
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

function getSelectedReservationKeys(list) {
  const rows = Array.from(list.querySelectorAll("[data-reservation-row]"));
  return rows
    .map((row) => {
      const checkbox = row.querySelector(".list-table__check-cell input[type='checkbox']");
      if (!checkbox || !checkbox.checked) {
        return null;
      }
      const id = row.dataset.reservationId || "";
      const date = row.dataset.reservationDate || "";
      if (!id || !date) {
        return null;
      }
      return { id, date };
    })
    .filter(Boolean);
}

function setupCancelModal(list, state, storage, refresh) {
  const openButton = list.querySelector("[data-reservation-cancel-open]");
  const modal = document.querySelector("[data-reservation-cancel-modal]");

  if (!openButton || !modal) {
    return;
  }

  const classStorage = initClassStorage();
  const overlay = modal.querySelector("[data-reservation-cancel-overlay]");
  const closeButtons = modal.querySelectorAll("[data-reservation-cancel-close]");
  const confirmButton = modal.querySelector("[data-reservation-cancel-confirm]");

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  openButton.addEventListener("click", () => {
    openModal();
  });

  overlay?.addEventListener("click", closeModal);
  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  confirmButton?.addEventListener("click", () => {
    const keys = getSelectedReservationKeys(list);
    if (!keys.length) {
      closeModal();
      return;
    }

    const reservations = resolveSchoolReservations(storage, state.reservations);
    const usageByMember = new Map();
    const canceledStatusKey = "CANCELED";
    const canceledLabel =
      storage && storage.STATUS ? storage.STATUS[canceledStatusKey] : "예약 취소";
    const nextReservations = reservations.map((item) => {
      const matches = keys.filter((key) => key.id === item.id);
      if (matches.length === 0) {
        return item;
      }
      const entries = getReservationEntries([item]);
      let nextItem = item;
      matches.forEach((match) => {
        const entry = entries.find((value) => value.date === match.date);
        const beforeStatusKey =
          entry?.baseStatusKey
          || resolveStatusKey(entry?.statusText || "", storage?.STATUS || {})
          || "PLANNED";
        if (beforeStatusKey !== canceledStatusKey) {
          const serviceTypes = resolveReservationServiceTypes(
            item,
            entry,
            classStorage
          );
          applyMemberStatusDeltas(item, beforeStatusKey, canceledStatusKey, 1, serviceTypes);
          const memberId = getMemberIdFromReservation(item);
          if (memberId) {
            const memberUsage = usageByMember.get(memberId) || new Map();
            addTicketUsagesCount(memberUsage, getEntryTicketUsages(entry), 1);
            usageByMember.set(memberId, memberUsage);
          }
        }
        nextItem = updateReservationDateEntry(nextItem, match.date, (entry) => ({
          baseStatusKey: canceledStatusKey,
          statusText: canceledLabel,
        }));
      });
      return nextItem;
    });

    if (storage && typeof storage.saveReservations === "function") {
      storage.saveReservations(nextReservations);
    }

    state.reservations = filterSchoolReservations(nextReservations);
    usageByMember.forEach((usageMap, memberId) => {
      rollbackReservationMemberTickets(memberId, usageMap);
    });
    closeModal();
    refresh();
    notifyReservationUpdated();
  });
}

function setupDetailModal(list, state, storage, refresh) {
  const modal = document.querySelector("[data-reservation-detail-modal]");
  if (!modal) {
    return null;
  }

  const classStorage = initClassStorage();
  const operationsStorage = initOperationsStorage();
  const ticketStorage = initTicketStorage();
  const overlay = modal.querySelector("[data-reservation-detail-overlay]");
  const closeButtons = modal.querySelectorAll("[data-reservation-detail-close]");
  const saveButton = modal.querySelector("[data-reservation-detail-save]");
  const cancelButton = modal.querySelector("[data-reservation-detail-cancel]");
  const dateInput = modal.querySelector("[data-reservation-date]");
  const textarea = modal.querySelector("[data-reservation-memo-edit]");
  const checkinInput = modal.querySelector("[data-reservation-checkin-time]");
  const checkoutInput = modal.querySelector("[data-reservation-checkout-time]");
  const classOptions = modal.querySelector("[data-reservation-class-options]");
  const statusTrigger = modal.querySelector("[data-reservation-status-trigger]");
  const statusValue = modal.querySelector("[data-reservation-status-value]");
  const statusMenu = modal.querySelector("[data-reservation-status-menu]");
  const pickdropOptions = modal.querySelector("[data-reservation-pickdrop-options]");
  const daycareFeeRow = modal.querySelector("[data-reservation-daycare-fee-row]");
  const daycareFeeValue = modal.querySelector("[data-reservation-daycare-fee]");
  const ticketInfo = modal.querySelector("[data-reservation-ticket-info]");
  const dogNameText = modal.querySelector("[data-reservation-dog-name]");
  const breedText = modal.querySelector("[data-reservation-breed]");
  const weightText = modal.querySelector("[data-reservation-weight]");
  const ownerDetailText = modal.querySelector("[data-reservation-detail-owner]");
  const phoneDetailText = modal.querySelector("[data-reservation-detail-phone]");
  const tabButtons = modal.querySelectorAll("[data-reservation-detail-tab]");
  const tabPanels = modal.querySelectorAll("[data-reservation-detail-panel]");
  const paymentMethodButtons = modal.querySelectorAll("[data-reservation-payment-method]");
  const paymentTicketRow = modal.querySelector("[data-reservation-payment-ticket]");
  let activeReservationId = "";
  let activeReservationDate = "";
  let initialSnapshot = "";
  let activeStatusKey = "PLANNED";
  let initialStatusKey = "PLANNED";
  let activeMemberId = "";
  let activePaymentMethod = "ticket";
  const timeZone = getTimeZone();

  const getSelectedClass = () =>
    classOptions?.querySelector("[data-reservation-class-option].is-selected")
      ?.dataset?.reservationClassOption || "";

  const getPickdropFlags = () => {
    const pickup = pickdropOptions?.querySelector(
      "[data-reservation-pickdrop='pickup']"
    );
    const dropoff = pickdropOptions?.querySelector(
      "[data-reservation-pickdrop='dropoff']"
    );
    return {
      hasPickup: pickup?.classList.contains("is-selected") || false,
      hasDropoff: dropoff?.classList.contains("is-selected") || false,
    };
  };

  const updateSaveState = () => {
    if (!saveButton) {
      return;
    }
    const current = JSON.stringify({
      date: dateInput instanceof HTMLInputElement ? dateInput.value : "",
      memo: textarea?.value.trim() || "",
      checkinTime: checkinInput instanceof HTMLInputElement ? checkinInput.value : "",
      checkoutTime: checkoutInput instanceof HTMLInputElement ? checkoutInput.value : "",
      className: getSelectedClass(),
      statusKey: activeStatusKey,
      ...getPickdropFlags(),
    });
    saveButton.disabled = current === initialSnapshot;
  };

  const closeStatusMenu = () => {
    if (!statusMenu) {
      return;
    }
    statusMenu.hidden = true;
    statusTrigger?.setAttribute("aria-expanded", "false");
  };

  const setActiveDetailTab = (value) => {
    const target = value || "product";
    tabButtons.forEach((button) => {
      const isActive = button.dataset.reservationDetailTab === target;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.reservationDetailPanel === target;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  };

  const setPaymentMethod = (value) => {
    activePaymentMethod = value || "ticket";
    paymentMethodButtons.forEach((button) => {
      const isSelected = button.dataset.reservationPaymentMethod === activePaymentMethod;
      button.classList.toggle("is-selected", isSelected);
    });
    if (paymentTicketRow) {
      paymentTicketRow.hidden = activePaymentMethod !== "ticket";
    }
  };

  const statusClassMap = {
    PLANNED: "reservation-detail__status--planned",
    CHECKIN: "reservation-detail__status--checkin",
    CHECKOUT: "reservation-detail__status--checkout",
    ABSENT: "reservation-detail__status--absent",
    CANCELED: "reservation-detail__status--canceled",
  };

  const updateStatusDisplay = (value) => {
    activeStatusKey = value || "PLANNED";
    if (statusValue) {
      statusValue.textContent = storage?.STATUS?.[activeStatusKey] || "-";
    }
    if (statusTrigger) {
      statusTrigger.classList.remove(
        "reservation-detail__status--planned",
        "reservation-detail__status--checkin",
        "reservation-detail__status--checkout",
        "reservation-detail__status--absent",
        "reservation-detail__status--canceled",
        "list-table__status--primary",
        "list-table__status--warning",
        "list-table__status--success",
        "list-table__status--danger"
      );
      statusTrigger.classList.add(
        statusClassMap[activeStatusKey] || statusClassMap.PLANNED
      );
    }
  };

  const renderStatusMenu = () => {
    if (!statusMenu || !storage?.STATUS) {
      return;
    }
    statusMenu.innerHTML = STATUS_ORDER
      .map((key) => {
        const label = storage.STATUS[key];
        if (!label) {
          return "";
        }
        const tone = getStatusTone(label, storage.STATUS);
        const toneClass = tone ? `list-table__status--${tone}` : "";
        const isSelected = key === activeStatusKey ? " is-selected" : "";
        return `
          <button class="menu-option reservation-detail__status-option ${toneClass}${isSelected}" type="button" data-status-option="${key}">
            <span class="menu-option__title">${label}</span>
          </button>
        `;
      })
      .join("");
  };

  const toggleStatusMenu = () => {
    if (!statusMenu) {
      return;
    }
    const shouldOpen = statusMenu.hidden;
    if (shouldOpen) {
      renderStatusMenu();
      statusMenu.hidden = false;
      statusTrigger?.setAttribute("aria-expanded", "true");
    } else {
      closeStatusMenu();
    }
  };

  const setSelectedClass = (value) => {
    setSelectedChip(classOptions, "reservationClassOption", value);
  };

  const setPickdropFlags = (hasPickup, hasDropoff) => {
    if (!pickdropOptions) {
      return;
    }
    const pickup = pickdropOptions.querySelector("[data-reservation-pickdrop='pickup']");
    const dropoff = pickdropOptions.querySelector("[data-reservation-pickdrop='dropoff']");
    pickup?.classList.toggle("is-selected", Boolean(hasPickup));
    dropoff?.classList.toggle("is-selected", Boolean(hasDropoff));
  };


  const updateDaycareFee = () => {
    if (!daycareFeeRow || !daycareFeeValue) {
      return;
    }
    const classes = classStorage.ensureDefaults();
    const className = getSelectedClass();
    const classType = classes.find((item) => item.name === className)?.type;
    const isDaycare = classType === "daycare";
    daycareFeeRow.hidden = !isDaycare;
    if (!isDaycare) {
      daycareFeeValue.textContent = "-";
      return;
    }
    const pricing = operationsStorage.loadSettings().daycarePricing || {};
    const fee = calculateDaycareFee(
      checkinInput instanceof HTMLInputElement ? checkinInput.value : "",
      checkoutInput instanceof HTMLInputElement ? checkoutInput.value : "",
      {
        hourlyRate: Number(pricing.hourlyRate) || 0,
        billingUnit: Number(pricing.billingUnit) || 60,
      }
    );
    daycareFeeValue.textContent = formatTicketPrice(fee);
  };

  const updateTicketInfo = (reservation, dateEntry) => {
    if (!ticketInfo) {
      return;
    }
    const memberId = getMemberIdFromReservation(reservation);
    if (!memberId) {
      renderTicketInfoBadge(ticketInfo);
      return;
    }
    const usage = getPrimaryTicketUsage(dateEntry || {});
    if (!usage?.ticketId || !usage?.sequence) {
      renderTicketInfoBadge(ticketInfo);
      return;
    }
    const tickets = ticketStorage.ensureDefaults();
    const member = loadIssueMembers().find((item) =>
      String(item.id) === String(memberId)
    );
    const options = getIssuedTicketOptions(
      tickets,
      Array.isArray(member?.tickets) ? member.tickets : []
    );
    const optionMap = new Map(options.map((option) => [option.id, option]));
    const ticketName = optionMap.get(String(usage.ticketId))?.name || "";
    const totalCount = optionMap.get(String(usage.ticketId))?.totalCount;
    renderTicketInfoBadge(ticketInfo, { ticketName, count: usage.sequence, totalCount });
  };

  const renderClassOptions = () => {
    const options = Array.isArray(state.serviceOptions) && state.serviceOptions.length
      ? state.serviceOptions
      : ["유치원"];
    renderSelectableChips(classOptions, options, { dataKey: "reservationClassOption" });
  };

  const openModal = (reservationId, dateKey) => {
    if (!textarea) {
      return;
    }
    activeReservationId = reservationId;
    activeReservationDate = dateKey || "";
    const reservations = resolveSchoolReservations(storage, state.reservations);
    const target = reservations.find((item) => item.id === reservationId);
    activeMemberId = getMemberIdFromReservation(target);
    const dateEntries = getReservationEntries([target]);
    const dateEntry = dateEntries.find((entry) => entry.date === activeReservationDate)
      || dateEntries[0];
    activeReservationDate = dateEntry?.date || activeReservationDate;
    const targetDate = formatDateInputValue(new Date(dateEntry?.date));
    if (dateInput instanceof HTMLInputElement) {
      dateInput.value = targetDate;
    }
    textarea.value = target?.memo || "";
    if (checkinInput instanceof HTMLInputElement) {
      checkinInput.value = dateEntry?.checkinTime || "";
    }
    if (checkoutInput instanceof HTMLInputElement) {
      checkoutInput.value = dateEntry?.checkoutTime || "";
    }
    if (dogNameText instanceof HTMLElement) {
      dogNameText.textContent = target?.dogName || "-";
    }
    if (breedText instanceof HTMLElement) {
      breedText.textContent = target?.breed || "-";
    }
    if (weightText instanceof HTMLElement) {
      weightText.textContent =
        target?.weight || target?.memberWeight || target?.petWeight || "-";
    }
    if (ownerDetailText instanceof HTMLElement) {
      ownerDetailText.textContent = target?.owner || "-";
    }
    if (phoneDetailText instanceof HTMLElement) {
      phoneDetailText.textContent = target?.phone || target?.ownerPhone || "-";
    }
    updateTicketInfo(target, dateEntry);
    const hasTicketUsage = getEntryTicketUsages(dateEntry || {}).length > 0;
    setPaymentMethod(hasTicketUsage ? "ticket" : "cash");
    const className = dateEntry?.className || target?.class || target?.service || "";
    setSelectedClass(className);
    const fallbackKey = resolveStatusKey(dateEntry?.statusText || "", storage?.STATUS || {}) || "PLANNED";
    const statusKey = dateEntry?.baseStatusKey || fallbackKey;
    updateStatusDisplay(statusKey);
    initialStatusKey = statusKey;
    const entryPickdrop = {
      pickup: Boolean(dateEntry?.pickup ?? target?.hasPickup),
      dropoff: Boolean(dateEntry?.dropoff ?? target?.hasDropoff),
    };
    setPickdropFlags(
      entryPickdrop.pickup,
      entryPickdrop.dropoff
    );
    updateDaycareFee();
    setActiveDetailTab("product");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    initialSnapshot = JSON.stringify({
      date: dateInput instanceof HTMLInputElement ? dateInput.value : "",
      memo: textarea.value.trim(),
      checkinTime: checkinInput instanceof HTMLInputElement ? checkinInput.value : "",
      checkoutTime: checkoutInput instanceof HTMLInputElement ? checkoutInput.value : "",
      className,
      statusKey: activeStatusKey,
      hasPickup: entryPickdrop.pickup,
      hasDropoff: entryPickdrop.dropoff,
    });
    updateSaveState();
    if (dateInput instanceof HTMLInputElement) {
      dateInput.focus();
    } else {
      textarea.focus();
    }
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  overlay?.addEventListener("click", closeModal);
  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  modal.addEventListener("input", updateSaveState);
  modal.addEventListener("change", updateSaveState);
  modal.addEventListener("input", updateDaycareFee);
  modal.addEventListener("change", updateDaycareFee);

  modal.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const tabButton = target?.closest("[data-reservation-detail-tab]");
    if (tabButton && modal.contains(tabButton)) {
      setActiveDetailTab(tabButton.dataset.reservationDetailTab);
      return;
    }
    const paymentButton = target?.closest("[data-reservation-payment-method]");
    if (paymentButton && modal.contains(paymentButton)) {
      setPaymentMethod(paymentButton.dataset.reservationPaymentMethod);
      return;
    }
    const statusToggle = target?.closest("[data-reservation-status-trigger]");
    if (statusToggle && statusTrigger?.contains(statusToggle)) {
      toggleStatusMenu();
      return;
    }
    const statusOption = target?.closest("[data-status-option]");
    if (statusOption && statusMenu?.contains(statusOption)) {
      const nextStatus = statusOption.dataset.statusOption || "";
      updateStatusDisplay(nextStatus);
      if (nextStatus === "PLANNED" || nextStatus === "CANCELED") {
        if (checkinInput instanceof HTMLInputElement) {
          checkinInput.value = "";
        }
        if (checkoutInput instanceof HTMLInputElement) {
          checkoutInput.value = "";
        }
      } else {
        if (nextStatus === "CHECKIN" && checkinInput instanceof HTMLInputElement && !checkinInput.value) {
          checkinInput.value = getCurrentTimeString(timeZone);
        }
        if (nextStatus === "CHECKOUT" && checkoutInput instanceof HTMLInputElement && !checkoutInput.value) {
          checkoutInput.value = getCurrentTimeString(timeZone);
        }
      }
      closeStatusMenu();
      updateSaveState();
      return;
    }
    const classOption = target?.closest("[data-reservation-class-option]");
    if (classOption && classOptions?.contains(classOption)) {
      setSelectedClass(classOption.dataset.reservationClassOption || "");
      updateSaveState();
      updateDaycareFee();
      return;
    }
    const pickdropButton = target?.closest("[data-reservation-pickdrop]");
    if (pickdropButton && pickdropOptions?.contains(pickdropButton)) {
      pickdropButton.classList.toggle("is-selected");
      updateSaveState();
      closeStatusMenu();
      return;
    }
    if (statusMenu && !statusMenu.hidden) {
      closeStatusMenu();
    }
  });

  saveButton?.addEventListener("click", () => {
    if (!activeReservationId || !textarea) {
      return;
    }
    const nextMemo = textarea.value.trim();
    const nextDate = dateInput instanceof HTMLInputElement ? dateInput.value : "";
    const nextClass = getSelectedClass();
    const nextStatusKey = activeStatusKey || "PLANNED";
    const statusText = storage?.STATUS ? storage.STATUS[nextStatusKey] : "";
    const pickdropFlags = getPickdropFlags();
    const nextCheckin = checkinInput instanceof HTMLInputElement
      ? checkinInput.value
      : "";
    const nextCheckout = checkoutInput instanceof HTMLInputElement
      ? checkoutInput.value
      : "";
    const classes = classStorage.ensureDefaults();
    const classType = classes.find((item) => item.name === nextClass)?.type || "school";
    const serviceTypes = nextClass ? [classType] : [];
    if (pickdropFlags.hasPickup || pickdropFlags.hasDropoff) {
      const pickdropType = getPickdropCountType({
        pickup: pickdropFlags.hasPickup,
        dropoff: pickdropFlags.hasDropoff,
      });
      if (pickdropType) {
        serviceTypes.push(pickdropType);
      }
    }
    if (serviceTypes.length === 0) {
      serviceTypes.push("school");
    }
    const pricing = operationsStorage.loadSettings().daycarePricing || {};
    const daycareFee = classType === "daycare"
      ? calculateDaycareFee(nextCheckin, nextCheckout, {
          hourlyRate: Number(pricing.hourlyRate) || 0,
          billingUnit: Number(pricing.billingUnit) || 60,
        })
      : 0;
    const updateReservationItem = (item) => {
      const updated = updateReservationDateEntry(item, activeReservationDate, (entry) => ({
        date: nextDate || entry.date,
        class: nextClass,
        service: nextClass,
        baseStatusKey: nextStatusKey,
        statusText,
        checkinTime: nextCheckin,
        checkoutTime: nextCheckout,
        daycareFee,
        pickup: pickdropFlags.hasPickup,
        dropoff: pickdropFlags.hasDropoff,
      }));
      const pickdropSummary = getReservationPickdropSummary(updated.dates);
      return {
        ...updated,
        memo: nextMemo,
        class: nextClass,
        service: nextClass,
        hasPickup: pickdropSummary.hasPickup,
        hasDropoff: pickdropSummary.hasDropoff,
        pickupChecked: pickdropSummary.hasPickup,
        dropoffChecked: pickdropSummary.hasDropoff,
      };
    };
    if (storage && typeof storage.updateReservation === "function") {
      state.reservations = filterSchoolReservations(
        storage.updateReservation(
          activeReservationId,
          updateReservationItem
        )
      );
    } else {
      state.reservations = filterSchoolReservations(
        (state.reservations || []).map((item) => {
          if (item.id !== activeReservationId) {
            return item;
          }
          return updateReservationItem(item);
        })
      );
    }
    if (nextDate) {
      activeReservationDate = nextDate;
    }
    if (activeMemberId && nextStatusKey !== initialStatusKey) {
      serviceTypes.forEach((type) => {
        applyReservationStatusChange(
          activeMemberId,
          initialStatusKey,
          nextStatusKey,
          1,
          type
        );
      });
      if (nextStatusKey === "CANCELED" && initialStatusKey !== "CANCELED") {
        const reservations = resolveSchoolReservations(storage, state.reservations);
        const target = reservations.find((item) => item.id === activeReservationId);
        const entry = target
          ? getReservationEntries([target]).find((value) => value.date === activeReservationDate)
          : null;
        const usageMap = new Map();
        addTicketUsagesCount(usageMap, getEntryTicketUsages(entry), 1);
        rollbackReservationMemberTickets(activeMemberId, usageMap);
      }
    }
    closeModal();
    refresh();
    notifyReservationUpdated();
  });

  cancelButton?.addEventListener("click", () => {
    if (!activeReservationId) {
      return;
    }
    if (!window.confirm("예약을 삭제할까요?")) {
      return;
    }
    const reservations = resolveSchoolReservations(storage, state.reservations);
    const nextReservations = reservations.reduce((acc, item) => {
      if (item.id !== activeReservationId) {
        acc.push(item);
        return acc;
      }
      const entries = getReservationEntries([item]);
      const entry = entries.find((value) => value.date === activeReservationDate);
      const beforeStatusKey =
        entry?.baseStatusKey
        || resolveStatusKey(entry?.statusText || "", storage?.STATUS || {})
        || "PLANNED";
      const serviceTypes = resolveReservationServiceTypes(item, entry, classStorage);
      applyMemberStatusDeltas(item, beforeStatusKey, null, 1, serviceTypes);
      if (beforeStatusKey !== "CANCELED") {
        const memberId = getMemberIdFromReservation(item);
        if (memberId) {
          const usageMap = new Map();
          addTicketUsagesCount(usageMap, getEntryTicketUsages(entry), 1);
          rollbackReservationMemberTickets(memberId, usageMap);
        }
      }
      const nextItem = removeReservationDateEntry(item, activeReservationDate);
      const hasDates = Array.isArray(nextItem.dates) ? nextItem.dates.length > 0 : false;
      if (hasDates) {
        acc.push(nextItem);
      }
      return acc;
    }, []);
    if (storage && typeof storage.saveReservations === "function") {
      storage.saveReservations(nextReservations);
    }
    state.reservations = filterSchoolReservations(nextReservations);
    closeModal();
    refresh();
  });

  renderClassOptions();
  return {
    openModal,
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
  const getRows = () => list.querySelectorAll("[data-reservation-row]");
  const cancelButton = list.querySelector("[data-reservation-cancel-open]");
  const selectAll = list.querySelector("[data-reservation-select-all]");
  const updateCancelButtonState = () => {
    if (!cancelButton) {
      return;
    }

    const hasSelection = Array.from(getRows()).some((row) => {
      const checkbox = row.querySelector("[data-reservation-select]");
      return checkbox instanceof HTMLInputElement && checkbox.checked;
    });

    cancelButton.disabled = !hasSelection;
    cancelButton.classList.toggle("button-secondary--disabled", !hasSelection);
  };

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
    const rows = getRows();
    const visible = applyServiceFilter(rows, state);
    updateListCounts(list, visible, storage);
    updateSubtitle(list, state, dayoffSettings, timeZone);
    updateCancelButtonState();
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

  classFilters.forEach((filter) => {
    filter.addEventListener("change", handleClassFilterChange);
  });

  teacherFilters.forEach((filter) => {
    filter.addEventListener("change", handleTeacherFilterChange);
  });

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
      updateCancelButtonState();
      updateSelectAllState();
      return;
    }

    if (target.matches("[data-reservation-select]")) {
      updateCancelButtonState();
      updateSelectAllState();
    }
  });

  setupPickdropModal(list, state, getRows);
  const statusMenu = setupStatusMenu(list, storage, state, refresh);
  setupCancelModal(list, state, storage, refresh);
  const detailModal = setupDetailModal(list, state, storage, refresh);
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
        if (reservationId && detailModal) {
          detailModal.openModal(reservationId, reservationDate);
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
