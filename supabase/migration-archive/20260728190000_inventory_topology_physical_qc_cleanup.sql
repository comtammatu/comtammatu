-- Inventory topology and physical receiving invariants.

BEGIN;

LOCK TABLE public.branches IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.inventory_locations IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    LEFT JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
    WHERE branch.id IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_location_branch_tenant_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_id_tenant_key
  UNIQUE (id, tenant_id);

ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_branch_tenant_fkey
  FOREIGN KEY (branch_id, tenant_id)
  REFERENCES public.branches (id, tenant_id)
  ON DELETE CASCADE;

-- Replace the global active-location check so central-kitchen production
-- storage remains explicit alongside the required site warehouse.
DROP TRIGGER IF EXISTS trg_inventory_locations_active_site_warehouse
  ON public.inventory_locations;
DROP TRIGGER IF EXISTS trg_branches_active_site_warehouse
  ON public.branches;
DROP FUNCTION IF EXISTS public.trg_assert_active_site_has_warehouse();
ALTER TABLE public.inventory_locations
  DROP CONSTRAINT IF EXISTS
    inventory_locations_active_site_warehouse_chk;
DROP INDEX IF EXISTS
  public.inventory_locations_one_active_per_site_idx;

-- A kitchen location cannot be removed safely while inventory history points
-- at it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations AS kitchen_location
    WHERE kitchen_location.location_kind = 'kitchen'
      AND (
        EXISTS (
          SELECT 1
          FROM public.goods_received_notes AS grn
          WHERE grn.location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.inventory_count_assignments AS assignment
          WHERE assignment.location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.inventory_count_slips AS slip
          WHERE slip.location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.production_runs AS run
          WHERE run.source_location_id = kitchen_location.id
             OR run.target_location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.stock_issues AS issue
          WHERE issue.source_location_id = kitchen_location.id
             OR issue.target_location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.stock_levels AS stock
          WHERE stock.location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.stock_movements AS movement
          WHERE movement.location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.stock_transfers AS transfer
          WHERE transfer.from_location_id = kitchen_location.id
             OR transfer.to_location_id = kitchen_location.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.stocktake_sessions AS stocktake
          WHERE stocktake.location_id = kitchen_location.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'inventory_kitchen_location_still_referenced'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DELETE FROM public.inventory_locations
WHERE location_kind = 'kitchen';

ALTER TABLE public.inventory_locations
  DROP CONSTRAINT inventory_locations_location_kind_check,
  ADD CONSTRAINT inventory_locations_location_kind_check
    CHECK (
      location_kind IN ('warehouse', 'receiving', 'production_storage')
    );

CREATE OR REPLACE FUNCTION public.ensure_branch_inventory_location_defaults(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_warehouse_id bigint;
  v_warehouse_name text;
BEGIN
  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = p_tenant_id
    AND branch.is_active IS TRUE
  FOR UPDATE;

  IF NOT FOUND
     OR v_branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RETURN;
  END IF;

  v_warehouse_name := CASE v_branch_kind
    WHEN 'central_supply' THEN 'Kho Tổng'
    WHEN 'central_kitchen' THEN 'Kho Bếp Trung Tâm'
    ELSE 'Kho chi nhánh'
  END;

  SELECT location.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
  ORDER BY
    location.is_active DESC,
    (
      location.is_default_receive
      AND location.is_default_issue
      AND location.is_default_consumption
    ) DESC,
    location.sort_order,
    location.id
  LIMIT 1
  FOR UPDATE;

  IF v_warehouse_id IS NULL THEN
    SELECT location.id
    INTO v_warehouse_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = p_tenant_id
      AND location.branch_id = p_branch_id
      AND location.code = 'main_warehouse'
    LIMIT 1
    FOR UPDATE;
  END IF;

  UPDATE public.inventory_locations AS location
  SET is_active = CASE
        WHEN location.location_kind = 'warehouse'
          OR v_branch_kind = 'branch'
          THEN FALSE
        ELSE location.is_active
      END,
      is_default_receive = FALSE,
      is_default_issue = FALSE,
      is_default_consumption = FALSE,
      updated_at = now()
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = p_branch_id
    AND (v_warehouse_id IS NULL OR location.id <> v_warehouse_id)
    AND (
      location.location_kind = 'warehouse'
      OR v_branch_kind = 'branch'
      OR location.is_default_receive
      OR location.is_default_issue
      OR location.is_default_consumption
    );

  IF v_warehouse_id IS NULL THEN
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
      p_tenant_id,
      p_branch_id,
      'main_warehouse',
      v_warehouse_name,
      'warehouse',
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      0
    )
    RETURNING id INTO v_warehouse_id;
  ELSE
    UPDATE public.inventory_locations
    SET name = v_warehouse_name,
        location_kind = 'warehouse',
        is_active = TRUE,
        is_default_receive = TRUE,
        is_default_issue = TRUE,
        is_default_consumption = TRUE,
        sort_order = 0,
        updated_at = now()
    WHERE id = v_warehouse_id;
  END IF;

  IF v_branch_kind = 'branch' THEN
    INSERT INTO public.branch_feature_flags (
      branch_id,
      flag_key,
      enabled,
      enabled_at,
      disabled_at,
      updated_at
    )
    VALUES (
      p_branch_id,
      'pos_stock_outcome_posting',
      TRUE,
      now(),
      NULL,
      now()
    )
    ON CONFLICT (branch_id, flag_key) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(
  bigint,
  bigint
) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_ensure_branch_inventory_location_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.is_active IS TRUE
     AND NEW.branch_kind IN ('branch', 'central_supply', 'central_kitchen') THEN
    PERFORM public.ensure_branch_inventory_location_defaults(
      NEW.tenant_id,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_ensure_branch_inventory_location_defaults()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.trg_ensure_branch_inventory_location_defaults()
  TO service_role;

DROP TRIGGER IF EXISTS trg_branches_ensure_inventory_locations
  ON public.branches;
CREATE TRIGGER trg_branches_ensure_inventory_locations
AFTER INSERT OR UPDATE OF id, tenant_id, branch_kind, is_active
ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.trg_ensure_branch_inventory_location_defaults();

DO $$
DECLARE
  site record;
BEGIN
  FOR site IN
    SELECT branch.tenant_id, branch.id
    FROM public.branches AS branch
    WHERE branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
    ORDER BY branch.tenant_id, branch.id
  LOOP
    PERFORM public.ensure_branch_inventory_location_defaults(
      site.tenant_id,
      site.id
    );
  END LOOP;
END;
$$;

UPDATE public.inventory_locations
SET is_default_receive = FALSE,
    is_default_issue = FALSE,
    is_default_consumption = FALSE,
    updated_at = now()
WHERE is_active IS FALSE
   OR location_kind <> 'warehouse';

CREATE UNIQUE INDEX inventory_locations_one_active_warehouse_per_site_idx
ON public.inventory_locations (tenant_id, branch_id)
WHERE is_active IS TRUE
  AND location_kind = 'warehouse';

ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_defaults_require_active_warehouse
  CHECK (
    (
      NOT is_default_receive
      AND NOT is_default_issue
      AND NOT is_default_consumption
    )
    OR (
      is_active IS TRUE
      AND location_kind = 'warehouse'
    )
  );

CREATE OR REPLACE FUNCTION private.assert_inventory_site_warehouse(
  p_tenant_id bigint,
  p_branch_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_warehouse_count integer;
  v_defaults_valid boolean;
BEGIN
  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = p_tenant_id
    AND branch.is_active IS TRUE;

  IF NOT FOUND
     OR v_branch_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    bool_and(
      location.is_default_receive
      AND location.is_default_issue
      AND location.is_default_consumption
    )
  INTO v_warehouse_count, v_defaults_valid
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF v_warehouse_count <> 1 THEN
    RAISE EXCEPTION 'inventory_site_requires_exactly_one_warehouse:%',
      p_branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_defaults_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'inventory_site_warehouse_must_own_all_defaults:%',
      p_branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_branch_kind = 'branch'
     AND EXISTS (
       SELECT 1
       FROM public.inventory_locations AS location
       WHERE location.tenant_id = p_tenant_id
         AND location.branch_id = p_branch_id
         AND location.is_active IS TRUE
         AND location.location_kind <> 'warehouse'
     ) THEN
    RAISE EXCEPTION 'branch_site_allows_only_active_warehouse:%',
      p_branch_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_branch_kind <> 'central_kitchen'
     AND EXISTS (
       SELECT 1
       FROM public.inventory_locations AS location
       WHERE location.tenant_id = p_tenant_id
         AND location.branch_id = p_branch_id
         AND location.is_active IS TRUE
         AND location.location_kind = 'production_storage'
     ) THEN
    RAISE EXCEPTION
      'production_storage_requires_central_kitchen:%',
      p_branch_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_inventory_site_warehouse(
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_inventory_site_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM private.assert_inventory_site_warehouse(
      OLD.tenant_id,
      OLD.branch_id
    );
  END IF;

  IF TG_OP <> 'DELETE'
     AND (
       TG_OP = 'INSERT'
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.location_kind IS DISTINCT FROM OLD.location_kind
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.is_default_receive IS DISTINCT FROM OLD.is_default_receive
       OR NEW.is_default_issue IS DISTINCT FROM OLD.is_default_issue
       OR NEW.is_default_consumption IS DISTINCT FROM OLD.is_default_consumption
     ) THEN
    PERFORM private.assert_inventory_site_warehouse(
      NEW.tenant_id,
      NEW.branch_id
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_inventory_site_warehouse()
  FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER inventory_locations_exact_warehouse_check
AFTER INSERT OR UPDATE OR DELETE
ON public.inventory_locations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.enforce_inventory_site_warehouse();

CREATE OR REPLACE FUNCTION private.enforce_branch_inventory_site_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM private.assert_inventory_site_warehouse(
      OLD.tenant_id,
      OLD.id
    );
  END IF;

  IF TG_OP <> 'DELETE' THEN
    PERFORM private.assert_inventory_site_warehouse(
      NEW.tenant_id,
      NEW.id
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_branch_inventory_site_warehouse()
  FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER branches_exact_warehouse_check
AFTER INSERT OR UPDATE OR DELETE
ON public.branches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.enforce_branch_inventory_site_warehouse();

CREATE OR REPLACE FUNCTION private.grn_rejection_photo_exists(
  p_tenant_id bigint,
  p_grn_id bigint,
  p_grn_line_id bigint,
  p_photo_url text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_url text := btrim(coalesce(p_photo_url, ''));
  v_marker constant text :=
    '/storage/v1/object/public/inventory-attachments/';
  v_marker_position integer;
  v_object_name text;
  v_prefix text;
  v_relative_name text;
  v_line_prefix text;
  v_issuer text := COALESCE(auth.jwt() ->> 'iss', '');
  v_expected_origin text;
BEGIN
  IF p_tenant_id IS NULL
     OR p_grn_id IS NULL
     OR p_grn_line_id IS NULL
     OR v_url !~*
       '^https?://[^/?#]+/storage/v1/object/public/inventory-attachments/' THEN
    RETURN FALSE;
  END IF;

  IF v_issuer ~ '^https://[^/?#]+/auth/v1/?$' THEN
    v_expected_origin := pg_catalog.regexp_replace(
      v_issuer,
      '/auth/v1/?$',
      ''
    );
    IF v_url NOT LIKE v_expected_origin || v_marker || '%' THEN
      RETURN FALSE;
    END IF;
  END IF;

  v_marker_position := strpos(v_url, v_marker);
  IF v_marker_position = 0 THEN
    RETURN FALSE;
  END IF;

  v_object_name := substring(
    v_url
    FROM v_marker_position + char_length(v_marker)
  );
  v_prefix := p_tenant_id::text
    || '/grn/'
    || p_grn_id::text
    || '/rejected/';
  v_line_prefix := p_grn_line_id::text || '/';

  IF v_object_name NOT LIKE v_prefix || '%'
     OR v_object_name !~ '^[A-Za-z0-9._/-]+$'
     OR v_object_name LIKE '%//%'
     OR v_object_name ~ '(^|/)\.\.?(/|$)' THEN
    RETURN FALSE;
  END IF;

  v_relative_name := substring(
    v_object_name
    FROM char_length(v_prefix) + 1
  );
  IF v_relative_name NOT LIKE v_line_prefix || '%'
     OR substring(
       v_relative_name
       FROM char_length(v_line_prefix) + 1
     ) !~* '^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp|heic)$'
     OR NOT EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.id = p_grn_line_id
         AND item.tenant_id = p_tenant_id
         AND item.grn_id = p_grn_id
     ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'inventory-attachments'
      AND object.name = v_object_name
      AND pg_catalog.lower(
        COALESCE(object.metadata ->> 'mimetype', '')
      ) IN (
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic'
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.grn_rejection_photo_exists(
  bigint,
  bigint,
  bigint,
  text
) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inventory_qc_settings
    UNION ALL
    SELECT 1 FROM public.branch_express_window
    UNION ALL
    SELECT 1 FROM public.branch_override_attempts
    UNION ALL
    SELECT 1 FROM public.branch_override_codes
    UNION ALL
    SELECT 1 FROM public.grn_baseline_pause
    UNION ALL
    SELECT 1 FROM public.grn_express_extend_audit
    UNION ALL
    SELECT 1 FROM public.grn_hardblock_overrides
    UNION ALL
    SELECT 1 FROM public.ingredient_category_review_policy
    UNION ALL
    SELECT 1 FROM public.user_trust_score
  ) THEN
    RAISE EXCEPTION 'inventory_qc_cleanup_requires_empty_policy_tables'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'grn-evidence'
  ) THEN
    RAISE EXCEPTION 'grn_evidence_bucket_not_empty'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.received_quantity IN (
            'NaN'::numeric,
            'Infinity'::numeric,
            '-Infinity'::numeric
          )
       OR item.rejected_quantity IN (
            'NaN'::numeric,
            'Infinity'::numeric,
            '-Infinity'::numeric
          )
       OR item.rejected_quantity < 0
       OR item.rejected_quantity > item.received_quantity
       OR (
         item.rejected_quantity > 0
         AND (
           NULLIF(btrim(item.rejection_reason), '') IS NULL
           OR NOT private.grn_rejection_photo_exists(
             item.tenant_id,
             item.grn_id,
             item.id,
             item.rejected_photo_url
           )
         )
       )
  ) THEN
    RAISE EXCEPTION 'grn_physical_qc_preflight_failed'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_validate_qc_before_confirm
  ON public.goods_received_notes;
DROP TRIGGER IF EXISTS trg_grn_items_compute_price_baseline
  ON public.grn_items;
DROP TRIGGER IF EXISTS trg_grn_items_requires_review_outbox
  ON public.grn_items;
DROP TRIGGER IF EXISTS trg_grn_upsert_grn_last
  ON public.goods_received_notes;
DROP TRIGGER IF EXISTS goods_received_notes_supplier_mapping_on_confirm
  ON public.goods_received_notes;

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'weekly_grn_override_report'
  LOOP
    DELETE FROM private.cron_job_health_grace
    WHERE jobid = v_job.jobid;
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS private.compute_grn_price_baseline();
DROP FUNCTION IF EXISTS private.validate_grn_qc_before_confirm();
DROP FUNCTION IF EXISTS public._compute_grn_price_baseline(
  bigint,
  bigint,
  bigint,
  text
);
DROP FUNCTION IF EXISTS public.compute_user_trust_score(uuid, bigint);
DROP FUNCTION IF EXISTS public.configure_express_window(
  bigint,
  boolean,
  time without time zone,
  time without time zone
);
DROP FUNCTION IF EXISTS public.extend_express_window(bigint, integer, text);
DROP FUNCTION IF EXISTS public.get_grn_price_baseline(bigint, bigint, text);
DROP FUNCTION IF EXISTS public.grn_is_auto_approvable(bigint);
DROP FUNCTION IF EXISTS public.grn_items_compute_variance();
DROP FUNCTION IF EXISTS public.override_grn_hardblock(bigint, text, text, text);
DROP FUNCTION IF EXISTS public.rotate_branch_override_code(bigint, text);
DROP FUNCTION IF EXISTS public.trg_grn_requires_review_outbox();
DROP FUNCTION IF EXISTS public.trg_upsert_grn_last_on_confirm();
DROP FUNCTION IF EXISTS public.try_auto_approve_grn(bigint);
DROP FUNCTION IF EXISTS public.weekly_grn_override_report();
DROP FUNCTION IF EXISTS public.create_expiry_writeoff(
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  text[]
);
DROP FUNCTION IF EXISTS public.create_purchase_order_with_lines(
  bigint,
  bigint,
  text,
  jsonb
);
DROP FUNCTION IF EXISTS public.commit_intra_branch_transfer(
  bigint,
  bigint,
  bigint,
  text,
  text,
  jsonb
);

DROP MATERIALIZED VIEW public.mv_food_cost;

ALTER TABLE public.grn_items
  DROP CONSTRAINT IF EXISTS grn_items_baseline_source_check,
  DROP CONSTRAINT IF EXISTS grn_items_quality_status_check,
  DROP CONSTRAINT IF EXISTS grn_items_received_quantity_check,
  DROP CONSTRAINT IF EXISTS grn_items_rejected_le_received,
  DROP CONSTRAINT IF EXISTS grn_items_short_delivery_action_check,
  DROP CONSTRAINT IF EXISTS grn_items_variance_tier_check,
  DROP COLUMN po_quantity,
  DROP COLUMN quality_status,
  DROP COLUMN expiry_date,
  DROP COLUMN batch_number,
  DROP COLUMN receiving_temperature,
  DROP COLUMN price_variance_pct,
  DROP COLUMN po_unit_price,
  DROP COLUMN price_override_note,
  DROP COLUMN price_override_photo_url,
  DROP COLUMN requires_review,
  DROP COLUMN short_delivery_action,
  DROP COLUMN variance_tier,
  DROP COLUMN baseline_source,
  DROP COLUMN baseline_sample_n,
  DROP COLUMN is_hard_blocked,
  DROP COLUMN baseline_variance_pct;

ALTER TABLE public.grn_items
  ALTER COLUMN unit_cost SET DEFAULT 0,
  ALTER COLUMN total_cost SET DEFAULT 0,
  ADD CONSTRAINT grn_items_received_quantity_check
    CHECK (
      received_quantity NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND received_quantity >= 0
    ),
  ADD CONSTRAINT grn_items_rejected_le_received
    CHECK (
      rejected_quantity NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND rejected_quantity >= 0
      AND rejected_quantity <= received_quantity
    ),
  ADD CONSTRAINT grn_items_unit_cost_nonnegative
    CHECK (
      unit_cost NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND unit_cost >= 0
    ),
  ADD CONSTRAINT grn_items_total_cost_nonnegative
    CHECK (
      total_cost NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND total_cost >= 0
    );

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_quantity_check,
  ADD CONSTRAINT purchase_order_items_quantity_check
    CHECK (
      quantity NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      AND quantity > 0
    ),
  ADD CONSTRAINT purchase_order_items_unit_price_finite
    CHECK (
      unit_price_est IS NULL
      OR (
        unit_price_est NOT IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
        AND unit_price_est >= 0
      )
    ),
  ADD CONSTRAINT purchase_order_items_line_total_finite
    CHECK (
      line_total IS NULL
      OR (
        line_total NOT IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
        AND line_total >= 0
      )
    );

UPDATE public.grn_items
SET total_cost = round(
  (received_quantity - rejected_quantity) * unit_cost,
  2
);

CREATE OR REPLACE FUNCTION private.set_grn_line_total_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.total_cost := pg_catalog.round(
    (NEW.received_quantity - NEW.rejected_quantity) * NEW.unit_cost,
    2
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_grn_line_total_cost()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER grn_items_set_total_cost
BEFORE INSERT OR UPDATE OF received_quantity, rejected_quantity, unit_cost
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION private.set_grn_line_total_cost();

CREATE OR REPLACE FUNCTION private.grn_physical_qc_is_valid(
  p_tenant_id bigint,
  p_grn_id bigint
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.tenant_id = p_tenant_id
      AND item.grn_id = p_grn_id
      AND (
        item.received_quantity IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
        OR item.rejected_quantity IN (
          'NaN'::numeric,
          'Infinity'::numeric,
          '-Infinity'::numeric
        )
        OR item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
        OR (
          item.rejected_quantity > 0
          AND (
            NULLIF(pg_catalog.btrim(item.rejection_reason), '') IS NULL
            OR NOT private.grn_rejection_photo_exists(
              item.tenant_id,
              item.grn_id,
              item.id,
              item.rejected_photo_url
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.grn_physical_qc_is_valid(bigint, bigint)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.any_grn_is_linked(
  p_tenant_id bigint,
  p_grn_ids bigint[]
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR p_tenant_id = public.auth_tenant_id()
  ) AND EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      WHERE grn.tenant_id = p_tenant_id
        AND grn.id = ANY (p_grn_ids)
        AND grn.po_id IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION private.any_grn_is_linked(bigint, bigint[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.any_grn_is_linked(bigint, bigint[])
  TO service_role;

CREATE OR REPLACE FUNCTION private.any_po_is_linked(
  p_tenant_id bigint,
  p_po_ids bigint[]
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (
    auth.role() = 'service_role'
    OR p_tenant_id = public.auth_tenant_id()
  ) AND EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      WHERE grn.tenant_id = p_tenant_id
        AND grn.po_id = ANY (p_po_ids)
    );
$$;

REVOKE ALL ON FUNCTION private.any_po_is_linked(bigint, bigint[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.any_po_is_linked(bigint, bigint[])
  TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.status = 'confirmed'
      AND grn.po_id IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_unlinked_confirmed_grn_preflight_failed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    LEFT JOIN public.purchase_orders AS purchase_order
      ON purchase_order.id = grn.po_id
    LEFT JOIN public.inventory_locations AS location
      ON location.id = grn.location_id
    WHERE grn.po_id IS NOT NULL
      AND (
        purchase_order.id IS NULL
        OR purchase_order.tenant_id <> grn.tenant_id
        OR purchase_order.branch_id <> grn.branch_id
        OR purchase_order.supplier_id <> grn.supplier_id
        OR grn.status NOT IN ('draft', 'confirmed')
        OR (
          grn.status = 'draft'
          AND purchase_order.status NOT IN ('draft', 'sent')
        )
        OR (
          grn.status = 'confirmed'
          AND purchase_order.status NOT IN (
            'partially_received',
            'received'
          )
        )
        OR location.id IS NULL
        OR location.tenant_id <> grn.tenant_id
        OR location.branch_id <> grn.branch_id
        OR location.location_kind <> 'warehouse'
        OR location.is_active IS DISTINCT FROM TRUE
      )
  ) THEN
    RAISE EXCEPTION 'inventory_linked_grn_identity_preflight_failed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH grn_snapshot AS (
      SELECT
        grn.id AS grn_id,
        item.ingredient_id,
        item.entry_unit_id,
        sum(
          item.received_quantity - item.rejected_quantity
        )::numeric(15,3) AS quantity
      FROM public.goods_received_notes AS grn
      JOIN public.grn_items AS item
        ON item.grn_id = grn.id
       AND item.tenant_id = grn.tenant_id
      WHERE grn.po_id IS NOT NULL
        AND grn.status = 'draft'
        AND item.received_quantity - item.rejected_quantity > 0
      GROUP BY grn.id, item.ingredient_id, item.entry_unit_id
    ),
    po_snapshot AS (
      SELECT
        grn.id AS grn_id,
        item.ingredient_id,
        item.entry_unit_id,
        sum(item.quantity)::numeric(15,3) AS quantity
      FROM public.goods_received_notes AS grn
      JOIN public.purchase_order_items AS item
        ON item.po_id = grn.po_id
       AND item.tenant_id = grn.tenant_id
      WHERE grn.po_id IS NOT NULL
        AND grn.status = 'draft'
      GROUP BY grn.id, item.ingredient_id, item.entry_unit_id
    )
    SELECT 1
    FROM grn_snapshot
    FULL JOIN po_snapshot
      ON po_snapshot.grn_id = grn_snapshot.grn_id
     AND po_snapshot.ingredient_id = grn_snapshot.ingredient_id
     AND po_snapshot.entry_unit_id IS NOT DISTINCT FROM
       grn_snapshot.entry_unit_id
    WHERE grn_snapshot.grn_id IS NULL
       OR po_snapshot.grn_id IS NULL
       OR grn_snapshot.quantity <> po_snapshot.quantity
  ) OR EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.po_id IS NOT NULL
      AND grn.status = 'draft'
      AND (
        NOT private.grn_physical_qc_is_valid(grn.tenant_id, grn.id)
        OR NOT EXISTS (
          SELECT 1
          FROM public.grn_items AS item
          WHERE item.tenant_id = grn.tenant_id
            AND item.grn_id = grn.id
            AND item.received_quantity - item.rejected_quantity > 0
        )
      )
  ) THEN
    RAISE EXCEPTION 'inventory_linked_grn_snapshot_preflight_failed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    JOIN public.purchase_orders AS purchase_order
      ON purchase_order.id = grn.po_id
     AND purchase_order.tenant_id = grn.tenant_id
    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = grn.tenant_id
    WHERE grn.po_id IS NOT NULL
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
      AND (
        (
          purchase_order.status = 'draft'
          AND (
            grn_item.unit_cost <> 0
            OR grn_item.total_cost <> 0
          )
        )
        OR (
          purchase_order.status <> 'draft'
          AND NOT EXISTS (
            SELECT 1
            FROM public.purchase_order_items AS po_item
            WHERE po_item.tenant_id = grn.tenant_id
              AND po_item.po_id = grn.po_id
              AND po_item.ingredient_id = grn_item.ingredient_id
              AND po_item.entry_unit_id IS NOT DISTINCT FROM
                grn_item.entry_unit_id
              AND po_item.unit_price_est > 0
              AND po_item.unit_price_est = grn_item.unit_cost
              AND grn_item.total_cost = pg_catalog.round(
                (
                  grn_item.received_quantity
                  - grn_item.rejected_quantity
                ) * po_item.unit_price_est,
                2
              )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'inventory_linked_grn_cost_preflight_failed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.po_id IS NOT NULL
      AND grn.status = 'draft'
    GROUP BY grn.tenant_id, grn.po_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'inventory_multiple_linked_drafts_preflight_failed'
      USING ERRCODE = 'unique_violation';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.uq_grn_active_po_draft_per_user_po;

CREATE UNIQUE INDEX goods_received_notes_one_draft_per_po_idx
ON public.goods_received_notes (tenant_id, po_id)
WHERE po_id IS NOT NULL
  AND status = 'draft';

CREATE OR REPLACE FUNCTION private.enforce_retrospective_grn_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_po record;
  v_trusted_rpc boolean;
  v_recovery_insert boolean :=
    COALESCE(
      pg_catalog.current_setting(
        'comtammatu.grn_recovery_insert',
        TRUE
      ),
      'false'
    ) = 'true';
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.goods_received_notes'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'grn_must_start_as_draft'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.po_id IS NOT NULL
       AND (
         v_trusted_rpc IS DISTINCT FROM TRUE
         OR auth.role() IS DISTINCT FROM 'service_role'
         OR NOT v_recovery_insert
       ) THEN
      RAISE EXCEPTION 'linked_grn_must_start_as_unlinked_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-grn:' || OLD.id::text,
      0
    )
  );

  IF TG_OP = 'DELETE' THEN
    IF OLD.po_id IS NOT NULL THEN
      RAISE EXCEPTION 'linked_grn_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.po_id IS NOT NULL THEN
    IF v_trusted_rpc IS TRUE
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
       AND NEW.po_id IS NOT DISTINCT FROM OLD.po_id
       AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
       AND NEW.grn_number IS NOT DISTINCT FROM OLD.grn_number
       AND NEW.received_date IS NOT DISTINCT FROM OLD.received_date
       AND NEW.received_by IS NOT DISTINCT FROM OLD.received_by
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND OLD.status = 'draft'
       AND NEW.status = 'confirmed' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'linked_grn_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.po_id IS NULL THEN
    IF OLD.status IS DISTINCT FROM 'confirmed'
       AND NEW.status = 'confirmed' THEN
      RAISE EXCEPTION 'grn_confirm_requires_approved_po'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'grn_po_link_requires_rpc'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || NEW.po_id::text,
      0
    )
  );

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = NEW.po_id;

  IF NOT FOUND
     OR v_po.tenant_id <> NEW.tenant_id
     OR v_po.branch_id <> NEW.branch_id
     OR v_po.supplier_id <> NEW.supplier_id
     OR v_po.status <> 'draft'
     OR NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_po_link_invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = NEW.location_id
      AND location.tenant_id = NEW.tenant_id
      AND location.branch_id = NEW.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'grn_receiving_warehouse_required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT private.grn_physical_qc_is_valid(NEW.tenant_id, NEW.id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.tenant_id = NEW.tenant_id
         AND item.grn_id = NEW.id
         AND item.received_quantity - item.rejected_quantity > 0
     ) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH grn_snapshot AS (
      SELECT
        item.ingredient_id,
        item.entry_unit_id,
        sum(
          item.received_quantity - item.rejected_quantity
        )::numeric(15,3) AS quantity
      FROM public.grn_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.grn_id = NEW.id
        AND item.received_quantity - item.rejected_quantity > 0
      GROUP BY item.ingredient_id, item.entry_unit_id
    ),
    po_snapshot AS (
      SELECT
        item.ingredient_id,
        item.entry_unit_id,
        sum(item.quantity)::numeric(15,3) AS quantity
      FROM public.purchase_order_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.po_id = NEW.po_id
      GROUP BY item.ingredient_id, item.entry_unit_id
    )
    SELECT 1
    FROM grn_snapshot
    FULL JOIN po_snapshot
      ON po_snapshot.ingredient_id = grn_snapshot.ingredient_id
     AND po_snapshot.entry_unit_id IS NOT DISTINCT FROM
       grn_snapshot.entry_unit_id
    WHERE grn_snapshot.ingredient_id IS NULL
       OR po_snapshot.ingredient_id IS NULL
       OR grn_snapshot.quantity <> po_snapshot.quantity
  ) THEN
    RAISE EXCEPTION 'grn_po_snapshot_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_retrospective_grn_immutability()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_grn_retrospective_immutability
BEFORE INSERT OR UPDATE OR DELETE
ON public.goods_received_notes
FOR EACH ROW
EXECUTE FUNCTION private.enforce_retrospective_grn_immutability();

CREATE OR REPLACE FUNCTION
private.enforce_retrospective_purchase_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_linked boolean := FALSE;
  v_trusted_rpc boolean;
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.purchase_orders'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'purchase_order_insert_requires_rpc'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'purchase_order_must_start_as_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || OLD.id::text,
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = OLD.tenant_id
      AND grn.po_id = OLD.id
  )
  INTO v_linked;

  IF TG_OP = 'DELETE' THEN
    IF v_linked THEN
      RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_linked THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'purchase_order_status_requires_rpc'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF OLD.status <> 'draft' OR NEW.status <> 'sent' THEN
        RAISE EXCEPTION 'purchase_order_status_transition_invalid'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.po_number IS NOT DISTINCT FROM OLD.po_number
     AND NEW.ordered_at IS NOT DISTINCT FROM OLD.ordered_at
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.display_id IS NOT DISTINCT FROM OLD.display_id
     AND (
       (
         OLD.status = 'draft'
         AND NEW.status = 'sent'
       )
       OR (
         OLD.status IN ('sent', 'partially_received', 'received')
         AND NEW.status IN ('partially_received', 'received')
       )
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION
private.enforce_retrospective_purchase_order_immutability()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_po_retrospective_immutability
BEFORE INSERT OR UPDATE OR DELETE
ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION
  private.enforce_retrospective_purchase_order_immutability();

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_grn_id bigint;
  v_grn_ids bigint[];
  v_old_tenant_id bigint;
  v_new_tenant_id bigint;
  v_linked boolean := FALSE;
  v_grn_status text;
  v_trusted_rpc boolean;
  v_recovery_insert boolean :=
    COALESCE(
      pg_catalog.current_setting(
        'comtammatu.grn_recovery_insert',
        TRUE
      ),
      'false'
    ) = 'true';
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.grn_items'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    v_grn_ids := ARRAY[NEW.grn_id];
    v_new_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_grn_ids := ARRAY[OLD.grn_id];
    v_old_tenant_id := OLD.tenant_id;
  ELSE
    v_grn_ids := ARRAY[OLD.grn_id, NEW.grn_id];
    v_old_tenant_id := OLD.tenant_id;
    v_new_tenant_id := NEW.tenant_id;
  END IF;

  FOR v_grn_id IN
    SELECT DISTINCT candidate.grn_id
    FROM unnest(v_grn_ids) AS candidate(grn_id)
    WHERE candidate.grn_id IS NOT NULL
    ORDER BY candidate.grn_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'retrospective-grn:' || v_grn_id::text,
        0
      )
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.id = ANY (v_grn_ids)
      AND grn.po_id IS NOT NULL
      AND (
        grn.tenant_id = v_old_tenant_id
        OR grn.tenant_id = v_new_tenant_id
      )
  )
  INTO v_linked;

  IF NOT v_linked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND v_trusted_rpc IS TRUE
     AND auth.role() = 'service_role'
     AND v_recovery_insert THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.grn_id IS NOT DISTINCT FROM OLD.grn_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.received_quantity IS NOT DISTINCT FROM OLD.received_quantity
     AND NEW.rejected_quantity IS NOT DISTINCT FROM OLD.rejected_quantity
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason
     AND NEW.rejected_photo_url IS NOT DISTINCT FROM OLD.rejected_photo_url
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      JOIN public.purchase_orders AS purchase_order
        ON purchase_order.id = grn.po_id
       AND purchase_order.tenant_id = grn.tenant_id
      JOIN public.purchase_order_items AS po_item
        ON po_item.po_id = purchase_order.id
       AND po_item.tenant_id = purchase_order.tenant_id
       AND po_item.ingredient_id = NEW.ingredient_id
       AND po_item.entry_unit_id IS NOT DISTINCT FROM
         NEW.entry_unit_id
      WHERE grn.id = NEW.grn_id
        AND grn.tenant_id = NEW.tenant_id
        AND purchase_order.status = 'draft'
        AND po_item.unit_price_est > 0
        AND NEW.unit_cost = po_item.unit_price_est
        AND NEW.total_cost = pg_catalog.round(
          (
            NEW.received_quantity - NEW.rejected_quantity
          ) * po_item.unit_price_est,
          2
        )
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.grn_id IS NOT DISTINCT FROM OLD.grn_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.unit_cost IS NOT DISTINCT FROM OLD.unit_cost
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id
     AND NEW.received_quantity >= 0
     AND NEW.received_quantity NOT IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     AND NEW.rejected_quantity >= 0
     AND NEW.rejected_quantity NOT IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     AND NEW.rejected_quantity <= NEW.received_quantity
     AND (
       NEW.rejected_quantity = 0
       OR (
         NULLIF(pg_catalog.btrim(NEW.rejection_reason), '') IS NOT NULL
         AND private.grn_rejection_photo_exists(
           NEW.tenant_id,
           NEW.grn_id,
           NEW.id,
           NEW.rejected_photo_url
         )
       )
     )
     AND NEW.total_cost = pg_catalog.round(
       (
         NEW.received_quantity - NEW.rejected_quantity
       ) * NEW.unit_cost,
       2
     ) THEN
    SELECT grn.status
    INTO v_grn_status
    FROM public.goods_received_notes AS grn
    WHERE grn.id = NEW.grn_id
      AND grn.tenant_id = NEW.tenant_id
      AND grn.po_id IS NOT NULL;

    IF v_grn_status = 'confirmed' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'linked_grn_lines_immutable'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_linked_grn_line_immutability()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_grn_items_linked_immutability
BEFORE INSERT OR UPDATE OR DELETE
ON public.grn_items
FOR EACH ROW
EXECUTE FUNCTION private.enforce_linked_grn_line_immutability();

CREATE OR REPLACE FUNCTION
private.enforce_retrospective_purchase_order_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_po_id bigint;
  v_po_ids bigint[];
  v_old_tenant_id bigint;
  v_new_tenant_id bigint;
  v_po_status text;
  v_linked boolean := FALSE;
  v_trusted_rpc boolean;
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    'public.purchase_order_items'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    v_po_ids := ARRAY[NEW.po_id];
    v_new_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_po_ids := ARRAY[OLD.po_id];
    v_old_tenant_id := OLD.tenant_id;
  ELSE
    v_po_ids := ARRAY[OLD.po_id, NEW.po_id];
    v_old_tenant_id := OLD.tenant_id;
    v_new_tenant_id := NEW.tenant_id;
  END IF;

  IF TG_OP = 'INSERT'
     AND v_trusted_rpc IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'purchase_order_line_insert_requires_rpc'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_po_id IN
    SELECT DISTINCT candidate.po_id
    FROM unnest(v_po_ids) AS candidate(po_id)
    WHERE candidate.po_id IS NOT NULL
    ORDER BY candidate.po_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'retrospective-po:' || v_po_id::text,
        0
      )
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.po_id = ANY (v_po_ids)
      AND (
        grn.tenant_id = v_old_tenant_id
        OR grn.tenant_id = v_new_tenant_id
      )
  )
  INTO v_linked;

  IF NOT v_linked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.po_id IS NOT DISTINCT FROM OLD.po_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id THEN
    SELECT purchase_order.status
    INTO v_po_status
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = NEW.po_id;

    IF v_po_status = 'draft' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'linked_grn_purchase_order_lines_immutable'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION
private.enforce_retrospective_purchase_order_line_immutability()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_po_items_retrospective_immutability
BEFORE INSERT OR UPDATE OR DELETE
ON public.purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION
  private.enforce_retrospective_purchase_order_line_immutability();

CREATE OR REPLACE FUNCTION private.validate_grn_physical_qc_before_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'confirmed'
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM 'confirmed'
     ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.grn_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.grn_id = NEW.id
        AND (
          item.received_quantity IN (
            'NaN'::numeric,
            'Infinity'::numeric,
            '-Infinity'::numeric
          )
          OR item.rejected_quantity IN (
            'NaN'::numeric,
            'Infinity'::numeric,
            '-Infinity'::numeric
          )
          OR item.rejected_quantity < 0
          OR item.rejected_quantity > item.received_quantity
          OR (
            item.rejected_quantity > 0
            AND (
              NULLIF(btrim(item.rejection_reason), '') IS NULL
              OR NOT private.grn_rejection_photo_exists(
                item.tenant_id,
                item.grn_id,
                item.id,
                item.rejected_photo_url
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'grn_rejection_evidence_required'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_grn_physical_qc_before_confirm()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_grn_validate_physical_qc_before_confirm
BEFORE INSERT OR UPDATE
ON public.goods_received_notes
FOR EACH ROW
EXECUTE FUNCTION private.validate_grn_physical_qc_before_confirm();

REVOKE INSERT, UPDATE ON public.grn_items
  FROM PUBLIC, anon, authenticated;
GRANT INSERT (
  tenant_id,
  grn_id,
  ingredient_id,
  received_quantity,
  rejected_quantity,
  rejection_reason,
  rejected_photo_url,
  entry_unit_id
) ON public.grn_items TO authenticated;
GRANT UPDATE (
  tenant_id,
  grn_id,
  ingredient_id,
  received_quantity,
  rejected_quantity,
  rejection_reason,
  rejected_photo_url,
  entry_unit_id
) ON public.grn_items TO authenticated;

REVOKE SELECT ON public.grn_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  tenant_id,
  grn_id,
  ingredient_id,
  received_quantity,
  rejected_quantity,
  rejection_reason,
  rejected_photo_url,
  entry_unit_id
) ON public.grn_items TO authenticated;

-- Expiry write-off belongs to the waste workflow. An optional GRN item
-- contributes lineage and its entry unit, not receiving-only lot metadata.
CREATE FUNCTION public.create_expiry_writeoff(
  p_branch_id bigint,
  p_location_id bigint,
  p_ingredient_id bigint,
  p_quantity numeric,
  p_grn_item_id bigint DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_photo_urls text[] DEFAULT ARRAY[]::text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location record;
  v_grn_line record;
  v_shift_key text;
  v_issue_id bigint;
  v_issue_number text;
  v_approval_status text;
  v_seed_cost numeric(15,2);
  v_source_ref jsonb := jsonb_build_object('kind', 'expiry');
  v_entry_unit_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:writeoff'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL
     OR p_quantity <= 0
     OR p_quantity = 'NaN'::numeric
     OR p_quantity = 'Infinity'::numeric
     OR p_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'quantity must be positive'
      USING ERRCODE = '22023';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT
    location.id,
    location.tenant_id,
    location.branch_id,
    location.is_active,
    location.location_kind
  INTO v_location
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
  FOR UPDATE OF location;

  IF NOT FOUND
     OR v_location.is_active IS DISTINCT FROM TRUE
     OR v_location.tenant_id <> v_tenant
     OR v_location.branch_id <> p_branch_id
     OR v_location.location_kind <> 'warehouse' THEN
    RAISE EXCEPTION 'location_scope_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF p_grn_item_id IS NOT NULL THEN
    SELECT
      item.id,
      item.grn_id,
      item.entry_unit_id
    INTO v_grn_line
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    WHERE item.id = p_grn_item_id
      AND item.tenant_id = v_tenant
      AND item.ingredient_id = p_ingredient_id
      AND grn.branch_id = p_branch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'grn_item_not_found'
        USING ERRCODE = '22023';
    END IF;

    v_entry_unit_id := v_grn_line.entry_unit_id;
    v_source_ref := v_source_ref || jsonb_build_object(
      'grn_item_id',
      v_grn_line.id,
      'grn_id',
      v_grn_line.grn_id
    );
  END IF;

  IF v_entry_unit_id IS NULL THEN
    SELECT ingredient_unit.unit_id
    INTO v_entry_unit_id
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = p_ingredient_id
      AND ingredient_unit.is_base IS TRUE
      AND ingredient_unit.is_active IS TRUE
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1;
  END IF;

  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_required'
      USING ERRCODE = '22023';
  END IF;

  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_number := public.next_inventory_doc_number(
    v_tenant,
    'waste'
  );

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    notes,
    issued_at,
    created_by,
    source_location_id,
    approval_status,
    shift_key,
    source_type,
    source_ref
  )
  VALUES (
    v_tenant,
    p_branch_id,
    v_issue_number,
    'writeoff',
    'draft',
    p_note,
    now(),
    v_uid,
    p_location_id,
    'not_required',
    v_shift_key,
    'manual',
    v_source_ref
  )
  RETURNING id INTO v_issue_id;

  SELECT stock.avg_unit_cost
  INTO v_seed_cost
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND stock.location_id = p_location_id
    AND stock.ingredient_id = p_ingredient_id;

  INSERT INTO public.stock_issue_items (
    tenant_id,
    issue_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    unit_cost,
    reason_code,
    photo_urls,
    reason
  )
  VALUES (
    v_tenant,
    v_issue_id,
    p_ingredient_id,
    p_quantity,
    v_entry_unit_id,
    coalesce(v_seed_cost, 0),
    'expired',
    coalesce(p_photo_urls, ARRAY[]::text[]),
    p_note
  );

  SELECT issue.approval_status
  INTO v_approval_status
  FROM public.stock_issues AS issue
  WHERE issue.id = v_issue_id
    AND issue.tenant_id = v_tenant;

  IF v_approval_status = 'not_required' THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;

  RETURN jsonb_build_object(
    'issue_id',
    v_issue_id,
    'issue_number',
    v_issue_number,
    'requires_approval',
    v_approval_status = 'pending',
    'stock_decremented',
    v_approval_status = 'not_required'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_expiry_writeoff(
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expiry_writeoff(
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  text[]
) TO authenticated, service_role;

CREATE MATERIALIZED VIEW public.mv_food_cost AS
WITH latest_grn_cost AS (
  SELECT DISTINCT ON (item.ingredient_id, item.tenant_id)
    item.ingredient_id,
    item.tenant_id,
    item.unit_cost
  FROM public.grn_items AS item
  JOIN public.goods_received_notes AS grn
    ON grn.id = item.grn_id
  WHERE grn.status = 'confirmed'
    AND item.received_quantity - item.rejected_quantity > 0
  ORDER BY
    item.ingredient_id,
    item.tenant_id,
    grn.received_date DESC NULLS LAST
),
recipe_cost AS (
  SELECT
    recipe.menu_item_id,
    recipe.tenant_id,
    sum(
      recipe.quantity
      * COALESCE(latest.unit_cost, ingredient.unit_cost, 0)
    ) AS cost_per_unit
  FROM public.recipes AS recipe
  JOIN public.ingredients AS ingredient
    ON ingredient.id = recipe.ingredient_id
  LEFT JOIN latest_grn_cost AS latest
    ON latest.ingredient_id = recipe.ingredient_id
   AND latest.tenant_id = recipe.tenant_id
  GROUP BY recipe.menu_item_id, recipe.tenant_id
)
SELECT
  date_trunc('week', orders.created_at)::date AS period_start,
  (date_trunc('week', orders.created_at) + interval '6 days')::date
    AS period_end,
  orders.branch_id,
  orders.tenant_id,
  order_item.menu_item_id,
  max(order_item.item_name) AS item_name,
  sum(order_item.quantity) AS quantity_sold,
  sum(order_item.subtotal) AS revenue,
  sum(
    order_item.quantity::numeric
    * COALESCE(recipe_cost.cost_per_unit, 0)
  ) AS ingredient_cost,
  CASE
    WHEN sum(order_item.subtotal) > 0 THEN round(
      sum(
        order_item.quantity::numeric
        * COALESCE(recipe_cost.cost_per_unit, 0)
      ) / sum(order_item.subtotal) * 100,
      2
    )
    ELSE 0
  END AS food_cost_pct
FROM public.order_items AS order_item
JOIN public.orders AS orders
  ON orders.id = order_item.order_id
LEFT JOIN recipe_cost
  ON recipe_cost.menu_item_id = order_item.menu_item_id
 AND recipe_cost.tenant_id = order_item.tenant_id
WHERE orders.status <> 'cancelled'
  AND order_item.status <> 'cancelled'
GROUP BY
  date_trunc('week', orders.created_at)::date,
  (date_trunc('week', orders.created_at) + interval '6 days')::date,
  orders.branch_id,
  orders.tenant_id,
  order_item.menu_item_id;

CREATE UNIQUE INDEX idx_mv_food_cost_pk
ON public.mv_food_cost (
  period_start,
  branch_id,
  tenant_id,
  menu_item_id
);

REVOKE ALL ON public.mv_food_cost FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mv_food_cost TO service_role;

ALTER TABLE public.goods_received_notes
  DROP COLUMN express_approved;
ALTER TABLE public.ingredients
  DROP COLUMN review_override;

DROP POLICY IF EXISTS grn_evidence_no_delete ON storage.objects;
DROP POLICY IF EXISTS grn_evidence_read ON storage.objects;
DROP POLICY IF EXISTS grn_evidence_upload ON storage.objects;
SELECT pg_catalog.set_config(
  'storage.allow_delete_query',
  'true',
  TRUE
);
DELETE FROM storage.buckets
WHERE id = 'grn-evidence';
SELECT pg_catalog.set_config(
  'storage.allow_delete_query',
  'false',
  TRUE
);

DROP POLICY IF EXISTS inv_attach_insert ON storage.objects;
CREATE POLICY inv_attach_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND (
    (
      (storage.foldername(storage.objects.name))[2] = 'grn'
      AND (storage.foldername(storage.objects.name))[4] = 'rejected'
      AND pg_catalog.array_length(
        storage.foldername(storage.objects.name),
        1
      ) = 5
      AND COALESCE(
        (storage.foldername(storage.objects.name))[5],
        ''
      ) ~ '^[1-9][0-9]*$'
      AND storage.objects.name ~*
        '\.(jpe?g|png|webp|heic)$'
      AND pg_catalog.lower(
        COALESCE(storage.objects.metadata ->> 'mimetype', '')
      ) IN (
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic'
      )
      AND EXISTS (
        SELECT 1
        FROM public.goods_received_notes AS grn
        JOIN public.grn_items AS grn_item
         ON grn_item.grn_id = grn.id
         AND grn_item.tenant_id = grn.tenant_id
         AND grn_item.id = CASE
           WHEN COALESCE(
             (storage.foldername(storage.objects.name))[5],
             ''
           ) ~ '^[1-9][0-9]*$'
             THEN (
               storage.foldername(storage.objects.name)
             )[5]::bigint
         END
        WHERE grn.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (
                storage.foldername(storage.objects.name)
              )[3]::bigint
          END
          AND grn.tenant_id = (
            SELECT public.auth_tenant_id()
          )
          AND (
            (
              grn.status = 'draft'
              AND grn.po_id IS NULL
              AND public.has_permission(
                grn.branch_id,
                'procurement:grn_create'
              )
            )
            OR (
              grn.status = 'confirmed'
              AND grn.po_id IS NOT NULL
              AND public.has_permission(
                grn.branch_id,
                'procurement:grn_amend'
              )
            )
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] =
        'supplier-return-line'
      AND EXISTS (
        SELECT 1
        FROM public.supplier_return_items AS return_item
        JOIN public.supplier_returns AS supplier_return
          ON supplier_return.id = return_item.return_id
         AND supplier_return.tenant_id = return_item.tenant_id
        WHERE return_item.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (
                storage.foldername(storage.objects.name)
              )[3]::bigint
          END
          AND return_item.tenant_id = (
            SELECT public.auth_tenant_id()
          )
          AND supplier_return.status = 'draft'
          AND public.has_permission(
            supplier_return.branch_id,
            'supplier_return:create'
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] =
        'stock-issues'
      AND EXISTS (
        SELECT 1
        FROM public.stock_issues AS issue
        WHERE issue.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (
                storage.foldername(storage.objects.name)
              )[3]::bigint
          END
          AND issue.tenant_id = (
            SELECT public.auth_tenant_id()
          )
          AND issue.status = 'draft'
          AND issue.issue_type = 'consumption'
          AND public.has_permission(
            issue.branch_id,
            'inventory:write'
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'branches'
      AND (storage.foldername(storage.objects.name))[4] = 'waste'
      AND EXISTS (
        SELECT 1
        FROM public.branches AS branch
        WHERE branch.id = CASE
            WHEN COALESCE(
              (storage.foldername(storage.objects.name))[3],
              ''
            ) ~ '^[1-9][0-9]*$'
              THEN (
                storage.foldername(storage.objects.name)
              )[3]::bigint
          END
          AND branch.tenant_id = (
            SELECT public.auth_tenant_id()
          )
          AND branch.is_active IS TRUE
          AND public.has_permission(
            branch.id,
            'inventory:writeoff'
          )
      )
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'waste'
      AND public.auth_role() = 'owner'
    )
    OR (
      (storage.foldername(storage.objects.name))[2] = 'expenses'
      AND public.has_permission_any('finance:expense_create')
    )
  )
);

DROP POLICY IF EXISTS inv_attach_delete ON storage.objects;
CREATE POLICY inv_attach_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND NOT (
    (storage.foldername(storage.objects.name))[2] = 'grn'
    AND (storage.foldername(storage.objects.name))[4] = 'rejected'
  )
);

DROP POLICY IF EXISTS inv_attach_update ON storage.objects;
CREATE POLICY inv_attach_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND NOT (
    (storage.foldername(storage.objects.name))[2] = 'grn'
    AND (storage.foldername(storage.objects.name))[4] = 'rejected'
  )
)
WITH CHECK (
  bucket_id = 'inventory-attachments'
  AND (storage.foldername(storage.objects.name))[1] = (
    SELECT public.auth_tenant_id()::text
  )
  AND NOT (
    (storage.foldername(storage.objects.name))[2] = 'grn'
    AND (storage.foldername(storage.objects.name))[4] = 'rejected'
  )
);

DROP TABLE public.branch_express_window;
DROP TABLE public.branch_override_attempts;
DROP TABLE public.branch_override_codes;
DROP TABLE public.grn_baseline_pause;
DROP TABLE public.grn_express_extend_audit;
DROP TABLE public.grn_hardblock_overrides;
DROP TABLE public.ingredient_category_review_policy;
DROP TABLE public.inventory_qc_settings;
DROP TABLE public.user_trust_score;

DELETE FROM public.notification_outbox
WHERE channel = 'inventory'
  AND topic = 'grn.requires_review';

DELETE FROM public.notifications
WHERE kind = 'inventory.grn.weekly_override_report';

WITH retired(permission_key) AS (
  VALUES
    ('inventory:grn_express_configure'::text),
    ('inventory:grn_express_extend'::text),
    ('inventory:grn_hardblock_override'::text),
    ('inventory:catalog_review_policy_set'::text),
    ('inventory:item_review_override_set'::text),
    ('procurement:override_code_rotate'::text)
)
UPDATE public.role_templates AS template
SET permission_keys = ARRAY(
      SELECT permission_key
      FROM unnest(template.permission_keys) AS permission_key
      WHERE permission_key NOT IN (
        SELECT retired.permission_key
        FROM retired
      )
      ORDER BY permission_key
    ),
    updated_at = now()
WHERE template.permission_keys && ARRAY(
  SELECT retired.permission_key
  FROM retired
);

DELETE FROM public.staff_permissions
WHERE permission_key IN (
  'inventory:grn_express_configure',
  'inventory:grn_express_extend',
  'inventory:grn_hardblock_override',
  'inventory:catalog_review_policy_set',
  'inventory:item_review_override_set',
  'procurement:override_code_rotate'
);

DELETE FROM public.permission_keys
WHERE key IN (
  'inventory:grn_express_configure',
  'inventory:grn_express_extend',
  'inventory:grn_hardblock_override',
  'inventory:catalog_review_policy_set',
  'inventory:item_review_override_set',
  'procurement:override_code_rotate'
);

CREATE OR REPLACE FUNCTION public.approve_purchase_order(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_po record;
  v_synced_lines integer := 0;
  v_missing_price integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_purchase_order: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT
    purchase_order.id,
    purchase_order.branch_id,
    purchase_order.po_number,
    purchase_order.status
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_purchase_order: PO not found in tenant scope'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.has_permission(
    v_po.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: forbidden'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'approve_purchase_order: invalid status transition'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM grn.id
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant_id
    AND grn.po_id = v_po.id
    AND grn.status = 'draft'
  FOR UPDATE OF grn;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'approve_purchase_order: linked draft GRN required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer
  INTO v_missing_price
  FROM public.purchase_order_items AS item
  WHERE item.tenant_id = v_tenant_id
    AND item.po_id = v_po.id
    AND (
      item.quantity <= 0
      OR item.unit_price_est IS NULL
      OR item.unit_price_est <= 0
    );

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_tenant_id
      AND item.po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_missing_price > 0 THEN
    RAISE EXCEPTION 'approve_purchase_order: positive price required'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_order_items
  SET line_total = round(quantity * unit_price_est, 2)
  WHERE tenant_id = v_tenant_id
    AND po_id = v_po.id;

  WITH linked_grn AS (
    SELECT grn.id AS grn_id
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant_id
      AND grn.po_id = v_po.id
      AND grn.status = 'draft'
  ),
  synced AS (
    UPDATE public.grn_items AS grn_item
    SET unit_cost = po_item.unit_price_est,
        total_cost = round(
          (
            grn_item.received_quantity
            - grn_item.rejected_quantity
          ) * po_item.unit_price_est,
          2
        )
    FROM linked_grn, public.purchase_order_items AS po_item
    WHERE grn_item.tenant_id = v_tenant_id
      AND grn_item.grn_id = linked_grn.grn_id
      AND po_item.tenant_id = v_tenant_id
      AND po_item.po_id = v_po.id
      AND po_item.ingredient_id = grn_item.ingredient_id
      AND po_item.entry_unit_id IS NOT DISTINCT FROM
        grn_item.entry_unit_id
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
    RETURNING grn_item.id
  )
  SELECT count(*)::integer
  INTO v_synced_lines
  FROM synced;

  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = grn.tenant_id
    WHERE grn.tenant_id = v_tenant_id
      AND grn.po_id = v_po.id
      AND grn.status = 'draft'
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_order_items AS po_item
        WHERE po_item.tenant_id = v_tenant_id
          AND po_item.po_id = v_po.id
          AND po_item.ingredient_id = grn_item.ingredient_id
          AND po_item.entry_unit_id IS NOT DISTINCT FROM
            grn_item.entry_unit_id
      )
  ) THEN
    RAISE EXCEPTION 'approve_purchase_order: GRN line missing from PO'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'sent',
      updated_at = now()
  WHERE id = v_po.id
    AND tenant_id = v_tenant_id;

  PERFORM public.log_audit(
    'inventory.po.approved',
    'purchase_order',
    v_po.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'sent',
      'branch_id', v_po.branch_id,
      'po_number', v_po.po_number,
      'grn_unit_cost_synced_lines', v_synced_lines
    )
  );

  RETURN jsonb_build_object(
    'id', v_po.id,
    'status', 'sent',
    'grn_unit_cost_synced_lines', v_synced_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_order(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_grn(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_po_id bigint;
  v_location_id bigint;
  v_display text;
  v_line_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_grn.po_id IS NOT NULL THEN
    RAISE EXCEPTION 'grn_already_linked_to_po'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_receivable_lines'
      USING ERRCODE = '22023';
  END IF;
  IF NOT private.grn_physical_qc_is_valid(v_tenant, p_grn_id) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_grn.branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_receiving_warehouse_required'
      USING ERRCODE = 'check_violation';
  END IF;

  v_display := public.next_po_display_id(v_tenant);

  INSERT INTO public.purchase_orders (
    tenant_id,
    branch_id,
    supplier_id,
    po_number,
    display_id,
    status,
    notes,
    created_by
  )
  VALUES (
    v_tenant,
    v_grn.branch_id,
    v_grn.supplier_id,
    v_display,
    v_display,
    'draft',
    NULLIF(btrim(v_grn.notes), ''),
    v_uid
  )
  RETURNING id INTO v_po_id;

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
    v_tenant,
    v_po_id,
    item.ingredient_id,
    (
      item.received_quantity - item.rejected_quantity
    )::numeric(15,3),
    item.entry_unit_id,
    NULL::numeric,
    NULL::numeric
  FROM public.grn_items AS item
  WHERE item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant
    AND item.received_quantity - item.rejected_quantity > 0;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  UPDATE public.goods_received_notes
  SET po_id = v_po_id,
      location_id = v_location_id,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.po.created_from_grn_draft',
    'purchase_order',
    v_po_id,
    NULL,
    jsonb_build_object(
      'grn_id', p_grn_id,
      'lines', v_line_count,
      'branch_id', v_grn.branch_id
    )
  );

  RETURN jsonb_build_object(
    'po_id', v_po_id,
    'display_id', v_display,
    'grn_id', p_grn_id,
    'line_count', v_line_count,
    'status', 'draft'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order_from_grn(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_grn(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices_protected(
  p_po_id bigint,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary(
    'procurement:price_list_read'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM purchase_order.id
  FROM public.purchase_orders AS purchase_order
  JOIN public.goods_received_notes AS grn
    ON grn.po_id = purchase_order.id
   AND grn.tenant_id = purchase_order.tenant_id
   AND grn.status = 'draft'
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
    AND purchase_order.status = 'draft'
  FOR UPDATE OF purchase_order, grn;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_linked_to_draft_grn'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN public.update_purchase_order_prices(p_po_id, p_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_order_prices_protected(
  bigint,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_prices_protected(
  bigint,
  jsonb
) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.purchase_orders
FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.purchase_order_items
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.purchase_orders_id_seq
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.purchase_order_items_id_seq
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_item record;
  v_old_q numeric(15,3);
  v_old_wac numeric(15,2);
  v_recv numeric(15,3);
  v_recv_base numeric(15,3);
  v_cost numeric(15,2);
  v_money numeric(15,2);
  v_cost_base numeric(15,2);
  v_new_q numeric(15,3);
  v_new_wac numeric(15,2);
  v_location_id bigint;
  v_all_fulfilled boolean;
  v_po_status text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_grn.branch_id,
    'procurement:grn_confirm'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_grn.branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'grn_branch_must_be_operational'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE
      AND location.is_default_issue IS TRUE
      AND location.is_default_consumption IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_warehouse_location_missing'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_grn.po_id IS NULL THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT purchase_order.status
  INTO v_po_status
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = v_grn.po_id
    AND purchase_order.tenant_id = v_tenant
    AND purchase_order.branch_id = v_grn.branch_id
    AND purchase_order.supplier_id = v_grn.supplier_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_po_status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'grn_confirm_requires_approved_po'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND (
        item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
      )
  ) THEN
    RAISE EXCEPTION 'rejected_exceeds_received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.rejected_quantity > 0
      AND NULLIF(btrim(item.rejection_reason), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_qc_reason_required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.rejected_quantity > 0
      AND NOT private.grn_rejection_photo_exists(
        item.tenant_id,
        item.grn_id,
        item.id,
        item.rejected_photo_url
      )
  ) THEN
    RAISE EXCEPTION 'grn_qc_photo_required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
      AND (
        item.unit_cost <= 0
        OR NOT EXISTS (
          SELECT 1
          FROM public.purchase_order_items AS po_item
          WHERE po_item.tenant_id = v_tenant
            AND po_item.po_id = v_grn.po_id
            AND po_item.ingredient_id = item.ingredient_id
            AND po_item.entry_unit_id IS NOT DISTINCT FROM
              item.entry_unit_id
            AND po_item.unit_price_est > 0
            AND po_item.unit_price_est = item.unit_cost
        )
      )
  ) THEN
    RAISE EXCEPTION 'grn_approved_po_price_missing_or_stale'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_item IN
    SELECT item.*
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
    ORDER BY item.id
    FOR UPDATE
  LOOP
    v_recv := v_item.received_quantity - v_item.rejected_quantity;
    v_recv_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_recv
    );
    v_cost := v_item.unit_cost;
    v_money := round(v_recv * v_cost, 2);
    v_cost_base := CASE
      WHEN v_recv_base <> 0 THEN round(v_money / v_recv_base, 2)
      ELSE v_cost
    END;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      grn_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_grn.branch_id,
      v_item.ingredient_id,
      'grn_receipt',
      v_recv_base,
      'GRN ' || v_grn.grn_number,
      v_uid,
      p_grn_id,
      v_cost_base,
      v_location_id,
      v_item.entry_unit_id,
      v_recv
    );

    v_new_q := coalesce(v_old_q, 0) + v_recv_base;
    v_new_wac := CASE
      WHEN v_new_q > 0 THEN (
        coalesce(v_old_q, 0) * coalesce(v_old_wac, 0) + v_money
      ) / v_new_q
      ELSE v_cost_base
    END;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients AS ingredient
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE ingredient.id = v_item.ingredient_id
      AND ingredient.tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      location_id = v_location_id,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  WITH ordered AS (
    SELECT
      po_item.ingredient_id,
      sum(public.inv_to_base(
        po_item.ingredient_id,
        po_item.entry_unit_id,
        po_item.quantity
      ))::numeric(15,3) AS quantity
    FROM public.purchase_order_items AS po_item
    WHERE po_item.po_id = v_grn.po_id
      AND po_item.tenant_id = v_tenant
    GROUP BY po_item.ingredient_id
  ),
  received AS (
    SELECT
      item.ingredient_id,
      sum(public.inv_to_base(
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      ))::numeric(15,3) AS quantity
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    WHERE grn.po_id = v_grn.po_id
      AND grn.tenant_id = v_tenant
      AND grn.status = 'confirmed'
    GROUP BY item.ingredient_id
  )
  SELECT bool_and(coalesce(received.quantity, 0) >= ordered.quantity)
  INTO v_all_fulfilled
  FROM ordered
  LEFT JOIN received USING (ingredient_id)
  WHERE ordered.quantity > 0;

  UPDATE public.purchase_orders
  SET status = CASE
        WHEN coalesce(v_all_fulfilled, FALSE) THEN 'received'
        ELSE 'partially_received'
      END,
      updated_at = now()
  WHERE id = v_grn.po_id
    AND tenant_id = v_tenant
    AND status IN ('sent', 'partially_received')
  RETURNING status INTO v_po_status;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_grn.po_id,
    'po_status', v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_inventory_doc_number(
  p_tenant_id bigint,
  p_doc_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_year smallint;
  v_seq bigint;
  v_prefix text;
  v_kind text :=
    pg_catalog.lower(pg_catalog.btrim(COALESCE(p_doc_kind, '')));
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid tenant_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       public.auth_tenant_id() IS NULL
       OR public.auth_tenant_id() <> p_tenant_id
     ) THEN
    RAISE EXCEPTION 'next_inventory_doc_number: tenant scope mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_prefix := CASE v_kind
    WHEN 'grn' THEN 'GRN'
    WHEN 'transfer' THEN 'DC'
    WHEN 'issue' THEN 'PXK'
    WHEN 'waste' THEN 'HH'
    WHEN 'production' THEN 'LSX'
    WHEN 'stocktake' THEN 'KK'
    WHEN 'count_slip' THEN 'PD'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid doc_kind'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_year := EXTRACT(
    year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  )::smallint;

  INSERT INTO public.tenant_inventory_doc_counters (
    tenant_id,
    doc_kind,
    year,
    next_seq,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_kind,
    v_year,
    2,
    now()
  )
  ON CONFLICT (tenant_id, doc_kind, year) DO UPDATE
  SET next_seq =
        public.tenant_inventory_doc_counters.next_seq + 1,
      updated_at = now()
  RETURNING public.tenant_inventory_doc_counters.next_seq - 1
  INTO v_seq;

  RETURN v_prefix
    || '-'
    || v_year::text
    || '-'
    || pg_catalog.lpad(v_seq::text, 4, '0');
END;
$$;

DROP FUNCTION IF EXISTS public.create_grn_from_approved_po(bigint);
DROP FUNCTION IF EXISTS public.create_grn_from_po(bigint);

CREATE FUNCTION public.create_grn_from_approved_po(p_po_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_po record;
  v_grn_id bigint;
  v_grn_number text;
  v_location_id bigint;
  v_line_count integer := 0;
  v_existing_draft_count integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_po_id <= 0 THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: invalid PO id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO status not eligible'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::integer, min(grn.id)
  INTO v_existing_draft_count, v_grn_id
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_po.tenant_id
    AND grn.po_id = v_po.id
    AND grn.status = 'draft';

  IF v_existing_draft_count > 1 THEN
    RAISE EXCEPTION
      'create_grn_from_approved_po: multiple linked drafts'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF v_existing_draft_count = 1 THEN
    SELECT grn.grn_number
    INTO v_grn_number
    FROM public.goods_received_notes AS grn
    WHERE grn.id = v_grn_id
      AND grn.tenant_id = v_po.tenant_id;

    SELECT count(*)::integer
    INTO v_line_count
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_po.tenant_id
      AND item.grn_id = v_grn_id;

    RETURN jsonb_build_object(
      'grn_id', v_grn_id,
      'grn_number', v_grn_number,
      'lines', v_line_count,
      'reused', TRUE
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = v_po.branch_id
      AND branch.tenant_id = v_po.tenant_id
      AND branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: branch invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers AS supplier
    WHERE supplier.id = v_po.supplier_id
      AND supplier.tenant_id = v_po.tenant_id
      AND supplier.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: supplier invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_po.tenant_id
      AND item.po_id = v_po.id
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO has no lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS item
    WHERE item.tenant_id = v_po.tenant_id
      AND item.po_id = v_po.id
      AND (
        item.quantity <= 0
        OR item.unit_price_est IS NULL
        OR item.unit_price_est <= 0
      )
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: invalid approved price'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_po.tenant_id
    AND location.branch_id = v_po.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND location.is_default_receive IS TRUE;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: warehouse missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    WITH received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base_for_tenant(
          v_po.tenant_id,
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        )) AS base_quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      WHERE grn.po_id = v_po.id
        AND grn.tenant_id = v_po.tenant_id
        AND grn.status = 'confirmed'
      GROUP BY item.ingredient_id
    )
    SELECT 1
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_po.tenant_id
      AND po_item.po_id = v_po.id
      AND public.inv_to_base_for_tenant(
        v_po.tenant_id,
        po_item.ingredient_id,
        po_item.entry_unit_id,
        po_item.quantity
      ) > coalesce(received.base_quantity, 0)
  ) THEN
    RAISE EXCEPTION 'create_grn_from_approved_po: PO fully received'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grn_number := public.next_inventory_doc_number(
    v_po.tenant_id,
    'grn'
  );

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_recovery_insert',
    'true',
    TRUE
  );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    po_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_po.tenant_id,
    v_po.branch_id,
    v_location_id,
    v_po.supplier_id,
    v_po.id,
    v_grn_number,
    'draft',
    v_po.created_by
  )
  RETURNING id INTO v_grn_id;

  WITH received AS (
    SELECT
      item.ingredient_id,
      sum(public.inv_to_base_for_tenant(
        v_po.tenant_id,
        item.ingredient_id,
        item.entry_unit_id,
        item.received_quantity - item.rejected_quantity
      )) AS base_quantity
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    WHERE grn.po_id = v_po.id
      AND grn.tenant_id = v_po.tenant_id
      AND grn.status = 'confirmed'
    GROUP BY item.ingredient_id
  ),
  remaining AS (
    SELECT
      po_item.ingredient_id,
      po_item.entry_unit_id,
      po_item.unit_price_est,
      round(
        (
          public.inv_to_base_for_tenant(
            v_po.tenant_id,
            po_item.ingredient_id,
            po_item.entry_unit_id,
            po_item.quantity
          ) - coalesce(received.base_quantity, 0)
        ) / public.inv_to_base_for_tenant(
          v_po.tenant_id,
          po_item.ingredient_id,
          po_item.entry_unit_id,
          1
        ),
        3
      )::numeric(15,3) AS quantity
    FROM public.purchase_order_items AS po_item
    LEFT JOIN received USING (ingredient_id)
    WHERE po_item.tenant_id = v_po.tenant_id
      AND po_item.po_id = v_po.id
  )
  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url,
    entry_unit_id,
    unit_cost,
    total_cost
  )
  SELECT
    v_po.tenant_id,
    v_grn_id,
    remaining.ingredient_id,
    remaining.quantity,
    0,
    NULL,
    NULL,
    remaining.entry_unit_id,
    remaining.unit_price_est,
    round(remaining.quantity * remaining.unit_price_est, 2)
  FROM remaining
  WHERE remaining.quantity > 0;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_recovery_insert',
    'false',
    TRUE
  );

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    v_po.tenant_id,
    NULL,
    'inventory.grn.recovered_from_approved_po',
    'goods_received_note',
    v_grn_id,
    NULL,
    jsonb_build_object(
      'actor_type', 'service_role',
      'po_id', v_po.id,
      'branch_id', v_po.branch_id,
      'lines', v_line_count
    )
  );

  RETURN jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'lines', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grn_from_approved_po(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_grn_from_approved_po(bigint)
  TO service_role;

DROP FUNCTION IF EXISTS public.create_supplier_return_from_grn(bigint, text, text, text);

DROP FUNCTION IF EXISTS public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  numeric
);

CREATE FUNCTION public.amend_grn_line(
  p_grn_id bigint,
  p_line_id bigint,
  p_received_quantity numeric,
  p_rejected_quantity numeric,
  p_reason text,
  p_rejection_reason text,
  p_rejected_photo_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c_numeric_15_3_max constant numeric := 999999999999.999;
  c_numeric_15_2_max constant numeric := 9999999999999.99;
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_line record;
  v_old_net numeric;
  v_old_net_base numeric;
  v_new_net numeric;
  v_new_net_base numeric;
  v_delta_quantity numeric;
  v_delta_base numeric;
  v_delta_value numeric;
  v_cost_base numeric;
  v_new_total_cost numeric;
  v_location_id bigint;
  v_current_quantity numeric;
  v_current_wac numeric;
  v_next_wac numeric;
  v_all_fulfilled boolean;
  v_po_status text;
  v_invoice_id bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required_min_5_chars'
      USING ERRCODE = '22023';
  END IF;
  IF p_received_quantity IS NULL
     OR p_received_quantity < 0
     OR p_received_quantity > c_numeric_15_3_max
     OR p_rejected_quantity IS NULL
     OR p_rejected_quantity < 0
     OR p_rejected_quantity > c_numeric_15_3_max THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;
  IF p_rejected_quantity > p_received_quantity THEN
    RAISE EXCEPTION 'rejected_exceeds_received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_rejected_quantity > 0
     AND NULLIF(btrim(p_rejection_reason), '') IS NULL THEN
    RAISE EXCEPTION 'grn_qc_reason_required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_rejected_quantity > 0
     AND NOT private.grn_rejection_photo_exists(
       v_tenant,
       p_grn_id,
       p_line_id,
       p_rejected_photo_url
     ) THEN
    RAISE EXCEPTION 'grn_qc_photo_required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_grn.branch_id,
    'procurement:grn_amend'
  ) THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed_use_upsert'
      USING ERRCODE = '22023';
  END IF;

  SELECT item.*
  INTO v_line
  FROM public.grn_items AS item
  WHERE item.id = p_line_id
    AND item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_line_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_line.unit_cost <= 0 THEN
    RAISE EXCEPTION 'grn_line_approved_price_missing'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_grn.po_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.purchase_order_items AS po_item
       WHERE po_item.tenant_id = v_tenant
         AND po_item.po_id = v_grn.po_id
         AND po_item.ingredient_id = v_line.ingredient_id
         AND po_item.entry_unit_id IS NOT DISTINCT FROM
           v_line.entry_unit_id
         AND po_item.unit_price_est = v_line.unit_cost
         AND po_item.unit_price_est > 0
     ) THEN
    RAISE EXCEPTION 'grn_line_approved_price_missing_or_stale'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.supplier_return_items AS return_item
    JOIN public.supplier_returns AS supplier_return
      ON supplier_return.id = return_item.return_id
     AND supplier_return.tenant_id = return_item.tenant_id
    WHERE return_item.tenant_id = v_tenant
      AND return_item.grn_item_id = p_line_id
      AND supplier_return.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'has_active_supplier_return'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.grn_id = p_grn_id
      AND (
        coalesce(invoice.payment_status, 'unpaid') <> 'unpaid'
        OR coalesce(invoice.paid_amount, 0) > 0
        OR coalesce(invoice.credit_applied_amount, 0) > 0
      )
  ) THEN
    RAISE EXCEPTION 'has_paid_invoice'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_grn.location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
      AND location.is_default_receive IS TRUE;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    WHERE location.id = v_grn.location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_grn.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_warehouse_location_missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_old_net := v_line.received_quantity - v_line.rejected_quantity;
  v_new_net := p_received_quantity - p_rejected_quantity;
  v_old_net_base := public.inv_to_base(
    v_line.ingredient_id,
    v_line.entry_unit_id,
    v_old_net
  );
  v_new_net_base := public.inv_to_base(
    v_line.ingredient_id,
    v_line.entry_unit_id,
    v_new_net
  );
  v_delta_quantity := v_new_net - v_old_net;
  v_delta_base := v_new_net_base - v_old_net_base;
  v_delta_value := v_delta_quantity * v_line.unit_cost;
  v_new_total_cost := round(v_new_net * v_line.unit_cost, 2);
  v_cost_base := CASE
    WHEN v_new_net_base <> 0
      THEN round(v_new_total_cost / v_new_net_base, 2)
    WHEN v_old_net_base <> 0
      THEN round(
        (v_old_net * v_line.unit_cost) / v_old_net_base,
        2
      )
    ELSE v_line.unit_cost
  END;

  IF abs(v_new_net_base) > c_numeric_15_3_max
     OR abs(v_delta_base) > c_numeric_15_3_max
     OR abs(v_delta_value) > c_numeric_15_2_max
     OR abs(v_new_total_cost) > c_numeric_15_2_max
     OR abs(v_cost_base) > c_numeric_15_2_max THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT stock.current_quantity, stock.avg_unit_cost
  INTO v_current_quantity, v_current_wac
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_grn.branch_id
    AND stock.location_id = v_location_id
    AND stock.ingredient_id = v_line.ingredient_id
  FOR UPDATE;

  v_current_quantity := coalesce(v_current_quantity, 0);
  IF v_current_quantity + v_delta_base < 0 THEN
    RAISE EXCEPTION 'negative_stock' USING ERRCODE = 'check_violation';
  END IF;

  IF v_current_quantity + v_delta_base > 0 THEN
    v_next_wac := round(
      (
        v_current_quantity * coalesce(v_current_wac, 0)
        + v_delta_value
      ) / (v_current_quantity + v_delta_base),
      2
    );
    IF v_next_wac < 0 OR abs(v_next_wac) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_delta_base <> 0 THEN
    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      grn_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_grn.branch_id,
      v_line.ingredient_id,
      'grn_amend',
      v_delta_base,
      'GRN '
        || v_grn.grn_number
        || ' line '
        || p_line_id
        || ': '
        || btrim(p_reason),
      v_uid,
      p_grn_id,
      v_cost_base,
      v_location_id,
      v_line.entry_unit_id,
      abs(v_delta_quantity)
    );
  END IF;

  IF v_next_wac IS NOT NULL THEN
    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_next_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_line.ingredient_id;
  END IF;

  UPDATE public.grn_items
  SET received_quantity = p_received_quantity,
      rejected_quantity = p_rejected_quantity,
      rejection_reason = CASE
        WHEN p_rejected_quantity > 0 THEN NULLIF(
          btrim(p_rejection_reason),
          ''
        )
        ELSE NULL
      END,
      rejected_photo_url = CASE
        WHEN p_rejected_quantity > 0 THEN NULLIF(
          btrim(p_rejected_photo_url),
          ''
        )
        ELSE NULL
      END,
      total_cost = v_new_total_cost
  WHERE id = p_line_id
    AND tenant_id = v_tenant;

  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = v_grn.po_id
      AND purchase_order.tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT
        po_item.ingredient_id,
        sum(public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          po_item.quantity
        )) AS quantity
      FROM public.purchase_order_items AS po_item
      WHERE po_item.po_id = v_grn.po_id
        AND po_item.tenant_id = v_tenant
      GROUP BY po_item.ingredient_id
    ),
    received AS (
      SELECT
        item.ingredient_id,
        sum(public.inv_to_base(
          item.ingredient_id,
          item.entry_unit_id,
          item.received_quantity - item.rejected_quantity
        )) AS quantity
      FROM public.grn_items AS item
      JOIN public.goods_received_notes AS grn
        ON grn.id = item.grn_id
       AND grn.tenant_id = item.tenant_id
      WHERE grn.po_id = v_grn.po_id
        AND grn.tenant_id = v_tenant
        AND grn.status = 'confirmed'
      GROUP BY item.ingredient_id
    )
    SELECT bool_and(coalesce(received.quantity, 0) >= ordered.quantity)
    INTO v_all_fulfilled
    FROM ordered
    LEFT JOIN received USING (ingredient_id)
    WHERE ordered.quantity > 0;

    UPDATE public.purchase_orders
    SET status = CASE
          WHEN coalesce(v_all_fulfilled, FALSE) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE id = v_grn.po_id
      AND tenant_id = v_tenant
      AND status IN ('sent', 'partially_received', 'received')
    RETURNING status INTO v_po_status;
  END IF;

  FOR v_invoice_id IN
    SELECT invoice.id
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.grn_id = p_grn_id
  LOOP
    PERFORM public.recompute_supplier_invoice_matching(v_invoice_id);
  END LOOP;

  PERFORM public.log_audit(
    'inventory.grn.line_amended',
    'goods_received_note',
    p_grn_id,
    jsonb_build_object(
      'line_id', p_line_id,
      'received_quantity', v_line.received_quantity,
      'rejected_quantity', v_line.rejected_quantity,
      'rejection_reason', v_line.rejection_reason,
      'rejected_photo_url', v_line.rejected_photo_url,
      'unit_cost', v_line.unit_cost,
      'total_cost', round(v_old_net * v_line.unit_cost, 2)
    ),
    jsonb_build_object(
      'line_id', p_line_id,
      'received_quantity', p_received_quantity,
      'rejected_quantity', p_rejected_quantity,
      'rejection_reason', CASE
        WHEN p_rejected_quantity > 0 THEN p_rejection_reason
        ELSE NULL
      END,
      'rejected_photo_url', CASE
        WHEN p_rejected_quantity > 0 THEN p_rejected_photo_url
        ELSE NULL
      END,
      'unit_cost', v_line.unit_cost,
      'total_cost', v_new_total_cost,
      'delta_quantity', v_delta_quantity,
      'delta_base_quantity', v_delta_base,
      'delta_value', v_delta_value,
      'location_id', v_location_id,
      'po_status', v_po_status,
      'reason', btrim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'line_id', p_line_id,
    'received_quantity', p_received_quantity,
    'rejected_quantity', p_rejected_quantity,
    'unit_cost', v_line.unit_cost,
    'total_cost', v_new_total_cost,
    'delta_quantity', v_delta_quantity,
    'delta_base_quantity', v_delta_base,
    'location_id', v_location_id,
    'po_id', v_grn.po_id,
    'po_status', v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  text,
  text
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.recreate_grn_at_receiving_site(bigint, bigint, bigint, text);

DROP FUNCTION IF EXISTS public.add_menu_item_kitchen_stock_exception(
  bigint,
  bigint,
  integer,
  text
);

CREATE FUNCTION public.add_menu_item_stock_exception(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_extra_portions integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_branch bigint := public.auth_branch_id();
  v_uid uuid := auth.uid();
  v_location_id bigint;
  v_branch_kind text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_line record;
  v_movement_count integer := 0;
  v_stock_capacity integer;
BEGIN
  IF v_tenant_id IS NULL OR v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'branch_manager'
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL OR p_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_replenishment_target'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_extra_portions IS NULL OR p_extra_portions NOT IN (1, 2) THEN
    RAISE EXCEPTION 'extra_portions_range' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT branch.branch_kind, location.id
  INTO v_branch_kind, v_location_id
  FROM public.branches AS branch
  LEFT JOIN LATERAL (
    SELECT warehouse.id
    FROM public.inventory_locations AS warehouse
    WHERE warehouse.tenant_id = branch.tenant_id
      AND warehouse.branch_id = branch.id
      AND warehouse.location_kind = 'warehouse'
      AND warehouse.is_active IS TRUE
    LIMIT 1
  ) AS location ON TRUE
  WHERE branch.tenant_id = v_tenant_id
    AND branch.id = p_branch_id
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_branch_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'branch_site_required' USING ERRCODE = '22023';
  END IF;
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'branch_warehouse_required'
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_items AS menu_item
    WHERE menu_item.tenant_id = v_tenant_id
      AND menu_item.id = p_menu_item_id
      AND menu_item.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
  ) THEN
    RAISE EXCEPTION 'menu_recipe_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.tenant_id = recipe.tenant_id
     AND ingredient.id = recipe.ingredient_id
     AND ingredient.is_active IS TRUE
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND ingredient.id IS NULL
  ) THEN
    RAISE EXCEPTION 'recipe_ingredient_inactive'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND recipe.entry_unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        WHERE ingredient_unit.tenant_id = v_tenant_id
          AND ingredient_unit.ingredient_id = recipe.ingredient_id
          AND ingredient_unit.unit_id = recipe.entry_unit_id
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'recipe_unit_config_required'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.tenant_id = ingredient_unit.tenant_id
         AND unit.id = ingredient_unit.unit_id
        WHERE ingredient_unit.tenant_id = v_tenant_id
          AND ingredient_unit.ingredient_id = recipe.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
          AND unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  FOR v_line IN
    SELECT
      recipe.ingredient_id,
      base_unit.unit_id AS entry_unit_id,
      round(sum(public.inv_to_base_for_tenant(
        v_tenant_id,
        recipe.ingredient_id,
        recipe.entry_unit_id,
        p_extra_portions::numeric
          * recipe.quantity
          / recipe.yield_factor
      )), 3)::numeric(15,3) AS quantity_change
    FROM public.recipes AS recipe
    JOIN LATERAL (
      SELECT ingredient_unit.unit_id
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.tenant_id = ingredient_unit.tenant_id
       AND unit.id = ingredient_unit.unit_id
      WHERE ingredient_unit.tenant_id = v_tenant_id
        AND ingredient_unit.ingredient_id = recipe.ingredient_id
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
        AND unit.is_active IS TRUE
      ORDER BY ingredient_unit.sort_order, ingredient_unit.id
      LIMIT 1
    ) AS base_unit ON TRUE
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
    GROUP BY recipe.ingredient_id, base_unit.unit_id
    HAVING round(sum(public.inv_to_base_for_tenant(
      v_tenant_id,
      recipe.ingredient_id,
      recipe.entry_unit_id,
      p_extra_portions::numeric
        * recipe.quantity
        / recipe.yield_factor
    )), 3) > 0
    ORDER BY recipe.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant_id,
      p_branch_id,
      v_line.ingredient_id,
      'adjustment',
      v_line.quantity_change,
      'Menu-Limits stock exception +'
        || p_extra_portions::text
        || ': '
        || v_reason,
      v_uid,
      v_location_id,
      v_line.entry_unit_id,
      v_line.quantity_change
    );

    v_movement_count := v_movement_count + 1;
  END LOOP;

  IF v_movement_count = 0 THEN
    RAISE EXCEPTION 'no_positive_recipe_quantity'
      USING ERRCODE = '22023';
  END IF;

  v_stock_capacity := public.compute_menu_item_stock_capacity(
    v_tenant_id,
    p_branch_id,
    p_menu_item_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'menu_item_id', p_menu_item_id,
    'portions_added', p_extra_portions,
    'movements_created', v_movement_count,
    'stock_capacity', v_stock_capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_menu_item_stock_exception(
  bigint,
  bigint,
  integer,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_menu_item_stock_exception(
  bigint,
  bigint,
  integer,
  text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.consume_stock_for_order_at_warehouse(
  p_order_id bigint,
  p_actor_id uuid,
  p_tenant_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order record;
  v_need record;
  v_stock_quantity numeric(15,3);
  v_location_id bigint;
  v_entry_unit_id bigint;
BEGIN
  SELECT
    orders.id,
    orders.tenant_id,
    orders.branch_id,
    orders.status,
    orders.created_by
  INTO v_order
  FROM public.orders
  WHERE orders.id = p_order_id
    AND (
      p_tenant_id IS NULL
      OR orders.tenant_id = p_tenant_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  p_actor_id := coalesce(p_actor_id, v_order.created_by);
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'consumption_actor_missing'
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.order_id = p_order_id
      AND movement.type = 'consumption'
      AND movement.tenant_id = v_order.tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'skipped', TRUE,
      'reason', 'already_consumed'
    );
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.branch_id = v_order.branch_id
    AND location.tenant_id = v_order.tenant_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_warehouse_missing:%',
      v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  FOR v_need IN
    SELECT
      recipe.ingredient_id,
      sum(public.inv_to_base(
        recipe.ingredient_id,
        recipe.entry_unit_id,
        order_item.quantity::numeric
          * recipe.quantity
          / recipe.yield_factor
      )) AS quantity
    FROM public.order_items AS order_item
    JOIN public.recipes AS recipe
      ON recipe.menu_item_id = order_item.menu_item_id
     AND recipe.tenant_id = order_item.tenant_id
    WHERE order_item.order_id = p_order_id
      AND order_item.tenant_id = v_order.tenant_id
      AND order_item.status <> 'cancelled'
    GROUP BY recipe.ingredient_id
    ORDER BY recipe.ingredient_id
  LOOP
    SELECT stock.current_quantity
    INTO v_stock_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_order.tenant_id
      AND stock.branch_id = v_order.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_need.ingredient_id
    FOR UPDATE;

    IF coalesce(v_stock_quantity, 0) < v_need.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%',
        v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      recipe.ingredient_id,
      sum(public.inv_to_base(
        recipe.ingredient_id,
        recipe.entry_unit_id,
        order_item.quantity::numeric
          * recipe.quantity
          / recipe.yield_factor
      )) AS quantity
    FROM public.order_items AS order_item
    JOIN public.recipes AS recipe
      ON recipe.menu_item_id = order_item.menu_item_id
     AND recipe.tenant_id = order_item.tenant_id
    WHERE order_item.order_id = p_order_id
      AND order_item.tenant_id = v_order.tenant_id
      AND order_item.status <> 'cancelled'
    GROUP BY recipe.ingredient_id
    ORDER BY recipe.ingredient_id
  LOOP
    SELECT ingredient_unit.unit_id
    INTO v_entry_unit_id
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_order.tenant_id
      AND ingredient_unit.ingredient_id = v_need.ingredient_id
      AND ingredient_unit.is_base IS TRUE
      AND ingredient_unit.is_active IS TRUE
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1;

    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%',
        v_need.ingredient_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      order_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.quantity,
      'Order ' || p_order_id::text,
      p_actor_id,
      p_order_id,
      coalesce(stock.avg_unit_cost, 0),
      v_location_id,
      v_entry_unit_id,
      v_need.quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_order.tenant_id
      AND stock.branch_id = v_order.branch_id
      AND stock.location_id = v_location_id
      AND stock.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'consumed', TRUE,
    'location_id', v_location_id
  );
END;
$$;

REVOKE ALL ON FUNCTION private.consume_stock_for_order_at_warehouse(
  bigint,
  uuid,
  bigint
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN private.consume_stock_for_order_at_warehouse(
    p_order_id,
    v_uid,
    v_tenant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_stock_for_order_service(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.consume_stock_for_order_at_warehouse(
    p_order_id,
    p_actor_id,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_stock_for_order_service(
  bigint,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock_for_order_service(
  bigint,
  uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.is_inventory_production_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT public.auth_role() IN (
    'owner',
    'branch_manager',
    'central_kitchen_lead'
  )
$$;

CREATE OR REPLACE FUNCTION public.create_production_run_with_locations(
  p_branch_id bigint,
  p_finished_good_id bigint,
  p_planned_quantity numeric,
  p_entry_unit_id bigint,
  p_notes text DEFAULT NULL,
  p_target_branch_id bigint DEFAULT NULL,
  p_ingredients_override jsonb DEFAULT NULL,
  p_source_location_id bigint DEFAULT NULL,
  p_target_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_new_id bigint;
  v_number text;
  v_target_branch_id bigint;
  v_source_branch_kind text;
  v_target_branch_kind text;
  v_entry_unit_id bigint := p_entry_unit_id;
  v_source_location_id bigint := p_source_location_id;
  v_target_location_id bigint := p_target_location_id;
  v_override jsonb;
  v_override_quantity numeric;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:production_create'
  ) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF p_planned_quantity IS NULL
     OR p_planned_quantity <= 0
     OR p_planned_quantity = 'NaN'::numeric
     OR p_planned_quantity = 'Infinity'::numeric
     OR p_planned_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'invalid_planned_quantity' USING ERRCODE = '22023';
  END IF;
  IF p_ingredients_override IS NOT NULL THEN
    IF jsonb_typeof(p_ingredients_override) <> 'array' THEN
      RAISE EXCEPTION 'invalid_ingredients_override'
        USING ERRCODE = '22023';
    END IF;
    FOR v_override IN
      SELECT item.value
      FROM jsonb_array_elements(p_ingredients_override) AS item(value)
    LOOP
      v_override_quantity :=
        nullif(v_override ->> 'actual_quantity', '')::numeric;
      IF nullif(v_override ->> 'ingredient_id', '') IS NULL
         OR v_override_quantity IS NULL
         OR v_override_quantity < 0
         OR v_override_quantity = 'NaN'::numeric
         OR v_override_quantity = 'Infinity'::numeric
         OR v_override_quantity = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'invalid_ingredients_override'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = p_finished_good_id
      AND ingredient.tenant_id = v_tenant
      AND ingredient.item_kind = 'finished_good'
      AND ingredient.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry_unit_id IS NULL THEN
    SELECT ingredient_unit.unit_id
    INTO v_entry_unit_id
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = p_finished_good_id
      AND ingredient_unit.is_base IS TRUE
      AND ingredient_unit.is_active IS TRUE
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = p_finished_good_id
      AND ingredient_unit.unit_id = v_entry_unit_id
      AND ingredient_unit.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_found:%',
      p_finished_good_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%',
      p_finished_good_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_target_branch_id := coalesce(p_target_branch_id, p_branch_id);
  SELECT branch.branch_kind
  INTO v_source_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE;

  SELECT branch.branch_kind
  INTO v_target_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = v_target_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE;

  IF v_source_branch_kind NOT IN ('branch', 'central_kitchen')
     OR v_target_branch_kind NOT IN ('branch', 'central_kitchen') THEN
    RAISE EXCEPTION 'production_branch_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target_branch_id <> p_branch_id
     AND (
       v_role <> 'owner'
       OR v_source_branch_kind <> 'central_kitchen'
       OR v_target_branch_kind <> 'branch'
       OR NOT public.has_permission(
         v_target_branch_id,
         'inventory:production_create'
       )
     ) THEN
    RAISE EXCEPTION 'production_cross_site_target_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF v_source_location_id IS NULL THEN
    SELECT location.id
    INTO v_source_location_id
    FROM public.branches AS branch
    JOIN public.inventory_locations AS location
      ON location.tenant_id = branch.tenant_id
     AND location.branch_id = branch.id
     AND location.is_active IS TRUE
    WHERE branch.tenant_id = v_tenant
      AND branch.id = p_branch_id
      AND location.location_kind = 'warehouse'
    ORDER BY
      location.is_default_issue DESC,
      location.sort_order,
      location.id
    LIMIT 1;
  ELSE
    SELECT location.id
    INTO v_source_location_id
    FROM public.inventory_locations AS location
    JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
    WHERE location.id = v_source_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active IS TRUE
      AND (
        location.location_kind = 'warehouse'
        OR (
          branch.branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      );
  END IF;

  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%',
      p_branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target_location_id IS NULL THEN
    SELECT location.id
    INTO v_target_location_id
    FROM public.branches AS branch
    JOIN public.inventory_locations AS location
      ON location.tenant_id = branch.tenant_id
     AND location.branch_id = branch.id
     AND location.is_active IS TRUE
    WHERE branch.tenant_id = v_tenant
      AND branch.id = v_target_branch_id
      AND location.location_kind = 'warehouse'
    ORDER BY
      location.is_default_receive DESC,
      location.sort_order,
      location.id
    LIMIT 1;
  ELSE
    SELECT location.id
    INTO v_target_location_id
    FROM public.inventory_locations AS location
    JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
    WHERE location.id = v_target_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_target_branch_id
      AND location.is_active IS TRUE
      AND (
        location.location_kind = 'warehouse'
        OR (
          branch.branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      );
  END IF;

  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'production_target_location_missing:%',
      v_target_branch_id
      USING ERRCODE = 'P0002';
  END IF;

  v_number := public.next_inventory_doc_number(v_tenant, 'production');

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
    status,
    ingredients_override
  )
  VALUES (
    v_tenant,
    v_number,
    p_branch_id,
    v_source_location_id,
    v_target_branch_id,
    v_target_location_id,
    p_finished_good_id,
    p_planned_quantity,
    v_entry_unit_id,
    p_notes,
    v_uid,
    'draft',
    p_ingredients_override
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'production_run_id', v_new_id,
    'production_number', v_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_production_run_with_locations(
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  bigint,
  jsonb,
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_run_with_locations(
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  bigint,
  jsonb,
  bigint,
  bigint
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_production_recipe_context_for_location(
  p_finished_good_id bigint,
  p_branch_id bigint,
  p_source_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint := p_source_location_id;
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
       p_branch_id,
       'inventory:production_create'
     )
     AND NOT public.has_permission(
       p_branch_id,
       'inventory:production_confirm'
     ) THEN
    RAISE EXCEPTION 'branch_scope_violation'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.production_recipes AS recipe
    LEFT JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = recipe.tenant_id
     AND ingredient_unit.ingredient_id = recipe.ingredient_id
     AND ingredient_unit.unit_id = recipe.entry_unit_id
     AND ingredient_unit.is_active IS TRUE
    LEFT JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE recipe.tenant_id = v_tenant
      AND recipe.finished_good_id = p_finished_good_id
      AND recipe.entry_unit_id IS NOT NULL
      AND (
        ingredient_unit.id IS NULL
        OR unit.id IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'production_recipe_unit_mapping_missing:%',
      p_finished_good_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_location_id IS NULL THEN
    SELECT location.id
    INTO v_location_id
    FROM public.branches AS branch
    JOIN public.inventory_locations AS location
      ON location.tenant_id = branch.tenant_id
     AND location.branch_id = branch.id
     AND location.is_active IS TRUE
    WHERE branch.tenant_id = v_tenant
      AND branch.id = p_branch_id
      AND location.location_kind = 'warehouse'
    ORDER BY
      location.is_default_issue DESC,
      location.sort_order,
      location.id
    LIMIT 1;
  ELSE
    SELECT location.id
    INTO v_location_id
    FROM public.inventory_locations AS location
    JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
    WHERE location.id = v_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_branch_id
      AND location.is_active IS TRUE
      AND (
        location.location_kind = 'warehouse'
        OR (
          branch.branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      );
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'production_source_location_missing:%',
      p_branch_id
      USING ERRCODE = 'P0002';
  END IF;

  WITH base AS (
    SELECT
      recipe.ingredient_id,
      ingredient.name AS ingredient_name,
      coalesce(
        entry_unit.name,
        entry_unit.code,
        base_unit.name,
        base_unit.code,
        ''
      ) AS unit_name,
      recipe.entry_unit_id,
      recipe.quantity AS recipe_quantity,
      coalesce(recipe.yield_factor, 1.0) AS yield_factor,
      coalesce(stock.current_quantity, 0) AS current_quantity_base,
      entry_mapping.to_base_factor
    FROM public.production_recipes AS recipe
    JOIN public.ingredients AS ingredient
      ON ingredient.id = recipe.ingredient_id
     AND ingredient.tenant_id = recipe.tenant_id
    LEFT JOIN public.units AS entry_unit
      ON entry_unit.id = recipe.entry_unit_id
     AND entry_unit.tenant_id = recipe.tenant_id
     AND entry_unit.is_active IS TRUE
    LEFT JOIN public.ingredient_units AS entry_mapping
      ON entry_mapping.tenant_id = recipe.tenant_id
     AND entry_mapping.ingredient_id = recipe.ingredient_id
     AND entry_mapping.unit_id = recipe.entry_unit_id
     AND entry_mapping.is_active IS TRUE
    LEFT JOIN public.ingredient_units AS base_mapping
      ON base_mapping.tenant_id = recipe.tenant_id
     AND base_mapping.ingredient_id = recipe.ingredient_id
     AND base_mapping.is_base IS TRUE
     AND base_mapping.is_active IS TRUE
    LEFT JOIN public.units AS base_unit
      ON base_unit.id = base_mapping.unit_id
     AND base_unit.tenant_id = base_mapping.tenant_id
     AND base_unit.is_active IS TRUE
    LEFT JOIN public.stock_levels AS stock
      ON stock.tenant_id = v_tenant
     AND stock.branch_id = p_branch_id
     AND stock.location_id = v_location_id
     AND stock.ingredient_id = recipe.ingredient_id
    WHERE recipe.tenant_id = v_tenant
      AND recipe.finished_good_id = p_finished_good_id
  ),
  calculated AS (
    SELECT
      base.*,
      CASE
        WHEN base.entry_unit_id IS NOT NULL
          THEN (
            base.recipe_quantity / base.yield_factor
          ) * base.to_base_factor
        ELSE base.recipe_quantity / base.yield_factor
      END AS required_base_per_fg,
      CASE
        WHEN base.entry_unit_id IS NOT NULL
          THEN base.current_quantity_base / base.to_base_factor
        ELSE base.current_quantity_base
      END AS max_ingredient_qty
    FROM base
  )
  SELECT coalesce(
    jsonb_agg(to_jsonb(calculated)),
    '[]'::jsonb
  )
  INTO v_result
  FROM calculated;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_production_recipe_context_for_location(
  bigint,
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_production_recipe_context_for_location(
  bigint,
  bigint,
  bigint
) TO authenticated, service_role;

ALTER FUNCTION public.confirm_production_run(
  bigint,
  numeric,
  jsonb
) SET SCHEMA private;

ALTER FUNCTION private.confirm_production_run(
  bigint,
  numeric,
  jsonb
) RENAME TO execute_confirm_production_run;

REVOKE ALL ON FUNCTION private.execute_confirm_production_run(
  bigint,
  numeric,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.confirm_production_run(
  p_run_id bigint,
  p_actual_quantity numeric DEFAULT NULL,
  p_actual_ingredients jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_run record;
  v_actual_ingredient jsonb;
  v_actual_ingredient_quantity numeric;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_actual_quantity IS NOT NULL
     AND (
       p_actual_quantity <= 0
       OR p_actual_quantity = 'NaN'::numeric
       OR p_actual_quantity = 'Infinity'::numeric
       OR p_actual_quantity = '-Infinity'::numeric
     ) THEN
    RAISE EXCEPTION 'invalid_actual_quantity'
      USING ERRCODE = '22023';
  END IF;
  IF p_actual_ingredients IS NOT NULL THEN
    IF jsonb_typeof(p_actual_ingredients) <> 'array' THEN
      RAISE EXCEPTION 'invalid_actual_ingredients'
        USING ERRCODE = '22023';
    END IF;
    FOR v_actual_ingredient IN
      SELECT item.value
      FROM jsonb_array_elements(p_actual_ingredients) AS item(value)
    LOOP
      v_actual_ingredient_quantity :=
        nullif(
          v_actual_ingredient ->> 'actual_quantity',
          ''
        )::numeric;
      IF nullif(
           v_actual_ingredient ->> 'ingredient_id',
           ''
         ) IS NULL
         OR v_actual_ingredient_quantity IS NULL
         OR v_actual_ingredient_quantity < 0
         OR v_actual_ingredient_quantity = 'NaN'::numeric
         OR v_actual_ingredient_quantity = 'Infinity'::numeric
         OR v_actual_ingredient_quantity = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'invalid_actual_ingredients'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  SELECT
    run.id,
    run.branch_id,
    run.target_branch_id,
    run.source_location_id,
    run.target_location_id,
    source_branch.branch_kind AS source_branch_kind,
    target_branch.branch_kind AS target_branch_kind
  INTO v_run
  FROM public.production_runs AS run
  JOIN public.branches AS source_branch
    ON source_branch.id = run.branch_id
   AND source_branch.tenant_id = run.tenant_id
   AND source_branch.is_active IS TRUE
  JOIN public.branches AS target_branch
    ON target_branch.id = run.target_branch_id
   AND target_branch.tenant_id = run.tenant_id
   AND target_branch.is_active IS TRUE
  WHERE run.id = p_run_id
    AND run.tenant_id = v_tenant
  FOR UPDATE OF run;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_run_not_found'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_run.source_branch_kind NOT IN ('branch', 'central_kitchen')
     OR v_run.target_branch_kind NOT IN ('branch', 'central_kitchen') THEN
    RAISE EXCEPTION 'production_branch_not_found'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_run.branch_id,
    'inventory:production_confirm'
  ) THEN
    RAISE EXCEPTION 'branch_scope_violation'
      USING ERRCODE = '42501';
  END IF;
  IF v_run.target_branch_id <> v_run.branch_id
     AND (
       v_role <> 'owner'
       OR v_run.source_branch_kind <> 'central_kitchen'
       OR v_run.target_branch_kind <> 'branch'
       OR NOT public.has_permission(
         v_run.target_branch_id,
         'inventory:production_confirm'
       )
     ) THEN
    RAISE EXCEPTION 'production_cross_site_target_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_run.source_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_run.branch_id
      AND location.is_active IS TRUE
      AND (
        location.location_kind = 'warehouse'
        OR (
          v_run.source_branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      )
  ) THEN
    RAISE EXCEPTION 'production_source_location_missing:%',
      v_run.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_run.target_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_run.target_branch_id
      AND location.is_active IS TRUE
      AND (
        location.location_kind = 'warehouse'
        OR (
          v_run.target_branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      )
  ) THEN
    RAISE EXCEPTION 'production_target_location_missing:%',
      v_run.target_branch_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN private.execute_confirm_production_run(
    p_run_id,
    p_actual_quantity,
    p_actual_ingredients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_run(
  bigint,
  numeric,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_production_run(
  bigint,
  numeric,
  jsonb
) TO authenticated, service_role;

DROP POLICY IF EXISTS production_runs_write
  ON public.production_runs;
DROP POLICY IF EXISTS production_runs_select
  ON public.production_runs;

CREATE POLICY production_runs_select
ON public.production_runs
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(
      branch_id,
      'inventory:production_create'
    )
    OR public.has_permission(
      branch_id,
      'inventory:production_confirm'
    )
  )
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.production_runs
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.production_runs_id_seq
FROM anon, authenticated;

DROP POLICY IF EXISTS production_orders_write
  ON public.production_orders;
DROP POLICY IF EXISTS production_orders_select
  ON public.production_orders;

CREATE POLICY production_orders_select
ON public.production_orders
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(
      branch_id,
      'inventory:production_create'
    )
    OR public.has_permission(
      branch_id,
      'inventory:production_confirm'
    )
  )
);

DROP POLICY IF EXISTS production_order_items_write
  ON public.production_order_items;
DROP POLICY IF EXISTS production_order_items_select
  ON public.production_order_items;

CREATE POLICY production_order_items_select
ON public.production_order_items
FOR SELECT
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders AS production_order
    WHERE production_order.id = production_order_id
      AND production_order.tenant_id =
        production_order_items.tenant_id
      AND (
        public.has_permission(
          production_order.branch_id,
          'inventory:production_create'
        )
        OR public.has_permission(
          production_order.branch_id,
          'inventory:production_confirm'
        )
      )
  )
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.production_orders
FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.production_order_items
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.production_orders_id_seq
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.production_order_items_id_seq
FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.from_branch_id = transfer.to_branch_id
       OR NOT EXISTS (
         SELECT 1
         FROM public.inventory_locations AS source
         WHERE source.id = transfer.from_location_id
           AND source.tenant_id = transfer.tenant_id
           AND source.branch_id = transfer.from_branch_id
           AND source.location_kind = 'warehouse'
           AND source.is_active IS TRUE
       )
       OR NOT EXISTS (
         SELECT 1
         FROM public.inventory_locations AS target
         WHERE target.id = transfer.to_location_id
           AND target.tenant_id = transfer.tenant_id
           AND target.branch_id = transfer.to_branch_id
           AND target.location_kind = 'warehouse'
           AND target.is_active IS TRUE
       )
  ) THEN
    RAISE EXCEPTION 'stock_transfer_warehouse_preflight_failed'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.from_branch_id = NEW.to_branch_id THEN
    RAISE EXCEPTION 'stock_transfers: distinct branches required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS source
    WHERE source.id = NEW.from_location_id
      AND source.tenant_id = NEW.tenant_id
      AND source.branch_id = NEW.from_branch_id
      AND source.location_kind = 'warehouse'
      AND source.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'stock_transfers: source warehouse invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS target
    WHERE target.id = NEW.to_location_id
      AND target.tenant_id = NEW.tenant_id
      AND target.branch_id = NEW.to_branch_id
      AND target.location_kind = 'warehouse'
      AND target.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'stock_transfers: target warehouse invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_stock_transfer_direction()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_stock_transfer_direction()
  TO service_role;
COMMENT ON FUNCTION public.enforce_stock_transfer_direction() IS
  'Transfers require distinct sites and active warehouse endpoints.';

DROP TRIGGER IF EXISTS trg_stock_transfer_direction
  ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfer_direction
BEFORE INSERT OR UPDATE OF
  tenant_id,
  from_branch_id,
  to_branch_id,
  from_location_id,
  to_location_id
ON public.stock_transfers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_stock_transfer_direction();

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(
  p_from_branch_id bigint,
  p_to_branch_id bigint,
  p_transfer_number text,
  p_notes text DEFAULT NULL,
  p_vehicle_info text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]',
  p_from_location_id bigint DEFAULT NULL,
  p_to_location_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_transfer_id bigint;
  v_from_kind text;
  v_to_kind text;
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_entry_quantity numeric(15,3);
  v_transfer_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'transfer_requires_distinct_branches'
      USING ERRCODE = '22023';
  END IF;
  IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_warehouse_locations_required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  PERFORM branch.id
  FROM public.branches AS branch
  WHERE branch.id = ANY(ARRAY[
    p_from_branch_id,
    p_to_branch_id
  ]::bigint[])
  ORDER BY branch.id
  FOR UPDATE OF branch;

  SELECT branch.branch_kind
  INTO v_from_kind
  FROM public.branches AS branch
  WHERE branch.id = p_from_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE
    AND branch.branch_kind IN (
      'branch',
      'central_supply',
      'central_kitchen'
    );

  SELECT branch.branch_kind
  INTO v_to_kind
  FROM public.branches AS branch
  WHERE branch.id = p_to_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE
    AND branch.branch_kind IN (
      'branch',
      'central_supply',
      'central_kitchen'
    );

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'transfer_branch_invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_from_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_from_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = p_to_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = p_to_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'forbidden_transfer_create'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
    p_from_branch_id,
    'inventory:transfer_create'
  ) THEN
    RAISE EXCEPTION 'forbidden_transfer_create'
      USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'transfer_lines_invalid' USING ERRCODE = '22023';
  END IF;

  v_transfer_number := public.next_inventory_doc_number(
    v_tenant,
    'transfer'
  );

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by
  )
  VALUES (
    v_tenant,
    p_from_branch_id,
    p_to_branch_id,
    p_from_location_id,
    p_to_location_id,
    v_transfer_number,
    'draft',
    p_notes,
    p_vehicle_info,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_lines) AS line(value)
  LOOP
    v_ingredient_id := NULLIF(
      coalesce(
        v_line ->> 'ingredientId',
        v_line ->> 'ingredient_id'
      ),
      ''
    )::bigint;
    v_entry_quantity := NULLIF(
      v_line ->> 'quantity',
      ''
    )::numeric(15,3);
    v_entry_unit_id := NULLIF(
      coalesce(
        v_line ->> 'entryUnitId',
        v_line ->> 'entry_unit_id'
      ),
      ''
    )::bigint;

    IF v_ingredient_id IS NULL
       OR v_entry_quantity IS NULL
       OR v_entry_quantity <= 0
       OR v_entry_quantity = 'NaN'::numeric
       OR v_entry_quantity = 'Infinity'::numeric
       OR v_entry_quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'transfer_lines_invalid'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients AS ingredient
      WHERE ingredient.id = v_ingredient_id
        AND ingredient.tenant_id = v_tenant
        AND ingredient.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'transfer_ingredient_invalid:%',
        v_ingredient_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_entry_unit_id IS NULL THEN
      SELECT ingredient_unit.unit_id
      INTO v_entry_unit_id
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active IS TRUE
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_ingredient_id
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
      ORDER BY ingredient_unit.sort_order, ingredient_unit.id
      LIMIT 1;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active IS TRUE
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = v_ingredient_id
        AND ingredient_unit.unit_id = v_entry_unit_id
        AND ingredient_unit.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'entry_unit_not_found:%',
        v_ingredient_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%',
        v_ingredient_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost_at_ship
    )
    VALUES (
      v_tenant,
      v_transfer_id,
      v_ingredient_id,
      v_entry_quantity,
      v_entry_unit_id,
      (
        SELECT stock.avg_unit_cost
        FROM public.stock_levels AS stock
        WHERE stock.tenant_id = v_tenant
          AND stock.branch_id = p_from_branch_id
          AND stock.location_id = p_from_location_id
          AND stock.ingredient_id = v_ingredient_id
        LIMIT 1
      )
    )
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_transfer_id,
    'status', 'draft',
    'transfer_number', v_transfer_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb,
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb,
  bigint,
  bigint
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(
  p_transfer_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_transfer record;
  v_line record;
  v_source_quantity numeric(15,3);
  v_source_wac numeric(15,2);
  v_quantity_base numeric(15,3);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_transfer.from_branch_id = v_transfer.to_branch_id THEN
    RAISE EXCEPTION 'transfer_requires_distinct_branches'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  IF v_role = 'branch_manager' THEN
    RAISE EXCEPTION 'branch_manager_inter_site_ship_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
    v_transfer.from_branch_id,
    'inventory:transfer_ship'
  ) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.from_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.from_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.to_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.to_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'transfer_lines_required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
    ORDER BY item.ingredient_id
    FOR UPDATE
  LOOP
    IF v_line.quantity <= 0
       OR v_line.quantity = 'NaN'::numeric
       OR v_line.quantity = 'Infinity'::numeric
       OR v_line.quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'transfer_line_quantity_invalid:%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    v_quantity_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_source_quantity, v_source_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_transfer.from_branch_id
      AND stock.location_id = v_transfer.from_location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND
       OR coalesce(v_source_quantity, 0) < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock:%',
        v_line.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      transfer_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_transfer.from_branch_id,
      v_line.ingredient_id,
      'transfer_out',
      -v_quantity_base,
      'Transfer ' || v_transfer.transfer_number,
      v_uid,
      p_transfer_id,
      v_source_wac,
      v_transfer.from_location_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_source_wac
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'confirmed_ship'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_ship(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_ship(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.branch_manager_approve_consumption_report(
  p_tenant_id bigint,
  p_report_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_report record;
  v_line record;
  v_issue_id bigint;
  v_issue_number text;
  v_source_location_id bigint;
  v_current_quantity numeric(15,3);
  v_wac numeric(15,2);
  v_line_count integer;
  v_quantity_base numeric(15,3);
  v_entry_unit_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL OR v_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT report.*
  INTO v_report
  FROM public.attendance_consumption_reports AS report
  WHERE report.id = p_report_id
    AND report.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consumption_report_not_found'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_report.branch_id,
    'hr:approve_checkout'
  ) THEN
    RAISE EXCEPTION 'forbidden_checkout_approval'
      USING ERRCODE = '42501';
  END IF;
  IF v_report.status IN ('approved', 'applied') THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'report_id', p_report_id,
      'stock_issue_id', v_report.stock_issue_id,
      'status', v_report.status
    );
  END IF;
  IF v_report.status <> 'submitted' THEN
    RAISE EXCEPTION 'consumption_report_not_submitted'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_line_count
  FROM public.attendance_consumption_report_lines AS line
  WHERE line.tenant_id = p_tenant_id
    AND line.report_id = p_report_id;

  IF v_report.no_consumption IS TRUE AND v_line_count = 0 THEN
    UPDATE public.attendance_consumption_reports
    SET status = 'approved',
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_note = NULL
    WHERE id = p_report_id
      AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'report_id', p_report_id,
      'stock_issue_id', NULL,
      'no_consumption', TRUE,
      'line_count', 0
    );
  END IF;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'consumption_lines_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT location.id
  INTO v_source_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = v_report.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_warehouse_missing'
      USING ERRCODE = 'not_null_violation';
  END IF;

  FOR v_line IN
    SELECT line.*
    FROM public.attendance_consumption_report_lines AS line
    WHERE line.tenant_id = p_tenant_id
      AND line.report_id = p_report_id
    ORDER BY line.sort_order, line.id
  LOOP
    v_entry_unit_id := coalesce(
      v_line.entry_unit_id,
      (
        SELECT ingredient_unit.unit_id
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.id = ingredient_unit.unit_id
         AND unit.tenant_id = ingredient_unit.tenant_id
         AND unit.is_active IS TRUE
        WHERE ingredient_unit.tenant_id = p_tenant_id
          AND ingredient_unit.ingredient_id = v_line.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
        ORDER BY ingredient_unit.sort_order, ingredient_unit.id
        LIMIT 1
      )
    );

    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%',
        v_line.ingredient_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_quantity_base := round(public.inv_to_base(
      v_line.ingredient_id,
      v_entry_unit_id,
      v_line.quantity
    ), 3);

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_current_quantity, v_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = p_tenant_id
      AND stock.branch_id = v_report.branch_id
      AND stock.location_id = v_source_location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_current_quantity, 0) < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock_for_%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_issue_number := 'THB-' || p_report_id::text;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    notes,
    issued_at,
    created_by,
    source_location_id,
    target_location_id,
    approval_status,
    approved_by,
    approved_at,
    source_type,
    source_ref
  )
  VALUES (
    p_tenant_id,
    v_report.branch_id,
    v_issue_number,
    'consumption',
    'draft',
    coalesce(v_report.note, 'Tiêu hao vận hành trong ngày'),
    now(),
    v_uid,
    v_source_location_id,
    NULL,
    'approved',
    v_uid,
    now(),
    'hrm_consumption',
    jsonb_build_object(
      'source', 'attendance_consumption_report',
      'source_label', 'HRM - Tiêu hao vận hành trong ngày',
      'report_id', p_report_id,
      'attendance_record_id', v_report.attendance_record_id,
      'employee_id', v_report.employee_id,
      'branch_id', v_report.branch_id,
      'reviewed_by', v_uid,
      'reviewed_at', now()
    )
  )
  RETURNING id INTO v_issue_id;

  FOR v_line IN
    SELECT line.*
    FROM public.attendance_consumption_report_lines AS line
    WHERE line.tenant_id = p_tenant_id
      AND line.report_id = p_report_id
    ORDER BY line.sort_order, line.id
  LOOP
    v_entry_unit_id := coalesce(
      v_line.entry_unit_id,
      (
        SELECT ingredient_unit.unit_id
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.id = ingredient_unit.unit_id
         AND unit.tenant_id = ingredient_unit.tenant_id
         AND unit.is_active IS TRUE
        WHERE ingredient_unit.tenant_id = p_tenant_id
          AND ingredient_unit.ingredient_id = v_line.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
        ORDER BY ingredient_unit.sort_order, ingredient_unit.id
        LIMIT 1
      )
    );
    v_quantity_base := round(public.inv_to_base(
      v_line.ingredient_id,
      v_entry_unit_id,
      v_line.quantity
    ), 3);

    SELECT stock.avg_unit_cost
    INTO v_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = p_tenant_id
      AND stock.branch_id = v_report.branch_id
      AND stock.location_id = v_source_location_id
      AND stock.ingredient_id = v_line.ingredient_id;

    INSERT INTO public.stock_issue_items (
      tenant_id,
      issue_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost,
      reason
    )
    VALUES (
      p_tenant_id,
      v_issue_id,
      v_line.ingredient_id,
      v_line.quantity,
      v_entry_unit_id,
      v_wac,
      v_line.note
    );

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      unit_cost,
      reason,
      created_by,
      issue_id,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      p_tenant_id,
      v_report.branch_id,
      v_line.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_quantity_base,
      v_wac,
      coalesce(
        v_line.note,
        v_report.note,
        'Tiêu hao vận hành trong ngày'
      ),
      v_uid,
      v_issue_id,
      v_source_location_id,
      v_entry_unit_id,
      v_line.quantity
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = v_issue_id
    AND tenant_id = p_tenant_id;

  UPDATE public.attendance_consumption_reports
  SET status = 'applied',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_note = NULL,
      stock_issue_id = v_issue_id
  WHERE id = p_report_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'report_id', p_report_id,
    'stock_issue_id', v_issue_id,
    'line_count', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) TO authenticated, service_role;
COMMENT ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) IS
  'Approves a submitted consumption report and posts stock consumption from the site warehouse.';

CREATE OR REPLACE FUNCTION public.stock_issue_items_compute_waste_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_parent record;
  v_item_value numeric(15,2);
  v_stock record;
  v_quantity_ratio numeric(5,4);
  v_rolling_sum numeric(15,2);
  v_shift_sum numeric(15,2);
  v_branch_cap record;
  v_branch_today numeric(15,2);
  v_photo boolean := FALSE;
  v_approve boolean := FALSE;
  v_tier smallint := 0;
  v_quantity_base numeric(15,3);
  v_risky_reasons constant text[] := ARRAY[
    'dropped',
    'quality_fail',
    'contaminated',
    'found_missing',
    'theft_suspected'
  ];
  v_always_tier2 constant text[] := ARRAY[
    'found_missing',
    'theft_suspected'
  ];
  v_tier1_threshold constant numeric := 150000;
  v_tier2_threshold constant numeric := 500000;
  v_shift_cap constant numeric := 1500000;
BEGIN
  SELECT
    issue.tenant_id,
    issue.branch_id,
    issue.source_location_id,
    issue.created_by,
    issue.issue_type,
    issue.shift_key,
    issue.issued_at
  INTO v_parent
  FROM public.stock_issues AS issue
  WHERE issue.id = NEW.issue_id;

  IF NOT FOUND OR v_parent.issue_type <> 'writeoff' THEN
    RETURN NEW;
  END IF;

  v_quantity_base := public.inv_to_base(
    NEW.ingredient_id,
    NEW.entry_unit_id,
    NEW.quantity
  );

  IF NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    v_item_value := v_quantity_base * NEW.unit_cost;
  ELSE
    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_stock
    FROM public.stock_levels AS stock
    WHERE stock.branch_id = v_parent.branch_id
      AND stock.ingredient_id = NEW.ingredient_id
      AND (
        v_parent.source_location_id IS NULL
        OR stock.location_id = v_parent.source_location_id
      )
    ORDER BY stock.location_id
    LIMIT 1;
    v_item_value := coalesce(
      v_quantity_base * v_stock.avg_unit_cost,
      0
    );
  END IF;

  SELECT stock.current_quantity
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.branch_id = v_parent.branch_id
    AND stock.ingredient_id = NEW.ingredient_id
    AND (
      v_parent.source_location_id IS NULL
      OR stock.location_id = v_parent.source_location_id
    )
  ORDER BY stock.location_id
  LIMIT 1;

  IF v_stock.current_quantity IS NOT NULL
     AND v_stock.current_quantity > 0 THEN
    v_quantity_ratio := least(
      v_quantity_base / v_stock.current_quantity,
      9.9999
    )::numeric(5,4);
  ELSE
    v_quantity_ratio := NULL;
  END IF;

  SELECT coalesce(sum(
    public.inv_to_base(
      item.ingredient_id,
      item.entry_unit_id,
      item.quantity
    ) * item.unit_cost
  ), 0)
  INTO v_rolling_sum
  FROM public.stock_issue_items AS item
  JOIN public.stock_issues AS issue
    ON issue.id = item.issue_id
  WHERE issue.issue_type = 'writeoff'
    AND issue.created_by = v_parent.created_by
    AND issue.branch_id = v_parent.branch_id
    AND item.ingredient_id = NEW.ingredient_id
    AND issue.created_at > now() - interval '15 minutes'
    AND item.id <> coalesce(NEW.id, -1);

  IF v_parent.shift_key IS NOT NULL THEN
    SELECT coalesce(sum(
      public.inv_to_base(
        item.ingredient_id,
        item.entry_unit_id,
        item.quantity
      ) * item.unit_cost
    ), 0)
    INTO v_shift_sum
    FROM public.stock_issue_items AS item
    JOIN public.stock_issues AS issue
      ON issue.id = item.issue_id
    WHERE issue.issue_type = 'writeoff'
      AND issue.created_by = v_parent.created_by
      AND issue.branch_id = v_parent.branch_id
      AND issue.shift_key = v_parent.shift_key
      AND item.id <> coalesce(NEW.id, -1);
  ELSE
    v_shift_sum := 0;
  END IF;

  SELECT cap.cap_vnd, cap.avg_revenue_7d
  INTO v_branch_cap
  FROM public.branch_daily_waste_cap AS cap
  WHERE cap.branch_id = v_parent.branch_id;

  SELECT coalesce(sum(
    public.inv_to_base(
      item.ingredient_id,
      item.entry_unit_id,
      item.quantity
    ) * item.unit_cost
  ), 0)
  INTO v_branch_today
  FROM public.stock_issue_items AS item
  JOIN public.stock_issues AS issue
    ON issue.id = item.issue_id
  WHERE issue.issue_type = 'writeoff'
    AND issue.branch_id = v_parent.branch_id
    AND issue.issued_at >= date_trunc(
      'day',
      now() AT TIME ZONE coalesce(
        (
          SELECT branch.timezone
          FROM public.branches AS branch
          WHERE branch.id = v_parent.branch_id
        ),
        'Asia/Ho_Chi_Minh'
      )
    )
    AND item.id <> coalesce(NEW.id, -1);

  v_photo := v_item_value >= v_tier1_threshold
    OR (
      v_quantity_ratio IS NOT NULL
      AND v_quantity_ratio >= 0.5
    )
    OR (
      NEW.reason_code IS NOT NULL
      AND NEW.reason_code = ANY(v_risky_reasons)
    )
    OR v_rolling_sum + v_item_value >= v_tier1_threshold;

  v_approve := v_item_value >= v_tier2_threshold
    OR v_shift_sum + v_item_value >= v_shift_cap
    OR (
      NEW.reason_code IS NOT NULL
      AND NEW.reason_code = ANY(v_always_tier2)
    )
    OR (
      v_branch_cap.cap_vnd IS NOT NULL
      AND v_branch_today + v_item_value > v_branch_cap.cap_vnd
    );

  IF v_approve THEN
    v_tier := 2;
  ELSIF v_photo THEN
    v_tier := 1;
  END IF;

  NEW.waste_tier := v_tier;
  NEW.photo_required := v_photo;
  NEW.approval_required := v_approve;
  NEW.qty_ratio := v_quantity_ratio;
  NEW.rolling_15min_sum := v_rolling_sum;

  IF v_photo
     AND coalesce(array_length(NEW.photo_urls, 1), 0) = 0
     AND NOT public.has_permission(
       v_parent.branch_id,
       'inventory:waste_bypass_photo'
     ) THEN
    RAISE EXCEPTION
      'waste photo required for tier >= 1 (reason=%, value=%, qty_ratio=%)',
      NEW.reason_code,
      v_item_value,
      v_quantity_ratio
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_issue_items_compute_waste_tier()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_issue_items_compute_waste_tier()
  TO service_role;

DROP FUNCTION IF EXISTS public.inventory_requires_manual_review(bigint);

ALTER FUNCTION public.bulk_import_production_recipes(jsonb)
SET SCHEMA private;
ALTER FUNCTION private.bulk_import_production_recipes(jsonb)
RENAME TO execute_bulk_import_production_recipes;

REVOKE ALL ON FUNCTION
  private.execute_bulk_import_production_recipes(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.bulk_import_production_recipes(
  p_groups jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_group jsonb;
  v_line jsonb;
  v_quantity numeric;
  v_yield_factor numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() NOT IN (
    'owner',
    'central_kitchen_lead'
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_groups IS NOT NULL
     AND jsonb_typeof(p_groups) = 'array' THEN
    FOR v_group IN
      SELECT item.value
      FROM jsonb_array_elements(p_groups) AS item(value)
    LOOP
      IF jsonb_typeof(v_group -> 'lines') = 'array' THEN
        FOR v_line IN
          SELECT item.value
          FROM jsonb_array_elements(v_group -> 'lines') AS item(value)
        LOOP
          v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
          v_yield_factor := coalesce(
            nullif(v_line ->> 'yield_factor', '')::numeric,
            1
          );
          IF v_quantity IS NULL
             OR v_quantity <= 0
             OR v_quantity = 'NaN'::numeric
             OR v_quantity = 'Infinity'::numeric
             OR v_quantity = '-Infinity'::numeric
             OR v_yield_factor <= 0
             OR v_yield_factor = 'NaN'::numeric
             OR v_yield_factor = 'Infinity'::numeric
             OR v_yield_factor = '-Infinity'::numeric THEN
            RAISE EXCEPTION 'invalid_line_shape'
              USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN private.execute_bulk_import_production_recipes(p_groups);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_production_recipes(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_production_recipes(jsonb)
TO authenticated, service_role;

ALTER FUNCTION public.upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
) SET SCHEMA private;
ALTER FUNCTION private.upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
) RENAME TO execute_upsert_production_recipe_lines;

REVOKE ALL ON FUNCTION private.execute_upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id bigint,
  p_lines jsonb,
  p_old_finished_good_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_line jsonb;
  v_quantity numeric;
  v_yield_factor numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() NOT IN (
    'owner',
    'central_kitchen_lead'
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NOT NULL
     AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line IN
      SELECT item.value
      FROM jsonb_array_elements(p_lines) AS item(value)
    LOOP
      v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
      v_yield_factor := coalesce(
        nullif(v_line ->> 'yield_factor', '')::numeric,
        1
      );
      IF v_quantity IS NULL
         OR v_quantity <= 0
         OR v_quantity = 'NaN'::numeric
         OR v_quantity = 'Infinity'::numeric
         OR v_quantity = '-Infinity'::numeric
         OR v_yield_factor <= 0
         OR v_yield_factor = 'NaN'::numeric
         OR v_yield_factor = 'Infinity'::numeric
         OR v_yield_factor = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'recipe_line_quantity_invalid'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  RETURN private.execute_upsert_production_recipe_lines(
    p_finished_good_id,
    p_lines,
    p_old_finished_good_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(
  bigint,
  jsonb,
  bigint
) TO authenticated, service_role;

DROP POLICY IF EXISTS production_recipes_write
  ON public.production_recipes;
DROP POLICY IF EXISTS production_recipes_delete
  ON public.production_recipes;

CREATE POLICY production_recipes_delete
ON public.production_recipes
FOR DELETE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() IN (
    'owner',
    'central_kitchen_lead'
  )
  AND (
    public.has_permission_any('inventory:production_create')
    OR public.has_permission_any('inventory:production_confirm')
    OR public.has_permission_any('menu:write')
  )
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.production_recipes
FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE
ON TABLE public.production_recipes
FROM authenticated;
REVOKE ALL ON SEQUENCE public.production_recipes_id_seq
FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_recipe_lines(
  p_menu_item_id bigint,
  p_lines jsonb,
  p_old_menu_item_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_kept bigint[] := ARRAY[]::bigint[];
  v_line jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission_any('inventory:write')
    OR public.has_permission_any('menu:write')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_items AS menu_item
    WHERE menu_item.id = p_menu_item_id
      AND menu_item.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'menu_item_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array'
      USING ERRCODE = '22023';
  END IF;

  IF p_old_menu_item_id IS NOT NULL
     AND p_old_menu_item_id <> p_menu_item_id THEN
    DELETE FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant
      AND recipe.menu_item_id = p_old_menu_item_id;
  END IF;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_lines)
  LOOP
    IF (v_line ->> 'ingredient_id') IS NULL
       OR (v_line ->> 'quantity') IS NULL THEN
      RAISE EXCEPTION 'invalid_line_shape'
        USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line ->> 'ingredient_id')::bigint;
    v_entry_unit_id :=
      nullif(v_line ->> 'entry_unit_id', '')::bigint;

    PERFORM public.inventory_entry_unit_code(
      v_tenant,
      v_ingredient_id,
      v_entry_unit_id
    );

    INSERT INTO public.recipes (
      tenant_id,
      menu_item_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      note,
      yield_factor
    )
    VALUES (
      v_tenant,
      p_menu_item_id,
      v_ingredient_id,
      (v_line ->> 'quantity')::numeric,
      v_entry_unit_id,
      nullif(v_line ->> 'note', ''),
      coalesce(
        nullif(v_line ->> 'yield_factor', '')::numeric,
        1.000
      )
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = excluded.quantity,
      entry_unit_id = excluded.entry_unit_id,
      note = excluded.note,
      yield_factor = excluded.yield_factor;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.recipes AS recipe
  WHERE recipe.tenant_id = v_tenant
    AND recipe.menu_item_id = p_menu_item_id
    AND NOT (recipe.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'menu_item_id',
    p_menu_item_id,
    'kept_count',
    coalesce(array_length(v_kept, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_recipe_lines(
  bigint,
  jsonb,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_recipe_lines(
  bigint,
  jsonb,
  bigint
) TO authenticated, service_role;

DROP POLICY IF EXISTS recipes_write
  ON public.recipes;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.recipes
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.recipes_id_seq
FROM anon, authenticated;

ALTER FUNCTION public.upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb
) SET SCHEMA private;
ALTER FUNCTION private.upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb
) RENAME TO execute_upsert_ingredient_catalog;

REVOKE ALL ON FUNCTION private.execute_upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.upsert_ingredient_catalog(
  p_ingredient_id bigint,
  p_name text,
  p_sku text,
  p_category_id bigint,
  p_unit_cost numeric,
  p_item_kind text,
  p_storage_type text,
  p_min_stock_level numeric,
  p_max_stock_level numeric,
  p_reorder_point numeric,
  p_shelf_life_days integer,
  p_units jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_preserved_unit_cost numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_ingredient_id IS NULL THEN
    v_preserved_unit_cost := 0;
  ELSE
    SELECT ingredient.unit_cost
    INTO v_preserved_unit_cost
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = p_ingredient_id
      AND ingredient.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient not found'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN private.execute_upsert_ingredient_catalog(
    p_ingredient_id,
    p_name,
    p_sku,
    p_category_id,
    v_preserved_unit_cost,
    p_item_kind,
    p_storage_type,
    p_min_stock_level,
    p_max_stock_level,
    p_reorder_point,
    p_shelf_life_days,
    p_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_ingredient_catalog(
  bigint,
  text,
  text,
  bigint,
  numeric,
  text,
  text,
  numeric,
  numeric,
  numeric,
  integer,
  jsonb
) TO authenticated, service_role;

ALTER FUNCTION public.bulk_import_ingredients(jsonb)
SET SCHEMA private;
ALTER FUNCTION private.bulk_import_ingredients(jsonb)
RENAME TO execute_bulk_import_ingredients;

REVOKE ALL ON FUNCTION private.execute_bulk_import_ingredients(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.bulk_import_ingredients(
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_sanitized_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner' THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RETURN private.execute_bulk_import_ingredients(p_rows);
  END IF;

  PERFORM ingredient.id
  FROM public.ingredients AS ingredient
  JOIN jsonb_array_elements(p_rows) AS raw(value)
    ON ingredient.name = btrim(raw.value ->> 'name')
  WHERE ingredient.tenant_id = v_tenant
  ORDER BY ingredient.id
  FOR UPDATE OF ingredient;

  SELECT jsonb_agg(
    (
      raw.value - 'unit_cost'
    ) || jsonb_build_object(
      'unit_cost',
      CASE
        WHEN ingredient.id IS NULL THEN 0
        ELSE ingredient.unit_cost
      END
    )
    ORDER BY raw.ordinality
  )
  INTO v_sanitized_rows
  FROM jsonb_array_elements(p_rows)
    WITH ORDINALITY AS raw(value, ordinality)
  LEFT JOIN public.ingredients AS ingredient
    ON ingredient.tenant_id = v_tenant
   AND ingredient.name = btrim(raw.value ->> 'name');

  RETURN private.execute_bulk_import_ingredients(v_sanitized_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_ingredients(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_import_ingredients(jsonb)
TO authenticated, service_role;

ALTER TABLE public.ingredients
  ALTER COLUMN unit_cost SET DEFAULT 0;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.ingredients
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ingredients_id_seq
FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.toggle_ingredient_active(
  p_id bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_new_state boolean;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner'
     OR NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.ingredients
  SET is_active = NOT is_active,
      updated_at = now()
  WHERE id = p_id
    AND tenant_id = v_tenant
  RETURNING is_active INTO v_new_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_new_state;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_ingredient_active(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_ingredient_active(bigint)
TO authenticated, service_role;

DROP POLICY IF EXISTS ingredient_units_insert
  ON public.ingredient_units;
DROP POLICY IF EXISTS ingredient_units_update
  ON public.ingredient_units;
DROP POLICY IF EXISTS ingredient_units_delete
  ON public.ingredient_units;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.ingredient_units
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ingredient_units_id_seq
FROM anon, authenticated;

DROP POLICY IF EXISTS units_insert
  ON public.units;
DROP POLICY IF EXISTS units_update
  ON public.units;
DROP POLICY IF EXISTS units_delete
  ON public.units;

CREATE POLICY units_insert
ON public.units
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:units_master')
);

CREATE POLICY units_update
ON public.units
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:units_master')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:units_master')
);

CREATE POLICY units_delete
ON public.units
FOR DELETE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:units_master')
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.units
FROM anon;
REVOKE ALL ON SEQUENCE public.units_id_seq
FROM anon;

DROP POLICY IF EXISTS ingredient_categories_insert
  ON public.ingredient_categories;
DROP POLICY IF EXISTS ingredient_categories_update
  ON public.ingredient_categories;
DROP POLICY IF EXISTS ingredient_categories_delete
  ON public.ingredient_categories;

CREATE POLICY ingredient_categories_insert
ON public.ingredient_categories
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:write')
);

CREATE POLICY ingredient_categories_update
ON public.ingredient_categories
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:write')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:write')
);

CREATE POLICY ingredient_categories_delete
ON public.ingredient_categories
FOR DELETE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = 'owner'
  AND public.has_permission_any('inventory:write')
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.ingredient_categories
FROM anon;
REVOKE ALL ON SEQUENCE public.ingredient_categories_id_seq
FROM anon;

DROP POLICY IF EXISTS stock_levels_insert
  ON public.stock_levels;
DROP POLICY IF EXISTS stock_levels_update
  ON public.stock_levels;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.stock_levels
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.stock_levels_id_seq
FROM anon, authenticated;

DROP POLICY IF EXISTS stock_transfers_insert
  ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_update
  ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfer_items_write
  ON public.stock_transfer_items;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.stock_transfers
FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.stock_transfer_items
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.stock_transfers_id_seq
FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.stock_transfer_items_id_seq
FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.production_orders
  ) OR EXISTS (
    SELECT 1
    FROM public.production_order_items
  ) OR EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE production_order_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'production_order_retirement_preflight_failed'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_production_order(
  bigint,
  text,
  text,
  jsonb
);
DROP FUNCTION IF EXISTS public.confirm_production_order(bigint);
DROP FUNCTION IF EXISTS public.cancel_production_order(bigint);
DROP TRIGGER IF EXISTS trg_production_orders_central_kitchen_only
  ON public.production_orders;
DROP FUNCTION IF EXISTS public.ensure_production_order_central_kitchen();

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_production_order_id_fkey;
ALTER TABLE public.stock_movements
  DROP COLUMN IF EXISTS production_order_id;

DROP TABLE public.production_order_items;
DROP TABLE public.production_orders;

CREATE OR REPLACE FUNCTION private.assert_stock_transfer_warehouse_endpoints(
  p_transfer_id bigint,
  p_tenant_id bigint
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_transfer public.stock_transfers%ROWTYPE;
BEGIN
  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM branch.id
  FROM public.branches AS branch
  WHERE branch.id = ANY(ARRAY[
    v_transfer.from_branch_id,
    v_transfer.to_branch_id
  ]::bigint[])
  ORDER BY branch.id
  FOR UPDATE OF branch;

  PERFORM location.id
  FROM public.inventory_locations AS location
  WHERE location.id = ANY(ARRAY[
    v_transfer.from_location_id,
    v_transfer.to_location_id
  ]::bigint[])
  ORDER BY location.id
  FOR UPDATE;

  IF v_transfer.from_branch_id = v_transfer.to_branch_id THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.branches AS source_branch
       WHERE source_branch.id = v_transfer.from_branch_id
         AND source_branch.tenant_id = p_tenant_id
         AND source_branch.is_active IS TRUE
         AND source_branch.branch_kind IN (
           'branch',
           'central_supply',
           'central_kitchen'
         )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.branches AS target_branch
       WHERE target_branch.id = v_transfer.to_branch_id
         AND target_branch.tenant_id = p_tenant_id
         AND target_branch.is_active IS TRUE
         AND target_branch.branch_kind IN (
           'branch',
           'central_supply',
           'central_kitchen'
         )
     ) THEN
    RAISE EXCEPTION 'transfer_branch_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM public.inventory_locations AS source_location
       WHERE source_location.id = v_transfer.from_location_id
         AND source_location.tenant_id = p_tenant_id
         AND source_location.branch_id = v_transfer.from_branch_id
         AND source_location.location_kind = 'warehouse'
         AND source_location.is_active IS TRUE
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.inventory_locations AS target_location
       WHERE target_location.id = v_transfer.to_location_id
         AND target_location.tenant_id = p_tenant_id
         AND target_location.branch_id = v_transfer.to_branch_id
         AND target_location.location_kind = 'warehouse'
         AND target_location.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  private.assert_stock_transfer_warehouse_endpoints(bigint, bigint)
FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.stock_transfer_mark_in_transit(bigint)
SET SCHEMA private;
ALTER FUNCTION private.stock_transfer_mark_in_transit(bigint)
RENAME TO execute_stock_transfer_mark_in_transit;
ALTER FUNCTION private.execute_stock_transfer_mark_in_transit(bigint)
SET search_path TO '';
REVOKE ALL ON FUNCTION
  private.execute_stock_transfer_mark_in_transit(bigint)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.stock_transfer_mark_in_transit(
  p_transfer_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  RETURN private.execute_stock_transfer_mark_in_transit(
    p_transfer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_mark_in_transit(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.stock_transfer_mark_in_transit(bigint)
TO authenticated, service_role;

ALTER FUNCTION public.stock_transfer_confirm_receive(bigint)
SET SCHEMA private;
ALTER FUNCTION private.stock_transfer_confirm_receive(bigint)
RENAME TO execute_stock_transfer_confirm_receive;
ALTER FUNCTION private.execute_stock_transfer_confirm_receive(bigint)
SET search_path TO '';
REVOKE ALL ON FUNCTION
  private.execute_stock_transfer_confirm_receive(bigint)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.stock_transfer_confirm_receive(
  p_transfer_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  RETURN private.execute_stock_transfer_confirm_receive(
    p_transfer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_receive(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.stock_transfer_confirm_receive(bigint)
TO authenticated, service_role;

ALTER FUNCTION public.stock_transfer_receive(bigint, jsonb)
SET SCHEMA private;
ALTER FUNCTION private.stock_transfer_receive(bigint, jsonb)
RENAME TO execute_stock_transfer_receive;
ALTER FUNCTION private.execute_stock_transfer_receive(bigint, jsonb)
SET search_path TO '';
REVOKE ALL ON FUNCTION
  private.execute_stock_transfer_receive(bigint, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.stock_transfer_receive(
  p_transfer_id bigint,
  p_items jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_key text;
  v_value jsonb;
  v_ingredient_id bigint;
  v_received_quantity numeric;
  v_sent_quantity numeric;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'object' THEN
      RAISE EXCEPTION 'transfer_receive_items_invalid'
        USING ERRCODE = '22023';
    END IF;

    FOR v_key, v_value IN
      SELECT item.key, item.value
      FROM jsonb_each(p_items) AS item(key, value)
    LOOP
      v_ingredient_id := v_key::bigint;
      v_received_quantity := CASE
        WHEN jsonb_typeof(v_value) = 'object'
          THEN nullif(v_value ->> 'qty', '')::numeric
        ELSE nullif(v_value #>> '{}', '')::numeric
      END;

      SELECT transfer_item.quantity
      INTO v_sent_quantity
      FROM public.stock_transfer_items AS transfer_item
      JOIN public.stock_transfers AS transfer
        ON transfer.id = transfer_item.transfer_id
       AND transfer.tenant_id = transfer_item.tenant_id
      WHERE transfer_item.transfer_id = p_transfer_id
        AND transfer_item.tenant_id = v_tenant
        AND transfer_item.ingredient_id = v_ingredient_id
      FOR UPDATE OF transfer_item;

      IF NOT FOUND
         OR v_received_quantity IS NULL
         OR v_received_quantity < 0
         OR v_received_quantity > v_sent_quantity
         OR v_received_quantity = 'NaN'::numeric
         OR v_received_quantity = 'Infinity'::numeric
         OR v_received_quantity = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'invalid_receive_qty:%', v_ingredient_id
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  RETURN private.execute_stock_transfer_receive(
    p_transfer_id,
    p_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(bigint, jsonb)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_transfer_list_branches()
RETURNS TABLE(
  id bigint,
  name text,
  branch_kind text,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_branch_claim bigint := public.auth_branch_id();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN (
    'owner',
    'branch_manager',
    'central_supply_ops',
    'central_kitchen_lead'
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    candidate.id,
    candidate.name,
    candidate.branch_kind,
    candidate.is_active
  FROM public.branches AS candidate
  WHERE candidate.tenant_id = v_tenant
    AND candidate.is_active IS TRUE
    AND candidate.branch_kind IN (
      'branch',
      'central_supply',
      'central_kitchen'
    )
    AND EXISTS (
      SELECT 1
      FROM public.inventory_locations AS warehouse
      WHERE warehouse.tenant_id = v_tenant
        AND warehouse.branch_id = candidate.id
        AND warehouse.location_kind = 'warehouse'
        AND warehouse.is_active IS TRUE
    )
    AND (
      v_role = 'owner'
      OR (
        v_branch_claim IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.branches AS actor_site
          WHERE actor_site.id = v_branch_claim
            AND actor_site.tenant_id = v_tenant
            AND actor_site.is_active IS TRUE
            AND actor_site.branch_kind = CASE v_role
              WHEN 'branch_manager' THEN 'branch'
              WHEN 'central_supply_ops' THEN 'central_supply'
              WHEN 'central_kitchen_lead' THEN 'central_kitchen'
            END
        )
        AND (
          (
            v_role = 'branch_manager'
            AND (
              candidate.id = v_branch_claim
              OR candidate.branch_kind IN (
                'central_supply',
                'central_kitchen'
              )
            )
          )
          OR (
            v_role = 'central_supply_ops'
            AND (
              candidate.id = v_branch_claim
              OR candidate.branch_kind IN (
                'branch',
                'central_kitchen'
              )
            )
          )
          OR (
            v_role = 'central_kitchen_lead'
            AND (
              candidate.id = v_branch_claim
              OR candidate.branch_kind IN (
                'branch',
                'central_supply'
              )
            )
          )
        )
      )
    )
  ORDER BY candidate.name;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_list_branches()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_list_branches()
TO authenticated, service_role;

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES
  (
    'inventory:transfer_create',
    'inventory',
    'Create inventory transfers',
    'branch',
    FALSE
  ),
  (
    'inventory:transfer_ship',
    'inventory',
    'Ship inventory transfers',
    'branch',
    TRUE
  ),
  (
    'inventory:transfer_receive',
    'inventory',
    'Receive inventory transfers',
    'branch',
    TRUE
  )
ON CONFLICT (key) DO UPDATE
SET is_delegable_to_staff =
  EXCLUDED.is_delegable_to_staff;

UPDATE public.role_templates AS template
SET permission_keys = array_remove(
      template.permission_keys,
      'inventory:transfer_create'
    ),
    updated_at = now()
WHERE template.position_code IS DISTINCT FROM 'owner'
  AND template.permission_keys @> ARRAY[
    'inventory:transfer_create'
  ]::text[];

DELETE FROM public.staff_permissions
WHERE permission_key = 'inventory:transfer_create';

UPDATE public.role_templates AS template
SET permission_keys = (
      SELECT array_agg(
        DISTINCT permission.permission_key
        ORDER BY permission.permission_key
      )
      FROM unnest(
        template.permission_keys
        || ARRAY[
          'inventory:transfer_ship',
          'inventory:transfer_receive'
        ]::text[]
      ) AS permission(permission_key)
      WHERE permission.permission_key
        <> 'inventory:transfer_create'
    ),
    updated_at = now()
WHERE template.position_code IN (
  'central_supply_ops',
  'central_kitchen_lead'
);

DELETE FROM public.staff_permissions AS permission
USING public.profiles AS profile,
      public.positions AS position
WHERE profile.id = permission.user_id
  AND profile.tenant_id = permission.tenant_id
  AND position.id = profile.position_id
  AND position.tenant_id = profile.tenant_id
  AND position.code IN (
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
  );

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  profile.id,
  profile.tenant_id,
  profile.branch_id,
  permission.permission_key,
  template.id,
  NULL
FROM public.profiles AS profile
JOIN public.positions AS position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
JOIN public.branches AS branch
  ON branch.id = profile.branch_id
 AND branch.tenant_id = profile.tenant_id
 AND branch.is_active IS TRUE
JOIN public.role_templates AS template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = position.code
CROSS JOIN (
  VALUES
    ('inventory:transfer_ship'::text),
    ('inventory:transfer_receive'::text)
) AS permission(permission_key)
WHERE position.code IN (
    'central_supply_ops',
    'central_kitchen_lead'
  )
  AND coalesce(profile.is_active, TRUE) IS TRUE
  AND branch.branch_kind = CASE position.code
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
  END
ON CONFLICT DO NOTHING;

COMMENT ON FUNCTION public.create_stocktake_session(bigint, bigint) IS
  'Creates a stocktake at the site warehouse; omitted locations resolve through the warehouse defaults.';
COMMENT ON FUNCTION public.start_stocktake(
  bigint,
  bigint,
  text,
  boolean,
  uuid,
  numeric,
  numeric
) IS
  'Starts a stocktake at the site warehouse; omitted locations resolve through the warehouse defaults.';
COMMENT ON FUNCTION public.set_inventory_count_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  bigint
) IS
  'Assigns inventory counts for the selected site warehouse.';
COMMENT ON FUNCTION public.submit_inventory_count_slip(
  bigint,
  bigint,
  jsonb,
  bigint
) IS
  'Submits assigned inventory counts for the selected site warehouse.';
COMMENT ON FUNCTION public.enforce_branch_stock_availability() IS
  'Blocks stock-controlled order demand that exceeds the active branch warehouse balance when POS stock posting is enabled.';
COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(
  bigint,
  uuid
) IS
  'Posts ready paid-order consumption at the active branch warehouse and returns a fail-soft result when stock is insufficient.';

CREATE OR REPLACE FUNCTION public.acquire_zone_lock(
  p_session_id bigint,
  p_zone_id text,
  p_ttl_seconds integer DEFAULT 1800
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch bigint;
  v_existing record;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_ttl_seconds <= 0 OR p_ttl_seconds > 7200 THEN
    RAISE EXCEPTION 'ttl_seconds must be in (0, 7200]'
      USING ERRCODE = '22023';
  END IF;

  SELECT session.branch_id
  INTO v_branch
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_branch,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.stocktake_zone_locks
  WHERE tenant_id = v_tenant
    AND session_id = p_session_id
    AND zone_id = p_zone_id
    AND expires_at <= now();

  INSERT INTO public.stocktake_zone_locks (
    tenant_id,
    session_id,
    zone_id,
    locked_by,
    acquired_at,
    last_heartbeat_at,
    expires_at
  )
  VALUES (
    v_tenant,
    p_session_id,
    p_zone_id,
    v_uid,
    now(),
    now(),
    now() + make_interval(secs => p_ttl_seconds)
  )
  ON CONFLICT (session_id, zone_id) DO UPDATE
  SET locked_by = CASE
        WHEN public.stocktake_zone_locks.locked_by = v_uid
          THEN v_uid
        ELSE public.stocktake_zone_locks.locked_by
      END,
      acquired_at = CASE
        WHEN public.stocktake_zone_locks.locked_by = v_uid
          THEN now()
        ELSE public.stocktake_zone_locks.acquired_at
      END,
      last_heartbeat_at = CASE
        WHEN public.stocktake_zone_locks.locked_by = v_uid
          THEN now()
        ELSE public.stocktake_zone_locks.last_heartbeat_at
      END,
      expires_at = CASE
        WHEN public.stocktake_zone_locks.locked_by = v_uid
          THEN now() + make_interval(secs => p_ttl_seconds)
        ELSE public.stocktake_zone_locks.expires_at
      END
  WHERE public.stocktake_zone_locks.tenant_id = v_tenant
    AND public.stocktake_zone_locks.locked_by = v_uid;

  SELECT lock.*
  INTO v_existing
  FROM public.stocktake_zone_locks AS lock
  WHERE lock.tenant_id = v_tenant
    AND lock.session_id = p_session_id
    AND lock.zone_id = p_zone_id;

  RETURN jsonb_build_object(
    'acquired',
    v_existing.locked_by = v_uid,
    'locked_by',
    v_existing.locked_by,
    'expires_at',
    v_existing.expires_at,
    'acquired_at',
    v_existing.acquired_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_auditor(
  p_session_id bigint,
  p_auditor_id uuid,
  p_auditor_branch_id bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.branch_id
  INTO v_branch
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_branch,
    'inventory:stocktake_recount'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stocktake_sessions
  SET auditor_id = p_auditor_id,
      auditor_branch_id = p_auditor_branch_id,
      is_unaudited = FALSE
  WHERE id = p_session_id
    AND tenant_id = v_tenant;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_recount_round(
  p_session_id bigint,
  p_round_no smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
  v_need integer := 0;
  v_final integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_recount'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress'
      USING ERRCODE = '22023';
  END IF;
  IF p_round_no <> v_session.current_round THEN
    RAISE EXCEPTION 'round % does not match current_round %',
      p_round_no,
      v_session.current_round
      USING ERRCODE = '22023';
  END IF;

  WITH latest AS (
    SELECT
      line.id,
      line.ingredient_id,
      line.counted_quantity,
      line.system_quantity,
      line.abc_class,
      coalesce(line.counted_quantity, 0)
        - coalesce(line.system_quantity, 0) AS delta,
      CASE
        WHEN line.system_quantity IS NULL
          OR line.system_quantity = 0 THEN NULL
        ELSE abs(
          coalesce(line.counted_quantity, 0)
            - line.system_quantity
        ) / line.system_quantity
      END AS pct
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = p_round_no
  ),
  decided AS (
    SELECT
      latest.*,
      CASE
        WHEN latest.counted_quantity IS NULL THEN FALSE
        WHEN latest.abc_class = 'A' THEN
          coalesce(latest.pct, 0)
            > v_session.variance_threshold_pct_class_a / 100.0
          OR abs(latest.delta) > (
            v_session.variance_threshold_vnd_class_a
            / greatest((
              SELECT stock.avg_unit_cost
              FROM public.stock_levels AS stock
              WHERE stock.tenant_id = v_tenant
                AND stock.branch_id = v_session.branch_id
                AND stock.location_id = v_session.location_id
                AND stock.ingredient_id = latest.ingredient_id
              LIMIT 1
            ), 1)
          )
        ELSE
          coalesce(latest.pct, 0)
            > v_session.variance_threshold_pct / 100.0
          OR abs(latest.delta) > (
            v_session.variance_threshold_vnd
            / greatest((
              SELECT stock.avg_unit_cost
              FROM public.stock_levels AS stock
              WHERE stock.tenant_id = v_tenant
                AND stock.branch_id = v_session.branch_id
                AND stock.location_id = v_session.location_id
                AND stock.ingredient_id = latest.ingredient_id
              LIMIT 1
            ), 1)
          )
      END AS needs_recount
    FROM latest
  )
  UPDATE public.stocktake_lines AS line
  SET needs_recount = decided.needs_recount,
      is_final = NOT decided.needs_recount
  FROM decided
  WHERE line.id = decided.id
    AND line.tenant_id = v_tenant;

  IF p_round_no > 1 THEN
    WITH converged AS (
      SELECT DISTINCT line.ingredient_id
      FROM public.stocktake_lines AS line
      WHERE line.tenant_id = v_tenant
        AND line.session_id = p_session_id
        AND line.round_no = p_round_no
        AND NOT line.needs_recount
    ),
    medians AS (
      SELECT
        line.ingredient_id,
        percentile_cont(0.5)
          WITHIN GROUP (ORDER BY line.counted_quantity) AS median
      FROM public.stocktake_lines AS line
      WHERE line.tenant_id = v_tenant
        AND line.session_id = p_session_id
        AND line.counted_quantity IS NOT NULL
        AND line.ingredient_id IN (
          SELECT converged.ingredient_id
          FROM converged
        )
      GROUP BY line.ingredient_id
      HAVING count(*) >= 2
    )
    UPDATE public.stocktake_lines AS line
    SET counted_quantity = medians.median,
        is_final = TRUE,
        needs_recount = FALSE
    FROM medians
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.ingredient_id = medians.ingredient_id
      AND line.round_no = 1;
  END IF;

  SELECT
    count(*) FILTER (WHERE line.needs_recount),
    count(*) FILTER (WHERE line.is_final)
  INTO v_need, v_final
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = p_session_id
    AND line.round_no = p_round_no;

  IF v_need > 0 AND v_session.current_round < 4 THEN
    UPDATE public.stocktake_sessions
    SET current_round = v_session.current_round + 1
    WHERE id = p_session_id
      AND tenant_id = v_tenant;
  END IF;

  RETURN jsonb_build_object(
    'round_no',
    p_round_no,
    'needs_recount_count',
    v_need,
    'final_count',
    v_final,
    'next_round',
    CASE
      WHEN v_need > 0 AND v_session.current_round < 4
        THEN v_session.current_round + 1
      ELSE NULL
    END,
    'round_4_escalation_required',
    v_need > 0 AND v_session.current_round >= 3
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_offline_for_session(
  p_session_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(NULL, 'settings:tenant') THEN
    RAISE EXCEPTION
      'forbidden: settings:tenant required for offline pilot'
      USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress (status=%)',
      v_session.status
      USING ERRCODE = '22023';
  END IF;
  IF v_session.offline_enabled THEN
    RAISE EXCEPTION 'offline already enabled for session %',
      p_session_id
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.stocktake_sessions
  SET offline_enabled = TRUE,
      offline_enabled_by = v_uid,
      offline_enabled_at = now()
  WHERE id = p_session_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'session_id',
    p_session_id,
    'offline_enabled',
    TRUE,
    'enabled_by',
    v_uid,
    'enabled_at',
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate_round_4(
  p_session_id bigint,
  p_ingredient_id bigint,
  p_final_qty numeric,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_recount'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress'
      USING ERRCODE = '22023';
  END IF;
  IF v_session.current_round <> 4 THEN
    RAISE EXCEPTION 'round_4_not_active'
      USING ERRCODE = '22023';
  END IF;
  IF p_final_qty IS NULL
     OR p_final_qty < 0
     OR p_final_qty = 'NaN'::numeric
     OR p_final_qty = 'Infinity'::numeric
     OR p_final_qty = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'final_quantity_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_note, '')) < 20 THEN
    RAISE EXCEPTION
      'escalation note must be at least 20 characters'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stocktake_lines (
    tenant_id,
    session_id,
    ingredient_id,
    system_quantity,
    counted_quantity,
    counted_by,
    counted_at,
    round_no,
    variance_reason,
    is_final,
    needs_recount,
    abc_class,
    entry_unit_id
  )
  SELECT
    v_tenant,
    p_session_id,
    p_ingredient_id,
    round_one.system_quantity,
    p_final_qty,
    v_uid,
    now(),
    4,
    '[ROUND4] ' || p_note,
    TRUE,
    FALSE,
    round_one.abc_class,
    round_one.entry_unit_id
  FROM public.stocktake_lines AS round_one
  WHERE round_one.tenant_id = v_tenant
    AND round_one.session_id = p_session_id
    AND round_one.ingredient_id = p_ingredient_id
    AND round_one.round_no = 1
  ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE
  SET counted_quantity = EXCLUDED.counted_quantity,
      counted_by = EXCLUDED.counted_by,
      counted_at = EXCLUDED.counted_at,
      variance_reason = EXCLUDED.variance_reason,
      is_final = TRUE,
      entry_unit_id = EXCLUDED.entry_unit_id;

  UPDATE public.stocktake_lines
  SET counted_quantity = p_final_qty,
      is_final = TRUE,
      needs_recount = FALSE,
      variance_reason = coalesce(variance_reason, '')
        || E'\n[ROUND4 escalated by '
        || v_uid::text
        || ']'
  WHERE tenant_id = v_tenant
    AND session_id = p_session_id
    AND ingredient_id = p_ingredient_id
    AND round_no = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_stocktake(
  p_session_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
  v_pending integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_complete'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_pending
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = p_session_id
    AND line.round_no = 1
    AND line.is_final = FALSE;

  IF v_pending > 0 THEN
    RAISE EXCEPTION
      'cannot finalize: % round-1 line(s) still not final',
      v_pending
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.stocktake_sessions
  SET status = 'completed',
      completed_at = now()
  WHERE id = p_session_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'session_id',
    p_session_id,
    'status',
    'completed',
    'completed_at',
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_stocktake_conflict(
  p_conflict_id bigint,
  p_resolution text,
  p_manual_qty numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_conflict public.stocktake_conflicts%ROWTYPE;
  v_session public.stocktake_sessions%ROWTYPE;
  v_session_id bigint;
  v_final_qty numeric;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_resolution NOT IN (
    'keep_server',
    'apply_client',
    'manual_value',
    'reject'
  ) THEN
    RAISE EXCEPTION 'invalid resolution' USING ERRCODE = '22023';
  END IF;

  SELECT conflict.session_id
  INTO v_session_id
  FROM public.stocktake_conflicts AS conflict
  WHERE conflict.id = p_conflict_id
    AND conflict.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conflict not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = v_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_recount'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress'
      USING ERRCODE = '22023';
  END IF;

  SELECT conflict.*
  INTO v_conflict
  FROM public.stocktake_conflicts AS conflict
  WHERE conflict.id = p_conflict_id
    AND conflict.tenant_id = v_tenant
    AND conflict.session_id = v_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conflict not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_conflict.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'conflict already resolved'
      USING ERRCODE = '22023';
  END IF;

  v_final_qty := CASE p_resolution
    WHEN 'keep_server'
      THEN (v_conflict.server_payload
        ->> 'existing_counted_quantity')::numeric
    WHEN 'apply_client'
      THEN (v_conflict.client_payload ->> 'counted_quantity')::numeric
    WHEN 'manual_value' THEN p_manual_qty
    WHEN 'reject' THEN NULL
  END;

  IF p_resolution = 'manual_value' AND p_manual_qty IS NULL THEN
    RAISE EXCEPTION 'manual_qty required' USING ERRCODE = '22023';
  END IF;
  IF p_resolution <> 'reject'
     AND (
       v_final_qty IS NULL
       OR v_final_qty < 0
       OR v_final_qty = 'NaN'::numeric
       OR v_final_qty = 'Infinity'::numeric
       OR v_final_qty = '-Infinity'::numeric
     ) THEN
    RAISE EXCEPTION 'resolution_quantity_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF p_resolution <> 'reject' AND v_final_qty IS NOT NULL THEN
    UPDATE public.stocktake_lines
    SET counted_quantity = v_final_qty,
        counted_by = v_uid,
        counted_at = now(),
        variance_reason = coalesce(variance_reason, '')
          || E'\n[conflict#'
          || p_conflict_id::text
          || ' resolved='
          || p_resolution
          || coalesce(': ' || p_note, '')
          || ']'
    WHERE tenant_id = v_tenant
      AND session_id = v_conflict.session_id
      AND ingredient_id = v_conflict.ingredient_id
      AND round_no = v_conflict.round_no;
  END IF;

  UPDATE public.stocktake_conflicts
  SET resolved_at = now(),
      resolved_by = v_uid,
      resolution = p_resolution,
      resolution_qty = v_final_qty,
      resolution_note = p_note
  WHERE id = p_conflict_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'conflict_id',
    p_conflict_id,
    'resolution',
    p_resolution,
    'final_qty',
    v_final_qty,
    'resolved_at',
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_count_round(
  p_session_id bigint,
  p_round_no smallint,
  p_counts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
  v_count jsonb;
  v_applied integer := 0;
  v_conflict_count integer := 0;
  v_existing record;
  v_offline_at timestamptz;
  v_ingredient bigint;
  v_counted numeric;
  v_op_id uuid;
  v_entry_unit bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress (status=%)',
      v_session.status
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_round_no <> v_session.current_round THEN
    RAISE EXCEPTION 'round % does not match current_round %',
      p_round_no,
      v_session.current_round
      USING ERRCODE = '22023';
  END IF;

  FOR v_count IN
    SELECT element.value
    FROM jsonb_array_elements(p_counts) AS element(value)
  LOOP
    v_ingredient := (v_count ->> 'ingredient_id')::bigint;
    v_counted := (v_count ->> 'counted_quantity')::numeric;
    v_op_id := nullif(v_count ->> 'client_op_id', '')::uuid;
    v_offline_at := nullif(
      v_count ->> 'offline_created_at',
      ''
    )::timestamptz;
    v_entry_unit := nullif(v_count ->> 'entry_unit_id', '')::bigint;

    IF v_ingredient IS NULL
       OR v_counted IS NULL
       OR v_counted < 0
       OR v_counted = 'NaN'::numeric
       OR v_counted = 'Infinity'::numeric
       OR v_counted = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'counted_quantity_invalid'
        USING ERRCODE = '22023';
    END IF;

    IF v_session.offline_enabled AND v_offline_at IS NOT NULL
       AND (
         v_offline_at > now() + interval '5 minutes'
         OR v_offline_at < v_session.started_at
       ) THEN
      INSERT INTO public.stocktake_conflicts (
        tenant_id,
        session_id,
        ingredient_id,
        round_no,
        conflict_type,
        client_payload,
        submitted_by
      )
      VALUES (
        v_tenant,
        p_session_id,
        v_ingredient,
        p_round_no,
        'clock_tamper',
        jsonb_build_object(
          'client_op_id',
          v_op_id,
          'offline_created_at',
          v_offline_at,
          'counted_quantity',
          v_counted
        ),
        v_uid
      );
      v_conflict_count := v_conflict_count + 1;
      CONTINUE;
    END IF;

    SELECT
      line.id,
      line.counted_quantity,
      line.is_final
    INTO v_existing
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.ingredient_id = v_ingredient
      AND line.round_no = p_round_no;

    IF FOUND
       AND v_existing.is_final
       AND v_existing.counted_quantity IS DISTINCT FROM v_counted THEN
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
        v_tenant,
        p_session_id,
        v_ingredient,
        p_round_no,
        'is_final_overwrite',
        jsonb_build_object(
          'client_op_id',
          v_op_id,
          'counted_quantity',
          v_counted,
          'offline_created_at',
          v_offline_at
        ),
        jsonb_build_object(
          'existing_counted_quantity',
          v_existing.counted_quantity,
          'is_final',
          TRUE
        ),
        v_uid
      );
      v_conflict_count := v_conflict_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.stocktake_lines (
      tenant_id,
      session_id,
      ingredient_id,
      system_quantity,
      counted_quantity,
      entry_unit_id,
      counted_by,
      counted_at,
      round_no,
      abc_class,
      client_op_id,
      offline_created_at
    )
    SELECT
      v_tenant,
      p_session_id,
      v_ingredient,
      round_one.system_quantity,
      v_counted,
      coalesce(v_entry_unit, round_one.entry_unit_id),
      v_uid,
      now(),
      p_round_no,
      round_one.abc_class,
      v_op_id,
      v_offline_at
    FROM public.stocktake_lines AS round_one
    WHERE round_one.tenant_id = v_tenant
      AND round_one.session_id = p_session_id
      AND round_one.ingredient_id = v_ingredient
      AND round_one.round_no = 1
    ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE
    SET counted_quantity = EXCLUDED.counted_quantity,
        entry_unit_id = EXCLUDED.entry_unit_id,
        counted_by = EXCLUDED.counted_by,
        counted_at = EXCLUDED.counted_at,
        client_op_id = coalesce(
          EXCLUDED.client_op_id,
          public.stocktake_lines.client_op_id
        ),
        offline_created_at = coalesce(
          EXCLUDED.offline_created_at,
          public.stocktake_lines.offline_created_at
        );

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_count',
    v_applied,
    'conflict_count',
    v_conflict_count,
    'round_no',
    p_round_no
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_waste(
  p_issue_id bigint,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue public.stock_issues%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected'
      USING ERRCODE = '22023';
  END IF;

  SELECT issue.*
  INTO v_issue
  FROM public.stock_issues AS issue
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.issue_type <> 'writeoff' THEN
    RAISE EXCEPTION 'issue is not a writeoff'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    v_issue.branch_id,
    'inventory:waste_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_issue.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'issue is not pending approval (status=%)',
      v_issue.approval_status
      USING ERRCODE = '22023';
  END IF;
  IF v_issue.created_by = v_uid
     AND NOT public.has_permission(
       NULL,
       'accounting:period_reopen'
     ) THEN
    RAISE EXCEPTION
      'self-approval forbidden: approver cannot be the creator'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.stock_issues
    SET approval_status = 'approved',
        approved_by = v_uid,
        approved_at = now(),
        notes = coalesce(notes, '')
          || CASE
               WHEN p_note IS NOT NULL
                 THEN E'\n[approved by '
                   || v_uid::text
                   || '] '
                   || p_note
               ELSE ''
             END
    WHERE id = p_issue_id
      AND tenant_id = v_tenant;

    PERFORM public._post_writeoff_movements(p_issue_id);
  ELSE
    UPDATE public.stock_issues
    SET approval_status = 'rejected',
        approved_by = v_uid,
        approved_at = now(),
        status = 'cancelled',
        notes = coalesce(notes, '')
          || CASE
               WHEN p_note IS NOT NULL
                 THEN E'\n[rejected by '
                   || v_uid::text
                   || '] '
                   || p_note
               ELSE ''
             END
    WHERE id = p_issue_id
      AND tenant_id = v_tenant;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_stock_issue_status_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       OLD.status = 'draft'
       AND NEW.status = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'stock_issue_status_rpc_only'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_stock_issue_status_authority()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_stock_issue_status_authority()
TO service_role;

DROP TRIGGER IF EXISTS trg_stock_issue_status_authority
ON public.stock_issues;
CREATE TRIGGER trg_stock_issue_status_authority
BEFORE UPDATE OF status
ON public.stock_issues
FOR EACH ROW
EXECUTE FUNCTION private.enforce_stock_issue_status_authority();

CREATE OR REPLACE FUNCTION private.enforce_stock_issue_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_stock_issue_creator()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_stock_issue_creator()
TO service_role;

DROP TRIGGER IF EXISTS trg_stock_issue_creator
ON public.stock_issues;
CREATE TRIGGER trg_stock_issue_creator
BEFORE INSERT
ON public.stock_issues
FOR EACH ROW
EXECUTE FUNCTION private.enforce_stock_issue_creator();

REVOKE INSERT, UPDATE, DELETE ON public.stock_issues
FROM PUBLIC, anon, authenticated;
GRANT INSERT (
  tenant_id,
  branch_id,
  issue_number,
  issue_type,
  status,
  notes,
  created_by,
  source_location_id,
  target_location_id
) ON public.stock_issues TO authenticated;
GRANT UPDATE (status) ON public.stock_issues TO authenticated;

DROP POLICY IF EXISTS stock_issues_insert
ON public.stock_issues;
CREATE POLICY stock_issues_insert
ON public.stock_issues
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND created_by = auth.uid()
  AND status = 'draft'
  AND public.has_permission(branch_id, 'inventory:write')
);

REVOKE INSERT, UPDATE ON public.stock_issue_items
FROM PUBLIC, anon, authenticated;
GRANT INSERT (
  tenant_id,
  issue_id,
  ingredient_id,
  quantity,
  entry_unit_id,
  unit_cost,
  reason,
  photo_urls
) ON public.stock_issue_items TO authenticated;
GRANT UPDATE (
  tenant_id,
  issue_id,
  ingredient_id,
  quantity,
  entry_unit_id,
  unit_cost,
  reason,
  photo_urls
) ON public.stock_issue_items TO authenticated;
GRANT DELETE ON public.stock_issue_items TO authenticated;

DROP POLICY IF EXISTS stock_issues_update
ON public.stock_issues;
CREATE POLICY stock_issues_update
ON public.stock_issues
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND created_by = auth.uid()
  AND status = 'draft'
  AND (
    issue_type <> 'writeoff'
    OR approval_status = 'not_required'
  )
  AND public.has_permission(branch_id, 'inventory:write')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND created_by = auth.uid()
  AND status = 'cancelled'
  AND (
    issue_type <> 'writeoff'
    OR approval_status = 'not_required'
  )
  AND public.has_permission(branch_id, 'inventory:write')
);

DROP POLICY IF EXISTS stock_issue_items_write
ON public.stock_issue_items;
CREATE POLICY stock_issue_items_write
ON public.stock_issue_items
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.stock_issues AS issue
    WHERE issue.id = stock_issue_items.issue_id
      AND issue.tenant_id = stock_issue_items.tenant_id
      AND issue.created_by = auth.uid()
      AND issue.status = 'draft'
      AND (
        issue.issue_type <> 'writeoff'
        OR issue.approval_status = 'not_required'
      )
      AND public.has_permission(
        issue.branch_id,
        'inventory:write'
      )
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.stock_issues AS issue
    WHERE issue.id = stock_issue_items.issue_id
      AND issue.tenant_id = stock_issue_items.tenant_id
      AND issue.created_by = auth.uid()
      AND issue.status = 'draft'
      AND (
        issue.issue_type <> 'writeoff'
        OR issue.approval_status = 'not_required'
      )
      AND public.has_permission(
        issue.branch_id,
        'inventory:write'
      )
  )
);

CREATE OR REPLACE FUNCTION public.create_stocktake_session(
  p_branch_id bigint,
  p_location_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session_id bigint;
  v_location_id bigint;
  v_session_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM 1
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND (
      p_location_id IS NULL
      OR location.id = p_location_id
    )
  ORDER BY
    location.is_default_consumption DESC,
    location.sort_order NULLS LAST,
    location.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = v_location_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.id = ingredient_unit.unit_id
         AND unit.tenant_id = ingredient_unit.tenant_id
         AND unit.is_active IS TRUE
        WHERE ingredient_unit.tenant_id = v_tenant
          AND ingredient_unit.ingredient_id = stock.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'stocktake_entry_unit_missing'
      USING ERRCODE = '23503';
  END IF;

  v_session_number := public.next_inventory_doc_number(
    v_tenant,
    'stocktake'
  );

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    location_id,
    created_by,
    session_number
  )
  VALUES (
    v_tenant,
    p_branch_id,
    v_location_id,
    v_uid,
    v_session_number
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (
    tenant_id,
    session_id,
    ingredient_id,
    system_quantity,
    entry_unit_id
  )
  SELECT
    v_tenant,
    v_session_id,
    stock.ingredient_id,
    stock.current_quantity,
    base_unit.unit_id
  FROM public.stock_levels AS stock
  JOIN LATERAL (
    SELECT ingredient_unit.unit_id
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = stock.ingredient_id
      AND ingredient_unit.is_base IS TRUE
      AND ingredient_unit.is_active IS TRUE
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1
  ) AS base_unit ON TRUE
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND stock.location_id = v_location_id;

  RETURN jsonb_build_object(
    'id',
    v_session_id,
    'session_number',
    v_session_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_stocktake(
  p_branch_id bigint,
  p_location_id bigint DEFAULT NULL,
  p_mode text DEFAULT 'daily',
  p_blind_mode boolean DEFAULT NULL,
  p_auditor_id uuid DEFAULT NULL,
  p_threshold_pct numeric DEFAULT NULL,
  p_threshold_vnd numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_blind boolean;
  v_session_id bigint;
  v_is_unaudited boolean := FALSE;
  v_rows integer := 0;
  v_location_id bigint;
  v_session_number text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_mode NOT IN (
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'spot'
  ) THEN
    RAISE EXCEPTION 'invalid mode' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND (
      p_location_id IS NULL
      OR location.id = p_location_id
    )
  ORDER BY
    location.is_default_consumption DESC,
    location.sort_order NULLS LAST,
    location.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_auditor_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = p_auditor_id
         AND profile.tenant_id = v_tenant
         AND coalesce(profile.is_active, TRUE) IS TRUE
     ) THEN
    RAISE EXCEPTION 'auditor_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_blind := coalesce(
    p_blind_mode,
    CASE p_mode
      WHEN 'daily' THEN FALSE
      WHEN 'weekly' THEN FALSE
      WHEN 'monthly' THEN TRUE
      WHEN 'quarterly' THEN TRUE
      WHEN 'spot' THEN TRUE
    END
  );
  IF p_mode IN ('monthly', 'quarterly')
     AND p_auditor_id IS NULL THEN
    v_is_unaudited := TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_branch_id
      AND stock.location_id = v_location_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.id = ingredient_unit.unit_id
         AND unit.tenant_id = ingredient_unit.tenant_id
         AND unit.is_active IS TRUE
        WHERE ingredient_unit.tenant_id = v_tenant
          AND ingredient_unit.ingredient_id = stock.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'stocktake_entry_unit_missing'
      USING ERRCODE = '23503';
  END IF;

  v_session_number := public.next_inventory_doc_number(
    v_tenant,
    'stocktake'
  );

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    location_id,
    status,
    started_at,
    created_by,
    mode,
    blind_mode,
    auditor_id,
    is_unaudited,
    variance_threshold_pct,
    variance_threshold_vnd,
    abc_snapshot_at,
    current_round,
    session_number
  )
  VALUES (
    v_tenant,
    p_branch_id,
    v_location_id,
    'in_progress',
    now(),
    v_uid,
    p_mode,
    v_blind,
    p_auditor_id,
    v_is_unaudited,
    coalesce(p_threshold_pct, 5.00),
    coalesce(p_threshold_vnd, 200000),
    now(),
    1,
    v_session_number
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (
    tenant_id,
    session_id,
    ingredient_id,
    system_quantity,
    round_no,
    abc_class,
    entry_unit_id
  )
  SELECT
    v_tenant,
    v_session_id,
    stock.ingredient_id,
    coalesce(stock.current_quantity, 0),
    1,
    public.get_ingredient_abc_class(
      p_branch_id,
      stock.ingredient_id
    ),
    base_unit.unit_id
  FROM public.stock_levels AS stock
  JOIN public.ingredients AS ingredient
    ON ingredient.id = stock.ingredient_id
   AND ingredient.tenant_id = stock.tenant_id
   AND ingredient.is_active IS TRUE
  JOIN LATERAL (
    SELECT ingredient_unit.unit_id
    FROM public.ingredient_units AS ingredient_unit
    JOIN public.units AS unit
      ON unit.id = ingredient_unit.unit_id
     AND unit.tenant_id = ingredient_unit.tenant_id
     AND unit.is_active IS TRUE
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = stock.ingredient_id
      AND ingredient_unit.is_base IS TRUE
      AND ingredient_unit.is_active IS TRUE
    ORDER BY ingredient_unit.sort_order, ingredient_unit.id
    LIMIT 1
  ) AS base_unit ON TRUE
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND stock.location_id = v_location_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'session_id',
    v_session_id,
    'session_number',
    v_session_number,
    'mode',
    p_mode,
    'blind_mode',
    v_blind,
    'is_unaudited',
    v_is_unaudited,
    'seeded_lines',
    v_rows,
    'abc_snapshot_at',
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_stocktake(
  p_session_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
  v_line record;
  v_fresh_quantity numeric(15,3);
  v_counted_base numeric(15,3);
  v_adjustment numeric(15,3);
  v_total_lines integer := 0;
  v_adjusted integer := 0;
  v_total_variance_abs numeric(15,3) := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_complete'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress'
      USING ERRCODE = '22023';
  END IF;

  PERFORM line.id
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = p_session_id
    AND line.round_no = 1
  ORDER BY line.ingredient_id
  FOR UPDATE OF line;

  IF EXISTS (
    SELECT 1
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
      AND line.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
      AND line.needs_recount IS TRUE
  ) THEN
    RAISE EXCEPTION 'recount_lines_exist'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT line.*
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
    ORDER BY line.ingredient_id
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT coalesce(stock.current_quantity, 0)
    INTO v_fresh_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_session.branch_id
      AND stock.location_id = v_session.location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_fresh_quantity := 0;
    END IF;

    v_counted_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.counted_quantity
    );
    v_adjustment := v_counted_base - v_fresh_quantity;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_variance_abs :=
        v_total_variance_abs + abs(v_adjustment);

      INSERT INTO public.stock_movements (
        tenant_id,
        branch_id,
        ingredient_id,
        type,
        quantity_change,
        reason,
        created_by,
        location_id,
        entry_unit_id,
        entry_quantity
      )
      VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        coalesce(
          v_line.variance_reason,
          'Stocktake #' || p_session_id::text
        ),
        v_uid,
        v_session.location_id,
        v_line.entry_unit_id,
        v_line.counted_quantity
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed',
      completed_at = now()
  WHERE id = p_session_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'success',
    TRUE,
    'session_id',
    p_session_id,
    'total_lines',
    v_total_lines,
    'adjusted_lines',
    v_adjusted,
    'total_variance_abs',
    v_total_variance_abs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inventory_count_assignments(
  p_branch_id bigint,
  p_location_id bigint,
  p_employee_id bigint,
  p_ingredient_ids bigint[],
  p_shift_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_ingredient_ids bigint[] :=
    coalesce(p_ingredient_ids, ARRAY[]::bigint[]);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM 1
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:count_assign'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_shift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.shifts AS shift
       WHERE shift.id = p_shift_id
         AND shift.tenant_id = v_tenant
         AND shift.is_active IS TRUE
         AND (
           shift.branch_id IS NULL
           OR shift.branch_id = p_branch_id
         )
     ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    JOIN public.profiles AS profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = p_employee_id
      AND employee.tenant_id = v_tenant
      AND employee.is_active IS TRUE
      AND profile.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'employee_not_in_branch'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ingredient_ids) AS selected(ingredient_id)
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.id = selected.ingredient_id
     AND ingredient.tenant_id = v_tenant
    WHERE ingredient.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.inventory_count_assignments AS assignment
  SET is_active = FALSE,
      updated_at = now()
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.ingredient_id = ANY(v_ingredient_ids)
    AND assignment.is_active IS TRUE
    AND (
      assignment.employee_id <> p_employee_id
      OR assignment.shift_id IS DISTINCT FROM p_shift_id
    )
    AND assignment.shift_id IS NOT DISTINCT FROM p_shift_id;

  UPDATE public.inventory_count_assignments AS assignment
  SET is_active = FALSE,
      updated_at = now()
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.employee_id = p_employee_id
    AND assignment.shift_id IS NOT DISTINCT FROM p_shift_id
    AND assignment.is_active IS TRUE
    AND NOT (
      assignment.ingredient_id = ANY(v_ingredient_ids)
    );

  INSERT INTO public.inventory_count_assignments (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    ingredient_id,
    shift_id,
    is_active,
    assigned_by
  )
  SELECT
    v_tenant,
    p_branch_id,
    p_location_id,
    p_employee_id,
    selected.ingredient_id,
    p_shift_id,
    TRUE,
    v_uid
  FROM (
    SELECT DISTINCT unnest(v_ingredient_ids) AS ingredient_id
  ) AS selected
  ON CONFLICT (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    ingredient_id,
    (coalesce(shift_id, 0::bigint))
  )
  DO UPDATE
  SET is_active = TRUE,
      assigned_by = v_uid,
      updated_at = now();

  PERFORM public.log_audit(
    'set_count_assignments',
    'inventory_count_assignment',
    p_employee_id,
    NULL,
    jsonb_build_object(
      'branch_id',
      p_branch_id,
      'location_id',
      p_location_id,
      'employee_id',
      p_employee_id,
      'shift_id',
      p_shift_id,
      'ingredient_ids',
      v_ingredient_ids
    )
  );

  RETURN jsonb_build_object(
    'success',
    TRUE,
    'employee_id',
    p_employee_id,
    'location_id',
    p_location_id,
    'shift_id',
    p_shift_id,
    'count',
    coalesce(array_length(v_ingredient_ids, 1), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(
  p_branch_id bigint,
  p_location_id bigint,
  p_lines jsonb,
  p_shift_id bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_employee_id bigint;
  v_employee_name text;
  v_today date :=
    (current_timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_slip_id bigint;
  v_status text;
  v_line jsonb;
  v_ingredient_id bigint;
  v_counted numeric(15,3);
  v_assigned_count integer;
  v_line_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_shift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.shifts AS shift
       WHERE shift.id = p_shift_id
         AND shift.tenant_id = v_tenant
         AND shift.is_active IS TRUE
         AND (
           shift.branch_id IS NULL
           OR shift.branch_id = p_branch_id
         )
     ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT employee.id, profile.full_name
  INTO v_employee_id, v_employee_name
  FROM public.employees AS employee
  JOIN public.profiles AS profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.profile_id = v_uid
    AND employee.tenant_id = v_tenant
    AND employee.is_active IS TRUE
    AND profile.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'no_active_employee_in_branch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  FOR v_line IN
    SELECT element.value
    FROM jsonb_array_elements(p_lines) AS element(value)
  LOOP
    v_ingredient_id := (v_line ->> 'ingredient_id')::bigint;
    v_counted := (v_line ->> 'counted_quantity')::numeric;

    IF v_ingredient_id IS NULL OR v_counted IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;
    IF v_counted < 0
       OR v_counted = 'NaN'::numeric
       OR v_counted = 'Infinity'::numeric
       OR v_counted = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'counted_quantity_invalid'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.inventory_count_assignments AS assignment
      WHERE assignment.tenant_id = v_tenant
        AND assignment.branch_id = p_branch_id
        AND assignment.location_id = p_location_id
        AND assignment.employee_id = v_employee_id
        AND assignment.ingredient_id = v_ingredient_id
        AND assignment.is_active IS TRUE
        AND (
          (
            p_shift_id IS NULL
            AND assignment.shift_id IS NULL
          )
          OR (
            p_shift_id IS NOT NULL
            AND (
              assignment.shift_id = p_shift_id
              OR (
                assignment.shift_id IS NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.inventory_count_assignments
                    AS specific
                  WHERE specific.tenant_id = v_tenant
                    AND specific.branch_id = p_branch_id
                    AND specific.location_id = p_location_id
                    AND specific.ingredient_id = v_ingredient_id
                    AND specific.shift_id = p_shift_id
                    AND specific.is_active IS TRUE
                )
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT count(DISTINCT assignment.ingredient_id)
  INTO v_assigned_count
  FROM public.inventory_count_assignments AS assignment
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.employee_id = v_employee_id
    AND assignment.is_active IS TRUE
    AND (
      (
        p_shift_id IS NULL
        AND assignment.shift_id IS NULL
      )
      OR (
        p_shift_id IS NOT NULL
        AND (
          assignment.shift_id = p_shift_id
          OR (
            assignment.shift_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.inventory_count_assignments AS specific
              WHERE specific.tenant_id = v_tenant
                AND specific.branch_id = p_branch_id
                AND specific.location_id = p_location_id
                AND specific.ingredient_id =
                  assignment.ingredient_id
                AND specific.shift_id = p_shift_id
                AND specific.is_active IS TRUE
            )
          )
        )
      )
    );

  SELECT count(DISTINCT (line ->> 'ingredient_id')::bigint)
  INTO v_line_count
  FROM jsonb_array_elements(p_lines) AS submitted(line);

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT slip.id, slip.status
  INTO v_slip_id, v_status
  FROM public.inventory_count_slips AS slip
  WHERE slip.tenant_id = v_tenant
    AND slip.branch_id = p_branch_id
    AND slip.location_id = p_location_id
    AND slip.employee_id = v_employee_id
    AND slip.count_date = v_today
    AND slip.shift_id IS NOT DISTINCT FROM p_shift_id
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved'
      USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips (
      tenant_id,
      branch_id,
      location_id,
      employee_id,
      count_date,
      shift_id,
      status,
      submitted_by,
      submitted_at,
      slip_number
    )
    VALUES (
      v_tenant,
      p_branch_id,
      p_location_id,
      v_employee_id,
      v_today,
      p_shift_id,
      'submitted',
      v_uid,
      now(),
      public.next_inventory_doc_number(v_tenant, 'count_slip')
    )
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted',
        submitted_by = v_uid,
        submitted_at = now(),
        reviewed_by = NULL,
        reviewed_at = NULL,
        review_note = NULL,
        updated_at = now()
    WHERE id = v_slip_id
      AND tenant_id = v_tenant;

    DELETE FROM public.inventory_count_slip_lines
    WHERE tenant_id = v_tenant
      AND slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines (
    tenant_id,
    slip_id,
    ingredient_id,
    system_quantity,
    counted_quantity,
    entry_unit_id,
    note
  )
  SELECT
    v_tenant,
    v_slip_id,
    (submitted.line ->> 'ingredient_id')::bigint,
    coalesce((
      SELECT stock.current_quantity
      FROM public.stock_levels AS stock
      WHERE stock.tenant_id = v_tenant
        AND stock.branch_id = p_branch_id
        AND stock.location_id = p_location_id
        AND stock.ingredient_id =
          (submitted.line ->> 'ingredient_id')::bigint
    ), 0),
    (submitted.line ->> 'counted_quantity')::numeric,
    nullif(
      submitted.line ->> 'entry_unit_id',
      ''
    )::bigint,
    nullif(trim(submitted.line ->> 'note'), '')
  FROM jsonb_array_elements(p_lines) AS submitted(line);

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
    meta,
    dedup_key
  )
  VALUES (
    v_tenant,
    p_branch_id,
    ARRAY['branch_manager', 'owner', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm tồn mới',
    format(
      '%s đã gửi phiếu đếm tồn (%s mục) chờ duyệt.',
      coalesce(v_employee_name, 'Nhân viên'),
      v_line_count
    ),
    'inventory_count_slip',
    v_slip_id,
    format('/br/%s/stock/count-slips', p_branch_id),
    jsonb_build_object(
      'slip_id',
      v_slip_id,
      'employee_id',
      v_employee_id,
      'branch_id',
      p_branch_id,
      'location_id',
      p_location_id,
      'shift_id',
      p_shift_id,
      'line_count',
      v_line_count
    ),
    format('inventory.count_slip:%s:submitted', v_slip_id)
  )
  ON CONFLICT (
    tenant_id,
    dedup_key
  ) WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET created_at = EXCLUDED.created_at,
      expires_at = NULL,
      meta = EXCLUDED.meta;

  PERFORM public.log_audit(
    'submit',
    'inventory_count_slip',
    v_slip_id,
    NULL,
    jsonb_build_object(
      'branch_id',
      p_branch_id,
      'location_id',
      p_location_id,
      'shift_id',
      p_shift_id,
      'line_count',
      v_line_count
    )
  );

  RETURN v_slip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(
  p_issue_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue public.stock_issues%ROWTYPE;
  v_item record;
  v_subtype text;
  v_stock_quantity numeric(15,3);
  v_wac numeric(15,2);
  v_quantity_base numeric(15,3);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT issue.*
  INTO v_issue
  FROM public.stock_issues AS issue
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_issue.branch_id,
    'inventory:write'
  ) THEN
    RAISE EXCEPTION 'forbidden_inventory_write'
      USING ERRCODE = '42501';
  END IF;
  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_issue.issue_type = 'writeoff'
     AND v_issue.approval_status = 'pending' THEN
    RAISE EXCEPTION 'writeoff_pending_approval'
      USING ERRCODE = '42501';
  END IF;
  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing'
      USING ERRCODE = '23502';
  END IF;

  PERFORM 1
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
  WHERE location.id = v_issue.source_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = v_issue.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_source_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_subtype := CASE
    WHEN v_issue.issue_type = 'consumption'
      THEN 'sale_consumption'
    WHEN v_issue.issue_type = 'writeoff'
      THEN 'writeoff'
    WHEN v_issue.issue_type = 'other'
      THEN 'other'
    ELSE NULL
  END;

  FOR v_item IN
    SELECT item.*
    FROM public.stock_issue_items AS item
    WHERE item.issue_id = p_issue_id
      AND item.tenant_id = v_tenant
  LOOP
    v_quantity_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_item.quantity
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_stock_quantity, v_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_issue.branch_id
      AND stock.location_id = v_issue.source_location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%',
        v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;
    IF v_stock_quantity < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock_for_%',
        v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items
    SET unit_cost = v_wac
    WHERE id = v_item.id
      AND tenant_id = v_tenant;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      unit_cost,
      reason,
      created_by,
      issue_id,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      v_subtype,
      -v_quantity_base,
      v_wac,
      coalesce(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id,
      v_item.entry_unit_id,
      v_item.quantity
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'ok',
    TRUE,
    'issue_id',
    p_issue_id,
    'movement_subtype',
    v_subtype
  );
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_zone_lock(
  bigint,
  text,
  integer
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_auditor(
  bigint,
  uuid,
  bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_recount_round(
  bigint,
  smallint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enable_offline_for_session(bigint)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escalate_round_4(
  bigint,
  bigint,
  numeric,
  text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_stocktake(bigint)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_stocktake_conflict(
  bigint,
  text,
  numeric,
  text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_count_round(
  bigint,
  smallint,
  jsonb
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_waste(
  bigint,
  text,
  text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_stocktake_session(
  bigint,
  bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_stocktake(
  bigint,
  bigint,
  text,
  boolean,
  uuid,
  numeric,
  numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_stocktake(bigint)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_inventory_count_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_inventory_count_slip(
  bigint,
  bigint,
  jsonb,
  bigint
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_stock_issue(bigint)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.acquire_zone_lock(
  bigint,
  text,
  integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_auditor(
  bigint,
  uuid,
  bigint
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_recount_round(
  bigint,
  smallint
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enable_offline_for_session(bigint)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalate_round_4(
  bigint,
  bigint,
  numeric,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_stocktake(bigint)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_stocktake_conflict(
  bigint,
  text,
  numeric,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_count_round(
  bigint,
  smallint,
  jsonb
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_waste(
  bigint,
  text,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_stocktake_session(
  bigint,
  bigint
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_stocktake(
  bigint,
  bigint,
  text,
  boolean,
  uuid,
  numeric,
  numeric
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_stocktake(bigint)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  bigint
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_slip(
  bigint,
  bigint,
  jsonb,
  bigint
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_stock_issue(bigint)
TO authenticated, service_role;

COMMENT ON FUNCTION public.create_stocktake_session(bigint, bigint) IS
  'Creates a stocktake only at the authenticated tenant site active warehouse.';
COMMENT ON FUNCTION public.start_stocktake(
  bigint,
  bigint,
  text,
  boolean,
  uuid,
  numeric,
  numeric
) IS
  'Starts a stocktake only at the authenticated tenant site active warehouse.';
COMMENT ON FUNCTION public.complete_stocktake(bigint) IS
  'Completes a tenant-bound warehouse stocktake and writes count adjustments.';
COMMENT ON FUNCTION public.set_inventory_count_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  bigint
) IS
  'Assigns counts only for the authenticated tenant site active warehouse.';
COMMENT ON FUNCTION public.submit_inventory_count_slip(
  bigint,
  bigint,
  jsonb,
  bigint
) IS
  'Submits assigned counts only for the authenticated tenant site active warehouse.';
COMMENT ON FUNCTION public.confirm_stock_issue(bigint) IS
  'Confirms a tenant-bound draft issue only from an active site warehouse.';

ALTER FUNCTION public.create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) SET SCHEMA private;
ALTER FUNCTION private.create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) RENAME TO execute_create_waste_entry;
ALTER FUNCTION private.execute_create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) SET search_path TO '';
REVOKE ALL ON FUNCTION private.execute_create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_waste_entry(
  p_branch_id bigint,
  p_location_id bigint,
  p_items jsonb,
  p_source_type text DEFAULT 'manual',
  p_source_ref jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_item jsonb;
  v_ingredient_id bigint;
  v_entry_unit_id bigint;
  v_quantity numeric;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:writeoff'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM location.id
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
  FOR UPDATE OF location;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_scope_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'waste_items_invalid'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(p_items) AS item(value)
  LOOP
    v_ingredient_id :=
      nullif(v_item ->> 'ingredient_id', '')::bigint;
    v_entry_unit_id :=
      nullif(v_item ->> 'entry_unit_id', '')::bigint;
    v_quantity := nullif(v_item ->> 'quantity', '')::numeric;

    IF v_ingredient_id IS NULL
       OR v_entry_unit_id IS NULL
       OR v_quantity IS NULL
       OR v_quantity <= 0
       OR v_quantity = 'NaN'::numeric
       OR v_quantity = 'Infinity'::numeric
       OR v_quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'waste_item_invalid'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients AS ingredient
      JOIN public.ingredient_units AS ingredient_unit
        ON ingredient_unit.ingredient_id = ingredient.id
       AND ingredient_unit.tenant_id = ingredient.tenant_id
       AND ingredient_unit.unit_id = v_entry_unit_id
       AND ingredient_unit.is_active IS TRUE
      JOIN public.units AS unit
        ON unit.id = ingredient_unit.unit_id
       AND unit.tenant_id = ingredient_unit.tenant_id
       AND unit.is_active IS TRUE
      WHERE ingredient.id = v_ingredient_id
        AND ingredient.tenant_id = v_tenant
        AND ingredient.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'waste_item_unit_invalid'
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  RETURN private.execute_create_waste_entry(
    p_branch_id,
    p_location_id,
    p_items,
    p_source_type,
    p_source_ref,
    p_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_waste_entry(
  bigint,
  bigint,
  jsonb,
  text,
  jsonb,
  text
) TO authenticated, service_role;

ALTER FUNCTION public._post_writeoff_movements(bigint)
SET SCHEMA private;
ALTER FUNCTION private._post_writeoff_movements(bigint)
RENAME TO execute_post_writeoff_movements;
ALTER FUNCTION private.execute_post_writeoff_movements(bigint)
SET search_path TO '';
REVOKE ALL ON FUNCTION private.execute_post_writeoff_movements(bigint)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._post_writeoff_movements(
  p_issue_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM issue.id
  FROM public.stock_issues AS issue
  JOIN public.inventory_locations AS location
    ON location.id = issue.source_location_id
   AND location.tenant_id = issue.tenant_id
   AND location.branch_id = issue.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  JOIN public.branches AS branch
    ON branch.id = issue.branch_id
   AND branch.tenant_id = issue.tenant_id
   AND branch.is_active IS TRUE
  WHERE issue.id = p_issue_id
    AND issue.tenant_id = v_tenant
  FOR UPDATE OF issue, location;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_source_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.execute_post_writeoff_movements(p_issue_id);
END;
$$;

REVOKE ALL ON FUNCTION public._post_writeoff_movements(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._post_writeoff_movements(bigint)
TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_zone_lock(
  p_session_id bigint,
  p_zone_id text,
  p_ttl_seconds integer DEFAULT 1800
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch bigint;
  v_expires_at timestamptz;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_ttl_seconds IS NULL
     OR p_ttl_seconds <= 0
     OR p_ttl_seconds > 7200 THEN
    RAISE EXCEPTION 'ttl_seconds must be in (0, 7200]'
      USING ERRCODE = '22023';
  END IF;

  SELECT session.branch_id
  INTO v_branch
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_branch,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stocktake_zone_locks
  SET last_heartbeat_at = now(),
      expires_at = now() + make_interval(secs => p_ttl_seconds)
  WHERE tenant_id = v_tenant
    AND session_id = p_session_id
    AND zone_id = p_zone_id
    AND locked_by = v_uid
  RETURNING expires_at INTO v_expires_at;

  IF v_expires_at IS NULL THEN
    RAISE EXCEPTION 'zone lock not held by caller'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_zone_lock(
  p_session_id bigint,
  p_zone_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch bigint;
  v_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.branch_id
  INTO v_branch
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_branch,
    'inventory:stocktake_create'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.stocktake_zone_locks
  WHERE tenant_id = v_tenant
    AND session_id = p_session_id
    AND zone_id = p_zone_id
    AND locked_by = v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_zone_lock(
  bigint,
  text,
  integer
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_zone_lock(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_zone_lock(
  bigint,
  text,
  integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_zone_lock(bigint, text)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_auditor(
  p_session_id bigint,
  p_auditor_id uuid,
  p_auditor_branch_id bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch bigint;
  v_status text;
  v_profile_branch bigint;
  v_auditor_branch bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.branch_id, session.status
  INTO v_branch, v_status
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'stocktake_session_not_in_progress'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    v_branch,
    'inventory:stocktake_recount'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT profile.branch_id
  INTO v_profile_branch
  FROM public.profiles AS profile
  WHERE profile.id = p_auditor_id
    AND profile.tenant_id = v_tenant
    AND coalesce(profile.is_active, TRUE) IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'auditor_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_auditor_branch := coalesce(
    p_auditor_branch_id,
    v_profile_branch
  );
  IF v_profile_branch IS NOT NULL
     AND v_auditor_branch IS DISTINCT FROM v_profile_branch THEN
    RAISE EXCEPTION 'auditor_branch_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF v_auditor_branch IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.branches AS branch
       WHERE branch.id = v_auditor_branch
         AND branch.tenant_id = v_tenant
         AND branch.is_active IS TRUE
         AND branch.branch_kind IN (
           'branch',
           'central_supply',
           'central_kitchen'
         )
     ) THEN
    RAISE EXCEPTION 'auditor_branch_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.stocktake_sessions
  SET auditor_id = p_auditor_id,
      auditor_branch_id = v_auditor_branch,
      is_unaudited = FALSE
  WHERE id = p_session_id
    AND tenant_id = v_tenant
    AND status = 'in_progress';
END;
$$;

ALTER FUNCTION public.update_ingredient_thresholds_bulk(jsonb)
SET SCHEMA private;
ALTER FUNCTION private.update_ingredient_thresholds_bulk(jsonb)
RENAME TO execute_update_ingredient_thresholds_bulk;
ALTER FUNCTION private.execute_update_ingredient_thresholds_bulk(jsonb)
SET search_path TO '';
REVOKE ALL ON FUNCTION
  private.execute_update_ingredient_thresholds_bulk(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.update_ingredient_thresholds_bulk(
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_row jsonb;
  v_value numeric;
  v_field text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF public.auth_role() <> 'owner'
     OR NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NOT NULL
     AND jsonb_typeof(p_payload) = 'array' THEN
    FOR v_row IN
      SELECT item.value
      FROM jsonb_array_elements(p_payload) AS item(value)
    LOOP
      FOREACH v_field IN ARRAY ARRAY[
        'min_stock_level',
        'max_stock_level',
        'reorder_point'
      ]::text[]
      LOOP
        IF v_row ? v_field
           AND v_row ->> v_field IS NOT NULL
           AND v_row ->> v_field <> '' THEN
          v_value := (v_row ->> v_field)::numeric;
          IF v_value = 'NaN'::numeric
             OR v_value = 'Infinity'::numeric
             OR v_value = '-Infinity'::numeric THEN
            RAISE EXCEPTION 'thresholds.bulk: non-finite value'
              USING ERRCODE = '22023';
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  RETURN private.execute_update_ingredient_thresholds_bulk(
    p_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_ingredient_thresholds_bulk(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.update_ingredient_thresholds_bulk(jsonb)
TO authenticated, service_role;

ALTER FUNCTION public.approve_inventory_count_slip(bigint)
SET SCHEMA private;
ALTER FUNCTION private.approve_inventory_count_slip(bigint)
RENAME TO execute_approve_inventory_count_slip;
ALTER FUNCTION private.execute_approve_inventory_count_slip(bigint)
SET search_path TO '';
REVOKE ALL ON FUNCTION
  private.execute_approve_inventory_count_slip(bigint)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.approve_inventory_count_slip(
  p_slip_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM slip.id
  FROM public.inventory_count_slips AS slip
  JOIN public.inventory_locations AS location
    ON location.id = slip.location_id
   AND location.tenant_id = slip.tenant_id
   AND location.branch_id = slip.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  JOIN public.branches AS branch
    ON branch.id = slip.branch_id
   AND branch.tenant_id = slip.tenant_id
   AND branch.is_active IS TRUE
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
  FOR UPDATE OF slip, location;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slip_location_invalid'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    ingredient_id,
    location_id,
    current_quantity
  )
  SELECT DISTINCT
    slip.tenant_id,
    slip.branch_id,
    line.ingredient_id,
    slip.location_id,
    0
  FROM public.inventory_count_slips AS slip
  JOIN public.inventory_count_slip_lines AS line
    ON line.slip_id = slip.id
   AND line.tenant_id = slip.tenant_id
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
  ON CONFLICT ON CONSTRAINT
    stock_levels_ingredient_branch_location_tenant_key
  DO NOTHING;

  PERFORM stock.id
  FROM public.stock_levels AS stock
  JOIN public.inventory_count_slips AS slip
    ON slip.tenant_id = stock.tenant_id
   AND slip.branch_id = stock.branch_id
   AND slip.location_id = stock.location_id
  JOIN public.inventory_count_slip_lines AS line
    ON line.slip_id = slip.id
   AND line.tenant_id = slip.tenant_id
   AND line.ingredient_id = stock.ingredient_id
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
  ORDER BY stock.ingredient_id
  FOR UPDATE OF stock;

  RETURN private.execute_approve_inventory_count_slip(p_slip_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_inventory_count_slip(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip(bigint)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.adjust_stock_exception(
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
  v_entry_unit_id bigint;
  v_movement_id bigint;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL OR p_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'invalid_adjustment_target'
      USING ERRCODE = '22023';
  END IF;
  IF p_quantity_change IS NULL
     OR p_quantity_change = 0
     OR p_quantity_change = 'NaN'::numeric
     OR p_quantity_change = 'Infinity'::numeric
     OR p_quantity_change = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'quantity_change_nonzero_finite'
      USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:write'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE
  ORDER BY location.id
  LIMIT 1
  FOR UPDATE OF location;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'active_warehouse_required'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT ingredient_unit.unit_id
  INTO v_entry_unit_id
  FROM public.ingredients AS ingredient
  JOIN public.ingredient_units AS ingredient_unit
    ON ingredient_unit.tenant_id = ingredient.tenant_id
   AND ingredient_unit.ingredient_id = ingredient.id
  JOIN public.units AS unit
    ON unit.tenant_id = ingredient_unit.tenant_id
   AND unit.id = ingredient_unit.unit_id
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.id = p_ingredient_id
    AND ingredient.is_active IS TRUE
    AND ingredient_unit.is_base IS TRUE
    AND ingredient_unit.is_active IS TRUE
    AND unit.is_active IS TRUE
  ORDER BY ingredient_unit.sort_order, ingredient_unit.id
  LIMIT 1;

  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_ingredient_id
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    type,
    quantity_change,
    reason,
    created_by,
    location_id,
    entry_unit_id,
    entry_quantity
  )
  VALUES (
    v_tenant,
    p_branch_id,
    p_ingredient_id,
    'adjustment',
    p_quantity_change,
    v_reason,
    v_uid,
    v_location_id,
    v_entry_unit_id,
    pg_catalog.abs(p_quantity_change)
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success',
    TRUE,
    'movement_id',
    v_movement_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_exception(
  bigint,
  bigint,
  numeric,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(
  bigint,
  bigint,
  numeric,
  text
) TO authenticated, service_role;

ALTER TABLE public.stock_transfer_items
DROP CONSTRAINT IF EXISTS stock_transfer_items_quantity_check;
ALTER TABLE public.stock_transfer_items
DROP CONSTRAINT IF EXISTS stock_transfer_items_quantity_valid;
ALTER TABLE public.stock_transfer_items
ADD CONSTRAINT stock_transfer_items_quantity_valid
CHECK (
  quantity > 0
  AND quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.stock_transfer_items
DROP CONSTRAINT IF EXISTS stock_transfer_items_received_quantity_valid;
ALTER TABLE public.stock_transfer_items
ADD CONSTRAINT stock_transfer_items_received_quantity_valid
CHECK (
  quantity_received IS NULL
  OR (
    quantity_received >= 0
    AND quantity_received <= quantity
    AND quantity_received NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

ALTER TABLE public.stock_transfer_items
DROP CONSTRAINT IF EXISTS stock_transfer_items_ship_cost_valid;
ALTER TABLE public.stock_transfer_items
ADD CONSTRAINT stock_transfer_items_ship_cost_valid
CHECK (
  unit_cost_at_ship IS NULL
  OR (
    unit_cost_at_ship >= 0
    AND unit_cost_at_ship NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

ALTER TABLE public.production_runs
DROP CONSTRAINT IF EXISTS production_runs_planned_quantity_check;
ALTER TABLE public.production_runs
DROP CONSTRAINT IF EXISTS production_runs_planned_quantity_valid;
ALTER TABLE public.production_runs
ADD CONSTRAINT production_runs_planned_quantity_valid
CHECK (
  planned_quantity > 0
  AND planned_quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.production_runs
DROP CONSTRAINT IF EXISTS production_runs_actual_quantity_check;
ALTER TABLE public.production_runs
DROP CONSTRAINT IF EXISTS production_runs_actual_quantity_valid;
ALTER TABLE public.production_runs
ADD CONSTRAINT production_runs_actual_quantity_valid
CHECK (
  actual_quantity IS NULL
  OR (
    actual_quantity >= 0
    AND actual_quantity NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

ALTER TABLE public.production_recipes
DROP CONSTRAINT IF EXISTS production_recipes_quantity_check;
ALTER TABLE public.production_recipes
DROP CONSTRAINT IF EXISTS production_recipes_quantity_valid;
ALTER TABLE public.production_recipes
ADD CONSTRAINT production_recipes_quantity_valid
CHECK (
  quantity > 0
  AND quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.production_recipes
DROP CONSTRAINT IF EXISTS production_recipes_yield_factor_check;
ALTER TABLE public.production_recipes
DROP CONSTRAINT IF EXISTS production_recipes_yield_factor_valid;
ALTER TABLE public.production_recipes
ADD CONSTRAINT production_recipes_yield_factor_valid
CHECK (
  yield_factor > 0
  AND yield_factor NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.recipes
DROP CONSTRAINT IF EXISTS recipes_quantity_check;
ALTER TABLE public.recipes
DROP CONSTRAINT IF EXISTS recipes_quantity_valid;
ALTER TABLE public.recipes
ADD CONSTRAINT recipes_quantity_valid
CHECK (
  quantity > 0
  AND quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.recipes
DROP CONSTRAINT IF EXISTS recipes_yield_factor_positive;
ALTER TABLE public.recipes
DROP CONSTRAINT IF EXISTS recipes_yield_factor_valid;
ALTER TABLE public.recipes
ADD CONSTRAINT recipes_yield_factor_valid
CHECK (
  yield_factor > 0
  AND yield_factor NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.stock_issue_items
DROP CONSTRAINT IF EXISTS stock_issue_items_quantity_check;
ALTER TABLE public.stock_issue_items
DROP CONSTRAINT IF EXISTS stock_issue_items_quantity_valid;
ALTER TABLE public.stock_issue_items
ADD CONSTRAINT stock_issue_items_quantity_valid
CHECK (
  quantity > 0
  AND quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.stock_issue_items
DROP CONSTRAINT IF EXISTS stock_issue_items_unit_cost_valid;
ALTER TABLE public.stock_issue_items
ADD CONSTRAINT stock_issue_items_unit_cost_valid
CHECK (
  unit_cost >= 0
  AND unit_cost NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.supplier_return_items
DROP CONSTRAINT IF EXISTS supplier_return_items_quantity_check;
ALTER TABLE public.supplier_return_items
DROP CONSTRAINT IF EXISTS supplier_return_items_quantity_valid;
ALTER TABLE public.supplier_return_items
ADD CONSTRAINT supplier_return_items_quantity_valid
CHECK (
  quantity > 0
  AND quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.stock_movements
DROP CONSTRAINT IF EXISTS stock_movements_finite_values;
ALTER TABLE public.stock_movements
ADD CONSTRAINT stock_movements_finite_values
CHECK (
  quantity_change NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
  AND (
    entry_quantity IS NULL
    OR entry_quantity NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
  AND (
    unit_cost IS NULL
    OR unit_cost NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

ALTER TABLE public.stock_levels
DROP CONSTRAINT IF EXISTS stock_levels_current_quantity_nonneg;
ALTER TABLE public.stock_levels
DROP CONSTRAINT IF EXISTS stock_levels_current_quantity_valid;
ALTER TABLE public.stock_levels
ADD CONSTRAINT stock_levels_current_quantity_valid
CHECK (
  current_quantity >= 0
  AND current_quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.stock_levels
DROP CONSTRAINT IF EXISTS stock_levels_avg_unit_cost_valid;
ALTER TABLE public.stock_levels
ADD CONSTRAINT stock_levels_avg_unit_cost_valid
CHECK (
  avg_unit_cost IS NULL
  OR (
    avg_unit_cost >= 0
    AND avg_unit_cost NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

ALTER TABLE public.stocktake_lines
DROP CONSTRAINT IF EXISTS stocktake_lines_counted_quantity_valid;
ALTER TABLE public.stocktake_lines
ADD CONSTRAINT stocktake_lines_counted_quantity_valid
CHECK (
  counted_quantity IS NULL
  OR (
    counted_quantity >= 0
    AND counted_quantity NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

ALTER TABLE public.inventory_count_slip_lines
DROP CONSTRAINT IF EXISTS inventory_count_slip_lines_counted_nonneg;
ALTER TABLE public.inventory_count_slip_lines
DROP CONSTRAINT IF EXISTS inventory_count_slip_lines_counted_quantity_valid;
ALTER TABLE public.inventory_count_slip_lines
ADD CONSTRAINT inventory_count_slip_lines_counted_quantity_valid
CHECK (
  counted_quantity >= 0
  AND counted_quantity NOT IN (
    'NaN'::numeric,
    'Infinity'::numeric,
    '-Infinity'::numeric
  )
);

ALTER TABLE public.stocktake_conflicts
DROP CONSTRAINT IF EXISTS stocktake_conflicts_resolution_qty_valid;
ALTER TABLE public.stocktake_conflicts
ADD CONSTRAINT stocktake_conflicts_resolution_qty_valid
CHECK (
  resolution_qty IS NULL
  OR (
    resolution_qty >= 0
    AND resolution_qty NOT IN (
      'NaN'::numeric,
      'Infinity'::numeric,
      '-Infinity'::numeric
    )
  )
);

DROP POLICY IF EXISTS stocktake_sessions_insert
ON public.stocktake_sessions;
DROP POLICY IF EXISTS stocktake_sessions_update
ON public.stocktake_sessions;
CREATE POLICY stocktake_sessions_cancel
ON public.stocktake_sessions
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND status = 'in_progress'
  AND public.has_permission(branch_id, 'inventory:write')
  AND EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
     AND branch.is_active IS TRUE
    WHERE location.id = stocktake_sessions.location_id
      AND location.tenant_id = stocktake_sessions.tenant_id
      AND location.branch_id = stocktake_sessions.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND status = 'cancelled'
  AND public.has_permission(branch_id, 'inventory:write')
  AND EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    JOIN public.branches AS branch
      ON branch.id = location.branch_id
     AND branch.tenant_id = location.tenant_id
     AND branch.is_active IS TRUE
    WHERE location.id = stocktake_sessions.location_id
      AND location.tenant_id = stocktake_sessions.tenant_id
      AND location.branch_id = stocktake_sessions.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  )
);

DROP POLICY IF EXISTS stocktake_lines_write
ON public.stocktake_lines;

CREATE OR REPLACE FUNCTION
private.enforce_stocktake_line_parent_mutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_status text;
  v_current_round smallint;
BEGIN
  SELECT session.status, session.current_round
  INTO v_status, v_current_round
  FROM public.stocktake_sessions AS session
  WHERE session.id = OLD.session_id
    AND session.tenant_id = OLD.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'stocktake_session_not_in_progress'
      USING ERRCODE = '22023';
  END IF;
  IF current_user IN ('authenticated', 'anon')
     AND (
       OLD.is_final IS TRUE
       OR OLD.round_no IS DISTINCT FROM v_current_round
     ) THEN
    RAISE EXCEPTION 'stocktake_line_not_current'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
private.enforce_stocktake_line_parent_mutability()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
private.enforce_stocktake_line_parent_mutability()
TO service_role;

DROP TRIGGER IF EXISTS trg_stocktake_line_parent_mutability
ON public.stocktake_lines;
CREATE TRIGGER trg_stocktake_line_parent_mutability
BEFORE UPDATE
ON public.stocktake_lines
FOR EACH ROW
EXECUTE FUNCTION
  private.enforce_stocktake_line_parent_mutability();

CREATE POLICY stocktake_lines_count_update
ON public.stocktake_lines
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND is_final IS FALSE
  AND EXISTS (
    SELECT 1
    FROM public.stocktake_sessions AS session
    JOIN public.inventory_locations AS location
      ON location.id = session.location_id
     AND location.tenant_id = session.tenant_id
     AND location.branch_id = session.branch_id
     AND location.location_kind = 'warehouse'
     AND location.is_active IS TRUE
    JOIN public.branches AS branch
      ON branch.id = session.branch_id
     AND branch.tenant_id = session.tenant_id
     AND branch.is_active IS TRUE
    WHERE session.id = stocktake_lines.session_id
      AND session.tenant_id = stocktake_lines.tenant_id
      AND session.status = 'in_progress'
      AND session.current_round = stocktake_lines.round_no
      AND public.has_permission(
        session.branch_id,
        'inventory:write'
      )
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND is_final IS FALSE
  AND EXISTS (
    SELECT 1
    FROM public.stocktake_sessions AS session
    JOIN public.inventory_locations AS location
      ON location.id = session.location_id
     AND location.tenant_id = session.tenant_id
     AND location.branch_id = session.branch_id
     AND location.location_kind = 'warehouse'
     AND location.is_active IS TRUE
    JOIN public.branches AS branch
      ON branch.id = session.branch_id
     AND branch.tenant_id = session.tenant_id
     AND branch.is_active IS TRUE
    WHERE session.id = stocktake_lines.session_id
      AND session.tenant_id = stocktake_lines.tenant_id
      AND session.status = 'in_progress'
      AND session.current_round = stocktake_lines.round_no
      AND public.has_permission(
        session.branch_id,
        'inventory:write'
      )
  )
);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.stocktake_sessions
FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status)
ON public.stocktake_sessions
TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.stocktake_lines
FROM PUBLIC, anon, authenticated;
GRANT UPDATE (counted_quantity, variance_reason)
ON public.stocktake_lines
TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.stocktake_zone_locks
FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON public.stocktake_conflicts
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE public.stocktake_sessions_id_seq
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.stocktake_lines_id_seq
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.stocktake_zone_locks_id_seq
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.stocktake_conflicts_id_seq
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_stocktake(
  p_session_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM session.id
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.complete_stocktake(p_session_id);
END;
$$;

COMMIT;
