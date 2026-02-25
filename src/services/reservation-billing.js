import {
  calculateDateEntryFee,
  createDateEntryFee,
  sumDateEntryFeeExpected,
} from "./reservation-date-fee.js";
import {
  PAYMENT_METHODS,
  normalizeReservationPayment,
} from "./reservation-payment.js";
import { normalizePickdropType } from "./ticket-service.js";

const BILLING_VERSION = 1;
const BILLING_CURRENCY = "KRW";

function toAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(Math.round(numeric), 0);
}

function createEmptyAllocation() {
  return {
    expected: 0,
    school: 0,
    daycare: 0,
    hoteling: 0,
    oneway: 0,
    roundtrip: 0,
  };
}

function parsePriceValue(value) {
  const digits = String(value ?? "").replace(/[^0-9-]/g, "");
  if (!digits) {
    return 0;
  }
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function resolvePickdropModeFromReservation(reservation) {
  const dates = Array.isArray(reservation?.dates) ? reservation.dates : [];
  const hasPickup = Boolean(
    reservation?.hasPickup
    || dates.some((entry) => Boolean(entry?.pickup))
  );
  const hasDropoff = Boolean(
    reservation?.hasDropoff
    || dates.some((entry) => Boolean(entry?.dropoff))
  );
  if (hasPickup && hasDropoff) {
    return "roundtrip";
  }
  if (hasPickup || hasDropoff) {
    return "oneway";
  }
  return "none";
}

function createCharge({
  code,
  serviceType,
  amount,
  unitPrice = amount,
  qty = 1,
  dateKey,
  meta,
}) {
  const safeUnitPrice = toAmount(unitPrice);
  const safeQty = Math.max(Number(qty) || 0, 0);
  const safeAmount = toAmount(amount);
  const charge = {
    code: String(code || ""),
    serviceType: String(serviceType || ""),
    unitPrice: safeUnitPrice,
    qty: safeQty,
    amount: safeAmount,
  };
  if (typeof dateKey === "string" && dateKey.trim()) {
    charge.dateKey = dateKey;
  }
  if (meta && typeof meta === "object") {
    charge.meta = meta;
  }
  return charge;
}

function normalizeCharge(rawCharge) {
  const charge = rawCharge && typeof rawCharge === "object" ? rawCharge : {};
  const normalized = createCharge({
    code: charge.code,
    serviceType: charge.serviceType,
    amount: charge.amount,
    unitPrice: charge.unitPrice,
    qty: charge.qty,
    dateKey: charge.dateKey,
    meta: charge.meta,
  });
  if (!normalized.code) {
    return null;
  }
  return normalized;
}

function addAllocation(allocationsByDate, dateKey, fee) {
  if (!dateKey) {
    return;
  }
  const next = createDateEntryFee(fee);
  const current = allocationsByDate[dateKey]
    ? createDateEntryFee(allocationsByDate[dateKey])
    : createEmptyAllocation();
  const merged = {
    school: current.school + next.school,
    daycare: current.daycare + next.daycare,
    hoteling: current.hoteling + next.hoteling,
    oneway: current.oneway + next.oneway,
    roundtrip: current.roundtrip + next.roundtrip,
  };
  allocationsByDate[dateKey] = createDateEntryFee(merged);
}

function findHotelingCheckinDateKey(dates) {
  const entries = Array.isArray(dates) ? dates : [];
  const checkinEntry = entries.find((entry) => String(entry?.kind || "") === "checkin");
  if (checkinEntry?.date) {
    return String(checkinEntry.date);
  }
  const first = entries.find((entry) => typeof entry?.date === "string" && entry.date.trim());
  return first ? String(first.date) : "";
}

function resolveRoundtripUnitPrice(pricingItems) {
  const items = Array.isArray(pricingItems) ? pricingItems : [];
  const target = items.find(
    (item) => item?.serviceType === "pickdrop"
      && normalizePickdropType(item?.pickdropType || item?.title) === "왕복"
  );
  return parsePriceValue(target?.price);
}

function resolveEntryServiceType(reservation, entry) {
  const reservationType = String(reservation?.type || "school");
  const hasEntryService = Boolean(
    String(entry?.class || entry?.service || "").trim()
  );
  if (reservationType === "hoteling") {
    return String(entry?.kind || "") === "checkout" ? "" : "hoteling";
  }
  if (!hasEntryService) {
    return "";
  }
  if (reservationType === "daycare") {
    return "daycare";
  }
  return "school";
}

function resolveEntryClassId(reservation, entry, options = {}) {
  if (reservation?.type === "hoteling") {
    return String(reservation?.room || "");
  }
  const explicitResolver = options.classIdResolver;
  if (typeof explicitResolver === "function") {
    const resolved = explicitResolver(entry, reservation);
    return String(resolved || "");
  }
  if (typeof options.classId === "string") {
    return options.classId;
  }
  const classIdByName = options.classIdByName instanceof Map
    ? options.classIdByName
    : null;
  const className = String(
    entry?.class
    || entry?.service
    || reservation?.class
    || reservation?.service
    || ""
  );
  if (classIdByName && className) {
    return String(classIdByName.get(className) || "");
  }
  return "";
}

function createChargesFromAllocation(dateKey, allocation) {
  const fee = createDateEntryFee(allocation);
  const charges = [];
  if (fee.school > 0) {
    charges.push(createCharge({
      code: "SCHOOL",
      serviceType: "school",
      amount: fee.school,
      dateKey,
    }));
  }
  if (fee.daycare > 0) {
    charges.push(createCharge({
      code: "DAYCARE",
      serviceType: "daycare",
      amount: fee.daycare,
      dateKey,
    }));
  }
  if (fee.hoteling > 0) {
    charges.push(createCharge({
      code: "HOTELING_NIGHT",
      serviceType: "hoteling",
      amount: fee.hoteling,
      dateKey,
    }));
  }
  if (fee.oneway > 0) {
    charges.push(createCharge({
      code: "PICKDROP_ONEWAY",
      serviceType: "oneway",
      amount: fee.oneway,
      dateKey,
    }));
  }
  if (fee.roundtrip > 0) {
    charges.push(createCharge({
      code: "PICKDROP_ROUNDTRIP",
      serviceType: "roundtrip",
      amount: fee.roundtrip,
      dateKey,
    }));
  }
  return charges;
}

function createBillingTotals(expected, payment) {
  const normalizedPayment = payment
    ? normalizeReservationPayment(payment)
    : null;
  const method = normalizedPayment?.method || "";
  const safeExpected = toAmount(expected);
  const paid = method === PAYMENT_METHODS.TICKET
    ? safeExpected
    : (method ? toAmount(normalizedPayment.amount) : 0);
  return {
    expected: safeExpected,
    paid,
    balance: safeExpected - paid,
  };
}

export function buildReservationBilling(reservationDraft = {}, options = {}) {
  const draft = reservationDraft && typeof reservationDraft === "object"
    ? reservationDraft
    : {};
  const dates = Array.isArray(draft.dates) ? draft.dates : [];
  const pricingItems = Array.isArray(options.pricingItems)
    ? options.pricingItems
    : [];
  const allocationsByDate = {};
  const charges = [];
  const pickdropMode = resolvePickdropModeFromReservation(draft);
  const reservationType = String(draft.type || "school");

  dates.forEach((entry) => {
    const dateKey = String(entry?.date || "");
    if (!dateKey) {
      return;
    }
    const serviceType = resolveEntryServiceType(draft, entry);
    const classId = resolveEntryClassId(draft, entry, options);

    let pickup = Boolean(entry?.pickup);
    let dropoff = Boolean(entry?.dropoff);
    if (reservationType === "hoteling" && pickdropMode === "roundtrip") {
      pickup = false;
      dropoff = false;
    }

    const fee = pricingItems.length > 0
      ? calculateDateEntryFee({
        dateKey,
        serviceType,
        classId,
        checkinTime: entry?.checkinTime,
        checkoutTime: entry?.checkoutTime,
        pickup,
        dropoff,
        pricingItems,
        memberWeight: options.memberWeight,
        timeZone: options.timeZone,
      })
      : createDateEntryFee(entry?.fee);

    addAllocation(allocationsByDate, dateKey, fee);
    charges.push(...createChargesFromAllocation(dateKey, fee));
  });

  if (reservationType === "hoteling" && pickdropMode === "roundtrip") {
    const unitPrice = resolveRoundtripUnitPrice(pricingItems);
    const allocationDateKey = findHotelingCheckinDateKey(dates);
    const roundtripCharge = createCharge({
      code: "PICKDROP_ROUNDTRIP",
      serviceType: "roundtrip",
      unitPrice,
      qty: 1,
      amount: unitPrice,
      meta: allocationDateKey ? { allocationDateKey } : {},
    });
    charges.push(roundtripCharge);
    if (allocationDateKey && roundtripCharge.amount > 0) {
      addAllocation(allocationsByDate, allocationDateKey, {
        roundtrip: roundtripCharge.amount,
      });
    }
  }

  const expected = charges.reduce((sum, charge) => sum + toAmount(charge?.amount), 0);

  return {
    version: BILLING_VERSION,
    currency: BILLING_CURRENCY,
    pickdrop: {
      mode: pickdropMode,
    },
    charges,
    totals: createBillingTotals(expected, options.payment || draft.payment),
    allocationsByDate,
  };
}

export function getBillingAllocationForDate(billing, dateKey) {
  const key = String(dateKey || "");
  if (!key) {
    return createEmptyAllocation();
  }
  const allocations =
    billing && typeof billing === "object" && billing.allocationsByDate
      ? billing.allocationsByDate
      : null;
  const fee = allocations && typeof allocations === "object"
    ? allocations[key]
    : null;
  return createDateEntryFee(fee);
}

export function sumBillingAllocationsExpected(billing) {
  const allocations =
    billing && typeof billing === "object" && billing.allocationsByDate
      ? billing.allocationsByDate
      : null;
  if (!allocations || typeof allocations !== "object") {
    return 0;
  }
  return sumDateEntryFeeExpected(
    Object.entries(allocations).map(([date, fee]) => ({ date, fee }))
  );
}

function buildBillingFromDateFeeCache(reservation = {}) {
  const dates = Array.isArray(reservation?.dates) ? reservation.dates : [];
  const allocationsByDate = {};
  dates.forEach((entry) => {
    const dateKey = String(entry?.date || "");
    if (!dateKey) {
      return;
    }
    addAllocation(allocationsByDate, dateKey, entry?.fee);
  });

  const charges = Object.entries(allocationsByDate).flatMap(([dateKey, allocation]) =>
    createChargesFromAllocation(dateKey, allocation)
  );
  const expected = charges.reduce((sum, charge) => sum + toAmount(charge?.amount), 0);

  return {
    version: BILLING_VERSION,
    currency: BILLING_CURRENCY,
    pickdrop: {
      mode: resolvePickdropModeFromReservation(reservation),
    },
    charges,
    totals: createBillingTotals(expected, reservation.payment),
    allocationsByDate,
  };
}

export function normalizeReservationBilling(rawBilling, reservation = {}) {
  if (!rawBilling || typeof rawBilling !== "object") {
    return buildBillingFromDateFeeCache(reservation);
  }

  const pickdropMode = ["none", "oneway", "roundtrip"].includes(rawBilling?.pickdrop?.mode)
    ? rawBilling.pickdrop.mode
    : resolvePickdropModeFromReservation(reservation);
  const charges = Array.isArray(rawBilling.charges)
    ? rawBilling.charges.map((item) => normalizeCharge(item)).filter(Boolean)
    : [];

  const allocationsRaw =
    rawBilling.allocationsByDate && typeof rawBilling.allocationsByDate === "object"
      ? rawBilling.allocationsByDate
      : {};
  const allocationsByDate = Object.entries(allocationsRaw).reduce((acc, [dateKey, fee]) => {
    acc[dateKey] = createDateEntryFee(fee);
    return acc;
  }, {});

  const expectedFromCharges = charges.reduce((sum, charge) => sum + toAmount(charge?.amount), 0);
  const expectedFromAllocations = sumDateEntryFeeExpected(
    Object.entries(allocationsByDate).map(([date, fee]) => ({ date, fee }))
  );
  const expected = Math.max(expectedFromCharges, expectedFromAllocations);
  const totals = createBillingTotals(expected, reservation.payment);

  return {
    version: Number(rawBilling.version) || BILLING_VERSION,
    currency: String(rawBilling.currency || BILLING_CURRENCY),
    pickdrop: {
      mode: pickdropMode,
    },
    charges,
    totals,
    allocationsByDate,
  };
}

export function buildReservationWithBilling(reservationDraft = {}, options = {}) {
  const billing = buildReservationBilling(reservationDraft, options);
  return {
    ...reservationDraft,
    billing,
  };
}

export function syncReservationBillingCache(reservation = {}) {
  const normalizedBilling = normalizeReservationBilling(reservation.billing, reservation);
  return {
    ...reservation,
    billing: normalizedBilling,
  };
}
