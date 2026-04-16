-- =============================================================
-- Multi-Warehouse Step 0: Add new enum values to staff_role.
-- Must run in its own migration so values are committed before
-- subsequent migrations reference them.
-- =============================================================

ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'warehouse_manager';
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'production_manager';
