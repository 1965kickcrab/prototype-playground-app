# Layer Contracts

These are the repo layer rules that the harness checks enforce conservatively.

## Pages
- Own browser entry and page-level orchestration.
- May import from `pages`, `components`, `services`, `storage`, `utils`, `config`.
- Must not own reusable UI rendering or storage internals.

## Components
- Own reusable UI markup, rendering helpers, and shared UI controllers.
- May import from `components`, `services`, `utils`, `config`.
- May import from `storage` only for established shared runtime patterns already present in this repo.
- Must not import from `pages`.
- Should converge on one active mobile implementation per responsibility once runtime authority is verified.

## Services
- Own business rules, calculations, state transforms, and domain synchronization.
- May import from `services`, `storage`, `utils`, `config`.
- Must not import from `pages`, `components`, or `styles`.

## Storage
- Own localStorage reads, writes, normalization, and key-level persistence boundaries.
- May import from `storage`, `services`, `utils`, `config`.
- Must not import from `pages`, `components`, or `styles`.

## Utils
- Own pure helpers and UI-agnostic support code.
- May import from `utils`, `services`, `config`.
- Must not import from `pages`, `components`, `storage`, or `styles`.

## Styles
- Own shared visual tokens, component styles, and shared layout rules.
- JS files must not import from `styles`.
- Prefer replacing duplicated legacy/mobile blocks with one active mobile block instead of stacking more modifiers on top.

## Current Established Component -> Storage Exceptions
These remain allowed because they are already part of shared runtime behavior:
- `src/components/calendar.js`
- `src/components/hoteling-calendar.js`
- `src/components/list.js`
- `src/components/member-ticket-issue-modal.js`
- `src/components/ticket-issue-modal.js`

## Check Philosophy
- Prefer catching clear violations over enforcing ideal purity.
- Do not fail the repo for established patterns that are already part of current runtime behavior.
- Tighten rules only after shared code has been deliberately migrated.
- When migration is underway, favor fewer active branches and clearer mobile ownership over backward-preserving duplication.
