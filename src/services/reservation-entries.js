import { initReservationStorage } from "../storage/reservation-storage.js";
import { getBillingAllocationForDate } from "./reservation-billing.js";

const { STATUS } = initReservationStorage();

export function getReservationDateEntries(reservation) {
  if (!reservation) {
    return [];
  }
  if (Array.isArray(reservation.dates) && reservation.dates.length > 0) {
    return reservation.dates.map((entry) => ({
      ...entry,
      fee: getBillingAllocationForDate(reservation?.billing, entry?.date),
    }));
  }
  if (reservation.date) {
    return [
      {
        date: reservation.date,
        class: reservation.class || reservation.service || "",
        service: reservation.service || reservation.class || "",
        baseStatusKey: reservation.baseStatusKey || "PLANNED",
        statusText:
          STATUS[reservation.baseStatusKey || "PLANNED"]
          || reservation.statusText
          || "",
        checkinTime: reservation.checkinTime || "",
        checkoutTime: reservation.checkoutTime || "",
        fee: getBillingAllocationForDate(reservation?.billing, reservation.date),
        ticketUsages: Array.isArray(reservation.ticketUsages)
          ? reservation.ticketUsages
          : reservation.ticketUsage
            ? [reservation.ticketUsage]
            : [],
        pickup: Boolean(reservation.pickup ?? reservation.hasPickup),
        dropoff: Boolean(reservation.dropoff ?? reservation.hasDropoff),
      },
    ];
  }
  return [];
}

function resolveCheckinTime(entry, reservation) {
  if (entry?.checkinTime != null) {
    return entry.checkinTime;
  }
  if (entry?.kind === "checkin" && entry?.time != null) {
    return entry.time;
  }
  return reservation?.checkinTime ?? "";
}

function resolveCheckoutTime(entry, reservation) {
  if (entry?.checkoutTime != null) {
    return entry.checkoutTime;
  }
  if (entry?.kind === "checkout" && entry?.time != null) {
    return entry.time;
  }
  return reservation?.checkoutTime ?? "";
}

export function getReservationEntries(reservations) {
  const list = Array.isArray(reservations) ? reservations : [];
  return list.flatMap((reservation) =>
    getReservationDateEntries(reservation).map((entry) => {
      const baseStatusKey = entry.baseStatusKey ?? reservation.baseStatusKey ?? "PLANNED";
      return {
        reservation,
        entry,
        date: entry.date || "",
        className:
          entry.class ?? reservation.class ?? reservation.service ?? "",
        serviceName:
          entry.service ?? reservation.service ?? reservation.class ?? "",
        baseStatusKey,
        statusText: STATUS[baseStatusKey] || entry.statusText || reservation.statusText || "",
        checkinTime: resolveCheckinTime(entry, reservation),
        checkoutTime: resolveCheckoutTime(entry, reservation),
        fee: getBillingAllocationForDate(reservation?.billing, entry?.date),
        ticketUsages: Array.isArray(entry.ticketUsages)
          ? entry.ticketUsages
          : entry.ticketUsage
            ? [entry.ticketUsage]
            : reservation.ticketUsage
              ? [reservation.ticketUsage]
              : [],
        ticketUsage: Array.isArray(entry.ticketUsages) && entry.ticketUsages.length > 0
          ? entry.ticketUsages[0]
          : entry.ticketUsage || reservation.ticketUsage || null,
        pickup: Boolean(
          entry.pickup
          ?? entry?.pickdrop?.pickup
          ?? reservation.pickup
          ?? reservation.hasPickup
        ),
        dropoff: Boolean(
          entry.dropoff
          ?? entry?.pickdrop?.dropoff
          ?? reservation.dropoff
          ?? reservation.hasDropoff
        ),
        pickdrop: {
          pickup: Boolean(
            entry.pickup
            ?? entry?.pickdrop?.pickup
            ?? reservation.pickup
            ?? reservation.hasPickup
          ),
          dropoff: Boolean(
            entry.dropoff
            ?? entry?.pickdrop?.dropoff
            ?? reservation.dropoff
            ?? reservation.hasDropoff
          ),
        },
      };
    })
  );
}

export function updateReservationDateEntry(reservation, dateKey, updater) {
  if (!reservation || !dateKey || typeof updater !== "function") {
    return reservation;
  }
  const rawEntries = Array.isArray(reservation.dates)
    ? reservation.dates
    : getReservationDateEntries(reservation);
  const entries = rawEntries.map((entry) => ({ ...entry }));
  const index = entries.findIndex((entry) => entry.date === dateKey);
  if (index === -1) {
    return reservation;
  }
  const updated = updater(entries[index]);
  entries[index] = {
    ...entries[index],
    ...(updated || {}),
  };
  return {
    ...reservation,
    dates: entries,
  };
}

export function removeReservationDateEntry(reservation, dateKey) {
  if (!reservation || !dateKey) {
    return reservation;
  }
  const entries = Array.isArray(reservation.dates)
    ? reservation.dates
    : getReservationDateEntries(reservation);
  const nextEntries = entries.filter((entry) => entry.date !== dateKey);
  if (nextEntries.length === entries.length) {
    return reservation;
  }
  return {
    ...reservation,
    dates: nextEntries,
  };
}
