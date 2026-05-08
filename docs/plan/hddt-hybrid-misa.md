# HĐĐT Hybrid via MISA meInvoice — Plan

> **Status:** ✅ **SHIPPED 2026-05-08** — PR-1 → PR-7 merged. Cutover gated trên owner action items (xem `docs/runbooks/hddt-hybrid-cutover.md`).
> **Owner:** ngocnghia128@gmail.com
> **Pre-req:** Owner đăng ký template "HĐ tổng hợp B2C" với CQT qua MISA / Sinvoice portal (D7, leadtime 3-7 ngày, song song với coding).
> **Carryover blocker (resolved):** Bổ sung provider Viettel Sinvoice bên cạnh MISA (`packages/shared/src/providers/impl/viettel-sinvoice.ts:115-426`) — không còn phụ thuộc 1 vendor. Owner chốt provider thực tế khi mở account prod.

## Goal

Triển khai HĐĐT hybrid qua **MISA meInvoice** cho mô hình F&B CTCP:

- **B2B realtime** (per-order): khách có MST → cashier xuất HĐ ngay tại quầy. Refactor `createTaxInvoice` sang state machine `draft → signing → issued`.
- **B2C daily batch**: cron 02:00 ICT mỗi ngày + admin manual trigger → gộp orders B2C `paid` của ngày hôm trước thành **1 HĐ tổng hợp/chi nhánh/ngày** với line items per VAT-rate (TT 78/2021 §11.4).

Quyết định nền (D1–D7, owner ký 2026-05-08):

| # | Quyết định | Rationale |
|---|---|---|
| D1 | Service-role cron qua RPC overload `transition_tax_invoice_state_as_system(p_actor UUID, ...)` gated `auth.role() = 'service_role'` | Cron không có `auth.uid()`; explicit security boundary, không leak service role qua user JWT |
| D2 | DROP D4 `not_required` short-circuit cho B2C orders. Batch là source of truth | Đơn giản; `not_required` rows thành noise sau khi batch ship. B2B path unchanged |
| D3 | Refund-after-batch: manual qua MISA portal cho pilot (kế toán xử lý ngoài hệ thống) | Pilot ~30-50 refund/tháng; HĐ điều chỉnh tự động defer đến P1 |
| D4 | Late B2B request: cùng ngày (chưa cron) → cashier xuất HĐ B2B riêng. Sau cron → UI từ chối với message rõ | Option C — kế toán-friendly, không cancel summary HĐ |
| D5 | Cron 02:00 ICT ngày sau (`schedule: "0 19 * * *"` UTC), `summary_date = yesterday in VN` | Capture trọn ngày, kế toán sáng xem dashboard đã có HĐ |
| D6 | Cross-month cancel: soft warning UI, KHÔNG hard-block. Defer permission `tax:close_period_override` đến formal period-close feature | Hệ thống chưa có infra "đóng kỳ kế toán" |
| D7 | Owner đăng ký template "HĐ tổng hợp B2C" với CQT qua MISA portal | Pre-req pháp lý, owner action item ngoài code |

## Scope

### IN

**B2B realtime path** (refactor existing):
- `createTaxInvoice` action → state machine `draft → signing → issued/draft` qua RPC
- Deterministic `transactionUuid = sha256(tenant_id || order_id || attempt_seq)` persist trước MISA call
- Per-line VAT (giữ logic `actions.ts:128-186`)
- D4 `not_required` short-circuit: **DROP** (per D2) — không insert `not_required` row nữa cho không-MST. Schema enum giữ nguyên (legacy rows tồn tại) nhưng action không chèn mới.

**B2C daily batch path** (new):
- Schema: `tax_invoices` thêm cols + `tax_invoice_orders` junction + `summary_run_queue` queue
- RPC `aggregate_daily_b2c_invoice(p_branch_id, p_summary_date, p_actor)` — chỉ lock + insert draft + junction (KHÔNG gọi MISA)
- RPC `transition_tax_invoice_state_as_system(p_invoice_id, p_to_status, p_actor, p_payload, p_note)` — overload cho service-role cron
- Vercel cron `/api/cron/hddt-daily-summary` + admin manual trigger `/admin/finance/summary`
- Skip-and-continue per branch failure
- Audit log mọi trigger (cron vs manual + actor_id)

**Shared:**
- Reuse `MisaProvider` (`packages/shared/src/providers/impl/misa.ts`) — không code provider mới
- 1 SQL helper `_compute_vat_breakdown(p_order_ids BIGINT[])` reuse cho cả 2 paths
- 12 regression rules thêm vào `tasks/regressions.md`

### OUT (defer to follow-up tickets)

| # | Item | Lý do defer |
|---|---|---|
| 1 | HĐ thay thế TT 78 (`issued → replaced`) | Pilot không cần; matrix sẵn |
| 2 | HĐ điều chỉnh giảm cho refund-after-batch | Pilot manual qua MISA portal |
| 3 | Provider config encrypted DB | Env-only đủ cho single-tenant CTCP |
| 4 | PDF/XML download UI cho khách | Link MISA portal đủ pilot |
| 5 | Multi-template HĐ | 1 template B2B + 1 template summary đủ |
| 6 | Period-close formal infra + permission `tax:close_period_override` | Hệ thống chưa có khái niệm "đóng kỳ" |
| 7 | Reconcile cron orphan `signing` cho summary HĐ | Add sau pilot khi có volume thực |
| 8 | Webhook MISA inbound (push status) | Polling qua manual retry đủ pilot |
| 9 | Native cancel 1 order trong summary HĐ | Cần HĐ điều chỉnh — cùng cụm với #2 |

## Schema changes

### Migration 1 — `tax_invoices` extension + junction + queue

```sql
-- A. tax_invoices: cho phép order_id NULL + thêm cols summary
ALTER TABLE public.tax_invoices ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.tax_invoices
  ADD COLUMN summary_date         DATE,
  ADD COLUMN summary_orders_count INTEGER,
  ADD COLUMN invoice_kind         TEXT NOT NULL DEFAULT 'per_order'
    CHECK (invoice_kind IN ('per_order', 'daily_summary'));

ALTER TABLE public.tax_invoices ADD CONSTRAINT chk_invoice_kind_shape CHECK (
  (invoice_kind = 'per_order'
     AND order_id IS NOT NULL
     AND summary_date IS NULL)
  OR (invoice_kind = 'daily_summary'
     AND order_id IS NULL
     AND summary_date IS NOT NULL
     AND summary_orders_count IS NOT NULL)
);

-- B. UNIQUE partial cho idempotent batch (Q2 resolved: 1 HĐ multi-rate per branch+date)
CREATE UNIQUE INDEX uq_tax_invoices_active_per_summary
  ON public.tax_invoices (tenant_id, branch_id, summary_date)
  WHERE invoice_kind = 'daily_summary'
    AND status NOT IN ('cancelled', 'replaced');

-- C. Junction table — 1 order chỉ thuộc 1 summary HĐ active
CREATE TABLE public.tax_invoice_orders (
  tax_invoice_id  BIGINT NOT NULL REFERENCES public.tax_invoices(id) ON DELETE CASCADE,
  order_id        BIGINT NOT NULL REFERENCES public.orders(id)       ON DELETE RESTRICT,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id)      ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id)     ON DELETE CASCADE,
  vat_rate        NUMERIC(5,2)  NOT NULL,
  line_subtotal   NUMERIC(15,2) NOT NULL,
  line_vat_amount NUMERIC(15,2) NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (tax_invoice_id, order_id)
);

CREATE UNIQUE INDEX uq_tio_order_in_active_summary
  ON public.tax_invoice_orders (order_id)
  WHERE EXISTS (
    SELECT 1 FROM public.tax_invoices ti
     WHERE ti.id = tax_invoice_id
       AND ti.status NOT IN ('cancelled', 'replaced')
  );
-- ^ Note: PostgreSQL không hỗ trợ subquery trong partial index WHERE.
-- Sẽ enforce qua trigger thay thế (xem migration 2 RPC), partial index chỉ
-- B-tree trên (order_id) cho lookup speed.

CREATE INDEX idx_tio_order ON public.tax_invoice_orders (order_id);
CREATE INDEX idx_tio_invoice ON public.tax_invoice_orders (tax_invoice_id);

ALTER TABLE public.tax_invoice_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tio_select" ON public.tax_invoice_orders
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id()
         AND public.has_permission_any('finance:view'));

GRANT SELECT ON public.tax_invoice_orders TO authenticated;
-- INSERT/DELETE only via SECURITY DEFINER RPCs

-- D. Summary run queue (observability cho cron + admin)
CREATE TABLE public.summary_run_queue (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  summary_date    DATE   NOT NULL,
  status          TEXT   NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'issued', 'failed', 'skipped')),
  trigger_source  TEXT   NOT NULL CHECK (trigger_source IN ('cron', 'manual')),
  triggered_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  tax_invoice_id  BIGINT REFERENCES public.tax_invoices(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_srq_branch_date ON public.summary_run_queue (branch_id, summary_date DESC);
CREATE INDEX idx_srq_tenant_status ON public.summary_run_queue (tenant_id, status);

ALTER TABLE public.summary_run_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srq_select" ON public.summary_run_queue
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id()
         AND public.has_permission_any('finance:view'));

GRANT SELECT ON public.summary_run_queue TO authenticated;
```

### Migration 2 — RPCs (aggregation + service-role transition)

```sql
-- A. Service-role transition overload (D1)
CREATE OR REPLACE FUNCTION public.transition_tax_invoice_state_as_system(
  p_tax_invoice_id BIGINT,
  p_to_status      TEXT,
  p_actor          UUID,
  p_payload        JSONB DEFAULT NULL,
  p_note           TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HARD GATE: only service_role can call this overload.
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;
  -- Delegate to canonical RPC with provided actor (not auth.uid()).
  -- ... same matrix logic as transition_tax_invoice_state but using p_actor.
END;
$$;

REVOKE ALL ON FUNCTION public.transition_tax_invoice_state_as_system(...)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_tax_invoice_state_as_system(...)
  TO service_role;

-- B. VAT breakdown helper (reuse cho B2B + B2C)
CREATE OR REPLACE FUNCTION public._compute_vat_breakdown(
  p_order_ids BIGINT[]
)
RETURNS TABLE (
  vat_rate     NUMERIC(5,2),
  line_subtotal NUMERIC(15,2),
  line_vat     NUMERIC(15,2)
)
LANGUAGE sql STABLE AS $$
  -- Mirror logic của apps/web/app/finance/actions.ts:128-186 (per-line aggregation
  -- với scale absorbing order-level discount). Group by item.vat_rate, ROUND HALF_UP.
  ...
$$;

-- C. Aggregation RPC
CREATE OR REPLACE FUNCTION public.aggregate_daily_b2c_invoice(
  p_branch_id    BIGINT,
  p_summary_date DATE,
  p_actor        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   BIGINT;
  v_invoice_id  BIGINT;
  v_order_count INT;
BEGIN
  -- 1. Tenant guard
  SELECT tenant_id INTO v_tenant_id FROM branches WHERE id = p_branch_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  -- 2. Per-(branch, date) advisory xact lock
  PERFORM pg_advisory_xact_lock(p_branch_id, EXTRACT(EPOCH FROM p_summary_date)::BIGINT);

  -- 3. Idempotency: existing active summary for (branch, date)?
  SELECT id INTO v_invoice_id FROM tax_invoices
   WHERE branch_id = p_branch_id
     AND summary_date = p_summary_date
     AND invoice_kind = 'daily_summary'
     AND status NOT IN ('cancelled', 'replaced');
  IF FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'tax_invoice_id', v_invoice_id);
  END IF;

  -- 4. Eligible orders (B2C bucket)
  -- Rule: payments.paid_at::vn_date = summary_date, paid, not cancelled/refunded,
  -- no active per-order tax_invoice (excludes B2B issued realtime),
  -- no active junction row (already in another summary HĐ).
  -- Bucket source = payments.paid_at (canonical per migration 20260514010000
  -- mv_daily_revenue) NOT orders — orders has no paid_at column.
  -- Note: D4 'not_required' rows DO NOT count as "has active invoice" — those
  -- orders ARE eligible for batch (per D2). Legacy not_required rows survive
  -- as audit; new ones not inserted (action layer change).
  WITH eligible AS (
    SELECT DISTINCT o.id AS order_id
    FROM orders o
    JOIN payments p ON p.order_id = o.id
    WHERE o.tenant_id = v_tenant_id
      AND o.branch_id = p_branch_id
      AND o.payment_status = 'paid'
      AND o.status NOT IN ('cancelled', 'refunded')
      AND p.status = 'completed'
      AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_summary_date
      AND NOT EXISTS (
        SELECT 1 FROM tax_invoices ti
         WHERE ti.order_id = o.id
           AND ti.status IN ('draft','signing','submitted','issued')
      )
      AND NOT EXISTS (
        SELECT 1 FROM tax_invoice_orders tio
        JOIN tax_invoices ti2 ON ti2.id = tio.tax_invoice_id
        WHERE tio.order_id = o.id
          AND ti2.status NOT IN ('cancelled', 'replaced')
      )
    FOR UPDATE SKIP LOCKED
  ),
  vat_lines AS (
    SELECT * FROM _compute_vat_breakdown(ARRAY(SELECT order_id FROM eligible))
  )
  -- 5. INSERT tax_invoices (kind='daily_summary', order_id=NULL, status='draft')
  --    + 6. INSERT tax_invoice_orders rows (one per included order with line_*)
  --    + return JSONB { tax_invoice_id, order_count, vat_breakdown,
  --                     line_items_for_misa: [{name, unit, qty, unitPrice, amount}] }
  ...
END;
$$;

REVOKE ALL ON FUNCTION public.aggregate_daily_b2c_invoice(...)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_b2c_invoice(...)
  TO authenticated, service_role;
```

## Cron route contract

`apps/web/app/api/cron/hddt-daily-summary/route.ts`:

```typescript
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper: yesterday in VN (mirror feedback-daily-report/route.ts:38-46).
function getYesterdayInVietnam(): string { ... }

export async function POST(request: Request) {
  // 1. Auth: Bearer CRON_SECRET (timingSafeEqual — reuse pattern)
  // 2. supabase = createServiceClient()
  // 3. ensureInvoiceProviderRegistered()  // MisaProvider needs env injection
  // 4. summary_date = getYesterdayInVietnam()
  // 5. SELECT all active branches across tenants
  // 6. For each branch (Promise.allSettled, per-branch try/catch):
  //    a. INSERT summary_run_queue { trigger_source: 'cron', triggered_by: SYSTEM_CRON_UUID, status: 'running' }
  //    b. result = await supabase.rpc('aggregate_daily_b2c_invoice', { p_branch_id, p_summary_date, p_actor: SYSTEM_CRON_UUID })
  //    c. if result.skipped → UPDATE queue { status: 'skipped' }, continue
  //    d. if result.order_count === 0 → UPDATE queue { status: 'skipped' }, continue
  //    e. RPC transition_tax_invoice_state_as_system(invoice_id, 'signing', SYSTEM_CRON_UUID)
  //    f. provider.createInvoice({ items: result.line_items_for_misa, buyerName: 'Khách hàng không lấy hóa đơn', ... })
  //    g. RPC transition_tax_invoice_state_as_system(invoice_id, 'issued'|'submitted', SYSTEM_CRON_UUID, payload: { invoice_number, cqt_code, provider_data })
  //    h. UPDATE queue { status: 'issued', tax_invoice_id, finished_at }
  // 7. Return { ok: true, processed: N, issued: M, failed: K, skipped: J }
}
```

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/feedback-daily-report",  "schedule": "0 19 * * *" },
    { "path": "/api/cron/feedback-retention",     "schedule": "0 20 * * *" },
    { "path": "/api/cron/hddt-daily-summary",     "schedule": "0 19 * * *" }
  ]
}
```

19:00 UTC = 02:00 ICT next day. Schedule trùng feedback-daily-report intentional — cùng "yesterday rollover" semantic.

`SYSTEM_CRON_UUID`: hardcoded constant `'00000000-0000-0000-0000-000000000001'` (seed via migration → `INSERT INTO profiles (id, full_name, ...) VALUES (SYSTEM_CRON_UUID, 'System Cron', ...) ON CONFLICT DO NOTHING`).

## Server actions

### `apps/web/app/finance/summary-invoice-actions.ts` (new)

```typescript
"use server";

// Manual trigger (admin UI button). Per-branch, per-date.
// Permission: settings:tenant
export async function runDailySummaryForBranch(
  branchId: number,
  summaryDate: string  // YYYY-MM-DD
): Promise<ActionResult> {
  // 1. Zod validate
  // 2. ACL: requireSettingsTenant + canAccessBranch
  // 3. Insert summary_run_queue { trigger_source: 'manual', triggered_by: user.id }
  // 4. Same flow as cron loop (reuse helper extracted from cron route)
  // 5. logAudit('trigger_summary', { branch_id, summary_date })
}

export async function listSummaryRunQueue(
  branchId?: number,
  daysBack: number = 30
): Promise<ActionResult> {
  // Read-only queue dashboard data
}
```

### `apps/web/app/finance/actions.ts` modifications

- `createTaxInvoice` (lines 58-337): refactor sang state machine
  - Insert `status='draft'` (NOT 'issued' direct)
  - Call `transition_tax_invoice_state(id, 'signing', { provider, transaction_uuid })`
  - Call MISA via provider
  - Call `transition_tax_invoice_state(id, 'issued'|'draft', { provider_data, invoice_number, cqt_code })`
  - Generate deterministic `transactionUuid = sha256(tenantId + orderId + attemptSeq)`
  - **DROP** D4 short-circuit insert of `not_required` row (per D2). Action returns early without DB write if `!hasMst` — caller (POS bill flow) decides.

- Naming alignment: `provider_ref` (TS) → `provider_invoice_id` (schema canonical) — touch lines 213, 289, 310, 376, 417 in same PR as state machine refactor.

- `cancelTaxInvoice` (lines 354-446): extend warning text khi `invoice_kind='daily_summary'` ("HĐ tổng hợp này gộp N đơn hàng — cancel sẽ làm các đơn re-eligible cho batch mới").

## Admin UI

`apps/web/app/admin/finance/summary/page.tsx` — RSC + Client form.

Layout:
- Top section: `SummaryRunForm` (branch picker từ `fetchAccessibleBranches` + date picker default = today ICT + "Chạy thủ công" button → `runDailySummaryForBranch`)
- Bottom section: `SummaryQueueTable` polling `listSummaryRunQueue` mỗi 5s (reuse `useFinanceRealtimeRefresh` hook)
- Columns: Chi nhánh / Ngày / Trạng thái / Trigger / Số đơn gộp / Số tiền / Lần thử / Lỗi gần nhất / [Action: Chạy lại]

Permission: `settings:tenant` cho trigger; `finance:view` cho table.

Nav entry: thêm vào `/admin/finance` sidebar (existing finance shell).

## Regression rules to add (`tasks/regressions.md`)

12 rules — tham khảo full body trong PR-7 description. Tên + tóm tắt:

1. `HDDT-BATCH-CRON-USES-LOCAL-TZ-BUCKET` — `paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'`, never `paid_at::date`
2. `HDDT-BATCH-IDEMPOTENT-VIA-UNIQUE-CONSTRAINT` — partial unique + RPC catches 23505 returning skipped
3. `HDDT-BATCH-RESERVE-DRAFT-BEFORE-PROVIDER-CALL` — RPC inserts draft + COMMIT BEFORE caller calls MISA
4. `HDDT-BATCH-NO-MISA-CALL-INSIDE-RPC` — no `pg_net`/`http` extension in aggregation RPC body
5. `HDDT-BATCH-SKIP-CONTINUE-PER-BRANCH` — 1 transaction per branch, branch failure logged in `summary_run_queue` not rollback batch
6. `HDDT-SUMMARY-CANCEL-PRESERVES-JUNCTION` — cancel summary HĐ keeps `tax_invoice_orders` rows
7. `HDDT-BATCH-CRON-AUTH-VIA-BEARER-CRON-SECRET` — reuse `CRON_SECRET` + `timingSafeEquals` pattern
8. `HDDT-D4-NOT-REQUIRED-DEPRECATED` — `createTaxInvoice` không insert `not_required` rows mới (D2). Legacy rows: ignore in batch eligibility query
9. `HDDT-LATE-B2B-REQUEST-AFTER-BATCH-BLOCKED` — `createTaxInvoice` reject nếu order đã có junction row
10. `HDDT-SERVICE-ROLE-RPC-GATED-ON-CLAIM` — `transition_tax_invoice_state_as_system` checks `request.jwt.claims->>'role' = 'service_role'`
11. `HDDT-SUMMARY-AUDIT-WHO-TRIGGERED` — every summary HĐ insert writes `audit_logs` với `actor_id` (cron = SYSTEM_CRON_UUID, manual = user.id)
12. `HDDT-VERCEL-CRON-TIMEOUT-FANOUT-SAFE` — flag if >5 branches per tenant; queue table + worker pattern when scale

## Migration plan — 7 PRs (✅ all shipped)

| PR | Status | Scope | Migration files / paths thực tế |
|---|---|---|---|
| **PR-1** | ✅ Hoàn thành | Schema + junction + queue table | `supabase/migrations/20260508053555_hddt_summary_schema.sql` |
| **PR-2** | ✅ Hoàn thành | RPCs + SYSTEM_CRON_UUID seed | `supabase/migrations/20260508055046_hddt_summary_rpcs.sql` + `20260508055230_hddt_aggregate_rpc_fixes.sql` (bucket + advisory lock fixes) |
| **PR-3** | ✅ Hoàn thành | Refactor `createTaxInvoice` sang state machine; D4 `not_required` deprecated. Lưu ý: cờ `HDDT_STATE_MACHINE_ENABLED` KHÔNG được implement — state machine bật mặc định không có toggle. | `apps/web/app/finance/actions.ts:58-446` |
| **PR-4** | ✅ Hoàn thành | Cron route + server actions + shared executor | `apps/web/app/api/cron/hddt-daily-summary/route.ts`, `apps/web/app/finance/summary-invoice-actions.ts`, `apps/web/lib/hddt-daily-summary.ts` |
| **PR-5** | ✅ Hoàn thành | Admin UI `/finance/summary` (gate qua action permission, không qua module-acl entry) | `apps/web/app/finance/summary/page.tsx` |
| **PR-6** | ✅ Hoàn thành | Cron entry trong `vercel.json` (`5 19 * * *` UTC = 02:05 ICT). Flip `HDDT_DAILY_SUMMARY_ENABLED=true` per env. | `apps/web/vercel.json` |
| **PR-7** | ✅ Hoàn thành | 16 regression rules trong `tasks/regressions.md` (12 rules dự kiến + 4 rules legacy retained: `HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN`, `HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK`, `POS-HDDT-CONDITIONAL-ON-MST`, `HDDT-CANCEL-REASON-MIN-20`) | `tasks/regressions.md` |

**Actual delivery:** ~7 ngày dev (2026-05-01 → 2026-05-08). Pilot 7 ngày bắt đầu sau khi owner apply provider creds prod + template đăng ký với CQT (xem cutover runbook).

### Drift từ plan ban đầu

- **Migration filename**: PR-1 ban đầu plan 1 migration; thực tế tách thành 2 (`hddt_summary_schema` + `hddt_summary_rpcs`) và phải hot-fix lần 3 (`hddt_aggregate_rpc_fixes`) vì `orders.paid_at` không tồn tại (bucket source thật là `payments.paid_at`) và `pg_advisory_xact_lock` 2-arg overload không match int signature.
- **Provider:** Bổ sung Viettel Sinvoice (`packages/shared/src/providers/impl/viettel-sinvoice.ts`) bên cạnh MISA — switch qua env `INVOICE_PROVIDER=misa|viettel`.
- **`HDDT_STATE_MACHINE_ENABLED` flag:** plan dự kiến có toggle, thực tế ship state machine direct (flag không tồn tại trong code). Nếu cần rollback B2B refactor: revert PR-3 commit. Chỉ flag `HDDT_DAILY_SUMMARY_ENABLED` còn giữ vai trò kill-switch cho cron.
- **Path drift:** Plan dự kiến `/admin/finance/summary`; thực tế ship `/finance/summary` (cùng route shell với `/finance` dashboard). Code references trong plan body (PR-5 row, Acceptance #4, Server actions section) đề cập `/admin/finance/summary` đã outdated — path canonical là `/finance/summary`.
- **Module ACL:** `/finance/summary` không có entry riêng trong `packages/shared/src/auth/module-acl.ts:89-93` (chỉ có `/finance` cho roles `owner`/`super_manager`). Permission gate `settings:tenant` ở action layer (`runDailySummaryForBranch`).

## Acceptance criteria

1. Cron 02:00 ICT chạy thành công 1 ngày test với 50+ orders B2C/chi nhánh → 3 HĐ tổng hợp (3 chi nhánh) `issued` trong vòng 5 phút
2. Mỗi HĐ tổng hợp có 2 line items đúng VAT rate ("Đồ ăn 8%" + "Đồ uống có cồn 10%"), tổng tiền khớp đến 1 đồng
3. B2B realtime: 1 cashier check-out 1 order MST + 1 order không MST trong cùng ca → MST có HĐ riêng < 10s, không-MST chờ batch
4. Manual retry: 1 cron failure → owner click "Chạy lại" trên `/admin/finance/summary` → batch chạy lại, audit log có `trigger_source='manual'` + `triggered_by=owner.id`
5. Idempotency duplicate run: cron + manual cùng (branch, date) trong 100ms → 1 thành công, 1 trả `skipped` không error
6. Owner dashboard: filter chi nhánh + date range → list HĐ tổng hợp + B2B realtime mix với column "Loại"
7. Late B2B request: order paid + đã trong junction → cashier `createTaxInvoice` → reject với message "Đơn này đã trong HĐ tổng hợp ngày X"
8. Cancel summary HĐ với reason 25 chars → status=cancelled, junction preserved, underlying orders KHÔNG auto re-eligible
9. Timezone: order paid 2026-05-08 23:58 ICT → batch ngày 08 (cron sáng 09 chạy). Order paid 2026-05-09 00:05 ICT → batch ngày 09
10. Permission: `branch_manager` chi nhánh A trigger manual cho chi nhánh B → reject "Không có quyền"
11. Service-role gate: `transition_tax_invoice_state_as_system` từ user JWT (không service role) → raise `forbidden_service_role_only`
12. `pnpm typecheck && pnpm lint && pnpm build` xanh sau mỗi PR

## Pilot launch gate — 7-day metrics

| Metric | Target | Source |
|---|---|---|
| % HĐ tổng hợp issued auto qua cron | ≥ 95% | `summary_run_queue WHERE status='issued' AND trigger_source='cron'` |
| % manual retry sau cron fail | ≤ 5% | `summary_run_queue WHERE trigger_source='manual'` |
| Avg cron run time | < 45s cho 3 chi nhánh | Vercel logs |
| Orphan `signing` qua đêm | 0 rows | `tax_invoices WHERE status='signing' AND signing_started_at < now() - interval '12h'` |
| Cross-day misalignment | 0 rows | JOIN query check `(paid_at::vn_date = summary_date)` cho mọi junction row |
| Double-issued HĐ | 0 rows | UNION B2B order_id + junction order_id GROUP BY 1 HAVING COUNT(*) > 1 |

3-day red → halt cron, switch admin-manual-only.

## References

Files to touch / read before each PR:
- `packages/shared/src/providers/invoice.ts:23-92` — `InvoiceProvider` interface (extend `InvoiceResult` với `cqtCode`/`invoiceSeries` optional)
- `packages/shared/src/providers/impl/misa.ts:75-187` — MisaProvider (untouched, just need creds env)
- `apps/web/lib/invoice-provider-init.ts:1-22` — env injection point
- `apps/web/app/finance/actions.ts:58-337` — `createTaxInvoice` to refactor (PR-3)
- `apps/web/app/finance/actions.ts:128-186` — per-line VAT logic to mirror in `_compute_vat_breakdown` SQL helper
- `apps/web/app/finance/actions.ts:354-446` — `cancelTaxInvoice` to extend warning text
- `supabase/migrations/20260425035346_tax_invoice_state_machine.sql:34-160` — state machine RPC + UNIQUE pattern
- `supabase/migrations/20260502000000_pos_hddt_not_required_d4.sql:22-44` — D4 `not_required` legacy (deprecated by D2)
- `apps/web/app/api/cron/feedback-daily-report/route.ts:36-82` — cron auth + ICT date helper pattern to mirror
- `apps/web/vercel.json` — cron schedule list
- `docs/ref/einvoice-tax.md` — pháp lý + spec gốc

## Follow-ups (post-pilot)

- Reconcile cron orphan `signing` cho cả per-order + summary HĐ (poll `provider.getStatus`)
- HĐ thay thế TT 78 flow + UI
- HĐ điều chỉnh giảm cho refund-after-batch (auto from refund event)
- PDF/XML download UI
- Provider config encrypted DB
- Period-close formal infra + permission `tax:close_period_override`
- Webhook MISA inbound (replace polling)
- Multi-tenant per-tenant Sinvoice/MISA provider Map (when multi-tenant materializes)

---

> **Last updated:** 2026-05-08 (post-ship update)
> **Next action:** Cutover runbook execution → owner action items (template đăng ký với CQT, provider creds prod, 7-day pilot). Tham khảo `docs/runbooks/hddt-hybrid-cutover.md`.
