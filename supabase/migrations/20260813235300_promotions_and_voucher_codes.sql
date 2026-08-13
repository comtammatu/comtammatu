-- ADR 0039: promotions catalog, codes, redemptions; POS apply writes existing
-- order/item discount columns. Owner-only catalog; cashiers redeem via RPC.

-- ── Tables ──

CREATE TABLE public.promotions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id),
  name text NOT NULL,
  status text NOT NULL,
  kind text NOT NULL,
  discount_type text,
  discount_value numeric(15, 2),
  min_subtotal numeric(15, 2) NOT NULL DEFAULT 0,
  max_discount_amount numeric(15, 2),
  stack_with_item_discount boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  time_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  service_modes text[] NOT NULL DEFAULT ARRAY['dine_in', 'takeaway']::text[],
  bxgy_buy_qty integer,
  bxgy_get_qty integer,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT promotions_status_check CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  CONSTRAINT promotions_kind_check CHECK (
    kind IN ('order_pct', 'order_vnd', 'voucher_face', 'auto_order', 'bxgy')
  ),
  CONSTRAINT promotions_discount_type_check CHECK (
    discount_type IS NULL OR discount_type IN ('pct', 'vnd')
  ),
  CONSTRAINT promotions_min_subtotal_check CHECK (min_subtotal >= 0),
  CONSTRAINT promotions_max_discount_check CHECK (
    max_discount_amount IS NULL OR max_discount_amount > 0
  ),
  CONSTRAINT promotions_kind_fields_check CHECK (
    (
      kind = 'order_pct'
      AND discount_type = 'pct'
      AND discount_value IS NOT NULL
      AND discount_value > 0
    )
    OR (
      kind IN ('order_vnd', 'voucher_face', 'auto_order')
      AND discount_type IN ('pct', 'vnd')
      AND discount_value IS NOT NULL
      AND discount_value > 0
    )
    OR (
      kind = 'bxgy'
      AND bxgy_buy_qty IS NOT NULL
      AND bxgy_get_qty IS NOT NULL
      AND bxgy_buy_qty >= 1
      AND bxgy_get_qty >= 1
    )
  )
);

CREATE TABLE public.promotion_branches (
  promotion_id bigint NOT NULL REFERENCES public.promotions (id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches (id),
  tenant_id bigint NOT NULL REFERENCES public.tenants (id),
  PRIMARY KEY (promotion_id, branch_id)
);

CREATE TABLE public.promotion_items (
  promotion_id bigint NOT NULL REFERENCES public.promotions (id) ON DELETE CASCADE,
  menu_item_id bigint NOT NULL REFERENCES public.menu_items (id),
  tenant_id bigint NOT NULL REFERENCES public.tenants (id),
  item_role text NOT NULL,
  PRIMARY KEY (promotion_id, menu_item_id, item_role),
  CONSTRAINT promotion_items_role_check CHECK (item_role IN ('eligible', 'buy', 'get'))
);

CREATE TABLE public.promotion_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id),
  promotion_id bigint NOT NULL REFERENCES public.promotions (id) ON DELETE CASCADE,
  code text NOT NULL,
  kind text NOT NULL,
  face_value numeric(15, 2),
  max_redemptions integer NOT NULL DEFAULT 1,
  redeemed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text,
  CONSTRAINT promotion_codes_kind_check CHECK (kind IN ('reusable', 'unique')),
  CONSTRAINT promotion_codes_status_check CHECK (status IN ('active', 'redeemed', 'void')),
  CONSTRAINT promotion_codes_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  CONSTRAINT promotion_codes_max_redemptions_check CHECK (max_redemptions >= 1),
  CONSTRAINT promotion_codes_redeemed_count_check CHECK (
    redeemed_count >= 0 AND redeemed_count <= max_redemptions
  ),
  CONSTRAINT promotion_codes_unique_max CHECK (kind <> 'unique' OR max_redemptions = 1),
  UNIQUE (tenant_id, code)
);

CREATE TABLE public.promotion_redemptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id),
  promotion_id bigint NOT NULL REFERENCES public.promotions (id),
  code_id bigint REFERENCES public.promotion_codes (id),
  order_id bigint NOT NULL REFERENCES public.orders (id),
  branch_id bigint NOT NULL REFERENCES public.branches (id),
  applied_amount numeric(15, 2) NOT NULL,
  applied_as text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'applied',
  redeemed_by uuid,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  cleared_reason text,
  CONSTRAINT promotion_redemptions_applied_as_check CHECK (applied_as IN ('order', 'item')),
  CONSTRAINT promotion_redemptions_status_check CHECK (status IN ('applied', 'cleared'))
);

ALTER TABLE public.orders
  ADD COLUMN promotion_id bigint REFERENCES public.promotions (id) ON DELETE SET NULL,
  ADD COLUMN promotion_code_id bigint REFERENCES public.promotion_codes (id) ON DELETE SET NULL;

CREATE INDEX promotions_tenant_status_idx ON public.promotions (tenant_id, status);
CREATE INDEX promotion_codes_promotion_idx ON public.promotion_codes (promotion_id, status);
CREATE INDEX promotion_redemptions_order_idx ON public.promotion_redemptions (order_id, status);
CREATE INDEX orders_promotion_id_idx ON public.orders (promotion_id)
  WHERE promotion_id IS NOT NULL;

-- ── Permission catalog ──

INSERT INTO public.permission_keys (key, module, description, scope, is_delegable_to_staff)
VALUES
  ('promo:read', 'promotions', 'Xem chiến dịch khuyến mãi', 'tenant', false),
  ('promo:write', 'promotions', 'Tạo/sửa chiến dịch khuyến mãi', 'tenant', false),
  ('promo:issue', 'promotions', 'Phát hành mã voucher một lần', 'tenant', false)
ON CONFLICT (key) DO UPDATE
SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
SELECT 'tenant_owner', key
FROM public.permission_keys
WHERE key LIKE 'promo:%'
ON CONFLICT DO NOTHING;

-- ── Helpers ──

CREATE FUNCTION public.promotion_normalize_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT upper(btrim(COALESCE(p_code, '')));
$$;

CREATE FUNCTION public.promotion_is_eligible(
  p_promo public.promotions,
  p_branch_id bigint,
  p_order_type text,
  p_subtotal numeric,
  p_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_local timestamp;
  v_dow integer;
  v_hm text;
  v_ok boolean;
BEGIN
  IF p_promo.status IS DISTINCT FROM 'active' THEN
    RETURN false;
  END IF;

  IF p_promo.starts_at IS NOT NULL AND p_at < p_promo.starts_at THEN
    RETURN false;
  END IF;
  IF p_promo.ends_at IS NOT NULL AND p_at >= p_promo.ends_at THEN
    RETURN false;
  END IF;

  IF p_subtotal < COALESCE(p_promo.min_subtotal, 0) THEN
    RETURN false;
  END IF;

  IF p_order_type IS NULL OR NOT (p_order_type = ANY (p_promo.service_modes)) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.promotion_branches pb WHERE pb.promotion_id = p_promo.id
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.promotion_branches pb
      WHERE pb.promotion_id = p_promo.id AND pb.branch_id = p_branch_id
    ) THEN
      RETURN false;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = p_branch_id
        AND b.tenant_id = p_promo.tenant_id
        AND b.branch_kind = 'branch'
        AND b.is_active IS TRUE
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_promo.time_windows IS NULL OR jsonb_typeof(p_promo.time_windows) <> 'array'
     OR jsonb_array_length(p_promo.time_windows) = 0
  THEN
    RETURN true;
  END IF;

  v_local := timezone('Asia/Ho_Chi_Minh', p_at);
  v_dow := EXTRACT(DOW FROM v_local)::integer;
  v_hm := to_char(v_local, 'HH24:MI');

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_promo.time_windows) AS w
    WHERE (w ->> 'dow')::integer = v_dow
      AND v_hm >= COALESCE(w ->> 'start', '00:00')
      AND v_hm < COALESCE(w ->> 'end', '24:00')
  ) INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

CREATE FUNCTION public.promotion_order_amount(
  p_promo public.promotions,
  p_code public.promotion_codes,
  p_base numeric
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
  v_value numeric;
  v_amount numeric;
BEGIN
  IF p_promo.kind = 'bxgy' THEN
    RETURN 0;
  END IF;

  v_type := p_promo.discount_type;
  v_value := p_promo.discount_value;
  IF p_promo.kind = 'voucher_face' THEN
    v_type := 'vnd';
    v_value := COALESCE(p_code.face_value, p_promo.discount_value);
  END IF;

  v_amount := public.compute_discount_amount(v_type, v_value, p_base);
  IF p_promo.max_discount_amount IS NOT NULL THEN
    v_amount := LEAST(v_amount, p_promo.max_discount_amount);
  END IF;
  RETURN GREATEST(COALESCE(v_amount, 0), 0);
END;
$$;

CREATE FUNCTION public.promotion_assert_order_mutable(p_order public.orders)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF p_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION public.orders_block_promotion_restructure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.split_from_order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = NEW.split_from_order_id AND o.promotion_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'split_promotion_blocked' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.merged_into_order_id IS NOT NULL
     AND OLD.merged_into_order_id IS DISTINCT FROM NEW.merged_into_order_id
  THEN
    IF OLD.promotion_id IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM public.orders o
         WHERE o.id = NEW.merged_into_order_id AND o.promotion_id IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'merge_promotion_blocked' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_block_promotion_restructure
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_block_promotion_restructure();

CREATE FUNCTION public.order_items_block_promotion_item_stack()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text;
  v_stack boolean;
BEGIN
  IF NEW.discount_amount IS NULL OR NEW.discount_amount <= 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.discount_amount IS NOT DISTINCT FROM OLD.discount_amount
  THEN
    RETURN NEW;
  END IF;

  SELECT p.kind, p.stack_with_item_discount
  INTO v_kind, v_stack
  FROM public.orders o
  JOIN public.promotions p ON p.id = o.promotion_id
  WHERE o.id = NEW.order_id;

  IF FOUND AND v_kind IS DISTINCT FROM 'bxgy' AND v_stack IS FALSE THEN
    RAISE EXCEPTION 'promotion_item_stack_blocked' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_block_promotion_item_stack
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.order_items_block_promotion_item_stack();

-- ── Catalog RPCs ──

CREATE FUNCTION public.upsert_promotion(
  p_id bigint,
  p_name text,
  p_kind text,
  p_status text,
  p_discount_type text,
  p_discount_value numeric,
  p_min_subtotal numeric,
  p_max_discount_amount numeric,
  p_stack_with_item_discount boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_windows jsonb,
  p_service_modes text[],
  p_bxgy_buy_qty integer,
  p_bxgy_get_qty integer,
  p_branch_ids bigint[],
  p_items jsonb,
  p_reusable_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_id bigint;
  v_code text;
  v_item jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL::bigint, 'promo:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id = v_uid;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (
      tenant_id, name, status, kind, discount_type, discount_value,
      min_subtotal, max_discount_amount, stack_with_item_discount,
      starts_at, ends_at, time_windows, service_modes,
      bxgy_buy_qty, bxgy_get_qty, created_by
    ) VALUES (
      v_tenant, btrim(p_name), COALESCE(p_status, 'draft'), p_kind,
      p_discount_type, p_discount_value,
      COALESCE(p_min_subtotal, 0), p_max_discount_amount,
      COALESCE(p_stack_with_item_discount, true),
      p_starts_at, p_ends_at, COALESCE(p_time_windows, '[]'::jsonb),
      COALESCE(p_service_modes, ARRAY['dine_in', 'takeaway']::text[]),
      p_bxgy_buy_qty, p_bxgy_get_qty, v_uid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET
      name = btrim(p_name),
      status = COALESCE(p_status, status),
      kind = p_kind,
      discount_type = p_discount_type,
      discount_value = p_discount_value,
      min_subtotal = COALESCE(p_min_subtotal, 0),
      max_discount_amount = p_max_discount_amount,
      stack_with_item_discount = COALESCE(p_stack_with_item_discount, true),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      time_windows = COALESCE(p_time_windows, '[]'::jsonb),
      service_modes = COALESCE(p_service_modes, ARRAY['dine_in', 'takeaway']::text[]),
      bxgy_buy_qty = p_bxgy_buy_qty,
      bxgy_get_qty = p_bxgy_get_qty,
      updated_at = now()
    WHERE id = p_id AND tenant_id = v_tenant
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'promotion not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.promotion_branches WHERE promotion_id = v_id;
  IF p_branch_ids IS NOT NULL THEN
    INSERT INTO public.promotion_branches (promotion_id, branch_id, tenant_id)
    SELECT v_id, b.id, v_tenant
    FROM public.branches b
    WHERE b.tenant_id = v_tenant
      AND b.id = ANY (p_branch_ids)
      AND b.branch_kind = 'branch';
  END IF;

  DELETE FROM public.promotion_items WHERE promotion_id = v_id;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.promotion_items (promotion_id, menu_item_id, tenant_id, item_role)
      VALUES (
        v_id,
        (v_item ->> 'menu_item_id')::bigint,
        v_tenant,
        COALESCE(v_item ->> 'item_role', 'eligible')
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  v_code := public.promotion_normalize_code(p_reusable_code);
  IF v_code <> '' AND p_kind IN ('order_pct', 'order_vnd') THEN
    INSERT INTO public.promotion_codes (
      tenant_id, promotion_id, code, kind, max_redemptions, status
    ) VALUES (
      v_tenant, v_id, v_code, 'reusable', 1000000, 'active'
    )
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET
      promotion_id = EXCLUDED.promotion_id,
      status = 'active',
      kind = 'reusable'
    WHERE public.promotion_codes.kind = 'reusable';
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE FUNCTION public.set_promotion_status(p_promotion_id bigint, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_tenant bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL::bigint, 'promo:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id = v_uid;

  UPDATE public.promotions
  SET status = p_status, updated_at = now()
  WHERE id = p_promotion_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('id', p_promotion_id, 'status', p_status);
END;
$$;

CREATE FUNCTION public.issue_promotion_codes(
  p_promotion_id bigint,
  p_count integer,
  p_face_value numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_promo public.promotions;
  v_i integer;
  v_code text;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL::bigint, 'promo:issue') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 200 THEN
    RAISE EXCEPTION 'promotion_issue_count_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id = v_uid;
  SELECT * INTO v_promo FROM public.promotions
  WHERE id = p_promotion_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_promo.kind IS DISTINCT FROM 'voucher_face' THEN
    RAISE EXCEPTION 'promotion_not_voucher' USING ERRCODE = '22023';
  END IF;

  FOR v_i IN 1..p_count LOOP
    LOOP
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.promotion_codes c
        WHERE c.tenant_id = v_tenant AND c.code = v_code
      );
    END LOOP;
    INSERT INTO public.promotion_codes (
      tenant_id, promotion_id, code, kind, face_value, max_redemptions, status
    ) VALUES (
      v_tenant, p_promotion_id, v_code, 'unique', p_face_value, 1, 'active'
    )
    RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  RETURN jsonb_build_object('promotion_id', p_promotion_id, 'count', p_count, 'ids', to_jsonb(v_ids));
END;
$$;

CREATE FUNCTION public.void_promotion_code(p_code_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_reason text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL::bigint, 'promo:issue') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;
  SELECT p.tenant_id INTO v_tenant FROM public.profiles p WHERE p.id = v_uid;

  UPDATE public.promotion_codes
  SET status = 'void', voided_at = now(), void_reason = v_reason
  WHERE id = p_code_id
    AND tenant_id = v_tenant
    AND status = 'active'
    AND redeemed_count = 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion_code_not_voidable' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id', p_code_id, 'status', 'void');
END;
$$;

-- ── POS apply / clear / evaluate ──

CREATE FUNCTION public.promotion_apply_to_order(
  p_order public.orders,
  p_promo public.promotions,
  p_code public.promotion_codes,
  p_amount numeric,
  p_note text,
  p_uid uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_type text;
  v_value numeric;
BEGIN
  v_type := p_promo.discount_type;
  v_value := p_promo.discount_value;
  IF p_promo.kind = 'voucher_face' THEN
    v_type := 'vnd';
    v_value := p_amount;
  ELSIF v_type = 'pct' THEN
    v_value := p_promo.discount_value;
  ELSE
    v_type := 'vnd';
    v_value := p_amount;
  END IF;

  UPDATE public.orders
  SET
    discount_type = v_type,
    discount_value = v_value,
    discount_note = p_note,
    promotion_id = p_promo.id,
    promotion_code_id = p_code.id,
    updated_at = now()
  WHERE id = p_order.id;

  INSERT INTO public.promotion_redemptions (
    tenant_id, promotion_id, code_id, order_id, branch_id,
    applied_amount, applied_as, snapshot, status, redeemed_by
  ) VALUES (
    p_order.tenant_id, p_promo.id, p_code.id, p_order.id, p_order.branch_id,
    p_amount, 'order',
    jsonb_build_object(
      'name', p_promo.name,
      'kind', p_promo.kind,
      'code', p_code.code,
      'discount_type', v_type,
      'discount_value', v_value
    ),
    'applied', p_uid
  );
END;
$$;

CREATE FUNCTION public.preview_promotion_code(p_order_id bigint, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_prof_branch bigint;
  v_order public.orders;
  v_code public.promotion_codes;
  v_promo public.promotions;
  v_base numeric;
  v_amount numeric;
  v_norm text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id, p.branch_id INTO v_prof_tenant, v_prof_branch
  FROM public.profiles p WHERE p.id = v_uid;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_norm := public.promotion_normalize_code(p_code);
  SELECT * INTO v_code FROM public.promotion_codes
  WHERE tenant_id = v_order.tenant_id AND code = v_norm;
  IF NOT FOUND OR v_code.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_promo FROM public.promotions WHERE id = v_code.promotion_id;
  v_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );
  IF NOT public.promotion_is_eligible(
    v_promo, v_order.branch_id, v_order.order_type, v_base, now()
  ) THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF v_code.kind = 'unique' AND v_code.redeemed_count >= v_code.max_redemptions THEN
    RAISE EXCEPTION 'promotion_code_spent' USING ERRCODE = '22023';
  END IF;
  v_amount := public.promotion_order_amount(v_promo, v_code, v_base);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'promotion_id', v_promo.id,
    'name', v_promo.name,
    'code', v_code.code,
    'kind', v_promo.kind,
    'amount', v_amount
  );
END;
$$;

CREATE FUNCTION public.apply_promotion_code(p_order_id bigint, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_code public.promotion_codes;
  v_promo public.promotions;
  v_base numeric;
  v_amount numeric;
  v_norm text;
  v_note text;
  v_totals record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_already_applied' USING ERRCODE = '22023';
  END IF;
  IF v_order.discount_type IS NOT NULL AND COALESCE(v_order.order_discount_amount, 0) > 0 THEN
    RAISE EXCEPTION 'manual_discount_present' USING ERRCODE = '22023';
  END IF;

  v_norm := public.promotion_normalize_code(p_code);
  SELECT * INTO v_code FROM public.promotion_codes
  WHERE tenant_id = v_order.tenant_id AND code = v_norm
  FOR UPDATE;
  IF NOT FOUND OR v_code.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'promotion_code_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_promo FROM public.promotions WHERE id = v_code.promotion_id;
  v_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );
  IF NOT public.promotion_is_eligible(
    v_promo, v_order.branch_id, v_order.order_type, v_base, now()
  ) THEN
    RAISE EXCEPTION 'promotion_not_eligible' USING ERRCODE = '22023';
  END IF;
  IF v_code.redeemed_count >= v_code.max_redemptions THEN
    RAISE EXCEPTION 'promotion_code_spent' USING ERRCODE = '22023';
  END IF;
  v_amount := public.promotion_order_amount(v_promo, v_code, v_base);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  v_note := v_promo.name || ' · ' || v_code.code;
  PERFORM public.promotion_apply_to_order(v_order, v_promo, v_code, v_amount, v_note, v_uid);

  UPDATE public.promotion_codes
  SET
    redeemed_count = redeemed_count + 1,
    status = CASE
      WHEN kind = 'unique' OR redeemed_count + 1 >= max_redemptions THEN 'redeemed'
      ELSE status
    END
  WHERE id = v_code.id;

  SELECT order_discount_amount, discount_amount, total_amount
  INTO v_totals FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'promotion_id', v_promo.id,
    'code', v_code.code,
    'name', v_promo.name,
    'discount_amount', v_totals.order_discount_amount,
    'total_discount_amount', v_totals.discount_amount,
    'total_amount', v_totals.total_amount
  );
END;
$$;

CREATE FUNCTION public.clear_promotion(p_order_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_reason text;
  v_code public.promotion_codes;
  v_promo public.promotions;
  v_snap jsonb;
  v_item_id bigint;
  v_totals record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'discount_note_required' USING ERRCODE = '22023';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);
  IF v_order.promotion_id IS NULL THEN
    RAISE EXCEPTION 'promotion_not_applied' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
  IF v_order.promotion_code_id IS NOT NULL THEN
    SELECT * INTO v_code FROM public.promotion_codes
    WHERE id = v_order.promotion_code_id FOR UPDATE;
    IF FOUND AND v_code.kind = 'unique' THEN
      UPDATE public.promotion_codes
      SET redeemed_count = GREATEST(redeemed_count - 1, 0), status = 'active'
      WHERE id = v_code.id;
    ELSIF FOUND THEN
      UPDATE public.promotion_codes
      SET redeemed_count = GREATEST(redeemed_count - 1, 0),
          status = CASE WHEN status = 'redeemed' THEN 'active' ELSE status END
      WHERE id = v_code.id;
    END IF;
  END IF;

  SELECT snapshot INTO v_snap
  FROM public.promotion_redemptions
  WHERE order_id = p_order_id AND status = 'applied'
  ORDER BY id DESC LIMIT 1;

  IF v_promo.kind = 'bxgy' AND v_snap ? 'item_ids' THEN
    FOR v_item_id IN SELECT jsonb_array_elements_text(v_snap -> 'item_ids')::bigint
    LOOP
      UPDATE public.order_items
      SET discount_type = NULL, discount_value = NULL, discount_note = NULL, updated_at = now()
      WHERE id = v_item_id AND order_id = p_order_id;
    END LOOP;
  END IF;

  UPDATE public.promotion_redemptions
  SET status = 'cleared', cleared_at = now(), cleared_reason = v_reason
  WHERE order_id = p_order_id AND status = 'applied';

  UPDATE public.orders
  SET
    discount_type = NULL,
    discount_value = NULL,
    discount_note = NULL,
    promotion_id = NULL,
    promotion_code_id = NULL,
    updated_at = now()
  WHERE id = p_order_id;

  SELECT total_amount INTO v_totals FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('order_id', p_order_id, 'total_amount', v_totals.total_amount);
END;
$$;

CREATE FUNCTION public.promotion_apply_bxgy(p_order public.orders, p_promo public.promotions)
RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_buy integer;
  v_get integer;
  v_units integer := 0;
  v_free integer;
  v_need integer;
  v_item record;
  v_take integer;
  v_amount numeric := 0;
  v_line numeric;
  v_ids bigint[] := ARRAY[]::bigint[];
BEGIN
  v_buy := COALESCE(p_promo.bxgy_buy_qty, 0);
  v_get := COALESCE(p_promo.bxgy_get_qty, 0);
  IF v_buy < 1 OR v_get < 1 THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.quantity, oi.subtotal, oi.unit_price, oi.menu_item_id
    FROM public.order_items oi
    WHERE oi.order_id = p_order.id AND oi.status <> 'cancelled'
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.promotion_items pi WHERE pi.promotion_id = p_promo.id
        )
        OR EXISTS (
          SELECT 1 FROM public.promotion_items pi
          WHERE pi.promotion_id = p_promo.id
            AND pi.menu_item_id = oi.menu_item_id
            AND pi.item_role IN ('eligible', 'buy', 'get')
        )
      )
    ORDER BY oi.unit_price ASC, oi.id ASC
  LOOP
    v_units := v_units + v_item.quantity;
  END LOOP;

  v_free := (v_units / (v_buy + v_get)) * v_get;
  IF v_free < 1 THEN
    RETURN 0;
  END IF;

  v_need := v_free;
  FOR v_item IN
    SELECT oi.id, oi.quantity, oi.unit_price
    FROM public.order_items oi
    WHERE oi.order_id = p_order.id AND oi.status <> 'cancelled'
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.promotion_items pi WHERE pi.promotion_id = p_promo.id
        )
        OR EXISTS (
          SELECT 1 FROM public.promotion_items pi
          WHERE pi.promotion_id = p_promo.id
            AND pi.menu_item_id = oi.menu_item_id
            AND pi.item_role IN ('eligible', 'buy', 'get')
        )
      )
    ORDER BY oi.unit_price ASC, oi.id ASC
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_item.quantity, v_need);
    v_line := v_take * v_item.unit_price;
    UPDATE public.order_items
    SET
      discount_type = 'vnd',
      discount_value = v_line,
      discount_note = p_promo.name,
      updated_at = now()
    WHERE id = v_item.id;
    v_ids := array_append(v_ids, v_item.id);
    v_amount := v_amount + v_line;
    v_need := v_need - v_take;
  END LOOP;

  INSERT INTO public.promotion_redemptions (
    tenant_id, promotion_id, order_id, branch_id,
    applied_amount, applied_as, snapshot, status, redeemed_by
  ) VALUES (
    p_order.tenant_id, p_promo.id, p_order.id, p_order.branch_id,
    v_amount, 'item',
    jsonb_build_object('name', p_promo.name, 'kind', 'bxgy', 'item_ids', to_jsonb(v_ids)),
    'applied', auth.uid()
  );

  UPDATE public.orders
  SET promotion_id = p_promo.id, discount_note = p_promo.name, updated_at = now()
  WHERE id = p_order.id;

  RETURN v_amount;
END;
$$;

CREATE FUNCTION public.evaluate_order_promotions(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_order public.orders;
  v_promo public.promotions;
  v_base numeric;
  v_amount numeric;
  v_note text;
  v_totals record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id INTO v_prof_tenant FROM public.profiles p WHERE p.id = v_uid;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:use') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.promotion_assert_order_mutable(v_order);

  v_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );

  IF v_order.promotion_id IS NOT NULL THEN
    SELECT * INTO v_promo FROM public.promotions WHERE id = v_order.promotion_id;
    IF v_promo.kind IN ('order_pct', 'order_vnd', 'voucher_face') THEN
      SELECT order_discount_amount, discount_amount, total_amount, promotion_id
      INTO v_totals FROM public.orders WHERE id = p_order_id;
      RETURN jsonb_build_object(
        'order_id', p_order_id,
        'promotion_id', v_order.promotion_id,
        'discount_amount', v_totals.order_discount_amount,
        'total_amount', v_totals.total_amount
      );
    END IF;
    IF NOT public.promotion_is_eligible(
      v_promo, v_order.branch_id, v_order.order_type, v_base, now()
    ) THEN
      PERFORM public.clear_promotion(p_order_id, 'Khuyến mãi hết điều kiện');
      SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    ELSIF v_promo.kind = 'auto_order' THEN
      v_amount := public.promotion_order_amount(v_promo, NULL::public.promotion_codes, v_base);
      v_note := v_promo.name;
      UPDATE public.orders
      SET
        discount_type = v_promo.discount_type,
        discount_value = CASE
          WHEN v_promo.discount_type = 'pct' THEN v_promo.discount_value
          ELSE v_amount
        END,
        discount_note = v_note,
        updated_at = now()
      WHERE id = p_order_id;
    ELSIF v_promo.kind = 'bxgy' THEN
      PERFORM public.clear_promotion(p_order_id, 'Tính lại mua X tặng Y');
      SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
      IF public.promotion_is_eligible(
        v_promo, v_order.branch_id, v_order.order_type, v_base, now()
      ) THEN
        PERFORM public.promotion_apply_bxgy(v_order, v_promo);
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.promotion_id IS NULL
     AND (v_order.discount_type IS NULL OR COALESCE(v_order.order_discount_amount, 0) = 0)
  THEN
    SELECT p.* INTO v_promo
    FROM public.promotions p
    WHERE p.tenant_id = v_order.tenant_id
      AND p.kind = 'auto_order'
      AND public.promotion_is_eligible(
        p, v_order.branch_id, v_order.order_type, v_base, now()
      )
    ORDER BY p.id
    LIMIT 1;
    IF FOUND THEN
      v_amount := public.promotion_order_amount(v_promo, NULL::public.promotion_codes, v_base);
      IF v_amount > 0 THEN
        UPDATE public.orders
        SET
          discount_type = v_promo.discount_type,
          discount_value = CASE
            WHEN v_promo.discount_type = 'pct' THEN v_promo.discount_value
            ELSE v_amount
          END,
          discount_note = v_promo.name,
          promotion_id = v_promo.id,
          updated_at = now()
        WHERE id = p_order_id;
        INSERT INTO public.promotion_redemptions (
          tenant_id, promotion_id, order_id, branch_id,
          applied_amount, applied_as, snapshot, status, redeemed_by
        ) VALUES (
          v_order.tenant_id, v_promo.id, p_order_id, v_order.branch_id,
          v_amount, 'order',
          jsonb_build_object('name', v_promo.name, 'kind', 'auto_order'),
          'applied', v_uid
        );
      END IF;
    ELSE
      SELECT p.* INTO v_promo
      FROM public.promotions p
      WHERE p.tenant_id = v_order.tenant_id
        AND p.kind = 'bxgy'
        AND public.promotion_is_eligible(
          p, v_order.branch_id, v_order.order_type,
          COALESCE(v_order.subtotal, 0), now()
        )
      ORDER BY p.id
      LIMIT 1;
      IF FOUND THEN
        PERFORM public.promotion_apply_bxgy(v_order, v_promo);
      END IF;
    END IF;
  END IF;

  SELECT order_discount_amount, discount_amount, total_amount, promotion_id
  INTO v_totals FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'promotion_id', v_totals.promotion_id,
    'discount_amount', v_totals.order_discount_amount,
    'total_discount_amount', v_totals.discount_amount,
    'total_amount', v_totals.total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_order_discount(
  p_order_id bigint,
  p_type text,
  p_value numeric,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_prof_branch bigint;
  v_prof_role text;
  v_order record;
  v_note_trim text;
  v_clamped_value numeric(15, 2);
  v_discount_base numeric(15, 2);
  v_discount_amount numeric(15, 2);
  v_updated_order record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
         o.subtotal, o.service_charge, o.item_discount_amount, o.promotion_id
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
  IF v_prof_role IN ('owner') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:apply_discount') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_already_applied' USING ERRCODE = '22023';
  END IF;
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  v_discount_base := GREATEST(
    COALESCE(v_order.subtotal, 0) - COALESCE(v_order.item_discount_amount, 0),
    0
  );
  IF p_type = 'pct' THEN
    v_clamped_value := LEAST(p_value, 100);
  ELSE
    v_clamped_value := LEAST(p_value, v_discount_base);
  END IF;
  v_discount_amount := public.compute_discount_amount(p_type, v_clamped_value, v_discount_base);
  IF v_discount_amount = 0 THEN
    RAISE EXCEPTION 'discount_zero_amount' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET discount_type = p_type, discount_value = v_clamped_value,
      discount_note = v_note_trim, updated_at = now()
  WHERE id = p_order_id
  RETURNING discount_type, discount_value, order_discount_amount,
            item_discount_amount, discount_amount, total_amount
  INTO v_updated_order;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_applied: ' || p_type || ' ' || v_clamped_value::text
      || ' (' || v_updated_order.order_discount_amount::text || 'đ) :: ' || v_note_trim
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'discount_type', v_updated_order.discount_type,
    'discount_value', v_updated_order.discount_value,
    'discount_amount', v_updated_order.order_discount_amount,
    'order_discount_amount', v_updated_order.order_discount_amount,
    'item_discount_amount', v_updated_order.item_discount_amount,
    'total_discount_amount', v_updated_order.discount_amount,
    'total_amount', v_updated_order.total_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_order_discount(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_prof_tenant bigint;
  v_prof_branch bigint;
  v_prof_role text;
  v_order record;
  v_updated_order record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;
  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);
  SELECT o.id, o.tenant_id, o.branch_id, o.status, o.payment_status, o.promotion_id
  INTO v_order
  FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_prof_role IN ('owner') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_order.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:apply_discount') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_order.promotion_id IS NOT NULL THEN
    RAISE EXCEPTION 'promotion_clear_required' USING ERRCODE = '22023';
  END IF;
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_order.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'order already paid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET discount_type = NULL, discount_value = NULL, discount_note = NULL, updated_at = now()
  WHERE id = p_order_id
  RETURNING order_discount_amount, item_discount_amount, discount_amount, total_amount
  INTO v_updated_order;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_order.tenant_id, p_order_id, v_order.status, v_order.status, v_uid,
    'discount_cleared'
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'total_amount', v_updated_order.total_amount
  );
END;
$$;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotions_select ON public.promotions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL::bigint, 'promo:read')
  );

CREATE POLICY promotion_branches_select ON public.promotion_branches
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL::bigint, 'promo:read')
  );

CREATE POLICY promotion_items_select ON public.promotion_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL::bigint, 'promo:read')
  );

CREATE POLICY promotion_codes_select ON public.promotion_codes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL::bigint, 'promo:read')
  );

CREATE POLICY promotion_redemptions_select ON public.promotion_redemptions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL::bigint, 'promo:read')
  );

REVOKE ALL ON TABLE public.promotions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.promotion_branches FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.promotion_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.promotion_codes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.promotion_redemptions FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.promotions TO authenticated;
GRANT SELECT ON TABLE public.promotion_branches TO authenticated;
GRANT SELECT ON TABLE public.promotion_items TO authenticated;
GRANT SELECT ON TABLE public.promotion_codes TO authenticated;
GRANT SELECT ON TABLE public.promotion_redemptions TO authenticated;

GRANT ALL ON TABLE public.promotions TO service_role;
GRANT ALL ON TABLE public.promotion_branches TO service_role;
GRANT ALL ON TABLE public.promotion_items TO service_role;
GRANT ALL ON TABLE public.promotion_codes TO service_role;
GRANT ALL ON TABLE public.promotion_redemptions TO service_role;

REVOKE ALL ON FUNCTION public.promotion_normalize_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_normalize_code(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_is_eligible(public.promotions, bigint, text, numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_is_eligible(public.promotions, bigint, text, numeric, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_order_amount(public.promotions, public.promotion_codes, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_order_amount(public.promotions, public.promotion_codes, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_assert_order_mutable(public.orders) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_assert_order_mutable(public.orders) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.orders_block_promotion_restructure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orders_block_promotion_restructure() TO service_role;

REVOKE ALL ON FUNCTION public.order_items_block_promotion_item_stack() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_items_block_promotion_item_stack() TO service_role;

REVOKE ALL ON FUNCTION public.upsert_promotion(bigint, text, text, text, text, numeric, numeric, numeric, boolean, timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_promotion(bigint, text, text, text, text, numeric, numeric, numeric, boolean, timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_promotion_status(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_promotion_status(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_promotion_codes(bigint, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_promotion_codes(bigint, integer, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.void_promotion_code(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_promotion_code(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_apply_to_order(public.orders, public.promotions, public.promotion_codes, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_apply_to_order(public.orders, public.promotions, public.promotion_codes, numeric, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.preview_promotion_code(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_promotion_code(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_promotion_code(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_promotion_code(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.clear_promotion(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_promotion(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.promotion_apply_bxgy(public.orders, public.promotions) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_apply_bxgy(public.orders, public.promotions) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.evaluate_order_promotions(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_order_promotions(bigint) TO authenticated, service_role;
