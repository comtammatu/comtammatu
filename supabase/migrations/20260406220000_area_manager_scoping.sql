-- =============================================================
-- H3: area_manager Branch Scoping
-- 1. areas table — named groupings of branches
-- 2. area_branches — junction: which branches belong to which area
-- 3. profiles.area_id — FK for area_manager role
-- 4. JWT hook — inject area_id into claims
-- 5. admin_update_profile — area_manager scope checks
-- 6. RLS updates — area_manager sees only area branches
-- =============================================================

-- ─── 1. areas table ───

CREATE TABLE public.areas (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(name, tenant_id)
);

CREATE TRIGGER trg_areas_updated_at
  BEFORE UPDATE ON public.areas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_areas_tenant ON public.areas(tenant_id);

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_select" ON public.areas
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "areas_manage" ON public.areas
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.areas TO authenticated;


-- ─── 2. area_branches junction table ───

CREATE TABLE public.area_branches (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  area_id    BIGINT NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  branch_id  BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(area_id, branch_id, tenant_id)
);

CREATE INDEX idx_area_branches_tenant ON public.area_branches(tenant_id);
CREATE INDEX idx_area_branches_area ON public.area_branches(area_id);
CREATE INDEX idx_area_branches_branch ON public.area_branches(branch_id);

ALTER TABLE public.area_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "area_branches_select" ON public.area_branches
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "area_branches_manage" ON public.area_branches
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.area_branches TO authenticated;


-- ─── 3. Add area_id FK to profiles ───

ALTER TABLE public.profiles
  ADD COLUMN area_id BIGINT REFERENCES public.areas(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_area ON public.profiles(area_id);

-- CHECK: area_id should only be set for area_manager role
-- Using NOT VALID to avoid checking existing rows
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_area_id_for_area_manager
  CHECK (
    (role <> 'area_manager' AND area_id IS NULL)
    OR (role = 'area_manager')
  ) NOT VALID;

ALTER TABLE public.profiles VALIDATE CONSTRAINT chk_area_id_for_area_manager;


-- ─── 4. Update JWT hook — inject area_id ───

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims JSONB;
  user_profile RECORD;
BEGIN
  claims := event -> 'claims';

  -- Fetch profile for the authenticating user
  SELECT p.tenant_id, p.branch_id, p.role::text AS user_role, p.area_id
  INTO user_profile
  FROM public.profiles p
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF user_profile IS NOT NULL THEN
    -- Inject claims into app_metadata
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.user_role,
        'area_id', user_profile.area_id
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;


-- ─── 5. Helper: auth_area_id() ───

CREATE OR REPLACE FUNCTION public.auth_area_id()
RETURNS BIGINT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'area_id'),
    ''
  )::BIGINT;
$$;


-- ─── 6. Update branches RLS — area_manager sees only area branches ───

-- Drop old permissive SELECT policy for branches and replace with scoped one
DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "Authenticated users can view own tenant branches" ON public.branches;

CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Owner, super_manager, office: see all branches in tenant
      public.auth_role() IN ('owner', 'super_manager', 'office')
      -- area_manager: see only branches in their area
      OR (
        public.auth_role() = 'area_manager'
        AND id IN (
          SELECT ab.branch_id FROM public.area_branches ab
          WHERE ab.area_id = public.auth_area_id()
            AND ab.tenant_id = public.auth_tenant_id()
        )
      )
      -- Branch-scoped roles: see only own branch
      OR (
        public.auth_role() IN ('branch_manager', 'cashier', 'waiter', 'chef')
        AND id = public.auth_branch_id()
      )
    )
  );


-- ─── 7. Update profiles RLS — area_manager sees only profiles in area branches ───

-- Drop old SELECT policies for profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select scoped by role" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Self: always see own profile
      id = auth.uid()
      -- Owner, super_manager, office: see all in tenant
      OR public.auth_role() IN ('owner', 'super_manager', 'office')
      -- area_manager: see profiles in branches belonging to their area
      OR (
        public.auth_role() = 'area_manager'
        AND (
          branch_id IN (
            SELECT ab.branch_id FROM public.area_branches ab
            WHERE ab.area_id = public.auth_area_id()
              AND ab.tenant_id = public.auth_tenant_id()
          )
          -- Also see other area_managers and tenant-level roles (for admin lists)
          OR branch_id IS NULL
        )
      )
      -- Branch roles: see own branch
      OR (
        public.auth_role() IN ('branch_manager', 'cashier', 'waiter', 'chef')
        AND branch_id = public.auth_branch_id()
      )
    )
  );


-- ─── 8. Update admin_update_profile — area_manager scope checks ───

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_full_name TEXT     DEFAULT NULL,
  p_phone TEXT         DEFAULT NULL,
  p_role TEXT          DEFAULT NULL,
  p_branch_id BIGINT   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_actor_area BIGINT;
  v_target RECORD;
  v_final_role TEXT;
  v_final_branch BIGINT;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();
  v_actor_area   := public.auth_area_id();

  -- Fetch target profile
  SELECT id, role, branch_id, full_name, phone, tenant_id
    INTO v_target
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  -- Compute final values
  v_final_role   := COALESCE(p_role, v_target.role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  -- ========== ACTOR PERMISSION CHECKS ==========

  IF v_actor_role = 'owner' THEN
    NULL; -- unrestricted

  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target.role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;

  ELSIF v_actor_role = 'area_manager' THEN
    -- Cannot modify owner, super_manager, or peer area_manager
    IF v_target.role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
    END IF;
    IF v_final_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;

    -- Target must be in a branch that belongs to actor's area
    IF v_target.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target.branch_id
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area branches';
      END IF;
    END IF;

    -- Final branch must also be in actor's area
    IF v_final_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_final_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target branch not in your area';
      END IF;
    END IF;

  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target.role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    IF v_final_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;

  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  -- ========== APPLY UPDATE ==========

  UPDATE public.profiles
  SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    role       = v_final_role,
    branch_id  = v_final_branch,
    updated_at = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  -- If role changed, update auth.users.raw_app_meta_data so next JWT reflects it
  IF p_role IS NOT NULL AND p_role <> v_target.role THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('user_role', v_final_role)
    WHERE id = p_target_id;
  END IF;

  -- If branch changed, update auth metadata
  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;


-- ─── 9. Update toggle_profile_active — area_manager scope ───

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_actor_area BIGINT;
  v_target_role TEXT;
  v_target_branch BIGINT;
  v_target_active BOOLEAN;
  v_new_state BOOLEAN;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();
  v_actor_area   := public.auth_area_id();

  SELECT role, branch_id, is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;

  IF v_actor_role = 'owner' THEN
    NULL;
  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
    -- Must be in area's branches
    IF v_target_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area';
      END IF;
    END IF;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target_role IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;
