# Lint Baseline (NO-VERSION-SUFFIXES + SAME-PR-DOC-SYNC)

**Created:** 2026-05-07 | **Branch:** `rebuild/tier1-port-matu-baseline`

Two CI scripts ported from matu-superapp at this date:

- `scripts/check-no-version-suffixes.mjs` (rule: `NO-VERSION-SUFFIXES`)
- `scripts/check-doc-cross-references.mjs` (rule: `SAME-PR-DOC-SYNC`)

The repo carries pre-existing tech debt that fires both rules. This doc records the baseline so future PRs can be checked against it (new violations beyond baseline = block; existing baseline items = scheduled cleanup).

Until baseline is cleaned, the two scripts are NOT in the default `pnpm lint` chain. Run `pnpm lint:rebuild-strict` to see live state. CI may run them as warning-only.

Once baseline reaches zero, promote both to `pnpm lint` (matu-superapp parity).

---

## NO-VERSION-SUFFIXES baseline (13 items)

### Path violations (4)

| # | Path | Cleanup wave | Notes |
|---|---|---|---|
| 1 | `scripts/check-v2-imports.mjs` | W0' | Predecessor of `check-no-version-suffixes.mjs`; rename to `check-legacy-imports.mjs` or retire |
| 2 | `scripts/qa/auth_v2_e2e_full.py` | W1 | Auth QA harness; rename to drop `v2` after Auth W1 baseline ships |
| 3 | `scripts/qa/auth_v2_rls_matrix.py` | W1 | Same — Auth W1 |
| 4 | `docs/worklog/inventory/inventory-pilot-contract-v2.md` | W3 | Worklog historical; either move to `docs/archive/` or rename |

### Identifier violations (9)

| # | File:line | Identifier | Cleanup wave | Notes |
|---|---|---|---|---|
| 1-4 | `scripts/enable-inventory-pilot-flags.sql:17,18,24,25` | `inv_s12_dashboard_v2`, `inv_s13a_stocktake_v2` | W3 | Inventory feature flag names. Rename when retiring v1 dashboard/stocktake or after Inventory W3 ships |
| 5-6 | `apps/web/app/inventory/_lib/feature-flags.ts:11,12` | `S12_DASHBOARD_V2`, `S13A_STOCKTAKE_V2` | W3 | TS constants; rename together with #1-4 in single codemod PR |
| 7 | `apps/web/app/inventory/stocktake/new/page.tsx:44` | `S13A_STOCKTAKE_V2` | W3 | Caller of #5-6 |
| 8 | `apps/web/app/inventory/stocktake/[id]/count/page.tsx:45` | `S13A_STOCKTAKE_V2` | W3 | Same |

---

## SAME-PR-DOC-SYNC baseline (188 items, summary)

Categories:

1. **Archived plan doc references** (~20 hits) — `tasks/todo.md` references `docs/plan/inventory-v2-rebuild.md`, `docs/plan/inventory-location-ledger*.md`, `docs/plan/m4-payments-fix.md`, `docs/plan/platform-fork-2026.md` (all moved to `docs/archive/plan/` per B20). **Cleanup wave:** W0' (update tasks/todo.md to reflect archive moves)

2. **Relative path issues in plan docs** (~15 hits) — `docs/plan/system-rebuild/05-MODULE-CATALOG.md:912` and `06-WAVE-PLAN.md:808` reference `adr/0001-auth-migration.md` etc. without `docs/plan/` prefix. **Cleanup wave:** W0' (1 PR fix paths to `docs/plan/adr/...`)

3. **Regression rule names cited in docs but not in named-rule format yet** (~50 hits) — Most resolve when `tasks/regressions.md` is converted to `**RULE-NAME**:` format (B54). Rules like `BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH`, `JWT-CLAIMS-NOT-IN-APP-METADATA`, `LOGIN-MESSAGE-MUST-BE-GENERIC`, `WEBHOOK-MUST-IDEMPOTENT`, etc. exist in regressions.md as date-prefix bullets — script can't parse them yet. **Cleanup wave:** W0' (B54 format conversion)

4. **`tasks/` historical references** (~40 hits) — `tasks/regressions.md`, `tasks/ui-audit-2026-05.md`, `tasks/pos-qa-pass-1.md` reference shortened/relative paths (`components/brand.tsx` instead of `apps/web/app/components/brand.tsx`). Rule writers shortened for readability. **Cleanup wave:** W0' or rolling (when each rule next edited)

5. **Stale path references in shipped docs** (~30 hits) — `docs/spec/database-schema.md`, `docs/runbooks/`, `docs/ref/inventory-erp-gap-matrix.md` cite paths that moved. **Cleanup wave:** W0' (sweep)

6. **`.omc/plans/` historical references** (~10 hits) — operational plan dir referencing rule names from old format. **Cleanup wave:** Optional — `.omc/` is operational state, may add to skip list.

---

## Cleanup Plan

### W0' (this branch)
- [x] Port 2 CI scripts
- [x] Tighten allowlist (false-positive fixes)
- [ ] Document baseline (this file)
- [ ] Add `NO-VERSION-SUFFIXES` + `SAME-PR-DOC-SYNC` to `tasks/regressions.md`
- [ ] Convert `tasks/regressions.md` to named-rule format (B54) — resolves ~50 cross-ref hits
- [ ] Fix `adr/` path references in plan docs (~15 hits) — single PR
- [ ] Update `tasks/todo.md` archive references (~20 hits)
- [ ] Sweep stale path refs in shipped docs (~30 hits)

### W1
- [ ] Rename `auth_v2_*.py` QA harnesses (after Auth W1 ships)

### W3
- [ ] Codemod `inv_s12_dashboard_v2` + `inv_s13a_stocktake_v2` + `S12_DASHBOARD_V2` + `S13A_STOCKTAKE_V2` (all in 1 PR)

### Post-cleanup
- [ ] Promote `pnpm lint:rebuild-strict` → default `pnpm lint` chain
- [ ] Delete this baseline file (replaced by passing CI)

---

## How to Use

**Local (find new violations):**
```bash
pnpm lint:no-version-suffixes
pnpm lint:doc-xref
# or both:
pnpm lint:rebuild-strict
```

**Updating baseline after cleanup:**
1. Run scripts, capture output
2. Update tables above
3. When count reaches 0 → promote to default `pnpm lint` chain

**Adding to allowlist:**
- Edit `IDENT_ALLOWLIST` in `scripts/check-no-version-suffixes.mjs` for semantic identifiers
- Edit `EXPECTED_RUNTIME_PATHS` in `scripts/check-doc-cross-references.mjs` for planned-but-not-yet paths
- Add justification comment

---

**Reference:** `matu-superapp/scripts/check-no-version-suffixes.mjs`, `matu-superapp/scripts/check-doc-cross-references.mjs` (2026-05-07).
