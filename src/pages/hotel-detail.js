import { renderHotelingReservationDetailPage } from "../components/reservation-detail-page.js";
import { formatReservationCurrencyInput } from "../components/reservation-modal-dom.js";
import { initReservationStorage } from "../storage/reservation-storage.js";
import { initHotelRoomStorage } from "../storage/hotel-room-storage.js";
import { initPricingStorage } from "../storage/pricing-storage.js";
import { buildHotelingDateEntries, getNightCountFromReservation } from "../services/hoteling-reservation-service.js";
import {
  normalizeReservationPayment,
  parsePaymentAmount,
  shouldClearTicketPaymentOnCancellation,
} from "../services/reservation-payment.js";
import { buildReservationWithBilling } from "../services/reservation-billing.js";
import { getTimeZone } from "../utils/timezone.js";
import { formatTicketPrice } from "../services/ticket-service.js";
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

function getHotelingScheduleSnapshot(reservation) {
  const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
  const checkinEntry = entries.find((entry) => entry?.kind === "checkin") || entries[0] || null;
  const checkoutEntry =
    entries.find((entry) => entry?.kind === "checkout")
    || entries[entries.length - 1]
    || null;
  return {
    checkinDate: checkinEntry?.date || "",
    checkoutDate: checkoutEntry?.date || "",
    checkinTime:
      checkinEntry?.checkinTime
      || checkinEntry?.time
      || reservation?.checkinTime
      || "",
    checkoutTime:
      checkoutEntry?.checkoutTime
      || checkoutEntry?.time
      || reservation?.checkoutTime
      || "",
  };
}

function setSheetOpen(sheet, backdrop, open) {
  if (sheet) {
    sheet.hidden = !open;
  }
  if (backdrop) {
    backdrop.hidden = !open;
  }
}

function getPickdropLabel(reservation) {
  const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
  const hasPickup = entries.some((entry) => Boolean(entry?.pickup));
  const hasDropoff = entries.some((entry) => Boolean(entry?.dropoff));
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

function getReservationPageTitle(isEditing) {
  if (isEditing) {
    return "호텔링 예약 수정";
  }
  return "호텔링 예약";
}

function bootstrapHotelingDetailPage() {
  const root = document.querySelector("[data-hotel-detail-root]");
  if (!root) {
    return;
  }

  renderHotelingReservationDetailPage(root, {
    assetPrefix: "../../assets/",
  });

  const storage = initReservationStorage();
  const roomStorage = initHotelRoomStorage();
  const pricingStorage = initPricingStorage();
  const timeZone = getTimeZone();
  const params = new URLSearchParams(window.location.search);
  const pageState = {
    reservationId: params.get("reservationId") || "",
    dateKey: params.get("dateKey") || "",
    kind: params.get("kind") || "",
  };

  const refs = {
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
    staySummary: root.querySelector("[data-hotel-detail-stay-summary]"),
    room: root.querySelector("[data-hotel-detail-room]"),
    roomTrigger: root.querySelector("[data-hotel-detail-room-trigger]"),
    roomButton: root.querySelector("[data-hotel-detail-room-button]"),
    roomSheet: root.querySelector("[data-hotel-detail-room-sheet]"),
    roomSheetBackdrop: root.querySelector("[data-hotel-detail-room-sheet-backdrop]"),
    roomSheetClose: root.querySelector("[data-hotel-detail-room-sheet-close]"),
    roomOptions: root.querySelector("[data-hotel-detail-room-options]"),
    checkinDisplay: root.querySelector("[data-hotel-detail-checkin-display]"),
    checkinDateInput: root.querySelector("[data-hotel-detail-checkin-date-input]"),
    checkinTimeInput: root.querySelector("[data-hotel-detail-checkin-time-input]"),
    checkoutDisplay: root.querySelector("[data-hotel-detail-checkout-display]"),
    checkoutDateInput: root.querySelector("[data-hotel-detail-checkout-date-input]"),
    checkoutTimeInput: root.querySelector("[data-hotel-detail-checkout-time-input]"),
    edit: root.querySelector("[data-hotel-detail-edit]"),
    cancel: root.querySelector("[data-hotel-detail-cancel]"),
    memoToggle: root.querySelector("[data-hotel-detail-memo-toggle]"),
    memoContent: root.querySelector("[data-hotel-detail-memo-content]"),
    memoInput: root.querySelector("[data-hotel-detail-memo-input]"),
    pickdropDisplay: root.querySelector("[data-hotel-detail-pickdrop-display]"),
    pickdropOptions: root.querySelector("[data-hotel-detail-pickdrop-options]"),
    tabs: root.querySelectorAll("[data-hotel-detail-tab]"),
    panels: root.querySelectorAll("[data-hotel-detail-panel]"),
    basicTotal: root.querySelector("[data-hotel-detail-basic-total]"),
    basicRows: root.querySelector("[data-hotel-detail-basic-rows]"),
    discountGroup: root.querySelector("[data-hotel-detail-discount-group]"),
    discountTotal: root.querySelector("[data-hotel-detail-discount-total]"),
    discountRows: root.querySelector("[data-hotel-detail-discount-rows]"),
    extraGroup: root.querySelector("[data-hotel-detail-extra-group]"),
    extraTotal: root.querySelector("[data-hotel-detail-extra-total]"),
    extraRows: root.querySelector("[data-hotel-detail-extra-rows]"),
    billingTotal: root.querySelector("[data-hotel-detail-billing-total]"),
    ticketTotal: root.querySelector("[data-hotel-detail-ticket-total]"),
    ticketRows: root.querySelector("[data-hotel-detail-ticket-rows]"),
    paymentMethod: root.querySelector("[data-hotel-detail-payment-method]"),
    paymentAmount: root.querySelector("[data-hotel-detail-payment-amount]"),
    billingEdit: root.querySelector("[data-detail-billing-edit]"),
    bottom: root.querySelector("[data-hotel-detail-bottom]"),
    total: root.querySelector("[data-hotel-detail-total]"),
    paymentStatus: root.querySelector("[data-hotel-detail-payment-status]"),
    paymentCheck: root.querySelector("[data-hotel-detail-payment-check]"),
    editFooter: root.querySelector("[data-hotel-detail-footer]"),
    save: root.querySelector("[data-hotel-detail-save]"),
    fieldDisplays: root.querySelectorAll("[data-detail-field-display]"),
    fieldEdits: root.querySelectorAll("[data-detail-field-edit]"),
  };
  const viewState = {
    activeTab: "reservation",
    memoExpanded: false,
    isEditing: false,
    selectedRoom: "",
    initialSnapshot: "",
  };

  const getBackUrl = () => {
    const url = new URL("./hotels.html", window.location.href);
    if (pageState.dateKey) {
      url.searchParams.set("dateKey", pageState.dateKey);
    }
    if (pageState.kind) {
      url.searchParams.set("kind", pageState.kind);
    }
    return url.toString();
  };

  const navigateBack = () => {
    if (viewState.isEditing) {
      window.history.back();
      return;
    }
    window.location.href = getBackUrl();
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
      String(item?.type || "") === "hoteling"
      && String(item?.id || "") === pageState.reservationId
    ) || null;

  const setActiveTab = (tabKey) => {
    viewState.activeTab = tabKey === "billing" ? "billing" : "reservation";
    refs.tabs.forEach((button) => {
      const isActive = button.dataset.hotelDetailTab === viewState.activeTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    refs.panels.forEach((panel) => {
      const isActive = panel.dataset.hotelDetailPanel === viewState.activeTab;
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
    refs.bottom.hidden = viewState.isEditing;
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
    const pickupButton = refs.pickdropOptions?.querySelector("[data-hotel-detail-pickdrop=\"pickup\"]");
    const dropoffButton = refs.pickdropOptions?.querySelector("[data-hotel-detail-pickdrop=\"dropoff\"]");
    return {
      pickup: Boolean(pickupButton?.classList.contains("is-selected")),
      dropoff: Boolean(dropoffButton?.classList.contains("is-selected")),
    };
  };

  const renderRoomOptions = (selectedRoom) => {
    if (!refs.roomOptions) {
      return;
    }
    refs.roomOptions.innerHTML = "";
    roomStorage.ensureDefaults().forEach((room) => {
      const button = document.createElement("button");
      button.className = "filter-chip";
      button.type = "button";
      button.dataset.hotelDetailRoomOption = String(room?.id || "");
      button.textContent = String(room?.name || room?.id || "-");
      button.classList.toggle("is-selected", String(room?.id || "") === selectedRoom);
      refs.roomOptions.appendChild(button);
    });
  };

  const populateEditFields = (reservation) => {
    const schedule = getHotelingScheduleSnapshot(reservation);
    viewState.selectedRoom = String(reservation?.room || "");
    refs.roomButton.textContent = roomStorage.ensureDefaults().find(
      (room) => String(room?.id || "") === viewState.selectedRoom
    )?.name || "호실을 선택하세요";
    renderRoomOptions(viewState.selectedRoom);
    refs.checkinDateInput.value = schedule.checkinDate;
    refs.checkinTimeInput.value = schedule.checkinTime;
    refs.checkoutDateInput.value = schedule.checkoutDate;
    refs.checkoutTimeInput.value = schedule.checkoutTime;
    if (refs.memoInput instanceof HTMLTextAreaElement) {
      refs.memoInput.value = String(reservation?.memo || "");
    }
    const pickdropFlags = getSelectedPickdropFlags();
    const entries = Array.isArray(reservation?.dates) ? reservation.dates : [];
    const hasPickup = entries.some((entry) => Boolean(entry?.pickup));
    const hasDropoff = entries.some((entry) => Boolean(entry?.dropoff));
    refs.pickdropOptions?.querySelectorAll("[data-hotel-detail-pickdrop]").forEach((button) => {
      const selected = button.dataset.hotelDetailPickdrop === "pickup" ? hasPickup : hasDropoff;
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
      room: viewState.selectedRoom,
      checkinDate: refs.checkinDateInput.value,
      checkinTime: refs.checkinTimeInput.value,
      checkoutDate: refs.checkoutDateInput.value,
      checkoutTime: refs.checkoutTimeInput.value,
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
      room: viewState.selectedRoom,
      checkinDate: refs.checkinDateInput?.value || "",
      checkinTime: refs.checkinTimeInput?.value || "",
      checkoutDate: refs.checkoutDateInput?.value || "",
      checkoutTime: refs.checkoutTimeInput?.value || "",
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
    if (!reservation) {
      refs.content?.setAttribute("hidden", "");
      refs.empty?.removeAttribute("hidden");
      return;
    }

    refs.empty?.setAttribute("hidden", "");
    refs.content?.removeAttribute("hidden");

    const member = getMemberByReservation(reservation);
    const schedule = getHotelingScheduleSnapshot(reservation);
    const nights = getNightCountFromReservation(reservation);
    const roomName = roomStorage.ensureDefaults().find(
      (room) => String(room?.id || "") === String(reservation?.room || "")
    )?.name || String(reservation?.room || "-");

    const title = root.querySelector("[data-detail-title]");
    if (title) {
      title.textContent = getReservationPageTitle(viewState.isEditing);
    }
    renderReservationMemberInfo(refs, reservation, member);
    refs.room.textContent = roomName || "-";
    refs.checkinDisplay.textContent = `${formatDateKeyLabel(schedule.checkinDate)} ${formatTimeLabel(schedule.checkinTime)}`;
    refs.checkoutDisplay.textContent = `${formatDateKeyLabel(schedule.checkoutDate)} ${formatTimeLabel(schedule.checkoutTime)}`;
    refs.pickdropDisplay.textContent = getPickdropLabel(reservation);

    if (refs.staySummary) {
      const summaryText = `${nights}박 ${nights + 1}일`;
      refs.staySummary.textContent = `(${summaryText})`;
      refs.staySummary.hidden = false;
    }

    const billing = buildReservationBillingBreakdown(reservation, {
      basicCodes: ["HOTELING_NIGHT"],
    });
    const ticketRows = buildReservationTicketUsageRows(reservation, member);
    const basicTotal = billing.basicRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const discountTotal = billing.discountRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const extraTotal = billing.extraRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expectedTotal = Number(reservation?.billing?.totals?.expected) || 0;

    refs.ticketTotal.textContent = ticketRows.length > 0 ? `총 ${ticketRows.length}건` : "-";
    renderReservationBillingRows(refs.ticketRows, ticketRows, "사용한 이용권이 없습니다.");
    refs.basicTotal.textContent = buildAmountLabel(basicTotal);
    renderReservationBillingRows(refs.basicRows, billing.basicRows, "기본 요금 내역이 없습니다.");

    refs.discountGroup.hidden = billing.discountRows.length === 0;
    refs.discountTotal.textContent = `- ${formatTicketPrice(discountTotal)}`;
    renderReservationBillingRows(refs.discountRows, billing.discountRows, "할인 내역이 없습니다.");

    refs.extraGroup.hidden = billing.extraRows.length === 0;
    refs.extraTotal.textContent = `+ ${formatTicketPrice(extraTotal)}`;
    renderReservationBillingRows(refs.extraRows, billing.extraRows, "추가 요금 내역이 없습니다.");

    refs.billingTotal.textContent = buildAmountLabel(expectedTotal);
    refs.total.textContent = formatTicketPrice(expectedTotal);
    refs.paymentStatus.textContent = Number(reservation?.payment?.amount) > 0 || reservation?.payment?.method === "ticket"
      ? "완료"
      : "대기";
    refs.paymentCheck.checked = refs.paymentStatus.textContent === "완료";

    populateEditFields(reservation);
    setActiveTab(viewState.activeTab);
    syncEditMode();
    syncSaveState();
  };

  const saveChanges = () => {
    const reservation = getCurrentReservation();
    if (!reservation) {
      return;
    }
    const nextCheckinDate = String(refs.checkinDateInput?.value || "").trim();
    const nextCheckoutDate = String(refs.checkoutDateInput?.value || "").trim();
    const nextCheckinTime = String(refs.checkinTimeInput?.value || "").trim();
    const nextCheckoutTime = String(refs.checkoutTimeInput?.value || "").trim();
    const nextMemo = String(refs.memoInput?.value || "").trim();
    const paymentMethodRaw = String(refs.paymentMethod?.value || "ticket");
    const paymentMethod = paymentMethodRaw === "bank" ? "transfer" : paymentMethodRaw;
    const paymentAmount = paymentMethod === "ticket"
      ? 0
      : parsePaymentAmount(refs.paymentAmount?.value || 0);
    const pickdropFlags = getSelectedPickdropFlags();

    const nextReservations = storage.updateReservation(reservation.id, (currentReservation) => {
      const nextDates = buildHotelingDateEntries(
        nextCheckinDate,
        nextCheckoutDate,
        nextCheckinTime,
        nextCheckoutTime
      );
      const existingEntries = Array.isArray(currentReservation?.dates) ? currentReservation.dates : [];
      const entryByKind = new Map(
        existingEntries.map((entry) => [String(entry?.kind || ""), entry])
      );
      const reservationDraft = {
        ...currentReservation,
        room: viewState.selectedRoom || currentReservation.room,
        memo: nextMemo,
        hasPickup: pickdropFlags.pickup,
        hasDropoff: pickdropFlags.dropoff,
        payment: paymentMethod
          ? normalizeReservationPayment({ method: paymentMethod, amount: paymentAmount })
          : null,
        dates: nextDates.map((entry) => {
          const previous = entryByKind.get(String(entry?.kind || "")) || null;
          return {
            ...entry,
            baseStatusKey: String(previous?.baseStatusKey || "PLANNED"),
            ticketUsages: Array.isArray(previous?.ticketUsages) ? previous.ticketUsages : [],
            pickup: entry.kind === "checkin" ? pickdropFlags.pickup : false,
            dropoff: entry.kind === "checkout" ? pickdropFlags.dropoff : false,
          };
        }),
      };
      const nextPayment = shouldClearTicketPaymentOnCancellation(reservationDraft)
        ? null
        : reservationDraft.payment;
      return buildReservationWithBilling(
        {
          ...reservationDraft,
          payment: nextPayment,
        },
        {
          pricingItems: pricingStorage.loadPricingItems(),
          timeZone,
          payment: nextPayment,
        }
      );
    });

    const updatedReservation = nextReservations.find((item) => String(item?.id || "") === reservation.id) || null;
    const updatedSchedule = getHotelingScheduleSnapshot(updatedReservation);
    pageState.dateKey = String(updatedSchedule.checkinDate || pageState.dateKey || "");
    pageState.kind = "checkin";
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("reservationId", reservation.id);
    if (pageState.dateKey) {
      nextUrl.searchParams.set("dateKey", pageState.dateKey);
    }
    nextUrl.searchParams.set("kind", pageState.kind);
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
      setActiveTab(button.dataset.hotelDetailTab || "reservation");
    });
  });
  refs.roomTrigger?.addEventListener("click", () => {
    if (!viewState.isEditing) {
      return;
    }
    setSheetOpen(refs.roomSheet, refs.roomSheetBackdrop, true);
  });
  refs.roomSheetBackdrop?.addEventListener("click", () => {
    setSheetOpen(refs.roomSheet, refs.roomSheetBackdrop, false);
  });
  refs.roomSheetClose?.addEventListener("click", () => {
    setSheetOpen(refs.roomSheet, refs.roomSheetBackdrop, false);
  });
  refs.roomOptions?.addEventListener("click", (event) => {
    const option = event.target instanceof HTMLElement
      ? event.target.closest("[data-hotel-detail-room-option]")
      : null;
    if (!option) {
      return;
    }
    viewState.selectedRoom = String(option.dataset.hotelDetailRoomOption || "");
    refs.roomButton.textContent = option.textContent || "호실을 선택하세요";
    renderRoomOptions(viewState.selectedRoom);
    setSheetOpen(refs.roomSheet, refs.roomSheetBackdrop, false);
    syncSaveState();
  });
  refs.pickdropOptions?.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest("[data-hotel-detail-pickdrop]")
      : null;
    if (!button || !viewState.isEditing) {
      return;
    }
    button.classList.toggle("is-selected");
    syncSaveState();
  });
  [
    refs.checkinDateInput,
    refs.checkinTimeInput,
    refs.checkoutDateInput,
    refs.checkoutTimeInput,
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
  document.addEventListener("DOMContentLoaded", bootstrapHotelingDetailPage);
} else {
  bootstrapHotelingDetailPage();
}
