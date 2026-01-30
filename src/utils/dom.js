export function markReady(element, name) {
  if (!element) {
    return;
  }

  element.dataset.ready = name;
}

export function syncFilterChip(input) {
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const chip = input.closest(".filter-chip");
  if (!chip) {
    return;
  }

  chip.classList.toggle("is-selected", input.checked);
}
