import { readStorageArray, writeStorageValue } from "./storage-utils.js";

const STORAGE_KEY = "hotelingRoomList";

const DEFAULT_ROOMS = [
  {
    id: "1",
    name: "호텔링",
    capacity: null,
    description: null,
    ticketIds: null,
    type: "hoteling",
  },
];

function readStorage() {
  return readStorageArray(STORAGE_KEY);
}

function writeStorage(rooms) {
  writeStorageValue(STORAGE_KEY, rooms);
}

function normalizeRooms(rooms) {
  if (!Array.isArray(rooms)) {
    return { rooms: [], changed: false };
  }

  let changed = false;
  const validItems = rooms.filter((item) => item && typeof item === "object");
  if (validItems.length !== rooms.length) {
    changed = true;
  }
  const normalized = validItems.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    if (
      item.name === "???"
      || item.name === "?????"
      || item.name === "占쏙옹"
      || item.name === "��"
    ) {
      changed = true;
      return { ...item, name: "호텔링" };
    }
    return item;
  });

  return { rooms: normalized, changed };
}

function seedDefaults() {
  writeStorage(DEFAULT_ROOMS);
  return DEFAULT_ROOMS.slice();
}

export function initHotelRoomStorage() {
  const loadClasses = () => {
    const stored = readStorage();
    const { rooms, changed } = normalizeRooms(stored);
    if (changed) {
      writeStorage(rooms);
    }
    return rooms;
  };
  const saveClasses = (rooms) => writeStorage(rooms);
  const ensureDefaults = () => {
    const stored = loadClasses();
    return stored.length ? stored : seedDefaults();
  };

  return {
    loadClasses,
    saveClasses,
    ensureDefaults,
  };
}
