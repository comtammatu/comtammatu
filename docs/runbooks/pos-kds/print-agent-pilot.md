# Print Agent — Pilot Rollout & SOP

Runbook for deploying the thermal print agent to a pilot branch and the offline
fallback procedure when a printer or agent fails mid-service.

## Scope

- **System**: `@comtammatu/print-agent` (Node 24 + Supabase Realtime, LAN-only)
- **Topology**: 1 agent process per branch, 3 printers per branch
  (`receipt`, `kitchen_1`, `kitchen_2`)
- **Target**: 1 pilot branch for 2 weeks, then fleet-wide rollout

## 0. Pre-flight — once per branch

Complete all items before opening the branch for the day.

### Database (tenant admin)

- [ ] Branch exists and is active
- [ ] `/admin/settings/printers` — 3 printer rows (`receipt` / `kitchen_1` / `kitchen_2`),
      all `is_active = true`
- [ ] `lan_host` + `lan_port` (default 9100) filled for every printer; reachable
      from the POS PC subnet (`nc <host> 9100` to verify)
- [ ] `/admin/settings/printers` — each branch kitchen printer has the right
      print types (`kitchen_ticket`, `cancel_ticket`) and menu categories assigned.
      Categories not assigned to a branch printer are not included in kitchen tickets.
- [ ] Cashier accounts have `pos:send_kitchen` for POS order dispatch; chef
      accounts have `kds:mark_ready` for completion-triggered kitchen paper;
      receipt operators have `pos:print` (auto-provisioned via role template)
- [ ] Presence token registered for this branch agent through the repo CLI:
  ```
  pnpm --filter @comtammatu/print-agent presence:provision -- create \
    --tenant-id <tenant_id> \
    --branch-id <branch_id> \
    --agent-id pos-<branch-slug> \
    --confirm-project-ref <project-ref>
  ```
  The command prints the raw token once for the branch agent `.env`; the web
  database stores only the SHA-256 hash. Use `rotate`, `revoke`, and `status`
  from the same command for later changes.

### Windows PC per branch

- [ ] **Node.js 24+** installed (`node --version` ≥ v24). Download from nodejs.org.
- [ ] NSSM installed (`choco install nssm` or download from nssm.cc)
- [ ] Bundle unzip vào máy POS (build qua `pnpm --filter @comtammatu/print-agent build` + `scripts/build-bundle.sh` — chỉ cần `dist/index.js`)
- [ ] `.env` đặt tại thư mục gốc bundle (cạnh `dist/`) chứa:
  ```
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service role JWT>
  AGENT_TENANT_ID=<numeric>
  AGENT_BRANCH_ID=<numeric>
  AGENT_ID=pos-<branch-slug>
  AGENT_VERSION=0.3.0
  WEB_BASE_URL=https://<app-host>
  PRINT_AGENT_PRESENCE_TOKEN=<raw per-agent token>
  ```
  > **Note**: bump `AGENT_VERSION` mỗi release (sync với `package.json`).
  > SQL view `v_print_agent_fleet` dùng version này để xác định fleet status.
  > `PRINT_AGENT_PRESENCE_TOKEN` là token riêng của agent này, không dùng chung
  > giữa các chi nhánh. Token được tạo/xoay/thu hồi bằng
  > `pnpm --filter @comtammatu/print-agent presence:provision -- ...`; không
  > thao tác trực tiếp trên Supabase Dashboard.
- [ ] Run `apps\print-agent\scripts\install-service.ps1` as Administrator
- [ ] `Get-Service ComTamMaTu-PrintAgent` → `Running`
- [ ] `C:\ProgramData\ComTamMaTu\print-agent\logs\agent.out.log` shows
      `realtime status=SUBSCRIBED` within 10 seconds
- [ ] POS header shows **"Máy in: online"** badge (green)

### Smoke test (staff manager on site)

1. Open a test order, add one kitchen-routed item + one non-routed item.
2. Click **"Gửi bếp"** → the order appears on KDS; no kitchen paper prints yet.
3. On KDS, click **Hoàn thành** for one kitchen item → one kitchen ticket prints
   within 3 seconds and contains only that completed item.
4. Complete the remaining kitchen item(s) on KDS → the next kitchen ticket
   contains only the remaining completed item(s).
5. Close the order → receipt prints.
6. Power off the kitchen printer. Create a new order, then click **Hoàn thành**
   on KDS for one routed item.
7. Open `/admin/settings/printers/jobs` → the job is in `failed` with a
   `connect ECONNREFUSED` or `timed out after 5000ms` message.
8. Power the printer back on, click **Thử lại** → job transitions to `printed`
   within 3 seconds; `retry_count = 1` in the monitor table.

Document completion: tick this checklist, sign, file with branch opening checklist.

## 1. Daily operational checks (shift open)

- Open POS → header shows green **Máy in: online**.
- Open `/admin/settings/printers/jobs` → KPI **Agent online: 1 / 1**, no
  `failed` rows from last 24h.
- If red or numbers don't line up → follow §3 troubleshooting BEFORE opening shift.

## 2. During service — standard flow

| Action at POS                         | System behaviour                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Add items, click **Gửi bếp**          | Order + KDS tickets are created. Categories not shown on KDS but routed to a kitchen printer, such as drinks, print immediately |
| KDS clicks **Hoàn thành** for item(s) | KDS-visible items call `complete_kds_tickets` → matching `print_jobs` inserted → agent claims → ticket(s) print                 |
| Click **In hoá đơn** on an open order | `enqueue_receipt_print` → 1 job → receipt prints                                                                                |
| Retry a failed job                    | Manager opens monitor → **Thử lại** → job back to `pending` with audited `last_retried_by/at`                                   |

Idempotency: KDS completion print keys include the completed ticket IDs, so a
retry of the same completion does not double-print, while a later completion of
remaining active items creates a separate kitchen ticket.

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

### 4.2 POS / KDS behaviour during fallback

- **Keep clicking "Gửi bếp"** on POS to create orders and keep KDS accurate.
  This no longer enqueues kitchen paper.
- **Keep clicking "Hoàn thành"** on KDS when kitchen work is actually done.
  These completion actions enqueue the kitchen print jobs; if the agent or
  printer is offline, jobs queue in `pending`/`failed` for retry.
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
