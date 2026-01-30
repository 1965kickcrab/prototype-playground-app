import { writeStorageValue } from "./storage-utils.js";
import { autoApplyIssuedTicketsToReservations } from "../services/ticket-auto-assign.js";

const STORAGE_KEY = "memberList";
const SERVICE_TYPES = ["kindergarten", "daycare", "hoteling", "pickdrop"];

const DEFAULT_MEMBERS = [
  {
    id: 1,
    petName: "구름",
    breed: "비숑 프리제",
    guardianName: "김이나",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 2,
    petName: "하늘",
    breed: "푸들",
    guardianName: "이서현",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 3,
    petName: "바다",
    breed: "코카 스패니얼",
    guardianName: "박지수",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 4,
    petName: "산",
    breed: "말티즈",
    guardianName: "최수연",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 5,
    petName: "숲",
    breed: "세퍼드",
    guardianName: "정이라",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 6,
    petName: "강가",
    breed: "닥스훈트",
    guardianName: "조홍준",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 7,
    petName: "들판",
    breed: "비글",
    guardianName: "윤서진",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 8,
    petName: "저녁",
    breed: "위너",
    guardianName: "김미려",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 9,
    petName: "아침",
    breed: "리트리버",
    guardianName: "이정훈",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
  {
    id: 10,
    petName: "밤하늘",
    breed: "스피츠",
    guardianName: "박서준",
    remainingCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    totalReservableCountByType: {
      kindergarten: 0,
      daycare: 0,
      hoteling: 0,
      pickdrop: 0,
    },
    tickets: [],
  },
];

const TOTAL_STATUS_KEYS = new Set(["PLANNED", "CHECKIN", "CHECKOUT", "ABSENT"]);
const COMPLETED_STATUS_KEYS = new Set(["CHECKIN", "CHECKOUT", "ABSENT"]);

function cloneMember(member) {
  return JSON.parse(JSON.stringify(member));
}

function parseCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCountMap(source) {
  const map = {};
  if (source && typeof source === "object") {
    SERVICE_TYPES.forEach((type) => {
      map[type] = parseCount(source[type]);
    });
  }
  SERVICE_TYPES.forEach((type) => {
    if (!Object.prototype.hasOwnProperty.call(map, type)) {
      map[type] = null;
    }
  });
  return map;
}

function getCountByType(map, type) {
  if (!map || !type) {
    return null;
  }
  const value = Number(map[type]);
  return Number.isFinite(value) ? value : null;
}

function setCountByType(item, key, type, value) {
  const current = item && typeof item[key] === "object" ? item[key] : {};
  item[key] = { ...current, [type]: value };
}

function normalizeMember(item) {
  const source = item && typeof item === "object" ? item : {};
  const id = source.id ?? source.memberId ?? "";
  const dogName = source.dogName ?? source.petName ?? source.name ?? "";
  const breed = source.breed ?? source.petBreed ?? "";
  const owner =
    source.owner
    ?? source.guardian
    ?? source.guardianName
    ?? source.ownerName
    ?? "";
  const tickets = Array.isArray(source.tickets)
    ? source.tickets.map((ticket) => normalizeTicketEntry(ticket))
    : [];

  const totalReservableCountByType = normalizeCountMap(
    source.totalReservableCountByType
  );
  const remainingCountByType = normalizeCountMap(
    source.remainingCountByType
  );

  return {
    id: String(id),
    dogName,
    breed,
    owner,
    totalReservableCountByType,
    remainingCountByType,
    tickets,
  };
}

function mergeDefaultMembers(stored) {
  if (!Array.isArray(stored)) {
    return { list: [], changed: false };
  }

  const idSet = new Set(
    stored
      .map((item) => String(item?.id ?? item?.memberId ?? ""))
      .filter((value) => value)
  );
  let changed = false;
  const merged = stored.slice();

  DEFAULT_MEMBERS.forEach((member) => {
    const id = String(member.id);
    if (!idSet.has(id)) {
      merged.push(cloneMember(member));
      changed = true;
    }
  });

  return { list: merged, changed };
}

function readStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = DEFAULT_MEMBERS.map((member) => cloneMember(member));
    writeStorageValue(STORAGE_KEY, seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    const { list, changed } = mergeDefaultMembers(
      Array.isArray(parsed) ? parsed : []
    );
    if (changed) {
      writeStorageValue(STORAGE_KEY, list);
    }
    return list;
  } catch (error) {
    return [];
  }
}

function getBaseMembers() {
  return DEFAULT_MEMBERS.map((member) => normalizeMember(member));
}

function applyIssueCounts(member, type, totalAdd) {
  const baseRemaining = getMemberRemainingCountByType(member, type, 0);
  const remaining = baseRemaining + totalAdd;
  return { remaining };
}

function isStatusIncluded(statusKey, set) {
  return Boolean(statusKey) && set.has(String(statusKey));
}

function getMemberTotalCountByType(member, type, fallback = null) {
  const totalByType = getCountByType(member?.totalReservableCountByType, type);
  if (Number.isFinite(totalByType)) {
    return totalByType;
  }
  return fallback;
}

function getMemberRemainingCountByType(member, type, fallback = null) {
  const remainingByType = getCountByType(member?.remainingCountByType, type);
  if (Number.isFinite(remainingByType)) {
    return remainingByType;
  }
  return fallback;
}

function applyReservationStatusDelta(member, beforeStatusKey, afterStatusKey, count, type) {
  if (!Number.isFinite(count) || count <= 0) {
    return {
      total: getMemberTotalCountByType(member, type),
      remaining: getMemberRemainingCountByType(member, type),
      changed: false,
    };
  }

  const totalBefore = isStatusIncluded(beforeStatusKey, TOTAL_STATUS_KEYS);
  const totalAfter = isStatusIncluded(afterStatusKey, TOTAL_STATUS_KEYS);
  const completedBefore = isStatusIncluded(beforeStatusKey, COMPLETED_STATUS_KEYS);
  const completedAfter = isStatusIncluded(afterStatusKey, COMPLETED_STATUS_KEYS);

  let total = getMemberTotalCountByType(member, type, 0);
  let remaining = getMemberRemainingCountByType(member, type, total);
  const totalDelta = (totalBefore ? count : 0) - (totalAfter ? count : 0);
  const remainingDelta = (completedBefore ? count : 0) - (completedAfter ? count : 0);
  total += totalDelta;
  remaining += remainingDelta;

  return { total, remaining, changed: totalDelta !== 0 || remainingDelta !== 0 };
}

function normalizeTicketEntry(ticket) {
  const source = ticket && typeof ticket === "object" ? ticket : {};
  const totalCount = Number(source.totalCount);
  const reservableCount = Number.isFinite(Number(source.reservableCount))
    ? Number(source.reservableCount)
    : Number.isFinite(totalCount)
      ? totalCount
      : null;

  return {
    id: String(source.id ?? source.issueId ?? ""),
    ticketId: String(source.ticketId ?? ""),
    name: source.name || "",
    pickdropType: source.pickdropType || "",
    type: source.type || "",
    totalCount: Number.isFinite(totalCount) ? totalCount : null,
    validity: Number(source.validity) || 0,
    unit: source.unit || "",
    startPolicy: source.startPolicy || source.startDatePolicy || "",
    reservationDateRule: source.reservationDateRule || "",
    issueDate: source.issueDate || source.issuedDate || "",
    startDate: source.startDate || "",
    usedCount: Number(source.usedCount) || 0,
    reservableCount,
    expiryDate: source.expiryDate || "",
    quantity: Number(source.quantity) || 0,
  };
}

function appendIssuedTickets(item, issues) {
  if (!issues || issues.length === 0) {
    return;
  }
  const nextTickets = Array.isArray(item.tickets) ? item.tickets.slice() : [];
  issues.forEach((issue) => {
    nextTickets.push({
      id: issue.id ?? "",
      ticketId: issue.ticketId ?? "",
      name: issue.name ?? "",
      pickdropType: issue.pickdropType ?? "",
      type: issue.type ?? "",
      totalCount: Number.isFinite(Number(issue.totalCount)) ? Number(issue.totalCount) : 0,
      validity: Number(issue.validity) || 0,
      unit: issue.unit ?? "",
      startPolicy: issue.startPolicy ?? issue.startDatePolicy ?? "",
      reservationDateRule: issue.reservationDateRule ?? "",
      issueDate: issue.issueDate ?? issue.issuedDate ?? "",
      startDate: issue.startDate ?? "",
      usedCount: Number(issue.usedCount) || 0,
      reservableCount: Number.isFinite(Number(issue.reservableCount))
        ? Number(issue.reservableCount)
        : Number.isFinite(Number(issue.totalCount))
          ? Number(issue.totalCount)
          : 0,
      expiryDate: issue.expiryDate ?? "",
      quantity: issue.quantity ?? 0,
    });
  });
  item.tickets = nextTickets;
}

export function loadIssueMembers() {
  const stored = readStorage();
  if (!Array.isArray(stored) || stored.length === 0) {
    return [];
  }
  return stored.map((item) => normalizeMember(item));
}

export function applyIssueToMembers(issues, ticketQuantity) {
  if (!Number.isFinite(ticketQuantity) || ticketQuantity <= 0) {
    return;
  }
  const list = readStorage();
  const source = Array.isArray(list) && list.length > 0 ? list : getBaseMembers();
  if (!Array.isArray(source) || source.length === 0) {
    return;
  }

  const issueMap = new Map();
  issues.forEach((issue) => {
    const key = String(issue.memberId ?? "");
    if (!key) {
      return;
    }
    if (!issueMap.has(key)) {
      issueMap.set(key, []);
    }
    issueMap.get(key).push(issue);
  });
  const next = source.map((item) => {
    const member = normalizeMember(item);
    const memberIssues = issueMap.get(member.id);
    if (!memberIssues || memberIssues.length === 0) {
      return item;
    }
    const normalizedIssues = memberIssues.map((issue) => {
      const total = Number(issue.totalCount);
      const computedTotal = Number.isFinite(total)
        ? total
        : ticketQuantity * (Number(issue.quantity) || 0);
      const reservable = Number.isFinite(Number(issue.reservableCount))
        ? Number(issue.reservableCount)
        : computedTotal;
      return {
        ...issue,
        totalCount: computedTotal,
        reservableCount: reservable,
        usedCount: Number(issue.usedCount) || 0,
      };
    });
    const issueType = normalizedIssues[0]?.type || "kindergarten";
    const totalAdd = normalizedIssues.reduce(
      (sum, issue) => sum + (Number(issue.reservableCount) || 0),
      0
    );
    const updated = applyIssueCounts(member, issueType, totalAdd);
    setCountByType(item, "remainingCountByType", issueType, updated.remaining);
    const nextTotal = getMemberTotalCountByType(member, issueType, 0) + totalAdd;
    if (Number.isFinite(nextTotal)) {
      setCountByType(item, "totalReservableCountByType", issueType, nextTotal);
    }
    appendIssuedTickets(item, normalizedIssues);
    return item;
  });

  writeStorageValue(STORAGE_KEY, next);
  autoApplyIssuedTicketsToReservations(
    issues,
  );
}

export function applyReservationStatusChange(
  memberId,
  beforeStatusKey,
  afterStatusKey,
  count = 1,
  type = "kindergarten"
) {
  if (!memberId || !Number.isFinite(count) || count <= 0) {
    return;
  }
  const list = readStorage();
  if (!Array.isArray(list) || list.length === 0) {
    return;
  }

  const next = list.map((item) => {
    const member = normalizeMember(item);
    if (String(member.id) !== String(memberId)) {
      return item;
    }
    const updated = applyReservationStatusDelta(
      member,
      beforeStatusKey,
      afterStatusKey,
      count,
      type
    );
    if (!updated.changed) {
      return item;
    }
    setCountByType(item, "remainingCountByType", type, updated.remaining);
    if (Number.isFinite(updated.total)) {
      setCountByType(item, "totalReservableCountByType", type, updated.total);
    }
    return item;
  });

  writeStorageValue(STORAGE_KEY, next);
}

export function applyReservationToMember(memberId, useCount, type = "kindergarten") {
  applyReservationStatusChange(memberId, null, "PLANNED", useCount, type);
}

export function applyReservationToMemberTickets(memberId, usageMap) {
  if (!memberId || !(usageMap instanceof Map) || usageMap.size === 0) {
    return;
  }
  const list = readStorage();
  if (!Array.isArray(list) || list.length === 0) {
    return;
  }

  const next = list.map((item) => {
    const member = normalizeMember(item);
    if (String(member.id) !== String(memberId)) {
      return item;
    }
    const currentTickets = Array.isArray(item.tickets) ? item.tickets : [];
    const updatedTickets = currentTickets.map((ticket) => {
      const ticketId = String(ticket?.id ?? "");
      if (!ticketId || !usageMap.has(ticketId)) {
        return ticket;
      }
      const usedAdd = Number(usageMap.get(ticketId)) || 0;
      if (usedAdd <= 0) {
        return ticket;
      }
      const usedCount = Number(ticket.usedCount) || 0;
      const reservable = Number(ticket.reservableCount);
      const total = Number(ticket.totalCount);
      const totalLimit = Number.isFinite(total)
        ? total
        : Number.isFinite(reservable)
          ? reservable + usedCount
          : null;
      const nextUsed = Number.isFinite(totalLimit)
        ? Math.min(usedCount + usedAdd, totalLimit)
        : usedCount + usedAdd;
      const nextReservable = Number.isFinite(reservable)
        ? Math.max(reservable - usedAdd, 0)
        : Number.isFinite(totalLimit)
          ? Math.max(totalLimit - nextUsed, 0)
          : reservable;
      return {
        ...ticket,
        usedCount: nextUsed,
        reservableCount: Number.isFinite(nextReservable) ? nextReservable : reservable,
      };
    });
    return { ...item, tickets: updatedTickets };
  });

  writeStorageValue(STORAGE_KEY, next);
}

export function rollbackReservationMemberTickets(memberId, usageMap) {
  if (!memberId || !(usageMap instanceof Map) || usageMap.size === 0) {
    return;
  }
  const list = readStorage();
  if (!Array.isArray(list) || list.length === 0) {
    return;
  }

  const next = list.map((item) => {
    const member = normalizeMember(item);
    if (String(member.id) !== String(memberId)) {
      return item;
    }
    const currentTickets = Array.isArray(item.tickets) ? item.tickets : [];
    const updatedTickets = currentTickets.map((ticket) => {
      const ticketId = String(ticket?.id ?? "");
      if (!ticketId || !usageMap.has(ticketId)) {
        return ticket;
      }
      const usedSub = Number(usageMap.get(ticketId)) || 0;
      if (usedSub <= 0) {
        return ticket;
      }
      const usedCount = Number(ticket.usedCount) || 0;
      const reservable = Number(ticket.reservableCount);
      const total = Number(ticket.totalCount);
      const totalLimit = Number.isFinite(total)
        ? total
        : Number.isFinite(reservable)
          ? reservable + usedCount
          : null;
      const nextUsed = Math.max(usedCount - usedSub, 0);
      let nextReservable = reservable;
      if (Number.isFinite(totalLimit)) {
        const maxReservable = Math.max(totalLimit - nextUsed, 0);
        if (Number.isFinite(reservable)) {
          nextReservable = Math.min(reservable + usedSub, maxReservable);
        } else {
          nextReservable = maxReservable;
        }
      } else if (Number.isFinite(reservable)) {
        nextReservable = reservable + usedSub;
      }
      return {
        ...ticket,
        usedCount: nextUsed,
        reservableCount: Number.isFinite(nextReservable) ? nextReservable : reservable,
      };
    });
    return { ...item, tickets: updatedTickets };
  });

  writeStorageValue(STORAGE_KEY, next);
}

export function ensureMemberDefaults() {
  return readStorage();
}
