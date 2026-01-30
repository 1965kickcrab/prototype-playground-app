import { getWeekdayIndex } from "./date.js";
import { WEEKDAY_KEYS } from "./weekday.js";

function parseDateKey(dateKey) {
  const parts = String(dateKey || "").split("-");
  if (parts.length !== 3) {
    return null;
  }
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10) - 1;
  const day = Number.parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  return { year, month, day };
}

export function isDayoffDate(dateKey, settings, timeZone) {
  if (!dateKey || !settings) {
    return false;
  }
  const tempDayoffs = new Set(settings.tempDayoffs || []);
  if (tempDayoffs.has(dateKey)) {
    return true;
  }
  const parts = parseDateKey(dateKey);
  if (!parts) {
    return false;
  }
  const weekdayIndex = getWeekdayIndex(
    parts.year,
    parts.month,
    parts.day,
    timeZone
  );
  const weekdayKey = WEEKDAY_KEYS[weekdayIndex];
  if (!weekdayKey) {
    return false;
  }
  const isWeeklyOff = settings.weekly?.[weekdayKey] === false;
  if (!isWeeklyOff) {
    return false;
  }
  const exceptions = new Set(settings.tempDayoffExceptions || []);
  return !exceptions.has(dateKey);
}
