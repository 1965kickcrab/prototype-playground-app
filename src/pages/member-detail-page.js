import {
  ensureMemberDefaults,
  loadIssueMembers,
  updateMemberTicketQuantity,
  updateIssueMember,
} from "../storage/ticket-issue-members.js";
import {
  loadMemberTagCatalog,
  mergeMemberTagCatalog,
} from "../storage/member-tag-catalog.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import { setupSidebarToggle } from "../utils/sidebar.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { getTimeZone } from "../utils/timezone.js";
import { buildMemberDetailViewModel, findMemberById } from "../services/member-detail-service.js";
import { initMemberTicketIssueModal } from "../components/member-ticket-issue-modal.js";
import { initTagInput } from "../components/tag-input.js";
import {
  buildGuardianFieldsMarkup,
  buildPetFieldsMarkup,
  GUARDIAN_EDIT_ACTIONS_MARKUP,
  PET_EDIT_ACTIONS_MARKUP,
} from "../components/member-detail-edit-templates.js";
import { renderMemberTagChips } from "../components/member-tags.js";
import {
  buildActiveReservationCountByMemberType,
  getMemberReservableCountFromReservations,
} from "../services/member-reservable-count.js";
import {
  buildMemberReservableCountsByType,
  buildMemberStatusMarkup,
} from "../services/member-status.js";
import { hasTagValue, sanitizeTagList } from "../utils/tags.js";
import { initTicketStorage } from "../storage/ticket-storage.js";
import { showToast } from "../components/toast.js";
import {
  formatTicketCount,
  formatTicketDisplayName,
  formatTicketPrice,
  getTicketReservedValue,
  getTicketReservableValue,
  getTicketUnitLabel,
  getTicketUsedValue,
} from "../services/ticket-service.js";

const MEMBER_MEMO_EMPTY_TEXT = "작성한 메모가 없습니다.";
const MEMBER_DETAIL_TICKET_BATCH_SIZE = 4;
const MEMBER_DETAIL_TICKET_SCROLL_OFFSET = 160;
const MEMBER_EDIT_FIELDS = {
  guardian: {
    title: "보호자 정보 수정",
    fields: [
      { key: "owner", label: "보호자", placeholder: "보호자 이름 입력" },
      { key: "phoneNumber", label: "연락처", placeholder: "연락처 입력" },
      { key: "address", label: "주소", placeholder: "주소 입력" },
    ],
  },
  pet: {
    title: "반려견 수정",
  },
};

function getRequiredElement(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatDateLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return text;
  }
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatDateTimeLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return formatDateLabel(text);
  }
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");
  return `${parsed.getFullYear()}년 ${parsed.getMonth() + 1}월 ${parsed.getDate()}일 ${hours}:${minutes}:${seconds}`;
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateKeyLabelDiff(targetDateKey, baseDateKey = getTodayDateKey()) {
  const targetMatch = String(targetDateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const baseMatch = String(baseDateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!targetMatch || !baseMatch) {
    return "";
  }
  const target = new Date(Number(targetMatch[1]), Number(targetMatch[2]) - 1, Number(targetMatch[3]));
  const base = new Date(Number(baseMatch[1]), Number(baseMatch[2]) - 1, Number(baseMatch[3]));
  const diff = Math.ceil((target.getTime() - base.getTime()) / 86400000);
  if (diff < 0) {
    return "";
  }
  return `${diff}일 남음`;
}

function getTicketHistoryStatus(ticket, todayKey = getTodayDateKey()) {
  const reservable = getTicketReservableValue(ticket);
  const used = getTicketUsedValue(ticket);
  const expiryDate = String(ticket?.expiryDate || "").trim();
  const isExpired = Boolean(expiryDate && expiryDate < todayKey);

  if (isExpired) {
    return { label: "만료", tone: "member-detail__ticket-status--danger", rank: 2 };
  }
  if (reservable <= 0) {
    return { label: "횟수 소진", tone: "member-detail__ticket-status--danger", rank: 3 };
  }
  if (used > 0 || getTicketReservedValue(ticket) > 0) {
    return { label: "사용 중", tone: "member-detail__ticket-status--primary", rank: 0 };
  }
  return { label: "사용 전", tone: "member-detail__ticket-status--success", rank: 1 };
}

function compareTicketHistoryRows(a, b) {
  const rankDiff = (a.status.rank || 0) - (b.status.rank || 0);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const aExpiry = String(a.ticket?.expiryDate || "");
  const bExpiry = String(b.ticket?.expiryDate || "");
  if (aExpiry && bExpiry && aExpiry !== bExpiry) {
    return aExpiry.localeCompare(bExpiry);
  }
  if (aExpiry || bExpiry) {
    return aExpiry ? -1 : 1;
  }

  const aIssue = String(a.ticket?.issueDate || "");
  const bIssue = String(b.ticket?.issueDate || "");
  return bIssue.localeCompare(aIssue);
}

function buildTicketHistoryRows(member, ticketCatalogMap) {
  const tickets = Array.isArray(member?.tickets) ? member.tickets : [];
  const todayKey = getTodayDateKey();
  return tickets
    .map((ticket, index) => {
      const catalog = ticketCatalogMap.get(String(ticket?.ticketId || "")) || {};
      const type = String(ticket?.type || catalog?.type || "").trim();
      const unitLabel = getTicketUnitLabel(type);
      const reservable = getTicketReservableValue(ticket);
      const expiryDate = String(ticket?.expiryDate || "").trim();
      const validity = Number(ticket?.validity || catalog?.validity);
      const validityUnit = String(ticket?.unit || catalog?.unit || "").trim();
      const unlimitedValidity = Boolean(catalog?.unlimitedValidity);
      const status = getTicketHistoryStatus(ticket, todayKey);
      return {
        id: String(ticket?.id || `${ticket?.ticketId || "ticket"}-${ticket?.issueDate || index}`),
        index,
        type,
        displayName: formatTicketDisplayName({
          ...catalog,
          ...ticket,
          name: ticket?.name || catalog?.name || "",
        }),
        price: Number(catalog?.price),
        reservableLabel: Number.isFinite(reservable) ? `${reservable}${unitLabel}` : "-",
        validityLabel: expiryDate
          ? formatDateLabel(expiryDate)
          : (unlimitedValidity
            ? "무제한"
            : (Number.isFinite(validity) && validity > 0 && validityUnit ? `${validity}${validityUnit}` : "-")),
        priceLabel: formatTicketPrice(Number(catalog?.price)),
        status,
        ticket,
      };
    })
    .sort(compareTicketHistoryRows);
}

function getReservationServiceLabel(reservation) {
  const type = String(reservation?.type || "").trim();
  if (type === "hoteling") {
    return "호텔링";
  }
  if (type === "daycare") {
    return "데이케어";
  }
  return "유치원";
}

function getHotelingUsageStatus(entry = {}) {
  const statusKey = String(entry?.baseStatusKey || "").trim();
  if (statusKey === "CANCELED") {
    return { key: statusKey, label: "예약 취소", tone: "member-ticket-detail__history-status--danger" };
  }
  const kind = String(entry?.kind || "").trim();
  if (kind === "checkin") {
    return { key: kind, label: "입실", tone: "member-ticket-detail__history-status--success" };
  }
  if (kind === "stay") {
    return { key: kind, label: "숙박", tone: "member-ticket-detail__history-status--success" };
  }
  if (kind === "checkout") {
    return { key: kind, label: "퇴실", tone: "member-ticket-detail__history-status--success" };
  }
  return normalizeTicketUsageStatus(statusKey || "PLANNED");
}

function normalizeTicketUsageStatus(statusKey) {
  const key = String(statusKey || "").trim();
  if (key === "ABSENT") {
    return { key, label: "결석", tone: "member-ticket-detail__history-status--danger" };
  }
  if (key === "CANCELED") {
    return { key, label: "예약 취소", tone: "member-ticket-detail__history-status--danger" };
  }
  if (key === "PLANNED") {
    return { key, label: "예약", tone: "member-ticket-detail__history-status--primary" };
  }
  if (key === "CHECKIN") {
    return { key, label: "등원", tone: "member-ticket-detail__history-status--success" };
  }
  if (key === "CHECKOUT") {
    return { key, label: "하원", tone: "member-ticket-detail__history-status--success" };
  }
  return { key, label: "등원", tone: "member-ticket-detail__history-status--success" };
}

function buildMemberTicketUsageHistory(ticket, reservations = []) {
  const issuedTicketId = String(ticket?.id || "").trim();
  if (!issuedTicketId) {
    return [];
  }
  const rows = [];
  (Array.isArray(reservations) ? reservations : []).forEach((reservation) => {
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    entries.forEach((entry) => {
      const usages = Array.isArray(entry?.ticketUsages) ? entry.ticketUsages : [];
      const hasIssuedTicket = usages.some((usage) => String(usage?.ticketId || "").trim() === issuedTicketId);
      if (!hasIssuedTicket) {
        return;
      }
      const status = reservation?.type === "hoteling"
        ? getHotelingUsageStatus(entry)
        : normalizeTicketUsageStatus(entry?.baseStatusKey || "PLANNED");
      const timestamp = String(entry?.baseStatusKey || "").trim() === "CANCELED"
        ? String(entry?.canceledAt || reservation?.updatedAt || reservation?.createdAt || "").trim()
        : String(reservation?.createdAt || "").trim();
      rows.push({
        status,
        serviceLabel: getReservationServiceLabel(reservation),
        visitDateLabel: formatDateLabel(entry?.date),
        reservationDateLabel: formatDateTimeLabel(timestamp),
        sortDate: timestamp,
        visitSortDate: String(entry?.date || "").trim(),
      });
    });
  });
  return rows.sort((a, b) => {
    const timeDiff = String(b.sortDate || "").localeCompare(String(a.sortDate || ""));
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return String(b.visitSortDate || "").localeCompare(String(a.visitSortDate || ""));
  });
}

function buildTicketUsageSummary(historyRows = [], ticket = {}) {
  const summary = {
    planned: 0,
    completed: 0,
    canceled: 0,
  };
  historyRows.forEach((row) => {
    const statusKey = String(row?.status?.key || "").trim();
    if (statusKey === "PLANNED") {
      summary.planned += 1;
    } else if (statusKey === "CANCELED" || statusKey === "ABSENT") {
      summary.canceled += 1;
    } else {
      summary.completed += 1;
    }
  });
  return [
    { label: "예약 가능", value: `${getTicketReservableValue(ticket)}${getTicketUnitLabel(ticket?.type || "")}`, tone: "is-accent" },
    { label: "예약", value: `${summary.planned}${getTicketUnitLabel(ticket?.type || "")}` },
    { label: "이용 완료", value: `${summary.completed}${getTicketUnitLabel(ticket?.type || "")}` },
    { label: "취소", value: `${summary.canceled}${getTicketUnitLabel(ticket?.type || "")}` },
  ];
}

function areSameTags(beforeTags, nextTags) {
  const before = sanitizeTagList(beforeTags);
  const next = sanitizeTagList(nextTags);
  if (before.length !== next.length) {
    return false;
  }
  return before.every((tag, index) => tag === next[index]);
}

function getAddedTags(beforeTags, nextTags) {
  const before = sanitizeTagList(beforeTags);
  return sanitizeTagList(nextTags).filter((tag) => !hasTagValue(before, tag));
}

function getEditFieldValue(member, key) {
  if (key === "phoneNumber") {
    return member?.phoneNumber || member?.phone || "";
  }
  if (key === "animalRegistrationNumber") {
    return member?.animalRegistrationNumber || member?.registrationNumber || "";
  }
  if (key === "birthDate") {
    return member?.birthDate || member?.birthday || "";
  }
  return member?.[key] || "";
}

function parseBirthDateParts(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { year: "", month: "", day: "" };
  }
  const parts = raw.split("-");
  return {
    year: parts[0] || "",
    month: parts[1] || "",
    day: parts[2] || "",
  };
}

function buildBirthDateValue(year, month, day) {
  const y = String(year || "").trim();
  const m = String(month || "").trim();
  const d = String(day || "").trim();
  if (!y) {
    return "";
  }
  const mm = m ? m.padStart(2, "0") : "";
  const dd = d ? d.padStart(2, "0") : "";
  if (mm && dd) {
    return `${y}-${mm}-${dd}`;
  }
  if (mm) {
    return `${y}-${mm}`;
  }
  return y;
}

function getAgeTextFromBirthDate(value) {
  const { year, month, day } = parseBirthDateParts(value);
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  if (!Number.isFinite(y)) {
    return "0살 0개월";
  }

  const now = new Date();
  let years = now.getFullYear() - y;
  if (!Number.isFinite(m) || !Number.isFinite(d)) {
    return `${Math.max(0, years)}살`;
  }

  let months = now.getMonth() + 1 - m;
  if (now.getDate() < d) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${Math.max(0, years)}살 ${Math.max(0, months)}개월`;
}

function normalizeGenderValue(value) {
  const text = String(value || "").trim();
  if (text === "남아") {
    return "male";
  }
  if (text === "여아") {
    return "female";
  }
  return "unknown";
}

function normalizeNeuteredValue(value) {
  const text = String(value || "").trim();
  if (text === "완료" || text === "done" || text === "true") {
    return "done";
  }
  if (text === "미완료" || text === "pending" || text === "false") {
    return "pending";
  }
  return "unknown";
}

function getPetFormState(container) {
  if (!container) {
    return null;
  }
  const dogNameInput = container.querySelector("#member-detail-edit-pet-dog-name");
  const breedInput = container.querySelector("#member-detail-edit-pet-breed");
  const memoInput = container.querySelector("#member-detail-edit-pet-memo");
  const weightInput = container.querySelector("#member-detail-edit-pet-weight");
  const registrationInput = container.querySelector("#member-detail-edit-pet-registration");
  const coatColorInput = container.querySelector("#member-detail-edit-pet-coat-color");
  const birthYearInput = container.querySelector("#member-detail-edit-pet-birth-year");
  const birthMonthInput = container.querySelector("#member-detail-edit-pet-birth-month");
  const birthDayInput = container.querySelector("#member-detail-edit-pet-birth-day");
  const selectedGender = container.querySelector("input[name=\"pet-gender\"]:checked");
  const selectedNeutered = container.querySelector("input[name=\"pet-neutered\"]:checked");

  const birthDate = buildBirthDateValue(
    birthYearInput instanceof HTMLInputElement ? birthYearInput.value : "",
    birthMonthInput instanceof HTMLInputElement ? birthMonthInput.value : "",
    birthDayInput instanceof HTMLInputElement ? birthDayInput.value : ""
  );
  const gender = selectedGender instanceof HTMLInputElement
    ? (selectedGender.value === "male" ? "남아" : selectedGender.value === "female" ? "여아" : "")
    : "";
  const neuteredStatus = selectedNeutered instanceof HTMLInputElement
    ? (selectedNeutered.value === "done" ? "완료" : selectedNeutered.value === "pending" ? "미완료" : "")
    : "";

  return {
    dogName: dogNameInput instanceof HTMLInputElement ? dogNameInput.value.trim() : "",
    breed: breedInput instanceof HTMLInputElement ? breedInput.value.trim() : "",
    memo: memoInput instanceof HTMLTextAreaElement ? memoInput.value.trim() : "",
    weight: weightInput instanceof HTMLInputElement ? weightInput.value.trim() : "",
    animalRegistrationNumber:
      registrationInput instanceof HTMLInputElement ? registrationInput.value.trim() : "",
    coatColor: coatColorInput instanceof HTMLInputElement ? coatColorInput.value.trim() : "",
    birthDate,
    gender,
    neuteredStatus,
  };
}

function hasPetStateChanged(member, petFormState) {
  const current = petFormState || {};
  return (
    current.dogName !== getEditFieldValue(member, "dogName")
    || current.breed !== getEditFieldValue(member, "breed")
    || current.memo !== getEditFieldValue(member, "memo")
    || current.weight !== getEditFieldValue(member, "weight")
    || current.animalRegistrationNumber !== getEditFieldValue(member, "animalRegistrationNumber")
    || current.coatColor !== getEditFieldValue(member, "coatColor")
    || current.birthDate !== getEditFieldValue(member, "birthDate")
    || current.gender !== String(getEditFieldValue(member, "gender") || "").trim()
    || current.neuteredStatus !== String(getEditFieldValue(member, "neuteredStatus") || "").trim()
  );
}

function buildPetPatchFromState(petFormState, tags) {
  const current = petFormState || {};
  return {
    dogName: current.dogName || "",
    breed: current.breed || "",
    memo: current.memo || "",
    weight: current.weight || "",
    animalRegistrationNumber: current.animalRegistrationNumber || "",
    coatColor: current.coatColor || "",
    petTags: sanitizeTagList(tags),
    birthDate: current.birthDate || "",
    birthday: current.birthDate || "",
    registrationNumber: current.animalRegistrationNumber || "",
    gender: current.gender || "",
    neuteredStatus: current.neuteredStatus || "",
  };
}

function initMemberDetailEditModal({ modal, onSaved } = {}) {
  if (!modal) {
    return null;
  }
  const overlay = modal.querySelector("[data-member-detail-edit-overlay]");
  const closeButton = modal.querySelector("[data-member-detail-edit-close]");
  const titleEl = modal.querySelector("[data-member-detail-edit-title]");
  const memberEl = modal.querySelector("[data-member-detail-edit-member]");
  const fieldsEl = modal.querySelector("[data-member-detail-edit-fields]");
  const actionsEl = modal.querySelector(".member-edit-modal__actions");

  const state = {
    memberId: "",
    section: "guardian",
    member: null,
    initialTags: [],
    tagInputController: null,
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    state.tagInputController = null;
  };

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const hasPetFieldChanges = () => {
    if (state.section !== "pet" || !fieldsEl) {
      return false;
    }
    return hasPetStateChanged(state.member, getPetFormState(fieldsEl));
  };

  const getCurrentTags = () => (
    state.tagInputController?.getTags?.() || state.initialTags
  );

  const updateSaveButtonState = () => {
    const saveButton = actionsEl?.querySelector("[data-member-detail-edit-save]");
    if (!(saveButton instanceof HTMLButtonElement)) {
      return;
    }
    if (state.section === "guardian") {
      const currentTags = getCurrentTags();
      saveButton.disabled = areSameTags(state.initialTags, currentTags);
      return;
    }
    if (state.section === "pet") {
      const currentTags = getCurrentTags();
      const hasTagChange = !areSameTags(state.initialTags, currentTags);
      saveButton.disabled = !(hasTagChange || hasPetFieldChanges());
      return;
    }
    saveButton.disabled = true;
  };

  const initTagEditor = (initialTags = []) => {
    state.initialTags = sanitizeTagList(initialTags);
    state.tagInputController = initTagInput({
      container: fieldsEl?.querySelector("[data-member-tag-editor]"),
      initialTags: state.initialTags,
      getCatalog: () => loadMemberTagCatalog(),
      onChange: () => {
        updateSaveButtonState();
      },
    });
    updateSaveButtonState();
  };

  const renderEditSection = ({ fieldsMarkup = "", actionsMarkup = "", initialTags = [] } = {}) => {
    if (memberEl) {
      memberEl.hidden = true;
    }
    if (!fieldsEl || !actionsEl) {
      return false;
    }
    fieldsEl.innerHTML = fieldsMarkup;
    actionsEl.innerHTML = actionsMarkup;
    initTagEditor(initialTags);
    return true;
  };

  const renderGuardianFields = () => {
    const ownerValue = getEditFieldValue(state.member, "owner") || "김OO";
    const phoneValue = getEditFieldValue(state.member, "phoneNumber") || "010-XXXX-XXXX";
    const fieldsMarkup = buildGuardianFieldsMarkup({
      owner: escapeHtml(ownerValue),
      phone: escapeHtml(phoneValue),
    });
    renderEditSection({
      fieldsMarkup,
      actionsMarkup: GUARDIAN_EDIT_ACTIONS_MARKUP,
      initialTags: state.member?.ownerTags,
    });
  };

  const renderPetFields = () => {
    const dogName = escapeHtml(getEditFieldValue(state.member, "dogName"));
    const breed = escapeHtml(getEditFieldValue(state.member, "breed"));
    const weight = escapeHtml(getEditFieldValue(state.member, "weight"));
    const registration = escapeHtml(getEditFieldValue(state.member, "animalRegistrationNumber"));
    const coatColor = escapeHtml(getEditFieldValue(state.member, "coatColor"));
    const birthDate = getEditFieldValue(state.member, "birthDate");
    const birth = parseBirthDateParts(birthDate);
    const memo = escapeHtml(getEditFieldValue(state.member, "memo"));
    const genderValue = normalizeGenderValue(getEditFieldValue(state.member, "gender"));
    const neuteredValue = normalizeNeuteredValue(getEditFieldValue(state.member, "neuteredStatus"));

    const fieldsMarkup = buildPetFieldsMarkup({
      dogName,
      breed,
      memo,
      weight,
      registration,
      coatColor,
      birthYear: escapeHtml(birth.year),
      birthMonth: escapeHtml(birth.month),
      birthDay: escapeHtml(birth.day),
      genderValue,
      neuteredValue,
    });
    renderEditSection({
      fieldsMarkup,
      actionsMarkup: PET_EDIT_ACTIONS_MARKUP,
      initialTags: state.member?.petTags,
    });
  };

  const render = () => {
    const config = MEMBER_EDIT_FIELDS[state.section] || MEMBER_EDIT_FIELDS.guardian;
    modal.classList.toggle("member-edit-modal--guardian", state.section === "guardian");
    modal.classList.toggle("member-edit-modal--pet", state.section === "pet");
    if (titleEl) {
      titleEl.textContent = state.section === "guardian" ? "보호자 수정" : config.title;
    }
    if (state.section === "guardian") {
      renderGuardianFields();
      return;
    }
    renderPetFields();
  };

  const saveGuardianTagChanges = (tagPatch) => {
    const updated = updateIssueMember(state.memberId, { ownerTags: tagPatch });
    if (updated) {
      const addedTags = getAddedTags(state.initialTags, tagPatch);
      if (addedTags.length) {
        mergeMemberTagCatalog(addedTags);
      }
    }
    if (updated && typeof onSaved === "function") {
      onSaved(updated);
    }
    closeModal();
  };

  const savePetChanges = (tagPatch) => {
    const patch = buildPetPatchFromState(getPetFormState(fieldsEl), tagPatch);
    const updated = updateIssueMember(state.memberId, patch);
    if (updated) {
      const addedTags = getAddedTags(state.initialTags, tagPatch);
      if (addedTags.length) {
        mergeMemberTagCatalog(addedTags);
      }
    }
    if (updated && typeof onSaved === "function") {
      onSaved(updated);
    }
    closeModal();
  };

  const handleActionClick = (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("button")
      : null;
    if (!button) {
      return;
    }
    if (button.hasAttribute("data-member-detail-edit-cancel")) {
      closeModal();
      return;
    }
    if (button.hasAttribute("data-member-detail-edit-delete")) {
      closeModal();
      return;
    }
    if (!button.hasAttribute("data-member-detail-edit-save")) {
      return;
    }
    const tagPatch = sanitizeTagList(getCurrentTags());
    if (state.section === "guardian") {
      saveGuardianTagChanges(tagPatch);
      return;
    }
    if (state.section === "pet") {
      savePetChanges(tagPatch);
    }
  };

  const handleFieldInput = (event) => {
    if (state.section !== "pet") {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return;
    }
    updateSaveButtonState();
  };

  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);
  actionsEl?.addEventListener("click", handleActionClick);
  fieldsEl?.addEventListener("input", handleFieldInput);

  return {
    openModalWithMember(member, section = "guardian") {
      if (!member) {
        return;
      }
      state.memberId = String(member.id || "");
      state.section = section === "pet" ? "pet" : "guardian";
      state.member = member;
      render();
      openModal();
    },
  };
}

function renderSiblings(container, siblings) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (!Array.isArray(siblings) || siblings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "member-detail__empty";
    empty.textContent = "등록된 반려견이 없습니다.";
    container.appendChild(empty);
    return;
  }
  siblings.forEach((sibling) => {
    const row = document.createElement("div");
    row.className = "member-detail__sibling-row";
    row.innerHTML = `
      <strong>${sibling.dogName}</strong>
      <span>${sibling.breed}</span>
    `;
    container.appendChild(row);
  });
}

function syncTagCatalogFromMembers(members) {
  if (loadMemberTagCatalog().length) {
    return;
  }
  const list = Array.isArray(members) ? members : [];
  const allTags = [];
  list.forEach((member) => {
    allTags.push(...sanitizeTagList(member?.ownerTags));
    allTags.push(...sanitizeTagList(member?.petTags));
  });
  if (allTags.length) {
    mergeMemberTagCatalog(allTags);
  }
}

function getMemberDetailElements() {
  return {
    dogName: getRequiredElement("[data-member-dog-name]"),
    breed: getRequiredElement("[data-member-breed]"),
    statusBox: getRequiredElement("[data-member-status]"),
    memo: getRequiredElement("[data-member-memo]"),
    memoEmpty: getRequiredElement("[data-member-memo-empty]"),
    owner: getRequiredElement("[data-member-owner]"),
    phone: getRequiredElement("[data-member-phone]"),
    address: getRequiredElement("[data-member-address]"),
    birthDate: getRequiredElement("[data-member-birth-date]"),
    registration: getRequiredElement("[data-member-registration]"),
    coatColor: getRequiredElement("[data-member-coat-color]"),
    weight: getRequiredElement("[data-member-weight]"),
    gender: getRequiredElement("[data-member-gender]"),
    ownerTags: getRequiredElement("[data-member-owner-tags]"),
    petTags: getRequiredElement("[data-member-pet-tags]"),
    reservableSummary: getRequiredElement("[data-member-reservable-summary]"),
    ticketTable: getRequiredElement("[data-member-ticket-table]"),
    ticketRows: getRequiredElement("[data-member-ticket-rows]"),
    ticketEmpty: getRequiredElement("[data-member-ticket-empty]"),
    ticketDetailModal: getRequiredElement("[data-member-ticket-detail-modal]"),
    ticketDetailOverlay: getRequiredElement("[data-member-ticket-detail-overlay]"),
    ticketDetailClose: getRequiredElement("[data-member-ticket-detail-close]"),
    ticketDetailName: getRequiredElement("[data-member-ticket-detail-name]"),
    ticketDetailMeta: getRequiredElement("[data-member-ticket-detail-meta]"),
    ticketDetailStatus: getRequiredElement("[data-member-ticket-detail-status]"),
    ticketDetailIssued: getRequiredElement("[data-member-ticket-detail-issued]"),
    ticketDetailStart: getRequiredElement("[data-member-ticket-detail-start]"),
    ticketDetailExpiry: getRequiredElement("[data-member-ticket-detail-expiry]"),
    ticketDetailSummary: getRequiredElement("[data-member-ticket-detail-summary]"),
    ticketDetailHistory: getRequiredElement("[data-member-ticket-detail-history]"),
    ticketDetailEmpty: getRequiredElement("[data-member-ticket-detail-empty]"),
  };
}

function setTextContent(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function formatMemberWeight(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") {
    return "-";
  }
  return /kg$/i.test(text) ? text : `${text}kg`;
}

function formatMemberGender(value, neuteredStatus) {
  const genderText = String(value ?? "").trim();
  if (!genderText || genderText === "-") {
    return "-";
  }
  const neuteredText = String(neuteredStatus ?? "").trim();
  if (!neuteredText || neuteredText === "-") {
    return genderText;
  }
  return `${genderText} (중성화 ${neuteredText})`;
}

function renderMemberDetail(viewModel) {
  const elements = getMemberDetailElements();
  const memoText = viewModel.memo === "-" ? "" : viewModel.memo;

  setTextContent(elements.dogName, viewModel.dogName);
  setTextContent(elements.breed, viewModel.breed);
  if (elements.statusBox) {
    elements.statusBox.innerHTML = buildMemberStatusMarkup(viewModel?.reservableCountByType || {});
  }
  if (elements.memo instanceof HTMLElement) {
    elements.memo.textContent = memoText;
    elements.memo.hidden = !memoText;
  }
  if (elements.memoEmpty instanceof HTMLElement) {
    elements.memoEmpty.textContent = MEMBER_MEMO_EMPTY_TEXT;
    elements.memoEmpty.hidden = Boolean(memoText);
  }
  setTextContent(elements.owner, viewModel.owner);
  setTextContent(elements.phone, viewModel.phone);
  setTextContent(elements.address, viewModel.address);
  setTextContent(elements.birthDate, viewModel.birthDate);
  setTextContent(elements.registration, viewModel.animalRegistrationNumber);
  setTextContent(elements.coatColor, viewModel.coatColor);
  setTextContent(elements.weight, formatMemberWeight(viewModel.weight));
  setTextContent(elements.gender, formatMemberGender(viewModel.gender, viewModel.neuteredStatus));
  if (elements.reservableSummary) {
    const reservableCount = Number(viewModel.reservableCount);
    const isOverbooked = Number.isFinite(reservableCount) && reservableCount < 0;
    elements.reservableSummary.textContent = isOverbooked
      ? `(초과 예약 ${Math.abs(reservableCount)}회)`
      : `(예약 가능 ${viewModel.reservableCount}회)`;
    elements.reservableSummary.classList.toggle("member-detail-page__tickets-summary--overbooked", isOverbooked);
  }
  renderMemberTagChips(elements.ownerTags, viewModel.ownerTags, { hiddenWhenEmpty: true });
  renderMemberTagChips(elements.petTags, viewModel.petTags, { hiddenWhenEmpty: true });
}

function initMemberTicketHistory(options = {}) {
  const elements = getMemberDetailElements();
  const ticketStorage = initTicketStorage();
  const reservationStorage = initReservationStorage();
  const onQuantityChanged = typeof options?.onQuantityChanged === "function"
    ? options.onQuantityChanged
    : null;
  const state = {
    visibleCount: MEMBER_DETAIL_TICKET_BATCH_SIZE,
    totalCount: 0,
  };

  const render = (member) => {
    const catalogTickets = ticketStorage.loadTickets();
    const rows = buildTicketHistoryRows(member, new Map(
      (Array.isArray(catalogTickets) ? catalogTickets : [])
        .map((ticket) => [String(ticket?.id || ""), ticket])
    ));
    const totalCount = rows.length;
    state.totalCount = totalCount;
    const visibleCount = Math.min(totalCount, state.visibleCount);
    const visibleRows = rows.slice(0, visibleCount);

    if (elements.ticketTable) {
      elements.ticketTable.hidden = totalCount === 0;
    }
    if (elements.ticketEmpty) {
      elements.ticketEmpty.hidden = totalCount !== 0;
    }
    if (elements.ticketRows) {
      elements.ticketRows.innerHTML = "";
      visibleRows.forEach((row) => {
        const item = document.createElement("div");
        item.className = "member-detail__ticket-card";
        item.dataset.ticketHistoryRowId = row.id;
        const reservableValue = getTicketReservableValue(row.ticket);
        const isOverbooked = reservableValue < 0;
        const reservableClass = isOverbooked
          ? " member-detail__ticket-card-reservable--overbooked"
          : "";
        const reservableText = isOverbooked
          ? `초과 예약 : ${Math.abs(reservableValue)}${getTicketUnitLabel(row.type)}`
          : `예약 가능 : ${row.reservableLabel}`;
        item.innerHTML = `
          <div class="member-detail__ticket-card-copy">
            <span class="member-detail__ticket-status ${row.status.tone}">${escapeHtml(row.status.label)}</span>
            <strong class="member-detail__ticket-card-title">${escapeHtml(row.displayName || "-")}</strong>
            <div class="member-detail__ticket-card-meta">
              <span class="member-detail__ticket-card-reservable${reservableClass}">${escapeHtml(reservableText)}</span>
              <span class="member-detail__ticket-card-divider" aria-hidden="true"></span>
              <span>유효기간 : ${escapeHtml(buildTicketCardValidityLabel(row.ticket, row.validityLabel))}</span>
            </div>
          </div>
          <div class="member-detail__ticket-card-action">
            <button
              class="icon-button icon-button--secondary member-detail__ticket-detail-trigger"
              type="button"
              data-member-ticket-detail-open="${escapeHtml(row.id)}"
              aria-label="이용권 상세 열기"
            >
              <img class="member-detail__ticket-chevron" src="../../assets/iconChevronRight.svg" alt="" aria-hidden="true">
            </button>
          </div>
        `;
        elements.ticketRows.appendChild(item);
      });
    }
    window.requestAnimationFrame(handleTicketListScroll);
  };

  const loadNextTicketBatch = () => {
    if (state.visibleCount >= state.totalCount) {
      return;
    }
    state.visibleCount += MEMBER_DETAIL_TICKET_BATCH_SIZE;
    const memberId = new URLSearchParams(window.location.search).get("memberId") || "";
    const latestMember = findMemberById(loadIssueMembers(), memberId);
    render(latestMember);
  };

  const handleTicketListScroll = () => {
    if (!elements.ticketRows || state.visibleCount >= state.totalCount) {
      return;
    }
    const listBottom = elements.ticketRows.getBoundingClientRect().bottom;
    if (listBottom <= window.innerHeight + MEMBER_DETAIL_TICKET_SCROLL_OFFSET) {
      loadNextTicketBatch();
    }
  };

  window.addEventListener("scroll", handleTicketListScroll, { passive: true });

  elements.ticketRows?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const quantityButton = target.closest("[data-member-ticket-quantity-adjust]");
    if (quantityButton instanceof HTMLButtonElement) {
      const ticketId = quantityButton.dataset.memberTicketId || "";
      const action = quantityButton.dataset.memberTicketQuantityAdjust || "";
      const delta = action === "decrease" ? -1 : action === "increase" ? 1 : 0;
      if (!ticketId || delta === 0) {
        return;
      }
      const memberId = new URLSearchParams(window.location.search).get("memberId") || "";
      if (!updateMemberTicketQuantity(memberId, ticketId, delta)) {
        return;
      }
      if (onQuantityChanged) {
        onQuantityChanged();
      } else {
        const latestMember = findMemberById(loadIssueMembers(), memberId);
        render(latestMember);
      }
      showToast("변경되었습니다.");
      return;
    }
    const detailButton = target.closest("[data-member-ticket-detail-open]");
    if (!(detailButton instanceof HTMLButtonElement)) {
      return;
    }
    const ticketId = detailButton.dataset.memberTicketDetailOpen || "";
    if (!ticketId) {
      return;
    }
    const memberId = new URLSearchParams(window.location.search).get("memberId") || "";
    const latestMember = findMemberById(loadIssueMembers(), memberId);
    const issuedTicket = (Array.isArray(latestMember?.tickets) ? latestMember.tickets : [])
      .find((ticket) => String(ticket?.id || "").trim() === ticketId);
    if (!issuedTicket) {
      return;
    }
    const catalogTicket = (Array.isArray(ticketStorage.loadTickets()) ? ticketStorage.loadTickets() : [])
      .find((ticket) => String(ticket?.id || "").trim() === String(issuedTicket?.ticketId || "").trim()) || {};
    const historyRows = buildMemberTicketUsageHistory(issuedTicket, reservationStorage.loadReservations());
    const summaryItems = buildTicketUsageSummary(historyRows, issuedTicket);
    setTextContent(elements.ticketDetailName, formatTicketDisplayName({
      ...catalogTicket,
      ...issuedTicket,
      name: issuedTicket?.name || catalogTicket?.name || "",
    }));
    setTextContent(elements.ticketDetailMeta, buildTicketMetaText(issuedTicket, catalogTicket));
    if (elements.ticketDetailStatus) {
      elements.ticketDetailStatus.textContent = getTicketHistoryStatus(issuedTicket).label;
      elements.ticketDetailStatus.className = `member-ticket-detail__status ${getTicketHistoryStatus(issuedTicket).tone}`;
    }
    setTextContent(elements.ticketDetailIssued, formatDateLabel(issuedTicket?.issueDate));
    setTextContent(elements.ticketDetailStart, formatDateLabel(issuedTicket?.startDate));
    setTextContent(elements.ticketDetailExpiry, buildTicketExpiryText(issuedTicket, catalogTicket));
    if (elements.ticketDetailSummary) {
      elements.ticketDetailSummary.innerHTML = summaryItems
        .map((item) => `<span class="member-ticket-detail__summary-item ${item.tone || ""}"><strong>${escapeHtml(item.label)}</strong> ${escapeHtml(item.value)}</span>`)
        .join('<span class="member-ticket-detail__summary-dot" aria-hidden="true"></span>');
    }
    if (elements.ticketDetailHistory) {
      elements.ticketDetailHistory.innerHTML = "";
      historyRows.forEach((row) => {
        const item = document.createElement("div");
        item.className = "member-ticket-detail__history-row";
        item.innerHTML = `
          <span class="member-ticket-detail__history-status ${row.status.tone}">${escapeHtml(row.status.label)}</span>
          <span>${escapeHtml(row.serviceLabel)}</span>
          <span>${escapeHtml(row.visitDateLabel)}</span>
          <span>${escapeHtml(row.reservationDateLabel)}</span>
        `;
        elements.ticketDetailHistory.appendChild(item);
      });
    }
    if (elements.ticketDetailEmpty) {
      elements.ticketDetailEmpty.hidden = historyRows.length > 0;
    }
    elements.ticketDetailModal?.classList.add("is-open");
    elements.ticketDetailModal?.setAttribute("aria-hidden", "false");
  });

  return {
    render,
    reset() {
      state.visibleCount = MEMBER_DETAIL_TICKET_BATCH_SIZE;
    },
  };
}

function buildTicketMetaText(ticket, catalogTicket) {
  const totalLabel = formatTicketCount(
    String(ticket?.type || catalogTicket?.type || "").trim() === "daycare"
      ? Number(ticket?.totalHours)
      : Number(ticket?.totalCount),
    ticket?.type || catalogTicket?.type || ""
  );
  const validityText = buildTicketValidityText(ticket, catalogTicket);
  return `(${totalLabel} / ${validityText} / ${formatTicketPrice(Number(catalogTicket?.price))})`;
}

function buildTicketCardValidityLabel(ticket, fallbackText) {
  const expiryDate = String(ticket?.expiryDate || "").trim();
  const remainText = expiryDate ? getDateKeyLabelDiff(expiryDate) : "";
  return remainText || String(fallbackText || "-");
}

function buildTicketValidityText(ticket, catalogTicket) {
  if (catalogTicket?.unlimitedValidity) {
    return "무제한";
  }
  const validity = Number(ticket?.validity || catalogTicket?.validity);
  const unit = String(ticket?.unit || catalogTicket?.unit || "").trim();
  return Number.isFinite(validity) && validity > 0 && unit ? `${validity}${unit}` : "-";
}

function buildTicketExpiryText(ticket, catalogTicket) {
  const expiryDate = String(ticket?.expiryDate || "").trim();
  if (!expiryDate) {
    return buildTicketValidityText(ticket, catalogTicket);
  }
  const remainText = getDateKeyLabelDiff(expiryDate);
  return remainText
    ? `${formatDateLabel(expiryDate)} (${remainText})`
    : formatDateLabel(expiryDate);
}

function setupMemberDetailAccordions() {
  const bindAccordion = (toggleSelector, contentSelector) => {
    const toggle = document.querySelector(toggleSelector);
    const content = document.querySelector(contentSelector);
    if (!(toggle instanceof HTMLButtonElement) || !(content instanceof HTMLElement)) {
      return null;
    }
    const setExpanded = (expanded) => {
      toggle.setAttribute("aria-expanded", String(expanded));
      content.hidden = !expanded;
    };
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      setExpanded(!expanded);
    });
    setExpanded(false);
    return { open: () => setExpanded(true) };
  };

  const info = bindAccordion("[data-member-detail-info-toggle]", "[data-member-detail-info-content]");
  bindAccordion("[data-member-detail-memo-toggle]", "[data-member-detail-memo-content]");
  if (!info) {
    return;
  }
  const openButton = document.querySelector("[data-member-detail-edit-open]");
  openButton?.addEventListener("click", () => {
    info.open();
  });
}

function bindActions(memberId) {
  const backButton = getRequiredElement("[data-member-detail-back]");
  const issueButton = getRequiredElement("[data-member-detail-issue]");
  const memoEditButton = getRequiredElement("[data-member-detail-memo-edit]");
  const editButtons = document.querySelectorAll("[data-member-detail-edit]");
  const issueModal = document.querySelector("[data-member-ticket-issue-modal]");
  const editModal = document.querySelector("[data-member-detail-edit-modal]");
  const ticketDetailModal = document.querySelector("[data-member-ticket-detail-modal]");
  const ticketDetailOverlay = document.querySelector("[data-member-ticket-detail-overlay]");
  const ticketDetailClose = document.querySelector("[data-member-ticket-detail-close]");
  const createLatestViewModel = () => {
    const latestMember = findMemberById(loadIssueMembers(), memberId);
    const reservationStorage = initReservationStorage();
    const activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    const reservableCountByType = buildMemberReservableCountsByType(
      latestMember || {},
      activeReservationCountsByMemberType
    );
    const reservableCount = getMemberReservableCountFromReservations(
      latestMember || {},
      activeReservationCountsByMemberType
    );
    const latestViewModel = buildMemberDetailViewModel(
      latestMember || {},
      { reservableCount, reservableCountByType }
    );
    return { latestMember, latestViewModel };
  };

  const rerenderMember = () => {
    const { latestMember, latestViewModel } = createLatestViewModel();
    renderMemberDetail(latestViewModel);
    ticketHistory.render(latestMember);
  };
  const ticketHistory = initMemberTicketHistory({
    onQuantityChanged: rerenderMember,
  });

  const withLatestMember = (callback) => {
    if (typeof callback !== "function") {
      return;
    }
    const { latestMember } = createLatestViewModel();
    if (!latestMember) {
      return;
    }
    callback(latestMember);
  };

  const issueModalController = initMemberTicketIssueModal({
    modal: issueModal,
    onIssued: rerenderMember,
  });
  const editModalController = initMemberDetailEditModal({
    modal: editModal,
    onSaved: rerenderMember,
  });
  backButton?.addEventListener("click", () => {
    window.location.href = "./members.html";
  });
  memoEditButton?.addEventListener("click", () => {
    document.querySelector("[data-member-detail-edit-open]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
  });
  issueButton?.addEventListener("click", () => {
    if (!issueModalController) {
      return;
    }
    withLatestMember((latestMember) => {
      issueModalController.openModalWithMember(latestMember);
    });
  });
  editButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!editModalController) {
        return;
      }
      const section = button.dataset.memberDetailEdit === "pet" ? "pet" : "guardian";
      withLatestMember((latestMember) => {
        editModalController.openModalWithMember(latestMember, section);
      });
    });
  });
  const closeTicketDetailModal = () => {
    ticketDetailModal?.classList.remove("is-open");
    ticketDetailModal?.setAttribute("aria-hidden", "true");
  };
  const handleTicketDetailKeydown = (event) => {
    if (event.key !== "Escape" || !ticketDetailModal?.classList.contains("is-open")) {
      return;
    }
    closeTicketDetailModal();
  };
  ticketDetailOverlay?.addEventListener("click", closeTicketDetailModal);
  ticketDetailClose?.addEventListener("click", closeTicketDetailModal);
  document.addEventListener("keydown", handleTicketDetailKeydown);

  const { latestMember } = createLatestViewModel();
  ticketHistory.render(latestMember);
}

function initMemberDetailView() {
  ensureMemberDefaults();
  recalculateTicketCounts();

  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("memberId") || "";
  const members = loadIssueMembers();
  syncTagCatalogFromMembers(members);
  const member = findMemberById(members, memberId);
  const reservationStorage = initReservationStorage();
  const activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
    reservationStorage.loadReservations()
  );
  const reservableCountByType = buildMemberReservableCountsByType(
    member || {},
    activeReservationCountsByMemberType
  );
  const reservableCount = getMemberReservableCountFromReservations(
    member || {},
    activeReservationCountsByMemberType
  );
  const viewModel = buildMemberDetailViewModel(member || {}, { reservableCount, reservableCountByType });
  renderMemberDetail(viewModel);
  bindActions(memberId);
}

function bootstrapMemberDetailPage() {
  const storage = initReservationStorage();
  const timeZone = getTimeZone();
  setupSidebarToggle({
    iconOpen: "../../assets/menuIcon_sidebar_open.svg",
    iconClose: "../../assets/menuIcon_sidebar_close.svg",
  });
  setupSidebarReservationBadges({ storage, timeZone });
  setupMemberDetailAccordions();
  initMemberDetailView();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMemberDetailPage);
} else {
  bootstrapMemberDetailPage();
}
