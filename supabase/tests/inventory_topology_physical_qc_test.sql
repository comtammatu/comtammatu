-- Final-catalog and behavior coverage for Inventory topology, receiving QC,
-- procurement recovery authority, and warehouse-only transfers.
--
-- Run against a local database after all migrations and seed data:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/inventory_topology_physical_qc_test.sql

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_detail text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.branches AS branch
    LEFT JOIN public.inventory_locations AS warehouse
      ON warehouse.tenant_id = branch.tenant_id
     AND warehouse.branch_id = branch.id
     AND warehouse.location_kind = 'warehouse'
     AND warehouse.is_active IS TRUE
    WHERE branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
    GROUP BY branch.tenant_id, branch.id
    HAVING count(warehouse.id) <> 1
       OR bool_and(
         warehouse.is_default_receive
         AND warehouse.is_default_issue
         AND warehouse.is_default_consumption
       ) IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: active operational site warehouse invariant failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.branches AS branch
    JOIN public.inventory_locations AS location
      ON location.tenant_id = branch.tenant_id
     AND location.branch_id = branch.id
    WHERE branch.is_active IS TRUE
      AND branch.branch_kind = 'branch'
      AND location.is_active IS TRUE
      AND location.location_kind <> 'warehouse'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: regular branch has a non-warehouse active location';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations
    WHERE location_kind = 'kitchen'
  ) THEN
    RAISE EXCEPTION 'FINAL CATALOG: kitchen location survived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = 3
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.inventory_locations AS warehouse
        WHERE warehouse.tenant_id = branch.tenant_id
          AND warehouse.branch_id = branch.id
          AND warehouse.location_kind = 'warehouse'
          AND warehouse.is_active IS TRUE
          AND warehouse.is_default_receive IS TRUE
          AND warehouse.is_default_issue IS TRUE
          AND warehouse.is_default_consumption IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'FINAL CATALOG: Branch 3 warehouse was not repaired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'inventory_locations'
      AND indexname =
        'inventory_locations_one_active_warehouse_per_site_idx'
      AND indexdef ILIKE '%WHERE%'
      AND indexdef ILIKE '%location_kind%'
      AND indexdef ILIKE '%warehouse%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: partial unique warehouse index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conname = 'branches_id_tenant_key'
      AND constraint_record.conrelid = 'public.branches'::regclass
      AND constraint_record.contype = 'u'
      AND constraint_record.convalidated IS TRUE
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_record.conkey)
          WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_record.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) = ARRAY['id', 'tenant_id']::text[]
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: branch tenant identity key missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conname =
        'inventory_locations_branch_tenant_fkey'
      AND constraint_record.conrelid =
        'public.inventory_locations'::regclass
      AND constraint_record.confrelid = 'public.branches'::regclass
      AND constraint_record.contype = 'f'
      AND constraint_record.convalidated IS TRUE
      AND constraint_record.confdeltype = 'c'
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_record.conkey)
          WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_record.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) = ARRAY['branch_id', 'tenant_id']::text[]
      AND ARRAY(
        SELECT attribute.attname::text
        FROM unnest(constraint_record.confkey)
          WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraint_record.confrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) = ARRAY['id', 'tenant_id']::text[]
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: branch/tenant topology foreign key missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'goods_received_notes'
      AND indexname =
        'goods_received_notes_one_draft_per_po_idx'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%po_id IS NOT NULL%'
      AND indexdef ILIKE '%status = ''draft''%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: linked recovery draft uniqueness missing';
  END IF;

  IF to_regclass(
    'public.uq_grn_active_po_draft_per_user_po'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: superseded per-user linked draft index survived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('inventory_locations_exact_warehouse_check'::text),
        ('branches_exact_warehouse_check'::text)
    ) AS expected(trigger_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger
      WHERE trigger.tgname = expected.trigger_name
        AND trigger.tgdeferrable IS TRUE
        AND trigger.tginitdeferred IS TRUE
        AND trigger.tgenabled <> 'D'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: deferred warehouse constraint trigger missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('trg_grn_retrospective_immutability'::text),
        ('trg_po_retrospective_immutability'::text),
        ('trg_grn_items_linked_immutability'::text),
        ('trg_po_items_retrospective_immutability'::text)
    ) AS expected(trigger_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger
      WHERE trigger.tgname = expected.trigger_name
        AND trigger.tgenabled <> 'D'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retrospective procurement guard missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgname = 'goods_received_notes_supplier_mapping_on_confirm'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: GRN confirm still depends on live supplier mapping';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.status = 'confirmed'
      AND grn.po_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: unlinked confirmed GRN survived preflight';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'inventory_locations_active_site_warehouse_chk'
  ) OR to_regclass(
    'public.inventory_locations_one_active_per_site_idx'
  ) IS NOT NULL OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgname IN (
      'trg_inventory_locations_active_site_warehouse',
      'trg_branches_active_site_warehouse'
    )
      AND tgenabled <> 'D'
  ) OR to_regprocedure(
    'public.trg_assert_active_site_has_warehouse()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: superseded Slice-A topology object survived';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_proc AS procedure
      ON procedure.oid = trigger.tgfoid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE trigger.tgname = 'trg_stock_transfer_direction'
      AND trigger.tgenabled <> 'D'
      AND namespace.nspname = 'public'
      AND procedure.proname = 'enforce_stock_transfer_direction'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: warehouse transfer trigger missing';
  END IF;

  SELECT string_agg(
    format('%I.%I', namespace.nspname, relation.relname),
    ', '
    ORDER BY namespace.nspname, relation.relname
  )
  INTO v_detail
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = ANY (ARRAY[
      'branch_express_window',
      'branch_override_attempts',
      'branch_override_codes',
      'grn_baseline_pause',
      'grn_express_extend_audit',
      'grn_hardblock_overrides',
      'ingredient_category_review_policy',
      'inventory_qc_settings',
      'user_trust_score'
    ]::text[]);

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retired Inventory tables survived: %',
      v_detail;
  END IF;

  IF to_regclass('public.notification_outbox') IS NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: shared notification_outbox was removed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.notification_outbox
    WHERE channel = 'inventory'
      AND topic = 'grn.requires_review'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: grn.requires_review topic rows survived';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE kind = 'inventory.grn.weekly_override_report'
  ) OR EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'weekly_grn_override_report'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retired GRN review notification job survived';
  END IF;
  IF to_regprocedure('public.trg_supplier_return_outbox()') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger
       WHERE tgname = 'trg_supplier_returns_outbox'
         AND tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: supplier-return notification producer was removed';
  END IF;

  SELECT string_agg(
    format('%I.%I', column_name.table_name, column_name.column_name),
    ', '
    ORDER BY column_name.table_name, column_name.column_name
  )
  INTO v_detail
  FROM information_schema.columns AS column_name
  WHERE column_name.table_schema = 'public'
    AND (
      (
        column_name.table_name = 'grn_items'
        AND column_name.column_name = ANY (ARRAY[
          'po_quantity',
          'quality_status',
          'expiry_date',
          'batch_number',
          'receiving_temperature',
          'price_variance_pct',
          'po_unit_price',
          'price_override_note',
          'price_override_photo_url',
          'requires_review',
          'short_delivery_action',
          'variance_tier',
          'baseline_source',
          'baseline_sample_n',
          'is_hard_blocked',
          'baseline_variance_pct'
        ]::text[])
      )
      OR (
        column_name.table_name = 'goods_received_notes'
        AND column_name.column_name = 'express_approved'
      )
      OR (
        column_name.table_name = 'ingredients'
        AND column_name.column_name = 'review_override'
      )
    );

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retired Inventory columns survived: %',
      v_detail;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'grn_items'
      AND column_name = 'unit_cost'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'grn_items'
      AND column_name = 'total_cost'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'grn_items'
      AND column_name = 'rejected_photo_url'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: required GRN cost snapshot or rejection evidence missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public.grn_items'::regclass,
          'grn_items_received_quantity_check'::text
        ),
        (
          'public.grn_items'::regclass,
          'grn_items_rejected_le_received'::text
        ),
        (
          'public.grn_items'::regclass,
          'grn_items_unit_cost_nonnegative'::text
        ),
        (
          'public.grn_items'::regclass,
          'grn_items_total_cost_nonnegative'::text
        ),
        (
          'public.purchase_order_items'::regclass,
          'purchase_order_items_quantity_check'::text
        ),
        (
          'public.purchase_order_items'::regclass,
          'purchase_order_items_unit_price_finite'::text
        ),
        (
          'public.purchase_order_items'::regclass,
          'purchase_order_items_line_total_finite'::text
        )
    ) AS expected(relation_id, constraint_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = expected.relation_id
        AND constraint_definition.conname = expected.constraint_name
        AND pg_catalog.pg_get_constraintdef(
          constraint_definition.oid
        ) ILIKE '%NaN%'
        AND pg_catalog.pg_get_constraintdef(
          constraint_definition.oid
        ) ILIKE '%Infinity%'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: Inventory numeric finite constraint missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.permission_keys
    WHERE key = ANY (ARRAY[
      'inventory:grn_express_configure',
      'inventory:grn_express_extend',
      'inventory:grn_hardblock_override',
      'inventory:catalog_review_policy_set',
      'inventory:item_review_override_set',
      'procurement:override_code_rotate'
    ]::text[])
  ) OR EXISTS (
    SELECT 1
    FROM public.staff_permissions
    WHERE permission_key = ANY (ARRAY[
      'inventory:grn_express_configure',
      'inventory:grn_express_extend',
      'inventory:grn_hardblock_override',
      'inventory:catalog_review_policy_set',
      'inventory:item_review_override_set',
      'procurement:override_code_rotate'
    ]::text[])
  ) OR EXISTS (
    SELECT 1
    FROM public.role_templates AS template
    WHERE template.permission_keys && ARRAY[
      'inventory:grn_express_configure',
      'inventory:grn_express_extend',
      'inventory:grn_hardblock_override',
      'inventory:catalog_review_policy_set',
      'inventory:item_review_override_set',
      'procurement:override_code_rotate'
    ]::text[]
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retired Inventory permission survived';
  END IF;

  SELECT string_agg(
    format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid)
    ),
    ', '
    ORDER BY namespace.nspname, procedure.proname
  )
  INTO v_detail
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND procedure.proname = ANY (ARRAY[
      'commit_intra_branch_transfer',
      'create_grn_from_po',
      'create_purchase_order_with_lines',
      'create_supplier_return_from_grn',
      'recreate_grn_at_receiving_site',
      'add_menu_item_kitchen_stock_exception',
      'compute_user_trust_score',
      'configure_express_window',
      'extend_express_window',
      'get_grn_price_baseline',
      'grn_is_auto_approvable',
      'override_grn_hardblock',
      'rotate_branch_override_code',
      'try_auto_approve_grn',
      'weekly_grn_override_report',
      'inventory_requires_manual_review',
      'trg_grn_requires_review_outbox',
      'create_production_order',
      'confirm_production_order',
      'cancel_production_order',
      'ensure_production_order_central_kitchen'
    ]::text[]);

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retired Inventory functions survived: %',
      v_detail;
  END IF;

  IF to_regprocedure(
    'public.create_grn_from_approved_po(bigint)'
  ) IS NULL
     OR to_regprocedure(
       'public.add_menu_item_stock_exception(bigint,bigint,integer,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.amend_grn_line(bigint,bigint,numeric,numeric,text,text,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.create_expiry_writeoff(bigint,bigint,bigint,numeric,bigint,text,text[])'
     ) IS NULL
     OR to_regprocedure(
       'private.grn_rejection_photo_exists(bigint,bigint,bigint,text)'
     ) IS NULL
     OR to_regprocedure(
       'private.grn_physical_qc_is_valid(bigint,bigint)'
     ) IS NULL
     OR to_regprocedure(
       'private.any_grn_is_linked(bigint,bigint[])'
     ) IS NULL
     OR to_regprocedure(
       'private.any_po_is_linked(bigint,bigint[])'
     ) IS NULL
     OR to_regprocedure(
       'private.enforce_retrospective_grn_immutability()'
     ) IS NULL
     OR to_regprocedure(
       'private.enforce_retrospective_purchase_order_immutability()'
     ) IS NULL
     OR to_regprocedure(
       'private.enforce_linked_grn_line_immutability()'
     ) IS NULL
     OR to_regprocedure(
       'private.enforce_retrospective_purchase_order_line_immutability()'
     ) IS NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: required recovery or physical-QC RPC missing';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.create_expiry_writeoff(bigint,bigint,bigint,numeric,bigint,text,text[])',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.create_expiry_writeoff(bigint,bigint,bigint,numeric,bigint,text,text[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'private.grn_rejection_photo_exists(bigint,bigint,bigint,text)',
    'EXECUTE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure.proname = 'grn_rejection_photo_exists'
      AND procedure.prosrc ILIKE '%metadata%'
      AND procedure.prosrc ILIKE '%image/webp%'
      AND procedure.prosrc ILIKE '%p_grn_line_id%'
      AND procedure.prosrc ILIKE '%item.id = p_grn_line_id%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure.proname = 'enforce_linked_grn_line_immutability'
      AND procedure.prosrc ILIKE '%grn_po_price_sync%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure.proname = 'validate_grn_physical_qc_before_confirm'
      AND procedure.prosrc ILIKE '%grn_has_no_accepted_quantity%'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'create_expiry_writeoff'
      AND (
        procedure.prosrc ILIKE '%batch_number%'
        OR procedure.prosrc ILIKE '%expiry_date%'
      )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: expiry write-off authority or GRN boundary invalid';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_grn_from_approved_po(bigint)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.create_grn_from_approved_po(bigint)',
    'EXECUTE'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.create_grn_from_approved_po(bigint)'
    )
      AND procedure.prosrc ILIKE '%INSERT INTO public.audit_logs%'
      AND procedure.prosrc ILIKE '%v_po.tenant_id%'
      AND procedure.prosrc ILIKE '%actor_type%'
      AND procedure.prosrc NOT ILIKE '%public.log_audit%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: recovery RPC service-role/audit boundary invalid';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'private.any_grn_is_linked(bigint,bigint[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'private.any_po_is_linked(bigint,bigint[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'private.any_grn_is_linked(bigint,bigint[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'private.any_po_is_linked(bigint,bigint[])',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'private.any_grn_is_linked(bigint,bigint[])',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'private.any_po_is_linked(bigint,bigint[])',
    'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure.proname = ANY (ARRAY[
        'any_grn_is_linked',
        'any_po_is_linked'
      ]::text[])
      AND procedure.prosrc NOT ILIKE '%auth_tenant_id%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: linked-state helper grants or tenant binding invalid';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.consume_stock_for_order(bigint)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.consume_stock_for_order(bigint)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: POS consumption grants changed';
  END IF;

  IF has_column_privilege(
    'authenticated',
    'public.grn_items',
    'unit_cost',
    'INSERT'
  ) OR has_column_privilege(
    'authenticated',
    'public.grn_items',
    'unit_cost',
    'UPDATE'
  ) OR has_column_privilege(
    'authenticated',
    'public.grn_items',
    'total_cost',
    'INSERT'
  ) OR has_column_privilege(
    'authenticated',
    'public.grn_items',
    'total_cost',
    'UPDATE'
  ) OR has_column_privilege(
    'authenticated',
    'public.grn_items',
    'unit_cost',
    'SELECT'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items',
    'received_quantity',
    'INSERT'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items',
    'received_quantity',
    'UPDATE'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items',
    'received_quantity',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: GRN physical/monetary column boundary invalid';
  END IF;

  SELECT string_agg(
    format('%I.%I', namespace.nspname, procedure.proname),
    ', '
    ORDER BY namespace.nspname, procedure.proname
  )
  INTO v_detail
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND (
      procedure.prosrc ILIKE '%branch_kitchen%'
      OR procedure.prosrc ~*
        E'location_kind[[:space:]]*=[[:space:]]*''kitchen'''
    );

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: active function still selects a kitchen location: %',
      v_detail;
  END IF;

  SELECT string_agg(
    format('%I.%I', namespace.nspname, procedure.proname),
    ', '
    ORDER BY namespace.nspname, procedure.proname
  )
  INTO v_detail
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND (
      procedure.prosrc ILIKE ANY (ARRAY[
        '%inventory_qc_settings%',
        '%branch_express_window%',
        '%branch_override_attempts%',
        '%branch_override_codes%',
        '%grn_baseline_pause%',
        '%grn_express_extend_audit%',
        '%grn_hardblock_overrides%',
        '%ingredient_category_review_policy%',
        '%user_trust_score%'
      ]::text[])
      OR (
        procedure.prosrc ILIKE '%grn_items%'
        AND procedure.prosrc ILIKE ANY (ARRAY[
          '%po_quantity%',
          '%quality_status%',
          '%expiry_date%',
          '%batch_number%',
          '%receiving_temperature%',
          '%price_variance_pct%',
          '%po_unit_price%',
          '%price_override_note%',
          '%price_override_photo_url%',
          '%requires_review%',
          '%short_delivery_action%',
          '%variance_tier%',
          '%baseline_source%',
          '%baseline_sample_n%',
          '%is_hard_blocked%',
          '%baseline_variance_pct%'
        ]::text[])
      )
      OR (
        procedure.prosrc ILIKE '%goods_received_notes%'
        AND procedure.prosrc ILIKE '%express_approved%'
      )
      OR (
        procedure.prosrc ILIKE '%ingredients%'
        AND procedure.prosrc ILIKE '%review_override%'
      )
    );

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: active function retains retired QC identifier: %',
      v_detail;
  END IF;

  SELECT string_agg(
    format('%I.%I', namespace.nspname, procedure.proname),
    ', '
    ORDER BY namespace.nspname, procedure.proname
  )
  INTO v_detail
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE (
      namespace.nspname,
      procedure.proname
    ) IN (
      ('public', 'confirm_goods_receipt_note'),
      ('public', 'post_pos_sale_consumption_if_ready'),
      ('public', 'post_pos_cancelled_ready_waste'),
      ('public', 'compute_menu_item_stock_capacity'),
      ('private', 'consume_stock_for_order_at_warehouse'),
      ('public', 'branch_manager_approve_consumption_report'),
      ('public', 'create_production_run_with_locations'),
      ('public', 'get_production_recipe_context_for_location'),
      ('public', 'create_stocktake_session'),
      ('public', 'start_stocktake'),
      ('public', 'set_inventory_count_assignments'),
      ('public', 'submit_inventory_count_slip'),
      ('public', 'create_stock_transfer_draft'),
      ('public', 'stock_transfer_confirm_ship')
    )
    AND procedure.prosrc !~*
      E'location_kind[[:space:]]*=[[:space:]]*''warehouse''';

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: Inventory function lacks explicit warehouse selection: %',
      v_detail;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('create_production_run_with_locations'::text),
        ('get_production_recipe_context_for_location'::text)
    ) AS expected(function_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = expected.function_name
        AND procedure.prosrc ILIKE '%production_storage%'
        AND procedure.prosrc ILIKE '%central_kitchen%'
        AND procedure.prosrc ILIKE '%p_source_location_id%'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: central production storage is not explicit/caller-bound';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.is_inventory_production_operator()'
    )
      AND procedure.prosrc ILIKE '%owner%'
      AND procedure.prosrc ILIKE '%branch_manager%'
      AND procedure.prosrc ILIKE '%central_kitchen_lead%'
      AND procedure.prosrc NOT ILIKE '%central_supply_ops%'
      AND procedure.prosrc NOT ILIKE '%accountant%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: production operator roles are not exact';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)'
    )
      AND procedure.prosrc ILIKE
        '%public.is_inventory_production_operator()%'
      AND procedure.prosrc ILIKE
        '%production_cross_site_target_forbidden%'
      AND procedure.prosrc ILIKE
        '%v_source_branch_kind <> ''central_kitchen''%'
      AND procedure.prosrc ILIKE
        '%v_target_branch_kind <> ''branch''%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.get_production_recipe_context_for_location(bigint,bigint,bigint)'
    )
      AND procedure.prosrc ILIKE
        '%public.is_inventory_production_operator()%'
      AND procedure.prosrc ILIKE
        '%public.has_permission(%p_branch_id%'
      AND procedure.prosrc ILIKE '%branch_scope_violation%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.confirm_production_run(bigint,numeric,jsonb)'
    )
      AND procedure.prosrc ILIKE
        '%private.execute_confirm_production_run%'
      AND procedure.prosrc ILIKE
        '%production_cross_site_target_forbidden%'
      AND procedure.prosrc ILIKE
        '%inventory:production_confirm%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: production RPC scope contract is incomplete';
  END IF;

  IF to_regprocedure(
    'private.execute_confirm_production_run(bigint,numeric,jsonb)'
  ) IS NULL
     OR has_function_privilege(
       'authenticated',
       'private.execute_confirm_production_run(bigint,numeric,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'private.execute_confirm_production_run(bigint,numeric,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: production confirm core is externally callable';
  END IF;

  IF to_regclass('public.production_orders') IS NOT NULL
     OR to_regclass('public.production_order_items') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'stock_movements'
         AND column_name = 'production_order_id'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retired production-order model survived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('production_runs'::text)
    ) AS production_table(table_name)
    WHERE has_table_privilege(
        'authenticated',
        'public.' || production_table.table_name,
        'INSERT'
      )
       OR has_table_privilege(
        'authenticated',
        'public.' || production_table.table_name,
        'UPDATE'
      )
       OR has_table_privilege(
        'authenticated',
        'public.' || production_table.table_name,
        'DELETE'
      )
       OR has_table_privilege(
        'anon',
        'public.' || production_table.table_name,
        'INSERT'
      )
       OR has_table_privilege(
        'anon',
        'public.' || production_table.table_name,
        'UPDATE'
      )
       OR has_table_privilege(
        'anon',
        'public.' || production_table.table_name,
        'DELETE'
      )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: direct production table DML survived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('production_runs_select'::text, 'production_runs'::text)
    ) AS expected(policy_name, table_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polname = expected.policy_name
        AND policy.polrelid =
          ('public.' || expected.table_name)::regclass
        AND pg_catalog.pg_get_expr(
          policy.polqual,
          policy.polrelid
        ) ILIKE '%is_inventory_production_operator%'
        AND pg_catalog.pg_get_expr(
          policy.polqual,
          policy.polrelid
        ) ILIKE '%inventory:production_create%'
        AND pg_catalog.pg_get_expr(
          policy.polqual,
          policy.polrelid
        ) ILIKE '%inventory:production_confirm%'
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polname IN (
      'production_runs_write',
      'production_orders_write',
      'production_order_items_write'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: production table RLS authority is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public.bulk_import_production_recipes(jsonb)'::text,
          'private.execute_bulk_import_production_recipes(jsonb)'::text
        ),
        (
          'public.upsert_production_recipe_lines(bigint,jsonb,numeric,bigint)'::text,
          'private.execute_upsert_production_recipe_lines(bigint,jsonb,numeric,bigint)'::text
        )
    ) AS expected(public_signature, private_signature)
    WHERE to_regprocedure(expected.public_signature) IS NULL
       OR to_regprocedure(expected.private_signature) IS NULL
       OR has_function_privilege(
         'authenticated',
         expected.private_signature,
         'EXECUTE'
       )
       OR has_function_privilege(
         'service_role',
         expected.private_signature,
         'EXECUTE'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure
         WHERE procedure.oid =
           to_regprocedure(expected.public_signature)
           AND procedure.prosrc ILIKE '%owner%'
           AND procedure.prosrc ILIKE '%central_kitchen_lead%'
           AND procedure.prosrc NOT ILIKE '%branch_manager%'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: production recipe mutation authority is incomplete';
  END IF;

  IF has_table_privilege(
       'authenticated',
       'public.production_recipes',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.production_recipes',
       'UPDATE'
     )
     OR has_table_privilege(
       'anon',
       'public.production_recipes',
       'INSERT'
     )
     OR has_table_privilege(
       'anon',
       'public.production_recipes',
       'UPDATE'
     )
     OR NOT has_table_privilege(
       'authenticated',
       'public.production_recipes',
       'DELETE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polname = 'production_recipes_delete'
         AND policy.polrelid = 'public.production_recipes'::regclass
         AND pg_catalog.pg_get_expr(
           policy.polqual,
           policy.polrelid
         ) ILIKE '%owner%'
         AND pg_catalog.pg_get_expr(
           policy.polqual,
           policy.polrelid
         ) ILIKE '%central_kitchen_lead%'
         AND pg_catalog.pg_get_expr(
           policy.polqual,
           policy.polrelid
         ) NOT ILIKE '%branch_manager%'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polname = 'production_recipes_write'
         AND policy.polrelid = 'public.production_recipes'::regclass
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: production recipe table authority is incomplete';
  END IF;

  IF to_regprocedure(
       'public.upsert_recipe_lines(bigint,jsonb,bigint)'
     ) IS NULL
     OR NOT has_function_privilege(
       'authenticated',
       'public.upsert_recipe_lines(bigint,jsonb,bigint)',
       'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.upsert_recipe_lines(bigint,jsonb,bigint)'
       )
         AND procedure.prosecdef IS TRUE
         AND procedure.prosrc ILIKE '%auth_role() <> ''owner''%'
         AND procedure.prosrc ILIKE '%inventory:write%'
         AND procedure.prosrc ILIKE '%menu:write%'
         AND procedure.prosrc NOT ILIKE '%branch_manager%'
     )
     OR has_table_privilege(
       'authenticated',
       'public.recipes',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.recipes',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.recipes',
       'DELETE'
     )
     OR has_table_privilege(
       'anon',
       'public.recipes',
       'INSERT'
     )
     OR has_table_privilege(
       'anon',
       'public.recipes',
       'UPDATE'
     )
     OR has_table_privilege(
       'anon',
       'public.recipes',
       'DELETE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polname = 'recipes_write'
         AND policy.polrelid = 'public.recipes'::regclass
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: menu recipe mutation authority is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('stock_levels'::text),
        ('stock_transfers'::text),
        ('stock_transfer_items'::text)
    ) AS protected_table(table_name)
    WHERE has_table_privilege(
        'authenticated',
        'public.' || protected_table.table_name,
        'INSERT'
      )
       OR has_table_privilege(
        'authenticated',
        'public.' || protected_table.table_name,
        'UPDATE'
      )
       OR has_table_privilege(
        'authenticated',
        'public.' || protected_table.table_name,
        'DELETE'
      )
       OR has_table_privilege(
        'anon',
        'public.' || protected_table.table_name,
        'INSERT'
      )
       OR has_table_privilege(
        'anon',
        'public.' || protected_table.table_name,
        'UPDATE'
      )
       OR has_table_privilege(
        'anon',
        'public.' || protected_table.table_name,
        'DELETE'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polname IN (
      'stock_levels_insert',
      'stock_levels_update',
      'stock_transfers_insert',
      'stock_transfers_update',
      'stock_transfer_items_write'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: derived stock or transfer direct DML survived';
  END IF;

  IF to_regprocedure(
       'private.assert_stock_transfer_warehouse_endpoints(bigint,bigint)'
     ) IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'private.assert_stock_transfer_warehouse_endpoints(bigint,bigint)'
       )
         AND procedure.prosecdef IS FALSE
         AND procedure.prosrc ILIKE '%location_kind = ''warehouse''%'
         AND procedure.prosrc ILIKE '%is_active IS TRUE%'
         AND procedure.prosrc ILIKE '%FOR UPDATE%'
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           (
             'public.stock_transfer_mark_in_transit(bigint)'::text,
             'private.execute_stock_transfer_mark_in_transit(bigint)'::text
           ),
           (
             'public.stock_transfer_confirm_receive(bigint)'::text,
             'private.execute_stock_transfer_confirm_receive(bigint)'::text
           ),
           (
             'public.stock_transfer_receive(bigint,jsonb)'::text,
             'private.execute_stock_transfer_receive(bigint,jsonb)'::text
           )
       ) AS expected(public_signature, private_signature)
       WHERE to_regprocedure(expected.public_signature) IS NULL
          OR to_regprocedure(expected.private_signature) IS NULL
          OR has_function_privilege(
            'authenticated',
            expected.private_signature,
            'EXECUTE'
          )
          OR has_function_privilege(
            'service_role',
            expected.private_signature,
            'EXECUTE'
          )
          OR NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS procedure
            WHERE procedure.oid =
              to_regprocedure(expected.public_signature)
              AND procedure.prosecdef IS TRUE
              AND procedure.prosrc ILIKE
                '%assert_stock_transfer_warehouse_endpoints%'
          )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.stock_transfer_list_branches()'
       )
         AND procedure.prosecdef IS TRUE
         AND procedure.prosrc ILIKE '%branch_manager%'
         AND procedure.prosrc ILIKE '%central_supply_ops%'
         AND procedure.prosrc ILIKE '%central_kitchen_lead%'
         AND procedure.prosrc ILIKE '%v_branch_claim%'
         AND procedure.prosrc ILIKE '%location_kind = ''warehouse''%'
         AND procedure.prosrc ILIKE '%candidate.id = v_branch_claim%'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: transfer warehouse or branch-list authority is incomplete';
  END IF;

  IF to_regprocedure(
       'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)'
     ) IS NULL
     OR to_regprocedure(
       'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.save_ingredient_catalog_v2(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.upsert_ingredient_catalog(bigint,text,text,bigint,numeric,text,text,numeric,numeric,numeric,integer,jsonb)'
     ) IS NOT NULL
     OR to_regprocedure(
       'private.execute_upsert_ingredient_catalog(bigint,text,text,bigint,numeric,text,text,numeric,numeric,numeric,integer,jsonb)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.bulk_import_ingredients(jsonb)'
     ) IS NULL
     OR to_regprocedure(
       'private.execute_bulk_import_ingredients(jsonb)'
     ) IS NULL
     OR has_function_privilege(
       'authenticated',
       'private.execute_bulk_import_ingredients(jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'private.execute_bulk_import_ingredients(jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)',
       'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint)'
       )
         AND procedure.prosecdef IS TRUE
         AND procedure.proconfig @>
           ARRAY['search_path=""']::text[]
         AND procedure.prosrc ILIKE
           '%v_preserved_unit_cost%'
         AND procedure.prosrc ILIKE
           '%default_fulfill_site_kind%'
         AND procedure.prosrc ILIKE '%receipt_unit_id%'
         AND procedure.prosrc ILIKE '%issue_unit_id%'
         AND procedure.prosrc ILIKE '%auth_role() <> ''owner''%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.bulk_import_ingredients(jsonb)'
       )
         AND procedure.prosrc ILIKE
           '%v_sanitized_rows%'
         AND procedure.prosrc ILIKE
           '%raw.value - ''unit_cost''%'
         AND procedure.prosrc ILIKE
           '%FOR UPDATE OF ingredient%'
         AND procedure.prosrc ILIKE '%auth_role() <> ''owner''%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.toggle_ingredient_active(bigint)'
       )
         AND procedure.prosecdef IS TRUE
         AND procedure.prosrc ILIKE '%auth_role() <> ''owner''%'
     )
     OR has_column_privilege(
       'authenticated',
       'public.ingredients',
       'unit_cost',
       'INSERT'
     )
     OR has_column_privilege(
       'authenticated',
       'public.ingredients',
       'unit_cost',
       'UPDATE'
     )
     OR has_column_privilege(
       'anon',
       'public.ingredients',
       'unit_cost',
       'INSERT'
     )
     OR has_column_privilege(
       'anon',
       'public.ingredients',
       'unit_cost',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.ingredients',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.ingredients',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.ingredients',
       'DELETE'
     )
     OR has_table_privilege(
       'anon',
       'public.ingredients',
       'INSERT'
     )
     OR has_table_privilege(
       'anon',
       'public.ingredients',
       'UPDATE'
     )
     OR has_table_privilege(
       'anon',
       'public.ingredients',
       'DELETE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attrdef AS default_definition
       JOIN pg_catalog.pg_attribute AS attribute
         ON attribute.attrelid = default_definition.adrelid
        AND attribute.attnum = default_definition.adnum
       WHERE default_definition.adrelid =
           'public.ingredients'::regclass
         AND attribute.attname = 'unit_cost'
         AND pg_catalog.pg_get_expr(
           default_definition.adbin,
           default_definition.adrelid
         ) IN ('0', '0::numeric')
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: ingredient price authority is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public.bulk_import_ingredients(jsonb)'::text),
        ('public.bulk_import_production_recipes(jsonb)'::text)
    ) AS expected(signature)
    WHERE to_regprocedure(expected.signature) IS NULL
       OR NOT has_function_privilege(
         'authenticated',
         expected.signature,
         'EXECUTE'
       )
       OR has_function_privilege(
         'anon',
         expected.signature,
         'EXECUTE'
       )
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure
         CROSS JOIN LATERAL pg_catalog.aclexplode(
           coalesce(
             procedure.proacl,
             pg_catalog.acldefault('f', procedure.proowner)
           )
         ) AS privilege
         WHERE procedure.oid =
             to_regprocedure(expected.signature)
           AND privilege.grantee = 0
           AND privilege.privilege_type = 'EXECUTE'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: bulk import RPC execute ACL invalid';
  END IF;

  IF NOT has_table_privilege(
       'authenticated',
       'public.ingredient_categories',
       'INSERT'
     )
     OR NOT has_table_privilege(
       'authenticated',
       'public.ingredient_categories',
       'UPDATE'
     )
     OR NOT has_table_privilege(
       'authenticated',
       'public.ingredient_categories',
       'DELETE'
     )
     OR has_table_privilege(
       'anon',
       'public.ingredient_categories',
       'INSERT'
     )
     OR has_table_privilege(
       'anon',
       'public.ingredient_categories',
       'UPDATE'
     )
     OR has_table_privilege(
       'anon',
       'public.ingredient_categories',
       'DELETE'
     )
     OR NOT has_sequence_privilege(
       'authenticated',
       'public.ingredient_categories_id_seq',
       'USAGE'
     )
     OR has_sequence_privilege(
       'anon',
       'public.ingredient_categories_id_seq',
       'USAGE'
     )
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES
           ('ingredient_categories_insert'::text),
           ('ingredient_categories_update'::text),
           ('ingredient_categories_delete'::text)
       ) AS expected(policy_name)
       WHERE NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_policy AS policy
         WHERE policy.polname = expected.policy_name
           AND policy.polrelid =
             'public.ingredient_categories'::regclass
           AND (
             coalesce(
               pg_catalog.pg_get_expr(
                 policy.polqual,
                 policy.polrelid
               ),
               ''
             )
             || ' '
             || coalesce(
               pg_catalog.pg_get_expr(
                 policy.polwithcheck,
                 policy.polrelid
               ),
               ''
             )
           ) ILIKE '%auth_tenant_id%'
           AND (
             coalesce(
               pg_catalog.pg_get_expr(
                 policy.polqual,
                 policy.polrelid
               ),
               ''
             )
             || ' '
             || coalesce(
               pg_catalog.pg_get_expr(
                 policy.polwithcheck,
                 policy.polrelid
               ),
               ''
             )
           ) ILIKE '%auth_role%'
           AND (
             coalesce(
               pg_catalog.pg_get_expr(
                 policy.polqual,
                 policy.polrelid
               ),
               ''
             )
             || ' '
             || coalesce(
               pg_catalog.pg_get_expr(
                 policy.polwithcheck,
                 policy.polrelid
               ),
               ''
             )
           ) ILIKE '%owner%'
           AND (
             coalesce(
               pg_catalog.pg_get_expr(
                 policy.polqual,
                 policy.polrelid
               ),
               ''
             )
             || ' '
             || coalesce(
               pg_catalog.pg_get_expr(
                 policy.polwithcheck,
                 policy.polrelid
               ),
               ''
             )
           ) ILIKE '%inventory:write%'
           AND (
             coalesce(
               pg_catalog.pg_get_expr(
                 policy.polqual,
                 policy.polrelid
               ),
               ''
             )
             || ' '
             || coalesce(
               pg_catalog.pg_get_expr(
                 policy.polwithcheck,
                 policy.polrelid
               ),
               ''
             )
           ) NOT ILIKE '%branch_manager%'
       )
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: ingredient category authority is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'consume_stock_for_order'::text,
          'consume_stock_for_order_at_warehouse'::text
        ),
        (
          'consume_stock_for_order_service'::text,
          'consume_stock_for_order_at_warehouse'::text
        ),
        (
          'create_production_run_with_locations'::text,
          'location_kind = ''warehouse'''::text
        ),
        (
          'get_production_recipe_context_for_location'::text,
          'location_kind = ''warehouse'''::text
        ),
        (
          'branch_manager_approve_consumption_report'::text,
          'location_kind = ''warehouse'''::text
        )
    ) AS expected(function_name, source_marker)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = expected.function_name
        AND procedure.prosrc ILIKE
          '%' || expected.source_marker || '%'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: warehouse routing replacement is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public.create_stock_transfer_draft(bigint,bigint,text,text,text,jsonb,bigint,bigint)'::text
        ),
        (
          'public.create_grn_from_approved_po(bigint)'::text
        ),
        (
          'public.create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)'::text
        )
    ) AS expected(signature)
    WHERE to_regprocedure(expected.signature) IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure
         WHERE procedure.oid = to_regprocedure(expected.signature)
           AND procedure.prosrc ILIKE '%next_inventory_doc_number%'
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: Inventory creator bypasses sequential document allocator';
  END IF;

  SELECT string_agg(
    format('%I.%I', namespace.nspname, procedure.proname),
    ', '
    ORDER BY namespace.nspname, procedure.proname
  )
  INTO v_detail
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname IN ('public', 'private')
    AND procedure.proname = ANY (ARRAY[
      'ensure_branch_inventory_location_defaults',
      'trg_ensure_branch_inventory_location_defaults',
      'assert_inventory_site_warehouse',
      'enforce_inventory_site_warehouse',
      'enforce_branch_inventory_site_warehouse',
      'grn_rejection_photo_exists',
      'grn_physical_qc_is_valid',
      'any_grn_is_linked',
      'any_po_is_linked',
      'set_grn_line_total_cost',
      'validate_grn_physical_qc_before_confirm',
      'approve_purchase_order',
      'create_purchase_order_from_grn',
      'confirm_goods_receipt_note',
      'create_grn_from_approved_po',
      'create_expiry_writeoff',
      'amend_grn_line',
      'add_menu_item_stock_exception',
      'consume_stock_for_order_at_warehouse',
      'consume_stock_for_order',
      'consume_stock_for_order_service',
      'create_production_run_with_locations',
      'get_production_recipe_context_for_location',
      'confirm_production_run',
      'execute_confirm_production_run',
      'bulk_import_production_recipes',
      'upsert_production_recipe_lines',
      'execute_upsert_production_recipe_lines',
      'upsert_recipe_lines',
      'save_ingredient_catalog',
      'bulk_import_ingredients',
      'toggle_ingredient_active',
      'enforce_stock_transfer_direction',
      'create_stock_transfer_draft',
      'stock_transfer_confirm_ship',
      'stock_transfer_mark_in_transit',
      'stock_transfer_confirm_receive',
      'stock_transfer_receive',
      'stock_transfer_list_branches',
      'branch_manager_approve_consumption_report',
      'stock_issue_items_compute_waste_tier',
      'heartbeat_zone_lock',
      'release_zone_lock',
      'create_waste_entry',
      '_post_writeoff_movements',
      'update_ingredient_thresholds_bulk',
      'approve_inventory_count_slip',
      'adjust_stock_exception'
    ]::text[])
    AND (
      procedure.prosecdef IS DISTINCT FROM TRUE
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[]))
          AS setting(value)
        WHERE split_part(setting.value, '=', 1) = 'search_path'
      )
    );

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: Inventory SECURITY DEFINER/search_path invalid: %',
      v_detail;
  END IF;

  SELECT string_agg(
    format('%I.%I', namespace.nspname, procedure.proname),
    ', '
    ORDER BY namespace.nspname, procedure.proname
  )
  INTO v_detail
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'private'
    AND procedure.proname = ANY (ARRAY[
      'enforce_retrospective_grn_immutability',
      'enforce_retrospective_purchase_order_immutability',
      'enforce_linked_grn_line_immutability',
      'enforce_retrospective_purchase_order_line_immutability'
    ]::text[])
    AND (
      procedure.prosecdef IS DISTINCT FROM FALSE
      OR NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[]))
          AS setting(value)
        WHERE split_part(setting.value, '=', 1) = 'search_path'
      )
      OR procedure.prosrc NOT ILIKE '%CURRENT_USER%'
      OR procedure.prosrc NOT ILIKE '%relowner%'
    );

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: procurement guards are not invoker/RPC bounded: %',
      v_detail;
  END IF;

  IF has_table_privilege(
    'authenticated',
    'public.mv_food_cost',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: operational role can read mv_food_cost';
  END IF;

  IF has_table_privilege(
       'authenticated',
       'public.purchase_orders',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_orders',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_orders',
       'DELETE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_order_items',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_order_items',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_order_items',
       'DELETE'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: authenticated retained direct PO write authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'inventory-attachments'
  ) OR EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'grn-evidence'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: Inventory evidence bucket boundary invalid';
  END IF;

  SELECT pg_catalog.pg_get_expr(
    policy.polwithcheck,
    policy.polrelid
  )
  INTO v_detail
  FROM pg_catalog.pg_policy AS policy
  WHERE policy.polname = 'inv_attach_insert'
    AND policy.polrelid = 'storage.objects'::regclass;

  IF v_detail IS NULL
     OR v_detail NOT ILIKE '%grn.branch_id%'
     OR v_detail NOT ILIKE '%procurement:grn_create%'
     OR v_detail NOT ILIKE '%procurement:grn_amend%'
     OR v_detail NOT ILIKE '%grn_item.id%'
     OR v_detail NOT ILIKE '%array_length%'
     OR v_detail NOT ILIKE '%rejected%'
     OR v_detail NOT ILIKE '%mimetype%'
     OR v_detail NOT ILIKE '%image/webp%' THEN
    RAISE EXCEPTION
      'FINAL CATALOG: rejected-photo upload policy is not branch/image scoped';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('inv_attach_delete'::text),
        ('inv_attach_update'::text)
    ) AS expected(policy_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy AS policy
      WHERE policy.polname = expected.policy_name
        AND policy.polrelid = 'storage.objects'::regclass
        AND pg_catalog.pg_get_expr(
          policy.polqual,
          policy.polrelid
        ) ILIKE '%rejected%'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: rejected-photo mutation policy is not immutable';
  END IF;
END;
$$;

DO $$
DECLARE
  v_actor uuid := gen_random_uuid();
  v_tenant bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.positions AS position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE position.code = 'owner'
      AND coalesce(profile.is_active, TRUE) IS TRUE
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.tenants
    ALTER CONSTRAINT tenants_owner_user_id_fkey
    DEFERRABLE INITIALLY DEFERRED;
  SET CONSTRAINTS tenants_owner_user_id_fkey DEFERRED;

  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    '__inventory_test_' || v_actor::text,
    '__inventory_test_' || v_actor::text,
    v_actor
  )
  RETURNING id INTO v_tenant;

  INSERT INTO public.permission_keys (
    key,
    module,
    description,
    scope,
    is_delegable_to_staff
  )
  VALUES
    (
      'inventory:read',
      'inventory',
      'Inventory test read',
      'branch',
      TRUE
    ),
    (
      'inventory:write',
      'inventory',
      'Inventory test write',
      'branch',
      TRUE
    ),
    (
      'inventory:production_create',
      'inventory',
      'Inventory test production create',
      'branch',
      TRUE
    ),
    (
      'inventory:production_confirm',
      'inventory',
      'Inventory test production confirm',
      'branch',
      TRUE
    ),
    (
      'inventory:transfer_ship',
      'inventory',
      'Inventory test transfer ship',
      'branch',
      TRUE
    ),
    (
      'inventory:transfer_receive',
      'inventory',
      'Inventory test transfer receive',
      'branch',
      TRUE
    ),
    (
      'procurement:grn_create',
      'procurement',
      'Inventory test GRN create',
      'branch',
      TRUE
    ),
    (
      'procurement:grn_confirm',
      'procurement',
      'Inventory test GRN confirm',
      'branch',
      TRUE
    ),
    (
      'procurement:read',
      'procurement',
      'Inventory test procurement read',
      'either',
      TRUE
    )
  ON CONFLICT (key) DO UPDATE
  SET is_delegable_to_staff = TRUE;

  INSERT INTO public.positions (
    tenant_id,
    code,
    label_vi,
    label_en,
    is_active,
    is_system
  )
  VALUES
    (v_tenant, 'owner', 'Chủ', 'Owner', TRUE, TRUE),
    (
      v_tenant,
      'accountant',
      'Kế toán',
      'Accountant',
      TRUE,
      TRUE
    ),
    (
      v_tenant,
      'branch_manager',
      'Quản lý chi nhánh',
      'Branch manager',
      TRUE,
      TRUE
    ),
    (
      v_tenant,
      'central_supply_ops',
      'Quản lý kho Tổng',
      'Central supply operations',
      TRUE,
      TRUE
    ),
    (
      v_tenant,
      'central_kitchen_lead',
      'Bếp trưởng Bếp TT',
      'Central kitchen lead',
      TRUE,
      TRUE
    );

  INSERT INTO public.role_templates (
    tenant_id,
    name,
    position_code,
    permission_keys,
    is_system
  )
  VALUES
    (v_tenant, 'owner', 'owner', '{}'::text[], TRUE),
    (
      v_tenant,
      'accountant',
      'accountant',
      ARRAY['procurement:read']::text[],
      TRUE
    ),
    (
      v_tenant,
      'branch_manager',
      'branch_manager',
      ARRAY[
        'inventory:read',
        'inventory:write',
        'inventory:production_create',
        'inventory:production_confirm',
        'inventory:transfer_receive',
        'procurement:grn_create',
        'procurement:grn_confirm',
        'procurement:read'
      ]::text[],
      TRUE
    ),
    (
      v_tenant,
      'central_supply_ops',
      'central_supply_ops',
      ARRAY[
        'inventory:read',
        'inventory:write',
        'inventory:transfer_ship',
        'inventory:transfer_receive'
      ]::text[],
      TRUE
    ),
    (
      v_tenant,
      'central_kitchen_lead',
      'central_kitchen_lead',
      ARRAY[
        'inventory:read',
        'inventory:write',
        'inventory:production_create',
        'inventory:production_confirm',
        'inventory:transfer_ship',
        'inventory:transfer_receive'
      ]::text[],
      TRUE
    );

  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_actor,
    'inventory-owner-' || v_actor::text || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'position_code', 'owner'
    ),
    jsonb_build_object('full_name', 'Inventory owner test')
  );
END;
$$;

DO $$
DECLARE
  v_tenant bigint;
  v_actor uuid;
  v_code_a text;
  v_code_b text;
  v_branch_a bigint;
  v_branch_b bigint;
  v_foreign_tenant bigint;
  v_foreign_branch bigint;
  v_central_branch bigint;
  v_location_a bigint;
  v_location_b bigint;
  v_central_warehouse bigint;
  v_production_location bigint;
  v_transfer bigint;
  v_reclassified_transfer bigint;
  v_central_outbound_transfer bigint;
  v_central_inbound_transfer bigint;
  v_replacement_warehouse bigint;
  v_supplier bigint;
  v_unit bigint;
  v_alt_unit bigint;
  v_ingredient_category bigint;
  v_ingredient bigint;
  v_finished_good bigint;
  v_production_recipe bigint;
  v_menu_category bigint;
  v_menu_item bigint;
  v_menu_recipe bigint;
  v_cross_scope_run bigint;
  v_grn bigint;
  v_grn_line bigint;
  v_temp_grn bigint;
  v_temp_grn_line bigint;
  v_po bigint;
  v_result jsonb;
  v_error boolean;
  v_message text;
  v_document_number text;
  v_ingredient_record record;
  v_units_payload jsonb;
  v_unit_code text;
  v_cost_snapshot numeric;
  v_atomic_ingredient bigint;
  v_atomic_name text;
  v_atomic_invalid_name text;
  v_rejection_object_path text;
  v_rejection_photo_url text;
  v_quantity numeric;
  v_price constant numeric(15,2) := 999999.99;
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_actor
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE) IS TRUE
  ORDER BY profile.tenant_id, profile.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION
      'TEST SETUP: active owner profile is required';
  END IF;

  SELECT branch.tenant_id, branch.id
  INTO v_foreign_tenant, v_foreign_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id <> v_tenant
  ORDER BY branch.tenant_id, branch.id
  LIMIT 1;

  IF v_foreign_branch IS NULL THEN
    INSERT INTO public.tenants (
      name,
      slug,
      owner_user_id
    )
    VALUES (
      '__inventory_foreign_tenant_' || gen_random_uuid()::text,
      '__inventory_foreign_' || gen_random_uuid()::text,
      v_actor
    )
    RETURNING id INTO v_foreign_tenant;

    INSERT INTO public.branches (
      tenant_id,
      name,
      branch_kind,
      is_active,
      code
    )
    VALUES (
      v_foreign_tenant,
      '__inventory_foreign_branch_' || gen_random_uuid()::text,
      'branch',
      FALSE,
      'ZZZZ'
    )
    RETURNING id INTO v_foreign_branch;
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub',
    v_actor::text,
    TRUE
  );
  PERFORM set_config(
    'request.jwt.claim.role',
    'authenticated',
    TRUE
  );
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_actor::text,
      'role', 'authenticated',
      'iss', 'https://test.supabase.co/auth/v1',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );

  SELECT candidate.code
  INTO v_code_a
  FROM (
    SELECT
      chr(65 + value / 26)
        || chr(65 + value % 26) AS code
    FROM generate_series(0, 675) AS candidate_value(value)
  ) AS candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND branch.code = candidate.code
  )
  ORDER BY candidate.code
  LIMIT 1;

  IF v_code_a IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP: no free branch code';
  END IF;

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active,
    code
  )
  VALUES (
    v_tenant,
    '__inventory_topology_a_' || gen_random_uuid()::text,
    'branch',
    TRUE,
    v_code_a
  )
  RETURNING id INTO v_branch_a;

  SELECT candidate.code
  INTO v_code_b
  FROM (
    SELECT
      chr(65 + value / 26)
        || chr(65 + value % 26) AS code
    FROM generate_series(0, 675) AS candidate_value(value)
  ) AS candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND branch.code = candidate.code
  )
  ORDER BY candidate.code
  LIMIT 1;

  IF v_code_b IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP: no second free branch code';
  END IF;

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active,
    code
  )
  VALUES (
    v_tenant,
    '__inventory_topology_b_' || gen_random_uuid()::text,
    'branch',
    TRUE,
    v_code_b
  )
  RETURNING id INTO v_branch_b;

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active
  )
  VALUES (
    v_tenant,
    '__inventory_topology_central_' || gen_random_uuid()::text,
    'central_kitchen',
    TRUE
  )
  RETURNING id INTO v_central_branch;

  INSERT INTO public.inventory_locations (
    tenant_id,
    branch_id,
    code,
    name,
    location_kind,
    is_active
  )
  VALUES (
    v_tenant,
    v_central_branch,
    'production_storage',
    'Central production storage',
    'production_storage',
    TRUE
  )
  RETURNING id INTO v_production_location;

  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    IMMEDIATE;
  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    DEFERRED;

  IF v_production_location IS NULL THEN
    RAISE EXCEPTION
      'TOPOLOGY: central-kitchen production storage was not retained';
  END IF;

  SELECT location.id
  INTO v_location_a
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch_a
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE
    AND location.is_default_issue IS TRUE
    AND location.is_default_consumption IS TRUE;

  SELECT location.id
  INTO v_location_b
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch_b
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE
    AND location.is_default_issue IS TRUE
    AND location.is_default_consumption IS TRUE;

  SELECT location.id
  INTO v_central_warehouse
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_central_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE
    AND location.is_default_issue IS TRUE
    AND location.is_default_consumption IS TRUE;

  IF v_location_a IS NULL
     OR v_location_b IS NULL
     OR v_central_warehouse IS NULL THEN
    RAISE EXCEPTION
      'TOPOLOGY: new operational site did not receive a warehouse';
  END IF;

  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    DEFERRED;

  UPDATE public.inventory_locations
  SET code = 'rekey_staging',
      is_active = FALSE,
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE
  WHERE id = v_location_a;

  UPDATE public.inventory_locations
  SET branch_id = v_branch_a
  WHERE id = v_location_b;

  UPDATE public.inventory_locations
  SET branch_id = v_branch_b,
      code = 'main_warehouse',
      is_active = TRUE,
      is_default_receive = TRUE,
      is_default_issue = TRUE,
      is_default_consumption = TRUE
  WHERE id = v_location_a;

  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    IMMEDIATE;
  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    DEFERRED;

  SELECT location.id
  INTO v_location_a
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch_a
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  SELECT location.id
  INTO v_location_b
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch_b
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  v_error := FALSE;
  BEGIN
    DELETE FROM public.inventory_locations
    WHERE id = v_location_a;
    SET CONSTRAINTS
      inventory_locations_exact_warehouse_check
      IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TOPOLOGY: deleting the only warehouse was accepted';
  END IF;
  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check
    DEFERRED;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant,
      v_branch_a,
      'secondary_warehouse',
      'Secondary warehouse',
      'warehouse',
      TRUE
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TOPOLOGY: second active warehouse was accepted';
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant,
      v_branch_a,
      'legacy_kitchen',
      'Legacy location',
      'kitchen',
      TRUE
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TOPOLOGY: kitchen location was accepted';
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant,
      v_branch_a,
      'branch_production_storage',
      'Invalid branch production storage',
      'production_storage',
      TRUE
    );

    SET CONSTRAINTS
      inventory_locations_exact_warehouse_check
      IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TOPOLOGY: regular-branch production storage was accepted';
  END IF;
  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check
    DEFERRED;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.stock_transfers (
      tenant_id,
      from_branch_id,
      to_branch_id,
      from_location_id,
      to_location_id,
      transfer_number,
      created_by
    )
    VALUES (
      v_tenant,
      v_branch_a,
      v_branch_a,
      v_location_a,
      v_location_a,
      '__same_site_' || gen_random_uuid()::text,
      v_actor
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TRANSFER: same-site transfer was accepted';
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.stock_transfers (
      tenant_id,
      from_branch_id,
      to_branch_id,
      from_location_id,
      to_location_id,
      transfer_number,
      created_by
    )
    VALUES (
      v_tenant,
      v_branch_a,
      v_branch_b,
      v_location_a,
      v_location_a,
      '__wrong_target_' || gen_random_uuid()::text,
      v_actor
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TRANSFER: wrong-branch warehouse endpoint was accepted';
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_a,
    v_branch_b,
    v_location_a,
    v_location_b,
    '__warehouse_transfer_' || gen_random_uuid()::text,
    v_actor
  )
  RETURNING id INTO v_transfer;

  v_error := FALSE;
  BEGIN
    UPDATE public.stock_transfers
    SET to_location_id = v_location_a
    WHERE id = v_transfer;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TRANSFER: endpoint update escaped warehouse ownership trigger';
  END IF;

  INSERT INTO public.suppliers (
    tenant_id,
    name,
    is_active
  )
  VALUES (
    v_tenant,
    '__physical_qc_supplier_' || gen_random_uuid()::text,
    TRUE
  )
  RETURNING id INTO v_supplier;

  INSERT INTO public.units (
    tenant_id,
    code,
    name,
    is_active
  )
  VALUES (
    v_tenant,
    '__physical_qc_unit_' || gen_random_uuid()::text,
    'Physical QC unit',
    TRUE
  )
  RETURNING id INTO v_unit;

  INSERT INTO public.units (
    tenant_id,
    code,
    name,
    is_active
  )
  VALUES (
    v_tenant,
    '__physical_qc_alt_unit_' || gen_random_uuid()::text,
    'Physical QC alternate unit',
    TRUE
  )
  RETURNING id INTO v_alt_unit;

  INSERT INTO public.ingredient_categories (
    tenant_id,
    name,
    sort_order,
    is_active
  )
  VALUES (
    v_tenant,
    '__physical_qc_category_' || gen_random_uuid()::text,
    0,
    TRUE
  )
  RETURNING id INTO v_ingredient_category;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    category_id,
    unit_cost,
    item_kind,
    is_active
  )
  VALUES (
    v_tenant,
    '__physical_qc_ingredient_' || gen_random_uuid()::text,
    '__PHYSICAL-QC-' || gen_random_uuid()::text,
    v_ingredient_category,
    0,
    'raw_material',
    TRUE
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (
    v_tenant,
    v_ingredient,
    v_unit,
    1,
    TRUE,
    TRUE
  );

  INSERT INTO public.menu_categories (
    tenant_id,
    name,
    type,
    sort_order,
    is_active
  )
  VALUES (
    v_tenant,
    '__physical_qc_menu_category_' || gen_random_uuid()::text,
    'main_dish',
    0,
    TRUE
  )
  RETURNING id INTO v_menu_category;

  INSERT INTO public.menu_items (
    tenant_id,
    category_id,
    name,
    base_price,
    vat_rate,
    is_active
  )
  VALUES (
    v_tenant,
    v_menu_category,
    '__physical_qc_menu_item_' || gen_random_uuid()::text,
    0,
    0,
    TRUE
  )
  RETURNING id INTO v_menu_item;

  v_result := public.upsert_recipe_lines(
    v_menu_item,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id',
      v_ingredient,
      'quantity',
      1,
      'entry_unit_id',
      v_unit,
      'yield_factor',
      1
    )),
    NULL
  );
  IF v_result ->> 'kept_count' <> '1' THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: Owner menu recipe upsert failed: %',
      v_result;
  END IF;

  SELECT recipe.id
  INTO v_menu_recipe
  FROM public.recipes AS recipe
  WHERE recipe.tenant_id = v_tenant
    AND recipe.menu_item_id = v_menu_item
    AND recipe.ingredient_id = v_ingredient;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    is_active
  )
  VALUES (
    v_tenant,
    '__production_scope_finished_good_' || gen_random_uuid()::text,
    '__PRODUCTION-SCOPE-' || gen_random_uuid()::text,
    0,
    'finished_good',
    TRUE
  )
  RETURNING id INTO v_finished_good;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (
    v_tenant,
    v_finished_good,
    v_unit,
    1,
    TRUE,
    TRUE
  );

  v_result := public.upsert_production_recipe_lines(
    v_finished_good,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id',
      v_ingredient,
      'quantity',
      1,
      'entry_unit_id',
      v_unit
    )),
    1,
    NULL
  );
  IF v_result ->> 'kept_count' <> '1' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: Owner recipe upsert failed: %',
      v_result;
  END IF;

  SELECT recipe.id
  INTO v_production_recipe
  FROM public.production_recipes AS recipe
  WHERE recipe.tenant_id = v_tenant
    AND recipe.finished_good_id = v_finished_good
    AND recipe.ingredient_id = v_ingredient;

  v_result := public.create_production_run_with_locations(
    v_central_branch,
    v_finished_good,
    1,
    v_unit,
    'Owner central production cross-site authority',
    v_branch_b,
    NULL,
    v_production_location,
    v_location_b
  );
  IF (v_result ->> 'production_run_id')::bigint IS NULL THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: Owner central cross-site create failed: %',
      v_result;
  END IF;

  INSERT INTO public.production_runs (
    tenant_id,
    production_number,
    branch_id,
    source_location_id,
    target_branch_id,
    target_location_id,
    finished_good_id,
    planned_quantity,
    entry_unit_id,
    notes,
    created_by,
    status
  )
  VALUES (
    v_tenant,
    '__PRODUCTION-CROSS-SCOPE-' || gen_random_uuid()::text,
    v_branch_a,
    v_location_a,
    v_branch_b,
    v_location_b,
    v_finished_good,
    1,
    v_unit,
    'Hostile cross-site confirmation fixture',
    v_actor,
    'draft'
  )
  RETURNING id INTO v_cross_scope_run;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (
    v_tenant,
    v_ingredient,
    v_alt_unit,
    10,
    FALSE,
    TRUE
  );

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_expiry_writeoff(
      v_branch_a,
      v_location_a,
      v_ingredient,
      0,
      NULL,
      NULL,
      ARRAY[]::text[]
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'quantity must be positive' THEN
    RAISE EXCEPTION
      'WASTE: authenticated expiry write-off RPC is not callable: %',
      v_message;
  END IF;

  v_result := public.create_stock_transfer_draft(
    v_branch_a,
    v_branch_b,
    '__client_transfer_number_must_be_ignored__',
    NULL,
    NULL,
    jsonb_build_array(jsonb_build_object(
      'ingredientId',
      v_ingredient,
      'quantity',
      1,
      'entryUnitId',
      v_alt_unit
    )),
    v_location_a,
    v_location_b
  );
  v_transfer := (v_result ->> 'id')::bigint;

  SELECT transfer.transfer_number
  INTO v_document_number
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = v_transfer
    AND transfer.tenant_id = v_tenant;

  IF v_document_number !~ '^DC-[0-9]{4}-[0-9]{4,}$'
     OR v_document_number =
       '__client_transfer_number_must_be_ignored__' THEN
    RAISE EXCEPTION
      'TRANSFER: sequential document number was not allocated: %',
      v_document_number;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.transfer_id = v_transfer
      AND item.ingredient_id = v_ingredient
      AND item.entry_unit_id = v_alt_unit
      AND item.quantity = 1
  ) THEN
    RAISE EXCEPTION
      'TRANSFER: entry unit was not persisted by draft RPC';
  END IF;

  INSERT INTO public.supplier_items (
    tenant_id,
    supplier_id,
    ingredient_id,
    is_active,
    created_by
  )
  VALUES (
    v_tenant,
    v_supplier,
    v_ingredient,
    TRUE,
    v_actor
  );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_a,
    v_location_a,
    v_supplier,
    '__PHYSICAL-QC-GRN-' || gen_random_uuid()::text,
    'draft',
    v_actor
  )
  RETURNING id INTO v_grn;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.grn_items (
      tenant_id,
      grn_id,
      ingredient_id,
      received_quantity,
      rejected_quantity,
      entry_unit_id
    )
    VALUES (
      v_tenant,
      v_grn,
      v_ingredient,
      1,
      2,
      v_unit
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PHYSICAL QC: rejected quantity above received was accepted';
  END IF;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_b,
    v_location_b,
    v_supplier,
    '__UNLINKED-CRUD-GRN-' || gen_random_uuid()::text,
    'draft',
    v_actor
  )
  RETURNING id INTO v_temp_grn;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_grn,
    v_ingredient,
    10,
    2,
    v_alt_unit
  )
  RETURNING id INTO v_grn_line;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = v_grn
      AND item.tenant_id = v_tenant
      AND (
        item.unit_cost <> 0
        OR item.total_cost <> 0
      )
  ) THEN
    RAISE EXCEPTION
      'PHYSICAL QC: draft line did not use protected zero cost defaults';
  END IF;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_temp_grn,
    v_ingredient,
    1,
    0,
    v_unit
  )
  RETURNING id INTO v_temp_grn_line;

  UPDATE public.grn_items
  SET received_quantity = 2
  WHERE id = v_temp_grn_line;

  DELETE FROM public.grn_items
  WHERE id = v_temp_grn_line;

  DELETE FROM public.goods_received_notes
  WHERE id = v_temp_grn
    AND tenant_id = v_tenant;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_purchase_order_from_grn(v_grn);
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_physical_qc_incomplete' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: PO link accepted missing rejection evidence: %',
      v_message;
  END IF;

  UPDATE public.grn_items
  SET rejection_reason = 'Damaged on delivery',
      rejected_photo_url = 'https://example.com/rejected.webp'
  WHERE id = v_grn_line;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_purchase_order_from_grn(v_grn);
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_physical_qc_incomplete' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: PO link trusted an arbitrary rejection URL: %',
      v_message;
  END IF;

  v_rejection_object_path := v_tenant::text
    || '/grn/'
    || v_grn::text
    || '/rejected/'
    || v_grn_line::text
    || '/'
    || gen_random_uuid()::text
    || '.webp';
  v_rejection_photo_url :=
    'https://test.supabase.co/storage/v1/object/public/'
    || 'inventory-attachments/'
    || v_rejection_object_path;

  UPDATE public.grn_items
  SET rejected_photo_url = v_rejection_photo_url
  WHERE id = v_grn_line;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_purchase_order_from_grn(v_grn);
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_physical_qc_incomplete' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: PO link trusted a missing storage object: %',
      v_message;
  END IF;

  INSERT INTO storage.objects (
    bucket_id,
    name,
    owner_id,
    metadata
  )
  VALUES (
    'inventory-attachments',
    v_rejection_object_path,
    v_actor::text,
    '{"mimetype":"application/pdf"}'::jsonb
  );

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_purchase_order_from_grn(v_grn);
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_physical_qc_incomplete' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: PO link trusted non-image object metadata: %',
      v_message;
  END IF;

  UPDATE storage.objects
  SET metadata = '{"mimetype":"image/webp"}'::jsonb
  WHERE bucket_id = 'inventory-attachments'
    AND name = v_rejection_object_path;

  UPDATE public.grn_items
  SET rejected_photo_url =
    'https://evil.example/storage/v1/object/public/'
    || 'inventory-attachments/'
    || v_rejection_object_path
  WHERE id = v_grn_line;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_purchase_order_from_grn(v_grn);
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_physical_qc_incomplete' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: PO link trusted a non-canonical storage host: %',
      v_message;
  END IF;

  UPDATE public.grn_items
  SET rejected_photo_url = v_rejection_photo_url,
      rejected_quantity = received_quantity
  WHERE id = v_grn_line;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_purchase_order_from_grn(v_grn);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_has_no_receivable_lines' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: fully rejected draft created a zero-value PO: %',
      v_message;
  END IF;

  UPDATE public.grn_items
  SET rejected_quantity = 2
  WHERE id = v_grn_line;

  v_result := public.create_purchase_order_from_grn(v_grn);
  v_po := (v_result ->> 'po_id')::bigint;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.grn_items
    SET received_quantity = received_quantity + 1
    WHERE id = v_grn_line;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'linked_grn_lines_immutable' THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked draft GRN line update was accepted: %',
      v_message;
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.grn_items (
      tenant_id,
      grn_id,
      ingredient_id,
      received_quantity,
      rejected_quantity,
      entry_unit_id
    )
    VALUES (
      v_tenant,
      v_grn,
      v_ingredient,
      1,
      0,
      v_unit
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked draft GRN line insert was accepted';
  END IF;

  v_error := FALSE;
  BEGIN
    DELETE FROM public.grn_items
    WHERE id = v_grn_line;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked draft GRN line delete was accepted';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.goods_received_notes
    SET location_id = NULL
    WHERE id = v_grn;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked draft receiving location changed';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.goods_received_notes
    SET status = 'cancelled'
    WHERE id = v_grn;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked draft GRN was cancelled';
  END IF;

  v_error := FALSE;
  BEGIN
    DELETE FROM public.goods_received_notes
    WHERE id = v_grn;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked draft GRN was discarded';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.purchase_order_items
    SET quantity = quantity + 1
    WHERE tenant_id = v_tenant
      AND po_id = v_po;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked PO quantity snapshot changed';
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id
    )
    VALUES (
      v_tenant,
      v_po,
      v_ingredient,
      1,
      v_unit
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked PO line insert was accepted';
  END IF;

  v_error := FALSE;
  BEGIN
    DELETE FROM public.purchase_order_items
    WHERE tenant_id = v_tenant
      AND po_id = v_po;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: linked PO line delete was accepted';
  END IF;

  v_result := public.update_purchase_order_prices_protected(
    v_po,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'line_id',
          po_item.id,
          'unit_price',
          v_price
        )
      )
      FROM public.purchase_order_items AS po_item
      WHERE po_item.tenant_id = v_tenant
        AND po_item.po_id = v_po
    )
  );
  IF v_result ->> 'updated_lines' <> '1' THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: protected PO price update failed: %',
      v_result;
  END IF;

  v_result := public.approve_purchase_order(v_po);
  IF v_result ->> 'status' <> 'sent' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: PO approval failed: %',
      v_result;
  END IF;

  SELECT item.total_cost
  INTO v_quantity
  FROM public.grn_items AS item
  WHERE item.grn_id = v_grn
    AND item.tenant_id = v_tenant
    AND item.ingredient_id = v_ingredient;

  IF v_quantity <> round(8 * v_price, 2) THEN
    RAISE EXCEPTION
      'PHYSICAL QC: approved PO price was not synced: %',
      v_quantity;
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.purchase_order_items
    SET unit_price_est = v_price + 1
    WHERE tenant_id = v_tenant
      AND po_id = v_po;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: approved PO price snapshot changed';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.grn_items
    SET rejected_quantity = 0
    WHERE id = v_grn_line;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: approved-PO GRN QC snapshot changed';
  END IF;

  UPDATE public.supplier_items
  SET is_active = FALSE
  WHERE tenant_id = v_tenant
    AND supplier_id = v_supplier
    AND ingredient_id = v_ingredient;

  v_error := FALSE;
  BEGIN
    PERFORM public.create_grn_from_approved_po(v_po);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RECOVERY: authenticated caller reached recovery RPC';
  END IF;

  v_result := public.confirm_goods_receipt_note(v_grn);
  IF v_result ->> 'status' <> 'confirmed'
     OR v_result ->> 'po_status' <> 'received' THEN
    RAISE EXCEPTION
      'PHYSICAL QC: valid receipt did not confirm: %',
      v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.id = v_grn
      AND grn.tenant_id = v_tenant
      AND grn.status = 'confirmed'
      AND grn.location_id = v_location_a
  ) THEN
    RAISE EXCEPTION
      'PHYSICAL QC: confirmed GRN did not retain branch warehouse';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.goods_received_notes
    SET status = 'cancelled'
    WHERE id = v_grn;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: confirmed linked GRN was cancelled';
  END IF;

  SELECT movement.quantity_change
  INTO v_quantity
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.branch_id = v_branch_a
    AND movement.location_id = v_location_a
    AND movement.grn_id = v_grn
    AND movement.ingredient_id = v_ingredient
    AND movement.type = 'grn_receipt';

  IF v_quantity <> 80 THEN
    RAISE EXCEPTION
      'PHYSICAL QC: accepted entry quantity was not converted to 80 base units: %',
      v_quantity;
  END IF;

  v_result := public.amend_grn_line(
    v_grn,
    v_grn_line,
    9,
    2,
    'Verify rejection evidence boundary',
    'Damaged on delivery',
    v_rejection_photo_url
  );
  IF v_result ->> 'received_quantity' <> '9'
     OR v_result ->> 'rejected_quantity' <> '2'
     OR v_result ->> 'po_status' <> 'partially_received' THEN
    RAISE EXCEPTION
      'PROCUREMENT LOCK: Owner GRN amendment failed: %',
      v_result;
  END IF;

  SELECT ingredient.*
  INTO v_ingredient_record
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = v_ingredient
    AND ingredient.tenant_id = v_tenant;

  SELECT jsonb_agg(
    jsonb_build_object(
      'unit_id',
      ingredient_unit.unit_id,
      'to_base_factor',
      ingredient_unit.to_base_factor,
      'is_base',
      ingredient_unit.is_base,
      'anchor_unit_id',
      ingredient_unit.anchor_unit_id,
      'anchor_factor',
      ingredient_unit.anchor_factor,
      'sort_order',
      ingredient_unit.sort_order
    )
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
  )
  INTO v_units_payload
  FROM public.ingredient_units AS ingredient_unit
  WHERE ingredient_unit.tenant_id = v_tenant
    AND ingredient_unit.ingredient_id = v_ingredient
    AND ingredient_unit.is_active IS TRUE;

  v_cost_snapshot := v_ingredient_record.unit_cost;

  PERFORM public.save_ingredient_catalog(
    v_ingredient,
    v_ingredient_record.name,
    v_ingredient_record.sku,
    v_ingredient_record.category_id,
    v_ingredient_record.item_kind,
    v_ingredient_record.storage_type,
    v_ingredient_record.min_stock_level,
    v_ingredient_record.max_stock_level,
    v_ingredient_record.reorder_point,
    v_ingredient_record.shelf_life_days,
    v_units_payload,
    v_ingredient_record.default_fulfill_site_kind,
    v_ingredient_record.receipt_unit_id,
    v_ingredient_record.issue_unit_id,
    v_ingredient_record.production_unit_id
  );

  IF (
    SELECT ingredient.unit_cost
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = v_ingredient
      AND ingredient.tenant_id = v_tenant
  ) IS DISTINCT FROM v_cost_snapshot THEN
    RAISE EXCEPTION
      'PRICE AUTHORITY: atomic catalog save changed WAC';
  END IF;

  v_atomic_invalid_name :=
    '__atomic_invalid_' || gen_random_uuid()::text;
  v_error := FALSE;
  BEGIN
    PERFORM public.save_ingredient_catalog(
      NULL,
      v_atomic_invalid_name,
      NULL,
      NULL,
      'raw_material',
      'ambient',
      0,
      NULL,
      NULL,
      NULL,
      v_units_payload,
      'invalid_site_kind',
      v_ingredient_record.receipt_unit_id,
      v_ingredient_record.issue_unit_id,
      v_ingredient_record.production_unit_id
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error OR EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.name = v_atomic_invalid_name
  ) THEN
    RAISE EXCEPTION
      'CATALOG ATOMICITY: invalid fulfill kind left a partial ingredient';
  END IF;

  v_atomic_name := '__atomic_catalog_' || gen_random_uuid()::text;
  v_atomic_ingredient := public.save_ingredient_catalog(
    NULL,
    v_atomic_name,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    v_units_payload,
    'central_supply',
    v_ingredient_record.receipt_unit_id,
    v_ingredient_record.issue_unit_id,
    v_ingredient_record.production_unit_id
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = v_atomic_ingredient
      AND ingredient.tenant_id = v_tenant
      AND ingredient.unit_cost = 0
      AND ingredient.default_fulfill_site_kind = 'central_supply'
      AND ingredient.receipt_unit_id = v_ingredient_record.receipt_unit_id
      AND ingredient.issue_unit_id = v_ingredient_record.issue_unit_id
      AND ingredient.production_unit_id IS NOT DISTINCT FROM v_ingredient_record.production_unit_id
  ) THEN
    RAISE EXCEPTION
      'CATALOG ATOMICITY: create did not persist catalog and fulfill kind';
  END IF;

  PERFORM public.save_ingredient_catalog(
    v_atomic_ingredient,
    v_atomic_name,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    v_units_payload,
    'central_kitchen',
    v_ingredient_record.receipt_unit_id,
    v_ingredient_record.issue_unit_id,
    v_ingredient_record.production_unit_id
  );

  IF (
    SELECT ingredient.default_fulfill_site_kind
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = v_atomic_ingredient
      AND ingredient.tenant_id = v_tenant
  ) IS DISTINCT FROM 'central_kitchen' THEN
    RAISE EXCEPTION
      'CATALOG ATOMICITY: update did not persist fulfill kind';
  END IF;

  PERFORM public.save_ingredient_catalog(
    v_atomic_ingredient,
    v_atomic_name,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    v_units_payload,
    NULL,
    v_ingredient_record.receipt_unit_id,
    v_ingredient_record.issue_unit_id,
    v_ingredient_record.production_unit_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = v_atomic_ingredient
      AND ingredient.tenant_id = v_tenant
      AND (
        ingredient.unit_cost IS DISTINCT FROM 0
        OR ingredient.default_fulfill_site_kind IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'CATALOG ATOMICITY: clear changed unit cost or kept fulfill kind';
  END IF;

  SELECT unit.code
  INTO v_unit_code
  FROM public.units AS unit
  WHERE unit.id = v_unit
    AND unit.tenant_id = v_tenant;

  v_atomic_name := '__catalog_bulk_' || gen_random_uuid()::text;
  PERFORM public.bulk_import_ingredients(
    jsonb_build_array(jsonb_build_object(
      'name', v_atomic_name,
      'unit', v_unit_code,
      'item_kind', 'raw_material',
      'unit_cost', 0,
      'min_stock_level', 0,
      'storage_type', 'ambient'
    ))
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.tenant_id = v_tenant
      AND ingredient.name = v_atomic_name
      AND ingredient.receipt_unit_id = v_unit
      AND ingredient.issue_unit_id = v_unit
      AND ingredient.production_unit_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'CATALOG IMPORT: new item did not persist import and issue unit roles';
  END IF;

  v_result := public.stock_transfer_confirm_ship(v_transfer);
  IF v_result ->> 'status' <> 'confirmed_ship' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: owner could not ship transfer fixture: %',
      v_result;
  END IF;

  v_result := public.create_stock_transfer_draft(
    v_branch_a,
    v_central_branch,
    '__reclassified_transfer_endpoint__',
    NULL,
    NULL,
    jsonb_build_array(jsonb_build_object(
      'ingredientId',
      v_ingredient,
      'quantity',
      1,
      'entryUnitId',
      v_unit
    )),
    v_location_a,
    v_central_warehouse
  );
  v_reclassified_transfer := (v_result ->> 'id')::bigint;

  v_result := public.stock_transfer_confirm_ship(
    v_reclassified_transfer
  );
  IF v_result ->> 'status' <> 'confirmed_ship' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: reclassification fixture could not ship: %',
      v_result;
  END IF;

  UPDATE public.inventory_locations
  SET code = 'transfer_endpoint_storage_'
        || v_reclassified_transfer::text,
      name = 'Reclassified transfer endpoint',
      location_kind = 'production_storage',
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE
  WHERE id = v_central_warehouse
    AND tenant_id = v_tenant;

  INSERT INTO public.inventory_locations (
    tenant_id,
    branch_id,
    code,
    name,
    location_kind,
    is_active,
    is_default_receive,
    is_default_issue,
    is_default_consumption,
    sort_order
  )
  VALUES (
    v_tenant,
    v_central_branch,
    'main_warehouse',
    'Kho Bếp Trung Tâm',
    'warehouse',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    0
  )
  RETURNING id INTO v_replacement_warehouse;

  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    IMMEDIATE;
  SET CONSTRAINTS
    inventory_locations_exact_warehouse_check,
    branches_exact_warehouse_check
    DEFERRED;

  v_error := FALSE;
  BEGIN
    PERFORM public.stock_transfer_mark_in_transit(
      v_reclassified_transfer
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: transit accepted a reclassified endpoint';
  END IF;

  UPDATE public.stock_transfers
  SET status = 'in_transit'
  WHERE id = v_reclassified_transfer
    AND tenant_id = v_tenant;

  v_error := FALSE;
  BEGIN
    PERFORM public.stock_transfer_confirm_receive(
      v_reclassified_transfer
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: receive confirmation accepted a reclassified endpoint';
  END IF;

  UPDATE public.stock_transfers
  SET status = 'confirmed_receive'
  WHERE id = v_reclassified_transfer
    AND tenant_id = v_tenant;

  v_error := FALSE;
  BEGIN
    PERFORM public.stock_transfer_receive(
      v_reclassified_transfer,
      NULL
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: receive posted into a reclassified endpoint';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = v_tenant
      AND movement.transfer_id = v_reclassified_transfer
      AND movement.type = 'transfer_in'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_reclassified_transfer
      AND transfer.status = 'confirmed_receive'
  ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: rejected endpoint posted or changed receive state';
  END IF;

  PERFORM public.adjust_stock_exception(
    v_central_branch,
    v_ingredient,
    10,
    'central transfer fixture'
  );

  v_result := public.create_stock_transfer_draft(
    v_central_branch,
    v_branch_a,
    NULL,
    'central role outbound fixture',
    NULL,
    jsonb_build_array(jsonb_build_object(
      'ingredientId',
      v_ingredient,
      'quantity',
      1,
      'entryUnitId',
      v_unit
    )),
    v_replacement_warehouse,
    v_location_a
  );
  v_central_outbound_transfer := (v_result ->> 'id')::bigint;

  UPDATE public.branches
  SET is_active = FALSE
  WHERE id = v_branch_a
    AND tenant_id = v_tenant;

  v_error := FALSE;
  BEGIN
    PERFORM public.stock_transfer_confirm_ship(
      v_central_outbound_transfer
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error
     OR EXISTS (
       SELECT 1
       FROM public.stock_movements AS movement
       WHERE movement.tenant_id = v_tenant
         AND movement.transfer_id = v_central_outbound_transfer
     )
     OR (
       SELECT transfer.status
       FROM public.stock_transfers AS transfer
       WHERE transfer.id = v_central_outbound_transfer
     ) <> 'draft' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: inactive target branch reached ship lifecycle';
  END IF;

  UPDATE public.branches
  SET is_active = TRUE
  WHERE id = v_branch_a
    AND tenant_id = v_tenant;

  v_result := public.create_stock_transfer_draft(
    v_branch_a,
    v_central_branch,
    NULL,
    'central role inbound fixture',
    NULL,
    jsonb_build_array(jsonb_build_object(
      'ingredientId',
      v_ingredient,
      'quantity',
      1,
      'entryUnitId',
      v_unit
    )),
    v_location_a,
    v_replacement_warehouse
  );
  v_central_inbound_transfer := (v_result ->> 'id')::bigint;

  v_result := public.stock_transfer_confirm_ship(
    v_central_inbound_transfer
  );
  IF v_result ->> 'status' <> 'confirmed_ship' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central inbound fixture ship failed: %',
      v_result;
  END IF;
  v_result := public.stock_transfer_mark_in_transit(
    v_central_inbound_transfer
  );
  IF v_result ->> 'status' <> 'in_transit' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central inbound fixture transit failed: %',
      v_result;
  END IF;

  PERFORM set_config(
    'test.inventory_policy_tenant',
    v_tenant::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_branch_a',
    v_branch_a::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_branch_b',
    v_branch_b::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_central_branch',
    v_central_branch::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_production_location',
    v_production_location::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_production_finished_good',
    v_finished_good::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_production_unit',
    v_unit::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_production_recipe',
    v_production_recipe::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_menu_item',
    v_menu_item::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_menu_recipe',
    v_menu_recipe::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_ingredient_category',
    v_ingredient_category::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_ingredient',
    v_ingredient::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_ingredient_name',
    v_ingredient_record.name,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_unit_code',
    v_unit_code,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_ingredient_cost',
    v_cost_snapshot::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_transfer',
    v_transfer::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_central_outbound_transfer',
    v_central_outbound_transfer::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_central_inbound_transfer',
    v_central_inbound_transfer::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_cross_scope_run',
    v_cross_scope_run::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_foreign_branch',
    v_foreign_branch::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_location_a',
    v_location_a::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_location_b',
    v_location_b::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_supplier',
    v_supplier::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_linked_grn',
    v_grn::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_owner',
    v_actor::text,
    TRUE
  );

  RAISE NOTICE
    'Inventory topology and physical-QC final catalog/behavior passed';
END;
$$;

DO $$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_central_branch bigint :=
    current_setting('test.inventory_central_branch')::bigint;
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_central_lead uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_central_lead,
    'production-central-lead-'
      || v_central_lead::text
      || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'branch_id', v_central_branch,
      'position_code', 'central_kitchen_lead',
      'provisioned_by', v_owner
    ),
    jsonb_build_object('full_name', 'Production central lead test')
  );

  PERFORM set_config(
    'test.inventory_central_lead',
    v_central_lead::text,
    TRUE
  );
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_central_lead'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_central_lead'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_central_branch bigint :=
    current_setting('test.inventory_central_branch')::bigint;
  v_branch_a bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_branch_b bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_location_a bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_production_location bigint :=
    current_setting('test.inventory_production_location')::bigint;
  v_central_outbound_transfer bigint :=
    current_setting(
      'test.inventory_central_outbound_transfer'
    )::bigint;
  v_central_inbound_transfer bigint :=
    current_setting(
      'test.inventory_central_inbound_transfer'
    )::bigint;
  v_finished_good bigint :=
    current_setting('test.inventory_production_finished_good')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_unit bigint :=
    current_setting('test.inventory_production_unit')::bigint;
  v_result jsonb;
  v_run_id bigint;
  v_central_warehouse bigint;
  v_error boolean := FALSE;
  v_message text;
BEGIN
  SELECT location.id
  INTO v_central_warehouse
  FROM public.inventory_locations AS location
  WHERE location.branch_id = v_central_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission(
       v_central_branch,
       'inventory:production_create'
     )
     OR NOT public.has_permission(
       v_central_branch,
       'inventory:production_confirm'
     ) THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: central-kitchen lead role/grants rejected';
  END IF;

  IF NOT public.has_permission(
       v_central_branch,
       'inventory:transfer_ship'
     )
     OR NOT public.has_permission(
       v_central_branch,
       'inventory:transfer_receive'
     )
     OR public.has_permission(
       v_central_branch,
       'inventory:transfer_create'
     ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central-kitchen lead grants are not exact';
  END IF;

  BEGIN
    PERFORM public.create_stock_transfer_draft(
      v_central_branch,
      v_branch_a,
      NULL,
      'hostile central create',
      NULL,
      jsonb_build_array(jsonb_build_object(
        'ingredientId',
        v_ingredient,
        'quantity',
        1,
        'entryUnitId',
        v_unit
      )),
      v_central_warehouse,
      v_location_a
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'forbidden_transfer_create' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central-kitchen lead created transfer: %',
      v_message;
  END IF;

  v_result := public.stock_transfer_confirm_ship(
    v_central_outbound_transfer
  );
  IF v_result ->> 'status' <> 'confirmed_ship' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central-kitchen lead ship failed: %',
      v_result;
  END IF;

  v_result := public.stock_transfer_confirm_receive(
    v_central_inbound_transfer
  );
  IF v_result ->> 'status' <> 'confirmed_receive' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central-kitchen lead receive confirmation failed: %',
      v_result;
  END IF;
  v_result := public.stock_transfer_receive(
    v_central_inbound_transfer,
    NULL
  );
  IF v_result ->> 'status' <> 'received' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central-kitchen lead receive failed: %',
      v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.id = v_central_branch
      AND branch.branch_kind = 'central_kitchen'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.id = v_branch_a
      AND branch.branch_kind = 'branch'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.id = v_branch_b
      AND branch.branch_kind = 'branch'
  ) OR EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.branch_kind = 'central_kitchen'
      AND branch.id <> v_central_branch
  ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: central-kitchen lead branch list is not direction-safe';
  END IF;

  v_result := public.get_production_recipe_context_for_location(
    v_finished_good,
    v_central_branch,
    v_production_location
  );
  IF v_result IS NULL THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: central-kitchen lead context failed';
  END IF;

  v_result := public.upsert_production_recipe_lines(
    v_finished_good,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id',
      v_ingredient,
      'quantity',
      2,
      'entry_unit_id',
      v_unit
    )),
    1,
    NULL
  );
  IF v_result ->> 'kept_count' <> '1' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: central-kitchen lead recipe upsert failed: %',
      v_result;
  END IF;

  v_result := public.create_production_run_with_locations(
    v_central_branch,
    v_finished_good,
    1,
    v_unit,
    'Central-kitchen lead own-site authority',
    v_central_branch,
    NULL,
    v_production_location,
    v_production_location
  );
  v_run_id := (v_result ->> 'production_run_id')::bigint;
  IF v_run_id IS NULL THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: central-kitchen lead create failed: %',
      v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.production_runs AS run
    WHERE run.id = v_run_id
      AND run.branch_id = v_central_branch
      AND run.target_branch_id = v_central_branch
  ) THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: central-kitchen lead cannot read own run';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.production_runs
    SET notes = 'Direct DML must stay blocked'
    WHERE id = v_run_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: authenticated direct run update survived';
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_owner'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_owner'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

DO $$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_actor uuid :=
    current_setting('test.inventory_owner')::uuid;
  v_branch bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_location bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_supplier bigint :=
    current_setting('test.inventory_policy_supplier')::bigint;
  v_ingredient bigint;
  v_unit bigint;
  v_grn bigint;
  v_grn_line bigint;
  v_recovery_po bigint;
  v_orphan_po bigint;
  v_display text;
  v_error boolean;
BEGIN
  UPDATE public.supplier_items
  SET is_active = TRUE
  WHERE tenant_id = v_tenant
    AND supplier_id = v_supplier;

  SELECT supplier_item.ingredient_id, ingredient_unit.unit_id
  INTO v_ingredient, v_unit
  FROM public.supplier_items AS supplier_item
  JOIN public.ingredient_units AS ingredient_unit
    ON ingredient_unit.tenant_id = supplier_item.tenant_id
   AND ingredient_unit.ingredient_id = supplier_item.ingredient_id
   AND ingredient_unit.is_base IS TRUE
   AND ingredient_unit.is_active IS TRUE
  WHERE supplier_item.tenant_id = v_tenant
    AND supplier_item.supplier_id = v_supplier
    AND supplier_item.is_active IS TRUE
  ORDER BY supplier_item.id, ingredient_unit.id
  LIMIT 1;

  IF v_ingredient IS NULL OR v_unit IS NULL THEN
    RAISE EXCEPTION
      'RPC AUTHORITY SETUP: active supplier item/base unit required';
  END IF;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch,
    v_location,
    v_supplier,
    '__RPC-AUTH-GRN-' || gen_random_uuid()::text,
    'draft',
    v_actor
  )
  RETURNING id INTO v_grn;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_grn,
    v_ingredient,
    5,
    0,
    v_unit
  )
  RETURNING id INTO v_grn_line;

  v_error := FALSE;
  BEGIN
    UPDATE public.grn_items
    SET unit_cost = 'NaN'::numeric
    WHERE id = v_grn_line
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation OR numeric_value_out_of_range THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: GRN unit_cost accepted NaN';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.grn_items
    SET total_cost = 'Infinity'::numeric
    WHERE id = v_grn_line
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation OR numeric_value_out_of_range THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: GRN total_cost accepted Infinity';
  END IF;

  v_display := public.next_po_display_id(v_tenant);
  INSERT INTO public.purchase_orders (
    tenant_id,
    branch_id,
    supplier_id,
    po_number,
    display_id,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch,
    v_supplier,
    v_display,
    v_display,
    'draft',
    v_actor
  )
  RETURNING id INTO v_recovery_po;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_price_est,
    line_total
  )
  VALUES (
    v_tenant,
    v_recovery_po,
    v_ingredient,
    5,
    v_unit,
    123456.78,
    617283.90
  );

  v_error := FALSE;
  BEGIN
    UPDATE public.purchase_order_items
    SET quantity = 'NaN'::numeric
    WHERE tenant_id = v_tenant
      AND po_id = v_recovery_po;
  EXCEPTION
    WHEN check_violation OR numeric_value_out_of_range THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: PO quantity accepted NaN';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'sent'
  WHERE id = v_recovery_po
    AND tenant_id = v_tenant;

  v_display := public.next_po_display_id(v_tenant);
  INSERT INTO public.purchase_orders (
    tenant_id,
    branch_id,
    supplier_id,
    po_number,
    display_id,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch,
    v_supplier,
    v_display,
    v_display,
    'draft',
    v_actor
  )
  RETURNING id INTO v_orphan_po;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_price_est,
    line_total
  )
  VALUES (
    v_tenant,
    v_orphan_po,
    v_ingredient,
    1,
    v_unit,
    123456.78,
    123456.78
  );

  PERFORM set_config('test.inventory_rpc_grn', v_grn::text, TRUE);
  PERFORM set_config(
    'test.inventory_rpc_grn_line',
    v_grn_line::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_recovery_po',
    v_recovery_po::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_orphan_po',
    v_orphan_po::text,
    TRUE
  );
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_owner'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_owner'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_grn bigint := current_setting('test.inventory_rpc_grn')::bigint;
  v_grn_line bigint :=
    current_setting('test.inventory_rpc_grn_line')::bigint;
  v_recovery_po bigint :=
    current_setting('test.inventory_recovery_po')::bigint;
  v_orphan_po bigint :=
    current_setting('test.inventory_orphan_po')::bigint;
  v_foreign_branch bigint :=
    current_setting('test.inventory_foreign_branch')::bigint;
  v_linked_po bigint;
  v_result jsonb;
  v_error boolean;
  v_message text;
  v_constraint text;
  v_rows integer;
  v_price constant numeric(15,2) := 123456.78;
BEGIN
  v_error := FALSE;
  v_constraint := NULL;
  BEGIN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant,
      v_foreign_branch,
      'cross_tenant_mismatch',
      'Cross-tenant mismatch',
      'warehouse',
      FALSE
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_error := TRUE;
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  END;
  IF NOT v_error
     OR v_constraint <> 'inventory_locations_branch_tenant_fkey' THEN
    RAISE EXCEPTION
      'TOPOLOGY AUTHORITY: cross-tenant branch/location pair was not rejected by composite FK: %',
      v_constraint;
  END IF;

  UPDATE public.grn_items
  SET received_quantity = 6
  WHERE id = v_grn_line
    AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: authenticated unlinked GRN line update failed';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.grn_items
    SET received_quantity = 'NaN'::numeric
    WHERE id = v_grn_line
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: authenticated GRN received_quantity accepted NaN';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.grn_items
    SET rejected_quantity = 'NaN'::numeric
    WHERE id = v_grn_line
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: authenticated GRN rejected_quantity accepted NaN';
  END IF;

  v_error := FALSE;
  BEGIN
    UPDATE public.purchase_order_items
    SET quantity = 'NaN'::numeric
    WHERE tenant_id = v_tenant
      AND po_id = v_recovery_po;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: authenticated retained direct PO-line update';
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      po_number,
      display_id,
      status,
      created_by
    )
    SELECT
      purchase_order.tenant_id,
      purchase_order.branch_id,
      purchase_order.supplier_id,
      '__DIRECT-PO-' || gen_random_uuid()::text,
      '__DIRECT-PO-' || gen_random_uuid()::text,
      'draft',
      auth.uid()
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = v_orphan_po;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: authenticated created a direct PO';
  END IF;

  v_error := FALSE;
  BEGIN
    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      item.tenant_id,
      v_orphan_po,
      item.ingredient_id,
      item.quantity,
      item.entry_unit_id,
      item.unit_price_est,
      item.line_total
    FROM public.purchase_order_items AS item
    WHERE item.po_id = v_orphan_po
    LIMIT 1;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: authenticated inserted a direct PO line';
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.approve_purchase_order(v_orphan_po);
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error
     OR v_message <>
       'approve_purchase_order: linked draft GRN required' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: orphan PO approval was not rejected: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.update_purchase_order_prices_protected(
      v_orphan_po,
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'line_id',
            po_item.id,
            'unit_price',
            v_price
          )
        )
        FROM public.purchase_order_items AS po_item
        WHERE po_item.tenant_id = v_tenant
          AND po_item.po_id = v_orphan_po
      )
    );
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error
     OR v_message <> 'purchase_order_not_linked_to_draft_grn' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: orphan PO price update was not rejected: %',
      v_message;
  END IF;

  DELETE FROM public.grn_items
  WHERE id = v_grn_line
    AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: authenticated unlinked GRN line delete failed';
  END IF;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id
  )
  SELECT
    po_item.tenant_id,
    v_grn,
    po_item.ingredient_id,
    po_item.quantity,
    0,
    po_item.entry_unit_id
  FROM public.purchase_order_items AS po_item
  WHERE po_item.tenant_id = v_tenant
    AND po_item.po_id = v_recovery_po
  RETURNING id INTO v_grn_line;

  IF v_grn_line IS NULL THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: authenticated unlinked GRN line insert failed';
  END IF;
  PERFORM set_config(
    'test.inventory_rpc_grn_line',
    v_grn_line::text,
    TRUE
  );

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    INSERT INTO public.goods_received_notes (
      tenant_id,
      branch_id,
      location_id,
      supplier_id,
      grn_number,
      status,
      created_by
    )
    SELECT
      grn.tenant_id,
      grn.branch_id,
      grn.location_id,
      grn.supplier_id,
      '__DIRECT-CONFIRMED-' || gen_random_uuid()::text,
      'confirmed',
      auth.uid()
    FROM public.goods_received_notes AS grn
    WHERE grn.id = v_grn
      AND grn.tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_must_start_as_draft' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct confirmed GRN insert was accepted: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.goods_received_notes
    SET status = 'confirmed'
    WHERE id = v_grn
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_confirm_requires_approved_po' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct unlinked GRN confirm was accepted: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.goods_received_notes
    SET po_id = v_recovery_po
    WHERE id = v_grn
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'grn_po_link_requires_rpc' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct authenticated PO link was not rejected: %',
      v_message;
  END IF;

  v_result := public.create_purchase_order_from_grn(v_grn);
  v_linked_po := (v_result ->> 'po_id')::bigint;
  IF v_linked_po IS NULL THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: canonical GRN-to-PO RPC failed: %',
      v_result;
  END IF;

  v_error := FALSE;
  BEGIN
    PERFORM public.update_purchase_order_prices_protected(
      v_linked_po,
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'line_id',
            po_item.id,
            'unit_price',
            'NaN'
          )
        )
        FROM public.purchase_order_items AS po_item
        WHERE po_item.tenant_id = v_tenant
          AND po_item.po_id = v_linked_po
      )
    );
  EXCEPTION
    WHEN check_violation
      OR invalid_text_representation
      OR numeric_value_out_of_range THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: protected linked PO price accepted NaN';
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.goods_received_notes
    SET status = 'confirmed'
    WHERE id = v_grn
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'linked_grn_immutable' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct authenticated confirm was not rejected: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.purchase_orders
    SET status = 'sent'
    WHERE id = v_linked_po
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct authenticated linked PO approval was accepted';
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.purchase_orders
    SET notes = 'direct-linked-header-mutation'
    WHERE id = v_linked_po
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct authenticated linked PO identity mutation was accepted';
  END IF;

  PERFORM set_config(
    'comtammatu.grn_recovery_insert',
    'true',
    TRUE
  );
  PERFORM set_config(
    'comtammatu.grn_po_price_sync',
    'true',
    TRUE
  );

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.grn_items
    SET received_quantity = received_quantity + 1
    WHERE id = v_grn_line
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'linked_grn_lines_immutable' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: forged GUC unlocked linked GRN line: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.purchase_order_items
    SET unit_price_est = v_price,
        line_total = round(quantity * v_price, 2)
    WHERE tenant_id = v_tenant
      AND po_id = v_linked_po;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: direct authenticated linked PO price update was accepted';
  END IF;

  PERFORM set_config(
    'comtammatu.grn_recovery_insert',
    'false',
    TRUE
  );
  PERFORM set_config(
    'comtammatu.grn_po_price_sync',
    'false',
    TRUE
  );

  v_result := public.update_purchase_order_prices_protected(
    v_linked_po,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'line_id',
          po_item.id,
          'unit_price',
          v_price
        )
      )
      FROM public.purchase_order_items AS po_item
      WHERE po_item.tenant_id = v_tenant
        AND po_item.po_id = v_linked_po
    )
  );
  IF v_result ->> 'updated_lines' <> '1' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: protected linked PO price update failed: %',
      v_result;
  END IF;

  v_result := public.approve_purchase_order(v_linked_po);
  IF v_result ->> 'status' <> 'sent' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: canonical PO approval failed: %',
      v_result;
  END IF;

  v_result := public.confirm_goods_receipt_note(v_grn);
  IF v_result ->> 'status' <> 'confirmed' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: canonical GRN confirm failed: %',
      v_result;
  END IF;

  v_result := public.amend_grn_line(
    v_grn,
    v_grn_line,
    4,
    0,
    'Verify trusted amendment RPC',
    NULL,
    NULL
  );
  IF v_result ->> 'received_quantity' <> '4' THEN
    RAISE EXCEPTION
      'RPC AUTHORITY: canonical Owner amendment failed: %',
      v_result;
  END IF;

END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'service_role',
    'iss', 'https://test.supabase.co/auth/v1'
  )::text,
  TRUE
);
SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'service_role', TRUE);

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_recovery_po bigint :=
    current_setting('test.inventory_recovery_po')::bigint;
  v_recovered_grn bigint;
  v_recovered_line bigint;
  v_result jsonb;
  v_retry_result jsonb;
  v_draft_count integer;
  v_audit_count integer;
  v_error boolean := FALSE;
  v_message text;
BEGIN
  v_result := public.create_grn_from_approved_po(v_recovery_po);
  v_recovered_grn := (v_result ->> 'grn_id')::bigint;
  IF v_recovered_grn IS NULL THEN
    RAISE EXCEPTION
      'RECOVERY: service-role recovery RPC failed: %',
      v_result;
  END IF;

  v_retry_result := public.create_grn_from_approved_po(v_recovery_po);
  IF (v_retry_result ->> 'grn_id')::bigint <> v_recovered_grn
     OR v_retry_result ->> 'reused' <> 'true' THEN
    RAISE EXCEPTION
      'RECOVERY: retry did not reuse canonical linked draft: %',
      v_retry_result;
  END IF;

  SELECT count(*)::integer
  INTO v_draft_count
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_recovery_po
    AND grn.status = 'draft';

  IF v_draft_count <> 1 THEN
    RAISE EXCEPTION
      'RECOVERY: retry created duplicate linked drafts: %',
      v_draft_count;
  END IF;

  SELECT count(*)::integer
  INTO v_audit_count
  FROM public.audit_logs AS audit
  WHERE audit.tenant_id = v_tenant
    AND audit.user_id IS NULL
    AND audit.action = 'inventory.grn.recovered_from_approved_po'
    AND audit.entity_type = 'goods_received_note'
    AND audit.entity_id = v_recovered_grn
    AND audit.new_data ->> 'actor_type' = 'service_role'
    AND (audit.new_data ->> 'po_id')::bigint = v_recovery_po;

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION
      'RECOVERY: no-sub service-role audit was not tenant-bound: %',
      v_audit_count;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.purchase_orders
    SET status = 'received'
    WHERE id = v_recovery_po
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error
     OR v_message <> 'linked_grn_purchase_order_immutable' THEN
    RAISE EXCEPTION
      'RECOVERY: direct service-role PO header update bypassed guard: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  BEGIN
    UPDATE public.purchase_order_items
    SET unit_price_est = unit_price_est + 1,
        line_total = round(quantity * (unit_price_est + 1), 2)
    WHERE tenant_id = v_tenant
      AND po_id = v_recovery_po;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error
     OR v_message <> 'linked_grn_purchase_order_lines_immutable' THEN
    RAISE EXCEPTION
      'RECOVERY: direct service-role PO line update bypassed guard: %',
      v_message;
  END IF;

  SELECT item.id
  INTO v_recovered_line
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = v_recovered_grn
  ORDER BY item.id
  LIMIT 1;

  PERFORM set_config(
    'comtammatu.grn_po_price_sync',
    'true',
    TRUE
  );
  BEGIN
    UPDATE public.grn_items
    SET unit_cost = unit_cost + 1
    WHERE id = v_recovered_line
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'linked_grn_lines_immutable' THEN
    RAISE EXCEPTION
      'RECOVERY: forged price-sync GUC allowed direct cost update: %',
      v_message;
  END IF;

  v_error := FALSE;
  v_message := NULL;
  PERFORM set_config(
    'comtammatu.grn_recovery_insert',
    'true',
    TRUE
  );
  BEGIN
    DELETE FROM public.goods_received_notes
    WHERE id = v_recovered_grn
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN check_violation THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'linked_grn_immutable' THEN
    RAISE EXCEPTION
      'RECOVERY: forged GUC allowed direct service-role cleanup: %',
      v_message;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_branch_a bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_branch_b bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_location_a bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_location_b bigint :=
    current_setting('test.inventory_policy_location_b')::bigint;
  v_supplier bigint :=
    current_setting('test.inventory_policy_supplier')::bigint;
  v_staff uuid := gen_random_uuid();
  v_receiver_staff uuid := gen_random_uuid();
  v_non_production_staff uuid := gen_random_uuid();
  v_owner_issue bigint;
  v_owner_issue_item bigint;
  v_grn_a bigint;
  v_grn_b bigint;
  v_line bigint;
  v_object_path text;
  v_photo_url text;
BEGIN
  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_staff,
    'inventory-policy-' || v_staff::text || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'branch_id', v_branch_a,
      'position_code', 'branch_manager',
      'provisioned_by', current_setting('test.inventory_owner')
    ),
    jsonb_build_object('full_name', 'Inventory policy test')
  );

  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_receiver_staff,
    'inventory-receiver-policy-'
      || v_receiver_staff::text
      || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'branch_id', v_branch_b,
      'position_code', 'branch_manager',
      'provisioned_by', current_setting('test.inventory_owner')
    ),
    jsonb_build_object('full_name', 'Inventory receiver policy test')
  );

  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_non_production_staff,
    'inventory-non-production-'
      || v_non_production_staff::text
      || '@example.invalid',
    jsonb_build_object(
      'tenant_id', v_tenant,
      'position_code', 'accountant'
    ),
    jsonb_build_object('full_name', 'Non-production policy test')
  );

  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    valid_from
  )
  SELECT
    v_staff,
    v_tenant,
    v_branch_a,
    permission.permission_key,
    now() - interval '1 minute'
  FROM unnest(
    ARRAY[
      'procurement:grn_create',
      'procurement:read'
    ]
  ) AS permission(permission_key)
  ON CONFLICT DO NOTHING;

  UPDATE public.supplier_items
  SET is_active = TRUE
  WHERE tenant_id = v_tenant
    AND supplier_id = v_supplier;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    created_by,
    source_location_id
  )
  VALUES (
    v_tenant,
    v_branch_a,
    'OWNER-ISSUE-' || gen_random_uuid()::text,
    'consumption',
    'draft',
    current_setting('test.inventory_owner')::uuid,
    v_location_a
  )
  RETURNING id INTO v_owner_issue;

  INSERT INTO public.stock_issue_items (
    tenant_id,
    issue_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_cost
  )
  VALUES (
    v_tenant,
    v_owner_issue,
    current_setting('test.inventory_ingredient')::bigint,
    1,
    current_setting('test.inventory_production_unit')::bigint,
    0
  )
  RETURNING id INTO v_owner_issue_item;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_a,
    v_location_a,
    v_supplier,
    '__POLICY-GRN-A-' || gen_random_uuid()::text,
    'draft',
    v_staff
  )
  RETURNING id INTO v_grn_a;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    rejection_reason,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_grn_a,
    (
      SELECT item.ingredient_id
      FROM public.supplier_items AS item
      WHERE item.tenant_id = v_tenant
        AND item.supplier_id = v_supplier
      ORDER BY item.id
      LIMIT 1
    ),
    2,
    1,
    'Damaged on delivery',
    (
      SELECT ingredient_unit.unit_id
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.supplier_items AS item
        ON item.ingredient_id = ingredient_unit.ingredient_id
       AND item.tenant_id = ingredient_unit.tenant_id
      WHERE item.tenant_id = v_tenant
        AND item.supplier_id = v_supplier
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
      ORDER BY ingredient_unit.id
      LIMIT 1
    )
  )
  RETURNING id INTO v_line;

  v_object_path := v_tenant::text
    || '/grn/'
    || v_grn_a::text
    || '/rejected/'
    || v_line::text
    || '/'
    || gen_random_uuid()::text
    || '.webp';
  v_photo_url :=
    'https://test.supabase.co/storage/v1/object/public/'
    || 'inventory-attachments/'
    || v_object_path;

  UPDATE public.grn_items
  SET rejected_photo_url = v_photo_url
  WHERE id = v_line
    AND tenant_id = v_tenant;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_b,
    v_location_b,
    v_supplier,
    '__POLICY-GRN-B-' || gen_random_uuid()::text,
    'draft',
    v_staff
  )
  RETURNING id INTO v_grn_b;

  PERFORM set_config(
    'test.inventory_policy_staff',
    v_staff::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_receiver_staff',
    v_receiver_staff::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_non_production_staff',
    v_non_production_staff::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_grn_a',
    v_grn_a::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_grn_b',
    v_grn_b::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_line_a',
    v_line::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_policy_object_path',
    v_object_path,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_owner_issue',
    v_owner_issue::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_owner_issue_item',
    v_owner_issue_item::text,
    TRUE
  );
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_policy_staff'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_policy_staff'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_branch_a bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_branch_b bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_central_branch bigint :=
    current_setting('test.inventory_central_branch')::bigint;
  v_location_a bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_location_b bigint :=
    current_setting('test.inventory_policy_location_b')::bigint;
  v_finished_good bigint :=
    current_setting('test.inventory_production_finished_good')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_production_recipe bigint :=
    current_setting('test.inventory_production_recipe')::bigint;
  v_menu_item bigint :=
    current_setting('test.inventory_menu_item')::bigint;
  v_menu_recipe bigint :=
    current_setting('test.inventory_menu_recipe')::bigint;
  v_ingredient_category bigint :=
    current_setting('test.inventory_ingredient_category')::bigint;
  v_transfer bigint :=
    current_setting('test.inventory_transfer')::bigint;
  v_unit bigint :=
    current_setting('test.inventory_production_unit')::bigint;
  v_ingredient_name text :=
    current_setting('test.inventory_ingredient_name');
  v_unit_code text :=
    current_setting('test.inventory_unit_code');
  v_expected_cost numeric :=
    current_setting('test.inventory_ingredient_cost')::numeric;
  v_cross_scope_run bigint :=
    current_setting('test.inventory_cross_scope_run')::bigint;
  v_grn_a text := current_setting('test.inventory_policy_grn_a');
  v_grn_b text := current_setting('test.inventory_policy_grn_b');
  v_line_a bigint :=
    current_setting('test.inventory_policy_line_a')::bigint;
  v_owner_issue bigint :=
    current_setting('test.inventory_owner_issue')::bigint;
  v_owner_issue_item bigint :=
    current_setting('test.inventory_owner_issue_item')::bigint;
  v_object_path text :=
    current_setting('test.inventory_policy_object_path');
  v_result jsonb;
  v_units_payload jsonb;
  v_stock_before numeric;
  v_message text;
  v_rows integer;
  v_rejected boolean;
BEGIN
  IF NOT public.is_inventory_production_operator()
     OR NOT public.has_permission(
       v_branch_a,
       'inventory:production_create'
     )
     OR NOT public.has_permission(
       v_branch_a,
       'inventory:production_confirm'
     ) THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch-manager fixture lacks source authority';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:write')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch-manager fixture lacks catalog permission';
  END IF;

  UPDATE public.stock_issue_items
  SET quantity = quantity + 1
  WHERE id = v_owner_issue_item;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'ISSUE AUTHORITY: peer changed another creator''s issue line';
  END IF;

  DELETE FROM public.stock_issue_items
  WHERE id = v_owner_issue_item;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'ISSUE AUTHORITY: peer deleted another creator''s issue line';
  END IF;

  UPDATE public.stock_issues
  SET status = 'cancelled'
  WHERE id = v_owner_issue;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 OR NOT EXISTS (
    SELECT 1
    FROM public.stock_issues AS issue
    JOIN public.stock_issue_items AS item
      ON item.issue_id = issue.id
     AND item.tenant_id = issue.tenant_id
    WHERE issue.id = v_owner_issue
      AND issue.status = 'draft'
      AND item.id = v_owner_issue_item
      AND item.quantity = 1
  ) THEN
    RAISE EXCEPTION
      'ISSUE AUTHORITY: peer cancelled or changed another creator''s issue';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.id = v_branch_a
      AND branch.branch_kind = 'branch'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.id = v_central_branch
      AND branch.branch_kind = 'central_kitchen'
  ) OR EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.branch_kind = 'branch'
      AND branch.id <> v_branch_a
  ) OR EXISTS (
    SELECT 1
    FROM public.stock_transfer_list_branches() AS branch
    WHERE branch.id = v_branch_b
  ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: branch-manager branch list escaped own inbound scope';
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_stock_transfer_draft(
      v_branch_a,
      v_branch_b,
      NULL,
      'hostile branch-manager create',
      NULL,
      jsonb_build_array(jsonb_build_object(
        'ingredientId',
        v_ingredient,
        'quantity',
        1,
        'entryUnitId',
        v_unit
      )),
      v_location_a,
      v_location_b
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'forbidden_transfer_create' THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: branch manager created transfer: %',
      v_message;
  END IF;

  SELECT count(*)::integer
  INTO v_rows
  FROM public.production_runs AS run
  WHERE run.branch_id = v_central_branch;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager read another site runs: %',
      v_rows;
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.get_production_recipe_context_for_location(
      v_finished_good,
      v_branch_b,
      v_location_b
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'branch_scope_violation' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager read another branch context: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.create_production_run_with_locations(
      v_branch_a,
      v_finished_good,
      1,
      v_unit,
      'Hostile branch-manager cross-site create',
      v_branch_b,
      NULL,
      v_location_a,
      v_location_b
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected
     OR v_message <> 'production_cross_site_target_forbidden' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager created cross-site run: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.confirm_production_run(
      v_cross_scope_run,
      NULL,
      NULL
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected
     OR v_message <> 'production_cross_site_target_forbidden' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager confirmed cross-site run: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.upsert_production_recipe_lines(
      v_finished_good,
      jsonb_build_array(jsonb_build_object(
        'ingredient_id',
        v_ingredient,
        'quantity',
        999,
        'entry_unit_id',
        v_unit
      )),
    1,
    NULL
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'forbidden' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager mutated recipe: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.bulk_import_production_recipes(
      jsonb_build_array(jsonb_build_object(
        'finished_good_id',
        v_finished_good,
        'output_quantity',
        1,
        'lines',
        jsonb_build_array(jsonb_build_object(
          'ingredient_id',
          v_ingredient,
          'quantity',
          999,
          'entry_unit_id',
          v_unit
        ))
      ))
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'forbidden' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager bulk-mutated recipe: %',
      v_message;
  END IF;

  DELETE FROM public.production_recipes
  WHERE id = v_production_recipe;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: branch manager deleted recipe';
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.upsert_recipe_lines(
      v_menu_item,
      jsonb_build_array(jsonb_build_object(
        'ingredient_id',
        v_ingredient,
        'quantity',
        999,
        'entry_unit_id',
        v_unit,
        'yield_factor',
        1
      )),
      NULL
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'forbidden' THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager mutated menu recipe: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.recipes
    SET quantity = 999
    WHERE id = v_menu_recipe
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager directly changed menu recipe';
  END IF;

  SELECT stock.current_quantity
  INTO v_stock_before
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_branch_a
    AND stock.location_id = v_location_a
    AND stock.ingredient_id = v_ingredient;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.stock_levels
    SET current_quantity = 999999,
        avg_unit_cost = 999999
    WHERE tenant_id = v_tenant
      AND branch_id = v_branch_a
      AND location_id = v_location_a
      AND ingredient_id = v_ingredient;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STOCK AUTHORITY: branch manager forged derived balance/WAC';
  END IF;

  IF (
    SELECT stock.current_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_branch_a
      AND stock.location_id = v_location_a
      AND stock.ingredient_id = v_ingredient
  ) IS DISTINCT FROM v_stock_before THEN
    RAISE EXCEPTION
      'STOCK AUTHORITY: failed direct write changed derived balance';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'unit_id',
      ingredient_unit.unit_id,
      'to_base_factor',
      ingredient_unit.to_base_factor,
      'is_base',
      ingredient_unit.is_base,
      'anchor_unit_id',
      ingredient_unit.anchor_unit_id,
      'anchor_factor',
      ingredient_unit.anchor_factor,
      'sort_order',
      ingredient_unit.sort_order
    )
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
  )
  INTO v_units_payload
  FROM public.ingredient_units AS ingredient_unit
  WHERE ingredient_unit.tenant_id = v_tenant
    AND ingredient_unit.ingredient_id = v_ingredient
    AND ingredient_unit.is_active IS TRUE;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.save_ingredient_catalog(
      v_ingredient,
      v_ingredient_name,
      NULL,
      NULL,
      'raw_material',
      'ambient',
      0,
      NULL,
      NULL,
      NULL,
      v_units_payload,
      NULL,
      v_unit,
      v_unit,
      NULL
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'forbidden' THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager reached atomic catalog save: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  v_message := NULL;
  BEGIN
    PERFORM public.bulk_import_ingredients(
      jsonb_build_array(jsonb_build_object(
        'name',
        v_ingredient_name,
        'unit',
        v_unit_code,
        'item_kind',
        'raw_material',
        'unit_cost',
        v_expected_cost + 54321,
        'min_stock_level',
        0,
        'storage_type',
        'ambient'
      ))
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_rejected OR v_message <> 'forbidden' THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager reached catalog import: %',
      v_message;
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.ingredients
    SET unit_cost = v_expected_cost + 99999
    WHERE id = v_ingredient
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'PRICE AUTHORITY: branch manager directly changed ingredient WAC';
  END IF;

  v_rejected := FALSE;
  BEGIN
    DELETE FROM public.ingredients
    WHERE id = v_ingredient
      AND tenant_id = v_tenant;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager directly deleted ingredient';
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.ingredient_units
    SET to_base_factor = 999
    WHERE tenant_id = v_tenant
      AND ingredient_id = v_ingredient
      AND unit_id = v_unit;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager changed unit conversion';
  END IF;

  UPDATE public.units
  SET name = name || '-forged'
  WHERE id = v_unit
    AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager changed unit master';
  END IF;

  UPDATE public.ingredient_categories
  SET name = name || '-forged'
  WHERE id = v_ingredient_category
    AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'CATALOG AUTHORITY: branch manager changed ingredient category';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_transfer
      AND transfer.status = 'confirmed_ship'
  ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: shipped transfer fixture is unavailable';
  END IF;

  INSERT INTO storage.objects (
    bucket_id,
    name,
    owner_id,
    metadata
  )
  VALUES (
    'inventory-attachments',
    v_object_path,
    auth.uid()::text,
    '{"mimetype":"image/webp"}'::jsonb
  );

  v_rejected := FALSE;
  BEGIN
    INSERT INTO storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/rejected/%s/not-an-image.jpg',
        v_tenant,
        v_grn_a,
        v_line_a
      ),
      auth.uid()::text,
      '{"mimetype":"application/pdf"}'::jsonb
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STORAGE POLICY: non-image rejected evidence was accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    INSERT INTO storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/rejected/%s/cross-branch.webp',
        v_tenant,
        v_grn_b,
        v_line_a
      ),
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STORAGE POLICY: cross-branch rejected evidence was accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    INSERT INTO storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/rejected/%s/cross-line.webp',
        v_tenant,
        v_grn_a,
        v_line_a + 1000000000
      ),
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STORAGE POLICY: rejected evidence was reusable across GRN lines';
  END IF;

  v_rejected := FALSE;
  BEGIN
    INSERT INTO storage.objects (
      bucket_id,
      name,
      owner_id,
      metadata
    )
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/price-override/%s/malformed.webp',
        v_tenant,
        v_grn_a,
        v_line_a
      ),
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STORAGE POLICY: malformed rejected-evidence path was accepted';
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_receiver_staff'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_receiver_staff'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_branch bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_transfer bigint :=
    current_setting('test.inventory_transfer')::bigint;
  v_quantity numeric;
  v_entry_unit bigint;
  v_rejected boolean := FALSE;
BEGIN
  IF NOT public.has_permission(
    v_branch,
    'inventory:transfer_receive'
  ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: receiver fixture lacks receive authority';
  END IF;

  SELECT item.quantity, item.entry_unit_id
  INTO v_quantity, v_entry_unit
  FROM public.stock_transfer_items AS item
  WHERE item.transfer_id = v_transfer;

  BEGIN
    UPDATE public.stock_transfer_items
    SET quantity = quantity + 1,
        entry_unit_id = v_entry_unit,
        unit_cost_at_ship = 0
    WHERE transfer_id = v_transfer;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: receiver mutated shipped line';
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.stock_transfers
    SET status = 'received'
    WHERE id = v_transfer;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: receiver bypassed transfer workflow';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_transfer
      AND transfer.status = 'confirmed_ship'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = v_transfer
      AND item.quantity = v_quantity
      AND item.entry_unit_id = v_entry_unit
  ) THEN
    RAISE EXCEPTION
      'TRANSFER AUTHORITY: rejected receiver mutation changed state';
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_non_production_staff'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_non_production_staff'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_branch bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_location bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_finished_good bigint :=
    current_setting('test.inventory_production_finished_good')::bigint;
  v_rows integer;
  v_error boolean := FALSE;
  v_message text;
BEGIN
  SELECT count(*)::integer
  INTO v_rows
  FROM public.production_runs;

  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: non-production role read runs: %',
      v_rows;
  END IF;

  BEGIN
    PERFORM public.get_production_recipe_context_for_location(
      v_finished_good,
      v_branch,
      v_location
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_error := TRUE;
      v_message := SQLERRM;
  END;
  IF NOT v_error OR v_message <> 'forbidden' THEN
    RAISE EXCEPTION
      'PRODUCTION AUTHORITY: non-production role reached context: %',
      v_message;
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_owner'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_owner'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant text := current_setting('test.inventory_policy_tenant');
  v_amend_grn bigint :=
    current_setting('test.inventory_rpc_grn')::bigint;
  v_amend_line bigint :=
    current_setting('test.inventory_rpc_grn_line')::bigint;
  v_amend_object_path text;
  v_amend_photo_url text;
  v_object_path text :=
    current_setting('test.inventory_policy_object_path');
  v_result jsonb;
  v_rows integer;
  v_rejected boolean := FALSE;
BEGIN
  v_amend_object_path := format(
    '%s/grn/%s/rejected/%s/%s.webp',
    v_tenant,
    v_amend_grn,
    v_amend_line,
    gen_random_uuid()
  );
  v_amend_photo_url :=
    'https://test.supabase.co/storage/v1/object/public/'
    || 'inventory-attachments/'
    || v_amend_object_path;

  INSERT INTO storage.objects (
    bucket_id,
    name,
    owner_id,
    metadata
  )
  VALUES (
    'inventory-attachments',
    v_amend_object_path,
    auth.uid()::text,
    '{"mimetype":"image/webp"}'::jsonb
  );

  v_result := public.amend_grn_line(
    v_amend_grn,
    v_amend_line,
    4,
    1,
    'Verify versioned rejection evidence',
    'Damaged after recount',
    v_amend_photo_url
  );
  IF v_result ->> 'rejected_quantity' <> '1' THEN
    RAISE EXCEPTION
      'STORAGE POLICY: confirmed Owner amendment evidence failed: %',
      v_result;
  END IF;

  BEGIN
    UPDATE storage.objects
    SET metadata = '{"mimetype":"image/png"}'::jsonb
    WHERE bucket_id = 'inventory-attachments'
      AND name = v_object_path;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_rows := 0;
  END;
  IF NOT v_rejected AND v_rows <> 0 THEN
    RAISE EXCEPTION
      'STORAGE POLICY: rejection evidence was replaced';
  END IF;

  v_rejected := FALSE;
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'inventory-attachments'
      AND name = v_object_path;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
      v_rows := 0;
  END;
  IF NOT v_rejected AND v_rows <> 0 THEN
    RAISE EXCEPTION
      'STORAGE POLICY: rejection evidence was deleted';
  END IF;
END;
$$;

RESET ROLE;

DO $test$
DECLARE
  v_detail text;
BEGIN
  SELECT string_agg(
    expected.table_name || '.' || expected.constraint_name,
    ', '
    ORDER BY expected.table_name, expected.constraint_name
  )
  INTO v_detail
  FROM (
    VALUES
      (
        'stocktake_lines'::text,
        'stocktake_lines_counted_quantity_valid'::text
      ),
      (
        'inventory_count_slip_lines',
        'inventory_count_slip_lines_counted_quantity_valid'
      ),
      (
        'stocktake_conflicts',
        'stocktake_conflicts_resolution_qty_valid'
      ),
      (
        'stock_transfer_items',
        'stock_transfer_items_quantity_valid'
      ),
      (
        'stock_transfer_items',
        'stock_transfer_items_received_quantity_valid'
      ),
      (
        'stock_transfer_items',
        'stock_transfer_items_ship_cost_valid'
      ),
      (
        'production_runs',
        'production_runs_planned_quantity_valid'
      ),
      (
        'production_runs',
        'production_runs_actual_quantity_valid'
      ),
      (
        'production_recipes',
        'production_recipes_quantity_valid'
      ),
      (
        'production_recipes',
        'production_recipes_output_quantity_valid'
      ),
      ('recipes', 'recipes_quantity_valid'),
      ('recipes', 'recipes_yield_factor_valid'),
      (
        'stock_issue_items',
        'stock_issue_items_quantity_valid'
      ),
      (
        'stock_issue_items',
        'stock_issue_items_unit_cost_valid'
      ),
      (
        'supplier_return_items',
        'supplier_return_items_quantity_valid'
      ),
      ('stock_movements', 'stock_movements_finite_values'),
      (
        'stock_levels',
        'stock_levels_current_quantity_valid'
      ),
      ('stock_levels', 'stock_levels_avg_unit_cost_valid')
  ) AS expected(table_name, constraint_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
        to_regclass('public.' || expected.table_name)
      AND constraint_record.conname = expected.constraint_name
      AND constraint_record.contype = 'c'
      AND constraint_record.convalidated IS TRUE
      AND pg_catalog.pg_get_constraintdef(
        constraint_record.oid,
        TRUE
      ) ILIKE '%NaN%'
      AND pg_catalog.pg_get_constraintdef(
        constraint_record.oid,
        TRUE
      ) ILIKE '%Infinity%'
  );

  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: finite numeric constraints missing: %',
      v_detail;
  END IF;

  IF has_table_privilege(
       'authenticated',
       'public.stocktake_sessions',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.stocktake_sessions',
       'DELETE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.stocktake_sessions',
       'UPDATE'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.stocktake_sessions',
       'status',
       'UPDATE'
     )
     OR has_column_privilege(
       'authenticated',
       'public.stocktake_sessions',
       'auditor_id',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.stocktake_lines',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.stocktake_lines',
       'DELETE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.stocktake_lines',
       'UPDATE'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.stocktake_lines',
       'counted_quantity',
       'UPDATE'
     )
     OR NOT has_column_privilege(
       'authenticated',
       'public.stocktake_lines',
       'variance_reason',
       'UPDATE'
     )
     OR has_column_privilege(
       'authenticated',
       'public.stocktake_lines',
       'system_quantity',
       'UPDATE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid IN (
         'public.stocktake_sessions'::regclass,
         'public.stocktake_lines'::regclass
       )
         AND policy.polcmd IN ('a', 'd')
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid =
           'public.stocktake_sessions'::regclass
         AND policy.polname = 'stocktake_sessions_cancel'
         AND policy.polcmd = 'w'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       WHERE policy.polrelid = 'public.stocktake_lines'::regclass
         AND policy.polname = 'stocktake_lines_count_update'
         AND policy.polcmd = 'w'
         AND pg_catalog.pg_get_expr(
           policy.polqual,
           policy.polrelid
         ) ILIKE '%is_final IS FALSE%'
         AND pg_catalog.pg_get_expr(
           policy.polqual,
           policy.polrelid
         ) ILIKE '%current_round%'
         AND pg_catalog.pg_get_expr(
           policy.polwithcheck,
           policy.polrelid
         ) ILIKE '%is_final IS FALSE%'
         AND pg_catalog.pg_get_expr(
           policy.polwithcheck,
           policy.polrelid
         ) ILIKE '%current_round%'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: stocktake direct-DML boundary invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.stock_issues'::regclass
      AND trigger.tgname = 'trg_stock_issue_creator'
      AND trigger.tgenabled <> 'D'
  ) OR to_regprocedure(
       'private.enforce_stock_issue_creator()'
     ) IS NULL THEN
    RAISE EXCEPTION
      'FINAL CATALOG: stock issue creator authority missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'public.stock_issues'::regclass
      AND policy.polname = 'stock_issues_update'
      AND pg_catalog.pg_get_expr(
        policy.polqual,
        policy.polrelid
      ) ILIKE '%created_by = auth.uid()%'
      AND pg_catalog.pg_get_expr(
        policy.polqual,
        policy.polrelid
      ) ILIKE '%approval_status%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'public.stock_issue_items'::regclass
      AND policy.polname = 'stock_issue_items_write'
      AND pg_catalog.pg_get_expr(
        policy.polqual,
        policy.polrelid
      ) ILIKE '%created_by = auth.uid()%'
      AND pg_catalog.pg_get_expr(
        policy.polqual,
        policy.polrelid
      ) ILIKE '%approval_status%'
      AND pg_catalog.pg_get_expr(
        policy.polwithcheck,
        policy.polrelid
      ) ILIKE '%created_by = auth.uid()%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: stock issue creator/review separation invalid';
  END IF;

  IF has_table_privilege(
       'authenticated',
       'public.purchase_orders',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_orders',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_orders',
       'DELETE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_order_items',
       'INSERT'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_order_items',
       'UPDATE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.purchase_order_items',
       'DELETE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.approve_purchase_order(bigint)'
       )
         AND procedure.prosrc ILIKE
           '%linked draft GRN required%'
         AND procedure.prosrc ILIKE
           '%grn.status = ''draft''%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'public.update_purchase_order_prices_protected(bigint,jsonb)'
       )
         AND procedure.prosrc ILIKE
           '%purchase_order_not_linked_to_draft_grn%'
         AND procedure.prosrc ILIKE
           '%grn.status = ''draft''%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'private.enforce_retrospective_purchase_order_immutability()'
       )
         AND procedure.prosrc ILIKE
           '%purchase_order_insert_requires_rpc%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = to_regprocedure(
         'private.enforce_retrospective_purchase_order_line_immutability()'
       )
         AND procedure.prosrc ILIKE
           '%purchase_order_line_insert_requires_rpc%'
     ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: retrospective-only PO authority invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'private.assert_stock_transfer_warehouse_endpoints(bigint,bigint)'
    )
      AND procedure.prosrc ILIKE '%FROM public.branches%'
      AND procedure.prosrc ILIKE '%source_branch.is_active IS TRUE%'
      AND procedure.prosrc ILIKE '%source_branch.branch_kind IN%'
      AND procedure.prosrc ILIKE '%target_branch.is_active IS TRUE%'
      AND procedure.prosrc ILIKE '%target_branch.branch_kind IN%'
      AND procedure.prosrc ILIKE '%FOR UPDATE OF branch%'
      AND procedure.prosrc ILIKE '%transfer_branch_invalid%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.create_stock_transfer_draft(bigint,bigint,text,text,text,jsonb,bigint,bigint)'
    )
      AND procedure.prosrc ILIKE '%branch.is_active IS TRUE%'
      AND procedure.prosrc ILIKE '%branch.branch_kind IN%'
      AND procedure.prosrc ILIKE '%FOR UPDATE OF branch%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.stock_transfer_confirm_ship(bigint)'
    )
      AND procedure.prosrc ILIKE
        '%assert_stock_transfer_warehouse_endpoints%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: transfer branch lifecycle guard invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public.heartbeat_zone_lock(bigint,text,integer)'::text,
          NULL::text,
          TRUE
        ),
        (
          'public.release_zone_lock(bigint,text)',
          NULL,
          TRUE
        ),
        (
          'public.create_waste_entry(bigint,bigint,jsonb,text,jsonb,text)',
          'private.execute_create_waste_entry(bigint,bigint,jsonb,text,jsonb,text)',
          TRUE
        ),
        (
          'public._post_writeoff_movements(bigint)',
          'private.execute_post_writeoff_movements(bigint)',
          FALSE
        ),
        (
          'public.update_ingredient_thresholds_bulk(jsonb)',
          'private.execute_update_ingredient_thresholds_bulk(jsonb)',
          TRUE
        ),
        (
          'public.approve_inventory_count_slip(bigint)',
          'private.execute_approve_inventory_count_slip(bigint)',
          TRUE
        ),
        (
          'public.adjust_stock_exception(bigint,bigint,numeric,text)',
          NULL,
          TRUE
        )
    ) AS expected(
      public_signature,
      private_signature,
      authenticated_execute
    )
    WHERE to_regprocedure(expected.public_signature) IS NULL
       OR has_function_privilege(
            'authenticated',
            expected.public_signature,
            'EXECUTE'
          ) IS DISTINCT FROM expected.authenticated_execute
       OR NOT has_function_privilege(
         'service_role',
         expected.public_signature,
         'EXECUTE'
       )
       OR (
         expected.private_signature IS NOT NULL
         AND (
           to_regprocedure(expected.private_signature) IS NULL
           OR has_function_privilege(
             'authenticated',
             expected.private_signature,
             'EXECUTE'
           )
           OR has_function_privilege(
             'service_role',
             expected.private_signature,
             'EXECUTE'
           )
         )
       )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: hardening wrapper grants invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid =
        to_regprocedure('public.complete_stocktake(bigint)')
      AND procedure.prosrc ILIKE '%inventory:stocktake_complete%'
      AND procedure.prosrc ILIKE '%line.round_no = 1%'
      AND procedure.prosrc ILIKE '%FOR UPDATE OF line%'
  ) OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('close_recount_round'::text),
        ('resolve_stocktake_conflict'::text)
    ) AS expected(function_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = expected.function_name
        AND procedure.prosrc ILIKE
          '%v_session.status <> ''in_progress''%'
    )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.escalate_round_4(bigint,bigint,numeric,text)'
    )
      AND procedure.prosrc ILIKE
        '%v_session.status <> ''in_progress''%'
      AND procedure.prosrc ILIKE
        '%v_session.current_round <> 4%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.heartbeat_zone_lock(bigint,text,integer)'
    )
      AND procedure.prosrc ILIKE '%p_ttl_seconds <= 0%'
      AND procedure.prosrc ILIKE '%p_ttl_seconds > 7200%'
      AND procedure.prosrc ILIKE '%inventory:stocktake_create%'
      AND procedure.prosrc ILIKE '%session.tenant_id = v_tenant%'
      AND procedure.prosrc ILIKE '%session_id = p_session_id%'
      AND procedure.prosrc ILIKE '%zone_id = p_zone_id%'
      AND procedure.prosrc ILIKE '%locked_by = v_uid%'
  ) OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          'public.assign_auditor(bigint,uuid,bigint)'::text,
          'stocktake_session_not_in_progress'::text
        ),
        (
          'public.escalate_round_4(bigint,bigint,numeric,text)',
          'session not in_progress'
        ),
        (
          'public.resolve_stocktake_conflict(bigint,text,numeric,text)',
          'session not in_progress'
        ),
        (
          'public.submit_count_round(bigint,smallint,jsonb)',
          'session not in_progress'
        )
    ) AS expected(signature, terminal_marker)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = to_regprocedure(expected.signature)
        AND procedure.prosrc ILIKE '%FOR UPDATE OF session%'
        AND procedure.prosrc ILIKE (
          '%' || expected.terminal_marker || '%'
        )
    )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_record
    WHERE trigger_record.tgrelid =
        'public.stocktake_lines'::regclass
      AND trigger_record.tgname =
        'trg_stocktake_line_parent_mutability'
      AND trigger_record.tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'private.enforce_stocktake_line_parent_mutability()'
    )
      AND procedure.prosrc ILIKE '%FOR UPDATE%'
      AND procedure.prosrc ILIKE
        '%stocktake_session_not_in_progress%'
      AND procedure.prosrc ILIKE '%v_current_round%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.set_inventory_count_assignments(bigint,bigint,bigint,bigint[],bigint)'
    )
      AND procedure.prosrc ILIKE
        '%assignment.shift_id IS NOT DISTINCT FROM p_shift_id%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.submit_inventory_count_slip(bigint,bigint,jsonb,bigint)'
    )
      AND procedure.prosrc ILIKE
        '%inventory.count_slip_submitted%'
      AND procedure.prosrc ILIKE
        '%/br/%s/stock/count-slips%'
      AND procedure.prosrc ILIKE
        '%inventory.count_slip:%s:submitted%'
      AND procedure.prosrc ILIKE
        '%specific.shift_id = p_shift_id%'
      AND procedure.prosrc ILIKE
        '%assignment.shift_id IS NULL%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = to_regprocedure(
      'public.approve_inventory_count_slip(bigint)'
    )
      AND procedure.prosrc ILIKE '%ON CONFLICT ON CONSTRAINT%'
      AND procedure.prosrc ILIKE '%ORDER BY stock.ingredient_id%'
      AND procedure.prosrc ILIKE '%FOR UPDATE OF stock%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: stocktake/count-slip behavior contract invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.permission_keys AS permission
    WHERE permission.key = 'inventory:transfer_create'
      AND permission.is_delegable_to_staff IS FALSE
  ) OR EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('inventory:transfer_ship'::text),
        ('inventory:transfer_receive'::text)
    ) AS required(permission_key)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.permission_keys AS permission
      WHERE permission.key = required.permission_key
        AND permission.is_delegable_to_staff IS TRUE
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.role_templates AS template
    WHERE template.position_code IS DISTINCT FROM 'owner'
      AND template.permission_keys @> ARRAY[
        'inventory:transfer_create'
      ]::text[]
  ) OR EXISTS (
    SELECT 1
    FROM public.staff_permissions AS permission
    WHERE permission.permission_key = 'inventory:transfer_create'
  ) OR EXISTS (
    SELECT 1
    FROM public.role_templates AS template
    WHERE template.position_code IN (
      'central_supply_ops',
      'central_kitchen_lead'
    )
      AND (
        NOT template.permission_keys @> ARRAY[
          'inventory:transfer_ship',
          'inventory:transfer_receive'
        ]::text[]
        OR template.permission_keys @> ARRAY[
          'inventory:transfer_create'
        ]::text[]
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.staff_permissions AS permission
    JOIN public.profiles AS profile
      ON profile.id = permission.user_id
     AND profile.tenant_id = permission.tenant_id
    JOIN public.positions AS position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE position.code IN (
      'central_supply_ops',
      'central_kitchen_lead'
    )
      AND (
        permission.permission_key = 'inventory:transfer_create'
        OR (
          permission.permission_key IN (
            'inventory:transfer_ship',
            'inventory:transfer_receive'
          )
          AND permission.branch_id IS DISTINCT FROM profile.branch_id
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.positions AS position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    JOIN public.branches AS branch
      ON branch.id = profile.branch_id
     AND branch.tenant_id = profile.tenant_id
     AND branch.is_active IS TRUE
    WHERE position.code IN (
      'central_supply_ops',
      'central_kitchen_lead'
    )
      AND coalesce(profile.is_active, TRUE) IS TRUE
      AND branch.branch_kind = CASE position.code
        WHEN 'central_supply_ops' THEN 'central_supply'
        WHEN 'central_kitchen_lead' THEN 'central_kitchen'
      END
      AND EXISTS (
        SELECT required.permission_key
        FROM unnest(ARRAY[
          'inventory:transfer_ship',
          'inventory:transfer_receive'
        ]::text[]) AS required(permission_key)
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.staff_permissions AS permission
          WHERE permission.user_id = profile.id
            AND permission.tenant_id = profile.tenant_id
            AND permission.branch_id = profile.branch_id
            AND permission.permission_key =
              required.permission_key
            AND permission.valid_from <= now()
            AND (
              permission.valid_until IS NULL
              OR permission.valid_until > now()
            )
        )
      )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: central transfer grants are not exact';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_branch_a bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_location_a bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_central_branch bigint :=
    current_setting('test.inventory_central_branch')::bigint;
  v_production_location bigint :=
    current_setting('test.inventory_production_location')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_unit bigint :=
    current_setting('test.inventory_production_unit')::bigint;
  v_foreign_tenant bigint;
  v_foreign_branch bigint;
  v_foreign_location bigint;
  v_foreign_session bigint;
  v_foreign_conflict bigint;
  v_foreign_issue bigint;
  v_production_session bigint;
  v_production_issue bigint;
  v_owned_writeoff bigint;
  v_bypass_issue bigint;
  v_bypass_item bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('acquire_zone_lock'::text),
        ('assign_auditor'::text),
        ('close_recount_round'::text),
        ('enable_offline_for_session'::text),
        ('escalate_round_4'::text),
        ('finalize_stocktake'::text),
        ('resolve_stocktake_conflict'::text),
        ('submit_count_round'::text),
        ('create_stocktake_session'::text),
        ('start_stocktake'::text),
        ('complete_stocktake'::text),
        ('set_inventory_count_assignments'::text),
        ('submit_inventory_count_slip'::text),
        ('confirm_stock_issue'::text)
    ) AS expected(function_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = expected.function_name
        AND procedure.prosecdef IS TRUE
        AND procedure.proconfig @> ARRAY['search_path=""']::text[]
        AND procedure.prosrc ILIKE '%auth_tenant_id%'
        AND procedure.prosrc ILIKE '%location_kind = ''warehouse''%'
    )
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: stocktake/issue RPC tenant+warehouse binding missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'approve_waste'
      AND procedure.prosecdef IS TRUE
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
      AND procedure.prosrc ILIKE '%auth_tenant_id%'
      AND procedure.prosrc ILIKE '%issue.tenant_id = v_tenant%'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: approve_waste tenant binding missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.stock_issues'::regclass
      AND tgname = 'trg_stock_issue_status_authority'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION
      'FINAL CATALOG: stock issue status authority trigger missing';
  END IF;

  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    '__inventory_hardening_foreign_' || gen_random_uuid()::text,
    '__inventory_hardening_foreign_' || gen_random_uuid()::text,
    v_owner
  )
  RETURNING id INTO v_foreign_tenant;

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active,
    code
  )
  VALUES (
    v_foreign_tenant,
    '__inventory_hardening_foreign_branch',
    'branch',
    TRUE,
    'ZZZZ'
  )
  RETURNING id INTO v_foreign_branch;

  SELECT location.id
  INTO v_foreign_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_foreign_tenant
    AND location.branch_id = v_foreign_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF v_foreign_location IS NULL THEN
    RAISE EXCEPTION
      'TEST SETUP: foreign branch warehouse was not provisioned';
  END IF;

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    location_id,
    status,
    created_by,
    session_number
  )
  VALUES (
    v_foreign_tenant,
    v_foreign_branch,
    v_foreign_location,
    'in_progress',
    v_owner,
    'KK-HARD-' || gen_random_uuid()::text
  )
  RETURNING id INTO v_foreign_session;

  INSERT INTO public.stocktake_conflicts (
    tenant_id,
    session_id,
    ingredient_id,
    round_no,
    conflict_type,
    client_payload,
    server_payload,
    submitted_by
  )
  VALUES (
    v_foreign_tenant,
    v_foreign_session,
    v_ingredient,
    1,
    'concurrent_round_submit',
    '{"counted_quantity":1}'::jsonb,
    '{"existing_counted_quantity":1}'::jsonb,
    v_owner
  )
  RETURNING id INTO v_foreign_conflict;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    source_location_id,
    approval_status
  )
  VALUES (
    v_foreign_tenant,
    v_foreign_branch,
    'XW-' || gen_random_uuid()::text,
    'writeoff',
    'draft',
    v_foreign_location,
    'pending'
  )
  RETURNING id INTO v_foreign_issue;

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    location_id,
    status,
    created_by,
    session_number
  )
  VALUES (
    v_tenant,
    v_central_branch,
    v_production_location,
    'in_progress',
    v_owner,
    'KK-PROD-' || gen_random_uuid()::text
  )
  RETURNING id INTO v_production_session;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    created_by,
    source_location_id
  )
  VALUES (
    v_tenant,
    v_central_branch,
    'PROD-' || gen_random_uuid()::text,
    'consumption',
    'draft',
    v_owner,
    v_production_location
  )
  RETURNING id INTO v_production_issue;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    source_location_id,
    approval_status
  )
  VALUES (
    v_tenant,
    v_branch_a,
    'OWN-W-' || gen_random_uuid()::text,
    'writeoff',
    'draft',
    v_location_a,
    'pending'
  )
  RETURNING id INTO v_owned_writeoff;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    created_by,
    source_location_id
  )
  VALUES (
    v_tenant,
    v_branch_a,
    'BYPASS-' || gen_random_uuid()::text,
    'consumption',
    'draft',
    v_owner,
    v_location_a
  )
  RETURNING id INTO v_bypass_issue;

  INSERT INTO public.stock_issue_items (
    tenant_id,
    issue_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_cost,
    approval_required
  )
  VALUES (
    v_tenant,
    v_bypass_issue,
    v_ingredient,
    1,
    v_unit,
    0,
    TRUE
  )
  RETURNING id INTO v_bypass_item;

  PERFORM set_config(
    'test.inventory_hardening_foreign_branch',
    v_foreign_branch::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_foreign_location',
    v_foreign_location::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_foreign_session',
    v_foreign_session::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_foreign_conflict',
    v_foreign_conflict::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_foreign_issue',
    v_foreign_issue::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_production_session',
    v_production_session::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_production_issue',
    v_production_issue::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_owned_writeoff',
    v_owned_writeoff::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_bypass_issue',
    v_bypass_issue::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_bypass_item',
    v_bypass_item::text,
    TRUE
  );
END;
$test$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inventory_owner'),
    'role', 'authenticated',
    'iss', 'https://test.supabase.co/auth/v1',
    'app_metadata', jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_owner'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_foreign_branch bigint :=
    current_setting('test.inventory_hardening_foreign_branch')::bigint;
  v_foreign_location bigint :=
    current_setting('test.inventory_hardening_foreign_location')::bigint;
  v_foreign_session bigint :=
    current_setting('test.inventory_hardening_foreign_session')::bigint;
  v_foreign_conflict bigint :=
    current_setting('test.inventory_hardening_foreign_conflict')::bigint;
  v_foreign_issue bigint :=
    current_setting('test.inventory_hardening_foreign_issue')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_case record;
  v_state text;
  v_message text;
  v_rejected boolean;
BEGIN
  FOR v_case IN
    SELECT *
    FROM (
      VALUES
        (
          'create_stocktake_session',
          format(
            'SELECT public.create_stocktake_session(%s, %s)',
            v_foreign_branch,
            v_foreign_location
          )
        ),
        (
          'start_stocktake',
          format(
            'SELECT public.start_stocktake(%s, %s)',
            v_foreign_branch,
            v_foreign_location
          )
        ),
        (
          'complete_stocktake',
          format(
            'SELECT public.complete_stocktake(%s)',
            v_foreign_session
          )
        ),
        (
          'acquire_zone_lock',
          format(
            'SELECT public.acquire_zone_lock(%s, %L)',
            v_foreign_session,
            'hostile-zone'
          )
        ),
        (
          'heartbeat_zone_lock',
          format(
            'SELECT public.heartbeat_zone_lock(%s, %L, 300)',
            v_foreign_session,
            'hostile-zone'
          )
        ),
        (
          'release_zone_lock',
          format(
            'SELECT public.release_zone_lock(%s, %L)',
            v_foreign_session,
            'hostile-zone'
          )
        ),
        (
          'assign_auditor',
          format(
            'SELECT public.assign_auditor(%s, %L::uuid, NULL)',
            v_foreign_session,
            v_owner
          )
        ),
        (
          'close_recount_round',
          format(
            'SELECT public.close_recount_round(%s, 1::smallint)',
            v_foreign_session
          )
        ),
        (
          'enable_offline_for_session',
          format(
            'SELECT public.enable_offline_for_session(%s)',
            v_foreign_session
          )
        ),
        (
          'escalate_round_4',
          format(
            'SELECT public.escalate_round_4(%s, %s, 1, %L)',
            v_foreign_session,
            v_ingredient,
            'hostile'
          )
        ),
        (
          'finalize_stocktake',
          format(
            'SELECT public.finalize_stocktake(%s)',
            v_foreign_session
          )
        ),
        (
          'submit_count_round',
          format(
            'SELECT public.submit_count_round(%s, 1::smallint, %L::jsonb)',
            v_foreign_session,
            '[]'
          )
        ),
        (
          'resolve_stocktake_conflict',
          format(
            'SELECT public.resolve_stocktake_conflict(%s, %L)',
            v_foreign_conflict,
            'reject'
          )
        ),
        (
          'set_inventory_count_assignments',
          format(
            'SELECT public.set_inventory_count_assignments(%s, %s, -1, ARRAY[]::bigint[])',
            v_foreign_branch,
            v_foreign_location
          )
        ),
        (
          'submit_inventory_count_slip',
          format(
            'SELECT public.submit_inventory_count_slip(%s, %s, %L::jsonb)',
            v_foreign_branch,
            v_foreign_location,
            jsonb_build_array(
              jsonb_build_object(
                'ingredient_id',
                v_ingredient,
                'counted_quantity',
                1
              )
            )::text
          )
        ),
        (
          'approve_waste',
          format(
            'SELECT public.approve_waste(%s, %L)',
            v_foreign_issue,
            'rejected'
          )
        ),
        (
          'confirm_stock_issue',
          format(
            'SELECT public.confirm_stock_issue(%s)',
            v_foreign_issue
          )
        )
    ) AS hostile(label, statement)
  LOOP
    v_rejected := FALSE;
    BEGIN
      EXECUTE v_case.statement;
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
          v_state = RETURNED_SQLSTATE,
          v_message = MESSAGE_TEXT;
        IF v_state = 'P0002' THEN
          v_rejected := TRUE;
        ELSE
          RAISE EXCEPTION
            'TENANT ISOLATION: % raised %, expected P0002: %',
            v_case.label,
            v_state,
            v_message;
        END IF;
    END;

    IF NOT v_rejected THEN
      RAISE EXCEPTION
        'TENANT ISOLATION: cross-tenant owner reached %',
        v_case.label;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.stocktake_sessions
    WHERE id = v_foreign_session
      AND (
        status <> 'in_progress'
        OR offline_enabled IS TRUE
        OR auditor_id IS NOT NULL
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.stocktake_conflicts
    WHERE id = v_foreign_conflict
      AND resolved_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.stock_issues
    WHERE id = v_foreign_issue
      AND (
        status <> 'draft'
        OR approval_status <> 'pending'
      )
  ) THEN
    RAISE EXCEPTION
      'TENANT ISOLATION: hostile calls mutated foreign Inventory rows';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_issue bigint :=
    current_setting('test.inventory_hardening_bypass_issue')::bigint;
  v_item bigint :=
    current_setting('test.inventory_hardening_bypass_item')::bigint;
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_branch bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_location bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_state text;
  v_rejected boolean;
BEGIN
  v_rejected := FALSE;
  BEGIN
    EXECUTE format(
      'UPDATE public.stock_issues SET approval_status = %L WHERE id = %s',
      'approved',
      v_issue
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      v_rejected := v_state = '42501';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated could mutate approval_status';
  END IF;

  v_rejected := FALSE;
  BEGIN
    EXECUTE format(
      'UPDATE public.stock_issue_items SET approval_required = FALSE WHERE id = %s',
      v_item
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      v_rejected := v_state = '42501';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated could mutate derived item approval';
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.stock_issues
    SET status = 'confirmed'
    WHERE id = v_issue;
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated bypassed confirm_stock_issue';
  END IF;

  v_rejected := FALSE;
  BEGIN
    EXECUTE format(
      'INSERT INTO public.stock_issues '
      || '(tenant_id, branch_id, issue_number, issue_type, status, '
      || 'created_by, source_location_id) '
      || 'VALUES (%s, %s, %L, %L, %L, %L::uuid, %s)',
      v_tenant,
      v_branch,
      'DIRECT-' || gen_random_uuid()::text,
      'consumption',
      'confirmed',
      v_owner,
      v_location
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      v_rejected := v_state = '42501';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated inserted a confirmed stock issue';
  END IF;

  IF (
    SELECT issue.status
    FROM public.stock_issues AS issue
    WHERE issue.id = v_issue
  ) <> 'draft' OR (
    SELECT item.approval_required
    FROM public.stock_issue_items AS item
    WHERE item.id = v_item
  ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'DIRECT DML: rejected bypass changed protected state';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_central_branch bigint :=
    current_setting('test.inventory_central_branch')::bigint;
  v_production_location bigint :=
    current_setting('test.inventory_production_location')::bigint;
  v_production_session bigint :=
    current_setting('test.inventory_hardening_production_session')::bigint;
  v_production_issue bigint :=
    current_setting('test.inventory_hardening_production_issue')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_case record;
  v_state text;
  v_message text;
  v_rejected boolean;
BEGIN
  FOR v_case IN
    SELECT *
    FROM (
      VALUES
        (
          'create_stocktake_session',
          format(
            'SELECT public.create_stocktake_session(%s, %s)',
            v_central_branch,
            v_production_location
          ),
          'P0002'
        ),
        (
          'start_stocktake',
          format(
            'SELECT public.start_stocktake(%s, %s)',
            v_central_branch,
            v_production_location
          ),
          'P0002'
        ),
        (
          'complete_stocktake',
          format(
            'SELECT public.complete_stocktake(%s)',
            v_production_session
          ),
          'P0002'
        ),
        (
          'acquire_zone_lock',
          format(
            'SELECT public.acquire_zone_lock(%s, %L)',
            v_production_session,
            'production-zone'
          ),
          'P0002'
        ),
        (
          'submit_count_round',
          format(
            'SELECT public.submit_count_round(%s, 1::smallint, %L::jsonb)',
            v_production_session,
            '[]'
          ),
          'P0002'
        ),
        (
          'set_inventory_count_assignments',
          format(
            'SELECT public.set_inventory_count_assignments(%s, %s, -1, ARRAY[]::bigint[])',
            v_central_branch,
            v_production_location
          ),
          'P0002'
        ),
        (
          'submit_inventory_count_slip',
          format(
            'SELECT public.submit_inventory_count_slip(%s, %s, %L::jsonb)',
            v_central_branch,
            v_production_location,
            jsonb_build_array(
              jsonb_build_object(
                'ingredient_id',
                v_ingredient,
                'counted_quantity',
                1
              )
            )::text
          ),
          'P0002'
        ),
        (
          'confirm_stock_issue',
          format(
            'SELECT public.confirm_stock_issue(%s)',
            v_production_issue
          ),
          '23514'
        )
    ) AS hostile(label, statement, expected_state)
  LOOP
    v_rejected := FALSE;
    BEGIN
      EXECUTE v_case.statement;
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
          v_state = RETURNED_SQLSTATE,
          v_message = MESSAGE_TEXT;
        IF v_state = v_case.expected_state THEN
          v_rejected := TRUE;
        ELSE
          RAISE EXCEPTION
            'WAREHOUSE AUTHORITY: % raised %, expected %: %',
            v_case.label,
            v_state,
            v_case.expected_state,
            v_message;
        END IF;
    END;

    IF NOT v_rejected THEN
      RAISE EXCEPTION
        'WAREHOUSE AUTHORITY: production_storage reached %',
        v_case.label;
    END IF;
  END LOOP;

  IF (
    SELECT session.status
    FROM public.stocktake_sessions AS session
    WHERE session.id = v_production_session
  ) <> 'in_progress' OR (
    SELECT issue.status
    FROM public.stock_issues AS issue
    WHERE issue.id = v_production_issue
  ) <> 'draft' THEN
    RAISE EXCEPTION
      'WAREHOUSE AUTHORITY: rejected calls mutated production rows';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_branch_a bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_branch_b bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_location_a bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_location_b bigint :=
    current_setting('test.inventory_policy_location_b')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_unit bigint :=
    current_setting('test.inventory_production_unit')::bigint;
  v_writeoff bigint :=
    current_setting('test.inventory_hardening_owned_writeoff')::bigint;
  v_crud_issue bigint;
  v_crud_item bigint;
  v_confirm_issue bigint;
  v_created_session bigint;
  v_started_session bigint;
  v_counts jsonb;
  v_result jsonb;
BEGIN
  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    notes,
    created_by,
    source_location_id,
    target_location_id
  )
  VALUES (
    v_tenant,
    v_branch_a,
    'CRUD-' || gen_random_uuid()::text,
    'consumption',
    'draft CRUD remains available',
    v_owner,
    v_location_a,
    NULL
  )
  RETURNING id INTO v_crud_issue;

  INSERT INTO public.stock_issue_items (
    tenant_id,
    issue_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_cost,
    reason,
    photo_urls
  )
  VALUES (
    v_tenant,
    v_crud_issue,
    v_ingredient,
    1,
    v_unit,
    0,
    'counted use',
    ARRAY[]::text[]
  )
  RETURNING id INTO v_crud_item;

  UPDATE public.stock_issue_items
  SET quantity = 2
  WHERE id = v_crud_item;

  DELETE FROM public.stock_issue_items
  WHERE id = v_crud_item;

  UPDATE public.stock_issues
  SET status = 'cancelled'
  WHERE id = v_crud_issue;

  IF (
    SELECT issue.status
    FROM public.stock_issues AS issue
    WHERE issue.id = v_crud_issue
  ) <> 'cancelled' THEN
    RAISE EXCEPTION
      'OWN TENANT: draft issue CRUD/cancel path failed';
  END IF;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    notes,
    created_by,
    source_location_id
  )
  VALUES (
    v_tenant,
    v_branch_a,
    'CONFIRM-' || gen_random_uuid()::text,
    'consumption',
    'warehouse confirm path',
    v_owner,
    v_location_a
  )
  RETURNING id INTO v_confirm_issue;

  v_result := public.confirm_stock_issue(v_confirm_issue);
  IF v_result ->> 'ok' <> 'true' OR (
    SELECT issue.status
    FROM public.stock_issues AS issue
    WHERE issue.id = v_confirm_issue
  ) <> 'confirmed' THEN
    RAISE EXCEPTION
      'OWN TENANT: warehouse confirm_stock_issue failed: %',
      v_result;
  END IF;

  PERFORM public.approve_waste(
    v_writeoff,
    'rejected',
    'hardening test'
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_issues AS issue
    WHERE issue.id = v_writeoff
      AND issue.status = 'cancelled'
      AND issue.approval_status = 'rejected'
  ) THEN
    RAISE EXCEPTION
      'OWN TENANT: approve_waste rejection path failed';
  END IF;

  v_result := public.create_stocktake_session(v_branch_a, NULL);
  v_created_session := (v_result ->> 'id')::bigint;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stocktake_sessions AS session
    JOIN public.inventory_locations AS location
      ON location.id = session.location_id
     AND location.tenant_id = session.tenant_id
     AND location.branch_id = session.branch_id
    WHERE session.id = v_created_session
      AND session.tenant_id = v_tenant
      AND location.id = v_location_a
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION
      'OWN TENANT: create_stocktake_session did not select warehouse';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id',
        line.ingredient_id,
        'counted_quantity',
        line.system_quantity,
        'entry_unit_id',
        line.entry_unit_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_counts
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = v_created_session
    AND line.round_no = 1;

  v_result := public.submit_count_round(
    v_created_session,
    1::smallint,
    v_counts
  );
  IF (v_result ->> 'applied_count')::integer
     <> jsonb_array_length(v_counts) THEN
    RAISE EXCEPTION
      'OWN TENANT: submit_count_round did not apply all rows: %',
      v_result;
  END IF;

  v_result := public.complete_stocktake(v_created_session);
  IF v_result ->> 'success' <> 'true' THEN
    RAISE EXCEPTION
      'OWN TENANT: complete_stocktake failed: %',
      v_result;
  END IF;

  PERFORM public.adjust_stock_exception(
    v_branch_b,
    v_ingredient,
    1,
    'stocktake hardening fixture'
  );

  v_result := public.start_stocktake(
    v_branch_b,
    v_location_b,
    'daily',
    FALSE,
    NULL,
    NULL,
    NULL
  );
  v_started_session := (v_result ->> 'session_id')::bigint;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stocktake_sessions AS session
    JOIN public.inventory_locations AS location
      ON location.id = session.location_id
     AND location.tenant_id = session.tenant_id
     AND location.branch_id = session.branch_id
    WHERE session.id = v_started_session
      AND session.tenant_id = v_tenant
      AND location.id = v_location_b
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION
      'OWN TENANT: start_stocktake did not keep explicit warehouse';
  END IF;

  v_result := public.acquire_zone_lock(
    v_started_session,
    'own-tenant-zone',
    300
  );
  IF v_result ->> 'acquired' <> 'true' THEN
    RAISE EXCEPTION
      'OWN TENANT: acquire_zone_lock failed: %',
      v_result;
  END IF;

  PERFORM public.assign_auditor(
    v_started_session,
    v_owner,
    v_branch_b
  );
  v_result := public.enable_offline_for_session(v_started_session);
  IF v_result ->> 'offline_enabled' <> 'true' THEN
    RAISE EXCEPTION
      'OWN TENANT: enable_offline_for_session failed: %',
      v_result;
  END IF;

  PERFORM set_config(
    'test.inventory_hardening_completed_session',
    v_created_session::text,
    TRUE
  );
  PERFORM set_config(
    'test.inventory_hardening_started_session',
    v_started_session::text,
    TRUE
  );
END;
$test$;

DO $test$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_branch_a bigint :=
    current_setting('test.inventory_policy_branch_a')::bigint;
  v_branch_b bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_central_branch bigint :=
    current_setting('test.inventory_central_branch')::bigint;
  v_location_a bigint :=
    current_setting('test.inventory_policy_location_a')::bigint;
  v_location_b bigint :=
    current_setting('test.inventory_policy_location_b')::bigint;
  v_production_location bigint :=
    current_setting('test.inventory_production_location')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_unit bigint :=
    current_setting('test.inventory_production_unit')::bigint;
  v_finished_good bigint :=
    current_setting('test.inventory_production_finished_good')::bigint;
  v_transfer bigint :=
    current_setting('test.inventory_transfer')::bigint;
  v_session bigint :=
    current_setting('test.inventory_hardening_started_session')::bigint;
  v_central_warehouse bigint;
  v_line bigint;
  v_issue bigint;
  v_permission_session bigint;
  v_forged_creator uuid := gen_random_uuid();
  v_expires_at timestamptz;
  v_result jsonb;
  v_state text;
  v_message text;
  v_rejected boolean;
BEGIN
  SELECT location.id
  INTO v_central_warehouse
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_central_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  SELECT line.id
  INTO v_line
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = v_session
    AND line.round_no = 1
  ORDER BY line.id
  LIMIT 1;

  IF v_line IS NULL OR v_central_warehouse IS NULL THEN
    RAISE EXCEPTION
      'HARDENING SETUP: stocktake line or central warehouse missing';
  END IF;

  UPDATE public.stocktake_lines
  SET counted_quantity = 1,
      variance_reason = 'verified count'
  WHERE id = v_line;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.stocktake_lines
    SET counted_quantity = 'NaN'::numeric
    WHERE id = v_line;
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: stocktake line accepted NaN';
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.stocktake_lines
    SET system_quantity = system_quantity
    WHERE id = v_line;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated changed stocktake system quantity';
  END IF;

  v_rejected := FALSE;
  BEGIN
    DELETE FROM public.stocktake_lines
    WHERE id = v_line;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated deleted a stocktake line';
  END IF;

  v_rejected := FALSE;
  BEGIN
    INSERT INTO public.stocktake_lines (
      tenant_id,
      session_id,
      ingredient_id,
      system_quantity,
      counted_quantity,
      round_no,
      entry_unit_id
    )
    SELECT
      line.tenant_id,
      line.session_id,
      line.ingredient_id,
      line.system_quantity,
      line.counted_quantity,
      2,
      line.entry_unit_id
    FROM public.stocktake_lines AS line
    WHERE line.id = v_line;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated inserted a stocktake line';
  END IF;

  v_rejected := FALSE;
  BEGIN
    UPDATE public.stocktake_sessions
    SET auditor_id = auditor_id
    WHERE id = v_session;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'DIRECT DML: authenticated changed stocktake authority fields';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.heartbeat_zone_lock(
      v_session,
      'own-tenant-zone',
      NULL
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ZONE LOCK: NULL TTL was accepted';
  END IF;

  FOREACH v_state IN ARRAY ARRAY['0', '7201']::text[]
  LOOP
    v_rejected := FALSE;
    BEGIN
      PERFORM public.heartbeat_zone_lock(
        v_session,
        'own-tenant-zone',
        v_state::integer
      );
    EXCEPTION
      WHEN invalid_parameter_value THEN
        v_rejected := TRUE;
    END;
    IF NOT v_rejected THEN
      RAISE EXCEPTION 'ZONE LOCK: invalid TTL % was accepted',
        v_state;
    END IF;
  END LOOP;

  v_expires_at := public.heartbeat_zone_lock(
    v_session,
    'own-tenant-zone',
    600
  );
  IF v_expires_at <= now()
     OR NOT public.release_zone_lock(
       v_session,
       'own-tenant-zone'
     )
     OR public.release_zone_lock(
       v_session,
       'own-tenant-zone'
     ) THEN
    RAISE EXCEPTION
      'ZONE LOCK: heartbeat/release ownership path failed';
  END IF;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    created_by,
    source_location_id
  )
  VALUES (
    v_tenant,
    v_branch_a,
    'CREATOR-' || gen_random_uuid()::text,
    'consumption',
    'draft',
    v_forged_creator,
    v_location_a
  )
  RETURNING id INTO v_issue;

  IF (
    SELECT issue.created_by
    FROM public.stock_issues AS issue
    WHERE issue.id = v_issue
  ) IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION
      'CREATOR AUTHORITY: authenticated forged stock issue creator';
  END IF;

  v_rejected := FALSE;
  BEGIN
    INSERT INTO public.stock_issue_items (
      tenant_id,
      issue_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost
    )
    VALUES (
      v_tenant,
      v_issue,
      v_ingredient,
      'NaN'::numeric,
      v_unit,
      0
    );
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: stock issue item accepted NaN';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.adjust_stock_exception(
      v_branch_a,
      v_ingredient,
      'Infinity'::numeric,
      'finite guard'
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: stock adjustment accepted Infinity';
  END IF;

  v_result := public.adjust_stock_exception(
    v_central_branch,
    v_ingredient,
    1,
    'warehouse routing proof'
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    JOIN public.inventory_locations AS location
      ON location.id = movement.location_id
     AND location.tenant_id = movement.tenant_id
    WHERE movement.id = (v_result ->> 'movement_id')::bigint
      AND movement.tenant_id = v_tenant
      AND movement.branch_id = v_central_branch
      AND location.id = v_central_warehouse
      AND location.location_kind = 'warehouse'
      AND location.id <> v_production_location
  ) THEN
    RAISE EXCEPTION
      'WAREHOUSE AUTHORITY: adjustment used production storage';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.create_stock_transfer_draft(
      v_branch_a,
      v_branch_b,
      NULL,
      NULL,
      NULL,
      jsonb_build_array(jsonb_build_object(
        'ingredientId',
        v_ingredient,
        'quantity',
        'NaN',
        'entryUnitId',
        v_unit
      )),
      v_location_a,
      v_location_b
    );
  EXCEPTION
    WHEN invalid_parameter_value
      OR check_violation
      OR numeric_value_out_of_range THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: transfer draft accepted NaN';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.stock_transfer_receive(
      v_transfer,
      jsonb_build_object(v_ingredient::text, 'NaN')
    );
  EXCEPTION
    WHEN invalid_parameter_value
      OR check_violation
      OR numeric_value_out_of_range THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: transfer receive accepted NaN';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.create_production_run_with_locations(
      v_central_branch,
      v_finished_good,
      'NaN'::numeric,
      v_unit,
      'finite guard',
      v_branch_b,
      NULL,
      v_production_location,
      v_location_b
    );
  EXCEPTION
    WHEN invalid_parameter_value
      OR check_violation
      OR numeric_value_out_of_range THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: production run accepted NaN';
  END IF;

  UPDATE public.stocktake_sessions
  SET status = 'cancelled'
  WHERE id = v_session;
  IF (
    SELECT session.status
    FROM public.stocktake_sessions AS session
    WHERE session.id = v_session
  ) <> 'cancelled' THEN
    RAISE EXCEPTION
      'DIRECT DML: scoped stocktake cancellation failed';
  END IF;

  v_result := public.create_stocktake_session(v_branch_a, NULL);
  v_permission_session := (v_result ->> 'id')::bigint;
  PERFORM set_config(
    'test.inventory_hardening_permission_session',
    v_permission_session::text,
    TRUE
  );
END;
$test$;

DO $test$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_finished_good bigint :=
    current_setting('test.inventory_production_finished_good')::bigint;
  v_unit bigint :=
    current_setting('test.inventory_production_unit')::bigint;
  v_unit_code text := current_setting('test.inventory_unit_code');
  v_positive_name text :=
    '__bulk_positive_' || gen_random_uuid()::text;
  v_atomic_name text :=
    '__bulk_atomic_' || gen_random_uuid()::text;
  v_atomic_unit text :=
    'ROLLBACK_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_result jsonb;
  v_rejected boolean := FALSE;
BEGIN
  v_result := public.bulk_import_ingredients(
    jsonb_build_array(jsonb_build_object(
      'name',
      v_positive_name,
      'unit',
      v_unit_code,
      'item_kind',
      'raw_material',
      'unit_cost',
      999999,
      'min_stock_level',
      0,
      'storage_type',
      'ambient'
    ))
  );
  IF v_result ->> 'inserted' <> '1' THEN
    RAISE EXCEPTION
      'BULK IMPORT: Owner ingredient import failed: %',
      v_result;
  END IF;
  PERFORM set_config(
    'test.inventory_bulk_positive_name',
    v_positive_name,
    TRUE
  );

  v_result := public.bulk_import_production_recipes(
    jsonb_build_array(jsonb_build_object(
      'finished_good_id',
      v_finished_good,
        'output_quantity',
        1,
      'lines',
      jsonb_build_array(jsonb_build_object(
        'ingredient_id',
        v_ingredient,
        'quantity',
        3,
        'entry_unit_id',
        v_unit
      ))
    ))
  );
  IF v_result ->> 'recipes' <> '1'
     OR v_result ->> 'lines' <> '1'
     OR NOT EXISTS (
       SELECT 1
       FROM public.production_recipes AS recipe
       WHERE recipe.tenant_id = v_tenant
         AND recipe.finished_good_id = v_finished_good
         AND recipe.ingredient_id = v_ingredient
         AND recipe.quantity = 3
         AND recipe.output_quantity = 1
     ) THEN
    RAISE EXCEPTION
      'BULK IMPORT: Owner production recipe import failed: %',
      v_result;
  END IF;

  BEGIN
    PERFORM public.bulk_import_ingredients(
      jsonb_build_array(
        jsonb_build_object(
          'name',
          v_atomic_name,
          'unit',
          v_atomic_unit,
          'item_kind',
          'raw_material',
          'unit_cost',
          123,
          'min_stock_level',
          0,
          'storage_type',
          'ambient'
        ),
        jsonb_build_object(
          'name',
          (
            SELECT ingredient.name
            FROM public.ingredients AS ingredient
            WHERE ingredient.tenant_id = v_tenant
              AND ingredient.id = v_ingredient
          ),
          'unit',
          v_atomic_unit,
          'item_kind',
          'raw_material',
          'unit_cost',
          456,
          'min_stock_level',
          0,
          'storage_type',
          'ambient'
        )
      )
    );
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := TRUE;
  END;

  IF NOT v_rejected
     OR EXISTS (
       SELECT 1
       FROM public.ingredients AS ingredient
       WHERE ingredient.tenant_id = v_tenant
         AND ingredient.name = v_atomic_name
     )
     OR EXISTS (
       SELECT 1
       FROM public.units AS unit
       WHERE unit.tenant_id = v_tenant
         AND unit.code = v_atomic_unit
     ) THEN
    RAISE EXCEPTION
      'BULK IMPORT: invalid multi-row payload was not atomic';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.bulk_import_production_recipes(
      jsonb_build_array(jsonb_build_object(
        'finished_good_id',
        v_finished_good,
        'output_quantity',
        1,
        'lines',
        jsonb_build_array(jsonb_build_object(
          'ingredient_id',
          v_ingredient,
          'quantity',
          'Infinity',
          'entry_unit_id',
          v_unit
        ))
      ))
    );
  EXCEPTION
    WHEN invalid_parameter_value
      OR check_violation
      OR numeric_value_out_of_range THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'NUMERIC FINITE: production recipe bulk import accepted Infinity';
  END IF;
END;
$test$;

DO $test$
DECLARE
  v_tenant bigint :=
    current_setting('test.inventory_policy_tenant')::bigint;
  v_owner uuid := current_setting('test.inventory_owner')::uuid;
  v_branch bigint :=
    current_setting('test.inventory_policy_branch_b')::bigint;
  v_location bigint :=
    current_setting('test.inventory_policy_location_b')::bigint;
  v_ingredient bigint :=
    current_setting('test.inventory_ingredient')::bigint;
  v_session bigint;
  v_cancelled_session bigint :=
    current_setting('test.inventory_hardening_started_session')::bigint;
  v_conflict bigint;
  v_entry_unit bigint;
  v_system_quantity numeric;
  v_canonical_quantity numeric;
  v_movements_before integer;
  v_movements_after integer;
  v_rows integer;
  v_result jsonb;
  v_terminal record;
  v_before record;
  v_after record;
  v_rejected boolean := FALSE;
BEGIN
  v_result := public.create_stocktake_session(v_branch, v_location);
  v_session := (v_result ->> 'id')::bigint;

  SELECT line.system_quantity, line.entry_unit_id
  INTO v_system_quantity, v_entry_unit
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = v_session
    AND line.ingredient_id = v_ingredient
    AND line.round_no = 1;

  IF v_system_quantity IS NULL OR v_entry_unit IS NULL THEN
    RAISE EXCEPTION
      'RECOUNT SETUP: canonical round-1 line missing';
  END IF;

  UPDATE public.stocktake_lines
  SET counted_quantity = system_quantity,
      variance_reason = 'baseline count'
  WHERE tenant_id = v_tenant
    AND session_id = v_session
    AND round_no = 1;

  UPDATE public.stocktake_lines
  SET counted_quantity = v_system_quantity + 100000,
      variance_reason = 'force recount'
  WHERE tenant_id = v_tenant
    AND session_id = v_session
    AND ingredient_id = v_ingredient
    AND round_no = 1;

  v_result := public.close_recount_round(v_session, 1::smallint);
  IF v_result ->> 'next_round' <> '2'
     OR NOT EXISTS (
       SELECT 1
       FROM public.stocktake_lines AS line
       WHERE line.tenant_id = v_tenant
         AND line.session_id = v_session
         AND line.ingredient_id = v_ingredient
         AND line.round_no = 1
         AND line.needs_recount IS TRUE
     ) THEN
    RAISE EXCEPTION
      'RECOUNT: round one did not open canonical recount: %',
      v_result;
  END IF;

  v_result := public.submit_count_round(
    v_session,
    2::smallint,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id',
      v_ingredient,
      'counted_quantity',
      v_system_quantity,
      'entry_unit_id',
      v_entry_unit
    ))
  );
  IF v_result ->> 'applied_count' <> '1' THEN
    RAISE EXCEPTION
      'RECOUNT: round-two count submission failed: %',
      v_result;
  END IF;

  v_result := public.close_recount_round(v_session, 2::smallint);
  SELECT line.counted_quantity
  INTO v_canonical_quantity
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = v_session
    AND line.ingredient_id = v_ingredient
    AND line.round_no = 1
    AND line.is_final IS TRUE
    AND line.needs_recount IS FALSE;

  IF v_result ->> 'needs_recount_count' <> '0'
     OR v_canonical_quantity IS DISTINCT FROM
       v_system_quantity + 50000 THEN
    RAISE EXCEPTION
      'RECOUNT: converged median was not written to round one: %, %',
      v_result,
      v_canonical_quantity;
  END IF;

  UPDATE public.stocktake_lines
  SET counted_quantity = counted_quantity + 1
  WHERE tenant_id = v_tenant
    AND session_id = v_session
    AND ingredient_id = v_ingredient
    AND round_no = 1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 OR (
    SELECT line.counted_quantity
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = v_session
      AND line.ingredient_id = v_ingredient
      AND line.round_no = 1
  ) IS DISTINCT FROM v_canonical_quantity THEN
    RAISE EXCEPTION
      'RECOUNT: authenticated overwrote finalized round one';
  END IF;

  v_result := public.submit_count_round(
    v_session,
    2::smallint,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id',
      v_ingredient,
      'counted_quantity',
      v_system_quantity + 1,
      'entry_unit_id',
      v_entry_unit
    ))
  );
  SELECT conflict.id
  INTO v_conflict
  FROM public.stocktake_conflicts AS conflict
  WHERE conflict.tenant_id = v_tenant
    AND conflict.session_id = v_session
    AND conflict.ingredient_id = v_ingredient
    AND conflict.round_no = 2
    AND conflict.resolved_at IS NULL
  ORDER BY conflict.id DESC
  LIMIT 1;
  IF v_result ->> 'conflict_count' <> '1'
     OR v_conflict IS NULL THEN
    RAISE EXCEPTION
      'RECOUNT: final overwrite was not recorded as conflict: %',
      v_result;
  END IF;

  SELECT count(*)::integer
  INTO v_movements_before
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.branch_id = v_branch
    AND movement.location_id = v_location
    AND movement.type = 'count_adjustment';

  v_result := public.complete_stocktake(v_session);
  IF v_result ->> 'success' <> 'true' THEN
    RAISE EXCEPTION
      'RECOUNT: canonical completion failed: %',
      v_result;
  END IF;

  SELECT count(*)::integer
  INTO v_movements_after
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.branch_id = v_branch
    AND movement.location_id = v_location
    AND movement.type = 'count_adjustment';

  IF v_movements_after <> v_movements_before + 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.stock_movements AS movement
       WHERE movement.tenant_id = v_tenant
         AND movement.branch_id = v_branch
         AND movement.location_id = v_location
         AND movement.ingredient_id = v_ingredient
         AND movement.type = 'count_adjustment'
         AND movement.quantity_change =
           v_canonical_quantity - v_system_quantity
         AND movement.created_by =
           current_setting('test.inventory_owner')::uuid
       ORDER BY movement.id DESC
       LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'RECOUNT: completion did not post exactly one canonical adjustment';
  END IF;

  BEGIN
    PERFORM public.complete_stocktake(v_session);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'RECOUNT: completed session posted a second time';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.submit_count_round(
      v_session,
      2::smallint,
      '[]'::jsonb
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'RECOUNT: count submission mutated a completed session';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.close_recount_round(v_session, 2::smallint);
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'RECOUNT: closed round mutated a completed session';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.escalate_round_4(
      v_session,
      v_ingredient,
      v_canonical_quantity,
      'completed history must stay immutable'
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'RECOUNT: escalation mutated a completed session';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.resolve_stocktake_conflict(
      v_conflict,
      'reject',
      NULL,
      'completed history'
    );
  EXCEPTION
    WHEN invalid_parameter_value THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'RECOUNT: conflict resolution mutated a completed session';
  END IF;

  FOR v_terminal IN
    SELECT terminal.session_id
    FROM unnest(
      ARRAY[v_session, v_cancelled_session]::bigint[]
    ) AS terminal(session_id)
  LOOP
    SELECT
      session.auditor_id,
      session.auditor_branch_id,
      session.is_unaudited
    INTO v_before
    FROM public.stocktake_sessions AS session
    WHERE session.id = v_terminal.session_id;

    v_rejected := FALSE;
    BEGIN
      PERFORM public.assign_auditor(
        v_terminal.session_id,
        v_owner,
        NULL
      );
    EXCEPTION
      WHEN invalid_parameter_value THEN
        v_rejected := TRUE;
    END;

    SELECT
      session.auditor_id,
      session.auditor_branch_id,
      session.is_unaudited
    INTO v_after
    FROM public.stocktake_sessions AS session
    WHERE session.id = v_terminal.session_id;

    IF NOT v_rejected
       OR v_after.auditor_id IS DISTINCT FROM v_before.auditor_id
       OR v_after.auditor_branch_id IS DISTINCT FROM
         v_before.auditor_branch_id
       OR v_after.is_unaudited IS DISTINCT FROM
         v_before.is_unaudited THEN
      RAISE EXCEPTION
        'AUDITOR: terminal session attribution was rewritten: %',
        v_terminal.session_id;
    END IF;
  END LOOP;
END;
$test$;

RESET ROLE;

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.tenant_id =
        current_setting('test.inventory_policy_tenant')::bigint
      AND ingredient.name =
        current_setting('test.inventory_bulk_positive_name')
      AND ingredient.unit_cost = 0
  ) THEN
    RAISE EXCEPTION
      'BULK IMPORT: supplied unit_cost changed the stored catalog cost';
  END IF;
END;
$test$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    current_setting('test.inventory_non_production_staff'),
    'role',
    'authenticated',
    'iss',
    'https://test.supabase.co/auth/v1',
    'app_metadata',
    jsonb_build_object(
      'tenant_id',
      current_setting('test.inventory_policy_tenant')::bigint
    )
  )::text,
  TRUE
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inventory_non_production_staff'),
  TRUE
);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);

SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  v_session bigint :=
    current_setting(
      'test.inventory_hardening_permission_session'
    )::bigint;
  v_rejected boolean := FALSE;
  v_state text;
BEGIN
  BEGIN
    PERFORM public.complete_stocktake(v_session);
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      v_rejected := v_state = '42501';
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STOCKTAKE AUTHORITY: role without complete permission was accepted';
  END IF;
END;
$test$;

RESET ROLE;

ROLLBACK;
