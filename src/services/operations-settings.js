import { compareDateKeys, getDatePartsFromKey, getWeekdayIndex } from "../utils/date.js";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function normalizeOperationsSettings(settings) {
  const base = { ...(settings || {}) };
  const weekly = { ...(settings?.weekly || {}) };
  const tempDayoffs = Array.isArray(settings?.tempDayoffs)
    ? [...settings.tempDayoffs].sort()
    : [];
  const tempDayoffExceptions = Array.isArray(settings?.tempDayoffExceptions)
    ? [...settings.tempDayoffExceptions].sort()
    : [];
  return {
    ...base,
    weekly,
    publicHolidayOff: Boolean(settings?.publicHolidayOff),
    tempDayoffs,
    tempDayoffExceptions,
  };
}

export function getOperationsSettingsSignature(settings) {
  const normalized = normalizeOperationsSettings(settings);
  return JSON.stringify({
    weekly: normalized.weekly,
    publicHolidayOff: normalized.publicHolidayOff,
    tempDayoffs: normalized.tempDayoffs,
    tempDayoffExceptions: normalized.tempDayoffExceptions,
  });
}

export function setWeeklyAvailability(settings, weekdayKey, isOpen) {
  const normalized = normalizeOperationsSettings(settings);
  if (weekdayKey) {
    normalized.weekly[weekdayKey] = Boolean(isOpen);
  }
  return normalized;
}

export function setPublicHolidayOff(settings, isOff) {
  const normalized = normalizeOperationsSettings(settings);
  normalized.publicHolidayOff = Boolean(isOff);
  return normalized;
}

export function toggleDayoffDate(settings, dateKey, todayKey, timeZone) {
  const normalized = normalizeOperationsSettings(settings);
  const dayoffs = new Set(normalized.tempDayoffs);
  const exceptions = new Set(normalized.tempDayoffExceptions);
  const parts = getDatePartsFromKey(dateKey);
  if (!parts) {
    return normalized;
  }

  const weekdayIndex = getWeekdayIndex(
    parts.year,
    parts.month - 1,
    parts.day,
    timeZone
  );
  const weekdayKey = WEEKDAY_KEYS[weekdayIndex];
  const isWeeklyOff = weekdayKey
    ? normalized.weekly?.[weekdayKey] === false
    : false;
  const isFutureWeeklyOff = isWeeklyOff
    && compareDateKeys(dateKey, todayKey) > 0;

  if (dayoffs.has(dateKey)) {
    dayoffs.delete(dateKey);
  } else if (isFutureWeeklyOff && !dayoffs.has(dateKey)) {
    if (exceptions.has(dateKey)) {
      exceptions.delete(dateKey);
    } else {
      exceptions.add(dateKey);
    }
  } else {
    dayoffs.add(dateKey);
  }

  return {
    ...normalized,
    tempDayoffs: Array.from(dayoffs).sort(),
    tempDayoffExceptions: Array.from(exceptions).sort(),
  };
}


