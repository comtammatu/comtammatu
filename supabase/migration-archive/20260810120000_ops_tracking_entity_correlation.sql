-- Ops tracking Track 3: align gold notification entity_type with audit_logs.
-- GRN notifications historically used entity_type = 'grn'; audit uses
-- 'goods_received_note'. Normalize producer + expire path + existing rows.
-- Apply to Production only with explicit owner delegation in that session.

CREATE OR REPLACE FUNCTION public.trg_notify_grn_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_branch_kind text;
  v_target_roles text[];
BEGIN
  IF NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id
    AND branch.tenant_id = NEW.tenant_id;

  v_target_roles := CASE v_branch_kind
    WHEN 'central_supply'
      THEN ARRAY['owner', 'central_supply_ops']::text[]
    WHEN 'central_kitchen'
      THEN ARRAY['owner', 'central_kitchen_lead']::text[]
    ELSE ARRAY['owner', 'branch_manager']::text[]
  END;

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
    NEW.tenant_id,
    NEW.branch_id,
    v_target_roles,
    'workflow.grn_pending',
    'info',
    format('Phiếu nhập %s đang chờ chốt', NEW.grn_number),
    'Kiểm tra số lượng, hàng từ chối và ảnh bằng chứng rồi chốt nhập kho',
    'goods_received_note',
    NEW.id,
    CASE
      WHEN v_branch_kind = 'branch'
        THEN format('/br/%s/stock/transfer', NEW.branch_id)
      ELSE format('/inventory/grn/%s', NEW.id)
    END,
    format('workflow.grn_pending:%s', NEW.id),
    jsonb_build_object('grn_number', NEW.grn_number, 'po_id', NEW.po_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET target_branch_id = EXCLUDED.target_branch_id,
      target_roles = EXCLUDED.target_roles,
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      entity_type = EXCLUDED.entity_type,
      entity_id = EXCLUDED.entity_id,
      action_url = EXCLUDED.action_url,
      meta = EXCLUDED.meta,
      expires_at = NULL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.expire_grn_pending_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_grn_id bigint := OLD.id;
  v_po_id bigint := OLD.po_id;
  v_tenant_id bigint := OLD.tenant_id;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'draft' THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = v_tenant_id
    AND (
      expires_at IS NULL
      OR expires_at > now()
    )
    AND (
      (
        kind = 'workflow.grn_pending'
        AND entity_type IN ('grn', 'goods_received_note')
        AND entity_id = v_grn_id
      )
      OR (
        v_po_id IS NOT NULL
        AND kind IN ('workflow.po_approved', 'workflow.po_sent')
        AND entity_type = 'purchase_order'
        AND entity_id = v_po_id
      )
    );

  RETURN NULL;
END;
$$;

UPDATE public.notifications
SET entity_type = 'goods_received_note'
WHERE kind = 'workflow.grn_pending'
  AND entity_type = 'grn';
