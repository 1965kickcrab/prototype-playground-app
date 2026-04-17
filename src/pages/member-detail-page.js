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
  getTicketReservableValue,
  getTicketUnitLabel,
} from "../services/ticket-service.js";
import {
  buildTicketCardValidityLabel,
  buildTicketHistoryRows,
} from "../services/member-ticket-usage-detail-service.js";

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
    ticketTable: getRequiredElement("[data-member-ticket-table]"),
    ticketRows: getRequiredElement("[data-member-ticket-rows]"),
    ticketEmpty: getRequiredElement("[data-member-ticket-empty]"),
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
  renderMemberTagChips(elements.ownerTags, viewModel.ownerTags, { hiddenWhenEmpty: true });
  renderMemberTagChips(elements.petTags, viewModel.petTags, { hiddenWhenEmpty: true });
}

function initMemberTicketHistory(options = {}) {
  const elements = getMemberDetailElements();
  const ticketStorage = initTicketStorage();
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
              class="icon-button icon-button--secondary member-detail__ticket-usage-trigger"
              type="button"
              data-member-ticket-usage-open="${escapeHtml(row.id)}"
              aria-label="이용권 사용 내역 열기"
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
    const detailButton = target.closest("[data-member-ticket-usage-open]");
    if (!(detailButton instanceof HTMLButtonElement)) {
      return;
    }
    const ticketId = detailButton.dataset.memberTicketUsageOpen || "";
    if (!ticketId) {
      return;
    }
    const memberId = new URLSearchParams(window.location.search).get("memberId") || "";
    const params = new URLSearchParams({ memberId, ticketId });
    window.location.href = `./member-ticket-usage.html?${params.toString()}`;
  });

  return {
    render,
    reset() {
      state.visibleCount = MEMBER_DETAIL_TICKET_BATCH_SIZE;
    },
  };
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

function setupMemberStatusMouseSwipe() {
  const scroller = document.querySelector("[data-member-status]");
  if (!(scroller instanceof HTMLElement)) {
    return;
  }

  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;
  let suppressClick = false;

  const stopDragging = () => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    scroller.classList.remove("is-dragging");
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  };

  scroller.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    isDragging = true;
    suppressClick = false;
    startX = event.clientX;
    startScrollLeft = scroller.scrollLeft;
    scroller.classList.add("is-dragging");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!isDragging) {
      return;
    }
    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) > 4) {
      suppressClick = true;
    }
    scroller.scrollLeft = startScrollLeft - deltaX;
    event.preventDefault();
  });

  window.addEventListener("mouseup", stopDragging);
  window.addEventListener("blur", stopDragging);
  scroller.addEventListener("click", (event) => {
    if (!suppressClick) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function bindActions(memberId) {
  const backButton = getRequiredElement("[data-member-detail-back]");
  const issueButton = getRequiredElement("[data-member-detail-issue]");
  const memoEditButton = getRequiredElement("[data-member-detail-memo-edit]");
  const editButtons = document.querySelectorAll("[data-member-detail-edit]");
  const issueModal = document.querySelector("[data-member-ticket-issue-modal]");
  const editModal = document.querySelector("[data-member-detail-edit-modal]");
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
  setupMemberStatusMouseSwipe();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMemberDetailPage);
} else {
  bootstrapMemberDetailPage();
}
