const STORAGE_PREFIX = "reservationSearchDraft:";

function getStorage() {
  try {
    return window.sessionStorage;
  } catch (error) {
    return null;
  }
}

function getStorageKey(key) {
  return `${STORAGE_PREFIX}${String(key || "").trim()}`;
}

export function saveReservationSearchDraft(key, draft) {
  const storage = getStorage();
  const storageKey = getStorageKey(key);
  if (!storage || !storageKey || !draft || typeof draft !== "object") {
    return false;
  }
  try {
    storage.setItem(storageKey, JSON.stringify(draft));
    return true;
  } catch (error) {
    return false;
  }
}

export function loadReservationSearchDraft(key) {
  const storage = getStorage();
  const storageKey = getStorageKey(key);
  if (!storage || !storageKey) {
    return null;
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function clearReservationSearchDraft(key) {
  const storage = getStorage();
  const storageKey = getStorageKey(key);
  if (!storage || !storageKey) {
    return false;
  }
  try {
    storage.removeItem(storageKey);
    return true;
  } catch (error) {
    return false;
  }
}
