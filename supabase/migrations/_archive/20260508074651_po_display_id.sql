-- F-017: Sequential per-tenant PO display ID PO-YYYY-####
-- - VN timezone (Asia/Ho_Chi_Minh) for year boundary, NOT UTC
-- - Atomic upsert via tenant_po_counters (single-statement INSERT … ON CONFLICT)
-- - Backfill existing rows with PO-LEGACY-<id> to preserve uniqueness vs new format
-- - po_number column retained (HĐĐT-submitted invoices reference it)
-- Sprint 6 F-017.

-- 1. Counter table per (tenant, year) for atomic per-tenant sequence.
CREATE TABLE IF NOT EXISTS public.tenant_po_counters (
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year SMALLINT NOT NULL,
  next_seq BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, year)
);
COMMENT ON TABLE public.tenant_po_counters IS
  'Per-tenant per-year sequence for PO display IDs (PO-YYYY-####). Updated atomically by next_po_display_id RPC. Year scoped to Asia/Ho_Chi_Minh timezone for VN accounting.';

ALTER TABLE public.tenant_po_counters ENABLE ROW LEVEL SECURITY;
-- Read-only via the RPC; no direct DML from authenticated users.
REVOKE ALL ON public.tenant_po_counters FROM authenticated, anon, public;

-- 2. Add display_id column + UNIQUE per tenant.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS display_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_po_display_id_per_tenant'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT uq_po_display_id_per_tenant UNIQUE (tenant_id, display_id);
  END IF;
END $$;

-- 3. Backfill existing rows. Use PO-LEGACY-<padded id> namespace so future
--    PO-YYYY-#### inserts can never collide with backfill values.
UPDATE public.purchase_orders
   SET display_id = 'PO-LEGACY-' || lpad(id::TEXT, 6, '0')
 WHERE display_id IS NULL;

-- 4. Atomic allocator RPC. Single-statement INSERT … ON CONFLICT … RETURNING
--    avoids TOCTOU and serializes via row lock under concurrent calls.
CREATE OR REPLACE FUNCTION public.next_po_display_id(
  p_tenant_id BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year SMALLINT;
  v_seq  BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_po_display_id: invalid tenant_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF public.auth_tenant_id() IS NULL OR public.auth_tenant_id() <> p_tenant_id THEN
    RAISE EXCEPTION 'next_po_display_id: tenant scope mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Year scoped to VN timezone so 23:59 +07 on Dec 31 still allocates 2026.
  v_year := EXTRACT(year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::SMALLINT;

  -- xmax='0' on RETURNING signals "row was inserted" (caller owns seq=1);
  -- otherwise the row was updated and the prior next_seq value is the
  -- caller's allocation.
  INSERT INTO public.tenant_po_counters (tenant_id, year, next_seq, updated_at)
  VALUES (p_tenant_id, v_year, 2, now())
  ON CONFLICT (tenant_id, year) DO UPDATE
    SET next_seq = public.tenant_po_counters.next_seq + 1,
        updated_at = now()
  RETURNING (
    CASE
      WHEN xmax::TEXT::INT = 0 THEN 1
      ELSE public.tenant_po_counters.next_seq - 1
    END
  ) INTO v_seq;

  RETURN 'PO-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.next_po_display_id(BIGINT) IS
  'Atomically allocate the next PO display ID for the caller tenant in current VN-timezone year. Returns PO-YYYY-####. Concurrent-safe via single-statement upsert. Sprint 6 F-017.';

GRANT EXECUTE ON FUNCTION public.next_po_display_id(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.next_po_display_id(BIGINT) FROM anon, public;
