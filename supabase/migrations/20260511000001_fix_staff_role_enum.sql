-- Add warehouse_manager and production_manager to staff_role enum.
-- These roles exist in the Go backend but were missing from the SQL enum.
-- NOTE: The initial_schema migration defined staff_role for the Supabase/auth.users path
-- (public.profiles), but this DB uses the standalone public.users table with TEXT role.
-- We create the enum here so RPCs and downstream code can reference public.staff_role.
CREATE TYPE public.staff_role AS ENUM (
  'owner',
  'super_manager',
  'area_manager',
  'branch_manager',
  'cashier',
  'waiter',
  'chef',
  'office',
  'warehouse_manager',
  'production_manager'
);
