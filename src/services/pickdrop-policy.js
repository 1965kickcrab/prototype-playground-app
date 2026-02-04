import { normalizePickdropType } from "./ticket-service.js";

export const PICKDROP_COUNT_TYPES = Object.freeze(["oneway", "roundtrip"]);

export function normalizePickdropFlags(source = {}) {
  const pickup = Boolean(
    source?.pickup
    ?? source?.pickdrop?.pickup
    ?? false
  );
  const dropoff = Boolean(
    source?.dropoff
    ?? source?.pickdrop?.dropoff
    ?? false
  );
  return { pickup, dropoff };
}

export function applyPickdropFlags(target = {}, flags = {}) {
  const { pickup, dropoff } = normalizePickdropFlags(flags);
  return {
    ...target,
    pickup,
    dropoff,
  };
}

export function getPickdropCountType(source = {}) {
  const { pickup, dropoff } = normalizePickdropFlags(source);
  if (pickup && dropoff) {
    return "roundtrip";
  }
  if (pickup || dropoff) {
    return "oneway";
  }
  return "";
}

export function getPickdropCountByEntries(entries = []) {
  const counts = { oneway: 0, roundtrip: 0 };
  if (!Array.isArray(entries)) {
    return counts;
  }
  entries.forEach((entry) => {
    const type = getPickdropCountType(entry);
    if (!type) {
      return;
    }
    counts[type] += 1;
  });
  return counts;
}

export function getCountByTypeMapValue(map, type) {
  if (!map || typeof map !== "object" || !type) {
    return 0;
  }
  const value = Number(map[type]);
  return Number.isFinite(value) ? value : 0;
}

export function getPickdropReservableTotal(map) {
  return getCountByTypeMapValue(map, "oneway") + getCountByTypeMapValue(map, "roundtrip");
}

export function resolvePickdropTicketCountType(source = {}) {
  const type = normalizePickdropType(
    source?.pickdropType
    || source?.name
    || ""
  );
  if (type === "왕복") {
    return "roundtrip";
  }
  return "oneway";
}
