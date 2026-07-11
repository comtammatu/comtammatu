-- =============================================================
-- V0.1.0 Initial Schema — Cơm Tấm Má Tư CTCP
-- =============================================================

-- Enum: staff roles
CREATE TYPE public.staff_role AS ENUM (
  'owner',
  'super_manager',
  'area_manager',
  'branch_manager',
  'cashier',
  'waiter',
  'chef',
  'office'
);

-- =====================
-- TENANTS (single row: Cơm Tấm Má Tư CTCP)
-- =====================
CREATE TABLE public.tenants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  -- CTCP legal fields
  legal_name TEXT,
  tax_code TEXT UNIQUE,       -- MST 10 or 13 digits
  legal_address TEXT,
  representative TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- BRANCHES
-- =====================
CREATE TABLE public.branches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  is_tenant BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, tenant_id)
);

-- =====================
-- PROFILES (staff)
-- =====================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
  role public.staff_role NOT NULL DEFAULT 'waiter',
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- AUTH HELPER FUNCTIONS
-- =====================

-- Extract tenant_id from JWT claims
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS BIGINT
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::bigint;
$$;

-- Extract branch_id from JWT claims (nullable)
CREATE OR REPLACE FUNCTION public.auth_branch_id()
RETURNS BIGINT
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'branch_id')::bigint;
$$;

-- Extract user_role from JWT claims
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'user_role';
$$;

-- =====================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data ->> 'tenant_id')::bigint, 1),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::public.staff_role, 'waiter'),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'New User')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================
-- RLS POLICIES
-- =====================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tenants: authenticated users can read their tenant
CREATE POLICY "Users can view own tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (id = public.auth_tenant_id());

-- Branches: tenant-scoped read
CREATE POLICY "Users can view branches in their tenant"
  ON public.branches FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- Branches: owner/super_manager can manage
CREATE POLICY "Managers can manage branches"
  ON public.branches FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.auth_role() IN ('owner', 'super_manager'))
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.auth_role() IN ('owner', 'super_manager'));

-- Profiles: users can read profiles in their tenant
CREATE POLICY "Users can view profiles in their tenant"
  ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- Profiles: users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Profiles: owner/super_manager can manage all profiles
CREATE POLICY "Managers can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.auth_role() IN ('owner', 'super_manager'))
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.auth_role() IN ('owner', 'super_manager'));

-- =====================
-- GRANTS
-- =====================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
