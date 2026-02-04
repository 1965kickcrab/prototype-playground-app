function normalizeUsage(usage) {
  const ticketId = String(usage?.ticketId ?? "");
  const sequence = Number(usage?.sequence);
  if (!ticketId || !Number.isFinite(sequence) || sequence <= 0) {
    return null;
  }
  return {
    ticketId,
    sequence,
  };
}

export function getEntryTicketUsages(entry = {}) {
  if (Array.isArray(entry?.ticketUsages) && entry.ticketUsages.length > 0) {
    return entry.ticketUsages
      .map((usage) => normalizeUsage(usage))
      .filter(Boolean);
  }
  const single = normalizeUsage(entry?.ticketUsage);
  return single ? [single] : [];
}

export function getPrimaryTicketUsage(entry = {}) {
  const usages = getEntryTicketUsages(entry);
  return usages[0] || null;
}

export function addTicketUsageCount(map, usage, count = 1) {
  if (!(map instanceof Map)) {
    return map;
  }
  const normalized = normalizeUsage(usage);
  const delta = Number(count) || 0;
  if (!normalized || delta <= 0) {
    return map;
  }
  const ticketId = normalized.ticketId;
  map.set(ticketId, (map.get(ticketId) || 0) + delta);
  return map;
}

export function addTicketUsagesCount(map, usages, count = 1) {
  if (!(map instanceof Map) || !Array.isArray(usages)) {
    return map;
  }
  usages.forEach((usage) => {
    addTicketUsageCount(map, usage, count);
  });
  return map;
}

export function buildTicketUsageCountMap(items = []) {
  const map = new Map();
  if (!Array.isArray(items)) {
    return map;
  }
  items.forEach((item) => {
    addTicketUsagesCount(map, getEntryTicketUsages(item), 1);
  });
  return map;
}

export function mergeTicketUsageCountMap(target, source) {
  if (!(target instanceof Map) || !(source instanceof Map)) {
    return target;
  }
  source.forEach((value, key) => {
    const delta = Number(value) || 0;
    if (delta <= 0) {
      return;
    }
    target.set(key, (target.get(key) || 0) + delta);
  });
  return target;
}

export function buildTicketUsageEntries(usageMap) {
  if (!(usageMap instanceof Map)) {
    return [];
  }
  return Array.from(usageMap.entries())
    .filter(([, count]) => Number(count) > 0)
    .map(([ticketId, count]) => ({
      ticketId: String(ticketId),
      count: Number(count),
    }))
    .filter((entry) => entry.ticketId && Number(entry.count) > 0);
}

export function buildTicketUsageMapFromEntries(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) {
    return map;
  }
  entries.forEach((entry) => {
    const ticketId = String(entry?.ticketId ?? "");
    const count = Number(entry?.count) || 0;
    if (!ticketId || count <= 0) {
      return;
    }
    map.set(ticketId, (map.get(ticketId) || 0) + count);
  });
  return map;
}

export function buildUsageList(selectionOrder, allocations) {
  const list = [];
  if (!Array.isArray(selectionOrder) || !(allocations instanceof Map)) {
    return list;
  }
  selectionOrder.forEach((ticketId) => {
    const raw = allocations.get(ticketId);
    const count = Number.isFinite(Number(raw))
      ? Number(raw)
      : Number(raw?.used) || 0;
    for (let i = 0; i < count; i += 1) {
      list.push(ticketId);
    }
  });
  return list;
}

export function buildDateTicketUsageMap(dateKeys, selectionOrder, allocations, optionMap) {
  const usageList = buildUsageList(selectionOrder, allocations);
  const usageMap = new Map();
  const perTicketIndex = new Map();
  const orderedDates = Array.isArray(dateKeys) ? dateKeys.filter(Boolean) : [];
  orderedDates.forEach((dateKey, index) => {
    const ticketId = usageList[index];
    if (!ticketId) {
      return;
    }
    const option = optionMap.get(ticketId);
    const usedBefore = Number(option?.usedCount) || 0;
    const nextIndex = (perTicketIndex.get(ticketId) || 0) + 1;
    perTicketIndex.set(ticketId, nextIndex);
    usageMap.set(dateKey, {
      ticketId,
      sequence: usedBefore + nextIndex,
    });
  });
  return usageMap;
}

export function buildDateTicketUsagesMap(dateKeys, usagePlan = [], optionMap = new Map()) {
  const usageMap = new Map();
  const perTicketIndex = new Map();
  const orderedDates = Array.isArray(dateKeys) ? dateKeys.filter(Boolean) : [];

  orderedDates.forEach((dateKey, index) => {
    const plannedIds = Array.isArray(usagePlan[index]) ? usagePlan[index] : [];
    if (plannedIds.length === 0) {
      return;
    }
    const usages = [];
    plannedIds.forEach((ticketId) => {
      if (!ticketId) {
        return;
      }
      const option = optionMap.get(ticketId);
      const usedBefore = Number(option?.usedCount) || 0;
      const nextIndex = (perTicketIndex.get(ticketId) || 0) + 1;
      perTicketIndex.set(ticketId, nextIndex);
      usages.push({
        ticketId,
        sequence: usedBefore + nextIndex,
      });
    });
    if (usages.length > 0) {
      usageMap.set(dateKey, usages);
    }
  });

  return usageMap;
}
