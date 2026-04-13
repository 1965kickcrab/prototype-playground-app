import { loadIssueMembers } from "../storage/ticket-issue-members.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import { filterMembers, filterMembersByTags } from "../services/member-page-service.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getSearchParams() {
  return new URLSearchParams(window.location.search);
}

function buildReturnUrl(memberId) {
  const params = getSearchParams();
  const returnTo = params.get("returnTo") || "./school-reservation-create.html";
  const url = new URL(returnTo, window.location.href);
  url.searchParams.set("memberSearch", "1");
  url.searchParams.set("memberId", String(memberId || ""));
  return url.toString();
}

function goBack() {
  const params = getSearchParams();
  const returnTo = params.get("returnTo");
  if (returnTo) {
    window.location.href = new URL(returnTo, window.location.href).toString();
    return;
  }
  window.history.back();
}

function renderTagOptions(container, tags, selectedTags) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  if (!tags.length) {
    container.innerHTML = '<div class="member-search__tag-empty">등록된 태그가 없습니다.</div>';
    return;
  }
  container.innerHTML = tags
    .map((tag) => `
      <label class="member-search__tag-option">
        <input type="checkbox" value="${escapeHtml(tag)}" data-member-search-tag-option ${selectedTags.has(tag) ? "checked" : ""}>
        <span>${escapeHtml(tag)}</span>
      </label>
    `)
    .join("");
}

function renderMemberList(container, members, onSelect) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  if (!members.length) {
    container.innerHTML = '<p class="member-search-page__empty">검색 결과가 없습니다.</p>';
    return;
  }
  container.innerHTML = "";
  members.forEach((member) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "member-item member-search-page__item";
    button.innerHTML = `
      <span class="member-search-page__item-line">
        ${escapeHtml(member.dogName)} (${escapeHtml(member.breed)}) / ${escapeHtml(member.weight || "-")}kg / ${escapeHtml(member.owner)}
      </span>
    `;
    button.addEventListener("click", () => onSelect(member));
    container.appendChild(button);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector("[data-member-search-page-input]");
  const clearButton = document.querySelector("[data-member-search-page-clear]");
  const backButton = document.querySelector("[data-member-search-page-back]");
  const results = document.querySelector("[data-member-search-page-results]");
  const tagToggle = document.querySelector("[data-member-search-tag-toggle]");
  const tagBadge = document.querySelector("[data-member-search-tag-badge]");
  const tagMenu = document.querySelector("[data-member-search-tag-menu]");
  const tagList = document.querySelector("[data-member-search-tag-list]");
  const tagClose = document.querySelector("[data-member-search-tag-close]");
  const tagReset = document.querySelector("[data-member-search-tag-reset]");
  const tagApply = document.querySelector("[data-member-search-tag-apply]");
  const backdrop = document.querySelector("[data-member-search-sheet-backdrop]");

  if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement)) {
    return;
  }

  const members = loadIssueMembers();
  const catalog = loadMemberTagCatalog();
  const params = getSearchParams();
  const draftQuery = params.get("q") || "";
  const state = {
    query: draftQuery,
    selectedTags: new Set(),
    stagedTags: new Set(),
  };

  const syncTagBadge = () => {
    const count = state.selectedTags.size;
    if (!(tagBadge instanceof HTMLElement)) {
      return;
    }
    tagBadge.textContent = String(count);
    tagBadge.hidden = count === 0;
  };

  const setTagSheetOpen = (open) => {
    const isOpen = Boolean(open);
    if (tagMenu instanceof HTMLElement) {
      tagMenu.hidden = !isOpen;
    }
    if (backdrop instanceof HTMLElement) {
      backdrop.hidden = !isOpen;
    }
    if (tagToggle instanceof HTMLButtonElement) {
      tagToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  };

  const getFilteredMembers = () => {
    const queryFiltered = filterMembers(members, state.query);
    return filterMembersByTags(queryFiltered, Array.from(state.selectedTags), "all");
  };

  const render = () => {
    input.value = state.query;
    renderMemberList(results, getFilteredMembers(), (member) => {
      window.location.href = buildReturnUrl(member.id);
    });
    syncTagBadge();
  };

  input.value = draftQuery;
  renderTagOptions(tagList, catalog, state.stagedTags);
  render();
  input.focus();

  input.addEventListener("input", () => {
    state.query = input.value;
    render();
  });

  clearButton?.addEventListener("click", () => {
    state.query = "";
    input.value = "";
    render();
    input.focus();
  });

  backButton?.addEventListener("click", goBack);
  tagToggle?.addEventListener("click", () => {
    state.stagedTags = new Set(state.selectedTags);
    renderTagOptions(tagList, catalog, state.stagedTags);
    setTagSheetOpen(true);
  });
  tagClose?.addEventListener("click", () => setTagSheetOpen(false));
  backdrop?.addEventListener("click", () => setTagSheetOpen(false));

  tagList?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-member-search-tag-option]")) {
      return;
    }
    if (target.checked) {
      state.stagedTags.add(target.value);
      return;
    }
    state.stagedTags.delete(target.value);
  });

  tagReset?.addEventListener("click", () => {
    state.stagedTags = new Set();
    renderTagOptions(tagList, catalog, state.stagedTags);
  });

  tagApply?.addEventListener("click", () => {
    state.selectedTags = new Set(state.stagedTags);
    setTagSheetOpen(false);
    render();
  });
});
