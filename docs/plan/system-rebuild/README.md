# Rebuild Program — Brand Refresh + ComtamMatu Green

> Status: PROPOSED
> Created: 2026-05-05
> Source: 4-perspective debate for whole-system rebuild after Ma Tu brand refresh
> Scope: rebuild `comtammatu` onto a new Supabase project/database with the refreshed brand and clean full-system baseline.

## Decision

The rebuild is approved as a **whole-system program**, not an Inventory-only cleanup.

Brand identity has moved forward, so the software system should move with it. The correct path is not a visual reskin on top of legacy debt. It is:

```text
Blue  = current comtammatu production project
Green = new comtammatu Supabase project/database baseline
```

Green keeps the current product stack and deployment model:

- Next.js App Router web app
- Supabase Auth, Postgres, Storage, RPCs, RLS, cron
- Auth v2 permission claims and `module-acl.ts` route gates
- PWA/POS/KDS/print-agent support
- retained storage buckets for audit/tax evidence

The current blue project remains the source of business rules, regression lessons, data audit, and migration input until production cutover is accepted.

## Reading Order

| File | Purpose |
|---|---|
| `00-DEBATE-SYNTHESIS.md` | Final synthesis from PM, BA, Architect, QA debate. |
| `01-BRAND-SOFTWARE-PROGRAM.md` | Program scope, route-family rollout, brand/software alignment. |
| `02-GREEN-BASELINE.md` | Target architecture and baseline construction for comtammatu green. |
| `03-DATA-MIGRATION-POLICY.md` | Data classification, retention, migration/drop rules. |
| `04-CUTOVER-QA-RUNBOOK.md` | Rehearsal, cutover, rollback, persona and quality gates. |

## Non-Negotiables

- Do not rebuild only Inventory. The target is full-system.
- Do not treat brand refresh as visual decoration only. It must align product IA, copy, shells, and workflow clarity.
- Do not drop tax, finance, payroll, payment, audit, or evidence data without owner sign-off.
- Do not big-bang UI refresh, data migration, auth migration, and production cutover in one deploy.
- Do not port current schema debt into green as-is.
- Do not change production traffic until green has passed migration rehearsal and persona verification.

## Immediate Output Required

Before implementation starts:

1. Owner signs the blocker decisions in `docs/plan/10-ROADMAP.md`.
2. Team completes the data audit described in `03-DATA-MIGRATION-POLICY.md`.
3. Architect writes ADRs for auth migration, database provider, and cutover rollback.
4. QA turns `04-CUTOVER-QA-RUNBOOK.md` into executable test plans.
