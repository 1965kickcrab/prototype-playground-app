import {
  buildMonthCells,
  compareDateKeys,
  getWeekdayIndex,
} from "../utils/date.js";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function getDayLabels() {
  return DAY_LABELS.slice();
}

export function buildDayoffCalendarModel({
  viewYear,
  viewMonth,
  todayKey,
  settings,
  timeZone,
}) {
  const dayoffSet = new Set(settings?.tempDayoffs || []);
  const exceptionSet = new Set(settings?.tempDayoffExceptions || []);
  const weekly = settings?.weekly || {};

  const cells = buildMonthCells(viewYear, viewMonth, timeZone).map((cell) => {
    const isPast = compareDateKeys(cell.key, todayKey) < 0;
    const isDayoff = dayoffSet.has(cell.key);
    const weekdayIndex = getWeekdayIndex(
      cell.year,
      cell.month,
      cell.day,
      timeZone
    );
    const weekdayKey = WEEKDAY_KEYS[weekdayIndex];
    const isWeeklyOff = weekdayKey ? weekly?.[weekdayKey] === false : false;
    const isFutureWeeklyOff = isWeeklyOff
      && compareDateKeys(cell.key, todayKey) > 0
      && !exceptionSet.has(cell.key);
    const isOff = isDayoff || isFutureWeeklyOff;

    return {
      key: cell.key,
      day: cell.day,
      muted: cell.muted,
      isPast,
      isOff,
    };
  });

  return {
    dayLabels: DAY_LABELS,
    cells,
  };
}





