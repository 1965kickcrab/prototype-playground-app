function normalizeTagValue(value) {
  return String(value ?? "").trim();
}

function normalizeTagKey(value) {
  return normalizeTagValue(value).toLocaleLowerCase();
}

export function sanitizeTagList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set();
  const next = [];
  values.forEach((value) => {
    const normalized = normalizeTagValue(value);
    if (!normalized) {
      return;
    }
    const key = normalizeTagKey(normalized);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    next.push(normalized);
  });
  return next;
}

export function hasTagValue(list, value) {
  const key = normalizeTagKey(value);
  if (!key) {
    return false;
  }
  const source = Array.isArray(list) ? list : [];
  return source.some((item) => normalizeTagKey(item) === key);
}

export function toTagQuery(value) {
  return normalizeTagKey(value);
}

export function normalizeTagText(value) {
  return normalizeTagValue(value);
}
