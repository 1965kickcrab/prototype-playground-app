function getBaseReservable(member, ticketType, baseReservableOverride) {
  if (Number.isFinite(Number(baseReservableOverride))) {
    return Number(baseReservableOverride);
  }
  const totalMap = member?.totalReservableCountByType;
  const totalReservable = Number(totalMap?.[ticketType]);
  return Number.isFinite(totalReservable) ? totalReservable : null;
}

export function getDefaultIssueQuantity(
  ticketQuantity,
  member,
  ticketType = "school",
  baseReservableOverride = null
) {
  const totalReservable = getBaseReservable(member, ticketType, baseReservableOverride);
  const overage = Number.isFinite(totalReservable) && totalReservable < 0
    ? Math.abs(totalReservable)
    : 0;
  if (
    Number.isFinite(ticketQuantity)
    && ticketQuantity > 0
    && overage > 0
    && ticketQuantity < overage
  ) {
    return Math.ceil(overage / ticketQuantity);
  }

  return 1;
}

export function matchesIssueSearch(member, query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) {
    return true;
  }

  return [member?.dogName, member?.breed, member?.owner].some((value) =>
    String(value || "").toLowerCase().includes(term)
  );
}

export function computeIssueAvailability(
  member,
  ticketQuantity,
  issueQuantity,
  isSelected,
  ticketType,
  baseReservableOverride = null
) {
  const type = ticketType || "school";
  const baseRemaining = getBaseReservable(member, type, baseReservableOverride);
  let remaining = baseRemaining;
  let overage = Number.isFinite(remaining) && remaining < 0 ? Math.abs(remaining) : 0;
  const canApply =
    isSelected && Number.isFinite(ticketQuantity) && ticketQuantity > 0;

  if (canApply) {
    const added = ticketQuantity * issueQuantity;
    remaining = (Number.isFinite(remaining) ? remaining : 0) + added;
    if (Number.isFinite(remaining) && remaining < 0) {
      overage = Math.abs(remaining);
    } else {
      overage = 0;
    }
  }

  return {
    overage,
    remaining: Number.isFinite(remaining) ? Math.max(remaining, 0) : remaining,
  };
}
