# Repo Map

High-signal map of the runtime entrypoints, shared modules, and known duplication risks.

## Core Layout
- `public/`: browser-openable entry HTML
- `src/pages/`: page entrypoints and orchestration only
- `src/components/`: reusable UI rendering and UI controllers
- `src/services/`: reusable rules, calculations, and state transforms
- `src/storage/`: all localStorage access and storage-adjacent normalization
- `src/utils/`: pure helpers and UI-agnostic utilities
- `styles/`: shared styling only

## Mobile Runtime Policy
- Treat verified mobile entrypoints as the primary product surface.
- Do not preserve duplicate desktop-only structure by default once the real mobile path is confirmed.
- If a shared component still carries both legacy and mobile branches, prefer consolidating onto the active mobile path instead of adding a third branch.

## Authoritative Runtime Paths
These are the high-risk surfaces where agents must verify the real usage path before editing.

### School Reservation Create
- Entrypoint: `src/pages/school-reservation-create.html`
- Page controller: `src/pages/school-reservation-create.js`
- Shared page wiring: `src/pages/reservation-create-page-shared.js`
- Shared reservation controller: `src/pages/reservation.js`
- Shared UI source of truth: `src/components/reservation-modal.js`
- Duplicate candidate: `public/index.html` also contains reservation modal markup
- Authority decision: the dedicated create page uses the generated component path, not the static home modal, and no longer supports `reservationId`-driven edit entry

### Dedicated Pickdrop Create
- Entrypoint: `src/pages/school-pickdrop-create.html`
- Page controller: `src/pages/school-pickdrop-create.js`
- Shared page wiring: `src/pages/reservation-create-page-shared.js`
- Shared reservation controller: `src/pages/reservation.js`
- Shared UI source of truth: `src/components/reservation-modal.js`
- Duplicate candidate: `public/index.html` reservation modal markup
- Authority decision: the dedicated pickdrop page also uses the generated component path

### Home Reservation Entry
- Entrypoint: `public/index.html`
- Page controller: `src/pages/main.js`
- Shared controller: `src/pages/reservation.js`
- Shared UI source of truth: the static modal in `public/index.html` for home usage
- Duplicate candidate: `src/components/reservation-modal.js`
- Authority decision: home still owns a static reservation modal path; do not assume the generated create-page markup is active here

### School Reservation Detail
- Entrypoint: `src/pages/school-detail.html`
- Page controller: `src/pages/school-detail.js`
- Shared UI source of truth: `src/components/reservation-detail-page.js`
- Shared detail helpers: `src/pages/reservation-detail-page-shared.js`
- Authority decision: the school list routes detail into the dedicated page; the old home detail modal path was removed

### School Attendance Sheet
- Entrypoint: `src/pages/attendance.html`
- Page controller: `src/pages/attendance-page.js`
- Shared status logic: `src/services/attendance-status-service.js`
- Source entry: `public/index.html` routes the selected school date into this page with `dateKey`
- Authority decision: the attendance page is the dedicated mobile day view for school/daycare attendance status updates; it reuses the reservation storage path instead of creating a separate attendance store

### Hoteling Reservation Entry
- Entrypoint: `src/pages/hotels.html`
- Page controller: `src/pages/hotels.js`
- Shared UI helpers: `src/components/hoteling-list.js`, `src/components/hoteling-calendar.js`
- Duplicate candidate: older hoteling create-modal selectors may still exist in shared helpers/styles
- Authority decision: `hotels.html` is now the mobile hoteling schedule/list entry only; reservation create no longer opens here

### Hoteling Reservation Create
- Entrypoint: `src/pages/hotel-reservation-create.html`
- Page controller: `src/pages/hotel-reservation-create.js`
- Shared page wiring: `src/pages/hotel-reservation-create-page-shared.js`
- Shared UI source of truth: `src/components/reservation-modal.js`, `src/components/hoteling-reservation-modal.js`
- Duplicate candidate: the generated hoteling reservation form still reuses the shared modal-shell component path in page mode
- Authority decision: hoteling create work should follow the dedicated page path, not `hotels.html`, and no longer supports `reservationId`-driven edit entry

### Hoteling Reservation Detail
- Entrypoint: `src/pages/hotel-detail.html`
- Page controller: `src/pages/hotel-detail.js`
- Shared UI source of truth: `src/components/reservation-detail-page.js`
- Shared detail helpers: `src/pages/reservation-detail-page-shared.js`
- Authority decision: hotel detail now follows the same shared mobile detail page shell used by school detail; the old hoteling detail modal branch was removed from `hotels.html`

### Member Search Page
- Entrypoint: `src/pages/member-search.html`
- Page controller: `src/pages/member-search-page.js`
- Shared consumer: `src/pages/reservation-create-page-shared.js`
- Shared business logic: `src/services/member-page-service.js`
- Duplicate candidate: inline member search UIs also exist inside reservation and hoteling flows
- Authority decision: dedicated member search page is authoritative for the mobile reservation-create selection flow

### Member Ticket Usage Detail
- Entrypoint: `src/pages/member-ticket-usage.html`
- Page controller: `src/pages/member-ticket-usage-page.js`
- Shared business logic: `src/services/member-ticket-usage-detail-service.js`
- Source entry: member detail ticket cards route here with `memberId` and issued `ticketId`
- Authority decision: member issued-ticket usage detail is a dedicated mobile page; the old member ticket detail modal path is not active

### Center Settings
- Entrypoint: `src/pages/settings/center.html`
- Page controller: `src/pages/settings/center-settings-page.js`
- Form/detail controller: `src/pages/settings/center-settings-form-page.js`
- Storage: `src/storage/class-storage.js`, `src/storage/hotel-room-storage.js`, `src/storage/pricing-storage.js`
- Source entry: `src/pages/more.html` routes the `센터 설정` shortcut here
- Duplicate candidate: `src/pages/settings/school/class.html` and `src/pages/settings/hotel/room.html` still contain the legacy sidebar/table/modal settings path
- Authority decision: class and room settings now use the mobile center settings list, dedicated create page, and an always-editable existing-item page at `center-settings-detail.html`; legacy school class and hotel room pages remain directly reachable only for old links

### Ticket Create
- Entrypoint: `src/pages/ticket-create.html`
- Page controller: `src/pages/ticket-create-page.js`
- Shared form logic: `src/components/ticket-form.js`
- Storage: `src/storage/ticket-storage.js`
- Source entry: `src/pages/tickets.html` routes the `이용권 등록` action here
- Authority decision: ticket creation is a dedicated mobile page; the old create modal in `tickets.html` is not active

### Ticket List
- Entrypoint: `src/pages/tickets.html`
- Page controller: `src/pages/ticket-page.js`
- Shared row renderer: `src/components/ticket-view.js`
- Storage: `src/storage/ticket-storage.js`
- Source entry: ticket cards route to `src/pages/ticket-detail.html` with `ticketId`
- Authority decision: ticket list is a dedicated mobile card list; the old table, pagination, tabs, ticket-list issue modal path, and ticket detail edit modal path are not active

### Ticket Detail
- Entrypoint: `src/pages/ticket-detail.html`
- Page controller: `src/pages/ticket-detail-page.js`
- Shared issue modal: `src/components/ticket-issue-modal.js`
- Shared form logic: `src/components/ticket-form.js`
- Shared issue logic: `src/services/ticket-issue-service.js`, `src/services/ticket-issue-entry-service.js`
- Storage: `src/storage/ticket-storage.js`
- Source entry: `src/pages/tickets.html` routes ticket row selection here with `ticketId`
- Authority decision: ticket detail is a dedicated mobile page; the old edit modal and ticket-list issue modal in `tickets.html` are not active

## Worked Example: Reservation Create
If the user requests a change to the school or dedicated pickdrop create flow:
1. Check whether the request targets home modal behavior or dedicated create-page behavior.
2. If it targets dedicated create pages, follow:
   `school-reservation-create.html` or `school-pickdrop-create.html`
   -> page JS
   -> `reservation-create-page-shared.js`
   -> `reservation.js`
   -> `reservation-modal.js`
3. Only touch `public/index.html` if the request explicitly targets the home reservation entry path.

## Guardrails
- Never assume `*-modal.js` is active without checking the entrypoint path.
- When static HTML and generated component markup overlap, record which one is authoritative before editing.
- Prefer shared source-of-truth modules when both paths are active for different screens.
- If only one branch is still active in mobile runtime, prefer removing or collapsing the inactive branch rather than extending both.
