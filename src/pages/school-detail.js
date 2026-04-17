import { renderSchoolReservationDetailPage } from "../components/reservation-detail-page.js";
import { formatReservationCurrencyInput } from "../components/reservation-modal-dom.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { initClassStorage } from "../storage/class-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import {
  normalizeReservationPayment,
  parsePaymentAmount,
  shouldClearTicketPaymentOnCancellation,
} from "../services/reservation-payment.js";
import { buildReservationWithBilling } from "../services/reservation-billing.js";
import { getTimeZone } from "../utils/timezone.js";
import {
  buildAmountLabel,
  buildReservationBillingBreakdown,
  buildReservationTicketUsageRows,
  formatDateKeyLabel,
  formatTimeLabel,
  getMemberByReservation,
  renderReservationBillingRows,
  renderReservationMemberInfo,
} from "./reservation-detail-page-shared.js";

const SCHOOL_SERVICE_TYPES = new Set(["school", "daycare", "pickdrop"]);

function getReservationTitle(reservationType) {
  if (reservationType === "daycare") {
    return "데이케어 예약";
  }
  return "유치원 예약";
}

function getReservationPageTitle(reservationType, isEditing) {
  if (isEditing) {
    return "유치원 예약 수정";
  }
  return getReservationTitle(reservationType);
}

function getPickdropLabel(entry) {
  const hasPickup = Boolean(entry?.pickup);
  const hasDropoff = Boolean(entry?.dropoff);
  if (hasPickup && hasDropoff) {
    return "왕복";
  }
  if (hasPickup) {
    return "픽업";
  }
  if (hasDropoff) {
    return "드랍";
  }
  return "-";
}

function setSheetOpen(sheet, backdrop, open) {
  if (sheet) {
    sheet.hidden = !open;
  }
  if (backdrop) {
    backdrop.hidden = !open;
  }
}

function bootstrapSchoolDetailPage() {
  const root = document.querySelector("[data-school-detail-root]");
  if (!root) {
    return;
  }

  renderSchoolReservationDetailPage(root, {
    assetPrefix: "../../assets/",
  });

  const storage = initReservationStorage();
  const classStorage = initClassStorage();
  const pricingStorage = initPricingStorage();
  const timeZone = getTimeZone();
  const params = new URLSearchParams(window.location.search);
  const pageState = {
    reservationId: params.get("reservationId") || "",
    dateKey: params.get("dateKey") || "",
  };
  const refs = {
    title: root.querySelector("[data-detail-title]"),
    back: root.querySelector("[data-detail-back]"),
    content: root.querySelector("[data-detail-content]"),
    empty: root.querySelector("[data-detail-empty]"),
    emptyBack: root.querySelector("[data-detail-empty-back]"),
    dogName: root.querySelector("[data-detail-dog-name]"),
    breed: root.querySelector("[data-detail-breed]"),
    weight: root.querySelector("[data-detail-weight]"),
    owner: root.querySelector("[data-detail-owner]"),
    phone: root.querySelector("[data-detail-phone]"),
    petTags: root.querySelector("[data-detail-pet-tags]"),
    edit: root.querySelector("[data-school-detail-edit]"),
    cancel: root.querySelector("[data-school-detail-cancel]"),
    memoToggle: root.querySelector("[data-school-detail-memo-toggle]"),
    memoContent: root.querySelector("[data-school-detail-memo-content]"),
    memoInput: root.querySelector("[data-school-detail-memo-input]"),
    tabs: root.querySelectorAll("[data-school-detail-tab]"),
    panels: root.querySelectorAll("[data-school-detail-panel]"),
    reservationDate: root.querySelector("[data-school-detail-date]"),
    reservationDateInput: root.querySelector("[data-school-detail-date-input]"),
    service: root.querySelector("[data-school-detail-service]"),
    serviceTrigger: root.querySelector("[data-school-detail-service-trigger]"),
    serviceButton: root.querySelector("[data-school-detail-service-button]"),
    serviceSheet: root.querySelector("[data-school-detail-service-sheet]"),
    serviceSheetBackdrop: root.querySelector("[data-school-detail-service-sheet-backdrop]"),
    serviceSheetClose: root.querySelector("[data-school-detail-service-sheet-close]"),
    serviceOptions: root.querySelector("[data-school-detail-service-options]"),
    timeRow: root.querySelector("[data-school-detail-time-row]"),
    time: root.querySelector("[data-school-detail-time]"),
    startTimeInput: root.querySelector("[data-school-detail-start-time]"),
    endTimeInput: root.querySelector("[data-school-detail-end-time]"),
    pickdropRow: root.querySelector("[data-school-detail-pickdrop-row]"),
    pickdrop: root.querySelector("[data-school-detail-pickdrop]"),
    pickdropOptions: root.querySelector("[data-school-detail-pickdrop-options]"),
    total: root.querySelector("[data-school-detail-total]"),
    ticketTotal: root.querySelector("[data-school-detail-ticket-total]"),
    ticketRows: root.querySelector("[data-school-detail-ticket-rows]"),
    basicTotal: root.querySelector("[data-school-detail-basic-total]"),
    basicRows: root.querySelector("[data-school-detail-basic-rows]"),
    discountGroup: root.querySelector("[data-school-detail-discount-group]"),
    discountTotal: root.querySelector("[data-school-detail-discount-total]"),
    discountRows: root.querySelector("[data-school-detail-discount-rows]"),
    extraGroup: root.querySelector("[data-school-detail-extra-group]"),
    extraTotal: root.querySelector("[data-school-detail-extra-total]"),
    extraRows: root.querySelector("[data-school-detail-extra-rows]"),
    billingEdit: root.querySelector("[data-detail-billing-edit]"),
    paymentMethod: root.querySelector("[data-school-detail-payment-method]"),
    paymentAmount: root.querySelector("[data-school-detail-payment-amount]"),
    editFooter: root.querySelector("[data-school-detail-footer]"),
    save: root.querySelector("[data-school-detail-save]"),
    fieldDisplays: root.querySelectorAll("[data-detail-field-display]"),
    fieldEdits: root.querySelectorAll("[data-detail-field-edit]"),
  };
  const viewState = {
    activeTab: "reservation",
    memoExpanded: false,
    isEditing: false,
    selectedService: "",
    initialSnapshot: "",
  };

  const fallbackUrl = new URL("../../public/index.html", window.location.href);
  if (pageState.dateKey) {
    fallbackUrl.searchParams.set("dateKey", pageState.dateKey);
  }

  const navigateBack = () => {
    if (viewState.isEditing) {
      window.history.back();
      return;
    }
    window.location.href = fallbackUrl.toString();
  };

  const syncHistoryMode = (mode, method = "replace") => {
    const state = {
      ...(window.history.state && typeof window.history.state === "object" ? window.history.state : {}),
      reservationDetailMode: mode,
    };
    if (method === "push") {
      window.history.pushState(state, "", window.location.href);
      return;
    }
    window.history.replaceState(state, "", window.location.href);
  };

  const getCurrentReservation = () =>
    storage.loadReservations().find((item) =>
      SCHOOL_SERVICE_TYPES.has(String(item?.type || ""))
      && String(item?.id || "") === pageState.reservationId
    ) || null;

  const getCurrentEntry = (reservation) => {
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    return (
      entries.find((entry) => entry?.date === pageState.dateKey)
      || entries[0]
      || null
    );
  };

  const setActiveTab = (tabKey) => {
    viewState.activeTab = tabKey === "billing" ? "billing" : "reservation";
    refs.tabs.forEach((button) => {
      const isActive = button.dataset.schoolDetailTab === viewState.activeTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    refs.panels.forEach((panel) => {
      const isActive = panel.dataset.schoolDetailPanel === viewState.activeTab;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  };

  const syncMemoPanel = () => {
    refs.memoToggle?.setAttribute("aria-expanded", String(viewState.memoExpanded));
    if (refs.memoContent) {
      refs.memoContent.hidden = !viewState.memoExpanded;
    }
  };

  const syncEditMode = () => {
    refs.edit.hidden = viewState.isEditing;
    refs.cancel.hidden = !viewState.isEditing;
    refs.editFooter.hidden = !viewState.isEditing;
    refs.billingEdit.hidden = !viewState.isEditing;
    refs.fieldDisplays.forEach((node) => {
      node.hidden = viewState.isEditing;
    });
    refs.fieldEdits.forEach((node) => {
      node.hidden = !viewState.isEditing;
    });
    if (viewState.isEditing) {
      viewState.memoExpanded = true;
    }
    syncMemoPanel();
  };

  const getSelectedPickdropFlags = () => {
    const pickupButton = refs.pickdropOptions?.querySelector("[data-school-detail-pickdrop=\"pickup\"]");
    const dropoffButton = refs.pickdropOptions?.querySelector("[data-school-detail-pickdrop=\"dropoff\"]");
    return {
      pickup: Boolean(pickupButton?.classList.contains("is-selected")),
      dropoff: Boolean(dropoffButton?.classList.contains("is-selected")),
    };
  };

  const renderServiceOptions = (selectedName) => {
    if (!refs.serviceOptions) {
      return;
    }
    refs.serviceOptions.innerHTML = "";
    const classes = classStorage.ensureDefaults();
    classes.forEach((item) => {
      const button = document.createElement("button");
      button.className = "filter-chip";
      button.type = "button";
      button.dataset.schoolDetailServiceOption = String(item.name || "");
      button.textContent = String(item.name || "-");
      button.classList.toggle("is-selected", String(item.name || "") === selectedName);
      refs.serviceOptions.appendChild(button);
    });
  };

  const populateEditFields = (reservation, entry) => {
    const selectedService = String(entry?.service || reservation?.service || "");
    const classInfo = classStorage.ensureDefaults().find(
      (item) => String(item?.name || "") === selectedService
    ) || null;
    viewState.selectedService = selectedService;
    refs.reservationDateInput.value = String(entry?.date || "");
    refs.serviceButton.textContent = selectedService || "클래스를 선택하세요";
    renderServiceOptions(selectedService);
    refs.startTimeInput.value = String(
      entry?.checkinTime
      || classInfo?.startTime
      || reservation?.checkinTime
      || ""
    );
    refs.endTimeInput.value = String(
      entry?.checkoutTime
      || classInfo?.endTime
      || reservation?.checkoutTime
      || ""
    );
    if (refs.memoInput instanceof HTMLTextAreaElement) {
      refs.memoInput.value = String(reservation?.memo || "");
    }
    const pickdropFlags = {
      pickup: Boolean(entry?.pickup),
      dropoff: Boolean(entry?.dropoff),
    };
    refs.pickdropOptions?.querySelectorAll("[data-school-detail-pickdrop]").forEach((button) => {
      const isPickup = button.dataset.schoolDetailPickdrop === "pickup";
      const selected = isPickup ? pickdropFlags.pickup : pickdropFlags.dropoff;
      button.classList.toggle("is-selected", selected);
    });
    const paymentMethod = String(reservation?.payment?.method || "").trim().toLowerCase();
    if (refs.paymentMethod instanceof HTMLSelectElement) {
      refs.paymentMethod.value = paymentMethod === "transfer" ? "bank" : (paymentMethod || "ticket");
    }
    if (refs.paymentAmount instanceof HTMLInputElement) {
      refs.paymentAmount.value = paymentMethod === "ticket"
        ? ""
        : String(Number(reservation?.payment?.amount) || "");
      formatReservationCurrencyInput(refs.paymentAmount);
    }
    viewState.initialSnapshot = JSON.stringify({
      date: refs.reservationDateInput.value,
      service: selectedService,
      startTime: refs.startTimeInput.value,
      endTime: refs.endTimeInput.value,
      memo: refs.memoInput?.value || "",
      pickup: pickdropFlags.pickup,
      dropoff: pickdropFlags.dropoff,
      paymentMethod: refs.paymentMethod?.value || "ticket",
      paymentAmount: refs.paymentAmount?.value || "",
    });
  };

  const syncSaveState = () => {
    if (!viewState.isEditing || !refs.save) {
      return;
    }
    const pickdropFlags = getSelectedPickdropFlags();
    const nextSnapshot = JSON.stringify({
      date: refs.reservationDateInput?.value || "",
      service: viewState.selectedService,
      startTime: refs.startTimeInput?.value || "",
      endTime: refs.endTimeInput?.value || "",
      memo: refs.memoInput?.value || "",
      pickup: pickdropFlags.pickup,
      dropoff: pickdropFlags.dropoff,
      paymentMethod: refs.paymentMethod?.value || "ticket",
      paymentAmount: refs.paymentAmount?.value || "",
    });
    refs.save.disabled = nextSnapshot === viewState.initialSnapshot;
  };

  const renderPage = () => {
    const reservation = getCurrentReservation();
    const entry = getCurrentEntry(reservation);
    if (!reservation || !entry) {
      refs.content?.setAttribute("hidden", "");
      refs.empty?.removeAttribute("hidden");
      return;
    }

    refs.empty?.setAttribute("hidden", "");
    refs.content?.removeAttribute("hidden");

    const member = getMemberByReservation(reservation);
    const serviceType = String(reservation?.type || "school");
    const selectedService = String(entry?.service || reservation?.service || "");
    const classInfo = classStorage.ensureDefaults().find(
      (item) => String(item?.name || "") === selectedService
    ) || null;
    const startTime = String(entry?.checkinTime || classInfo?.startTime || reservation?.checkinTime || "");
    const endTime = String(entry?.checkoutTime || classInfo?.endTime || reservation?.checkoutTime || "");
    const timeText = startTime && endTime
      ? `${formatTimeLabel(startTime)} ~ ${formatTimeLabel(endTime)}`
      : "-";

    refs.title.textContent = getReservationPageTitle(serviceType, viewState.isEditing);
    renderReservationMemberInfo(refs, reservation, member);
    refs.reservationDate.textContent = formatDateKeyLabel(entry.date);
    refs.service.textContent = selectedService || "-";
    refs.timeRow.hidden = false;
    refs.time.textContent = timeText;
    refs.pickdropRow.hidden = false;
    refs.pickdrop.textContent = getPickdropLabel(entry);

    const basicCodes = serviceType === "daycare" ? ["DAYCARE"] : ["SCHOOL"];
    const billing = buildReservationBillingBreakdown(reservation, { basicCodes });
    const ticketRows = buildReservationTicketUsageRows(reservation, member);
    const expectedTotal = Number(reservation?.billing?.totals?.expected) || 0;
    const basicTotal = billing.basicRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const discountTotal = billing.discountRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const extraTotal = billing.extraRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    refs.total.textContent = buildAmountLabel(expectedTotal);
    refs.ticketTotal.textContent = ticketRows.length > 0 ? `총 ${ticketRows.length}건` : "-";
    renderReservationBillingRows(refs.ticketRows, ticketRows, "사용한 이용권이 없습니다.");
    refs.basicTotal.textContent = buildAmountLabel(basicTotal);
    renderReservationBillingRows(refs.basicRows, billing.basicRows, "기본 요금 내역이 없습니다.");

    refs.discountGroup.hidden = billing.discountRows.length === 0;
    refs.discountTotal.textContent = `- ${buildAmountLabel(discountTotal)}`;
    renderReservationBillingRows(refs.discountRows, billing.discountRows, "할인 내역이 없습니다.");

    refs.extraGroup.hidden = billing.extraRows.length === 0;
    refs.extraTotal.textContent = `+ ${buildAmountLabel(extraTotal)}`;
    renderReservationBillingRows(refs.extraRows, billing.extraRows, "추가 요금 내역이 없습니다.");

    populateEditFields(reservation, entry);
    setActiveTab(viewState.activeTab);
    syncEditMode();
    syncSaveState();
  };

  const saveChanges = () => {
    const reservation = getCurrentReservation();
    const entry = getCurrentEntry(reservation);
    if (!reservation || !entry) {
      return;
    }
    const nextDate = String(refs.reservationDateInput?.value || "").trim();
    const nextService = String(viewState.selectedService || "").trim();
    const classes = classStorage.ensureDefaults();
    const classInfo = classes.find((item) => String(item?.name || "") === nextService) || null;
    const nextType = reservation.type === "pickdrop"
      ? reservation.type
      : (classInfo?.type === "daycare" ? "daycare" : "school");
    const nextStartTime = String(refs.startTimeInput?.value || "").trim();
    const nextEndTime = String(refs.endTimeInput?.value || "").trim();
    const pickdropFlags = getSelectedPickdropFlags();
    const nextMemo = String(refs.memoInput?.value || "").trim();
    const paymentMethodRaw = String(refs.paymentMethod?.value || "ticket");
    const paymentMethod = paymentMethodRaw === "bank" ? "transfer" : paymentMethodRaw;
    const paymentAmount = paymentMethod === "ticket"
      ? 0
      : parsePaymentAmount(refs.paymentAmount?.value || 0);

    const nextReservations = storage.updateReservation(reservation.id, (currentReservation) => {
      const currentDates = Array.isArray(currentReservation?.dates) ? currentReservation.dates : [];
      const targetDateKey = pageState.dateKey || entry.date;
      const nextDates = currentDates.map((dateEntry, index) => {
        const isTarget = String(dateEntry?.date || "") === targetDateKey || (!targetDateKey && index === 0);
        if (!isTarget) {
          return dateEntry;
        }
        return {
          ...dateEntry,
          date: nextDate || dateEntry.date,
          class: nextService,
          service: nextService,
          checkinTime: nextStartTime,
          checkoutTime: nextEndTime,
          pickup: pickdropFlags.pickup,
          dropoff: pickdropFlags.dropoff,
        };
      });
      const nextReservationDraft = {
        ...currentReservation,
        type: nextType,
        memo: nextMemo,
        service: nextService,
        class: nextService,
        hasPickup: pickdropFlags.pickup,
        hasDropoff: pickdropFlags.dropoff,
        payment: paymentMethod
          ? normalizeReservationPayment({ method: paymentMethod, amount: paymentAmount })
          : null,
        dates: nextDates,
      };
      const nextPayment = shouldClearTicketPaymentOnCancellation(nextReservationDraft)
        ? null
        : nextReservationDraft.payment;
      return buildReservationWithBilling(
        {
          ...nextReservationDraft,
          payment: nextPayment,
        },
        {
          pricingItems: pricingStorage.loadPricingItems(),
          timeZone,
          classId: String(classInfo?.id || ""),
          classIdByName: new Map(
            classes.map((item) => [String(item?.name || ""), String(item?.id || "")])
          ),
          payment: nextPayment,
        }
      );
    });

    const updatedReservation = nextReservations.find((item) => String(item?.id || "") === reservation.id) || null;
    const updatedEntry = getCurrentEntry(updatedReservation);
    pageState.dateKey = String(updatedEntry?.date || pageState.dateKey || "");
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("reservationId", reservation.id);
    if (pageState.dateKey) {
      nextUrl.searchParams.set("dateKey", pageState.dateKey);
    }
    window.history.replaceState(
      {
        ...(window.history.state && typeof window.history.state === "object" ? window.history.state : {}),
        reservationDetailMode: "view",
      },
      "",
      nextUrl.toString()
    );
    viewState.isEditing = false;
    renderPage();
  };

  const cancelReservation = () => {
    const reservation = getCurrentReservation();
    if (!reservation) {
      return;
    }
    storage.updateReservation(reservation.id, (currentReservation) => {
      const nextDates = Array.isArray(currentReservation?.dates)
        ? currentReservation.dates.map((entry) => ({
          ...entry,
          baseStatusKey: "CANCELED",
          status: storage.STATUS.CANCELED,
          canceledAt: entry?.canceledAt || new Date().toISOString(),
        }))
        : [];
      const nextReservation = {
        ...currentReservation,
        dates: nextDates,
      };
      return shouldClearTicketPaymentOnCancellation(nextReservation)
        ? { ...nextReservation, payment: null }
        : nextReservation;
    });
    window.alert("예약이 취소되었습니다.");
    viewState.isEditing = false;
    renderPage();
  };

  refs.back?.addEventListener("click", navigateBack);
  refs.emptyBack?.addEventListener("click", navigateBack);
  refs.edit?.addEventListener("click", () => {
    syncHistoryMode("edit", "push");
    viewState.isEditing = true;
    renderPage();
  });
  refs.cancel?.addEventListener("click", cancelReservation);
  refs.save?.addEventListener("click", saveChanges);
  refs.memoToggle?.addEventListener("click", () => {
    viewState.memoExpanded = !viewState.memoExpanded;
    syncMemoPanel();
  });
  refs.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.schoolDetailTab || "reservation");
    });
  });
  refs.serviceTrigger?.addEventListener("click", () => {
    if (!viewState.isEditing) {
      return;
    }
    setSheetOpen(refs.serviceSheet, refs.serviceSheetBackdrop, true);
  });
  refs.serviceSheetBackdrop?.addEventListener("click", () => {
    setSheetOpen(refs.serviceSheet, refs.serviceSheetBackdrop, false);
  });
  refs.serviceSheetClose?.addEventListener("click", () => {
    setSheetOpen(refs.serviceSheet, refs.serviceSheetBackdrop, false);
  });
  refs.serviceOptions?.addEventListener("click", (event) => {
    const option = event.target instanceof HTMLElement
      ? event.target.closest("[data-school-detail-service-option]")
      : null;
    if (!option) {
      return;
    }
    viewState.selectedService = String(option.dataset.schoolDetailServiceOption || "");
    refs.serviceButton.textContent = viewState.selectedService || "클래스를 선택하세요";
    renderServiceOptions(viewState.selectedService);
    setSheetOpen(refs.serviceSheet, refs.serviceSheetBackdrop, false);
    syncSaveState();
  });
  refs.pickdropOptions?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-school-detail-pickdrop]")
      : null;
    if (!button || !viewState.isEditing) {
      return;
    }
    button.classList.toggle("is-selected");
    syncSaveState();
  });
  [
    refs.reservationDateInput,
    refs.startTimeInput,
    refs.endTimeInput,
    refs.memoInput,
    refs.paymentMethod,
    refs.paymentAmount,
  ].forEach((field) => {
    field?.addEventListener("input", () => {
      if (field === refs.paymentAmount && field instanceof HTMLInputElement) {
        formatReservationCurrencyInput(field);
      }
      syncSaveState();
    });
    field?.addEventListener("change", syncSaveState);
  });

  window.addEventListener("popstate", (event) => {
    const nextIsEditing = event.state?.reservationDetailMode === "edit";
    if (nextIsEditing === viewState.isEditing) {
      return;
    }
    viewState.isEditing = nextIsEditing;
    renderPage();
  });

  syncHistoryMode("view");

  renderPage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapSchoolDetailPage);
} else {
  bootstrapSchoolDetailPage();
}
