function createToast() {
  let toast = document.querySelector("[data-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.dataset.toast = "true";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  return toast;
}

export function showToast(message) {
  const toast = createToast();
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}
