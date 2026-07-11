-- =============================================================
-- S0-a Foundation — Branch timezone + canonical shift_key helper
--
-- Prereq for inventory redesign S1-S8 (waste anti-splitting,
-- GRN express window, stocktake session scoping).
--
-- Adds:
--   * branches.timezone (IANA name, default 'Asia/Ho_Chi_Minh')
--   * inventory_shift_key(branch_id, at) canonical helper
--
-- Regression ref: tasks/regressions.md SHIFT-KEY-CANONICAL
-- Current docs:   docs/ref/inventory.md + docs/ref/inventory-sop.md
-- =============================================================

-- ---------- branches.timezone ---------------------------------

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

COMMENT ON COLUMN public.branches.timezone IS
  'IANA timezone name (e.g. Asia/Ho_Chi_Minh). Used by inventory shift_key, GRN express window, and period close for branch-local day/hour math. Validated at write time by calling (now() AT TIME ZONE timezone).';

-- ---------- inventory_shift_key(branch_id, at) ----------------
-- Canonical shift label for anti-splitting (waste), express
-- window (GRN), and session scoping (stocktake).
--
-- Segments (branch-local time):
--   04:00 - 11:59 -> morning
--   12:00 - 17:59 -> afternoon
--   18:00 - 03:59 -> evening
--
-- Business-day cutoff 04:00: hours 00:00-03:59 are attributed
-- to the previous calendar date's 'evening' segment so
-- overnight shifts don't split across two shift_keys.

CREATE OR REPLACE FUNCTION public.inventory_shift_key(
  p_branch_id BIGINT,
  p_at        TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Fallback for NULL / missing branch — single-tenant VN default.
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
$function$;

COMMENT ON FUNCTION public.inventory_shift_key(BIGINT, TIMESTAMPTZ) IS
  'Canonical shift key YYYY-MM-DD_{morning|afternoon|evening} per branch local time with 04:00 business-day cutoff. Single source of truth for waste anti-splitting, GRN express window, and stocktake session scoping. See regression rule SHIFT-KEY-CANONICAL.';

GRANT EXECUTE ON FUNCTION public.inventory_shift_key(BIGINT, TIMESTAMPTZ)
  TO authenticated;
