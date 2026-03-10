export const GUARDIAN_EDIT_ACTIONS_MARKUP = `
  <button class="primary-button primary-button--danger member-edit-modal__delete" type="button" data-member-detail-edit-delete>
    회원 삭제
  </button>
  <button class="primary-button member-edit-modal__submit-disabled" type="button" data-member-detail-edit-save disabled>
    수정
  </button>
`;

export const PET_EDIT_ACTIONS_MARKUP = `
  <button class="primary-button member-edit-modal__submit-disabled" type="button" data-member-detail-edit-save disabled>수정</button>
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
      <label for="member-detail-edit-guardian-tags">태그</label>
      <div class="member-tag-editor__selected" data-member-tag-selected hidden></div>
      <div class="member-tag-editor__input-wrap">
        <input
          class="form-field__control"
          id="member-detail-edit-guardian-tags"
          type="text"
          placeholder="태그 입력"
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
  weight = "",
  registration = "",
  coatColor = "",
  birthYear = "",
  birthMonth = "",
  birthDay = "",
  ageText = "",
  genderValue = "unknown",
  neuteredValue = "unknown",
} = {}) {
  return `
    <div class="pet-edit-modal">
      <div class="pet-edit-modal__grid">
        <section class="pet-edit-modal__column">
          <div class="pet-edit-modal__avatar-wrap">
            <div class="pet-edit-modal__avatar">
              <img src="../../assets/defaultProfile_dog.svg" alt="">
            </div>
            <button class="pet-edit-modal__avatar-button" type="button" aria-label="반려견 사진 수정" disabled>
              <img src="../../assets/iconEdit.svg" alt="" aria-hidden="true">
            </button>
          </div>
          <div class="member-edit-modal__field member-edit-modal__field--required">
            <label for="member-detail-edit-pet-dog-name">이름</label>
            <input class="form-field__control" id="member-detail-edit-pet-dog-name" type="text" value="${dogName}" placeholder="이름 입력">
          </div>
          <div class="member-edit-modal__field member-edit-modal__field--required">
            <label for="member-detail-edit-pet-breed">견종</label>
            <div class="pet-edit-modal__input-with-icon">
              <img src="../../assets/searchIcon.svg" alt="" aria-hidden="true">
              <input class="form-field__control" id="member-detail-edit-pet-breed" type="text" value="${breed}" placeholder="견종 입력">
              <button type="button" class="pet-edit-modal__clear-button" data-pet-edit-clear="breed" aria-label="견종 입력 지우기">×</button>
            </div>
          </div>
          <div class="member-edit-modal__field">
            <label for="member-detail-edit-pet-weight">몸무게</label>
            <div class="pet-edit-modal__weight">
              <input class="form-field__control" id="member-detail-edit-pet-weight" type="text" value="${weight}" placeholder="0~999 사이 숫자만 입력">
              <span>kg</span>
            </div>
          </div>
          <div class="member-edit-modal__field member-tag-editor" data-member-tag-editor>
            <label for="member-detail-edit-pet-tags">태그</label>
            <div class="member-tag-editor__selected" data-member-tag-selected hidden></div>
            <div class="member-tag-editor__input-wrap">
              <input
                class="form-field__control"
                id="member-detail-edit-pet-tags"
                type="text"
                placeholder="태그 입력"
                data-member-tag-input
              >
              <div class="member-tag-editor__suggestions" data-member-tag-suggestions hidden></div>
            </div>
          </div>
        </section>
        <section class="pet-edit-modal__column pet-edit-modal__column--right">
          <div class="member-edit-modal__field">
            <label for="member-detail-edit-pet-registration">동물등록번호</label>
            <input class="form-field__control" id="member-detail-edit-pet-registration" type="text" value="${registration}" placeholder="410XXXXXXXXXXXX">
          </div>
          <div class="member-edit-modal__field">
            <label for="member-detail-edit-pet-coat-color">털색</label>
            <input class="form-field__control" id="member-detail-edit-pet-coat-color" type="text" value="${coatColor}" placeholder="20자 이내 입력">
          </div>
          <div class="member-edit-modal__field">
            <label>생년월일</label>
            <div class="pet-edit-modal__birth-row">
              <input class="form-field__control pet-edit-modal__birth-input" id="member-detail-edit-pet-birth-year" type="text" value="${birthYear}" placeholder="연도">
              <span>/</span>
              <input class="form-field__control pet-edit-modal__birth-input" id="member-detail-edit-pet-birth-month" type="text" value="${birthMonth}" placeholder="월">
              <span>/</span>
              <input class="form-field__control pet-edit-modal__birth-input" id="member-detail-edit-pet-birth-day" type="text" value="${birthDay}" placeholder="일">
              <input class="form-field__control pet-edit-modal__age" id="member-detail-edit-pet-age" type="text" value="${ageText}" readonly>
            </div>
            <p class="pet-edit-modal__helper">정확한 생년월일을 모른다면 연도만 적어주세요.</p>
          </div>
          <div class="member-edit-modal__field">
            <label>성별</label>
            <div class="pet-edit-modal__radio-group">
              <label class="pet-edit-modal__radio"><input type="radio" name="pet-gender" value="unknown" ${genderValue === "unknown" ? "checked" : ""}><span>선택안함</span></label>
              <label class="pet-edit-modal__radio"><input type="radio" name="pet-gender" value="male" ${genderValue === "male" ? "checked" : ""}><span>남아</span></label>
              <label class="pet-edit-modal__radio"><input type="radio" name="pet-gender" value="female" ${genderValue === "female" ? "checked" : ""}><span>여아</span></label>
            </div>
          </div>
          <div class="member-edit-modal__field">
            <label>중성화 여부</label>
            <div class="pet-edit-modal__radio-group">
              <label class="pet-edit-modal__radio"><input type="radio" name="pet-neutered" value="unknown" ${neuteredValue === "unknown" ? "checked" : ""}><span>선택안함</span></label>
              <label class="pet-edit-modal__radio"><input type="radio" name="pet-neutered" value="done" ${neuteredValue === "done" ? "checked" : ""}><span>완료</span></label>
              <label class="pet-edit-modal__radio"><input type="radio" name="pet-neutered" value="pending" ${neuteredValue === "pending" ? "checked" : ""}><span>미완료</span></label>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
