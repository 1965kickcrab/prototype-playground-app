import { setupHotelingReservationCreatePage } from "./hotel-reservation-create-page-shared.js";

function goBackToHotels(nextUrl = "./hotels.html") {
  window.location.href = nextUrl;
}

document.addEventListener("DOMContentLoaded", () => {
  setupHotelingReservationCreatePage({
    rootSelector: "[data-hoteling-reservation-create-root]",
    onBack: goBackToHotels,
  });
});
