import { syncTicketsFromClasses } from "./class-ticket-sync.js";

export function getDefaultClassType(isHotelScope) {
  return isHotelScope ? "hoteling" : "kindergarten";
}

export function setupClassList(storage, isHotelScope) {
  const classes = storage.ensureDefaults();
  if (!isHotelScope) {
    return classes;
  }
  let changed = false;
  const cleaned = classes.map((item) => {
    const next = { ...item };
    if ("teacher" in next) {
      delete next.teacher;
      changed = true;
    }
    if ("days" in next) {
      delete next.days;
      changed = true;
    }
    if ("startTime" in next) {
      delete next.startTime;
      changed = true;
    }
    if ("endTime" in next) {
      delete next.endTime;
      changed = true;
    }
    if ("memberIds" in next) {
      delete next.memberIds;
      changed = true;
    }
    if ("publicHolidayOff" in next) {
      delete next.publicHolidayOff;
      changed = true;
    }
    if (!Array.isArray(next.ticketIds)) {
      next.ticketIds = [];
      changed = true;
    }
    if (!next.type) {
      next.type = "hoteling";
      changed = true;
    }
    return next;
  });
  if (changed) {
    storage.saveClasses(cleaned);
  }
  return cleaned;
}

export function getNextClassId(classes) {
  const maxId = classes.reduce((maxValue, classItem) => {
    const numericId = Number.parseInt(classItem.id, 10);
    if (Number.isNaN(numericId)) {
      return maxValue;
    }
    return Math.max(maxValue, numericId);
  }, 0);

  return String(maxId + 1);
}

export function syncTicketsWithClasses(ticketStorage, classes) {
  if (!ticketStorage) {
    return;
  }
  const tickets = ticketStorage.ensureDefaults();
  const syncedTickets = syncTicketsFromClasses(classes, tickets);
  ticketStorage.saveTickets(syncedTickets);
}

export function updateReservationClassName(storage, previousName, nextName) {
  if (!storage || !previousName || !nextName || previousName === nextName) {
    return;
  }

  const reservations = storage.loadReservations();
  const nextReservations = reservations.map((item) => {
    if (item.class !== previousName && item.service !== previousName) {
      if (!Array.isArray(item.dates) || item.dates.length === 0) {
        return item;
      }
      const nextDates = item.dates.map((entry) => {
        if (entry.class !== previousName && entry.service !== previousName) {
          return entry;
        }
        return {
          ...entry,
          class: nextName,
          service: nextName,
        };
      });
      return { ...item, dates: nextDates };
    }

    return {
      ...item,
      class: nextName,
      service: nextName,
      dates: Array.isArray(item.dates)
        ? item.dates.map((entry) => ({
            ...entry,
            class: entry.class === previousName ? nextName : entry.class,
            service: entry.service === previousName ? nextName : entry.service,
          }))
        : item.dates,
    };
  });

  const changed = nextReservations.some(
    (item, index) =>
      item.class !== reservations[index].class ||
      item.service !== reservations[index].service ||
      JSON.stringify(item.dates || []) !== JSON.stringify(reservations[index].dates || [])
  );

  if (changed) {
    storage.saveReservations(nextReservations);
  }
}

export function clearReservationClassName(storage, targetName) {
  if (!storage || !targetName) {
    return;
  }

  const reservations = storage.loadReservations();
  const nextReservations = reservations.map((item) => {
    if (item.class !== targetName && item.service !== targetName) {
      if (!Array.isArray(item.dates) || item.dates.length === 0) {
        return item;
      }
      const nextDates = item.dates.map((entry) => {
        if (entry.class !== targetName && entry.service !== targetName) {
          return entry;
        }
        return {
          ...entry,
          class: "",
          service: "",
        };
      });
      return { ...item, dates: nextDates };
    }
    return {
      ...item,
      class: "",
      service: "",
      dates: Array.isArray(item.dates)
        ? item.dates.map((entry) => ({
          ...entry,
            class: entry.class === targetName ? "" : entry.class,
            service: entry.service === targetName ? "" : entry.service,
          }))
        : item.dates,
    };
  });

  const changed = nextReservations.some(
    (item, index) =>
      item.class !== reservations[index].class ||
      item.service !== reservations[index].service ||
      JSON.stringify(item.dates || []) !== JSON.stringify(reservations[index].dates || [])
  );

  if (changed) {
    storage.saveReservations(nextReservations);
  }
}

export function addClass({
  storage,
  classes,
  classData,
  ticketStorage,
}) {
  const nextId = getNextClassId(classes);
  const nextClasses = [
    ...classes,
    {
      id: nextId,
      ...classData,
    },
  ];
  storage.saveClasses(nextClasses);
  syncTicketsWithClasses(ticketStorage, nextClasses);
  return nextClasses;
}

export function updateClass({
  storage,
  classes,
  classId,
  classData,
  ticketStorage,
  reservationStorage,
}) {
  const target = classes.find((item) => item.id === classId);
  if (!target) {
    return classes;
  }

  const previousName = target.name;
  const updated = { ...classData, id: classId };
  const nextClasses = classes.map((item) => (item.id === classId ? updated : item));

  storage.saveClasses(nextClasses);
  syncTicketsWithClasses(ticketStorage, nextClasses);
  updateReservationClassName(reservationStorage, previousName, updated.name);

  return nextClasses;
}

export function deleteClass({
  storage,
  classes,
  classId,
  ticketStorage,
  reservationStorage,
}) {
  const deleted = classes.find((item) => item.id === classId);
  const nextClasses = classes.filter((item) => item.id !== classId);

  storage.saveClasses(nextClasses);
  syncTicketsWithClasses(ticketStorage, nextClasses);
  if (deleted?.name) {
    clearReservationClassName(reservationStorage, deleted.name);
  }

  return nextClasses;
}
