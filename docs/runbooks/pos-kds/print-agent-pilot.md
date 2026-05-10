# Print Agent — Pilot Rollout & SOP

Runbook for deploying the thermal print agent to a pilot branch and the offline
fallback procedure when a printer or agent fails mid-service.

## Scope

- **System**: `@comtammatu/print-agent` (Node 24 + Supabase Realtime, LAN + Bluetooth)
- **Topology**: 1 agent process per branch, 3 printers per branch
  (`receipt`, `kitchen_1`, `kitchen_2`)
- **Target**: 1 pilot branch for 2 weeks, then fleet-wide rollout

## 0. Pre-flight — once per branch

Complete all items before opening the branch for the day.

### Database (tenant admin)

- [ ] Branch exists and is active
- [ ] `/admin/settings/printers` — 3 printer rows (`receipt` / `kitchen_1` / `kitchen_2`),
      all `is_active = true`
- [ ] For LAN printers: `connection_type='lan'`, `lan_host` + `lan_port`
      (default 9100) filled and reachable from the POS PC subnet
      (`nc <host> 9100` to verify)
- [ ] For Bluetooth printers: `connection_type='bluetooth'`, printer paired in
      the OS, and `lan_host` filled with the bound endpoint (`COM5`,
      `/dev/rfcomm0`, `/dev/tty.*`)
- [ ] `/admin/settings/printers` — each branch kitchen printer has the right
      print types (`kitchen_ticket`, `cancel_ticket`) and menu categories assigned.
      Categories not assigned to a branch printer are not included in kitchen tickets.
- [ ] Cashier + chef accounts have `pos:send_kitchen` + `pos:print` permissions
      (auto-provisioned via role template)

### Windows PC per branch

- [ ] **Node.js 24+** installed (`node --version` ≥ v24). Download from nodejs.org.
- [ ] NSSM installed (`choco install nssm` or download from nssm.cc)
- [ ] `apps/print-agent/dist/` copied to máy POS (sau khi rebuild qua `pnpm build`)
- [ ] `.env` đặt tại `apps/print-agent/dist-bin/.env` chứa:
  ```
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service role JWT>
  AGENT_TENANT_ID=<numeric>
  AGENT_BRANCH_ID=<numeric>
  AGENT_ID=pos-<branch-slug>
  AGENT_VERSION=0.4.0
  ```
  > **Note**: bump `AGENT_VERSION` mỗi release (sync với `package.json`).
  > SQL view `v_print_agent_fleet` dùng version này để xác định fleet status.
- [ ] Run `apps\print-agent\scripts\install-service.ps1` as Administrator
- [ ] `Get-Service ComTamMaTu-PrintAgent` → `Running`
- [ ] `C:\ProgramData\ComTamMaTu\print-agent\logs\agent.out.log` shows
      `realtime status=SUBSCRIBED` within 10 seconds
- [ ] POS header shows **"Máy in: online"** badge (green)

### Smoke test (staff manager on site)

1. Open a test order, add one kitchen-routed item + one non-routed item.
2. Click **"Gửi bếp"** → one kitchen ticket prints within 3 seconds; toast shows
   `Đã gửi bếp (lần 1, 1 tem)`.
3. Close the order → receipt prints.
4. Power off the kitchen printer. Click **"Gửi bếp"** again on a new order.
5. Open `/admin/settings/printers/jobs` → the job is in `failed` with a
   `connect ECONNREFUSED` or `timed out after 5000ms` message.
6. Power the printer back on, click **Thử lại** → job transitions to `printed`
   within 3 seconds; `retry_count = 1` in the monitor table.

Document completion: tick this checklist, sign, file with branch opening checklist.

## 1. Daily operational checks (shift open)

- Open POS → header shows green **Máy in: online**.
- Open `/admin/settings/printers/jobs` → KPI **Agent online: 1 / 1**, no
  `failed` rows from last 24h.
- If red or numbers don't line up → follow §3 troubleshooting BEFORE opening shift.

## 2. During service — standard flow

| Action at POS                         | System behaviour                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Add items, click **Gửi bếp**          | `enqueue_kitchen_print` → 1-2 jobs inserted → agent claims → ticket(s) print                  |
| Click **In hoá đơn** on an open order | `enqueue_receipt_print` → 1 job → receipt prints                                              |
| Retry a failed job                    | Manager opens monitor → **Thử lại** → job back to `pending` with audited `last_retried_by/at` |

Idempotency: repeated clicks within the same second-bucket produce the same
`idempotency_key` and are deduped at the DB (no double printing).

## 3. Troubleshooting

### 3.1 POS badge stuck on "Offline" or "Chưa có"

1. On the POS PC: `Get-Service ComTamMaTu-PrintAgent`.
   - `Stopped` → `Start-Service ComTamMaTu-PrintAgent`.
   - `Not found` → re-run `install-service.ps1` as Administrator.
2. Tail `agent.err.log` — look for:
   - `Missing env ...` → fix `.env` and restart service.
   - `realtime status=CHANNEL_ERROR` → verify `SUPABASE_SERVICE_ROLE_KEY`
     and that `print_jobs` is in the `supabase_realtime` publication.
3. Badge updates within ~30s of agent recovery (heartbeat interval).

### 3.2 Ticket does not print

1. Open `/admin/settings/printers/jobs`, filter `status = failed`.
2. Read the `last_error`:
   - `connect ECONNREFUSED <host>:9100` → printer unreachable; check PoE/power
     and LAN cable.
   - `printer <host>:<port> timed out after 5000ms` → printer reachable on layer
     3 but not accepting raw socket; check it's not paused/offline on its panel.
   - `printer <id> not in cache / inactive` → someone flipped `is_active=false`;
     re-enable at `/admin/settings/printers` and wait up to 5 minutes OR restart
     the service for instant refresh.
3. Fix the hardware, then click **Thử lại** on each failed job.

### 3.3 Agent missed realtime events (rare)

The agent has a **Pending drain loop** every 60 seconds as a safety net —
jobs in `pending` will be picked up even if a realtime INSERT event was missed.
No manual action required.

### 3.4 Duplicate tickets

Should not happen because of `UNIQUE(idempotency_key)`. If it does:

1. Inspect both rows in `/admin/settings/printers/jobs`.
2. If the second row has a different `idempotency_key`, the duplicate came from
   an extra click that triggered a new `send_seq` — this is expected user
   behaviour, not a bug.
3. If the second row has the same key: escalate — DB constraint was dropped.

## 4. Offline fallback (printer + agent both down, cannot recover in 5 min)

**Do not stop service.** Switch to manual ticket mode until printing resumes.

### 4.1 Immediate actions

1. Cashier announces **"Chuyển sổ bếp tay"** to the kitchen.
2. Cashier writes manually on pre-printed "bếp tay" carbon pads:
   - Order number (read from POS cart header: e.g. `TC-BAN5-003`)
   - Table / Mang về
   - Items + quantities + notes
3. Runner delivers carbon copy to the kitchen; POS order is still saved normally.

### 4.2 POS behaviour during fallback

- **Keep clicking "Gửi bếp"** — it still enqueues jobs to `print_jobs` (RLS
  allows insert even when the agent is offline). Jobs queue up in `pending`.
- **Keep taking payments** — `enqueue_receipt_print` also queues successfully.
  Hand-write receipts on paper if the customer requests a copy.

### 4.3 When printers come back

The agent's **pending drain** (every 60s) will flush the backlog automatically.
If the backlog is more than ~30 tickets and would swamp the kitchen, a manager
can bulk-cancel stale jobs:

```sql
-- run via Supabase SQL editor, branch-scoped
UPDATE public.print_jobs
   SET status = 'cancelled', last_error = 'bulk cancel after outage'
 WHERE branch_id = <id>
   AND status = 'pending'
   AND created_at < now() - INTERVAL '15 minutes';
```

Open `/admin/settings/printers/jobs` and confirm the pending count drops to the
expected live backlog only.

### 4.4 Post-incident

- Collect carbon ticket pad, reconcile with POS orders at end of shift.
- Branch manager files an incident note with start time, end time, root cause
  (power / network / printer hardware / agent service).

## 5. Rollout checklist (2-week pilot → fleet)

| Day   | Milestone                                                     | Owner           |
| ----- | ------------------------------------------------------------- | --------------- |
| D0    | Pilot branch pre-flight (§0) complete                         | Branch manager  |
| D0    | Smoke test signed off                                         | Ops lead        |
| D1–D3 | Daily check-in at 08:30 — badge green, 0 stuck `failed` jobs  | Branch manager  |
| D7    | Mid-pilot review — failed job count, MTTR, retry success rate | Ops + Eng       |
| D14   | Go/no-go decision for fleet rollout                           | Ops lead        |
| D14+  | Fleet rollout: 1 branch per day, same checklist               | Branch managers |

Go criteria for fleet rollout:

- Fewer than 2 `failed` jobs per branch per day that required manual retry.
- Agent uptime ≥ 99% measured by `printer_agent_status.is_online`.
- Zero reports of duplicate tickets.
- Cashiers + chefs can operate the offline fallback end-to-end within 5 minutes.

## 6. References

- Agent source: [apps/print-agent/README.md](../../../apps/print-agent/README.md)
- Install script: [apps/print-agent/scripts/install-service.ps1](../../../apps/print-agent/scripts/install-service.ps1)
- Admin monitor: `/admin/settings/printers/jobs`
- DB schema: `supabase/migrations/20260423140000_printing_foundation.sql`,
  `supabase/migrations/20260423150000_enqueue_print_rpcs.sql`,
  `supabase/migrations/20260423160000_print_job_retry_audit.sql`
