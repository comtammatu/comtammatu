-- =============================================================
-- S1 Printing foundation
--  1. printers              — config per role (receipt / kitchen_1 / kitchen_2)
--  2. print_jobs            — durable queue, Realtime publication
--  3. printer_agents        — heartbeat (1 agent per branch)
--  4. printer_agent_status  — view with online flag
--  5. menu_categories.kitchen_printer      — routing (1 | 2)
--  6. orders.kitchen_send_count            — for idempotency_key batches
--  7. order_items.sent_to_kitchen_at       — incremental "gửi bếp"
--  8. permission_keys: pos:print, pos:send_kitchen, printer:manage
--
-- The legacy printer_configs table (never referenced in app code) is
-- dropped to avoid drift with the new schema.
-- =============================================================

-- 0. Drop legacy printer_configs (not referenced in apps/web)
DROP TABLE IF EXISTS public.printer_configs CASCADE;

-- ========================
-- 1. printers
-- ========================
CREATE TABLE public.printers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('receipt', 'kitchen_1', 'kitchen_2')),
  name TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('lan', 'usb')),
  lan_host TEXT,
  lan_port INT DEFAULT 9100,
  usb_vendor_id TEXT,
  usb_product_id TEXT,
  paper_width_mm SMALLINT NOT NULL DEFAULT 80 CHECK (paper_width_mm IN (58, 80)),
  code_page TEXT NOT NULL DEFAULT 'CP1258',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, role, tenant_id),
  CHECK (
    (connection_type = 'lan' AND lan_host IS NOT NULL)
    OR (connection_type = 'usb' AND usb_vendor_id IS NOT NULL)
  )
);

CREATE INDEX idx_printers_branch ON public.printers (branch_id, is_active);
CREATE INDEX idx_printers_tenant ON public.printers (tenant_id);

CREATE TRIGGER trg_printers_updated_at
  BEFORE UPDATE ON public.printers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "printers_select" ON public.printers
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "printers_insert" ON public.printers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
  );

CREATE POLICY "printers_update" ON public.printers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
  );

CREATE POLICY "printers_delete" ON public.printers
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('printer:manage')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.printers TO authenticated;

-- ========================
-- 2. print_jobs
-- ========================
CREATE TABLE public.print_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  printer_id BIGINT NOT NULL REFERENCES public.printers(id) ON DELETE RESTRICT,
  job_type TEXT NOT NULL CHECK (
    job_type IN ('kitchen_ticket', 'receipt', 'reprint', 'cancel_ticket')
  ),
  order_id BIGINT REFERENCES public.orders(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'printed', 'failed', 'expired', 'cancelled')
  ),
  attempts SMALLINT NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_by_agent TEXT,
  claimed_at TIMESTAMPTZ,
  printed_at TIMESTAMPTZ,
  reprinted_from_id BIGINT REFERENCES public.print_jobs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX idx_print_jobs_branch_pending
  ON public.print_jobs (branch_id, status)
  WHERE status IN ('pending', 'processing');

CREATE INDEX idx_print_jobs_order
  ON public.print_jobs (order_id);

CREATE INDEX idx_print_jobs_created
  ON public.print_jobs (created_at DESC);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "print_jobs_select" ON public.print_jobs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "print_jobs_insert" ON public.print_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('pos:print')
      OR public.has_permission_any('pos:send_kitchen')
      OR public.has_permission_any('printer:manage')
    )
  );

CREATE POLICY "print_jobs_update" ON public.print_jobs
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('pos:print')
      OR public.has_permission_any('printer:manage')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('pos:print')
      OR public.has_permission_any('printer:manage')
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.print_jobs TO authenticated;

-- Realtime for agent subscription
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;

-- ========================
-- 3. printer_agents (heartbeat)
-- ========================
CREATE TABLE public.printer_agents (
  branch_id BIGINT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  version TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.printer_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "printer_agents_select" ON public.printer_agents
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id = public.auth_branch_id()
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager')
    )
  );

CREATE POLICY "printer_agents_upsert_insert" ON public.printer_agents
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('printer:manage')
      OR public.has_permission_any('pos:print')
    )
  );

CREATE POLICY "printer_agents_upsert_update" ON public.printer_agents
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('printer:manage')
      OR public.has_permission_any('pos:print')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('printer:manage')
      OR public.has_permission_any('pos:print')
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.printer_agents TO authenticated;

-- ========================
-- 4. printer_agent_status view
-- ========================
CREATE OR REPLACE VIEW public.printer_agent_status AS
SELECT
  branch_id,
  tenant_id,
  agent_id,
  version,
  last_seen_at,
  (last_seen_at > now() - INTERVAL '60 seconds') AS is_online
FROM public.printer_agents;

GRANT SELECT ON public.printer_agent_status TO authenticated;

-- ========================
-- 5. menu_categories.kitchen_printer
-- ========================
ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS kitchen_printer SMALLINT NOT NULL DEFAULT 1
    CHECK (kitchen_printer IN (1, 2));

-- ========================
-- 6. orders.kitchen_send_count (for idempotency key batches)
-- ========================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kitchen_send_count INT NOT NULL DEFAULT 0;

-- ========================
-- 7. order_items.sent_to_kitchen_at
-- ========================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sent_to_kitchen_at TIMESTAMPTZ;

-- ========================
-- 8. Permission keys
-- ========================
-- New keys: pos:send_kitchen, pos:print, printer:manage
-- Uses existing `permission_keys` catalog from auth v2
INSERT INTO public.permission_keys (key, module, description, scope)
VALUES
  ('pos:send_kitchen', 'pos',
    'Gửi đơn xuống bếp (tạo tem bếp in tự động)', 'branch'),
  ('pos:print', 'pos',
    'Tạo/tái in hoá đơn, huỷ hoặc thử lại tem in', 'branch'),
  ('printer:manage', 'settings',
    'Quản lý cấu hình máy in chi nhánh', 'branch')
ON CONFLICT (key) DO NOTHING;
