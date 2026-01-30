import { readStorageArray, writeStorageValue } from "./storage-utils.js";

const STORAGE_KEY = "daycareClassList";

const DEFAULT_CLASSES = [
  {
    id: "1",
    name: "유치원",
    teacher: null,
    capacity: null,
    days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    startTime: null,
    endTime: null,
    description: null,
    memberIds: null,
    ticketIds: null,
    type: null,
    publicHolidayOff: null,
  },
];

function writeStorage(classes) {
  writeStorageValue(STORAGE_KEY, classes);
}

function normalizeClasses(classes) {
  if (!Array.isArray(classes)) {
    return { classes: [], changed: false };
  }

  let changed = false;
  const validItems = classes.filter((item) => item && typeof item === "object");
  if (validItems.length !== classes.length) {
    changed = true;
  }
  const normalized = validItems.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    if (
      item.name === "???"
      || item.name === "?????"
      || item.name === "???????"
      || item.name === "占쏙옹치占쏙옹"
      || item.name === "��고��"
    ) {
      changed = true;
      return { ...item, name: "유치원" };
    }
    return item;
  });

  return { classes: normalized, changed };
}

function readStorage() {
  const parsed = readStorageArray(STORAGE_KEY);
  const { classes, changed } = normalizeClasses(parsed);
  if (changed) {
    writeStorage(classes);
  }
  return classes;
}

function seedDefaults() {
  writeStorage(DEFAULT_CLASSES);
  return DEFAULT_CLASSES.slice();
}

export function initClassStorage() {
  const loadClasses = () => readStorage();
  const saveClasses = (classes) => writeStorage(classes);
  const ensureDefaults = () => {
    const stored = readStorage();
    return stored.length ? stored : seedDefaults();
  };

  return {
    loadClasses,
    saveClasses,
    ensureDefaults,
  };
}
