/**
 * ticket-reservation-service.js
 * - Resolve issued ticket options and allocation results
 * - Calculate usage, overbooking, and auto-selected dates
 * Scope: ticket selection & allocation logic only
 */
import { getDateKeyFromParts, getDatePartsFromKey, getZonedTodayParts, getWeekdayIndex } from "../utils/date.js";
import { getTimeZone } from "../utils/timezone.js";
import { formatTicketDisplayName, normalizePickdropType } from "./ticket-service.js";
import { WEEKDAY_KEYS } from "../utils/weekday.js";
import { isDayoffDate } from "../utils/dayoff.js";
import { resolvePickdropTicketCountType } from "./pickdrop-policy.js";

export function getIssuedTicketOptions(tickets, memberTickets) {
  const ticketMap = new Map(
    tickets.map((ticket) => [String(ticket.id), ticket])
  );

  return (Array.isArray(memberTickets) ? memberTickets : [])
    .map((record) => {
      const ticketId = String(record?.ticketId || "");
      const ticket = ticketMap.get(ticketId);
      const issuedQuantity = Number(record?.quantity) || 0;
      const perCount = Number(ticket?.quantity) || 0;
      const usedCount = Number(record?.usedCount) || 0;
      const totalCount = Number.isFinite(Number(record?.totalCount))
        ? Number(record.totalCount)
        : Number.isFinite(Number(record?.reservableCount))
          ? Number(record.reservableCount) + usedCount
          : issuedQuantity > 0 && perCount > 0
            ? issuedQuantity * perCount
            : 0;
      const reservableCount = Number.isFinite(Number(record?.reservableCount))
        ? Number(record.reservableCount)
        : Number.isFinite(totalCount)
          ? totalCount
          : 0;
      const remainingCount = Number.isFinite(Number(record?.reservableCount))
        ? Math.max(reservableCount, 0)
        : Math.max(totalCount - usedCount, 0);
      const weekdays = Array.isArray(ticket?.weekdays) ? ticket.weekdays : [];
      if (!ticketId) {
        return null;
      }
      const pickdropType = ticket?.type === "pickdrop"
        ? normalizePickdropType(
            record?.pickdropType
              || ticket?.pickdropType
              || record?.name
              || ticket?.name
          )
        : "";
      const displayName = formatTicketDisplayName({
        type: ticket?.type || "",
        name: record?.name || ticket?.name || "-",
        pickdropType,
      });
      return {
        id: String(record?.id || `${ticketId}-${record?.issueDate || ""}`),
        ticketId,
        type: ticket?.type || "",
        name: displayName,
        pickdropType,
        count: perCount,
        issuedQuantity,
        totalCount,
        remainingCount,
        usedCount,
        reservableCount,
        weekdays,
      };
    })
    .filter(Boolean);
}

export function getDefaultTicketSelection(classes, selectedServices, options) {
  if (!Array.isArray(classes) || !selectedServices || options.length === 0) {
    return [];
  }
  const optionMap = new Map();
  options.forEach((option) => {
    const ticketId = String(option?.ticketId ?? "");
    const optionId = String(option?.id ?? "");
    if (!ticketId || !optionId) {
      return;
    }
    if (!optionMap.has(ticketId)) {
      optionMap.set(ticketId, []);
    }
    optionMap.get(ticketId).push(optionId);
  });
  const seen = new Set();
  const defaults = [];

  classes.forEach((classItem) => {
    const name = classItem?.name || "";
    if (!selectedServices.has(name)) {
      return;
    }
    const ticketIds = Array.isArray(classItem.ticketIds)
      ? classItem.ticketIds
      : [];
    ticketIds.forEach((ticketId) => {
      const optionIds = optionMap.get(String(ticketId));
      if (!Array.isArray(optionIds) || optionIds.length === 0) {
        return;
      }
      optionIds.forEach((id) => {
        if (!id || seen.has(id)) {
          return;
        }
        seen.add(id);
        defaults.push(id);
      });
    });
  });

  return defaults;
}

export function buildPickdropUsagePlan({
  dateKeys,
  pickdropFlags,
  selectionOrder,
  optionMap,
}) {
  const planByDate = [];
  const usedByTicket = new Map();
  const mutableRemaining = new Map();
  const roundtripTickets = [];
  const onewayTickets = [];
  const orderedSelection = Array.isArray(selectionOrder) ? selectionOrder : [];

  orderedSelection.forEach((ticketId) => {
    const option = optionMap.get(ticketId);
    if (!option) {
      return;
    }
    const remaining = Number(option.reservableCount ?? option.remainingCount) || 0;
    if (remaining <= 0) {
      return;
    }
    mutableRemaining.set(ticketId, remaining);
    const countType = resolvePickdropTicketCountType(option);
    if (countType === "roundtrip") {
      roundtripTickets.push(ticketId);
      return;
    }
    onewayTickets.push(ticketId);
  });

  const pickFrom = (pool, quantity = 1) => {
    const selected = [];
    for (let i = 0; i < quantity; i += 1) {
      const ticketId = pool.find((id) => (mutableRemaining.get(id) || 0) > 0);
      if (!ticketId) {
        break;
      }
      const before = mutableRemaining.get(ticketId) || 0;
      mutableRemaining.set(ticketId, Math.max(before - 1, 0));
      selected.push(ticketId);
      usedByTicket.set(ticketId, (usedByTicket.get(ticketId) || 0) + 1);
    }
    return selected;
  };

  const dates = Array.isArray(dateKeys) ? dateKeys : [];
  dates.forEach(() => {
    const { hasPickup, hasDropoff } = pickdropFlags;
    if (!hasPickup && !hasDropoff) {
      planByDate.push([]);
      return;
    }
    if (hasPickup && hasDropoff) {
      const roundtrip = pickFrom(roundtripTickets, 1);
      if (roundtrip.length === 1) {
        planByDate.push(roundtrip);
        return;
      }
      const oneway = pickFrom(onewayTickets, 2);
      planByDate.push(oneway);
      return;
    }
    const oneway = pickFrom(onewayTickets, 1);
    if (oneway.length === 1) {
      planByDate.push(oneway);
      return;
    }
    const fallbackRoundtrip = pickFrom(roundtripTickets, 1);
    planByDate.push(fallbackRoundtrip);
  });

  return {
    planByDate,
    usedByTicket,
  };
}

export function allocateTicketUsage(selectionOrder, ticketMap, selectedCount) {
  const allocations = new Map();
  let remainingToAllocate = selectedCount;
  let totalRemaining = 0;

  selectionOrder.forEach((ticketId) => {
    const ticket = ticketMap.get(ticketId);
    if (!ticket) {
      return;
    }
    const reservableRaw = Number(ticket.reservableCount);
    const remainingBefore = Number.isFinite(reservableRaw)
      ? reservableRaw
      : Number(ticket.remainingCount) || 0;
    totalRemaining += remainingBefore;
    const used = Math.min(remainingBefore, remainingToAllocate);
    const remainingAfter = Math.max(remainingBefore - used, 0);
    remainingToAllocate = Math.max(remainingToAllocate - used, 0);
    allocations.set(ticketId, {
      remainingBefore,
      remainingAfter,
      used,
    });
  });

  if (remainingToAllocate > 0 && Array.isArray(selectionOrder) && selectionOrder.length > 0) {
    const lastSelectedId = [...selectionOrder].reverse().find((id) => allocations.has(id));
    if (lastSelectedId) {
      const allocation = allocations.get(lastSelectedId);
      allocations.set(lastSelectedId, {
        ...allocation,
        overbooked: (Number(allocation?.overbooked) || 0) + remainingToAllocate,
      });
    }
  }

  return {
    allocations,
    totalRemaining,
  };
}

export function getSelectedTicketWeekdays(selectionOrder, options) {
  if (!Array.isArray(selectionOrder) || !Array.isArray(options)) {
    return [];
  }
  const optionMap = new Map(options.map((option) => [option.id, option]));
  for (const id of selectionOrder) {
    const option = optionMap.get(id);
    const weekdays = option?.weekdays;
    if (Array.isArray(weekdays) && weekdays.length > 0) {
      return weekdays;
    }
  }
  return [];
}

export function getAutoSelectedDateKeys({
  weekdays,
  count,
  conflicts,
  timeZone,
  startKey,
  dayoffSettings,
}) {
  if (!Array.isArray(weekdays) || weekdays.length === 0 || count <= 0) {
    return [];
  }
  const zone = timeZone || getTimeZone();
  const baseParts = startKey ? getDatePartsFromKey(startKey) : getZonedTodayParts(zone);
  if (!baseParts) {
    return [];
  }
  const startParts = baseParts;
  const startDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const conflictSet = conflicts instanceof Set ? conflicts : new Set(conflicts || []);
  const weekdaySet = new Set(weekdays);
  const selected = [];
  const maxIterations = Math.max(366, count * 14);

  for (let offset = 1; offset <= maxIterations && selected.length < count; offset += 1) {
    const date = new Date(startDate.getTime() + offset * 86400000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const weekdayIndex = getWeekdayIndex(year, month, day, zone);
    const weekdayKey = WEEKDAY_KEYS[weekdayIndex];
    if (!weekdayKey || !weekdaySet.has(weekdayKey)) {
      continue;
    }
    const dateKey = getDateKeyFromParts({ year, month: month + 1, day });
    if (conflictSet.has(dateKey)) {
      continue;
    }
    if (dayoffSettings && isDayoffDate(dateKey, dayoffSettings, zone)) {
      continue;
    }
    selected.push(dateKey);
  }

  return selected;
}
