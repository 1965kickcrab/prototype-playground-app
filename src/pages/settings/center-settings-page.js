import { initClassStorage } from "../../storage/class-storage.js";
import { initHotelRoomStorage } from "../../storage/hotel-room-storage.js";
import { initHotelOperationsStorage } from "../../storage/hotel-operations-storage.js";
import { initOperationsStorage } from "../../storage/operations-storage.js";
import { WEEKDAYS } from "../../config/weekdays.js";
import {
  formatCapacity,
  formatDays,
  formatTicketSelectionCount,
  formatTimeRange,
} from "../../services/class-display.js";
import {
  getDefaultClassType,
  setupClassList,
} from "../../services/class-management.js";

const SERVICE_TYPES = new Set(["school", "hoteling"]);
const OPEN_UNIT_LABELS = Object.freeze({
  day: "일",
  week: "주",
  month: "개월",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeType(value) {
  return SERVICE_TYPES.has(value) ? value : "school";
}

function getStorage(type) {
  return type === "hoteling" ? initHotelRoomStorage() : initClassStorage();
}

function getOperationsStorage(type) {
  return type === "hoteling" ? initHotelOperationsStorage() : initOperationsStorage();
}

function getItems(type) {
  const storage = getStorage(type);
  return setupClassList(storage, type === "hoteling");
}

function getWeekdayLabel(key) {
  const match = WEEKDAYS.find((day) => day.key === key);
  return match ? match.label.replace("요일", "") : key;
}

function formatWeekly(weekly = {}) {
  const labels = WEEKDAYS
    .filter((day) => Boolean(weekly[day.key]))
    .map((day) => day.label.replace("요일", ""));
  return labels.length > 0 ? labels.join(", ") : "운영일 없음";
}

function formatPolicy(policy = {}) {
  const time = policy.time || "-";
  if (policy.type === "days") {
    return `${policy.days || "-"}일 전 ${time}까지`;
  }
  return `당일 ${time}까지`;
}

function formatReservationOpen(openSettings = {}) {
  if (!openSettings.enabled) {
    return "사용 안 함";
  }
  const dayLabel = openSettings.day ? getWeekdayLabel(openSettings.day) : "요일 미지정";
  const unitLabel = OPEN_UNIT_LABELS[openSettings.unit] || "";
  const length = openSettings.length || "-";
  return `${dayLabel} ${openSettings.time || "-"}부터 ${length}${unitLabel} 단위`;
}

function getReadRowHtml(label, value) {
  return `
    <div class="center-settings-read-row">
      <span class="center-settings-read-label">${escapeHtml(label)}</span>
      <span class="center-settings-read-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderReadViews(type) {
  const operations = document.querySelector("[data-center-settings-operations]");
  const policy = document.querySelector("[data-center-settings-policy]");
  const settings = getOperationsStorage(type).loadSettings();

  if (operations) {
    operations.innerHTML = [
      getReadRowHtml("운영 요일", formatWeekly(settings.weekly)),
      getReadRowHtml("공휴일", settings.publicHolidayOff ? "휴무" : "운영"),
      getReadRowHtml("임시 휴무", `${settings.tempDayoffs.length}일`),
      getReadRowHtml("휴무 예외", `${settings.tempDayoffExceptions.length}일`),
    ].join("");
  }

  if (policy) {
    policy.innerHTML = [
      getReadRowHtml("예약 가능 기한", formatPolicy(settings.reservationPolicy)),
      getReadRowHtml("취소 가능 기한", formatPolicy(settings.cancellationPolicy)),
      getReadRowHtml("예약 오픈", formatReservationOpen(settings.reservationOpen)),
    ].join("");
  }
}

function getCardHtml(item, type) {
  if (type === "hoteling") {
    return `
      <button class="center-settings-card" type="button" data-center-settings-item="${escapeHtml(item.id)}">
        <span class="center-settings-card__eyebrow">호텔링</span>
        <strong class="center-settings-card__title">${escapeHtml(item.name || "-")}</strong>
        <span class="center-settings-card__meta">호실 수 ${escapeHtml(formatCapacity(item.capacity))}</span>
        <span class="center-settings-card__meta">예약 가능한 이용권 ${escapeHtml(formatTicketSelectionCount(item.ticketIds))}</span>
        <img class="center-settings-card__chevron" src="../../../assets/iconChevronRight.svg" alt="" aria-hidden="true">
      </button>
    `;
  }

  return `
    <button class="center-settings-card" type="button" data-center-settings-item="${escapeHtml(item.id)}">
      <span class="center-settings-card__eyebrow">유치원</span>
      <strong class="center-settings-card__title">${escapeHtml(item.name || "-")}</strong>
      <span class="center-settings-card__meta">담당 ${escapeHtml(item.teacher || "-")}</span>
      <span class="center-settings-card__meta">정원 ${escapeHtml(formatCapacity(item.capacity))}</span>
      <span class="center-settings-card__meta">${escapeHtml(formatDays(item.days))} · ${escapeHtml(formatTimeRange(item.startTime, item.endTime))}</span>
      <span class="center-settings-card__meta">예약 가능한 이용권 ${escapeHtml(formatTicketSelectionCount(item.ticketIds))}</span>
      <img class="center-settings-card__chevron" src="../../../assets/iconChevronRight.svg" alt="" aria-hidden="true">
    </button>
  `;
}

function renderTypeButtons(type) {
  document.querySelectorAll("[data-center-settings-type]").forEach((button) => {
    const isActive = button.dataset.centerSettingsType === type;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function renderListHeader(type) {
  const title = document.querySelector("[data-center-settings-list-title]");
  if (!title) {
    return;
  }
  title.textContent = type === "hoteling" ? "호실 목록" : "클래스 목록";
}

function renderList(type) {
  const list = document.querySelector("[data-center-settings-list]");
  if (!list) {
    return;
  }
  const items = getItems(type);
  if (items.length === 0) {
    list.innerHTML = `<p class="center-settings-list__empty">${type === "hoteling" ? "등록된 호실이 없습니다." : "등록된 클래스가 없습니다."}</p>`;
    return;
  }
  list.innerHTML = items.map((item) => getCardHtml(item, type)).join("");
}

function setType(type, replace = false) {
  const nextType = normalizeType(type);
  const url = new URL(window.location.href);
  url.searchParams.set("type", nextType);
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
  renderTypeButtons(nextType);
  renderReadViews(nextType);
  renderListHeader(nextType);
  renderList(nextType);
}

function getCurrentType() {
  return normalizeType(new URLSearchParams(window.location.search).get("type") || "school");
}

function initCenterSettingsPage() {
  setType(getCurrentType(), true);

  document.addEventListener("click", (event) => {
    const typeButton = event.target.closest("[data-center-settings-type]");
    if (typeButton) {
      setType(typeButton.dataset.centerSettingsType || "school");
      return;
    }

    if (event.target.closest("[data-center-settings-create]")) {
      const type = getCurrentType();
      window.location.href = `./center-settings-form.html?type=${encodeURIComponent(type)}`;
      return;
    }

    const itemButton = event.target.closest("[data-center-settings-item]");
    if (!itemButton) {
      return;
    }
    const type = getCurrentType();
    const id = itemButton.dataset.centerSettingsItem || "";
    window.location.href = `./center-settings-detail.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
  });

  window.addEventListener("popstate", () => {
    const type = getCurrentType();
    renderTypeButtons(type);
    renderReadViews(type);
    renderListHeader(type);
    renderList(type);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCenterSettingsPage);
} else {
  initCenterSettingsPage();
}
