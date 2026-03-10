import { filterMembersByTags } from "../services/member-page-service.js";
import { sanitizeTagList } from "../utils/tags.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function setTagMenuExpanded(controls, expanded) {
  if (!(controls instanceof HTMLElement)) {
    return;
  }
  const toggle = controls.querySelector("[data-member-search-tag-toggle]");
  const menu = controls.querySelector("[data-member-search-tag-menu]");
  const canOpen = controls.dataset.hasCatalog === "true";
  const nextExpanded = Boolean(expanded && canOpen);
  controls.dataset.expanded = nextExpanded ? "true" : "false";
  if (toggle instanceof HTMLButtonElement) {
    toggle.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
  }
  if (menu instanceof HTMLElement) {
    menu.hidden = !nextExpanded;
  }
}

function collectCheckedTags(controls) {
  if (!(controls instanceof HTMLElement)) {
    return [];
  }
  const values = Array.from(
    controls.querySelectorAll("input[data-member-search-tag-option]:checked")
  ).map((input) => input.value);
  return sanitizeTagList(values);
}

function ensureTagFilterControls(options = {}) {
  const {
    memberInput,
    tagCatalog,
    selectedTags,
    onTagFilterChange,
  } = options;
  const wrapper = memberInput?.closest?.(".member-search");
  if (!(wrapper instanceof HTMLElement)) {
    return;
  }
  const normalizedCatalog = sanitizeTagList(tagCatalog);
  const normalizedSelected = sanitizeTagList(selectedTags);
  const hasCatalog = normalizedCatalog.length > 0;

  let controls = wrapper.querySelector("[data-member-search-tag-filters]");
  if (!(controls instanceof HTMLElement)) {
    controls = document.createElement("div");
    controls.className = "member-search__filters";
    controls.dataset.memberSearchTagFilters = "true";
    const inputWrap = wrapper.querySelector(".member-search__input");
    if (inputWrap?.nextSibling) {
      wrapper.insertBefore(controls, inputWrap.nextSibling);
    } else {
      wrapper.appendChild(controls);
    }
  }

  controls.dataset.hasCatalog = hasCatalog ? "true" : "false";
  controls.__onTagFilterChange = typeof onTagFilterChange === "function"
    ? onTagFilterChange
    : null;
  const selectedCount = normalizedSelected.length;
  const optionMarkup = hasCatalog
    ? normalizedCatalog
      .map((tag) => `
        <label class="menu-option${normalizedSelected.includes(tag) ? " is-selected" : ""}">
          <input type="checkbox" data-member-search-tag-option value="${escapeHtml(tag)}" ${normalizedSelected.includes(tag) ? "checked" : ""}>
          <span class="menu-option__title">${escapeHtml(tag)}</span>
        </label>
      `)
      .join("")
    : '<div class="member-search__tag-empty">등록된 태그가 없습니다.</div>';
  const keepExpanded = controls.dataset.expanded === "true" && hasCatalog;

  controls.innerHTML = `
    <button
      class="member-search__tag-toggle"
      type="button"
      data-member-search-tag-toggle
      aria-expanded="${keepExpanded ? "true" : "false"}"
      ${hasCatalog ? "" : "disabled"}
    >
      <span>태그</span>
      <span class="member-search__tag-badge" ${selectedCount > 0 ? "" : "hidden"}>${selectedCount}</span>
      <span class="member-search__tag-caret" aria-hidden="true"></span>
    </button>
    <div class="member-search__tag-menu" data-member-search-tag-menu ${keepExpanded ? "" : "hidden"}>
      <div class="member-search__tag-list">${optionMarkup}</div>
      <div class="member-search__tag-actions">
        <button class="button-neutral button-neutral--small" type="button" data-member-search-tag-reset>초기화</button>
      </div>
    </div>
  `;

  if (controls.dataset.bound !== "true") {
    controls.dataset.bound = "true";
    controls.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }
      const toggle = target.closest("[data-member-search-tag-toggle]");
      if (toggle) {
        const isExpanded = controls.dataset.expanded === "true";
        setTagMenuExpanded(controls, !isExpanded);
        return;
      }
      const reset = target.closest("[data-member-search-tag-reset]");
      if (!reset) {
        return;
      }
      const callback = controls.__onTagFilterChange;
      if (typeof callback === "function") {
        callback([]);
      }
      setTagMenuExpanded(controls, false);
    });

    controls.addEventListener("change", (event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.matches("[data-member-search-tag-option]")) {
        return;
      }
      const callback = controls.__onTagFilterChange;
      if (typeof callback === "function") {
        callback(collectCheckedTags(controls));
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target || wrapper.contains(target)) {
        return;
      }
      setTagMenuExpanded(controls, false);
    });
  }
}

export function renderMemberSearchResults(options = {}) {
  const {
    memberInput,
    memberResults,
    members,
    onSelect,
    selectedTags = [],
    onTagFilterChange = null,
    tagFilterMode = "any",
    tagCatalog = [],
  } = options;
  if (!memberInput || !memberResults) {
    return;
  }
  ensureTagFilterControls({
    memberInput,
    tagCatalog,
    selectedTags,
    onTagFilterChange,
  });

  const list = Array.isArray(members) ? members : [];
  const query = memberInput.value.trim().toLowerCase();
  const filteredByQuery = list.filter((member) => {
    if (!query) {
      return true;
    }
    const haystack = `${member.dogName} ${member.owner} ${member.breed}`.toLowerCase();
    return haystack.includes(query);
  });
  const filtered = filterMembersByTags(
    filteredByQuery,
    sanitizeTagList(selectedTags),
    tagFilterMode
  );

  memberResults.innerHTML = "";
  filtered.forEach((member) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "member-item";
    item.innerHTML = `
      <div class="member-item__main">
        <span class="member-item__dog">${member.dogName}</span>
        <span class="member-item__breed">${member.breed}</span>
      </div>
      <span class="member-item__owner">${member.owner}</span>
    `;
    item.addEventListener("click", () => {
      if (typeof onSelect === "function") {
        onSelect(member);
      }
    });
    memberResults.appendChild(item);
  });
}
