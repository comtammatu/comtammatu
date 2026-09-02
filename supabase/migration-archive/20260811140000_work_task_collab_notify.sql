-- Work W2: checklist/comment RPCs, assign notifications, exact-user feed filter.

CREATE OR REPLACE FUNCTION private.notify_work_task_assigned(
  p_tenant_id bigint,
  p_task_id bigint,
  p_assignee_id uuid,
  p_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, private
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_assignee_id IS NULL OR p_task_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  IF p_assignee_id = auth.uid() THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    private.staff_role_from_position_code(position.code),
    'self_service'
  )
  INTO v_role
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.id = p_assignee_id
    AND profile.tenant_id = p_tenant_id
    AND profile.is_active IS TRUE;

  IF v_role IS NULL OR v_role = 'unassigned' THEN
    v_role := 'self_service';
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
    meta
  ) VALUES (
    p_tenant_id,
    NULL,
    ARRAY[v_role]::text[],
    'work.task_assigned',
    'info',
    'Việc mới được giao',
    left(btrim(COALESCE(p_title, '')), 200),
    'work_task',
    p_task_id,
    format('/work/tasks/%s', p_task_id),
    jsonb_build_object('target_user_id', p_assignee_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.notify_work_task_assigned(
  bigint, bigint, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.notify_work_task_assigned(
  bigint, bigint, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.add_work_task_comment(
  p_task_id bigint,
  p_body text
)
RETURNS public.work_task_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_row public.work_task_comments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_task_id IS NULL OR char_length(btrim(COALESCE(p_body, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_write_work_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.work_task_comments (
    tenant_id,
    task_id,
    author_id,
    body
  ) VALUES (
    v_tenant,
    p_task_id,
    v_actor,
    left(btrim(p_body), 4000)
  )
  RETURNING * INTO v_row;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    p_task_id,
    v_actor,
    'task.commented',
    jsonb_build_object('comment_id', v_row.id)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_work_task_checklist_item(
  p_task_id bigint,
  p_item_id bigint,
  p_title text,
  p_is_done boolean,
  p_sort_order integer
)
RETURNS public.work_task_checklist_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_row public.work_task_checklist_items%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_task_id IS NULL OR char_length(btrim(COALESCE(p_title, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_write_work_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_item_id IS NULL THEN
    INSERT INTO public.work_task_checklist_items (
      tenant_id,
      task_id,
      title,
      is_done,
      sort_order
    ) VALUES (
      v_tenant,
      p_task_id,
      left(btrim(p_title), 200),
      COALESCE(p_is_done, false),
      COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.work_task_checklist_items item
    SET
      title = left(btrim(p_title), 200),
      is_done = COALESCE(p_is_done, item.is_done),
      sort_order = COALESCE(p_sort_order, item.sort_order)
    WHERE item.id = p_item_id
      AND item.task_id = p_task_id
      AND item.tenant_id = v_tenant
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'checklist_item_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    p_task_id,
    v_actor,
    'task.checklist_updated',
    jsonb_build_object('item_id', v_row.id, 'is_done', v_row.is_done)
  );

  RETURN v_row;
END;
$$;

-- Patch create_work_task to notify assignee.
CREATE OR REPLACE FUNCTION public.create_work_task(
  p_department_id bigint,
  p_project_id bigint,
  p_title text,
  p_description text,
  p_priority text,
  p_assignee_id uuid,
  p_due_at timestamptz
)
RETURNS public.work_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_priority text := COALESCE(NULLIF(btrim(p_priority), ''), 'normal');
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_department_id IS NULL OR char_length(btrim(COALESCE(p_title, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    public.auth_is_owner(v_actor)
    OR public.has_permission(NULL::bigint, 'work:manage'::text)
    OR EXISTS (
      SELECT 1
      FROM public.work_department_members member
      WHERE member.tenant_id = v_tenant
        AND member.department_id = p_department_id
        AND member.user_id = v_actor
        AND member.is_active IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.work_departments department
    WHERE department.id = p_department_id
      AND department.tenant_id = v_tenant
      AND department.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_priority <> ALL (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]) THEN
    RAISE EXCEPTION 'invalid_priority' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.work_projects project
    WHERE project.id = p_project_id
      AND project.tenant_id = v_tenant
      AND project.department_id = p_department_id
  ) THEN
    RAISE EXCEPTION 'project_not_in_department' USING ERRCODE = '22023';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_assignee_id
      AND profile.tenant_id = v_tenant
      AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.work_tasks (
    tenant_id,
    department_id,
    project_id,
    title,
    description,
    priority,
    assignee_id,
    due_at,
    created_by
  ) VALUES (
    v_tenant,
    p_department_id,
    p_project_id,
    left(btrim(p_title), 200),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    v_priority,
    p_assignee_id,
    p_due_at,
    v_actor
  )
  RETURNING * INTO v_task;

  IF p_assignee_id IS NOT NULL THEN
    INSERT INTO public.work_task_participants (
      tenant_id,
      task_id,
      user_id,
      kind
    ) VALUES (
      v_tenant,
      v_task.id,
      p_assignee_id,
      'assignee'
    )
    ON CONFLICT (tenant_id, task_id, user_id, kind) DO NOTHING;

    PERFORM private.notify_work_task_assigned(
      v_tenant,
      v_task.id,
      p_assignee_id,
      v_task.title
    );
  END IF;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    v_task.id,
    v_actor,
    'task.created',
    jsonb_build_object(
      'department_id', p_department_id,
      'project_id', p_project_id,
      'assignee_id', p_assignee_id
    )
  );

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_work_task(
  p_task_id bigint,
  p_expected_revision integer,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_project_id bigint DEFAULT NULL,
  p_clear_due_at boolean DEFAULT false,
  p_clear_project_id boolean DEFAULT false,
  p_clear_assignee_id boolean DEFAULT false
)
RETURNS public.work_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_old_assignee_id uuid;
  v_assignee_changed boolean := false;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_task_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_write_work_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_task
  FROM public.work_tasks task
  WHERE task.id = p_task_id
    AND task.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_task.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'task_revision_conflict' USING ERRCODE = 'P0001';
  END IF;

  v_old_assignee_id := v_task.assignee_id;

  IF p_priority IS NOT NULL
     AND p_priority <> ALL (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]) THEN
    RAISE EXCEPTION 'invalid_priority' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.work_projects project
    WHERE project.id = p_project_id
      AND project.tenant_id = v_tenant
      AND project.department_id = v_task.department_id
  ) THEN
    RAISE EXCEPTION 'project_not_in_department' USING ERRCODE = '22023';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_assignee_id
      AND profile.tenant_id = v_tenant
      AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.work_tasks task
  SET
    title = CASE
      WHEN p_title IS NULL THEN task.title
      ELSE left(btrim(p_title), 200)
    END,
    description = CASE
      WHEN p_description IS NULL THEN task.description
      ELSE NULLIF(btrim(p_description), '')
    END,
    priority = COALESCE(p_priority, task.priority),
    assignee_id = CASE
      WHEN p_clear_assignee_id THEN NULL
      WHEN p_assignee_id IS NULL THEN task.assignee_id
      ELSE p_assignee_id
    END,
    due_at = CASE
      WHEN p_clear_due_at THEN NULL
      WHEN p_due_at IS NULL THEN task.due_at
      ELSE p_due_at
    END,
    project_id = CASE
      WHEN p_clear_project_id THEN NULL
      WHEN p_project_id IS NULL THEN task.project_id
      ELSE p_project_id
    END,
    revision = task.revision + 1
  WHERE task.id = p_task_id
    AND task.tenant_id = v_tenant
  RETURNING * INTO v_task;

  v_assignee_changed := (
    p_clear_assignee_id
    OR (p_assignee_id IS NOT NULL AND p_assignee_id IS DISTINCT FROM v_old_assignee_id)
  );

  IF p_assignee_id IS NOT NULL OR p_clear_assignee_id THEN
    DELETE FROM public.work_task_participants participant
    WHERE participant.tenant_id = v_tenant
      AND participant.task_id = p_task_id
      AND participant.kind = 'assignee';

    IF v_task.assignee_id IS NOT NULL THEN
      INSERT INTO public.work_task_participants (
        tenant_id,
        task_id,
        user_id,
        kind
      ) VALUES (
        v_tenant,
        p_task_id,
        v_task.assignee_id,
        'assignee'
      )
      ON CONFLICT (tenant_id, task_id, user_id, kind) DO NOTHING;
    END IF;
  END IF;

  IF v_assignee_changed AND v_task.assignee_id IS NOT NULL THEN
    PERFORM private.notify_work_task_assigned(
      v_tenant,
      v_task.id,
      v_task.assignee_id,
      v_task.title
    );
  END IF;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    p_task_id,
    v_actor,
    'task.updated',
    jsonb_build_object(
      'revision', v_task.revision,
      'assignee_changed', v_assignee_changed
    )
  );

  RETURN v_task;
END;
$$;

-- Exact-user visibility for notifications that set meta.target_user_id.
CREATE OR REPLACE FUNCTION public.list_notifications(
  p_limit integer DEFAULT 20,
  p_before timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_unread_only boolean DEFAULT false,
  p_include_expired boolean DEFAULT false
) RETURNS TABLE(
  id bigint,
  tenant_id bigint,
  target_branch_id bigint,
  target_roles text[],
  kind text,
  severity text,
  title text,
  body text,
  entity_type text,
  entity_id bigint,
  action_url text,
  meta jsonb,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  read_at timestamp with time zone
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    n.id, n.tenant_id, n.target_branch_id, n.target_roles,
    n.kind, n.severity, n.title, n.body,
    n.entity_type, n.entity_id, n.action_url, n.meta,
    n.created_at, n.expires_at,
    r.read_at
  FROM public.notifications n
  LEFT JOIN public.notification_reads r
    ON r.notification_id = n.id
   AND r.user_id = (SELECT auth.uid())
  WHERE (p_before IS NULL OR n.created_at < p_before)
    AND (NOT p_unread_only OR r.read_at IS NULL)
    AND (
      p_include_expired
      OR n.expires_at IS NULL
      OR n.expires_at > now()
    )
    AND (
      NOT (n.meta ? 'target_user_id')
      OR (n.meta ->> 'target_user_id') = (SELECT auth.uid())::text
    )
  ORDER BY
    CASE n.severity
      WHEN 'critical' THEN 0
      WHEN 'warning' THEN 1
      ELSE 2
    END,
    n.created_at DESC,
    n.id DESC
  LIMIT least(greatest(p_limit, 1), 50) + 1;
$$;

CREATE OR REPLACE FUNCTION private.canonicalize_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_branch_kind text;
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
      'branch_staff',
      'self_service'
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
    WHEN 'hr.payroll_period_ready' THEN
      format('/hr/payroll/%s', NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format('/hr/attendance?tab=approvals&leaveRequestId=%s', NEW.entity_id)
        ELSE NEW.action_url
      END
    WHEN 'hr.checkout_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format(
            '/hr/attendance/checkout-approvals?attendanceId=%s',
            NEW.entity_id
          )
        ELSE NEW.action_url
      END
    WHEN 'attendance.checkout_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format(
            '/hr/attendance/checkout-approvals?attendanceId=%s',
            NEW.entity_id
          )
        ELSE NEW.action_url
      END
    WHEN 'inventory.stock_request_rejected' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'inventory.waste_pending_approval' THEN
      format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      format('/br/%s/pos?voidRequest=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'hr.checkout_approved' THEN
      NEW.action_url
    WHEN 'hr.checkout_rejected' THEN
      NEW.action_url
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN '/inventory/stock'
        ELSE format('/br/%s/stock', NEW.target_branch_id)
      END
    WHEN 'work.task_assigned' THEN
      format('/work/tasks/%s', NEW.entity_id)
    ELSE NEW.action_url
  END;

  IF NEW.target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.target_branch_id
    AND branch.tenant_id = NEW.tenant_id;

  NEW.action_url := CASE NEW.kind
    WHEN 'inventory.stock_low' THEN
      CASE
        WHEN v_branch_kind = 'branch' AND NEW.entity_id IS NULL
          THEN format('/br/%s/stock', NEW.target_branch_id)
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/on-hand/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        WHEN NEW.entity_id IS NULL
          THEN format('/inventory/stock?branch=%s', NEW.target_branch_id)
        ELSE format(
          '/inventory/stock/%s?branch=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stock_request_submitted' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'workflow.grn_pending' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/transfer', NEW.target_branch_id)
        ELSE format('/inventory/grn/%s', NEW.entity_id)
      END
    WHEN 'inventory.count_slip_submitted' THEN
      format(
        '/br/%s/stock/count-slips?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )

    WHEN 'inventory.stocktake_completed' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branch=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stocktake_conflict' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branch=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.waste.weekly_report' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format(
          '/inventory/waste/approvals?branch=%s',
          NEW.target_branch_id
        )
      END
    WHEN 'workflow.transfer_in_transit' THEN
      format('/br/%s/stock/receive/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      format(
        '/br/%s/team?tab=leaves&leaveRequestId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'attendance.checkout_requested' THEN
      format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'hr.checkout_requested' THEN
      format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.count_slip_approved' THEN
      format(
        '/br/%s/stock/count-slips?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.count_slip_recount' THEN
      format(
        '/br/%s/stock/count?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
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

    WHEN 'inventory.stock_request_rejected' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock?work=receive', NEW.target_branch_id)
        ELSE format('/inventory/transfers?requestId=%s', NEW.entity_id)
      END
    WHEN 'inventory.waste_pending_approval' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
      END
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      format('/br/%s/pos?voidRequest=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'hr.checkout_approved' THEN
      NEW.action_url
    WHEN 'hr.checkout_rejected' THEN
      NEW.action_url
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock', NEW.target_branch_id)
        ELSE format('/inventory/stock?branch=%s', NEW.target_branch_id)
      END
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.canonicalize_notification() IS
  'Normalizes notification target_roles and action_url. Work assign uses /work/tasks/{id}; exact-user kinds set meta.target_user_id.';

REVOKE ALL ON FUNCTION public.add_work_task_comment(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_work_task_comment(bigint, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_work_task_checklist_item(
  bigint, bigint, text, boolean, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_work_task_checklist_item(
  bigint, bigint, text, boolean, integer
) TO authenticated, service_role;
