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
