-- Immutable sale-time item classification.
ALTER TABLE public.order_items
  ADD COLUMN category_type_snapshot text,
  ADD COLUMN category_snapshot_source text;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_category_snapshot_pair_check
  CHECK (
    (category_type_snapshot IS NULL AND category_snapshot_source IS NULL)
    OR (
      category_type_snapshot IN (
        'main_dish',
        'side_dish',
        'drink',
        'dessert'
      )
      AND category_snapshot_source = 'sale_snapshot'
    )
  );

COMMENT ON COLUMN public.order_items.category_type_snapshot IS
  'Menu category type captured at sale time. NULL identifies legacy rows without an immutable category snapshot.';
COMMENT ON COLUMN public.order_items.category_snapshot_source IS
  'sale_snapshot for new rows; NULL for legacy rows whose historical category is not canonical.';

CREATE FUNCTION private.snapshot_order_item_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.menu_item_id IS DISTINCT FROM OLD.menu_item_id
      OR NEW.category_type_snapshot IS DISTINCT FROM OLD.category_type_snapshot
      OR NEW.category_snapshot_source IS DISTINCT FROM OLD.category_snapshot_source
    THEN
      RAISE EXCEPTION 'order_item_category_snapshot_immutable'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  SELECT category.type
  INTO NEW.category_type_snapshot
  FROM public.menu_items item
  JOIN public.menu_categories category
    ON category.id = item.category_id
   AND category.tenant_id = item.tenant_id
  WHERE item.id = NEW.menu_item_id
    AND item.tenant_id = NEW.tenant_id;

  IF NEW.category_type_snapshot IS NULL THEN
    RAISE EXCEPTION 'order_item_category_snapshot_missing'
      USING ERRCODE = '23514';
  END IF;

  NEW.category_snapshot_source := 'sale_snapshot';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_order_item_category()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_order_items_category_snapshot
BEFORE INSERT OR UPDATE OF
  menu_item_id,
  category_type_snapshot,
  category_snapshot_source
ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION private.snapshot_order_item_category();

-- Append-only KDS evidence. Ticket and batch keys intentionally have no foreign
-- keys so live-ticket cleanup cannot delete or block operational history.
CREATE TABLE public.kds_ticket_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  order_id bigint NOT NULL,
  ticket_id bigint NOT NULL,
  order_item_id bigint NOT NULL,
  station_id bigint NOT NULL,
  kitchen_send_batch_id bigint,
  event_type text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  reason text,
  item_snapshot jsonb NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kds_ticket_events_event_type_check CHECK (
    event_type IN (
      'sent',
      'preparing',
      'completed',
      'recalled',
      'served',
      'cancelled',
      'out_of_stock'
    )
  )
);

COMMENT ON TABLE public.kds_ticket_events IS
  'Append-only KDS transition evidence written only by the canonical kds_tickets trigger. Live ticket cleanup never removes these rows.';

CREATE INDEX kds_ticket_events_branch_cursor_idx
  ON public.kds_ticket_events (
    tenant_id,
    branch_id,
    occurred_at DESC,
    id DESC
  );

CREATE INDEX kds_ticket_events_branch_type_cursor_idx
  ON public.kds_ticket_events (
    tenant_id,
    branch_id,
    event_type,
    occurred_at DESC,
    id DESC
  );

CREATE INDEX kds_ticket_events_order_idx
  ON public.kds_ticket_events (tenant_id, order_id, occurred_at, id);

ALTER TABLE public.kds_ticket_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kds_ticket_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.kds_ticket_events_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.kds_ticket_events TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.kds_ticket_events_id_seq TO service_role;

CREATE FUNCTION private.guard_kds_ticket_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'kds_ticket_event_immutable'
    USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION private.guard_kds_ticket_event_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_kds_ticket_events_immutable
BEFORE UPDATE OR DELETE
ON public.kds_ticket_events
FOR EACH ROW
EXECUTE FUNCTION private.guard_kds_ticket_event_immutable();

CREATE FUNCTION private.capture_kds_ticket_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_actor_id uuid;
  v_station_name text;
  v_item public.order_items%ROWTYPE;
  v_batch public.kitchen_send_batches%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE NEW.status
      WHEN 'pending' THEN 'sent'
      WHEN 'preparing' THEN 'preparing'
      WHEN 'ready' THEN 'completed'
      WHEN 'served' THEN 'served'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE NULL
    END;
  ELSIF NEW.status = 'preparing' AND OLD.status = 'ready' THEN
    v_event_type := 'recalled';
  ELSIF NEW.status = 'pending' AND OLD.status = 'preparing' THEN
    v_event_type := 'recalled';
  ELSIF NEW.status = 'preparing' THEN
    v_event_type := 'preparing';
  ELSIF NEW.status = 'ready' THEN
    v_event_type := 'completed';
  ELSIF NEW.status = 'served' THEN
    v_event_type := 'served';
  ELSIF NEW.status = 'cancelled' THEN
    SELECT *
    INTO v_item
    FROM public.order_items item
    WHERE item.id = NEW.order_item_id
      AND item.tenant_id = NEW.tenant_id;

    v_event_type := CASE
      WHEN COALESCE(v_item.cancel_reason, '') LIKE 'kds_out_of_stock:%'
        THEN 'out_of_stock'
      ELSE 'cancelled'
    END;
  ELSE
    RETURN NULL;
  END IF;

  IF v_event_type IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_item.id IS NULL THEN
    SELECT *
    INTO v_item
    FROM public.order_items item
    WHERE item.id = NEW.order_item_id
      AND item.tenant_id = NEW.tenant_id;
  END IF;

  IF v_event_type = 'cancelled'
    AND COALESCE(v_item.cancel_reason, '') LIKE 'kds_out_of_stock:%'
  THEN
    v_event_type := 'out_of_stock';
  END IF;

  IF NEW.kitchen_send_batch_id IS NOT NULL THEN
    SELECT *
    INTO v_batch
    FROM public.kitchen_send_batches batch
    WHERE batch.id = NEW.kitchen_send_batch_id
      AND batch.tenant_id = NEW.tenant_id;
  END IF;

  SELECT station.name
  INTO v_station_name
  FROM public.kds_stations station
  WHERE station.id = NEW.station_id
    AND station.tenant_id = NEW.tenant_id
    AND station.branch_id = NEW.branch_id;

  v_actor_id := COALESCE(auth.uid(), NEW.bumped_by, v_batch.created_by);

  INSERT INTO public.kds_ticket_events (
    tenant_id,
    branch_id,
    order_id,
    ticket_id,
    order_item_id,
    station_id,
    kitchen_send_batch_id,
    event_type,
    from_status,
    to_status,
    actor_id,
    reason,
    item_snapshot,
    context,
    occurred_at
  ) VALUES (
    NEW.tenant_id,
    NEW.branch_id,
    NEW.order_id,
    NEW.id,
    NEW.order_item_id,
    NEW.station_id,
    NEW.kitchen_send_batch_id,
    v_event_type,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    v_actor_id,
    v_item.cancel_reason,
    jsonb_build_object(
      'item_id', v_item.id,
      'menu_item_id', v_item.menu_item_id,
      'item_name', v_item.item_name,
      'variant_name', v_item.variant_name,
      'quantity', v_item.quantity,
      'modifiers', v_item.modifiers,
      'sides', v_item.sides,
      'note', v_item.note,
      'category_type', v_item.category_type_snapshot,
      'category_source', v_item.category_snapshot_source
    ),
    jsonb_build_object(
      'kitchen_ticket_number', v_batch.kitchen_ticket_number,
      'station_name', v_station_name,
      'send_seq', v_batch.send_seq,
      'send_kind', v_batch.kind,
      'first_ready_at', NEW.first_ready_at,
      'bumped_at', NEW.bumped_at
    ),
    CASE WHEN TG_OP = 'INSERT' THEN NEW.created_at ELSE now() END
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_kds_ticket_event()
  FROM PUBLIC, anon, authenticated, service_role;

-- The event ledger starts at this migration. Preserve the live completion
-- state that still exists at cutover, but label it as a snapshot instead of
-- fabricating a historical transition.
INSERT INTO public.kds_ticket_events (
  tenant_id,
  branch_id,
  order_id,
  ticket_id,
  order_item_id,
  station_id,
  kitchen_send_batch_id,
  event_type,
  from_status,
  to_status,
  actor_id,
  reason,
  item_snapshot,
  context,
  occurred_at
)
SELECT
  ticket.tenant_id,
  ticket.branch_id,
  ticket.order_id,
  ticket.id,
  ticket.order_item_id,
  ticket.station_id,
  ticket.kitchen_send_batch_id,
  'completed',
  NULL,
  ticket.status,
  COALESCE(ticket.bumped_by, batch.created_by),
  item.cancel_reason,
  jsonb_build_object(
    'item_id', item.id,
    'menu_item_id', item.menu_item_id,
    'item_name', item.item_name,
    'variant_name', item.variant_name,
    'quantity', item.quantity,
    'modifiers', item.modifiers,
    'sides', item.sides,
    'note', item.note,
    'category_type', item.category_type_snapshot,
    'category_source', item.category_snapshot_source
  ),
  jsonb_build_object(
    'kitchen_ticket_number', batch.kitchen_ticket_number,
    'station_name', station.name,
    'send_seq', batch.send_seq,
    'send_kind', batch.kind,
    'first_ready_at', ticket.first_ready_at,
    'bumped_at', ticket.bumped_at,
    'evidence_source', 'legacy_live_snapshot'
  ),
  COALESCE(
    ticket.first_ready_at,
    ticket.bumped_at,
    ticket.updated_at,
    ticket.created_at
  )
FROM public.kds_tickets ticket
JOIN public.order_items item
  ON item.id = ticket.order_item_id
 AND item.tenant_id = ticket.tenant_id
LEFT JOIN public.kitchen_send_batches batch
  ON batch.id = ticket.kitchen_send_batch_id
 AND batch.tenant_id = ticket.tenant_id
LEFT JOIN public.kds_stations station
  ON station.id = ticket.station_id
 AND station.tenant_id = ticket.tenant_id
 AND station.branch_id = ticket.branch_id
WHERE ticket.status IN ('ready', 'served');

INSERT INTO public.kds_ticket_events (
  tenant_id,
  branch_id,
  order_id,
  ticket_id,
  order_item_id,
  station_id,
  kitchen_send_batch_id,
  event_type,
  from_status,
  to_status,
  actor_id,
  reason,
  item_snapshot,
  context,
  occurred_at
)
SELECT
  ticket.tenant_id,
  ticket.branch_id,
  ticket.order_id,
  ticket.id,
  ticket.order_item_id,
  ticket.station_id,
  ticket.kitchen_send_batch_id,
  'served',
  'ready',
  'served',
  COALESCE(ticket.bumped_by, batch.created_by),
  item.cancel_reason,
  jsonb_build_object(
    'item_id', item.id,
    'menu_item_id', item.menu_item_id,
    'item_name', item.item_name,
    'variant_name', item.variant_name,
    'quantity', item.quantity,
    'modifiers', item.modifiers,
    'sides', item.sides,
    'note', item.note,
    'category_type', item.category_type_snapshot,
    'category_source', item.category_snapshot_source
  ),
  jsonb_build_object(
    'kitchen_ticket_number', batch.kitchen_ticket_number,
    'station_name', station.name,
    'send_seq', batch.send_seq,
    'send_kind', batch.kind,
    'first_ready_at', ticket.first_ready_at,
    'bumped_at', ticket.bumped_at,
    'evidence_source', 'legacy_live_snapshot'
  ),
  COALESCE(ticket.updated_at, ticket.bumped_at, ticket.created_at)
FROM public.kds_tickets ticket
JOIN public.order_items item
  ON item.id = ticket.order_item_id
 AND item.tenant_id = ticket.tenant_id
LEFT JOIN public.kitchen_send_batches batch
  ON batch.id = ticket.kitchen_send_batch_id
 AND batch.tenant_id = ticket.tenant_id
LEFT JOIN public.kds_stations station
  ON station.id = ticket.station_id
 AND station.tenant_id = ticket.tenant_id
 AND station.branch_id = ticket.branch_id
WHERE ticket.status = 'served';

CREATE TRIGGER trg_kds_tickets_capture_event
AFTER INSERT OR UPDATE OF status
ON public.kds_tickets
FOR EACH ROW
EXECUTE FUNCTION private.capture_kds_ticket_event();

CREATE FUNCTION public.get_kds_ticket_history(
  p_branch_id bigint,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_before_at timestamptz DEFAULT NULL,
  p_before_id bigint DEFAULT NULL,
  p_order_id bigint DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS TABLE (
  event_id bigint,
  event_type text,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  order_id bigint,
  ticket_id bigint,
  order_item_id bigint,
  station_id bigint,
  kitchen_send_batch_id bigint,
  from_status text,
  to_status text,
  reason text,
  item_snapshot jsonb,
  context jsonb,
  print_jobs jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  IF p_event_type IS NOT NULL AND p_event_type NOT IN (
    'sent',
    'preparing',
    'completed',
    'recalled',
    'served',
    'cancelled',
    'out_of_stock'
  ) THEN
    RAISE EXCEPTION 'invalid_kds_event_type' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'kds:use') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    event.id,
    event.event_type,
    event.occurred_at,
    event.actor_id,
    actor.full_name,
    event.order_id,
    event.ticket_id,
    event.order_item_id,
    event.station_id,
    event.kitchen_send_batch_id,
    event.from_status,
    event.to_status,
    event.reason,
    event.item_snapshot,
    event.context,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', job.id,
          'job_type', job.job_type,
          'status', job.status,
          'created_at', job.created_at
        )
        ORDER BY job.created_at, job.id
      )
      FROM public.print_jobs job
      WHERE job.tenant_id = event.tenant_id
        AND job.order_id = event.order_id
        AND COALESCE(job.payload->'ticket_ids', '[]'::jsonb)
          @> jsonb_build_array(event.ticket_id)
    ), '[]'::jsonb)
  FROM public.kds_ticket_events event
  LEFT JOIN public.profiles actor
    ON actor.id = event.actor_id
   AND actor.tenant_id = event.tenant_id
  WHERE event.tenant_id = v_tenant_id
    AND event.branch_id = p_branch_id
    AND (p_from IS NULL OR event.occurred_at >= p_from)
    AND (p_to IS NULL OR event.occurred_at < p_to)
    AND (p_order_id IS NULL OR event.order_id = p_order_id)
    AND (p_event_type IS NULL OR event.event_type = p_event_type)
    AND (
      p_before_at IS NULL
      OR event.occurred_at < p_before_at
      OR (
        event.occurred_at = p_before_at
        AND p_before_id IS NOT NULL
        AND event.id < p_before_id
      )
    )
  ORDER BY event.occurred_at DESC, event.id DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_kds_ticket_history(
  bigint,
  timestamptz,
  timestamptz,
  integer,
  timestamptz,
  bigint,
  bigint,
  text
) IS
  'Branch-scoped immutable KDS history. Cursor ordering is (occurred_at, id); live ticket cleanup does not affect results.';

REVOKE ALL ON FUNCTION public.get_kds_ticket_history(
  bigint,
  timestamptz,
  timestamptz,
  integer,
  timestamptz,
  bigint,
  bigint,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_ticket_history(
  bigint,
  timestamptz,
  timestamptz,
  integer,
  timestamptz,
  bigint,
  bigint,
  text
) TO authenticated, service_role;

-- Print jobs are append-only evidence apart from their lifecycle fields.
CREATE FUNCTION private.guard_print_job_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.printer_id IS DISTINCT FROM OLD.printer_id
    OR NEW.job_type IS DISTINCT FROM OLD.job_type
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.reprinted_from_id IS DISTINCT FROM OLD.reprinted_from_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'print_job_evidence_immutable'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_print_job_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_print_jobs_evidence_immutable
BEFORE UPDATE
ON public.print_jobs
FOR EACH ROW
EXECUTE FUNCTION private.guard_print_job_evidence();

DROP POLICY IF EXISTS print_jobs_update ON public.print_jobs;
REVOKE UPDATE, DELETE, MAINTAIN
  ON TABLE public.print_jobs FROM anon, authenticated;
