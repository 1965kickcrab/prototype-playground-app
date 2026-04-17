function bindSwipeScroller(scroller) {
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;
  let suppressClick = false;

  const stopDragging = () => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    scroller.classList.remove("is-dragging");
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  };

  scroller.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    isDragging = true;
    suppressClick = false;
    startX = event.clientX;
    startScrollLeft = scroller.scrollLeft;
    scroller.classList.add("is-dragging");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!isDragging) {
      return;
    }
    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) > 4) {
      suppressClick = true;
    }
    scroller.scrollLeft = startScrollLeft - deltaX;
    event.preventDefault();
  });

  window.addEventListener("mouseup", stopDragging);
  window.addEventListener("blur", stopDragging);
  scroller.addEventListener("click", (event) => {
    if (!suppressClick) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

export function setupTicketServiceTabSwipe(root = document) {
  root.querySelectorAll("[data-ticket-service-tabs]").forEach((scroller) => {
    if (scroller instanceof HTMLElement && !scroller.dataset.ticketServiceTabsReady) {
      scroller.dataset.ticketServiceTabsReady = "true";
      bindSwipeScroller(scroller);
    }
  });
}
