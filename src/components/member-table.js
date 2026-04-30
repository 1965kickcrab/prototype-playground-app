import {
  formatReservableCountText,
  getMemberReservableCountByTypeFromReservations,
} from "../services/member-page-service.js";
import { renderMemberTagChips } from "./member-tags.js";

function createReservableText(count) {
  const text = document.createElement("span");
  text.className = "member-list__reservable";

  const label = document.createElement("span");
  label.className = "member-list__reservable-label";

  const value = document.createElement("strong");
  value.className = "member-list__reservable-value";
  const isLowAvailability = count <= 2;

  if (count < 0) {
    text.classList.add("is-over");
    label.textContent = "초과 예약";
    value.textContent = `${Math.abs(count)}회`;
    text.appendChild(label);
    text.appendChild(value);
    return text;
  }

  text.classList.add("is-available");
  if (isLowAvailability) {
    text.classList.add("is-over");
  }
  label.textContent = "예약 가능";
  value.textContent = formatReservableCountText(count);
  text.appendChild(label);
  text.appendChild(value);
  return text;
}

function createChevron() {
  const chevron = document.createElement("img");
  chevron.className = "member-list__chevron";
  chevron.src = "../../assets/iconChevronRight.svg";
  chevron.alt = "";
  chevron.setAttribute("aria-hidden", "true");
  return chevron;
}

function createRow(member, activeReservationCountsByMemberType = null, selectedMemberIds = new Set()) {
  const row = document.createElement("div");
  row.className = "member-list__item member-table__row";
  row.dataset.memberId = String(member?.id || "");
  row.dataset.memberRow = "true";
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  if (selectedMemberIds.has(String(member?.id || ""))) {
    row.classList.add("is-selected");
  }

  const count = getMemberReservableCountByTypeFromReservations(
    member,
    "school",
    activeReservationCountsByMemberType
  );

  const textWrap = document.createElement("span");
  textWrap.className = "member-list__text";

  const headline = document.createElement("span");
  headline.className = "member-list__headline";

  const name = document.createElement("strong");
  name.className = "member-list__name member-table__dog-name";
  name.textContent = member?.dogName || "-";
  headline.appendChild(name);

  const breed = document.createElement("span");
  breed.className = "member-list__breed";
  breed.textContent = member?.breed || "-";
  headline.appendChild(breed);

  const labels = document.createElement("span");
  labels.className = "member-list__labels";
  renderMemberTagChips(
    labels,
    [
      ...(Array.isArray(member?.petTags) ? member.petTags : []),
      ...(Array.isArray(member?.ownerTags) ? member.ownerTags : []),
    ],
    {
      limit: 3,
      hiddenWhenEmpty: true,
      chipClassName: "member-tag member-list__label",
    }
  );

  textWrap.appendChild(headline);
  textWrap.appendChild(labels);
  row.appendChild(textWrap);
  row.appendChild(createReservableText(count));
  row.appendChild(createChevron());
  return row;
}

export function renderMemberRows(
  container,
  members,
  activeReservationCountsByMemberType = null,
  selectedMemberIds = new Set()
) {
  if (!container) {
    return;
  }
  container.innerHTML = "";

  if (!Array.isArray(members) || members.length === 0) {
    const empty = document.createElement("div");
    empty.className = "member-list__empty";
    empty.textContent = "회원 데이터가 없습니다.";
    container.appendChild(empty);
    return;
  }

  members.forEach((member) => {
    container.appendChild(createRow(member, activeReservationCountsByMemberType, selectedMemberIds));
  });
}

function createPageButton(label, page, isActive, isArrow) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.page = String(page);
  button.className = isArrow ? "ticket-pagination__arrow" : "ticket-pagination__page";
  if (isActive) {
    button.classList.add("is-active");
    button.setAttribute("aria-current", "page");
  }
  return button;
}

export function renderMemberPagination(container, totalPages, currentPage) {
  if (!container) {
    return;
  }
  container.innerHTML = "";

  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  container.hidden = safeTotalPages <= 1;
  if (safeTotalPages <= 1) {
    return;
  }
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), safeTotalPages);
  const prevPage = Math.max(1, safeCurrentPage - 1);
  const nextPage = Math.min(safeTotalPages, safeCurrentPage + 1);

  const prevButton = createPageButton("‹", prevPage, false, true);
  prevButton.disabled = safeCurrentPage === 1;
  prevButton.setAttribute("aria-label", "이전 페이지");
  container.appendChild(prevButton);

  for (let page = 1; page <= safeTotalPages; page += 1) {
    container.appendChild(createPageButton(String(page), page, page === safeCurrentPage, false));
  }

  const nextButton = createPageButton("›", nextPage, false, true);
  nextButton.disabled = safeCurrentPage === safeTotalPages;
  nextButton.setAttribute("aria-label", "다음 페이지");
  container.appendChild(nextButton);
}
