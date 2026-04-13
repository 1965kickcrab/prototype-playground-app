import {
  getMemberReservableCountFromReservations,
  isReservableOver,
} from "../services/member-page-service.js";

function createOverBadge() {
  const badge = document.createElement("span");
  badge.className = "member-list__badge";
  badge.textContent = "초과";
  return badge;
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

  const count = getMemberReservableCountFromReservations(
    member,
    activeReservationCountsByMemberType
  );

  const textWrap = document.createElement("span");
  textWrap.className = "member-list__text";

  if (isReservableOver(count)) {
    textWrap.appendChild(createOverBadge());
  }

  const name = document.createElement("strong");
  name.className = "member-list__name member-table__dog-name";
  name.textContent = member?.dogName || "-";
  textWrap.appendChild(name);

  const breed = document.createElement("span");
  breed.className = "member-list__breed";
  breed.textContent = member?.breed || "-";
  textWrap.appendChild(breed);

  row.appendChild(textWrap);
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
