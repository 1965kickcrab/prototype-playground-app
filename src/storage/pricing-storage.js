import { readStorageArray, writeStorageValue } from "./storage-utils.js";

const STORAGE_KEY = "pricingList";

function readStorage() {
  return readStorageArray(STORAGE_KEY);
}

function writeStorage(items) {
  writeStorageValue(STORAGE_KEY, items);
}

export function initPricingStorage() {
  const loadPricingItems = () => readStorage();
  const savePricingItems = (items) => writeStorage(items);
  const addPricingItems = (items) => {
    const existing = readStorage();
    const next = [...existing, ...items];
    writeStorage(next);
    return next;
  };

  return {
    loadPricingItems,
    savePricingItems,
    addPricingItems,
  };
}
