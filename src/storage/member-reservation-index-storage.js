import { readStorageValue, writeStorageValue } from "./storage-utils.js";

const STORAGE_KEY = "memberReservationIndex";
const INDEX_VERSION = 1;

function normalizeReservationId(value) {
  const id = String(value || "").trim();
  return id;
}

function normalizeMemberId(value) {
  const id = String(value || "").trim();
  return id;
}

function normalizeIndex(source) {
  const value = source && typeof source === "object" ? source : {};
  const byMemberId = {};
  const rawMap = value.byMemberId && typeof value.byMemberId === "object"
    ? value.byMemberId
    : {};

  Object.entries(rawMap).forEach(([memberId, reservationIds]) => {
    const normalizedMemberId = normalizeMemberId(memberId);
    if (!normalizedMemberId) {
      return;
    }
    const ids = Array.isArray(reservationIds)
      ? reservationIds
          .map((reservationId) => normalizeReservationId(reservationId))
          .filter((reservationId) => reservationId.length > 0)
      : [];
    if (ids.length === 0) {
      return;
    }
    byMemberId[normalizedMemberId] = Array.from(new Set(ids));
  });

  return {
    version: INDEX_VERSION,
    byMemberId,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

export function rebuildMemberReservationIndex(reservations) {
  const byMemberId = {};
  const list = Array.isArray(reservations) ? reservations : [];

  list.forEach((reservation) => {
    const reservationId = normalizeReservationId(reservation?.id);
    const memberId = normalizeMemberId(reservation?.memberId);
    if (!reservationId || !memberId) {
      return;
    }
    if (!byMemberId[memberId]) {
      byMemberId[memberId] = [];
    }
    byMemberId[memberId].push(reservationId);
  });

  Object.keys(byMemberId).forEach((memberId) => {
    byMemberId[memberId] = Array.from(new Set(byMemberId[memberId]));
  });

  return {
    version: INDEX_VERSION,
    byMemberId,
    updatedAt: new Date().toISOString(),
  };
}

export function loadMemberReservationIndex() {
  const raw = readStorageValue(STORAGE_KEY, { fallback: null });
  return normalizeIndex(raw);
}

export function saveMemberReservationIndex(index) {
  const normalized = normalizeIndex(index);
  const next = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  writeStorageValue(STORAGE_KEY, next);
  return next;
}

export function getReservationIdsByMemberId(memberId) {
  const index = loadMemberReservationIndex();
  const key = normalizeMemberId(memberId);
  if (!key) {
    return [];
  }
  const ids = index.byMemberId?.[key];
  return Array.isArray(ids) ? ids.slice() : [];
}

