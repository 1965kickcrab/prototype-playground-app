import {
  ensureMemberDefaults,
  loadIssueMembers,
  updateIssueMembersPetTags,
} from "../storage/ticket-issue-members.js";
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
import { buildActiveReservationCountByMemberType } from "../services/member-reservable-count.js";
import { sanitizeTagList, toTagQuery } from "../utils/tags.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import { initTagInput } from "../components/tag-input.js";

const PAGE_SIZE = 10;

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
    if (
      !element
      || element.closest("[data-member-issue]")
      || element.closest("[data-member-select-control]")
    ) {
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
    if (element?.closest?.("[data-member-select-control]")) {
      return;
    }
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

function getSelectedMembers(allMembers, selectedMemberIds) {
  const list = Array.isArray(allMembers) ? allMembers : [];
  const selectedIds = selectedMemberIds instanceof Set ? selectedMemberIds : new Set();
  return list.filter((member) => selectedIds.has(String(member?.id || "")));
}

function collectPetTags(members) {
  const list = Array.isArray(members) ? members : [];
  const tags = [];
  list.forEach((member) => {
    tags.push(...(Array.isArray(member?.petTags) ? member.petTags : []));
  });
  return sanitizeTagList(tags);
}

function collectCommonPetTags(members) {
  const list = Array.isArray(members) ? members : [];
  if (!list.length) {
    return [];
  }
  const [first, ...rest] = list;
  const initial = sanitizeTagList(first?.petTags);
  return initial.filter((tag) =>
    rest.every((member) => sanitizeTagList(member?.petTags).includes(tag))
  );
}

function initMembersView() {
  const rowsContainer = document.querySelector("[data-member-rows]");
  const paginationContainer = document.querySelector("[data-member-pagination]");
  const searchInput = document.querySelector("[data-member-search]");
  const memberCount = document.querySelector("[data-member-count-value]");
  const memberSelectAll = document.querySelector("[data-member-select-all]");
  const bulkActions = document.querySelector("[data-member-bulk-actions]");
  const bulkCount = document.querySelector("[data-member-bulk-count]");
  const bulkTagToggle = document.querySelector("[data-member-bulk-tag-toggle]");
  const bulkTagPopover = document.querySelector("[data-member-bulk-tag-popover]");
  const bulkCommonTags = document.querySelector("[data-member-bulk-common-tags]");
  const bulkTagEditor = document.querySelector("[data-member-bulk-tag-editor]");
  const filterPanel = document.querySelector("[data-filter-panel]");
  const filterToggle = filterPanel?.querySelector("[data-filter-toggle]");
  const filterBody = filterPanel?.querySelector("[data-filter-panel-body]");
  const tagButton = filterPanel?.querySelector("[data-filter-button='tag']");
  const tagMenu = filterPanel?.querySelector("[data-filter-menu='tag']");
  const filterBadge = filterPanel?.querySelector("[data-filter-badge]");
  const filterReset = filterPanel?.querySelector("[data-filter-reset]");
  const tagManageOpenButton = filterPanel?.querySelector("[data-member-tag-manage-open]");
  const reservationStorage = initReservationStorage();
  if (
    !rowsContainer
    || !paginationContainer
    || !searchInput
    || !memberCount
    || !memberSelectAll
    || !bulkActions
    || !bulkCount
    || !bulkTagToggle
    || !bulkTagPopover
    || !bulkCommonTags
    || !bulkTagEditor
    || !filterPanel
    || !filterToggle
    || !filterBody
    || !tagButton
    || !tagMenu
    || !filterBadge
    || !filterReset
    || !tagManageOpenButton
  ) {
    return;
  }

  ensureMemberDefaults();
  recalculateTicketCounts();

  let allMembers = loadIssueMembers();
  let currentPage = 1;
  let currentQuery = "";
  let selectedTagMap = {};
  let selectedMemberIds = new Set();
  let currentPageMemberIds = [];
  let bulkTagInputController = null;

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

  const closeBulkTagPopover = () => {
    bulkTagPopover.hidden = true;
    bulkTagToggle.setAttribute("aria-expanded", "false");
  };

  const syncBulkActionPosition = () => {
    if (bulkActions.hidden) {
      bulkActions.style.removeProperty("--member-bulk-left");
      bulkActions.style.removeProperty("--member-bulk-top");
      return;
    }
    const rect = memberSelectAll.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      return;
    }
    const left = rect.right + 12;
    const top = Math.max(56, rect.top - 48);
    bulkActions.style.setProperty("--member-bulk-left", `${Math.round(left)}px`);
    bulkActions.style.setProperty("--member-bulk-top", `${Math.round(top)}px`);
  };

  const getSelectedMembersOnPage = () => getSelectedMembers(allMembers, selectedMemberIds);

  const getBulkTagCatalog = () => {
    return sanitizeTagList([
      ...loadMemberTagCatalog(),
      ...collectAvailableTags(allMembers),
    ]);
  };

  const renderBulkCommonTags = () => {
    const commonTags = collectCommonPetTags(getSelectedMembersOnPage());
    bulkCommonTags.innerHTML = "";
    if (!commonTags.length) {
      const empty = document.createElement("div");
      empty.className = "member-bulk-actions__common-empty";
      empty.textContent = "선택한 회원 모두에게 공통으로 붙은 태그가 없습니다.";
      bulkCommonTags.appendChild(empty);
      return;
    }

    commonTags.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "member-tag-editor__chip member-bulk-actions__common-tag";
      chip.dataset.memberBulkRemoveTag = tag;
      chip.innerHTML = `
        <span>${escapeHtml(tag)}</span>
        <span class="member-bulk-actions__common-tag-remove" aria-hidden="true">×</span>
      `;
      bulkCommonTags.appendChild(chip);
    });
  };

  const renderBulkTagEditor = () => {
    renderBulkCommonTags();
    bulkTagEditor.innerHTML = `
      <div class="member-tag-editor__selected" data-member-tag-selected hidden></div>
      <div class="member-tag-editor__input-wrap">
        <input class="form-field__control" type="text" placeholder="옵션 선택 또는 생성" data-member-tag-input>
        <div class="member-tag-editor__suggestions" data-member-tag-suggestions hidden></div>
      </div>
    `;
    bulkTagInputController = initTagInput({
      container: bulkTagEditor,
      initialTags: [],
      getCatalog: () => getBulkTagCatalog(),
      onChange: (tags) => {
        if (!tags.length || selectedMemberIds.size === 0) {
          return;
        }
        allMembers = updateIssueMembersPetTags([...selectedMemberIds], tags, "add");
        renderTagMenu();
        updateFilterDisplay();
        render();
        if (selectedMemberIds.size > 0) {
          openBulkTagPopover();
        }
      },
    });
  };

  const openBulkTagPopover = () => {
    bulkTagPopover.hidden = false;
    bulkTagToggle.setAttribute("aria-expanded", "true");
    renderBulkTagEditor();
    bulkTagEditor.querySelector("[data-member-tag-input]")?.focus();
  };

  const clearSelection = () => {
    selectedMemberIds = new Set();
    currentPageMemberIds = [];
    memberSelectAll.checked = false;
    memberSelectAll.indeterminate = false;
    closeBulkTagPopover();
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

  const updateBulkActions = () => {
    const selectedCount = selectedMemberIds.size;
    bulkActions.hidden = selectedCount === 0;
    bulkCount.textContent = `${selectedCount}명 선택됨`;
    if (selectedCount === 0) {
      closeBulkTagPopover();
    }
    const pageSelectedCount = currentPageMemberIds.filter((memberId) => selectedMemberIds.has(memberId)).length;
    memberSelectAll.checked = currentPageMemberIds.length > 0 && pageSelectedCount === currentPageMemberIds.length;
    memberSelectAll.indeterminate = pageSelectedCount > 0 && pageSelectedCount < currentPageMemberIds.length;
    syncBulkActionPosition();
  };

  const render = () => {
    const filteredByQuery = filterMembers(allMembers, currentQuery);
    const filtered = filterMembersByTags(filteredByQuery, getSelectedTags());
    const pageData = getPagedMembers(filtered, currentPage, PAGE_SIZE);
    const activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    currentPage = pageData.currentPage;
    currentPageMemberIds = pageData.items.map((member) => String(member?.id || ""));
    selectedMemberIds = new Set(
      [...selectedMemberIds].filter((memberId) => currentPageMemberIds.includes(memberId))
    );
    memberCount.textContent = String(filtered.length);
    renderMemberRows(
      rowsContainer,
      pageData.items,
      activeReservationCountsByMemberType,
      selectedMemberIds
    );
    renderMemberPagination(paginationContainer, pageData.totalPages, pageData.currentPage);
    updateBulkActions();
  };

  searchInput.addEventListener("input", () => {
    currentQuery = searchInput.value || "";
    currentPage = 1;
    clearSelection();
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
    clearSelection();
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
    clearSelection();
    render();
  });

  tagManageOpenButton.addEventListener("click", () => {
    closeTagMenu();
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
    clearSelection();
    render();
  });

  rowsContainer.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-member-select]")) {
      return;
    }
    const memberId = String(input.dataset.memberId || "");
    if (!memberId) {
      return;
    }
    if (input.checked) {
      selectedMemberIds.add(memberId);
    } else {
      selectedMemberIds.delete(memberId);
    }
    closeBulkTagPopover();
    render();
  });

  memberSelectAll.addEventListener("change", () => {
    if (memberSelectAll.checked) {
      currentPageMemberIds.forEach((memberId) => selectedMemberIds.add(memberId));
    } else {
      currentPageMemberIds.forEach((memberId) => selectedMemberIds.delete(memberId));
    }
    closeBulkTagPopover();
    render();
  });

  bulkTagToggle.addEventListener("click", () => {
    if (selectedMemberIds.size === 0) {
      return;
    }
    if (bulkTagPopover.hidden) {
      openBulkTagPopover();
      return;
    }
    closeBulkTagPopover();
  });

  bulkCommonTags.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-member-bulk-remove-tag]")
      : null;
    if (!button || selectedMemberIds.size === 0) {
      return;
    }
    const tag = button.dataset.memberBulkRemoveTag || "";
    if (!tag) {
      return;
    }
    allMembers = updateIssueMembersPetTags([...selectedMemberIds], [tag], "remove");
    renderTagMenu();
    updateFilterDisplay();
    render();
    if (selectedMemberIds.size > 0) {
      openBulkTagPopover();
    }
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

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target) {
      return;
    }
    if (bulkActions.contains(target)) {
      return;
    }
    closeBulkTagPopover();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    closeBulkTagPopover();
  });

  window.addEventListener("resize", () => {
    syncBulkActionPosition();
  });

  window.addEventListener("scroll", () => {
    syncBulkActionPosition();
  }, { passive: true });

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
