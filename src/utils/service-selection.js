/**
 * service-selection.js
 * Responsibility:
 * - Normalize service selection based on state and fallback rules
 * - Provide helpers to resolve default service and currently active services
 * Notes:
 * - Falls back to `state.defaultService` → first key in `state.selectedServices` → DEFAULT_SERVICE
 */
const DEFAULT_SERVICE = "school";

export function getDefaultService(state) {
  return (
    state?.defaultService ||
    Object.keys(state?.selectedServices || {})[0] ||
    DEFAULT_SERVICE
  );
}

export function normalizeService(value, state) {
  if (!value) {
    return getDefaultService(state);
  }

  const serviceValue = String(value);
  const keys = Object.keys(state?.selectedServices || {});
  if (keys.includes(serviceValue)) {
    return serviceValue;
  }

  return getDefaultService(state);
}

export function getActiveServices(state) {
  const entries = Object.entries(state?.selectedServices || {});
  const active = entries.filter(([, enabled]) => enabled).map(([key]) => key);
  return active.length ? active : [getDefaultService(state)];
}
