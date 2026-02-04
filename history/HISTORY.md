# HISTORY.md

Agent index. Keep this file short and always loaded.

## Current Snapshot
- [reservation][storage] Reservation list renders from localStorage with status updates synced by reservation ID (DR-001).
- [reservation] Calendar-driven date selection uses local YYYY-MM-DD formatting to avoid day offsets (DR-002).
- [reservation][pickdrop] Pickdrop selection and status changes are integrated into reservation flows and counts (see 2026-01 archive).
- [ticket] Ticket issue/selection flows use per-service availability and overage handling (DR-005).
- [ticket][reservation][bugfix] Issued tickets auto-link to previously unassigned reservation dates using normalized member matching and reservation type matching.
- [reservation][ticket][bugfix] Reservation modal now renders ticket rows by selected class type (`school`/`daycare`) instead of hardcoded school-only filtering.
- [reservation][bugfix] Reservation list detail/status/cancel flows now resolve school reservations via a shared helper to avoid scope-based ReferenceError.
- [reservation][ticket][bugfix] School reservation modal now falls back to ticket type matching when class-ticket links are missing, aligned with hoteling modal ticket visibility behavior.
- [reservation][pickdrop][storage][ticket] Reservation date entries now persist `pickup`/`dropoff` flags and `ticketUsages[]`; member pickdrop availability uses `oneway`/`roundtrip` axes (DR-012).
- [ticket][storage][count] Member count map synchronization is now ticket-aggregation-driven (`total=Σreservable`, `remaining=Σ(total-used)`) with no direct delta mutation (DR-013).
- [reservation][ui][bugfix] School reservation modal amount display now follows hoteling precedence: selected ticket meta first, otherwise fee amount, and empty only when no fee exists.
- [reservation][ui][bugfix] School reservation modal amount now uses single fee text in non-selected state (not before/after), matching hoteling UI.
- [reservation][ticket][ui][bugfix] Negative availability numbers in reservation count limit and ticket issue availability now render as `초과` text with red emphasis.
- [reservation][ticket][ui][bugfix] Ticket issue overage display now keeps availability unit (`회`/`박`) visible with `초과` values.
- [reservation][ticket][ui][bugfix] Ticket issue overage display now renders value+unit without spacing as `초과 N회/박`.
- [hoteling] Hoteling reservations use per-date entries, per-date ticket usage, and calendar counts (DR-006).
- [reservation][storage][hoteling] `reservations[].dates[]` now stores `checkinTime`/`checkoutTime` explicitly; hoteling keeps non-boundary dates as `null` (DR-010).
- [hoteling][ui][bugfix] Hoteling detail modal status now resolves from the selected date/kind entry instead of missing top-level status.
- [hoteling][ui] Hoteling detail modal now supports status change via status badge click + option menu, persisted to the target date entry on save.
- [hoteling][ui][storage] Hoteling status labels use `입실`/`퇴실` for check-in/out, and status change in detail modal now syncs all dates in the same reservation.
- [reservation][storage][bugfix] School list status menu now persists date-entry status changes through storage update flow immediately.
- [ui][routing] Page entrypoint dependency audit confirms `hotels.js`, `main.js`, `pricing.js`, `reservation.js`, `ticket-page.js`, and `tickets.js` are all in active use.
- [ui][routing] Ticket page entry is now simplified: `tickets.html` directly loads `ticket-page.js` and the `tickets.js` wrapper is removed.
- [settings][ui] School class/hotel room register+detail modals now use stacked `settings-modal-form` instead of shared `form-grid`.
- [settings][ui] School class register/detail basic tab now places `반 이름` and `담당` fields side-by-side via `class-form__inline-fields`.
- [settings][ui] School class register/detail `운영 요일` now stacks chips and holiday checkbox vertically via `class-form__weekday-stack`.
- [settings][ui] School class register/detail `소속 회원` now groups actions and member list in a vertical stack via `class-member-stack`.
- [settings][ui] School class register/detail `예약 가능한 이용권` now groups actions and ticket list in a vertical stack via `class-ticket-stack`.
- [settings][ui] School class register/detail member/ticket sections now use left-right header rows (`form-field__label--row` + actions) with lists rendered beneath.
- [settings][ui] Hotel room register/detail ticket section now matches the same header-row (`form-field__label--row` + actions) with list-below layout.
- [settings][ui] Class/room register+detail modals now share common selection-area style classes (`settings-selection-*`) to remove duplicated member/ticket layout styling.
- [settings][ui] Class member/ticket option cards now share a common style block (`settings-selection-item`) while preserving per-row layout differences.
- [settings][ui] Ticket detail `예약 가능한 클래스/호실` rows now reuse `settings-selection-item` for clear row borders and selected-state emphasis.
- [settings][ui] Class/room register+detail `예약 가능한 이용권` lists now filter ticket rows by current class/room `type`.
- [settings][storage] Ticket save now synchronizes both school class storage and hotel room storage so ticket-class links remain bidirectionally consistent.
- [settings][bugfix] Class/room settings member profile image path now uses `/assets/defaultProfile.svg` to avoid `/src/assets` 404.
- [settings] Class/room/operations settings drive filters and defaults, with storage normalization (see 2025-12 and 2026-01 archives).
- [reservation][ticket] Reservation cancellations restore ticket usage across daycare/hoteling/pickdrop (DR-007).

## Recent Index (last 14 days)
- 2026-02-04 [hoteling][ui][cleanup] Removed duplicate `src/services/hotels.js` and kept `src/pages/hotels.js` as the single hoteling page entry controller.
- 2026-02-04 [reservation][storage][cleanup] Removed `reservation_migration_complete_v1` path by deleting `migrateToUnifiedReservations` startup calls and legacy reservation key migration references.
- 2026-02-04 [ticket][storage][count][bugfix] Fixed `totalReservableCountByType` drift by removing direct member-map delta updates and enforcing ticket-count recalculation as the single source (`remaining` excludes `reservedCount`).
- 2026-02-03 [reservation][pickdrop][storage][ticket][hoteling][bugfix] Standardized reservation pickdrop/ticket usage schema to `pickup`/`dropoff` + `ticketUsages[]`, moved member pickdrop counters to `oneway`/`roundtrip`, and wired school/hoteling detail modal pickdrop save to persist date entries.
- 2026-02-03 [hoteling][ui] Hoteling detail modal `상품 정보`의 `픽드랍 여부` 표시를 텍스트에서 유치원과 동일한 `filter-chip`(픽업/드랍) 레이아웃으로 변경하고 예약 데이터 기준 선택 상태를 반영.
- 2026-02-03 [hoteling][ui] Hoteling reservation detail modal `상품 정보` tab now includes a bottom inline full-width field for `픽드랍 여부`, rendered from reservation pickdrop flags (`dates[].pickdrop` / `hasPickup` / `hasDropoff`).
- 2026-02-03 [ticket][reservation][routing][bugfix] Ticket issue modal `예약까지 진행` now routes by ticket type: `hoteling` opens hoteling reservation modal on `hotels.html`, other types open school reservation modal on `index.html`; selected member is applied from query on both pages.
- 2026-02-03 [ticket][ui][bugfix] Ticket issue modal `예약 가능` column now updates `ticket-issue-table__availability-value` to the live after value when selection (default quantity 1) or quantity changes.
- 2026-02-03 [reservation][ui][ticket][bugfix] In school reservation modal, fee card amount now shows `before = totalReservableCountByType` and `after = sum of selected ticket after values` when tickets are selected.
- 2026-02-03 [reservation][ticket][bugfix] School reservation modal availability/auto-weekday fallback now uses per-issued ticket `remainingCount` instead of re-allocating from class-level used counts, fixing unselectable second issued ticket and missing auto date selection.
- 2026-02-03 [reservation][ticket][bugfix] School reservation default ticket selection now includes all issued option ids for linked ticket templates, so duplicated issued tickets (distinct ids) remain selectable and weekday auto-selection works consistently.
- 2026-02-03 [ticket][storage][bugfix] Ticket issue modal now saves quantity N as N separate issued ticket records (distinct ids) instead of one aggregated record.
- 2026-02-03 [reservation][ticket][ui][bugfix] Reservation register modals now hide ticket rows with `reservableCount` 0 in `reservation-ticket-list` (only reservable tickets are shown).
- 2026-02-03 [reservation][hoteling][ticket][ui][bugfix] Reservation register modals now show ticket row `before` as per-ticket `reservableCount` and `after` as selection-order deduction; fee card total display remains based on `totalReservableCountByType`.
- 2026-02-03 [settings][storage] Ticket create/edit/delete now syncs class and room ticket links together, keeping class/room modal selections aligned with ticket modal selections.
- 2026-02-03 [settings][ui] Class/room register+detail `예약 가능한 이용권` now shows only tickets matching the current class/room `type`.
- 2026-02-03 [settings][ui] Ticket detail `예약 가능한 클래스/호실` rows now use bordered card rows and checked-state text emphasis via shared `settings-selection-item`.
- 2026-02-03 [settings][ui] Class member/ticket option cards now share `settings-selection-item` for common card + selected-state styling.
- 2026-02-03 [settings][ui] Class/room register+detail modals now share common selection-area style classes (`settings-selection-*`) for member/ticket section layout.
- 2026-02-03 [settings][ui] In hotel room register/detail modals, `예약 가능한 이용권` now uses horizontal header row (label+actions) with the ticket list below.
- 2026-02-03 [settings][ui] In school class register/detail modals, `소속 회원` and `예약 가능한 이용권` now use horizontal header rows (label+actions) above their lists.
- 2026-02-03 [settings][ui] In school class register/detail modals, `예약 가능한 이용권` now stacks `class-ticket-actions` above `class-ticket-list`.
- 2026-02-03 [settings][bugfix] Fixed class settings member avatar 404 by changing image src to `/assets/defaultProfile.svg`.
- 2026-02-03 [settings][ui] In school class register/detail modals, `소속 회원` now stacks `class-member-actions` above `class-member-list`.
- 2026-02-03 [settings][ui] In school class register/detail modals, `운영 요일` field now stacks chips above the `공휴일 휴무` checkbox.
- 2026-02-03 [settings][ui] In school class register/detail modals, `반 이름` and `담당` fields are grouped into a left-right inline layout (mobile: 1 column).
- 2026-02-03 [settings][ui] Removed `form-grid` from class/room register/detail modals and switched to stacked `settings-modal-form`.
- 2026-02-03 [ui][routing] Merged ticket entry wrapper into page module: `tickets.html -> ticket-page.js`; deleted `src/pages/tickets.js`.
- 2026-02-03 [ui][routing] Verified active script wiring: `public/index.html -> main.js`, `hotels.html -> hotels.js`, `pricing*.html -> pricing.js`, `tickets.html -> tickets.js -> ticket-page.js`, and `reservation.js` imported by main/hotels.
- 2026-02-03 [reservation][ticket][ui][bugfix] Ticket issue overage display now shows 붙임형 unit text (`초과 N회/박`) by removing value/unit gap in overage state.
- 2026-02-03 [reservation][ticket][ui][bugfix] In ticket issue modal, overage display (`초과 N`) now keeps the availability unit (`회`/`박`) visible.
- 2026-02-03 [reservation][ticket][ui][bugfix] Reservation modal count limit and ticket issue availability now show negative values as `초과` instead of minus notation, with red emphasis.
- 2026-02-03 [reservation][ui][bugfix] School reservation modal now clones selected ticket meta for amount and falls back to single fee text (`-` when empty) when no ticket is selected.
- 2026-02-03 [reservation][storage][hoteling] Added per-date `checkinTime`/`checkoutTime` normalization to unified reservations; hoteling middle dates are stored as `null` and hoteling list/detail now reads the per-date time fields first.
- 2026-02-03 [hoteling][ui][bugfix] Fixed hoteling detail modal status badge to display resolved entry status (for selected date/kind) instead of `-`.
- 2026-02-03 [hoteling][ui] Added status option menu to hoteling detail modal (triggered by status badge) and persisted selected status to `dates` on save.
- 2026-02-03 [hoteling][ui][storage] Updated hoteling check-in/out status labels to `입실`/`퇴실` and made detail status save synchronize all date entries in the reservation.
- 2026-02-03 [reservation][storage][bugfix] School list status change now updates reservation date entry via `storage.updateReservation` for immediate persistence.
- 2026-02-03 [reservation][ui][bugfix] Fixed school reservation fee card amount overwrite so non-selected state keeps pricing output (empty only when no price).
- 2026-02-03 [reservation][ticket][bugfix] Compared hoteling vs school modal ticket flows and added type-based fallback for class mapping misses, plus member class auto-selection fallback by ticket type.
- 2026-02-03 [reservation][bugfix] Fixed `list.js` runtime error by moving school reservation resolution to a shared helper used by detail/status/cancel handlers.
- 2026-02-03 [reservation][ticket][bugfix] Fixed reservation modal ticket placeholder issue by applying selected class type filter when rendering available tickets.
- 2026-02-03 [ticket][reservation][bugfix] Ticket issue now backfills `ticketUsage` on matching unassigned reservation dates and re-syncs ticket counts. See working tree change in `src/services/ticket-auto-assign.js`.
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
