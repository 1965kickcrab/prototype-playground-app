function normalizeNumericInput(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length <= 1) {
    return digits;
  }
  const trimmed = digits.replace(/^0+/, "");
  return trimmed.length ? trimmed : "0";
}

function formatNumberWithCommas(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getDigitCount(value) {
  return String(value).replace(/\D/g, "").length;
}

function getCaretFromDigitIndex(formatted, digitIndex) {
  if (digitIndex <= 0) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      count += 1;
    }
    if (count >= digitIndex) {
      return i + 1;
    }
  }
  return formatted.length;
}

function formatNumericInputWithCommas(input) {
  if (!input) {
    return;
  }
  const rawValue = input.value;
  const selectionStart = input.selectionStart;
  const digitsBeforeCaret =
    selectionStart === null ? 0 : getDigitCount(rawValue.slice(0, selectionStart));
  const normalized = normalizeNumericInput(rawValue);
  const formatted = normalized ? formatNumberWithCommas(normalized) : "";
  input.value = formatted;
  if (selectionStart !== null) {
    const caret = getCaretFromDigitIndex(formatted, digitsBeforeCaret);
    input.setSelectionRange(caret, caret);
  }
}

export {
  formatNumberWithCommas,
  formatNumericInputWithCommas,
  normalizeNumericInput,
};
