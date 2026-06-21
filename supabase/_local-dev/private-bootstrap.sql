-- Private-schema bootstrap — tracked companion to migrations/00000000000000_baseline.sql.
-- The public baseline dump (--schema=public) references private.* objects but
-- never creates the private schema or its functions (managed-surface objects are
-- excluded from the dump), so a clean replay fails at the first private.* ref.
-- scripts/supabase-baseline-local-check.mjs PREPENDS this file to the baseline so
-- a from-empty replay (and the CI baseline-replay job) succeeds.
-- 4 functions are extracted verbatim from prod; 6 are permissive stubs for
-- historical functions later forward migrations DROP/replace (loose RLS is
-- acceptable for a local QA DB).
--
-- check_function_bodies=false: the private.* functions are LANGUAGE sql and
-- reference public tables (e.g. public.profiles) the baseline creates LATER in
-- the same migration; without this, Postgres validates the body at CREATE time
-- and errors with "relation public.profiles does not exist". The baseline sets
-- the same flag, but only after this prepended section runs.
SET check_function_bodies = false;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO postgres, anon, authenticated, service_role;

-- Managed surface: pg_cron is enabled by managed-surfaces.install.sql on real
-- envs (not in the public dump). Forward migrations reference cron.schedule /
-- cron.job, so create the extension here for a clean local reset. The local
-- Supabase Postgres image preloads pg_cron in shared_preload_libraries.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- Real functions (verbatim from prod via pg_get_functiondef).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner' WHEN 'branch_manager' THEN 'branch_manager' WHEN 'warehouse_manager' THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager' WHEN 'head_chef' THEN 'production_manager' WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'chef' THEN 'chef' WHEN 'cashier' THEN 'cashier' WHEN 'waiter' THEN 'waiter' WHEN 'office' THEN 'office' ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION private.finance_scope(p_uid uuid, p_key text DEFAULT 'finance:view'::text)
 RETURNS TABLE(has_tenant_scope boolean, branch_ids bigint[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_completion_print_internal(p_branch_id bigint, p_ticket_ids bigint[], p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET join_collapse_limit TO '1'
 SET from_collapse_limit TO '1'
AS $function$
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
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = o.tenant_id
       AND pmc.branch_id = o.branch_id
      JOIN public.printers p
        ON p.id = pmc.printer_id
       AND p.tenant_id = pmc.tenant_id
       AND p.branch_id = pmc.branch_id
       AND p.is_active = TRUE
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
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
$function$;

CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_internal(p_order_id bigint, p_actor_override uuid DEFAULT NULL::uuid, p_enforce_request_auth boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_uid            UUID;
  v_uid                    UUID;
  v_order                  public.orders%ROWTYPE;
  v_table_no               INT;
  v_cashier_name           TEXT;
  v_route                  RECORD;
  v_payload                JSONB;
  v_idempotency            TEXT;
  v_job_id                 BIGINT;
  v_jobs                   JSONB := '[]'::jsonb;
  v_mapped_pending         INT;
  v_null_batch_pending     INT;
  v_fallback_batch_id      BIGINT;
  v_fallback_ticket_number TEXT;
  v_fallback_send_seq      INT;
  v_fallback_kind          TEXT;
  v_ticket_seq             INT;
  v_order_number_clean     TEXT;
  v_order_number_match     TEXT[];
  v_ticket_base            TEXT;
BEGIN
  v_request_uid := auth.uid();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enforce_request_auth THEN
    IF v_request_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;

    IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any('pos:send_kitchen') THEN
      RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
    END IF;

    v_uid := v_request_uid;
  ELSE
    v_uid := COALESCE(p_actor_override, v_request_uid, v_order.created_by);
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT COUNT(*)
  INTO v_mapped_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL;

  IF v_mapped_pending = 0 THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'send_seq', v_order.kitchen_send_count,
      'jobs', v_jobs
    );
  END IF;

  SELECT COUNT(*)
  INTO v_null_batch_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  LEFT JOIN public.kds_tickets kt
    ON kt.tenant_id = v_order.tenant_id
   AND kt.order_item_id = oi.id
  LEFT JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL
    AND ksb.id IS NULL;

  IF v_null_batch_pending > 0 THEN
    SELECT ksb.id, ksb.kitchen_ticket_number, ksb.send_seq, ksb.kind
    INTO v_fallback_batch_id, v_fallback_ticket_number, v_fallback_send_seq, v_fallback_kind
    FROM public.order_items oi
    JOIN public.kds_tickets kt
      ON kt.tenant_id = v_order.tenant_id
     AND kt.order_item_id = oi.id
    JOIN public.kitchen_send_batches ksb
      ON ksb.id = kt.kitchen_send_batch_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
    ORDER BY ksb.created_at DESC, ksb.id DESC
    LIMIT 1;

    IF v_fallback_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_fallback_send_seq;

      INSERT INTO public.kitchen_daily_counters (
        tenant_id, branch_id, counter_date, last_seq
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        1
      )
      ON CONFLICT (tenant_id, branch_id, counter_date)
      DO UPDATE SET
        last_seq = public.kitchen_daily_counters.last_seq + 1,
        updated_at = now()
      RETURNING last_seq INTO v_ticket_seq;

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
      v_fallback_ticket_number := '#' || v_ticket_base
        || CASE
             WHEN v_fallback_send_seq > 1
               THEN '-' || v_fallback_send_seq::TEXT
             ELSE ''
           END;
      v_fallback_kind := CASE WHEN v_fallback_send_seq = 1 THEN 'initial' ELSE 'append' END;

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
        v_fallback_ticket_number,
        v_fallback_send_seq,
        v_fallback_kind,
        v_uid
      )
      RETURNING id INTO v_fallback_batch_id;
    END IF;

    UPDATE public.kds_tickets kt
       SET kitchen_send_batch_id = v_fallback_batch_id,
           updated_at = now()
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
     WHERE kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
       AND oi.order_id = p_order_id
       AND oi.sent_to_kitchen_at IS NULL
       AND kt.kitchen_send_batch_id IS NULL;
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        p.id AS printer_id,
        p.role AS printer_role,
        CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
        COALESCE(ksb.id, v_fallback_batch_id) AS batch_id,
        COALESCE(ksb.kitchen_ticket_number, v_fallback_ticket_number) AS kitchen_ticket_number,
        COALESCE(ksb.send_seq, v_fallback_send_seq) AS send_seq,
        COALESCE(ksb.kind, v_fallback_kind) AS send_kind,
        COALESCE(ksb.created_at, now()) AS batch_created_at,
        oi.id AS order_item_id,
        jsonb_build_object(
          'item_name',    oi.item_name,
          'variant_name', oi.variant_name,
          'quantity',     oi.quantity,
          'modifiers',    oi.modifiers,
          'sides',        oi.sides,
          'note',         oi.note
        ) AS item_payload
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
      JOIN public.printers p
        ON p.id = pmc.printer_id
       AND p.tenant_id = pmc.tenant_id
       AND p.branch_id = pmc.branch_id
       AND p.is_active = TRUE
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.kds_tickets kt
        ON kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
      LEFT JOIN public.kitchen_send_batches ksb
        ON ksb.id = kt.kitchen_send_batch_id
      WHERE oi.order_id = p_order_id
        AND oi.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at
    )
    SELECT
      gr.*,
      EXISTS (
        SELECT 1
        FROM public.order_items sent_oi
        JOIN public.kds_tickets sent_kt
          ON sent_kt.tenant_id = v_order.tenant_id
         AND sent_kt.order_item_id = sent_oi.id
        WHERE sent_oi.order_id = p_order_id
          AND sent_oi.sent_to_kitchen_at IS NOT NULL
          AND sent_kt.kitchen_send_batch_id = gr.batch_id
      ) AS batch_has_sent_items
    FROM grouped_routes gr
    ORDER BY gr.batch_created_at, gr.printer_role, gr.printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_cashier_name, ''),
      'send_seq',              v_route.send_seq,
      'send_kind',             CASE
                                  WHEN v_route.batch_has_sent_items THEN 'append'
                                  ELSE v_route.send_kind
                                END,
      'slot',                  v_route.slot,
      'note',                  v_order.note,
      'items',                 v_route.items,
      'printed_at',            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || p_order_id::TEXT
      || ':kitchen:printer:' || v_route.printer_id::TEXT
      || ':batch:' || v_route.batch_id::TEXT
      || ':items:' || md5(array_to_string(v_route.item_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_order.tenant_id, v_order.branch_id, v_route.printer_id, 'kitchen_ticket',
      p_order_id, v_payload, v_idempotency, v_uid
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id
      FROM public.print_jobs
      WHERE idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
       SET sent_to_kitchen_at = now()
     WHERE id = ANY(v_route.item_ids)
       AND sent_to_kitchen_at IS NULL;

    v_jobs := v_jobs || jsonb_build_object(
      'slot', v_route.slot,
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  IF jsonb_array_length(v_jobs) = 0 THEN
    RAISE EXCEPTION 'no active kitchen printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', COALESCE(v_fallback_send_seq, v_order.kitchen_send_count),
    'jobs', v_jobs
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Permissive stubs for historical private functions the baseline references
-- but prod no longer has (later forward migrations DROP/replace them).
-- Loose RLS is acceptable for a local QA DB.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_staff_permission_scope()
 RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION private.can_access_grn_source(p_tenant_id bigint, p_grn_id bigint, p_key text)
 RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION private.can_access_purchase_order_source(p_tenant_id bigint, p_po_id bigint, p_key text)
 RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION private.can_access_supplier_invoice_source(p_tenant_id bigint, p_supplier_id bigint, p_grn_id bigint, p_po_id bigint, p_key text)
 RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION private.can_access_supplier_return_source(p_tenant_id bigint, p_return_id bigint, p_key text)
 RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION private.staff_permission_effective_branch_id(p_key text, p_branch_id bigint)
 RETURNS bigint LANGUAGE sql AS $$ SELECT p_branch_id $$;
