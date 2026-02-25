import { syncFilterChip } from "../utils/dom.js";

const UNKNOWN_TEACHER = "미지정";

function normalizeTeacherName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed.length > 0 ? trimmed : UNKNOWN_TEACHER;
}

export function setupTeacherFilters(container, classes, state) {
  if (!container) {
    return;
  }

  const teacherNames = classes.map((item) => normalizeTeacherName(item.teacher));
  const uniqueTeachers = Array.from(new Set(teacherNames)).filter(Boolean);
  const fallback = uniqueTeachers.length ? uniqueTeachers : [UNKNOWN_TEACHER];

  if (!state.selectedTeachers || Object.keys(state.selectedTeachers).length === 0) {
    state.selectedTeachers = {};
    fallback.forEach((name) => {
      state.selectedTeachers[name] = true;
    });
  }

  if (!state.teacherOptions || state.teacherOptions.length === 0) {
    state.teacherOptions = fallback.slice();
  }

  container.innerHTML = "";

  fallback.forEach((name) => {
    const label = document.createElement("label");
    label.className = "filter-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = state.selectedTeachers[name] !== false;
    input.setAttribute("data-teacher-filter", "");

    const text = document.createElement("span");
    text.textContent = name;

    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);

    syncFilterChip(input);
  });
}

