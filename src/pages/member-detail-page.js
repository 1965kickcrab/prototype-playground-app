import {
  ensureMemberDefaults,
  loadIssueMembers,
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
import { sanitizeTagList } from "../utils/tags.js";

const MEMBER_MEMO_PLACEHOLDER = "성격, 알러지 등 필요한 내용 입력 (최대 500자)";
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
  const weightInput = container.querySelector("#member-detail-edit-pet-weight");
  const registrationInput = container.querySelector("#member-detail-edit-pet-registration");
  const coatColorInput = container.querySelector("#member-detail-edit-pet-coat-color");
  const birthYearInput = container.querySelector("#member-detail-edit-pet-birth-year");
  const birthMonthInput = container.querySelector("#member-detail-edit-pet-birth-month");
  const birthDayInput = container.querySelector("#member-detail-edit-pet-birth-day");
  const ageInput = container.querySelector("#member-detail-edit-pet-age");
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
    weight: weightInput instanceof HTMLInputElement ? weightInput.value.trim() : "",
    animalRegistrationNumber:
      registrationInput instanceof HTMLInputElement ? registrationInput.value.trim() : "",
    coatColor: coatColorInput instanceof HTMLInputElement ? coatColorInput.value.trim() : "",
    birthDate,
    gender,
    neuteredStatus,
    ageInput: ageInput instanceof HTMLInputElement ? ageInput : null,
  };
}

function hasPetStateChanged(member, petFormState) {
  const current = petFormState || {};
  return (
    current.dogName !== getEditFieldValue(member, "dogName")
    || current.breed !== getEditFieldValue(member, "breed")
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

  const updateSaveButtonState = () => {
    const saveButton = actionsEl?.querySelector("[data-member-detail-edit-save]");
    if (!(saveButton instanceof HTMLButtonElement)) {
      return;
    }
    if (state.section === "guardian") {
      const currentTags = state.tagInputController?.getTags?.() || [];
      saveButton.disabled = areSameTags(state.initialTags, currentTags);
      return;
    }
    if (state.section === "pet") {
      const currentTags = state.tagInputController?.getTags?.() || [];
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
    const ageText = escapeHtml(getAgeTextFromBirthDate(birthDate));
    const genderValue = normalizeGenderValue(getEditFieldValue(state.member, "gender"));
    const neuteredValue = normalizeNeuteredValue(getEditFieldValue(state.member, "neuteredStatus"));

    const fieldsMarkup = buildPetFieldsMarkup({
      dogName,
      breed,
      weight,
      registration,
      coatColor,
      birthYear: escapeHtml(birth.year),
      birthMonth: escapeHtml(birth.month),
      birthDay: escapeHtml(birth.day),
      ageText,
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
      mergeMemberTagCatalog(tagPatch);
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
      mergeMemberTagCatalog(tagPatch);
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
    const tagPatch = sanitizeTagList(state.tagInputController?.getTags?.() || []);
    if (state.section === "guardian") {
      saveGuardianTagChanges(tagPatch);
      return;
    }
    if (state.section === "pet") {
      savePetChanges(tagPatch);
    }
  };

  const handleFieldClick = (event) => {
    if (state.section !== "pet") {
      return;
    }
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-pet-edit-clear]")
      : null;
    if (!button) {
      return;
    }
    const key = button.dataset.petEditClear || "";
    if (key !== "breed") {
      return;
    }
    const breedInput = fieldsEl.querySelector("#member-detail-edit-pet-breed");
    if (breedInput instanceof HTMLInputElement) {
      breedInput.value = "";
      breedInput.focus();
      updateSaveButtonState();
    }
  };

  const handleFieldInput = (event) => {
    if (state.section !== "pet") {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const petFormState = getPetFormState(fieldsEl);
    if (petFormState?.ageInput instanceof HTMLInputElement) {
      petFormState.ageInput.value = getAgeTextFromBirthDate(petFormState.birthDate || "");
    }
    updateSaveButtonState();
  };

  overlay?.addEventListener("click", closeModal);
  closeButton?.addEventListener("click", closeModal);
  actionsEl?.addEventListener("click", handleActionClick);
  fieldsEl?.addEventListener("click", handleFieldClick);
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
    reservableCount: getRequiredElement("[data-member-reservable-count]"),
    statusBox: getRequiredElement("[data-member-status]"),
    memo: getRequiredElement("[data-member-memo]"),
    owner: getRequiredElement("[data-member-owner]"),
    phone: getRequiredElement("[data-member-phone]"),
    address: getRequiredElement("[data-member-address]"),
    birthDate: getRequiredElement("[data-member-birth-date]"),
    registration: getRequiredElement("[data-member-registration]"),
    coatColor: getRequiredElement("[data-member-coat-color]"),
    weight: getRequiredElement("[data-member-weight]"),
    gender: getRequiredElement("[data-member-gender]"),
    siblings: getRequiredElement("[data-member-siblings]"),
    ownerTags: getRequiredElement("[data-member-owner-tags]"),
    petTags: getRequiredElement("[data-member-pet-tags]"),
  };
}

function setTextContent(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function renderMemberDetail(viewModel) {
  const elements = getMemberDetailElements();

  setTextContent(elements.dogName, viewModel.dogName);
  setTextContent(elements.breed, viewModel.breed);
  if (elements.reservableCount) {
    elements.reservableCount.textContent = viewModel.reservableCount < 0
      ? `초과 ${Math.abs(viewModel.reservableCount)}회`
      : `${viewModel.reservableCount}회`;
    elements.reservableCount.classList.toggle("member-table__count-over", viewModel.reservableCount < 0);
  }
  if (elements.statusBox) {
    const isLow = viewModel.reservableCount <= 2;
    elements.statusBox.classList.toggle("member-detail__status--low", isLow);
    elements.statusBox.classList.toggle("member-detail__status--normal", !isLow);
  }
  if (elements.memo instanceof HTMLTextAreaElement) {
    elements.memo.value = viewModel.memo === "-" ? "" : viewModel.memo;
    elements.memo.placeholder = viewModel.memo === "-" ? MEMBER_MEMO_PLACEHOLDER : "";
  }
  setTextContent(elements.owner, viewModel.owner);
  setTextContent(elements.phone, viewModel.phone);
  setTextContent(elements.address, viewModel.address);
  setTextContent(elements.birthDate, viewModel.birthDate);
  setTextContent(elements.registration, viewModel.animalRegistrationNumber);
  setTextContent(elements.coatColor, viewModel.coatColor);
  setTextContent(elements.weight, viewModel.weight);
  setTextContent(elements.gender, viewModel.gender);
  renderMemberTagChips(elements.ownerTags, viewModel.ownerTags, { hiddenWhenEmpty: true });
  renderMemberTagChips(elements.petTags, viewModel.petTags, { hiddenWhenEmpty: true });
  renderSiblings(elements.siblings, viewModel.siblings);
}

function bindActions(memberId) {
  const backButton = getRequiredElement("[data-member-detail-back]");
  const issueButton = getRequiredElement("[data-member-detail-issue]");
  const editButtons = document.querySelectorAll("[data-member-detail-edit]");
  const issueModal = document.querySelector("[data-member-ticket-issue-modal]");
  const editModal = document.querySelector("[data-member-detail-edit-modal]");
  const createLatestViewModel = () => {
    const latestMembers = loadIssueMembers();
    const latestMember = findMemberById(latestMembers, memberId);
    const reservationStorage = initReservationStorage();
    const activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    const reservableCount = getMemberReservableCountFromReservations(
      latestMember || {},
      activeReservationCountsByMemberType
    );
    const latestViewModel = buildMemberDetailViewModel(
      latestMember || {},
      { reservableCount }
    );
    return { latestMembers, latestMember, latestViewModel };
  };

  const rerenderMember = () => {
    const { latestViewModel } = createLatestViewModel();
    renderMemberDetail(latestViewModel);
  };

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
  const reservableCount = getMemberReservableCountFromReservations(
    member || {},
    activeReservationCountsByMemberType
  );
  const viewModel = buildMemberDetailViewModel(member || {}, { reservableCount });
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
  initMemberDetailView();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMemberDetailPage);
} else {
  bootstrapMemberDetailPage();
}
