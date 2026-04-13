import { getCalendarDayNamesMarkup } from "./calendar-shared.js";

const buildIcon = (assetPrefix, name, alt = "", className = "") => {
  const classAttr = className ? ` class="${className}"` : "";
  return `<img src="${assetPrefix}assets/${name}" alt="${alt}" aria-hidden="true"${classAttr}>`;
};

const buildMiniCalendarControls = ({
  prevAttr,
  currentAttr,
  nextAttr,
  assetPrefix,
}) => `
  <div class="mini-calendar__controls">
    <button class="month-button month-button--prev" type="button" ${prevAttr} aria-label="이전 달">
      ${buildIcon(assetPrefix, "iconChevronLeft.svg")}
    </button>
    <div class="mini-calendar__current" ${currentAttr}>0000년 0월</div>
    <button class="month-button month-button--next" type="button" ${nextAttr} aria-label="다음 달">
      ${buildIcon(assetPrefix, "iconChevronRight.svg")}
    </button>
  </div>
`;

const buildReservationModal = ({
  title,
  titleId,
  modalAttr,
  overlayAttr,
  closeAttr,
  dialogClass = "",
  bodyClass = "",
  rightAttr = "",
  leftHtml,
  rightHtml,
  footerHtml,
  assetPrefix = "../",
}) => `
  <div class="modal" ${modalAttr} aria-hidden="true">
    <div class="modal__overlay" ${overlayAttr}></div>
    <div class="modal__dialog ${dialogClass}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="modal__header">
        <h2 id="${titleId}">${title}</h2>
        <button class="icon-button modal__close" type="button" ${closeAttr} aria-label="닫기">
          ${buildIcon(assetPrefix, "iconClose.svg")}
        </button>
      </div>
      <div class="modal__body ${bodyClass}">
        <div class="reservation-form">
          <div class="reservation-form__left">${leftHtml}</div>
          <div class="reservation-form__right" ${rightAttr}>${rightHtml}</div>
        </div>
        ${footerHtml}
      </div>
    </div>
  </div>
`;

const buildReservationFeeSegment = ({
  title,
  segmentAttr = "",
  titleAttr = "",
  amountAttr = "",
  bodyAttr = "",
  contentHtml = "",
  assetPrefix,
  open = true,
}) => `
  <div class="reservation-fee-segment" ${segmentAttr}>
    <div class="reservation-fee-segment__header" data-fee-toggle>
      <span class="reservation-fee-segment__title" ${titleAttr}>${title}</span>
      <span class="reservation-fee-segment__amount" ${amountAttr}>
        <span class="reservation-ticket-row__meta">
          <span class="as-is">-</span>
        </span>
      </span>
      ${buildIcon(assetPrefix, "iconDropdown.svg", "", "reservation-fee-segment__arrow")}
    </div>
    <div class="reservation-fee-segment__body" ${bodyAttr} ${open ? "" : "hidden"}>
      ${contentHtml}
    </div>
  </div>
`;

const buildReservationFeeCard = ({
  detailAttr = "",
  title,
  amountAttr = "",
  contentHtml = "",
  assetPrefix,
  open = true,
}) => `
  <div class="reservation-fee-group" ${detailAttr}>
    <div class="reservation-fee-group__header" data-fee-group-toggle>
      <span class="reservation-fee-group__title">${title}</span>
      <span class="reservation-fee-group__amount" ${amountAttr}>
        <span class="reservation-ticket-row__meta">
          <span class="as-is">-</span>
        </span>
      </span>
      ${buildIcon(assetPrefix, "iconDropdown.svg", "", "reservation-fee-group__arrow")}
    </div>
    <div class="reservation-fee-group__body" ${open ? "" : "hidden"}>
      ${contentHtml}
    </div>
  </div>
`;

const buildProgressStep = ({
  index,
  label,
  assetPrefix,
  isActive = false,
  attrs = "",
}) => `
  <div class="reservation-progress__step${isActive ? " is-active" : ""}" ${attrs}>
    <span class="reservation-progress__badge">
      <span class="reservation-progress__badge-text">${index}</span>
      ${buildIcon(assetPrefix, "iconCheck.svg", "", "reservation-progress__badge-check")}
    </span>
    <span class="reservation-progress__label">${label}</span>
  </div>
`;

const buildMemoCard = (dataAttr = "") => `
  <div class="reservation-memo-card">
    <div class="reservation-memo-card__title">메모</div>
    <div class="reservation-memo-card__body">
      <textarea class="form-field__control" ${dataAttr} placeholder="메모를 입력하세요" rows="3"></textarea>
    </div>
  </div>
`;

const buildReservationServiceField = ({ assetPrefix }) => `
  <button
    class="reservation-select-field"
    type="button"
    data-reservation-service-trigger
    aria-expanded="false"
  >
    <span class="reservation-select-field__value" data-reservation-service-value>회원을 먼저 선택해 주세요.</span>
    ${buildIcon(assetPrefix, "iconDropdown.svg", "", "reservation-select-field__arrow")}
  </button>
  <div class="reservation-sheet-backdrop" data-reservation-service-sheet-backdrop hidden></div>
  <div class="reservation-sheet" data-reservation-service-sheet hidden>
    <div class="reservation-sheet__header">
      <strong class="reservation-sheet__title">클래스 선택</strong>
      <button class="icon-button icon-button--secondary reservation-sheet__close" type="button" data-reservation-service-sheet-close aria-label="닫기">
        ${buildIcon(assetPrefix, "iconClose.svg")}
      </button>
    </div>
    <div class="reservation-sheet__body" data-reservation-services></div>
  </div>
`;

const buildHotelingDateField = ({ assetPrefix }) => `
  <label class="hoteling-date-input" data-hoteling-date-trigger>
    ${buildIcon(assetPrefix, "iconDatePicker.svg", "", "hoteling-date-input__icon")}
    <input
      class="form-field__control hoteling-date-input__control"
      type="text"
      placeholder="입퇴실 날짜 선택"
      readonly
      data-hoteling-date-input
    >
  </label>
`;

const buildHotelingDateSheet = ({ assetPrefix }) => `
  <div class="reservation-sheet-backdrop" data-hoteling-date-sheet-backdrop hidden></div>
  <div class="reservation-sheet hoteling-date-sheet" data-hoteling-date-sheet hidden>
    <div class="reservation-sheet__header hoteling-date-sheet__header">
      <button
        class="icon-button icon-button--secondary reservation-sheet__close"
        type="button"
        data-hoteling-date-sheet-close
        aria-label="닫기"
      >
        ${buildIcon(assetPrefix, "iconClose.svg")}
      </button>
      <strong class="reservation-sheet__title">입퇴실 날짜</strong>
      <span class="hoteling-date-sheet__header-spacer" aria-hidden="true"></span>
    </div>
    <div class="hoteling-date-sheet__content">
      <label class="hoteling-date-input hoteling-date-input--sheet">
        ${buildIcon(assetPrefix, "iconDatePicker.svg", "", "hoteling-date-input__icon")}
        <input
          class="form-field__control hoteling-date-input__control"
          type="text"
          placeholder="입퇴실 날짜 선택"
          readonly
          data-hoteling-date-sheet-summary
        >
      </label>
      <div class="hoteling-date-sheet__months" data-hoteling-date-sheet-months></div>
      <button class="primary-button hoteling-date-sheet__submit" type="button" data-hoteling-date-sheet-submit disabled>선택</button>
    </div>
  </div>
`;

const buildFilterChipOption = ({ value, label, inputAttr }) => `
  <label class="filter-chip">
    <input type="checkbox" value="${value}" ${inputAttr}>
    <span>${label}</span>
  </label>
`;

const buildPickdropOptions = (inputAttr) => `
  ${buildFilterChipOption({ value: "pickup", label: "픽업", inputAttr })}
  ${buildFilterChipOption({ value: "dropoff", label: "드랍", inputAttr })}
`;

const buildTicketListContent = ({
  listAttr,
  emptyAttr,
  listClass = "reservation-ticket-list",
  emptyMessage = "사용 가능한 이용권이 없습니다.",
}) => `
  <div class="${listClass}" ${listAttr}></div>
  <p class="reservation-ticket-placeholder" ${emptyAttr} hidden>${emptyMessage}</p>
`;

const buildOtherPaymentPanel = () => `
  <div class="reservation-fee-tab-panel" data-fee-panel="other" hidden>
    <div class="reservation-fee-other">
      <select class="form-field__control" data-reservation-other-type>
        <option value="cash">현금</option>
        <option value="bank">계좌이체</option>
        <option value="card">카드</option>
      </select>
      <div class="reservation-fee-other__input-wrapper">
        <input type="text" class="form-field__control" placeholder="0" data-reservation-other-amount>
        <span class="reservation-fee-other__suffix">원</span>
      </div>
    </div>
  </div>
`;

const buildBalanceRow = ({ rowAttr, totalAttr, title }) => `
  <div class="reservation-fee-balance" ${rowAttr}>
    <span class="reservation-fee-balance__title">${title}</span>
    <span class="reservation-fee-balance__price" ${totalAttr}>0원</span>
  </div>
`;

const buildPaymentFeeCard = ({
  title,
  amountAttr,
  assetPrefix,
  ticketSegmentsHtml,
}) => buildReservationFeeCard({
  detailAttr: 'data-fee-group="payment"',
  title,
  amountAttr,
  assetPrefix,
  open: false,
  contentHtml: `
    <div class="reservation-fee-tabs">
      <div class="reservation-fee-tab-list" role="tablist">
        <button class="reservation-fee-tab is-active" type="button" role="tab" data-fee-tab="ticket">이용권</button>
        <button class="reservation-fee-tab" type="button" role="tab" data-fee-tab="other">현장 결제</button>
      </div>
      <div class="reservation-fee-tab-panel is-active" data-fee-panel="ticket">
        <div class="reservation-fee-segments">
          ${ticketSegmentsHtml}
        </div>
      </div>
      ${buildOtherPaymentPanel()}
    </div>
  `,
});

export function renderReservationModal({ rootSelector, modalHtml }) {
  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }
  root.innerHTML = modalHtml;
}

export function createHotelingReservationModalElements(root = document) {
  const reservationModal = root.querySelector("[data-hoteling-reservation-modal]");

  return {
    reservationModal,
    dateInput: reservationModal?.querySelector("[data-hoteling-date-input]"),
    dateTrigger: reservationModal?.querySelector("[data-hoteling-date-trigger]"),
    dateSheet: reservationModal?.querySelector("[data-hoteling-date-sheet]"),
    dateSheetBackdrop: reservationModal?.querySelector("[data-hoteling-date-sheet-backdrop]"),
    dateSheetClose: reservationModal?.querySelector("[data-hoteling-date-sheet-close]"),
    dateSheetSummary: reservationModal?.querySelector("[data-hoteling-date-sheet-summary]"),
    dateSheetMonths: reservationModal?.querySelector("[data-hoteling-date-sheet-months]"),
    dateSheetSubmit: reservationModal?.querySelector("[data-hoteling-date-sheet-submit]"),
    nightSummaryEl: reservationModal?.querySelector("[data-hoteling-night-summary]"),
    memberInput: root.querySelector("[data-hoteling-member-input]"),
    memberResults: root.querySelector("[data-hoteling-member-results]"),
    memberClear: root.querySelector("[data-hoteling-member-clear]"),
    hotelingMemoInput: reservationModal?.querySelector("[data-hoteling-memo]"),
    ticketList: reservationModal?.querySelector("[data-hoteling-tickets]"),
    ticketEmpty: reservationModal?.querySelector("[data-hoteling-tickets-empty]"),
    hotelingFeeList: reservationModal?.querySelector("[data-hoteling-fee-list]"),
    hotelingFeeTotal: reservationModal?.querySelector("[data-hoteling-hoteling-total]"),
    hotelingTicketTotal: reservationModal?.querySelector("[data-hoteling-ticket-total]"),
    pickdropFeeList: reservationModal?.querySelector("[data-hoteling-pickdrop-fee-list]"),
    pickdropFeeTotal: reservationModal?.querySelector("[data-hoteling-pickdrop-total]"),
    pickdropTicketTotal: reservationModal?.querySelector("[data-hoteling-pickdrop-ticket-total]"),
    paymentTotalAll: reservationModal?.querySelector("[data-payment-total-all]"),
    reservationPaymentTypeInput: reservationModal?.querySelector("[data-reservation-payment-type], [data-reservation-other-type]"),
    reservationOtherAmountInput: reservationModal?.querySelector("[data-reservation-other-amount]"),
    hotelingTotalAll: reservationModal?.querySelector("[data-hoteling-total]"),
    hotelingFeeStep: reservationModal?.querySelector(".reservation-form__right"),
    hotelingFeeCard: reservationModal?.querySelector("[data-hoteling-fee-hoteling]"),
    pickdropFeeCard: reservationModal?.querySelector("[data-hoteling-fee-pickdrop]"),
    pickdropTicketField: reservationModal?.querySelector("[data-hoteling-pickdrop-tickets]"),
    pickdropTicketEmpty: reservationModal?.querySelector("[data-hoteling-pickdrop-tickets-empty]"),
    pickdropInputs: reservationModal?.querySelectorAll("[data-hoteling-pickdrop-option]"),
    submitButton: reservationModal?.querySelector("[data-hoteling-submit]"),
    balanceRow: reservationModal?.querySelector("[data-hoteling-fee-balance-row]"),
    balanceTotal: reservationModal?.querySelector("[data-hoteling-fee-balance-total]"),
  };
}

export function getSchoolReservationModalMarkup({ assetPrefix = "../" } = {}) {
  const progressHtml = `
    <div class="reservation-progress" data-reservation-progress>
      <span class="reservation-progress__line" aria-hidden="true"></span>
      ${buildProgressStep({
    index: 1,
    label: "유치원",
    assetPrefix,
    isActive: true,
    attrs: 'data-reservation-progress-step="1"',
  })}
      <span class="reservation-progress__line" aria-hidden="true"></span>
      ${buildProgressStep({
    index: 2,
    label: "픽드랍",
    assetPrefix,
    attrs: 'data-reservation-progress-step="2"',
  })}
      <span class="reservation-progress__line" aria-hidden="true"></span>
    </div>
  `;

  const leftHtml = `
    ${progressHtml}
    <div class="reservation-row reservation-row--member">
      <div class="reservation-row__label">회원</div>
      <div class="reservation-row__field">
        <div class="member-search">
          <div class="member-search__input">
            <input type="search" placeholder="반려견 / 보호자 검색" data-member-input aria-label="회원 검색">
            <button class="member-search__clear" type="button" data-member-clear aria-label="검색어 지우기">×</button>
          </div>
          <div class="member-search__results" data-member-results></div>
        </div>
      </div>
    </div>
${buildMemoCard("data-reservation-memo")}
    <div class="reservation-row" data-reservation-services-row>
      <div class="reservation-row__label">클래스</div>
      <div class="reservation-row__field">
        ${buildReservationServiceField({ assetPrefix })}
      </div>
    </div>
    <div class="reservation-row reservation-row--pickdrop">
      <div class="reservation-row__label">픽드랍</div>
      <div class="reservation-row__field option-chips" data-reservation-pickdrop>
        ${buildPickdropOptions("data-reservation-pickdrop-option")}
      </div>
    </div>
    <div class="reservation-step" data-reservation-step="1">
      <div class="reservation-row reservation-row--calendar">
        <div class="reservation-row__header">
          <div class="reservation-row__label">날짜</div>
          ${buildMiniCalendarControls({
    prevAttr: "data-mini-prev",
    currentAttr: "data-mini-current",
    nextAttr: "data-mini-next",
    assetPrefix,
  })}
        </div>
        <div class="mini-calendar">
          ${getCalendarDayNamesMarkup("mini-calendar__day-names")}
          <div class="mini-calendar__grid" data-mini-grid></div>
        </div>
      </div>
      <div class="reservation-row reservation-row--counts" data-reservation-counts-row>
        <div class="reservation-row__label">예약 횟수</div>
        <div class="reservation-row__field">
          <div class="reservation-counts">
            <span>총 <strong data-reservation-count-current>0</strong> / <strong data-reservation-count-limit>0</strong>회</span>
            <span class="reservation-counts__error" data-reservation-count-error hidden>
              <img src="${assetPrefix}assets/errorTxtIcon.svg" alt="" aria-hidden="true">
              <span data-reservation-count-diff>0</span>회 초과
            </span>
          </div>
          <label class="checkbox-inline">
            <input type="checkbox" data-reservation-override>
            <span>예약 가능 횟수 초과해서 등록하기</span>
          </label>
        </div>
      </div>
      <div class="reservation-row" data-reservation-daycare-row hidden>
        <div class="reservation-row__label">시간</div>
        <div class="reservation-row__field reservation-time-grid">
          <label class="reservation-time-field">
            <span>시작 시간</span>
            <input class="form-field__control" type="time" data-reservation-start-time>
          </label>
          <label class="reservation-time-field">
            <span>종료 시간</span>
            <input class="form-field__control" type="time" data-reservation-end-time>
          </label>
        </div>
      </div>
    </div>
  `;

  const feeAreaHtml = `
      ${buildReservationFeeCard({
    detailAttr: 'data-fee-group="total"',
    title: "총 예상 금액",
    amountAttr: 'data-reservation-total',
    assetPrefix,
    open: false,
    contentHtml: `
          <div class="reservation-fee-segments">
            ${buildReservationFeeSegment({
      title: "유치원",
      segmentAttr: 'data-reservation-fee-segment="school-fee"',
      amountAttr: 'data-reservation-service-fee-total',
      bodyAttr: 'data-reservation-fee-service-list',
      assetPrefix,
    })}
            ${buildReservationFeeSegment({
      title: "데이케어",
      segmentAttr: 'data-reservation-fee-segment="daycare-fee"',
      amountAttr: 'data-reservation-daycare-fee-total',
      bodyAttr: 'data-reservation-fee-daycare-list',
      assetPrefix,
    })}
            ${buildReservationFeeSegment({
      title: "픽드랍",
      segmentAttr: 'data-reservation-fee-segment="pickdrop-fee"',
      amountAttr: 'data-reservation-pickdrop-fee-total',
      bodyAttr: 'data-reservation-fee-pickdrop-list',
      assetPrefix,
    })}
          </div>
        `,
  })}

      ${buildPaymentFeeCard({
    title: "결제",
    amountAttr: 'data-reservation-payment-total',
    assetPrefix,
    ticketSegmentsHtml: `
      ${buildReservationFeeSegment({
      title: "유치원",
      segmentAttr: 'data-reservation-fee-segment="school-ticket"',
      amountAttr: 'data-reservation-service-ticket-total',
      contentHtml: buildTicketListContent({
        listAttr: "data-reservation-service-tickets",
        emptyAttr: "data-reservation-service-tickets-empty",
      }),
      assetPrefix,
    })}
      ${buildReservationFeeSegment({
      title: "데이케어",
      segmentAttr: 'data-reservation-fee-segment="daycare-ticket"',
      amountAttr: 'data-reservation-daycare-ticket-total',
      contentHtml: buildTicketListContent({
        listAttr: "data-reservation-daycare-tickets",
        emptyAttr: "data-reservation-daycare-tickets-empty",
      }),
      assetPrefix,
    })}
      ${buildReservationFeeSegment({
      title: "픽드랍",
      segmentAttr: 'data-reservation-fee-segment="pickdrop-ticket"',
      amountAttr: 'data-reservation-pickdrop-ticket-total',
      contentHtml: buildTicketListContent({
        listAttr: "data-reservation-pickdrop-tickets",
        emptyAttr: "data-reservation-pickdrop-tickets-empty",
        listClass: "reservation-pickdrop-ticket-list",
      }),
      assetPrefix,
    })}
    `,
  })}
  ${buildBalanceRow({
    rowAttr: "data-reservation-fee-balance-row",
    totalAttr: "data-reservation-fee-balance-total",
    title: "잔여",
  })}
  `;

  const rightHtml = feeAreaHtml;

  const footerHtml = `
    <div class="reservation-submit reservation-submit--split" data-reservation-submit-bar hidden>
      <div class="reservation-submit__summary" data-reservation-submit-summary aria-live="polite">
        <div class="reservation-submit__summary-group">
          <span class="reservation-submit__summary-label">예약 횟수</span>
          <strong class="reservation-submit__summary-value">
            총 <span data-reservation-submit-current>0</span> / <span data-reservation-submit-limit>0회</span>
          </strong>
        </div>
      </div>
      <div class="reservation-submit__actions">
        <button class="primary-button" type="button" data-reservation-pickdrop-toggle data-reservation-pickdrop-start>픽드랍까지</button>
        <button class="button-secondary" type="button" data-reservation-submit disabled>등록</button>
      </div>
    </div>
  `;

  return buildReservationModal({
    title: "예약 등록",
    titleId: "reservation-modal-title",
    modalAttr: "data-reservation-modal",
    overlayAttr: "data-reservation-overlay",
    closeAttr: "data-reservation-close",
    dialogClass: "",
    bodyClass: "",
    rightAttr: 'data-reservation-step="2"',
    leftHtml,
    rightHtml,
    footerHtml,
    assetPrefix,
  });
}

export function getHotelingReservationModalMarkup({ assetPrefix = "../../" } = {}) {
  const progressHtml = `
    <div class="reservation-progress hoteling-progress">
      <span class="reservation-progress__line" aria-hidden="true"></span>
      ${buildProgressStep({
    index: 1,
    label: "호텔링",
    assetPrefix,
    isActive: true,
  })}
      <span class="reservation-progress__line" aria-hidden="true"></span>
      ${buildProgressStep({
    index: 2,
    label: "픽드랍",
    assetPrefix,
  })}
      <span class="reservation-progress__line" aria-hidden="true"></span>
    </div>
  `;

  const leftHtml = `
    <div class="reservation-row reservation-row--member">
      <div class="reservation-row__label">회원</div>
      <div class="reservation-row__field">
        <div class="member-search hoteling-modal__search">
          <div class="member-search__input">
            <input type="search" placeholder="반려견 / 보호자 검색" aria-label="반려견 또는 보호자 검색" data-hoteling-member-input>
            <button class="member-search__clear" type="button" data-hoteling-member-clear aria-label="검색어 지우기">×</button>
          </div>
          <div class="member-search__results" data-hoteling-member-results></div>
        </div>
      </div>
    </div>
    ${progressHtml}
    <section class="reservation-step hoteling-reservation-step">
      <div class="reservation-row">
        <div class="reservation-row__label">호실</div>
        <div class="reservation-row__field option-chips" data-hoteling-room-options></div>
      </div>
      <div class="reservation-row reservation-row--hoteling-date">
        <div class="reservation-row__label">날짜 선택</div>
        <div class="reservation-row__field">
          ${buildHotelingDateField({ assetPrefix })}
        </div>
      </div>
      ${buildHotelingDateSheet({ assetPrefix })}
      <div class="reservation-row reservation-row--hoteling-time">
        <div class="reservation-row__field">
          <div class="hoteling-time-grid">
            <div class="hoteling-time-field">
              <div class="hoteling-time-field__label">입실 시간</div>
              <label class="hoteling-modal__time-field reservation-time-field">
                <input class="form-field__control" type="time" value="10:00" data-hoteling-checkin-time>
              </label>
            </div>
            <div class="hoteling-time-field">
              <div class="hoteling-time-field__label">퇴실 시간</div>
              <label class="hoteling-modal__time-field reservation-time-field">
                <input class="form-field__control" type="time" value="10:00" data-hoteling-checkout-time>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="reservation-row reservation-row--pickdrop">
        <div class="reservation-row__label">픽드랍</div>
        <div class="reservation-row__field option-chips" data-hoteling-pickdrop>
          ${buildPickdropOptions("data-hoteling-pickdrop-option")}
        </div>
      </div>
    </section>
    ${buildMemoCard("data-hoteling-memo")}
  `;

  const feeAreaHtml = `
    ${buildReservationFeeCard({
    detailAttr: 'data-fee-group="total"',
    title: "총 예상 금액",
    amountAttr: 'data-hoteling-total',
    assetPrefix,
    open: false,
    contentHtml: `
          <div class="reservation-fee-segments">
            ${buildReservationFeeSegment({
      title: "호텔링",
      segmentAttr: 'data-hoteling-fee-hoteling',
      amountAttr: 'data-hoteling-hoteling-total',
      bodyAttr: 'data-hoteling-fee-list',
      assetPrefix,
    })}
            ${buildReservationFeeSegment({
      title: "픽드랍",
      segmentAttr: 'data-hoteling-fee-pickdrop',
      amountAttr: 'data-hoteling-pickdrop-total',
      bodyAttr: 'data-hoteling-pickdrop-fee-list',
      assetPrefix,
      open: false,
    })}
          </div>
        `,
  })}

      ${buildPaymentFeeCard({
    title: "결제 금액",
    amountAttr: 'data-payment-total-all data-hoteling-payment-total',
    assetPrefix,
    ticketSegmentsHtml: `
      ${buildReservationFeeSegment({
      title: "호텔링",
      amountAttr: 'data-hoteling-ticket-total data-hoteling-hoteling-ticket-total',
      contentHtml: buildTicketListContent({
        listAttr: "data-hoteling-tickets",
        emptyAttr: "data-hoteling-tickets-empty",
      }),
      assetPrefix,
    })}
      ${buildReservationFeeSegment({
      title: "픽드랍",
      amountAttr: 'data-hoteling-pickdrop-ticket-total',
      contentHtml: buildTicketListContent({
        listAttr: "data-hoteling-pickdrop-tickets",
        emptyAttr: "data-hoteling-pickdrop-tickets-empty",
        listClass: "reservation-pickdrop-ticket-list",
      }),
      assetPrefix,
    })}
    `,
  })}
  ${buildBalanceRow({
    rowAttr: "data-hoteling-fee-balance-row",
    totalAttr: "data-hoteling-fee-balance-total",
    title: "잔액",
  })}
  `;

  const rightHtml = feeAreaHtml;

  const footerHtml = `
    <div class="reservation-submit reservation-submit--hoteling">
      <div class="reservation-submit__summary" aria-live="polite">
        <div class="reservation-submit__summary-group">
          <span class="reservation-submit__summary-label">숙박 기간</span>
          <strong class="reservation-submit__summary-value hoteling-modal__night-summary" data-hoteling-night-summary>날짜 선택 전</strong>
        </div>
      </div>
      <div class="reservation-submit__actions">
        <button class="primary-button hoteling-modal__submit" type="button" data-hoteling-submit>등록</button>
      </div>
    </div>
  `;

  return buildReservationModal({
    title: "예약 등록",
    titleId: "hoteling-reservation-title",
    modalAttr: "data-hoteling-reservation-modal data-reservation-modal",
    overlayAttr: "data-hoteling-reservation-overlay",
    closeAttr: "data-hoteling-reservation-close",
    dialogClass: "hoteling-modal",
    bodyClass: "hoteling-modal__body",
    leftHtml,
    rightHtml,
    footerHtml,
    assetPrefix,
  });
}
