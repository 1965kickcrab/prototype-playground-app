# DECISIONS.md

Decision Registry (append-only). Each entry records a stable rule or policy derived from the historical logs.

## DR-001 (2025-12-16) [reservation][storage]
- What: Persist reservations in localStorage and reload them on initialization; keep status updates in sync by reservation ID.
- Rationale: The log moved reservation creation and status changes to storage-backed state so list rendering stays consistent across reloads.
- Implication: All reservation CRUD and status transitions must flow through storage modules, not page state.

## DR-002 (2025-12-16) [reservation]
- What: Use local YYYY-MM-DD formatting for date attributes, comparisons, and inputs (no UTC conversion).
- Rationale: The log explicitly noted preventing day-off-by-one errors caused by UTC offsets.
- Implication: Calendar/list filters and date inputs must use local date formatting consistently.

## DR-003 (2025-12-26) [reservation][settings][storage]
- What: Normalize reservation service values to class names and sync reservations when class names change.
- Rationale: Service filters, reservation options, and class lists were linked to class names in settings.
- Implication: Class name updates must propagate to reservation data and filters to keep them aligned.

## DR-004 (2025-12-29) [reservation]
- What: Cancel reservations by setting status to "예약 취소" instead of deleting, and exclude canceled items from counts.
- Rationale: The log switched cancel behavior to status-based cancellation and later excluded canceled rows from counts.
- Implication: Counts, filters, and selection rules must check the canceled status while retaining the record.

## DR-005 (2026-01-25) [ticket][reservation][storage]
- What: Track member availability and limits with per-service maps (total and remaining) and use them for issue/reservation logic.
- Rationale: The log split member counts by service type and removed legacy total/remaining fields.
- Implication: Availability, overage, and count deltas must be applied per service on status changes and cancellations.

## DR-006 (2026-01-27) [hoteling][reservation][ticket][storage]
- What: Store hoteling reservations with per-date entries and per-date ticket usage, excluding the checkout date.
- Rationale: The log added date entry generation and noted excluding checkout from ticket usage.
- Implication: Date edits must rebuild date entries and preserve ticket usage where possible.

## DR-007 (2026-01-29) [reservation][ticket][hoteling][pickdrop]
- What: Restore ticket usage and availability when reservations are canceled (daycare, hoteling, and pickdrop).
- Rationale: The log explicitly added ticket restoration on cancellation for both services.
- Implication: Cancel flows must roll back ticketUsage and member count maps consistently.

## DR-008 (2026-02-03) [reservation][ticket][bugfix]
- What: In school reservation modal, if class-to-ticket links do not yield issued tickets, fall back to ticket `type` matching (`school`/`daycare`) for class auto-selection and available ticket rendering.
- Rationale: Hoteling modal ticket visibility remains stable without class mapping dependency; school modal previously hid valid tickets when mapping data was missing or stale.
- Implication: School modal ticket list should not show an empty placeholder solely due to class-ticket mapping gaps when same-type issued tickets exist.

## DR-009 (2026-02-03) [reservation][ui][bugfix]
- What: In school reservation modal, `reservation-fee-card__amount` must prioritize selected ticket usage meta (before/after); without selection, it must show a single pricing text value (not before/after), and use `-` only when no fee exists.
- Rationale: School modal was resetting amount to `-` when no ticket was selected, overriding valid pricing output and diverging from hoteling behavior.
- Implication: Amount rendering in school modal should not clear pricing values in non-selected state and should switch markup style based on selection state to match hoteling UI.

## DR-010 (2026-02-03) [reservation][storage][hoteling]
- What: Standardize `reservations[].dates[]` to persist `checkinTime` and `checkoutTime` per date entry for both school/daycare and hoteling reservations.
- Rationale: Time was previously split between top-level fields and hoteling `dates[].time`, which made boundary/middle-day semantics ambiguous and broke consistent reads across list/detail/edit flows.
- Implication: Hoteling stores boundary times only (`checkin` or `checkout`) and keeps non-applicable time fields `null` on middle dates; consumers should read per-date time fields first with legacy fallback only for old data.

## DR-011 (2026-02-03) [hoteling][status]
- What: In hoteling flows, status display labels for check-in/check-out use `입실`/`퇴실`, and status edits apply to all `dates[]` entries of the same reservation.
- Rationale: Hoteling reservations represent one continuous stay; mixed per-date status in one reservation caused inconsistent UX and operational ambiguity.
- Implication: Hoteling status UI should map keys to hoteling-specific labels, and save/update logic must synchronize status across all date entries for a reservation.

## DR-012 (2026-02-03) [reservation][pickdrop][storage][ticket]
- What: Standardize pickdrop reservation data to `dates[].pickup`/`dates[].dropoff` booleans and `dates[].ticketUsages[]`, and standardize member pickdrop availability axes to `oneway`/`roundtrip`.
- Rationale: Detail modal edit/save required per-date pickdrop persistence, and `pickup+dropoff` with 편도 fallback required multiple ticket usages per date that `ticketUsage` single-field could not represent.
- Implication: Reservation create/edit/count flows must write/read `ticketUsages[]`; pickdrop availability math must use `oneway`/`roundtrip` keys instead of legacy `pickdrop`.

## DR-013 (2026-02-04) [ticket][storage][count]
- What: `memberList` 카운트 맵은 티켓 집계 결과를 단일 소스로 사용한다: `totalReservableCountByType = Σ reservableCount`, `remainingCountByType = Σ(totalCount-usedCount)`.
- Rationale: 상태/발급 이벤트에서 멤버 맵을 델타로 직접 갱신하면 `tickets` 기반 수치와 분리되어 불일치가 반복 발생했다.
- Implication: `applyIssueToMembers`/`applyReservationStatusChange`는 멤버 맵 직접 증감하지 않고, 이벤트 후 `recalculateTicketCounts()`로만 동기화한다. `remaining` 계산에는 `reservedCount`를 반영하지 않는다.
