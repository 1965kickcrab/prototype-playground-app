export function readStorageValue(storageKey, options = {}) {
  const { storage = window.localStorage, fallback = null, onError } = options;
  if (!storageKey) {
    return fallback;
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    if (typeof onError === "function") {
      onError(error);
    }
    return fallback;
  }
}

export function readStorageArray(storageKey, options = {}) {
  const { fallback = [] } = options;
  const value = readStorageValue(storageKey, { ...options, fallback });
  return Array.isArray(value) ? value : fallback;
}

export function writeStorageValue(storageKey, value, options = {}) {
  const { storage = window.localStorage, onError } = options;
  if (!storageKey) {
    return;
  }
  try {
    storage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    if (typeof onError === "function") {
      onError(error);
    }
  }
}
