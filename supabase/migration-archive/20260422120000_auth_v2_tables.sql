-- =============================================================
-- Auth v2 — M1: Core tables
-- Position (HR label) ⟂ Permission (system access)
-- Grants scoped by (user, branch), branch_id NULL = tenant-wide
-- NO data migration here; backfill in M2.
-- =============================================================

-- =====================
-- PERMISSION CATALOG (global, seeded once, not tenant-scoped)
-- =====================
CREATE TABLE public.permission_keys (
  key         TEXT PRIMARY KEY,
  module      TEXT NOT NULL,
  description TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('branch', 'tenant', 'either')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.permission_keys IS
  'Global catalog of permission strings. Seeded by migration; edits go through future admin tooling, never ad-hoc.';

-- =====================
-- POSITIONS (HR label, per-tenant lookup)
-- =====================
CREATE TABLE public.positions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code       TEXT   NOT NULL,
  label_vi   TEXT   NOT NULL,
  label_en   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, tenant_id)
);

COMMENT ON TABLE public.positions IS
  'HR-only chức vụ. Does NOT grant permissions. Mapping to permissions is done via role_templates preset at grant time.';

-- =====================
-- ROLE TEMPLATES (per-tenant preset bundles of permission_keys)
-- =====================
CREATE TABLE public.role_templates (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT   NOT NULL,
  position_code   TEXT,  -- loose link to positions.code (not FK; template can exist without a named position)
  permission_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, tenant_id)
);

COMMENT ON TABLE public.role_templates IS
  'Preset bundles for bulk-granting permissions at user creation. Snapshot-only — editing a template does NOT auto-update existing grants.';

-- =====================
-- STAFF_PERMISSIONS (normalized grants, (user, branch) → permission_key)
-- branch_id NULL ⇒ tenant-wide (cover mọi branch, kể cả CN tạo sau)
-- =====================
CREATE TABLE public.staff_permissions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
  permission_key  TEXT   NOT NULL REFERENCES public.permission_keys(key) ON DELETE RESTRICT,
  source_template BIGINT REFERENCES public.role_templates(id) ON DELETE SET NULL,
  granted_by      UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_permissions IS
  'Source of truth for authz. One row per (user, branch_or_null, permission_key). NULL branch_id = tenant-wide.';

-- Unique per (user, branch, key) — but NULL is distinct in plain UNIQUE, so we add partial index below
CREATE UNIQUE INDEX idx_staff_permissions_branch_uniq
  ON public.staff_permissions (user_id, branch_id, permission_key)
  WHERE branch_id IS NOT NULL;

-- Tenant-wide grants: at most one per (user, key)
CREATE UNIQUE INDEX idx_staff_permissions_tenant_wide_uniq
  ON public.staff_permissions (user_id, permission_key)
  WHERE branch_id IS NULL;

-- Hot-path lookup for has_permission()
CREATE INDEX idx_staff_permissions_lookup
  ON public.staff_permissions (user_id, permission_key, branch_id);

-- Tenant scoping
CREATE INDEX idx_staff_permissions_tenant
  ON public.staff_permissions (tenant_id);

-- =====================
-- PROFILES: add position_id (nullable during transition)
-- Keep `role` column until M5 drop migration
-- =====================
ALTER TABLE public.profiles
  ADD COLUMN position_id BIGINT REFERENCES public.positions(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_position_id ON public.profiles (position_id);

COMMENT ON COLUMN public.profiles.position_id IS
  'HR chức vụ. Populated by M2 backfill. During M1–M4 coexists with profiles.role; role drops in M5.';

-- =====================
-- GRANTS — authenticated reads only; writes via RPC (added in later migrations)
-- =====================
GRANT SELECT ON public.permission_keys TO authenticated;
GRANT SELECT ON public.positions       TO authenticated;
GRANT SELECT ON public.role_templates  TO authenticated;
GRANT SELECT ON public.staff_permissions TO authenticated;

-- =====================
-- RLS
-- =====================
ALTER TABLE public.permission_keys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

-- permission_keys: public catalog (all authenticated can read)
CREATE POLICY permission_keys_select ON public.permission_keys
  FOR SELECT TO authenticated USING (TRUE);

-- positions: tenant-scoped
CREATE POLICY positions_select ON public.positions
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- role_templates: tenant-scoped
CREATE POLICY role_templates_select ON public.role_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- staff_permissions:
--   (a) user can always read their own rows (self-service at /employee/permissions)
--   (b) managers can read tenant rows (UI admin) — guarded by has_permission() once available;
--       for now limit to tenant scope (tighten in M4 cutover)
CREATE POLICY staff_permissions_select_self ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY staff_permissions_select_tenant ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
