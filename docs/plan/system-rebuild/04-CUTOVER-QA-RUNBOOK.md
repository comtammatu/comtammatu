# 04 — Cutover And QA Runbook

> Purpose: define go/no-go criteria for moving production from blue to green.

## QA Verdict

Green cannot receive production traffic until:

- data catalog has no `DEFER_DECISION`
- baseline applies from an empty database
- migration rehearsal passes at least twice
- storage checksums match
- auth strategy is rehearsed
- persona tests pass
- POS/KDS/payment/inventory/finance workflows pass end-to-end
- owner approves the maintenance window

## Verification Layers

| Layer | Gate |
|---|---|
| Contract | Owner signed scope, data policy, auth strategy, maintenance window. |
| Static | Typecheck, lint, build, copy/i18n checks, generated API/client checks. |
| Database | Apply from empty, RLS review, migration idempotency, FK integrity. |
| Auth/RLS | Positive and negative persona tests. |
| Workflow | POS -> KDS -> payment -> stock -> finance -> invoice evidence. |
| UI/brand | Route-family screenshots; no parallel theme or fake primitives. |
| Data | Row counts, checksums, storage manifest, business aggregate parity. |
| Ops | Secrets, cron, webhook URLs, print agent, monitoring, backup restore. |

## Persona Matrix

| Persona | Positive flows | Negative checks |
|---|---|---|
| owner | Admin, Finance, Reports, Inventory oversight | Not forced into operator flows. |
| super manager | HQ operations, staff, inventory, finance | Tenant-wide scope only where allowed. |
| area manager | Area reports and branch oversight | No mutation outside authority. |
| warehouse manager | GRN, transfer, stocktake | No owner finance/admin controls. |
| production manager | BOM, production, central kitchen transfer | No unauthorized inter-site shipment. |
| branch manager | receive inbound, branch stock, POS/KDS oversight | No outbound inter-branch shipment if not allowed. |
| cashier/waiter | POS order/payment/table flow | No inventory/admin access. |
| chef | KDS bump/recall allowed flows | No POS/payment/inventory mutation. |
| office/employee | profile, attendance, employee tasks | No admin escalation. |

## Device Matrix

Minimum:

- Android phone Chrome, 412 x 915
- iPhone Safari, 390 x 844
- iPad/tablet, 768 x 1024
- POS/kitchen terminal, 1024 x 768
- Desktop Chrome/Edge, 1440 x 900
- Installed/PWA-like mode where applicable
- Real printer smoke test

## Rehearsal Runbook

### Pre-Rehearsal

1. Take blue snapshot.
2. Export row counts.
3. Export storage manifest.
4. Export provider/webhook config inventory.
5. Freeze a copy of migration scripts.

### Green Load

1. Apply green baseline from empty.
2. Seed tenant/branch/permissions.
3. Run migration import.
4. Copy retained storage objects.
5. Configure secrets, webhooks, cron, realtime rooms.
6. Generate API/mobile clients if required.
7. Run static and database gates.

### Validation

1. Compare row counts and business aggregates.
2. Run persona tests.
3. Run RLS negative tests.
4. Run POS/KDS/payment workflow.
5. Run HĐĐT/tax evidence workflow.
6. Run inventory V2 flow.
7. Run finance period/read checks.
8. Run print/PWA cache checks.

## Production Cutover

### Pre-Cutover

1. Announce maintenance window.
2. Disable blue write paths.
3. Stop cron/webhook writers or put them in maintenance mode.
4. Take final blue backup.
5. Record final blue row counts and aggregates.
6. Export final storage delta manifest.

### Switch

1. Apply final delta migration to green.
2. Copy final storage delta.
3. Switch production environment variables to green.
4. Rotate or confirm secrets.
5. Deploy app/API/mobile config.
6. Force cache/PWA refresh where relevant.
7. Run smoke suite immediately.

### Smoke Suite

- login owner and cashier
- create POS order
- send to KDS
- complete payment
- verify invoice/payment state
- verify stock movement
- verify finance event
- print receipt
- run one Inventory V2 receive/transfer check
- verify employee login/profile
- verify forbidden access for cashier/admin routes

## Rollback

Before green receives production writes:

- rollback is environment switch back to blue plus cache refresh.

After green receives production writes:

- rollback is not clean unless reverse-delta tooling exists.
- without reverse-delta, use manual reconciliation or continue-forward fix.

Owner must decide before cutover whether reverse-delta is required.

## Go/No-Go

Go only if:

- 0 critical/high defects open
- rehearsal completed within maintenance window plus 30 percent buffer
- data parity accepted by BA/owner
- QA signs persona and negative tests
- ops signs backup/restore and monitoring
- owner signs final cutover approval

No-go if:

- any `DEFER_DECISION` remains
- auth strategy is untested
- storage checksum mismatch is unexplained
- payment/HĐĐT/finance invariant fails
- POS/KDS first-viewport is degraded
- rollback stance is unclear
