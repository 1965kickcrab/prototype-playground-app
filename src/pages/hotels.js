import { setupSidebarToggle } from "../utils/sidebar.js";
import { setupHotelingCalendar } from "../components/hoteling-calendar.js";
import { setupServiceSwitcher } from "../utils/service-switcher.js";
import { renderHotelingList } from "../components/hoteling-list.js";
import {
  bindListCountFilterBar,
  renderListCountFilterBar,
} from "../components/list-count-filter-bar.js";
import { showToast } from "../components/toast.js";
import { syncFilterChip } from "../utils/dom.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import {
  ensureMemberDefaults,
  loadIssueMembers,
} from "../storage/ticket-issue-members.js";
import {
  buildHotelingEntriesForDate,
  getHotelingCalendarStats,
  getHotelingDateKey,
} from "../services/hoteling-reservation-service.js";
import {
  getMemberRoomHotelingReservationSummary,
} from "../services/member-reservation-summary.js";
import {
  buildTicketUsageEntries,
  buildTicketUsageMapFromEntries,
  mergeTicketUsageCountMap,
} from "../services/ticket-usage-service.js";
import { getDatePartsFromKey } from "../utils/date.js";
import { getTimeZone } from "../utils/timezone.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import {
  buildReservationWithBilling,
  sumBillingAllocationsExpected,
} from "../services/reservation-billing.js";
import {
  getReservationPaymentStatus,
} from "../services/reservation-payment-status.js";
import { hasTagValue, sanitizeTagList } from "../utils/tags.js";

document.addEventListener("DOMContentLoaded", () => {
  const HOTELING_ROOM_FILTER_ALL = "all";
  const timeZone = getTimeZone();
  const reservationStorage = initReservationStorage();
  const roomStorage = initHotelRoomStorage();
  const pricingStorage = initPricingStorage();
  const classStorage = initClassStorage();

  const allReservations = reservationStorage.loadReservations();
  const sidebarReservationBadges = setupSidebarReservationBadges({
    storage: reservationStorage,
    timeZone,
  });
  setupServiceSwitcher(document);

  const rooms = roomStorage.ensureDefaults();
  const getTotalRoomCapacity = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, room) => {
      const value = Number(room?.capacity);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
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
  const scheduleRoomFilterState = {
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
    const tagMenu = panel.querySelector("[data-filter-menu='tag']");
    const tagButton = panel.querySelector("[data-filter-button='tag']");
    const badge = panel.querySelector("[data-filter-badge]");
    if (!roomMenu || !roomButton || !paymentMenu || !paymentButton || !tagMenu || !tagButton) {
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
    const tagOptions = loadMemberTagCatalog();
    const selectedTagMap = {};

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
      closeMenu(tagMenu, tagButton);
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

    const renderTagMenu = () => {
      tagMenu.innerHTML = "";
      if (!tagOptions.length) {
        const empty = document.createElement("div");
        empty.className = "menu-option menu-option--empty";
        empty.innerHTML = '<span class="menu-option__title">등록된 태그가 없습니다.</span>';
        tagMenu.appendChild(empty);
        return;
      }
      tagOptions.forEach((tag) => {
        const label = document.createElement("label");
        label.className = "menu-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = tag;
        input.checked = selectedTagMap[tag] === true;
        input.setAttribute("data-tag-filter", "");
        const title = document.createElement("span");
        title.className = "menu-option__title";
        title.textContent = tag;
        label.appendChild(input);
        label.appendChild(title);
        label.classList.toggle("is-selected", input.checked);
        tagMenu.appendChild(label);
      });
    };

    const updateSummary = (skipChange = false) => {
      const selectedRooms = Object.keys(selectedRoomMap).filter((key) => selectedRoomMap[key] !== false);
      const selectedPayments = Object.keys(selectedPaymentMap).filter((key) => selectedPaymentMap[key] !== false);
      const selectedTags = sanitizeTagList(
        Object.keys(selectedTagMap).filter((key) => selectedTagMap[key] === true)
      );

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
      if (!selectedTags.length) {
        tagButton.textContent = "태그";
      } else if (selectedTags.length === 1) {
        tagButton.textContent = selectedTags[0];
      } else {
        const sorted = [...selectedTags].sort((a, b) => a.localeCompare(b, "ko"));
        tagButton.textContent = `${sorted[0]} 외 ${selectedTags.length - 1}`;
      }

      if (badge) {
        let activeCount = 0;
        if (selectedRooms.length !== options.length) {
          activeCount += 1;
        }
        if (selectedPayments.length !== paymentFilterState.options.length) {
          activeCount += 1;
        }
        if (selectedTags.length > 0) {
          activeCount += 1;
        }
        badge.textContent = String(activeCount);
        badge.hidden = activeCount === 0;
      }

      roomFilterState.selected = new Set(selectedRooms);
      paymentFilterState.selected = new Set(selectedPayments);
      roomFilterState.selectedTags = new Set(selectedTags);

      if (!skipChange && typeof onChange === "function") {
        onChange();
      }
    };

    renderRoomMenu();
    renderPaymentMenu();
    renderTagMenu();
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

      const tagDropdownButton = target.closest("[data-filter-button='tag']");
      if (tagDropdownButton) {
        openExclusiveMenu(tagMenu, tagButton);
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
        Object.keys(selectedTagMap).forEach((tag) => {
          selectedTagMap[tag] = false;
        });
        renderRoomMenu();
        renderPaymentMenu();
        renderTagMenu();
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
        return;
      }

      if (input.matches("[data-tag-filter]")) {
        selectedTagMap[input.value] = input.checked;
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
    const roomId = normalizeRoomId(reservation?.room);
    if (!roomId) {
      return "";
    }
    const room = rooms.find((item) => normalizeRoomId(item.id) === roomId);
    return room?.name || roomId;
  };

  const getFilteredReservations = (options = {}) => {
    const selectedRooms = roomFilterState.selected;
    const totalRooms = roomFilterState.options.length;
    const selectedPayments = paymentFilterState.selected;
    const totalPayments = paymentFilterState.options.length;
    const selectedTags = roomFilterState.selectedTags || new Set();
    const members = loadIssueMembers();
    const ignoreRoomFilter = Boolean(options?.ignoreRoomFilter);

    return reservationState.reservations.filter((item) => {
      const roomMatched = ignoreRoomFilter
        || !selectedRooms
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

      if (!paymentMatched) {
        return false;
      }
      if (!selectedTags.size) {
        return true;
      }

      const member = members.find((candidate) => String(candidate?.id || "") === String(item?.memberId || ""));
      const memberTags = sanitizeTagList([
        ...(Array.isArray(member?.ownerTags) ? member.ownerTags : []),
        ...(Array.isArray(member?.petTags) ? member.petTags : []),
      ]);
      return Array.from(selectedTags).some((tag) => hasTagValue(memberTags, tag));
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
  const listDate = document.querySelector("[data-hoteling-list-date]");
  const totalCountEl = document.querySelector("[data-hoteling-total-count]");
  const checkinCountEl = document.querySelector("[data-hoteling-checkin-count]");
  const checkoutCountEl = document.querySelector("[data-hoteling-checkout-count]");
  const stayCountEl = document.querySelector("[data-hoteling-stay-count]");
  const listEmptyEl = document.querySelector("[data-hoteling-list-empty]");
  const hotelingFeed = document.querySelector("[data-hoteling-feed]");
  const headerCapacity = document.querySelector("[data-hoteling-capacity]");
  const roomCountFilterBar = document.querySelector("[data-hoteling-room-count-filters]");

  if (headerCapacity) {
    headerCapacity.textContent = String(getTotalRoomCapacity(rooms));
  }

  const getTableCheckboxes = (table) => {
    if (!table) {
      return null;
    }
    const headerCheckbox = table.querySelector(
      ".hoteling-table__header input[type=\"checkbox\"]"
    );
    const rowCheckboxes = Array.from(table.querySelectorAll(
      ".hoteling-table__row--data input[type=\"checkbox\"]"
    )).filter((checkbox) => !checkbox.disabled);
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


  const getRoomIdFromReservation = (reservation) => normalizeRoomId(reservation?.room);

  const getAllGroupEntries = (groups) => [
    ...(Array.isArray(groups?.checkin) ? groups.checkin : []),
    ...(Array.isArray(groups?.checkout) ? groups.checkout : []),
    ...(Array.isArray(groups?.stay) ? groups.stay : []),
  ];

  const getScheduleRoomFilterSet = (roomIds) => {
    if (!(scheduleRoomFilterState.selected instanceof Set)) {
      scheduleRoomFilterState.selected = new Set(
        Array.isArray(scheduleRoomFilterState.selected)
          ? scheduleRoomFilterState.selected
          : [scheduleRoomFilterState.selected]
      );
    }
    const validIds = new Set(roomIds);
    scheduleRoomFilterState.selected = new Set(
      Array.from(scheduleRoomFilterState.selected).filter((id) => validIds.has(id))
    );
    if (scheduleRoomFilterState.selected.size === 0 && roomIds.length > 0) {
      scheduleRoomFilterState.selected = new Set(roomIds);
    }
    return scheduleRoomFilterState.selected;
  };

  const renderRoomCountFilters = (groups) => {
    const roomOptions = roomStorage.ensureDefaults();
    const roomIds = roomOptions.map((room) => normalizeRoomId(room?.id)).filter((id) => id);
    const selected = getScheduleRoomFilterSet(roomIds);
    const allSelected = roomIds.length === 0 || selected.size === roomIds.length;
    const countByRoom = new Map(roomIds.map((id) => [id, 0]));
    getAllGroupEntries(groups).forEach(({ reservation }) => {
      const roomId = getRoomIdFromReservation(reservation);
      if (!roomId) {
        return;
      }
      if (!countByRoom.has(roomId)) {
        countByRoom.set(roomId, 0);
      }
      countByRoom.set(roomId, (countByRoom.get(roomId) || 0) + 1);
    });
    renderListCountFilterBar(roomCountFilterBar, {
      allValue: HOTELING_ROOM_FILTER_ALL,
      allLabel: "전체",
      totalCount: getAllGroupEntries(groups).length,
      allSelected,
      items: roomOptions.map((room) => {
        const roomId = normalizeRoomId(room?.id);
        return {
          value: roomId,
          label: String(room?.name || roomId || "-"),
          count: countByRoom.get(roomId) || 0,
          selected: allSelected || selected.has(roomId),
        };
      }),
    });
  };

  const filterGroupsBySelectedRoom = (groups) => {
    const roomIds = roomStorage.ensureDefaults()
      .map((room) => normalizeRoomId(room?.id))
      .filter((id) => id);
    const selectedRoomIds = getScheduleRoomFilterSet(roomIds);
    if (roomIds.length === 0 || selectedRoomIds.size === roomIds.length) {
      return groups;
    }
    const filterEntries = (items) => (Array.isArray(items) ? items : [])
      .filter(({ reservation }) => selectedRoomIds.has(getRoomIdFromReservation(reservation)));
    return {
      checkin: filterEntries(groups?.checkin),
      checkout: filterEntries(groups?.checkout),
      stay: filterEntries(groups?.stay),
    };
  };

  bindListCountFilterBar(roomCountFilterBar, (value) => {
    const roomIds = roomStorage.ensureDefaults()
      .map((room) => normalizeRoomId(room?.id))
      .filter((id) => id);
    const selected = getScheduleRoomFilterSet(roomIds);
    if (value === HOTELING_ROOM_FILTER_ALL) {
      scheduleRoomFilterState.selected = new Set(roomIds);
    } else if (selected.has(value)) {
      selected.delete(value);
      scheduleRoomFilterState.selected = selected.size > 0 ? selected : new Set([value]);
    } else {
      selected.add(value);
      scheduleRoomFilterState.selected = selected;
    }
    if (reservationState.selectedDateKey) {
      renderListForKey(reservationState.selectedDateKey);
    }
  });

  const renderListForKey = (dateKey) => {
    reservationState.selectedDateKey = dateKey || "";
    const groups = buildHotelingEntriesForDate(
      getFilteredReservations(),
      reservationState.selectedDateKey,
      { includeCanceled: false }
    );
    renderRoomCountFilters(groups);
    const filteredGroups = filterGroupsBySelectedRoom(groups);
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
        feed: hotelingFeed,
        totalCountEl,
        checkinCountEl,
        checkoutCountEl,
        stayCountEl,
        listEmptyEl,
      },
      filteredGroups,
      { roomNameById, memberById }
    );
    sidebarReservationBadges.refresh();
  };

  const renderListForDate = (date) => {
    const dateKey = getHotelingDateKey(date, timeZone);
    renderListForKey(dateKey);
  };

  const getDateFromKey = (key) => {
    const parts = getDatePartsFromKey(key);
    if (!parts) {
      return null;
    }
    return new Date(parts.year, parts.month - 1, parts.day);
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
        return;
      }
      syncTableHeaderCheckbox(table);
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
      const targetUrl = new URL("./hotel-detail.html", window.location.href);
      targetUrl.searchParams.set("reservationId", reservationId);
      if (reservationState.selectedDateKey) {
        targetUrl.searchParams.set("dateKey", reservationState.selectedDateKey);
      }
      if (row?.dataset?.entryKind) {
        targetUrl.searchParams.set("kind", row.dataset.entryKind);
      }
      window.location.href = targetUrl.toString();
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

  const listParams = new URLSearchParams(window.location.search);
  const initialDateKey = listParams.get("dateKey") || "";
  const initialDateFromQuery = getDateFromKey(initialDateKey);
  const initialDate = initialDateFromQuery instanceof Date
    && !Number.isNaN(initialDateFromQuery.getTime())
    ? initialDateFromQuery
    : new Date();

  const hotelingCalendar = setupHotelingCalendar({
    gridSelector: "[data-hoteling-calendar-grid]",
    currentLabelSelector: "[data-hoteling-current-month]",
    prevButtonSelector: ".month-button--prev",
    nextButtonSelector: ".month-button--next",
    todayButtonSelector: "[data-hoteling-today]",
    initialDate,
    formatCurrentLabel: (year, month) => `${year}. ${String(month + 1).padStart(2, "0")}`,
    getDateStats: getCalendarStatsForDate,
    onDateSelect: (selectedDate) => {
      if (listDate && selectedDate instanceof Date) {
        const month = selectedDate.getMonth() + 1;
        const day = selectedDate.getDate();
        listDate.textContent = `${month}월 ${day}일`;
      }
      renderListForDate(selectedDate);
    },
  });

  renderListForDate(initialDate);
  if (listDate) {
    listDate.textContent = `${initialDate.getMonth() + 1}월 ${initialDate.getDate()}일`;
  }

  if (listParams.get("toast") === "registered") {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("toast");
    window.history.replaceState({}, "", cleanUrl.toString());
    window.requestAnimationFrame(() => {
      showToast("예약이 등록되었습니다.");
    });
  }

});
