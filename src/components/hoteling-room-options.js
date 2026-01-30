import { syncFilterChip } from "../utils/dom.js";

export function renderHotelingRoomOptions(root, rooms, options = {}) {
  const container = root?.querySelector?.("[data-hoteling-room-options]");
  if (!container) {
    return;
  }

  const availableRoomIds = options.availableRoomIds;
  const availableSet = availableRoomIds instanceof Set
    ? availableRoomIds
    : new Set(Array.isArray(availableRoomIds) ? availableRoomIds : []);
  const shouldFilter = availableRoomIds !== undefined && availableRoomIds !== null;
  const selectedRoomId = String(options.selectedRoomId ?? "");

  const list = Array.isArray(rooms)
    ? rooms.filter((room) => room && typeof room === "object")
    : [];
  const filtered = shouldFilter
    ? list.filter((room) => availableSet.has(String(room.id)))
    : list;
  const hasSelected = selectedRoomId
    && filtered.some((room) => String(room.id ?? "") === selectedRoomId);
  const shouldAutoSelect = filtered.length === 1 && !hasSelected;

  container.innerHTML = "";

  filtered.forEach((room, index) => {
    const label = document.createElement("label");
    label.className = "filter-chip";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "hoteling-room";
    input.value = String(room.id ?? "");
    input.dataset.hotelingRoom = "";
    input.checked = hasSelected
      ? selectedRoomId === String(room.id ?? "")
      : shouldAutoSelect;
    syncFilterChip(input);

    const span = document.createElement("span");
    span.textContent = room.name || "-";

    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  });

}

