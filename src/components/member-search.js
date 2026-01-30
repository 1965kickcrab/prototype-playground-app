export function renderMemberSearchResults(options = {}) {
  const { memberInput, memberResults, members, onSelect } = options;
  if (!memberInput || !memberResults) {
    return;
  }
  const list = Array.isArray(members) ? members : [];
  const query = memberInput.value.trim().toLowerCase();
  const filtered = list.filter((member) => {
    if (!query) {
      return true;
    }
    const haystack = `${member.dogName} ${member.owner} ${member.breed}`.toLowerCase();
    return haystack.includes(query);
  });

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
