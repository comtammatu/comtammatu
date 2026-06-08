-- =============================================================
-- Daily limit enforcement: extend to JSONB sides
--
-- Background: PR #36 (commit 5d4ee3f) added per-(branch, menu_item)
-- daily caps + a "Tắt món" toggle, enforced via
-- enforce_branch_menu_daily_limit (AFTER INSERT on order_items) and
-- decrement_branch_menu_daily_limit (AFTER UPDATE OF status). Both
-- triggers only inspect NEW.menu_item_id (the main item). Sides are
-- snapshotted in order_items.sides JSONB
-- ([{"side_item_id": bigint, "quantity": int, ...}]) and the trigger
-- never reads them — so a disabled side bypasses enforcement, and an
-- item sold as a side never has its sold_today incremented.
--
-- Fix: aggregate (menu_item_id, total_qty) across NEW.menu_item_id
-- AND every NEW.sides[].side_item_id, GROUP BY menu_item_id (collapses
-- duplicates and the "same item is both main and side" case), ORDER BY
-- menu_item_id ASC (deterministic lock ordering → no AB/BA deadlock
-- between concurrent inserts that share a side), then SELECT FOR
-- UPDATE each limit row, enforce, increment.
--
-- Side-quota delta = NEW.quantity (main qty) × side.quantity
-- (per-main-unit qty). Ordering 2× Cơm Sườn with 1 trứng/main side
-- consumes 2 trứng portions of quota.
--
-- Skip-hatch: current_setting('comtammatu.skip_quota_enforcement',
-- true). Set inside split-partial RPC (see migration 20260514000100)
-- so the clone INSERT does not re-charge quota — net qty across
-- source+clone is unchanged.
--
-- Decrement trigger gets symmetric treatment over OLD.sides.
--
-- Out of scope (tracked in tasks/regressions.md):
--   - DAILY-LIMIT-REDUCE-QTY-LEAK: reduce_order_item_quantity UPDATEs
--     quantity without status change → no trigger fires → quota leak.
--     Separate follow-up.
--   - Modifiers (menu_item_modifiers): no menu_items link, out of
--     scope by design.
-- =============================================================

CREATE OR REPLACE FUNCTION public.enforce_branch_menu_daily_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
  v_target     RECORD;
  v_limit      RECORD;
BEGIN
  -- Skip-hatch for split-partial clone INSERT (see migration
  -- 20260514000100). Net qty across source+clone is unchanged so the
  -- clone must not re-charge quota.
  IF COALESCE(current_setting('comtammatu.skip_quota_enforcement', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Aggregate (menu_item_id, total_qty) across main + every side.
  -- GROUP BY collapses duplicate side ids and the "main == side"
  -- case into one lock. ORDER BY menu_item_id ASC gives a global
  -- deterministic lock order across concurrent transactions.
  FOR v_target IN
    WITH agg AS (
      SELECT NEW.menu_item_id::BIGINT AS item_id,
             NEW.quantity::INT        AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::BIGINT,
             (NEW.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::INT, 1))::INT
      FROM jsonb_array_elements(COALESCE(NEW.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::INT AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    SELECT * INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id    = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date   = v_order_date
    FOR UPDATE;

    -- No limit configured for this item → nothing to enforce.
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_limit.is_disabled THEN
      RAISE EXCEPTION 'daily_limit_item_disabled: %', v_target.item_id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_limit.limit_quantity IS NOT NULL
       AND v_limit.sold_today + v_target.need_qty > v_limit.limit_quantity THEN
      RAISE EXCEPTION 'daily_limit_exceeded: item %, limit %, sold %, requested %',
        v_target.item_id, v_limit.limit_quantity, v_limit.sold_today, v_target.need_qty
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = sold_today + v_target.need_qty
    WHERE id = v_limit.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- =============================================================
-- DECREMENT trigger — symmetric over OLD.menu_item_id + OLD.sides
-- =============================================================
CREATE OR REPLACE FUNCTION public.decrement_branch_menu_daily_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
  v_target     RECORD;
BEGIN
  IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mirror the enforcement aggregation against OLD (the row state
  -- pre-cancel, which is what was previously counted at insert time).
  FOR v_target IN
    WITH agg AS (
      SELECT OLD.menu_item_id::BIGINT AS item_id,
             OLD.quantity::INT        AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::BIGINT,
             (OLD.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::INT, 1))::INT
      FROM jsonb_array_elements(COALESCE(OLD.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::INT AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = GREATEST(0, sold_today - v_target.need_qty)
    WHERE branch_id    = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date   = v_order_date;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Triggers themselves are unchanged (still attached to the same
-- functions). CREATE OR REPLACE on the function body is sufficient.

COMMENT ON FUNCTION public.enforce_branch_menu_daily_limit() IS
  'AFTER INSERT on order_items: aggregate main + sides (JSONB) by '
  'menu_item_id ASC, lock each limit row FOR UPDATE, raise '
  'P0001 daily_limit_item_disabled / daily_limit_exceeded, increment '
  'sold_today. Skip-hatch: GUC comtammatu.skip_quota_enforcement = '
  '''true'' (set by split-partial RPC).';

COMMENT ON FUNCTION public.decrement_branch_menu_daily_limit() IS
  'AFTER UPDATE OF status on order_items (→ cancelled): symmetric '
  'decrement using OLD.menu_item_id + OLD.sides aggregated by '
  'menu_item_id ASC. Bounded at 0 via GREATEST.';
