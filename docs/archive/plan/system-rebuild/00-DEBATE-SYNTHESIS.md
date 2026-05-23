# 00 — Debate Synthesis

> **Suspended 2026-05-23:** This greenfield/blue-green rebuild pack is historical reference only. Active delivery continues in-place via `tasks/todo.md`. Do not apply freeze/cutover instructions unless the owner explicitly reactivates this program.

> Source: 4-agent debate, 2026-05-05  
> Topic: whole-system rebuild after brand identity refresh  
> Outcome: approve full-system blue/green rebuild inside `comtammatu`.

## Final Verdict

All four roles converge on the same direction:

**Build a new `comtammatu` green Supabase project/database and keep the current production project as blue until full parity, migration rehearsal, and production cutover gates pass.**

This is not a patch, not a UI reskin, and not an Inventory-only consolidation. It is a controlled program to align:

- brand identity
- product information architecture
- operational workflows
- database baseline
- mobile/frontline UX
- audit/compliance retention
- QA and rollout discipline

## Agreements

| # | Agreement | Reason |
|---|---|---|
| A1 | Rebuild should be full-system, not Inventory-only | Inventory touches POS, KDS, Finance, Auth, HR, reporting, and storage evidence. |
| A2 | Use blue/green migration | Current production project remains audit/source snapshot; the new Supabase project becomes clean target. |
| A3 | Brand refresh must be product-level | Logo/tokens alone are insufficient; shells, IA, copy, and workflows must align. |
| A4 | No big-bang production deploy | UI waves, database baseline, migration rehearsal, and cutover need separate gates. |
| A5 | Preserve legal/audit data by default | Finance, tax, payment, payroll, audit, and evidence records are not tech debt. |
| A6 | POS/KDS remain operational-first | Brand presence must not reduce speed, queue clarity, or cashier/chef muscle memory. |
| A7 | Green baseline must be clean | Do not replay legacy migration debt blindly. Build a deliberate PostgreSQL baseline. |
| A8 | QA owns migration and persona proof | CI is insufficient; need data parity, RLS negative tests, workflow evidence, and device screenshots. |

## Conflicts And Resolutions

| # | Conflict | Resolution |
|---|---|---|
| C1 | Should the rebuild live in a separate project folder or inside `comtammatu`? | For this decision, keep it in `comtammatu`: blue is the current Supabase project, green is a new Supabase project/database. |
| C2 | Should UI refresh and DB cutover ship together? | No. Same program, separate gates. UI waves can start before production data cutover. |
| C3 | Can V1 data be dropped because brand/software are being rebuilt? | No. Every table/data class must be `MIGRATE`, `ARCHIVE_ONLY`, `DROP_ACCEPTED`, or `REBUILD_FROM_SOURCE`. |
| C4 | Should POS/KDS be visually transformed aggressively? | No. Frontline screens get disciplined brand alignment, not decorative redesign. |
| C5 | Is rollback simply switching back to blue? | Only before green receives production writes. After green writes, rollback needs reverse-delta tooling or becomes manual reconciliation. |

## Role Positions

### PM

Approve the rebuild as a program. Scope must be controlled by route family and milestone. Brand refresh justifies a software refresh, but does not justify uncontrolled rewrite.

### BA

Business data classification blocks implementation. Tax, AP, payroll, payment, audit, and storage evidence are keep/migrate by default. Drops need explicit owner sign-off.

### Architect

Target is a clean `comtammatu` green baseline. The current project provides rules, migration input, and audit history. Auth, permission claims, RLS, RPC transaction boundaries, realtime, storage, and print must be first-class.

### QA

No cutover without repeatable rehearsal. Required gates include static checks, database apply-from-empty, data parity, storage checksum, persona matrix, RLS negative tests, POS/KDS/PWA verification, and finance/payment invariants.

## Program Decision

```text
Approve: Full-System Brand + Software Rebuild
Target: comtammatu green Supabase project
Source: comtammatu blue production/reference project
Cutover: only after rehearsal and QA gates
Rollback: blue before green writes; reverse-delta required after green writes
```

## Owner Decisions Required

| Decision | Recommendation |
|---|---|
| Rebuild scope | Full-system baseline, not Inventory-only. |
| Data policy | Keep/migrate legal and operational data by default. |
| Auth migration | Preserve users if feasible; otherwise owner-approved password reset/re-onboarding. |
| Maintenance window | Prefer overnight for first production cutover. |
| Blue retention | Keep read-only through the defined audit/tax window. |
| Rollback after green writes | Build reverse-delta only if owner requires hard rollback. |
| Brand authority | Use the locked Ma Tu Concept 01 design system; no parallel theme layer. |
