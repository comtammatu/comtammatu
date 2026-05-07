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

## SAME-PR-DOC-SYNC baseline (post-Phase-1.4 conversion)

After **Phase 1.4 (B54)** regressions.md format conversion 2026-05-07 (`scripts/convert-regressions-to-named-format.mjs`), 157 rules now in `**RULE-NAME**:` format. The cross-ref check baseline shifted:

**Before conversion:** 188 mixed (archived paths + unrecognized rule names — most resolved by named-rule format).

**After conversion:** ~199 split into 2 distinct categories:

### A. Broken doc/file links (~154 hits)

Existing tech debt — files cited by docs that don't exist (or moved):

1. **Archived plan doc references** (~20 hits) — `tasks/todo.md` references `docs/plan/inventory-v2-rebuild.md`, `docs/plan/inventory-location-ledger*.md`, `docs/plan/m4-payments-fix.md`, `docs/plan/platform-fork-2026.md` (all moved to `docs/archive/plan/` per B20). **Cleanup wave:** W0' (update tasks/todo.md to reflect archive moves)

2. **`tasks/` historical references** (~40 hits) — `tasks/regressions.md`, `tasks/ui-audit-2026-05.md`, `tasks/pos-qa-pass-1.md` reference shortened/relative paths (`components/brand.tsx` instead of `apps/web/app/components/brand.tsx`). Rule writers shortened for readability. **Cleanup wave:** rolling (when each rule next edited)

3. **Stale path references in shipped docs** (~30 hits) — `docs/spec/database-schema.md`, `docs/runbooks/`, `docs/ref/inventory-erp-gap-matrix.md` cite paths that moved. **Cleanup wave:** W0' (sweep) or rolling.

4. **`.omc/plans/` historical references** (~10 hits) — operational plan dir referencing rule names from old format. **Cleanup wave:** Optional — `.omc/` is operational state, may add to script's `SKIP_PATH_PREFIXES`.

5. **Self-references in lint-baseline.md** (~5 hits) — this file cites archived paths intentionally to document them. False positive; could add to script's `SCAN_SKIP_FILES`.

### B. Missing regression rules (~45 hits) — NEW class exposed by conversion

Rules CITED in adopted ADRs (0011, 0012, 0013, 0014) and `change-impact-matrix.md` but NOT YET DEFINED in `tasks/regressions.md`. These represent commitments from W0' ADR adoption that need rule implementations in upcoming waves:

| Rule cited | Cited in | Implementation wave |
|---|---|---|
| `MFA-RECENT-AAL2-FOR-SENSITIVE-RPCS` | ADR-0011, ADR-0012 | W4 (per ADR-0011 acceptance) |
| `NO-SMS-OR-EMAIL-OTP-AS-SECOND-FACTOR` | ADR-0011 | W4 |
| `ENV-NO-PER-TENANT-SECRETS` | ADR-0012, change-impact §15 | W4 (per ADR-0012 acceptance) |
| `ENV-NO-PER-BRANCH-SECRETS` | ADR-0012, change-impact §15 | W4 |
| `PROVIDER-CREDENTIAL-ROTATION` | ADR-0012 | W4 |
| `AUDIT-CREDENTIAL-ALLOWLIST` | ADR-0012 | W4 |
| `AUDIT-REDACTION-HELPER` | ADR-0012 | W4 |
| `SECURITY-DEFINER-SEARCH-PATH` | ADR-0012 | W1 (gates Auth RPC) |
| `RATE-LIMIT-FALLBACK-EXPLICIT` | ADR-0013 | W1 (per ADR-0013 acceptance) |
| `REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE` | ADR-0014 | EXISTING (in regressions, format may differ) |
| `REALTIME-CHANNEL-RESUBSCRIBE-ON-TOKEN-REFRESH` | ADR-0014 | EXISTING |
| `REALTIME-CHANNEL-NAME-SCOPED` | ADR-0014 | W3-W5 |
| `REALTIME-LONG-SESSION-TEST` | ADR-0014 | W5 |
| `REALTIME-NO-CLIENT-TRUSTED-FILTER` | ADR-0014 | W5 |
| `REALTIME-PUBLICATION-ALLOWLIST` | ADR-0014 | W5 |
| `REALTIME-HUB-FANS-OUT` | ADR-0007, ADR-0014 | W5 |
| `REALTIME-EVICT-CHANNEL-SYNC-AFTER-REMOVE` | ADR-0014 | EXISTING |
| `ROLE-PRECEDENCE-DETERMINISTIC` | change-impact §9 | W1 |
| `PAYMENT-RECOMPUTE-TOTAL` | change-impact §12 | W5 |
| `STOCK-CONSUME-CHECK-RESULT` | change-impact §12 | W5 |
| `EMERGENCY-RPC-SCOPE-RESTRICTED` | change-impact §12, ADR-0008 | W5 |
| `PROVIDER-MOCK-PARITY` | change-impact §13 | W4 |
| `HUB-LAN-AUTH-MANDATORY` | change-impact §14 | W5 |
| `ACL-SINGLE-SOURCE` | ADR-0012 | EXISTING (in regressions, verify format) |
| `COPY-LABEL-SOURCE-OF-TRUTH` | ADR-0012 | EXISTING |
| `RAW-ERRORS-NOT-CLIENTS` | ADR-0012, AGENTS.md | EXISTING |
| `SAFE-VIETNAMESE-ERRORS` | ADR-0012 | EXISTING |

**Action:** Each ADR's "Acceptance Gates" entry "regression rule X added in same PR" makes this trackable. As ADRs flip from `proposed` to `accepted`, the corresponding rules land in `tasks/regressions.md` and the cross-ref orphan disappears.

For rules marked EXISTING: verify the rule name in regressions.md matches exactly (case-sensitive, dash-vs-underscore). Some may have alternate names (e.g., `REFUND-MUST-REVERSE-ATOMICALLY` vs `REFUND-REVERSE-ATOMICALLY` — verify).

---

## Cleanup Plan

### W0' (this branch)
- [x] Port 2 CI scripts (commit 38dc365b)
- [x] Tighten allowlist (false-positive fixes)
- [x] Document baseline (this file)
- [x] Add `NO-VERSION-SUFFIXES` + `SAME-PR-DOC-SYNC` to `tasks/regressions.md`
- [x] Convert `tasks/regressions.md` to named-rule format (B54) — 157 rules converted; surfaced ~45 missing-rule orphans cited in adopted ADRs
- [x] Fix `adr/` path references in plan docs (commit ce3e8b29)
- [ ] Update `tasks/todo.md` archive references (~20 hits remain)
- [ ] Sweep stale path refs in shipped docs (~30 hits remain)
- [ ] Add `.omc/plans/` to script's `SKIP_PATH_PREFIXES`

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
