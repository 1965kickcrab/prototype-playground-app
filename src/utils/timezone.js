export const DEFAULT_TIMEZONE = "Asia/Seoul";

export function getTimeZone() {
  const stored = window.localStorage?.getItem("daycare:timezone");
  return stored || DEFAULT_TIMEZONE;
}
