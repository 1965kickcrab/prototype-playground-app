const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getFormatter(timeZone, options) {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options });
}

export function getZonedParts(date, timeZone) {
  const formatter = getFormatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = parts.reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

export function getDateKeyFromParts({ year, month, day }) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function getDatePartsFromKey(key) {
  const parts = String(key || "").split("-");
  if (parts.length !== 3) {
    return null;
  }
  const year = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const day = Number.parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  return { year, month, day };
}

export function compareDateKeys(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function sortDateKeys(keys) {
  if (!Array.isArray(keys)) {
    return [];
  }
  return keys.filter(Boolean).sort(compareDateKeys);
}

export function getZonedTodayParts(timeZone) {
  return getZonedParts(new Date(), timeZone);
}

export function getMonthLabel(year, month) {
  return `${year}년 ${month + 1}월`;
}

export function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function getWeekdayIndex(year, month, day, timeZone) {
  const date = new Date(Date.UTC(year, month, day, 12));
  const weekday = getFormatter(timeZone, { weekday: "short" }).format(date);
  return WEEKDAY_KEYS.indexOf(weekday);
}

export function buildMonthCells(year, month, timeZone) {
  const firstWeekday = getWeekdayIndex(year, month, 1, timeZone);
  const daysInMonth = getDaysInMonth(year, month);
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const prevDays = getDaysInMonth(prevYear, prevMonth);
  const cells = [];

  for (let i = firstWeekday - 1; i >= 0; i -= 1) {
    const day = prevDays - i;
    cells.push({
      year: prevYear,
      month: prevMonth,
      day,
      key: getDateKeyFromParts({ year: prevYear, month: prevMonth + 1, day }),
      muted: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      year,
      month,
      day,
      key: getDateKeyFromParts({ year, month: month + 1, day }),
      muted: false,
    });
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= trailing; day += 1) {
    cells.push({
      year: nextYear,
      month: nextMonth,
      day,
      key: getDateKeyFromParts({ year: nextYear, month: nextMonth + 1, day }),
      muted: true,
    });
  }

  return cells;
}
