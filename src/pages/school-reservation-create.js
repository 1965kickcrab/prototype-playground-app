import {
  clearReservationSearchDraft,
  saveReservationSearchDraft,
} from "../storage/reservation-search-draft.js";
import { setupReservationCreatePage } from "./reservation-create-page-shared.js";

const SCHOOL_DRAFT_KEY = "school-reservation-create";
const PICKDROP_DRAFT_KEY = "school-reservation-pickdrop-create";

function goBackToSchoolHome() {
  clearReservationSearchDraft(SCHOOL_DRAFT_KEY);
  clearReservationSearchDraft(PICKDROP_DRAFT_KEY);
  window.location.href = "../../public/index.html";
}

function buildSchoolCreateReturnUrl() {
  const nextUrl = new URL("./school-reservation-create.html", window.location.href);
  return `${nextUrl.pathname}${nextUrl.search}`;
}

function openPickdropReservationPage(controller) {
  if (!controller) {
    return;
  }
  const draft = controller.buildMemberSearchDraft();
  saveReservationSearchDraft(PICKDROP_DRAFT_KEY, {
    ...draft,
    pickdropMode: true,
    pickdropDates: [...draft.selectedDates],
    pickdrops: ["pickup", "dropoff"],
    useSchoolPickdropDefaults: true,
  });
  window.location.href = "./school-pickdrop-create.html";
}

document.addEventListener("DOMContentLoaded", () => {
  setupReservationCreatePage({
    rootSelector: "[data-school-reservation-create-root]",
    pageType: "school",
    draftKey: SCHOOL_DRAFT_KEY,
    memberSearchReturnTo: buildSchoolCreateReturnUrl(),
    onClose: goBackToSchoolHome,
    onBack: goBackToSchoolHome,
    onPickdropNavigate: openPickdropReservationPage,
  });
});
