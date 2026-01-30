export function notifyReservationUpdated(detail = null) {
  const event = new CustomEvent("reservation:updated", detail ? { detail } : undefined);
  document.dispatchEvent(event);
}
