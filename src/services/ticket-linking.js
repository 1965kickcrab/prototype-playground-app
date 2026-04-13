function toTicketId(value) {
  return String(value ?? "").trim();
}

function getAccessor(accessor, fallback) {
  return typeof accessor === "function" ? accessor : fallback;
}

export function buildTicketOptionMap(ticketOptions) {
  const optionMap = new Map();
  (Array.isArray(ticketOptions) ? ticketOptions : []).forEach((option) => {
    const ticketId = toTicketId(option?.ticketId);
    const optionId = toTicketId(option?.id);
    if (!ticketId || !optionId) {
      return;
    }
    if (!optionMap.has(ticketId)) {
      optionMap.set(ticketId, []);
    }
    optionMap.get(ticketId).push(optionId);
  });
  return optionMap;
}

export function getDefaultLinkedTicketSelection(items, ticketOptions, getTicketIds) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0 || !Array.isArray(ticketOptions) || ticketOptions.length === 0) {
    return [];
  }

  const optionMap = buildTicketOptionMap(ticketOptions);
  const readTicketIds = getAccessor(
    getTicketIds,
    (item) => (Array.isArray(item?.ticketIds) ? item.ticketIds : [])
  );

  for (const item of list) {
    const defaults = [];
    const seen = new Set();
    const linkedTicketIds = readTicketIds(item);
    const ticketIds = Array.isArray(linkedTicketIds) ? linkedTicketIds : [];
    ticketIds.forEach((ticketIdValue) => {
      const optionIds = optionMap.get(toTicketId(ticketIdValue));
      if (!Array.isArray(optionIds) || optionIds.length === 0) {
        return;
      }
      optionIds.forEach((optionId) => {
        if (!optionId || seen.has(optionId)) {
          return;
        }
        seen.add(optionId);
        defaults.push(optionId);
      });
    });
    if (defaults.length > 0) {
      return defaults;
    }
  }

  return [];
}

export function getLinkedTargetKeysBySelection(
  items,
  ticketOptions,
  selectionOrder,
  options = {}
) {
  const list = Array.isArray(items) ? items : [];
  const selections = Array.isArray(selectionOrder) ? selectionOrder : [];
  if (list.length === 0 || !Array.isArray(ticketOptions) || ticketOptions.length === 0 || selections.length === 0) {
    return new Set();
  }

  const readTicketIds = getAccessor(
    options.getTicketIds,
    (item) => (Array.isArray(item?.ticketIds) ? item.ticketIds : [])
  );
  const readTargetKey = getAccessor(options.getTargetKey, (item) => toTicketId(item?.id));
  const optionById = new Map(
    ticketOptions.map((option) => [toTicketId(option?.id), toTicketId(option?.ticketId)])
  );
  const selectedTicketIds = new Set();
  selections.forEach((optionId) => {
    const ticketId = optionById.get(toTicketId(optionId));
    if (ticketId) {
      selectedTicketIds.add(ticketId);
    }
  });

  const targetKeys = new Set();
  list.forEach((item) => {
    const targetKey = toTicketId(readTargetKey(item));
    if (!targetKey) {
      return;
    }
    const linkedTicketIds = readTicketIds(item);
    const ticketIds = Array.isArray(linkedTicketIds) ? linkedTicketIds : [];
    if (ticketIds.some((ticketId) => selectedTicketIds.has(toTicketId(ticketId)))) {
      targetKeys.add(targetKey);
    }
  });

  return targetKeys;
}
