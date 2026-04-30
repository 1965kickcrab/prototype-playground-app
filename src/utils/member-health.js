const HEALTH_STATUS_VALUES = new Set(["completed", "pending"]);

export const MEMBER_VACCINATION_FIELDS = [
  { key: "dhppl", label: "종합(DHPPL)" },
  { key: "coronaEnteritis", label: "코로나 장염" },
  { key: "kennelCough", label: "켄넬코프" },
  { key: "canineInfluenza", label: "신종플루" },
  { key: "rabies", label: "광견병" },
  { key: "heartworm", label: "심장사상충" },
];

export function normalizeMemberHealthStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  return HEALTH_STATUS_VALUES.has(text) ? text : "pending";
}

export function normalizeMemberHealthDate(value) {
  const text = String(value || "").trim();
  return text;
}

export function createDefaultVaccinationRecord() {
  return {
    status: "pending",
    confirmedDate: "",
  };
}

export function createDefaultVaccinations() {
  return MEMBER_VACCINATION_FIELDS.reduce((accumulator, field) => {
    accumulator[field.key] = createDefaultVaccinationRecord();
    return accumulator;
  }, {});
}

export function normalizeConsentAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const name = String(source.name || "").trim();
      if (!name) {
        return null;
      }
      return {
        id: String(source.id || `${name}-${index}`),
        name,
        size: Number(source.size) || 0,
        type: String(source.type || "").trim(),
      };
    })
    .filter(Boolean);
}

export function normalizeVaccinationRecord(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    status: normalizeMemberHealthStatus(source.status),
    confirmedDate: normalizeMemberHealthDate(source.confirmedDate),
  };
}

export function normalizeVaccinations(value) {
  const source = value && typeof value === "object" ? value : {};
  return MEMBER_VACCINATION_FIELDS.reduce((accumulator, field) => {
    accumulator[field.key] = normalizeVaccinationRecord(source[field.key]);
    return accumulator;
  }, {});
}

export function getMemberHealthStatusMeta(status) {
  return normalizeMemberHealthStatus(status) === "completed"
    ? {
      tone: "member-detail__ticket-status--success",
      text: "완료",
    }
    : {
      tone: "member-detail__ticket-status--danger",
      text: "미완료",
    };
}

export function getConsentStatusMeta(status) {
  return normalizeMemberHealthStatus(status) === "completed"
    ? {
      tone: "member-detail__ticket-status--success",
      text: "제출",
    }
    : {
      tone: "member-detail__ticket-status--danger",
      text: "미제출",
    };
}
