function getMemberInfoMarkup(assetPrefix = "../../assets/") {
  return `
    <div class="reservation-detail-page__member">
      <div class="reservation-detail-page__avatar" aria-hidden="true">
        <img src="${assetPrefix}defaultProfile_dog.svg" alt="">
      </div>
      <div class="reservation-detail-page__member-copy">
        <div class="reservation-detail-page__member-head">
          <strong data-detail-dog-name>-</strong>
          <p>
            <span data-detail-breed>-</span>
            <span> / </span>
            <span data-detail-weight>-</span>
          </p>
        </div>
        <div class="reservation-detail-page__member-tags" data-detail-pet-tags hidden></div>
        <p class="reservation-detail-page__guardian">
          <span data-detail-owner>-</span>
          <span> 보호자 (</span>
          <span data-detail-phone>-</span>
          <span>)</span>
        </p>
      </div>
    </div>
  `;
}

function getScheduleFieldMarkup({
  label,
  displayAttr,
  editMarkup = "",
  rowAttr = "",
}) {
  return `
    <div class="reservation-detail-page__schedule-row"${rowAttr ? ` ${rowAttr}` : ""}>
      <p class="reservation-detail-page__schedule-label">${label}</p>
      <div class="reservation-detail-page__schedule-value">
        <div data-detail-field-display>${displayAttr ? `<span ${displayAttr}>-</span>` : "-"}</div>
        <div class="reservation-detail-page__field-edit" data-detail-field-edit hidden>
          ${editMarkup}
        </div>
      </div>
    </div>
  `;
}

function getBottomSheetMarkup({
  sheetAttr,
  title,
  listAttr,
  assetPrefix,
}) {
  return `
    <div class="reservation-sheet-backdrop reservation-detail-page__sheet-backdrop" ${sheetAttr}-backdrop hidden></div>
    <div class="reservation-sheet reservation-detail-page__sheet" ${sheetAttr} hidden>
      <div class="reservation-sheet__header">
        <strong class="reservation-sheet__title">${title}</strong>
        <button
          class="icon-button icon-button--secondary reservation-sheet__close"
          type="button"
          ${sheetAttr}-close
          aria-label="닫기"
        >
          <img src="${assetPrefix}iconClose.svg" alt="" aria-hidden="true">
        </button>
      </div>
      <div class="reservation-sheet__body reservation-detail-page__sheet-body" ${listAttr}></div>
    </div>
  `;
}

function getMemoSectionMarkup({
  toggleAttr,
  contentAttr,
  textareaAttr,
}) {
  return `
    <div class="reservation-detail-page__memo-panel">
      <button
        class="reservation-detail-page__memo-trigger"
        type="button"
        ${toggleAttr}
        aria-expanded="false"
      >
        <span class="reservation-detail-page__memo-label">메모</span>
      </button>
      <div class="reservation-detail-page__memo-content" ${contentAttr} hidden>
        <div class="reservation-detail-page__memo-edit">
          <textarea class="form-field__control reservation-detail-page__textarea" ${textareaAttr} rows="4"></textarea>
        </div>
      </div>
    </div>
  `;
}

function getBillingEditMarkup({
  methodAttr,
  amountAttr,
}) {
  return `
    <section class="reservation-detail-page__billing-group" data-detail-billing-edit hidden>
      <div class="reservation-detail-page__billing-edit-grid">
        <label class="reservation-detail-page__input-group">
          <span>결제 방식</span>
          <select class="form-field__control" ${methodAttr}>
            <option value="ticket">이용권</option>
            <option value="cash">현금</option>
            <option value="card">카드</option>
            <option value="bank">계좌이체</option>
          </select>
        </label>
        <label class="reservation-detail-page__input-group">
          <span>결제 금액</span>
          <input class="form-field__control" type="text" inputmode="numeric" placeholder="0" ${amountAttr}>
        </label>
      </div>
    </section>
  `;
}

function getPageShellMarkup({
  title = "",
  assetPrefix = "../../assets/",
  bodyMarkup = "",
  pageClassName = "",
  navActionMarkup = "",
  footerMarkup = "",
  emptyTitle = "예약을 찾을 수 없습니다.",
  emptyDescription = "선택한 예약 정보가 없거나 이미 처리되었습니다.",
}) {
  return `
    <div class="reservation-detail-page${pageClassName ? ` ${pageClassName}` : ""}">
      <header class="reservation-detail-page__nav">
        <button
          class="icon-button icon-button--secondary reservation-detail-page__back"
          type="button"
          data-detail-back
          aria-label="뒤로가기"
        >
          <img src="${assetPrefix}iconBack.svg" alt="" aria-hidden="true">
        </button>
        <h1 data-detail-title>${title}</h1>
        ${navActionMarkup}
      </header>
      <div class="reservation-detail-page__body" data-detail-content hidden>
        ${bodyMarkup}
      </div>
      <section class="reservation-detail-page__empty" data-detail-empty hidden>
        <h2>${emptyTitle}</h2>
        <p>${emptyDescription}</p>
        <button class="primary-button" type="button" data-detail-empty-back>목록으로 돌아가기</button>
      </section>
      ${footerMarkup}
    </div>
  `;
}

function getCommonFooterMarkup(actionAttr) {
  return `
    <footer class="reservation-detail-page__edit-footer" ${actionAttr}-footer hidden>
      <button class="primary-button reservation-detail-page__edit-save" type="button" ${actionAttr}-save disabled>수정</button>
    </footer>
  `;
}

export function renderSchoolReservationDetailPage(root, options = {}) {
  if (!root) {
    return;
  }
  root.innerHTML = getPageShellMarkup({
    ...options,
    pageClassName: "reservation-detail-page--school",
    title: options.title || "유치원 예약",
    navActionMarkup: `
      <button
        class="reservation-detail-page__nav-action"
        type="button"
        data-school-detail-edit
      >수정</button>
      <button
        class="reservation-detail-page__cancel"
        type="button"
        data-school-detail-cancel
        hidden
      >예약 취소</button>
    `,
    bodyMarkup: `
      <section class="reservation-detail-page__section reservation-detail-page__section--member">
        ${getMemberInfoMarkup(options.assetPrefix)}
        ${getMemoSectionMarkup({
          toggleAttr: "data-school-detail-memo-toggle",
          contentAttr: "data-school-detail-memo-content",
          textareaAttr: "data-school-detail-memo-input",
        })}
      </section>
      <section class="reservation-detail-page__section reservation-detail-page__section--tabs">
        <div class="reservation-detail-page__tabs" role="tablist" aria-label="유치원 상세 탭">
          <button
            class="reservation-detail-page__tab is-active"
            type="button"
            role="tab"
            aria-selected="true"
            data-school-detail-tab="reservation"
          >예약 정보</button>
          <button
            class="reservation-detail-page__tab"
            type="button"
            role="tab"
            aria-selected="false"
            data-school-detail-tab="billing"
          >요금 정보</button>
        </div>
        <div class="reservation-detail-page__tab-panel is-active" data-school-detail-panel="reservation">
          <div class="reservation-detail-page__schedule-list">
            ${getScheduleFieldMarkup({
              label: "예약 날짜",
              displayAttr: "data-school-detail-date",
              editMarkup: `<input class="form-field__control" type="date" data-school-detail-date-input>`,
            })}
            ${getScheduleFieldMarkup({
              label: "클래스",
              displayAttr: "data-school-detail-service",
              editMarkup: `
                <button class="reservation-detail-page__field-button" type="button" data-school-detail-service-trigger>
                  <span data-school-detail-service-button>-</span>
                </button>
                ${getBottomSheetMarkup({
                  sheetAttr: "data-school-detail-service-sheet",
                  title: "클래스 선택",
                  listAttr: "data-school-detail-service-options",
                  assetPrefix: options.assetPrefix || "../../assets/",
                })}
              `,
            })}
            ${getScheduleFieldMarkup({
              label: "출석 상태",
              displayAttr: "data-school-detail-status",
              editMarkup: `
                <div class="reservation-detail-page__chip-row" data-school-detail-status-options>
                  <button class="filter-chip" type="button" data-school-detail-status-option="PLANNED">예약</button>
                  <button class="filter-chip" type="button" data-school-detail-status-option="CHECKIN">등원</button>
                  <button class="filter-chip" type="button" data-school-detail-status-option="CHECKOUT">하원</button>
                  <button class="filter-chip" type="button" data-school-detail-status-option="ABSENT">결석</button>
                </div>
              `,
            })}
            ${getScheduleFieldMarkup({
              label: "이용 시간",
              displayAttr: "data-school-detail-time",
              rowAttr: 'data-school-detail-time-row hidden',
              editMarkup: `
                <div class="reservation-detail-page__field-grid">
                  <input class="form-field__control" type="time" data-school-detail-start-time>
                  <input class="form-field__control" type="time" data-school-detail-end-time>
                </div>
              `,
            })}
            ${getScheduleFieldMarkup({
              label: "픽드랍",
              displayAttr: "data-school-detail-pickdrop",
              rowAttr: 'data-school-detail-pickdrop-row hidden',
              editMarkup: `
                <div class="reservation-detail-page__chip-row" data-school-detail-pickdrop-options>
                  <button class="filter-chip" type="button" data-school-detail-pickdrop="pickup">픽업</button>
                  <button class="filter-chip" type="button" data-school-detail-pickdrop="dropoff">드랍</button>
                </div>
              `,
            })}
          </div>
        </div>
        <div class="reservation-detail-page__tab-panel" data-school-detail-panel="billing" hidden>
          <div class="reservation-detail-page__billing">
            <section class="reservation-detail-page__billing-group">
              <div class="reservation-detail-page__billing-head">
                <strong>총 결제 금액</strong>
                <span data-school-detail-total>-</span>
              </div>
            </section>
            ${getBillingEditMarkup({
              methodAttr: "data-school-detail-payment-method",
              amountAttr: "data-school-detail-payment-amount",
            })}
            <section class="reservation-detail-page__billing-group">
              <div class="reservation-detail-page__billing-head">
                <strong>이용권 사용</strong>
                <span data-school-detail-ticket-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-school-detail-ticket-rows></div>
            </section>
            <section class="reservation-detail-page__billing-group">
              <div class="reservation-detail-page__billing-head">
                <strong>기본 요금</strong>
                <span data-school-detail-basic-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-school-detail-basic-rows></div>
            </section>
            <section class="reservation-detail-page__billing-group" data-school-detail-discount-group hidden>
              <div class="reservation-detail-page__billing-head reservation-detail-page__billing-head--discount">
                <strong>총 할인 요금</strong>
                <span data-school-detail-discount-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-school-detail-discount-rows></div>
            </section>
            <section class="reservation-detail-page__billing-group" data-school-detail-extra-group hidden>
              <div class="reservation-detail-page__billing-head reservation-detail-page__billing-head--extra">
                <strong>총 추가 요금</strong>
                <span data-school-detail-extra-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-school-detail-extra-rows></div>
            </section>
          </div>
        </div>
      </section>
    `,
    footerMarkup: getCommonFooterMarkup("data-school-detail"),
  });
}

export function renderHotelingReservationDetailPage(root, options = {}) {
  if (!root) {
    return;
  }
  root.innerHTML = getPageShellMarkup({
    ...options,
    pageClassName: "reservation-detail-page--hoteling",
    title: options.title || "호텔링 예약",
    navActionMarkup: `
      <button
        class="reservation-detail-page__nav-action"
        type="button"
        data-hotel-detail-edit
      >수정</button>
      <button
        class="reservation-detail-page__cancel"
        type="button"
        data-hotel-detail-cancel
        hidden
      >예약 취소</button>
    `,
    bodyMarkup: `
      <section class="reservation-detail-page__section reservation-detail-page__section--member">
        ${getMemberInfoMarkup(options.assetPrefix)}
        ${getMemoSectionMarkup({
          toggleAttr: "data-hotel-detail-memo-toggle",
          contentAttr: "data-hotel-detail-memo-content",
          textareaAttr: "data-hotel-detail-memo-input",
        })}
      </section>
      <section class="reservation-detail-page__section reservation-detail-page__section--tabs">
        <div class="reservation-detail-page__tabs" role="tablist" aria-label="호텔링 상세 탭">
          <button
            class="reservation-detail-page__tab is-active"
            type="button"
            role="tab"
            aria-selected="true"
            data-hotel-detail-tab="reservation"
          >예약 정보</button>
          <button
            class="reservation-detail-page__tab"
            type="button"
            role="tab"
            aria-selected="false"
            data-hotel-detail-tab="billing"
          >요금 정보</button>
        </div>
        <div class="reservation-detail-page__tab-panel is-active" data-hotel-detail-panel="reservation">
          <div class="reservation-detail-page__section-head">
            <h2 class="reservation-detail-page__section-title">숙박 정보</h2>
            <span class="reservation-detail-page__section-summary" data-hotel-detail-stay-summary hidden></span>
          </div>
          <div class="reservation-detail-page__schedule-list">
            ${getScheduleFieldMarkup({
              label: "호실",
              displayAttr: "data-hotel-detail-room",
              editMarkup: `
                <button class="reservation-detail-page__field-button" type="button" data-hotel-detail-room-trigger>
                  <span data-hotel-detail-room-button>-</span>
                </button>
                ${getBottomSheetMarkup({
                  sheetAttr: "data-hotel-detail-room-sheet",
                  title: "호실 선택",
                  listAttr: "data-hotel-detail-room-options",
                  assetPrefix: options.assetPrefix || "../../assets/",
                })}
              `,
            })}
            ${getScheduleFieldMarkup({
              label: "입실",
              displayAttr: "data-hotel-detail-checkin-display",
              editMarkup: `
                <div class="reservation-detail-page__field-grid">
                  <input class="form-field__control" type="date" data-hotel-detail-checkin-date-input>
                  <input class="form-field__control" type="time" data-hotel-detail-checkin-time-input>
                </div>
              `,
            })}
            ${getScheduleFieldMarkup({
              label: "퇴실",
              displayAttr: "data-hotel-detail-checkout-display",
              editMarkup: `
                <div class="reservation-detail-page__field-grid">
                  <input class="form-field__control" type="date" data-hotel-detail-checkout-date-input>
                  <input class="form-field__control" type="time" data-hotel-detail-checkout-time-input>
                </div>
              `,
            })}
            ${getScheduleFieldMarkup({
              label: "픽드랍",
              displayAttr: "data-hotel-detail-pickdrop-display",
              editMarkup: `
                <div class="reservation-detail-page__chip-row" data-hotel-detail-pickdrop-options>
                  <button class="filter-chip" type="button" data-hotel-detail-pickdrop="pickup">픽업</button>
                  <button class="filter-chip" type="button" data-hotel-detail-pickdrop="dropoff">드랍</button>
                </div>
              `,
            })}
          </div>
        </div>
        <div class="reservation-detail-page__tab-panel" data-hotel-detail-panel="billing" hidden>
          <div class="reservation-detail-page__billing">
            <section class="reservation-detail-page__billing-group">
              <div class="reservation-detail-page__billing-head">
                <strong>총 결제 금액</strong>
                <span data-hotel-detail-billing-total>-</span>
              </div>
            </section>
            ${getBillingEditMarkup({
              methodAttr: "data-hotel-detail-payment-method",
              amountAttr: "data-hotel-detail-payment-amount",
            })}
            <section class="reservation-detail-page__billing-group">
              <div class="reservation-detail-page__billing-head">
                <strong>이용권 사용</strong>
                <span data-hotel-detail-ticket-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-hotel-detail-ticket-rows></div>
            </section>
            <section class="reservation-detail-page__billing-group">
              <div class="reservation-detail-page__billing-head">
                <strong>기본 요금</strong>
                <span data-hotel-detail-basic-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-hotel-detail-basic-rows></div>
            </section>
            <section class="reservation-detail-page__billing-group" data-hotel-detail-discount-group hidden>
              <div class="reservation-detail-page__billing-head reservation-detail-page__billing-head--discount">
                <strong>총 할인 요금</strong>
                <span data-hotel-detail-discount-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-hotel-detail-discount-rows></div>
            </section>
            <section class="reservation-detail-page__billing-group" data-hotel-detail-extra-group hidden>
              <div class="reservation-detail-page__billing-head reservation-detail-page__billing-head--extra">
                <strong>총 추가 요금</strong>
                <span data-hotel-detail-extra-total>-</span>
              </div>
              <div class="reservation-detail-page__billing-rows" data-hotel-detail-extra-rows></div>
            </section>
          </div>
        </div>
      </section>
    `,
    footerMarkup: `
      <footer class="reservation-detail-page__bottom" data-hotel-detail-bottom hidden>
        <div class="reservation-detail-page__bottom-row">
          <span class="reservation-detail-page__bottom-label">총 결제 금액</span>
          <strong class="reservation-detail-page__bottom-total" data-hotel-detail-total>-</strong>
        </div>
        <div class="reservation-detail-page__bottom-divider" aria-hidden="true"></div>
        <div class="reservation-detail-page__bottom-row reservation-detail-page__bottom-row--status">
          <div class="reservation-detail-page__bottom-status">
            <span class="reservation-detail-page__bottom-label">정산 상태</span>
            <strong data-hotel-detail-payment-status>-</strong>
          </div>
          <label class="reservation-detail-page__payment-check">
            <input type="checkbox" data-hotel-detail-payment-check disabled>
            <span>결제 완료</span>
          </label>
        </div>
      </footer>
      ${getCommonFooterMarkup("data-hotel-detail")}
    `,
  });
}
