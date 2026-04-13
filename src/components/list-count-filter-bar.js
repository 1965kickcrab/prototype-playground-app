function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function renderListCountFilterBar(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const items = Array.isArray(options.items) ? options.items : [];
  const allValue = String(options.allValue || "all");
  const allLabel = String(options.allLabel || "전체");
  const totalCount = Number(options.totalCount) || 0;
  const allSelected = Boolean(options.allSelected);

  container.innerHTML = `
    <button
      class="list-card__count-filter${allSelected ? " is-selected" : ""}"
      type="button"
      data-list-count-filter="${escapeHtml(allValue)}"
    >
      <span>${escapeHtml(allLabel)}</span>
      <span class="list-card__count-filter-count">${escapeHtml(totalCount)}</span>
    </button>
    ${items.map((item) => `
      <button
        class="list-card__count-filter${item?.selected ? " is-selected" : ""}"
        type="button"
        data-list-count-filter="${escapeHtml(item?.value || "")}"
      >
        <span>${escapeHtml(item?.label || "")}</span>
        <span class="list-card__count-filter-count">${escapeHtml(Number(item?.count) || 0)}</span>
      </button>
    `).join("")}
  `;
}

export function bindListCountFilterBar(container, onSelect) {
  if (!(container instanceof HTMLElement) || typeof onSelect !== "function") {
    return;
  }

  container.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-list-count-filter]")
      : null;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    onSelect(target.dataset.listCountFilter || "", target);
  });
}
