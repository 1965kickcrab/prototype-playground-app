function toId(value) {
  const id = value === undefined || value === null ? "" : String(value);
  return id.trim();
}

function toType(value, fallback = "school") {
  const type = typeof value === "string" ? value.trim() : "";
  return type || fallback;
}

export function syncTicketsFromClasses(classes, tickets) {
  const classItems = Array.isArray(classes) ? classes : [];
  const classTypeSet = new Set(
    classItems.map((item) => toType(item?.type)).filter((type) => type)
  );
  const ticketMap = new Map();
  const ticketTypeMap = new Map();
  (tickets || []).forEach((ticket) => {
    const ticketId = toId(ticket?.id);
    if (ticketId) {
      const ticketType = toType(ticket?.type);
      ticketTypeMap.set(ticketId, ticketType);
      const shouldSync = classTypeSet.has(ticketType);
      const existingClassIds = Array.isArray(ticket?.classIds)
        ? ticket.classIds.map((classId) => toId(classId)).filter((classId) => classId)
        : [];
      ticketMap.set(ticketId, {
        shouldSync,
        classIds: shouldSync ? [] : existingClassIds,
      });
    }
  });

  classItems.forEach((classItem) => {
    const classId = toId(classItem?.id);
    if (!classId) {
      return;
    }
    const classType = toType(classItem?.type);
    const ticketIds = Array.isArray(classItem?.ticketIds)
      ? classItem.ticketIds
      : [];
    ticketIds.forEach((ticketIdValue) => {
      const ticketId = toId(ticketIdValue);
      if (!ticketId || !ticketMap.has(ticketId)) {
        return;
      }
      const ticketState = ticketMap.get(ticketId);
      if (!ticketState.shouldSync) {
        return;
      }
      const ticketType = ticketTypeMap.get(ticketId) || "school";
      if (ticketType !== classType) {
        return;
      }
      ticketState.classIds.push(classId);
    });
  });

  return (tickets || []).map((ticket) => {
    const ticketId = toId(ticket?.id);
    const ticketState = ticketId && ticketMap.has(ticketId) ? ticketMap.get(ticketId) : null;
    const classIds = ticketState ? ticketState.classIds : [];
    return {
      ...ticket,
      classIds,
    };
  });
}

export function syncClassesFromTickets(tickets, classes) {
  const ticketItems = Array.isArray(tickets) ? tickets : [];
  const classTypeMap = new Map();
  const classMap = new Map();
  (classes || []).forEach((classItem) => {
    const classId = toId(classItem?.id);
    if (classId) {
      classMap.set(classId, []);
      classTypeMap.set(classId, toType(classItem?.type));
    }
  });

  ticketItems.forEach((ticket) => {
    const ticketId = toId(ticket?.id);
    if (!ticketId) {
      return;
    }
    const ticketType = toType(ticket?.type);
    const classIds = Array.isArray(ticket?.classIds) ? ticket.classIds : [];
    classIds.forEach((classIdValue) => {
      const classId = toId(classIdValue);
      if (!classId || !classMap.has(classId)) {
        return;
      }
      const classType = classTypeMap.get(classId);
      if (classType !== ticketType) {
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
