UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT permission_key
      FROM unnest(
        permission_keys
        || ARRAY[
          'inventory:request_create',
          'inventory:request_submit',
          'inventory:request_cancel'
        ]::text[]
      ) AS permission_key
    ),
    updated_at = now()
WHERE position_code = 'central_kitchen_lead';

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
JOIN public.role_templates AS template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = position.code
CROSS JOIN (
  VALUES
    ('inventory:request_create'),
    ('inventory:request_submit'),
    ('inventory:request_cancel')
) AS permission(permission_key)
WHERE position.code = 'central_kitchen_lead'
  AND COALESCE(profile.is_active, true)
  AND profile.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions AS existing
    WHERE existing.user_id = profile.id
      AND existing.tenant_id = profile.tenant_id
      AND existing.permission_key = permission.permission_key
      AND existing.branch_id IS NOT DISTINCT FROM profile.branch_id
  );

CREATE OR REPLACE FUNCTION public.save_stock_request(
  p_request_id bigint,
  p_branch_id bigint,
  p_needed_at timestamptz,
  p_notes text,
  p_lines jsonb,
  p_submit boolean DEFAULT true,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request public.stock_requests%ROWTYPE;
  v_request_id bigint;
  v_number text;
  v_status text;
  v_requester_kind text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'stock_request_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(v_uid)
     AND (
       NOT public.has_permission(p_branch_id, 'inventory:request_create')
       OR (
         p_submit
         AND NOT public.has_permission(p_branch_id, 'inventory:request_submit')
       )
     ) THEN
    RAISE EXCEPTION 'forbidden_request_save' USING ERRCODE = '42501';
  END IF;

  SELECT branch.branch_kind
  INTO v_requester_kind
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active
    AND branch.branch_kind IN ('branch', 'central_kitchen');

  IF v_requester_kind IS NULL THEN
    RAISE EXCEPTION 'stock_request_requester_site_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT line.ingredient_id)
    FROM jsonb_to_recordset(p_lines) AS line(ingredient_id bigint)
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
      AS line(
        ingredient_id bigint,
        entry_unit_id bigint,
        quantity numeric
      )
    WHERE line.ingredient_id IS NULL
       OR line.entry_unit_id IS NULL
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR NOT EXISTS (
         SELECT 1
         FROM public.ingredients AS ingredient
         JOIN public.ingredient_units AS ingredient_unit
           ON ingredient_unit.ingredient_id = ingredient.id
          AND ingredient_unit.tenant_id = ingredient.tenant_id
         WHERE ingredient.id = line.ingredient_id
           AND ingredient.tenant_id = v_tenant
           AND ingredient.is_active
           AND ingredient.default_fulfill_site_kind IN (
             'central_supply',
             'central_kitchen'
           )
           AND (
             v_requester_kind <> 'central_kitchen'
             OR ingredient.default_fulfill_site_kind = 'central_supply'
           )
           AND ingredient_unit.unit_id = line.entry_unit_id
           AND ingredient_unit.is_active
       )
  ) THEN
    RAISE EXCEPTION 'stock_request_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF p_request_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT request.*
    INTO v_request
    FROM public.stock_requests AS request
    WHERE request.tenant_id = v_tenant
      AND request.creation_idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'request_number', v_request.request_number,
        'status', v_request.status
      );
    END IF;
  END IF;

  IF p_request_id IS NULL THEN
    v_number := public.next_inventory_doc_number(v_tenant, 'stock_request');
    INSERT INTO public.stock_requests (
      tenant_id,
      branch_id,
      request_number,
      status,
      needed_at,
      notes,
      created_by,
      creation_idempotency_key
    )
    VALUES (
      v_tenant,
      p_branch_id,
      v_number,
      'draft',
      p_needed_at,
      NULLIF(btrim(p_notes), ''),
      v_uid,
      p_idempotency_key
    )
    ON CONFLICT (tenant_id, creation_idempotency_key)
      WHERE creation_idempotency_key IS NOT NULL
      DO NOTHING
    RETURNING id INTO v_request_id;

    IF v_request_id IS NULL THEN
      SELECT request.*
      INTO v_request
      FROM public.stock_requests AS request
      WHERE request.tenant_id = v_tenant
        AND request.creation_idempotency_key = p_idempotency_key
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'stock_request_idempotency_conflict'
          USING ERRCODE = '40001';
      END IF;

      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'request_number', v_request.request_number,
        'status', v_request.status
      );
    END IF;
  ELSE
    SELECT request.*
    INTO v_request
    FROM public.stock_requests AS request
    WHERE request.id = p_request_id
      AND request.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'stock_request_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_request.branch_id <> p_branch_id
       OR v_request.status NOT IN ('draft', 'submitted')
       OR EXISTS (
         SELECT 1
         FROM public.stock_request_items AS item
         WHERE item.request_id = p_request_id
           AND item.tenant_id = v_tenant
           AND item.status <> 'pending'
       ) THEN
      RAISE EXCEPTION 'stock_request_not_editable'
        USING ERRCODE = '23514';
    END IF;

    v_request_id := p_request_id;
    v_number := v_request.request_number;

    DELETE FROM public.stock_request_items
    WHERE request_id = v_request_id
      AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.stock_request_items (
    tenant_id,
    request_id,
    ingredient_id,
    entry_unit_id,
    quantity,
    fulfill_site_kind,
    status,
    notes
  )
  SELECT
    v_tenant,
    v_request_id,
    line.ingredient_id,
    line.entry_unit_id,
    line.quantity::numeric(15,3),
    ingredient.default_fulfill_site_kind,
    'pending',
    NULLIF(btrim(line.notes), '')
  FROM jsonb_to_recordset(p_lines)
    AS line(
      ingredient_id bigint,
      entry_unit_id bigint,
      quantity numeric,
      notes text
    )
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = v_tenant;

  v_status := CASE
    WHEN p_submit OR v_request.status = 'submitted' THEN 'submitted'
    ELSE 'draft'
  END;

  UPDATE public.stock_requests
  SET status = v_status,
      needed_at = p_needed_at,
      notes = NULLIF(btrim(p_notes), ''),
      submitted_at = CASE
        WHEN v_status = 'submitted' THEN COALESCE(submitted_at, now())
        ELSE NULL
      END,
      status_reason = NULL,
      updated_at = now()
  WHERE id = v_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    CASE
      WHEN p_request_id IS NULL AND p_submit
        THEN 'inventory.request.created_submitted'
      WHEN p_request_id IS NULL THEN 'inventory.request.created_draft'
      WHEN p_submit THEN 'inventory.request.saved_submitted'
      ELSE 'inventory.request.saved_draft'
    END,
    'stock_request',
    v_request_id,
    CASE WHEN p_request_id IS NULL THEN NULL ELSE to_jsonb(v_request) END,
    jsonb_build_object(
      'status', v_status,
      'branch_id', p_branch_id,
      'line_count', jsonb_array_length(p_lines),
      'needed_at', p_needed_at
    )
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_number,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_stock_request(
  bigint, bigint, timestamptz, text, jsonb, boolean, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_stock_request(
  bigint, bigint, timestamptz, text, jsonb, boolean, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.canonicalize_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.target_roles := ARRAY(
    SELECT DISTINCT target_role
    FROM unnest(NEW.target_roles) AS roles(target_role)
    WHERE target_role = ANY (ARRAY[
      'owner',
      'accountant',
      'central_supply_ops',
      'central_kitchen_lead',
      'branch_manager',
      'cashier',
      'chef',
      'branch_staff'
    ]::text[])
    ORDER BY target_role
  );

  IF cardinality(NEW.target_roles) = 0 THEN
    RAISE EXCEPTION 'notification_requires_canonical_target_role'
      USING ERRCODE = '23514';
  END IF;

  NEW.action_url := CASE NEW.kind
    WHEN 'procurement.purchase_request_submitted' THEN
      format(
        '/inventory/purchase-orders?tab=needs&demandId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'procurement.po_pending_approval' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'workflow.po_approved' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'workflow.po_sent' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    ELSE NEW.action_url
  END;

  IF NEW.target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.action_url := CASE NEW.kind
    WHEN 'inventory.stock_low' THEN
      CASE WHEN NEW.entity_id IS NULL
        THEN format('/br/%s/stock', NEW.target_branch_id)
        ELSE format(
          '/br/%s/stock/on-hand/%s',
          NEW.target_branch_id,
          NEW.entity_id
        )
      END
    WHEN 'inventory.stock_request_submitted' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'workflow.grn_pending' THEN
      format('/br/%s/stock/grn/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'inventory.count_slip_submitted' THEN
      format('/br/%s/stock/count-slips', NEW.target_branch_id)
    WHEN 'workflow.stocktake_submitted' THEN
      format('/br/%s/stock/stocktake/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'workflow.transfer_in_transit' THEN
      format('/br/%s/stock/receive/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      format('/br/%s/shift/leave-approvals', NEW.target_branch_id)
    WHEN 'attendance.checkout_requested' THEN
      format('/br/%s/shift/checkout-approvals', NEW.target_branch_id)
    WHEN 'inventory.count_slip_approved' THEN
      format('/br/%s/stock/count', NEW.target_branch_id)
    WHEN 'inventory.count_slip_recount' THEN
      format('/br/%s/stock/count', NEW.target_branch_id)
    WHEN 'hr.leave_approved' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'hr.leave_rejected' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'pos.shift_variance' THEN
      format(
        '/br/%s/pos-sessions?session=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'pos.payment_stock_failed' THEN
      format('/br/%s/orders', NEW.target_branch_id)
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION private.canonicalize_notification()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.notify_stock_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status <> 'submitted' THEN
    RETURN NEW;
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
  SELECT
    NEW.tenant_id,
    target_site.id,
    CASE destination.fulfill_site_kind
      WHEN 'central_supply'
        THEN ARRAY['owner', 'central_supply_ops']::text[]
      ELSE ARRAY['owner', 'central_kitchen_lead']::text[]
    END,
    'inventory.stock_request_submitted',
    'info',
    format('Yêu cầu hàng %s mới', NEW.request_number),
    format(
      '%s gửi %s mặt hàng cần %s đáp ứng.',
      source_site.name,
      destination.line_count,
      CASE destination.fulfill_site_kind
        WHEN 'central_supply' THEN 'Kho Tổng'
        ELSE 'Bếp Trung tâm'
      END
    ),
    'stock_request',
    NEW.id,
    format('/inventory/transfers?requestId=%s', NEW.id),
    format(
      'inventory.stock_request_submitted:%s:%s',
      NEW.id,
      destination.fulfill_site_kind
    ),
    jsonb_build_object(
      'request_number', NEW.request_number,
      'source_branch_id', NEW.branch_id,
      'fulfill_site_kind', destination.fulfill_site_kind,
      'line_count', destination.line_count
    )
  FROM (
    SELECT
      item.fulfill_site_kind,
      count(*)::integer AS line_count
    FROM public.stock_request_items AS item
    WHERE item.tenant_id = NEW.tenant_id
      AND item.request_id = NEW.id
      AND item.status = 'pending'
    GROUP BY item.fulfill_site_kind
  ) AS destination
  JOIN public.branches AS target_site
    ON target_site.tenant_id = NEW.tenant_id
   AND target_site.branch_kind = destination.fulfill_site_kind
   AND target_site.is_active
  JOIN public.branches AS source_site
    ON source_site.id = NEW.branch_id
   AND source_site.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET target_branch_id = EXCLUDED.target_branch_id,
      target_roles = EXCLUDED.target_roles,
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      action_url = EXCLUDED.action_url,
      meta = EXCLUDED.meta,
      expires_at = NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.expire_stock_request_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request_id bigint := OLD.id;
  v_tenant_id bigint := OLD.tenant_id;
BEGIN
  IF TG_OP = 'DELETE'
     OR NEW.status IN ('fulfilled', 'closed', 'cancelled') THEN
    UPDATE public.notifications
    SET expires_at = now()
    WHERE tenant_id = v_tenant_id
      AND kind = 'inventory.stock_request_submitted'
      AND entity_type = 'stock_request'
      AND entity_id = v_request_id
      AND (expires_at IS NULL OR expires_at > now());
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.expire_stock_request_source_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request_id bigint := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.request_id
    ELSE NEW.request_id
  END;
  v_tenant_id bigint := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.tenant_id
    ELSE NEW.tenant_id
  END;
  v_site_kind text := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.fulfill_site_kind
    ELSE NEW.fulfill_site_kind
  END;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_request_items AS item
    JOIN public.stock_requests AS request
      ON request.id = item.request_id
     AND request.tenant_id = item.tenant_id
    WHERE item.tenant_id = v_tenant_id
      AND item.request_id = v_request_id
      AND item.fulfill_site_kind = v_site_kind
      AND item.status = 'pending'
      AND request.status = 'submitted'
  ) THEN
    UPDATE public.notifications
    SET expires_at = NULL,
        action_url = format(
          '/inventory/transfers?requestId=%s',
          v_request_id
        )
    WHERE tenant_id = v_tenant_id
      AND kind = 'inventory.stock_request_submitted'
      AND entity_type = 'stock_request'
      AND entity_id = v_request_id
      AND meta ->> 'fulfill_site_kind' = v_site_kind;
  ELSE
    UPDATE public.notifications
    SET expires_at = now()
    WHERE tenant_id = v_tenant_id
      AND kind = 'inventory.stock_request_submitted'
      AND entity_type = 'stock_request'
      AND entity_id = v_request_id
      AND meta ->> 'fulfill_site_kind' = v_site_kind
      AND (expires_at IS NULL OR expires_at > now());
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION
  private.notify_stock_request_submitted(),
  private.expire_stock_request_notifications(),
  private.expire_stock_request_source_notification()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_expire_stock_request_notifications
ON public.stock_requests;
CREATE TRIGGER trg_expire_stock_request_notifications
AFTER UPDATE OF status OR DELETE
ON public.stock_requests
FOR EACH ROW
EXECUTE FUNCTION private.expire_stock_request_notifications();

DROP TRIGGER IF EXISTS trg_expire_stock_request_source_notification
ON public.stock_request_items;
CREATE TRIGGER trg_expire_stock_request_source_notification
AFTER INSERT OR UPDATE OF status OR DELETE
ON public.stock_request_items
FOR EACH ROW
EXECUTE FUNCTION private.expire_stock_request_source_notification();

UPDATE public.notifications
SET action_url = format('/inventory/transfers?requestId=%s', entity_id)
WHERE kind = 'inventory.stock_request_submitted'
  AND entity_type = 'stock_request'
  AND entity_id IS NOT NULL
  AND (expires_at IS NULL OR expires_at > now());

UPDATE public.notifications AS notification
SET expires_at = now()
WHERE notification.kind = 'inventory.stock_request_submitted'
  AND notification.entity_type = 'stock_request'
  AND (notification.expires_at IS NULL OR notification.expires_at > now())
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_requests AS request
    JOIN public.stock_request_items AS item
      ON item.request_id = request.id
     AND item.tenant_id = request.tenant_id
    WHERE request.id = notification.entity_id
      AND request.tenant_id = notification.tenant_id
      AND request.status = 'submitted'
      AND item.status = 'pending'
      AND item.fulfill_site_kind =
        notification.meta ->> 'fulfill_site_kind'
  );
