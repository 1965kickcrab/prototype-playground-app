# Change Workflow

Use this as the short operating workflow for repo changes.

## Step Order
1. Identify the real runtime entrypoint.
2. Verify whether static HTML and shared component markup overlap.
3. Classify the task level.
4. Update `TODO.md` if the level requires it.
5. Decide whether the change should consolidate or delete an inactive legacy branch instead of adding another layer.
6. Edit only the authoritative path.
7. Remove or merge dead mobile/desktop duplicates when safe for the verified runtime path.
8. Update `history/HISTORY.md` when behavior or agent-safety rules changed.
9. Run `node scripts/harness/run-all.mjs`.

## Level Rules
### Level 1
- Single-file micro fix
- No shared state or cross-page impact
- `TODO.md` not required

### Level 2
- 2-3 related files
- Event or condition flow changes
- No storage schema change
- Add a short task entry in `TODO.md`
- Mobile-only cleanup that removes an inactive duplicate path can still stay Level 2 if the runtime authority is already clear and no shared storage contract changes

### Level 3
- Shared component/service responsibility change
- Cross-page impact
- Storage or shared selector contract changes
- Add exactly one active structural task in `TODO.md`
- Record behavior-impacting results in `history/HISTORY.md`
- Add a stable rule to `history/DECISIONS.md` when the change sets a lasting repo policy
- Additive mobile wrappers over already-inactive legacy branches should be treated as a policy failure; prefer consolidation planning instead

## When To Verify Duplication
- Any UI change touching reservation, hoteling, or shared modal flows
- Any request that mentions a component by name
- Any case where both static HTML and generated markup exist for similar UI
- Any change that appears to add a second mobile-specific layer on top of an older shared structure

## Required Control Files
- `AGENTS.md`: hard policy
- `docs/repo-map.md`: runtime authority map
- `docs/layer-contracts.md`: layer rules
- `TODO.md`: active work ledger
- `history/HISTORY.md`: short historical index
