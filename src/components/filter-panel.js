import { normalizeTeacher } from "../utils/teacher-selection.js";

const UNKNOWN_TEACHER = "미지정";

function normalizeTeacherName(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : UNKNOWN_TEACHER;
}

function updateMenuOptionState(option) {
  const input = option.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  option.classList.toggle("is-selected", input.checked);
}

function updateFilterButtonLabel(button, selected, total, allLabel) {
  if (!button) {
    return;
  }
  if (selected.length === total) {
    button.textContent = allLabel;
    return;
  }
  if (selected.length === 1) {
    button.textContent = selected[0];
    return;
  }
  if (selected.length > 1) {
    const sorted = [...selected].sort((a, b) => a.localeCompare(b, "ko"));
    button.textContent = `${sorted[0]} 외 ${selected.length - 1}`;
    return;
  }
  button.textContent = allLabel;
}

function renderClassMenu(container, classes, state) {
  if (!container) {
    return;
  }

  const classNames = classes
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0);
  const fallback = classNames.length ? classNames : ["유치원"];

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
    label.className = "menu-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = state.selectedServices[name] !== false;
    input.setAttribute("data-class-filter", "");

    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "menu-option__title";
    title.textContent = name;
    text.appendChild(title);

    label.appendChild(input);
    label.appendChild(text);
    updateMenuOptionState(label);

    container.appendChild(label);
  });
}

function renderTeacherMenu(container, classes, state) {
  if (!container) {
    return;
  }

  const teachers = classes.map((item) => normalizeTeacherName(item.teacher));
  const fallback = Array.from(new Set(teachers)).filter(Boolean);
  const options = fallback.length ? fallback : [UNKNOWN_TEACHER];

  if (!state.selectedTeachers || Object.keys(state.selectedTeachers).length === 0) {
    state.selectedTeachers = {};
    options.forEach((name) => {
      state.selectedTeachers[name] = true;
    });
  }

  if (!state.teacherOptions || state.teacherOptions.length === 0) {
    state.teacherOptions = options.slice();
  }

  container.innerHTML = "";

  options.forEach((name) => {
    const label = document.createElement("label");
    label.className = "menu-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = name;
    input.checked = state.selectedTeachers[name] !== false;
    input.setAttribute("data-teacher-filter", "");

    const title = document.createElement("span");
    title.className = "menu-option__title";
    title.textContent = name;

    label.appendChild(input);
    label.appendChild(title);
    updateMenuOptionState(label);

    container.appendChild(label);
  });
}

function updateFilterSummary(panel) {
  const classButton = panel.querySelector("[data-filter-button='class']");
  const classInputs = panel.querySelectorAll("[data-class-filter]");
  const classSelected = Array.from(classInputs)
    .filter((input) => input.checked)
    .map((input) => input.value);
  updateFilterButtonLabel(
    classButton,
    classSelected,
    classInputs.length,
    "전체 클래스"
  );

  const teacherButton = panel.querySelector("[data-filter-button='teacher']");
  const teacherInputs = panel.querySelectorAll("[data-teacher-filter]");
  const teacherSelected = Array.from(teacherInputs)
    .filter((input) => input.checked)
    .map((input) => input.value);
  updateFilterButtonLabel(
    teacherButton,
    teacherSelected,
    teacherInputs.length,
    "전체 선생님"
  );

  const badge = panel.querySelector("[data-filter-badge]");
  if (badge) {
    let activeCount = 0;
    if (classSelected.length !== classInputs.length) {
      activeCount += 1;
    }
    if (teacherSelected.length !== teacherInputs.length) {
      activeCount += 1;
    }
    badge.textContent = String(activeCount);
    badge.hidden = activeCount === 0;
  }
}

function closeOtherMenus(current, menus) {
  menus.forEach((menu) => {
    if (menu !== current) {
      menu.hidden = true;
      const button = menu.closest(".filter-dropdown")?.querySelector(".filter-select");
      button?.setAttribute("aria-expanded", "false");
    }
  });
}

function closeAllMenus(menus) {
  menus.forEach((menu) => {
    menu.hidden = true;
    const button = menu.closest(".filter-dropdown")?.querySelector(".filter-select");
    button?.setAttribute("aria-expanded", "false");
  });
}

export function setupFilterPanel(panel, classes, state) {
  if (!panel) {
    return;
  }

  const toggle = panel.querySelector("[data-filter-toggle]");
  const body = panel.querySelector("[data-filter-panel-body]");
  const classMenu = panel.querySelector("[data-filter-menu='class']");
  const teacherMenu = panel.querySelector("[data-filter-menu='teacher']");
  const menus = [classMenu, teacherMenu].filter(Boolean);

  renderClassMenu(classMenu, classes, state);
  renderTeacherMenu(teacherMenu, classes, state);
  updateFilterSummary(panel);
  closeAllMenus(menus);

  toggle?.addEventListener("click", () => {
    const isOpen = body?.hasAttribute("hidden") === false;
    if (body) {
      body.hidden = isOpen;
    }
    toggle.setAttribute("aria-expanded", String(!isOpen));
    if (isOpen) {
      closeAllMenus(menus);
    }
  });

  panel.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-filter-button]")
      : null;
    if (button) {
      const targetKey = button.getAttribute("data-filter-button");
      const menu = panel.querySelector(`[data-filter-menu='${targetKey}']`);
      if (menu) {
        const isOpen = menu.hasAttribute("hidden") === false;
        closeOtherMenus(menu, menus);
        menu.hidden = isOpen;
        button.setAttribute("aria-expanded", String(!isOpen));
      }
      return;
    }

    const reset = event.target instanceof HTMLElement
      ? event.target.closest("[data-filter-reset]")
      : null;
    if (reset) {
      panel.querySelectorAll("[data-class-filter]").forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.checked = true;
          state.selectedServices[input.value] = true;
          updateMenuOptionState(input.closest(".menu-option"));
        }
      });
      panel.querySelectorAll("[data-teacher-filter]").forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.checked = true;
          state.selectedTeachers[input.value] = true;
          updateMenuOptionState(input.closest(".menu-option"));
        }
      });
      updateFilterSummary(panel);
      document.dispatchEvent(new CustomEvent("service-filter:change"));
      document.dispatchEvent(new CustomEvent("teacher-filter:change"));
    }
  });

  panel.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (input.matches("[data-class-filter]")) {
      state.selectedServices[input.value] = input.checked;
      const hasActive = Object.values(state.selectedServices || {}).some(Boolean);
      if (!hasActive) {
        state.selectedServices[input.value] = true;
        input.checked = true;
      }
      updateMenuOptionState(input.closest(".menu-option"));
      updateFilterSummary(panel);
      document.dispatchEvent(new CustomEvent("service-filter:change"));
      return;
    }
    if (input.matches("[data-teacher-filter]")) {
      state.selectedTeachers[input.value] = input.checked;
      const hasActive = Object.values(state.selectedTeachers || {}).some(Boolean);
      if (!hasActive) {
        state.selectedTeachers[input.value] = true;
        input.checked = true;
      }
      updateMenuOptionState(input.closest(".menu-option"));
      updateFilterSummary(panel);
      document.dispatchEvent(new CustomEvent("teacher-filter:change"));
    }
  });

  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target)) {
      menus.forEach((menu) => {
        menu.hidden = true;
        const button = menu.closest(".filter-dropdown")?.querySelector(".filter-select");
        button?.setAttribute("aria-expanded", "false");
      });
    }
  });
}


