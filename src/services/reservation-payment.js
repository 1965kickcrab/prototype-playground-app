export const PAYMENT_METHODS = Object.freeze({
  TICKET: "ticket",
  CASH: "cash",
  CARD: "card",
  TRANSFER: "transfer",
});

function toInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvePaymentMethod(method) {
  const normalized = String(method || "").trim().toLowerCase();
  if (normalized === "ticket") {
    return PAYMENT_METHODS.TICKET;
  }
  if (normalized === "cash") {
    return PAYMENT_METHODS.CASH;
  }
  if (normalized === "card") {
    return PAYMENT_METHODS.CARD;
  }
  if (normalized === "transfer" || normalized === "bank") {
    return PAYMENT_METHODS.TRANSFER;
  }
  return PAYMENT_METHODS.CASH;
}

export function parsePaymentAmount(value) {
  const cleaned = String(value ?? "").replace(/[^0-9-]/g, "");
  return Math.max(toInteger(cleaned), 0);
}

export function normalizeReservationPayment(rawPayment) {
  const source = rawPayment && typeof rawPayment === "object" ? rawPayment : {};
  const method = resolvePaymentMethod(source.method);
  const amount = method === PAYMENT_METHODS.TICKET
    ? 0
    : parsePaymentAmount(source.amount);
  return {
    method,
    amount,
  };
}

function resolveEntryCanceled(entry) {
  const baseStatusKey = String(entry?.baseStatusKey || "").trim().toUpperCase();
  if (baseStatusKey === "CANCELED") {
    return true;
  }
  const status = String(entry?.status || entry?.statusText || "").trim();
  if (!status) {
    return false;
  }
  return status === "CANCELED" || status === "예약 취소";
}

export function shouldClearTicketPaymentOnCancellation(reservation) {
  const payment = reservation?.payment ? normalizeReservationPayment(reservation.payment) : null;
  if (payment?.method !== PAYMENT_METHODS.TICKET) {
    return false;
  }
  const dates = Array.isArray(reservation?.dates) ? reservation.dates : [];
  if (dates.length === 0) {
    return true;
  }
  return dates.every((entry) => resolveEntryCanceled(entry));
}
