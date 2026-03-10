import {
  loadMemberTagCatalog,
  saveMemberTagCatalog,
} from "../storage/member-tag-catalog.js";
import {
  loadIssueMembers,
  replaceIssueMembers,
} from "../storage/ticket-issue-members.js";
import { sanitizeTagList, toTagQuery } from "../utils/tags.js";

function buildDraftMap(drafts) {
  const map = new Map();
  (Array.isArray(drafts) ? drafts : []).forEach((item) => {
    const sourceTag = String(item?.sourceTag || "").trim();
    const sourceKey = toTagQuery(sourceTag);
    if (!sourceKey) {
      return;
    }
    map.set(sourceKey, {
      sourceTag,
      nextTag: String(item?.nextTag || "").trim(),
      isDeleted: Boolean(item?.isDeleted),
    });
  });
  return map;
}

function buildCatalogEditPlan(currentCatalog, drafts) {
  const current = sanitizeTagList(currentCatalog);
  const draftMap = buildDraftMap(drafts);
  const renameMap = new Map();
  const deletedKeys = new Set();
  const nextCandidates = [];

  current.forEach((tag) => {
    const sourceKey = toTagQuery(tag);
    const draft = draftMap.get(sourceKey);
    const isDeleted = Boolean(draft?.isDeleted);
    const nextTag = String(draft?.nextTag || tag).trim();

    if (isDeleted || !nextTag) {
      deletedKeys.add(sourceKey);
      return;
    }
    renameMap.set(sourceKey, nextTag);
    nextCandidates.push(nextTag);
  });

  const nextCatalog = sanitizeTagList(nextCandidates);
  const canonicalByKey = new Map(
    nextCatalog.map((tag) => [toTagQuery(tag), tag])
  );
  const normalizedRenameMap = new Map();
  renameMap.forEach((tag, key) => {
    const canonical = canonicalByKey.get(toTagQuery(tag));
    if (canonical) {
      normalizedRenameMap.set(key, canonical);
    }
  });

  return { nextCatalog, renameMap: normalizedRenameMap, deletedKeys };
}

function applyTagPlanToMemberTags(tags, renameMap, deletedKeys) {
  const source = Array.isArray(tags) ? tags : [];
  const mapped = source
    .map((tag) => {
      const key = toTagQuery(tag);
      if (!key) {
        return "";
      }
      if (renameMap.has(key)) {
        return renameMap.get(key) || "";
      }
      if (deletedKeys.has(key)) {
        return "";
      }
      return tag;
    })
    .filter(Boolean);
  return sanitizeTagList(mapped);
}

function applyTagPlanToMembers(members, renameMap, deletedKeys) {
  const source = Array.isArray(members) ? members : [];
  return source.map((member) => ({
    ...member,
    ownerTags: applyTagPlanToMemberTags(member?.ownerTags, renameMap, deletedKeys),
    petTags: applyTagPlanToMemberTags(member?.petTags, renameMap, deletedKeys),
  }));
}

export function applyMemberTagCatalogEdits(drafts) {
  const currentCatalog = loadMemberTagCatalog();
  const { nextCatalog, renameMap, deletedKeys } = buildCatalogEditPlan(currentCatalog, drafts);

  saveMemberTagCatalog(nextCatalog);
  const members = loadIssueMembers();
  const syncedMembers = applyTagPlanToMembers(members, renameMap, deletedKeys);
  replaceIssueMembers(syncedMembers);

  return {
    nextCatalog,
    renameMap: Object.fromEntries(renameMap),
    deletedKeys: Array.from(deletedKeys),
  };
}
