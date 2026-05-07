-- =========================================================================
-- LAN-only print transport: drop USB columns + AGENT_TRANSPORT capability flag.
--
-- Bối cảnh: print-agent đã chuyển hoàn toàn sang LAN (TCP:9100) — bỏ USB
-- transport (apps/print-agent/src/usb.ts đã xoá, package.json không còn
-- optionalDependencies.usb). Tất cả máy in chi nhánh hiện tại đều
-- network-connected. Migration này dọn schema cho phù hợp:
--
-- 1. printers.usb_vendor_id, printers.usb_product_id → drop
-- 2. printers.connection_type CHECK ('lan','usb') → tighten thành ('lan')
-- 3. compound CHECK (lan_host IS NOT NULL OR usb_vendor_id IS NOT NULL)
--    → simple CHECK (lan_host IS NOT NULL)
-- 4. printer_agents.transport → drop (capability flag không còn ý nghĩa)
-- 5. printer_agent_status, v_print_agent_fleet views → recreate without transport
-- 6. upsert_printer_with_routes RPC → drop USB params + USB validation
--
-- Pre-flight: any existing rows with connection_type='usb' phải được flip
-- sang 'lan' (hoặc deactivate) TRƯỚC khi apply, nếu không CHECK constraint
-- new sẽ reject. Chạy:
--   SELECT id, branch_id, role, name FROM public.printers
--    WHERE connection_type <> 'lan';
-- =========================================================================

-- ─── 1. Sanity check: no USB rows remain ──────────────────────────────────
DO $$
DECLARE
  v_usb_count INT;
BEGIN
  SELECT COUNT(*) INTO v_usb_count
  FROM public.printers
  WHERE connection_type <> 'lan';
  IF v_usb_count > 0 THEN
    RAISE EXCEPTION
      'Cannot drop USB columns: % printer row(s) still have connection_type <> ''lan''. '
      'Flip them to LAN or deactivate before applying this migration.',
      v_usb_count;
  END IF;
END $$;

-- ─── 2. Drop dependent views first ────────────────────────────────────────
DROP VIEW IF EXISTS public.v_print_agent_fleet;
DROP VIEW IF EXISTS public.printer_agent_status;

-- ─── 3. printer_agents: drop transport column ─────────────────────────────
ALTER TABLE public.printer_agents DROP COLUMN IF EXISTS transport;

-- ─── 4. printers: drop USB columns + retighten CHECK constraints ──────────
-- Drop unnamed compound CHECK (lan_host OR usb_vendor_id) and the
-- connection_type IN ('lan','usb') CHECK by introspection — original
-- migrations created them inline without explicit names.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  FOR v_conname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.printers'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%usb%'
        OR pg_get_constraintdef(oid) ILIKE '%connection_type%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.printers DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $$;

ALTER TABLE public.printers DROP COLUMN IF EXISTS usb_vendor_id;
ALTER TABLE public.printers DROP COLUMN IF EXISTS usb_product_id;

ALTER TABLE public.printers
  ALTER COLUMN connection_type SET DEFAULT 'lan';

ALTER TABLE public.printers
  ADD CONSTRAINT printers_connection_type_lan_only
    CHECK (connection_type = 'lan');

ALTER TABLE public.printers
  ADD CONSTRAINT printers_lan_host_required
    CHECK (lan_host IS NOT NULL);

-- ─── 5. Recreate printer_agent_status view (without transport) ────────────
CREATE VIEW public.printer_agent_status AS
SELECT
  branch_id,
  tenant_id,
  agent_id,
  version,
  last_seen_at,
  (last_seen_at > now() - INTERVAL '60 seconds') AS is_online
FROM public.printer_agents;

GRANT SELECT ON public.printer_agent_status TO authenticated;

-- ─── 6. Recreate v_print_agent_fleet view (without transport) ─────────────
-- Status threshold bumped 0.2.0 → 0.3.0 to track fleet adoption of the
-- LAN-only release cleanup.
CREATE OR REPLACE VIEW public.v_print_agent_fleet AS
SELECT
  b.id                                AS branch_id,
  b.tenant_id,
  b.name                              AS branch_name,
  pa.agent_id,
  pa.version,
  pa.last_seen_at,
  EXTRACT(EPOCH FROM (now() - pa.last_seen_at))::INT AS seconds_since_seen,
  CASE
    WHEN pa.branch_id IS NULL THEN 'never_started'
    WHEN pa.last_seen_at < now() - INTERVAL '5 minutes' THEN 'offline'
    WHEN pa.version IS NULL OR pa.version = '' THEN 'active_unknown_version'
    WHEN string_to_array(pa.version, '.')::INT[] < ARRAY[0,3,0]
      THEN 'legacy'
    ELSE 'current'
  END                                 AS status
FROM public.branches b
LEFT JOIN public.printer_agents pa
  ON pa.branch_id = b.id
WHERE b.is_active = TRUE;

ALTER VIEW public.v_print_agent_fleet SET (security_invoker = true);

GRANT SELECT ON public.v_print_agent_fleet TO authenticated;

COMMENT ON VIEW public.v_print_agent_fleet IS
  'Fleet-wide print-agent status. Status = legacy if version < 0.3.0, current otherwise. RLS inherits from printer_agents (manager+).';

-- ─── 7. Recreate upsert_printer_with_routes RPC without USB params ────────
DROP FUNCTION IF EXISTS public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
);

CREATE OR REPLACE FUNCTION public.upsert_printer_with_routes(
  p_printer_id BIGINT DEFAULT NULL,
  p_branch_id BIGINT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_lan_host TEXT DEFAULT NULL,
  p_lan_port INT DEFAULT NULL,
  p_paper_width_mm SMALLINT DEFAULT 80,
  p_code_page TEXT DEFAULT 'CP1258',
  p_is_active BOOLEAN DEFAULT TRUE,
  p_print_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_category_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant_id BIGINT;
  v_claim_branch_id BIGINT;
  v_existing RECORD;
  v_printer_id BIGINT;
  v_print_type TEXT;
  v_category_id BIGINT;
  v_allowed_print_types TEXT[] := ARRAY[
    'receipt',
    'provisional_bill',
    'shift_close_report',
    'kitchen_ticket',
    'cancel_ticket'
  ];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_tenant_id := public.auth_tenant_id();
  v_claim_branch_id := public.auth_branch_id();

  IF p_branch_id IS NULL OR p_role IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'invalid_printer_payload' USING ERRCODE = '22023';
  END IF;

  IF v_claim_branch_id IS NOT NULL AND v_claim_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'printer:manage') THEN
    RAISE EXCEPTION 'permission denied: printer:manage' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_role NOT IN ('receipt', 'kitchen_1', 'kitchen_2') THEN
    RAISE EXCEPTION 'invalid printer role' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(trim(COALESCE(p_lan_host, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lan host required' USING ERRCODE = '22023';
  END IF;

  IF p_paper_width_mm NOT IN (58, 80) THEN
    RAISE EXCEPTION 'invalid paper width' USING ERRCODE = '22023';
  END IF;

  FOREACH v_print_type IN ARRAY COALESCE(p_print_types, ARRAY[]::TEXT[])
  LOOP
    IF NOT v_print_type = ANY(v_allowed_print_types) THEN
      RAISE EXCEPTION 'invalid print type: %', v_print_type USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH v_category_id IN ARRAY COALESCE(p_category_ids, ARRAY[]::BIGINT[])
  LOOP
    PERFORM 1
    FROM public.menu_categories
    WHERE id = v_category_id
      AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'category not found: %', v_category_id USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  IF p_printer_id IS NOT NULL THEN
    SELECT id, branch_id, role
    INTO v_existing
    FROM public.printers
    WHERE id = p_printer_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'printer not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'cannot move printer across branches' USING ERRCODE = '22023';
    END IF;

    UPDATE public.printers
       SET role = p_role,
           name = trim(p_name),
           connection_type = 'lan',
           lan_host = trim(p_lan_host),
           lan_port = COALESCE(p_lan_port, 9100),
           paper_width_mm = p_paper_width_mm,
           code_page = COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
           is_active = COALESCE(p_is_active, TRUE)
     WHERE id = p_printer_id
       AND tenant_id = v_tenant_id
     RETURNING id INTO v_printer_id;
  ELSE
    INSERT INTO public.printers (
      tenant_id,
      branch_id,
      role,
      name,
      connection_type,
      lan_host,
      lan_port,
      paper_width_mm,
      code_page,
      is_active
    ) VALUES (
      v_tenant_id,
      p_branch_id,
      p_role,
      trim(p_name),
      'lan',
      trim(p_lan_host),
      COALESCE(p_lan_port, 9100),
      p_paper_width_mm,
      COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
      COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_printer_id;
  END IF;

  -- Keep non-kitchen document routing unambiguous per branch: assigning one of
  -- these types to this printer removes that type from other branch printers.
  DELETE FROM public.printer_print_types ppt
  WHERE ppt.tenant_id = v_tenant_id
    AND ppt.branch_id = p_branch_id
    AND ppt.printer_id <> v_printer_id
    AND ppt.print_type = ANY(COALESCE(p_print_types, ARRAY[]::TEXT[]))
    AND ppt.print_type IN ('receipt', 'provisional_bill', 'shift_close_report');

  DELETE FROM public.printer_print_types
  WHERE tenant_id = v_tenant_id
    AND branch_id = p_branch_id
    AND printer_id = v_printer_id;

  INSERT INTO public.printer_print_types (tenant_id, branch_id, printer_id, print_type)
  SELECT v_tenant_id, p_branch_id, v_printer_id, unnest(COALESCE(p_print_types, ARRAY[]::TEXT[]))
  ON CONFLICT (tenant_id, branch_id, printer_id, print_type) DO NOTHING;

  DELETE FROM public.printer_menu_categories
  WHERE tenant_id = v_tenant_id
    AND branch_id = p_branch_id
    AND printer_id = v_printer_id;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    DELETE FROM public.printer_menu_categories
    WHERE tenant_id = v_tenant_id
      AND branch_id = p_branch_id
      AND category_id = ANY(p_category_ids);

    INSERT INTO public.printer_menu_categories (
      tenant_id,
      branch_id,
      printer_id,
      category_id
    )
    SELECT DISTINCT v_tenant_id, p_branch_id, v_printer_id, x.category_id
    FROM unnest(p_category_ids) AS x(category_id)
    ON CONFLICT (tenant_id, branch_id, category_id) DO UPDATE
      SET printer_id = EXCLUDED.printer_id;
  END IF;

  RETURN v_printer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) TO authenticated;

COMMENT ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) IS 'Upsert a branch printer (LAN-only) and its print-type/category routes. Printer role is a slot label only; routing choices are not role-restricted.';
