import { getMemberPhone, getMemberReservableCount } from "./member-page-service.js";
import { sanitizeTagList } from "../utils/tags.js";

const RESERVABLE_COUNT_TYPES = ["school", "daycare", "hoteling", "oneway", "roundtrip"];

function valueOrDash(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildReservableCountByType(source = {}) {
  return RESERVABLE_COUNT_TYPES.reduce((accumulator, type) => {
    accumulator[type] = toFiniteNumber(source?.[type]);
    return accumulator;
  }, {});
}

export function findMemberById(members, memberId) {
  const list = Array.isArray(members) ? members : [];
  const targetId = String(memberId || "");
  return list.find((member) => String(member?.id || "") === targetId) || null;
}

export function buildMemberDetailViewModel(member) {
  const options = arguments[1] || {};
  const siblingDogs = Array.isArray(member?.siblings)
    ? member.siblings
    : [];

  return {
    id: valueOrDash(member?.id),
    dogName: valueOrDash(member?.dogName),
    breed: valueOrDash(member?.breed),
    owner: valueOrDash(member?.owner),
    phone: valueOrDash(getMemberPhone(member)),
    address: valueOrDash(member?.address),
    memo: valueOrDash(member?.memo),
    birthDate: valueOrDash(member?.birthDate || member?.birthday),
    animalRegistrationNumber: valueOrDash(
      member?.animalRegistrationNumber || member?.registrationNumber
    ),
    coatColor: valueOrDash(member?.coatColor),
    weight: valueOrDash(member?.weight),
    gender: valueOrDash(member?.gender),
    neuteredStatus: valueOrDash(member?.neuteredStatus),
    ownerTags: sanitizeTagList(member?.ownerTags),
    petTags: sanitizeTagList(member?.petTags),
    reservableCountByType: buildReservableCountByType(
      options?.reservableCountByType || member?.totalReservableCountByType
    ),
    reservableCount: Number.isFinite(Number(options?.reservableCount))
      ? Number(options.reservableCount)
      : getMemberReservableCount(member),
    siblings: siblingDogs.map((item) => ({
      dogName: valueOrDash(item?.dogName || item?.name),
      breed: valueOrDash(item?.breed),
    })),
  };
}
