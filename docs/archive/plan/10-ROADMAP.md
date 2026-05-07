> ARCHIVED 2026-05-07 — Folded into PROGRAM-READINESS.md (§3, §6, §7)

# 10 — Program Roadmap (Brand + Software Rebuild)

> **Status:** ACTIVE — owner decisions pending
> **Created:** 2026-05-05
> **Source:** `docs/plan/system-rebuild/00-DEBATE-SYNTHESIS.md`
> **Supersedes (program scope):** `docs/archive/plan/inventory-v2-consolidation.md` (consolidation-only path retired)
> **Companion:** `docs/plan/roadmap.md` (module-level detail)

This is the **program-level** roadmap for the brand + whole-system rebuild from blue (current Supabase project) → green (new clean baseline). Module-level scope/status lives in `docs/plan/roadmap.md`.

---

## §1. Program State

| | Status | Source |
|---|---|---|
| Brand identity (Ma Tu Concept 01) | LOCKED | external design ack |
| Rebuild scope (full-system, not Inventory-only) | APPROVED | `00-DEBATE-SYNTHESIS.md` |
| Blue/green strategy | APPROVED | `02-GREEN-BASELINE.md` |
| Data migration policy | DRAFTED | `03-DATA-MIGRATION-POLICY.md` |
| Cutover/QA framework | DRAFTED | `04-CUTOVER-QA-RUNBOOK.md` |
| Owner blocker decisions | APPROVED 2026-05-07 | this doc §3 |
| Data audit run | NOT STARTED | depends §3 + audit access |
| ADRs (auth, DB, rollback, position-code) | DRAFTED | `docs/plan/adr/` |
| W0–W6 wave plans | NOT WRITTEN | gated on audit results |

---

## §2. Wave Timeline

Per `01-BRAND-SOFTWARE-PROGRAM.md` §"Route-Family Rollout". Each wave has its own gate; **no big-bang deploy**.

| Wave | Scope | Gate | Earliest start |
|---|---|---|---|
| **W0** | Design tokens, typography, logo, app shells | Design-system locked + reviewed | After §3 sign-off |
| **W1** | Login + shared shell | W0 + auth strategy ADR approved | W0 + 1 week |
| **W2** | Admin + settings + staff | W1 + persona ACL test green | W1 + 2 weeks |
| **W3** | Inventory V2 (greenfield, no V1 surface) | W2 + inventory schema baseline ready | W2 + 2 weeks |
| **W4** | Finance + HR + Employee | W3 + period/payroll invariants verified | W3 + 2 weeks |
| **W5** | POS + KDS polish (operational) | W4 + revenue parity confirmed | W4 + 1 week |
| **W6** | Print/PWA/docs + final brand pass | W5 + smoke suite green on devices | W5 + 1 week |

**Cutover candidate**: end of W6, after migration rehearsal × 2 (per `04-CUTOVER-QA-RUNBOOK.md` §"Rehearsal Runbook").

**Total wall time** (1-dev parallel, 2-week cycles): ~14-16 weeks. With 2 devs split (frontend × backend): ~10-12 weeks.

---

## §3. Owner Blocker Decisions — Sign-off Required

These decisions block **all** wave starts. Owner reviews recommendations below; sign with date + override notes.

| # | Blocker | Recommendation | Owner Decision | Date | Override notes |
|---|---|---|---|---|---|
| B1 | **Rebuild scope** | Full-system, not Inventory-only | ☑ approve | 2026-05-07 | |
| B2 | **Data preservation default** | KEEP/MIGRATE legal + operational data; DROP only after audit + sign-off | ☑ approve | 2026-05-07 | |
| B3 | **Auth user preservation** | Preserve `auth.users` IDs + emails via Admin API import; force password reset email on first login post-cutover (passwords incompatible across Supabase projects) — see [ADR-0001](plan/adr/0001-auth-migration.md) | ☑ approve | 2026-05-07 | |
| B4 | **DB provider** | New Supabase project, same org, same region (ap-southeast-1 Singapore) — see [ADR-0002](plan/adr/0002-database-provider.md) | ☑ approve | 2026-05-07 | |
| B5 | **Maintenance window** | Overnight 22:00–04:00 ICT first cutover; 4h window + 2h buffer | ☑ approve | 2026-05-07 | |
| B6 | **Blue retention period** | Read-only 12 tháng (đáp ứng tax/audit retention); after 12 months → archive snapshot | ☑ approve | 2026-05-07 | |
| B7 | **Reverse-delta (rollback after green writes)** | Build minimal reverse-delta cho revenue tables (`orders`, `payments`, `refunds`); accept continue-forward fix cho `stock_movements`, `attendance` — see [ADR-0003](plan/adr/0003-cutover-rollback.md) | ☑ approve | 2026-05-07 | |
| B8 | **Brand authority** | Ma Tu Concept 01 design system; no parallel theme layer; no per-route theme files | ☑ approve | 2026-05-07 | |
| B9 | **Identifier language** | Normalize blue Vietnamese/mixed-case technical identifiers into English `lower_snake_case` in green baseline, including position codes like `quan_ly_CN` / `bep_truong` — see [ADR-0004](plan/adr/0004-position-code-normalization.md) | ☑ approve | 2026-05-07 | |
| B10 | **Audit access** | Architect lead read-only + service-role-key via 1-week token; results commit to `docs/plan/system-rebuild/audit/results-YYYY-MM-DD.md` | ☑ approve | 2026-05-07 | |

**Sign-off rule**: B1+B2+B10 must approve to start audit. B3+B4+B5+B6+B7+B8+B9 must approve to start W0 implementation.

---

## §4. Immediate Actions (post sign-off §3)

| # | Action | Owner | Output | Blocks |
|---|---|---|---|---|
| 1 | Run data audit | architect/dev | `docs/plan/system-rebuild/audit/results-2026-05-XX.md` | All waves |
| 2 | Resolve `DEFER_DECISION` items in audit results | owner + BA | Updated `03-DATA-MIGRATION-POLICY.md` Sign-Off Table | W3 (Inventory needs supplier_returns/credit_notes decision) |
| 3 | Write executable test plans | QA | `docs/plan/system-rebuild/qa/test-plan-*.md` (per persona × wave) | Each wave |
| 4 | Write W0 design foundation spec | designer + Sr.Dev | `docs/plan/system-rebuild/06-W0-DESIGN-FOUNDATION.md` | W0 start |
| 5 | Provision green Supabase project | ops | Project ID + secrets in vault | W0 start |
| 6 | Build green baseline migration | architect/dev | `supabase/migrations-green/0001_green_baseline.sql` | W0 implementation |

---

## §5. Non-Negotiables (carried from rebuild README)

- Do **not** rebuild only Inventory. Target is full-system.
- Do **not** treat brand refresh as visual decoration only. It must align IA, copy, shells, workflow.
- Do **not** drop tax, finance, payroll, payment, audit, or evidence data without owner sign-off (B2 enforces).
- Do **not** big-bang UI refresh + data migration + auth migration + cutover in one deploy (W0–W6 enforces).
- Do **not** port current schema debt into green as-is (green baseline ADR enforces).
- Do **not** change production traffic until green has passed migration rehearsal × 2 + persona verification (`04-CUTOVER-QA-RUNBOOK.md` §"Go/No-Go" enforces).

---

## §6. Cross-References

- **Strategy:** `docs/plan/system-rebuild/{00-DEBATE-SYNTHESIS,01-BRAND-SOFTWARE-PROGRAM,02-GREEN-BASELINE,03-DATA-MIGRATION-POLICY,04-CUTOVER-QA-RUNBOOK}.md`
- **ADRs:** `docs/plan/adr/000{1-4}-*.md`
- **Audit:** `docs/plan/system-rebuild/audit/`
- **Module roadmap:** `docs/plan/roadmap.md`
- **Regression rules:** `tasks/regressions.md`
- **Lessons:** `tasks/lessons.md`
- **Codebase map:** `docs/CODEBASE_MAP.md`

---

## §7. Sign-off Block

| Role | Name | Date | Decision (B1–B10) |
|---|---|---|---|
| Owner | ngocnghia128@gmail.com | 2026-05-07 | ☑ all approve |
| Lead Dev | _____________ | _____________ | ☐ feasible / ☐ revise |
| Architect | _____________ | _____________ | ☐ baseline ready / ☐ revise |
| QA Lead | _____________ | _____________ | ☐ verifiable / ☐ revise |
| Ops | _____________ | _____________ | ☐ provisionable / ☐ revise |

---

**End of program roadmap.** Update this file when: (a) any blocker decision flips, (b) wave ships, (c) cutover go/no-go scheduled.
