# ADR-0003: Cutover Rollback Stance

> **Status:** PROPOSED
> **Date:** 2026-05-05
> **Decider:** Architect → Owner sign-off (B7)
> **Context:** Whole-system rebuild cutover — see `docs/plan/system-rebuild/04-CUTOVER-QA-RUNBOOK.md`

---

## Context

Per `04-CUTOVER-QA-RUNBOOK.md` §"Rollback":

> Before green receives production writes:
> - rollback is environment switch back to blue plus cache refresh.
>
> After green receives production writes:
> - rollback is not clean unless reverse-delta tooling exists.
> - without reverse-delta, use manual reconciliation or continue-forward fix.

Decision required: build reverse-delta tooling YES/NO, and **for which tables**.

Reverse-delta = mechanism to capture all writes on green during cutover window and replay them onto blue if rollback is invoked. Equivalent of a CDC stream from green → blue with idempotent replay.

---

## Decision

**Tier-1 reverse-delta for revenue + compliance tables; continue-forward fix for everything else.**

| Table | Reverse-delta? | Rationale |
|---|---|---|
| `orders` | **YES** | Revenue impact direct. |
| `order_items` | **YES** | Revenue detail. |
| `payments` | **YES** | Revenue + journal entries. Lost = financial reconciliation nightmare. |
| `refunds` | **YES** | Compliance + customer trust. |
| `webhook_events` | **YES** | Idempotency replay key — must not lose. |
| `tax_invoices` | **YES** | Legal compliance, HĐĐT must trace forward. |
| `journal_entries` | **YES** | Accounting chain. |
| `attendance` | NO | Continue-forward: re-enter time for affected day. |
| `payroll_records` | NO | Period-based; if cutover mid-period, redo period close. |
| `stock_movements` | NO | Continue-forward: physical stock count, post adjustment. |
| `goods_received_notes` | NO | NCC re-confirms or branch re-enters. |
| `stock_transfers` | NO | Re-enter from physical evidence. |
| `audit_logs` | NO (best-effort archive) | New entries on blue won't replay; archive snapshot. |
| `notifications` | NO | Ephemeral. |

**Tier-1 implementation**: PostgreSQL logical replication (`CREATE PUBLICATION ... FOR TABLE orders, order_items, payments, refunds, webhook_events, tax_invoices, journal_entries`) on green → subscribed by blue during cutover window (T-window: 24h post-cutover by default).

After T-window expires without rollback trigger → drop subscription, reverse-delta no longer available, continue-forward becomes the only option.

---

## Alternatives Considered

### A. Full reverse-delta (every table)
- **Pro**: zero data loss on rollback.
- **Con**: complex (40+ tables, schema-drift handling, FK ordering, RLS policies on blue need to accept replication user). Estimated 3-4 weeks engineering. Cost > benefit for non-revenue tables.
- **Rejected**.

### B. No reverse-delta — continue-forward only
- **Pro**: simplest. No infra to build.
- **Con**: if cutover fails 2h in (8 PM Friday), 50+ payments lost. Owner can't accept revenue loss.
- **Rejected** for revenue-impacting tables.

### C. Application-level dual-write during cutover window
- **Pro**: app code controls what to dual-write, fine-grained.
- **Con**: code complexity, error handling, doubles all latency. Easy to introduce bugs.
- **Rejected**.

### D. Snapshot-based rollback (restore green-state-at-cutover, lose all green writes)
- **Pro**: simple revert.
- **Con**: still loses all green writes. Same problem as B for revenue.
- **Rejected**.

---

## Consequences

### Positive
- Revenue + compliance data has clean rollback path.
- Tier-1 scope is small enough (7 tables) to build + test in 1 week.
- Logical replication is Postgres-native, no app code changes.
- Time-bounded (24h window) limits ops complexity.

### Negative
- Operational stock data NOT in reverse-delta → if rollback after stock writes, branch must physically recount. UX cost on warehouse_manager.
- 24h window = decision deadline for rollback. After 24h, no rollback option.
- Logical replication adds 1 PUBLICATION on green + 1 SUBSCRIPTION on blue. Monitoring both.
- Schema drift handling: if green schema differs from blue (it will, that's the point of rebuild), replication can't apply. Must either:
  - (a) keep blue schema temporarily compatible with green Tier-1 subset
  - (b) write transformation rules in app-layer outbox

**We choose (b)**: transformation rules. Logical replication source = green; app-layer subscriber writes to blue's old schema after transform. Edge Function `cutover-replay` reads green replication slot, transforms each row, INSERTs into blue.

### Mitigations

| Risk | Mitigation |
|---|---|
| Replication slot bloats green WAL | Monitor `pg_replication_slots.confirmed_flush_lsn`; alert if > 100MB lag. |
| Transformation rule breaks for unforeseen schema diff | Pre-cutover: integration test with sample row. Block cutover go-live if transform fails. |
| Decision deadline missed (cutover stable, but PM forgets to drop subscription) | Cron job auto-drops subscription at T+24h after cutover unless override flag set. |
| Replicated rows on blue conflict with stale blue triggers | Disable triggers on blue Tier-1 tables during replay window (`ALTER TABLE ... DISABLE TRIGGER ALL`). Re-enable after window. |

---

## Rollback Procedure (Triggered)

If cutover fails within 24h window:

```bash
# 1. Owner approves rollback (no auto-trigger).
# 2. Stop green writes.
psql "$GREEN_URL" -c "ALTER SYSTEM SET default_transaction_read_only = on; SELECT pg_reload_conf();"

# 3. Drain in-flight requests (15min wait).
sleep 900

# 4. Replay any pending replication slot deltas.
# Edge Function cutover-replay runs to-completion.

# 5. Verify blue Tier-1 row counts match green Tier-1 + cutover-period-counts.
psql "$BLUE_URL" -c "SELECT count(*) FROM payments WHERE created_at > '<cutover-ts>';"
psql "$GREEN_URL" -c "SELECT count(*) FROM payments WHERE created_at > '<cutover-ts>';"
# Counts must match.

# 6. Switch app env back to blue.
# Vercel: redeploy with .env.blue active.

# 7. Verify smoke (cashier login, POS order, payment, KDS).

# 8. Drop green subscription on blue.
psql "$BLUE_URL" -c "DROP SUBSCRIPTION cutover_replay;"

# 9. Communicate: green is suspended; blue is live.
```

---

## Verification

Before cutover:
1. **Rehearsal #1** (1 week pre): set up replication on dev clone of blue + green. Generate 100 fake payments on green. Trigger fake rollback. Verify all 100 payments land on blue.
2. **Rehearsal #2** (3 days pre): full Tier-1 schema diff. Run transformation Edge Function with sample data — assert no errors.
3. **Cutover day**: enable replication immediately after green opens for writes.

During cutover window:
- Replication lag < 30s sustained.
- Replication slot LSN advances.
- No errors in `cutover-replay` Edge Function logs.

Post-window (T+24h):
- Auto-drop subscription via cron.
- Owner sign confirms cutover success → reverse-delta disabled forever.

---

## Open Items

- **Webhook idempotency during rollback**: if `webhook_events` replay → blue handlers re-fire. Webhook handlers must be idempotent already (per regression `WEBHOOK-MUST-IDEMPOTENT` 2026-04-29). Verify.
- **Storage rollback**: green storage writes (new uploaded receipts) are NOT reverse-delta'd. If rollback, those uploads are lost. Acceptable — receipts are re-printable.
- **Monitor implementation**: Datadog/Grafana dashboard for replication lag pre-cutover.

---

## References

- PostgreSQL logical replication docs
- `docs/plan/system-rebuild/04-CUTOVER-QA-RUNBOOK.md` §"Rollback"
- `tasks/regressions.md` — `WEBHOOK-MUST-IDEMPOTENT`, `STOCK-CONSUME-MUST-CHECK-RESULT`
- Companion ADRs: 0001 (auth), 0002 (DB provider), 0004 (position-code)
