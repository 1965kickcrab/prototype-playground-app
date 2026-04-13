import {
  clearReservationSearchDraft,
  saveReservationSearchDraft,
} from "../storage/reservation-search-draft.js";
import { setupReservationCreatePage } from "./reservation-create-page-shared.js";

const PICKDROP_DRAFT_KEY = "school-reservation-pickdrop-create";
const SCHOOL_DRAFT_KEY = "school-reservation-create";

function goBackToSchoolReservationPage(controller) {
  if (controller) {
    saveReservationSearchDraft(SCHOOL_DRAFT_KEY, {
      ...controller.buildMemberSearchDraft(),
      pickdropMode: false,
    });
  }
  clearReservationSearchDraft(PICKDROP_DRAFT_KEY);
  window.location.href = "./school-reservation-create.html";
}

function goBackToSchoolHome() {
  clearReservationSearchDraft(PICKDROP_DRAFT_KEY);
  clearReservationSearchDraft(SCHOOL_DRAFT_KEY);
  window.location.href = "../../public/index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  setupReservationCreatePage({
    rootSelector: "[data-school-pickdrop-create-root]",
    pageType: "pickdrop",
    draftKey: PICKDROP_DRAFT_KEY,
    memberSearchReturnTo: "./school-pickdrop-create.html",
    onClose: goBackToSchoolReservationPage,
    onBack: goBackToSchoolHome,
    onReservationUpdated: goBackToSchoolHome,
  });
});
