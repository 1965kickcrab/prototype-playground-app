import {
  getHotelingDateKey,
  STATUS,
} from "../services/hoteling-reservation-service.js";
import { getTimeZone } from "../utils/timezone.js";

export function collectHotelingReservationFormData(root, modalState) {
  const roomInput = root.querySelector("[data-hoteling-room]:checked");
  const checkinTime =
    root.querySelector("[data-hoteling-checkin-time]")?.value || "10:00";
  const checkoutTime =
    root.querySelector("[data-hoteling-checkout-time]")?.value || "10:00";
  const memoInput = root.querySelector("[data-hoteling-memo]");
  const memoValue = memoInput instanceof HTMLTextAreaElement
    ? memoInput.value.trim()
    : "";

  const member = modalState?.selectedMember || null;
  const timeZone = getTimeZone();
  const checkinDate = getHotelingDateKey(modalState?.checkin, timeZone);
  const checkoutDate = getHotelingDateKey(modalState?.checkout, timeZone);

  return {
    room: roomInput?.value || "",
    status: STATUS.PLANNED,
    checkinDate,
    checkoutDate,
    checkinTime,
    checkoutTime,
    memberId: String(member?.id || ""),
    hasPickup: false,
    hasDropoff: false,
    memo: memoValue,
  };
}

