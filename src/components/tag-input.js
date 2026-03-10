import { buildTagSuggestions } from "../services/member-tag-service.js";
import { hasTagValue, normalizeTagText, sanitizeTagList } from "../utils/tags.js";

function createTagChip(label) {
  const chip = document.createElement("span");
  chip.className = "member-tag-editor__chip";
  const text = document.createElement("span");
  text.textContent = label;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.tagRemove = label;
  button.setAttribute("aria-label", "태그 삭제");
  button.textContent = "×";
  chip.appendChild(text);
  chip.appendChild(button);
  return chip;
}

function createSuggestionButton(label, isCreate = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "member-tag-editor__suggestion";
  button.dataset.tagSuggestion = label;
  button.textContent = isCreate ? `"${label}" 추가` : label;
  return button;
}

export function initTagInput(options = {}) {
  const {
    container,
    initialTags = [],
    getCatalog = () => [],
    onChange = null,
  } = options;
  if (!container) {
    return null;
  }

  const input = container.querySelector("[data-member-tag-input]");
  const selectedWrap = container.querySelector("[data-member-tag-selected]");
  const suggestionsWrap = container.querySelector("[data-member-tag-suggestions]");
  if (!(input instanceof HTMLInputElement) || !selectedWrap || !suggestionsWrap) {
    return null;
  }

  const state = {
    tags: sanitizeTagList(initialTags),
  };

  const emitChange = () => {
    if (typeof onChange === "function") {
      onChange(state.tags.slice());
    }
  };

  const hideSuggestions = () => {
    suggestionsWrap.hidden = true;
    suggestionsWrap.innerHTML = "";
  };

  const renderSelected = () => {
    selectedWrap.innerHTML = "";
    if (!state.tags.length) {
      selectedWrap.hidden = true;
      return;
    }
    selectedWrap.hidden = false;
    state.tags.forEach((tag) => {
      selectedWrap.appendChild(createTagChip(tag));
    });
  };

  const renderSuggestions = () => {
    const query = normalizeTagText(input.value);
    const catalog = sanitizeTagList(getCatalog());
    const suggestions = buildTagSuggestions(catalog, query, state.tags);
    const canCreate = Boolean(query) && !hasTagValue(catalog, query) && !hasTagValue(state.tags, query);

    suggestionsWrap.innerHTML = "";
    if (!suggestions.length && !canCreate) {
      hideSuggestions();
      return;
    }

    if (canCreate) {
      suggestionsWrap.appendChild(createSuggestionButton(query, true));
    }
    suggestions.forEach((tag) => {
      suggestionsWrap.appendChild(createSuggestionButton(tag));
    });
    suggestionsWrap.hidden = false;
  };

  const addTag = (value) => {
    const tag = normalizeTagText(value);
    if (!tag || hasTagValue(state.tags, tag)) {
      return;
    }
    state.tags = sanitizeTagList([...state.tags, tag]);
    input.value = "";
    renderSelected();
    renderSuggestions();
    emitChange();
  };

  const removeTag = (value) => {
    const tag = normalizeTagText(value);
    if (!tag) {
      return;
    }
    state.tags = state.tags.filter((item) => !hasTagValue([item], tag));
    renderSelected();
    renderSuggestions();
    emitChange();
  };

  container.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) {
      return;
    }
    const removeButton = target.closest("[data-tag-remove]");
    if (removeButton) {
      removeTag(removeButton.dataset.tagRemove || "");
      return;
    }
    const suggestionButton = target.closest("[data-tag-suggestion]");
    if (suggestionButton) {
      addTag(suggestionButton.dataset.tagSuggestion || "");
      input.focus();
    }
  });

  input.addEventListener("input", () => {
    renderSuggestions();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const firstSuggestion = suggestionsWrap.querySelector("[data-tag-suggestion]");
    const value = firstSuggestion instanceof HTMLElement
      ? firstSuggestion.dataset.tagSuggestion || input.value
      : input.value;
    addTag(value);
  });

  input.addEventListener("focus", () => {
    renderSuggestions();
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      hideSuggestions();
    }, 100);
  });

  renderSelected();

  return {
    getTags() {
      return state.tags.slice();
    },
  };
}
