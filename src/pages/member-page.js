import {
  ensureMemberDefaults,
  loadIssueMembers,
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
import { sanitizeTagList } from "../utils/tags.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";

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
    const row = element?.closest?.("[data-member-row]");
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

function collectMemberLabels(members) {
  const labels = [...loadMemberTagCatalog()];
  (Array.isArray(members) ? members : []).forEach((member) => {
    labels.push(...sanitizeTagList(member?.petTags));
    labels.push(...sanitizeTagList(member?.ownerTags));
  });
  return sanitizeTagList(labels);
}

function formatSelectedLabelText(labels) {
  const normalized = sanitizeTagList(labels);
  if (!normalized.length) {
    return "";
  }
  if (normalized.length === 1) {
    return normalized[0];
  }
  return `${normalized[0]} 외 ${normalized.length - 1}`;
}

function renderLabelOptions(container, labels, selectedLabels, query = "") {
  if (!container) {
    return;
  }
  const normalized = sanitizeTagList(labels);
  const selectedSet = new Set(sanitizeTagList(selectedLabels));
  const keyword = String(query || "").trim().toLowerCase();
  const visibleLabels = keyword
    ? normalized.filter((label) => label.toLowerCase().includes(keyword))
    : normalized;
  container.innerHTML = "";
  if (!normalized.length) {
    const empty = document.createElement("div");
    empty.className = "member-search__tag-empty";
    empty.textContent = "등록된 태그가 없습니다.";
    container.appendChild(empty);
    return;
  }
  if (!visibleLabels.length) {
    const empty = document.createElement("div");
    empty.className = "member-search__tag-empty";
    empty.textContent = "검색 결과가 없습니다.";
    container.appendChild(empty);
    return;
  }

  visibleLabels.forEach((label) => {
    const option = document.createElement("label");
    option.className = "member-search__tag-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = label;
    input.dataset.memberLabelOption = label;
    input.checked = selectedSet.has(label);
    const title = document.createElement("span");
    title.textContent = label;
    option.appendChild(input);
    option.appendChild(title);
    container.appendChild(option);
  });
}

function initMembersView() {
  const rowsContainer = document.querySelector("[data-member-rows]");
  const paginationContainer = document.querySelector("[data-member-pagination]");
  const searchInput = document.querySelector("[data-member-search]");
  const memberCount = document.querySelector("[data-member-count-value]");
  const labelInput = document.querySelector("[data-member-label-input]");
  const labelSheet = document.querySelector("[data-member-label-sheet]");
  const labelBackdrop = document.querySelector("[data-member-label-sheet-backdrop]");
  const labelSheetClose = document.querySelector("[data-member-label-sheet-close]");
  const labelSheetSearch = document.querySelector("[data-member-label-sheet-search]");
  const labelSheetList = document.querySelector("[data-member-label-sheet-list]");
  const labelReset = document.querySelector("[data-member-label-reset]");
  const labelApply = document.querySelector("[data-member-label-apply]");
  const reservationStorage = initReservationStorage();

  if (
    !rowsContainer
    || !paginationContainer
    || !searchInput
    || !memberCount
    || !(labelInput instanceof HTMLInputElement)
    || !(labelSheet instanceof HTMLElement)
    || !(labelBackdrop instanceof HTMLElement)
    || !(labelSheetSearch instanceof HTMLInputElement)
    || !labelSheetList
  ) {
    return;
  }

  ensureMemberDefaults();
  recalculateTicketCounts();

  const allMembers = loadIssueMembers();
  const allLabels = collectMemberLabels(allMembers);
  let currentPage = 1;
  let currentQuery = "";
  let selectedLabels = [];
  let stagedLabels = [];
  let labelSheetQuery = "";

  const setLabelSheetOpen = (open) => {
    const isOpen = Boolean(open);
    labelSheet.hidden = !isOpen;
    labelBackdrop.hidden = !isOpen;
    labelInput.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen) {
      labelSheetQuery = "";
      labelSheetSearch.value = "";
      stagedLabels = selectedLabels.slice();
      renderLabelOptions(labelSheetList, allLabels, stagedLabels, labelSheetQuery);
      window.requestAnimationFrame(() => {
        labelSheetSearch.focus();
      });
    }
  };

  const syncLabelInput = () => {
    labelInput.value = formatSelectedLabelText(selectedLabels);
    labelInput.placeholder = allLabels.length ? "태그" : "태그 없음";
    labelInput.disabled = allLabels.length === 0;
  };

  const render = () => {
    const filteredByQuery = filterMembers(allMembers, currentQuery);
    const filtered = selectedLabels.length
      ? filterMembersByTags(filteredByQuery, selectedLabels, "all")
      : filteredByQuery;
    const pageData = getPagedMembers(filtered, currentPage, PAGE_SIZE);
    const activeReservationCountsByMemberType = buildActiveReservationCountByMemberType(
      reservationStorage.loadReservations()
    );
    currentPage = pageData.currentPage;
    memberCount.textContent = String(filtered.length);
    renderMemberRows(
      rowsContainer,
      pageData.items,
      activeReservationCountsByMemberType
    );
    renderMemberPagination(paginationContainer, pageData.totalPages, pageData.currentPage);
    syncLabelInput();
  };

  searchInput.addEventListener("input", () => {
    currentQuery = searchInput.value || "";
    currentPage = 1;
    render();
  });

  labelInput.addEventListener("click", () => {
    if (!allLabels.length) {
      return;
    }
    setLabelSheetOpen(true);
  });

  labelInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    if (allLabels.length) {
      setLabelSheetOpen(true);
    }
  });

  labelSheetSearch.addEventListener("input", () => {
    labelSheetQuery = labelSheetSearch.value || "";
    renderLabelOptions(labelSheetList, allLabels, stagedLabels, labelSheetQuery);
  });

  labelSheetList.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches("[data-member-label-option]")) {
      return;
    }
    const nextValue = input.value || "";
    const nextSet = new Set(stagedLabels);
    if (input.checked) {
      nextSet.add(nextValue);
    } else {
      nextSet.delete(nextValue);
    }
    stagedLabels = sanitizeTagList([...nextSet]);
  });

  labelReset?.addEventListener("click", () => {
    stagedLabels = [];
    selectedLabels = [];
    setLabelSheetOpen(false);
    currentPage = 1;
    render();
  });

  labelApply?.addEventListener("click", () => {
    selectedLabels = sanitizeTagList(stagedLabels);
    setLabelSheetOpen(false);
    currentPage = 1;
    render();
  });

  labelSheetClose?.addEventListener("click", () => setLabelSheetOpen(false));
  labelBackdrop.addEventListener("click", () => setLabelSheetOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !labelSheet.hidden) {
      setLabelSheetOpen(false);
    }
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

  bindRowNavigation(rowsContainer);
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
