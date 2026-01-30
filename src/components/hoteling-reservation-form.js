import {
  getHotelingDateKey,
  HOTELING_STATUS,
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
    status: HOTELING_STATUS.PLANNED,
    checkinDate,
    checkoutDate,
    checkinTime,
    checkoutTime,
    dogName: member?.dogName || "",
    breed: member?.breed || "",
    owner: member?.owner || "",
    hasPickup: false,
    hasDropoff: false,
    memo: memoValue,
  };
}

