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
import { hasTagValue, sanitizeTagList } from "../utils/tags.js";
import {
  createDefaultVaccinations,
  normalizeConsentAttachments,
  normalizeMemberHealthDate,
  normalizeMemberHealthStatus,
  normalizeVaccinations,
} from "../utils/member-health.js";
import {
  getTicketReservableValue,
  getTicketTotalValue,
  getTicketUsedValue,
} from "../services/ticket-service.js";

const STORAGE_KEY = "memberList";
const SERVICE_TYPES = ["school", "daycare", "hoteling", "oneway", "roundtrip"];

function createEmptyCountMap() {
  return {
    school: 0,
    daycare: 0,
    hoteling: 0,
    oneway: 0,
    roundtrip: 0,
  };
}

function createDefaultMemberSchema({
  id = "",
  petName = "",
  breed = "",
  guardianName = "",
} = {}) {
  return {
    id: String(id),
    dogName: petName,
    petName,
    breed,
    owner: guardianName,
    guardianName,
    phoneNumber: "",
    phone: "",
    address: "",
    memo: "",
    birthDate: "",
    birthday: "",
    animalRegistrationNumber: "",
    registrationNumber: "",
    coatColor: "",
    weight: "",
    gender: "",
    neuteredStatus: "",
    consentStatus: "pending",
    consentConfirmedDate: "",
    consentAttachments: [],
    vaccinations: createDefaultVaccinations(),
    profileImageUrl: "",
    siblings: [],
    ownerTags: [],
    petTags: [],
    remainingCountByType: createEmptyCountMap(),
    totalReservableCountByType: createEmptyCountMap(),
    totalReservedCountByType: createEmptyCountMap(),
    tickets: [],
  };
}

const DEFAULT_MEMBER_PROFILES = [
  { id: 1, petName: "구름", breed: "비숑 프리제", guardianName: "김이나" },
  { id: 2, petName: "하늘", breed: "푸들", guardianName: "이서현" },
  { id: 3, petName: "바다", breed: "코카 스패니얼", guardianName: "박지수" },
  { id: 4, petName: "산", breed: "말티즈", guardianName: "최수연" },
  { id: 5, petName: "숲", breed: "세퍼드", guardianName: "정이라" },
  { id: 6, petName: "강가", breed: "닥스훈트", guardianName: "조홍준" },
  { id: 7, petName: "들판", breed: "비글", guardianName: "윤서진" },
  { id: 8, petName: "저녁", breed: "위너", guardianName: "김미려" },
  { id: 9, petName: "아침", breed: "리트리버", guardianName: "이정훈" },
  { id: 10, petName: "밤하늘", breed: "스피츠", guardianName: "박서준" },
];

const DEFAULT_MEMBERS = DEFAULT_MEMBER_PROFILES.map((profile) =>
  createDefaultMemberSchema(profile)
);

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
    petName: source.petName ?? dogName,
    breed,
    owner,
    guardianName: source.guardianName ?? owner,
    phoneNumber: source.phoneNumber ?? source.phone ?? source.guardianPhone ?? source.ownerPhone ?? "",
    phone: source.phone ?? source.phoneNumber ?? source.guardianPhone ?? source.ownerPhone ?? "",
    address: source.address ?? "",
    memo: source.memo ?? "",
    birthDate: source.birthDate ?? source.birthday ?? "",
    birthday: source.birthday ?? source.birthDate ?? "",
    animalRegistrationNumber:
      source.animalRegistrationNumber ?? source.registrationNumber ?? "",
    registrationNumber:
      source.registrationNumber ?? source.animalRegistrationNumber ?? "",
    coatColor: source.coatColor ?? "",
    weight: source.weight ?? "",
    gender: source.gender ?? "",
    neuteredStatus:
      source.neuteredStatus
      ?? source.neuteringStatus
      ?? source.isNeutered
      ?? "",
    consentStatus: normalizeMemberHealthStatus(source.consentStatus),
    consentConfirmedDate: normalizeMemberHealthDate(source.consentConfirmedDate),
    consentAttachments: normalizeConsentAttachments(source.consentAttachments),
    vaccinations: normalizeVaccinations(source.vaccinations),
    profileImageUrl: source.profileImageUrl ?? source.profileImage ?? "",
    siblings: Array.isArray(source.siblings) ? source.siblings : [],
    ownerTags: sanitizeTagList(source.ownerTags),
    petTags: sanitizeTagList(source.petTags),
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
  const type = String(source.type || "");
  const totalCount = getTicketTotalValue(source);
  const reservableCount = getTicketReservableValue(source);

  return {
    id: String(source.id ?? source.issueId ?? ""),
    ticketId: String(source.ticketId ?? ""),
    name: source.name || "",
    pickdropType: source.pickdropType || "",
    type,
    totalCount: type === "daycare" ? 0 : totalCount,
    totalHours: type === "daycare" ? totalCount : 0,
    validity: Number(source.validity) || 0,
    unit: source.unit || "",
    startPolicy: source.startPolicy || source.startDatePolicy || "",
    reservationDateRule: source.reservationDateRule || "",
    issueDate: source.issueDate || source.issuedDate || "",
    startDate: source.startDate || "",
    usedCount: type === "daycare" ? 0 : getTicketUsedValue(source),
    usedHours: type === "daycare" ? getTicketUsedValue(source) : 0,
    reservedCount: Number(source.reservedCount) || 0,
    reservedHours: Number(source.reservedHours) || 0,
    reservableCount: type === "daycare" ? 0 : reservableCount,
    reservableHours: type === "daycare" ? reservableCount : 0,
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
      totalCount: issue.type === "daycare" ? 0 : (Number.isFinite(Number(issue.totalCount)) ? Number(issue.totalCount) : 0),
      totalHours: issue.type === "daycare" ? (Number.isFinite(Number(issue.totalHours)) ? Number(issue.totalHours) : 0) : 0,
      validity: Number(issue.validity) || 0,
      unit: issue.unit ?? "",
      startPolicy: issue.startPolicy ?? issue.startDatePolicy ?? "",
      reservationDateRule: issue.reservationDateRule ?? "",
      issueDate: issue.issueDate ?? issue.issuedDate ?? "",
      startDate: issue.startDate ?? "",
      usedCount: issue.type === "daycare" ? 0 : (Number(issue.usedCount) || 0),
      usedHours: issue.type === "daycare" ? (Number(issue.usedHours) || 0) : 0,
      reservedCount: 0,
      reservedHours: issue.type === "daycare" ? (Number(issue.reservedHours) || 0) : 0,
      reservableCount: issue.type === "daycare"
        ? 0
        : (Number.isFinite(Number(issue.reservableCount))
          ? Number(issue.reservableCount)
          : Number.isFinite(Number(issue.totalCount))
            ? Number(issue.totalCount)
            : 0),
      reservableHours: issue.type === "daycare"
        ? (Number.isFinite(Number(issue.reservableHours))
          ? Number(issue.reservableHours)
          : Number.isFinite(Number(issue.totalHours))
            ? Number(issue.totalHours)
            : 0)
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
      const totalHours = Number(issue.totalHours);
      const isDaycare = issue?.type === "daycare";
      const computedTotal = isDaycare
        ? (Number.isFinite(totalHours)
          ? totalHours
          : ticketQuantity * (Number(issue.quantity) || 0))
        : (Number.isFinite(total)
          ? total
          : ticketQuantity * (Number(issue.quantity) || 0));
      const reservable = isDaycare
        ? (Number.isFinite(Number(issue.reservableHours))
          ? Number(issue.reservableHours)
          : computedTotal)
        : (Number.isFinite(Number(issue.reservableCount))
          ? Number(issue.reservableCount)
          : computedTotal);
      return {
        ...issue,
        totalCount: isDaycare ? 0 : computedTotal,
        totalHours: isDaycare ? computedTotal : 0,
        reservableCount: isDaycare ? 0 : reservable,
        reservableHours: isDaycare ? reservable : 0,
        usedCount: isDaycare ? 0 : (Number(issue.usedCount) || 0),
        usedHours: isDaycare ? (Number(issue.usedHours) || 0) : 0,
        reservedCount: isDaycare ? 0 : (Number(issue.reservedCount) || 0),
        reservedHours: isDaycare ? (Number(issue.reservedHours) || 0) : 0,
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

export function updateIssueMember(memberId, patch = {}) {
  const targetId = String(memberId || "").trim();
  if (!targetId || !patch || typeof patch !== "object") {
    return null;
  }
  const source = readStorage();
  if (!Array.isArray(source) || source.length === 0) {
    return null;
  }

  let updatedMember = null;
  const next = source.map((item) => {
    const currentId = String(item?.id ?? item?.memberId ?? "").trim();
    if (currentId !== targetId) {
      return item;
    }
    const nextPatch = { ...patch };
    if ("ownerTags" in nextPatch) {
      nextPatch.ownerTags = sanitizeTagList(nextPatch.ownerTags);
    }
    if ("petTags" in nextPatch) {
      nextPatch.petTags = sanitizeTagList(nextPatch.petTags);
    }
    const merged = { ...item, ...nextPatch };
    updatedMember = normalizeMember(merged);
    return merged;
  });

  if (!updatedMember) {
    return null;
  }
  writeStorageValue(STORAGE_KEY, next);
  return updatedMember;
}

export function updateIssueMembersPetTags(memberIds = [], tags = [], mode = "add") {
  const idSet = new Set(
    (Array.isArray(memberIds) ? memberIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  const normalizedTags = sanitizeTagList(tags);
  const action = String(mode || "").trim().toLowerCase();
  if (!idSet.size || !normalizedTags.length || (action !== "add" && action !== "remove")) {
    return readStorage();
  }

  const source = readStorage();
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }

  const next = source.map((item) => {
    const currentId = String(item?.id ?? item?.memberId ?? "").trim();
    if (!idSet.has(currentId)) {
      return item;
    }

    const currentTags = sanitizeTagList(item?.petTags);
    const nextTags = action === "add"
      ? sanitizeTagList([...currentTags, ...normalizedTags])
      : currentTags.filter((tag) => !normalizedTags.some((candidate) => hasTagValue([tag], candidate)));

    return {
      ...item,
      petTags: nextTags,
    };
  });

  writeStorageValue(STORAGE_KEY, next);
  return next.map((item) => normalizeMember(item));
}

export function updateMemberTicketQuantity(memberId, issuedTicketId, delta = 0) {
  const targetMemberId = String(memberId || "").trim();
  const targetTicketId = String(issuedTicketId || "").trim();
  const step = Number(delta);
  if (!targetMemberId || !targetTicketId || !Number.isFinite(step) || step === 0) {
    return null;
  }

  const source = readStorage();
  if (!Array.isArray(source) || source.length === 0) {
    return null;
  }

  let updatedMember = null;
  let didUpdate = false;
  const next = source.map((item) => {
    const currentId = String(item?.id ?? item?.memberId ?? "").trim();
    if (currentId !== targetMemberId) {
      return item;
    }

    const tickets = Array.isArray(item?.tickets) ? item.tickets : [];
    const nextTickets = tickets.map((ticket) => {
      const currentTicketId = String(ticket?.id ?? ticket?.issueId ?? "").trim();
      if (currentTicketId !== targetTicketId) {
        return ticket;
      }

      const type = String(ticket?.type || "").trim();
      if (type === "daycare") {
        const currentTotal = Number(ticket?.totalHours) || 0;
        const nextTotal = Math.max(0, currentTotal + step);
        if (nextTotal === currentTotal) {
          return ticket;
        }
        didUpdate = true;
        return {
          ...ticket,
          totalHours: nextTotal,
        };
      }

      const currentTotal = Number(ticket?.totalCount) || 0;
      const nextTotal = Math.max(0, currentTotal + step);
      if (nextTotal === currentTotal) {
        return ticket;
      }
      didUpdate = true;
      return {
        ...ticket,
        totalCount: nextTotal,
      };
    });

    const merged = {
      ...item,
      tickets: nextTickets,
    };
    updatedMember = normalizeMember(merged);
    return merged;
  });

  if (!didUpdate || !updatedMember) {
    return null;
  }

  writeStorageValue(STORAGE_KEY, next);
  recalculateTicketCounts();
  return findIssuedTicketById(loadIssueMembers(), targetMemberId, targetTicketId);
}

function findIssuedTicketById(members, memberId, ticketId) {
  const member = (Array.isArray(members) ? members : []).find(
    (item) => String(item?.id || "").trim() === String(memberId || "").trim()
  );
  if (!member || !Array.isArray(member?.tickets)) {
    return null;
  }
  return member.tickets.find(
    (ticket) => String(ticket?.id || "").trim() === String(ticketId || "").trim()
  ) || null;
}

export function replaceIssueMembers(members = []) {
  if (!Array.isArray(members)) {
    return [];
  }
  const next = members.map((member) => {
    const source = member && typeof member === "object" ? member : {};
    return {
      ...source,
      ownerTags: sanitizeTagList(source.ownerTags),
      petTags: sanitizeTagList(source.petTags),
    };
  });
  writeStorageValue(STORAGE_KEY, next);
  return next.map((item) => normalizeMember(item));
}


