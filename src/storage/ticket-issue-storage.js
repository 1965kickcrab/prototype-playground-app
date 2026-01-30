import { readStorageArray, writeStorageValue } from "./storage-utils.js";

const STORAGE_KEY = "ticketIssueRecords";

function readStorage() {
  return readStorageArray(STORAGE_KEY);
}

function writeStorage(records) {
  writeStorageValue(STORAGE_KEY, records);
}

export function initTicketIssueStorage() {
  const loadRecords = () => readStorage();
  const saveRecords = (records) => writeStorage(records);
  const appendRecords = (nextRecords) => {
    const current = readStorage();
    writeStorage(current.concat(nextRecords));
  };

  return {
    loadRecords,
    saveRecords,
    appendRecords,
  };
}
