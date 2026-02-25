export const PAYMENT_FILTER_STATUS = Object.freeze({
  PAID: "paid",
  UNPAID: "unpaid",
});

export function getReservationPaymentStatus(reservation) {
  const method = String(reservation?.payment?.method || "").trim().toLowerCase();
  if (method === "ticket") {
    return PAYMENT_FILTER_STATUS.PAID;
  }

  const balance = Number(reservation?.billing?.totals?.balance);
  if (Number.isFinite(balance) && balance <= 0) {
    return PAYMENT_FILTER_STATUS.PAID;
  }

  return PAYMENT_FILTER_STATUS.UNPAID;
}

export function matchesPaymentFilter(reservation, selectedStatuses) {
  const status = getReservationPaymentStatus(reservation);

  if (selectedStatuses instanceof Set) {
    if (selectedStatuses.size === 0) {
      return true;
    }
    return selectedStatuses.has(status);
  }

  if (selectedStatuses && typeof selectedStatuses === "object") {
    const keys = Object.keys(selectedStatuses);
    if (keys.length === 0) {
      return true;
    }
    const hasActive = keys.some((key) => selectedStatuses[key] === true);
    if (!hasActive) {
      return true;
    }
    return selectedStatuses[status] === true;
  }

  return true;
}
