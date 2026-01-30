export function renderSelectableChips(
  container,
  options,
  { dataKey, selectedValue = "" } = {}
) {
  if (!container) {
    return;
  }
  container.textContent = "";
  const values = Array.isArray(options) ? options : [];
  values.forEach((value) => {
    const normalized =
      value && typeof value === "object"
        ? { label: value.label ?? value.name ?? "", value: value.value ?? value.id ?? "" }
        : { label: value, value };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = normalized.label;
    if (dataKey) {
      button.dataset[dataKey] = String(normalized.value);
    }
    if (selectedValue && String(normalized.value) === String(selectedValue)) {
      button.classList.add("is-selected");
    }
    container.appendChild(button);
  });
}

function toDataAttrName(key) {
  return `data-${String(key).replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

export function setSelectedChip(container, dataKey, value) {
  if (!container) {
    return;
  }
  const attrName = toDataAttrName(dataKey);
  container.querySelectorAll(`[${attrName}]`).forEach((chip) => {
    const isSelected = chip.dataset?.[dataKey] === String(value);
    chip.classList.toggle("is-selected", isSelected);
  });
}

export function renderStaticChip(container, label) {
  if (!container) {
    return;
  }
  container.textContent = "";
  const chip = document.createElement("span");
  chip.className = "filter-chip is-selected";
  chip.textContent = label || "-";
  container.appendChild(chip);
}
