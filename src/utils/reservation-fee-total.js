import { normalizeNumericInput } from "./number.js";
import { formatTicketPrice } from "../services/ticket-service.js";

function parseNumericValue(value) {
  const digits = normalizeNumericInput(value);
  if (!digits) {
    return 0;
  }
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFeeAmountValue(element) {
  if (!element) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(element.dataset, "feeAmount")) {
    return parseNumericValue(element.dataset.feeAmount);
  }
  return null;
}

export function sumReservationFeeAmounts(root) {
  if (!root) {
    return null;
  }
  const amountElements = root.querySelectorAll(".reservation-fee-card__amount");
  let hasAmount = false;
  let total = 0;
  amountElements.forEach((element) => {
    const value = getFeeAmountValue(element);
    if (value === null) {
      return;
    }
    hasAmount = true;
    total += value;
  });
  return hasAmount ? total : null;
}

export function syncReservationFeeTotal(root, totalEl) {
  if (!totalEl) {
    return;
  }
  const scope = root || totalEl.closest(".modal") || document.body;
  const total = sumReservationFeeAmounts(scope);
  totalEl.textContent = total === null ? "-" : formatTicketPrice(total);
}

