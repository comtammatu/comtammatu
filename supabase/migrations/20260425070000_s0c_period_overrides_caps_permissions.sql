-- =============================================================
-- S0-c Foundation — Period close, override code, daily waste cap,
-- and 14 inventory/procurement/accounting permission keys.
--
-- Sections:
--   (A) branch_override_codes + verify RPC (bcrypt, rate-limited)
--   (B) accounting_periods + enforce_period_close() trigger fn
--   (C) branch_daily_waste_cap snapshot + nightly compute cron
--   (D) Insert 14 permission keys + wire into system role templates
--
-- Spec:       docs/plan/inventory-redesign.md §Q3 §B4 §B5 §B8 §3
-- Regression: tasks/regressions.md PERIOD-CLOSE-SOFT-HARD
-- =============================================================


-- =============================================================
-- (A) branch_override_codes
-- =============================================================

CREATE TABLE IF NOT EXISTS public.branch_override_codes (
  branch_id   BIGINT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,                    -- bcrypt via pgcrypto crypt()
  rotated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_by  UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.branch_override_codes IS
  'Per-branch rotating override code hash for GRN price variance tier-2 override (not hard-block; hard-block uses PDF evidence). Verified via verify_branch_override_code() with rate-limit 3 attempts/min.';

ALTER TABLE public.branch_override_codes ENABLE ROW LEVEL SECURITY;

-- No direct reads — only via RPC. No authenticated SELECT policy.
CREATE POLICY "override_codes_rpc_only"
  ON public.branch_override_codes
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Rate-limit tally
CREATE TABLE IF NOT EXISTS public.branch_override_attempts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id  BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  success    BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_override_attempts_rate
  ON public.branch_override_attempts (branch_id, user_id, attempted_at DESC);

ALTER TABLE public.branch_override_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "override_attempts_rpc_only"
  ON public.branch_override_attempts
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Rotate RPC (set or update code for a branch)
CREATE OR REPLACE FUNCTION public.rotate_branch_override_code(
  p_branch_id BIGINT,
  p_new_code  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'procurement:override_code_rotate') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(p_new_code) < 6 THEN
    RAISE EXCEPTION 'override code must be at least 6 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.branch_override_codes (branch_id, code_hash, rotated_at, rotated_by)
  VALUES (p_branch_id, crypt(p_new_code, gen_salt('bf', 10)), now(), v_uid)
  ON CONFLICT (branch_id) DO UPDATE
    SET code_hash  = EXCLUDED.code_hash,
        rotated_at = EXCLUDED.rotated_at,
        rotated_by = EXCLUDED.rotated_by;
END;
$function$;

COMMENT ON FUNCTION public.rotate_branch_override_code(BIGINT, TEXT) IS
  'Rotate the GRN tier-2 override code for a branch. Requires procurement:override_code_rotate. Bcrypt hashed.';

GRANT EXECUTE ON FUNCTION public.rotate_branch_override_code(BIGINT, TEXT)
  TO authenticated;

-- Verify RPC with rate-limit 3 failed attempts / minute per (branch, user)
CREATE OR REPLACE FUNCTION public.verify_branch_override_code(
  p_branch_id BIGINT,
  p_code      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_hash        TEXT;
  v_recent_fail INT;
  v_ok          BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COUNT(*) INTO v_recent_fail
  FROM public.branch_override_attempts
  WHERE branch_id = p_branch_id
    AND user_id = v_uid
    AND success = false
    AND attempted_at > now() - INTERVAL '1 minute';

  IF v_recent_fail >= 3 THEN
    RAISE EXCEPTION 'override verify rate-limited' USING ERRCODE = '54000';
  END IF;

  SELECT code_hash INTO v_hash
  FROM public.branch_override_codes
  WHERE branch_id = p_branch_id;

  v_ok := v_hash IS NOT NULL AND crypt(p_code, v_hash) = v_hash;

  INSERT INTO public.branch_override_attempts (branch_id, user_id, success)
  VALUES (p_branch_id, v_uid, v_ok);

  RETURN v_ok;
END;
$function$;

COMMENT ON FUNCTION public.verify_branch_override_code(BIGINT, TEXT) IS
  'Verify override code. Rate-limited to 3 failed attempts per minute per (branch, user). Every attempt logged to branch_override_attempts.';

GRANT EXECUTE ON FUNCTION public.verify_branch_override_code(BIGINT, TEXT)
  TO authenticated;


-- =============================================================
-- (B) accounting_periods + enforce_period_close
-- =============================================================

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year            INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month           INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  soft_closed_at  TIMESTAMPTZ,
  hard_closed_at  TIMESTAMPTZ,
  closed_by       UUID REFERENCES auth.users(id),
  PRIMARY KEY (tenant_id, year, month)
);

COMMENT ON TABLE public.accounting_periods IS
  'Two-stage period close for inventory mutations. soft_closed_at (day 5 of next month): back-dated writes auto-shift to current period with originally_dated_in_prior_period flag. hard_closed_at (day 15): reject back-dated writes; accounting:period_reopen permission required to unlock.';

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periods_read_own_tenant"
  ON public.accounting_periods
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "periods_write_reopen_permission"
  ON public.accounting_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'accounting:period_reopen')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'accounting:period_reopen')
  );

-- Helper: return effective period status for a timestamp.
-- Returns 'open' / 'soft_closed' / 'hard_closed'.
CREATE OR REPLACE FUNCTION public.period_status_at(
  p_tenant_id BIGINT,
  p_at        TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year  INT := EXTRACT(YEAR  FROM p_at)::INT;
  v_month INT := EXTRACT(MONTH FROM p_at)::INT;
  v_p     public.accounting_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_p
  FROM public.accounting_periods
  WHERE tenant_id = p_tenant_id AND year = v_year AND month = v_month;

  IF NOT FOUND THEN RETURN 'open'; END IF;
  IF v_p.hard_closed_at IS NOT NULL THEN RETURN 'hard_closed'; END IF;
  IF v_p.soft_closed_at IS NOT NULL THEN RETURN 'soft_closed'; END IF;
  RETURN 'open';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.period_status_at(BIGINT, TIMESTAMPTZ)
  TO authenticated;

-- Scaffold trigger function. Tables that need to enforce close
-- will attach this in their respective sprints (S2/S3/S5/S8).
-- Expects NEW row to have column `effective_date` (TIMESTAMPTZ) and
-- `tenant_id` (BIGINT). Mutation auto-shifts to current month when
-- target period is soft_closed. Rejects hard_closed unless actor has
-- accounting:period_reopen.
CREATE OR REPLACE FUNCTION public.enforce_period_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status       TEXT;
  v_effective    TIMESTAMPTZ;
  v_tenant       BIGINT;
BEGIN
  v_effective := (row_to_json(NEW.*)->>'effective_date')::TIMESTAMPTZ;
  v_tenant    := (row_to_json(NEW.*)->>'tenant_id')::BIGINT;

  IF v_effective IS NULL OR v_tenant IS NULL THEN
    RETURN NEW;  -- table doesn't use period close semantics
  END IF;

  v_status := public.period_status_at(v_tenant, v_effective);

  IF v_status = 'hard_closed' THEN
    IF NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
      RAISE EXCEPTION 'target period is hard-closed' USING ERRCODE = '42501';
    END IF;
  ELSIF v_status = 'soft_closed' THEN
    -- Auto-shift: posting_date stays historical but effective_date
    -- moves to now(). Callers should UPDATE their own posting_date
    -- column in a BEFORE INSERT wrapper when attaching this.
    -- Here we flag the row so downstream reports can detect.
    IF to_jsonb(NEW.*) ? 'originally_dated_in_prior_period' THEN
      NEW := NEW;  -- caller opted in; set flag via their own logic
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_period_close() IS
  'Trigger scaffold for inventory mutations. Attaches in S2/S3/S5/S8 migrations. Enforces PERIOD-CLOSE-SOFT-HARD regression rule.';


-- =============================================================
-- (C) branch_daily_waste_cap snapshot + nightly cron
-- =============================================================

CREATE TABLE IF NOT EXISTS public.branch_daily_waste_cap (
  branch_id      BIGINT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  cap_vnd        NUMERIC(15,2) NOT NULL,
  avg_revenue_7d NUMERIC(15,2) NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.branch_daily_waste_cap IS
  'Nightly snapshot of per-branch daily waste cap = max(500k, min(5tr, 0.025 * avg_revenue_7d)). Consumed by waste tier-2 evaluator; read-only for app code.';

ALTER TABLE public.branch_daily_waste_cap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waste_cap_read_authenticated"
  ON public.branch_daily_waste_cap
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_daily_waste_cap.branch_id
        AND b.tenant_id = public.auth_tenant_id()
    )
  );

-- No authenticated writes; only the cron job (SECURITY DEFINER).
CREATE POLICY "waste_cap_no_client_write"
  ON public.branch_daily_waste_cap
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.compute_branch_daily_waste_caps()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pct     CONSTANT NUMERIC := 0.025;
  v_floor   CONSTANT NUMERIC := 500000;
  v_ceiling CONSTANT NUMERIC := 5000000;
  v_count   INT;
BEGIN
  WITH daily AS (
    SELECT
      o.branch_id,
      DATE(o.created_at AT TIME ZONE COALESCE(b.timezone, 'Asia/Ho_Chi_Minh')) AS day,
      SUM(COALESCE(o.total_amount, 0)) AS daily_total
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    WHERE o.status = 'completed'
      AND o.created_at >= now() - INTERVAL '7 days'
    GROUP BY o.branch_id, DATE(o.created_at AT TIME ZONE COALESCE(b.timezone, 'Asia/Ho_Chi_Minh'))
  ),
  avg_rev AS (
    SELECT branch_id, AVG(daily_total) AS avg_rev
    FROM daily
    GROUP BY branch_id
  )
  INSERT INTO public.branch_daily_waste_cap (branch_id, cap_vnd, avg_revenue_7d, computed_at)
  SELECT
    b.id,
    GREATEST(v_floor, LEAST(v_ceiling, v_pct * COALESCE(a.avg_rev, 0))),
    COALESCE(a.avg_rev, 0),
    now()
  FROM public.branches b
  LEFT JOIN avg_rev a ON a.branch_id = b.id
  WHERE b.is_active = true
  ON CONFLICT (branch_id) DO UPDATE SET
    cap_vnd        = EXCLUDED.cap_vnd,
    avg_revenue_7d = EXCLUDED.avg_revenue_7d,
    computed_at    = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.compute_branch_daily_waste_caps() IS
  'Nightly compute of per-branch daily waste cap. Called by pg_cron at 00:30 branch-local (Asia/Ho_Chi_Minh default).';

-- Schedule nightly 00:30 Vietnam time = 17:30 UTC
SELECT cron.schedule(
  'compute_branch_daily_waste_caps',
  '30 17 * * *',
  $$SELECT public.compute_branch_daily_waste_caps();$$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'compute_branch_daily_waste_caps'
);

-- Seed initial snapshot so the table is never empty during MVP
SELECT public.compute_branch_daily_waste_caps();


-- =============================================================
-- (D) Insert 14 permission keys + wire system role templates
-- =============================================================

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('inventory:waste_approve',              'inventory',   'Approve waste entries tier-2 (value >= 500k, shift_cap, or found_missing).', 'branch'),
  ('inventory:waste_bypass_photo',         'inventory',   'Admin-only: bypass mandatory waste photo (audited).', 'tenant'),
  ('inventory:stocktake_recount',          'inventory',   'Trigger stocktake recount rounds and escalate to round 4.', 'branch'),
  ('inventory:stocktake_unblind',          'inventory',   'Admin break-glass to view system_qty during blind stocktake.', 'tenant'),
  ('inventory:adjust_approve',             'inventory',   'Approve stock adjustments (reason correction / shrink).', 'branch'),
  ('inventory:grn_express_configure',      'inventory',   'Configure GRN express auto-approve window schedule per branch.', 'branch'),
  ('inventory:grn_express_extend',         'inventory',   'Extend GRN express window by +60 minutes (max 3 per week).', 'branch'),
  ('inventory:grn_hardblock_override',     'inventory',   'Override GRN price hard-block (>= 100% variance) with PDF evidence + note.', 'branch'),
  ('inventory:catalog_review_policy_set',  'inventory',   'Set category-level manual-review default flag.', 'tenant'),
  ('inventory:item_review_override_set',   'inventory',   'Set per-item manual-review override flag.', 'branch'),
  ('accounting:period_reopen',             'accounting',  'Reopen a hard-closed accounting period (audited, 2FA at app layer).', 'tenant'),
  ('procurement:price_list_read',          'procurement', 'Read supplier_price_list (contract/quotation/grn_last) for PO pre-fill.', 'branch'),
  ('procurement:price_list_write',         'procurement', 'Write supplier_price_list contract/quotation rows. grn_last is trigger-only.', 'tenant'),
  ('procurement:override_code_rotate',     'procurement', 'Rotate the per-branch GRN tier-2 override code.', 'branch')
ON CONFLICT (key) DO NOTHING;

-- Wire system role templates (only extend, never remove existing grants)
DO $grants$
DECLARE
  k_all_inv_approve   TEXT[] := ARRAY[
    'inventory:waste_approve','inventory:stocktake_recount',
    'inventory:adjust_approve','inventory:grn_express_extend',
    'inventory:item_review_override_set','procurement:override_code_rotate',
    'procurement:price_list_read'
  ];
  k_qlv_extra         TEXT[] := ARRAY[
    'inventory:grn_express_configure','inventory:grn_hardblock_override',
    'procurement:price_list_write'
  ];
  k_admin_only        TEXT[] := ARRAY[
    'inventory:waste_bypass_photo','inventory:stocktake_unblind',
    'inventory:catalog_review_policy_set','accounting:period_reopen'
  ];
BEGIN
  -- quan_ly_CN (branch manager) — operational branch-level keys
  UPDATE public.role_templates
     SET permission_keys = (SELECT array_agg(DISTINCT k) FROM unnest(permission_keys || k_all_inv_approve) k),
         updated_at = now()
   WHERE is_system = true AND position_code = 'quan_ly_CN';

  -- quan_ly_vung (regional) — branch + tenant override-style keys
  UPDATE public.role_templates
     SET permission_keys = (SELECT array_agg(DISTINCT k) FROM unnest(permission_keys || k_all_inv_approve || k_qlv_extra) k),
         updated_at = now()
   WHERE is_system = true AND position_code = 'quan_ly_vung';

  -- kho_truong (warehouse chief) — stocktake only extra
  UPDATE public.role_templates
     SET permission_keys = (SELECT array_agg(DISTINCT k) FROM unnest(permission_keys || ARRAY['inventory:stocktake_recount']) k),
         updated_at = now()
   WHERE is_system = true AND position_code = 'kho_truong';

  -- ke_toan / ke_toan_truong — price list read
  UPDATE public.role_templates
     SET permission_keys = (SELECT array_agg(DISTINCT k) FROM unnest(permission_keys || ARRAY['procurement:price_list_read']) k),
         updated_at = now()
   WHERE is_system = true AND position_code IN ('ke_toan','ke_toan_truong');

  UPDATE public.role_templates
     SET permission_keys = (SELECT array_agg(DISTINCT k) FROM unnest(permission_keys || ARRAY['procurement:price_list_write']) k),
         updated_at = now()
   WHERE is_system = true AND position_code = 'ke_toan_truong';

  -- owner + super_manager — all 14
  UPDATE public.role_templates
     SET permission_keys = (SELECT array_agg(DISTINCT k)
                            FROM unnest(permission_keys
                                        || k_all_inv_approve
                                        || k_qlv_extra
                                        || k_admin_only) k),
         updated_at = now()
   WHERE is_system = true AND position_code IN ('owner','super_manager');
END;
$grants$;
