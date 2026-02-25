function toTimeString(hours, minutes) {
  const hh = String(Math.max(0, Math.min(23, hours))).padStart(2, "0");
  const mm = String(Math.max(0, Math.min(59, minutes))).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function parseTimeToMinutes(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const [hourText, minuteText] = raw.split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

export function getDaycareDurationMinutes(checkinTime, checkoutTime) {
  const start = parseTimeToMinutes(checkinTime);
  const end = parseTimeToMinutes(checkoutTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  if (end <= start) {
    return null;
  }
  return end - start;
}

export function calculateDaycareBillingUnits({
  durationMinutes,
  deductionValue,
  deductionUnit,
}) {
  const safeDuration = Number(durationMinutes);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) {
    return null;
  }
  const normalizedUnit = String(deductionUnit || "").trim();
  const parsedDeductionValue = Number.parseFloat(String(deductionValue ?? "").trim());
  const hoursPerUnit = normalizedUnit === "시간" && Number.isFinite(parsedDeductionValue) && parsedDeductionValue > 0
    ? parsedDeductionValue
    : 1;
  const unitMinutes = hoursPerUnit * 60;
  if (!Number.isFinite(unitMinutes) || unitMinutes <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(safeDuration / unitMinutes));
}

function getZonedHourMinute(nowDate, timeZone) {
  if (!(nowDate instanceof Date) || Number.isNaN(nowDate.getTime())) {
    return { hour: 0, minute: 0 };
  }
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(nowDate);
    const map = parts.reduce((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
    const hour = Number.parseInt(map.hour, 10);
    const minute = Number.parseInt(map.minute, 10);
    return {
      hour: Number.isFinite(hour) ? hour : 0,
      minute: Number.isFinite(minute) ? minute : 0,
    };
  } catch (error) {
    return {
      hour: nowDate.getHours(),
      minute: nowDate.getMinutes(),
    };
  }
}

export function getDefaultDaycareTimes(nowDate = new Date(), timeZone) {
  const { hour, minute } = getZonedHourMinute(nowDate, timeZone);
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + 60;
  const endClamped = Math.min(endMinutes, 23 * 60 + 59);
  const endHour = Math.floor(endClamped / 60);
  const endMinute = endClamped % 60;

  return {
    checkinTime: toTimeString(hour, minute),
    checkoutTime: toTimeString(endHour, endMinute),
  };
}
