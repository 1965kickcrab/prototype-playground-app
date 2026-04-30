export const GUARDIAN_EDIT_ACTIONS_MARKUP = `
  <button class="primary-button primary-button--danger member-edit-modal__delete" type="button" data-member-detail-edit-delete>
    회원 삭제
  </button>
  <button class="primary-button member-edit-modal__submit-disabled" type="button" data-member-detail-edit-save disabled>
    수정
  </button>
`;

export const PET_EDIT_ACTIONS_MARKUP = `
  <button class="primary-button primary-button--danger member-edit-modal__pet-delete" type="button">삭제</button>
  <button class="primary-button member-edit-modal__submit-disabled" type="button" data-member-detail-edit-save disabled>수정</button>
`;

export const MEMBER_HEALTH_ACTIONS_MARKUP = `
  <button class="button-secondary" type="button" data-member-health-cancel>취소</button>
  <button class="primary-button" type="button" data-member-health-save disabled>저장</button>
`;

export function buildGuardianFieldsMarkup({ owner = "", phone = "" } = {}) {
  return `
    <div class="member-edit-modal__alert">
      회원의 성명과 전화번호는 수정할 수 없습니다.<br>
      수정을 원하시는 경우 <u>문의</u>를 눌러주세요.
    </div>
    <div class="member-edit-modal__field member-edit-modal__field--required">
      <label for="member-detail-edit-guardian-owner">보호자 성명</label>
      <input class="form-field__control" id="member-detail-edit-guardian-owner" type="text" value="${owner}" readonly>
    </div>
    <div class="member-edit-modal__field member-edit-modal__field--required">
      <label for="member-detail-edit-guardian-phone">전화번호</label>
      <input class="form-field__control" id="member-detail-edit-guardian-phone" type="text" value="${phone}" readonly>
    </div>
    <div class="member-edit-modal__field">
      <label for="member-detail-edit-guardian-address-search">주소</label>
      <div class="member-edit-modal__address-search">
        <input
          class="form-field__control"
          id="member-detail-edit-guardian-address-search"
          type="text"
          placeholder="주소를 검색해 주세요."
          readonly
        >
        <button class="button-secondary member-edit-modal__search-button" type="button" disabled>주소 검색</button>
      </div>
      <input
        class="form-field__control member-edit-modal__address-detail"
        type="text"
        placeholder="직접 입력"
        readonly
      >
    </div>
    <div class="member-edit-modal__field member-tag-editor" data-member-tag-editor>
      <label for="member-detail-edit-guardian-tags">라벨</label>
      <div class="member-tag-editor__selected" data-member-tag-selected hidden></div>
      <div class="member-tag-editor__input-wrap">
        <input
          class="form-field__control"
          id="member-detail-edit-guardian-tags"
          type="text"
          placeholder="라벨 입력"
          data-member-tag-input
        >
        <div class="member-tag-editor__suggestions" data-member-tag-suggestions hidden></div>
      </div>
    </div>
  `;
}

export function buildPetFieldsMarkup({
  dogName = "",
  breed = "",
  memo = "",
  weight = "",
  registration = "",
  coatColor = "",
  birthYear = "",
  birthMonth = "",
  birthDay = "",
  genderValue = "unknown",
  neuteredValue = "unknown",
} = {}) {
  return `
    <div class="pet-edit-modal">
      <section class="pet-edit-modal__section">
        <div class="pet-edit-modal__stack-field">
          <label class="pet-edit-modal__field-label pet-edit-modal__field-label--required" for="member-detail-edit-pet-dog-name">반려견 이름</label>
          <input class="form-field__control" id="member-detail-edit-pet-dog-name" type="text" value="${dogName}" placeholder="한글, 영문, 숫자 입력 가능 (12자 이내)">
        </div>
        <div class="pet-edit-modal__stack-field">
          <label class="pet-edit-modal__field-label pet-edit-modal__field-label--required" for="member-detail-edit-pet-breed">견종</label>
          <div class="pet-edit-modal__input-with-icon">
            <img src="../../assets/iconSearch.svg" alt="" aria-hidden="true">
            <input class="form-field__control" id="member-detail-edit-pet-breed" type="text" value="${breed}" placeholder="견종을 검색해 주세요.">
          </div>
        </div>
        <div class="pet-edit-modal__stack-field">
          <label class="pet-edit-modal__field-label" for="member-detail-edit-pet-memo">메모</label>
          <textarea class="form-field__control pet-edit-modal__textarea" id="member-detail-edit-pet-memo" placeholder="성격, 알러지 등 내용 입력 (최대 500자)">${memo}</textarea>
        </div>
        <div class="pet-edit-modal__stack-field member-tag-editor" data-member-tag-editor>
          <label class="pet-edit-modal__field-label" for="member-detail-edit-pet-labels">라벨</label>
          <div class="member-tag-editor__selected" data-member-tag-selected hidden></div>
          <div class="member-tag-editor__input-wrap">
            <input
              class="form-field__control"
              id="member-detail-edit-pet-labels"
              type="text"
              placeholder="라벨 입력"
              data-member-tag-input
            >
            <div class="member-tag-editor__suggestions" data-member-tag-suggestions hidden></div>
          </div>
        </div>
      </section>
      <div class="pet-edit-modal__divider" aria-hidden="true">
        <span>선택 정보</span>
      </div>
      <section class="pet-edit-modal__section">
        <div class="pet-edit-modal__inline-field">
          <label class="pet-edit-modal__field-label" for="member-detail-edit-pet-weight">몸무게</label>
          <div class="pet-edit-modal__weight pet-edit-modal__inline-control">
            <input class="form-field__control" id="member-detail-edit-pet-weight" type="text" value="${weight}" placeholder="0~999사이 숫자만 입력">
            <span>kg</span>
          </div>
        </div>
        <div class="pet-edit-modal__inline-field">
          <label class="pet-edit-modal__field-label" for="member-detail-edit-pet-registration">동물등록번호</label>
          <input class="form-field__control pet-edit-modal__inline-control" id="member-detail-edit-pet-registration" type="text" value="${registration}" placeholder="410XXXXXXXXXX">
        </div>
        <div class="pet-edit-modal__inline-field">
          <label class="pet-edit-modal__field-label" for="member-detail-edit-pet-birth-year">생년월일</label>
          <div class="pet-edit-modal__birth-row pet-edit-modal__inline-control">
            <input class="form-field__control pet-edit-modal__birth-input" id="member-detail-edit-pet-birth-year" type="text" value="${birthYear}" placeholder="년도">
            <span>/</span>
            <input class="form-field__control pet-edit-modal__birth-input" id="member-detail-edit-pet-birth-month" type="text" value="${birthMonth}" placeholder="월">
            <span>/</span>
            <input class="form-field__control pet-edit-modal__birth-input" id="member-detail-edit-pet-birth-day" type="text" value="${birthDay}" placeholder="일">
          </div>
        </div>
        <div class="pet-edit-modal__stack-field">
          <label class="pet-edit-modal__field-label" for="member-detail-edit-pet-coat-color">털색</label>
          <input class="form-field__control" id="member-detail-edit-pet-coat-color" type="text" value="${coatColor}" placeholder="20자 이내 입력">
        </div>
        <div class="pet-edit-modal__stack-field">
          <label class="pet-edit-modal__field-label">성별</label>
          <div class="pet-edit-modal__radio-group">
            <label class="pet-edit-modal__radio-card">
              <input type="radio" name="pet-gender" value="unknown" ${genderValue === "unknown" ? "checked" : ""}>
              <span class="pet-edit-modal__radio-copy">
                <span class="pet-edit-modal__radio-indicator" aria-hidden="true"></span>
                <span class="pet-edit-modal__radio-text">선택 안함</span>
              </span>
            </label>
            <label class="pet-edit-modal__radio-card">
              <input type="radio" name="pet-gender" value="male" ${genderValue === "male" ? "checked" : ""}>
              <span class="pet-edit-modal__radio-copy">
                <span class="pet-edit-modal__radio-indicator" aria-hidden="true"></span>
                <span class="pet-edit-modal__radio-text">남아</span>
              </span>
            </label>
            <label class="pet-edit-modal__radio-card">
              <input type="radio" name="pet-gender" value="female" ${genderValue === "female" ? "checked" : ""}>
              <span class="pet-edit-modal__radio-copy">
                <span class="pet-edit-modal__radio-indicator" aria-hidden="true"></span>
                <span class="pet-edit-modal__radio-text">여아</span>
              </span>
            </label>
          </div>
        </div>
        <div class="pet-edit-modal__stack-field">
          <label class="pet-edit-modal__field-label">중성화 여부</label>
          <div class="pet-edit-modal__radio-group">
            <label class="pet-edit-modal__radio-card">
              <input type="radio" name="pet-neutered" value="unknown" ${neuteredValue === "unknown" ? "checked" : ""}>
              <span class="pet-edit-modal__radio-copy">
                <span class="pet-edit-modal__radio-indicator" aria-hidden="true"></span>
                <span class="pet-edit-modal__radio-text">선택 안함</span>
              </span>
            </label>
            <label class="pet-edit-modal__radio-card">
              <input type="radio" name="pet-neutered" value="done" ${neuteredValue === "done" ? "checked" : ""}>
              <span class="pet-edit-modal__radio-copy">
                <span class="pet-edit-modal__radio-indicator" aria-hidden="true"></span>
                <span class="pet-edit-modal__radio-text">완료</span>
              </span>
            </label>
            <label class="pet-edit-modal__radio-card">
              <input type="radio" name="pet-neutered" value="pending" ${neuteredValue === "pending" ? "checked" : ""}>
              <span class="pet-edit-modal__radio-copy">
                <span class="pet-edit-modal__radio-indicator" aria-hidden="true"></span>
                <span class="pet-edit-modal__radio-text">미완료</span>
              </span>
            </label>
          </div>
        </div>
      </section>
    </div>
  `;
}

export function buildConsentFieldsMarkup({
  confirmedDate = "",
  attachments = [],
} = {}) {
  const attachmentList = Array.isArray(attachments) ? attachments : [];
  return `
    <div class="member-health-sheet">
      <section class="member-health-sheet__section">
        <div class="member-health-sheet__field">
          <label class="pet-edit-modal__field-label" for="member-detail-consent-date">제출 날짜</label>
          <input class="form-field__control member-health-sheet__date" id="member-detail-consent-date" type="date" value="${confirmedDate}">
        </div>
        <div class="member-health-sheet__field">
          <label class="pet-edit-modal__field-label" for="member-detail-consent-file">파일 첨부</label>
          <label class="member-health-sheet__upload" for="member-detail-consent-file">
            <input id="member-detail-consent-file" type="file" data-member-consent-file hidden multiple>
            <span class="member-health-sheet__upload-copy">
              <strong>파일을 선택해 주세요.</strong>
              <span>첨부 파일이 있으면 상태가 자동으로 제출로 변경됩니다.</span>
            </span>
            <span class="button-secondary member-health-sheet__upload-button">파일 추가</span>
          </label>
          <div class="member-health-sheet__attachments" data-member-consent-attachments>
            ${attachmentList.length ? attachmentList.map((attachment) => `
              <div class="member-health-sheet__attachment" data-member-consent-attachment="${attachment.id}">
                <span>${attachment.name}</span>
                <button type="button" data-member-consent-attachment-remove="${attachment.id}" aria-label="첨부 파일 삭제">삭제</button>
              </div>
            `).join("") : `<p class="member-health-sheet__empty">첨부된 파일이 없습니다.</p>`}
          </div>
        </div>
      </section>
    </div>
  `;
}

export function buildVaccinationFieldsMarkup({ vaccinations = [] } = {}) {
  return `
    <div class="member-health-sheet member-health-sheet--vaccination">
      <section class="pet-edit-modal__section">
        <div class="pet-edit-modal__vaccination-list">
          ${vaccinations.map((vaccination) => `
            <div class="pet-edit-modal__vaccination-item">
              <div class="pet-edit-modal__vaccination-title">${vaccination.label}</div>
              <button
                class="pet-edit-modal__vaccination-toggle ${vaccination.status === "completed" ? "is-active" : ""}"
                type="button"
                data-member-vaccination-toggle="${vaccination.key}"
                data-member-vaccination-status="${vaccination.status}"
                aria-pressed="${vaccination.status === "completed" ? "true" : "false"}"
                aria-label="${vaccination.label} ${vaccination.status === "completed" ? "완료" : "미완료"}"
              >
                <span class="pet-edit-modal__vaccination-toggle-track" aria-hidden="true">
                  <span class="pet-edit-modal__vaccination-toggle-thumb"></span>
                </span>
                <span class="pet-edit-modal__visually-hidden">${vaccination.status === "completed" ? "완료" : "미완료"}</span>
              </button>
              <input
                class="form-field__control pet-edit-modal__health-date"
                type="date"
                value="${vaccination.confirmedDate}"
                data-member-vaccination-date="${vaccination.key}"
              >
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}
