import {
  getMemberReservableCountByTypeFromReservations as getReservableByTypeFromActiveReservations,
  getMemberReservableCountFromReservations as getReservableFromActiveReservations,
} from "./member-reservable-count.js";
import { hasTagValue, sanitizeTagList } from "../utils/tags.js";
const SERVICE_TYPES = ["school", "daycare"];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getMemberPhone(member) {
  return (
    member?.phoneNumber
    || member?.phone
    || member?.guardianPhone
    || member?.ownerPhone
    || "-"
  );
}

export function getMemberReservableCount(member) {
  const map = member?.totalReservableCountByType || {};
  return SERVICE_TYPES.reduce((sum, type) => sum + toNumber(map[type]), 0);
}

export function getMemberReservableCountFromReservations(
  member,
  activeReservationCountsByMemberType = null
) {
  return getReservableFromActiveReservations(
    member,
    activeReservationCountsByMemberType,
    SERVICE_TYPES
  );
}

export function getMemberReservableCountByTypeFromReservations(
  member,
  type = "school",
  activeReservationCountsByMemberType = null
) {
  return getReservableByTypeFromActiveReservations(
    member,
    type,
    activeReservationCountsByMemberType
  );
}

export function formatReservableCountText(count) {
  if (count < 0) {
    return `초과 ${Math.abs(count)}회`;
  }
  return `${count}회`;
}

export function filterMembers(members, query) {
  const list = Array.isArray(members) ? members : [];
  const keyword = String(query || "").trim().toLowerCase();
  if (!keyword) {
    return list;
  }
  return list.filter((member) => {
    const dogName = String(member?.dogName || "").toLowerCase();
    const owner = String(member?.owner || "").toLowerCase();
    const phone = String(getMemberPhone(member)).toLowerCase();
    return dogName.includes(keyword) || owner.includes(keyword) || phone.includes(keyword);
  });
}

export function filterMembersByTags(members, selectedTags, mode = "any") {
  const list = Array.isArray(members) ? members : [];
  const tags = sanitizeTagList(selectedTags);
  if (!tags.length) {
    return list;
  }
  const normalizedMode = String(mode || "any").toLowerCase() === "all" ? "all" : "any";
  return list.filter((member) => {
    const sourceTags = sanitizeTagList([
      ...(Array.isArray(member?.petTags) ? member.petTags : []),
      ...(Array.isArray(member?.ownerTags) ? member.ownerTags : []),
    ]);
    if (normalizedMode === "all") {
      return tags.every((tag) => hasTagValue(sourceTags, tag));
    }
    return tags.some((tag) => hasTagValue(sourceTags, tag));
  });
}

export function getPagedMembers(members, page, pageSize) {
  const list = Array.isArray(members) ? members : [];
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const startIndex = (currentPage - 1) * size;
  return {
    totalPages,
    currentPage,
    items: list.slice(startIndex, startIndex + size),
  };
}
