export function normalizeDaysValue(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

export function normalizeOpenLength(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

export function getPoliciesSignature(policies) {
  return JSON.stringify(policies);
}
