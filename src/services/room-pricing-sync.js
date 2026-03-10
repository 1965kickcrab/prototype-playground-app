const HOTELING_SERVICE_TYPE = "hoteling";

function normalizeRoomId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("room:")) {
    return raw.slice(5);
  }
  if (raw.startsWith("class:")) {
    return raw.slice(6);
  }
  return raw;
}

function isMatchedRoomPricing(item, roomId) {
  if (!item || item.serviceType !== HOTELING_SERVICE_TYPE) {
    return false;
  }
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) {
    return false;
  }
  const classIds = Array.isArray(item.classIds) ? item.classIds : [];
  return classIds.some((classId) => normalizeRoomId(classId) === normalizedRoomId);
}

function ensurePricingId(existingItem) {
  if (existingItem?.id) {
    return String(existingItem.id);
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function findRoomHotelingPricing(pricingItems, roomId) {
  const items = Array.isArray(pricingItems) ? pricingItems : [];
  return items.find((item) => isMatchedRoomPricing(item, roomId)) || null;
}

export function countRoomHotelingPricings(pricingItems, roomId) {
  const items = Array.isArray(pricingItems) ? pricingItems : [];
  return items.filter((item) => isMatchedRoomPricing(item, roomId)).length;
}

export function buildRoomHotelingPricingItem({ existingItem, roomId, pricingInput }) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const input = pricingInput && typeof pricingInput === "object" ? pricingInput : {};
  const extraFeesInput = input.extraFees && typeof input.extraFees === "object"
    ? input.extraFees
    : {};
  const extraFees = Object.fromEntries(
    Object.entries(extraFeesInput).map(([key, value]) => [key, String(value ?? "")])
  );
  const hasAnyExtraFee = Object.values(extraFees).some(
    (value) => String(value ?? "").trim() !== ""
  );
  const fallbackEnabled = typeof existingItem?.extraFeeEnabled === "boolean"
    ? existingItem.extraFeeEnabled
    : hasAnyExtraFee;
  const extraFeeEnabled = typeof input.extraFeeEnabled === "boolean"
    ? input.extraFeeEnabled
    : fallbackEnabled;

  return {
    id: ensurePricingId(existingItem),
    serviceType: HOTELING_SERVICE_TYPE,
    pickdropType: "",
    distance: "",
    weightMin: input.weightMin ?? "",
    weightMax: input.weightMax ?? "",
    weekdays: Array.isArray(input.weekdays) ? input.weekdays.filter(Boolean) : [],
    deductionValue: "24",
    deductionUnit: "시간",
    price: input.price ?? "",
    vatSeparate: Boolean(input.vatSeparate),
    extraFeeEnabled: Boolean(extraFeeEnabled),
    extraFeeMode: input.extraFeeMode === "daily" ? "daily" : "grouped",
    extraFees,
    classIds: normalizedRoomId ? [normalizedRoomId] : [],
  };
}

export function upsertRoomHotelingPricing(pricingItems, roomId, nextItem) {
  const items = Array.isArray(pricingItems) ? pricingItems : [];
  const filtered = items.filter((item) => !isMatchedRoomPricing(item, roomId));
  return [...filtered, nextItem];
}

export function removeRoomHotelingPricing(pricingItems, roomId) {
  const items = Array.isArray(pricingItems) ? pricingItems : [];
  return items.filter((item) => !isMatchedRoomPricing(item, roomId));
}
