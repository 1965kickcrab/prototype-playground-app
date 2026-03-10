import {
  getPickdropCountType,
  resolvePickdropTicketCountType,
} from "./pickdrop-policy.js";

const SERVICE_TYPES = ["school", "daycare", "hoteling", "oneway", "roundtrip"];
const DEFAULT_DISPLAY_TYPES = ["school", "daycare"];
const CANCELED_STATUS = "CANCELED";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createEmptyCountMap() {
  const map = {};
  SERVICE_TYPES.forEach((type) => {
    map[type] = 0;
  });
  return map;
}

function getReservationMemberId(reservation) {
  return String(reservation?.memberId || "").trim();
}

function resolveReservationServiceType(reservation, entry) {
  const type = String(reservation?.type || "school");
  if (type === "daycare") {
    return "daycare";
  }
  if (type === "hoteling") {
    return entry?.kind === "checkout" ? "" : "hoteling";
  }
  return "school";
}

function getTicketCountType(ticket = {}) {
  if (ticket?.type === "pickdrop") {
    return resolvePickdropTicketCountType(ticket);
  }
  return ticket?.type || "school";
}

function getStoredBaseReservableByType(member, type) {
  return toNumber(member?.totalReservableCountByType?.[type]);
}

function getIssuedTotalsByType(member) {
  const tickets = Array.isArray(member?.tickets) ? member.tickets : [];
  const totals = createEmptyCountMap();
  tickets.forEach((ticket) => {
    const countType = getTicketCountType(ticket);
    if (!countType || totals[countType] === undefined) {
      return;
    }
    totals[countType] += toNumber(ticket?.totalCount);
  });
  return totals;
}

export function buildActiveReservationCountByMemberType(reservations) {
  const countsByMemberId = new Map();
  if (!Array.isArray(reservations)) {
    return countsByMemberId;
  }

  reservations.forEach((reservation) => {
    const memberId = getReservationMemberId(reservation);
    if (!memberId) {
      return;
    }
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    if (entries.length === 0) {
      return;
    }

    const countMap = countsByMemberId.get(memberId) || createEmptyCountMap();
    let hotelingHasActiveEntry = false;
    let hotelingHasPickup = false;
    let hotelingHasDropoff = false;

    entries.forEach((entry) => {
      const statusKey = String(entry?.baseStatusKey || "PLANNED");
      if (statusKey === CANCELED_STATUS) {
        return;
      }

      const serviceType = resolveReservationServiceType(reservation, entry);
      if (serviceType && countMap[serviceType] !== undefined) {
        countMap[serviceType] += 1;
      }

      if (reservation?.type === "hoteling") {
        hotelingHasActiveEntry = true;
        hotelingHasPickup = hotelingHasPickup || Boolean(entry?.pickup);
        hotelingHasDropoff = hotelingHasDropoff || Boolean(entry?.dropoff);
        return;
      }

      const pickdropType = getPickdropCountType(entry);
      if (pickdropType && countMap[pickdropType] !== undefined) {
        countMap[pickdropType] += 1;
      }
    });

    if (reservation?.type === "hoteling" && hotelingHasActiveEntry) {
      const hotelingPickdropType = getPickdropCountType({
        pickup: hotelingHasPickup,
        dropoff: hotelingHasDropoff,
      });
      if (hotelingPickdropType && countMap[hotelingPickdropType] !== undefined) {
        countMap[hotelingPickdropType] += 1;
      }
    }

    countsByMemberId.set(memberId, countMap);
  });

  return countsByMemberId;
}

export function getMemberReservableCountByTypeFromReservations(
  member,
  type = "school",
  activeCountsByMemberType = null
) {
  const normalizedType = String(type || "school");
  const memberId = String(member?.id || "").trim();
  if (!memberId || !(activeCountsByMemberType instanceof Map)) {
    return getStoredBaseReservableByType(member, normalizedType);
  }

  const issuedTotals = getIssuedTotalsByType(member);
  const activeCounts = activeCountsByMemberType.get(memberId) || createEmptyCountMap();
  return toNumber(issuedTotals[normalizedType]) - toNumber(activeCounts[normalizedType]);
}

export function getMemberReservableCountFromReservations(
  member,
  activeCountsByMemberType = null,
  types = DEFAULT_DISPLAY_TYPES
) {
  const selectedTypes = Array.isArray(types) && types.length > 0
    ? types
    : DEFAULT_DISPLAY_TYPES;
  return selectedTypes.reduce((sum, type) => {
    return sum + toNumber(
      getMemberReservableCountByTypeFromReservations(
        member,
        type,
        activeCountsByMemberType
      )
    );
  }, 0);
}
