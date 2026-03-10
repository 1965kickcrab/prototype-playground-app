import { ensureMemberDefaults, loadIssueMembers } from "../storage/ticket-issue-members.js";
import { recalculateTicketCounts } from "../services/ticket-count-service.js";
import { setupSidebarToggle } from "../utils/sidebar.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { setupSidebarReservationBadges } from "../utils/sidebar-reservation-badge.js";
import { getTimeZone } from "../utils/timezone.js";
import { renderMemberPagination, renderMemberRows } from "../components/member-table.js";
import {
  filterMembers,
  filterMembersByTags,
  getPagedMembers,
} from "../services/member-page-service.js";
import { initMemberTicketIssueModal } from "../components/member-ticket-issue-modal.js";
import { buildActiveReservationCountByMemberType } from "../services/member-reservable-count.js";
import { sanitizeTagList, toTagQuery } from "../utils/tags.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import { applyMemberTagCatalogEdits } from "../services/member-tag-management-service.js";

const PAGE_SIZE = 10;

function bindIssueButtonNavigation(root, onIssue) {
  root?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-member-issue]")
      : null;
    if (!target) {
      return;
    }
    const memberId = target.dataset.memberId || "";
    if (!memberId || typeof onIssue !== "function") {
      return;
    }
    onIssue(memberId);
  });
}

function bindRowNavigation(root) {
  const moveToDetail = (memberId) => {
    if (!memberId) {
      return;
    }
    const params = new URLSearchParams({ memberId: String(memberId) });
    window.location.href = `./member-detail.html?${params.toString()}`;
  };

  root?.addEventListener("click", (event) => {
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (!element || element.closest("[data-member-issue]")) {
      return;
    }
    const row = element.closest("[data-member-row]");
    if (!row) {
      return;
    }
    moveToDetail(row.dataset.memberId || "");
  });

  root?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const element = event.target instanceof HTMLElement ? event.target : null;
    const row = element?.closest?.("[data-member-row]");
    if (!row) {
      return;
    }
    event.preventDefault();
    moveToDetail(row.dataset.memberId || "");
  });
}

function collectAvailableTags(members) {
  const list = Array.isArray(members) ? members : [];
  const allTags = [];
  list.forEach((member) => {
    allTags.push(...(Array.isArray(member?.petTags) ? member.petTags : []));
    allTags.push(...(Array.isArray(member?.ownerTags) ? member.ownerTags : []));
  });
  return sanitizeTagList(allTags);
}

function formatTagFilterLabel(selectedTags) {
  const tags = sanitizeTagList(selectedTags);
  if (!tags.length) {
    return "태그";
  }
  if (tags.length === 1) {
    return tags[0];
  }
  return `${tags[0]} 외 ${tags.length - 1}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function mapSelectedTagsAfterCatalogEdit(selectedTagMap, editResult) {
  const source = selectedTagMap && typeof selectedTagMap === "object" ? selectedTagMap : {};
  const renameMap = editResult?.renameMap && typeof editResult.renameMap === "object"
    ? editResult.renameMap
    : {};
  const deletedKeys = new Set(Array.isArray(editResult?.deletedKeys) ? editResult.deletedKeys : []);
  const next = {};

  Object.keys(source).forEach((tag) => {
    if (source[tag] !== true) {
      return;
    }
    const sourceKey = toTagQuery(tag);
    if (!sourceKey || deletedKeys.has(sourceKey)) {
      return;
    }
    const mapped = renameMap[sourceKey];
    const finalTag = String(mapped || tag).trim();
    if (!finalTag) {
      return;
    }
    next[finalTag] = true;
  });
  return next;
}

function initMemberTagManageModal(options = {}) {
  const {
    modal,
    onSaved = null,
  } = options;
  if (!modal) {
    return null;
  }
  const overlay = modal.querySelector("[data-member-tag-manage-overlay]");
  const closeButton = modal.querySelector("[data-member-tag-manage-close]");
  const cancelButton = modal.querySelector("[data-member-tag-manage-cancel]");
  const saveButton = modal.querySelector("[data-member-tag-manage-save]");
  const list = modal.querySelector("[data-member-tag-manage-list]");
  if (!overlay || !closeButton || !cancelButton || !saveButton || !list) {
    return null;
  }

  const state = { drafts: [] };

  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  const open = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  const render = () => {
    list.innerHTML = "";
    if (!state.drafts.length) {
      const empty = document.createElement("div");
      empty.className = "member-tag-manage__empty";
      empty.textContent = "등록된 태그가 없습니다.";
      list.appendChild(empty);
      return;
    }
    state.drafts.forEach((draft, index) => {
      const row = document.createElement("div");
      row.className = "member-tag-manage__row";
      if (draft.isDeleted) {
        row.classList.add("is-deleted");
      }
      row.dataset.tagDraftIndex = String(index);
      row.innerHTML = `
        <input class="form-field__control" type="text" value="${escapeHtml(draft.nextTag)}" data-tag-draft-input>
        <button
          class="member-tag-manage__delete${draft.isDeleted ? " is-deleted" : ""}"
          type="button"
          data-tag-draft-delete
          aria-label="${draft.isDeleted ? "삭제 복구" : "태그 삭제"}"
        >
          ${draft.isDeleted
    ? "복구"
    : "<img src=\"../../assets/iconDelete.svg\" alt=\"\" aria-hidden=\"true\">"}
        </button>
      `;
      list.appendChild(row);
    });
  };

  const resetDrafts = () => {
    const catalog = loadMemberTagCatalog();
    state.drafts = catalog.map((tag) => ({
      sourceTag: tag,
      nextTag: tag,
      isDeleted: false,
    }));
    render();
  };

  overlay.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  cancelButton.addEventListener("click", close);

  saveButton.addEventListener("click", () => {
    const result = applyMemberTagCatalogEdits(state.drafts);
    if (typeof onSaved === "function") {
      onSaved(result);
    }
    close();
  });

  list.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-tag-draft-delete]")
      : null;
    if (!button) {
      return;
    }
    const row = button.closest("[data-tag-draft-index]");
    const index = Number.parseInt(row?.dataset.tagDraftIndex || "", 10);
    if (!Number.isFinite(index) || !state.drafts[index]) {
      return;
    }
    state.drafts[index].isDeleted = !state.drafts[index].isDeleted;
    render();
  });

  list.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-tag-draft-input]")) {
      return;
    }
    const row = input.closest("[data-tag-draft-index]");
    const index = Number.parseInt(row?.dataset.tagDraftIndex || "", 10);
    if (!Number.isFinite(index) || !state.drafts[index]) {
      return;
    }
    state.drafts[index].nextTag = input.value;
  });

  return {
    openModal() {
      resetDrafts();
      open();
    },
  };
}

function initMembersView() {
  const rowsContainer = document.querySelector("[data-member-rows]");
  const paginationContainer = document.querySelector("[data-member-pagination]");
  const searchInput = document.querySelector("[data-member-search]");
  const filterPanel = document.querySelector("[data-filter-panel]");
  const filterToggle = filterPanel?.querySelector("[data-filter-toggle]");
  const filterBody = filterPanel?.querySelector("[data-filter-panel-body]");
  const tagButton = filterPanel?.querySelector("[data-filter-button='tag']");
  const tagMenu = filterPanel?.querySelector("[data-filter-menu='tag']");
  const filterBadge = filterPanel?.querySelector("[data-filter-badge]");
  const filterReset = filterPanel?.querySelector("[data-filter-reset]");
  const tagManageOpenButton = filterPanel?.querySelector("[data-member-tag-manage-open]");
  const tagManageModal = document.querySelector("[data-member-tag-manage-modal]");
  const reservationStorage = initReservationStorage();
  if (
    !rowsContainer
    || !paginationContainer
    || !searchInput
    || !filterPanel
    || !filterToggle
    || !filterBody
    || !tagButton
    || !tagMenu
    || !filterBadge
    || !filterReset
    || !tagManageOpenButton
    || !tagManageModal
  ) {
    return;
  }

  ensureMemberDefaults();
  recalculateTicketCounts();

  let allMembers = loadIssueMembers();
  let currentPage = 1;
  let currentQuery = "";
  let selectedTagMap = {};
  const issueModal = document.querySelector("[data-member-ticket-issue-modal]");

  const issueModalController = initMemberTicketIssueModal({
    modal: issueModal,
    onIssued: () => {
      allMembers = loadIssueMembers();
      renderTagMenu();
      updateFilterDisplay();
      render();
    },
  });

  const tagManageController = initMemberTagManageModal({
    modal: tagManageModal,
    onSaved: (editResult) => {
      allMembers = loadIssueMembers();
      selectedTagMap = mapSelectedTagsAfterCatalogEdit(selectedTagMap, editResult);
      renderTagMenu();
      updateFilterDisplay();
      currentPage = 1;
      render();
    },
  });

  const closeTagMenu = () => {
    tagMenu.hidden = true;
    tagButton.setAttribute("aria-expanded", "false");
  };

  const openTagMenu = () => {
    tagMenu.hidden = false;
    tagButton.setAttribute("aria-expanded", "true");
  };

  const closeFilterPanel = () => {
    filterBody.hidden = true;
    filterToggle.setAttribute("aria-expanded", "false");
    closeTagMenu();
  };

  const openFilterPanel = () => {
    filterBody.hidden = false;
    filterToggle.setAttribute("aria-expanded", "true");
  };

  const getSelectedTags = () =>
    sanitizeTagList(
      Object.keys(selectedTagMap).filter((key) => selectedTagMap[key] !== false)
    );

  const updateFilterDisplay = () => {
    const selectedTags = getSelectedTags();
    tagButton.textContent = formatTagFilterLabel(selectedTags);
    if (!selectedTags.length) {
      filterBadge.hidden = true;
      filterBadge.textContent = "0";
      return;
    }
    filterBadge.hidden = false;
    filterBadge.textContent = String(selectedTags.length);
  };

  const renderTagMenu = () => {
    const availableTags = collectAvailableTags(allMembers);
    tagMenu.innerHTML = "";
    if (!availableTags.length) {
      const empty = document.createElement("div");
      empty.className = "menu-option menu-option--empty";
      empty.innerHTML = `<span class="menu-option__title">등록된 태그가 없습니다.</span>`;
      tagMenu.appendChild(empty);
      return;
    }
    availableTags.forEach((tag) => {
      const option = document.createElement("label");
      option.className = "menu-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.memberTagFilter = tag;
      input.checked = selectedTagMap[tag] === true;
      const title = document.createElement("span");
      title.className = "menu-option__title";
      title.textContent = tag;
      option.appendChild(input);
      option.appendChild(title);
      tagMenu.appendChild(option);
    });
  };

  const render = () => {
    const filteredByQuery = filterMembers(allMembers, currentQuery);
    const filtered = filterMembersByTags(filteredByQuery, getSelectedTags());
    const pageData = getPagedMembers(filtered, currentPage, PAGE_SIZE);
    const activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    currentPage = pageData.currentPage;
    renderMemberRows(
      rowsContainer,
      pageData.items,
      activeReservationCountsByMemberType
    );
    renderMemberPagination(paginationContainer, pageData.totalPages, pageData.currentPage);
  };

  searchInput.addEventListener("input", () => {
    currentQuery = searchInput.value || "";
    currentPage = 1;
    render();
  });

  paginationContainer.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-page]")
      : null;
    if (!button) {
      return;
    }
    const nextPage = Number.parseInt(button.dataset.page || "", 10);
    if (!Number.isFinite(nextPage) || nextPage === currentPage) {
      return;
    }
    currentPage = nextPage;
    render();
  });

  filterToggle.addEventListener("click", () => {
    const isOpen = filterToggle.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeFilterPanel();
      return;
    }
    openFilterPanel();
  });

  tagButton.addEventListener("click", () => {
    if (filterBody.hidden) {
      openFilterPanel();
    }
    const isOpen = tagButton.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeTagMenu();
      return;
    }
    openTagMenu();
  });

  filterReset.addEventListener("click", () => {
    selectedTagMap = {};
    renderTagMenu();
    updateFilterDisplay();
    currentPage = 1;
    render();
  });

  tagManageOpenButton.addEventListener("click", () => {
    closeTagMenu();
    if (tagManageController) {
      tagManageController.openModal();
    }
  });

  tagMenu.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-member-tag-filter]")) {
      return;
    }
    const tag = input.dataset.memberTagFilter || "";
    if (!tag) {
      return;
    }
    selectedTagMap[tag] = input.checked;
    updateFilterDisplay();
    currentPage = 1;
    render();
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target) {
      return;
    }
    if (filterPanel.contains(target)) {
      return;
    }
    closeFilterPanel();
  });

  bindIssueButtonNavigation(rowsContainer, (memberId) => {
    const member = allMembers.find((item) => String(item?.id || "") === String(memberId));
    if (!member || !issueModalController) {
      return;
    }
    issueModalController.openModalWithMember(member);
  });
  bindRowNavigation(rowsContainer);
  renderTagMenu();
  updateFilterDisplay();
  render();
}

function bootstrapMembersPage() {
  const storage = initReservationStorage();
  const timeZone = getTimeZone();
  setupSidebarToggle({
    iconOpen: "../../assets/menuIcon_sidebar_open.svg",
    iconClose: "../../assets/menuIcon_sidebar_close.svg",
  });
  setupSidebarReservationBadges({ storage, timeZone });
  initMembersView();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMembersPage);
} else {
  bootstrapMembersPage();
}
