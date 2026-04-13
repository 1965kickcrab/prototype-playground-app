import { getMemberReservableCountByTypeFromReservations } from "./member-reservable-count.js";
import { getTicketUnitLabel } from "./ticket-service.js";

export const MEMBER_STATUS_TYPES = [
  { key: "school", label: "유치원" },
  { key: "daycare", label: "데이케어" },
  { key: "hoteling", label: "호텔링" },
  { key: "oneway", label: "편도" },
  { key: "roundtrip", label: "왕복" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function formatMemberReservableStatusCount(value, type) {
  const count = Number(value) || 0;
  const unit = getTicketUnitLabel(type);
  if (count < 0) {
    return `초과 ${Math.abs(count)}${unit}`;
  }
  return `${count}${unit}`;
}

export function buildMemberStatusMarkup(countsByType = {}) {
  return MEMBER_STATUS_TYPES.map(({ key, label }) => {
    const count = Number(countsByType?.[key]) || 0;
    const toneClass = count <= 2
      ? "member-detail__status-item--low"
      : "member-detail__status-item--normal";
    return `
      <div class="member-detail__status-item ${toneClass}">
        <span class="member-detail__status-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatMemberReservableStatusCount(count, key))}</strong>
      </div>
    `;
  }).join("");
}

export function buildMemberReservableCountsByType(member, activeReservationCountsByMemberType) {
  return MEMBER_STATUS_TYPES.reduce((accumulator, item) => {
    accumulator[item.key] = getMemberReservableCountByTypeFromReservations(
      member || {},
      item.key,
      activeReservationCountsByMemberType
    );
    return accumulator;
  }, {});
}
