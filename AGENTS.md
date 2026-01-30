# AGENTS.md

## Kindergarten Reservation Prototype

### 1. Project Scope
- Project: Kindergarten Reservation Prototype
- Goal: Build a prototype where reservations, tickets, and policy settings operate in a tightly integrated and consistent flow.
- User: Daycare administrators and managers

### 2. Tech Stack
- Vanilla HTML / CSS / JavaScript
- No frameworks, no external libraries
- Static only (no API, no server)

###  3. File Structure (Must Follow)
my-project/
│
├─ src/                      # 실제 프로토타입 로직
│  │
│  ├─ pages/                 # 페이지 단위 (화면 진입점)
│  │   # HTML + 최소 orchestration
│  │
│  ├─ components/            # 재사용 가능한 UI 조각
│  │   # 버튼, 모달, 바텀시트, 카드 등
│  │
│  ├─ services/              # 비즈니스 규칙 / 정책 / 계산
│  │   # 예약 가능 여부, 기간 계산, 상태 전이
│  │
│  ├─ storage/               # 저장소 경계 (localStorage 등)
│  │   # CRUD, key 관리, 초기 seed
│  │
│  ├─ utils/                 # 순수 유틸 함수
│  │   # date, format, dom helper
│  │
│  └─ config/                # 프로토타입 설정값
│      # mock flag, 상수, feature toggle
│
├─ public/                   # 바로 열어보는 정적 리소스
│  │
│  ├─ index.html             # 진입 HTML
│  └─ favicon.ico
│
├─ assets/                   # 이미지, 아이콘, 폰트
│
├─ styles/                   # 스타일
│  │
│  ├─ base.css               # reset / token / typography
│  ├─ components.css         # 공용 컴포넌트 스타일
│  └─ pages.css              # 페이지 전용 스타일
│
├─ .env                      # (선택) 환경값
│
└─ HISTORY.md                # 작업 로그 기록
- HTML, CSS, and JavaScript MUST be strictly separated. No inline `<script>` or `<style>` is allowed.
- Page files MUST contain only UI wiring and event binding.
- Business logic, calculations, and data handling MUST be implemented as reusable modules.
- Any logic referenced by two or more pages MUST be promoted to a shared module.

### 4. Code Rules (Critical)
- No global variables
- Single responsibility per function
- Event delegation preferred
- Reuse existing class names
- UTF-8 encoding mandatory
- Do not change Korean UI text arbitrarily

### 5. Design Rules
- Layout must follow provided reference image
- Fixed sidebar / top CTA / calendar / bottom list
- Use CSS variables for colors & spacing
- No inline styles

### 6. State & Data
- `localStorage` is the single source of truth.
- ALWAYS reuse existing stored data before creating new schemas or keys.
- Any key used by more than one feature or flow MUST use a single, consistent name across the project.
- DO NOT create dummy/mock data or `*-data.js` files unless explicitly requested.
- If data is missing, render an empty state; do not invent temporary datasets.
- All data access must go through storage logic, not directly from pages or components.

### 7. Date & Time
- Timezone must be handled explicitly and be configurable per environment.
- Default behavior: If no timezone is specified, assume **Asia/Seoul (UTC+9)**.

### 8. Agent Behavior Rules (Must Obey)
- No features not explicitly requested
- No speculative refactors
- No new libraries

### 9. History System (Agent-Optimized)
- The agent-loaded history file is `history/HISTORY.md` ONLY. Keep it short (≤200 lines).
- Do NOT append detailed logs to `history/HISTORY.md`. Put details in `history/archive/YYYY-MM.md`.
- All stable rules/policies/“why” decisions must be recorded in `history/DECISIONS.md` using `DR-###` format:
  - What / Rationale / Implication
- When editing history docs:
  - Never invent entries; derive from actual changes only.
  - Preserve original dates in archives.
  - Use consistent tags: [reservation] [ticket] [hoteling] [pickdrop] [settings] [storage] [ui] [bugfix]
- Prefer referencing archives by link/pointer instead of copying content into HISTORY.md.