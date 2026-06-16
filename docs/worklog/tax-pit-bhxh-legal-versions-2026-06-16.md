# T3 — Payroll legal-versions: PIT effective date + BHXH cap (2026-06-16)

> Tier: **T3 (money — payroll PIT/BHXH constants)**. Source of issue:
> `docs/ref/tax-audit-2026-06.md` §2.1, §2.2. Scope: `packages/shared/src/payroll/legal-versions.ts`
> + its test. No DB migration (constants are TS, engine overrides DB column defaults).

Skill plan: repo rules = engineering + workflow + tax-vn skill (`docs/ref/legal-framework-2026.md`,
`payroll-pit.md`); external skills = none; runtime tools = bash (pnpm gates), Agent (adversarial QA);
skipped = db/migration (no schema change), browser (no UI).

## Problem

`legal-versions.ts` resolves payroll constants by `effectiveFrom`. Two entries are wrong vs current law:

1. **PIT brackets, period 2026-01 → 2026-06.** Version `2026-01-01` uses `PIT_BRACKETS_2007`
   (7 brackets). Luật TNCN 109/2025/QH15: general effect 01/07/2026, BUT wage/salary + business
   income provisions apply **from kỳ tính thuế 2026 = 01/01/2026**. So the 5-bracket schedule
   applies to the whole 2026 tax year; H1-2026 should already be 5-bracket.
2. **BHXH cap, period 2026-07 onward.** All versions hardcode `insuranceCap: 46_800_000`.
   NĐ 161/2026/NĐ-CP raises lương cơ sở 2.34M → 2.53M from **01/07/2026** → cap = 20 × 2.53M =
   **50.6M**. The `2026-07-01` version still caps at 46.8M.

Deductions (15.5M / 6.2M from 2026-01-01) are already correct — not in scope to change.

## PM — scope, acceptance, priority

- **Scope:** correct the two constants + their `source` citations; update the test that encodes the
  old assumption; add a regression rule. Out of scope: DB column default `personal_deduction
  DEFAULT 11000000` (legacy fallback, engine always overrides — leave, already annotated in doc).
- **Acceptance:**
  - `getLegalVersionForPeriod(2026, m)` for m∈[1..12] resolves a **5-bracket** schedule.
  - Cap = 46.8M for periods ≤ 2026-06, **50.6M** for periods ≥ 2026-07.
  - Deductions stay 15.5M / 6.2M across all 2026 periods.
  - Pre-2026 periods (2024-07, 2020-07) unchanged (closed-period reproducibility).
- **Priority:** P0 correctness — wrong withholding affects every payroll run in 2026. §2.2 is
  unambiguous; §2.1 carries a withholding-policy caveat (below) but the legally-correct default is
  5-bracket from 01/01/2026.

## BA — rules, edge cases, data flow

- **Rule (PIT):** 2026 tax year = 5-bracket (5/10/20/30/35% at 10/30/60/100M) + deductions
  15.5M/6.2M. Monthly withholding at new rates from Jan 2026; year-end finalization Q1 2027.
- **Rule (BHXH cap):** cap = 20 × lương cơ sở. 46.8M (base 2.34M) through 2026-06-30; 50.6M
  (base 2.53M) from 2026-07-01.
- **Edge — H1-2026 withholding caveat (the one real ambiguity):** the law's *general* effective
  date is 01/07/2026; some employers withheld at old (7-bracket) rates in H1-2026 pending that date
  and true up at finalization. Authoritative reading (thuvienphapluat, kỳ tính thuế 2026) is
  new-rates-from-Jan. We implement the authoritative reading. If Má Tư's accountant elects
  conservative old-rate H1 withholding, revert is one line (point `2026-01-01` back to
  `PIT_BRACKETS_2007`) — flagged to owner. Either way the annual liability is identical; only the
  monthly withholding timing differs.
- **Edge — period boundary:** `getLegalVersionForPeriod` uses month-end as the effective date; the
  06↔07 2026 boundary is the cap step. Test both sides.
- **Edge — closed periods:** pre-2026 versions MUST be byte-stable so reprinting an old payslip
  reproduces the same numbers.
- **Data flow:** `employees.insurance_base_salary` → `calculatePayrollEntry` →
  `MIN(base, version.insuranceCap)` → snapshot to `payroll_entries.insurance_base`. Already
  version-aware; only the table values change.

## Senior Dev — architecture, approach, blast radius

- Engine (`calculate.ts`) reads everything from the resolved version (`version.pitBrackets`,
  `version.insuranceCap`). **No engine logic changes** — only data in the version table.
- Approach:
  - Point `2026-01-01` version `pitBrackets: PIT_BRACKETS_2007` → `PIT_BRACKETS_2026`.
  - Set `2026-07-01` version `insuranceCap: 46_800_000` → `50_600_000`.
  - Update both `source` strings (citations, not change-log narrative — allowed) and the
    `PIT_BRACKETS_2026` comment (drop "effective 2026-07-01", it's the 2026 tax-year schedule).
  - Update the file header `Sources:` block (NĐ 161/2026 cap line).
- Blast radius: any caller of `calculatePayrollEntry` / `getLegalVersionFor*` for a 2026 period —
  i.e. HR payroll calc + the payroll-pit doc. No RLS/RPC/migration/UI. After this, the `2026-01-01`
  and `2026-07-01` versions differ only by cap → both correct and intentional.
- Cross-boundary (QA table): the DB↔TS mirror here is `payroll_entries.insurance_base`/
  `personal_deduction` columns vs engine output. Engine writes resolved values, so the column
  DEFAULT 11000000 never participates in a real entry. No drift introduced.

## QA — test plan, regression risk, gates

- **Update** `legal-versions.test.ts` test 1: it currently asserts `june.pitBrackets.length === 7`
  and `july.insuranceCap === 46_800_000` — both now wrong. Rewrite to assert: all 2026 periods are
  5-bracket; cap 46.8M for June, 50.6M for July; deductions 15.5M/6.2M unchanged.
- **Keep** test 2 (5-bracket quick-formula cuts) and test 3 (bracket continuity) — they still pass
  and now also cover the H1 path.
- **Add** assertions: pre-2026 versions unchanged (cap 29.8M @ 2020-07, 46.8M @ 2024-07; 7-bracket
  retained for ≤2025 finalization).
- **Add** a worked payroll case at the 06/07 boundary for an employee with base > 46.8M to prove the
  cap step changes BHXH.
- **Regression rule:** add `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP` to `tasks/regressions.md`.
- **Gates:** `pnpm typecheck && pnpm lint && pnpm build` + targeted `node --test` on payroll.
- **Adversarial verify:** spawn one QA/skeptic subagent to re-check the diff against the legal facts
  and the existing-test deltas.

## Synthesis / contract

Agreements: engine untouched; only the version table + test + regression rule change; §2.2 certain;
§2.1 implemented to the authoritative reading with a documented, one-line-reversible withholding
caveat for the accountant.

Conflict resolved: "change H1 PIT now vs wait for accountant" → implement the legally-correct default
(owner authorized T3 processing of the audit checklist), flag the withholding-policy caveat in the
owner-facing summary, keep revert trivial.

Unified contract: (1) `2026-01-01` → 5-bracket; (2) `2026-07-01` cap → 50.6M; (3) rewrite test 1 +
add boundary/closed-period cases; (4) regression rule; (5) gates green + adversarial QA; (6) update
`payroll-pit.md` §5 legacy note + tick `tax-audit-2026-06.md` checklist.

## Attestation (completed 2026-06-16)

- Test-plan items covered: 2026 5-bracket all 12 months; cap step 46.8M→50.6M at 2026-07;
  closed-period stability (2020-07, 2024-07); cap-step boundary payroll (base 50M).
  `legal-versions.test.ts` 7/7 + `apps/web/tests/hr-payroll-hkd.test.ts` 8/8 pass.
- BA rules → implementing line: 5-bracket H1 → `legal-versions.ts:127` (`2026-01-01` →
  `PIT_BRACKETS_2026`); cap 50.6M → `legal-versions.ts:135` (`2026-07-01`).
- Adversarial QA (1 subagent) confirmed legal claims A/B/C with sources AND caught a real
  regression: `apps/web/tests/hr-payroll-hkd.test.ts:109` asserted the old 7-bracket result
  (2,250,000) for a 2026-06-30 date — fixed to 1,450,000 (5-bracket) + corrected the stale
  comment. Re-ran both suites green.
- Out-of-scope gaps: DB default 11000000 (intentional legacy fallback, engine overrides,
  annotated in `payroll-pit.md` §4.2); H1-2026 withholding policy (owner/accountant call,
  one-line reversible — see regression rule caveat).
- Gates run (Linux sandbox; user node_modules is macOS-native so turbo/next build run on owner's
  machine): `tsc --noEmit` (shared) ✓; eslint on changed files ✓; `node --test` payroll 15/15 ✓;
  `check-regression-guards.mjs` ✓. NOT committed (owner did not request commit).
