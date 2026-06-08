--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: shift_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shift_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


--
-- Name: can_access_grn_source(bigint, bigint, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_grn_source(p_tenant_id bigint, p_grn_id bigint, p_permission_key text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_source_branch_id BIGINT;
BEGIN
  IF v_tenant_id IS NULL
     OR p_tenant_id IS DISTINCT FROM v_tenant_id
     OR p_grn_id IS NULL
     OR p_permission_key IS NULL
     OR btrim(p_permission_key) = '' THEN
    RETURN false;
  END IF;

  SELECT grn.branch_id
    INTO v_source_branch_id
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN public.has_permission(v_source_branch_id, p_permission_key);
END;
$$;


--
-- Name: can_access_supplier_invoice_source(bigint, bigint, bigint, bigint, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_supplier_invoice_source(p_tenant_id bigint, p_supplier_id bigint, p_grn_id bigint, p_po_id bigint, p_permission_key text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_source_branch_id BIGINT;
  v_source_supplier_id BIGINT;
BEGIN
  IF v_tenant_id IS NULL
     OR p_tenant_id IS DISTINCT FROM v_tenant_id
     OR p_permission_key IS NULL
     OR btrim(p_permission_key) = '' THEN
    RETURN false;
  END IF;

  -- V17: formal-PO source CUT. Invoices are scoped via their source
  -- GRN branch; standalone invoices (no GRN) use a tenant-scoped permission check.
  IF p_grn_id IS NOT NULL THEN
    SELECT grn.branch_id, grn.supplier_id
      INTO v_source_branch_id, v_source_supplier_id
    FROM public.goods_received_notes AS grn
    WHERE grn.id = p_grn_id
      AND grn.tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RETURN false;
    END IF;

    IF v_source_supplier_id IS DISTINCT FROM p_supplier_id THEN
      RETURN false;
    END IF;

    RETURN public.has_permission(v_source_branch_id, p_permission_key);
  END IF;

  RETURN public.has_permission(NULL, p_permission_key);
END;
$$;


--
-- Name: enforce_staff_permission_scope(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_staff_permission_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_effective_branch_id BIGINT;
BEGIN
  v_effective_branch_id := private.staff_permission_effective_branch_id(
    NEW.permission_key,
    NEW.branch_id
  );

  IF v_effective_branch_id IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'tenant_permission_requires_null_branch: %', NEW.permission_key
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enqueue_kitchen_completion_print_internal(bigint, bigint[], uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enqueue_kitchen_completion_print_internal(p_branch_id bigint, p_ticket_ids bigint[], p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_requested_count INT := 0;
  v_printed_ticket_count INT := 0;
  v_route RECORD;
  v_payload JSONB;
  v_idempotency TEXT;
  v_job_id BIGINT;
  v_jobs JSONB := '[]'::jsonb;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::BIGINT[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::BIGINT[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object(
      'jobs', v_jobs,
      'requested_ticket_count', 0,
      'printed_ticket_count', 0,
      'skipped_ticket_count', 0
    );
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        kt.id AS ticket_id,
        kt.order_id,
        kt.order_item_id,
        kt.kitchen_send_batch_id,
        o.tenant_id,
        o.branch_id,
        o.order_number,
        o.order_type,
        o.note AS order_note,
        tbl.number AS table_number,
        COALESCE(profile.full_name, '') AS cashier_name,
        p.id AS printer_id,
        p.role AS printer_role,
        CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
        COALESCE(ksb.kitchen_ticket_number, o.order_number) AS kitchen_ticket_number,
        COALESCE(ksb.send_seq, o.kitchen_send_count) AS send_seq,
        COALESCE(ksb.kind, 'manual') AS send_kind,
        jsonb_build_object(
          'item_name', oi.item_name,
          'variant_name', oi.variant_name,
          'quantity', oi.quantity,
          'modifiers', oi.modifiers,
          'sides', oi.sides,
          'note', oi.note
        ) AS item_payload
      FROM public.kds_tickets kt
      JOIN public.order_items oi
        ON oi.tenant_id = kt.tenant_id
       AND oi.id = kt.order_item_id
      JOIN public.orders o
        ON o.tenant_id = kt.tenant_id
       AND o.id = kt.order_id
      LEFT JOIN public.tables tbl
        ON tbl.id = o.table_id
      LEFT JOIN public.profiles profile
        ON profile.id = o.created_by
      JOIN public.menu_items mi
        ON mi.id = oi.menu_item_id
      JOIN public.printers p
        ON p.tenant_id = o.tenant_id
       AND p.branch_id = o.branch_id
       AND p.is_active = TRUE
       AND p.role IN ('kitchen_1', 'kitchen_2')
      LEFT JOIN public.kitchen_send_batches ksb
        ON ksb.id = kt.kitchen_send_batch_id
      WHERE kt.id = ANY(v_ticket_ids)
        AND kt.branch_id = p_branch_id
        AND oi.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        array_agg(ticket_id ORDER BY order_item_id) AS ticket_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note
    )
    SELECT *
    FROM grouped_routes
    ORDER BY order_id, printer_role, printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind', 'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number', v_route.order_number,
      'order_number', v_route.order_number,
      'order_type', v_route.order_type,
      'table_number', v_route.table_number,
      'cashier_name', v_route.cashier_name,
      'send_seq', v_route.send_seq,
      'send_kind', v_route.send_kind,
      'slot', v_route.slot,
      'note', v_route.order_note,
      'items', v_route.items,
      'printed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                            'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || v_route.order_id::TEXT
      || ':kds-complete:printer:' || v_route.printer_id::TEXT
      || ':tickets:' || md5(array_to_string(v_route.ticket_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_route.tenant_id, v_route.branch_id, v_route.printer_id,
      'kitchen_ticket', v_route.order_id, v_payload, v_idempotency, p_actor
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id
      FROM public.print_jobs
      WHERE idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
       SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
     WHERE id = ANY(v_route.item_ids)
       AND sent_to_kitchen_at IS NULL;

    v_printed_ticket_count := v_printed_ticket_count
      + COALESCE(array_length(v_route.ticket_ids, 1), 0);

    v_jobs := v_jobs || jsonb_build_object(
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'ticket_count', COALESCE(array_length(v_route.ticket_ids, 1), 0),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'requested_ticket_count', v_requested_count,
    'printed_ticket_count', v_printed_ticket_count,
    'skipped_ticket_count', GREATEST(v_requested_count - v_printed_ticket_count, 0)
  );
END;
$$;


--
-- Name: finance_scope(uuid, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.finance_scope(p_uid uuid, p_key text DEFAULT 'finance:view'::text) RETURNS TABLE(has_tenant_scope boolean, branch_ids bigint[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH owner_scope AS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = p_uid
      AND po.code = 'owner'
  ),
  active_permissions AS (
    SELECT sp.branch_id
    FROM public.staff_permissions sp
    WHERE sp.user_id = p_uid
      AND sp.permission_key = p_key
      AND sp.valid_from <= now()
      AND (sp.valid_until IS NULL OR sp.valid_until > now())
  )
  SELECT
    (
      EXISTS (SELECT 1 FROM owner_scope)
      OR EXISTS (
        SELECT 1
        FROM active_permissions ap
        WHERE ap.branch_id IS NULL
      )
    ) AS has_tenant_scope,
    COALESCE(
      (
        SELECT array_agg(DISTINCT ap.branch_id)
        FROM active_permissions ap
        WHERE ap.branch_id IS NOT NULL
      ),
      ARRAY[]::BIGINT[]
    ) AS branch_ids;
$$;


--
-- Name: staff_permission_effective_branch_id(text, bigint); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.staff_permission_effective_branch_id(p_permission_key text, p_requested_branch_id bigint) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_scope TEXT;
BEGIN
  SELECT pk.scope
    INTO v_scope
    FROM public.permission_keys pk
   WHERE pk.key = p_permission_key;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'unknown_permission_key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF v_scope = 'tenant' THEN
    RETURN NULL;
  END IF;

  RETURN p_requested_branch_id;
END;
$$;


--
-- Name: staff_role_from_position_code(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.staff_role_from_position_code(p_position_code text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE p_position_code
    WHEN 'owner' THEN 'owner'
    -- manager bucket
    WHEN 'super_manager' THEN 'manager'
    WHEN 'executive_assistant' THEN 'manager'
    WHEN 'area_manager' THEN 'manager'
    WHEN 'branch_manager' THEN 'manager'
    -- staff bucket
    WHEN 'chief_accountant' THEN 'staff'
    WHEN 'accountant' THEN 'staff'
    WHEN 'office' THEN 'staff'
    WHEN 'warehouse_head' THEN 'staff'
    WHEN 'warehouse_keeper' THEN 'staff'
    WHEN 'warehouse_manager' THEN 'staff'
    WHEN 'production_manager' THEN 'staff'
    WHEN 'cashier' THEN 'staff'
    WHEN 'waiter' THEN 'staff'
    -- chef bucket
    WHEN 'head_chef' THEN 'chef'
    WHEN 'chef' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    ELSE NULL
  END
$$;


--
-- Name: FUNCTION staff_role_from_position_code(p_position_code text); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.staff_role_from_position_code(p_position_code text) IS 'Maps HR position codes to StaffRole buckets used by route ACL.';


--
-- Name: _auth_v2_check_branch_required(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._auth_v2_check_branch_required() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  v_code TEXT;
BEGIN
  SELECT private.staff_role_from_position_code(code) INTO v_code
  FROM public.positions WHERE id = NEW.position_id;

  IF v_code IN ('staff','chef')
     AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role: position=%', v_code
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _auth_v2_is_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._auth_v2_is_owner(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = p_user AND po.code = 'owner'
  );
$$;


--
-- Name: _auth_v2_position_id_from_role(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._auth_v2_position_id_from_role(p_role text, p_tenant bigint) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT id
  FROM public.positions
  WHERE tenant_id = p_tenant
    AND code = public._auth_v2_role_to_position(p_role)
  LIMIT 1;
$$;


--
-- Name: _auth_v2_role_to_position(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._auth_v2_role_to_position(p_role text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- Maps an incoming role string to a seeded HKD position code. Accepts the
  -- 4 lean roles plus legacy role names (back-compat for app code that still
  -- emits pre-collapse roles); all resolve to one of the 4 seed positions.
  SELECT CASE p_role
    WHEN 'owner'              THEN 'owner'
    WHEN 'manager'            THEN 'branch_manager'
    WHEN 'super_manager'      THEN 'branch_manager'
    WHEN 'area_manager'       THEN 'branch_manager'
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'staff'              THEN 'cashier'
    WHEN 'office'             THEN 'cashier'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'cashier'
    WHEN 'warehouse_manager'  THEN 'cashier'
    WHEN 'production_manager' THEN 'cashier'
    WHEN 'chef'               THEN 'chef'
    WHEN 'head_chef'          THEN 'chef'
    ELSE NULL
  END
$$;


--
-- Name: _compute_grn_price_baseline(bigint, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._compute_grn_price_baseline(p_tenant_id bigint, p_supplier_id bigint, p_ingredient_id bigint, p_uom text DEFAULT NULL::text) RETURNS TABLE(avg_30d numeric, sample_n integer, last_seen_at date, baseline_source text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_primary RECORD; v_fallback RECORD;
BEGIN
  -- V17: supplier-pricing pause feature CUT. Baseline derives solely from
  -- mv_grn_price_baseline (live).
  SELECT b.avg_30d, b.sample_n, b.last_seen_at INTO v_primary
  FROM public.mv_grn_price_baseline b
  WHERE b.tenant_id = p_tenant_id AND b.supplier_id = p_supplier_id AND b.ingredient_id = p_ingredient_id
    AND (p_uom IS NULL OR b.uom = p_uom);
  IF FOUND AND v_primary.sample_n >= 3 THEN
    RETURN QUERY SELECT v_primary.avg_30d, v_primary.sample_n, v_primary.last_seen_at, 'same_supplier'::TEXT; RETURN;
  END IF;

  SELECT (SUM(b.avg_30d * b.sample_n) / NULLIF(SUM(b.sample_n), 0))::NUMERIC(15,2) AS avg_30d,
         SUM(b.sample_n)::INT AS sample_n, MAX(b.last_seen_at) AS last_seen_at
    INTO v_fallback FROM public.mv_grn_price_baseline b
  WHERE b.tenant_id = p_tenant_id AND b.ingredient_id = p_ingredient_id AND (p_uom IS NULL OR b.uom = p_uom);
  IF v_fallback.sample_n IS NOT NULL AND v_fallback.sample_n >= 3 THEN
    RETURN QUERY SELECT v_fallback.avg_30d, v_fallback.sample_n, v_fallback.last_seen_at, 'any_supplier'::TEXT; RETURN;
  END IF;

  RETURN QUERY SELECT NULL::NUMERIC(15,2), 0, NULL::DATE, 'none'::TEXT;
END; $$;


--
-- Name: _compute_vat_breakdown(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._compute_vat_breakdown(p_order_ids bigint[]) RETURNS TABLE(vat_rate numeric, line_gross numeric, line_subtotal numeric, line_vat numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH order_items_sum AS (
    SELECT
      oi.order_id,
      SUM(oi.subtotal) AS items_sum
    FROM public.order_items oi
    WHERE oi.order_id = ANY(p_order_ids)
      AND oi.status <> 'cancelled'
    GROUP BY oi.order_id
  ),
  scaled AS (
    SELECT
      oi.vat_rate,
      (oi.subtotal * (o.total_amount / NULLIF(ois.items_sum, 0))) AS gross
    FROM public.order_items oi
    JOIN public.orders o            ON o.id = oi.order_id
    JOIN order_items_sum ois        ON ois.order_id = oi.order_id
    WHERE oi.order_id = ANY(p_order_ids)
      AND oi.status <> 'cancelled'
      AND ois.items_sum > 0
  ),
  by_rate AS (
    SELECT
      scaled.vat_rate,
      SUM(scaled.gross)::numeric(15,2) AS line_gross
    FROM scaled
    GROUP BY scaled.vat_rate
  )
  SELECT
    by_rate.vat_rate,
    by_rate.line_gross,
    (by_rate.line_gross / (1 + by_rate.vat_rate / 100))::numeric(15,2) AS line_subtotal,
    (by_rate.line_gross
       - (by_rate.line_gross / (1 + by_rate.vat_rate / 100))::numeric(15,2)
    )::numeric(15,2) AS line_vat
  FROM by_rate
  ORDER BY by_rate.vat_rate;
$$;


--
-- Name: FUNCTION _compute_vat_breakdown(p_order_ids bigint[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public._compute_vat_breakdown(p_order_ids bigint[]) IS 'Per-line VAT aggregation across input orders. Mirrors apps/web/app/finance/actions.ts:128-186. Scale absorbs order-level discount. Returns 1 row per VAT rate present.';


--
-- Name: admin_update_profile(uuid, text, text, text, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_profile(p_target_id uuid, p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_branch_id bigint DEFAULT NULL::bigint, p_is_active boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor_id             UUID := auth.uid();
  v_actor_tenant         BIGINT;
  v_actor_role_text      TEXT;
  v_actor_branch         BIGINT;
  v_target               RECORD;
  v_target_role          TEXT;
  v_final_role           TEXT;
  v_final_branch         BIGINT;
  v_final_position       BIGINT;
  v_final_position_code  TEXT;
  v_branch_kind          TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    p.tenant_id,
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned') AS role_text,
    p.branch_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;

  IF (p_role IS NOT NULL OR p_branch_id IS NOT NULL)
     AND NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN (
    'owner','manager','staff','chef'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned') AS role_text
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  v_target_role  := v_target.role_text;
  v_final_role   := COALESCE(p_role, v_target_role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  IF v_final_role IN ('staff','chef')
     AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch AND tenant_id = v_actor_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;

    IF v_final_role IN ('staff','chef','manager')
       AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'operational roles must be assigned to branch site' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Role-tier hierarchy after the 4-role collapse: owner is unrestricted;
  -- managers may manage anyone except the owner (entry is already gated by
  -- staff:manage / staff:assign_position perm-keys, the authoritative check).
  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'manager' THEN
    IF v_target_role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'manager cannot modify owner';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  v_final_position := public._auth_v2_position_id_from_role(v_final_role, v_actor_tenant);

  IF v_final_position IS NULL THEN
    RAISE EXCEPTION
      'admin_update_profile: position_not_resolved for role=% tenant=% - verify positions seeded',
      v_final_role, v_actor_tenant
      USING ERRCODE = 'P0001';
  END IF;

  SELECT code INTO v_final_position_code
    FROM public.positions
   WHERE id = v_final_position
     AND tenant_id = v_actor_tenant;

  UPDATE public.profiles SET
    full_name   = COALESCE(p_full_name, full_name),
    phone       = COALESCE(p_phone,     phone),
    position_id = v_final_position,
    branch_id   = v_final_branch,
    is_active   = COALESCE(p_is_active, is_active),
    updated_at  = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF p_role IS NOT NULL AND p_role <> v_target_role THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data ||
      jsonb_build_object(
        'user_role', v_final_role,
        'role', v_final_role,
        'position', v_final_position_code
      )
    WHERE id = p_target_id;
  END IF;
  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;


--
-- Name: FUNCTION admin_update_profile(p_target_id uuid, p_full_name text, p_phone text, p_role text, p_branch_id bigint, p_is_active boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_update_profile(p_target_id uuid, p_full_name text, p_phone text, p_role text, p_branch_id bigint, p_is_active boolean) IS 'Staff profile update RPC. SECURITY DEFINER with staff:manage plus staff:assign_position gate; role hierarchy derives from positions.code.';


--
-- Name: aggregate_daily_b2c_invoice(bigint, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aggregate_daily_b2c_invoice(p_branch_id bigint, p_summary_date date, p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id   BIGINT;
  v_invoice_id  BIGINT;
  v_order_count INT;
  v_subtotal    NUMERIC(15,2);
  v_vat_amount  NUMERIC(15,2);
  v_total       NUMERIC(15,2);
  v_pred_rate   NUMERIC(5,2);
  v_eligible    BIGINT[];
  v_breakdown   JSONB;
  v_line_items  JSONB;
  v_is_service  BOOLEAN;
  v_actor       UUID;
BEGIN
  v_is_service := (auth.role() = 'service_role');
  v_actor := COALESCE(p_actor, auth.uid());

  -- 1. Tenant guard
  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = p_branch_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Permission gate (skip for service_role)
  IF NOT v_is_service THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    IF v_tenant_id <> public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission_any('settings:tenant') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Per-(branch, date) advisory xact lock.
  PERFORM pg_advisory_xact_lock(
    hashtext('hddt-b2c:' || p_branch_id::text || ':' || p_summary_date::text)::bigint
  );

  -- 4. Idempotency short-circuit
  SELECT id INTO v_invoice_id
  FROM public.tax_invoices
  WHERE branch_id = p_branch_id
    AND summary_date = p_summary_date
    AND invoice_kind = 'daily_summary'
    AND status NOT IN ('cancelled', 'replaced');
  IF FOUND THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'already_exists',
      'tax_invoice_id', v_invoice_id
    );
  END IF;

  -- 5. Eligible orders (B2C bucket). Bucket source = payments.paid_at
  -- in Asia/Ho_Chi_Minh, matching revenue reporting.
  SELECT array_agg(DISTINCT o.id ORDER BY o.id)
  INTO v_eligible
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.tenant_id = v_tenant_id
    AND o.branch_id = p_branch_id
    AND o.payment_status = 'paid'
    AND o.status NOT IN ('cancelled', 'refunded')
    AND p.status = 'completed'
    AND p.paid_at IS NOT NULL
    AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_summary_date
    AND NOT EXISTS (
      SELECT 1 FROM public.tax_invoices ti
       WHERE ti.order_id = o.id
         AND ti.status IN ('draft', 'signing', 'submitted', 'issued')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tax_invoice_orders tio
      JOIN public.tax_invoices ti2 ON ti2.id = tio.tax_invoice_id
      WHERE tio.order_id = o.id
        AND ti2.status NOT IN ('cancelled', 'replaced')
    );

  IF v_eligible IS NULL OR array_length(v_eligible, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'no_eligible_orders',
      'order_count', 0
    );
  END IF;

  v_order_count := array_length(v_eligible, 1);

  -- 6. Compute per-rate VAT breakdown via shared SQL helper.
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'vat_rate', vat_rate,
      'line_gross', line_gross,
      'line_subtotal', line_subtotal,
      'line_vat', line_vat
    ) ORDER BY vat_rate), '[]'::jsonb),
    COALESCE(SUM(line_subtotal), 0),
    COALESCE(SUM(line_vat), 0)
  INTO v_breakdown, v_subtotal, v_vat_amount
  FROM public._compute_vat_breakdown(v_eligible);

  v_total := v_subtotal + v_vat_amount;

  SELECT vat_rate INTO v_pred_rate
  FROM public._compute_vat_breakdown(v_eligible)
  ORDER BY line_gross DESC
  LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'name', CASE
      WHEN vat_rate = 8  THEN 'Đồ ăn (8%)'
      WHEN vat_rate = 10 THEN 'Đồ uống có cồn (10%)'
      WHEN vat_rate = 5  THEN 'Hàng hoá khác (5%)'
      ELSE 'Hàng hoá VAT ' || vat_rate || '%'
    END,
    'unit', 'Phần',
    'quantity', 1,
    'unit_price', line_subtotal,
    'amount', line_subtotal,
    'vat_rate', vat_rate,
    'vat_amount', line_vat
  ) ORDER BY vat_rate)
  INTO v_line_items
  FROM public._compute_vat_breakdown(v_eligible);

  -- 7. INSERT tax_invoices as Viettel S-invoice draft.
  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id, status,
    invoice_kind, summary_date, summary_orders_count,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, provider_ref, provider_data,
    created_by
  ) VALUES (
    v_tenant_id, p_branch_id, NULL, 'draft',
    'daily_summary', p_summary_date, v_order_count,
    'Khách hàng không lấy hóa đơn', NULL, NULL,
    v_subtotal, v_pred_rate, v_vat_amount, v_total,
    'viettel', NULL,
    jsonb_build_object('vat_breakdown', v_breakdown),
    v_actor
  )
  RETURNING id INTO v_invoice_id;

  -- 8. INSERT junction rows.
  INSERT INTO public.tax_invoice_orders
    (tax_invoice_id, order_id, tenant_id, branch_id, vat_rate, line_subtotal, line_vat_amount)
  SELECT
    v_invoice_id,
    per_order.order_id,
    v_tenant_id,
    p_branch_id,
    per_order.pred_rate,
    per_order.order_subtotal,
    per_order.order_vat
  FROM (
    SELECT
      o.id AS order_id,
      SUM(
        (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
        / (1 + oi.vat_rate / 100)
      )::numeric(15,2) AS order_subtotal,
      SUM(
        (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
        - (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
          / (1 + oi.vat_rate / 100)
      )::numeric(15,2) AS order_vat,
      (
        SELECT oi3.vat_rate
        FROM public.order_items oi3
        WHERE oi3.order_id = o.id
          AND oi3.status <> 'cancelled'
        GROUP BY oi3.vat_rate
        ORDER BY SUM(oi3.subtotal) DESC
        LIMIT 1
      ) AS pred_rate
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN LATERAL (
      SELECT COALESCE(SUM(subtotal), 0) AS s
      FROM public.order_items
      WHERE order_id = o.id AND status <> 'cancelled'
    ) items_sum ON true
    WHERE o.id = ANY(v_eligible)
      AND oi.status <> 'cancelled'
      AND items_sum.s > 0
    GROUP BY o.id, o.total_amount, items_sum.s
  ) per_order;

  -- 9. Return aggregation result for Node runtime to call Sinvoice.
  RETURN jsonb_build_object(
    'tax_invoice_id', v_invoice_id,
    'order_count', v_order_count,
    'subtotal', v_subtotal,
    'vat_amount', v_vat_amount,
    'total_amount', v_total,
    'header_vat_rate', v_pred_rate,
    'vat_breakdown', v_breakdown,
    'order_ids', v_eligible,
    'line_items_for_provider', COALESCE(v_line_items, '[]'::jsonb)
  );
END;
$$;


--
-- Name: FUNCTION aggregate_daily_b2c_invoice(p_branch_id bigint, p_summary_date date, p_actor uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.aggregate_daily_b2c_invoice(p_branch_id bigint, p_summary_date date, p_actor uuid) IS 'Daily B2C summary HĐ aggregation. Creates draft tax_invoices row with provider=viettel and returns line_items_for_provider for the Node Sinvoice caller.';


--
-- Name: append_order_items(bigint, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_order_items(p_order_id bigint, p_items jsonb, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_order           RECORD;
  v_item            JSONB;
  v_base_price      NUMERIC(15,2);
  v_variant_adj     NUMERIC(15,2);
  v_modifier_sum    NUMERIC(15,2);
  v_sides_sum       NUMERIC(15,2);
  v_enriched_sides  JSONB;
  v_unit_price      NUMERIC(15,2);
  v_item_subtotal   NUMERIC(15,2);
  v_menu_item_id    BIGINT;
  v_variant_id      BIGINT;
  v_quantity        INT;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_total_amount    NUMERIC(15,2);
  v_note_parts      TEXT[] := ARRAY[]::TEXT[];
  v_item_name       TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND request_key = p_idempotency_key
      LIMIT 1
    ) THEN
      SELECT o.subtotal, o.total_amount
      INTO v_subtotal, v_total_amount
      FROM public.orders o
      WHERE o.id = p_order_id;

      RETURN jsonb_build_object(
        'success',      TRUE,
        'order_id',     p_order_id,
        'added_count',  0,
        'subtotal',     COALESCE(v_subtotal, 0),
        'total_amount', COALESCE(v_total_amount, 0),
        'idempotent',   TRUE
      );
    END IF;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.service_charge,
         o.discount_type, o.discount_value
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'order not appendable' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order not appendable' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
    FROM public.menu_items
    WHERE id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
      FROM public.menu_item_variants
      WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = v_order.tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
    INTO v_sides_sum, v_enriched_sides
    FROM public.pos_enrich_order_sides(
      v_order.tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'sides', '[]'::JSONB)
    );

    v_unit_price := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;

    v_item_name := v_item ->> 'item_name';
    IF v_item_name IS NOT NULL AND length(trim(v_item_name)) > 0 THEN
      v_note_parts := array_append(v_note_parts, v_item_name);
    END IF;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note, status, request_key
    )
    VALUES (
      v_order.tenant_id, p_order_id, v_menu_item_id, v_variant_id,
      COALESCE(v_item ->> 'item_name', 'Mon'),
      v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note', 'pending',
      p_idempotency_key
    );
  END LOOP;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id AND status <> 'cancelled';

  v_discount_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal
  );

  v_total_amount := v_subtotal
                  + COALESCE(v_order.service_charge, 0)
                  - v_discount_amount;

  UPDATE public.orders o
  SET
    subtotal        = v_subtotal,
    tax_amount      = 0,
    discount_amount = v_discount_amount,
    total_amount    = v_total_amount,
    updated_at      = now()
  WHERE o.id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    'items_added: ' || COALESCE(array_to_string(v_note_parts, ', '), 'items')
  );

  PERFORM public.route_order_to_kds(p_order_id);

  RETURN jsonb_build_object(
    'success',      TRUE,
    'order_id',     p_order_id,
    'added_count',  jsonb_array_length(p_items),
    'subtotal',     v_subtotal,
    'total_amount', v_total_amount
  );
END;
$$;


--
-- Name: FUNCTION append_order_items(p_order_id bigint, p_items jsonb, p_idempotency_key uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.append_order_items(p_order_id bigint, p_items jsonb, p_idempotency_key uuid) IS 'Atomic append of order_items to an existing appendable order. pg_advisory_xact_lock(order_id) serializes with other mutations. If p_idempotency_key matches a prior append on the same order, short-circuits returning current totals (no duplicate insert). Returns {success, order_id, added_count, subtotal, total_amount[, idempotent]}.';


--
-- Name: apply_order_discount(bigint, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_order_discount(p_order_id bigint, p_type text, p_value numeric, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_order           RECORD;
  v_clamped_value   NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_total_amount    NUMERIC(15,2);
  v_note_trim       TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  -- Bất kỳ nhân viên POS nào (cashier/waiter/branch_manager+) đều áp được.
  -- Không gate theo % — owner đã chốt tại 4-agent debate (C1).
  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'manager', 'staff')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Validate type / value / note BEFORE locking — fail fast without
  -- holding the advisory lock.
  IF p_type IS NULL OR p_type NOT IN ('pct', 'vnd') THEN
    RAISE EXCEPTION 'discount_invalid_type' USING ERRCODE = '22023';
  END IF;

  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'discount_invalid_value' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.service_charge
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  -- Branch scope (SECURITY DEFINER — RLS bypass; manual check required).
  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  -- Block on terminal / paid orders. Discount = pre-payment cashier action;
  -- editing an already-completed order rewrites recorded revenue silently.
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  -- Auto-clamp at the boundary (UI also clamps; this is defense-in-depth):
  -- pct beyond 100 -> 100, vnd beyond subtotal -> subtotal.
  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(p_value, COALESCE(v_order.subtotal, 0));
  END IF;

  v_discount_amount := public.compute_discount_amount(
    p_type, v_clamped_value, v_order.subtotal
  );

  -- Edge: cashier types 0 — that's NOT an apply, it's a clear. Force the
  -- caller to use clear_order_discount instead (so audit history reads
  -- "discount_cleared" not "discount_applied: 0%").
  IF v_discount_amount = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.service_charge, 0)
                  - v_discount_amount;

  UPDATE public.orders
     SET discount_type   = p_type,
         discount_value  = v_clamped_value,
         discount_note   = v_note_trim,
         discount_amount = v_discount_amount,
         total_amount    = v_total_amount,
         updated_at      = now()
   WHERE id = p_order_id;

  -- Audit row in order_status_history. Re-stamps current status (no state
  -- transition) — the `note` column is the discount audit. Pattern matches
  -- append_order_items / void_order_item history entries.
  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_applied: ' || p_type || ' ' || v_clamped_value::TEXT
      || ' (' || v_discount_amount::TEXT || 'đ) :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',        p_order_id,
    'discount_type',   p_type,
    'discount_value',  v_clamped_value,
    'discount_amount', v_discount_amount,
    'total_amount',    v_total_amount
  );
END;
$$;


--
-- Name: FUNCTION apply_order_discount(p_order_id bigint, p_type text, p_value numeric, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_order_discount(p_order_id bigint, p_type text, p_value numeric, p_note text) IS 'Set order-level discount (% or VND) with required note (>=3 chars). Auto-clamps pct to 100 and vnd to subtotal. Recomputes discount_amount + total_amount via compute_discount_amount helper. Blocks on paid/terminal orders. Inserts audit row to order_status_history.';


--
-- Name: assign_auditor(bigint, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_auditor(p_session_id bigint, p_auditor_id uuid, p_auditor_branch_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.stocktake_sessions SET auditor_id = p_auditor_id, auditor_branch_id = p_auditor_branch_id, is_unaudited = false
    WHERE id = p_session_id;
END; $$;


--
-- Name: attach_print_document_to_payload(bigint, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_print_document_to_payload(p_tenant_id bigint, p_branch_id bigint, p_kind text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_template RECORD;
  v_template_id BIGINT := 0;
  v_template_version INT := 1;
  v_paper_width_mm INT := 80;
  v_font_profile TEXT := 'thermal_vietnamese';
  v_content JSONB := public.print_template_default_content(p_kind);
  v_document JSONB;
BEGIN
  IF p_payload ? 'document' THEN RETURN p_payload; END IF;

  SELECT * INTO v_template FROM public.resolve_print_template_version(p_tenant_id, p_branch_id, p_kind);

  IF FOUND THEN
    v_template_id := v_template.template_id;
    v_template_version := v_template.template_version;
    v_paper_width_mm := v_template.paper_width_mm;
    v_font_profile := v_template.font_profile;
    v_content := v_template.content;
  END IF;

  v_document := public.materialize_print_document(
    p_kind, p_payload, v_template_id, v_template_version,
    v_paper_width_mm, v_font_profile, v_content);

  RETURN p_payload || jsonb_build_object(
    'template_version', v_template_id::TEXT || ':' || v_template_version::TEXT,
    'document', v_document);
END;
$$;


--
-- Name: FUNCTION attach_print_document_to_payload(p_tenant_id bigint, p_branch_id bigint, p_kind text, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.attach_print_document_to_payload(p_tenant_id bigint, p_branch_id bigint, p_kind text, p_payload jsonb) IS 'Resolve active print template and materialize a schema_version=1 document AST into the print payload.';


--
-- Name: auth_branch_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_branch_id() RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'branch_id')::bigint;
$$;


--
-- Name: auth_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    (
      SELECT private.staff_role_from_position_code(po.code)
        FROM public.profiles p
        JOIN public.positions po ON po.id = p.position_id
       WHERE p.id = auth.uid()
       LIMIT 1
    ),
    'unassigned'
  )
$$;


--
-- Name: FUNCTION auth_role(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.auth_role() IS 'Returns the StaffRole bucket derived from positions.code for the current user.';


--
-- Name: auth_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_tenant_id() RETURNS bigint
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::bigint;
$$;


--
-- Name: bump_kds_ticket(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_kds_ticket(p_ticket_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket    RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, station_id, order_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'pending' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'ready';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be bumped from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = now(),
      bumped_by = auth.uid()
  WHERE id = p_ticket_id;

  IF v_new_status = 'ready' THEN
    PERFORM public.check_order_ready(v_ticket.order_id);
  END IF;

  RETURN v_new_status;
END;
$$;


--
-- Name: can_access_branch(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_branch(p_branch_id bigint) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
  SELECT CASE
    WHEN public.auth_role() IN ('owner', 'manager', 'staff') THEN true
    ELSE p_branch_id = public.auth_branch_id()
  END;
$$;


--
-- Name: cancel_order(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_order(p_order_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid              UUID;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_order            RECORD;
  v_item_id          BIGINT;
  v_print_res        JSONB;
  v_tickets_enqueued INT := 0;
  v_tickets_skipped  INT := 0;
  v_skip_reasons     TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('manager', 'staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, table_id, order_type,
         service_charge, discount_type, discount_value
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE order_id = p_order_id AND status <> 'cancelled';

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id AND tenant_id = v_order.tenant_id;

  UPDATE public.orders
  SET
    status          = 'cancelled',
    subtotal        = 0,
    discount_type   = NULL,
    discount_value  = NULL,
    discount_note   = NULL,
    discount_amount = 0,
    total_amount    = 0 + COALESCE(service_charge, 0),
    updated_at      = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, 'cancelled', v_uid, p_reason
  );

  -- V17: kitchen cancel-ticket print routing CUT. Order cancellation succeeds;
  -- no cancel-ticket is enqueued. Counters remain 0.

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'status',           'cancelled',
    'cancel_tickets',   v_tickets_enqueued,
    'cancel_skipped',   v_tickets_skipped,
    'skip_reasons',     to_jsonb(v_skip_reasons)
  );
END;
$$;


--
-- Name: cancel_pending_payment(bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_pending_payment(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_payment RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, order_id, status
  INTO v_payment
  FROM public.payments
  WHERE id        = p_payment_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET status     = 'failed',
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'unpaid',
      payment_method = NULL,
      updated_at     = now()
  WHERE id             = v_payment.order_id
    AND payment_status <> 'paid';
END;
$$;


--
-- Name: FUNCTION cancel_pending_payment(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cancel_pending_payment(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint) IS 'Cancels a pending MoMo payment and resets order payment fields. Tenant/branch params guard against IDOR.';


--
-- Name: check_menu_item_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_menu_item_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_categories
    WHERE id = NEW.category_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'category does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_order_ready(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_order_ready(p_order_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pending_count INT;
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_current_status IN ('ready', 'served', 'completed', 'cancelled') THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.kds_tickets
  WHERE order_id = p_order_id
    AND tenant_id = public.auth_tenant_id()
    AND status NOT IN ('ready', 'served', 'cancelled');

  IF v_pending_count = 0 THEN
    UPDATE public.orders
    SET status = 'ready',
        updated_at = now()
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by
    )
    SELECT tenant_id, id, v_current_status, 'ready', auth.uid()
    FROM public.orders
    WHERE id = p_order_id
      AND tenant_id = public.auth_tenant_id();
  END IF;
END;
$$;


--
-- Name: check_sides_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_sides_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.main_item_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'main item does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.side_item_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'side item does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: check_table_zone_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_table_zone_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
BEGIN
  IF NEW.zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branch_zones
    WHERE id = NEW.zone_id
      AND tenant_id = NEW.tenant_id
      AND branch_id = NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'zone does not belong to tenant/branch'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: check_variant_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_variant_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.item_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'item does not belong to tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: claim_print_job(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_print_job(p_job_id bigint, p_agent_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_updated INT;
  v_is_service BOOLEAN := (auth.role() = 'service_role');
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  UPDATE public.print_jobs
    SET status = 'processing',
        claimed_by_agent = p_agent_id,
        claimed_at = now(),
        attempts = attempts + 1
    WHERE id = p_job_id
      AND status = 'pending'
      AND (v_is_service OR tenant_id = v_tenant);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;


--
-- Name: cleanup_abandoned_payments(interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_abandoned_payments(p_threshold interval DEFAULT '24:00:00'::interval) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.payments
  SET
    status = 'failed',
    provider_data = COALESCE(provider_data, '{}'::jsonb) || jsonb_build_object(
      'cleanup_reason', 'abandoned',
      'cleanup_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'cleanup_threshold', extract(epoch FROM p_threshold)::int
    ),
    updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - p_threshold;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION cleanup_abandoned_payments(p_threshold interval); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_abandoned_payments(p_threshold interval) IS 'POS payment janitor: marks pending rows older than p_threshold (default 24h) as failed and stamps cleanup metadata into provider_data. Cron-scheduled hourly; safe to call manually for ad-hoc cleanup.';


--
-- Name: cleanup_kds_tickets_as_system(timestamp with time zone, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_kds_tickets_as_system(p_older_than timestamp with time zone, p_reset_before_local_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_deleted_total INT := 0;
  v_by_status JSONB := '{}'::jsonb;
  v_by_branch JSONB := '[]'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_older_than IS NULL AND p_reset_before_local_date IS NULL THEN
    RAISE EXCEPTION 'cleanup_cutoff_required' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT
      kt.id,
      kt.tenant_id,
      kt.branch_id,
      kt.status
    FROM public.kds_tickets kt
    JOIN public.branches b
      ON b.id = kt.branch_id
     AND b.tenant_id = kt.tenant_id
    LEFT JOIN public.kitchen_send_batches ksb
      ON ksb.id = kt.kitchen_send_batch_id
     AND ksb.tenant_id = kt.tenant_id
    WHERE kt.status IN ('pending', 'preparing', 'ready')
      AND b.branch_kind = 'branch'
      AND (
        (
          p_older_than IS NOT NULL
          AND COALESCE(ksb.created_at, kt.created_at) < p_older_than
        )
        OR (
          p_reset_before_local_date IS NOT NULL
          AND (
            COALESCE(ksb.created_at, kt.created_at)
              AT TIME ZONE 'Asia/Ho_Chi_Minh'
          )::date < p_reset_before_local_date
        )
      )
  ),
  deleted AS (
    DELETE FROM public.kds_tickets kt
    USING candidates c
    WHERE kt.id = c.id
    RETURNING kt.tenant_id, kt.branch_id, kt.status
  ),
  status_counts AS (
    SELECT status, count(*)::int AS deleted_count
    FROM deleted
    GROUP BY status
  ),
  branch_counts AS (
    SELECT tenant_id, branch_id, count(*)::int AS deleted_count
    FROM deleted
    GROUP BY tenant_id, branch_id
  )
  SELECT
    COALESCE((SELECT count(*)::int FROM deleted), 0),
    COALESCE(
      (SELECT jsonb_object_agg(status, deleted_count) FROM status_counts),
      '{}'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'tenant_id', tenant_id,
            'branch_id', branch_id,
            'deleted_count', deleted_count
          )
          ORDER BY tenant_id, branch_id
        )
        FROM branch_counts
      ),
      '[]'::jsonb
    )
  INTO v_deleted_total, v_by_status, v_by_branch;

  RETURN jsonb_build_object(
    'deleted_total', v_deleted_total,
    'by_status', v_by_status,
    'by_branch', v_by_branch,
    'older_than', p_older_than,
    'reset_before_local_date', p_reset_before_local_date
  );
END;
$$;


--
-- Name: FUNCTION cleanup_kds_tickets_as_system(p_older_than timestamp with time zone, p_reset_before_local_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_kds_tickets_as_system(p_older_than timestamp with time zone, p_reset_before_local_date date) IS 'Service-role-only KDS board cleanup. Deletes active queue tickets older than the cutoff or before the current Asia/Ho_Chi_Minh local date; does not mutate orders, order_items, kitchen batches, or counters.';


--
-- Name: clear_branch_menu_daily_limit(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_branch_menu_daily_limit(p_branch_id bigint, p_menu_item_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_deleted   INT;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'manager',
                    'staff', 'chef') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('manager', 'staff', 'chef')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.branch_menu_item_daily_limits
   WHERE tenant_id = v_tenant_id
     AND branch_id = p_branch_id
     AND menu_item_id = p_menu_item_id
     AND limit_date = v_today;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;


--
-- Name: clear_order_discount(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_order_discount(p_order_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_prof_tenant  BIGINT;
  v_prof_branch  BIGINT;
  v_prof_role    TEXT;
  v_order        RECORD;
  v_total_amount NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'manager', 'staff')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.service_charge, o.discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.service_charge, 0);

  UPDATE public.orders
     SET discount_type   = NULL,
         discount_value  = NULL,
         discount_note   = NULL,
         discount_amount = 0,
         total_amount    = v_total_amount,
         updated_at      = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_cleared (was '
      || COALESCE(v_order.discount_amount::TEXT, '0') || 'đ)'
  );

  RETURN jsonb_build_object(
    'order_id',     p_order_id,
    'total_amount', v_total_amount
  );
END;
$$;


--
-- Name: close_pos_session(bigint, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_pos_session(p_session_id bigint, p_closing_cash numeric, p_note text DEFAULT NULL::text, p_variance_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session RECORD;
  v_paid_count INT;
  v_unpaid_count INT;
  v_cash_revenue NUMERIC(15,2);
  v_noncash_revenue NUMERIC(15,2);
  v_expected_cash NUMERIC(15,2);
  v_cash_difference NUMERIC(15,2);
  v_threshold NUMERIC(15,2);
  v_closed_by UUID;
  v_variance_trim TEXT;
BEGIN
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash must be non-negative' USING ERRCODE = '22023';
  END IF;

  v_closed_by := auth.uid();
  IF v_closed_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, opening_cash, opened_at, status
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'session_already_closed' USING ERRCODE = 'P0001';
  END IF;

  -- expected_cash = opening_cash + cash-only paid revenue.
  -- VietQR/MoMo settle to bank, không vào két (POS-CLOSE-SHIFT-CASH-ONLY-EXPECTED).
  -- Unpaid orders carry forward to next session (D1).
  SELECT
    COUNT(*) FILTER (WHERE payment_status = 'paid'),
    COUNT(*) FILTER (WHERE payment_status <> 'paid'),
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid' AND payment_method = 'cash'
    ), 0),
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid'
        AND (payment_method IS NULL OR payment_method <> 'cash')
    ), 0)
  INTO v_paid_count, v_unpaid_count, v_cash_revenue, v_noncash_revenue
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash := v_session.opening_cash + v_cash_revenue;
  v_cash_difference := p_closing_cash - v_expected_cash;
  v_threshold := GREATEST(50000::NUMERIC, ROUND(v_expected_cash * 0.005, 2));

  -- D8 (2026-04-27): KHÔNG block close khi |diff| > threshold.
  -- Variance > threshold → trigger notify_pos_shift_variance gửi alert
  -- cho manager (xem trigger AFTER UPDATE phía dưới).
  --
  -- variance_approval_note vẫn được record nếu caller truyền (audit
  -- optional). Không validate độ dài, không gate quyền — UI mới đã bỏ
  -- ô input này. Giữ tham số để backward-compat với client cũ chưa update.
  v_variance_trim := NULLIF(btrim(COALESCE(p_variance_note, '')), '');

  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note,
    variance_approval_note = v_variance_trim,
    -- variance_approver_user_id = NULL (D8 retired approval flow)
    variance_approver_user_id = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',         p_session_id,
    'opening_cash',       v_session.opening_cash,
    'closing_cash',       p_closing_cash,
    'expected_cash',      v_expected_cash,
    'cash_revenue',       v_cash_revenue,
    'noncash_revenue',    v_noncash_revenue,
    'cash_difference',    v_cash_difference,
    'variance_threshold', v_threshold,
    'variance_breached',  abs(v_cash_difference) > v_threshold,
    'order_count',        v_paid_count + v_unpaid_count,
    'paid_order_count',   v_paid_count,
    'unpaid_order_count', v_unpaid_count,
    'opened_at',          v_session.opened_at,
    'closed_at',          now()
  );
END;
$$;


--
-- Name: FUNCTION close_pos_session(p_session_id bigint, p_closing_cash numeric, p_note text, p_variance_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.close_pos_session(p_session_id bigint, p_closing_cash numeric, p_note text, p_variance_note text) IS 'Close cashier session without blocking on cash variance. Variance breach triggers manager notification via trg_notify_pos_shift_variance. expected_cash = opening + SUM(paid AND payment_method=cash). Unpaid orders carry forward to next session. JSONB result includes variance_breached for UI notification.';


--
-- Name: close_recount_round(bigint, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_recount_round(p_session_id bigint, p_round_no smallint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD; v_need INT := 0; v_final INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_round_no <> v_ss.current_round THEN RAISE EXCEPTION 'round % does not match current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023'; END IF;

  WITH latest AS (
    SELECT sl.id, sl.ingredient_id, sl.counted_quantity, sl.system_quantity, sl.abc_class,
      COALESCE(sl.counted_quantity, 0) - COALESCE(sl.system_quantity, 0) AS delta,
      CASE WHEN sl.system_quantity IS NULL OR sl.system_quantity = 0 THEN NULL
           ELSE ABS(COALESCE(sl.counted_quantity, 0) - sl.system_quantity) / sl.system_quantity END AS pct
    FROM public.stocktake_lines sl WHERE sl.session_id = p_session_id AND sl.round_no = p_round_no
  ),
  decided AS (
    SELECT l.*,
      CASE WHEN l.counted_quantity IS NULL THEN false
           WHEN l.abc_class = 'A' THEN
                COALESCE(l.pct, 0) > v_ss.variance_threshold_pct_class_a / 100.0
             OR ABS(l.delta) > v_ss.variance_threshold_vnd_class_a / GREATEST((SELECT avg_unit_cost FROM public.stock_levels WHERE ingredient_id = l.ingredient_id AND branch_id = v_ss.branch_id LIMIT 1), 1)
           ELSE
                COALESCE(l.pct, 0) > v_ss.variance_threshold_pct / 100.0
             OR ABS(l.delta) > v_ss.variance_threshold_vnd / GREATEST((SELECT avg_unit_cost FROM public.stock_levels WHERE ingredient_id = l.ingredient_id AND branch_id = v_ss.branch_id LIMIT 1), 1)
      END AS needs_rc FROM latest l
  )
  UPDATE public.stocktake_lines sl SET needs_recount = d.needs_rc, is_final = NOT d.needs_rc
  FROM decided d WHERE sl.id = d.id;

  IF p_round_no > 1 THEN
    -- Propagate median + is_final to round-1 for converged ingredients
    WITH converged AS (
      SELECT DISTINCT sl.ingredient_id
      FROM public.stocktake_lines sl
      WHERE sl.session_id = p_session_id AND sl.round_no = p_round_no AND NOT sl.needs_recount
    ),
    medians AS (
      SELECT sl.ingredient_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY sl.counted_quantity) AS med
      FROM public.stocktake_lines sl
      WHERE sl.session_id = p_session_id AND sl.counted_quantity IS NOT NULL
        AND sl.ingredient_id IN (SELECT ingredient_id FROM converged)
      GROUP BY sl.ingredient_id HAVING COUNT(*) >= 2
    )
    UPDATE public.stocktake_lines sl
       SET counted_quantity = m.med, is_final = true, needs_recount = false
    FROM medians m
    WHERE sl.session_id = p_session_id AND sl.ingredient_id = m.ingredient_id AND sl.round_no = 1;
  END IF;

  SELECT COUNT(*) FILTER (WHERE needs_recount), COUNT(*) FILTER (WHERE is_final) INTO v_need, v_final
  FROM public.stocktake_lines WHERE session_id = p_session_id AND round_no = p_round_no;

  IF v_need > 0 AND v_ss.current_round < 4 THEN
    UPDATE public.stocktake_sessions SET current_round = v_ss.current_round + 1 WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('round_no', p_round_no, 'needs_recount_count', v_need, 'final_count', v_final,
    'next_round', CASE WHEN v_need > 0 AND v_ss.current_round < 4 THEN v_ss.current_round + 1 ELSE NULL END,
    'round_4_escalation_required', v_need > 0 AND v_ss.current_round >= 3);
END; $$;


--
-- Name: complete_kds_tickets(bigint, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_kds_tickets(p_branch_id bigint, p_ticket_ids bigint[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_updated_ticket_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_order_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_requested_count INT := 0;
  v_locked_count INT := 0;
  v_completed_count INT := 0;
  v_group_count INT := 0;
  v_order_id BIGINT;
  v_print_result JSONB := jsonb_build_object(
    'jobs', '[]'::jsonb,
    'requested_ticket_count', 0,
    'printed_ticket_count', 0,
    'skipped_ticket_count', 0
  );
  v_print_warning TEXT := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ticket_id), ARRAY[]::BIGINT[])
  INTO v_ticket_ids
  FROM unnest(COALESCE(p_ticket_ids, ARRAY[]::BIGINT[])) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RAISE EXCEPTION 'no_tickets' USING ERRCODE = '22023';
  END IF;

  WITH locked AS (
    SELECT kt.id
    FROM public.kds_tickets kt
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND public.can_access_branch(kt.branch_id)
    FOR UPDATE
  )
  SELECT COUNT(*) INTO v_locked_count
  FROM locked;

  IF v_locked_count <> v_requested_count THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(DISTINCT COALESCE(
    'batch:' || kt.kitchen_send_batch_id::TEXT,
    'order:' || kt.order_id::TEXT
  ))
  INTO v_group_count
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'mixed_kds_card' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT kt.order_id), ARRAY[]::BIGINT[])
  INTO v_order_ids
  FROM public.kds_tickets kt
  WHERE kt.id = ANY(v_ticket_ids)
    AND kt.tenant_id = public.auth_tenant_id()
    AND kt.branch_id = p_branch_id;

  WITH updated AS (
    UPDATE public.kds_tickets kt
    SET status = 'ready',
        bumped_at = now(),
        bumped_by = v_uid,
        updated_at = now()
    WHERE kt.id = ANY(v_ticket_ids)
      AND kt.tenant_id = public.auth_tenant_id()
      AND kt.branch_id = p_branch_id
      AND kt.status IN ('pending', 'preparing')
    RETURNING kt.id
  )
  SELECT
    COALESCE(array_agg(id), ARRAY[]::BIGINT[]),
    COUNT(*)
  INTO v_updated_ticket_ids, v_completed_count
  FROM updated;

  IF v_completed_count > 0 THEN
    BEGIN
      v_print_result := private.enqueue_kitchen_completion_print_internal(
        p_branch_id,
        v_updated_ticket_ids,
        v_uid
      );

      IF COALESCE((v_print_result->>'skipped_ticket_count')::INT, 0) > 0 THEN
        v_print_warning := 'kitchen_print_skipped';
      END IF;
    EXCEPTION
      -- Recoverable: no printer is configured for this branch. The tickets are
      -- still marked ready; surface a warning so the operator can configure one.
      WHEN no_data_found OR insufficient_privilege THEN
        v_print_warning := 'kitchen_print_enqueue_failed';
        v_print_result := jsonb_build_object(
          'jobs', '[]'::jsonb,
          'requested_ticket_count', v_completed_count,
          'printed_ticket_count', 0,
          'skipped_ticket_count', v_completed_count
        );
        RAISE LOG 'complete_kds_tickets print enqueue skipped branch_id=%, ticket_ids=%, sqlstate=%, error=%',
          p_branch_id,
          v_updated_ticket_ids,
          SQLSTATE,
          SQLERRM;
      -- Fatal: re-raise so a broken print producer (e.g. missing table 42P01)
      -- aborts the bump instead of silently leaving a green ticket with no print.
      WHEN OTHERS THEN
        RAISE LOG 'complete_kds_tickets print enqueue failed branch_id=%, ticket_ids=%, sqlstate=%, error=%',
          p_branch_id,
          v_updated_ticket_ids,
          SQLSTATE,
          SQLERRM;
        RAISE;
    END;
  END IF;

  FOREACH v_order_id IN ARRAY v_order_ids LOOP
    PERFORM public.check_order_ready(v_order_id);
  END LOOP;

  RETURN jsonb_build_object(
    'requested_count', v_requested_count,
    'completed_count', v_completed_count,
    'print_jobs', COALESCE(v_print_result->'jobs', '[]'::jsonb),
    'printed_ticket_count', COALESCE((v_print_result->>'printed_ticket_count')::INT, 0),
    'skipped_ticket_count', COALESCE((v_print_result->>'skipped_ticket_count')::INT, 0),
    'print_warning', v_print_warning
  );
END;
$$;


--
-- Name: FUNCTION complete_kds_tickets(p_branch_id bigint, p_ticket_ids bigint[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.complete_kds_tickets(p_branch_id bigint, p_ticket_ids bigint[]) IS 'Atomically marks visible pending/preparing KDS tickets ready and queues matching kitchen print jobs for the completed tickets only. Does not close POS/payment/table state.';


--
-- Name: complete_payment_and_consume_stock(bigint, numeric, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric DEFAULT NULL::numeric, p_provider_data jsonb DEFAULT NULL::jsonb, p_actor_id uuid DEFAULT NULL::uuid) RETURNS TABLE(status text, payment_id bigint, order_id bigint, stock_consumed boolean, detail text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_payment          RECORD;
  v_order            RECORD;
  v_line_subtotal    NUMERIC(15,2) := 0;
  v_recomputed_total NUMERIC(15,2) := 0;
  v_stock_status     TEXT := NULL;
  v_stock_detail     TEXT := NULL;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT, p_payment_id, NULL::BIGINT, FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.tax_amount, o.service_charge,
         o.discount_amount, o.total_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'order_not_found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(oi.quantity::NUMERIC * oi.unit_price), 0)::NUMERIC(15,2)
  INTO v_line_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.tenant_id = v_order.tenant_id
    AND oi.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(v_payment.amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND ABS(p_expected_amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('expected=' || p_expected_amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  -- "không trừ kho" (owner policy 2026-05-28): stock consumption removed.

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    TRUE,
    'stock=ok'::TEXT;
END;
$$;


--
-- Name: FUNCTION complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric, p_provider_data jsonb, p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric, p_provider_data jsonb, p_actor_id uuid) IS 'Recomputes order total at payment time, consumes stock before marking paid, and returns stock_failed without completing payment/order when inventory cannot be consumed.';


--
-- Name: complete_print_job(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_print_job(p_job_id bigint, p_success boolean, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_service BOOLEAN := (auth.role() = 'service_role');
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  UPDATE public.print_jobs
    SET status = CASE WHEN p_success THEN 'printed' ELSE 'failed' END,
        printed_at = CASE WHEN p_success THEN now() ELSE printed_at END,
        last_error = CASE WHEN p_success THEN NULL ELSE p_error END
    WHERE id = p_job_id
      AND (v_is_service OR tenant_id = v_tenant);
END;
$$;


--
-- Name: complete_stocktake(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_stocktake(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_session       RECORD;
  v_line          RECORD;
  v_fresh_qty     NUMERIC(15,3);
  v_adjustment    NUMERIC(15,3);
  v_total_lines   INT := 0;
  v_adjusted      INT := 0;
  v_total_var_abs NUMERIC(15,3) := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT s.* INTO v_session
  FROM public.stocktake_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_session.branch_id, 'inventory:stocktake_complete') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id
      AND sl.tenant_id = v_tenant
      AND sl.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id AND sl.tenant_id = v_tenant
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh_qty
    FROM public.stock_levels stl
    WHERE stl.tenant_id     = v_tenant
      AND stl.branch_id     = v_session.branch_id
      AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh_qty := 0;
    END IF;

    v_adjustment := v_line.counted_quantity - v_fresh_qty;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_var_abs := v_total_var_abs + abs(v_adjustment);

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by
      ) VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        COALESCE(v_line.variance_reason, 'Stocktake #' || p_session_id::text),
        v_uid
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total_lines', v_total_lines,
    'adjusted_lines', v_adjusted,
    'total_variance_abs', v_total_var_abs
  );
END;
$$;


--
-- Name: FUNCTION complete_stocktake(p_session_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.complete_stocktake(p_session_id bigint) IS 'Completes classic stocktake and writes count_adjustment stock movements. SECURITY DEFINER with tenant and inventory:stocktake_complete gate.';


--
-- Name: compute_discount_amount(text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_discount_amount(p_type text, p_value numeric, p_subtotal numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_subtotal NUMERIC := COALESCE(p_subtotal, 0);
  v_value    NUMERIC := COALESCE(p_value, 0);
BEGIN
  IF p_type IS NULL OR v_value <= 0 OR v_subtotal <= 0 THEN
    RETURN 0;
  END IF;

  IF p_type = 'pct' THEN
    -- Clamp pct to [0,100]; FLOOR nguyên VND.
    RETURN FLOOR(v_subtotal * LEAST(v_value, 100) / 100);
  ELSIF p_type = 'vnd' THEN
    -- Clamp tiền giảm về subtotal (void món xong, vnd-discount cũ có thể
    -- vượt subtotal mới — kéo về subtotal để total_amount không âm).
    RETURN LEAST(v_value, v_subtotal);
  END IF;

  RETURN 0;
END;
$$;


--
-- Name: FUNCTION compute_discount_amount(p_type text, p_value numeric, p_subtotal numeric); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.compute_discount_amount(p_type text, p_value numeric, p_subtotal numeric) IS 'Single source of truth for discount math. pct => FLOOR(subtotal*pct/100) clamped to subtotal; vnd => LEAST(value, subtotal). NULL/0 inputs => 0. Called by apply_order_discount, append_order_items, void_order_item, cancel_order on every recalc path.';


--
-- Name: confirm_cash_payment(bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_cash_payment(p_order_id bigint, p_cash_received numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_existing_id  BIGINT;
  v_existing_st  TEXT;
  v_payment_id   BIGINT;
  v_cash_change  NUMERIC(15,2);
  v_complete_res RECORD;
  v_receipt_res  JSONB;
  v_print_warning TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  IF p_cash_received IS NULL THEN
    RAISE EXCEPTION 'cash_received required' USING ERRCODE = 'P0001';
  END IF;
  IF p_cash_received < v_order.total_amount THEN
    RAISE EXCEPTION 'cash_received (%) must be >= total_amount (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cash_received > GREATEST(v_order.total_amount * 10, 50000000) THEN
    RAISE EXCEPTION 'cash_received (%) exceeds sane upper bound for total (%)',
      p_cash_received, v_order.total_amount
      USING ERRCODE = 'P0001';
  END IF;

  v_cash_change := p_cash_received - v_order.total_amount;

  SELECT id, status INTO v_existing_id, v_existing_st
  FROM public.payments
  WHERE order_id = p_order_id
    AND status <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_st = 'completed' THEN
    v_payment_id := v_existing_id;
  ELSIF v_existing_id IS NOT NULL THEN
    UPDATE public.payments
       SET method        = 'cash',
           amount        = v_order.total_amount,
           status        = 'pending',
           provider_ref  = NULL,
           provider_data = NULL,
           updated_at    = now()
     WHERE id = v_existing_id;
    v_payment_id := v_existing_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id, method, amount, status, created_by
    ) VALUES (
      v_order.tenant_id, v_order.branch_id, p_order_id, 'cash',
      v_order.total_amount, 'pending', v_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
     SET payment_method = 'cash',
         updated_at     = now()
   WHERE id = p_order_id;

  IF v_existing_st = 'completed' THEN
    RETURN jsonb_build_object(
      'status',        'already_completed',
      'order_id',      p_order_id,
      'payment_id',    v_payment_id,
      'cash_received', COALESCE(v_order.cash_received, p_cash_received),
      'cash_change',   COALESCE(v_order.cash_change, v_cash_change),
      'print_job_id',  NULL,
      'idempotent',    true
    );
  END IF;

  SELECT * INTO v_complete_res
  FROM public.complete_payment_and_consume_stock(
    v_payment_id,
    v_order.total_amount,
    jsonb_build_object('cash_received', p_cash_received, 'cash_change', v_cash_change),
    v_uid
  );

  IF v_complete_res.status = 'stock_failed' THEN
    RETURN jsonb_build_object(
      'status',      'stock_failed',
      'order_id',    p_order_id,
      'payment_id',  v_payment_id,
      'error_code',  'stock_consumption_failed',
      'detail',      v_complete_res.detail
    );
  END IF;

  IF v_complete_res.status = 'amount_mismatch_recomputed' THEN
    RETURN jsonb_build_object(
      'status',      'amount_mismatch_recomputed',
      'order_id',    p_order_id,
      'payment_id',  v_payment_id,
      'error_code',  'amount_mismatch_recomputed',
      'detail',      v_complete_res.detail
    );
  END IF;

  IF v_complete_res.status NOT IN ('completed', 'already_completed') THEN
    RAISE EXCEPTION 'payment completion failed: % (detail: %)',
      v_complete_res.status, v_complete_res.detail
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    v_receipt_res := public.enqueue_receipt_print(
      p_order_id,
      p_cash_received,
      v_cash_change
    );
  EXCEPTION WHEN OTHERS THEN
    v_print_warning := SQLERRM;
    v_receipt_res := jsonb_build_object('error', SQLERRM);
    RAISE NOTICE '[confirm_cash_payment] receipt enqueue skipped for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status',        'completed',
    'order_id',      p_order_id,
    'payment_id',    v_payment_id,
    'cash_received', p_cash_received,
    'cash_change',   v_cash_change,
    'print_job_id',  v_receipt_res->>'job_id',
    'print_warning', v_print_warning
  );
END;
$$;


--
-- Name: FUNCTION confirm_cash_payment(p_order_id bigint, p_cash_received numeric); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_cash_payment(p_order_id bigint, p_cash_received numeric) IS 'Cash payment confirmation. Reuses active payment slot, allows zero-total comp orders, delegates server recompute + stock fail-hard to complete_payment_and_consume_stock, and keeps receipt printing fail-soft.';


--
-- Name: confirm_goods_receipt_note(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_item            RECORD;
  v_branch          RECORD;
  v_old_q           NUMERIC(15,3);
  v_old_wac         NUMERIC(15,2);
  v_recv            NUMERIC(15,3);
  v_cost            NUMERIC(15,2);
  v_new_q           NUMERIC(15,3);
  v_new_wac         NUMERIC(15,2);
  v_inventory_total NUMERIC(15,2) := 0;
  v_review_pct      NUMERIC(5,2) := 15.0;
  v_review_count    INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.price_variance_pct IS NOT NULL
       AND ABS(v_item.price_variance_pct) > v_review_pct THEN
      UPDATE public.grn_items
      SET requires_review = TRUE
      WHERE id = v_item.id;
      v_review_count := v_review_count + 1;
    END IF;

    v_recv := v_item.received_quantity - COALESCE(v_item.rejected_quantity, 0);

    IF v_item.quality_status = 'rejected' OR v_recv <= 0 THEN
      CONTINUE;
    END IF;

    v_cost := v_item.unit_cost;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;

    v_inventory_total := v_inventory_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'review_count', v_review_count
  );
END;
$$;


--
-- Name: FUNCTION confirm_goods_receipt_note(p_grn_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint) IS 'Atomic confirm GRN. Stock += (received_quantity − rejected_quantity). PO fulfillment aggregate dùng net. GL journal posts net × unit_cost. Permission: procurement:grn_confirm.';


--
-- Name: confirm_payment_and_post(bigint, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_payment_and_post(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint, p_provider_ref text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_payment       RECORD;
  v_order         RECORD;
  v_journal_id    BIGINT;
  v_cogs_amount   NUMERIC(15,2);
  v_lines         JSONB;
  v_tax_amount    NUMERIC(15,2);
  v_net_amount    NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.* INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.total_amount, o.tax_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET status = 'completed',
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      paid_at = now(),
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'paid',
      updated_at = now()
  WHERE id = v_payment.order_id
    AND tenant_id = p_tenant_id;

  -- GL posting (COGS/journal) removed — no GL in HKD lean.
  PERFORM public.finalize_paid_order(v_payment.order_id, v_uid);

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'completed'
  );
END;
$$;


--
-- Name: confirm_vietqr_payment(bigint, bigint, bigint, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_vietqr_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_amount numeric, p_created_by uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order          RECORD;
  v_payment_id     BIGINT;
  v_existing_id    BIGINT;
  v_existing_status TEXT;
  v_idempotent     BOOLEAN := FALSE;
  v_journal_id     BIGINT;
  v_cogs_amount    NUMERIC(15,2);
  v_tax_amount     NUMERIC(15,2);
  v_net_amount     NUMERIC(15,2);
  v_lines          JSONB;
  v_receipt_res    JSONB;
  v_print_job_id   BIGINT;
  v_print_failed   BOOLEAN := FALSE;
  v_print_error    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id          = p_order_id
    AND tenant_id   = p_tenant_id
    AND branch_id   = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id  = p_order_id
      AND tenant_id = p_tenant_id
      AND status    = 'completed'
    ORDER BY id DESC LIMIT 1;

    RETURN jsonb_build_object(
      'payment_id', v_payment_id,
      'idempotent', TRUE,
      'print',      jsonb_build_object('failed', FALSE)
    );
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  SELECT id, status
  INTO v_existing_id, v_existing_status
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id  = p_order_id
    AND status   <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id := v_existing_id;
    v_idempotent := TRUE;

  ELSIF v_existing_status = 'pending' THEN
    UPDATE public.payments
    SET method     = 'vietqr',
        amount     = p_amount,
        status     = 'completed',
        paid_at    = now(),
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_payment_id;

  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id,
      method, amount, status, paid_at, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id,
      'vietqr', p_amount, 'completed', now(), p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  IF NOT v_idempotent THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        payment_method = 'vietqr',
        updated_at     = now()
    WHERE id = p_order_id;

    v_tax_amount := COALESCE(v_order.tax_amount, 0);
    v_net_amount := p_amount - v_tax_amount;

    SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
    INTO v_cogs_amount
    FROM public.stock_movements sm
    WHERE sm.order_id  = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.type      = 'consumption';

    v_lines := '[]'::JSONB;

    IF v_net_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',       'SALE_BANK',
        'amount',          v_net_amount,
        'line_description','Doanh thu đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_tax_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',       'SALE_VAT_BANK',
        'amount',          v_tax_amount,
        'line_description','Thuế GTGT đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_cogs_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',       'SALE_COGS',
        'amount',          v_cogs_amount,
        'line_description','Giá vốn đơn hàng #' || p_order_id
      ));
    END IF;

    -- GL posting removed (no GL in HKD lean).
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  BEGIN
    v_receipt_res  := public.enqueue_receipt_print(p_order_id, NULL, NULL);
    v_print_job_id := (v_receipt_res ->> 'job_id')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_print_failed := TRUE;
    v_print_error  := SQLERRM;
    RAISE NOTICE '[confirm_vietqr_payment] receipt print failed for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'idempotent', v_idempotent,
    'print', jsonb_build_object(
      'job_id', v_print_job_id,
      'failed', v_print_failed,
      'error',  v_print_error
    )
  );
END;
$$;


--
-- Name: FUNCTION confirm_vietqr_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_amount numeric, p_created_by uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_vietqr_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_amount numeric, p_created_by uuid) IS 'Atomic cashier-confirm for VietQR bank transfer. No payment row is created until the cashier taps Da thanh toan — QR is generated client-side. Upserts payment as completed, posts GL (SALE_BANK), finalizes order, and enqueues receipt failsoft. Gated by pos:confirm_payment.';


--
-- Name: create_order(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text DEFAULT 'dine_in'::text, p_table_id bigint DEFAULT NULL::bigint, p_pos_session_id bigint DEFAULT NULL::bigint, p_customer_count integer DEFAULT 1, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_created_by       UUID;
  v_order_id         BIGINT;
  v_order_number     TEXT;
  v_date_part        TEXT;
  v_subtotal         NUMERIC(15,2) := 0;
  v_seq              INT;
  v_table_number     INT;
  v_item             JSONB;
  v_base_price       NUMERIC(15,2);
  v_variant_adj      NUMERIC(15,2);
  v_modifier_sum     NUMERIC(15,2);
  v_sides_sum        NUMERIC(15,2);
  v_enriched_sides   JSONB;
  v_unit_price       NUMERIC(15,2);
  v_item_subtotal    NUMERIC(15,2);
  v_menu_item_id     BIGINT;
  v_variant_id       BIGINT;
  v_quantity         INT;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_branch_code      TEXT;
BEGIN
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_created_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF p_branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT t.number INTO v_table_number
      FROM public.tables t
     WHERE t.id = p_table_id AND t.branch_id = p_branch_id AND t.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_pos_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.pos_sessions
     WHERE id = p_pos_session_id
       AND branch_id = p_branch_id
       AND tenant_id = p_tenant_id
       AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS session does not belong to this branch or is not open' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_order_number
      FROM public.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
    END IF;
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYMMDD'
  );

  IF p_order_type = 'dine_in' THEN
    v_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_order_number := v_order_number || '-' || v_branch_code;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      tenant_id, branch_id, table_id, order_number, order_type,
      subtotal, total_amount, customer_count, note, created_by,
      pos_session_id, idempotency_key
    )
    VALUES (
      p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
      0, 0, p_customer_count, p_note, v_created_by,
      p_pos_session_id, p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT o.id, o.order_number INTO v_order_id, v_order_number
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.idempotency_key = p_idempotency_key;
        IF FOUND THEN
          RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
        END IF;
      END IF;
      RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
      FROM public.menu_items
     WHERE id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
        FROM public.menu_item_variants
       WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      p_tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
      INTO v_sides_sum, v_enriched_sides
      FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB)
      );

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal      := v_subtotal + v_item_subtotal;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note
    )
    VALUES (
      p_tenant_id, v_order_id, v_menu_item_id, v_variant_id,
      v_item ->> 'item_name', v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note'
    );
  END LOOP;

  UPDATE public.orders
     SET subtotal = v_subtotal, total_amount = v_subtotal
   WHERE id = v_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);

  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
       SET status = 'occupied'
     WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.route_order_to_kds(v_order_id);

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
END;
$$;


--
-- Name: create_payment(bigint, bigint, bigint, text, numeric, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_method text, p_amount numeric, p_created_by uuid, p_provider_ref text DEFAULT NULL::text, p_status text DEFAULT 'pending'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order                        RECORD;
  v_payment_id                   BIGINT;
  v_existing_payment_id          BIGINT;
  v_existing_status              TEXT;
  v_existing_method              TEXT;
  v_effective_method             TEXT;
  v_final_status                 TEXT;
  v_journal_id                   BIGINT;
  v_cogs_amount                  NUMERIC(15,2);
  v_revenue_rule                 TEXT;
  v_vat_rule                     TEXT;
  v_lines                        JSONB;
  v_tax_amount                   NUMERIC(15,2);
  v_net_amount                   NUMERIC(15,2);
  v_skip_completion_side_effects BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_method NOT IN ('cash', 'momo') THEN
    RAISE EXCEPTION 'invalid payment method: %. VietQR uses confirm_vietqr_payment.',
      p_method USING ERRCODE = '22023';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id        = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  v_final_status := CASE
    WHEN p_method = 'cash' THEN 'completed'
    ELSE COALESCE(p_status, 'pending')
  END;
  v_effective_method := p_method;

  SELECT id, status, method
  INTO v_existing_payment_id, v_existing_status, v_existing_method
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id  = p_order_id
    AND status   <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id                   := v_existing_payment_id;
    v_final_status                 := 'completed';
    v_effective_method             := v_existing_method;
    v_skip_completion_side_effects := TRUE;
  ELSIF v_existing_status = 'pending' THEN
    UPDATE public.payments
    SET method       = p_method,
        amount       = p_amount,
        status       = v_final_status,
        provider_ref = p_provider_ref,
        provider_data = NULL,
        paid_at      = CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
        updated_at   = now()
    WHERE id = v_existing_payment_id
    RETURNING id INTO v_payment_id;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status
      USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id,
      method, amount, status, provider_ref, paid_at, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id,
      p_method, p_amount, v_final_status,
      p_provider_ref,
      CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
      p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = v_effective_method,
      payment_status = CASE
        WHEN v_final_status = 'completed' THEN 'paid'
        ELSE payment_status
      END,
      updated_at     = now()
  WHERE id = p_order_id;

  IF v_final_status = 'completed' AND NOT v_skip_completion_side_effects THEN
    IF p_method = 'cash' THEN
      v_revenue_rule := 'SALE_CASH';
      v_vat_rule     := 'SALE_VAT_CASH';
    ELSE
      v_revenue_rule := 'SALE_BANK';
      v_vat_rule     := 'SALE_VAT_BANK';
    END IF;

    v_tax_amount := COALESCE(v_order.tax_amount, 0);
    v_net_amount := p_amount - v_tax_amount;

    SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
    INTO v_cogs_amount
    FROM public.stock_movements sm
    WHERE sm.order_id  = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.type      = 'consumption';

    v_lines := '[]'::JSONB;

    IF v_net_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',        v_revenue_rule,
        'amount',           v_net_amount,
        'line_description', 'Doanh thu đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_tax_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',        v_vat_rule,
        'amount',           v_tax_amount,
        'line_description', 'Thuế GTGT đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_cogs_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',        'SALE_COGS',
        'amount',           v_cogs_amount,
        'line_description', 'Giá vốn đơn hàng #' || p_order_id
      ));
    END IF;

    -- GL posting removed (no GL in HKD lean).
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object(
    'payment_id',   v_payment_id,
    'status',       v_final_status,
    'idempotent',   v_skip_completion_side_effects
  );
END;
$$;


--
-- Name: FUNCTION create_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_method text, p_amount numeric, p_created_by uuid, p_provider_ref text, p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_method text, p_amount numeric, p_created_by uuid, p_provider_ref text, p_status text) IS 'Atomic POS payment creation for cash and MoMo only. VietQR is handled by confirm_vietqr_payment. No longer sets orders.payment_status=pending — the order stays unpaid until payment is confirmed (completed). This unblocks split/merge/edit while a MoMo QR is pending.';


--
-- Name: create_refund(bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_refund(p_payment_id bigint, p_amount numeric, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor     UUID   := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_payment   RECORD;
  v_refund_id BIGINT;
  v_already   NUMERIC(15,2) := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, order_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_payment.branch_id, 'orders:refund') THEN
    RAISE EXCEPTION 'permission denied: orders:refund required'
      USING ERRCODE = '42501';
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already
  FROM public.refunds
  WHERE payment_id = v_payment.id
    AND status IN ('pending', 'approved');

  IF v_already + p_amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund_exceeds_remaining: already=%, requested=%, payment=%',
      v_already, p_amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.refunds
    (tenant_id, branch_id, payment_id, order_id, amount, reason, status, created_by)
  VALUES
    (v_payment.tenant_id, v_payment.branch_id, v_payment.id, v_payment.order_id,
     p_amount, p_reason, 'pending', v_actor)
  RETURNING id INTO v_refund_id;

  PERFORM public.log_audit(
    'refund.create',
    'refund',
    v_refund_id,
    NULL,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'order_id',   v_payment.order_id,
      'amount',     p_amount,
      'method',     v_payment.method
    )
  );

  RETURN jsonb_build_object(
    'status',    'created',
    'refund_id', v_refund_id
  );
END;
$$;


--
-- Name: FUNCTION create_refund(p_payment_id bigint, p_amount numeric, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_refund(p_payment_id bigint, p_amount numeric, p_reason text) IS 'Creates pending refunds with branch-scoped orders:refund permission, completed-payment precondition, cumulative refund cap, and audit logging.';


--
-- Name: create_stocktake_session(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_stocktake_session(p_branch_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_session_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, created_by)
  VALUES (v_tenant, p_branch_id, v_uid) RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity)
  SELECT v_tenant, v_session_id, sl.ingredient_id, sl.current_quantity
  FROM public.stock_levels sl WHERE sl.tenant_id = v_tenant AND sl.branch_id = p_branch_id;

  RETURN jsonb_build_object('id', v_session_id);
END;
$$;


--
-- Name: current_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_position() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(po.code, pr.role::text)
  FROM public.profiles pr
  LEFT JOIN public.positions po ON po.id = pr.position_id
  WHERE pr.id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  claims JSONB;
  user_profile RECORD;
BEGIN
  claims := event -> 'claims';

  SELECT
    p.tenant_id,
    p.branch_id,
    private.staff_role_from_position_code(po.code) AS user_role,
    po.code AS position_code
  INTO user_profile
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF user_profile.tenant_id IS NOT NULL THEN
    IF user_profile.user_role IS NULL THEN
      RAISE EXCEPTION
        'custom_access_token_hook: position_role_not_resolved for position=% tenant=%',
        user_profile.position_code, user_profile.tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.user_role,
        'position', user_profile.position_code
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;


--
-- Name: FUNCTION custom_access_token_hook(event jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.custom_access_token_hook(event jsonb) IS 'Auth hook emits tenant, branch, position, and StaffRole bucket claims.';


--
-- Name: decrement_branch_menu_daily_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_branch_menu_daily_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
  v_target     RECORD;
BEGIN
  IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    WITH agg AS (
      SELECT OLD.menu_item_id::BIGINT AS item_id,
             OLD.quantity::INT        AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::BIGINT,
             (OLD.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::INT, 1))::INT
      FROM jsonb_array_elements(COALESCE(OLD.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::INT AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = GREATEST(0, sold_today - v_target.need_qty)
    WHERE branch_id    = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date   = v_order_date;
  END LOOP;

  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION decrement_branch_menu_daily_limit(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.decrement_branch_menu_daily_limit() IS 'AFTER UPDATE OF status on order_items (→ cancelled): symmetric decrement using OLD.menu_item_id + OLD.sides aggregated by menu_item_id ASC. Bounded at 0 via GREATEST.';


--
-- Name: edit_pending_order_item(bigint, bigint, text, numeric, jsonb, jsonb, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.edit_pending_order_item(p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid            UUID;
  v_prof_tenant    BIGINT;
  v_prof_branch    BIGINT;
  v_prof_role      TEXT;
  v_item           public.order_items%ROWTYPE;
  v_order          public.orders%ROWTYPE;
  v_menu_active    BOOLEAN;
  v_base_price     NUMERIC(15,2);
  v_variant_adj    NUMERIC(15,2) := 0;
  v_modifier_sum   NUMERIC(15,2) := 0;
  v_sides_sum      NUMERIC(15,2) := 0;
  v_enriched_sides JSONB := '[]'::JSONB;
  v_new_unit       NUMERIC(15,2);
  v_old_qty        INT;
  v_old_unit       NUMERIC(15,2);
  v_new_subtotal   NUMERIC(15,2);
  v_subtotal_sum   NUMERIC(15,2);
  v_disc_amount    NUMERIC(15,2);
  v_total_amount   NUMERIC(15,2);
  v_flag_enabled   TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('manager', 'staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'unit_price must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_edit_pending_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = '22023';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'item not editable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT base_price, is_active
  INTO v_base_price, v_menu_active
  FROM public.menu_items
  WHERE id = v_item.menu_item_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND OR COALESCE(v_menu_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'menu item inactive' USING ERRCODE = '22023';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT price_adjustment INTO v_variant_adj
    FROM public.menu_item_variants
    WHERE id = p_variant_id
      AND item_id = v_item.menu_item_id
      AND tenant_id = v_order.tenant_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'variant inactive' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_variant_adj := 0;
  END IF;

  v_modifier_sum := public.pos_order_modifier_sum(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_modifiers, '[]'::JSONB)
  );

  SELECT sides_sum, enriched_sides
  INTO v_sides_sum, v_enriched_sides
  FROM public.pos_enrich_order_sides(
    v_order.tenant_id,
    v_item.menu_item_id,
    COALESCE(p_sides, '[]'::JSONB)
  );

  v_new_unit := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);

  v_old_qty := v_item.quantity;
  v_old_unit := v_item.unit_price;
  v_new_subtotal := v_new_unit * p_quantity;

  UPDATE public.order_items
  SET variant_id   = p_variant_id,
      variant_name = NULLIF(p_variant_name, ''),
      unit_price   = v_new_unit,
      modifiers    = COALESCE(p_modifiers, '[]'::JSONB),
      sides        = COALESCE(v_enriched_sides, '[]'::JSONB),
      note         = NULLIF(trim(COALESCE(p_note, '')), ''),
      quantity     = p_quantity,
      subtotal     = v_new_subtotal,
      updated_at   = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  v_disc_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal_sum
  );
  v_total_amount := v_subtotal_sum
    + COALESCE(v_order.service_charge, 0)
    - v_disc_amount;

  UPDATE public.orders
  SET subtotal        = v_subtotal_sum,
      discount_amount = v_disc_amount,
      total_amount    = v_total_amount,
      updated_at      = now()
  WHERE id = v_item.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'edit_item ' || p_order_item_id::TEXT
      || ': qty ' || v_old_qty::TEXT || '->' || p_quantity::TEXT
      || ', unit ' || v_old_unit::TEXT || '->' || v_new_unit::TEXT
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_quantity,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;


--
-- Name: FUNCTION edit_pending_order_item(p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.edit_pending_order_item(p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer) IS 'Sửa món đã gửi khi status=pending (chef chưa bắt đầu nấu). Server recompute unit_price/subtotal từ menu và không tin p_unit_price từ client. Sides JSONB được enrich qua pos_enrich_order_sides. Lock order + item, gate qua pos:void_order. Recompute discount qua compute_discount_amount, bump kds_tickets.updated_at.';


--
-- Name: enable_offline_for_session(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enable_offline_for_session(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(NULL, 'settings:tenant') THEN
    RAISE EXCEPTION 'forbidden: settings:tenant required for offline pilot' USING ERRCODE = '42501';
  END IF;
  IF v_ss.status <> 'in_progress' THEN RAISE EXCEPTION 'session not in_progress (status=%)', v_ss.status USING ERRCODE = '22023'; END IF;
  IF v_ss.offline_enabled THEN RAISE EXCEPTION 'offline already enabled for session %', p_session_id USING ERRCODE = '22023'; END IF;
  UPDATE public.stocktake_sessions SET offline_enabled = true, offline_enabled_by = v_uid, offline_enabled_at = now()
   WHERE id = p_session_id;
  RETURN jsonb_build_object('session_id', p_session_id, 'offline_enabled', true, 'enabled_by', v_uid, 'enabled_at', now());
END; $$;


--
-- Name: enforce_branch_menu_daily_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_branch_menu_daily_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
  v_target     RECORD;
  v_limit      RECORD;
BEGIN
  IF COALESCE(current_setting('comtammatu.skip_quota_enforcement', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    WITH agg AS (
      SELECT NEW.menu_item_id::BIGINT AS item_id,
             NEW.quantity::INT        AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::BIGINT,
             (NEW.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::INT, 1))::INT
      FROM jsonb_array_elements(COALESCE(NEW.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::INT AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    SELECT * INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id    = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date   = v_order_date
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_limit.is_disabled THEN
      RAISE EXCEPTION 'daily_limit_item_disabled: %', v_target.item_id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_limit.limit_quantity IS NOT NULL
       AND v_limit.sold_today + v_target.need_qty > v_limit.limit_quantity THEN
      RAISE EXCEPTION 'daily_limit_exceeded: item %, limit %, sold %, requested %',
        v_target.item_id, v_limit.limit_quantity, v_limit.sold_today, v_target.need_qty
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = sold_today + v_target.need_qty
    WHERE id = v_limit.id;
  END LOOP;

  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION enforce_branch_menu_daily_limit(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_branch_menu_daily_limit() IS 'AFTER INSERT on order_items: aggregate main + sides (JSONB) by menu_item_id ASC, lock each limit row FOR UPDATE, raise P0001 daily_limit_item_disabled / daily_limit_exceeded, increment sold_today. Skip-hatch: GUC comtammatu.skip_quota_enforcement = ''true'' (set by split-partial RPC).';


--
-- Name: enqueue_kitchen_print(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_kitchen_print(p_order_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', v_order.kitchen_send_count,
    'jobs', '[]'::jsonb,
    'deferred_to', 'kds_completion'
  );
END;
$$;


--
-- Name: FUNCTION enqueue_kitchen_print(p_order_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enqueue_kitchen_print(p_order_id bigint) IS 'POS send RPC returns the current deferred-print contract: work routes to KDS, and kitchen paper is queued by complete_kds_tickets when KDS marks items ready.';


--
-- Name: enqueue_provisional_bill(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_provisional_bill(p_order_id bigint, p_qr_content text DEFAULT NULL::text, p_qr_header_label text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_flag_enabled TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_payment_qr   JSONB;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:print') THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_provisional_bill_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'provisional bill printing is disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order already paid; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'provisional_bill'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_qr_content IS NOT NULL AND length(trim(p_qr_content)) > 0 THEN
    SELECT value INTO v_qr_type
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
    v_qr_type := COALESCE(v_qr_type, 'vietqr');

    IF v_qr_type = 'vietqr' THEN
      SELECT value INTO v_vietqr_bank FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
      SELECT value INTO v_vietqr_acc FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
      SELECT value INTO v_vietqr_name FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';
    END IF;

    v_payment_qr := jsonb_build_object(
      'type',          v_qr_type,
      'content',       p_qr_content,
      'header_label',  COALESCE(p_qr_header_label, UPPER(v_qr_type)),
      'account_no',    v_vietqr_acc,
      'account_name',  v_vietqr_name,
      'amount',        v_order.total_amount,
      'description',   'DH ' || v_order.order_number
    );
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'provisional_bill',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_qr',       v_payment_qr,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':provisional:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'provisional_bill',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'qr_type',    v_qr_type
  );
END;
$$;


--
-- Name: enqueue_receipt_print(bigint, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_receipt_print(p_order_id bigint, p_cash_received numeric DEFAULT NULL::numeric, p_cash_change numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('pos:print')
    OR public.has_permission_any('pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'receipt'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_cash_received IS NOT NULL OR p_cash_change IS NOT NULL THEN
    UPDATE public.orders
       SET cash_received = p_cash_received,
           cash_change   = p_cash_change
     WHERE id = p_order_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'receipt',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT || ':receipt';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload    = EXCLUDED.payload,
    printer_id = EXCLUDED.printer_id,
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired','printed')
               THEN 'pending'
               ELSE public.print_jobs.status
             END,
    last_error       = NULL,
    claimed_by_agent = NULL,
    claimed_at       = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;


--
-- Name: enqueue_shift_close_print(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_shift_close_print(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                 UUID;
  v_session             RECORD;
  v_branch              RECORD;
  v_cashier_name        TEXT;
  v_approver_name       TEXT;
  v_branch_tax          TEXT;
  v_printer_id          BIGINT;
  v_breakdown           JSONB;
  v_total_revenue       NUMERIC(15,2);
  v_item_breakdown      JSONB;
  v_total_item_quantity INT;
  v_payload             JSONB;
  v_idempotency         TEXT;
  v_job_id              BIGINT;
  v_now                 TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, opening_cash, closing_cash,
         expected_cash, cash_difference, opened_at, closed_at, closed_by,
         note, variance_approval_note, variance_approver_user_id
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'session not closed yet' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('pos:close_shift') THEN
    RAISE EXCEPTION 'permission denied: pos:close_shift' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_session.branch_id;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_session.closed_by;

  IF v_session.variance_approver_user_id IS NOT NULL THEN
    SELECT full_name INTO v_approver_name
    FROM public.profiles WHERE id = v_session.variance_approver_user_id;
  END IF;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_session.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_session.tenant_id,
    v_session.branch_id,
    'shift_close_report'
  );

  IF v_printer_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'method',  payment_method,
      'count',   cnt,
      'amount',  amount
    ) ORDER BY payment_method), '[]'::jsonb),
    COALESCE(SUM(amount), 0)
  INTO v_breakdown, v_total_revenue
  FROM (
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*) AS cnt,
      SUM(total_amount) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) AS grp;

  WITH paid_items AS (
    SELECT
      oi.item_name,
      oi.quantity,
      oi.unit_price,
      CASE
        WHEN jsonb_typeof(oi.modifiers) = 'array' THEN oi.modifiers
        ELSE '[]'::jsonb
      END AS modifiers,
      CASE
        WHEN jsonb_typeof(oi.sides) = 'array' THEN oi.sides
        ELSE '[]'::jsonb
      END AS sides
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.pos_session_id = p_session_id
      AND o.tenant_id = v_session.tenant_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ),
  item_unit_prices AS (
    SELECT
      pi.item_name,
      pi.quantity,
      pi.unit_price,
      pi.modifiers,
      pi.sides,
      COALESCE((
        SELECT SUM(COALESCE(NULLIF(m->>'price', '')::numeric, 0))
        FROM jsonb_array_elements(pi.modifiers) AS m
      ), 0) AS modifier_unit_sum,
      COALESCE((
        SELECT SUM(
          COALESCE(NULLIF(s->>'price', '')::numeric, 0)
          * COALESCE(NULLIF(s->>'quantity', '')::numeric, 1)
        )
        FROM jsonb_array_elements(pi.sides) AS s
      ), 0) AS side_unit_sum
    FROM paid_items pi
  ),
  main_agg AS (
    SELECT
      item_name AS name,
      'main'::TEXT AS source,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(GREATEST(0, COALESCE(unit_price, 0) - modifier_unit_sum - side_unit_sum) * COALESCE(quantity, 0)), 0) AS revenue,
      1 AS source_order
    FROM item_unit_prices
    GROUP BY item_name
  ),
  side_agg AS (
    SELECT
      COALESCE(NULLIF(s->>'name', ''), NULLIF(s->>'side_item_name', ''), 'Side')::TEXT AS name,
      'side'::TEXT AS source,
      COALESCE(SUM(COALESCE(NULLIF(s->>'quantity', '')::numeric, 1) * COALESCE(pi.quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(
        COALESCE(NULLIF(s->>'price', '')::numeric, 0)
        * COALESCE(NULLIF(s->>'quantity', '')::numeric, 1)
        * COALESCE(pi.quantity, 0)
      ), 0) AS revenue,
      2 AS source_order
    FROM item_unit_prices pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS s
    GROUP BY COALESCE(NULLIF(s->>'name', ''), NULLIF(s->>'side_item_name', ''), 'Side')
  ),
  mod_agg AS (
    SELECT
      COALESCE(NULLIF(m->>'name', ''), 'Modifier')::TEXT AS name,
      'modifier'::TEXT AS source,
      COALESCE(SUM(COALESCE(pi.quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(COALESCE(NULLIF(m->>'price', '')::numeric, 0) * COALESCE(pi.quantity, 0)), 0) AS revenue,
      3 AS source_order
    FROM item_unit_prices pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.modifiers) AS m
    GROUP BY COALESCE(NULLIF(m->>'name', ''), 'Modifier')
  ),
  all_items AS (
    SELECT name, source, qty, revenue, source_order FROM main_agg
    UNION ALL
    SELECT name, source, qty, revenue, source_order FROM side_agg
    UNION ALL
    SELECT name, source, qty, revenue, source_order FROM mod_agg
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', name,
        'source', source,
        'qty', qty,
        'revenue', revenue
      )
      ORDER BY source_order, qty DESC, name
    ), '[]'::jsonb),
    COALESCE(SUM(qty), 0)::INT
  INTO v_item_breakdown, v_total_item_quantity
  FROM all_items;

  v_payload := jsonb_build_object(
    'kind',                  'shift_close_report',
    'branch_name',           COALESCE(v_branch.name, ''),
    'branch_address',        COALESCE(v_branch.address, ''),
    'branch_phone',          COALESCE(v_branch.phone, ''),
    'branch_tax_code',       COALESCE(v_branch_tax, ''),
    'session_id',            p_session_id,
    'cashier_name',          COALESCE(v_cashier_name, ''),
    'opened_at',             to_char(v_session.opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'closed_at',             to_char(v_session.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'opening_cash',          v_session.opening_cash,
    'closing_cash',          v_session.closing_cash,
    'expected_cash',         v_session.expected_cash,
    'cash_difference',       v_session.cash_difference,
    'note',                  v_session.note,
    'variance_note',         v_session.variance_approval_note,
    'variance_approver',     v_approver_name,
    'paid_order_count',      (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND payment_status = 'paid'
         AND status <> 'cancelled'
    ),
    'unpaid_order_count',    (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND payment_status <> 'paid'
         AND status <> 'cancelled'
    ),
    'cancelled_order_count', (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND status = 'cancelled'
    ),
    'payment_breakdown',     v_breakdown,
    'total_revenue',         v_total_revenue,
    'total_item_quantity',   COALESCE(v_total_item_quantity, 0),
    'item_breakdown',        COALESCE(v_item_breakdown, '[]'::jsonb),
    'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'session:' || p_session_id::TEXT || ':shift_close';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_session.tenant_id, v_session.branch_id, v_printer_id, 'shift_close_report',
    NULL, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    status  = CASE WHEN public.print_jobs.status IN ('failed', 'expired')
                   THEN 'pending' ELSE public.print_jobs.status END,
    last_error = NULL,
    claimed_by_agent = NULL,
    claimed_at = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;


--
-- Name: ensure_journal_write_permission(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_journal_write_permission(p_branch_id bigint DEFAULT NULL::bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch not found for tenant' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.has_permission(p_branch_id, 'finance:expense_approve') THEN
      RAISE EXCEPTION 'permission denied: finance:expense_approve required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(NULL, 'finance:expense_approve') THEN
      RAISE EXCEPTION 'permission denied: finance:expense_approve required'
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;


--
-- Name: escalate_round_4(bigint, bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.escalate_round_4(p_session_id bigint, p_ingredient_id bigint, p_final_qty numeric, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF length(COALESCE(p_note, '')) < 20 THEN RAISE EXCEPTION 'escalation note must be at least 20 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity,
    counted_quantity, counted_by, counted_at, round_no, variance_reason, is_final, needs_recount, abc_class)
  SELECT v_ss.tenant_id, p_session_id, p_ingredient_id,
    (SELECT system_quantity FROM public.stocktake_lines WHERE session_id=p_session_id AND ingredient_id=p_ingredient_id AND round_no=1),
    p_final_qty, v_uid, now(), 4, '[ROUND4] ' || p_note, true, false,
    (SELECT abc_class FROM public.stocktake_lines WHERE session_id=p_session_id AND ingredient_id=p_ingredient_id AND round_no=1)
  ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE SET
    counted_quantity = EXCLUDED.counted_quantity, counted_by = EXCLUDED.counted_by,
    counted_at = EXCLUDED.counted_at, variance_reason = EXCLUDED.variance_reason, is_final = true;
  UPDATE public.stocktake_lines SET counted_quantity = p_final_qty, is_final = true, needs_recount = false,
    variance_reason = COALESCE(variance_reason, '') || E'\n[ROUND4 escalated by ' || v_uid::TEXT || ']'
  WHERE session_id = p_session_id AND ingredient_id = p_ingredient_id AND round_no = 1;
END; $$;


--
-- Name: expire_stuck_print_jobs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_stuck_print_jobs(p_stale_after_seconds integer DEFAULT 300) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_revived INT;
BEGIN
  UPDATE public.print_jobs
     SET status           = 'pending',
         claimed_by_agent = NULL,
         claimed_at       = NULL,
         last_error       = COALESCE(last_error, '') ||
                            CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE E'\n' END ||
                            'reaped: stuck in processing >' ||
                            p_stale_after_seconds || 's at ' || now()::text
   WHERE status     = 'processing'
     AND claimed_at < (now() - make_interval(secs => p_stale_after_seconds));

  GET DIAGNOSTICS v_revived = ROW_COUNT;
  RETURN v_revived;
END;
$$;


--
-- Name: feedback_validate_categories(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedback_validate_categories(p_cats text[]) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
  valid_cats CONSTANT TEXT[] := ARRAY[
    'food.quality.cold',
    'food.quality.raw',
    'food.quality.spoiled',
    'food.quality.taste',
    'food.quality.portion',
    'service.slow',
    'service.attitude',
    'service.wrong_order',
    'service.missing_item',
    'hygiene.dirty_table',
    'hygiene.bug',
    'hygiene.smell',
    'hygiene.toilet',
    'pricing.overcharged',
    'pricing.unclear',
    'ambience.noise',
    'ambience.crowded',
    'ambience.aircon',
    'ambience.parking',
    'praise.food',
    'praise.service',
    'praise.value',
    'suggestion.menu',
    'suggestion.facility',
    'other'
  ];
  v_cat TEXT;
BEGIN
  IF p_cats IS NULL THEN
    RETURN TRUE;
  END IF;
  FOREACH v_cat IN ARRAY p_cats LOOP
    IF NOT (v_cat = ANY(valid_cats)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;


--
-- Name: FUNCTION feedback_validate_categories(p_cats text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.feedback_validate_categories(p_cats text[]) IS 'Returns TRUE iff every element is a member of the fixed feedback category taxonomy. Used in feedbacks.ai_categories CHECK constraint.';


--
-- Name: finalize_paid_order(bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_paid_order(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order  RECORD;
  v_actor  UUID := COALESCE(p_actor_id, auth.uid());
BEGIN
  SELECT o.id, o.tenant_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RETURN;
  END IF;

  UPDATE public.orders
  SET status     = 'completed',
      updated_at = now()
  WHERE id = p_order_id;

  IF v_actor IS NOT NULL THEN
    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_order.tenant_id,
      p_order_id,
      v_order.status,
      'completed',
      v_actor,
      'auto_complete_on_payment'
    );
  END IF;
END;
$$;


--
-- Name: FUNCTION finalize_paid_order(p_order_id bigint, p_actor_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.finalize_paid_order(p_order_id bigint, p_actor_id uuid) IS 'Helper: marks order as completed after payment confirmed. Idempotent. Does NOT force order_items/kds_tickets — chef continues via KDS flow even after order completed (pay-first-cook-after is a valid F&B case). Table release fires via trg_release_table_on_order_status trigger.';


--
-- Name: finalize_stocktake(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_stocktake(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD; v_pending INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_complete') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_ss.status <> 'in_progress' THEN RAISE EXCEPTION 'session not in_progress' USING ERRCODE = '22023'; END IF;
  SELECT COUNT(*) INTO v_pending FROM public.stocktake_lines WHERE session_id = p_session_id AND round_no = 1 AND is_final = false;
  IF v_pending > 0 THEN RAISE EXCEPTION 'cannot finalize: % round-1 line(s) still not final', v_pending USING ERRCODE = '22023'; END IF;
  UPDATE public.stocktake_sessions SET status = 'completed', completed_at = now() WHERE id = p_session_id;
  RETURN jsonb_build_object('session_id', p_session_id, 'status', 'completed', 'completed_at', now());
END; $$;


--
-- Name: finance_views_last_refresh(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finance_views_last_refresh() RETURNS TABLE(last_run timestamp with time zone, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.end_time, d.status
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = 'refresh-finance-views-daily'
  ORDER BY d.start_time DESC
  LIMIT 1;
END;
$$;


--
-- Name: find_payment_order_desync(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_payment_order_desync(p_since timestamp with time zone DEFAULT (now() - '30 days'::interval)) RETURNS TABLE(payment_id bigint, order_id bigint, tenant_id bigint, branch_id bigint, amount numeric, payment_method text, payment_status text, payment_paid_at timestamp with time zone, order_status text, order_payment_status text, order_created_at timestamp with time zone, age_minutes integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    p.id                                     AS payment_id,
    p.order_id                               AS order_id,
    p.tenant_id                              AS tenant_id,
    p.branch_id                              AS branch_id,
    p.amount                                 AS amount,
    p.method                                 AS payment_method,
    p.status                                 AS payment_status,
    p.paid_at                                AS payment_paid_at,
    o.status                                 AS order_status,
    o.payment_status                         AS order_payment_status,
    o.created_at                             AS order_created_at,
    GREATEST(
      EXTRACT(EPOCH FROM (now() - p.paid_at))::INTEGER / 60,
      0
    )                                        AS age_minutes
  FROM public.payments p
  JOIN public.orders   o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
  WHERE p.tenant_id = public.auth_tenant_id()
    AND p.status = 'completed'
    AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
    AND p.paid_at >= p_since
    AND public.has_permission_any('finance:view')
  ORDER BY p.paid_at DESC;
$$;


--
-- Name: FUNCTION find_payment_order_desync(p_since timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.find_payment_order_desync(p_since timestamp with time zone) IS 'Ops reconciliation: rows are payments marked completed whose order did not flip to paid. Returns empty for callers without finance:view. Lookback window defaults to 30 days.';


--
-- Name: get_branch_menu_daily_limits_for_pos(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_branch_menu_daily_limits_for_pos(p_branch_id bigint) RETURNS TABLE(menu_item_id bigint, limit_quantity integer, is_disabled boolean, sold_today integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    bl.menu_item_id,
    bl.limit_quantity,
    bl.is_disabled,
    bl.sold_today
  FROM public.branch_menu_item_daily_limits bl
  WHERE bl.tenant_id = public.auth_tenant_id()
    AND bl.branch_id = p_branch_id
    AND bl.limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND (
      public.auth_role() IN ('owner', 'manager')
      OR public.auth_branch_id() = p_branch_id
    );
$$;


--
-- Name: get_cash_variance_summary(bigint, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cash_variance_summary(p_branch_id bigint, p_start_date date, p_end_date date) RETURNS TABLE(session_count bigint, total_variance numeric, abs_variance_total numeric, short_count bigint, short_total numeric, over_count bigint, over_total numeric, worst_cashiers jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH closed_in_range AS (
    SELECT
      ps.id,
      ps.opened_by AS cashier_id,
      ps.cash_difference
    FROM public.pos_sessions ps
    WHERE ps.tenant_id = v_tenant
      AND ps.status = 'closed'
      AND ps.closed_at IS NOT NULL
      AND ps.cash_difference IS NOT NULL
      AND (ps.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      AND (ps.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
      AND (
        (p_branch_id IS NOT NULL AND ps.branch_id = p_branch_id)
        OR (p_branch_id IS NULL AND public.has_permission(ps.branch_id, 'finance:view'))
      )
  ),
  agg AS (
    SELECT
      COUNT(*)::BIGINT AS session_count,
      COALESCE(SUM(c.cash_difference), 0) AS total_variance,
      COALESCE(SUM(ABS(c.cash_difference)), 0) AS abs_variance_total,
      COUNT(*) FILTER (WHERE c.cash_difference < 0)::BIGINT AS short_count,
      COALESCE(SUM(c.cash_difference) FILTER (WHERE c.cash_difference < 0), 0) AS short_total,
      COUNT(*) FILTER (WHERE c.cash_difference > 0)::BIGINT AS over_count,
      COALESCE(SUM(c.cash_difference) FILTER (WHERE c.cash_difference > 0), 0) AS over_total
    FROM closed_in_range c
  ),
  by_cashier AS (
    SELECT
      c.cashier_id,
      COALESCE(pr.full_name, '—') AS cashier_name,
      COUNT(*)::BIGINT AS session_count,
      SUM(c.cash_difference) AS net_variance,
      SUM(ABS(c.cash_difference)) AS abs_variance
    FROM closed_in_range c
    LEFT JOIN public.profiles pr ON pr.id = c.cashier_id
    GROUP BY c.cashier_id, pr.full_name
  ),
  worst_top3 AS (
    SELECT bc.*
    FROM by_cashier bc
    WHERE bc.abs_variance > 0
    ORDER BY bc.abs_variance DESC
    LIMIT 3
  ),
  worst_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'cashier_id',     w.cashier_id,
          'cashier_name',   w.cashier_name,
          'session_count',  w.session_count,
          'net_variance',   w.net_variance,
          'abs_variance',   w.abs_variance
        )
        ORDER BY w.abs_variance DESC
      ),
      '[]'::jsonb
    ) AS rows
    FROM worst_top3 w
  )
  SELECT
    agg.session_count,
    agg.total_variance,
    agg.abs_variance_total,
    agg.short_count,
    agg.short_total,
    agg.over_count,
    agg.over_total,
    worst_json.rows AS worst_cashiers
  FROM agg
  CROSS JOIN worst_json;
END;
$$;


--
-- Name: FUNCTION get_cash_variance_summary(p_branch_id bigint, p_start_date date, p_end_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_cash_variance_summary(p_branch_id bigint, p_start_date date, p_end_date date) IS 'Aggregate POS cash variance over closed sessions in range. Variance is owned by pos_sessions.opened_by; closed_by is only the close actor and may be a manager closing another cashier shift. NULL branch = sum across branches caller has finance:view.';


--
-- Name: get_daily_revenue(bigint, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_revenue(p_branch_id bigint, p_start_date date, p_end_date date) RETURNS TABLE(date date, branch_id bigint, tenant_id bigint, order_count bigint, total_revenue numeric, total_tax numeric, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid       UUID;
  v_tenant    BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc   TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
      o.branch_id,
      o.tenant_id,
      COUNT(DISTINCT o.id)::BIGINT AS order_count,
      COALESCE(SUM(o.total_amount), 0) AS total_revenue,
      COALESCE(SUM(o.tax_amount), 0) AS total_tax,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'momo'), 0) AS momo_revenue
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = v_tenant
      AND p.branch_id = p_branch_id
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
    GROUP BY 1, o.branch_id, o.tenant_id
    ORDER BY 1;
END;
$$;


--
-- Name: FUNCTION get_daily_revenue(p_branch_id bigint, p_start_date date, p_end_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_daily_revenue(p_branch_id bigint, p_start_date date, p_end_date date) IS 'Live paid-at revenue by day for one branch. Uses completed payments, Asia/Ho_Chi_Minh buckets, and finance:view branch permission.';


--
-- Name: get_finance_dashboard_summary(date, date, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_finance_dashboard_summary(p_start_date date, p_end_date date, p_branch_id bigint DEFAULT NULL::bigint) RETURNS TABLE(invoice_attention_count bigint, invoice_issued_count bigint, invoice_not_required_count bigint, journal_draft_count bigint, journal_posted_count bigint, failed_webhook_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = p_branch_id
        AND b.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'branch not found' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH scoped_tax_invoices AS MATERIALIZED (
    SELECT ti.*
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant
      AND (
        (p_branch_id IS NOT NULL AND ti.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR ti.branch_id = ANY(v_branch_ids)
          )
        )
      )
  ),
  scoped_failed_webhooks AS MATERIALIZED (
    SELECT we.id
    FROM public.webhook_events we
    LEFT JOIN public.payments p
      ON p.id = we.payment_id
     AND p.tenant_id = we.tenant_id
    WHERE we.tenant_id = v_tenant
      AND we.processing_status = 'failed'
      AND we.created_at >= v_start_utc
      AND we.created_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND p.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR p.branch_id = ANY(v_branch_ids)
          )
        )
      )
  )
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status IN ('draft', 'signing', 'submitted')
    ) AS invoice_attention_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'issued'
        AND ti.issued_at >= v_start_utc
        AND ti.issued_at < v_end_utc
    ) AS invoice_issued_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'not_required'
        AND ti.created_at >= v_start_utc
        AND ti.created_at < v_end_utc
    ) AS invoice_not_required_count,
    0::BIGINT AS journal_draft_count,
    0::BIGINT AS journal_posted_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_failed_webhooks
    ) AS failed_webhook_count;
END;
$$;


--
-- Name: FUNCTION get_finance_dashboard_summary(p_start_date date, p_end_date date, p_branch_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_finance_dashboard_summary(p_start_date date, p_end_date date, p_branch_id bigint) IS 'Finance home work-queue counters. Uses caller finance:view permission, branch scope, and Asia/Ho_Chi_Minh local date windows. p_branch_id NULL returns rows scoped to branches the caller can view plus tenant-wide journal entries.';


--
-- Name: get_grn_price_baseline(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_grn_price_baseline(p_supplier_id bigint, p_ingredient_id bigint, p_uom text DEFAULT NULL::text) RETURNS TABLE(avg_30d numeric, sample_n integer, last_seen_at date, baseline_source text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(NULL, 'procurement:price_list_read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public._compute_grn_price_baseline(v_tenant, p_supplier_id, p_ingredient_id, p_uom);
END; $$;


--
-- Name: get_inventory_alerts(bigint, text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_alerts(p_branch_id bigint, p_types text[] DEFAULT ARRAY['low_stock'::text, 'out_of_stock'::text, 'negative_stock'::text], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(alert_type text, severity_rank integer, ingredient_id bigint, ingredient_name text, current_quantity numeric, reorder_point numeric, shortage_ratio numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_permission(p_branch_id, 'inventory:read') OR public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT (CASE WHEN m.current_quantity < 0 THEN 'negative_stock' WHEN m.current_quantity = 0 THEN 'out_of_stock' ELSE 'low_stock' END)::TEXT,
    (CASE WHEN m.current_quantity < 0 THEN 0 WHEN m.current_quantity = 0 THEN 1 ELSE 2 END)::INT,
    m.ingredient_id, m.ingredient_name, m.current_quantity, m.reorder_point,
    (CASE WHEN m.reorder_point > 0 THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END)::NUMERIC
  FROM public.mv_inventory_stock_current m
  WHERE m.tenant_id = v_tenant AND m.branch_id = p_branch_id AND m.reorder_point IS NOT NULL AND m.current_quantity < m.reorder_point
    AND (('low_stock' = ANY(p_types) AND m.current_quantity > 0) OR ('out_of_stock' = ANY(p_types) AND m.current_quantity = 0) OR ('negative_stock' = ANY(p_types) AND m.current_quantity < 0))
  ORDER BY CASE WHEN m.current_quantity < 0 THEN 0 WHEN m.current_quantity = 0 THEN 1 ELSE 2 END,
           CASE WHEN m.reorder_point > 0 THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END DESC
  LIMIT p_limit OFFSET p_offset;
END; $$;


--
-- Name: get_inventory_dashboard(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_dashboard(p_branch_id bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_tenant BIGINT := public.auth_tenant_id(); v_can_cost BOOLEAN;
  v_summary JSONB; v_alerts JSONB;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_permission(p_branch_id, 'inventory:read') OR public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_can_cost := public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant');

  SELECT jsonb_build_object(
    'total_skus', COALESCE(COUNT(DISTINCT m.ingredient_id), 0),
    'total_quantity', COALESCE(SUM(m.current_quantity), 0),
    'total_value_vnd', CASE WHEN v_can_cost THEN COALESCE(SUM(m.stock_value), 0) ELSE NULL END,
    'alerts_count', (SELECT COUNT(*) FROM public.mv_inventory_stock_current a
                     WHERE a.tenant_id=v_tenant AND a.branch_id=p_branch_id
                       AND a.reorder_point IS NOT NULL AND a.current_quantity < a.reorder_point)
  ) INTO v_summary FROM public.mv_inventory_stock_current m
  WHERE m.tenant_id=v_tenant AND m.branch_id=p_branch_id;

  SELECT COALESCE(jsonb_agg(a ORDER BY (a->>'severity_rank'), (a->>'shortage_ratio') DESC), '[]'::JSONB)
  INTO v_alerts FROM (
    SELECT jsonb_build_object(
      'alert_type', CASE WHEN m.current_quantity < 0 THEN 'negative_stock'
                         WHEN m.current_quantity = 0 THEN 'out_of_stock' ELSE 'low_stock' END,
      'severity_rank', CASE WHEN m.current_quantity < 0 THEN 0 WHEN m.current_quantity = 0 THEN 1 ELSE 2 END,
      'ingredient_id', m.ingredient_id, 'ingredient_name', m.ingredient_name,
      'current_quantity', m.current_quantity, 'reorder_point', m.reorder_point,
      'shortage_ratio', CASE WHEN m.reorder_point > 0 THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END
    ) AS a FROM public.mv_inventory_stock_current m
    WHERE m.tenant_id=v_tenant AND m.branch_id=p_branch_id AND m.reorder_point IS NOT NULL AND m.current_quantity < m.reorder_point
    ORDER BY CASE WHEN m.current_quantity < 0 THEN 0 WHEN m.current_quantity = 0 THEN 1 ELSE 2 END,
             CASE WHEN m.reorder_point > 0 THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END DESC
    LIMIT 5) t;

  RETURN jsonb_build_object('branch_id', p_branch_id, 'computed_at', now(), 'can_view_cost', v_can_cost,
    'summary', v_summary, 'top_alerts', v_alerts);
END; $$;


--
-- Name: get_orders_for_day(bigint, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) RETURNS TABLE(order_id bigint, order_number text, branch_id bigint, branch_name text, paid_at timestamp with time zone, paid_hour integer, order_type text, customer_count integer, subtotal numeric, discount_amount numeric, tax_amount numeric, total_amount numeric, payment_method text, item_count bigint, invoice_status text, invoice_number text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required for drill-down'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
    FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      o.id AS order_id,
      o.order_number,
      o.branch_id,
      b.name AS branch_name,
      p.paid_at,
      EXTRACT(HOUR FROM (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT
        AS paid_hour,
      o.order_type,
      o.customer_count,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.total_amount,
      o.payment_method,
      (SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.status <> 'cancelled')::BIGINT
        AS item_count,
      ti.status         AS invoice_status,
      ti.invoice_number
    FROM public.orders o
    JOIN public.branches b
      ON b.id = o.branch_id
     AND b.tenant_id = o.tenant_id
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    LEFT JOIN public.tax_invoices ti
      ON ti.order_id  = o.id
     AND ti.tenant_id = o.tenant_id
     AND ti.status NOT IN ('cancelled', 'replaced')
    WHERE o.tenant_id = v_tenant
      AND o.branch_id = p_branch_id
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
    ORDER BY p.paid_at;
END;
$$;


--
-- Name: get_pos_session_report(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pos_session_report(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session              RECORD;
  v_totals               RECORD;
  v_payment_mix          JSONB;
  v_top_items            JSONB;
  v_categories           JSONB;
  v_total_items          INT;
  v_hourly               JSONB;
  v_peak_hour            JSONB;
  v_aov_bins             JSONB;
  v_discount_count       INT;
  v_discount_total       NUMERIC(15,2);
  v_top_discount_orders  JSONB;
  v_void_item_count      INT;
BEGIN
  SELECT
    s.id, s.tenant_id, s.branch_id, s.terminal_id,
    s.opened_at, s.closed_at, s.opening_cash, s.closing_cash,
    s.expected_cash, s.cash_difference, s.status, s.note,
    s.variance_approval_note,
    t.name AS terminal_name,
    pop.full_name AS opened_by_name,
    pcl.full_name AS closed_by_name
  INTO v_session
  FROM public.pos_sessions s
  LEFT JOIN public.pos_terminals t  ON t.id  = s.terminal_id
  LEFT JOIN public.profiles pop     ON pop.id = s.opened_by
  LEFT JOIN public.profiles pcl     ON pcl.id = s.closed_by
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled') AS paid_count,
    COUNT(*) FILTER (WHERE payment_status <> 'paid' AND status <> 'cancelled') AS unpaid_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COALESCE(SUM(subtotal) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS gross,
    COALESCE(SUM(discount_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS discount_total,
    COALESCE(SUM(tax_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS tax_total,
    COALESCE(SUM(service_charge) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS service_total,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled'), 0) AS net,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled' AND payment_method = 'cash'), 0) AS cash_revenue,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND status <> 'cancelled' AND (payment_method IS NULL OR payment_method <> 'cash')), 0) AS noncash_revenue
  INTO v_totals
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('method', payment_method, 'count', cnt, 'amount', amount)
    ORDER BY amount DESC
  ), '[]'::JSONB)
  INTO v_payment_mix
  FROM (
    SELECT payment_method, COUNT(*)::INT AS cnt, COALESCE(SUM(total_amount), 0) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) pm;

  WITH paid_items AS (
    SELECT
      oi.menu_item_id, oi.item_name,
      mi.category_id, mc.name AS category_name,
      oi.quantity, oi.subtotal, oi.modifiers, oi.sides
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN public.menu_items mi      ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE o.pos_session_id = p_session_id
      AND o.tenant_id = v_session.tenant_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ),
  main_agg AS (
    SELECT item_name AS name, 'main'::TEXT AS source,
      COALESCE(SUM(quantity), 0)::INT AS qty,
      COALESCE(SUM(subtotal), 0) AS revenue
    FROM paid_items
    GROUP BY item_name
  ),
  side_agg AS (
    SELECT
      COALESCE(s ->> 'name', 'Side')::TEXT AS name,
      'side'::TEXT AS source,
      COALESCE(SUM(COALESCE((s ->> 'quantity')::INT, 1) * pi.quantity), 0)::INT AS qty,
      COALESCE(SUM(COALESCE((s ->> 'price')::NUMERIC, 0) * COALESCE((s ->> 'quantity')::INT, 1) * pi.quantity), 0) AS revenue
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS s
    GROUP BY s ->> 'name'
  ),
  mod_agg AS (
    SELECT
      COALESCE(m ->> 'name', 'Modifier')::TEXT AS name,
      'modifier'::TEXT AS source,
      COALESCE(SUM(pi.quantity), 0)::INT AS qty,
      COALESCE(SUM(COALESCE((m ->> 'price')::NUMERIC, 0) * pi.quantity), 0) AS revenue
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.modifiers) AS m
    GROUP BY m ->> 'name'
  ),
  all_items AS (
    SELECT name, source, qty, revenue FROM main_agg
    UNION ALL
    SELECT name, source, qty, revenue FROM side_agg
    UNION ALL
    SELECT name, source, qty, revenue FROM mod_agg
  ),
  cat_agg AS (
    SELECT
      COALESCE(category_id, 0) AS category_id,
      COALESCE(category_name, 'Khác') AS category_name,
      COALESCE(SUM(quantity), 0)::INT AS qty,
      COALESCE(SUM(subtotal), 0) AS revenue
    FROM paid_items
    GROUP BY category_id, category_name
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'source', source, 'qty', qty, 'revenue', revenue) ORDER BY qty DESC, revenue DESC), '[]'::JSONB)
     FROM (SELECT name, source, qty, revenue FROM all_items ORDER BY qty DESC, revenue DESC LIMIT 10) ti),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('category_id', category_id, 'category_name', category_name, 'qty', qty, 'revenue', revenue) ORDER BY revenue DESC), '[]'::JSONB)
     FROM cat_agg),
    COALESCE((SELECT SUM(qty) FROM all_items), 0)::INT
  INTO v_top_items, v_categories, v_total_items;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('hour', hour, 'order_count', cnt, 'revenue', revenue)
    ORDER BY hour
  ), '[]'::JSONB)
  INTO v_hourly
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT AS hour,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY 1
  ) h;

  SELECT
    CASE WHEN cnt > 0 THEN
      jsonb_build_object('hour', hour, 'order_count', cnt, 'revenue', revenue)
    ELSE NULL END
  INTO v_peak_hour
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT AS hour,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY 1
    ORDER BY revenue DESC, cnt DESC
    LIMIT 1
  ) p;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', label, 'count', cnt) ORDER BY ord
  ), '[]'::JSONB)
  INTO v_aov_bins
  FROM (
    SELECT label, ord, COUNT(*)::INT AS cnt
    FROM (
      SELECT
        CASE
          WHEN total_amount <= 50000  THEN '≤50.000đ'
          WHEN total_amount <= 100000 THEN '50.000–100.000đ'
          WHEN total_amount <= 200000 THEN '100.000–200.000đ'
          WHEN total_amount <= 500000 THEN '200.000–500.000đ'
          ELSE '>500.000đ'
        END AS label,
        CASE
          WHEN total_amount <= 50000  THEN 1
          WHEN total_amount <= 100000 THEN 2
          WHEN total_amount <= 200000 THEN 3
          WHEN total_amount <= 500000 THEN 4
          ELSE 5
        END AS ord
      FROM public.orders
      WHERE pos_session_id = p_session_id
        AND tenant_id = v_session.tenant_id
        AND payment_status = 'paid'
        AND status <> 'cancelled'
    ) b
    GROUP BY label, ord
  ) g;

  SELECT COUNT(*)::INT, COALESCE(SUM(discount_amount), 0)
  INTO v_discount_count, v_discount_total
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id
    AND discount_amount > 0
    AND status <> 'cancelled';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id', order_id, 'order_number', order_number,
      'amount', amount, 'note', note, 'type', type, 'value', value
    ) ORDER BY amount DESC
  ), '[]'::JSONB)
  INTO v_top_discount_orders
  FROM (
    SELECT
      id AS order_id, order_number,
      discount_amount AS amount, discount_note AS note,
      discount_type AS type, discount_value AS value
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND discount_amount > 0
      AND status <> 'cancelled'
    ORDER BY discount_amount DESC
    LIMIT 10
  ) d;

  SELECT COUNT(*)::INT
  INTO v_void_item_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.pos_session_id = p_session_id
    AND o.tenant_id = v_session.tenant_id
    AND oi.status = 'cancelled';

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id, 'opened_at', v_session.opened_at,
      'closed_at', v_session.closed_at, 'status', v_session.status,
      'terminal_name', v_session.terminal_name,
      'opened_by_name', v_session.opened_by_name,
      'closed_by_name', v_session.closed_by_name,
      'opening_cash', v_session.opening_cash,
      'closing_cash', v_session.closing_cash,
      'expected_cash', v_session.expected_cash,
      'cash_difference', v_session.cash_difference,
      'note', v_session.note,
      'variance_approval_note', v_session.variance_approval_note
    ),
    'totals', jsonb_build_object(
      'gross_revenue', v_totals.gross,
      'discount_total', v_totals.discount_total,
      'tax_total', v_totals.tax_total,
      'service_charge_total', v_totals.service_total,
      'net_revenue', v_totals.net,
      'cash_revenue', v_totals.cash_revenue,
      'noncash_revenue', v_totals.noncash_revenue,
      'paid_order_count', v_totals.paid_count,
      'unpaid_order_count', v_totals.unpaid_count,
      'cancelled_order_count', v_totals.cancelled_count,
      'void_item_count', v_void_item_count,
      'total_items', v_total_items,
      'aov', CASE WHEN v_totals.paid_count > 0 THEN ROUND(v_totals.net / v_totals.paid_count, 2) ELSE 0 END
    ),
    'payment_mix', v_payment_mix,
    'top_items', v_top_items,
    'category_breakdown', v_categories,
    'aov_bins', v_aov_bins,
    'hourly', v_hourly,
    'peak_hour', v_peak_hour,
    'discounts', jsonb_build_object(
      'count', v_discount_count, 'total', v_discount_total,
      'top_orders', v_top_discount_orders
    ),
    'generated_at', now()
  );
END;
$$;


--
-- Name: FUNCTION get_pos_session_report(p_session_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_pos_session_report(p_session_id bigint) IS 'Aggregate read-only report cho 1 ca POS. SECURITY INVOKER + tenant recheck. Decompose combo (sides + modifiers as separate items). Hourly theo Asia/Ho_Chi_Minh tz. Filter payment_status=paid + status<>cancelled cho mọi revenue metric. Cash vs noncash split. Returns JSONB.';


--
-- Name: get_revenue_by_cashier(bigint, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_by_cashier(p_branch_id bigint DEFAULT NULL::bigint, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(cashier_id uuid, cashier_name text, order_count bigint, net_revenue numeric, cash_revenue numeric, qr_revenue numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_days INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_days > 90 THEN
    RAISE EXCEPTION 'range > 90 days' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH scoped_payments AS MATERIALIZED (
    SELECT
      p.id AS payment_id,
      p.method,
      p.amount,
      o.id AS order_id,
      o.subtotal,
      o.discount_amount,
      COALESCE(ps.opened_by, p.created_by) AS cashier_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    LEFT JOIN public.pos_sessions ps
      ON ps.id = o.pos_session_id
     AND ps.tenant_id = o.tenant_id
     AND ps.branch_id = o.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  order_rows AS (
    SELECT DISTINCT ON (sp.order_id)
      sp.cashier_id,
      sp.order_id,
      sp.subtotal,
      sp.discount_amount
    FROM scoped_payments sp
    ORDER BY sp.order_id, sp.payment_id DESC
  ),
  orders_by_cashier AS (
    SELECT
      o.cashier_id,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(o.subtotal - o.discount_amount), 0)::NUMERIC AS net_revenue
    FROM order_rows o
    GROUP BY o.cashier_id
  ),
  payments_by_cashier AS (
    SELECT
      sp.cashier_id,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)::NUMERIC AS cash_revenue,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method IN ('vietqr', 'momo')), 0)::NUMERIC AS qr_revenue
    FROM scoped_payments sp
    GROUP BY sp.cashier_id
  )
  SELECT
    ob.cashier_id,
    COALESCE(pr.full_name, '— Không xác định')::TEXT AS cashier_name,
    ob.order_count,
    ob.net_revenue,
    COALESCE(pb.cash_revenue, 0)::NUMERIC AS cash_revenue,
    COALESCE(pb.qr_revenue, 0)::NUMERIC AS qr_revenue
  FROM orders_by_cashier ob
  LEFT JOIN payments_by_cashier pb ON pb.cashier_id = ob.cashier_id
  LEFT JOIN public.profiles pr ON pr.id = ob.cashier_id
  ORDER BY ob.net_revenue DESC;
END;
$$;


--
-- Name: FUNCTION get_revenue_by_cashier(p_branch_id bigint, p_start_date date, p_end_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_revenue_by_cashier(p_branch_id bigint, p_start_date date, p_end_date date) IS 'Cashier productivity for Finance Revenue. Cashier identity comes from orders.pos_session_id -> pos_sessions.opened_by, falling back to payments.created_by for legacy orders without a session link. Uses payments.method and completed paid_at rows.';


--
-- Name: get_revenue_by_hour(bigint, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_by_hour(p_branch_id bigint DEFAULT NULL::bigint, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS TABLE(dow smallint, hour smallint, order_count bigint, net_revenue numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_days INT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_days > 90 THEN
    RAISE EXCEPTION 'range > 90 days' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid AS MATERIALIZED (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS paid_local,
      o.id AS order_id,
      o.subtotal,
      o.discount_amount
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    EXTRACT(DOW FROM paid.paid_local)::SMALLINT AS dow,
    EXTRACT(HOUR FROM paid.paid_local)::SMALLINT AS hour,
    COUNT(DISTINCT paid.order_id)::BIGINT AS order_count,
    COALESCE(SUM(paid.subtotal - paid.discount_amount), 0)::NUMERIC AS net_revenue
  FROM paid
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;


--
-- Name: get_revenue_kpis(bigint, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) RETURNS TABLE(net_revenue numeric, subtotal_revenue numeric, discount_amount numeric, total_tax numeric, vat_8_amount numeric, vat_10_amount numeric, order_count bigint, total_covers bigint, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, voided_amount numeric, voided_count bigint, refreshed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.branch_id,
      o.tenant_id,
      o.total_amount,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.customer_count,
      o.order_type,
      p.method
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  sales AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS net_revenue,
      COALESCE(SUM(subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(discount_amount), 0) AS discount_amount,
      COALESCE(SUM(tax_amount), 0) AS total_tax,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(customer_count), 0)::BIGINT AS total_covers,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'takeaway'), 0) AS takeaway_revenue
    FROM paid_orders
  ),
  vat_split AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 8.00
          THEN (oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_8_amount,
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 10.00
          THEN (oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_10_amount
    FROM (
      SELECT
        po.id AS order_id,
        po.tenant_id,
        CASE
          WHEN SUM(oi2.subtotal) > 0 THEN po.total_amount / SUM(oi2.subtotal)
          ELSE 1
        END AS scale
      FROM paid_orders po
      JOIN public.order_items oi2
        ON oi2.tenant_id = po.tenant_id
       AND oi2.order_id = po.id
       AND oi2.status <> 'cancelled'
      GROUP BY po.id, po.tenant_id, po.total_amount
    ) scaled
    JOIN public.order_items oi
      ON oi.tenant_id = scaled.tenant_id
     AND oi.order_id = scaled.order_id
     AND oi.status <> 'cancelled'
  ),
  refunds AS (
    SELECT
      COALESCE(SUM(p.amount), 0) AS voided_amount,
      COUNT(DISTINCT p.order_id)::BIGINT AS voided_count
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'refunded'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    sales.net_revenue,
    sales.subtotal_revenue,
    sales.discount_amount,
    sales.total_tax,
    vat_split.vat_8_amount,
    vat_split.vat_10_amount,
    sales.order_count,
    sales.total_covers,
    sales.cash_revenue,
    sales.vietqr_revenue,
    sales.momo_revenue,
    sales.dine_in_revenue,
    sales.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    now() AS refreshed_at
  FROM sales
  CROSS JOIN vat_split
  CROSS JOIN refunds;
END;
$$;


--
-- Name: FUNCTION get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) IS 'Live KPI bundle for Finance revenue. refreshed_at is request time, not MV refresh time.';


--
-- Name: get_revenue_rollup(bigint, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_rollup(p_branch_id bigint, p_start_date date, p_end_date date, p_granularity text) RETURNS TABLE(period_start date, period_end date, period_label text, branch_id bigint, order_count bigint, total_revenue numeric, total_tax numeric, subtotal_revenue numeric, discount_amount numeric, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, total_covers bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'invalid_granularity (expected day/week/month)'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH live_daily AS (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS paid_date,
      o.branch_id,
      COUNT(DISTINCT o.id)::BIGINT AS order_count,
      COALESCE(SUM(o.total_amount), 0) AS total_revenue,
      COALESCE(SUM(o.tax_amount), 0) AS total_tax,
      COALESCE(SUM(o.subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(o.discount_amount), 0) AS discount_amount,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'takeaway'), 0) AS takeaway_revenue,
      COALESCE(SUM(o.customer_count), 0)::BIGINT AS total_covers
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
    GROUP BY 1, o.branch_id
  ),
  bucketed AS (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN date_trunc('week', d.paid_date)::date
        WHEN 'month' THEN date_trunc('month', d.paid_date)::date
      END AS p_start,
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN (date_trunc('week', d.paid_date) + INTERVAL '6 days')::date
        WHEN 'month' THEN (date_trunc('month', d.paid_date) + INTERVAL '1 month - 1 day')::date
      END AS p_end,
      d.*
    FROM live_daily d
  )
  SELECT
    b.p_start AS period_start,
    b.p_end AS period_end,
    CASE p_granularity
      WHEN 'day' THEN to_char(b.p_start, 'DD/MM/YYYY')
      WHEN 'week' THEN
        'Tuần ' || to_char(b.p_start, 'IW') || ' ('
          || to_char(b.p_start, 'DD/MM') || '-'
          || to_char(b.p_end, 'DD/MM/YYYY') || ')'
      WHEN 'month' THEN 'Tháng ' || to_char(b.p_start, 'MM/YYYY')
    END AS period_label,
    b.branch_id,
    COALESCE(SUM(b.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(b.total_revenue), 0) AS total_revenue,
    COALESCE(SUM(b.total_tax), 0) AS total_tax,
    COALESCE(SUM(b.subtotal_revenue), 0) AS subtotal_revenue,
    COALESCE(SUM(b.discount_amount), 0) AS discount_amount,
    COALESCE(SUM(b.cash_revenue), 0) AS cash_revenue,
    COALESCE(SUM(b.vietqr_revenue), 0) AS vietqr_revenue,
    COALESCE(SUM(b.momo_revenue), 0) AS momo_revenue,
    COALESCE(SUM(b.dine_in_revenue), 0) AS dine_in_revenue,
    COALESCE(SUM(b.takeaway_revenue), 0) AS takeaway_revenue,
    COALESCE(SUM(b.total_covers), 0)::BIGINT AS total_covers
  FROM bucketed b
  GROUP BY b.p_start, b.p_end, b.branch_id
  ORDER BY b.p_start, b.branch_id;
END;
$$;


--
-- Name: FUNCTION get_revenue_rollup(p_branch_id bigint, p_start_date date, p_end_date date, p_granularity text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_revenue_rollup(p_branch_id bigint, p_start_date date, p_end_date date, p_granularity text) IS 'Live paid-at revenue rollup. p_branch_id NULL returns period x branch rows for branches where caller has finance:view.';


--
-- Name: get_stocktake_lines_blind(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_stocktake_lines_blind(p_session_id bigint) RETURNS TABLE(line_id bigint, ingredient_id bigint, ingredient_name text, unit text, abc_class character, round_no smallint, counted_quantity numeric, counted_by uuid, counted_at timestamp with time zone, needs_recount boolean, is_final boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_ss     RECORD;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT s.branch_id, s.blind_mode, s.tenant_id INTO v_ss
  FROM public.stocktake_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND OR v_ss.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sl.id,
    sl.ingredient_id,
    ing.name,
    COALESCE(ing.purchase_unit, ing.unit),
    sl.abc_class,
    sl.round_no,
    sl.counted_quantity,
    sl.counted_by,
    sl.counted_at,
    sl.needs_recount,
    sl.is_final
  FROM public.stocktake_lines sl
  JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  WHERE sl.session_id = p_session_id
  ORDER BY sl.round_no, ing.name;
END;
$$;


--
-- Name: get_top_items(bigint, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_top_items(p_branch_id bigint DEFAULT NULL::bigint, p_period_start date DEFAULT NULL::date, p_limit integer DEFAULT 20) RETURNS TABLE(period_start date, period_end date, branch_id bigint, tenant_id bigint, menu_item_id bigint, item_name text, quantity_sold numeric, revenue numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_effective_limit INT;
  v_period_start DATE;
  v_period_end DATE;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
  v_period_start := COALESCE(
    p_period_start,
    date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date
  );
  v_period_end := (date_trunc('month', v_period_start)::date + INTERVAL '1 month - 1 day')::date;
  v_start_utc := (v_period_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((v_period_end + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT DISTINCT
      o.id,
      o.branch_id,
      o.tenant_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    v_period_start AS period_start,
    v_period_end AS period_end,
    po.branch_id,
    po.tenant_id,
    oi.menu_item_id,
    MAX(oi.item_name) AS item_name,
    COALESCE(SUM(oi.quantity), 0)::NUMERIC AS quantity_sold,
    COALESCE(SUM(oi.subtotal), 0)::NUMERIC AS revenue
  FROM paid_orders po
  JOIN public.order_items oi
    ON oi.tenant_id = po.tenant_id
   AND oi.order_id = po.id
   AND oi.status <> 'cancelled'
  GROUP BY po.branch_id, po.tenant_id, oi.menu_item_id
  ORDER BY quantity_sold DESC, revenue DESC
  LIMIT v_effective_limit;
END;
$$;


--
-- Name: FUNCTION get_top_items(p_branch_id bigint, p_period_start date, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_top_items(p_branch_id bigint, p_period_start date, p_limit integer) IS 'Live paid-at top items. p_branch_id NULL still checks finance:view per returned branch row.';


--
-- Name: grant_permission(uuid, bigint, text, bigint, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_permission(p_target_user uuid, p_branch_id bigint, p_permission_key text, p_source_template bigint DEFAULT NULL::bigint, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_grant_id BIGINT;
  v_from TIMESTAMPTZ := COALESCE(p_valid_from, now());
  v_effective_branch_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_effective_branch_id := private.staff_permission_effective_branch_id(
    p_permission_key,
    p_branch_id
  );

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'actor_no_profile' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_effective_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window: valid_until must be after valid_from' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_grant_id
  FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (v_effective_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = v_effective_branch_id
    )
  LIMIT 1;

  IF v_grant_id IS NULL THEN
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, v_effective_branch_id, p_permission_key, p_source_template, auth.uid(),
      v_from, p_valid_until
    )
    RETURNING id INTO v_grant_id;
  ELSE
    UPDATE public.staff_permissions
       SET valid_from = LEAST(valid_from, v_from),
           valid_until = CASE
             WHEN p_valid_until IS NULL THEN NULL
             WHEN valid_until IS NULL THEN valid_until
             ELSE GREATEST(valid_until, p_valid_until)
           END
     WHERE id = v_grant_id;
  END IF;

  RETURN v_grant_id;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id   BIGINT;
  v_branch_id   BIGINT;
  v_role_text   TEXT;
  v_position_id BIGINT;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
  );
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_role_text := COALESCE(NEW.raw_app_meta_data ->> 'role', 'owner');
  v_position_id := public._auth_v2_position_id_from_role(v_role_text, v_tenant_id);

  -- H3a invariant: profiles.position_id is NOT NULL. Refuse to insert a
  -- broken row — surface the misconfiguration to the operator instead of
  -- silently demoting the new user (or — worse — auto-falling-back to
  -- 'office', which historically defaulted to 'owner' and would be a
  -- privilege-escalation vector via raw_app_meta_data role typos).
  IF v_position_id IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for role=% tenant=% — verify positions seeded for tenant + role string is one of (owner, manager, staff, chef)',
      v_role_text, v_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
  VALUES (
    NEW.id, v_tenant_id, v_branch_id, v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_new_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_new_user() IS 'Auth trigger — creates a profile row when an auth.users row is inserted. H3a: refuses to insert NULL position_id (RAISE EXCEPTION). Operator must seed positions before tenant signup or pass a valid role in raw_app_meta_data.';


--
-- Name: has_permission(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(p_branch_id bigint, p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles pr
      JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid() AND po.code = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;


--
-- Name: FUNCTION has_permission(p_branch_id bigint, p_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_permission(p_branch_id bigint, p_key text) IS 'Authoritative authz check. Call from RLS policies as has_permission(row.branch_id, ''module:action'').';


--
-- Name: has_permission_any(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission_any(p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles pr
      JOIN public.positions po ON po.id = pr.position_id
      WHERE pr.id = auth.uid() AND po.code = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;


--
-- Name: FUNCTION has_permission_any(p_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_permission_any(p_key text) IS 'Returns TRUE if user has the permission for at least one branch or tenant-wide. Use for tenant-scoped tables without branch_id.';


--
-- Name: has_position(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_position(p_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    LEFT JOIN public.positions po ON po.id = pr.position_id
    WHERE pr.id = auth.uid()
      AND (po.code = p_code OR pr.role::text = p_code)
  );
$$;


--
-- Name: FUNCTION has_position(p_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_position(p_code text) IS 'HR-position check. Prefer has_permission for authz. Use only for display hints or structural predicates.';


--
-- Name: inventory_shift_key(bigint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_shift_key(p_branch_id bigint, p_at timestamp with time zone DEFAULT now()) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tz           TEXT;
  v_local        TIMESTAMP;
  v_hour         INT;
  v_segment      TEXT;
  v_anchor_date  DATE;
BEGIN
  SELECT timezone INTO v_tz
  FROM public.branches
  WHERE id = p_branch_id;

  IF v_tz IS NULL THEN
    v_tz := 'Asia/Ho_Chi_Minh';
  END IF;

  v_local := p_at AT TIME ZONE v_tz;
  v_hour  := EXTRACT(HOUR FROM v_local)::INT;

  IF v_hour < 4 THEN
    v_anchor_date := (v_local - INTERVAL '1 day')::DATE;
    v_segment     := 'evening';
  ELSIF v_hour < 12 THEN
    v_anchor_date := v_local::DATE;
    v_segment     := 'morning';
  ELSIF v_hour < 18 THEN
    v_anchor_date := v_local::DATE;
    v_segment     := 'afternoon';
  ELSE
    v_anchor_date := v_local::DATE;
    v_segment     := 'evening';
  END IF;

  RETURN to_char(v_anchor_date, 'YYYY-MM-DD') || '_' || v_segment;
END;
$$;


--
-- Name: FUNCTION inventory_shift_key(p_branch_id bigint, p_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.inventory_shift_key(p_branch_id bigint, p_at timestamp with time zone) IS 'Canonical shift key YYYY-MM-DD_{morning|afternoon|evening} per branch local time with 04:00 business-day cutoff.';


--
-- Name: is_feature_enabled(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_feature_enabled(p_branch_id bigint, p_flag_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT enabled FROM public.branch_feature_flags
    WHERE branch_id = p_branch_id AND flag_key = p_flag_key), false);
$$;


--
-- Name: is_inventory_production_operator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_inventory_production_operator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.auth_role() IN ('owner', 'manager', 'staff');
$$;


--
-- Name: FUNCTION is_inventory_production_operator(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_inventory_production_operator() IS 'Shared DB role contract for Inventory production and production BOM access.';


--
-- Name: list_branch_menu_daily_limits(bigint, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_branch_menu_daily_limits(p_branch_id bigint, p_limit_date date DEFAULT NULL::date) RETURNS TABLE(menu_item_id bigint, item_name text, category_id bigint, category_name text, base_price numeric, limit_id bigint, limit_date date, limit_quantity integer, is_disabled boolean, sold_today integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_date      DATE   := COALESCE(
    p_limit_date,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  );
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'manager')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches b
   WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    mi.id,
    mi.name,
    mc.id,
    mc.name,
    mi.base_price,
    bl.id,
    bl.limit_date,
    bl.limit_quantity,
    COALESCE(bl.is_disabled, FALSE),
    COALESCE(bl.sold_today, 0)
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  LEFT JOIN public.branch_menu_item_daily_limits bl
    ON bl.menu_item_id = mi.id
   AND bl.branch_id = p_branch_id
   AND bl.limit_date = v_date
  WHERE mi.tenant_id = v_tenant_id
    AND mi.is_active = TRUE
  ORDER BY mc.sort_order, mi.sort_order, mi.name;
END;
$$;


--
-- Name: log_audit(text, text, bigint, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit(p_action text, p_entity_type text, p_entity_id bigint DEFAULT NULL::bigint, p_old jsonb DEFAULT NULL::jsonb, p_new jsonb DEFAULT NULL::jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id   UUID   := auth.uid();
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_id        BIGINT;
BEGIN
  -- Reject anonymous / missing-claim callers — append-only audit must
  -- always have a real actor.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'audit.log_audit: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'audit.log_audit: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action IS NULL OR length(p_action) = 0 THEN
    RAISE EXCEPTION 'audit.log_audit: action required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_entity_type IS NULL OR length(p_entity_type) = 0 THEN
    RAISE EXCEPTION 'audit.log_audit: entity_type required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_tenant_id,
    v_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old,
    p_new
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION log_audit(p_action text, p_entity_type text, p_entity_id bigint, p_old jsonb, p_new jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_audit(p_action text, p_entity_type text, p_entity_id bigint, p_old jsonb, p_new jsonb) IS 'Append a row to audit_logs. tenant_id and user_id are forced server-side from auth claims — callers cannot spoof them. Only path to write audit_logs (direct INSERT revoked).';


--
-- Name: mark_kds_item_out_of_stock(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_kds_item_out_of_stock(p_ticket_id bigint, p_disable_for_day boolean DEFAULT true, p_reason text DEFAULT 'Hết món'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_reason          TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Hết món');
  v_row             RECORD;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_limit           RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:mark_ready') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  SELECT
    kt.id AS ticket_id,
    kt.tenant_id,
    kt.branch_id,
    kt.status AS ticket_status,
    kt.order_id,
    kt.order_item_id,
    oi.menu_item_id,
    oi.item_name,
    oi.status AS item_status,
    o.order_number,
    o.status AS order_status,
    o.payment_status,
    o.service_charge,
    o.discount_type,
    o.discount_value
  INTO v_row
  FROM public.kds_tickets kt
  JOIN public.order_items oi
    ON oi.id = kt.order_item_id
   AND oi.tenant_id = kt.tenant_id
  JOIN public.orders o
    ON o.id = kt.order_id
   AND o.tenant_id = kt.tenant_id
  WHERE kt.id = p_ticket_id
    AND kt.tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(kt.branch_id)
  FOR UPDATE OF kt, oi, o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_row.order_id);

  IF v_row.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_row.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = '22023';
  END IF;

  IF v_row.ticket_status NOT IN ('pending', 'preparing')
     OR v_row.item_status NOT IN ('pending', 'preparing') THEN
    RAISE EXCEPTION 'item_not_out_of_stockable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = 'kds_out_of_stock: ' || v_reason,
      updated_at = now()
  WHERE id = v_row.order_item_id
    AND tenant_id = v_row.tenant_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled',
      bumped_at = now(),
      bumped_by = v_uid,
      updated_at = now()
  WHERE id = v_row.ticket_id
    AND tenant_id = v_row.tenant_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_row.order_id
    AND tenant_id = v_row.tenant_id
    AND status <> 'cancelled';

  v_discount_amount := public.compute_discount_amount(
    v_row.discount_type,
    v_row.discount_value,
    v_subtotal
  );

  UPDATE public.orders o
  SET
    subtotal        = v_subtotal,
    discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
    discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
    discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
    discount_amount = v_discount_amount,
    total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
    updated_at      = now()
  WHERE o.id = v_row.order_id
    AND o.tenant_id = v_row.tenant_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_row.tenant_id,
    v_row.order_id,
    v_row.order_status,
    v_row.order_status,
    v_uid,
    'kds_out_of_stock_item ' || v_row.order_item_id::TEXT || ': ' || v_reason
  );

  IF p_disable_for_day THEN
    INSERT INTO public.branch_menu_item_daily_limits (
      tenant_id,
      branch_id,
      menu_item_id,
      limit_date,
      limit_quantity,
      is_disabled,
      sold_today
    )
    VALUES (
      v_row.tenant_id,
      v_row.branch_id,
      v_row.menu_item_id,
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      NULL,
      TRUE,
      0
    )
    ON CONFLICT (branch_id, menu_item_id, limit_date)
    DO UPDATE SET
      is_disabled = TRUE,
      updated_at = now()
    RETURNING limit_quantity, is_disabled, sold_today
    INTO v_limit;
  ELSE
    SELECT limit_quantity, is_disabled, sold_today
    INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id = v_row.branch_id
      AND menu_item_id = v_row.menu_item_id
      AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

    IF NOT FOUND THEN
      SELECT NULL::INT AS limit_quantity,
             FALSE AS is_disabled,
             0::INT AS sold_today
      INTO v_limit;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    dedup_key,
    meta
  )
  VALUES (
    v_row.tenant_id,
    v_row.branch_id,
    ARRAY['staff', 'manager']::TEXT[],
    'pos.kds_out_of_stock',
    'warning',
    format('Bếp báo hết món #%s', v_row.order_number),
    format('%s cần đổi món hoặc bỏ khỏi đơn.', v_row.item_name),
    'order_item',
    v_row.order_item_id,
    format('/br/%s/pos?order=%s', v_row.branch_id, v_row.order_id),
    format('kds_out_of_stock:%s', v_row.ticket_id),
    jsonb_build_object(
      'order_id', v_row.order_id,
      'order_number', v_row.order_number,
      'order_item_id', v_row.order_item_id,
      'menu_item_id', v_row.menu_item_id,
      'item_name', v_row.item_name,
      'reason', v_reason,
      'disabled_for_day', p_disable_for_day
    )
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = now(),
    expires_at = NULL;

  PERFORM public.check_order_ready(v_row.order_id);

  RETURN jsonb_build_object(
    'ticket_id', v_row.ticket_id,
    'order_id', v_row.order_id,
    'order_item_id', v_row.order_item_id,
    'menu_item_id', v_row.menu_item_id,
    'item_name', v_row.item_name,
    'disabled_for_day', p_disable_for_day,
    'limit_quantity', v_limit.limit_quantity,
    'is_disabled', COALESCE(v_limit.is_disabled, p_disable_for_day),
    'sold_today', COALESCE(v_limit.sold_today, 0)
  );
END;
$$;


--
-- Name: FUNCTION mark_kds_item_out_of_stock(p_ticket_id bigint, p_disable_for_day boolean, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_kds_item_out_of_stock(p_ticket_id bigint, p_disable_for_day boolean, p_reason text) IS 'KDS dispatch exception. Cancels one active kitchen ticket/order item as out-of-stock, optionally disables the menu item for the branch/day, and notifies POS.';


--
-- Name: mark_order_item_served(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_order_item_served(p_item_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_item RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.status        AS item_status,
    o.branch_id,
    o.status         AS order_status
  INTO v_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_item_id
  FOR UPDATE OF oi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_item.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_item.order_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF v_item.item_status NOT IN ('pending', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'invalid item transition to served' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'served',
      updated_at = now()
  WHERE id = p_item_id;

  UPDATE public.kds_tickets
  SET status = 'served',
      bumped_at = COALESCE(bumped_at, now()),
      bumped_by = COALESCE(bumped_by, v_uid),
      updated_at = now()
  WHERE order_item_id = p_item_id
    AND tenant_id = v_item.tenant_id
    AND status <> 'cancelled';

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_item.order_status, v_item.order_status,
    v_uid, 'mark_item_served ' || p_item_id::text
  );

  RETURN jsonb_build_object(
    'item_id',   p_item_id,
    'order_id',  v_item.order_id,
    'status',    'served'
  );
END;
$$;


--
-- Name: FUNCTION mark_order_item_served(p_item_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_order_item_served(p_item_id bigint) IS 'POS waiter per-item served action. Sets one order_items row + matching kds_tickets to served. Order-level state machine is untouched; cashier still drives ''served''/''completed'' via update_pos_order_status / payment close. Permission: pos role with branch scope (cashier/waiter/manager).';


--
-- Name: materialize_print_document(text, jsonb, bigint, integer, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materialize_print_document(p_kind text, p_payload jsonb, p_template_id bigint, p_template_version integer, p_paper_width_mm integer, p_font_profile text, p_content jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_blocks JSONB;
  v_block JSONB;
  v_render_block JSONB;
  v_type TEXT;
  v_left TEXT;
  v_right TEXT;
  v_out JSONB := '[]'::jsonb;
BEGIN
  v_blocks := p_content->'blocks';
  IF v_blocks IS NULL
     OR jsonb_typeof(v_blocks) <> 'array'
     OR COALESCE(jsonb_array_length(v_blocks), 0) = 0 THEN
    v_blocks := public.print_template_default_content(p_kind)->'blocks';
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(v_blocks)
  LOOP
    v_type := v_block->>'type';
    IF v_type IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT public.print_template_block_visible(v_block, p_payload) THEN
      CONTINUE;
    END IF;

    v_render_block := v_block
      - 'when_field'
      - 'when_equals'
      - 'when_not_equals'
      - 'when_not_equals_field'
      - 'when_not_empty'
      - 'when_min';

    CASE v_type
      WHEN 'text' THEN
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            v_render_block,
            '{text}',
            to_jsonb(public.print_template_interpolate(v_block->>'text', p_payload)),
            true
          )
        );
      WHEN 'row' THEN
        v_left := public.print_template_interpolate(v_block->>'left', p_payload);
        v_right := public.print_template_interpolate(v_block->>'right', p_payload);
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            jsonb_set(v_render_block, '{left}', to_jsonb(v_left), true),
            '{right}',
            to_jsonb(v_right),
            true
          )
        );
      WHEN 'branchInfo' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'branch_name', COALESCE(p_payload->>'branch_name', ''),
            'branch_address', COALESCE(p_payload->>'branch_address', ''),
            'branch_phone', COALESCE(p_payload->>'branch_phone', ''),
            'branch_tax_code', COALESCE(p_payload->>'branch_tax_code', '')
          )
        );
      WHEN 'billMeta' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'order_number', COALESCE(p_payload->>'order_number', ''),
            'order_type', COALESCE(p_payload->>'order_type', ''),
            'table_number', p_payload->'table_number',
            'cashier_name', COALESCE(p_payload->>'cashier_name', ''),
            'created_at', COALESCE(p_payload->>'created_at', '')
          )
        );
      WHEN 'paymentMethod' THEN
        IF COALESCE(p_payload->>'payment_method', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('method', p_payload->>'payment_method')
        );
      WHEN 'itemsTable' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('items', COALESCE(p_payload->'items', '[]'::jsonb))
        );
      WHEN 'totals' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'subtotal', p_payload->'subtotal',
            'tax_amount', p_payload->'tax_amount',
            'service_charge', p_payload->'service_charge',
            'discount_amount', p_payload->'discount_amount',
            'total_amount', p_payload->'total_amount'
          )
        );
      WHEN 'cashChange' THEN
        IF NOT (p_payload ? 'cash_received' OR p_payload ? 'cash_change') THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'cash_received', p_payload->'cash_received',
            'cash_change', p_payload->'cash_change',
            'total_amount', p_payload->'total_amount'
          )
        );
      WHEN 'note' THEN
        IF COALESCE(NULLIF(trim(p_payload->>'note'), ''), '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('text', p_payload->>'note')
        );
      WHEN 'paymentQr' THEN
        IF jsonb_typeof(p_payload->'payment_qr') <> 'object'
           OR COALESCE(p_payload#>>'{payment_qr,content}', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('qr', p_payload->'payment_qr')
        );
      WHEN 'kitchenItems' THEN
        v_out := v_out || public.print_template_kitchen_item_blocks(p_payload, false);
      WHEN 'cancelItems' THEN
        v_out := v_out || public.print_template_kitchen_item_blocks(p_payload, true);
      WHEN 'shiftCashReconciliation' THEN
        v_out := v_out || public.print_template_shift_cash_blocks(p_payload);
      WHEN 'paymentBreakdown' THEN
        v_out := v_out || public.print_template_payment_breakdown_blocks(p_payload);
      WHEN 'shiftOrderSummary' THEN
        v_out := v_out || public.print_template_shift_summary_blocks(p_payload);
      WHEN 'shiftItemBreakdown' THEN
        v_out := v_out || public.print_template_shift_item_breakdown_blocks(p_payload);
      WHEN 'shiftVarianceNotice' THEN
        v_out := v_out || public.print_template_shift_variance_notice_blocks(p_payload);
      WHEN 'shiftSignature' THEN
        v_out := v_out || public.print_template_shift_signature_blocks();
      WHEN 'varianceApproval' THEN
        v_out := v_out || public.print_template_variance_approval_blocks(p_payload);
      WHEN 'kitchenTicket' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'kitchen_ticket',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('kitchen_ticket')
          )->'blocks'
        );
      WHEN 'cancelTicket' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'cancel_ticket',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('cancel_ticket')
          )->'blocks'
        );
      WHEN 'shiftCloseReport' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'shift_close_report',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('shift_close_report')
          )->'blocks'
        );
      ELSE
        v_out := v_out || jsonb_build_array(v_render_block);
    END CASE;
  END LOOP;

  IF jsonb_array_length(v_out) = 0 THEN
    v_out := jsonb_build_array(
      jsonb_build_object('type', 'text', 'text', COALESCE(p_payload->>'kind', p_kind))
    );
  END IF;

  RETURN jsonb_build_object(
    'schema_version', 1,
    'template_id', COALESCE(p_template_id, 0),
    'template_version', COALESCE(p_template_version, 1),
    'paper_width_mm', COALESCE(p_paper_width_mm, 80),
    'font_profile', COALESCE(p_font_profile, 'thermal_vietnamese'),
    'blocks', v_out
  );
END;
$$;


--
-- Name: FUNCTION materialize_print_document(p_kind text, p_payload jsonb, p_template_id bigint, p_template_version integer, p_paper_width_mm integer, p_font_profile text, p_content jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materialize_print_document(p_kind text, p_payload jsonb, p_template_id bigint, p_template_version integer, p_paper_width_mm integer, p_font_profile text, p_content jsonb) IS 'Materialize active print templates into primitive schema_version=1 document blocks. New ticket layouts should be changed in print_template_versions, not in branch print-agent deployments.';


--
-- Name: merge_orders(bigint, bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_target               RECORD;
  v_lock_lo              BIGINT;
  v_lock_hi              BIGINT;
  v_flag_enabled         TEXT;
  v_moved_count          INT;
  v_target_subtotal      NUMERIC(15,2);
  v_target_discount_type   TEXT;
  v_target_discount_value  NUMERIC(15,2);
  v_target_discount_note   TEXT;
  v_target_discount_amount NUMERIC(15,2);
  v_target_total           NUMERIC(15,2);
  v_source_total           NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'manager', 'staff')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'merge_self' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id INTO v_lock_lo
    FROM public.orders t
    WHERE t.id = p_target_order_id
      AND t.merge_request_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      SELECT subtotal, total_amount INTO v_target_subtotal, v_target_total
      FROM public.orders WHERE id = p_target_order_id;
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'target_order_id',  p_target_order_id,
        'target_subtotal',  COALESCE(v_target_subtotal, 0),
        'target_total',     COALESCE(v_target_total, 0),
        'idempotent',       true
      );
    END IF;
  END IF;

  v_lock_lo := LEAST(p_source_order_id, p_target_order_id);
  v_lock_hi := GREATEST(p_source_order_id, p_target_order_id);
  PERFORM pg_advisory_xact_lock(v_lock_lo);
  PERFORM pg_advisory_xact_lock(v_lock_hi);

  IF v_lock_lo = p_source_order_id THEN
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;
  ELSE
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.customer_count, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'target order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant OR v_target.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_source.branch_id <> v_target.branch_id THEN
    RAISE EXCEPTION 'merge_different_branch' USING ERRCODE = '22023';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.order_type <> 'dine_in' OR v_target.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'merge_dine_in_only' USING ERRCODE = '22023';
  END IF;

  IF v_source.table_id IS NULL OR v_target.table_id IS NULL
     OR v_source.table_id <> v_target.table_id
  THEN
    RAISE EXCEPTION 'merge_different_tables' USING ERRCODE = '22023';
  END IF;

  IF v_source.status IN ('completed', 'cancelled')
     OR v_target.status IN ('completed', 'cancelled')
  THEN
    RAISE EXCEPTION 'merge_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid'
     OR COALESCE(v_target.payment_status, 'unpaid') = 'paid'
  THEN
    RAISE EXCEPTION 'merge_paid' USING ERRCODE = '22023';
  END IF;

  IF v_source.merged_into_order_id IS NOT NULL OR v_target.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'merge_already_merged' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
  WHERE order_id IN (p_source_order_id, p_target_order_id)
    AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'merge_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF (v_source.discount_type = 'pct' AND COALESCE(v_source.discount_amount, 0) > 0)
     OR (v_target.discount_type = 'pct' AND COALESCE(v_target.discount_amount, 0) > 0)
  THEN
    RAISE EXCEPTION 'merge_pct_discount_blocked' USING ERRCODE = '22023';
  END IF;

  IF v_source.discount_type = 'vnd' AND v_target.discount_type = 'vnd' THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := COALESCE(v_source.discount_value, 0)
                             + COALESCE(v_target.discount_value, 0);
    v_target_discount_note  := COALESCE(v_target.discount_note, '')
      || ' + ' || COALESCE(v_source.discount_note, '');
  ELSIF v_source.discount_type = 'vnd' AND v_target.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_source.discount_value;
    v_target_discount_note  := v_source.discount_note;
  ELSIF v_target.discount_type = 'vnd' AND v_source.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_target.discount_value;
    v_target_discount_note  := v_target.discount_note;
  ELSE
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  UPDATE public.order_items
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  UPDATE public.kds_tickets
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_target_subtotal
  FROM public.order_items
  WHERE order_id = p_target_order_id AND status <> 'cancelled';

  v_target_discount_amount := public.compute_discount_amount(
    v_target_discount_type, v_target_discount_value, v_target_subtotal
  );

  v_target_total := v_target_subtotal
                  + COALESCE(v_target.service_charge, 0)
                  - v_target_discount_amount;

  IF v_target_discount_amount = 0 THEN
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  UPDATE public.orders
     SET subtotal             = v_target_subtotal,
         discount_type        = v_target_discount_type,
         discount_value       = v_target_discount_value,
         discount_note        = v_target_discount_note,
         discount_amount      = v_target_discount_amount,
         total_amount         = v_target_total,
         customer_count       = GREATEST(v_target.customer_count, v_source.customer_count),
         note                 = CASE
                                  WHEN v_source.note IS NOT NULL AND length(trim(v_source.note)) > 0
                                  THEN COALESCE(v_target.note || E'\n', '')
                                       || '[Gộp từ ' || v_source.order_number || ']: ' || v_source.note
                                  ELSE v_target.note
                                END,
         merge_request_key    = p_idempotency_key,
         updated_at           = now()
   WHERE id = p_target_order_id;

  v_source_total := 0 + COALESCE(v_source.service_charge, 0);

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_type        = NULL,
         discount_value       = NULL,
         discount_note        = NULL,
         discount_amount      = 0,
         total_amount         = v_source_total,
         merged_into_order_id = p_target_order_id,
         updated_at           = now()
   WHERE id = p_source_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, 'cancelled', v_uid,
     'merged_into: ' || v_target.order_number || ' (#' || p_target_order_id::TEXT
       || '), moved ' || v_moved_count::TEXT || ' items'),
    (v_target.tenant_id, p_target_order_id, v_target.status, v_target.status, v_uid,
     'merged_from: ' || v_source.order_number || ' (#' || p_source_order_id::TEXT
       || '), received ' || v_moved_count::TEXT || ' items');

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'target_order_id',  p_target_order_id,
    'moved_count',      v_moved_count,
    'target_subtotal',  v_target_subtotal,
    'target_total',     v_target_total
  );
END;
$$;


--
-- Name: FUNCTION merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid) IS 'Gộp source vào target (cùng table + branch + dine_in, cả 2 chưa paid). Source bị cancel với merged_into_order_id pointer. Items + KDS tickets re-point sang target. Discount: pct ở bên nào → BLOCK; VND cộng dồn. Source-side clears discount_type/value/note when subtotal collapses to 0 (satisfies orders_discount_metadata_paired). Lock LEAST/GREATEST(a,b) tránh deadlock cross-merge. Idempotent qua p_idempotency_key.';


--
-- Name: populate_order_item_vat_rate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_order_item_vat_rate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only fill when caller didn't explicitly set it. Treats 0.00 as
  -- a legitimate value (VAT-exempt item) so we don't overwrite it.
  IF NEW.vat_rate IS NULL THEN
    SELECT mi.vat_rate INTO NEW.vat_rate
    FROM public.menu_items mi
    WHERE mi.id = NEW.menu_item_id;

    -- Fallback when menu_item is missing (e.g. orphaned reference,
    -- legacy data, or NULL menu_item_id). Default 8% matches the
    -- system-wide default for food.
    IF NEW.vat_rate IS NULL THEN
      NEW.vat_rate := 8.00;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION populate_order_item_vat_rate(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.populate_order_item_vat_rate() IS 'Fills order_items.vat_rate from menu_items.vat_rate at INSERT time. Rule VAT-PER-LINE-NOT-PER-INVOICE — every order line carries its own VAT rate snapshot so invoice issuance can aggregate correctly even for mixed-rate orders.';


--
-- Name: pos_enrich_order_sides(bigint, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_enrich_order_sides(p_tenant_id bigint, p_main_item_id bigint, p_sides jsonb) RETURNS TABLE(sides_sum numeric, enriched_sides jsonb)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_raw_count   INT := 0;
  v_valid_count INT := 0;
  v_live_count  INT := 0;
BEGIN
  IF p_sides IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC(15,2), '[]'::JSONB;
    RETURN;
  END IF;

  IF jsonb_typeof(p_sides) <> 'array' THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  v_raw_count := jsonb_array_length(p_sides);
  IF v_raw_count = 0 THEN
    RETURN QUERY SELECT 0::NUMERIC(15,2), '[]'::JSONB;
    RETURN;
  END IF;

  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  )
  SELECT COUNT(*)::INT INTO v_valid_count
  FROM side_input;

  IF v_valid_count <> v_raw_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  live_sides AS (
    SELECT 1
    FROM side_input si
    JOIN public.menu_item_available_sides mas
      ON mas.tenant_id = p_tenant_id
     AND mas.main_item_id = p_main_item_id
     AND mas.side_item_id = si.side_item_id
    JOIN public.menu_items mi
      ON mi.id = si.side_item_id
     AND mi.tenant_id = p_tenant_id
     AND mi.is_active = TRUE
  )
  SELECT COUNT(*)::INT INTO v_live_count
  FROM live_sides;

  IF v_live_count <> v_valid_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH side_input AS (
    SELECT
      (side_el ->> 'side_item_id')::BIGINT AS side_item_id,
      CASE
        WHEN (side_el ->> 'quantity') ~ '^[0-9]+$'
          THEN LEAST(99, GREATEST(1, (side_el ->> 'quantity')::INT))
        ELSE 1
      END AS quantity
    FROM jsonb_array_elements(p_sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  live_sides AS (
    SELECT
      mi.id,
      mi.name,
      mi.base_price,
      mas.is_default,
      si.quantity
    FROM side_input si
    JOIN public.menu_item_available_sides mas
      ON mas.tenant_id = p_tenant_id
     AND mas.main_item_id = p_main_item_id
     AND mas.side_item_id = si.side_item_id
    JOIN public.menu_items mi
      ON mi.id = si.side_item_id
     AND mi.tenant_id = p_tenant_id
     AND mi.is_active = TRUE
  )
  SELECT
    COALESCE(SUM(base_price * quantity), 0)::NUMERIC(15,2),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'side_item_id', id,
          'name', name,
          'price', base_price,
          'quantity', quantity,
          'is_default', is_default
        )
        ORDER BY name
      ),
      '[]'::JSONB
    )
  FROM live_sides;
END;
$_$;


--
-- Name: pos_order_modifier_sum(bigint, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_order_modifier_sum(p_tenant_id bigint, p_main_item_id bigint, p_modifiers jsonb) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_raw_count   INT := 0;
  v_valid_count INT := 0;
  v_live_count  INT := 0;
  v_sum         NUMERIC(15,2) := 0;
BEGIN
  IF p_modifiers IS NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_modifiers) <> 'array' THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  v_raw_count := jsonb_array_length(p_modifiers);
  IF v_raw_count = 0 THEN
    RETURN 0;
  END IF;

  WITH modifier_input AS (
    SELECT (mod_el ->> 'modifier_id')::BIGINT AS modifier_id
    FROM jsonb_array_elements(p_modifiers) AS mod_el
    WHERE mod_el ? 'modifier_id'
      AND (mod_el ->> 'modifier_id') ~ '^[0-9]+$'
  )
  SELECT COUNT(*)::INT INTO v_valid_count
  FROM modifier_input;

  IF v_valid_count <> v_raw_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  WITH modifier_input AS (
    SELECT (mod_el ->> 'modifier_id')::BIGINT AS modifier_id
    FROM jsonb_array_elements(p_modifiers) AS mod_el
    WHERE mod_el ? 'modifier_id'
      AND (mod_el ->> 'modifier_id') ~ '^[0-9]+$'
  ),
  live_modifiers AS (
    SELECT m.price
    FROM modifier_input mi
    JOIN public.menu_item_modifiers m
      ON m.id = mi.modifier_id
     AND m.item_id = p_main_item_id
     AND m.tenant_id = p_tenant_id
     AND m.is_active = TRUE
  )
  SELECT COUNT(*)::INT, COALESCE(SUM(price), 0)::NUMERIC(15,2)
  INTO v_live_count, v_sum
  FROM live_modifiers;

  IF v_live_count <> v_valid_count THEN
    RAISE EXCEPTION 'stale_side_or_modifier' USING ERRCODE = '22023';
  END IF;

  RETURN v_sum;
END;
$_$;


--
-- Name: print_jobs_attach_document_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_jobs_attach_document_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.payload IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.job_type NOT IN (
    'receipt',
    'provisional_bill',
    'kitchen_ticket',
    'cancel_ticket',
    'shift_close_report'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.payload ? 'document' THEN
      NEW.payload := NEW.payload - 'document' - 'template_version';
      NEW.payload := NEW.payload || jsonb_build_object('document', OLD.payload->'document');
      IF OLD.payload ? 'template_version' THEN
        NEW.payload := NEW.payload || jsonb_build_object(
          'template_version',
          OLD.payload->'template_version'
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payload ? 'document' THEN
    RETURN NEW;
  END IF;

  BEGIN
    NEW.payload := public.attach_print_document_to_payload(
      NEW.tenant_id,
      NEW.branch_id,
      NEW.job_type,
      NEW.payload
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[print_jobs_attach_document_trigger] template apply failed for tenant=% branch=% job_type=%: %',
      NEW.tenant_id, NEW.branch_id, NEW.job_type, SQLERRM;
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION print_jobs_attach_document_trigger(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.print_jobs_attach_document_trigger() IS 'M5 observability (2026-05-07): template apply fail-soft now emits RAISE WARNING. Behavior unchanged — RETURN NEW preserves legacy payload for agent fallback.';


--
-- Name: print_template_block_visible(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_block_visible(p_block jsonb, p_payload jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_field TEXT := p_block->>'when_field';
  v_value TEXT;
  v_other_field TEXT := p_block->>'when_not_equals_field';
  v_numeric NUMERIC;
BEGIN
  IF v_field IS NULL OR v_field = '' THEN
    RETURN true;
  END IF;

  v_value := public.print_template_payload_text(p_payload, v_field);

  IF COALESCE((p_block->>'when_not_empty')::BOOLEAN, false)
     AND COALESCE(NULLIF(btrim(v_value), ''), '') = '' THEN
    RETURN false;
  END IF;

  IF p_block ? 'when_equals'
     AND v_value <> COALESCE(p_block->>'when_equals', '') THEN
    RETURN false;
  END IF;

  IF p_block ? 'when_not_equals'
     AND v_value = COALESCE(p_block->>'when_not_equals', '') THEN
    RETURN false;
  END IF;

  IF v_other_field IS NOT NULL
     AND v_other_field <> ''
     AND v_value = public.print_template_payload_text(p_payload, v_other_field) THEN
    RETURN false;
  END IF;

  IF p_block ? 'when_min' THEN
    BEGIN
      v_numeric := NULLIF(v_value, '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    IF v_numeric IS NULL OR v_numeric < (p_block->>'when_min')::numeric THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;


--
-- Name: print_template_datetime(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_datetime(p_iso text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  IF COALESCE(p_iso, '') = '' THEN
    RETURN '';
  END IF;

  IF p_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' THEN
    RETURN substring(p_iso FROM 12 FOR 5)
      || ' '
      || substring(p_iso FROM 9 FOR 2)
      || '/'
      || substring(p_iso FROM 6 FOR 2)
      || '/'
      || substring(p_iso FROM 1 FOR 4);
  END IF;

  RETURN p_iso;
END;
$$;


--
-- Name: print_template_default_content(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_default_content(p_kind text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  CASE p_kind
    WHEN 'receipt' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'HÓA ĐƠN THANH TOÁN', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'paymentMethod'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
          jsonb_build_object('type', 'cashChange'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú: '),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    WHEN 'provisional_bill' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'PHIẾU TẠM TÍNH', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú: '),
          jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    WHEN 'kitchen_ticket' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', 'GỌI THÊM', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'send_kind', 'when_equals', 'append'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'IN LẠI LẦN #{{reprint_seq}}', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'reprint_seq', 'when_min', 2),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reprint_seq', 'when_min', 2),
          jsonb_build_object('type', 'row', 'left', 'Đơn: {{source_order_number}}', 'right', 'Lần gửi: {{send_seq}}'),
          jsonb_build_object('type', 'row', 'left', 'Phiếu bếp: {{kitchen_ticket_number_raw}}', 'right', 'Bếp: {{slot}}', 'when_field', 'kitchen_ticket_number_raw', 'when_not_empty', true),
          jsonb_build_object('type', 'row', 'left', 'Bàn: {{table_number}}', 'right', 'Giờ: {{printed_time}}', 'when_field', 'table_number', 'when_not_empty', true),
          jsonb_build_object('type', 'row', 'left', 'Giờ: {{printed_time}}', 'right', '', 'when_field', 'table_number', 'when_equals', ''),
          jsonb_build_object('type', 'text', 'text', 'Người order: {{cashier_name}}', 'when_field', 'cashier_name', 'when_not_empty', true),
          jsonb_build_object('type', 'kitchenItems'),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'note', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', 'GHI CHÚ', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'note', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', '{{note}}', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'note', 'when_not_empty', true),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'note', 'when_not_empty', true)
        )
      );
    WHEN 'cancel_ticket' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'HỦY MÓN', 'align', 'center', 'bold', true, 'double', true, 'inverse', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', '{{order_header}}', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'row', 'left', 'Bếp: {{slot}}', 'right', 'Giờ: {{printed_time}}'),
          jsonb_build_object('type', 'row', 'left', 'Bàn: {{table_number}}', 'right', '', 'when_field', 'table_number', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', 'Người hủy: {{voided_by}}', 'when_field', 'voided_by', 'when_not_empty', true),
          jsonb_build_object('type', 'cancelItems'),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reason', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', 'LÝ DO', 'align', 'center', 'bold', true, 'double', true, 'when_field', 'reason', 'when_not_empty', true),
          jsonb_build_object('type', 'text', 'text', '{{reason}}', 'align', 'center', 'when_field', 'reason', 'when_not_empty', true),
          jsonb_build_object('type', 'divider', 'char', '=', 'when_field', 'reason', 'when_not_empty', true)
        )
      );
    WHEN 'shift_close_report' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'PHIẾU CHỐT CA', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'text', 'text', 'BIÊN BẢN BÀN GIAO TIỀN & DOANH THU', 'align', 'center', 'bold', true),
          jsonb_build_object('type', 'text', 'text', 'Mã ca: #{{session_id}}', 'align', 'center'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'row', 'left', 'Thu ngân:', 'right', '{{cashier_name}}', 'when_field', 'cashier_name', 'when_not_empty', true),
          jsonb_build_object('type', 'row', 'left', 'Mở ca:', 'right', '{{opened_datetime}}'),
          jsonb_build_object('type', 'row', 'left', 'Đóng ca:', 'right', '{{closed_datetime}}'),
          jsonb_build_object('type', 'row', 'left', 'Thời gian:', 'right', '{{duration}}', 'when_field', 'duration', 'when_not_empty', true),
          jsonb_build_object('type', 'shiftOrderSummary'),
          jsonb_build_object('type', 'shiftItemBreakdown'),
          jsonb_build_object('type', 'shiftCashReconciliation'),
          jsonb_build_object('type', 'paymentBreakdown'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú bàn giao: '),
          jsonb_build_object('type', 'shiftVarianceNotice'),
          jsonb_build_object('type', 'shiftSignature'),
          jsonb_build_object('type', 'spacer', 'lines', 1),
          jsonb_build_object('type', 'text', 'text', 'In lúc: {{printed_datetime}}', 'align', 'center'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    ELSE
      RETURN jsonb_build_object('blocks', '[]'::jsonb);
  END CASE;
END;
$$;


--
-- Name: print_template_diff_sign(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_diff_sign(p_value numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN COALESCE(p_value, 0) = 0 THEN 'OK'
    WHEN COALESCE(p_value, 0) > 0 THEN 'THỪA'
    ELSE 'THIẾU'
  END;
$$;


--
-- Name: print_template_divider_block(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_divider_block(p_char text DEFAULT '-'::text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'type', 'divider',
    'char', COALESCE(NULLIF(left(p_char, 1), ''), '-')
  );
$$;


--
-- Name: print_template_duration(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_duration(p_opened_at text, p_closed_at text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_minutes INT;
  v_hours INT;
  v_rest INT;
BEGIN
  IF COALESCE(p_opened_at, '') = '' OR COALESCE(p_closed_at, '') = '' THEN
    RETURN '';
  END IF;

  BEGIN
    v_minutes := round(
      EXTRACT(epoch FROM ((p_closed_at::timestamp) - (p_opened_at::timestamp))) / 60
    )::INT;
  EXCEPTION WHEN OTHERS THEN
    RETURN '';
  END;

  IF v_minutes <= 0 THEN
    RETURN '';
  END IF;

  v_hours := floor(v_minutes / 60);
  v_rest := v_minutes % 60;

  IF v_hours > 0 AND v_rest > 0 THEN
    RETURN v_hours::TEXT || ' giờ ' || v_rest::TEXT || ' phút';
  ELSIF v_hours > 0 THEN
    RETURN v_hours::TEXT || ' giờ';
  END IF;

  RETURN v_rest::TEXT || ' phút';
END;
$$;


--
-- Name: print_template_hhmm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_hhmm(p_iso text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  IF COALESCE(p_iso, '') = '' THEN
    RETURN '';
  END IF;

  IF p_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}' THEN
    RETURN substring(p_iso FROM 12 FOR 5);
  END IF;

  RETURN p_iso;
END;
$$;


--
-- Name: print_template_interpolate(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_interpolate(p_text text, p_payload jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_text TEXT := COALESCE(p_text, '');
BEGIN
  v_text := replace(v_text, '{{order_header}}', public.print_template_payload_text(p_payload, 'order_header'));
  v_text := replace(v_text, '{{order_number}}', public.print_template_payload_text(p_payload, 'order_number'));
  v_text := replace(v_text, '{{branch_name}}', public.print_template_payload_text(p_payload, 'branch_name'));
  v_text := replace(v_text, '{{cashier_name}}', public.print_template_payload_text(p_payload, 'cashier_name'));
  v_text := replace(v_text, '{{printed_at}}', public.print_template_payload_text(p_payload, 'printed_at'));
  v_text := replace(v_text, '{{printed_time}}', public.print_template_payload_text(p_payload, 'printed_time'));
  v_text := replace(v_text, '{{printed_datetime}}', public.print_template_payload_text(p_payload, 'printed_datetime'));
  v_text := replace(v_text, '{{created_datetime}}', public.print_template_payload_text(p_payload, 'created_datetime'));
  v_text := replace(v_text, '{{opened_datetime}}', public.print_template_payload_text(p_payload, 'opened_datetime'));
  v_text := replace(v_text, '{{closed_datetime}}', public.print_template_payload_text(p_payload, 'closed_datetime'));
  v_text := replace(v_text, '{{duration}}', public.print_template_payload_text(p_payload, 'duration'));
  v_text := replace(v_text, '{{total_amount}}', public.print_template_payload_text(p_payload, 'total_amount'));
  v_text := replace(v_text, '{{order_destination}}', public.print_template_payload_text(p_payload, 'order_destination'));
  v_text := replace(v_text, '{{kitchen_ticket_number}}', public.print_template_payload_text(p_payload, 'kitchen_ticket_number'));
  v_text := replace(v_text, '{{kitchen_ticket_number_raw}}', public.print_template_payload_text(p_payload, 'kitchen_ticket_number_raw'));
  v_text := replace(v_text, '{{source_order_number}}', public.print_template_payload_text(p_payload, 'source_order_number'));
  v_text := replace(v_text, '{{table_number}}', public.print_template_payload_text(p_payload, 'table_number'));
  v_text := replace(v_text, '{{send_seq}}', public.print_template_payload_text(p_payload, 'send_seq'));
  v_text := replace(v_text, '{{slot}}', public.print_template_payload_text(p_payload, 'slot'));
  v_text := replace(v_text, '{{reprint_seq}}', public.print_template_payload_text(p_payload, 'reprint_seq'));
  v_text := replace(v_text, '{{voided_by}}', public.print_template_payload_text(p_payload, 'voided_by'));
  v_text := replace(v_text, '{{reason}}', public.print_template_payload_text(p_payload, 'reason'));
  v_text := replace(v_text, '{{session_id}}', public.print_template_payload_text(p_payload, 'session_id'));
  v_text := replace(v_text, '{{note}}', public.print_template_payload_text(p_payload, 'note'));
  RETURN v_text;
END;
$$;


--
-- Name: print_template_kitchen_item_blocks(jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_kitchen_item_blocks(p_payload jsonb, p_strikethrough boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_item JSONB;
  v_modifier JSONB;
  v_side JSONB;
  v_idx INT := 0;
  v_qty NUMERIC;
  v_side_qty NUMERIC;
  v_side_name TEXT;
  v_border TEXT := '----+' || repeat('-', 43);
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_text_block(v_border),
    public.print_template_text_block(' SL | MÓN', NULL, true),
    public.print_template_text_block(v_border)
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    v_idx := v_idx + 1;
    IF v_idx > 1 THEN
      v_out := v_out || jsonb_build_array(public.print_template_text_block(v_border));
    END IF;

    v_qty := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 0);
    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        ' x' || trim(to_char(v_qty, 'FM999999')) || ' | ' || COALESCE(v_item->>'item_name', ''),
        NULL,
        true,
        true,
        false,
        p_strikethrough
      )
    );

    IF COALESCE(NULLIF(v_item->>'variant_name', ''), '') <> '' THEN
      v_out := v_out || jsonb_build_array(
        public.print_template_text_block(
          '    |   (' || (v_item->>'variant_name') || ')',
          NULL,
          false,
          false,
          false,
          p_strikethrough
        )
      );
    END IF;

    FOR v_modifier IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'modifiers', '[]'::jsonb))
    LOOP
      IF COALESCE(NULLIF(v_modifier->>'name', ''), '') <> '' THEN
        v_out := v_out || jsonb_build_array(
          public.print_template_text_block(
            '    |   + ' || (v_modifier->>'name'),
            NULL,
            false,
            false,
            false,
            p_strikethrough
          )
        );
      END IF;
    END LOOP;

    FOR v_side IN SELECT value FROM jsonb_array_elements(COALESCE(v_item->'sides', '[]'::jsonb))
    LOOP
      v_side_name := COALESCE(NULLIF(v_side->>'name', ''), v_side->>'side_item_name', '');
      IF v_side_name <> '' THEN
        v_side_qty := COALESCE(NULLIF(v_side->>'quantity', '')::numeric, 1) * v_qty;
        v_out := v_out || jsonb_build_array(
          public.print_template_text_block(
            '    |   - ' || v_side_name || CASE
              WHEN v_side_qty > 0 THEN ' x' || trim(to_char(v_side_qty, 'FM999999'))
              ELSE ''
            END,
            NULL,
            true,
            true,
            false,
            p_strikethrough
          )
        );
      END IF;
    END LOOP;

    IF COALESCE(NULLIF(v_item->>'note', ''), '') <> '' THEN
      v_out := v_out || jsonb_build_array(
        public.print_template_text_block(
          '    |   * ' || (v_item->>'note'),
          NULL,
          true,
          true,
          false,
          p_strikethrough
        )
      );
    END IF;
  END LOOP;

  v_out := v_out || jsonb_build_array(public.print_template_text_block(v_border));
  RETURN v_out;
END;
$$;


--
-- Name: print_template_money(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_money(p_value numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT replace(to_char(round(COALESCE(p_value, 0)), 'FM999,999,999,999'), ',', '.') || 'đ';
$$;


--
-- Name: print_template_order_destination(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_order_destination(p_payload jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p_payload->>'order_type' = 'dine_in'
      THEN CASE
        WHEN NULLIF(p_payload->>'table_number', '') IS NOT NULL
          THEN 'BÀN ' || (p_payload->>'table_number')
        ELSE 'TẠI CHỖ'
      END
    ELSE 'MANG VỀ'
  END;
$$;


--
-- Name: print_template_order_header(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_order_header(p_payload jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_order_number TEXT := btrim(
    COALESCE(
      NULLIF(p_payload->>'source_order_number', ''),
      NULLIF(p_payload->>'order_number', ''),
      ''
    )
  );
  v_clean_order_number TEXT;
  v_order_type TEXT := COALESCE(p_payload->>'order_type', '');
  v_table_number TEXT := NULLIF(btrim(COALESCE(p_payload->>'table_number', '')), '');
  v_prefix TEXT;
  v_label TEXT;
  v_match TEXT[];
  v_sequence TEXT;
  v_is_dine_in BOOLEAN;
BEGIN
  v_clean_order_number := regexp_replace(v_order_number, '^#+', '');
  v_prefix := upper(split_part(v_clean_order_number, '-', 1));
  v_is_dine_in := v_order_type = 'dine_in'
    OR (v_order_type <> 'takeaway' AND v_prefix = 'TC');

  v_label := CASE
    WHEN v_is_dine_in AND v_table_number IS NOT NULL THEN 'Bàn ' || v_table_number
    WHEN v_is_dine_in THEN 'Tại bàn'
    WHEN v_order_type = 'takeaway' OR v_prefix = 'MV' THEN 'Mang về'
    ELSE 'Đơn'
  END;

  v_match := regexp_match(
    v_clean_order_number,
    '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,4})(?:-.+)?$',
    'i'
  );
  IF v_match IS NOT NULL THEN
    v_sequence := v_match[1];
  END IF;

  IF COALESCE(v_sequence, '') <> '' THEN
    RETURN v_label || ' #' || v_sequence;
  END IF;

  IF v_clean_order_number <> '' THEN
    RETURN v_label || ' ' || v_clean_order_number;
  END IF;

  RETURN v_label;
END;
$_$;


--
-- Name: print_template_payload_number(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_payload_number(p_payload jsonb, p_field text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_value JSONB;
BEGIN
  IF p_payload IS NULL OR p_field IS NULL OR p_field = '' THEN
    RETURN 0;
  END IF;

  v_value := p_payload -> p_field;
  IF v_value IS NULL OR v_value = 'null'::jsonb THEN
    RETURN 0;
  END IF;

  BEGIN
    RETURN COALESCE((v_value #>> '{}')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
END;
$$;


--
-- Name: print_template_payload_text(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_payload_text(p_payload jsonb, p_field text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_value JSONB;
BEGIN
  IF p_payload IS NULL OR p_field IS NULL OR p_field = '' THEN
    RETURN '';
  END IF;

  CASE p_field
    WHEN 'order_header' THEN
      RETURN public.print_template_order_header(p_payload);
    WHEN 'order_destination' THEN
      RETURN public.print_template_order_destination(p_payload);
    WHEN 'kitchen_ticket_number' THEN
      RETURN COALESCE(NULLIF(p_payload->>'kitchen_ticket_number', ''), p_payload->>'order_number', '');
    WHEN 'kitchen_ticket_number_raw' THEN
      RETURN COALESCE(NULLIF(p_payload->>'kitchen_ticket_number', ''), '');
    WHEN 'source_order_number' THEN
      RETURN COALESCE(NULLIF(p_payload->>'source_order_number', ''), p_payload->>'order_number', '');
    WHEN 'printed_time' THEN
      RETURN public.print_template_hhmm(p_payload->>'printed_at');
    WHEN 'printed_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'printed_at');
    WHEN 'created_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'created_at');
    WHEN 'opened_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'opened_at');
    WHEN 'closed_datetime' THEN
      RETURN public.print_template_datetime(p_payload->>'closed_at');
    WHEN 'duration' THEN
      RETURN public.print_template_duration(p_payload->>'opened_at', p_payload->>'closed_at');
    WHEN 'payment_method_label' THEN
      RETURN public.print_template_payment_label(p_payload->>'payment_method', false);
    WHEN 'cash_difference_sign' THEN
      RETURN public.print_template_diff_sign(public.print_template_payload_number(p_payload, 'cash_difference'));
    ELSE
      v_value := p_payload -> p_field;
      IF v_value IS NULL OR v_value = 'null'::jsonb THEN
        RETURN '';
      END IF;
      RETURN COALESCE(v_value #>> '{}', '');
  END CASE;
END;
$$;


--
-- Name: print_template_payment_breakdown_blocks(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_payment_breakdown_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_row JSONB;
BEGIN
  IF COALESCE(jsonb_array_length(COALESCE(p_payload->'payment_breakdown', '[]'::jsonb)), 0) = 0 THEN
    RETURN v_out;
  END IF;

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('CƠ CẤU ĐÃ THU', 'center', true),
    public.print_template_divider_block('-')
  );

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'payment_breakdown', '[]'::jsonb))
  LOOP
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        public.print_template_payment_label(v_row->>'method', true)
          || ' (' || COALESCE(v_row->>'count', '0') || ' đơn)',
        public.print_template_money(COALESCE(NULLIF(v_row->>'amount', '')::numeric, 0))
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;


--
-- Name: print_template_payment_label(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_payment_label(p_method text, p_full boolean DEFAULT false) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE COALESCE(p_method, 'unknown')
    WHEN 'cash' THEN 'Tiền mặt'
    WHEN 'vietqr' THEN CASE WHEN p_full THEN 'Chuyển khoản (VietQR)' ELSE 'VietQR' END
    WHEN 'bank_transfer' THEN 'Chuyển khoản'
    WHEN 'momo' THEN 'MoMo'
    WHEN 'unknown' THEN 'Khác'
    ELSE p_method
  END;
$$;


--
-- Name: print_template_row_block(text, text, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_row_block(p_left text, p_right text DEFAULT ''::text, p_bold boolean DEFAULT false, p_double boolean DEFAULT false, p_strikethrough boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'type', 'row',
    'left', COALESCE(p_left, ''),
    'right', COALESCE(p_right, ''),
    'bold', COALESCE(p_bold, false),
    'double', COALESCE(p_double, false),
    'strikethrough', COALESCE(p_strikethrough, false)
  );
$$;


--
-- Name: print_template_shift_cash_blocks(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_shift_cash_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_opening NUMERIC := public.print_template_payload_number(p_payload, 'opening_cash');
  v_closing NUMERIC := public.print_template_payload_number(p_payload, 'closing_cash');
  v_expected NUMERIC := public.print_template_payload_number(p_payload, 'expected_cash');
  v_difference NUMERIC := public.print_template_payload_number(p_payload, 'cash_difference');
  v_collected NUMERIC := greatest(0, v_expected - v_opening);
BEGIN
  RETURN jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('ĐỐI SOÁT KÉT TIỀN MẶT', 'center', true),
    public.print_template_divider_block('-'),
    public.print_template_row_block('Tiền mặt đầu ca', public.print_template_money(v_opening)),
    public.print_template_row_block('+ Tiền mặt bán hàng', public.print_template_money(v_collected)),
    public.print_template_row_block('= Tiền mặt phải nộp', public.print_template_money(v_expected)),
    public.print_template_row_block('Tiền mặt thực đếm', public.print_template_money(v_closing)),
    public.print_template_row_block(
      'Lệch két (' || public.print_template_diff_sign(v_difference) || ')',
      public.print_template_money(v_difference),
      true
    )
  );
END;
$$;


--
-- Name: print_template_shift_item_breakdown_blocks(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_shift_item_breakdown_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_items JSONB := CASE
    WHEN jsonb_typeof(p_payload->'item_breakdown') = 'array' THEN p_payload->'item_breakdown'
    ELSE '[]'::jsonb
  END;
  v_row JSONB;
  v_name TEXT;
  v_display_name TEXT;
  v_qty NUMERIC;
  v_revenue NUMERIC;
  v_total NUMERIC := 0;
  v_name_width CONSTANT INT := 27;
  v_qty_width CONSTANT INT := 5;
  v_amount_width CONSTANT INT := 16;
BEGIN
  IF jsonb_array_length(v_items) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT COALESCE(SUM(COALESCE(NULLIF(value->>'qty', '')::numeric, 0)), 0)
  INTO v_total
  FROM jsonb_array_elements(v_items);

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('SỐ LƯỢNG BÁN THEO MÓN', 'center', true),
    public.print_template_row_block('Tổng SL bán', trim(to_char(v_total, 'FM999999'))),
    public.print_template_divider_block('-'),
    public.print_template_text_block(
      rpad('Món', v_name_width)
      || lpad('SL', v_qty_width)
      || lpad('Thành tiền', v_amount_width),
      NULL,
      true
    ),
    public.print_template_divider_block('-')
  );

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_items)
  LOOP
    v_name := COALESCE(NULLIF(v_row->>'name', ''), 'Món');
    v_display_name := CASE
      WHEN char_length(v_name) > v_name_width THEN left(v_name, v_name_width - 1) || '.'
      ELSE v_name
    END;
    v_qty := COALESCE(NULLIF(v_row->>'qty', '')::numeric, 0);
    v_revenue := COALESCE(NULLIF(v_row->>'revenue', '')::numeric, 0);

    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        rpad(v_display_name, v_name_width)
        || lpad(trim(to_char(v_qty, 'FM999999')), v_qty_width)
        || lpad(public.print_template_money(v_revenue), v_amount_width)
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;


--
-- Name: print_template_shift_signature_blocks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_shift_signature_blocks() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('KÝ NHẬN BÀN GIAO', 'center', true),
    public.print_template_row_block('Thu ngân bàn giao', 'Quản lý nhận'),
    public.print_template_spacer_block(2),
    public.print_template_row_block('.................', '.................')
  );
$$;


--
-- Name: print_template_shift_summary_blocks(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_shift_summary_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_paid NUMERIC := public.print_template_payload_number(p_payload, 'paid_order_count');
  v_unpaid NUMERIC := public.print_template_payload_number(p_payload, 'unpaid_order_count');
  v_cancelled NUMERIC := public.print_template_payload_number(p_payload, 'cancelled_order_count');
  v_revenue NUMERIC := public.print_template_payload_number(p_payload, 'total_revenue');
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('TỔNG KẾT CA', 'center', true),
    public.print_template_divider_block('-'),
    public.print_template_row_block(
      'TỔNG ĐÃ THU',
      public.print_template_money(v_revenue),
      true,
      true
    ),
    public.print_template_row_block(
      'Đơn đã thu tiền',
      trim(to_char(v_paid, 'FM999999')) || ' đơn'
    )
  );

  IF v_unpaid > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn chưa thu/chuyển ca',
        trim(to_char(v_unpaid, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  IF v_cancelled > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn đã hủy',
        trim(to_char(v_cancelled, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  RETURN v_out;
END;
$$;


--
-- Name: print_template_shift_variance_notice_blocks(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_shift_variance_notice_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_note TEXT := COALESCE(NULLIF(btrim(p_payload->>'variance_note'), ''), '');
  v_expected NUMERIC := public.print_template_payload_number(p_payload, 'expected_cash');
  v_difference NUMERIC := public.print_template_payload_number(p_payload, 'cash_difference');
  v_threshold NUMERIC := GREATEST(50000::NUMERIC, ROUND(v_expected * 0.005, 2));
  v_breached BOOLEAN := ABS(v_difference) > v_threshold;
  v_out JSONB := '[]'::jsonb;
BEGIN
  IF NOT v_breached AND v_note = '' THEN
    RETURN v_out;
  END IF;

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('LƯU Ý LỆCH KÉT', 'center', true),
    public.print_template_row_block('Ngưỡng cảnh báo', public.print_template_money(v_threshold))
  );

  IF v_breached THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block('Trạng thái', 'Cần quản lý hậu kiểm', true)
    );
  END IF;

  IF COALESCE(NULLIF(p_payload->>'variance_approver', ''), '') <> '' THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block('Người ghi nhận', p_payload->>'variance_approver')
    );
  END IF;

  IF v_note <> '' THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_text_block('Ghi chú lệch két:'),
      public.print_template_text_block('  ' || v_note)
    );
  END IF;

  v_out := v_out || jsonb_build_array(public.print_template_divider_block('='));

  RETURN v_out;
END;
$$;


--
-- Name: print_template_spacer_block(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_spacer_block(p_lines integer DEFAULT 1) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'type', 'spacer',
    'lines', GREATEST(1, LEAST(5, COALESCE(p_lines, 1)))
  );
$$;


--
-- Name: print_template_text_block(text, text, boolean, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_text_block(p_text text, p_align text DEFAULT NULL::text, p_bold boolean DEFAULT false, p_double boolean DEFAULT false, p_inverse boolean DEFAULT false, p_strikethrough boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'type', 'text',
    'text', COALESCE(p_text, ''),
    'align', p_align,
    'bold', COALESCE(p_bold, false),
    'double', COALESCE(p_double, false),
    'inverse', COALESCE(p_inverse, false),
    'strikethrough', COALESCE(p_strikethrough, false)
  );
$$;


--
-- Name: print_template_variance_approval_blocks(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.print_template_variance_approval_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT public.print_template_shift_variance_notice_blocks(p_payload);
$$;


--
-- Name: recall_kds_ticket(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recall_kds_ticket(p_ticket_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ticket     RECORD;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('kds:recall') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, status
  INTO v_ticket
  FROM public.kds_tickets
  WHERE id = p_ticket_id
    AND tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ticket.status = 'ready' THEN
    v_new_status := 'preparing';
  ELSIF v_ticket.status = 'preparing' THEN
    v_new_status := 'pending';
  ELSE
    RAISE EXCEPTION 'Ticket cannot be recalled from status %', v_ticket.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kds_tickets
  SET status    = v_new_status,
      bumped_at = NULL,
      bumped_by = NULL
  WHERE id = p_ticket_id;

  RETURN v_new_status;
END;
$$;


--
-- Name: recompute_supplier_invoice_matching(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_supplier_invoice_matching(p_invoice_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant   BIGINT := public.auth_tenant_id();
  v_inv      RECORD;
  v_grn_tot  NUMERIC(15,2);
  v_status   TEXT := 'matched';
BEGIN
  SELECT * INTO v_inv FROM public.supplier_invoices
  WHERE id = p_invoice_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- V17: formal-PO line matching CUT. Match reduced to GRN-vs-invoice.
  IF v_inv.grn_id IS NOT NULL THEN
    SELECT COALESCE(SUM(gi.total_cost), 0) INTO v_grn_tot
    FROM public.grn_items gi WHERE gi.grn_id = v_inv.grn_id;
    IF v_inv.total_amount > v_grn_tot * 1.02 THEN
      v_status := 'discrepancy';
    END IF;
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = v_status, updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'matching_status', v_status);
END;
$$;


--
-- Name: reduce_order_item_quantity(bigint, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid           UUID;
  v_prof_tenant   BIGINT;
  v_prof_branch   BIGINT;
  v_prof_role     TEXT;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_old_qty       INT;
  v_qty_diff      INT;
  v_new_subtotal  NUMERIC(15,2);
  v_subtotal_sum  NUMERIC(15,2);
  v_disc_amount   NUMERIC(15,2);
  v_total_amount  NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('manager', 'staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity < 1 THEN
    RAISE EXCEPTION 'new quantity must be >= 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not reducible' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  v_old_qty := v_item.quantity;

  IF p_new_quantity >= v_old_qty THEN
    RAISE EXCEPTION 'no reduction needed' USING ERRCODE = '22023';
  END IF;

  v_qty_diff := v_old_qty - p_new_quantity;
  v_new_subtotal := v_item.unit_price * p_new_quantity;

  UPDATE public.order_items
  SET quantity   = p_new_quantity,
      subtotal   = v_new_subtotal,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status NOT IN ('served', 'cancelled');

  IF v_item.menu_item_id IS NOT NULL THEN
    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = GREATEST(sold_today - v_qty_diff, 0),
        updated_at = now()
    WHERE branch_id = v_order.branch_id
      AND menu_item_id = v_item.menu_item_id
      AND limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal_sum
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  v_disc_amount := public.compute_discount_amount(
    v_order.discount_type, v_order.discount_value, v_subtotal_sum
  );
  v_total_amount := v_subtotal_sum
    + COALESCE(v_order.service_charge, 0)
    - v_disc_amount;

  UPDATE public.orders
  SET subtotal        = v_subtotal_sum,
      discount_amount = v_disc_amount,
      total_amount    = v_total_amount,
      updated_at      = now()
  WHERE id = v_item.order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
    'reduce_item ' || p_order_item_id::text
      || ': ' || v_old_qty::text || '->' || p_new_quantity::text
      || ': ' || p_reason
  );

  RETURN jsonb_build_object(
    'order_id',           v_item.order_id,
    'order_item_id',      p_order_item_id,
    'old_quantity',       v_old_qty,
    'new_quantity',       p_new_quantity,
    'qty_reduced',        v_qty_diff,
    'subtotal',           v_subtotal_sum,
    'discount_amount',    v_disc_amount,
    'total_amount',       v_total_amount,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;


--
-- Name: FUNCTION reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reduce_order_item_quantity(p_order_item_id bigint, p_new_quantity integer, p_reason text) IS 'Giảm SL món đã gửi (qty: từ N xuống M, M<N, M>=1). Lock order + item, permission pos:void_order, recompute subtotal/discount/total qua compute_discount_amount, bump kds_tickets.updated_at, decrement branch_menu_item_daily_limits.sold_today cho menu_item của row (DAILY-LIMIT-REDUCE-QTY-LEAK fix). Reason >=5 ký tự, ghi order_status_history. Block khi item served/cancelled, order completed/cancelled, hoặc payment_status=paid.';


--
-- Name: refresh_inventory_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_inventory_dashboard() RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_permission(NULL, 'reports:view_branch') OR public.has_permission(NULL, 'reports:view_tenant')
       OR public.has_permission(NULL, 'settings:branch') OR public.has_permission(NULL, 'settings:tenant')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;
  RETURN now();
END; $$;


--
-- Name: release_table(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_table(p_table_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
BEGIN
  UPDATE public.tables
  SET status = 'available'
  WHERE id = p_table_id
    AND branch_id = public.auth_branch_id()
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found or not in your branch' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


--
-- Name: replace_tax_invoice(bigint, text, text, timestamp with time zone, text, text, text, numeric, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_tax_invoice(p_old_id bigint, p_reason text, p_agreement_ref text, p_agreement_date timestamp with time zone, p_buyer_name text, p_buyer_tax_code text, p_buyer_address text, p_subtotal numeric, p_vat_rate numeric, p_vat_amount numeric, p_total_amount numeric, p_provider text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old        RECORD;
  v_actor      UUID;
  v_new_id     BIGINT;
  v_chain_depth INTEGER;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden_no_auth' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason_too_short' USING ERRCODE = '23514';
  END IF;
  IF length(p_reason) > 255 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '23514';
  END IF;

  IF p_agreement_ref IS NULL OR length(trim(p_agreement_ref)) = 0 THEN
    RAISE EXCEPTION 'agreement_ref_required' USING ERRCODE = '23514';
  END IF;
  IF length(p_agreement_ref) > 225 THEN
    RAISE EXCEPTION 'agreement_ref_too_long' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_old
  FROM public.tax_invoices
  WHERE id = p_old_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission_denied_settings_tenant' USING ERRCODE = '42501';
  END IF;

  IF v_old.status IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'only_issued_can_be_replaced' USING ERRCODE = '22023';
  END IF;

  IF v_old.replaced_by IS NOT NULL THEN
    RAISE EXCEPTION 'already_replaced' USING ERRCODE = '22023';
  END IF;

  IF v_old.invoice_kind IS DISTINCT FROM 'per_order' THEN
    RAISE EXCEPTION 'b2c_summary_replace_not_supported' USING ERRCODE = '0A000';
  END IF;

  IF p_agreement_date > now() THEN
    RAISE EXCEPTION 'agreement_date_in_future' USING ERRCODE = '22008';
  END IF;
  IF v_old.issued_at IS NOT NULL AND p_agreement_date < v_old.issued_at THEN
    RAISE EXCEPTION 'agreement_date_before_issued_at' USING ERRCODE = '22008';
  END IF;

  WITH RECURSIVE chain AS (
    SELECT id, replaced_for, 1 AS depth
    FROM public.tax_invoices
    WHERE id = p_old_id
    UNION ALL
    SELECT t.id, t.replaced_for, c.depth + 1
    FROM public.tax_invoices t
    JOIN chain c ON t.id = c.replaced_for
    WHERE c.depth < 10
  )
  SELECT MAX(depth) INTO v_chain_depth FROM chain;

  IF v_chain_depth >= 3 THEN
    RAISE EXCEPTION 'replacement_chain_too_deep_max_3' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET status = 'replaced',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_old_id;

  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id,
    status, invoice_kind,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, provider_data,
    replaced_for,
    created_by
  )
  VALUES (
    v_old.tenant_id, v_old.branch_id, v_old.order_id,
    'draft', 'per_order',
    p_buyer_name, p_buyer_tax_code, p_buyer_address,
    p_subtotal, p_vat_rate, p_vat_amount, p_total_amount,
    p_provider,
    jsonb_build_object(
      'replace', jsonb_build_object(
        'reason', p_reason,
        'agreement_ref', p_agreement_ref,
        'agreement_date', p_agreement_date,
        'original_invoice_id', v_old.id,
        'original_invoice_number', v_old.invoice_number,
        'original_issued_at', v_old.issued_at,
        'original_provider_ref', v_old.provider_ref
      )
    ),
    p_old_id,
    v_actor
  )
  RETURNING id INTO v_new_id;

  UPDATE public.tax_invoices
  SET replaced_by = v_new_id
  WHERE id = p_old_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, from_status, to_status, payload, note, actor_id, tenant_id)
  VALUES
    (p_old_id, 'issued', 'replaced',
     jsonb_build_object(
       'reason', p_reason,
       'replaced_by', v_new_id,
       'agreement_ref', p_agreement_ref,
       'agreement_date', p_agreement_date
     ),
     'TT78 §7 replace: ' || p_reason,
     v_actor,
     v_old.tenant_id),
    (v_new_id, NULL, 'draft',
     jsonb_build_object(
       'replaces', p_old_id,
       'original_invoice_number', v_old.invoice_number
     ),
     'Replacement draft for invoice ' || COALESCE(v_old.invoice_number, '#' || p_old_id::TEXT),
     v_actor,
     v_old.tenant_id);

  RETURN v_new_id;
END;
$$;


--
-- Name: FUNCTION replace_tax_invoice(p_old_id bigint, p_reason text, p_agreement_ref text, p_agreement_date timestamp with time zone, p_buyer_name text, p_buyer_tax_code text, p_buyer_address text, p_subtotal numeric, p_vat_rate numeric, p_vat_amount numeric, p_total_amount numeric, p_provider text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.replace_tax_invoice(p_old_id bigint, p_reason text, p_agreement_ref text, p_agreement_date timestamp with time zone, p_buyer_name text, p_buyer_tax_code text, p_buyer_address text, p_subtotal numeric, p_vat_rate numeric, p_vat_amount numeric, p_total_amount numeric, p_provider text) IS 'TT78 §7 atomic replacement RPC. Locks OLD invoice, flips to replaced, INSERTs NEW draft, links both via replaced_by/replaced_for, audits via tax_invoice_events — all in single tx. Caller then transitions NEW: draft → signing → call provider with adjustmentType=3 → issued|submitted|draft. Requires settings:tenant + same tenant. Chain depth capped at 3.';


--
-- Name: resolve_branch_printer_for_type(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_branch_printer_for_type(p_tenant_id bigint, p_branch_id bigint, p_print_type text) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- V17: per-type printer routing CUT. Resolve directly from printers by role;
  -- receipt-class outputs use the receipt printer, kitchen outputs the kitchen printers.
  SELECT p.id
  FROM public.printers p
  WHERE p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
    AND p_tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR p_branch_id = public.auth_branch_id()
    )
    AND p.is_active = TRUE
    AND (
      (p_print_type IN ('receipt','provisional_bill','shift_close_report') AND p.role = 'receipt')
      OR (p_print_type NOT IN ('receipt','provisional_bill','shift_close_report') AND p.role IN ('kitchen_1','kitchen_2'))
    )
  ORDER BY
    CASE
      WHEN p.role = 'receipt' THEN 0
      WHEN p.role = 'kitchen_1' THEN 1
      WHEN p.role = 'kitchen_2' THEN 2
      ELSE 3
    END,
    p.id
  LIMIT 1;
$$;


--
-- Name: resolve_print_template_version(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_print_template_version(p_tenant_id bigint, p_branch_id bigint, p_kind text) RETURNS TABLE(template_id bigint, template_version integer, paper_width_mm integer, font_profile text, content jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- V17: dormant printer routing CUT. Return no rows;
  -- attach_print_document_to_payload falls back to print_template_default_content().
  SELECT NULL::BIGINT, NULL::INT, NULL::INT, NULL::TEXT, NULL::JSONB WHERE false;
$$;


--
-- Name: retry_print_job(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retry_print_job(p_job_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_tenant   BIGINT := public.auth_tenant_id();
  v_updated  INT;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context missing' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('printer:manage')
    OR public.has_permission_any('pos:print')
  ) THEN
    RAISE EXCEPTION 'permission denied: printer:manage' USING ERRCODE = '42501';
  END IF;

  UPDATE public.print_jobs
     SET status           = 'pending',
         last_error       = NULL,
         claimed_by_agent = NULL,
         claimed_at       = NULL,
         retry_count      = retry_count + 1,
         last_retried_at  = now(),
         last_retried_by  = v_uid
   WHERE id = p_job_id
     AND tenant_id = v_tenant
     AND status IN ('failed', 'expired');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;


--
-- Name: reverse_payment_and_post(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reverse_payment_and_post(p_refund_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_refund          RECORD;
  v_payment         RECORD;
  v_order           RECORD;
  v_actor           UUID := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_je_id           BIGINT;
  v_dr_account_id   BIGINT;
  v_cr_account_id   BIGINT;
  v_cr_account_code TEXT;
  v_entry_number    TEXT;
  v_stock_count     INT := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, payment_id, order_id, amount, status
  INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_refund.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;

  IF v_refund.status = 'approved' THEN
    RETURN jsonb_build_object(
      'status', 'already_approved',
      'refund_id', v_refund.id
    );
  END IF;
  IF v_refund.status <> 'pending' THEN
    RAISE EXCEPTION 'refund cannot transition from % to approved', v_refund.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = v_refund.payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', v_refund.payment_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment status=% - refund requires completed',
      v_payment.status USING ERRCODE = 'P0001';
  END IF;
  IF v_refund.amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund amount % exceeds payment amount %',
      v_refund.amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = v_refund.order_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', v_refund.order_id
      USING ERRCODE = 'P0002';
  END IF;

  -- GL reversal + stock restore removed (no GL, no trừ kho in HKD lean).

  UPDATE public.payments
     SET status = 'refunded', updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'refunded', updated_at = now()
   WHERE id = v_order.id;

  UPDATE public.refunds
     SET status      = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at  = now()
   WHERE id = v_refund.id;

  PERFORM public.log_audit(
    'refund.approve',
    'refund',
    v_refund.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'refund_id', v_refund.id,
    'payment_new_status', 'refunded',
    'order_new_status', 'refunded'
  );
END;
$$;


--
-- Name: FUNCTION reverse_payment_and_post(p_refund_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reverse_payment_and_post(p_refund_id bigint) IS 'Atomic refund reversal with branch-scoped orders:refund_approve permission. Locks refund/payment/order, posts GL reversal, restores stock when stock_consumed_status=ok, flips payment/order/refund, and audits.';


--
-- Name: revoke_permission(uuid, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_permission(p_target_user uuid, p_branch_id bigint, p_permission_key text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_deleted INTEGER;
  v_effective_branch_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_effective_branch_id := private.staff_permission_effective_branch_id(
    p_permission_key,
    p_branch_id
  );

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_effective_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (v_effective_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = v_effective_branch_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;


--
-- Name: route_order_to_kds(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.route_order_to_kds(p_order_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $_$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_station_id BIGINT;
  v_fallback_station_id BIGINT;
  v_has_printer_route BOOLEAN := FALSE;
  v_batch_id BIGINT;
  v_send_seq INT;
  v_ticket_seq INT;
  v_order_number_clean TEXT;
  v_order_number_match TEXT[];
  v_ticket_base TEXT;
  v_ticket_number TEXT;
  v_ticket_id BIGINT;
  v_table_no INT;
  v_cashier_name TEXT;
  v_route RECORD;
  v_payload JSONB;
  v_idempotency TEXT;
  v_job_id BIGINT;
BEGIN
  SELECT tenant_id, branch_id, order_number, order_type, note, created_by,
         table_id, kitchen_send_count
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Serialize the per-branch/day kitchen queue sequence across concurrent
  -- orders. The kitchen ticket_seq is derived from kitchen_send_batches
  -- (MAX+1); this advisory lock keeps that derivation atomic without colliding
  -- on the kitchen_send_batches UNIQUE (tenant, branch, counter_date,
  -- ticket_seq) constraint.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'kitchen_send_seq:' || v_order.tenant_id::TEXT || ':' || v_order.branch_id::TEXT,
      0
    )
  );

  SELECT s.id INTO v_fallback_station_id
  FROM public.kds_stations s
  LEFT JOIN public.kds_station_categories sc ON sc.station_id = s.id
  WHERE s.branch_id = v_order.branch_id
    AND s.tenant_id = v_order.tenant_id
    AND s.is_active = TRUE
    AND sc.id IS NULL
  ORDER BY s.position
  LIMIT 1;

  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
    ORDER BY oi.id
  LOOP
    v_station_id := NULL;
    v_has_printer_route := FALSE;

    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = TRUE
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM public.printers p
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND p.role IN ('kitchen_1', 'kitchen_2')
    ) INTO v_has_printer_route;

    IF v_station_id IS NULL AND v_has_printer_route THEN
      CONTINUE;
    END IF;

    IF v_station_id IS NULL THEN
      v_station_id := v_fallback_station_id;
    END IF;

    IF v_station_id IS NOT NULL THEN
      IF v_batch_id IS NULL THEN
        UPDATE public.orders
           SET kitchen_send_count = kitchen_send_count + 1
         WHERE id = p_order_id
         RETURNING kitchen_send_count INTO v_send_seq;

        SELECT COALESCE(MAX(ksb.ticket_seq), 0) + 1
          INTO v_ticket_seq
        FROM public.kitchen_send_batches ksb
        WHERE ksb.tenant_id = v_order.tenant_id
          AND ksb.branch_id = v_order.branch_id
          AND ksb.counter_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

        v_order_number_clean := regexp_replace(
          btrim(COALESCE(v_order.order_number, '')),
          '^#+',
          ''
        );
        v_order_number_match := regexp_match(
          v_order_number_clean,
          '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
          'i'
        );
        v_ticket_base := COALESCE(
          v_order_number_match[1],
          NULLIF(v_order_number_clean, ''),
          p_order_id::TEXT
        );
        v_ticket_number := '#' || v_ticket_base
          || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

        INSERT INTO public.kitchen_send_batches (
          tenant_id, branch_id, order_id, counter_date, ticket_seq,
          kitchen_ticket_number, send_seq, kind, created_by
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          p_order_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          v_ticket_seq,
          v_ticket_number,
          v_send_seq,
          CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
          auth.uid()
        )
        RETURNING id INTO v_batch_id;
      END IF;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        kitchen_send_batch_id
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_station_id,
        p_order_id, v_item.order_item_id, v_batch_id
      )
      ON CONFLICT (order_item_id, station_id, tenant_id) DO NOTHING
      RETURNING id INTO v_ticket_id;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.printers p
        WHERE p.tenant_id = v_order.tenant_id
          AND p.branch_id = v_order.branch_id
          AND p.is_active = TRUE
          AND p.role IN ('kitchen_1', 'kitchen_2')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_station_categories sc
        JOIN public.kds_stations s ON s.id = sc.station_id
        WHERE sc.category_id = mi.category_id
          AND s.branch_id = v_order.branch_id
          AND s.tenant_id = v_order.tenant_id
          AND s.is_active = TRUE
      )
    LIMIT 1
  ) THEN
    IF v_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_send_seq;

      SELECT COALESCE(MAX(ksb.ticket_seq), 0) + 1
        INTO v_ticket_seq
      FROM public.kitchen_send_batches ksb
      WHERE ksb.tenant_id = v_order.tenant_id
        AND ksb.branch_id = v_order.branch_id
        AND ksb.counter_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

      v_order_number_clean := regexp_replace(
        btrim(COALESCE(v_order.order_number, '')),
        '^#+',
        ''
      );
      v_order_number_match := regexp_match(
        v_order_number_clean,
        '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_ticket_number := '#' || v_ticket_base
        || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

      INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_ticket_number,
        v_send_seq,
        CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        auth.uid()
      )
      RETURNING id INTO v_batch_id;
    ELSE
      SELECT kitchen_ticket_number, send_seq
        INTO v_ticket_number, v_send_seq
      FROM public.kitchen_send_batches
      WHERE id = v_batch_id;
    END IF;

    IF v_order.table_id IS NOT NULL THEN
      SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
    END IF;

    SELECT full_name INTO v_cashier_name
    FROM public.profiles WHERE id = v_order.created_by;

    FOR v_route IN
      WITH routed_items AS (
        SELECT
          p.id AS printer_id,
          p.role AS printer_role,
          CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
          oi.id AS order_item_id,
          jsonb_build_object(
            'item_name', oi.item_name,
            'variant_name', oi.variant_name,
            'quantity', oi.quantity,
            'modifiers', oi.modifiers,
            'sides', oi.sides,
            'note', oi.note
          ) AS item_payload
        FROM public.order_items oi
        JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        JOIN public.printers p
          ON p.tenant_id = v_order.tenant_id
         AND p.branch_id = v_order.branch_id
         AND p.is_active = TRUE
         AND p.role IN ('kitchen_1', 'kitchen_2')
        WHERE oi.order_id = p_order_id
          AND oi.sent_to_kitchen_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.tenant_id = v_order.tenant_id
              AND kt.order_item_id = oi.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_station_categories sc
            JOIN public.kds_stations s ON s.id = sc.station_id
            WHERE sc.category_id = mi.category_id
              AND s.branch_id = v_order.branch_id
              AND s.tenant_id = v_order.tenant_id
              AND s.is_active = TRUE
          )
      ),
      grouped_routes AS (
        SELECT
          printer_id,
          printer_role,
          slot,
          array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
          jsonb_agg(item_payload ORDER BY order_item_id) AS items
        FROM routed_items
        GROUP BY printer_id, printer_role, slot
      )
      SELECT *
      FROM grouped_routes
      ORDER BY printer_role, printer_id
    LOOP
      v_job_id := NULL;

      v_payload := jsonb_build_object(
        'kind', 'kitchen_ticket',
        'kitchen_ticket_number', v_ticket_number,
        'source_order_number', v_order.order_number,
        'order_number', v_order.order_number,
        'order_type', v_order.order_type,
        'table_number', v_table_no,
        'cashier_name', COALESCE(v_cashier_name, ''),
        'send_seq', v_send_seq,
        'send_kind', CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        'slot', v_route.slot,
        'note', v_order.note,
        'items', v_route.items,
        'printed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
      );

      v_idempotency := 'order:' || p_order_id::TEXT
        || ':non-kds-dispatch:printer:' || v_route.printer_id::TEXT
        || ':batch:' || v_batch_id::TEXT
        || ':items:' || md5(array_to_string(v_route.item_ids, ','));

      INSERT INTO public.print_jobs (
        tenant_id, branch_id, printer_id, job_type,
        order_id, payload, idempotency_key, created_by
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_route.printer_id,
        'kitchen_ticket', p_order_id, v_payload, v_idempotency, auth.uid()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_job_id;

      IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id
        FROM public.print_jobs
        WHERE idempotency_key = v_idempotency;
      END IF;

      UPDATE public.order_items
         SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
       WHERE id = ANY(v_route.item_ids)
         AND sent_to_kitchen_at IS NULL;
    END LOOP;
  END IF;
END;
$_$;


--
-- Name: FUNCTION route_order_to_kds(p_order_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.route_order_to_kds(p_order_id bigint) IS 'Routes KDS-visible categories to KDS tickets and immediately queues printer-only category slips, such as drinks, at POS dispatch time.';


--
-- Name: save_item_modifiers(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item_modifiers(p_item_id bigint, p_modifiers jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  v_tenant_id BIGINT;
  m JSONB;
  i INT := 0;
BEGIN
  IF p_modifiers IS NULL OR jsonb_typeof(p_modifiers) <> 'array' THEN
    RAISE EXCEPTION 'p_modifiers must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := public.auth_tenant_id();

  PERFORM 1 FROM public.menu_items
    WHERE id = p_item_id AND tenant_id = v_tenant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_item_modifiers
    WHERE item_id = p_item_id AND tenant_id = v_tenant_id;

  FOR m IN SELECT * FROM jsonb_array_elements(p_modifiers)
  LOOP
    INSERT INTO public.menu_item_modifiers (tenant_id, item_id, name, price, sort_order)
    VALUES (
      v_tenant_id,
      p_item_id,
      m ->> 'name',
      (m ->> 'price')::NUMERIC(15,2),
      COALESCE((m ->> 'sort_order')::INT, i)
    );
    i := i + 1;
  END LOOP;
END;
$$;


--
-- Name: save_item_sides(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item_sides(p_main_item_id bigint, p_sides jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  v_tenant_id BIGINT;
  s JSONB;
BEGIN
  IF p_sides IS NULL OR jsonb_typeof(p_sides) <> 'array' THEN
    RAISE EXCEPTION 'p_sides must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := public.auth_tenant_id();

  PERFORM 1 FROM public.menu_items
    WHERE id = p_main_item_id AND tenant_id = v_tenant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_item_available_sides
    WHERE main_item_id = p_main_item_id AND tenant_id = v_tenant_id;

  FOR s IN SELECT * FROM jsonb_array_elements(p_sides)
  LOOP
    INSERT INTO public.menu_item_available_sides (tenant_id, main_item_id, side_item_id, is_default)
    VALUES (
      v_tenant_id,
      p_main_item_id,
      (s ->> 'side_item_id')::BIGINT,
      COALESCE((s ->> 'is_default')::BOOLEAN, false)
    );
  END LOOP;
END;
$$;


--
-- Name: save_item_variants(bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_item_variants(p_item_id bigint, p_variants jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  v_tenant_id BIGINT;
  v JSONB;
  i INT := 0;
BEGIN
  IF p_variants IS NULL OR jsonb_typeof(p_variants) <> 'array' THEN
    RAISE EXCEPTION 'p_variants must be a JSON array' USING ERRCODE = '22023';
  END IF;

  v_tenant_id := public.auth_tenant_id();

  -- Lock parent row to serialize concurrent replace operations
  PERFORM 1 FROM public.menu_items
    WHERE id = p_item_id AND tenant_id = v_tenant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.menu_item_variants
    WHERE item_id = p_item_id AND tenant_id = v_tenant_id;

  FOR v IN SELECT * FROM jsonb_array_elements(p_variants)
  LOOP
    INSERT INTO public.menu_item_variants (tenant_id, item_id, name, price_adjustment, sort_order)
    VALUES (
      v_tenant_id,
      p_item_id,
      v ->> 'name',
      (v ->> 'price_adjustment')::NUMERIC(15,2),
      COALESCE((v ->> 'sort_order')::INT, i)
    );
    i := i + 1;
  END LOOP;
END;
$$;


--
-- Name: save_station_categories(bigint, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_station_categories(p_station_id bigint, p_category_ids bigint[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  v_station RECORD;
  v_distinct_category_count INT;
  v_valid_category_count INT;
BEGIN
  SELECT id, tenant_id, branch_id
    INTO v_station
  FROM public.kds_stations
  WHERE id = p_station_id
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    SELECT COUNT(DISTINCT x.category_id)
      INTO v_distinct_category_count
    FROM unnest(p_category_ids) AS x(category_id)
    WHERE x.category_id IS NOT NULL;

    SELECT COUNT(DISTINCT c.id)
      INTO v_valid_category_count
    FROM public.menu_categories c
    WHERE c.tenant_id = v_station.tenant_id
      AND c.id = ANY(p_category_ids);

    IF v_valid_category_count <> v_distinct_category_count THEN
      RAISE EXCEPTION 'Invalid station category' USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.kds_station_categories
  WHERE station_id = p_station_id
    AND tenant_id = v_station.tenant_id;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    INSERT INTO public.kds_station_categories (tenant_id, station_id, category_id)
    SELECT DISTINCT v_station.tenant_id, p_station_id, x.category_id
    FROM unnest(p_category_ids) AS x(category_id)
    WHERE x.category_id IS NOT NULL
    ON CONFLICT (station_id, category_id, tenant_id) DO NOTHING;
  END IF;
END;
$$;


--
-- Name: scan_inventory_alerts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.scan_inventory_alerts() RETURNS TABLE(low_stock_count bigint, expiry_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_low BIGINT := 0;
  v_exp BIGINT := 0;
  v_today TEXT := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
BEGIN
  -- Low-stock alerts
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta,
      expires_at
    )
    SELECT
      sl.tenant_id,
      sl.branch_id,
      ARRAY['manager', 'owner']::TEXT[],
      'inventory.stock_low',
      'warning',
      format('Tồn kho thấp: %s', ing.name),
      format('Còn %s %s (ngưỡng đặt lại %s)',
        trim(trailing '.0' from sl.current_quantity::text),
        ing.unit,
        trim(trailing '.0' from ing.reorder_point::text)),
      'ingredient',
      ing.id,
      format('/inventory/stock?ingredient=%s&branch=%s', ing.id, sl.branch_id),
      format('stock_low:ingredient:%s:branch:%s:%s', ing.id, sl.branch_id, v_today),
      jsonb_build_object(
        'current_quantity', sl.current_quantity,
        'reorder_point', ing.reorder_point,
        'branch_id', sl.branch_id
      ),
      (now() + interval '7 days')
    FROM public.stock_levels sl
    JOIN public.ingredients ing
      ON ing.id = sl.ingredient_id AND ing.tenant_id = sl.tenant_id
    WHERE ing.reorder_point IS NOT NULL
      AND ing.reorder_point > 0
      AND sl.current_quantity <= ing.reorder_point
      AND ing.is_active = true
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM inserted;

  -- Expiry soon
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta,
      expires_at
    )
    SELECT
      gi.tenant_id,
      g.branch_id,
      ARRAY['manager', 'owner']::TEXT[],
      'inventory.expiry_soon',
      CASE
        WHEN gi.expiry_date <= (now()::date + interval '2 days') THEN 'critical'
        ELSE 'warning'
      END,
      format('Sắp hết hạn: %s', ing.name),
      format('Hạn %s — lô %s (còn %s %s)',
        to_char(gi.expiry_date, 'DD/MM/YYYY'),
        COALESCE(gi.batch_number, '—'),
        trim(trailing '.0' from (gi.received_quantity - gi.rejected_quantity)::text),
        ing.unit),
      'grn_item',
      gi.id,
      format('/inventory/expiry?grn_item=%s', gi.id),
      format('expiry_soon:grn_item:%s:%s', gi.id, v_today),
      jsonb_build_object(
        'expiry_date', gi.expiry_date,
        'batch_number', gi.batch_number,
        'remaining_quantity', gi.received_quantity - gi.rejected_quantity,
        'grn_id', gi.grn_id,
        'branch_id', g.branch_id
      ),
      (gi.expiry_date::timestamptz + interval '1 day')
    FROM public.grn_items gi
    JOIN public.goods_received_notes g
      ON g.id = gi.grn_id AND g.tenant_id = gi.tenant_id
    JOIN public.ingredients ing
      ON ing.id = gi.ingredient_id AND ing.tenant_id = gi.tenant_id
    WHERE gi.expiry_date IS NOT NULL
      AND gi.expiry_date BETWEEN now()::date AND (now()::date + interval '7 days')
      AND (gi.received_quantity - gi.rejected_quantity) > 0
      AND g.status = 'confirmed'
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_exp FROM inserted;

  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < now();

  RETURN QUERY SELECT v_low, v_exp;
END;
$$;


--
-- Name: FUNCTION scan_inventory_alerts(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.scan_inventory_alerts() IS 'Emit inventory.stock_low and inventory.expiry_soon notifications (idempotent per day via dedup_key). Wire to pg_cron.';


--
-- Name: set_branch_kind(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_branch_kind(p_branch_id bigint, p_kind text DEFAULT 'branch'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_tenant   BIGINT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id
  INTO v_tenant
  FROM public.profiles p
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('branch') THEN
    RAISE EXCEPTION 'invalid branch_kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  UPDATE public.branches
  SET branch_kind = p_kind,
      updated_at  = now()
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


--
-- Name: FUNCTION set_branch_kind(p_branch_id bigint, p_kind text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_branch_kind(p_branch_id bigint, p_kind text) IS 'Auth v3 alpha4b: gates tenant branch-kind changes with settings:tenant permission instead of cached JWT auth_role.';


--
-- Name: set_branch_menu_daily_limit(bigint, bigint, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_branch_menu_daily_limit(p_branch_id bigint, p_menu_item_id bigint, p_limit_quantity integer, p_is_disabled boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_row       public.branch_menu_item_daily_limits;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'manager',
                    'staff', 'chef') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('manager', 'staff', 'chef')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_limit_quantity IS NOT NULL AND p_limit_quantity <= 0 THEN
    RAISE EXCEPTION 'limit_quantity must be positive or null' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id
      AND mi.tenant_id = v_tenant_id
      AND mi.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, limit_quantity, is_disabled, sold_today)
  VALUES
    (v_tenant_id, p_branch_id, p_menu_item_id, v_today, p_limit_quantity, p_is_disabled, 0)
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET
    limit_quantity = EXCLUDED.limit_quantity,
    is_disabled    = EXCLUDED.is_disabled,
    updated_at     = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'branch_id', v_row.branch_id,
    'menu_item_id', v_row.menu_item_id,
    'limit_date', v_row.limit_date,
    'limit_quantity', v_row.limit_quantity,
    'is_disabled', v_row.is_disabled,
    'sold_today', v_row.sold_today
  );
END;
$$;


--
-- Name: set_order_service_charge(bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_service_charge(p_order_id bigint, p_amount numeric, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid          UUID;
  v_prof_tenant  BIGINT;
  v_prof_branch  BIGINT;
  v_prof_role    TEXT;
  v_order        RECORD;
  v_note_trim    TEXT;
  v_amount       NUMERIC(15,2);
  v_total_amount NUMERIC(15,2);
  v_has_pending  BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'manager', 'staff')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'service_charge_invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF p_amount > 50000000 THEN
    RAISE EXCEPTION 'service_charge_amount_too_large' USING ERRCODE = '22023';
  END IF;

  v_note_trim := COALESCE(trim(p_note), '');
  IF length(v_note_trim) < 3 THEN
    RAISE EXCEPTION 'service_charge_note_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status,
         o.subtotal, o.tax_amount, o.service_charge, o.discount_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.tenant_id = v_order.tenant_id
      AND p.branch_id = v_order.branch_id
      AND p.status = 'pending'
  )
  INTO v_has_pending;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'pending' OR v_has_pending THEN
    RAISE EXCEPTION 'service_charge_payment_pending' USING ERRCODE = '22023';
  END IF;

  v_amount := ROUND(p_amount::NUMERIC, 2);
  v_total_amount := COALESCE(v_order.subtotal, 0)
                  + COALESCE(v_order.tax_amount, 0)
                  + v_amount
                  - COALESCE(v_order.discount_amount, 0);

  UPDATE public.orders
     SET service_charge = v_amount,
         total_amount   = v_total_amount,
         updated_at     = now()
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE
      WHEN v_amount = 0 THEN 'service_charge_cleared'
      ELSE 'service_charge_set: ' || v_amount::TEXT || 'đ'
    END || ' :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id',       p_order_id,
    'service_charge', v_amount,
    'total_amount',   v_total_amount
  );
END;
$$;


--
-- Name: FUNCTION set_order_service_charge(p_order_id bigint, p_amount numeric, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_order_service_charge(p_order_id bigint, p_amount numeric, p_note text) IS 'Set or clear orders.service_charge before payment. Requires note >=3 chars, blocks paid/terminal/pending-payment orders, recomputes total_amount, and records an order_status_history audit note.';


--
-- Name: set_pos_order_item_priority(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_pos_order_item_priority(p_order_item_id bigint, p_is_priority boolean, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_note TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1
    FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  IF v_item.status NOT IN ('pending', 'preparing') THEN
    RAISE EXCEPTION 'item not prioritizable' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  UPDATE public.order_items
  SET is_priority = COALESCE(p_is_priority, FALSE),
      priority_note = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_note ELSE NULL END,
      priority_marked_at = CASE WHEN COALESCE(p_is_priority, FALSE) THEN now() ELSE NULL END,
      priority_marked_by = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_uid ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET updated_at = now()
  WHERE order_item_id = p_order_item_id
    AND tenant_id = v_item.tenant_id
    AND status IN ('pending', 'preparing');

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    v_order.id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE WHEN COALESCE(p_is_priority, FALSE)
      THEN 'priority_item:on '
      ELSE 'priority_item:off '
    END || p_order_item_id::TEXT || COALESCE(' - ' || v_note, '')
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_item_id', p_order_item_id,
    'is_priority', COALESCE(p_is_priority, FALSE)
  );
END;
$$;


--
-- Name: set_pos_order_priority(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_pos_order_priority(p_order_id bigint, p_is_priority boolean, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order public.orders%ROWTYPE;
  v_active_count INT;
  v_note TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    PERFORM 1
    FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::INT INTO v_active_count
  FROM public.order_items
  WHERE order_id = p_order_id
    AND tenant_id = v_order.tenant_id
    AND status IN ('pending', 'preparing');

  IF v_active_count = 0 THEN
    RAISE EXCEPTION 'no active kitchen work' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(trim(COALESCE(p_note, '')), '');

  UPDATE public.orders
  SET is_priority = COALESCE(p_is_priority, FALSE),
      priority_note = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_note ELSE NULL END,
      priority_marked_at = CASE WHEN COALESCE(p_is_priority, FALSE) THEN now() ELSE NULL END,
      priority_marked_by = CASE WHEN COALESCE(p_is_priority, FALSE) THEN v_uid ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.kds_tickets kt
  SET updated_at = now()
  WHERE kt.order_id = p_order_id
    AND kt.tenant_id = v_order.tenant_id
    AND kt.status IN ('pending', 'preparing');

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id,
    p_order_id,
    v_order.status,
    v_order.status,
    v_uid,
    CASE WHEN COALESCE(p_is_priority, FALSE)
      THEN 'priority_order:on'
      ELSE 'priority_order:off'
    END || COALESCE(' - ' || v_note, '')
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'is_priority', COALESCE(p_is_priority, FALSE)
  );
END;
$$;


--
-- Name: split_order(bigint, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.split_order(p_source_order_id bigint, p_item_partials jsonb, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_active_total_rows    INT;
  v_full_move_count      INT := 0;
  v_total_units_moved    INT := 0;
  v_remaining_rows       INT;
  v_new_order_id         BIGINT;
  v_new_order_number     TEXT;
  v_seq                  INT;
  v_date_part            TEXT;
  v_flag_enabled         TEXT;
  v_existing_id          BIGINT;
  v_existing_number      TEXT;
  v_source_subtotal      NUMERIC(15,2);
  v_source_discount      NUMERIC(15,2);
  v_source_total         NUMERIC(15,2);
  v_new_subtotal         NUMERIC(15,2);
  v_new_total            NUMERIC(15,2);
  v_partial              JSONB;
  v_partial_item_id      BIGINT;
  v_partial_qty          INT;
  v_src_row              public.order_items%ROWTYPE;
  v_new_item_id          BIGINT;
  v_branch_code          TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'manager', 'staff')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_item_partials IS NULL
     OR jsonb_typeof(p_item_partials) <> 'array'
     OR jsonb_array_length(p_item_partials) = 0
  THEN
    RAISE EXCEPTION 'split_no_items' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_existing_id, v_existing_number
      FROM public.orders o
     WHERE o.split_from_order_id = p_source_order_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'new_order_id',     v_existing_id,
        'new_order_number', v_existing_number,
        'idempotent',       true
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(p_source_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
         o.payment_status, o.pos_session_id, o.service_charge,
         o.discount_type, o.discount_value
    INTO v_source
    FROM public.orders o
   WHERE o.id = p_source_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  ELSE
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
  END IF;

  SELECT value INTO v_flag_enabled
    FROM public.system_settings
   WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'split_source_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'split_source_paid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
   WHERE order_id = p_source_order_id AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'split_payment_pending' USING ERRCODE = '22023';
  END IF;

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := NULLIF(v_partial ->> 'item_id', '')::BIGINT;
    v_partial_qty := NULLIF(v_partial ->> 'quantity', '')::INT;

    IF v_partial_item_id IS NULL OR v_partial_qty IS NULL OR v_partial_qty < 1 THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id
       AND order_id = p_source_order_id
       AND status <> 'cancelled'
       FOR UPDATE;

    IF NOT FOUND OR v_partial_qty > v_src_row.quantity THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_partial_qty = v_src_row.quantity THEN
      v_full_move_count := v_full_move_count + 1;
    END IF;

    v_total_units_moved := v_total_units_moved + v_partial_qty;
  END LOOP;

  SELECT COUNT(*) INTO v_active_total_rows
    FROM public.order_items
   WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_remaining_rows := v_active_total_rows - v_full_move_count;
  IF v_remaining_rows < 1 THEN
    RAISE EXCEPTION 'split_would_empty_source' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    v_source.tenant_id,
    v_source.branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD'
  );

  IF v_source.order_type = 'dine_in' THEN
    v_new_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_new_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_new_order_number := v_new_order_number || '-' || v_branch_code;
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    status, subtotal, total_amount, customer_count, note, created_by,
    pos_session_id, idempotency_key, split_from_order_id
  )
  VALUES (
    v_source.tenant_id, v_source.branch_id, v_source.table_id,
    v_new_order_number, v_source.order_type,
    v_source.status,
    0, 0, 1, NULL, v_uid,
    v_source.pos_session_id, p_idempotency_key, p_source_order_id
  )
  RETURNING id INTO v_new_order_id;

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := (v_partial ->> 'item_id')::BIGINT;
    v_partial_qty := (v_partial ->> 'quantity')::INT;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id;

    IF v_partial_qty = v_src_row.quantity THEN
      UPDATE public.order_items
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE id = v_partial_item_id
         AND order_id = p_source_order_id;

      UPDATE public.kds_tickets
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE order_item_id = v_partial_item_id
         AND order_id = p_source_order_id;
    ELSE
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
      INSERT INTO public.order_items (
        tenant_id, order_id, menu_item_id, variant_id,
        item_name, variant_name, quantity, unit_price,
        modifiers, sides, subtotal, note, status,
        sent_to_kitchen_at
      )
      VALUES (
        v_src_row.tenant_id, v_new_order_id,
        v_src_row.menu_item_id, v_src_row.variant_id,
        v_src_row.item_name, v_src_row.variant_name,
        v_partial_qty, v_src_row.unit_price,
        v_src_row.modifiers, v_src_row.sides,
        v_src_row.unit_price * v_partial_qty,
        v_src_row.note, v_src_row.status,
        v_src_row.sent_to_kitchen_at
      )
      RETURNING id INTO v_new_item_id;
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

      UPDATE public.order_items
         SET quantity   = v_src_row.quantity - v_partial_qty,
             subtotal   = v_src_row.unit_price * (v_src_row.quantity - v_partial_qty),
             updated_at = now()
       WHERE id = v_partial_item_id;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        status, bumped_at, bumped_by, created_at
      )
      SELECT
        kt.tenant_id, kt.branch_id, kt.station_id,
        v_new_order_id, v_new_item_id,
        kt.status, kt.bumped_at, kt.bumped_by, kt.created_at
      FROM public.kds_tickets kt
      WHERE kt.order_item_id = v_partial_item_id
        AND kt.order_id = p_source_order_id;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_source_subtotal
    FROM public.order_items
   WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_source_discount := public.compute_discount_amount(
    v_source.discount_type, v_source.discount_value, v_source_subtotal
  );

  v_source_total := v_source_subtotal
                  + COALESCE(v_source.service_charge, 0)
                  - v_source_discount;

  UPDATE public.orders
     SET subtotal        = v_source_subtotal,
         discount_amount = v_source_discount,
         total_amount    = v_source_total,
         updated_at      = now()
   WHERE id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
    FROM public.order_items
   WHERE order_id = v_new_order_id AND status <> 'cancelled';

  v_new_total := v_new_subtotal;

  UPDATE public.orders
     SET subtotal     = v_new_subtotal,
         total_amount = v_new_total,
         updated_at   = now()
   WHERE id = v_new_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, v_source.status, v_uid,
     'split_to: ' || v_new_order_number
       || ' (moved ' || v_total_units_moved::TEXT || ' units across '
       || jsonb_array_length(p_item_partials)::TEXT || ' lines)'),
    (v_source.tenant_id, v_new_order_id, NULL, v_source.status, v_uid,
     'split_from: order#' || p_source_order_id::TEXT);

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'new_order_id',     v_new_order_id,
    'new_order_number', v_new_order_number,
    'moved_count',      v_total_units_moved,
    'source_subtotal',  v_source_subtotal,
    'source_total',     v_source_total,
    'new_subtotal',     v_new_subtotal,
    'new_total',        v_new_total
  );
END;
$$;


--
-- Name: FUNCTION split_order(p_source_order_id bigint, p_item_partials jsonb, p_idempotency_key uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.split_order(p_source_order_id bigint, p_item_partials jsonb, p_idempotency_key uuid) IS 'Tách hoá đơn — partials [{item_id, quantity}]. quantity == row.quantity → in-place UPDATE order_id; quantity < row.quantity → INSERT clone trên đơn mới + giảm qty source + mirror kds_tickets per station. Source phải giữ ≥1 active ROW sau move (block split_would_empty_source). Đơn mới: discount=0, service_charge=0, status inherit từ source. Idempotent qua p_idempotency_key. Clone INSERT bypass enforce_branch_menu_daily_limit qua GUC comtammatu.skip_quota_enforcement (net qty unchanged). Counter mint dùng schema (tenant,branch,date) — chia chung pool với create_order.';


--
-- Name: start_stocktake(bigint, bigint, text, boolean, uuid, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_stocktake(p_branch_id bigint, p_mode text DEFAULT 'daily'::text, p_blind_mode boolean DEFAULT NULL::boolean, p_auditor_id uuid DEFAULT NULL::uuid, p_threshold_pct numeric DEFAULT NULL::numeric, p_threshold_vnd numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_tenant BIGINT; v_blind BOOLEAN;
  v_session BIGINT; v_is_unaud BOOLEAN := false; v_rows INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('daily','weekly','monthly','quarterly','spot') THEN RAISE EXCEPTION 'invalid mode' USING ERRCODE = '22023'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;
  v_blind := COALESCE(p_blind_mode, CASE p_mode
    WHEN 'daily' THEN false WHEN 'weekly' THEN false
    WHEN 'monthly' THEN true WHEN 'quarterly' THEN true WHEN 'spot' THEN true END);
  IF p_mode IN ('monthly','quarterly') AND p_auditor_id IS NULL THEN v_is_unaud := true; END IF;
  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, status, started_at, created_by,
    mode, blind_mode, auditor_id, is_unaudited, variance_threshold_pct, variance_threshold_vnd,
    abc_snapshot_at, current_round)
  VALUES (v_tenant, p_branch_id, 'in_progress', now(), v_uid, p_mode, v_blind,
    p_auditor_id, v_is_unaud, COALESCE(p_threshold_pct, 5.00), COALESCE(p_threshold_vnd, 200000), now(), 1)
  RETURNING id INTO v_session;
  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity, round_no, abc_class)
  SELECT v_tenant, v_session, sl.ingredient_id, COALESCE(sl.current_quantity, 0), 1,
    NULL::character(1)  -- V11: ABC classification dropped; abc_class seeded NULL
  FROM public.stock_levels sl JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  WHERE sl.branch_id = p_branch_id AND sl.tenant_id = v_tenant AND ing.is_active = true;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('session_id', v_session, 'mode', p_mode, 'blind_mode', v_blind,
    'is_unaudited', v_is_unaud, 'seeded_lines', v_rows, 'abc_snapshot_at', now());
END; $$;


--
-- Name: stock_issue_items_reason_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_issue_items_reason_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF OLD.reason_code IS NOT NULL AND NEW.reason_code IS DISTINCT FROM OLD.reason_code THEN
    RAISE EXCEPTION 'reason_code is immutable once set (got % -> %)', OLD.reason_code, NEW.reason_code USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: stock_transfer_list_branches(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_transfer_list_branches() RETURNS TABLE(id bigint, name text, branch_kind text, is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT b.id, b.name, b.branch_kind, b.is_active
  FROM public.branches b
  WHERE b.tenant_id = public.auth_tenant_id()
    AND b.is_active = true
    AND public.auth_role() IN (
      'owner',
      'manager',
      'staff'
    )
  ORDER BY b.name;
$$;


--
-- Name: submit_count_round(bigint, smallint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_count_round(p_session_id bigint, p_round_no smallint, p_counts jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD; v_count JSONB; v_applied INT := 0;
  v_ingredient BIGINT; v_counted NUMERIC; v_op_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ss.status <> 'in_progress' THEN RAISE EXCEPTION 'session not in_progress (status=%)', v_ss.status USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_round_no <> v_ss.current_round THEN RAISE EXCEPTION 'round % does not match current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023'; END IF;
  -- V17: offline conflict detection CUT. Plain count apply.
  FOR v_count IN SELECT value FROM jsonb_array_elements(p_counts) LOOP
    v_ingredient := (v_count->>'ingredient_id')::BIGINT;
    v_counted    := (v_count->>'counted_quantity')::NUMERIC;
    v_op_id      := NULLIF(v_count->>'client_op_id','')::UUID;
    INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity,
      counted_quantity, counted_by, counted_at, round_no, abc_class, client_op_id)
    SELECT v_ss.tenant_id, p_session_id, v_ingredient,
      (SELECT system_quantity FROM public.stocktake_lines WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = 1),
      v_counted, v_uid, now(), p_round_no,
      (SELECT abc_class FROM public.stocktake_lines WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = 1),
      v_op_id
    ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE SET
      counted_quantity = EXCLUDED.counted_quantity, counted_by = EXCLUDED.counted_by, counted_at = EXCLUDED.counted_at,
      client_op_id = COALESCE(EXCLUDED.client_op_id, public.stocktake_lines.client_op_id);
    v_applied := v_applied + 1;
  END LOOP;
  RETURN jsonb_build_object('applied_count', v_applied, 'conflict_count', 0, 'round_no', p_round_no);
END; $$;


--
-- Name: sync_order_item_status_from_kds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_order_item_status_from_kds() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.order_items oi
    SET
      status = CASE
        WHEN NEW.status = 'cancelled' THEN 'cancelled'::text
        ELSE NEW.status::text
      END,
      updated_at = now()
    WHERE oi.id = NEW.order_item_id
      AND oi.tenant_id = NEW.tenant_id
      AND oi.status <> 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: tio_assert_one_active_summary_per_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tio_assert_one_active_summary_per_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tax_invoice_orders tio
    JOIN public.tax_invoices ti ON ti.id = tio.tax_invoice_id
    WHERE tio.order_id = NEW.order_id
      AND tio.tax_invoice_id <> NEW.tax_invoice_id
      AND ti.status NOT IN ('cancelled', 'replaced')
  ) THEN
    RAISE EXCEPTION 'order % already in active summary HĐ', NEW.order_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: toggle_category_active(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_category_active(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  UPDATE public.menu_categories
    SET is_active = NOT is_active
    WHERE id = p_id AND tenant_id = public.auth_tenant_id()
    RETURNING is_active INTO new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN new_state;
END;
$$;


--
-- Name: toggle_ingredient_active(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_ingredient_active(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  UPDATE public.ingredients
    SET is_active = NOT is_active,
        updated_at = now()
    WHERE id = p_id
      AND tenant_id = public.auth_tenant_id()
    RETURNING is_active INTO new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN new_state;
END;
$$;


--
-- Name: toggle_item_active(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_item_active(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
DECLARE
  new_state BOOLEAN;
BEGIN
  UPDATE public.menu_items
    SET is_active = NOT is_active
    WHERE id = p_id AND tenant_id = public.auth_tenant_id()
    RETURNING is_active INTO new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN new_state;
END;
$$;


--
-- Name: toggle_profile_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_profile_active(p_target_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_actor_role    TEXT;
  v_actor_tenant  BIGINT;
  v_actor_branch  BIGINT;
  v_target_role   TEXT;
  v_target_branch BIGINT;
  v_target_active BOOLEAN;
  v_new_state     BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned') AS role_text,
    p.tenant_id,
    p.branch_id
  INTO v_actor_role, v_actor_tenant, v_actor_branch
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned'),
         p.branch_id,
         p.is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles p
    JOIN public.positions po ON po.id = p.position_id
    WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;

  -- 4-role collapse: owner unrestricted; managers may toggle anyone except
  -- the owner (entry gated by staff:manage perm-key, the authoritative check).
  IF v_actor_role = 'owner' THEN
    NULL;
  ELSIF v_actor_role = 'manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;


--
-- Name: FUNCTION toggle_profile_active(p_target_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.toggle_profile_active(p_target_id uuid) IS 'Staff active-state toggle RPC. SECURITY DEFINER with staff:manage gate; role hierarchy derives from positions.code.';


--
-- Name: transfer_order_table(bigint, bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_order_table(p_order_id bigint, p_new_table_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_new_table RECORD;
  v_old_table_id BIGINT;
  v_active_on_old INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, table_id, order_type, status,
         last_transfer_idempotency_key
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: same key as the last completed transfer on this
  -- order. Returns the order's CURRENT table (post-prior-transfer) with
  -- an `idempotent: true` marker so the action layer can suppress a
  -- duplicate audit toast if it wants. Note this is a per-order replay
  -- check, not a global key-uniqueness check — keys are minted client-
  -- side per click, so a different click on the same order overwrites.
  IF p_idempotency_key IS NOT NULL
     AND v_order.last_transfer_idempotency_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'table_id', v_order.table_id,
      'idempotent', true
    );
  END IF;

  IF v_order.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'takeaway cannot transfer' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_new_table
  FROM public.tables
  WHERE id = p_new_table_id AND branch_id = v_order.branch_id AND tenant_id = v_order.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_new_table_id = v_order.table_id THEN
    -- Same-table no-op: still record the key so a retry of the same
    -- intent collapses cleanly on subsequent calls.
    UPDATE public.orders
    SET last_transfer_idempotency_key = COALESCE(p_idempotency_key, last_transfer_idempotency_key),
        updated_at = now()
    WHERE id = p_order_id;
    RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
  END IF;

  -- Multi-order-per-table alignment: target may be available OR occupied.
  -- Reserved / maintenance still block — those signal bàn is intentionally
  -- unavailable for service.
  IF v_new_table.status NOT IN ('available', 'occupied') THEN
    RAISE EXCEPTION 'table not available' USING ERRCODE = '22023';
  END IF;

  v_old_table_id := v_order.table_id;

  UPDATE public.orders
  SET table_id = p_new_table_id,
      last_transfer_idempotency_key = p_idempotency_key,
      updated_at = now()
  WHERE id = p_order_id;

  -- Idempotent: if target was already occupied, this is a no-op; the bàn
  -- continues to host its prior order(s) plus the freshly transferred one.
  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id AND tenant_id = v_order.tenant_id;

  IF v_old_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_active_on_old
    FROM public.orders
    WHERE table_id = v_old_table_id
      AND tenant_id = v_order.tenant_id
      AND id <> p_order_id
      AND status NOT IN ('completed', 'cancelled', 'served');

    IF v_active_on_old = 0 THEN
      UPDATE public.tables
      SET status = 'available', updated_at = now()
      WHERE id = v_old_table_id AND tenant_id = v_order.tenant_id;
    END IF;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'transfer_table -> ' || p_new_table_id::text
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'table_id', p_new_table_id);
END;
$$;


--
-- Name: transition_order_item_status(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_order_item_status(p_item_id bigint, p_new_status text, p_expected_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_item RECORD;
  v_order RECORD;
  v_derived_status TEXT;
  v_old_order_status TEXT;
  v_pending_count INT;
  v_preparing_count INT;
  v_ready_count INT;
  v_served_count INT;
  v_cancelled_count INT;
  v_total_count INT;
BEGIN
  -- Auth context
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Validate new_status
  IF p_new_status NOT IN ('pending', 'preparing', 'ready', 'served', 'cancelled') THEN
    RAISE EXCEPTION 'invalid item status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  -- Fetch and lock item + parent order
  SELECT oi.id, oi.order_id, oi.tenant_id, oi.status AS item_status
  INTO v_item
  FROM public.order_items oi
  WHERE oi.id = p_item_id
    AND oi.tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fetch parent order for branch check
  SELECT o.id, o.branch_id, o.status, o.table_id, o.order_type, o.tenant_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_item.order_id
  FOR UPDATE;

  -- Branch authorization (ops roles must be in same branch, managers bypass)
  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  -- Optimistic locking: verify expected status
  IF v_item.item_status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %', v_item.item_status, p_expected_status, v_item.item_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate transition
  IF NOT (
    (p_expected_status = 'pending' AND p_new_status IN ('preparing', 'cancelled'))
    OR (p_expected_status = 'preparing' AND p_new_status IN ('ready', 'cancelled'))
    OR (p_expected_status = 'ready' AND p_new_status = 'served')
    -- Allow served → cancelled for post-serve void (manager action)
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %', p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  -- Apply item status change
  UPDATE public.order_items
  SET status = p_new_status, updated_at = now()
  WHERE id = p_item_id;

  -- ── Derive order status from sibling items ──
  v_old_order_status := v_order.status;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE status = 'preparing') AS preparing_count,
    COUNT(*) FILTER (WHERE status = 'ready') AS ready_count,
    COUNT(*) FILTER (WHERE status = 'served') AS served_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COUNT(*) AS total_count
  INTO v_pending_count, v_preparing_count, v_ready_count, v_served_count, v_cancelled_count, v_total_count
  FROM public.order_items
  WHERE order_id = v_item.order_id;

  -- Derive new order status
  IF v_cancelled_count = v_total_count THEN
    v_derived_status := 'cancelled';
  ELSIF v_served_count + v_cancelled_count = v_total_count THEN
    v_derived_status := 'served';
  ELSIF v_ready_count + v_served_count + v_cancelled_count = v_total_count THEN
    v_derived_status := 'ready';
  ELSIF v_preparing_count > 0 OR v_ready_count > 0 THEN
    v_derived_status := 'preparing';
  ELSE
    v_derived_status := v_old_order_status; -- no change
  END IF;

  -- Update order status if changed
  IF v_derived_status <> v_old_order_status
     AND v_old_order_status NOT IN ('completed') -- never override completed
  THEN
    UPDATE public.orders
    SET status = v_derived_status, updated_at = now()
    WHERE id = v_item.order_id;

    -- Write audit trail for order transition
    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    ) VALUES (
      v_actor_tenant, v_item.order_id, v_old_order_status, v_derived_status,
      v_actor_id, 'derived from item ' || p_item_id || ' → ' || p_new_status
    );

    -- Table release handled by existing trigger trg_order_release_table
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'item_status', p_new_status,
    'order_id', v_item.order_id,
    'order_status', v_derived_status,
    'order_status_changed', v_derived_status <> v_old_order_status
  );
END;
$$;


--
-- Name: transition_order_status(bigint, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_order_status(p_order_id bigint, p_new_status text, p_expected_status text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_order RECORD;
BEGIN
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, table_id, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  IF v_order.status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %', v_order.status, p_expected_status, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (p_expected_status = 'new' AND p_new_status = 'confirmed')
    OR (p_expected_status = 'served' AND p_new_status = 'completed')
    OR (p_expected_status NOT IN ('completed') AND p_new_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %', p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_actor_tenant, p_order_id, v_order.status, p_new_status, v_actor_id, p_note
  );

  IF p_new_status = 'cancelled' THEN
    UPDATE public.order_items
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = p_order_id
      AND status NOT IN ('served', 'cancelled');
  END IF;

  -- consume_stock removed (không trừ kho).

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_order.status,
    'new_status', p_new_status
  );
END;
$$;


--
-- Name: transition_tax_invoice_state(bigint, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_tax_invoice_state(p_tax_invoice_id bigint, p_to_status text, p_payload jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice  RECORD;
  v_uid      UUID := auth.uid();
  v_allowed  BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_to_status IN ('cancelled', 'replaced') THEN
    IF NOT public.has_permission_any('settings:tenant') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission_any('orders:write') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_allowed := (
    (v_invoice.status = 'draft'     AND p_to_status IN ('signing', 'cancelled'))
    OR (v_invoice.status = 'signing'   AND p_to_status IN ('submitted', 'issued', 'draft', 'cancelled'))
    OR (v_invoice.status = 'submitted' AND p_to_status IN ('issued', 'cancelled'))
    OR (v_invoice.status = 'issued'    AND p_to_status IN ('cancelled', 'replaced'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal_transition: % -> %', v_invoice.status, p_to_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'issued' THEN now() ELSE issued_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    signing_started_at = CASE WHEN p_to_status = 'signing' THEN now() ELSE signing_started_at END,
    provider_data = CASE
      WHEN p_payload IS NULL THEN provider_data
      ELSE COALESCE(provider_data, '{}'::JSONB) || jsonb_build_object(p_to_status, p_payload)
    END,
    updated_at = now()
  WHERE id = p_tax_invoice_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
  VALUES
    (p_tax_invoice_id, v_invoice.tenant_id, v_invoice.status, p_to_status, v_uid, p_payload, p_note);

  RETURN jsonb_build_object(
    'tax_invoice_id', p_tax_invoice_id,
    'from_status', v_invoice.status,
    'to_status', p_to_status
  );
END;
$$;


--
-- Name: transition_tax_invoice_state_as_system(bigint, text, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_tax_invoice_state_as_system(p_tax_invoice_id bigint, p_to_status text, p_actor uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_invoice RECORD;
  v_allowed BOOLEAN := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_allowed := (
    (v_invoice.status = 'draft'     AND p_to_status IN ('signing', 'cancelled'))
    OR (v_invoice.status = 'signing'   AND p_to_status IN ('submitted', 'issued', 'draft', 'cancelled'))
    OR (v_invoice.status = 'submitted' AND p_to_status IN ('issued', 'cancelled'))
    OR (v_invoice.status = 'issued'    AND p_to_status IN ('cancelled', 'replaced'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal_transition: % -> %', v_invoice.status, p_to_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'issued'    THEN now() ELSE issued_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    signing_started_at = CASE WHEN p_to_status = 'signing'   THEN now() ELSE signing_started_at END,
    provider_data = CASE
      WHEN p_payload IS NULL THEN provider_data
      WHEN provider_data IS NULL THEN p_payload
      ELSE provider_data || p_payload
    END,
    updated_at = now()
  WHERE id = p_tax_invoice_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
  VALUES
    (p_tax_invoice_id, v_invoice.tenant_id, v_invoice.status, p_to_status, p_actor, p_payload, p_note);

  RETURN jsonb_build_object(
    'tax_invoice_id', p_tax_invoice_id,
    'from_status', v_invoice.status,
    'to_status', p_to_status,
    'actor', p_actor
  );
END;
$$;


--
-- Name: FUNCTION transition_tax_invoice_state_as_system(p_tax_invoice_id bigint, p_to_status text, p_actor uuid, p_payload jsonb, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.transition_tax_invoice_state_as_system(p_tax_invoice_id bigint, p_to_status text, p_actor uuid, p_payload jsonb, p_note text) IS 'Service-role-only overload of transition_tax_invoice_state. Use from cron routes that need to drive HĐĐT state machine without auth.uid(). Per D1 owner decision 2026-05-08.';


--
-- Name: trg_notify_grn_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_grn_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['manager', 'owner']::TEXT[],
      'workflow.grn_pending',
      'info',
      format('GRN %s đang chờ chốt', NEW.grn_number),
      'Kiểm tra số lượng, giá, ảnh chứng từ rồi chốt nhập kho',
      'grn',
      NEW.id,
      format('/inventory/grn/%s', NEW.id),
      jsonb_build_object('grn_number', NEW.grn_number, 'po_id', NEW.po_id)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_notify_order_new(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_order_new() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles,
    kind, severity, title, body,
    entity_type, entity_id, action_url, meta
  )
  VALUES (
    NEW.tenant_id,
    NEW.branch_id,
    ARRAY['staff', 'manager']::TEXT[],
    'pos.order_new',
    'info',
    format('Đơn mới #%s', NEW.order_number),
    CASE
      WHEN NEW.table_id IS NOT NULL THEN format('Bàn %s', NEW.table_id)
      WHEN NEW.order_type = 'takeaway' THEN 'Mang về'
      ELSE NULL
    END,
    'order',
    NEW.id,
    format('/br/%s/pos?order=%s', NEW.branch_id, NEW.id),
    jsonb_build_object(
      'order_number', NEW.order_number,
      'order_type', NEW.order_type,
      'table_id', NEW.table_id
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: trg_notify_po_sent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_po_sent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['manager', 'owner']::TEXT[],
      'workflow.po_sent',
      'info',
      format('PO %s đã gửi NCC', NEW.po_number),
      'Chờ nhập hàng / đối soát GRN khi NCC giao',
      'purchase_order',
      NEW.id,
      format('/inventory/purchase-orders/%s', NEW.id),
      jsonb_build_object('po_number', NEW.po_number)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_notify_pos_shift_variance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_pos_shift_variance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_threshold NUMERIC(15,2);
  v_severity TEXT;
  v_cashier_name TEXT;
  v_diff_label TEXT;
  v_diff_amount TEXT;
BEGIN
  -- Fire chỉ khi đang flip từ open → closed (đảm bảo không trigger lại
  -- bởi correction/audit UPDATE sau đó).
  IF NEW.status = 'closed'
     AND OLD.status = 'open'
     AND NEW.cash_difference IS NOT NULL
     AND NEW.expected_cash IS NOT NULL THEN

    v_threshold := GREATEST(
      50000::NUMERIC,
      ROUND(COALESCE(NEW.expected_cash, 0) * 0.005, 2)
    );

    IF abs(NEW.cash_difference) > v_threshold THEN
      -- Severity: critical nếu vượt 5× threshold (lệch nghiêm trọng,
      -- thường là sót đơn hoặc rút quỹ trộm), warning ngược lại.
      v_severity := CASE
        WHEN abs(NEW.cash_difference) > v_threshold * 5 THEN 'critical'
        ELSE 'warning'
      END;

      SELECT full_name INTO v_cashier_name
      FROM public.profiles WHERE id = NEW.closed_by;

      v_diff_label := CASE
        WHEN NEW.cash_difference > 0 THEN 'thừa'
        ELSE 'thiếu'
      END;
      v_diff_amount := to_char(abs(NEW.cash_difference), 'FM999G999G999');

      INSERT INTO public.notifications (
        tenant_id, target_branch_id, target_roles,
        kind, severity, title, body,
        entity_type, entity_id, action_url, meta,
        dedup_key
      )
      VALUES (
        NEW.tenant_id,
        NEW.branch_id,
        ARRAY['manager', 'owner']::TEXT[],
        'pos.shift_variance',
        v_severity,
        format('Lệch quỹ ca #%s: %s %sđ', NEW.id, v_diff_label, v_diff_amount),
        format(
          '%s đóng ca lúc %s. Két thực %sđ — kỳ vọng %sđ. Ngưỡng cảnh báo %sđ.',
          COALESCE(v_cashier_name, 'Thu ngân'),
          to_char(NEW.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                  'HH24:MI DD/MM'),
          to_char(COALESCE(NEW.closing_cash, 0), 'FM999G999G999'),
          to_char(NEW.expected_cash, 'FM999G999G999'),
          to_char(v_threshold, 'FM999G999G999')
        ),
        'pos_session',
        NEW.id,
        format('/br/%s/settings/pos-sessions?session=%s',
               NEW.branch_id, NEW.id),
        jsonb_build_object(
          'session_id',         NEW.id,
          'cashier_name',       v_cashier_name,
          'opening_cash',       NEW.opening_cash,
          'closing_cash',       NEW.closing_cash,
          'expected_cash',      NEW.expected_cash,
          'cash_difference',    NEW.cash_difference,
          'variance_threshold', v_threshold,
          'variance_note',      NEW.variance_approval_note
        ),
        -- Dedup per session: re-close (impossible by design but defensive)
        -- doesn't double-notify.
        format('pos.shift_variance:%s', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_notify_pos_shift_variance(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_notify_pos_shift_variance() IS 'D8 (2026-04-27): emit pos.shift_variance notification khi cashier đóng ca với |cash_difference| > max(50k, 0.5%% × expected_cash). Severity critical nếu > 5× threshold (~lệch nghiêm trọng), warning ngược lại. Dedup per session_id chống re-fire.';


--
-- Name: trg_notify_stocktake_completed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_stocktake_completed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['manager', 'owner']::TEXT[],
      'workflow.stocktake_submitted',
      'warning',
      format('Kiểm kê #%s đã nộp', NEW.id),
      'Xem chênh lệch và điều chỉnh tồn kho',
      'stocktake',
      NEW.id,
      format('/inventory/stocktake/%s', NEW.id),
      jsonb_build_object('branch_id', NEW.branch_id)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_notify_transfer_in_transit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notify_transfer_in_transit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('in_transit', 'shipped', 'confirmed_ship')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.to_branch_id,
      ARRAY['manager', 'owner']::TEXT[],
      'workflow.transfer_in_transit',
      'info',
      format('Chuyển kho %s đang về', NEW.transfer_number),
      'Chuẩn bị nhận hàng từ chi nhánh đối ứng',
      'stock_transfer',
      NEW.id,
      format('/inventory/transfers/%s', NEW.id),
      jsonb_build_object(
        'transfer_number', NEW.transfer_number,
        'from_branch_id', NEW.from_branch_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_release_table_on_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_release_table_on_order_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_table_id BIGINT;
  v_active_count INT;
BEGIN
  -- Only care about dine-in orders with a table.
  IF NEW.table_id IS NULL OR NEW.order_type <> 'dine_in' THEN
    RETURN NEW;
  END IF;

  -- Only POS-terminal statuses release the table. `served` is fulfillment-only.
  IF NEW.status NOT IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_table_id := NEW.table_id;

  SELECT COUNT(*) INTO v_active_count
  FROM public.orders
  WHERE table_id = v_table_id
    AND tenant_id = NEW.tenant_id
    AND id <> NEW.id
    AND status NOT IN ('completed', 'cancelled');

  IF v_active_count = 0 THEN
    UPDATE public.tables
    SET status = 'available'
    WHERE id = v_table_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION trg_release_table_on_order_status(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.trg_release_table_on_order_status() IS 'Releases dine-in tables only when POS order is completed/cancelled. `served` is fulfillment-only and must not free the table before payment close.';


--
-- Name: trg_update_stock_on_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_update_stock_on_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, current_quantity
  )
  VALUES (
    NEW.tenant_id, NEW.branch_id, NEW.ingredient_id, NEW.quantity_change
  )
  ON CONFLICT (ingredient_id, branch_id, tenant_id)
  DO UPDATE SET
    current_quantity = public.stock_levels.current_quantity + NEW.quantity_change,
    updated_at = now();

  IF NEW.type = 'count_adjustment' THEN
    UPDATE public.stock_levels
    SET last_counted_at = now()
    WHERE ingredient_id = NEW.ingredient_id
      AND branch_id     = NEW.branch_id
      AND tenant_id     = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_ingredient_thresholds_bulk(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ingredient_thresholds_bulk(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id      BIGINT := public.auth_tenant_id();
  v_user_id        UUID   := auth.uid();
  v_count          INTEGER := 0;
  v_request_count  INTEGER := 0;
  v_delta          JSONB := '[]'::jsonb;
  v_row            RECORD;
  v_payload_item   JSONB;
  v_id             BIGINT;
  v_min            NUMERIC(15,3);
  v_max            NUMERIC(15,3);
  v_reorder        NUMERIC(15,3);
  v_before         JSONB;
  v_after          JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'thresholds.bulk: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'thresholds.bulk: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_payload) <> 'array' THEN
    RAISE EXCEPTION 'thresholds.bulk: payload must be array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_request_count := jsonb_array_length(p_payload);
  IF v_request_count = 0 THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;
  IF v_request_count > 500 THEN
    RAISE EXCEPTION 'thresholds.bulk: max 500 items per call (got %)',
      v_request_count
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_payload_item IN
    SELECT * FROM jsonb_array_elements(p_payload)
  LOOP
    v_id := (v_payload_item->>'id')::BIGINT;
    IF v_id IS NULL OR v_id <= 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: invalid id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_min := NULLIF(v_payload_item->>'min_stock_level', '')::NUMERIC(15,3);
    v_max := NULLIF(v_payload_item->>'max_stock_level', '')::NUMERIC(15,3);
    v_reorder := NULLIF(v_payload_item->>'reorder_point', '')::NUMERIC(15,3);

    IF v_min IS NOT NULL AND v_min < 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: min < 0 for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_max IS NOT NULL AND v_max < 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: max < 0 for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_reorder IS NOT NULL AND v_reorder < 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: reorder < 0 for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_min IS NOT NULL AND v_reorder IS NOT NULL AND v_min > v_reorder THEN
      RAISE EXCEPTION 'thresholds.bulk: min > reorder for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_reorder IS NOT NULL AND v_max IS NOT NULL AND v_reorder > v_max THEN
      RAISE EXCEPTION 'thresholds.bulk: reorder > max for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
      RAISE EXCEPTION 'thresholds.bulk: min > max for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT id, min_stock_level, max_stock_level, reorder_point
      INTO v_row
      FROM public.ingredients
     WHERE id = v_id
       AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'thresholds.bulk: ingredient % not in tenant scope', v_id
        USING ERRCODE = 'no_data_found';
    END IF;

    v_before := jsonb_build_object(
      'min_stock_level', v_row.min_stock_level,
      'max_stock_level', v_row.max_stock_level,
      'reorder_point',   v_row.reorder_point
    );
    v_after := jsonb_build_object(
      'min_stock_level', COALESCE(v_min, v_row.min_stock_level),
      'max_stock_level', CASE
        WHEN v_payload_item ? 'max_stock_level' THEN v_max
        ELSE v_row.max_stock_level
      END,
      'reorder_point', CASE
        WHEN v_payload_item ? 'reorder_point' THEN v_reorder
        ELSE v_row.reorder_point
      END
    );

    IF v_before = v_after THEN
      CONTINUE;
    END IF;

    UPDATE public.ingredients
       SET min_stock_level = (v_after->>'min_stock_level')::NUMERIC(15,3),
           max_stock_level = NULLIF(v_after->>'max_stock_level', '')::NUMERIC(15,3),
           reorder_point   = NULLIF(v_after->>'reorder_point', '')::NUMERIC(15,3),
           updated_at      = now()
     WHERE id = v_id
       AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'thresholds.bulk: write blocked for id % (RLS or revoked)', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_count := v_count + 1;
    v_delta := v_delta || jsonb_build_object(
      'id',     v_id,
      'before', v_before,
      'after',  v_after
    );
  END LOOP;

  IF v_count > 0 THEN
    PERFORM public.log_audit(
      'inventory.thresholds.bulk_update',
      'ingredient',
      NULL,
      NULL,
      jsonb_build_object('updated', v_count, 'items', v_delta)
    );
  END IF;

  RETURN jsonb_build_object(
    'updated', v_count,
    'requested', v_request_count
  );
END;
$$;


--
-- Name: FUNCTION update_ingredient_thresholds_bulk(p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_ingredient_thresholds_bulk(p_payload jsonb) IS 'Bulk-update min/max/reorder on ingredients within the callers tenant. Validates min <= reorder <= max per row, skips no-ops, raises on RLS denial, and writes one audit_logs row capturing the full delta. Sprint 2 PP3-A.';


--
-- Name: update_my_dependents_count(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_dependents_count(p_count integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_emp_id    BIGINT;
  v_old       INTEGER;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'update_my_dependents_count: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_count IS NULL OR p_count < 0 OR p_count > 20 THEN
    RAISE EXCEPTION 'update_my_dependents_count: invalid count'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, dependents_count INTO v_emp_id, v_old
  FROM public.employees
  WHERE profile_id = v_user_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'update_my_dependents_count: no active employee record'
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.employees
  SET dependents_count = p_count,
      updated_at = now()
  WHERE id = v_emp_id;

  PERFORM public.log_audit(
    'update'::TEXT,
    'employee'::TEXT,
    v_emp_id,
    jsonb_build_object('dependents_count', v_old),
    jsonb_build_object('dependents_count', p_count, 'self_service', true)
  );
END;
$$;


--
-- Name: FUNCTION update_my_dependents_count(p_count integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_my_dependents_count(p_count integer) IS 'Self-service: employee updates own dependents_count. Affects PIT. SECURITY DEFINER bypasses employees_write RLS; guarded by profile_id = auth.uid() and count in [0, 20].';


--
-- Name: update_my_profile(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_my_profile(p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.profiles SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;


--
-- Name: update_pos_order_status(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pos_order_status(p_order_id bigint, p_new_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_from_status TEXT;
  v_bad_items INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_new_status NOT IN ('served', 'completed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'manager') THEN
    NULL;
  ELSIF v_prof_branch IS NOT NULL AND v_order.branch_id <> v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_order.status;

  IF p_new_status = 'served' THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'invalid transition to served' USING ERRCODE = '22023';
    END IF;

    -- Same invariant as 'completed': every active item must already be
    -- terminal from the kitchen's perspective. Cashier cannot retire a
    -- ticket the chef is still working on.
    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    -- Only flip the rows that still need transitioning. 'served' stays
    -- 'served', 'cancelled' stays 'cancelled' (guard above already proved
    -- nothing is pending/preparing).
    UPDATE public.order_items
    SET status = 'served',
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.kds_tickets
    SET status = 'served',
        bumped_at = COALESCE(bumped_at, now()),
        bumped_by = COALESCE(bumped_by, v_uid),
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;
  ELSIF p_new_status = 'completed' THEN
    IF v_order.status <> 'served' THEN
      RAISE EXCEPTION 'complete requires served' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
    SET status = 'completed', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_from_status, p_new_status, v_uid, 'pos update'
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$$;


--
-- Name: FUNCTION update_pos_order_status(p_order_id bigint, p_new_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_pos_order_status(p_order_id bigint, p_new_status text) IS 'POS order status update. Both ''served'' and ''completed'' require every active order_item to already be ready/served/cancelled — cashier cannot retire kitchen tickets that are still pending/preparing. Per-item served stays available via mark_order_item_served.';


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'auth', 'storage'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: void_order_item(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_order_item(p_order_item_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_prof_tenant     BIGINT;
  v_prof_branch     BIGINT;
  v_prof_role       TEXT;
  v_item            RECORD;
  v_order           RECORD;
  v_subtotal        NUMERIC(15,2);
  v_discount_amount NUMERIC(15,2);
  v_all_cancelled   BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'staff')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('manager', 'staff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(v_item.order_id);

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:void_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.status IN ('served', 'cancelled') THEN
    RAISE EXCEPTION 'item not voidable' USING ERRCODE = '22023';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.order_items
  SET status = 'cancelled',
      cancel_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_item_id;

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_item_id = p_order_item_id AND tenant_id = v_item.tenant_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM public.order_items
  WHERE order_id = v_item.order_id AND status <> 'cancelled';

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = v_item.order_id AND status <> 'cancelled'
  ) INTO v_all_cancelled;

  IF v_all_cancelled THEN
    UPDATE public.orders
    SET
      status          = 'cancelled',
      subtotal        = 0,
      discount_type   = NULL,
      discount_value  = NULL,
      discount_note   = NULL,
      discount_amount = 0,
      total_amount    = 0 + COALESCE(service_charge, 0),
      updated_at      = now()
    WHERE id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, 'cancelled', v_uid,
      'auto_cancel_all_items_voided: ' || p_reason
    );
  ELSE
    v_discount_amount := public.compute_discount_amount(
      v_order.discount_type, v_order.discount_value, v_subtotal
    );

    UPDATE public.orders o
    SET
      subtotal        = v_subtotal,
      discount_type   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_type END,
      discount_value  = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_value END,
      discount_note   = CASE WHEN v_discount_amount = 0 THEN NULL ELSE o.discount_note END,
      discount_amount = v_discount_amount,
      total_amount    = v_subtotal + COALESCE(o.service_charge, 0) - v_discount_amount,
      updated_at      = now()
    WHERE o.id = v_item.order_id;

    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_item.tenant_id, v_item.order_id, v_order.status, v_order.status, v_uid,
      'void_item ' || p_order_item_id::text || ': ' || p_reason
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_item.order_id,
    'auto_cancelled_order', v_all_cancelled,
    'was_sent_to_kitchen', v_item.sent_to_kitchen_at IS NOT NULL
  );
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: archive_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archive_run_log (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    tax_invoice_id bigint NOT NULL,
    trigger_source text NOT NULL,
    triggered_by uuid,
    outcome text NOT NULL,
    pdf_bytes integer,
    xml_bytes integer,
    pdf_sha256 text,
    xml_sha256 text,
    attempt_number smallint NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT archive_run_log_outcome_check CHECK ((outcome = ANY (ARRAY['archived'::text, 'no_change'::text, 'provider_error'::text, 'storage_error'::text, 'invalid_payload'::text, 'hash_mismatch'::text, 'giveup'::text]))),
    CONSTRAINT archive_run_log_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['cron'::text, 'manual'::text, 'backfill'::text])))
);


--
-- Name: TABLE archive_run_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.archive_run_log IS 'Per-attempt audit for HĐĐT PDF/XML archive cron + manual triggers. outcome=archived means pdf_url+xml_url+hashes persisted to tax_invoices; storage_error = Storage upload failed; invalid_payload = magic byte or size check failed; hash_mismatch = re-download yielded different bytes (corruption alert); giveup = archive_attempts >= 5, manual review needed.';


--
-- Name: COLUMN archive_run_log.attempt_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.archive_run_log.attempt_number IS 'Snapshot of tax_invoices.archive_attempts at the time of the attempt. Eases forensic queries vs joining back to tax_invoices.';


--
-- Name: archive_run_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.archive_run_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.archive_run_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    employee_id bigint NOT NULL,
    shift_id bigint,
    date date NOT NULL,
    check_in timestamp with time zone,
    check_out timestamp with time zone,
    status text DEFAULT 'absent'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    method text DEFAULT 'manual'::text,
    code_verified boolean DEFAULT false,
    CONSTRAINT attendance_records_method_check CHECK ((method = ANY (ARRAY['pwa'::text, 'manual'::text, 'admin'::text]))),
    CONSTRAINT attendance_records_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'half_day'::text])))
);


--
-- Name: attendance_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Append-only audit trail. No UPDATE/DELETE RLS policies = immutable via RLS.';


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auto_journal_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auto_journal_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_attendance_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_attendance_config (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    attendance_secret text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_attendance_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branch_attendance_config ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branch_attendance_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branch_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_feature_flags (
    branch_id bigint NOT NULL,
    flag_key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    enabled_by uuid,
    enabled_at timestamp with time zone,
    disabled_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE branch_feature_flags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.branch_feature_flags IS 'Per-branch feature flag for UI wiring rollout.';


--
-- Name: branch_menu_item_daily_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_menu_item_daily_limits (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    menu_item_id bigint NOT NULL,
    limit_date date DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date NOT NULL,
    limit_quantity integer,
    is_disabled boolean DEFAULT false NOT NULL,
    sold_today integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT branch_menu_item_daily_limits_limit_quantity_check CHECK (((limit_quantity IS NULL) OR (limit_quantity > 0))),
    CONSTRAINT branch_menu_item_daily_limits_sold_today_check CHECK ((sold_today >= 0))
);

ALTER TABLE ONLY public.branch_menu_item_daily_limits REPLICA IDENTITY FULL;


--
-- Name: TABLE branch_menu_item_daily_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.branch_menu_item_daily_limits IS 'Per-(branch, menu item, day) sales caps and disable flags. Trigger on order_items keeps sold_today atomic.';


--
-- Name: branch_menu_item_daily_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branch_menu_item_daily_limits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branch_menu_item_daily_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branch_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_zones (
    id bigint NOT NULL,
    branch_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: branch_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branch_zones ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branch_zones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    branch_kind text DEFAULT 'branch'::text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    timezone text DEFAULT 'Asia/Ho_Chi_Minh'::text NOT NULL,
    code text,
    CONSTRAINT branches_branch_kind_check CHECK ((branch_kind = 'branch'::text)),
    CONSTRAINT branches_code_format_chk CHECK (((branch_kind <> 'branch'::text) OR ((code IS NOT NULL) AND (code ~ '^[A-Z]{2,4}$'::text))))
);


--
-- Name: COLUMN branches.timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.branches.timezone IS 'IANA timezone name (e.g. Asia/Ho_Chi_Minh). Used by inventory shift_key, GRN express window, and period close for branch-local day/hour math.';


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cash_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_entries (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    entry_date date DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date NOT NULL,
    direction text NOT NULL,
    category text,
    amount numeric(15,2) NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_entries_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_entries_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))
);


--
-- Name: cash_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cash_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cash_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    profile_id uuid NOT NULL,
    employee_code text,
    id_number text,
    bank_account text,
    bank_name text,
    base_salary numeric(15,2),
    start_date date,
    contract_type text,
    dependents_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    insurance_base_salary numeric(15,2) DEFAULT 0 NOT NULL,
    CONSTRAINT employees_contract_type_check CHECK ((contract_type = ANY (ARRAY['probation'::text, 'fixed_term'::text, 'indefinite'::text]))),
    CONSTRAINT employees_dependents_count_check CHECK ((dependents_count >= 0))
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employees ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employees_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: goods_received_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_received_notes (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    po_id bigint,
    supplier_id bigint NOT NULL,
    grn_number text NOT NULL,
    received_date timestamp with time zone DEFAULT now() NOT NULL,
    received_by uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    express_approved boolean,
    CONSTRAINT goods_received_notes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'cancelled'::text])))
);


--
-- Name: goods_received_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.goods_received_notes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.goods_received_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: grn_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grn_items (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    grn_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    po_quantity numeric(15,3),
    received_quantity numeric(15,3) NOT NULL,
    unit text NOT NULL,
    unit_cost numeric(15,2) NOT NULL,
    total_cost numeric(15,2) NOT NULL,
    quality_status text DEFAULT 'accepted'::text NOT NULL,
    rejected_quantity numeric(15,3) DEFAULT 0 NOT NULL,
    rejection_reason text,
    expiry_date date,
    batch_number text,
    receiving_temperature numeric(5,1),
    po_unit_price numeric(15,2),
    price_variance_pct numeric(7,3) GENERATED ALWAYS AS (
CASE
    WHEN ((po_unit_price IS NULL) OR (po_unit_price = (0)::numeric)) THEN NULL::numeric
    ELSE round((((unit_cost - po_unit_price) / po_unit_price) * (100)::numeric), 3)
END) STORED,
    price_override_note text,
    price_override_photo_url text,
    rejected_photo_url text,
    requires_review boolean DEFAULT false NOT NULL,
    short_delivery_action text,
    variance_tier smallint,
    baseline_source text,
    baseline_sample_n integer,
    is_hard_blocked boolean DEFAULT false NOT NULL,
    baseline_variance_pct numeric(7,3),
    CONSTRAINT grn_items_baseline_source_check CHECK ((baseline_source = ANY (ARRAY['same_supplier'::text, 'any_supplier'::text, 'none'::text, 'paused'::text]))),
    CONSTRAINT grn_items_quality_status_check CHECK ((quality_status = ANY (ARRAY['accepted'::text, 'rejected'::text, 'partial'::text]))),
    CONSTRAINT grn_items_received_quantity_check CHECK ((received_quantity >= (0)::numeric)),
    CONSTRAINT grn_items_rejected_le_received CHECK ((COALESCE(rejected_quantity, (0)::numeric) <= received_quantity)),
    CONSTRAINT grn_items_short_delivery_action_check CHECK (((short_delivery_action IS NULL) OR (short_delivery_action = ANY (ARRAY['accept_and_close'::text, 'wait_backorder'::text, 'request_credit'::text])))),
    CONSTRAINT grn_items_variance_tier_check CHECK (((variance_tier >= 0) AND (variance_tier <= 3)))
);


--
-- Name: COLUMN grn_items.received_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.received_quantity IS 'Tổng số lượng nhà cung cấp đã giao (gross delivered). Stock impact = received − rejected. Số nhận tốt vào kho được tính bằng (received − rejected_quantity).';


--
-- Name: COLUMN grn_items.rejected_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.rejected_quantity IS 'Số lượng (subset của received_quantity) bị từ chối + trả NCC. Bắt buộc ≤ received_quantity.';


--
-- Name: COLUMN grn_items.receiving_temperature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.receiving_temperature IS 'Receiving temperature in °C — applicable for cold/frozen items.';


--
-- Name: COLUMN grn_items.po_unit_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.po_unit_price IS 'Snapshot of PO line unit_price_est at GRN-from-PO creation. NULL for ad-hoc GRNs.';


--
-- Name: COLUMN grn_items.requires_review; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.requires_review IS 'Auto-set to TRUE when |price_variance_pct| > inventory_qc_settings.price_variance_review_pct. Audit-only flag, does not block.';


--
-- Name: COLUMN grn_items.short_delivery_action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.short_delivery_action IS 'Required when received_quantity < po_quantity beyond tolerance. accept_and_close = close PO line; wait_backorder = keep PO open for supplement GRN; request_credit = auto-create supplier_return as credit_note.';


--
-- Name: COLUMN grn_items.baseline_variance_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.grn_items.baseline_variance_pct IS 'Signed variance of unit_cost vs 30-day baseline. Populated by trigger. Independent from price_variance_pct (GRN↔PO generated).';


--
-- Name: grn_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.grn_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.grn_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name text NOT NULL,
    sku text,
    unit text NOT NULL,
    unit_cost numeric(15,2),
    category text,
    min_stock_level numeric(15,3) DEFAULT 0 NOT NULL,
    max_stock_level numeric(15,3),
    reorder_point numeric(15,3),
    storage_type text DEFAULT 'ambient'::text NOT NULL,
    shelf_life_days integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    item_kind text DEFAULT 'raw_material'::text NOT NULL,
    purchase_unit text NOT NULL,
    measure_unit text NOT NULL,
    purchase_to_measure_factor numeric(15,6) DEFAULT 1 NOT NULL,
    review_override boolean,
    CONSTRAINT ingredients_item_kind_check CHECK ((item_kind = ANY (ARRAY['raw_material'::text, 'finished_good'::text]))),
    CONSTRAINT ingredients_purchase_to_measure_factor_positive CHECK ((purchase_to_measure_factor > (0)::numeric)),
    CONSTRAINT ingredients_storage_type_check CHECK ((storage_type = ANY (ARRAY['ambient'::text, 'refrigerated'::text, 'frozen'::text])))
);


--
-- Name: COLUMN ingredients.purchase_to_measure_factor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ingredients.purchase_to_measure_factor IS 'Number of measure_unit units contained in one purchase_unit. Example: 1 bottle = 250 ml => factor 250.';


--
-- Name: COLUMN ingredients.review_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ingredients.review_override IS 'Nullable flag. NULL = inherit category policy. TRUE/FALSE = explicit per-item override. Set by QLV via inventory:item_review_override_set.';


--
-- Name: ingredients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ingredients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kds_station_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kds_station_categories (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    station_id bigint NOT NULL,
    category_id bigint NOT NULL
);


--
-- Name: kds_station_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.kds_station_categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.kds_station_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kds_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kds_stations (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kds_stations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.kds_stations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.kds_stations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kds_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kds_tickets (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    station_id bigint NOT NULL,
    order_id bigint NOT NULL,
    order_item_id bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    bumped_at timestamp with time zone,
    bumped_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kitchen_send_batch_id bigint,
    CONSTRAINT kds_tickets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.kds_tickets REPLICA IDENTITY FULL;


--
-- Name: COLUMN kds_tickets.kitchen_send_batch_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kds_tickets.kitchen_send_batch_id IS 'Batch that assigned the kitchen queue number for this KDS ticket.';


--
-- Name: kds_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.kds_tickets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.kds_tickets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kitchen_send_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kitchen_send_batches (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    order_id bigint NOT NULL,
    counter_date date NOT NULL,
    ticket_seq integer NOT NULL,
    kitchen_ticket_number text NOT NULL,
    send_seq integer NOT NULL,
    kind text DEFAULT 'initial'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kitchen_send_batches_kind_check CHECK ((kind = ANY (ARRAY['initial'::text, 'append'::text, 'manual'::text]))),
    CONSTRAINT kitchen_send_batches_send_seq_check CHECK ((send_seq > 0)),
    CONSTRAINT kitchen_send_batches_ticket_seq_check CHECK ((ticket_seq > 0))
);

-- V10: kitchen_send_batches has NO realtime subscriber — dropped from the
-- supabase_realtime publication (was an over-grant). Its replica identity is
-- reset to DEFAULT (primary key) since FULL is only needed for realtime/replication.
ALTER TABLE ONLY public.kitchen_send_batches REPLICA IDENTITY DEFAULT;


--
-- Name: TABLE kitchen_send_batches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.kitchen_send_batches IS 'Kitchen queue batches. kitchen_ticket_number is the operator-visible PB code derived from order_number and send_seq, e.g. #105, #105-2.';


--
-- Name: COLUMN kitchen_send_batches.kitchen_ticket_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.kitchen_send_batches.kitchen_ticket_number IS 'Operator-visible kitchen ticket code. First send follows the order display sequence; later sends append -{send_seq}.';


--
-- Name: kitchen_send_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.kitchen_send_batches ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.kitchen_send_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'main_dish'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kitchen_printer smallint DEFAULT 1 NOT NULL,
    CONSTRAINT menu_categories_kitchen_printer_check CHECK ((kitchen_printer = ANY (ARRAY[1, 2]))),
    CONSTRAINT menu_categories_type_check CHECK ((type = ANY (ARRAY['main_dish'::text, 'side_dish'::text, 'drink'::text, 'dessert'::text])))
);


--
-- Name: menu_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.menu_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menu_item_available_sides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_available_sides (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    main_item_id bigint NOT NULL,
    side_item_id bigint NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_item_available_sides_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_available_sides ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.menu_item_available_sides_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menu_item_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_modifiers (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    item_id bigint NOT NULL,
    name text NOT NULL,
    price numeric(15,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_menu_item_modifiers_price CHECK ((price >= (0)::numeric))
);


--
-- Name: menu_item_modifiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_modifiers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.menu_item_modifiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menu_item_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_variants (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    item_id bigint NOT NULL,
    name text NOT NULL,
    price_adjustment numeric(15,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_item_variants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_variants ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.menu_item_variants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    category_id bigint NOT NULL,
    name text NOT NULL,
    description text,
    base_price numeric(15,2) NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vat_rate numeric(5,2) DEFAULT 8.00 NOT NULL,
    CONSTRAINT chk_menu_items_base_price CHECK ((base_price >= (0)::numeric)),
    CONSTRAINT menu_items_vat_rate_check CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (100)::numeric)))
);


--
-- Name: COLUMN menu_items.vat_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.menu_items.vat_rate IS 'VAT rate (%) snapshotted onto order_items at order creation. Default 8.00 = Nghị định 15/2022 reduced rate for food. F&B beverages typically 10%; non-VAT exempt items 0%.';


--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.menu_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    table_id bigint,
    order_number text NOT NULL,
    order_type text DEFAULT 'dine_in'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(15,2) DEFAULT 0 NOT NULL,
    service_charge numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    customer_count integer DEFAULT 1 NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pos_session_id bigint,
    payment_method text,
    payment_status text DEFAULT 'unpaid'::text,
    idempotency_key uuid,
    kitchen_send_count integer DEFAULT 0 NOT NULL,
    cash_received numeric(15,2),
    cash_change numeric(15,2),
    discount_type text,
    discount_value numeric(15,2),
    discount_note text,
    split_from_order_id bigint,
    merged_into_order_id bigint,
    merge_request_key uuid,
    last_transfer_idempotency_key uuid,
    is_priority boolean DEFAULT false NOT NULL,
    priority_note text,
    priority_marked_at timestamp with time zone,
    priority_marked_by uuid,
    CONSTRAINT orders_customer_count_check CHECK ((customer_count > 0)),
    CONSTRAINT orders_discount_metadata_paired CHECK ((((discount_amount = (0)::numeric) AND (discount_type IS NULL) AND (discount_value IS NULL) AND (discount_note IS NULL)) OR ((discount_amount > (0)::numeric) AND (discount_type IS NOT NULL) AND (discount_value IS NOT NULL) AND (discount_note IS NOT NULL) AND (length(TRIM(BOTH FROM discount_note)) >= 3)))),
    CONSTRAINT orders_discount_type_check CHECK (((discount_type IS NULL) OR (discount_type = ANY (ARRAY['pct'::text, 'vnd'::text])))),
    CONSTRAINT orders_discount_value_check CHECK (((discount_value IS NULL) OR (discount_value >= (0)::numeric))),
    CONSTRAINT orders_no_self_merge CHECK ((merged_into_order_id IS DISTINCT FROM id)),
    CONSTRAINT orders_order_type_check CHECK ((order_type = ANY (ARRAY['dine_in'::text, 'takeaway'::text]))),
    CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['new'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: COLUMN orders.cash_received; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.cash_received IS 'Tiền mặt khách đưa (chỉ khi payment_method=cash). Null cho các method khác.';


--
-- Name: COLUMN orders.cash_change; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.cash_change IS 'Tiền trả lại khách = cash_received - total_amount. Null cho non-cash.';


--
-- Name: COLUMN orders.discount_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.discount_type IS 'Loại chiết khấu: ''pct'' (theo %) hoặc ''vnd'' (số tiền cố định). NULL khi không có giảm.';


--
-- Name: COLUMN orders.discount_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.discount_value IS 'Giá trị gốc cashier nhập (10 cho 10%, 15000 cho 15.000đ). discount_amount là số tiền VND đã re-derive.';


--
-- Name: COLUMN orders.discount_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.discount_note IS 'Ghi chú lý do giảm giá (>= 3 ký tự sau trim). Bắt buộc khi có giảm.';


--
-- Name: COLUMN orders.split_from_order_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.split_from_order_id IS 'Đơn nguồn nếu đơn này được tách ra qua split_order. NULL nếu tạo trực tiếp.';


--
-- Name: COLUMN orders.merged_into_order_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.merged_into_order_id IS 'Đơn target nếu đơn này đã bị gộp vào đơn khác (status sẽ là cancelled). NULL nếu chưa.';


--
-- Name: COLUMN orders.merge_request_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.merge_request_key IS 'Idempotency key (UUID) stamp on target khi merge xong. Replay với cùng key trả về kết quả cũ.';


--
-- Name: COLUMN orders.is_priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.is_priority IS 'POS/KDS kitchen priority signal for the whole order. Operational only; does not affect financial totals.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    order_id bigint NOT NULL,
    method text NOT NULL,
    amount numeric(15,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_ref text,
    provider_data jsonb,
    paid_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'vietqr'::text, 'momo'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text])))
);

ALTER TABLE ONLY public.payments REPLICA IDENTITY FULL;


--
-- Name: CONSTRAINT payments_amount_check ON payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT payments_amount_check ON public.payments IS 'Allows amount = 0 for fully-discounted comp / staff meals (POS-CASH-ZERO-TOTAL-OK). VietQR / MoMo retain amount > 0 at application layer via Zod .positive() in createPayment.';


--
-- Name: mv_daily_revenue; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
 SELECT ((p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date AS date,
    o.branch_id,
    o.tenant_id,
    count(*) AS order_count,
    COALESCE(sum(o.total_amount), (0)::numeric) AS total_revenue,
    COALESCE(sum(o.tax_amount), (0)::numeric) AS total_tax,
    COALESCE(sum(o.subtotal), (0)::numeric) AS subtotal_revenue,
    COALESCE(sum(o.discount_amount), (0)::numeric) AS discount_amount,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'cash'::text)), (0)::numeric) AS cash_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'vietqr'::text)), (0)::numeric) AS vietqr_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'momo'::text)), (0)::numeric) AS momo_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.order_type = 'dine_in'::text)), (0)::numeric) AS dine_in_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.order_type = 'takeaway'::text)), (0)::numeric) AS takeaway_revenue,
    COALESCE(sum(o.customer_count), (0)::bigint) AS total_covers
   FROM (public.orders o
     JOIN public.payments p ON (((p.order_id = o.id) AND (p.tenant_id = o.tenant_id) AND (p.status = 'completed'::text) AND (p.paid_at IS NOT NULL))))
  WHERE ((o.status <> 'cancelled'::text) AND (o.payment_status = 'paid'::text))
  GROUP BY (((p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date), o.branch_id, o.tenant_id
  WITH NO DATA;


--
-- Name: mv_grn_price_baseline; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_grn_price_baseline AS
 SELECT grn.tenant_id,
    grn.supplier_id,
    gi.ingredient_id,
    gi.unit AS uom,
    (avg(gi.unit_cost))::numeric(15,2) AS avg_30d,
    (count(*))::integer AS sample_n,
    (max(grn.received_date))::date AS last_seen_at
   FROM (public.grn_items gi
     JOIN public.goods_received_notes grn ON ((grn.id = gi.grn_id)))
  WHERE ((grn.status = 'confirmed'::text) AND (grn.received_date >= (now() - '30 days'::interval)) AND (gi.received_quantity > (0)::numeric) AND (gi.unit_cost IS NOT NULL))
  GROUP BY grn.tenant_id, grn.supplier_id, gi.ingredient_id, gi.unit
  WITH NO DATA;


--
-- Name: stock_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_levels (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    current_quantity numeric(15,3) DEFAULT 0 NOT NULL,
    last_counted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avg_unit_cost numeric(15,2)
);


--
-- Name: COLUMN stock_levels.current_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_levels.current_quantity IS 'Warehouse stock quantity stored in ingredients.purchase_unit (DVN).';


--
-- Name: COLUMN stock_levels.avg_unit_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_levels.avg_unit_cost IS 'Weighted average unit cost (WAC) at this branch warehouse.';



--
-- Name: mv_inventory_stock_current; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_inventory_stock_current AS
 SELECT sl.tenant_id,
    sl.branch_id,
    sl.ingredient_id,
    ing.name AS ingredient_name,
    ing.category AS ingredient_category,
    ing.is_active AS ingredient_is_active,
    ing.item_kind,
    sl.current_quantity,
    sl.avg_unit_cost,
    ((sl.current_quantity * COALESCE(sl.avg_unit_cost, (0)::numeric)))::numeric(15,2) AS stock_value,
    ing.reorder_point,
    ing.min_stock_level,
    ing.max_stock_level,
    ing.shelf_life_days,
    sl.updated_at,
    sl.last_counted_at
   FROM (public.stock_levels sl
     JOIN public.ingredients ing ON ((ing.id = sl.ingredient_id)))
  WHERE (ing.is_active = true)
  WITH NO DATA;


--
-- Name: MATERIALIZED VIEW mv_inventory_stock_current; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON MATERIALIZED VIEW public.mv_inventory_stock_current IS 'Per-location stock snapshot. RLS-NOT-APPLIED-ON-MV → direct access REVOKED, use wrapper RPCs.';


--
-- Name: mv_inventory_value_ranking; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_inventory_value_ranking AS
 SELECT tenant_id,
    branch_id,
    ingredient_id,
    sum(stock_value) AS total_value
   FROM public.mv_inventory_stock_current
  GROUP BY tenant_id, branch_id, ingredient_id
  WITH NO DATA;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    order_id bigint NOT NULL,
    menu_item_id bigint NOT NULL,
    variant_id bigint,
    item_name text NOT NULL,
    variant_name text,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    modifiers jsonb DEFAULT '[]'::jsonb NOT NULL,
    sides jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(15,2) NOT NULL,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_to_kitchen_at timestamp with time zone,
    cancel_reason text,
    request_key uuid,
    vat_rate numeric(5,2) DEFAULT 8.00 NOT NULL,
    is_priority boolean DEFAULT false NOT NULL,
    priority_note text,
    priority_marked_at timestamp with time zone,
    priority_marked_by uuid,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'cancelled'::text]))),
    CONSTRAINT order_items_vat_rate_check CHECK (((vat_rate IS NULL) OR ((vat_rate >= (0)::numeric) AND (vat_rate <= (100)::numeric))))
);


--
-- Name: COLUMN order_items.modifiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.modifiers IS 'Snapshot: [{"modifier_id": bigint, "name": text, "price": numeric}]';


--
-- Name: COLUMN order_items.sides; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.sides IS 'Snapshot: [{"side_item_id": bigint, "name": text, "price": numeric, "quantity": int, "is_default": boolean}]';


--
-- Name: COLUMN order_items.cancel_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.cancel_reason IS 'Lý do huỷ món (do waiter/cashier nhập khi void). Null nếu chưa huỷ.';


--
-- Name: COLUMN order_items.request_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.request_key IS 'UUID carried by the append_order_items RPC call that inserted this row. Used for RPC-level idempotency — enables client double-tap/retry safety.';


--
-- Name: COLUMN order_items.is_priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.is_priority IS 'POS/KDS kitchen priority signal for a single dish. Operational only; does not affect financial totals.';


--
-- Name: mv_top_items; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_top_items AS
 SELECT (date_trunc('week'::text, o.created_at))::date AS period_start,
    ((date_trunc('week'::text, o.created_at) + '6 days'::interval))::date AS period_end,
    o.branch_id,
    o.tenant_id,
    oi.menu_item_id,
    max(oi.item_name) AS item_name,
    sum(oi.quantity) AS quantity_sold,
    sum(oi.subtotal) AS revenue
   FROM (public.order_items oi
     JOIN public.orders o ON ((oi.order_id = o.id)))
  WHERE ((o.status <> 'cancelled'::text) AND (oi.status <> 'cancelled'::text))
  GROUP BY ((date_trunc('week'::text, o.created_at))::date), (((date_trunc('week'::text, o.created_at) + '6 days'::interval))::date), o.branch_id, o.tenant_id, oi.menu_item_id
  WITH NO DATA;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    target_branch_id bigint,
    target_roles text[] NOT NULL,
    kind text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id bigint,
    action_url text,
    dedup_key text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT notifications_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))),
    CONSTRAINT notifications_target_roles_check CHECK ((array_length(target_roles, 1) >= 1))
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'Notification feed. Rows target role and branch; RLS enforces visibility.';


--
-- Name: COLUMN notifications.kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.kind IS 'Event kind, e.g. pos.order_new | workflow.po_pending_approval | inventory.stock_low | inventory.expiry_soon';


--
-- Name: COLUMN notifications.dedup_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.dedup_key IS 'Optional per-tenant dedup key, e.g. stock_low:ingredient:42:2026-04-25';


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_daily_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_daily_counters (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    counter_date date NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_daily_counters_last_seq_check CHECK ((last_seq >= 0))
);


--
-- Name: order_daily_counters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_daily_counters ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_daily_counters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    order_id bigint NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE order_status_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_status_history IS 'Audit trail cho mọi thao tác trên đơn (cancel, void item, discount, split, merge, transfer, edit, served). Append-only. Trong realtime publication để admin order detail cập nhật timeline live.';


--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payroll_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_entries (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    payroll_period_id bigint NOT NULL,
    employee_id bigint NOT NULL,
    working_days numeric(5,1) NOT NULL,
    standard_days numeric(5,1) NOT NULL,
    overtime_hours numeric(6,2) DEFAULT 0 NOT NULL,
    base_salary numeric(15,2) NOT NULL,
    allowances numeric(15,2) DEFAULT 0 NOT NULL,
    tax_exempt_allowances numeric(15,2) DEFAULT 0 NOT NULL,
    overtime_pay numeric(15,2) DEFAULT 0 NOT NULL,
    bonus numeric(15,2) DEFAULT 0 NOT NULL,
    gross_total numeric(15,2) NOT NULL,
    bhxh_employee numeric(15,2) NOT NULL,
    bhyt_employee numeric(15,2) NOT NULL,
    bhtn_employee numeric(15,2) NOT NULL,
    total_insurance_employee numeric(15,2) NOT NULL,
    bhxh_employer numeric(15,2) NOT NULL,
    bhyt_employer numeric(15,2) NOT NULL,
    bhtn_employer numeric(15,2) NOT NULL,
    total_insurance_employer numeric(15,2) NOT NULL,
    personal_deduction numeric(15,2) DEFAULT 11000000 NOT NULL,
    dependent_count integer DEFAULT 0 NOT NULL,
    dependent_deduction numeric(15,2) DEFAULT 0 NOT NULL,
    charity_deduction numeric(15,2) DEFAULT 0 NOT NULL,
    taxable_income numeric(15,2) NOT NULL,
    pit_tax numeric(15,2) NOT NULL,
    advance_deduction numeric(15,2) DEFAULT 0 NOT NULL,
    other_deductions numeric(15,2) DEFAULT 0 NOT NULL,
    net_salary numeric(15,2) NOT NULL,
    insurance_base numeric(15,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payroll_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payroll_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payroll_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payroll_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_periods (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    period_month integer NOT NULL,
    period_year integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payroll_periods_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT payroll_periods_period_year_check CHECK ((period_year >= 2020)),
    CONSTRAINT payroll_periods_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'calculated'::text, 'approved'::text, 'paid'::text])))
);


--
-- Name: payroll_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payroll_periods ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payroll_periods_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: permission_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_keys (
    key text NOT NULL,
    module text NOT NULL,
    description text NOT NULL,
    scope text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permission_keys_scope_check CHECK ((scope = ANY (ARRAY['branch'::text, 'tenant'::text, 'either'::text])))
);


--
-- Name: TABLE permission_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.permission_keys IS 'Global catalog of permission strings. Edits must go through controlled permission-management flows, never ad-hoc SQL.';


--
-- Name: pos_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sessions (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    terminal_id bigint,
    opened_by uuid NOT NULL,
    closed_by uuid,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_cash numeric(15,2) DEFAULT 0 NOT NULL,
    closing_cash numeric(15,2),
    expected_cash numeric(15,2),
    cash_difference numeric(15,2),
    status text DEFAULT 'open'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variance_approval_note text,
    variance_approver_user_id uuid,
    CONSTRAINT pos_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);

ALTER TABLE ONLY public.pos_sessions REPLICA IDENTITY FULL;


--
-- Name: COLUMN pos_sessions.terminal_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_sessions.terminal_id IS 'OPTIONAL sau D7 (2026-04-27). Trước D7: NOT NULL FK pos_terminals — per-terminal model. Sau D7: nullable. NULL = ca chung của chi nhánh (không liên kết terminal vật lý cụ thể). Closed sessions từ trước D7 vẫn giữ terminal_id cho audit.';


--
-- Name: COLUMN pos_sessions.variance_approval_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_sessions.variance_approval_note IS 'Lý do duyệt chênh lệch cuối ca khi |cash_difference| > max(50k, 0.5% × expected_cash). NULL khi diff trong ngưỡng.';


--
-- Name: COLUMN pos_sessions.variance_approver_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_sessions.variance_approver_user_id IS 'User duyệt chênh lệch (auth.uid() tại close time, phải có pos:close_shift_variance_override). NULL khi diff trong ngưỡng.';


--
-- Name: pos_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pos_sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pos_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pos_terminals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_terminals (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    name text NOT NULL,
    device_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_terminals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pos_terminals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pos_terminals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    code text NOT NULL,
    label_vi text NOT NULL,
    label_en text,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE positions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.positions IS 'HR-only chức vụ. Does NOT grant permissions. Permissions are granted directly per user via staff_permissions (no role_templates presets — HKD lean).';


--
-- Name: COLUMN positions.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.code IS 'Canonical English lower_snake_case HR position code. Vietnamese display names live in label_vi.';


--
-- Name: positions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.positions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.positions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: print_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.print_jobs (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    printer_id bigint NOT NULL,
    job_type text NOT NULL,
    order_id bigint,
    payload jsonb NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    last_error text,
    claimed_by_agent text,
    claimed_at timestamp with time zone,
    printed_at timestamp with time zone,
    reprinted_from_id bigint,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_retried_at timestamp with time zone,
    last_retried_by uuid,
    CONSTRAINT print_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['kitchen_ticket'::text, 'receipt'::text, 'reprint'::text, 'cancel_ticket'::text, 'provisional_bill'::text, 'shift_close_report'::text]))),
    CONSTRAINT print_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'printed'::text, 'failed'::text, 'expired'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.print_jobs REPLICA IDENTITY FULL;


--
-- Name: print_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.print_jobs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.print_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: printer_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printer_agents (
    branch_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    agent_id text NOT NULL,
    version text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.printer_agents REPLICA IDENTITY FULL;


--
-- Name: printer_agent_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.printer_agent_status WITH (security_invoker='true') AS
 SELECT branch_id,
    tenant_id,
    agent_id,
    version,
    last_seen_at,
    (last_seen_at > (now() - '00:01:00'::interval)) AS is_online
   FROM public.printer_agents;


--
-- Name: printers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printers (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    role text NOT NULL,
    name text NOT NULL,
    connection_type text DEFAULT 'lan'::text NOT NULL,
    lan_host text,
    lan_port integer DEFAULT 9100,
    paper_width_mm smallint DEFAULT 80 NOT NULL,
    code_page text DEFAULT 'CP1258'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT printers_connection_type_lan_only CHECK ((connection_type = 'lan'::text)),
    CONSTRAINT printers_lan_host_required CHECK ((lan_host IS NOT NULL)),
    CONSTRAINT printers_paper_width_mm_check CHECK ((paper_width_mm = ANY (ARRAY[58, 80]))),
    CONSTRAINT printers_role_check CHECK ((role = ANY (ARRAY['receipt'::text, 'kitchen_1'::text, 'kitchen_2'::text])))
);


--
-- Name: printers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.printers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.printers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint,
    full_name text NOT NULL,
    phone text,
    avatar_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    position_id bigint NOT NULL
);


--
-- Name: COLUMN profiles.position_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.position_id IS 'HR position assigned to this profile.';


--
-- Name: reconcile_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconcile_run_log (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    tax_invoice_id bigint NOT NULL,
    trigger_source text NOT NULL,
    triggered_by uuid,
    before_status text NOT NULL,
    after_status text,
    provider_returned text,
    outcome text NOT NULL,
    error text,
    attempt_age_seconds integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reconcile_run_log_outcome_check CHECK ((outcome = ANY (ARRAY['transitioned'::text, 'no_change'::text, 'race_lost'::text, 'provider_error'::text, 'unknown_status'::text, 'giveup_24h'::text]))),
    CONSTRAINT reconcile_run_log_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['cron'::text, 'manual'::text])))
);


--
-- Name: TABLE reconcile_run_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reconcile_run_log IS 'Per-attempt audit for HĐĐT reconcile cron + manual force-resync. 1 row per (invoice, attempt). Distinct from summary_run_queue (batch-run scoped). outcome=transitioned means state machine RPC succeeded; race_lost = RPC raised illegal_transition (22023); provider_error = getStatus threw or returned error envelope; unknown_status = provider returned a code not in our matrix; giveup_24h = stuck >24h, forced to cancelled.';


--
-- Name: COLUMN reconcile_run_log.provider_returned; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reconcile_run_log.provider_returned IS 'Internal-state mapping of provider response (issued|submitted|cancelled|replaced|draft|error|null). NULL when call did not fire (e.g., race_lost on pre-check).';


--
-- Name: COLUMN reconcile_run_log.attempt_age_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reconcile_run_log.attempt_age_seconds IS 'now() - signing_started_at at attempt time. Drives giveup threshold (>86400s = 24h forces cancel).';


--
-- Name: reconcile_run_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.reconcile_run_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reconcile_run_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    payment_id bigint NOT NULL,
    order_id bigint NOT NULL,
    amount numeric(15,2) NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by uuid NOT NULL,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    CONSTRAINT refunds_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT refunds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN refunds.approved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refunds.approved_at IS 'M4 P0-1: timestamp set by reverse_payment_and_post RPC when the refund is approved. NULL while pending or rejected. Distinct from updated_at so the approval moment is auditable independent of later edits.';


--
-- Name: refunds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.refunds ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.refunds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    name text NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shifts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staff_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_permissions (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint,
    permission_key text NOT NULL,
    source_template bigint,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone,
    CONSTRAINT staff_permissions_validity_check CHECK (((valid_until IS NULL) OR (valid_until > valid_from)))
);


--
-- Name: TABLE staff_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.staff_permissions IS 'Source of truth for authz. One row per (user, branch_or_null, permission_key). NULL branch_id = tenant-wide.';


--
-- Name: COLUMN staff_permissions.valid_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff_permissions.valid_from IS 'Grant effective from this instant (TIMESTAMPTZ). Defaults to now() on insert.';


--
-- Name: COLUMN staff_permissions.valid_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff_permissions.valid_until IS 'Grant expires at this instant (TIMESTAMPTZ). NULL = permanent.';


--
-- Name: staff_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.staff_permissions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.staff_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stock_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stock_levels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_levels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    type text NOT NULL,
    quantity_change numeric(15,3) NOT NULL,
    reason text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    grn_id bigint,
    transfer_id bigint,
    order_id bigint,
    unit_cost numeric(15,2),
    production_order_id bigint,
    issue_id bigint,
    movement_subtype text,
    CONSTRAINT stock_movements_movement_subtype_check CHECK (((movement_subtype IS NULL) OR (movement_subtype = ANY (ARRAY['storage_loss'::text, 'sale_consumption'::text, 'writeoff'::text, 'other'::text])))),
    CONSTRAINT stock_movements_type_check CHECK ((type = ANY (ARRAY['adjustment'::text, 'count_adjustment'::text, 'consumption'::text, 'grn_receipt'::text, 'grn_amend'::text, 'transfer_out'::text, 'transfer_in'::text, 'production_consumption'::text, 'production_output'::text, 'supplier_return'::text, 'refund_restore'::text])))
);



--
-- Name: COLUMN stock_movements.movement_subtype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_movements.movement_subtype IS 'Discriminator for stock_issue-originated consumption movements: storage_loss | sale_consumption | writeoff | other. Derived from (issue_type x branch_kind) at confirm_stock_issue time. NULL for non-issue movements (grn_receipt, transfer_*, production_*, ...).';


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stocktake_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stocktake_lines (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    session_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    system_quantity numeric(15,3) NOT NULL,
    counted_quantity numeric(15,3),
    variance numeric(15,3) GENERATED ALWAYS AS ((counted_quantity - system_quantity)) STORED,
    variance_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    round_no smallint DEFAULT 1 NOT NULL,
    counted_by uuid,
    counted_at timestamp with time zone,
    needs_recount boolean DEFAULT false NOT NULL,
    is_final boolean DEFAULT false NOT NULL,
    abc_class character(1),
    client_op_id uuid,
    offline_created_at timestamp with time zone,
    CONSTRAINT stocktake_lines_abc_class_check CHECK ((abc_class = ANY (ARRAY['A'::bpchar, 'B'::bpchar, 'C'::bpchar]))),
    CONSTRAINT stocktake_lines_round_no_check CHECK (((round_no >= 1) AND (round_no <= 4)))
);


--
-- Name: stocktake_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stocktake_lines ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stocktake_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stocktake_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stocktake_sessions (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'in_progress'::text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text DEFAULT 'daily'::text NOT NULL,
    blind_mode boolean DEFAULT false NOT NULL,
    auditor_id uuid,
    auditor_branch_id bigint,
    is_unaudited boolean DEFAULT false NOT NULL,
    variance_threshold_pct numeric(5,2) DEFAULT 5.00 NOT NULL,
    variance_threshold_vnd numeric(15,2) DEFAULT 200000 NOT NULL,
    variance_threshold_pct_class_a numeric(5,2) DEFAULT 3.00 NOT NULL,
    variance_threshold_vnd_class_a numeric(15,2) DEFAULT 100000 NOT NULL,
    abc_snapshot_at timestamp with time zone,
    current_round smallint DEFAULT 1 NOT NULL,
    offline_enabled boolean DEFAULT false NOT NULL,
    offline_enabled_by uuid,
    offline_enabled_at timestamp with time zone,
    CONSTRAINT stocktake_sessions_current_round_check CHECK (((current_round >= 1) AND (current_round <= 4))),
    CONSTRAINT stocktake_sessions_mode_check CHECK ((mode = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'quarterly'::text, 'spot'::text]))),
    CONSTRAINT stocktake_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'cancelled'::text])))
);



--
-- Name: stocktake_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stocktake_sessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stocktake_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: summary_run_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.summary_run_queue (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    summary_date date NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    trigger_source text NOT NULL,
    triggered_by uuid,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    tax_invoice_id bigint,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT summary_run_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'issued'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT summary_run_queue_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['cron'::text, 'manual'::text])))
);


--
-- Name: TABLE summary_run_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.summary_run_queue IS 'Queue + audit trail cho daily B2C batch runs. 1 row per (branch, date, attempt). trigger_source phân biệt cron vs manual; triggered_by = NULL khi cron (system actor) hoặc user.id khi manual.';


--
-- Name: summary_run_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.summary_run_queue ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.summary_run_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: supplier_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_invoices (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    grn_id bigint,
    po_id bigint,
    invoice_number text NOT NULL,
    invoice_date timestamp with time zone NOT NULL,
    subtotal numeric(15,2) NOT NULL,
    vat_rate numeric(5,2) DEFAULT 8.00 NOT NULL,
    vat_amount numeric(15,2) NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    matching_notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date date,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    paid_amount numeric(15,2) DEFAULT 0 NOT NULL,
    paid_at timestamp with time zone,
    CONSTRAINT supplier_invoices_paid_amount_non_negative CHECK ((paid_amount >= (0)::numeric)),
    CONSTRAINT supplier_invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])))
);


--
-- Name: COLUMN supplier_invoices.due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supplier_invoices.due_date IS 'Payment due date. Can be auto-calculated from invoice_date + supplier.payment_terms_days.';


--
-- Name: COLUMN supplier_invoices.payment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supplier_invoices.payment_status IS 'AP status: unpaid (default), partial, paid.';


--
-- Name: COLUMN supplier_invoices.paid_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supplier_invoices.paid_amount IS 'Total amount paid so far toward this invoice.';


--
-- Name: COLUMN supplier_invoices.paid_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supplier_invoices.paid_at IS 'Timestamp of last/final payment.';


--
-- Name: supplier_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.supplier_invoices ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.supplier_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    supplier_invoice_id bigint NOT NULL,
    payment_method text NOT NULL,
    amount numeric(15,2) NOT NULL,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    reference_note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT supplier_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text])))
);


--
-- Name: supplier_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.supplier_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    name text NOT NULL,
    tax_code text,
    phone text,
    address text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_terms_days integer,
    payment_terms_note text
);


--
-- Name: TABLE suppliers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.suppliers IS 'Tenant-level supplier catalog. Do not add branch_id; branch/source boundaries live on procurement transactions.';


--
-- Name: COLUMN suppliers.payment_terms_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suppliers.payment_terms_days IS 'Standard payment terms in days (e.g. 30 = Net 30). NULL = immediate / not set.';


--
-- Name: COLUMN suppliers.payment_terms_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suppliers.payment_terms_note IS 'Free-text payment terms description (e.g. "Net 30, 2% discount if paid within 10 days").';


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.system_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tables (
    id bigint NOT NULL,
    branch_id bigint NOT NULL,
    zone_id bigint,
    tenant_id bigint NOT NULL,
    number integer NOT NULL,
    capacity integer DEFAULT 4 NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tables_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT tables_status_check CHECK ((status = ANY (ARRAY['available'::text, 'occupied'::text, 'reserved'::text, 'maintenance'::text])))
);

ALTER TABLE ONLY public.tables REPLICA IDENTITY FULL;


--
-- Name: tables_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tables ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tables_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tax_invoice_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_invoice_events (
    id bigint NOT NULL,
    tax_invoice_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_id uuid,
    payload jsonb,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_invoice_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoice_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tax_invoice_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tax_invoice_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_invoice_orders (
    tax_invoice_id bigint NOT NULL,
    order_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    vat_rate numeric(5,2) NOT NULL,
    line_subtotal numeric(15,2) NOT NULL,
    line_vat_amount numeric(15,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE tax_invoice_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tax_invoice_orders IS 'Junction: orders gộp vào daily_summary HĐ. PRIMARY KEY (tax_invoice_id, order_id) chặn duplicate trong cùng HĐ. Per-order partial uniqueness "1 active summary per order" enforce qua trigger trong PR-2 (Postgres không hỗ trợ subquery trong partial index WHERE). Cancel HĐ tổng hợp KHÔNG xóa rows này — preserve audit history. Eligibility query JOIN tax_invoices.status để biết order còn link active hay đã free cho batch sau.';


--
-- Name: tax_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_invoices (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    order_id bigint,
    invoice_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    buyer_name text,
    buyer_tax_code text,
    buyer_address text,
    subtotal numeric(15,2) NOT NULL,
    vat_rate numeric(5,2) DEFAULT 8.00 NOT NULL,
    vat_amount numeric(15,2) NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    provider text DEFAULT 'viettel'::text NOT NULL,
    provider_ref text,
    provider_data jsonb,
    issued_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    replaced_by bigint,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    signing_started_at timestamp with time zone,
    summary_date date,
    summary_orders_count integer,
    invoice_kind text DEFAULT 'per_order'::text NOT NULL,
    cqt_code text,
    invoice_series text,
    pdf_url text,
    xml_url text,
    pdf_sha256 text,
    xml_sha256 text,
    archived_at timestamp with time zone,
    archive_attempts smallint DEFAULT 0 NOT NULL,
    archive_last_error text,
    replaced_for bigint,
    CONSTRAINT chk_invoice_kind_shape CHECK ((((invoice_kind = 'per_order'::text) AND (order_id IS NOT NULL) AND (summary_date IS NULL)) OR ((invoice_kind = 'daily_summary'::text) AND (order_id IS NULL) AND (summary_date IS NOT NULL) AND (summary_orders_count IS NOT NULL)))),
    CONSTRAINT tax_invoices_invoice_kind_check CHECK ((invoice_kind = ANY (ARRAY['per_order'::text, 'daily_summary'::text]))),
    CONSTRAINT tax_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'signing'::text, 'submitted'::text, 'issued'::text, 'cancelled'::text, 'replaced'::text, 'not_required'::text])))
);


--
-- Name: COLUMN tax_invoices.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.status IS 'draft | signing | submitted | issued = active lifecycle. cancelled | replaced = terminal void. not_required = terminal opt-out (cashier confirmed payment without buyer MST per owner D4 2026-04-26). Terminal: no transitions in/out.';


--
-- Name: COLUMN tax_invoices.provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.provider IS 'HĐĐT provider. Runtime supports Viettel S-invoice only; historical rows may contain misa/mock/skipped.';


--
-- Name: COLUMN tax_invoices.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.created_by IS 'NULL semantic = system-initiated (cron-driven daily B2C summary). B2B realtime + admin manual trigger always pass auth.uid(). FK to profiles preserved when set.';


--
-- Name: COLUMN tax_invoices.summary_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.summary_date IS 'NULL cho per_order. Set cho daily_summary = ngày (Asia/Ho_Chi_Minh) gộp orders B2C.';


--
-- Name: COLUMN tax_invoices.summary_orders_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.summary_orders_count IS 'NULL cho per_order. Set cho daily_summary = số orders B2C đã gộp (cached vs JOIN tax_invoice_orders count).';


--
-- Name: COLUMN tax_invoices.invoice_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.invoice_kind IS 'per_order = HĐ B2B realtime cho 1 order. daily_summary = HĐ tổng hợp B2C theo ngày/chi nhánh per TT 78/2021 §11.4.';


--
-- Name: COLUMN tax_invoices.cqt_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.cqt_code IS 'Mã cấp bởi Cơ quan Thuế (CQT) sau khi provider submit thành công. NULL khi status IN (draft, signing, submitted).';


--
-- Name: COLUMN tax_invoices.invoice_series; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.invoice_series IS 'Ký hiệu mẫu HĐ đăng ký với CQT (ví dụ: "1C25TLL"). Set khi MISA cấp.';


--
-- Name: COLUMN tax_invoices.pdf_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.pdf_url IS 'Storage path within hddt-archive bucket (NOT a URL). Call createSignedUrl(path, 300) server-side to mint a 5-min signed URL for UI download. NULL until archive cron succeeds.';


--
-- Name: COLUMN tax_invoices.xml_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.xml_url IS 'Storage path within hddt-archive bucket (NOT a URL). Same semantics as pdf_url.';


--
-- Name: COLUMN tax_invoices.pdf_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.pdf_sha256 IS 'SHA-256 hex digest of PDF bytes AT TIME OF DOWNLOAD from provider. NEVER overwrite — signature integrity proof for tax audit. Mismatch on re-download = corruption alert.';


--
-- Name: COLUMN tax_invoices.xml_sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.xml_sha256 IS 'SHA-256 hex digest of XML bytes AT TIME OF DOWNLOAD. Same integrity rules as pdf_sha256.';


--
-- Name: COLUMN tax_invoices.archived_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.archived_at IS 'Set on successful archive (pdf_url + xml_url + both hashes populated). Used by candidate query: WHERE archived_at IS NULL.';


--
-- Name: COLUMN tax_invoices.archive_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.archive_attempts IS 'Incremented every reconcile/archive attempt regardless of outcome. Giveup threshold = 5 attempts; admin retry flow can reset it.';


--
-- Name: COLUMN tax_invoices.replaced_for; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tax_invoices.replaced_for IS 'NEW-row pointer to OLD row in a TT78 §7 replace chain. NULL for originals. Balance to existing replaced_by (OLD→NEW); together they form a doubly-linked chain. ON DELETE RESTRICT ensures chain integrity (cannot hard-delete a row that other rows reference).';


--
-- Name: tax_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoices ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tax_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id bigint NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    legal_name text,
    tax_code text,
    legal_address text,
    representative text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_user_id uuid NOT NULL
);


--
-- Name: COLUMN tenants.owner_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.owner_user_id IS 'Canonical auth identity of tenant owner. UUID FK to auth.users with ON DELETE RESTRICT; distinct from representative legal name and the owner HR position label.';


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tenants ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tenants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: v_print_agent_fleet; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_print_agent_fleet WITH (security_invoker='true') AS
 SELECT b.id AS branch_id,
    b.tenant_id,
    b.name AS branch_name,
    pa.agent_id,
    pa.version,
    pa.last_seen_at,
    (EXTRACT(epoch FROM (now() - pa.last_seen_at)))::integer AS seconds_since_seen,
        CASE
            WHEN (pa.branch_id IS NULL) THEN 'never_started'::text
            WHEN (pa.last_seen_at < (now() - '00:05:00'::interval)) THEN 'offline'::text
            WHEN ((pa.version IS NULL) OR (pa.version = ''::text)) THEN 'active_unknown_version'::text
            WHEN ((string_to_array(pa.version, '.'::text))::integer[] < ARRAY[0, 3, 0]) THEN 'outdated'::text
            ELSE 'current'::text
        END AS status
   FROM (public.branches b
     LEFT JOIN public.printer_agents pa ON ((pa.branch_id = b.id)))
  WHERE (b.is_active = true);


--
-- Name: VIEW v_print_agent_fleet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_print_agent_fleet IS 'Fleet-wide print-agent status. RLS inherits from printer_agents (manager+).';


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    provider text NOT NULL,
    request_id text NOT NULL,
    payment_id bigint,
    signature_valid boolean DEFAULT false NOT NULL,
    payload jsonb NOT NULL,
    processing_status text DEFAULT 'received'::text NOT NULL,
    http_status integer,
    error_code text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_events_processing_status_check CHECK ((processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text, 'ignored'::text]))),
    CONSTRAINT webhook_events_provider_check CHECK ((provider = ANY (ARRAY['momo'::text, 'vietqr'::text, 'vnpay'::text])))
);


--
-- Name: TABLE webhook_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_events IS 'M4 P1-A (2026-04-29): payment provider webhook idempotency log. UNIQUE(provider, request_id) blocks duplicate processing. Webhook routes MUST insert this row before calling complete_payment_and_consume_stock or any payment-state RPC. RLS allows owner+super_manager SELECT (debugging/reconciliation); INSERT only via service_role webhook handlers (RLS bypassed).';


--
-- Name: webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: archive_run_log archive_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_run_log
    ADD CONSTRAINT archive_run_log_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_employee_id_date_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_employee_id_date_tenant_id_key UNIQUE (employee_id, date, tenant_id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: branch_attendance_config branch_attendance_config_branch_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_attendance_config
    ADD CONSTRAINT branch_attendance_config_branch_id_tenant_id_key UNIQUE (branch_id, tenant_id);


--
-- Name: branch_attendance_config branch_attendance_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_attendance_config
    ADD CONSTRAINT branch_attendance_config_pkey PRIMARY KEY (id);


--
-- Name: branch_feature_flags branch_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_feature_flags
    ADD CONSTRAINT branch_feature_flags_pkey PRIMARY KEY (branch_id, flag_key);


--
-- Name: branch_menu_item_daily_limits branch_menu_item_daily_limits_branch_id_menu_item_id_limit__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_item_daily_limits
    ADD CONSTRAINT branch_menu_item_daily_limits_branch_id_menu_item_id_limit__key UNIQUE (branch_id, menu_item_id, limit_date);


--
-- Name: branch_menu_item_daily_limits branch_menu_item_daily_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_item_daily_limits
    ADD CONSTRAINT branch_menu_item_daily_limits_pkey PRIMARY KEY (id);


--
-- Name: branch_zones branch_zones_branch_id_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_zones
    ADD CONSTRAINT branch_zones_branch_id_name_tenant_id_key UNIQUE (branch_id, name, tenant_id);


--
-- Name: branch_zones branch_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_zones
    ADD CONSTRAINT branch_zones_pkey PRIMARY KEY (id);


--
-- Name: branches branches_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_name_tenant_id_key UNIQUE (name, tenant_id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: cash_entries cash_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_pkey PRIMARY KEY (id);


--
-- Name: employees employees_employee_code_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_tenant_id_key UNIQUE (employee_code, tenant_id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_profile_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_profile_id_tenant_id_key UNIQUE (profile_id, tenant_id);


--
-- Name: goods_received_notes goods_received_notes_grn_number_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_grn_number_tenant_id_key UNIQUE (grn_number, tenant_id);


--
-- Name: goods_received_notes goods_received_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_pkey PRIMARY KEY (id);


--
-- Name: grn_items grn_items_grn_id_ingredient_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_grn_id_ingredient_id_tenant_id_key UNIQUE (grn_id, ingredient_id, tenant_id);


--
-- Name: grn_items grn_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_pkey PRIMARY KEY (id);


--
-- Name: ingredients ingredients_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_name_tenant_id_key UNIQUE (name, tenant_id);


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);


--
-- Name: ingredients ingredients_sku_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_sku_tenant_id_key UNIQUE (sku, tenant_id);



--
-- Name: kds_station_categories kds_station_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_pkey PRIMARY KEY (id);


--
-- Name: kds_station_categories kds_station_categories_station_id_category_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_station_id_category_id_tenant_id_key UNIQUE (station_id, category_id, tenant_id);


--
-- Name: kds_stations kds_stations_name_branch_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_stations
    ADD CONSTRAINT kds_stations_name_branch_id_tenant_id_key UNIQUE (name, branch_id, tenant_id);


--
-- Name: kds_stations kds_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_stations
    ADD CONSTRAINT kds_stations_pkey PRIMARY KEY (id);


--
-- Name: kds_tickets kds_tickets_order_item_id_station_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_order_item_id_station_id_tenant_id_key UNIQUE (order_item_id, station_id, tenant_id);


--
-- Name: kds_tickets kds_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_pkey PRIMARY KEY (id);


--
-- Name: kitchen_send_batches kitchen_send_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_pkey PRIMARY KEY (id);


--
-- Name: kitchen_send_batches kitchen_send_batches_tenant_id_branch_id_counter_date_ticke_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_tenant_id_branch_id_counter_date_ticke_key UNIQUE (tenant_id, branch_id, counter_date, ticket_seq);


--
-- Name: kitchen_send_batches kitchen_send_batches_tenant_id_order_id_send_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_tenant_id_order_id_send_seq_key UNIQUE (tenant_id, order_id, send_seq);


--
-- Name: menu_categories menu_categories_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_name_tenant_id_key UNIQUE (name, tenant_id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_item_available_sides menu_item_available_sides_main_item_id_side_item_id_tenant__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_available_sides
    ADD CONSTRAINT menu_item_available_sides_main_item_id_side_item_id_tenant__key UNIQUE (main_item_id, side_item_id, tenant_id);


--
-- Name: menu_item_available_sides menu_item_available_sides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_available_sides
    ADD CONSTRAINT menu_item_available_sides_pkey PRIMARY KEY (id);


--
-- Name: menu_item_modifiers menu_item_modifiers_name_item_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_name_item_id_tenant_id_key UNIQUE (name, item_id, tenant_id);


--
-- Name: menu_item_modifiers menu_item_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_pkey PRIMARY KEY (id);


--
-- Name: menu_item_variants menu_item_variants_name_item_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_name_item_id_tenant_id_key UNIQUE (name, item_id, tenant_id);


--
-- Name: menu_item_variants menu_item_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_name_tenant_id_key UNIQUE (name, tenant_id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_daily_counters order_daily_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_daily_counters
    ADD CONSTRAINT order_daily_counters_pkey PRIMARY KEY (id);


--
-- Name: order_daily_counters order_daily_counters_scope_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_daily_counters
    ADD CONSTRAINT order_daily_counters_scope_key UNIQUE (tenant_id, branch_id, counter_date);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_branch_id_order_number_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_order_number_tenant_id_key UNIQUE (branch_id, order_number, tenant_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payroll_entries payroll_entries_payroll_period_id_employee_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_payroll_period_id_employee_id_tenant_id_key UNIQUE (payroll_period_id, employee_id, tenant_id);


--
-- Name: payroll_entries payroll_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_pkey PRIMARY KEY (id);


--
-- Name: payroll_periods payroll_periods_period_month_period_year_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT payroll_periods_period_month_period_year_tenant_id_key UNIQUE (period_month, period_year, tenant_id);


--
-- Name: payroll_periods payroll_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT payroll_periods_pkey PRIMARY KEY (id);


--
-- Name: permission_keys permission_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_keys
    ADD CONSTRAINT permission_keys_pkey PRIMARY KEY (key);


--
-- Name: pos_sessions pos_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_pkey PRIMARY KEY (id);


--
-- Name: pos_terminals pos_terminals_branch_id_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_branch_id_name_tenant_id_key UNIQUE (branch_id, name, tenant_id);


--
-- Name: pos_terminals pos_terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_pkey PRIMARY KEY (id);


--
-- Name: positions positions_code_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_code_tenant_id_key UNIQUE (code, tenant_id);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: print_jobs print_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: print_jobs print_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_pkey PRIMARY KEY (id);


--
-- Name: printer_agents printer_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printer_agents
    ADD CONSTRAINT printer_agents_pkey PRIMARY KEY (branch_id);


--
-- Name: printers printers_branch_id_role_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_branch_id_role_tenant_id_key UNIQUE (branch_id, role, tenant_id);


--
-- Name: printers printers_id_tenant_branch_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_id_tenant_branch_unique UNIQUE (id, tenant_id, branch_id);


--
-- Name: printers printers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reconcile_run_log reconcile_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconcile_run_log
    ADD CONSTRAINT reconcile_run_log_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_branch_id_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_branch_id_name_tenant_id_key UNIQUE (branch_id, name, tenant_id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: staff_permissions staff_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_pkey PRIMARY KEY (id);


--
-- Name: stock_levels stock_levels_ingredient_branch_location_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_ingredient_branch_tenant_key UNIQUE (ingredient_id, branch_id, tenant_id);


--
-- Name: stock_levels stock_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stocktake_lines stocktake_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_pkey PRIMARY KEY (id);


--
-- Name: stocktake_sessions stocktake_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_pkey PRIMARY KEY (id);


--
-- Name: summary_run_queue summary_run_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_run_queue
    ADD CONSTRAINT summary_run_queue_pkey PRIMARY KEY (id);


--
-- Name: supplier_invoices supplier_invoices_invoice_number_supplier_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_invoice_number_supplier_id_tenant_id_key UNIQUE (invoice_number, supplier_id, tenant_id);


--
-- Name: supplier_invoices supplier_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id);


--
-- Name: supplier_invoices supplier_invoices_source_required; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_source_required CHECK (((grn_id IS NOT NULL) OR (po_id IS NOT NULL))) NOT VALID;


--
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_name_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_name_tenant_id_key UNIQUE (name, tenant_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_key_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_tenant_id_key UNIQUE (key, tenant_id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tables tables_branch_id_number_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_branch_id_number_tenant_id_key UNIQUE (branch_id, number, tenant_id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: tax_invoice_events tax_invoice_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_events
    ADD CONSTRAINT tax_invoice_events_pkey PRIMARY KEY (id);


--
-- Name: tax_invoice_orders tax_invoice_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_orders
    ADD CONSTRAINT tax_invoice_orders_pkey PRIMARY KEY (tax_invoice_id, order_id);


--
-- Name: tax_invoices tax_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: tenants tenants_tax_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_tax_code_key UNIQUE (tax_code);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_provider_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_provider_request_id_key UNIQUE (provider, request_id);


--
-- Name: branches_tenant_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_tenant_code_unique ON public.branches USING btree (tenant_id, code) WHERE (code IS NOT NULL);


--
-- Name: cash_entries_branch_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cash_entries_branch_date_idx ON public.cash_entries USING btree (branch_id, entry_date);


--
-- Name: idx_archive_run_log_branch_id_6c594ba9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archive_run_log_branch_id_6c594ba9 ON public.archive_run_log USING btree (branch_id);


--
-- Name: idx_archive_run_log_triggered_by_66a6bf38; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archive_run_log_triggered_by_66a6bf38 ON public.archive_run_log USING btree (triggered_by);


--
-- Name: idx_arl_failure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arl_failure ON public.archive_run_log USING btree (tenant_id, outcome, created_at DESC) WHERE (outcome = ANY (ARRAY['provider_error'::text, 'storage_error'::text, 'invalid_payload'::text, 'hash_mismatch'::text, 'giveup'::text]));


--
-- Name: idx_arl_invoice_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arl_invoice_recent ON public.archive_run_log USING btree (tax_invoice_id, created_at DESC);


--
-- Name: idx_arl_tenant_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arl_tenant_recent ON public.archive_run_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_attendance_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_branch ON public.attendance_records USING btree (branch_id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance_records USING btree (branch_id, date);


--
-- Name: idx_attendance_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_employee ON public.attendance_records USING btree (employee_id);


--
-- Name: idx_attendance_records_shift_id_8e4aba6e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_records_shift_id_8e4aba6e ON public.attendance_records USING btree (shift_id);


--
-- Name: idx_attendance_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_tenant ON public.attendance_records USING btree (tenant_id);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_tenant_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_tenant_entity_created ON public.audit_logs USING btree (tenant_id, entity_type, created_at DESC);


--
-- Name: INDEX idx_audit_logs_tenant_entity_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_audit_logs_tenant_entity_created IS 'Hot path for /admin/staff/audit list (tenant_id + entity_type filter, created_at DESC sort). Supersedes idx_audit_logs_tenant.';


--
-- Name: idx_audit_logs_user_id_d1de4b96; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id_d1de4b96 ON public.audit_logs USING btree (user_id);


--
-- Name: idx_bac_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bac_branch ON public.branch_attendance_config USING btree (branch_id);


--
-- Name: idx_bac_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bac_tenant ON public.branch_attendance_config USING btree (tenant_id);


--
-- Name: idx_bmidl_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bmidl_branch ON public.branch_menu_item_daily_limits USING btree (branch_id, limit_date);


--
-- Name: idx_bmidl_lookup_pos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bmidl_lookup_pos ON public.branch_menu_item_daily_limits USING btree (branch_id, limit_date, menu_item_id);


--
-- Name: idx_bmidl_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bmidl_tenant ON public.branch_menu_item_daily_limits USING btree (tenant_id);


--
-- Name: idx_branch_feature_flags_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_feature_flags_enabled ON public.branch_feature_flags USING btree (branch_id, enabled) WHERE (enabled = true);


--
-- Name: idx_branch_feature_flags_enabled_by_a0097d87; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_feature_flags_enabled_by_a0097d87 ON public.branch_feature_flags USING btree (enabled_by);


--
-- Name: idx_branch_menu_item_daily_limits_menu_item_id_aa154d26; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_menu_item_daily_limits_menu_item_id_aa154d26 ON public.branch_menu_item_daily_limits USING btree (menu_item_id);


--
-- Name: idx_branch_zones_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_zones_branch ON public.branch_zones USING btree (branch_id);


--
-- Name: idx_branch_zones_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_zones_tenant ON public.branch_zones USING btree (tenant_id);


--
-- Name: idx_branches_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branches_tenant ON public.branches USING btree (tenant_id);


--
-- Name: idx_employees_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_profile ON public.employees USING btree (profile_id);


--
-- Name: idx_employees_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_tenant ON public.employees USING btree (tenant_id);


--
-- Name: idx_goods_received_notes_created_by_e3d378f4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_received_notes_created_by_e3d378f4 ON public.goods_received_notes USING btree (created_by);


--
-- Name: idx_goods_received_notes_po_id_b87bec1f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_received_notes_po_id_b87bec1f ON public.goods_received_notes USING btree (po_id);


--
-- Name: idx_goods_received_notes_received_by_b98992aa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_received_notes_received_by_b98992aa ON public.goods_received_notes USING btree (received_by);


--
-- Name: idx_goods_received_notes_supplier_id_0115936f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_received_notes_supplier_id_0115936f ON public.goods_received_notes USING btree (supplier_id);


--
-- Name: idx_grn_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_branch ON public.goods_received_notes USING btree (branch_id);


--
-- Name: idx_grn_items_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_expiry ON public.grn_items USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);


--
-- Name: idx_grn_items_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_grn ON public.grn_items USING btree (grn_id);


--
-- Name: idx_grn_items_ingredient_id_fd8052b7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_ingredient_id_fd8052b7 ON public.grn_items USING btree (ingredient_id);


--
-- Name: idx_grn_items_requires_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_requires_review ON public.grn_items USING btree (tenant_id) WHERE (requires_review = true);


--
-- Name: idx_grn_items_tenant_id_60f765ec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_tenant_id_60f765ec ON public.grn_items USING btree (tenant_id);


--
-- Name: idx_grn_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_tenant ON public.goods_received_notes USING btree (tenant_id);


--
-- Name: idx_ingredients_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_category ON public.ingredients USING btree (tenant_id, category);


--
-- Name: idx_ingredients_item_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_item_kind ON public.ingredients USING btree (tenant_id, item_kind);


--
-- Name: idx_ingredients_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_tenant ON public.ingredients USING btree (tenant_id);



--
-- Name: idx_kds_station_categories_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_station_categories_category ON public.kds_station_categories USING btree (category_id);


--
-- Name: idx_kds_station_categories_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_station_categories_station ON public.kds_station_categories USING btree (station_id);


--
-- Name: idx_kds_station_categories_tenant_id_0720dfdc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_station_categories_tenant_id_0720dfdc ON public.kds_station_categories USING btree (tenant_id);


--
-- Name: idx_kds_stations_active_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_stations_active_position ON public.kds_stations USING btree (tenant_id, branch_id, is_active, "position");


--
-- Name: idx_kds_stations_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_stations_branch ON public.kds_stations USING btree (branch_id);


--
-- Name: idx_kds_tickets_board_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_board_live ON public.kds_tickets USING btree (tenant_id, branch_id, status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'preparing'::text, 'ready'::text]));


--
-- Name: idx_kds_tickets_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_branch ON public.kds_tickets USING btree (branch_id);


--
-- Name: idx_kds_tickets_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_branch_created ON public.kds_tickets USING btree (branch_id, created_at) INCLUDE (tenant_id, status, station_id, order_id, order_item_id, kitchen_send_batch_id, bumped_at, updated_at);


--
-- Name: idx_kds_tickets_bumped_by_c232d761; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_bumped_by_c232d761 ON public.kds_tickets USING btree (bumped_by);


--
-- Name: idx_kds_tickets_kitchen_send_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_kitchen_send_batch ON public.kds_tickets USING btree (kitchen_send_batch_id);


--
-- Name: idx_kds_tickets_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_order ON public.kds_tickets USING btree (order_id);


--
-- Name: idx_kds_tickets_station; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_station ON public.kds_tickets USING btree (station_id);


--
-- Name: idx_kds_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_status ON public.kds_tickets USING btree (branch_id, station_id, status);


--
-- Name: idx_kds_tickets_tenant_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_tenant_branch_created ON public.kds_tickets USING btree (tenant_id, branch_id, created_at);


--
-- Name: idx_kds_tickets_tenant_branch_created_live; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_tenant_branch_created_live ON public.kds_tickets USING btree (tenant_id, branch_id, created_at) INCLUDE (status, station_id, order_id, order_item_id, kitchen_send_batch_id, bumped_at, updated_at) WHERE (status = ANY (ARRAY['pending'::text, 'preparing'::text, 'ready'::text]));


--
-- Name: idx_kitchen_send_batches_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_send_batches_branch_created ON public.kitchen_send_batches USING btree (tenant_id, branch_id, created_at);


--
-- Name: idx_kitchen_send_batches_branch_id_c7a2fb0a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_send_batches_branch_id_c7a2fb0a ON public.kitchen_send_batches USING btree (branch_id);


--
-- Name: idx_kitchen_send_batches_created_by_a2cc5ede; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_send_batches_created_by_a2cc5ede ON public.kitchen_send_batches USING btree (created_by);


--
-- Name: idx_kitchen_send_batches_order_id_7d0d5887; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_send_batches_order_id_7d0d5887 ON public.kitchen_send_batches USING btree (order_id);


--
-- Name: idx_menu_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_categories_tenant ON public.menu_categories USING btree (tenant_id);


--
-- Name: idx_menu_item_available_sides_main; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_available_sides_main ON public.menu_item_available_sides USING btree (main_item_id);


--
-- Name: idx_menu_item_available_sides_side; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_available_sides_side ON public.menu_item_available_sides USING btree (side_item_id);


--
-- Name: idx_menu_item_available_sides_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_available_sides_tenant ON public.menu_item_available_sides USING btree (tenant_id);


--
-- Name: idx_menu_item_modifiers_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_modifiers_item ON public.menu_item_modifiers USING btree (item_id);


--
-- Name: idx_menu_item_modifiers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_modifiers_tenant ON public.menu_item_modifiers USING btree (tenant_id);


--
-- Name: idx_menu_item_variants_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_variants_item ON public.menu_item_variants USING btree (item_id);


--
-- Name: idx_menu_item_variants_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_variants_tenant ON public.menu_item_variants USING btree (tenant_id);


--
-- Name: idx_menu_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_category ON public.menu_items USING btree (category_id);


--
-- Name: idx_menu_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_tenant ON public.menu_items USING btree (tenant_id);


--
-- Name: idx_mv_daily_revenue_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_daily_revenue_branch_date ON public.mv_daily_revenue USING btree (branch_id, date);


--
-- Name: idx_mv_daily_revenue_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk ON public.mv_daily_revenue USING btree (date, branch_id, tenant_id);


--
-- Name: idx_mv_inv_stock_alerts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_inv_stock_alerts ON public.mv_inventory_stock_current USING btree (branch_id) WHERE (reorder_point IS NOT NULL);


--
-- Name: idx_mv_top_items_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_top_items_pk ON public.mv_top_items USING btree (period_start, branch_id, tenant_id, menu_item_id);


--
-- Name: idx_notifications_target_branch_id_2ee714f2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_target_branch_id_2ee714f2 ON public.notifications USING btree (target_branch_id);


--
-- Name: idx_one_active_stocktake_per_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_stocktake_per_branch ON public.stocktake_sessions USING btree (branch_id, tenant_id) WHERE (status = 'in_progress'::text);


--
-- Name: idx_order_daily_counters_branch_id_9f5a26cd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_daily_counters_branch_id_9f5a26cd ON public.order_daily_counters USING btree (branch_id);


--
-- Name: idx_order_daily_counters_tenant_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_daily_counters_tenant_branch ON public.order_daily_counters USING btree (tenant_id, branch_id);


--
-- Name: idx_order_items_finance_live_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_finance_live_order ON public.order_items USING btree (tenant_id, order_id, menu_item_id) INCLUDE (item_name, quantity, subtotal, vat_rate) WHERE (status <> 'cancelled'::text);


--
-- Name: idx_order_items_menu_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_menu_item ON public.order_items USING btree (menu_item_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_priority_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_priority_active ON public.order_items USING btree (order_id, is_priority, updated_at DESC) WHERE ((is_priority = true) AND (status = ANY (ARRAY['pending'::text, 'preparing'::text])));


--
-- Name: idx_order_items_priority_marked_by_fc9fa791; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_priority_marked_by_fc9fa791 ON public.order_items USING btree (priority_marked_by);


--
-- Name: idx_order_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_tenant ON public.order_items USING btree (tenant_id);


--
-- Name: idx_order_items_tenant_order_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_tenant_order_menu ON public.order_items USING btree (tenant_id, order_id, menu_item_id) INCLUDE (item_name, variant_name, quantity, unit_price, status, note);


--
-- Name: idx_order_items_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_variant_id ON public.order_items USING btree (variant_id);


--
-- Name: idx_order_status_history_changed_by_c2e587c8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_changed_by_c2e587c8 ON public.order_status_history USING btree (changed_by);


--
-- Name: idx_order_status_history_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_order ON public.order_status_history USING btree (order_id);


--
-- Name: idx_order_status_history_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_tenant ON public.order_status_history USING btree (tenant_id);


--
-- Name: idx_orders_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_branch ON public.orders USING btree (branch_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- Name: idx_orders_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_by ON public.orders USING btree (created_by);


--
-- Name: idx_orders_merge_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_merge_request_key ON public.orders USING btree (id, merge_request_key) WHERE (merge_request_key IS NOT NULL);


--
-- Name: idx_orders_merged_into; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_merged_into ON public.orders USING btree (merged_into_order_id) WHERE (merged_into_order_id IS NOT NULL);


--
-- Name: idx_orders_merged_into_order_id_b582bef8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_merged_into_order_id_b582bef8 ON public.orders USING btree (merged_into_order_id);


--
-- Name: idx_orders_pos_active_branch_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_active_branch_created_id ON public.orders USING btree (tenant_id, branch_id, created_at DESC, id DESC) WHERE ((payment_status <> 'paid'::text) AND (status = ANY (ARRAY['new'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'served'::text])));


--
-- Name: idx_orders_pos_active_table_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_active_table_created ON public.orders USING btree (tenant_id, branch_id, table_id, created_at DESC) WHERE ((table_id IS NOT NULL) AND (payment_status <> 'paid'::text) AND (status = ANY (ARRAY['new'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'served'::text])));


--
-- Name: idx_orders_pos_archived_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_archived_created_id ON public.orders USING btree (tenant_id, branch_id, created_at DESC, id DESC) WHERE ((payment_status = 'paid'::text) OR (status = 'cancelled'::text));


--
-- Name: idx_orders_pos_archived_session_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_archived_session_created_id ON public.orders USING btree (tenant_id, branch_id, pos_session_id, created_at DESC, id DESC) WHERE ((payment_status = 'paid'::text) OR (status = 'cancelled'::text));


--
-- Name: idx_orders_pos_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_session ON public.orders USING btree (pos_session_id);


--
-- Name: idx_orders_pos_session_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_session_created_at ON public.orders USING btree (pos_session_id, created_at) WHERE (pos_session_id IS NOT NULL);


--
-- Name: idx_orders_pos_session_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pos_session_payment_status ON public.orders USING btree (pos_session_id, payment_status, status) WHERE (pos_session_id IS NOT NULL);


--
-- Name: idx_orders_priority_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_priority_active ON public.orders USING btree (branch_id, is_priority, created_at DESC) WHERE ((is_priority = true) AND (status <> ALL (ARRAY['completed'::text, 'cancelled'::text])));


--
-- Name: idx_orders_priority_marked_by_02a770f2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_priority_marked_by_02a770f2 ON public.orders USING btree (priority_marked_by);


--
-- Name: idx_orders_split_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_split_from ON public.orders USING btree (split_from_order_id) WHERE (split_from_order_id IS NOT NULL);


--
-- Name: idx_orders_split_from_order_id_5f6b79b1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_split_from_order_id_5f6b79b1 ON public.orders USING btree (split_from_order_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_table ON public.orders USING btree (table_id);


--
-- Name: idx_orders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tenant ON public.orders USING btree (tenant_id);


--
-- Name: idx_orders_tenant_branch_pos_session_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tenant_branch_pos_session_created ON public.orders USING btree (tenant_id, branch_id, pos_session_id, created_at DESC);


--
-- Name: idx_payments_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_branch ON public.payments USING btree (branch_id);


--
-- Name: idx_payments_completed_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_completed_paid_at ON public.payments USING btree (tenant_id, branch_id, paid_at DESC) WHERE ((status = 'completed'::text) AND (paid_at IS NOT NULL));


--
-- Name: idx_payments_created_by_4e7fba55; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_by_4e7fba55 ON public.payments USING btree (created_by);


--
-- Name: idx_payments_finance_tenant_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_finance_tenant_paid_at ON public.payments USING btree (tenant_id, status, paid_at) INCLUDE (branch_id, order_id, method, amount, created_by) WHERE (paid_at IS NOT NULL);


--
-- Name: idx_payments_live_revenue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_live_revenue ON public.payments USING btree (tenant_id, branch_id, status, paid_at) INCLUDE (order_id, method, amount) WHERE (paid_at IS NOT NULL);


--
-- Name: idx_payments_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_method ON public.payments USING btree (branch_id, method);


--
-- Name: idx_payments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order ON public.payments USING btree (order_id);


--
-- Name: idx_payments_order_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payments_order_active ON public.payments USING btree (order_id) WHERE (status <> 'failed'::text);


--
-- Name: idx_payments_provider_ref_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_ref_lookup ON public.payments USING btree (tenant_id, method, provider_ref, status) WHERE (provider_ref IS NOT NULL);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (branch_id, status);


--
-- Name: idx_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant ON public.payments USING btree (tenant_id);


--
-- Name: idx_payroll_periods_approved_by_1eb49995; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_periods_approved_by_1eb49995 ON public.payroll_periods USING btree (approved_by);


--
-- Name: idx_pe_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pe_employee ON public.payroll_entries USING btree (employee_id);


--
-- Name: idx_pe_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pe_period ON public.payroll_entries USING btree (payroll_period_id);


--
-- Name: idx_pe_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pe_tenant ON public.payroll_entries USING btree (tenant_id);


--
-- Name: idx_pos_sessions_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_branch ON public.pos_sessions USING btree (branch_id);


--
-- Name: idx_pos_sessions_closed_by_51b821f0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_closed_by_51b821f0 ON public.pos_sessions USING btree (closed_by);


--
-- Name: idx_pos_sessions_one_open_per_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pos_sessions_one_open_per_branch ON public.pos_sessions USING btree (branch_id) WHERE (status = 'open'::text);


--
-- Name: INDEX idx_pos_sessions_one_open_per_branch; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_pos_sessions_one_open_per_branch IS 'Per-branch single-active invariant (Owner D7, 2026-04-27). Replaces idx_pos_sessions_one_open. Branch chỉ được có 1 session status=open tại 1 thời điểm. INSERT thứ 2 raise 23505.';


--
-- Name: idx_pos_sessions_opened_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_opened_by ON public.pos_sessions USING btree (opened_by);


--
-- Name: idx_pos_sessions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_tenant ON public.pos_sessions USING btree (tenant_id);


--
-- Name: idx_pos_sessions_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_terminal ON public.pos_sessions USING btree (terminal_id);


--
-- Name: idx_pos_sessions_variance_approver_user_id_5a89b2c2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_variance_approver_user_id_5a89b2c2 ON public.pos_sessions USING btree (variance_approver_user_id);


--
-- Name: idx_pos_terminals_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_terminals_branch ON public.pos_terminals USING btree (branch_id);


--
-- Name: idx_pos_terminals_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_terminals_tenant ON public.pos_terminals USING btree (tenant_id);


--
-- Name: idx_positions_tenant_id_08ba36af; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_tenant_id_08ba36af ON public.positions USING btree (tenant_id);


--
-- Name: idx_pp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pp_status ON public.payroll_periods USING btree (status);


--
-- Name: idx_pp_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pp_tenant ON public.payroll_periods USING btree (tenant_id);


--
-- Name: idx_print_jobs_branch_id_8be57a3b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_branch_id_8be57a3b ON public.print_jobs USING btree (branch_id);


--
-- Name: idx_print_jobs_branch_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_branch_pending ON public.print_jobs USING btree (branch_id, status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_print_jobs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_created ON public.print_jobs USING btree (created_at DESC);


--
-- Name: idx_print_jobs_created_by_91726172; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_created_by_91726172 ON public.print_jobs USING btree (created_by);


--
-- Name: idx_print_jobs_last_retried_by_25d99b4f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_last_retried_by_25d99b4f ON public.print_jobs USING btree (last_retried_by);


--
-- Name: idx_print_jobs_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_order ON public.print_jobs USING btree (order_id);


--
-- Name: idx_print_jobs_printer_id_0a46993e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_printer_id_0a46993e ON public.print_jobs USING btree (printer_id);


--
-- Name: idx_print_jobs_reprinted_from_id_67621104; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_reprinted_from_id_67621104 ON public.print_jobs USING btree (reprinted_from_id);


--
-- Name: idx_print_jobs_tenant_id_23f21683; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_print_jobs_tenant_id_23f21683 ON public.print_jobs USING btree (tenant_id);


--
-- Name: idx_printer_agents_tenant_id_419da56e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printer_agents_tenant_id_419da56e ON public.printer_agents USING btree (tenant_id);


--
-- Name: idx_printers_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printers_branch ON public.printers USING btree (branch_id, is_active);


--
-- Name: idx_printers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printers_tenant ON public.printers USING btree (tenant_id);


--
-- Name: idx_profiles_branch_id_4d0c9619; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_branch_id_4d0c9619 ON public.profiles USING btree (branch_id);


--
-- Name: idx_profiles_position_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_position_id ON public.profiles USING btree (position_id);


--
-- Name: idx_profiles_tenant_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tenant_branch ON public.profiles USING btree (tenant_id, branch_id);


--
-- Name: idx_reconcile_run_log_branch_id_73f14c92; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconcile_run_log_branch_id_73f14c92 ON public.reconcile_run_log USING btree (branch_id);


--
-- Name: idx_reconcile_run_log_triggered_by_f7a43780; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconcile_run_log_triggered_by_f7a43780 ON public.reconcile_run_log USING btree (triggered_by);


--
-- Name: idx_refunds_approved_by_658200de; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_approved_by_658200de ON public.refunds USING btree (approved_by);


--
-- Name: idx_refunds_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_branch ON public.refunds USING btree (branch_id);


--
-- Name: idx_refunds_created_by_02e15753; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_created_by_02e15753 ON public.refunds USING btree (created_by);


--
-- Name: idx_refunds_order_id_ccc5a0cc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_order_id_ccc5a0cc ON public.refunds USING btree (order_id);


--
-- Name: idx_refunds_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_payment ON public.refunds USING btree (payment_id);


--
-- Name: idx_refunds_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_pending ON public.refunds USING btree (created_at DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_refunds_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_tenant ON public.refunds USING btree (tenant_id);


--
-- Name: idx_refunds_tenant_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_tenant_branch_created ON public.refunds USING btree (tenant_id, branch_id, created_at DESC);


--
-- Name: idx_refunds_tenant_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_tenant_status_created ON public.refunds USING btree (tenant_id, status, created_at DESC);


--
-- Name: idx_rrl_invoice_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rrl_invoice_recent ON public.reconcile_run_log USING btree (tax_invoice_id, created_at DESC);


--
-- Name: idx_rrl_outcome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rrl_outcome ON public.reconcile_run_log USING btree (tenant_id, outcome, created_at DESC) WHERE (outcome = ANY (ARRAY['provider_error'::text, 'giveup_24h'::text, 'unknown_status'::text]));


--
-- Name: idx_rrl_tenant_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rrl_tenant_recent ON public.reconcile_run_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_shifts_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_branch ON public.shifts USING btree (branch_id);


--
-- Name: idx_shifts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_tenant ON public.shifts USING btree (tenant_id);


--
-- Name: idx_sp_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_invoice ON public.supplier_payments USING btree (supplier_invoice_id);


--
-- Name: idx_sp_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sp_tenant ON public.supplier_payments USING btree (tenant_id);


--
-- Name: idx_srq_branch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srq_branch_date ON public.summary_run_queue USING btree (branch_id, summary_date DESC);


--
-- Name: idx_srq_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srq_invoice ON public.summary_run_queue USING btree (tax_invoice_id);


--
-- Name: idx_srq_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_srq_tenant_status ON public.summary_run_queue USING btree (tenant_id, status);


--
-- Name: idx_staff_permissions_branch_id_a22fcda0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_branch_id_a22fcda0 ON public.staff_permissions USING btree (branch_id);


--
-- Name: idx_staff_permissions_branch_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_permissions_branch_uniq ON public.staff_permissions USING btree (user_id, branch_id, permission_key) WHERE (branch_id IS NOT NULL);


--
-- Name: idx_staff_permissions_granted_by_660a1a2f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_granted_by_660a1a2f ON public.staff_permissions USING btree (granted_by);


--
-- Name: idx_staff_permissions_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_lookup ON public.staff_permissions USING btree (user_id, permission_key, branch_id);


--
-- Name: idx_staff_permissions_permission_key_c956f55b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_permission_key_c956f55b ON public.staff_permissions USING btree (permission_key);


--
-- Name: idx_staff_permissions_source_template_e6f20bd5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_source_template_e6f20bd5 ON public.staff_permissions USING btree (source_template);


--
-- Name: idx_staff_permissions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_tenant ON public.staff_permissions USING btree (tenant_id);


--
-- Name: idx_staff_permissions_tenant_wide_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_permissions_tenant_wide_uniq ON public.staff_permissions USING btree (user_id, permission_key) WHERE (branch_id IS NULL);


--
-- Name: idx_staff_permissions_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_permissions_validity ON public.staff_permissions USING btree (user_id, permission_key, branch_id, valid_until);


--
-- Name: idx_stock_levels_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_levels_branch ON public.stock_levels USING btree (branch_id);


--
-- Name: idx_stock_levels_ingredient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_levels_ingredient ON public.stock_levels USING btree (ingredient_id);



--
-- Name: idx_stock_levels_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_levels_tenant ON public.stock_levels USING btree (tenant_id);


--
-- Name: idx_stock_movements_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_branch ON public.stock_movements USING btree (branch_id);


--
-- Name: idx_stock_movements_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_created ON public.stock_movements USING btree (branch_id, created_at);


--
-- Name: idx_stock_movements_created_by_e9bc5b47; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_created_by_e9bc5b47 ON public.stock_movements USING btree (created_by);


--
-- Name: idx_stock_movements_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_grn ON public.stock_movements USING btree (grn_id) WHERE (grn_id IS NOT NULL);


--
-- Name: idx_stock_movements_grn_id_9656aa34; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_grn_id_9656aa34 ON public.stock_movements USING btree (grn_id);


--
-- Name: idx_stock_movements_ingredient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_ingredient ON public.stock_movements USING btree (ingredient_id);


--
-- Name: idx_stock_movements_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_issue ON public.stock_movements USING btree (issue_id) WHERE (issue_id IS NOT NULL);


--
-- Name: idx_stock_movements_issue_id_13db4131; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_issue_id_13db4131 ON public.stock_movements USING btree (issue_id);



--
-- Name: idx_stock_movements_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_order ON public.stock_movements USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: idx_stock_movements_order_id_121cb370; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_order_id_121cb370 ON public.stock_movements USING btree (order_id);


--
-- Name: idx_stock_movements_production_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_production_order ON public.stock_movements USING btree (production_order_id) WHERE (production_order_id IS NOT NULL);


--
-- Name: idx_stock_movements_production_order_id_0f61ca76; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_production_order_id_0f61ca76 ON public.stock_movements USING btree (production_order_id);


--
-- Name: idx_stock_movements_subtype; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_subtype ON public.stock_movements USING btree (movement_subtype) WHERE (movement_subtype IS NOT NULL);


--
-- Name: idx_stock_movements_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_tenant ON public.stock_movements USING btree (tenant_id);


--
-- Name: idx_stock_movements_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_transfer ON public.stock_movements USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);


--
-- Name: idx_stock_movements_transfer_id_62a0abb9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_transfer_id_62a0abb9 ON public.stock_movements USING btree (transfer_id);


--
-- Name: idx_stocktake_lines_client_op; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_lines_client_op ON public.stocktake_lines USING btree (client_op_id) WHERE (client_op_id IS NOT NULL);


--
-- Name: idx_stocktake_lines_counted_by_a9dd642f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_lines_counted_by_a9dd642f ON public.stocktake_lines USING btree (counted_by);


--
-- Name: idx_stocktake_lines_ingredient_id_c229bc45; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_lines_ingredient_id_c229bc45 ON public.stocktake_lines USING btree (ingredient_id);


--
-- Name: idx_stocktake_lines_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_lines_session ON public.stocktake_lines USING btree (session_id);


--
-- Name: idx_stocktake_lines_tenant_id_26d76845; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_lines_tenant_id_26d76845 ON public.stocktake_lines USING btree (tenant_id);


--
-- Name: idx_stocktake_sessions_auditor_branch_id_0d7c136b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_sessions_auditor_branch_id_0d7c136b ON public.stocktake_sessions USING btree (auditor_branch_id);


--
-- Name: idx_stocktake_sessions_auditor_id_471be1fd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_sessions_auditor_id_471be1fd ON public.stocktake_sessions USING btree (auditor_id);


--
-- Name: idx_stocktake_sessions_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_sessions_branch ON public.stocktake_sessions USING btree (branch_id);


--
-- Name: idx_stocktake_sessions_created_by_b57196fb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_sessions_created_by_b57196fb ON public.stocktake_sessions USING btree (created_by);



--
-- Name: idx_stocktake_sessions_offline_enabled_by_bd958ae7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_sessions_offline_enabled_by_bd958ae7 ON public.stocktake_sessions USING btree (offline_enabled_by);


--
-- Name: idx_stocktake_sessions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stocktake_sessions_tenant ON public.stocktake_sessions USING btree (tenant_id);


--
-- Name: idx_summary_run_queue_triggered_by_eda36dba; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_summary_run_queue_triggered_by_eda36dba ON public.summary_run_queue USING btree (triggered_by);


--
-- Name: idx_supplier_invoices_ap_aging; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_ap_aging ON public.supplier_invoices USING btree (tenant_id, payment_status, due_date) WHERE (payment_status <> 'paid'::text);


--
-- Name: idx_supplier_invoices_created_by_1bf04151; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_created_by_1bf04151 ON public.supplier_invoices USING btree (created_by);


--
-- Name: idx_supplier_invoices_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_grn ON public.supplier_invoices USING btree (grn_id);


--
-- Name: idx_supplier_invoices_po_id_07131ec9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_po_id_07131ec9 ON public.supplier_invoices USING btree (po_id);


--
-- Name: idx_supplier_invoices_supplier_id_59ea3f23; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_supplier_id_59ea3f23 ON public.supplier_invoices USING btree (supplier_id);


--
-- Name: idx_supplier_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_invoices_tenant ON public.supplier_invoices USING btree (tenant_id);


--
-- Name: idx_supplier_payments_created_by_53a88ee4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_payments_created_by_53a88ee4 ON public.supplier_payments USING btree (created_by);


--
-- Name: idx_suppliers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_tenant ON public.suppliers USING btree (tenant_id);


--
-- Name: idx_system_settings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_tenant ON public.system_settings USING btree (tenant_id);


--
-- Name: idx_tables_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_branch ON public.tables USING btree (branch_id);


--
-- Name: idx_tables_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_tenant ON public.tables USING btree (tenant_id);


--
-- Name: idx_tables_zone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_zone ON public.tables USING btree (zone_id);


--
-- Name: idx_tax_invoice_events_actor_id_173e1c12; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoice_events_actor_id_173e1c12 ON public.tax_invoice_events USING btree (actor_id);


--
-- Name: idx_tax_invoice_orders_branch_id_f3835e49; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoice_orders_branch_id_f3835e49 ON public.tax_invoice_orders USING btree (branch_id);


--
-- Name: idx_tax_invoices_archive_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_archive_pending ON public.tax_invoices USING btree (branch_id, issued_at) WHERE ((status = ANY (ARRAY['issued'::text, 'replaced'::text, 'cancelled'::text])) AND (pdf_url IS NULL) AND (archive_attempts < 5));


--
-- Name: INDEX idx_tax_invoices_archive_pending; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_tax_invoices_archive_pending IS 'Archive cron hot path. Partial WHERE covers all retention-required statuses (issued + replaced + cancelled) where archive not yet completed. Ordered ASC for oldest-first dequeue. archive_attempts < 5 caps retry count.';


--
-- Name: idx_tax_invoices_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_branch ON public.tax_invoices USING btree (branch_id);


--
-- Name: idx_tax_invoices_created_by_3b50cd78; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_created_by_3b50cd78 ON public.tax_invoices USING btree (created_by);


--
-- Name: idx_tax_invoices_finance_summary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_finance_summary ON public.tax_invoices USING btree (tenant_id, branch_id, status, issued_at, created_at);


--
-- Name: idx_tax_invoices_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_order ON public.tax_invoices USING btree (order_id);


--
-- Name: idx_tax_invoices_reconcile_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_reconcile_pending ON public.tax_invoices USING btree (branch_id, signing_started_at) WHERE ((status = ANY (ARRAY['signing'::text, 'submitted'::text])) AND (provider_ref IS NOT NULL));


--
-- Name: INDEX idx_tax_invoices_reconcile_pending; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_tax_invoices_reconcile_pending IS 'Reconcile cron hot path. Partial WHERE excludes terminal (cancelled/replaced/issued/not_required) and drafts (no provider call yet). Ordered ASC so oldest-first dequeue.';


--
-- Name: idx_tax_invoices_replaced_by_3404b431; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_replaced_by_3404b431 ON public.tax_invoices USING btree (replaced_by);


--
-- Name: idx_tax_invoices_replaced_for; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_replaced_for ON public.tax_invoices USING btree (replaced_for) WHERE (replaced_for IS NOT NULL);


--
-- Name: idx_tax_invoices_replaced_for_a7ad2670; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_replaced_for_a7ad2670 ON public.tax_invoices USING btree (replaced_for);


--
-- Name: idx_tax_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_status ON public.tax_invoices USING btree (tenant_id, status);


--
-- Name: idx_tax_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_invoices_tenant ON public.tax_invoices USING btree (tenant_id);


--
-- Name: idx_tenants_owner_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_owner_user_id ON public.tenants USING btree (owner_user_id);


--
-- Name: idx_tie_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tie_invoice ON public.tax_invoice_events USING btree (tax_invoice_id, created_at DESC);


--
-- Name: idx_tie_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tie_tenant_created ON public.tax_invoice_events USING btree (tenant_id, created_at DESC);


--
-- Name: idx_tio_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tio_invoice ON public.tax_invoice_orders USING btree (tax_invoice_id);


--
-- Name: idx_tio_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tio_order ON public.tax_invoice_orders USING btree (order_id);


--
-- Name: idx_tio_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tio_tenant ON public.tax_invoice_orders USING btree (tenant_id);


--
-- Name: idx_webhook_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_created ON public.webhook_events USING btree (created_at DESC);


--
-- Name: idx_webhook_events_finance_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_finance_failed ON public.webhook_events USING btree (tenant_id, processing_status, created_at) INCLUDE (payment_id) WHERE (processing_status = 'failed'::text);


--
-- Name: idx_webhook_events_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_payment ON public.webhook_events USING btree (payment_id);


--
-- Name: idx_webhook_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events USING btree (tenant_id);


--
-- Name: ix_notifications_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_entity ON public.notifications USING btree (entity_type, entity_id) WHERE (entity_type IS NOT NULL);


--
-- Name: ix_notifications_target_roles_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_target_roles_gin ON public.notifications USING gin (target_roles);


--
-- Name: ix_notifications_tenant_branch_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_tenant_branch_created ON public.notifications USING btree (tenant_id, target_branch_id, created_at DESC);


--
-- Name: ix_notifications_tenant_branch_created_cover; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_tenant_branch_created_cover ON public.notifications USING btree (tenant_id, target_branch_id, created_at DESC) INCLUDE (target_roles, expires_at);


--
-- Name: ix_notifications_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_tenant_created ON public.notifications USING btree (tenant_id, created_at DESC);


--
-- Name: kitchen_send_batches_branch_date_ticket_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX kitchen_send_batches_branch_date_ticket_number_unique ON public.kitchen_send_batches USING btree (tenant_id, branch_id, counter_date, kitchen_ticket_number);


--
-- Name: order_items_request_key_per_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_request_key_per_order_idx ON public.order_items USING btree (order_id, request_key) WHERE (request_key IS NOT NULL);


--
-- Name: orders_idempotency_per_tenant_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_idempotency_per_tenant_uidx ON public.orders USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: suppliers_tax_code_tenant_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX suppliers_tax_code_tenant_unique ON public.suppliers USING btree (tenant_id, tax_code) WHERE (tax_code IS NOT NULL);


--
-- Name: INDEX suppliers_tax_code_tenant_unique; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.suppliers_tax_code_tenant_unique IS 'Partial unique index that blocks duplicate non-null tax_code values inside one tenant.';


--
-- Name: uq_grn_active_draft_per_user_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_grn_active_draft_per_user_supplier ON public.goods_received_notes USING btree (tenant_id, created_by, supplier_id) WHERE ((status = 'draft'::text) AND (created_by IS NOT NULL));


--
-- Name: INDEX uq_grn_active_draft_per_user_supplier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.uq_grn_active_draft_per_user_supplier IS 'Partial UNIQUE: at most one in-flight draft GRN per (tenant, user, supplier). Enforces server-side draft semantics for /inventory/grn/new flow. Sprint 6 #3.';


--
-- Name: uq_mv_grn_price_baseline; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mv_grn_price_baseline ON public.mv_grn_price_baseline USING btree (tenant_id, supplier_id, ingredient_id, uom);


--
-- Name: uq_mv_inv_stock_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mv_inv_stock_current ON public.mv_inventory_stock_current USING btree (tenant_id, branch_id, ingredient_id);


--
-- Name: uq_mv_inv_value_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_mv_inv_value_ranking ON public.mv_inventory_value_ranking USING btree (tenant_id, branch_id, ingredient_id);


--
-- Name: uq_stocktake_lines_round; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_stocktake_lines_round ON public.stocktake_lines USING btree (session_id, ingredient_id, round_no);


--
-- Name: uq_tax_invoices_active_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tax_invoices_active_per_order ON public.tax_invoices USING btree (order_id) WHERE (status <> ALL (ARRAY['cancelled'::text, 'replaced'::text, 'not_required'::text]));


--
-- Name: uq_tax_invoices_active_per_summary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_tax_invoices_active_per_summary ON public.tax_invoices USING btree (tenant_id, branch_id, summary_date) WHERE ((invoice_kind = 'daily_summary'::text) AND (status <> ALL (ARRAY['cancelled'::text, 'replaced'::text])));


--
-- Name: ux_notifications_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_notifications_dedup ON public.notifications USING btree (tenant_id, dedup_key) WHERE (dedup_key IS NOT NULL);


--
-- Name: goods_received_notes notify_grn_created_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_grn_created_after_insert AFTER INSERT ON public.goods_received_notes FOR EACH ROW EXECUTE FUNCTION public.trg_notify_grn_created();


--
-- Name: orders notify_order_new_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_order_new_after_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_new();


--
-- Name: pos_sessions notify_pos_shift_variance_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_pos_shift_variance_after_update AFTER UPDATE OF status ON public.pos_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_notify_pos_shift_variance();


--
-- Name: stocktake_sessions notify_stocktake_completed_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_stocktake_completed_after_update AFTER UPDATE OF status ON public.stocktake_sessions FOR EACH ROW EXECUTE FUNCTION public.trg_notify_stocktake_completed();


--
-- Name: attendance_records trg_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: branch_menu_item_daily_limits trg_bmidl_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bmidl_updated_at BEFORE UPDATE ON public.branch_menu_item_daily_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: branch_attendance_config trg_branch_attendance_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branch_attendance_config_updated_at BEFORE UPDATE ON public.branch_attendance_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: branch_zones trg_branch_zones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branch_zones_updated_at BEFORE UPDATE ON public.branch_zones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



--
-- Name: branches trg_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: order_items trg_decrement_branch_menu_daily_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_decrement_branch_menu_daily_limit AFTER UPDATE OF status ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.decrement_branch_menu_daily_limit();


--
-- Name: employees trg_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: order_items trg_enforce_branch_menu_daily_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_branch_menu_daily_limit AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_menu_daily_limit();


--
-- Name: goods_received_notes trg_grn_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grn_updated_at BEFORE UPDATE ON public.goods_received_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: ingredients trg_ingredients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ingredients_updated_at BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



--
-- Name: kds_stations trg_kds_stations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kds_stations_updated_at BEFORE UPDATE ON public.kds_stations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: kds_tickets trg_kds_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kds_tickets_updated_at BEFORE UPDATE ON public.kds_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: menu_categories trg_menu_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: menu_item_available_sides trg_menu_item_available_sides_check_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_available_sides_check_tenant BEFORE INSERT OR UPDATE OF tenant_id, main_item_id, side_item_id ON public.menu_item_available_sides FOR EACH ROW EXECUTE FUNCTION public.check_sides_tenant();


--
-- Name: menu_item_modifiers trg_menu_item_modifiers_check_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_modifiers_check_tenant BEFORE INSERT OR UPDATE OF item_id, tenant_id ON public.menu_item_modifiers FOR EACH ROW EXECUTE FUNCTION public.check_variant_tenant();


--
-- Name: menu_item_modifiers trg_menu_item_modifiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_modifiers_updated_at BEFORE UPDATE ON public.menu_item_modifiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: menu_item_variants trg_menu_item_variants_check_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_variants_check_tenant BEFORE INSERT OR UPDATE OF item_id, tenant_id ON public.menu_item_variants FOR EACH ROW EXECUTE FUNCTION public.check_variant_tenant();


--
-- Name: menu_item_variants trg_menu_item_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_variants_updated_at BEFORE UPDATE ON public.menu_item_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: menu_items trg_menu_items_check_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_items_check_tenant BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.check_menu_item_tenant();


--
-- Name: menu_items trg_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: order_items trg_order_items_populate_vat_rate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_items_populate_vat_rate BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.populate_order_item_vat_rate();


--
-- Name: order_items trg_order_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_items_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: orders trg_order_release_table; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_release_table AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_release_table_on_order_status();


--
-- Name: orders trg_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: payments trg_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: payroll_entries trg_pe_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pe_updated_at BEFORE UPDATE ON public.payroll_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: pos_sessions trg_pos_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pos_sessions_updated_at BEFORE UPDATE ON public.pos_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: pos_terminals trg_pos_terminals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pos_terminals_updated_at BEFORE UPDATE ON public.pos_terminals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: payroll_periods trg_pp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: print_jobs trg_print_jobs_attach_document; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_print_jobs_attach_document BEFORE INSERT OR UPDATE OF payload ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.print_jobs_attach_document_trigger();


--
-- Name: printers trg_printers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_printers_updated_at BEFORE UPDATE ON public.printers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles trg_profiles_branch_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_branch_required BEFORE INSERT OR UPDATE OF position_id, branch_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public._auth_v2_check_branch_required();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: refunds trg_refunds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: shifts trg_shifts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shifts_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: supplier_payments trg_sp_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sp_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: staff_permissions trg_staff_permissions_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_permissions_scope BEFORE INSERT OR UPDATE OF permission_key, branch_id ON public.staff_permissions FOR EACH ROW EXECUTE FUNCTION private.enforce_staff_permission_scope();


--
-- Name: stock_levels trg_stock_levels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_levels_updated_at BEFORE UPDATE ON public.stock_levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: stock_movements trg_stock_movement_update_levels; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_movement_update_levels AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.trg_update_stock_on_movement();


--
-- Name: supplier_invoices trg_supplier_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_supplier_invoices_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: suppliers trg_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: kds_tickets trg_sync_order_item_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_order_item_status AFTER UPDATE OF status ON public.kds_tickets FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_status_from_kds();


--
-- Name: system_settings trg_system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tables trg_tables_check_zone_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tables_check_zone_tenant BEFORE INSERT OR UPDATE OF zone_id, tenant_id ON public.tables FOR EACH ROW EXECUTE FUNCTION public.check_table_zone_tenant();


--
-- Name: tables trg_tables_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tables_updated_at BEFORE UPDATE ON public.tables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tax_invoices trg_tax_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tax_invoices_updated_at BEFORE UPDATE ON public.tax_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tenants trg_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tax_invoice_orders trg_tio_one_active_summary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tio_one_active_summary BEFORE INSERT ON public.tax_invoice_orders FOR EACH ROW EXECUTE FUNCTION public.tio_assert_one_active_summary_per_order();


--
-- Name: archive_run_log archive_run_log_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_run_log
    ADD CONSTRAINT archive_run_log_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: archive_run_log archive_run_log_tax_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_run_log
    ADD CONSTRAINT archive_run_log_tax_invoice_id_fkey FOREIGN KEY (tax_invoice_id) REFERENCES public.tax_invoices(id) ON DELETE CASCADE;


--
-- Name: archive_run_log archive_run_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_run_log
    ADD CONSTRAINT archive_run_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: archive_run_log archive_run_log_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_run_log
    ADD CONSTRAINT archive_run_log_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_records_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: attendance_records attendance_records_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: branch_attendance_config branch_attendance_config_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_attendance_config
    ADD CONSTRAINT branch_attendance_config_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_attendance_config branch_attendance_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_attendance_config
    ADD CONSTRAINT branch_attendance_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: branch_feature_flags branch_feature_flags_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_feature_flags
    ADD CONSTRAINT branch_feature_flags_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_feature_flags branch_feature_flags_enabled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_feature_flags
    ADD CONSTRAINT branch_feature_flags_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES auth.users(id);


--
-- Name: branch_menu_item_daily_limits branch_menu_item_daily_limits_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_item_daily_limits
    ADD CONSTRAINT branch_menu_item_daily_limits_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_menu_item_daily_limits branch_menu_item_daily_limits_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_item_daily_limits
    ADD CONSTRAINT branch_menu_item_daily_limits_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: branch_menu_item_daily_limits branch_menu_item_daily_limits_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_menu_item_daily_limits
    ADD CONSTRAINT branch_menu_item_daily_limits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: branch_zones branch_zones_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_zones
    ADD CONSTRAINT branch_zones_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: branch_zones branch_zones_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_zones
    ADD CONSTRAINT branch_zones_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: branches branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cash_entries cash_entries_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: cash_entries cash_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: cash_entries cash_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_entries
    ADD CONSTRAINT cash_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: employees employees_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: employees employees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: goods_received_notes goods_received_notes_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: goods_received_notes goods_received_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: goods_received_notes goods_received_notes_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.profiles(id);


--
-- Name: goods_received_notes goods_received_notes_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: goods_received_notes goods_received_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_received_notes
    ADD CONSTRAINT goods_received_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: grn_items grn_items_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE CASCADE;


--
-- Name: grn_items grn_items_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE RESTRICT;


--
-- Name: grn_items grn_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: ingredients ingredients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;



--
-- Name: kds_station_categories kds_station_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: kds_station_categories kds_station_categories_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kds_stations(id) ON DELETE CASCADE;


--
-- Name: kds_station_categories kds_station_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: kds_stations kds_stations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_stations
    ADD CONSTRAINT kds_stations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: kds_stations kds_stations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_stations
    ADD CONSTRAINT kds_stations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: kds_tickets kds_tickets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: kds_tickets kds_tickets_bumped_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_bumped_by_fkey FOREIGN KEY (bumped_by) REFERENCES public.profiles(id);


--
-- Name: kds_tickets kds_tickets_kitchen_send_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_kitchen_send_batch_id_fkey FOREIGN KEY (kitchen_send_batch_id) REFERENCES public.kitchen_send_batches(id) ON DELETE SET NULL;


--
-- Name: kds_tickets kds_tickets_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: kds_tickets kds_tickets_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: kds_tickets kds_tickets_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kds_stations(id) ON DELETE CASCADE;


--
-- Name: kds_tickets kds_tickets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: kitchen_send_batches kitchen_send_batches_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: kitchen_send_batches kitchen_send_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: kitchen_send_batches kitchen_send_batches_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: kitchen_send_batches kitchen_send_batches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_send_batches
    ADD CONSTRAINT kitchen_send_batches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: menu_categories menu_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: menu_item_available_sides menu_item_available_sides_main_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_available_sides
    ADD CONSTRAINT menu_item_available_sides_main_item_id_fkey FOREIGN KEY (main_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_available_sides menu_item_available_sides_side_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_available_sides
    ADD CONSTRAINT menu_item_available_sides_side_item_id_fkey FOREIGN KEY (side_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_available_sides menu_item_available_sides_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_available_sides
    ADD CONSTRAINT menu_item_available_sides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: menu_item_modifiers menu_item_modifiers_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_modifiers menu_item_modifiers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: menu_item_variants menu_item_variants_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_variants menu_item_variants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_variants
    ADD CONSTRAINT menu_item_variants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_target_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_target_branch_id_fkey FOREIGN KEY (target_branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_daily_counters order_daily_counters_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_daily_counters
    ADD CONSTRAINT order_daily_counters_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: order_daily_counters order_daily_counters_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_daily_counters
    ADD CONSTRAINT order_daily_counters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_priority_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_priority_marked_by_fkey FOREIGN KEY (priority_marked_by) REFERENCES public.profiles(id);


--
-- Name: order_items order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.menu_item_variants(id) ON DELETE SET NULL;


--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: orders orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: orders orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: orders orders_merged_into_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_merged_into_order_id_fkey FOREIGN KEY (merged_into_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: orders orders_pos_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;


--
-- Name: orders orders_priority_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_priority_marked_by_fkey FOREIGN KEY (priority_marked_by) REFERENCES public.profiles(id);


--
-- Name: orders orders_split_from_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_split_from_order_id_fkey FOREIGN KEY (split_from_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: orders orders_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payments payments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payroll_entries payroll_entries_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: payroll_entries payroll_entries_payroll_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_payroll_period_id_fkey FOREIGN KEY (payroll_period_id) REFERENCES public.payroll_periods(id) ON DELETE CASCADE;


--
-- Name: payroll_entries payroll_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payroll_periods payroll_periods_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT payroll_periods_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: payroll_periods payroll_periods_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_periods
    ADD CONSTRAINT payroll_periods_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: pos_sessions pos_sessions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: pos_sessions pos_sessions_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.profiles(id);


--
-- Name: pos_sessions pos_sessions_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.profiles(id);


--
-- Name: pos_sessions pos_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: pos_sessions pos_sessions_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.pos_terminals(id) ON DELETE SET NULL;


--
-- Name: pos_sessions pos_sessions_variance_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_variance_approver_user_id_fkey FOREIGN KEY (variance_approver_user_id) REFERENCES public.profiles(id);


--
-- Name: pos_terminals pos_terminals_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: pos_terminals pos_terminals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: positions positions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: print_jobs print_jobs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: print_jobs print_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: print_jobs print_jobs_last_retried_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_last_retried_by_fkey FOREIGN KEY (last_retried_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: print_jobs print_jobs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: print_jobs print_jobs_printer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_printer_id_fkey FOREIGN KEY (printer_id) REFERENCES public.printers(id) ON DELETE RESTRICT;


--
-- Name: print_jobs print_jobs_reprinted_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_reprinted_from_id_fkey FOREIGN KEY (reprinted_from_id) REFERENCES public.print_jobs(id) ON DELETE SET NULL;


--
-- Name: print_jobs print_jobs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: printer_agents printer_agents_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printer_agents
    ADD CONSTRAINT printer_agents_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: printer_agents printer_agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printer_agents
    ADD CONSTRAINT printer_agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: printers printers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: printers printers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reconcile_run_log reconcile_run_log_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconcile_run_log
    ADD CONSTRAINT reconcile_run_log_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: reconcile_run_log reconcile_run_log_tax_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconcile_run_log
    ADD CONSTRAINT reconcile_run_log_tax_invoice_id_fkey FOREIGN KEY (tax_invoice_id) REFERENCES public.tax_invoices(id) ON DELETE CASCADE;


--
-- Name: reconcile_run_log reconcile_run_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconcile_run_log
    ADD CONSTRAINT reconcile_run_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reconcile_run_log reconcile_run_log_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconcile_run_log
    ADD CONSTRAINT reconcile_run_log_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: refunds refunds_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: refunds refunds_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: refunds refunds_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: refunds refunds_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: staff_permissions staff_permissions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: staff_permissions staff_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: staff_permissions staff_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permission_keys(key) ON DELETE RESTRICT;


--
-- Name: staff_permissions staff_permissions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: staff_permissions staff_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_permissions
    ADD CONSTRAINT staff_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: stock_levels stock_levels_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: stock_levels stock_levels_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;



--
-- Name: stock_levels stock_levels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: stock_movements stock_movements_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;



--
-- Name: stock_movements stock_movements_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: stocktake_lines stocktake_lines_counted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES auth.users(id);


--
-- Name: stocktake_lines stocktake_lines_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE RESTRICT;


--
-- Name: stocktake_lines stocktake_lines_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE;


--
-- Name: stocktake_lines stocktake_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_lines
    ADD CONSTRAINT stocktake_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: stocktake_sessions stocktake_sessions_auditor_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_auditor_branch_id_fkey FOREIGN KEY (auditor_branch_id) REFERENCES public.branches(id);


--
-- Name: stocktake_sessions stocktake_sessions_auditor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_auditor_id_fkey FOREIGN KEY (auditor_id) REFERENCES auth.users(id);


--
-- Name: stocktake_sessions stocktake_sessions_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;


--
-- Name: stocktake_sessions stocktake_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;



--
-- Name: stocktake_sessions stocktake_sessions_offline_enabled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_offline_enabled_by_fkey FOREIGN KEY (offline_enabled_by) REFERENCES auth.users(id);


--
-- Name: stocktake_sessions stocktake_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stocktake_sessions
    ADD CONSTRAINT stocktake_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: summary_run_queue summary_run_queue_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_run_queue
    ADD CONSTRAINT summary_run_queue_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: summary_run_queue summary_run_queue_tax_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_run_queue
    ADD CONSTRAINT summary_run_queue_tax_invoice_id_fkey FOREIGN KEY (tax_invoice_id) REFERENCES public.tax_invoices(id) ON DELETE SET NULL;


--
-- Name: summary_run_queue summary_run_queue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_run_queue
    ADD CONSTRAINT summary_run_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: summary_run_queue summary_run_queue_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_run_queue
    ADD CONSTRAINT summary_run_queue_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: supplier_invoices supplier_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: supplier_invoices supplier_invoices_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_received_notes(id) ON DELETE SET NULL;


--
-- Name: supplier_invoices supplier_invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


--
-- Name: supplier_invoices supplier_invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: supplier_payments supplier_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: supplier_payments supplier_payments_supplier_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_invoice_id_fkey FOREIGN KEY (supplier_invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tables tables_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: tables tables_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tables tables_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.branch_zones(id) ON DELETE SET NULL;


--
-- Name: tax_invoice_events tax_invoice_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_events
    ADD CONSTRAINT tax_invoice_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tax_invoice_events tax_invoice_events_tax_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_events
    ADD CONSTRAINT tax_invoice_events_tax_invoice_id_fkey FOREIGN KEY (tax_invoice_id) REFERENCES public.tax_invoices(id) ON DELETE RESTRICT;


--
-- Name: tax_invoice_events tax_invoice_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_events
    ADD CONSTRAINT tax_invoice_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tax_invoice_orders tax_invoice_orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_orders
    ADD CONSTRAINT tax_invoice_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: tax_invoice_orders tax_invoice_orders_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_orders
    ADD CONSTRAINT tax_invoice_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: tax_invoice_orders tax_invoice_orders_tax_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_orders
    ADD CONSTRAINT tax_invoice_orders_tax_invoice_id_fkey FOREIGN KEY (tax_invoice_id) REFERENCES public.tax_invoices(id) ON DELETE CASCADE;


--
-- Name: tax_invoice_orders tax_invoice_orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoice_orders
    ADD CONSTRAINT tax_invoice_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tax_invoices tax_invoices_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- Name: tax_invoices tax_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: tax_invoices tax_invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: tax_invoices tax_invoices_replaced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_replaced_by_fkey FOREIGN KEY (replaced_by) REFERENCES public.tax_invoices(id);


--
-- Name: tax_invoices tax_invoices_replaced_for_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_replaced_for_fkey FOREIGN KEY (replaced_for) REFERENCES public.tax_invoices(id) ON DELETE RESTRICT;


--
-- Name: tax_invoices tax_invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_invoices
    ADD CONSTRAINT tax_invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenants tenants_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: webhook_events webhook_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: webhook_events webhook_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: profiles Users can update own safe fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own safe fields" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: tenants Users can view own tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant" ON public.tenants FOR SELECT TO authenticated USING ((id = public.auth_tenant_id()));


--
-- Name: archive_run_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.archive_run_log ENABLE ROW LEVEL SECURITY;

--
-- Name: archive_run_log arl_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY arl_select ON public.archive_run_log FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records attendance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_select ON public.attendance_records FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = attendance_records.employee_id) AND (e.profile_id = auth.uid())))) OR public.has_permission_any('staff:view'::text) OR public.has_permission_any('hr:view_employee'::text))));


--
-- Name: attendance_records attendance_self_checkin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_self_checkin ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (((employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE ((e.profile_id = auth.uid()) AND (e.tenant_id = public.auth_tenant_id())))) AND (tenant_id = public.auth_tenant_id())));


--
-- Name: attendance_records attendance_self_checkout; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_self_checkout ON public.attendance_records FOR UPDATE TO authenticated USING (((employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE ((e.profile_id = auth.uid()) AND (e.tenant_id = public.auth_tenant_id())))) AND (tenant_id = public.auth_tenant_id()) AND (check_out IS NULL))) WITH CHECK (((employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE ((e.profile_id = auth.uid()) AND (e.tenant_id = public.auth_tenant_id())))) AND (tenant_id = public.auth_tenant_id())));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('settings:tenant'::text) OR public.has_permission_any('staff:assign_permission'::text))));


--
-- Name: branch_menu_item_daily_limits bmidl_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bmidl_select ON public.branch_menu_item_daily_limits FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR (public.auth_branch_id() = branch_id))));


--
-- Name: branch_menu_item_daily_limits bmidl_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bmidl_write ON public.branch_menu_item_daily_limits TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((public.auth_role() = ANY (ARRAY['manager'::text, 'staff'::text, 'chef'::text])) AND (public.auth_branch_id() = branch_id))))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR ((public.auth_role() = ANY (ARRAY['manager'::text, 'staff'::text, 'chef'::text])) AND (public.auth_branch_id() = branch_id)))));


--
-- Name: branch_attendance_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_attendance_config ENABLE ROW LEVEL SECURITY;

--
-- Name: branch_attendance_config branch_attendance_config_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_attendance_config_write ON public.branch_attendance_config TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: branch_feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_feature_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: branch_menu_item_daily_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_menu_item_daily_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: branch_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branch_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: branch_zones branch_zones_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_zones_write ON public.branch_zones TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: branches branches_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_delete ON public.branches FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('settings:tenant'::text)));


--
-- Name: branches branches_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_insert ON public.branches FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('settings:tenant'::text)));


--
-- Name: branches branches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_select ON public.branches FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: branches branches_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branches_update ON public.branches FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('settings:tenant'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('settings:tenant'::text)));


--
-- Name: cash_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_entries cash_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_entries_select ON public.cash_entries FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'finance:view'::text)));


--
-- Name: cash_entries cash_entries_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_entries_insert ON public.cash_entries FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'finance:expense_create'::text)));


--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('hr:view_employee'::text)));


--
-- Name: employees employees_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_select_self ON public.employees FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (profile_id = auth.uid())));


--
-- Name: POLICY employees_select_self ON employees; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY employees_select_self ON public.employees IS 'Self-read regression fix: every authenticated user can read their own employees row even without hr:view_employee. Required for /employee/* portal (clock, schedule, attendance, payslip, shift-register).';


--
-- Name: employees employees_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_write ON public.employees TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('hr:manage_employee'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('hr:manage_employee'::text)));


--
-- Name: branch_feature_flags feature_flags_read_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_flags_read_tenant ON public.branch_feature_flags FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_feature_flags.branch_id) AND (b.tenant_id = public.auth_tenant_id())))));


--
-- Name: branch_feature_flags feature_flags_write_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_flags_write_settings ON public.branch_feature_flags TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_feature_flags.branch_id) AND (b.tenant_id = public.auth_tenant_id())))) AND (public.has_permission(branch_id, 'settings:branch'::text) OR public.has_permission(NULL::bigint, 'settings:tenant'::text)))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_feature_flags.branch_id) AND (b.tenant_id = public.auth_tenant_id())))) AND (public.has_permission(branch_id, 'settings:branch'::text) OR public.has_permission(NULL::bigint, 'settings:tenant'::text))));


--
-- Name: goods_received_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: goods_received_notes grn_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_insert ON public.goods_received_notes FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'procurement:grn_create'::text)));


--
-- Name: grn_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;

--
-- Name: grn_items grn_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_items_delete ON public.grn_items FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_create'::text)));


--
-- Name: grn_items grn_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_items_insert ON public.grn_items FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_create'::text)));


--
-- Name: grn_items grn_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_items_select ON public.grn_items FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (private.can_access_grn_source(tenant_id, grn_id, 'procurement:read'::text) OR private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_create'::text) OR private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_confirm'::text) OR private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_amend'::text))));


--
-- Name: grn_items grn_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_items_update ON public.grn_items FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_create'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND private.can_access_grn_source(tenant_id, grn_id, 'procurement:grn_create'::text)));


--
-- Name: goods_received_notes grn_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_select ON public.goods_received_notes FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission(branch_id, 'procurement:read'::text) OR public.has_permission(branch_id, 'procurement:grn_create'::text) OR public.has_permission(branch_id, 'procurement:grn_confirm'::text) OR public.has_permission(branch_id, 'procurement:grn_amend'::text))));


--
-- Name: goods_received_notes grn_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grn_update ON public.goods_received_notes FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission(branch_id, 'procurement:grn_create'::text) OR public.has_permission(branch_id, 'procurement:grn_confirm'::text) OR public.has_permission(branch_id, 'procurement:grn_amend'::text)))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (public.has_permission(branch_id, 'procurement:grn_create'::text) OR public.has_permission(branch_id, 'procurement:grn_confirm'::text) OR public.has_permission(branch_id, 'procurement:grn_amend'::text))));


--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients ingredients_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_delete ON public.ingredients FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('inventory:write'::text)));


--
-- Name: ingredients ingredients_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_insert ON public.ingredients FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('inventory:write'::text)));


--
-- Name: ingredients ingredients_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_select ON public.ingredients FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('inventory:read'::text)));


--
-- Name: ingredients ingredients_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ingredients_update ON public.ingredients FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('inventory:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('inventory:write'::text)));



--
-- Name: kds_station_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kds_station_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: kds_station_categories kds_station_categories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_station_categories_delete ON public.kds_station_categories FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (station_id IN ( SELECT s.id
   FROM public.kds_stations s
  WHERE ((s.tenant_id = public.auth_tenant_id()) AND public.has_permission(s.branch_id, 'settings:branch'::text))))));


--
-- Name: POLICY kds_station_categories_delete ON kds_station_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY kds_station_categories_delete ON public.kds_station_categories IS 'KDS station category routing is branch floor settings: gate by station branch settings:branch, not menu category admin.';


--
-- Name: kds_station_categories kds_station_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_station_categories_insert ON public.kds_station_categories FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (station_id IN ( SELECT s.id
   FROM public.kds_stations s
  WHERE ((s.tenant_id = public.auth_tenant_id()) AND public.has_permission(s.branch_id, 'settings:branch'::text)))) AND (category_id IN ( SELECT c.id
   FROM public.menu_categories c
  WHERE (c.tenant_id = public.auth_tenant_id())))));


--
-- Name: POLICY kds_station_categories_insert ON kds_station_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY kds_station_categories_insert ON public.kds_station_categories IS 'KDS station category routing is branch floor settings: gate by station branch settings:branch, not menu category admin.';


--
-- Name: kds_station_categories kds_station_categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_station_categories_update ON public.kds_station_categories FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (station_id IN ( SELECT s.id
   FROM public.kds_stations s
  WHERE ((s.tenant_id = public.auth_tenant_id()) AND public.has_permission(s.branch_id, 'settings:branch'::text)))))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (station_id IN ( SELECT s.id
   FROM public.kds_stations s
  WHERE ((s.tenant_id = public.auth_tenant_id()) AND public.has_permission(s.branch_id, 'settings:branch'::text)))) AND (category_id IN ( SELECT c.id
   FROM public.menu_categories c
  WHERE (c.tenant_id = public.auth_tenant_id())))));


--
-- Name: POLICY kds_station_categories_update ON kds_station_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY kds_station_categories_update ON public.kds_station_categories IS 'KDS station category routing is branch floor settings: gate by station branch settings:branch, not menu category admin.';


--
-- Name: kds_stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;

--
-- Name: kds_stations kds_stations_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_stations_write ON public.kds_stations TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: kds_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kds_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: kds_tickets kds_tickets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_tickets_insert ON public.kds_tickets FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'pos:use'::text)));


--
-- Name: kds_tickets kds_tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_tickets_select ON public.kds_tickets FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission(branch_id, 'kds:use'::text) OR public.has_permission(branch_id, 'orders:read'::text))));


--
-- Name: kds_tickets kds_tickets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kds_tickets_update ON public.kds_tickets FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'kds:mark_ready'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'kds:mark_ready'::text)));


--
-- Name: kitchen_send_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kitchen_send_batches ENABLE ROW LEVEL SECURITY;


--
-- Name: kitchen_send_batches kitchen_send_batches_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kitchen_send_batches_insert ON public.kitchen_send_batches FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'pos:use'::text));
--
-- Name: kitchen_send_batches kitchen_send_batches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kitchen_send_batches_select ON public.kitchen_send_batches FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((branch_id = public.auth_branch_id()) OR (public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))));


--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories menu_categories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_delete ON public.menu_categories FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:manage_category'::text)));


--
-- Name: menu_categories menu_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_insert ON public.menu_categories FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:manage_category'::text)));


--
-- Name: menu_categories menu_categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_update ON public.menu_categories FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:manage_category'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:manage_category'::text)));


--
-- Name: menu_item_available_sides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_available_sides ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_item_available_sides menu_item_available_sides_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_available_sides_delete ON public.menu_item_available_sides FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_available_sides menu_item_available_sides_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_available_sides_insert ON public.menu_item_available_sides FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_available_sides menu_item_available_sides_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_available_sides_update ON public.menu_item_available_sides FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_item_modifiers menu_item_modifiers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_modifiers_delete ON public.menu_item_modifiers FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_modifiers menu_item_modifiers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_modifiers_insert ON public.menu_item_modifiers FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_modifiers menu_item_modifiers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_modifiers_update ON public.menu_item_modifiers FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_item_variants menu_item_variants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_variants_delete ON public.menu_item_variants FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_variants menu_item_variants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_variants_insert ON public.menu_item_variants FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_item_variants menu_item_variants_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_item_variants_update ON public.menu_item_variants FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items menu_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_items_delete ON public.menu_items FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_items menu_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_items_insert ON public.menu_items FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: menu_items menu_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_items_update ON public.menu_items FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('menu:write'::text)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.auth_role() = ANY (target_roles)) AND ((target_branch_id IS NULL) OR (target_branch_id = public.auth_branch_id()) OR (public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))));


--
-- Name: order_daily_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_daily_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: order_daily_counters order_daily_counters_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_daily_counters_write ON public.order_daily_counters TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.tenant_id = order_items.tenant_id) AND public.has_permission(o.branch_id, 'orders:write'::text))))));


--
-- Name: order_items order_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_select ON public.order_items FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.tenant_id = order_items.tenant_id) AND (public.has_permission(o.branch_id, 'orders:read'::text) OR public.has_permission(o.branch_id, 'kds:use'::text)))))));


--
-- Name: order_items order_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_update ON public.order_items FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.tenant_id = order_items.tenant_id) AND public.has_permission(o.branch_id, 'orders:write'::text))))));


--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history order_status_history_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_status_history_insert ON public.order_status_history FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_status_history.order_id) AND (o.tenant_id = order_status_history.tenant_id) AND public.has_permission(o.branch_id, 'orders:write'::text))))));


--
-- Name: order_status_history order_status_history_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_status_history_select ON public.order_status_history FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_status_history.order_id) AND (o.tenant_id = order_status_history.tenant_id) AND (public.has_permission(o.branch_id, 'orders:read'::text) OR public.has_permission(o.branch_id, 'kds:use'::text)))))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: orders orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission(branch_id, 'orders:read'::text) OR public.has_permission(branch_id, 'kds:use'::text))));


--
-- Name: orders orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_update ON public.orders FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: payments payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:read'::text)));


--
-- Name: payments payments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: payroll_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_entries payroll_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_entries_select ON public.payroll_entries FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = payroll_entries.employee_id) AND (e.profile_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.payroll_periods pp
  WHERE ((pp.id = payroll_entries.payroll_period_id) AND (pp.status = 'paid'::text))))) OR public.has_permission_any('finance:payroll_calculate'::text) OR public.has_permission_any('finance:view'::text))));


--
-- Name: payroll_entries payroll_entries_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_entries_write ON public.payroll_entries TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text)));


--
-- Name: payroll_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_periods payroll_periods_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_periods_select ON public.payroll_periods FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: payroll_periods payroll_periods_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_periods_write ON public.payroll_periods TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text)));


--
-- Name: payroll_entries pe_employee_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pe_employee_self_select ON public.payroll_entries FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.profile_id = auth.uid())))));


--
-- Name: payroll_entries pe_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pe_manage ON public.payroll_entries TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text)));


--
-- Name: POLICY pe_manage ON payroll_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY pe_manage ON public.payroll_entries IS 'H2b (2026-05-07): destructive ALL gated by has_permission_any(''finance:payroll_calculate''). Approve transition (draft → approved) gated separately by finance:payroll_approve at app/RPC level.';


--
-- Name: payroll_entries pe_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pe_select ON public.payroll_entries FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:payroll_calculate'::text)));


--
-- Name: permission_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permission_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_keys permission_keys_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permission_keys_select ON public.permission_keys FOR SELECT TO authenticated USING (true);


--
-- Name: pos_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_sessions pos_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_sessions_insert ON public.pos_sessions FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'pos:open_cashbox'::text)));


--
-- Name: pos_sessions pos_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_sessions_select ON public.pos_sessions FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'pos:use'::text)));


--
-- Name: pos_sessions pos_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_sessions_update ON public.pos_sessions FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'pos:use'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'pos:use'::text)));


--
-- Name: pos_terminals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_terminals pos_terminals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_terminals_delete ON public.pos_terminals FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: pos_terminals pos_terminals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_terminals_insert ON public.pos_terminals FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: pos_terminals pos_terminals_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pos_terminals_update ON public.pos_terminals FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: positions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

--
-- Name: positions positions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY positions_select ON public.positions FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: print_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: print_jobs print_jobs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_jobs_insert ON public.print_jobs FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('pos:print'::text) OR public.has_permission_any('pos:send_kitchen'::text) OR public.has_permission_any('printer:manage'::text))));


--
-- Name: print_jobs print_jobs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_jobs_select ON public.print_jobs FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((branch_id = public.auth_branch_id()) OR (public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))));


--
-- Name: print_jobs print_jobs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY print_jobs_update ON public.print_jobs FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('pos:print'::text) OR public.has_permission_any('printer:manage'::text)))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('pos:print'::text) OR public.has_permission_any('printer:manage'::text))));


--
-- Name: printer_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.printer_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: printer_agents printer_agents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printer_agents_select ON public.printer_agents FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((branch_id = public.auth_branch_id()) OR (public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])))));


--
-- Name: printer_agents printer_agents_upsert_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printer_agents_upsert_insert ON public.printer_agents FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('printer:manage'::text) OR public.has_permission_any('pos:print'::text))));


--
-- Name: printer_agents printer_agents_upsert_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printer_agents_upsert_update ON public.printer_agents FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('printer:manage'::text) OR public.has_permission_any('pos:print'::text)))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('printer:manage'::text) OR public.has_permission_any('pos:print'::text))));


--
-- Name: printers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

--
-- Name: printers printers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printers_delete ON public.printers FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('printer:manage'::text) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR (branch_id = public.auth_branch_id()))));


--
-- Name: printers printers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printers_insert ON public.printers FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('printer:manage'::text) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR (branch_id = public.auth_branch_id()))));


--
-- Name: printers printers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printers_select ON public.printers FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: printers printers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY printers_update ON public.printers FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('printer:manage'::text) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR (branch_id = public.auth_branch_id())))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('printer:manage'::text) AND ((public.auth_role() = ANY (ARRAY['owner'::text, 'manager'::text])) OR (branch_id = public.auth_branch_id()))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('staff:view'::text) OR public.has_permission_any('hr:view_employee'::text))));


--
-- Name: profiles profiles_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: reconcile_run_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconcile_run_log ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds refunds_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refunds_insert ON public.refunds FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:refund'::text)));


--
-- Name: refunds refunds_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refunds_select ON public.refunds FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:read'::text)));


--
-- Name: refunds refunds_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refunds_update ON public.refunds FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:refund_approve'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:refund_approve'::text)));


--
-- Name: POLICY refunds_update ON refunds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY refunds_update ON public.refunds IS 'H2a (2026-05-07): destructive UPDATE gated by has_permission(branch_id, ''orders:refund_approve''). Owner bypass via positions.code=''owner''. Replaces previous auth_role() IN (...) check which had a 1h stale-revoke window via JWT user_role caching.';


--
-- Name: reconcile_run_log rrl_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rrl_select ON public.reconcile_run_log FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts shifts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shifts_select ON public.shifts FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: shifts shifts_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shifts_write ON public.shifts TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'staff:manage'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'staff:manage'::text)));


--
-- Name: summary_run_queue srq_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srq_select ON public.summary_run_queue FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: staff_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_permissions staff_permissions_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_permissions_select_admin ON public.staff_permissions FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(NULL::bigint, 'staff:assign_permission'::text)));


--
-- Name: staff_permissions staff_permissions_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_permissions_select_self ON public.staff_permissions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: stock_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_levels stock_levels_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_levels_insert ON public.stock_levels FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:write'::text)));


--
-- Name: stock_levels stock_levels_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_levels_select ON public.stock_levels FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:read'::text)));


--
-- Name: stock_levels stock_levels_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_levels_update ON public.stock_levels FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:write'::text)));


--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements stock_movements_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_movements_insert ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:write'::text)));


--
-- Name: stock_movements stock_movements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:read'::text)));


--
-- Name: stocktake_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stocktake_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: stocktake_lines stocktake_lines_blind_block; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stocktake_lines_blind_block ON public.stocktake_lines AS RESTRICTIVE FOR SELECT TO authenticated USING (((NOT (EXISTS ( SELECT 1
   FROM public.stocktake_sessions ss
  WHERE ((ss.id = stocktake_lines.session_id) AND (ss.blind_mode = true) AND (ss.status = 'in_progress'::text))))) OR public.has_permission(NULL::bigint, 'inventory:stocktake_unblind'::text)));


--
-- Name: stocktake_lines stocktake_lines_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stocktake_lines_select ON public.stocktake_lines FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.stocktake_sessions s
  WHERE ((s.id = stocktake_lines.session_id) AND (s.tenant_id = stocktake_lines.tenant_id) AND public.has_permission(s.branch_id, 'inventory:read'::text))))));


--
-- Name: stocktake_lines stocktake_lines_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stocktake_lines_write ON public.stocktake_lines TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.stocktake_sessions s
  WHERE ((s.id = stocktake_lines.session_id) AND (s.tenant_id = stocktake_lines.tenant_id) AND public.has_permission(s.branch_id, 'inventory:write'::text)))))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (EXISTS ( SELECT 1
   FROM public.stocktake_sessions s
  WHERE ((s.id = stocktake_lines.session_id) AND (s.tenant_id = stocktake_lines.tenant_id) AND public.has_permission(s.branch_id, 'inventory:write'::text))))));


--
-- Name: stocktake_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stocktake_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: stocktake_sessions stocktake_sessions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stocktake_sessions_insert ON public.stocktake_sessions FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:stocktake_create'::text)));


--
-- Name: stocktake_sessions stocktake_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stocktake_sessions_select ON public.stocktake_sessions FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:read'::text)));


--
-- Name: stocktake_sessions stocktake_sessions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stocktake_sessions_update ON public.stocktake_sessions FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'inventory:write'::text)));


--
-- Name: summary_run_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.summary_run_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_invoices supplier_invoices_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_delete ON public.supplier_invoices FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_create'::text)));


--
-- Name: supplier_invoices supplier_invoices_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_insert ON public.supplier_invoices FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_create'::text)));


--
-- Name: supplier_invoices supplier_invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_select ON public.supplier_invoices FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:read'::text) OR private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_create'::text) OR private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_match'::text))));


--
-- Name: supplier_invoices supplier_invoices_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_invoices_update ON public.supplier_invoices FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_create'::text) OR private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_match'::text)))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND (private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_create'::text) OR private.can_access_supplier_invoice_source(tenant_id, supplier_id, grn_id, po_id, 'procurement:invoice_match'::text))));


--
-- Name: supplier_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_payments supplier_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_payments_select ON public.supplier_payments FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: supplier_payments supplier_payments_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_payments_write ON public.supplier_payments TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:ap_pay'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:ap_pay'::text)));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_delete ON public.suppliers FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(NULL::bigint, 'procurement:supplier_manage'::text)));


--
-- Name: suppliers suppliers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_insert ON public.suppliers FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(NULL::bigint, 'procurement:supplier_manage'::text)));


--
-- Name: suppliers suppliers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND (public.has_permission_any('procurement:read'::text) OR public.has_permission(NULL::bigint, 'procurement:supplier_manage'::text))));


--
-- Name: suppliers suppliers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_update ON public.suppliers FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(NULL::bigint, 'procurement:supplier_manage'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(NULL::bigint, 'procurement:supplier_manage'::text)));


--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings system_settings_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY system_settings_write ON public.system_settings TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('settings:tenant'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('settings:tenant'::text)));


--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

--
-- Name: tables tables_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_delete ON public.tables FOR DELETE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: tables tables_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_insert ON public.tables FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: tables tables_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_update ON public.tables FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'settings:branch'::text)));


--
-- Name: tax_invoice_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoice_events ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_invoice_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoice_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_invoices tax_invoices_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_invoices_insert ON public.tax_invoices FOR INSERT TO authenticated WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: tax_invoices tax_invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_invoices_select ON public.tax_invoices FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:read'::text)));


--
-- Name: tax_invoices tax_invoices_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_invoices_update ON public.tax_invoices FOR UPDATE TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text))) WITH CHECK (((tenant_id = public.auth_tenant_id()) AND public.has_permission(branch_id, 'orders:write'::text)));


--
-- Name: branch_zones tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.branch_zones FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: kds_station_categories tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.kds_station_categories FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((public.auth_branch_id() IS NULL) OR (station_id IN ( SELECT kds_stations.id
   FROM public.kds_stations
  WHERE ((kds_stations.branch_id = public.auth_branch_id()) AND (kds_stations.tenant_id = public.auth_tenant_id())))))));


--
-- Name: kds_stations tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.kds_stations FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND ((public.auth_branch_id() IS NULL) OR (branch_id = public.auth_branch_id()))));


--
-- Name: menu_categories tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.menu_categories FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: menu_item_available_sides tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.menu_item_available_sides FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: menu_item_modifiers tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.menu_item_modifiers FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: menu_item_variants tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.menu_item_variants FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: menu_items tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.menu_items FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: pos_terminals tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.pos_terminals FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: system_settings tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.system_settings FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: tables tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.tables FOR SELECT TO authenticated USING ((tenant_id = public.auth_tenant_id()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_invoice_events tie_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tie_select ON public.tax_invoice_events FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: tax_invoice_orders tio_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tio_select ON public.tax_invoice_orders FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events webhook_events_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_events_select_admin ON public.webhook_events FOR SELECT TO authenticated USING (((tenant_id = public.auth_tenant_id()) AND public.has_permission_any('finance:view'::text)));


--
-- PostgreSQL database dump complete
--


--
-- Schema-level GRANTs (V3).
--
-- pg_dump --no-privileges stripped every GRANT, and Supabase does not
-- auto-grant schema public on a fresh project, so PostgREST (anon /
-- authenticated) and GoTrue (supabase_auth_admin) are locked out even though
-- RLS is enabled. RLS (147 policies, all 58 tables RLS-ENABLED) remains the
-- real access gate, so GRANT ALL here matches Supabase's default posture and
-- is safe. The supabase_auth_admin grants are the critical login fix: without
-- schema USAGE it cannot invoke the access-token hook, regardless of the
-- PUBLIC EXECUTE bit.
--

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;



--
-- V10: realtime publication membership (replay-faithful baseline).
-- The supabase_realtime publication is Supabase-managed; on a Supabase
-- project it exists, on a bare Postgres replay it may not. Guarded so the
-- baseline still applies where the publication is absent. kitchen_send_batches
-- is intentionally EXCLUDED (no realtime subscriber; see REPLICA IDENTITY above).
--

DO $reltime$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'branch_menu_item_daily_limits', 'kds_tickets', 'notifications',
    'order_status_history', 'orders', 'payments', 'pos_sessions',
    'print_jobs', 'printer_agents', 'tables'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication absent (non-Supabase replay) — skipping realtime membership';
    RETURN;
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
    END IF;
  END LOOP;
END
$reltime$;
