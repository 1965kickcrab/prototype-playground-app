import { readStorageArray, writeStorageValue } from "./storage-utils.js";

const STORAGE_KEY = "ticketList";

function readStorage() {
  return readStorageArray(STORAGE_KEY);
}

function writeStorage(tickets) {
  writeStorageValue(STORAGE_KEY, tickets);
}

export function initTicketStorage() {
  const loadTickets = () => readStorage();
  const saveTickets = (tickets) => writeStorage(tickets);
  const ensureDefaults = () => readStorage();

  return {
    loadTickets,
    saveTickets,
    ensureDefaults,
  };
}
