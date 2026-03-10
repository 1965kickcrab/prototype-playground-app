import { readStorageArray, writeStorageValue } from "./storage-utils.js";
import { mergeTagCatalog } from "../services/member-tag-service.js";

const STORAGE_KEY = "memberTagCatalog";

export function loadMemberTagCatalog() {
  return mergeTagCatalog(readStorageArray(STORAGE_KEY), []);
}

export function saveMemberTagCatalog(tags) {
  const next = mergeTagCatalog([], tags);
  writeStorageValue(STORAGE_KEY, next);
  return next;
}

export function mergeMemberTagCatalog(tags) {
  const current = loadMemberTagCatalog();
  const next = mergeTagCatalog(current, tags);
  writeStorageValue(STORAGE_KEY, next);
  return next;
}
