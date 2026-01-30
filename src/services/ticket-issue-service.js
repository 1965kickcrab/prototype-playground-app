export function getDefaultIssueQuantity(ticketQuantity, member, ticketType = "kindergarten") {
  const totalMap = member?.totalReservableCountByType;
  const totalReservable = Number(totalMap?.[ticketType]);
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
  const term = query.trim().toLowerCase();
  if (!term) {
    return true;
  }

  return [member.dogName, member.breed, member.owner].some((value) =>
    (value || "").toLowerCase().includes(term)
  );
}

export function computeIssueAvailability(
  member,
  ticketQuantity,
  issueQuantity,
  isSelected,
  ticketType
) {
  const type = ticketType || "kindergarten";
  const totalByType = member?.totalReservableCountByType;
  const baseRemaining = Number.isFinite(totalByType?.[type])
    ? totalByType[type]
    : null;
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
