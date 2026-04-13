import { filterMembers, filterMembersByTags } from "../services/member-page-service.js";
import { sanitizeTagList } from "../utils/tags.js";

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
  const list = Array.isArray(members) ? members : [];
  const query = typeof memberInput.value === "string" ? memberInput.value : "";
  const filteredByQuery = filterMembers(list, query);
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
