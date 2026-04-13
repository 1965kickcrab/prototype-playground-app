# UI Contract Safety Checklist

Run this checklist before editing shared UI behavior.

- Confirm the active entrypoint page or HTML file.
- Check whether the same UI responsibility exists in static HTML and shared component markup.
- Identify the authoritative path before editing.
- Preserve existing `data-*` hooks unless the request explicitly changes the contract.
- Preserve storage keys unless the request explicitly changes schema.
- Prefer fixing the shared selector first instead of adding a new page-scoped override.
- Confirm whether the verified runtime path is mobile-only before preserving any legacy desktop structure.
- If one branch is inactive, prefer collapsing or removing it instead of adding another wrapper or modifier layer.
- Re-check page-specific visibility logic when one shared button or section is reused across multiple flows.
- If the change affects multiple pages through one shared component, treat it as Level 3.
- After edits, run `node scripts/harness/run-all.mjs`.
