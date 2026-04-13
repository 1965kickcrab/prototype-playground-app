# Harness Docs

This directory is the repo navigation layer for agents and contributors.

Start here when you need the current operating map instead of product behavior detail.

## Read Order
1. [Repo Map](./repo-map.md)
2. [Layer Contracts](./layer-contracts.md)
3. [Change Workflow](./change-workflow.md)
4. [UI Contract Safety Checklist](./checklists/ui-contract-safety.md)
5. [Decision Registry](../history/DECISIONS.md)

## Purpose
- Show the real runtime entrypoints and authoritative paths.
- Lock layer boundaries into short, checkable rules.
- Keep change workflow predictable for Level 1/2/3 work.
- Make high-risk UI contract checks explicit before edits.
- Keep the repo aligned to one mobile runtime surface instead of preserving unused desktop or legacy branches.

## Authority Order
1. `AGENTS.md`
2. `docs/layer-contracts.md` and `docs/repo-map.md`
3. `TODO.md`
4. `history/HISTORY.md`
5. feature-local code comments

## Notes
- `AGENTS.md` remains the hard policy file.
- These docs are the canonical navigation layer under that policy.
- `scripts/harness/run-all.mjs` is the matching verification entrypoint.
- When a verified runtime path is mobile-only, these docs should bias changes toward consolidation and dead-code removal rather than additive compatibility wrappers.
