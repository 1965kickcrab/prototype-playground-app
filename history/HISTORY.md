# HISTORY.md

Agent index. Keep this file short and always loaded.

## Current Snapshot
- [reservation][storage] Reservation list renders from localStorage with status updates synced by reservation ID (DR-001).
- [reservation] Calendar-driven date selection uses local YYYY-MM-DD formatting to avoid day offsets (DR-002).
- [reservation][pickdrop] Pickdrop selection and status changes are integrated into reservation flows and counts (see 2026-01 archive).
- [ticket] Ticket issue/selection flows use per-service availability and overage handling (DR-005).
- [hoteling] Hoteling reservations use per-date entries, per-date ticket usage, and calendar counts (DR-006).
- [settings] Class/room/operations settings drive filters and defaults, with storage normalization (see 2025-12 and 2026-01 archives).
- [reservation][ticket] Reservation cancellations restore ticket usage across daycare/hoteling/pickdrop (DR-007).

## Recent Index (last 14 days)
- 2026-01-29 [reservation][ticket][hoteling][pickdrop] Cancellation restores ticket usage; hoteling memo edits and pickdrop ticket sync. See history/archive/2026-01.md.
- 2026-01-28 [reservation][hoteling][pickdrop][ticket][bugfix] Hoteling modal/pickdrop integrations, fee rules, and hoteling page bugfixes. See history/archive/2026-01.md.
- 2026-01-27 [hoteling][reservation][storage][ui] Hoteling page build-out, modal flow, storage normalization, and ticket integrations. See history/archive/2026-01.md.
- 2026-01-26 [ticket][pickdrop][ui] Ticket form/layout changes and pickdrop ticket selection updates. See history/archive/2026-01.md.
- 2026-01-25 [reservation][ticket][settings][bugfix] Status/availability logic changes, UTF-8 fixes, and reservation issue flow updates. See history/archive/2026-01.md.

## System Map
- [storage] localStorage holds reservations, class list, hotel rooms, tickets, and operations/day-off settings.
- [reservation] Reservation UI: calendar/list, reservation modal, and detail/memo flows (see 2025-12/2026-01 archives).
- [hoteling] Hoteling UI: calendar, list, reservation/detail modals with pickdrop step (see 2026-01 archive).
- [settings] Settings UI: classes, rooms, and operations schedule/day-off calendar (see 2025-12/2026-01 archives).

## Archive Pointer
- history/archive/2025-12.md
- history/archive/2026-01.md
- history/DECISIONS.md
