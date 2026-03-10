import { sanitizeTagList } from "../utils/tags.js";

export function renderMemberTagChips(container, tags, options = {}) {
  if (!container) {
    return;
  }
  const { limit = null, hiddenWhenEmpty = false, chipClassName = "member-tag" } = options;
  const normalized = sanitizeTagList(tags);
  const safeLimit = limit === null || limit === undefined
    ? null
    : (Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : null);
  const items = safeLimit === null ? normalized : normalized.slice(0, safeLimit);

  container.innerHTML = "";
  if (hiddenWhenEmpty) {
    container.hidden = items.length === 0;
  }
  items.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = chipClassName;
    chip.textContent = tag;
    container.appendChild(chip);
  });
}
