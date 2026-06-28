# Audit 2026-06-28 — `tasks/todo.md` Outstanding-Item Triage

**Date:** 2026-06-28
**Lane:** Synthesis (read-only). No code/migrations/prod were mutated.
**Method:** Every open item ([ ] / [~]) across three todo.md sections was verified against the **actual current code, git history, `supabase/migrations/` (+ `_archive/`), the PROD migration ledger (`list_migrations`), live PROD `pg_proc`/`pg_settings`/`pg_stat` (SELECT-only), and `docs/plan/decisions.md`** — never against the todo's own prose, which is known to drift.

## Executive Verdict

The system is healthy; the open backlog is mostly **(a) telemetry/ops toggles the owner can flip now, (b) owner accounting/semantics decisions that block otherwise-specced builds, and (c) a small set of genuinely agent-doable engineering items.** Several items are **stale** — already shipped to prod or made obsolete by a decision — and inflate the perceived backlog. Closing them is the single highest-leverage cleanup. Two cross-cutting facts every reader should hold:

- **Prod migrations are MANUAL by design.** PROD ledger HEAD = `20260628082254 count_slip_drop_submit_perm`. The Supabase "main" branch shows `MIGRATIONS_FAILED` *intentionally* (baseline-first is incompatible with Supabase auto-deploy/reconcile). Migration files newer than HEAD (`20260628120000` refund-void DRAFT, `20260628130000`, `20260628140000`) are correctly **not** applied — they follow file → PR → owner-apply.
- **Telemetry is OFF on prod.** `track_functions = none`, `pg_stat_database.stats_reset = NULL`. Every "drop dead RPC / unused index" item is blocked on a one-time ops toggle, **not** on code, and must NOT be actioned on current (unrepresentative) stats.

### Counts

| Classification | Count |
|---|---|
| Agent-doable now | 5 |
| Owner-decision needed | 8 |
| Blocked — runtime | 5 |
| Blocked — other (ops/telemetry) | 5 |
| Deferred — still parked (correctly) | 18 |
| **Already-done / stale / obsolete (close or update doc)** | **6** |

(Some items carry two tags, e.g. an ops-blocked item that is also a deferral; primary classification is used for the count. Totals reflect the 44 distinct open/parked items triaged below.)

---

## 1. Stale — Already Done / Obsolete (update the checkbox)

These shrink the perceived backlog. Each carries proving evidence so the owner can clean `tasks/todo.md` immediately.

| Item | todo marker | Why it's stale | Proving evidence |
|---|---|---|---|
| **Residual broad grants** | `[~]` | The cosmetic-grant / secdef revokes are folded into baseline and **applied to prod**. Item's own text says "Không còn code task". The remaining `auth_role()`/`bmidl_write` tail was split out to the α4c item. | Revoke files in `supabase/migrations/_archive/{20260616120000_revoke_cosmetic_grants_anon_authenticated, 20260616170000_revoke_anon_execute_secdef}.sql`, folded into `00000000000000_baseline.sql`. PROD ledger: `20260619053334 ...revoke_cosmetic_grants...` and `20260616130609 ...revoke_anon_execute_secdef`. → **Close.** |
| **HRM Đợt 2 (D026)** | `[~]` | Item still lists "owner apply migration 20260627121500 lên prod" as remaining, but that migration **is in the prod ledger** (renamed at apply). Only owner runtime-verify of the 2-way leave notification remains. | PROD ledger: `20260626191422 hr_leave_result_notification` = file `supabase/migrations/20260627121500_hr_leave_result_notification.sql`. todo `Shipped` line + D047 both say "applied to prod 2026-06-27". Code merged `48781506`. → **Drop the stale "apply migration" remainder.** |
| **Inventory legacy backfill (Kho CN → Bếp CN)** | `[x]` | Already closed by a read-only dry-run (legacyTransferCount=0). Listed here only because it sits in the Deferred block. | Marked `[x]`; closed 2026-06-22 (dry-run, 0 rows). → **Optionally move to `Shipped` on next tidy.** |
| **M5-Ext S8 / M7 residual (GL posting)** | `[ ]` | **Obsolete** while Má Tư is HKD. Double-entry GL was retired by D020; `journal_entries` is empty. | `journal_entries` count=0 in baseline; `_archive/20260614100000_d020_retire_enterprise_gl.sql`. Item text itself invites "re-scope hoặc đóng". → **Owner may formally close.** |
| **voidJournalEntry closed-period void** | `[ ]` | **Obsolete** — the code it describes no longer exists; GL retired by D020. | `rg voidJournalEntry` across apps/+packages = 0 hits; `statement-actions.ts` does not exist. → **Keep parked as N/A-while-HKD; code already removed.** |
| **Audit `insurance_base_salary`/`gross_salary` — schema-absent sub-premise** | `[ ]` | The "schema absent" rationale is now **stale**: the migration adding these columns + sync trigger is applied. The *defer itself* still holds (0 contract rows). | `20260626144240_hr_contracts_insurance_payroll.sql` applied (ledger `20260626162746`). PROD: `employment_contracts`=0 rows, `employees_with_base`=0. → **Update the note (schema now exists); keep deferred until contracts carry data.** |

> **Cross-cutting stale reference (not an item, but worth fixing):** the audit section claims a sibling `security-definer-rpc-static.test.ts` is `[x]` and that the "RPC-grants over-broad" scan "supplements" it. **That test does not exist** (`apps/web/tests/` has only `rpc-error-map.test.ts`). The companion `auth-intermediate-scope-static.test.ts` *does* exist (`packages/shared/src/auth/__tests__/`). Restore/verify the missing static test before building anything that claims to extend it.

---

## 2. Agent-Doable Now (sorted by priority, then effort)

| Item | Next action | Evidence | Effort | Prio |
|---|---|---|---|---|
| **HRM payroll export (CSV)** | Build payroll-period **CSV export** (no DB change). The pre-approve reconciliation view already exists in `[periodId]/payroll-detail-client.tsx`; CSV-first is the agent-doable tail. | `calculatePayroll` reads `employees.base_salary` + `employment_contracts.gross_salary` fallback, atomic `upsert_payroll_calculation` per D041 (`hr/payroll-actions.ts:234,242,288,429,459`). **0** export/csv/xlsx/download hits in payroll list/detail clients (verified). | M | P2 |
| **CI scan: RPC grants over-broad** | First **verify/restore** the missing `security-definer-rpc-static.test.ts`, then add a static test scanning new migrations for `GRANT EXECUTE ... TO authenticated/anon` on SECURITY DEFINER fns lacking an in-body authz boundary. | No such test exists (grep of `apps/web/tests/*.test.ts` + `scripts/*.mjs` = 0). The companion static test it claims to supplement is absent. | M | P2 |
| **Surface swallowed DB-read errors** | Roll out **per-shell**: log `error.code`/`details` server-side (never to client) across remaining Server Actions. Broad surface → shell-by-shell, no mega-PR. | Hot paths already branch on `error.code` (`inventory/production-recipe-actions.ts:728-736` handles UNIQUE_VIOLATION/INSUFFICIENT_PRIVILEGE/INVALID_TEXT); 42702 ambiguous-branch_id documented at `finance/actions.ts:578`. But **no systematic logging contract/guard**; most actions return generic messages. `database.md` lists 42702 under Known Failure Patterns. | L | P2 |
| **α4c — remove `can_access_branch`** | Write an **RLS regression test** proving the 4 policies behave identically without `can_access_branch`, THEN author the drop migration (file → PR → owner-apply). Testable on the e2e bring-up; does **not** need preview-branch. | PROD `pg_proc`: `can_access_branch` count=1 (still live). baseline.sql has 12 refs incl. 4 RLS policies. Static guard `packages/shared/src/auth/__tests__/auth-intermediate-scope-static.test.ts` exists; no RLS regression test yet. | M | P3 |
| **WS-3 split (`pos-desktop-shell` + `order-detail-sheet`)** & **design-system surface tails (W5 + POS/KDS 7)** | Now unblockable via D047 preview / Vercel Preview: split into `_hooks/` + `views/` (goal = concern-separation, **not** LoC), then visually verify realtime channel + the 8 surface tails in a running app. One PR per file/surface. No owner decision. | Files exist with realtime `.channel()`: `apps/web/app/(protected)/br/[branchId]/pos/{pos-desktop-shell,order-detail-sheet}.tsx`. Static DS subset shipped 2026-06-22 (`b3433fec`); runtime visual verify still pending. | M | P3 |

---

## 3. Owner Decisions Needed (phrased as one-pass questions)

1. **Metric definition (blocks dashboard polish).** `grossProfit = netRevenueBeforeVat − ingredientCost` is a temporary formula (`finance/_lib/finance-cockpit.ts:173`; D028 still Open). **Q:** (a) Is `doanh thu` = HĐĐT-issued (P&L basis) or cash-collected? (b) For `lãi gộp`, which deductions beyond `ingredientCost` are in scope? *Agent cannot guess co-founder accounting intent.*

2. **Completion-auth tightening (D043 defer).** `create_payment` gates only `pos:use` (baseline:6952) and flips `payment_status='paid'` on completion, while `confirm_cash_payment` requires `pos:confirm_payment` (baseline:4952). A `pos:use`-only operator can therefore COMPLETE a cash payment via `createPayment` (`payment-actions.ts:596`). **Q:** Require `pos:confirm_payment` to *complete* payment (change `create_payment` RPC + action + route cash-bill UI through confirm)? Or keep D043 deferred? *Until un-deferred, leave as-is.*

3. **Split-invoice / `record_partial_payment` (D031c).** **Q:** Is N-partial-payments-per-order still wanted? PROD `pg_proc record_partial_payment`=0, 0 code refs, D031 Status = "CHƯA build". Build is well-specced (1 atomic migration: drop partial-unique index on `payments(order_id)`, loosen amount gate, add `record_partial_payment` RPC w/ FOR UPDATE+SUM, flip order→paid when SUM≥total). If yes → agent-doable as file → PR → owner-apply.

4. **HRM Đợt 3 (payroll).** Much of the todo prose is **stale** — `standard_days`, `calculatePayroll`, annual-leave + insurance migrations, atomic upsert (D041) are all shipped/applied. **Q:** Confirm "drop Excel payroll" (D026 §3). Remaining agent tail = CSV/Excel export + pre-Duyệt reconciliation view + PIT-on-slip + 5-tab→3-axis IA. *Confirm before building export.*

5. **HRM IA still open (payroll-in-nav / staff merge / selfie check-in).** **Q:** (a) Put payroll in nav or keep intentionally hidden? (b) *Partly stale:* `/admin/staff → /hr` already merged in Task3/D048 — anything left? (c) Is selfie check-in used, or drop it?

6. **F-018 Supplier "Khác".** GRN still requires positive `supplierId`. **Q:** Pick one — (A) require a real formal supplier row, (B) add a "Mua ngoài"+note path, or (C) a generic "Khác" supplier? *No build until chosen.*

7. **`transfer_ownership(p_new_user_id)` RPC + UI.** PROD `pg_proc`=0; ADR 0005 designs it but defers until the RPC ships; `tenants.owner_user_id` col is shipped (`20260601500000`). **Q:** Semantics — instant vs 2-phase transfer; sync `tenants.representative`?; audit-log shape; gate = current-owner-only? *Manual SQL UPDATE is an acceptable pilot workaround; agent can build once chosen.*

8. **GL posting residual (M5-Ext S8 / M7).** **Q:** Formally close as N/A-while-HKD (D020/D012), or keep parked? *Not agent-actionable either way — owner's call.*

---

## 4. Blocked

### 4a. Runtime-blocked (preview/CI/hardware)

| Item | What blocks it | What unblocks it |
|---|---|---|
| **Reconcile remaining e2e specs (#110)** | CI pins `payment-cash` only (`ci.yml` runs `test:e2e:smoke` = `playwright … payment-cash`). 7 specs un-gated: `apps/web/e2e/{kds-queue,daily-limit-realtime,edit-pending-pricing,payment-vietqr}.spec.ts` + `e2e/inventory/{grn-procurement,issue-label-by-branch-kind,transfer-direction}.spec.ts`. Documented CI multi-spec hang on 2-core runner. | Root-cause the hang first (bigger runner OR split jobs OR replace `waitForLoadState('networkidle')` with explicit element waits), then re-add one spec per PR. Start with `payment-vietqr` (green locally). **Effort L, P2.** |
| **Preview-branch runtime (D047)** | LIVE for ephemeral PR branches; PROD branch "main" = `MIGRATIONS_FAILED` (protective, by design). | Owner: confirm GitHub Actions billing on; verify/disable the Supabase "deploy to production" branching setting. **Do not "fix" the failed main branch.** S, P2. |
| **Real POS→payment→KDS/print→HĐĐT smoke** | POS→payment→KDS leg is **DONE** (CI-smoked in #110, commit `8c667487`). Print-agent + HĐĐT legs need live provider creds + a physical printer. | Owner schedules a live smoke on a real branch terminal. *Do not re-open the POS→KDS leg.* M, P2. |
| **Dead-RPC candidates (Phase-B keep/defer list)** | `track_functions=none` blocks confirmation. `get_daily_revenue` is a confirmed static orphan (1 in PROD `pg_proc`, 0 callers). | Same toggle as 4b below; once telemetry confirms, `get_daily_revenue` is the strongest drop candidate (still per RPC-DROP-MUST-SCAN-6-CHANNELS). S, P3. |
| **WS-3 split / DS surface tails / α4c** | Need a running app (RLS/realtime/visual verify). | D047 preview unblocks the first two; α4c needs only the e2e bring-up. (Listed as agent-doable above once preview is up.) |

### 4b. Blocked — ops/telemetry toggle (owner can flip now; no code)

| Item | Blocker (PROD-confirmed) | Unblock |
|---|---|---|
| **Unused indexes (~231)** | `pg_stat_user_indexes`: 632 total / 433 never-scanned, BUT `pg_stat_database.stats_reset = NULL` → idx_scan=0 is **not trustworthy**. | Reset pg_stat (or record a known reset point), let ≥1 full cycle incl. month-end accrue, THEN scan + DROP in a wave. **Never DROP on current stats.** S, P3. |
| **Dead-RPC drop wave 2** | `track_functions='none'` → `pg_stat_user_functions` unusable. Phase-B static scan = 0 Tier-A safe-without-telemetry. | Set `track_functions='all'` (or `'pl'`) + accrue one cycle, THEN run the 6-channel scan → wave ≤10. S, P3. |
| **Uptime monitor `/api/health`** | Route is built (`apps/web/app/api/health/route.ts`, 36 lines); only external wiring missing. | Owner registers UptimeRobot to ping it. Close once registered. S, P3. |
| **Print-agent deploy** | Pure ops/hardware. `apps/print-agent` v1.0.0; infra in baseline via #109; smoke script present. | Owner deploys v1.0.0 to 3 branches (Phước Hải on 0.2.0) + `PRINTER_HOST=<ip> pnpm test:print` per branch. M, P2. |
| **`cron_run_log` + alert** | No `cron_run_log` table anywhere (PROD `to_regclass`=NULL; 0 in baseline+all migrations). Only hddt has a partial run-log. | Write migration: run-log table + instrument `cron_*` RPCs/routes + alert producer into `notifications` on fail/stale → file → PR → owner-apply (no dev DB; `guard-prod-db.mjs`). *Agent-authorable but apply is owner/ops.* L, P2. |

---

## 5. Deferred — Still Parked (correctly)

**Verdict: every parked item is still correctly deferred — nothing to promote, nothing silently shipped.** Two had their *premises* shift via recent migrations but PROD facts keep the deferral intact (noted in §1: refund full-void via D049 ≠ partial-refund; insurance columns exist but 0 contracts).

- **POS calls provider before DB lock** — DEFER-WITH-MITIGATION holds; 23505 idempotency present (baseline:191-209 `idempotency_key` + `ON CONFLICT DO NOTHING`; `createPaymentRpcMappings`).
- **HĐĐT e-invoice post-pilot** — needs live provider creds + pilot cancel-flow experience; nothing in git since 2026-06-22.
- **Refund partial-refund T3** — D049 + DRAFT `20260628120000_pos_refund_void_after_paid.sql` add **full-void only** (`refund_paid_order`, GRANTed to authenticated); explicitly keeps hoàn-một-phần/per-item at Owner+Kế toán. PROD: `refund_paid_order`/`record_partial_payment`=0 (not applied). **Do NOT promote.**
- **H3b `has_permission()` dual-source flip** — tripwire per ADR 0005; owner-bypass still `positions.code='owner'` (baseline:27653 COMMENT); flip only on a 2nd silent-demote incident.
- **F-009 Stock master-detail drawer** — UX nicety; `stock-client.tsx` still side-panel.
- **P3 login rate-limit fail-open** — blocked on `security_events` table (PROD `to_regclass`=NULL; no migration). Agent-doable only if owner pulls that wave forward.
- **Inventory unbuilt scaffolds (E4)** — scaffolds correctly deleted per D031 (rg = 0 refs to `closeRecountRound`/`escalateRound4`/`finalizeStocktake`/etc.); rebuild only on real requirement.
- **Automated E2E + staging + periodic inventory smoke** — actionable remainder lives in §4a (#110), not this block.
- **`Post-v1.0` Tier 2 (all parked, unchanged):** `QR Self-Order` tại bàn (0 feature surface), `Loyalty`/`Vouchers` (0 surface), `Advanced Analytics` (interim metric only), Employee-portal full features (base portal shipped 2026-06-09; full expansion parked).

**Promote/close recommendations:** GL items (M5-Ext S8/M7, voidJournalEntry) → owner may **formally close** as N/A-while-HKD (obsolete code already removed). Insurance-audit note → **update** (schema now exists). Everything else → leave parked.

---

## 6. Top Recommendations (highest-value next moves)

1. **Clean the 6 stale items in §1 now** (no code) — shrinks the backlog and removes false "remaining" work (esp. HRM Đợt 2's already-applied migration and the residual-grants close).
2. **Get one owner decision on the metric definition (§3.1)** — it is the cheapest unblock and gates all dashboard/finance polish.
3. **Flip the two prod telemetry toggles (§4b)** — `stats_reset` + `track_functions='all'`. One ops action unblocks BOTH the unused-index wave and dead-RPC wave 2; otherwise they sit forever.
4. **Restore the missing `security-definer-rpc-static.test.ts`, then ship the over-broad-RPC-grant CI scan (§2)** — closes a real security-tooling gap and an inaccurate `[x]`.
5. **Build the HRM payroll CSV export (§2)** — small, no DB change, the reconciliation view already exists; pair with owner confirming "drop Excel payroll" (§3.4).
6. **Root-cause the CI e2e multi-spec hang (§4a) and re-add `payment-vietqr` first** — unblocks the whole #110 reconcile lane that several items depend on.
7. **Get the D043 completion-auth decision (§3.2)** — a real privilege gap (`pos:use`-only operator can complete cash payment); owner should explicitly keep-deferred or fix.
8. **Spin a D047 preview branch and clear the running-app lane in one pass** — WS-3 split + the 8 DS surface tails + α4c RLS regression test are all gated only on a running app, not on any owner decision.
