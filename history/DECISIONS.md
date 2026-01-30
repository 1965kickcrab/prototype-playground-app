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
