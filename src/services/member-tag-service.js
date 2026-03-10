import { sanitizeTagList, toTagQuery, hasTagValue } from "../utils/tags.js";

function sortByQueryPriority(tags, query) {
  if (!query) {
    return tags.slice();
  }
  const prefixMatches = [];
  const includeMatches = [];
  tags.forEach((tag) => {
    const key = toTagQuery(tag);
    if (key.startsWith(query)) {
      prefixMatches.push(tag);
      return;
    }
    if (key.includes(query)) {
      includeMatches.push(tag);
    }
  });
  return [...prefixMatches, ...includeMatches];
}

export function buildTagSuggestions(catalog, query, selectedTags = [], limit = 20) {
  const normalizedCatalog = sanitizeTagList(catalog);
  const sorted = sortByQueryPriority(normalizedCatalog, toTagQuery(query));
  const filtered = sorted.filter((tag) => !hasTagValue(selectedTags, tag));
  return filtered.slice(0, Math.max(1, Number(limit) || 20));
}

export function mergeTagCatalog(currentTags, incomingTags) {
  return sanitizeTagList([...(Array.isArray(currentTags) ? currentTags : []), ...(Array.isArray(incomingTags) ? incomingTags : [])]);
}
