import {
  formatReservableCountText,
  getMemberPhone,
  getMemberReservableCountFromReservations,
  isReservableOver,
} from "../services/member-page-service.js";
import { sanitizeTagList } from "../utils/tags.js";
import { renderMemberTagChips } from "./member-tags.js";

function createCell(text) {
  const cell = document.createElement("span");
  cell.textContent = text;
  return cell;
}

function createIssueButton(memberId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ticket-issue-button";
  button.textContent = "지급";
  button.dataset.memberIssue = "true";
  button.dataset.memberId = String(memberId || "");
  return button;
}

function createDogCell(member) {
  const cell = document.createElement("span");
  cell.className = "member-table__dog-cell";

  const name = document.createElement("strong");
  name.className = "member-table__dog-name";
  name.textContent = member?.dogName || "-";
  cell.appendChild(name);

  const tags = sanitizeTagList(member?.petTags).slice(0, 3);
  if (!tags.length) {
    return cell;
  }

  const tagList = document.createElement("div");
  tagList.className = "member-tags member-tags--pet";
  renderMemberTagChips(tagList, tags, { limit: 3 });
  cell.appendChild(tagList);
  return cell;
}

function createRow(member, activeReservationCountsByMemberType = null) {
  const row = document.createElement("div");
  row.className = "ticket-table__row member-table__row";
  row.dataset.memberId = String(member?.id || "");
  row.dataset.memberRow = "true";
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");

  row.appendChild(createDogCell(member));
  row.appendChild(createCell(member?.owner || "-"));
  row.appendChild(createCell(getMemberPhone(member)));

  const count = getMemberReservableCountFromReservations(
    member,
    activeReservationCountsByMemberType
  );
  const countCell = createCell(formatReservableCountText(count));
  if (isReservableOver(count)) {
    countCell.classList.add("member-table__count-over");
  }
  row.appendChild(countCell);

  const actionCell = document.createElement("span");
  actionCell.appendChild(createIssueButton(member?.id));
  row.appendChild(actionCell);
  return row;
}

export function renderMemberRows(
  container,
  members,
  activeReservationCountsByMemberType = null
) {
  if (!container) {
    return;
  }
  container.innerHTML = "";

  if (!Array.isArray(members) || members.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ticket-table__row ticket-table__row--empty";
    empty.textContent = "회원 데이터가 없습니다.";
    container.appendChild(empty);
    return;
  }

  members.forEach((member) => {
    container.appendChild(createRow(member, activeReservationCountsByMemberType));
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
