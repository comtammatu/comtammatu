-- =========================================================================
-- refunds — payment refund request ledger
--
-- Referenced by apps/web/app/orders/refund-actions.ts. The DDL was drafted
-- in docs/archive/plan/sprint-3.md but never migrated. The action file ships
-- with `// @ts-nocheck` to mask the missing table — every refund silently
-- fails at runtime with a generic "Không thể tạo yêu cầu hòan tiền".
--
-- Schema matches the columns refund-actions.ts currently writes:
--   tenant_id, branch_id, payment_id, order_id, amount, reason, status,
--   created_by, approved_by.
--
-- RLS scopes via has_permission(branch_id, 'orders:refund') so cashier and
-- branch_manager only see/insert their own branch; area_manager only via
-- explicit per-branch grants; owner/super_manager see tenant-wide.
--
-- NOTE: this only ships storage. Known correctness gaps in approveRefund
-- (no GL reversal, no stock restore, no payment-status transition RPC,
-- area_manager scope hole, payment.status='completed' precondition missing)
-- are tracked in tasks/todo.md as P0 blockers requiring 4-agent debate
-- before fix.
-- =========================================================================

CREATE TABLE public.refunds (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  payment_id  BIGINT NOT NULL REFERENCES public.payments(id),
  order_id    BIGINT NOT NULL REFERENCES public.orders(id),
  amount      NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_refunds_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_refunds_tenant       ON public.refunds (tenant_id);
CREATE INDEX idx_refunds_branch       ON public.refunds (branch_id);
CREATE INDEX idx_refunds_payment      ON public.refunds (payment_id);
CREATE INDEX idx_refunds_pending      ON public.refunds (created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refunds_select" ON public.refunds
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:read')
  );

CREATE POLICY "refunds_insert" ON public.refunds
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund')
  );

-- UPDATE limited to tenant-admin roles for approve/reject — matches the
-- APPROVE_ROLES list in refund-actions.ts. Permission-key gate also required
-- so admin-with-no-grant cannot bypass.
CREATE POLICY "refunds_update" ON public.refunds
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund')
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund')
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.refunds TO authenticated;
