import {
  formatPrice,
  formatVat,
  formatWeightRange,
  formatWeekdays,
  formatClassNames,
  formatPickdropTypeValue,
  formatDistance,
} from "../services/pricing-service.js";

function createCell() {
  const cell = document.createElement("span");
  cell.setAttribute("role", "cell");
  return cell;
}

function createTextCell(text) {
  const cell = createCell();
  cell.textContent = text;
  return cell;
}

function createWeekdayCell(item = {}) {
  return createTextCell(formatWeekdays(item));
}

function createDetailButton(item = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button-secondary button-secondary--small";
  button.textContent = "더보기";
  button.dataset.pricingDetailOpen = "true";
  if (item.id) {
    button.dataset.pricingId = item.id;
  }
  return button;
}

export function renderPricingRows(container, items = [], classes = [], rooms = []) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-table__row";
    row.setAttribute("role", "row");
    row.dataset.pricingId = item.id || "";

    if (item.serviceType === "pickdrop") {
      row.appendChild(createTextCell(formatPickdropTypeValue(item)));
      row.appendChild(createTextCell(formatDistance(item)));
    } else {
      row.appendChild(createTextCell(formatWeightRange(item)));
      row.appendChild(createWeekdayCell(item));
    }
    row.appendChild(createTextCell(formatPrice(item)));
    row.appendChild(createTextCell(formatVat(item)));
    row.appendChild(createTextCell(formatClassNames(item, classes, rooms)));

    const actionCell = createCell();
    actionCell.appendChild(createDetailButton(item));
    row.appendChild(actionCell);

    container.appendChild(row);
  });
}

export function renderPricingDetail(container, item = {}, classes = [], rooms = []) {
  if (!container) {
    return;
  }

  const rows = [];
  if (item.serviceType === "pickdrop") {
    rows.push({ label: "유형", value: formatPickdropTypeValue(item) });
    rows.push({ label: "거리(km)", value: formatDistance(item) });
  } else {
    rows.push({ label: "체중(kg)", value: formatWeightRange(item) });
    rows.push({ label: "요일", value: formatWeekdays(item) });
  }
  rows.push({ label: "금액", value: formatPrice(item) });
  rows.push({ label: "VAT 별도", value: formatVat(item) });
  rows.push({ label: "상품 연동", value: formatClassNames(item, classes, rooms) });

  container.innerHTML = "";
  rows.forEach((row) => {
    const wrapper = document.createElement("div");
    wrapper.className = "pricing-detail__row";

    const label = document.createElement("span");
    label.className = "pricing-detail__label";
    label.textContent = row.label;

    const value = document.createElement("span");
    value.className = "pricing-detail__value";
    value.textContent = row.value;

    wrapper.appendChild(label);
    wrapper.appendChild(value);
    container.appendChild(wrapper);
  });
}

