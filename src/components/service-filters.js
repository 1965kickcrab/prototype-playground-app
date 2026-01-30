import { syncFilterChip } from "../utils/dom.js";

export function setupServiceFilters(container, classes, state) {
  if (!container) {
    return;
  }

  const services = classes
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0);

  const fallback = services.length ? services : ["유치원"];

  if (!state.selectedServices || Object.keys(state.selectedServices).length === 0) {
    state.selectedServices = {};
    fallback.forEach((name) => {
      state.selectedServices[name] = true;
    });
  }

  if (!state.defaultService) {
    state.defaultService = fallback[0];
  }

  container.innerHTML = "";

  fallback.forEach((name) => {
    const label = document.createElement("label");
    label.className = "filter-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = state.selectedServices[name] !== false;
    input.setAttribute("data-class-filter", "");

    const text = document.createElement("span");
    text.textContent = name;

    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);

    syncFilterChip(input);
  });
}

