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

const buildMiniCalendarDayNames = () => `
  <div class="mini-calendar__day-names">
    <span>일</span>
    <span>월</span>
    <span>화</span>
    <span>수</span>
    <span>목</span>
    <span>금</span>
    <span>토</span>
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
          <div class="reservation-form__right">${rightHtml}</div>
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

export function renderReservationModal({ rootSelector, modalHtml }) {
  const root = document.querySelector(rootSelector);
  if (!root) {
    return;
  }
  root.innerHTML = modalHtml;
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
    ${progressHtml}
    <div class="reservation-step" data-reservation-step="1">
      <div class="reservation-row" data-reservation-services-row>
        <div class="reservation-row__label">클래스</div>
        <div class="reservation-row__field option-chips" data-reservation-services></div>
      </div>
      <div class="reservation-row reservation-row--pickdrop">
        <div class="reservation-row__label">픽드랍</div>
        <div class="reservation-row__field option-chips" data-reservation-pickdrop>
          <label class="filter-chip">
            <input type="checkbox" value="pickup" data-reservation-pickdrop-option>
            <span>픽업</span>
          </label>
          <label class="filter-chip">
            <input type="checkbox" value="dropoff" data-reservation-pickdrop-option>
            <span>드랍</span>
          </label>
        </div>
      </div>
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
          ${buildMiniCalendarDayNames()}
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
      <div class="reservation-row" data-reservation-daycare-fee-row hidden>
        <div class="reservation-row__label">데이케어 요금</div>
        <div class="reservation-row__field">
          <span class="reservation-daycare-fee" data-reservation-daycare-fee>0원</span>
        </div>
      </div>
    </div>
    ${buildMemoCard("data-reservation-memo")}
  `;

  const feeAreaHtml = `
    <div class="reservation-step reservation-step--fee" data-reservation-step="2">
      ${buildReservationFeeCard({
    detailAttr: 'data-fee-group="total"',
    title: "총 예상 금액",
    amountAttr: 'data-reservation-total',
    assetPrefix,
    open: true,
    contentHtml: `
          <div class="reservation-fee-segments">
            ${buildReservationFeeSegment({
      title: "유치원",
      segmentAttr: 'data-reservation-fee-segment="school-fee"',
      amountAttr: 'data-reservation-school-fee-total',
      bodyAttr: 'data-reservation-fee-school-list',
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

      ${buildReservationFeeCard({
    detailAttr: 'data-fee-group="payment"',
    title: "결제",
    amountAttr: 'data-reservation-payment-total',
    assetPrefix,
    open: true,
    contentHtml: `
          <div class="reservation-fee-tabs">
            <div class="reservation-fee-tab-list" role="tablist">
              <button class="reservation-fee-tab is-active" type="button" role="tab" data-fee-tab="ticket">이용권</button>
              <button class="reservation-fee-tab" type="button" role="tab" data-fee-tab="other">현장 결제</button>
            </div>
            <div class="reservation-fee-tab-panel is-active" data-fee-panel="ticket">
              <div class="reservation-fee-segments">
                ${buildReservationFeeSegment({
      title: "유치원",
      segmentAttr: 'data-reservation-fee-segment="school-ticket"',
      amountAttr: 'data-reservation-school-ticket-total',
      contentHtml: `
                    <div class="reservation-ticket-list" data-reservation-school-tickets></div>
                    <p class="reservation-ticket-placeholder" data-reservation-school-tickets-empty hidden>사용 가능한 이용권이 없습니다.</p>
                  `,
      assetPrefix,
    })}
                ${buildReservationFeeSegment({
      title: "데이케어",
      segmentAttr: 'data-reservation-fee-segment="daycare-ticket"',
      amountAttr: 'data-reservation-daycare-ticket-total',
      contentHtml: `
                    <div class="reservation-ticket-list" data-reservation-daycare-tickets></div>
                    <p class="reservation-ticket-placeholder" data-reservation-daycare-tickets-empty hidden>사용 가능한 이용권이 없습니다.</p>
                  `,
      assetPrefix,
    })}
                ${buildReservationFeeSegment({
      title: "픽드랍",
      segmentAttr: 'data-reservation-fee-segment="pickdrop-ticket"',
      amountAttr: 'data-reservation-pickdrop-ticket-total',
      contentHtml: `
                    <div class="reservation-pickdrop-ticket-list" data-reservation-pickdrop-tickets></div>
                    <p class="reservation-ticket-placeholder" data-reservation-pickdrop-tickets-empty hidden>사용 가능한 이용권이 없습니다.</p>
                  `,
      assetPrefix,
    })}
              </div>
            </div>
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
            </div>
          </div>
        `,
  })}
</div>
  <div class="reservation-fee-balance" data-reservation-fee-balance-row>
    <span class="reservation-fee-balance__title">잔여</span>
    <span class="reservation-fee-balance__price" data-reservation-fee-balance-total>0원</span>
  </div>
  `;

  const rightHtml = feeAreaHtml;

  const footerHtml = `
    <div class="reservation-submit reservation-submit--split">
      <button class="button-secondary" type="button" data-reservation-submit disabled>등록</button>
      <button class="primary-button" type="button" data-reservation-pickdrop-toggle data-reservation-pickdrop-start>픽드랍까지 예약</button>
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
      <div class="reservation-row reservation-row--calendar">
        <div class="reservation-row__header">
          <div class="reservation-row__label">날짜</div>
          ${buildMiniCalendarControls({
    prevAttr: "data-hoteling-modal-prev",
    currentAttr: "data-hoteling-modal-current",
    nextAttr: "data-hoteling-modal-next",
    assetPrefix,
  })}
        </div>
        <div class="mini-calendar hoteling-modal-calendar">
          <div class="mini-calendar__grid" data-hoteling-modal-calendar-grid></div>
        </div>
      </div>
      <div class="hoteling-modal__dates">
        <div class="hoteling-modal__date">
          <div class="hoteling-modal__date-title">입실 날짜</div>
          <div class="hoteling-modal__date-value" data-hoteling-checkin-date>-월 -일</div>
          <label class="hoteling-modal__time-field">
            <input class="form-field__control" type="time" value="10:00" data-hoteling-checkin-time>
          </label>
        </div>
        <div class="hoteling-modal__date">
          <div class="hoteling-modal__date-title">퇴실 날짜</div>
          <div class="hoteling-modal__date-value" data-hoteling-checkout-date>-월 -일</div>
          <label class="hoteling-modal__time-field">
            <input class="form-field__control" type="time" value="10:00" data-hoteling-checkout-time>
          </label>
        </div>
      </div>
    </section>
    ${buildMemoCard("data-hoteling-memo")}
  `;

  const feeAreaHtml = `
    <div class="reservation-step reservation-step--fee hoteling-fee-card">
      ${buildReservationFeeCard({
    detailAttr: 'data-fee-group="total"',
    title: "총 예상 금액",
    amountAttr: 'data-hoteling-total',
    assetPrefix,
    open: true,
    contentHtml: `
          <div class="reservation-fee-segments">
            ${buildReservationFeeSegment({
      title: "호텔링",
      amountAttr: 'data-hoteling-hoteling-fee-total',
      bodyAttr: 'data-hoteling-fee-list',
      assetPrefix,
    })}
            ${buildReservationFeeSegment({
      title: "픽드랍",
      amountAttr: 'data-hoteling-pickdrop-fee-total',
      bodyAttr: 'data-hoteling-pickdrop-fee-list',
      assetPrefix,
    })}
          </div>
        `,
  })}

      ${buildReservationFeeCard({
    detailAttr: 'data-fee-group="payment"',
    title: "결제",
    amountAttr: 'data-hoteling-payment-total',
    assetPrefix,
    open: true,
    contentHtml: `
          <div class="reservation-fee-tabs">
            <div class="reservation-fee-tab-list" role="tablist">
              <button class="reservation-fee-tab is-active" type="button" role="tab" data-fee-tab="ticket">이용권</button>
              <button class="reservation-fee-tab" type="button" role="tab" data-fee-tab="other">현장 결제</button>
            </div>
            <div class="reservation-fee-tab-panel is-active" data-fee-panel="ticket">
              <div class="reservation-fee-segments">
                ${buildReservationFeeSegment({
      title: "호텔링",
      amountAttr: 'data-hoteling-hoteling-ticket-total',
      contentHtml: `
                    <div class="reservation-ticket-list" data-hoteling-tickets></div>
                    <p class="reservation-ticket-placeholder" data-hoteling-tickets-empty hidden>사용 가능한 이용권이 없습니다.</p>
                  `,
      assetPrefix,
    })}
                ${buildReservationFeeSegment({
      title: "픽드랍",
      amountAttr: 'data-hoteling-pickdrop-ticket-total',
      contentHtml: `
                    <div class="reservation-pickdrop-ticket-list" data-hoteling-pickdrop-tickets></div>
                    <p class="reservation-ticket-placeholder" data-hoteling-pickdrop-tickets-empty hidden>사용 가능한 이용권이 없습니다.</p>
                  `,
      assetPrefix,
    })}
              </div>
            </div>
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
            </div>
          </div>
        `,
  })}
</div>
  <div class="reservation-fee-balance" data-hoteling-fee-balance-row>
    <span class="reservation-fee-balance__title">잔여</span>
    <span class="reservation-fee-balance__price" data-hoteling-fee-balance-total>0원</span>
  </div>
  `;

  const rightHtml = feeAreaHtml;

  const footerHtml = `
    <div class="hoteling-modal__actions">
      <button class="button-secondary hoteling-modal__submit" type="button">등록</button>
      <button class="primary-button hoteling-modal__submit" type="button" data-hoteling-pickdrop-start>픽드랍까지 예약</button>
    </div>
  `;

  return buildReservationModal({
    title: "예약 등록",
    titleId: "hoteling-reservation-title",
    modalAttr: "data-hoteling-reservation-modal",
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
