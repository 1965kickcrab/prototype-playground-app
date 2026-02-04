import {
  formatTicketDisplayName,
  formatTicketPrice,
  normalizePickdropType,
} from "../services/ticket-service.js";
import { normalizeNumericInput } from "../utils/number.js";
import { getDatePartsFromKey, getWeekdayIndex } from "../utils/date.js";

function parsePriceValue(value) {
  const digits = normalizeNumericInput(value);
  if (!digits) {
    return null;
  }
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRangeValue(value) {
  const parsed = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesPickdropType(item, type) {
  if (!item || !type) {
    return false;
  }
  const normalized = normalizePickdropType(item.pickdropType || item.title);
  return normalized === type;
}

function matchesWeightRange(item, weightValue) {
  if (weightValue === null) {
    return true;
  }
  const minValue = parseRangeValue(item.weightMin);
  const maxValue = parseRangeValue(item.weightMax);
  if (minValue === null && maxValue === null) {
    return true;
  }
  if (minValue !== null && weightValue < minValue) {
    return false;
  }
  if (maxValue !== null && weightValue > maxValue) {
    return false;
  }
  return true;
}

function createFeeLine(labelText, calcText) {
  const line = document.createElement("div");
  line.className = "reservation-fee-line";
  const label = document.createElement("span");
  label.className = "reservation-fee-line__label";
  label.textContent = labelText;
  const calc = document.createElement("span");
  calc.className = "reservation-fee-line__calc";
  calc.textContent = calcText;
  line.append(label, calc);
  return line;
}

function setFeeAmountValue(element, value) {
  if (!element) {
    return;
  }
  const values = element.querySelectorAll(".reservation-ticket-row__meta-value");
  const before = values[0] || null;
  const after = values[1] || null;
  const arrow = element.querySelector(".reservation-fee-card__amount-arrow");
  if (!before || !after || !arrow) {
    element.textContent = value ?? "-";
    return;
  }
  const text = value ?? "-";
  before.textContent = text;
  after.textContent = text;
  const isEmpty = text === "-" || text === "";
  element.classList.toggle("is-empty", isEmpty);
}

function getWeekdayMatchCount(weekdays, selectedWeekdayCounts, fallbackCount) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    const count = Math.max(Number(fallbackCount) || 0, 0);
    return { count, matched: count > 0 };
  }
  if (!(selectedWeekdayCounts instanceof Map)) {
    return { count: Math.max(Number(fallbackCount) || 0, 0), matched: false };
  }
  const count = weekdays.reduce(
    (total, label) => total + (selectedWeekdayCounts.get(label) || 0),
    0
  );
  return { count, matched: count > 0 };
}

function buildWeekdayCountMap(dateKeys, timeZone) {
  const map = new Map();
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) {
    return map;
  }
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  dateKeys.forEach((key) => {
    const parts = getDatePartsFromKey(key);
    if (!parts) {
      return;
    }
    const index = getWeekdayIndex(
      parts.year,
      parts.month - 1,
      parts.day,
      timeZone
    );
    const label = labels[index];
    if (!label) {
      return;
    }
    map.set(label, (map.get(label) || 0) + 1);
  });
  return map;
}

function getHotelingWeekdayCount(weekdays, weekdayCounts, fallbackCount) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    const count = Math.max(Number(fallbackCount) || 0, 0);
    return { count, matched: count > 0 };
  }
  if (!(weekdayCounts instanceof Map)) {
    return { count: Math.max(Number(fallbackCount) || 0, 0), matched: false };
  }
  const count = weekdays.reduce(
    (total, label) => total + (weekdayCounts.get(label) || 0),
    0
  );
  return { count, matched: count > 0 };
}

export function renderPickdropTickets(
  container,
  ticketOptions,
  selectionOrder = [],
  allocations = new Map(),
  hasMember,
  isSelectable = false,
  placeholder = null,
  forceEmpty = false
) {
  if (!container) {
    return;
  }
  if (!hasMember) {
    container.hidden = true;
    container.textContent = "";
    if (placeholder) {
      placeholder.hidden = true;
    }
    return;
  }
  if (forceEmpty) {
    container.hidden = true;
    container.textContent = "";
    if (placeholder) {
      placeholder.hidden = false;
    }
    return;
  }
  const pickdropTickets = ticketOptions.filter(
    (option) => option.type === "pickdrop"
  );
  const availableTickets = pickdropTickets.filter(
    (ticket) => Number(ticket?.remainingCount) > 0
  );
  if (availableTickets.length === 0) {
    container.hidden = true;
    container.textContent = "";
    if (placeholder) {
      placeholder.hidden = false;
    }
    return;
  }

  container.hidden = false;
  const fragment = document.createDocumentFragment();
  if (placeholder) {
    placeholder.hidden = true;
  }
  const selectedSet = new Set(selectionOrder);
  availableTickets.forEach((ticket) => {
    const row = document.createElement("label");
    row.className = "reservation-ticket-row";
    row.dataset.ticketId = ticket.id;
    if (selectedSet.has(ticket.id)) {
      row.classList.add("is-selected");
    }
    row.classList.remove("is-disabled");

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selectedSet.has(ticket.id);
    input.disabled = false;
    if (isSelectable) {
      input.value = ticket.id;
      input.setAttribute("data-reservation-ticket", "");
    }

    const box = document.createElement("span");
    box.className = "reservation-ticket-row__box";

    const info = document.createElement("span");
    info.className = "reservation-ticket-row__info";

    const name = document.createElement("span");
    name.className = "reservation-ticket-row__name";
    const badge = document.createElement("span");
    badge.className = "reservation-ticket-row__badge";
    badge.textContent = "픽드랍";
    badge.dataset.type = "pickdrop";
    const nameText = document.createElement("span");
    nameText.className = "reservation-ticket-row__name-text";
    nameText.textContent = formatTicketDisplayName(ticket);
    name.appendChild(badge);
    name.appendChild(nameText);

    const meta = document.createElement("span");
    meta.className = "reservation-ticket-row__meta";
    if (isSelectable) {
      const allocation = allocations.get(ticket.id);
      const remainingBefore = allocation
        ? allocation.remainingBefore
        : Number(ticket.remainingCount) || 0;
      const remainingAfter = allocation
        ? allocation.remainingAfter
        : remainingBefore;
      const beforeValue = document.createElement("span");
      beforeValue.className = "reservation-ticket-row__meta-value";
      if (remainingBefore <= 2) {
        beforeValue.classList.add("is-low");
      }
      beforeValue.textContent = `${remainingBefore}회`;
      const afterValue = document.createElement("span");
      afterValue.className = "reservation-ticket-row__meta-value";
      if (remainingAfter <= 2) {
        afterValue.classList.add("is-low");
      }
      afterValue.textContent = `${remainingAfter}회`;
      meta.append(beforeValue, " → ", afterValue);
    } else {
      const remaining = Number(ticket.remainingCount) || 0;
      meta.textContent = `총 잔여 ${remaining}회`;
    }

    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(input);
    row.appendChild(box);
    row.appendChild(info);
    fragment.appendChild(row);
  });
  container.replaceChildren(fragment);
}

export function renderHotelingFeeBreakdown({
  hotelingFeeContainer,
  hotelingTotalEl,
  totalEl,
  pricingItems,
  rooms,
  roomId,
  nightKeys,
  timeZone,
}) {
  if (!totalEl) {
    return;
  }
  const nightsCount = Array.isArray(nightKeys) ? nightKeys.length : 0;
  if (!roomId || nightsCount <= 0) {
    if (hotelingFeeContainer) {
      hotelingFeeContainer.textContent = "";
    }
    if (hotelingTotalEl) {
      setFeeAmountValue(hotelingTotalEl, "-");
      delete hotelingTotalEl.dataset.feeAmount;
    }
    setFeeAmountValue(totalEl, "-");
    return;
  }

  const roomMap = new Map(
    (Array.isArray(rooms) ? rooms : []).map((item) => [String(item.id || ""), item])
  );
  const pricingList = Array.isArray(pricingItems) ? pricingItems : [];
  const weekdayCounts = buildWeekdayCountMap(nightKeys, timeZone);
  const lines = [];

  pricingList
    .filter((item) => item?.serviceType === "hoteling")
    .forEach((item) => {
      const classIds = Array.isArray(item.classIds) ? item.classIds : [];
      if (classIds.length > 0 && !classIds.includes(roomId)) {
        return;
      }
      const priceValue = parsePriceValue(item?.price);
      if (priceValue === null) {
        return;
      }
      const weekdayResult = getHotelingWeekdayCount(
        item?.weekdays,
        weekdayCounts,
        nightsCount
      );
      if (weekdayResult.count <= 0) {
        return;
      }
      lines.push({
        priceValue,
        count: weekdayResult.count,
        matchedWeekdays: weekdayResult.matched,
      });
    });

  if (hotelingFeeContainer) {
    hotelingFeeContainer.innerHTML = "";
  }

  const roomName = roomMap.get(roomId)?.name || "호텔링";
  let total = 0;
  lines.forEach((line) => {
    const lineTotal = line.priceValue * line.count;
    total += lineTotal;
    if (hotelingFeeContainer) {
      hotelingFeeContainer.appendChild(
        createFeeLine(
          roomName,
          line.matchedWeekdays === false
            ? `${line.count}박`
            : `${formatTicketPrice(line.priceValue)} x ${line.count}박`
        )
      );
    }
  });

  const hasLines = lines.length > 0;
  setFeeAmountValue(totalEl, hasLines ? formatTicketPrice(total) : "-");
  if (hotelingTotalEl) {
    if (hasLines) {
      setFeeAmountValue(hotelingTotalEl, formatTicketPrice(total));
      hotelingTotalEl.dataset.feeAmount = String(total);
    } else {
      setFeeAmountValue(hotelingTotalEl, "-");
      delete hotelingTotalEl.dataset.feeAmount;
    }
  }
  if (hotelingFeeContainer && lines.length === 0) {
    hotelingFeeContainer.textContent = "-";
  }
}

export function renderPricingBreakdown({
  schoolFeeContainer,
  pickdropFeeContainer,
  schoolTotalEl,
  pickdropTotalEl,
  totalEl,
  pricingItems,
  classes,
  services,
  pickdrops,
  dateCount,
  serviceDateCount = null,
  pickdropDateCount = null,
  selectedWeekdayCounts,
  memberWeight = null,
}) {
  if (!totalEl) {
    return;
  }
  const serviceCount = Number.isFinite(Number(serviceDateCount))
    ? Number(serviceDateCount)
    : Number(dateCount);
  const pickdropCount = Number.isFinite(Number(pickdropDateCount))
    ? Number(pickdropDateCount)
    : Number(dateCount);
  if (
    (!Number.isFinite(serviceCount) || serviceCount <= 0)
    && (!Number.isFinite(pickdropCount) || pickdropCount <= 0)
  ) {
    if (schoolFeeContainer) {
      schoolFeeContainer.textContent = "";
    }
    if (pickdropFeeContainer) {
      pickdropFeeContainer.textContent = "";
    }
    if (schoolTotalEl) {
      setFeeAmountValue(schoolTotalEl, "-");
      delete schoolTotalEl.dataset.feeAmount;
    }
    if (pickdropTotalEl) {
      setFeeAmountValue(pickdropTotalEl, "-");
      delete pickdropTotalEl.dataset.feeAmount;
    }
    setFeeAmountValue(totalEl, "-");
    return;
  }

  const classMap = new Map(
    classes.map((item) => [item.name, { id: String(item.id || ""), type: item.type }])
  );
  const pricingByType = new Map();
  pricingItems.forEach((item) => {
    if (!item) {
      return;
    }
    const type = item.serviceType || "";
    if (!pricingByType.has(type)) {
      pricingByType.set(type, []);
    }
    pricingByType.get(type).push(item);
  });
  const weightValue = Number.isFinite(memberWeight) ? memberWeight : null;
  const serviceLines = [];
  const pickdropLines = [];

  services.forEach((service) => {
    const classInfo = classMap.get(service);
    if (!classInfo?.id) {
      return;
    }
    const classType = classInfo.type || "school";
    const candidates = (pricingByType.get(classType) || []).filter((item) => {
      const classIds = Array.isArray(item.classIds) ? item.classIds : [];
      if (classIds.length > 0 && !classIds.includes(classInfo.id)) {
        return false;
      }
      return matchesWeightRange(item, weightValue);
    });
    if (candidates.length === 0) {
      return;
    }
    candidates.forEach((target) => {
      const priceValue = parsePriceValue(target?.price);
      const weekdayResult = getWeekdayMatchCount(
        target?.weekdays,
        selectedWeekdayCounts,
        serviceCount
      );
      if (priceValue === null || weekdayResult.count <= 0) {
        return;
      }
      serviceLines.push({
        label: service,
        priceValue,
        count: weekdayResult.count,
        matchedWeekdays: weekdayResult.matched,
        unit: "회",
      });
    });
  });

  const pickdropSelections = Array.from(pickdrops || []);
  const hasPickup = pickdropSelections.includes("pickup");
  const hasDropoff = pickdropSelections.includes("dropoff");
  const selectionCount = (hasPickup ? 1 : 0) + (hasDropoff ? 1 : 0);
  const pickdropPricing = pricingByType.get("pickdrop") || [];
  const roundtripItem = pickdropPricing.find(
    (priceItem) =>
      matchesPickdropType(priceItem, "왕복")
  );
  const onewayItem = pickdropPricing.find(
    (priceItem) =>
      matchesPickdropType(priceItem, "편도")
  );
  const roundtripPrice = parsePriceValue(roundtripItem?.price);
  const onewayPrice = parsePriceValue(onewayItem?.price);

  if (hasPickup && hasDropoff && roundtripPrice !== null && pickdropCount > 0) {
    pickdropLines.push({
      label: "왕복",
      priceValue: roundtripPrice,
      count: pickdropCount,
      unit: "회",
    });
  } else if (selectionCount > 0 && onewayPrice !== null && pickdropCount > 0) {
    pickdropLines.push({
      label: "편도",
      priceValue: onewayPrice,
      count: pickdropCount * selectionCount,
      unit: "회",
    });
  }

  if (schoolFeeContainer) {
    schoolFeeContainer.innerHTML = "";
  }
  if (pickdropFeeContainer) {
    pickdropFeeContainer.innerHTML = "";
  }

  let serviceTotal = 0;
  let pickdropTotal = 0;
  serviceLines.forEach((line) => {
    const shouldApplyPrice = line.matchedWeekdays !== false;
    const lineTotal = shouldApplyPrice ? line.priceValue * line.count : 0;
    serviceTotal += lineTotal;
    if (schoolFeeContainer) {
      schoolFeeContainer.appendChild(
        createFeeLine(
          line.label,
          line.matchedWeekdays === false
            ? `${line.count}${line.unit}`
            : `${formatTicketPrice(line.priceValue)} x ${line.count}${line.unit}`
        )
      );
    }
  });
  pickdropLines.forEach((line) => {
    const lineTotal = line.priceValue * line.count;
    pickdropTotal += lineTotal;
    if (pickdropFeeContainer) {
      pickdropFeeContainer.appendChild(
        createFeeLine(
          line.label,
          `${formatTicketPrice(line.priceValue)} x ${line.count}${line.unit}`
        )
      );
    }
  });

  const hasAnyLines = serviceLines.length + pickdropLines.length > 0;
  const total = serviceTotal + pickdropTotal;
  setFeeAmountValue(totalEl, hasAnyLines ? formatTicketPrice(total) : "-");
  if (schoolTotalEl) {
    if (serviceLines.length > 0) {
      setFeeAmountValue(schoolTotalEl, formatTicketPrice(serviceTotal));
      schoolTotalEl.dataset.feeAmount = String(serviceTotal);
    } else {
      setFeeAmountValue(schoolTotalEl, "-");
      delete schoolTotalEl.dataset.feeAmount;
    }
  }
  if (pickdropTotalEl) {
    if (pickdropLines.length > 0) {
      setFeeAmountValue(pickdropTotalEl, formatTicketPrice(pickdropTotal));
      pickdropTotalEl.dataset.feeAmount = String(pickdropTotal);
    } else {
      setFeeAmountValue(pickdropTotalEl, "-");
      delete pickdropTotalEl.dataset.feeAmount;
    }
  }
  if (schoolFeeContainer && serviceLines.length === 0) {
    schoolFeeContainer.textContent = "-";
  }
  if (pickdropFeeContainer && pickdropLines.length === 0) {
    pickdropFeeContainer.textContent = "-";
  }
}







