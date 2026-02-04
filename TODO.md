# Project: School Reservation Prototype - Task Roadmap

## Current Focus
- [ ] 이용권/반/호실 `예약 가능한 이용권` 양방향 연동 결과 확인 및 후속 수정 대응

---

## Active Tasks (Next Prompt Priority)
- [ ] 이용권/반/호실 `예약 가능한 이용권` 양방향 연동 결과 확인 및 후속 수정 대응

## Backlog
- [ ] 

## Completed
- [x] 2026-02-04 호텔링 페이지 컨트롤러를 `src/pages/hotels.js`로 단일화하고 중복 파일 `src/services/hotels.js`를 제거했으며 관련 참조 경로를 점검.
- [x] 2026-02-04 호텔링 취소 처리 시 `dates[].baseStatusKey/statusText/status`를 `CANCELED`로 동기화해 `recalculateTicketCounts()` 기준과 일치시켰고, `usedCount` 집계 규칙(`CHECKIN/CHECKOUT/ABSENT/NO_SHOW`) 유지 의도를 주석으로 명시.
- [x] 2026-02-04 `reservation_migration_complete_v1` 기반 예약 마이그레이션 로직 제거(`migrateToUnifiedReservations` 호출/구버전 key 참조 삭제).
- [x] 2026-02-04 `totalReservableCountByType`/`remainingCountByType` 계산 규칙을 티켓 집계 단일 소스로 고정(`total=Σreservable`, `remaining=Σ(total-used)`)하고 상태/발급 델타 직접 반영 로직 제거.
- [x] 2026-02-03 유치원/호텔링 예약 상세 모달 픽드랍 저장 로직을 `pickup`/`dropoff` 기반으로 반영하고, 예약/카운트 스키마를 `ticketUsages[]` + `oneway`/`roundtrip` 기준으로 전역 전환.
