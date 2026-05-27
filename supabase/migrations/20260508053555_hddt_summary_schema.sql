-- =============================================================
-- HĐĐT Hybrid via MISA — PR-1 schema foundation
-- Per owner-approved HĐĐT summary design from 2026-05-08.
--
-- Adds:
--   1. tax_invoices.{summary_date, summary_orders_count, invoice_kind,
--      cqt_code, invoice_series, pdf_url, xml_url} + nullable order_id
--      so a single row can represent either B2B per-order HĐ or B2C
--      daily summary HĐ (TT 78/2021 §11.4).
--   2. tax_invoice_orders junction (1:N from summary HĐ to underlying
--      orders) — relational not JSONB, preserved on cancel for audit.
--   3. summary_run_queue queue/audit table for cron + admin trigger
--      observability per (branch, date) — owner sees pending/issued/
--      failed/skipped on /admin/finance/summary.
--
-- No behavior change in PR-1: action layer + cron route + admin UI
-- ship in PR-3..PR-5 behind feature flags. Existing tax_invoices rows
-- get invoice_kind='per_order' default — chk_invoice_kind_shape passes
-- because all live rows have order_id NOT NULL + summary_date NULL.
-- =============================================================

-- ─── 1. tax_invoices extension ───

ALTER TABLE public.tax_invoices ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.tax_invoices
  ADD COLUMN summary_date         DATE,
  ADD COLUMN summary_orders_count INTEGER,
  ADD COLUMN invoice_kind         TEXT NOT NULL DEFAULT 'per_order'
    CHECK (invoice_kind IN ('per_order', 'daily_summary')),
  ADD COLUMN cqt_code             TEXT,
  ADD COLUMN invoice_series       TEXT,
  ADD COLUMN pdf_url              TEXT,
  ADD COLUMN xml_url              TEXT;

-- per_order: 1 row per orders.id with order_id set, summary fields NULL
-- daily_summary: 1 row per (branch_id, summary_date) with order_id NULL,
--                summary_date + summary_orders_count required
ALTER TABLE public.tax_invoices ADD CONSTRAINT chk_invoice_kind_shape CHECK (
  (invoice_kind = 'per_order'
     AND order_id IS NOT NULL
     AND summary_date IS NULL)
  OR (invoice_kind = 'daily_summary'
     AND order_id IS NULL
     AND summary_date IS NOT NULL
     AND summary_orders_count IS NOT NULL)
);

-- Idempotent batch: 1 active summary HĐ per (tenant, branch, date).
-- Cancelled/replaced excluded so post-cancel re-create is allowed.
CREATE UNIQUE INDEX uq_tax_invoices_active_per_summary
  ON public.tax_invoices (tenant_id, branch_id, summary_date)
  WHERE invoice_kind = 'daily_summary'
    AND status NOT IN ('cancelled', 'replaced');

-- Existing uq_tax_invoices_active_per_order on (order_id) WHERE
-- status NOT IN ('cancelled','replaced','not_required') stays valid:
-- NULL order_id rows (summary HĐ) are excluded from unique by Postgres
-- default semantics, no change needed.

COMMENT ON COLUMN public.tax_invoices.invoice_kind IS
  'per_order = HĐ B2B realtime cho 1 order. daily_summary = HĐ tổng hợp B2C theo ngày/chi nhánh per TT 78/2021 §11.4.';
COMMENT ON COLUMN public.tax_invoices.summary_date IS
  'NULL cho per_order. Set cho daily_summary = ngày (Asia/Ho_Chi_Minh) gộp orders B2C.';
COMMENT ON COLUMN public.tax_invoices.summary_orders_count IS
  'NULL cho per_order. Set cho daily_summary = số orders B2C đã gộp (cached vs JOIN tax_invoice_orders count).';
COMMENT ON COLUMN public.tax_invoices.cqt_code IS
  'Mã cấp bởi Cơ quan Thuế (CQT) sau khi provider submit thành công. NULL khi status IN (draft, signing, submitted).';
COMMENT ON COLUMN public.tax_invoices.invoice_series IS
  'Ký hiệu mẫu HĐ đăng ký với CQT (ví dụ: "1C25TLL"). Set khi MISA cấp.';
COMMENT ON COLUMN public.tax_invoices.pdf_url IS
  'URL PDF đã ký số từ provider. Lazy-fetch hoặc set khi provider trả.';
COMMENT ON COLUMN public.tax_invoices.xml_url IS
  'URL XML gốc từ provider. Lazy-fetch hoặc set khi provider trả.';


-- ─── 2. tax_invoice_orders junction ───

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

CREATE INDEX idx_tio_order   ON public.tax_invoice_orders (order_id);
CREATE INDEX idx_tio_invoice ON public.tax_invoice_orders (tax_invoice_id);
CREATE INDEX idx_tio_tenant  ON public.tax_invoice_orders (tenant_id);

ALTER TABLE public.tax_invoice_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tio_select" ON public.tax_invoice_orders
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id()
         AND public.has_permission_any('finance:view'));

GRANT SELECT ON public.tax_invoice_orders TO authenticated;
-- INSERT/DELETE only via SECURITY DEFINER RPCs (PR-2 aggregate_daily_b2c_invoice).

COMMENT ON TABLE public.tax_invoice_orders IS
  'Junction: orders gộp vào daily_summary HĐ. PRIMARY KEY (tax_invoice_id, order_id) chặn duplicate trong cùng HĐ. Per-order partial uniqueness "1 active summary per order" enforce qua trigger trong PR-2 (Postgres không hỗ trợ subquery trong partial index WHERE). Cancel HĐ tổng hợp KHÔNG xóa rows này — preserve audit history. Eligibility query JOIN tax_invoices.status để biết order còn link active hay đã free cho batch sau.';


-- ─── 3. summary_run_queue ───

CREATE TABLE public.summary_run_queue (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  summary_date    DATE   NOT NULL,
  status          TEXT   NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'issued', 'failed', 'skipped')),
  trigger_source  TEXT   NOT NULL CHECK (trigger_source IN ('cron', 'manual')),
  triggered_by    UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  tax_invoice_id  BIGINT REFERENCES public.tax_invoices(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_srq_branch_date    ON public.summary_run_queue (branch_id, summary_date DESC);
CREATE INDEX idx_srq_tenant_status  ON public.summary_run_queue (tenant_id, status);
CREATE INDEX idx_srq_invoice        ON public.summary_run_queue (tax_invoice_id);

ALTER TABLE public.summary_run_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srq_select" ON public.summary_run_queue
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id()
         AND public.has_permission_any('finance:view'));

GRANT SELECT ON public.summary_run_queue TO authenticated;
-- INSERT/UPDATE only via SECURITY DEFINER RPCs (PR-2/PR-4).

COMMENT ON TABLE public.summary_run_queue IS
  'Queue + audit trail cho daily B2C batch runs. 1 row per (branch, date, attempt). trigger_source phân biệt cron vs manual; triggered_by = NULL khi cron (system actor) hoặc user.id khi manual.';
