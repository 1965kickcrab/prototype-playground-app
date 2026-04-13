import {
  getHotelingDateKey,
  STATUS,
} from "../services/hoteling-reservation-service.js";
import { syncFilterChip } from "../utils/dom.js";
import { getTimeZone } from "../utils/timezone.js";

function normalizeRoomId(value) {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }
  if (raw.includes(":")) {
    const [, id] = raw.split(":");
    return id || "";
  }
  return raw;
}

export function renderHotelingRoomOptions(root, rooms, options = {}) {
  const container = root?.querySelector?.("[data-hoteling-room-options]");
  if (!container) {
    return;
  }

  const preferredRoomIds = options.preferredRoomIds;
  const preferredSet = preferredRoomIds instanceof Set
    ? preferredRoomIds
    : new Set(Array.isArray(preferredRoomIds) ? preferredRoomIds : []);
  const selectedRoomId = String(options.selectedRoomId ?? "");
  const normalizedSelectedRoomId = normalizeRoomId(selectedRoomId);

  const list = Array.isArray(rooms)
    ? rooms.filter((room) => room && typeof room === "object")
    : [];
  const hasSelected = selectedRoomId
    && list.some((room) => normalizeRoomId(room.id) === normalizedSelectedRoomId);
  const shouldKeepSelected = hasSelected
    && (
      preferredSet.size === 0
      || preferredSet.has(normalizedSelectedRoomId)
    );
  const preferredRoomId = hasSelected
    && shouldKeepSelected
    ? ""
    : list.find((room) => preferredSet.has(normalizeRoomId(room.id)))?.id;
  const normalizedPreferredRoomId = String(preferredRoomId ?? "");
  const shouldAutoSelectSingleRoom = list.length === 1 && !hasSelected && !normalizedPreferredRoomId;

  container.innerHTML = "";

  list.forEach((room) => {
    const label = document.createElement("label");
    label.className = "filter-chip";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "hoteling-room";
    input.value = String(room.id ?? "");
    input.dataset.hotelingRoom = "";
    const normalizedRoomId = normalizeRoomId(room.id);
    input.checked = shouldKeepSelected
      ? normalizedSelectedRoomId === normalizedRoomId
      : normalizedPreferredRoomId
        ? normalizeRoomId(normalizedPreferredRoomId) === normalizedRoomId
        : shouldAutoSelectSingleRoom;

    const span = document.createElement("span");
    span.textContent = room.name || "-";

    label.appendChild(input);
    label.appendChild(span);
    syncFilterChip(input);
    container.appendChild(label);
  });
}

export function collectHotelingReservationFormData(root, modalState) {
  const roomInput = root.querySelector("[data-hoteling-room]:checked");
  const checkinTime =
    root.querySelector("[data-hoteling-checkin-time]")?.value || "10:00";
  const checkoutTime =
    root.querySelector("[data-hoteling-checkout-time]")?.value || "10:00";
  const memoInput = root.querySelector("[data-hoteling-memo]");
  const memoValue = memoInput instanceof HTMLTextAreaElement
    ? memoInput.value.trim()
    : "";

  const member = modalState?.selectedMember || null;
  const timeZone = getTimeZone();
  const checkinDate = getHotelingDateKey(modalState?.checkin, timeZone);
  const checkoutDate = getHotelingDateKey(modalState?.checkout, timeZone);

  return {
    room: roomInput?.value || "",
    status: STATUS.PLANNED,
    checkinDate,
    checkoutDate,
    checkinTime,
    checkoutTime,
    memberId: String(member?.id || ""),
    hasPickup: false,
    hasDropoff: false,
    memo: memoValue,
  };
}
