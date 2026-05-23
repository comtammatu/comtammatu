# Task And Regression Cleanup — 2026-05-23

## Scope

First cleanup pass for top-level `tasks/` and `tasks/regressions.md`.

This is a docs-only cleanup. No implementation rules were removed.

## Before

- `tasks/` had 8 top-level Markdown files / 1731 lines.
- Dated QA reports and UI audit snapshots lived beside active trackers.
- `tasks/regressions.md` had 193 named rules and several stale references to moved task docs.

## Done

- Kept top-level `tasks/` for active files only:
  - `tasks/todo.md`
  - `tasks/regressions.md`
  - `tasks/lessons.md`
  - `tasks/README.md`
- Moved closed dated task packs to `docs/archive/worklog/tasks/`:
  - Inventory QA E2E plan/report
  - POS QA pass 1 / owner decisions
  - UI audit 2026-05
- Added archive banners to the moved task packs.
- Updated live regression references from the old top-level POS owner-decision doc path to `docs/archive/worklog/tasks/owner-decisions-pos-pass-1.md`.
- Added `docs/archive/worklog/tasks/README.md` and mapped it from `docs/agent/rules/references.md`.

## Regression Audit Notes

- `tasks/regressions.md` currently has 193 named rules.
- MISA references in `tasks/regressions.md`: 3.
  - One is an active ban rule: `HDDT-SINVOICE-ONLY-RUNTIME`.
  - The remaining references point to historical archive context and can stay until the HĐĐT archive docs are split further.
- Superseded references: 1.
  - `POS-CLOSE-SHIFT-PAID-FILTER-AND-VARIANCE-GATE` is superseded in parts by later cash-only/no-block close-shift rules. Do not delete yet; compact only after confirming tests cover the later contract.
- `docs/plan/` references in `tasks/regressions.md`: 1.
  - `docs/plan/adr/0005-owner-identity-dual-source.md` is still active, so no action needed in this pass.

## Next Cleanup Queue

1. Normalize `tasks/todo.md` to active-only status language; move historical branch notes to archive/worklog.
2. Add a generated or manual index for `tasks/regressions.md` by domain (`UI`, `POS`, `Inventory`, `HĐĐT`, `Auth/RLS`, `Infra`) before attempting any compaction.
3. Review superseded POS close-shift rules after checking current tests for cash-only expected cash and no-block variance alert.
4. Split historical HĐĐT MISA archive references from active Viettel S-invoice guidance.
5. Add a markdown link checker that ignores historical `docs/archive/**` unless explicitly requested.
