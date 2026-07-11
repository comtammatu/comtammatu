-- Inventory realtime "branch ops bus" (D067 realtime, owner 2026-07-05: realtime
-- for the WHOLE inventory module). Transport A2 (Broadcast-from-Database), chosen
-- over extending the postgres_changes publication to keep the WAL publication
-- small (the 2-core CI runner saturated when actively-streaming tables were added)
-- and to get thin per-branch payloads with topic-scoped authorization.
--
-- Every branch-scoped inventory document change broadcasts a thin signal
-- {domain,table,op,id,at} to the private topic `branch:{id}:ops`. Clients that
-- belong to that branch subscribe and coalesce the signals into one
-- router.refresh, so a branch requesting goods (stock_transfers INSERT) reaches
-- Kho Tổng / Bếp Trung Tâm (the from_branch operators) live, without a manual
-- refresh. stock_movements is intentionally excluded (one row per sale line →
-- broadcast storm; on-hand is a derived MV) — the bus carries the human-actionable
-- documents operators watch.

SET search_path TO '';

-- ── Branch-ops read authorization (mirrors has_permission_any: owner bypass +
--    valid staff_permissions grant covering the branch or tenant-wide, plus a
--    tenant guard so a tenant-wide/owner grant cannot read another tenant's
--    branch topic). ──
CREATE OR REPLACE FUNCTION public.can_read_branch_ops(p_branch_id bigint)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO ''
  AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = p_branch_id AND b.tenant_id = public.auth_tenant_id()
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles pr
        JOIN public.positions po ON po.id = pr.position_id
        WHERE pr.id = auth.uid() AND po.code = 'owner'
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_permissions sp
        WHERE sp.user_id = auth.uid()
          AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_branch_ops(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_branch_ops(bigint) TO authenticated;

COMMENT ON FUNCTION public.can_read_branch_ops(bigint) IS
  'RLS predicate for realtime branch:{id}:ops topics — TRUE if the caller is the tenant owner or holds a valid branch-scoped/tenant-wide grant for that branch (same tenant).';

-- ── Generic broadcast trigger: thin signal to every branch topic the row
--    touches. to_jsonb keeps it table-agnostic (branch_id vs from/to_branch_id);
--    triggers see the full OLD/NEW row, so no REPLICA IDENTITY change is needed.
--    The broadcast is a best-effort UX signal: the realtime.send is wrapped in an
--    exception guard so a realtime hiccup degrades to "no live refresh" (manual
--    refresh still works) instead of rolling back the operator's document write.
--    Callers mutate these tables per-row (single-id UPDATE/INSERT), so this fans
--    out at most a few sends per statement — no set-based bulk update exists. ──
CREATE OR REPLACE FUNCTION public.broadcast_branch_ops()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_row jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_payload jsonb;
  v_branch text;
BEGIN
  v_payload := jsonb_build_object(
    'domain', 'inventory',
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', v_row ->> 'id',
    'at', now()
  );
  BEGIN
    FOR v_branch IN
      SELECT DISTINCT b
      FROM (VALUES
        (v_row ->> 'branch_id'),
        (v_row ->> 'from_branch_id'),
        (v_row ->> 'to_branch_id')
      ) AS t(b)
      WHERE b IS NOT NULL
    LOOP
      PERFORM realtime.send(v_payload, 'ops', 'branch:' || v_branch || ':ops', true);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_branch_ops best-effort send failed (table=%, op=%): %',
      TG_TABLE_NAME, TG_OP, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_branch_ops() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.broadcast_branch_ops() IS
  'AFTER trigger: broadcasts a thin {domain,table,op,id,at} signal to branch:{id}:ops for every branch column present on the row (branch_id / from_branch_id / to_branch_id).';

-- ── Attach the bus to the human-actionable inventory document tables. ──
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'goods_received_notes', 'purchase_orders', 'stock_transfers',
    'stock_issues', 'production_orders', 'inventory_count_slips',
    'stocktake_sessions', 'supplier_returns'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_broadcast_branch_ops AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.broadcast_branch_ops()',
      v_table
    );
  END LOOP;
END$$;

-- ── Realtime authorization: only branch members receive their branch's ops
--    signals. realtime.messages has no prior policy (broadcast is new here), so
--    this is the sole receive policy and denies every non-branch-ops topic. ──
DROP POLICY IF EXISTS "branch_ops_receive" ON realtime.messages;
CREATE POLICY "branch_ops_receive" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'branch:%:ops'
    AND public.can_read_branch_ops(
      NULLIF(split_part(realtime.topic(), ':', 2), '')::bigint
    )
  );

-- ── Covering indexes for the operator hub queue counts added in the D067 home
--    spine (currently partial-index / seq-scan). ──
CREATE INDEX IF NOT EXISTS idx_grn_tenant_branch_status
  ON public.goods_received_notes (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_production_orders_tenant_branch_status
  ON public.production_orders (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant_tobranch_status
  ON public.stock_transfers (tenant_id, to_branch_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_branch_status
  ON public.purchase_orders (tenant_id, branch_id, status);
