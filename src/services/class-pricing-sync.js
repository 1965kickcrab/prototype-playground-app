function toId(value) {
  return String(value ?? "").trim();
}

export function syncClassesFromPricing(pricingItems, classes) {
  const classMap = new Map();

  (classes || []).forEach((classItem) => {
    const classId = toId(classItem?.id);
    if (classId) {
      classMap.set(classId, []);
    }
  });

  (pricingItems || []).forEach((item) => {
    const pricingId = toId(item?.id);
    if (!pricingId) {
      return;
    }
    const classIds = Array.isArray(item?.classIds) ? item.classIds : [];
    classIds.forEach((classIdValue) => {
      const classId = toId(classIdValue);
      if (!classId || !classMap.has(classId)) {
        return;
      }
      classMap.get(classId).push(pricingId);
    });
  });

  return (classes || []).map((classItem) => {
    const classId = toId(classItem?.id);
    const pricingIds = classId && classMap.has(classId) ? classMap.get(classId) : [];
    return {
      ...classItem,
      pricingIds,
    };
  });
}
