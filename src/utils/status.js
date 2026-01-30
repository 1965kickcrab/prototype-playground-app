export function isCanceledStatus(baseStatusKey, statusText, storage) {
  const canceled = storage?.STATUS?.CANCELED;
  if (!canceled) {
    return false;
  }

  if (baseStatusKey && storage?.STATUS?.[baseStatusKey] === canceled) {
    return true;
  }

  return statusText === canceled;
}
