# Project: School Reservation Prototype - Task Roadmap

## Current Focus
- [ ] Verify bidirectional sync result for reservable tickets in tickets/classes/rooms flows and apply follow-up fixes

---

## Backlog
- [ ] Implement school reservation split-by-date on create path (one reservation per date, keep hoteling unchanged, prorate non-ticket payment by date fee)
- [ ] Add focused regression checklist for memberId-only reservation schema in school/hoteling detail flows

## Completed
- [x] 2026-02-24 Showed daycare time inputs in daycare entry modal context and added scheduled time column to the school reservation table.
- [x] 2026-02-24 Adjusted daycare entry reservation modal layout/labels and aligned daycare fee/ticket binding on school home.
- [x] 2026-02-24 Implemented daycare reservation flow on school home with entry menu branch, hourly fee calculation, time validation/conflict checks, and school+daycare list integration.
- [x] 2026-02-24 Gated member ticket count aggregates by reservation payment method (ticket only).
- [x] 2026-02-24 Restricted auto ticket assignment/payment conversion to unpaid reservations only (skip paid>0 reservations).
- [x] 2026-02-24 Fixed auto-assign so touched unpaid reservations also update payment/billing to ticket when service tickets are assigned.
- [x] 2026-02-24 Fixed ticket auto-assign paid detection to fallback to reservation payment when billing totals are stale.
- [x] 2026-02-24 Fixed ticket auto-assign to detect same-type usage only and append service ticket usage when other-type usage exists.
- [x] 2026-02-24 Ensured reservations billing/payment sync after ticket issuance auto-apply for existing reservations.
- [x] 2026-02-24 Auto-converted paid existing reservations to ticket payment when newly issued tickets are auto-applied (school/hoteling).
- [x] 2026-02-24 Synced ticket payment paid/cancel behavior across school and hoteling reservation detail/cancel flows.
- [x] 2026-02-24 Fixed reservation detail modal payment method chips layout with a compact scrollable chip group utility (daycare/hoteling detail).
- [x] 2026-02-24 Enabled settings sidebar group click to activate the first sub item (영업&휴무) on reservation policy and class/room pages.
- [x] 2026-02-24 Wrapped school/hotel reservation policy and class/room settings page main contents with `.main__content`.
- [x] 2026-02-24 Wrapped school/hotel operations page main contents with `.main__content`.
- [x] 2026-02-24 Updated settings operations sidebar group toggle to navigate to the first sub item (영업&휴무) on click.
- [x] 2026-02-20 Blocked past reserved checkin date selection while choosing checkout after selecting checkin in hoteling calendar.
- [x] 2026-02-20 Updated hoteling checkout exception so nearest future reservation checkin date is selectable after selecting checkin.
- [x] 2026-02-20 Extended hoteling calendar selection: nearest past/future checkout dates are selectable while choosing checkout after checkin selection.
- [x] 2026-02-20 Reset hoteling modal checkin/checkout when selected member or selected room changes.
- [x] 2026-02-20 Updated hoteling reservation modal calendar to use member+room intersection and disabled all cells before room selection.
