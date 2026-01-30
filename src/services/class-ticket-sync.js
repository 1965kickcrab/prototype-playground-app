function toId(value) {
  const id = value === undefined || value === null ? "" : String(value);
  return id.trim();
}

export function syncTicketsFromClasses(classes, tickets) {
  const ticketMap = new Map();
  (tickets || []).forEach((ticket) => {
    const ticketId = toId(ticket?.id);
    if (ticketId) {
      ticketMap.set(ticketId, []);
    }
  });

  (classes || []).forEach((classItem) => {
    const classId = toId(classItem?.id);
    if (!classId) {
      return;
    }
    const ticketIds = Array.isArray(classItem?.ticketIds)
      ? classItem.ticketIds
      : [];
    ticketIds.forEach((ticketIdValue) => {
      const ticketId = toId(ticketIdValue);
      if (!ticketId || !ticketMap.has(ticketId)) {
        return;
      }
      ticketMap.get(ticketId).push(classId);
    });
  });

  return (tickets || []).map((ticket) => {
    const ticketId = toId(ticket?.id);
    const classIds = ticketId && ticketMap.has(ticketId) ? ticketMap.get(ticketId) : [];
    return {
      ...ticket,
      classIds,
    };
  });
}

export function syncClassesFromTickets(tickets, classes) {
  const classMap = new Map();
  (classes || []).forEach((classItem) => {
    const classId = toId(classItem?.id);
    if (classId) {
      classMap.set(classId, []);
    }
  });

  (tickets || []).forEach((ticket) => {
    const ticketId = toId(ticket?.id);
    if (!ticketId) {
      return;
    }
    const classIds = Array.isArray(ticket?.classIds) ? ticket.classIds : [];
    classIds.forEach((classIdValue) => {
      const classId = toId(classIdValue);
      if (!classId || !classMap.has(classId)) {
        return;
      }
      classMap.get(classId).push(ticketId);
    });
  });

  return (classes || []).map((classItem) => {
    const classId = toId(classItem?.id);
    const ticketIds = classId && classMap.has(classId) ? classMap.get(classId) : [];
    return {
      ...classItem,
      ticketIds,
    };
  });
}
