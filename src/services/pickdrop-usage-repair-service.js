import { getEntryTicketUsages, buildDateTicketUsagesMap } from "./ticket-usage-service.js";
import { resolvePickdropTicketCountType } from "./pickdrop-policy.js";

function normalizeOptions(options = []) {
  const list = Array.isArray(options) ? options : [];
  const map = new Map();
  list.forEach((option) => {
    const id = String(option?.id ?? "");
    if (!id) {
      return;
    }
    map.set(id, option);
  });
  return map;
}

function buildPickdropPools(selectionOrder = [], optionMap = new Map()) {
  const remainingById = new Map();
  const roundtrip = [];
  const oneway = [];
  const order = Array.isArray(selectionOrder) ? selectionOrder : [];

  order.forEach((ticketId) => {
    const id = String(ticketId ?? "");
    const option = optionMap.get(id);
    if (!id || !option) {
      return;
    }
    const remaining = Number(option?.reservableCount) || 0;
    remainingById.set(id, remaining);
    const countType = resolvePickdropTicketCountType(option);
    if (countType === "roundtrip") {
      roundtrip.push(id);
      return;
    }
    oneway.push(id);
  });

  return { remainingById, roundtrip, oneway };
}

function countExistingPickdropUsage(entries = [], optionMap = new Map()) {
  const counts = new Map();
  entries.forEach((entry) => {
    getEntryTicketUsages(entry).forEach((usage) => {
      const id = String(usage?.ticketId ?? "");
      if (!id || !optionMap.has(id)) {
        return;
      }
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  return counts;
}

function pickFromPool(pool = [], remainingById = new Map(), quantity = 1) {
  const picked = [];
  for (let i = 0; i < quantity; i += 1) {
    const ticketId = pool.find((id) => (remainingById.get(id) || 0) > 0);
    if (!ticketId) {
      break;
    }
    const before = remainingById.get(ticketId) || 0;
    remainingById.set(ticketId, Math.max(before - 1, 0));
    picked.push(ticketId);
  }
  return picked;
}

function buildRepairPlan(targetEntries = [], pools) {
  const planByDate = [];
  const dateKeys = [];
  targetEntries.forEach((entry) => {
    const hasPickup = Boolean(entry?.pickup);
    const hasDropoff = Boolean(entry?.dropoff);
    if (!hasPickup && !hasDropoff) {
      return;
    }
    dateKeys.push(String(entry?.date || ""));

    if (hasPickup && hasDropoff) {
      const roundtrip = pickFromPool(pools.roundtrip, pools.remainingById, 1);
      if (roundtrip.length === 1) {
        planByDate.push(roundtrip);
        return;
      }
      planByDate.push(pickFromPool(pools.oneway, pools.remainingById, 2));
      return;
    }

    const oneway = pickFromPool(pools.oneway, pools.remainingById, 1);
    if (oneway.length === 1) {
      planByDate.push(oneway);
      return;
    }
    planByDate.push(pickFromPool(pools.roundtrip, pools.remainingById, 1));
  });
  return { dateKeys, planByDate };
}

function mergeUsagesKeepService(existingUsages = [], nextPickdropUsages = [], optionMap = new Map()) {
  const merged = [];
  const seen = new Set();
  const append = (usage) => {
    const id = String(usage?.ticketId ?? "");
    const sequence = Number(usage?.sequence);
    if (!id || !Number.isFinite(sequence) || sequence <= 0) {
      return;
    }
    const key = `${id}|${sequence}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push({ ticketId: id, sequence });
  };

  existingUsages.forEach((usage) => {
    if (!optionMap.has(String(usage?.ticketId ?? ""))) {
      append(usage);
    }
  });
  nextPickdropUsages.forEach((usage) => append(usage));
  return merged;
}

/**
 * Manual-only utility:
 * rebuild pickdrop `ticketUsages` on a reservation from pickup/dropoff flags.
 * No automatic migration should call this function.
 */
export function repairReservationPickdropUsages({
  reservation,
  pickdropOptions,
  selectionOrder,
}) {
  if (!reservation || !Array.isArray(reservation?.dates)) {
    return reservation;
  }

  const optionMap = normalizeOptions(pickdropOptions);
  if (optionMap.size === 0) {
    return reservation;
  }

  const pools = buildPickdropPools(selectionOrder, optionMap);
  const existingPickdropUsage = countExistingPickdropUsage(reservation.dates, optionMap);
  existingPickdropUsage.forEach((count, ticketId) => {
    pools.remainingById.set(
      ticketId,
      (pools.remainingById.get(ticketId) || 0) + (Number(count) || 0)
    );
  });

  const activeEntries = reservation.dates.filter(
    (entry) => String(entry?.baseStatusKey || "PLANNED") !== "CANCELED"
  );
  const { dateKeys, planByDate } = buildRepairPlan(activeEntries, pools);
  const pickdropUsageByDate = buildDateTicketUsagesMap(dateKeys, planByDate, optionMap);

  return {
    ...reservation,
    dates: reservation.dates.map((entry) => {
      const existingUsages = getEntryTicketUsages(entry);
      const nextPickdropUsages = pickdropUsageByDate.get(String(entry?.date || "")) || [];
      return {
        ...entry,
        ticketUsages: mergeUsagesKeepService(existingUsages, nextPickdropUsages, optionMap),
      };
    }),
  };
}
