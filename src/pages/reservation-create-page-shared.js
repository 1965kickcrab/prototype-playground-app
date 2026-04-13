import { initState } from "../services/state.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import { ensureMemberDefaults } from "../storage/ticket-issue-members.js";
import { loadMemberTagCatalog } from "../storage/member-tag-catalog.js";
import {
  getSchoolReservationModalMarkup,
  renderReservationModal,
} from "../components/reservation-modal.js";
import { setupReservationModal } from "./reservation.js";
import {
  clearReservationSearchDraft,
  loadReservationSearchDraft,
  saveReservationSearchDraft,
} from "../storage/reservation-search-draft.js";

const MEMBER_SEARCH_PAGE_HREF = "./member-search.html";

function appendHolidayLegend() {
  const header = document.querySelector(".reservation-row--calendar .reservation-row__header");
  if (!header || header.querySelector(".reservation-create-page__holiday-legend")) {
    return;
  }
  const legend = document.createElement("div");
  legend.className = "reservation-create-page__holiday-legend";
  legend.innerHTML = `
    <span class="reservation-create-page__holiday-dot" aria-hidden="true"></span>
    <span>휴무</span>
  `;
  const controls = header.querySelector(".mini-calendar__controls");
  if (controls) {
    header.insertBefore(legend, controls);
    return;
  }
  header.appendChild(legend);
}

function createReservationPageState(storage, classStorage) {
  const classes = classStorage.ensureDefaults();
  const selectedServices = {};
  const classNames = classes
    .map((item) => item.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0);
  const defaultService = classNames[0] || "";
  const classTeachers = classes.reduce((acc, item) => {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) {
      return acc;
    }
    acc[name] = item.teacher || "";
    return acc;
  }, {});

  classNames.forEach((name) => {
    selectedServices[name] = true;
  });

  return initState(
    storage.loadReservations().filter((item) => item?.type === "school" || item?.type === "daycare"),
    {
      selectedServices,
      defaultService,
      serviceOptions: classNames,
      selectedTeachers: {},
      selectedPaymentStatuses: {
        paid: true,
        unpaid: true,
      },
      paymentStatusOptions: ["paid", "unpaid"],
      selectedTags: {},
      tagOptions: loadMemberTagCatalog(),
      classTeachers,
      showCanceledHistory: false,
    }
  );
}

function buildMemberSearchPageUrl({ returnTo, query }) {
  const nextUrl = new URL(MEMBER_SEARCH_PAGE_HREF, window.location.href);
  nextUrl.searchParams.set("returnTo", returnTo);
  if (query) {
    nextUrl.searchParams.set("q", query);
  }
  return nextUrl.toString();
}

export function setupReservationCreatePage({
  rootSelector,
  pageType,
  draftKey,
  memberSearchReturnTo,
  onClose,
  onBack,
  onReservationUpdated,
  onPickdropNavigate,
}) {
  renderReservationModal({
    rootSelector,
    modalHtml: getSchoolReservationModalMarkup({ assetPrefix: "../../" }),
  });
  document.querySelector(`${rootSelector} [data-member-results]`)?.remove();
  appendHolidayLegend();

  const storage = initReservationStorage();
  const classStorage = initClassStorage();
  ensureMemberDefaults();

  const state = createReservationPageState(storage, classStorage);
  let reservationController = null;
  reservationController = setupReservationModal(state, storage, {
    pageMode: true,
    openOnInit: true,
    initialContext: "school",
    onClose: () => {
      if (typeof onClose === "function") {
        onClose(reservationController);
      }
    },
    memberSearchMode: "page",
  });

  const modal = document.querySelector(`${rootSelector} [data-reservation-modal]`);
  if (modal) {
    modal.dataset.reservationPageType = pageType;
  }

  const params = new URLSearchParams(window.location.search);
  const returnedFromSearch = params.get("memberSearch") === "1";
  const selectedMemberId = params.get("memberId") || "";
  const draft = loadReservationSearchDraft(draftKey);

  if (draft) {
    reservationController.restoreMemberSearchDraft(draft, {
      selectedMemberId,
    });
    clearReservationSearchDraft(draftKey);
  } else if (pageType === "pickdrop") {
    reservationController.restoreMemberSearchDraft(
      {
        context: "school",
        selectedMemberId,
        pickdropMode: true,
      },
      { selectedMemberId }
    );
  } else if (selectedMemberId) {
    reservationController.applyMemberSelection(selectedMemberId);
  }

  if (returnedFromSearch || selectedMemberId) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("memberSearch");
    cleanUrl.searchParams.delete("memberId");
    window.history.replaceState({}, "", cleanUrl.toString());
  }

  const memberSearchField = reservationController.elements.memberInput?.closest(".member-search__input");
  let isNavigatingToMemberSearch = false;
  const openMemberSearchPage = () => {
    if (isNavigatingToMemberSearch) {
      return;
    }
    isNavigatingToMemberSearch = true;
    saveReservationSearchDraft(draftKey, reservationController.buildMemberSearchDraft());
    window.location.href = buildMemberSearchPageUrl({
      returnTo: memberSearchReturnTo,
      query: reservationController.elements.memberInput?.value || "",
    });
  };

  const handleMemberSearchTrigger = (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-member-clear]")) {
      return;
    }
    event.preventDefault();
    openMemberSearchPage();
  };

  memberSearchField?.addEventListener("click", handleMemberSearchTrigger);
  reservationController.elements.memberInput?.addEventListener("click", handleMemberSearchTrigger);
  reservationController.elements.memberInput?.addEventListener("focus", () => {
    openMemberSearchPage();
  });

  document.querySelector("[data-reservation-page-back]")?.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack(reservationController);
    }
  });

  if (pageType === "school") {
    reservationController.elements.pickdropToggle?.addEventListener("click", (event) => {
      if (typeof onPickdropNavigate !== "function") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onPickdropNavigate(reservationController);
    }, true);
  }

  document.addEventListener("reservation:updated", (event) => {
    if (typeof onReservationUpdated === "function") {
      onReservationUpdated(event?.detail || reservationController);
    }
  });

  return reservationController;
}
