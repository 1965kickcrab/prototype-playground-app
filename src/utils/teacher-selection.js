const UNKNOWN_TEACHER = "미지정";

export function normalizeTeacher(service, state) {
  const raw = state?.classTeachers?.[service] ?? "";
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : UNKNOWN_TEACHER;
}

export function getActiveTeachers(state) {
  const selected = state?.selectedTeachers || {};
  const active = Object.keys(selected).filter((key) => selected[key]);
  if (active.length) {
    return active;
  }
  if (Array.isArray(state?.teacherOptions) && state.teacherOptions.length > 0) {
    return state.teacherOptions;
  }
  return [UNKNOWN_TEACHER];
}
