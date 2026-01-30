export function getReservationDateEntries(reservation) {
  if (!reservation) {
    return [];
  }
  if (Array.isArray(reservation.dates) && reservation.dates.length > 0) {
    return reservation.dates;
  }
  if (reservation.date) {
    return [
      {
        date: reservation.date,
        class: reservation.class || reservation.service || "",
        service: reservation.service || reservation.class || "",
        baseStatusKey: reservation.baseStatusKey || "PLANNED",
        statusText: reservation.statusText || "",
        checkinTime: reservation.checkinTime || "",
        checkoutTime: reservation.checkoutTime || "",
        daycareFee: Number(reservation.daycareFee) || 0,
        ticketUsage: reservation.ticketUsage || null,
        pickdrop: {
          pickup: Boolean(reservation.hasPickup),
          dropoff: Boolean(reservation.hasDropoff),
        },
      },
    ];
  }
  return [];
}

export function getReservationEntries(reservations) {
  const list = Array.isArray(reservations) ? reservations : [];
  return list.flatMap((reservation) =>
    getReservationDateEntries(reservation).map((entry) => ({
      reservation,
      entry,
      date: entry.date || "",
      className:
        entry.class ?? reservation.class ?? reservation.service ?? "",
      serviceName:
        entry.service ?? reservation.service ?? reservation.class ?? "",
      baseStatusKey: entry.baseStatusKey ?? reservation.baseStatusKey ?? "PLANNED",
      statusText: entry.statusText ?? reservation.statusText ?? "",
      checkinTime: entry.checkinTime ?? reservation.checkinTime ?? "",
      checkoutTime: entry.checkoutTime ?? reservation.checkoutTime ?? "",
      daycareFee: Number(entry.daycareFee ?? reservation.daycareFee) || 0,
      ticketUsage: entry.ticketUsage || reservation.ticketUsage || null,
      pickdrop: entry.pickdrop || {
        pickup: Boolean(reservation.hasPickup),
        dropoff: Boolean(reservation.hasDropoff),
      },
    }))
  );
}

export function updateReservationDateEntry(reservation, dateKey, updater) {
  if (!reservation || !dateKey || typeof updater !== "function") {
    return reservation;
  }
  const entries = getReservationDateEntries(reservation).map((entry) => ({ ...entry }));
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
  const entries = getReservationDateEntries(reservation);
  const nextEntries = entries.filter((entry) => entry.date !== dateKey);
  if (nextEntries.length === entries.length) {
    return reservation;
  }
  return {
    ...reservation,
    dates: nextEntries,
  };
}
