/**
 * ticket-issue-members.js
 * - Update `memberList` in localStorage when tickets are issued or reservation status changes
 * - Maintain remaining / total counts per service type
 * - Trigger ticket auto-assign and count recalculation
 *
 * Scope:
 * - Data only (no UI)
 * - Normalizes legacy member/ticket schemas
 */
import { writeStorageValue } from "./storage-utils.js";
import { autoApplyIssuedTicketsToReservations } from "../services/ticket-auto-assign.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";

const STORAGE_KEY = "memberList";
const SERVICE_TYPES = ["school", "daycare", "hoteling", "oneway", "roundtrip"];

const DEFAULT_MEMBERS = [
  {
    id: 1,
    petName: "구름",
    breed: "비숑 프리제",
    guardianName: "김이나",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 2,
    petName: "하늘",
    breed: "푸들",
    guardianName: "이서현",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 3,
    petName: "바다",
    breed: "코카 스패니얼",
    guardianName: "박지수",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 4,
    petName: "산",
    breed: "말티즈",
    guardianName: "최수연",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 5,
    petName: "숲",
    breed: "세퍼드",
    guardianName: "정이라",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 6,
    petName: "강가",
    breed: "닥스훈트",
    guardianName: "조홍준",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 7,
    petName: "들판",
    breed: "비글",
    guardianName: "윤서진",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 8,
    petName: "저녁",
    breed: "위너",
    guardianName: "김미려",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 9,
    petName: "아침",
    breed: "리트리버",
    guardianName: "이정훈",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
  {
    id: 10,
    petName: "밤하늘",
    breed: "스피츠",
    guardianName: "박서준",
    remainingCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    totalReservableCountByType: {
      school: 0,
      daycare: 0,
      hoteling: 0,
      oneway: 0,
      roundtrip: 0,
    },
    tickets: [],
  },
];

function cloneMember(member) {
  return JSON.parse(JSON.stringify(member));
}

function parseCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCountMap(source) {
  const map = {};
  if (source && typeof source === "object") {
    SERVICE_TYPES.forEach((type) => {
      map[type] = parseCount(source[type]);
    });
  }
  SERVICE_TYPES.forEach((type) => {
    map[type] = Number.isFinite(Number(map[type])) ? Number(map[type]) : 0;
  });
  return map;
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
  const totalReservedCountByType = normalizeCountMap(
    source.totalReservedCountByType
  );

  return {
    id: String(id),
    dogName,
    breed,
    owner,
    totalReservableCountByType,
    remainingCountByType,
    totalReservedCountByType,
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
    reservedCount: Number(source.reservedCount) || 0,
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
      reservedCount: 0,
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
    appendIssuedTickets(item, normalizedIssues);
    return item;
  });

  // Commit normalized member list back to storage (single write)
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
  type = "school"
) {
  void memberId;
  void beforeStatusKey;
  void afterStatusKey;
  void count;
  void type;
  recalculateTicketCounts();
}

export function applyReservationToMember(memberId, useCount, type = "school") {
  applyReservationStatusChange(memberId, null, "PLANNED", useCount, type);
}

export function applyReservationToMemberTickets(memberId, usageMap) {
  recalculateTicketCounts();
}

export function rollbackReservationMemberTickets(memberId, usageMap) {
  recalculateTicketCounts();
}

export function ensureMemberDefaults() {
  const members = readStorage();
  recalculateTicketCounts();
  return readStorage();
}


