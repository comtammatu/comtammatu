-- Rollback for 20260601100000_auth_v3_h3a_position_id_required.sql
--
-- Restores: profiles.position_id nullable + FK ON DELETE SET NULL +
-- handle_new_user / admin_update_profile pre-H3a behavior (no NULL guard).
--
-- WARNING: After rollback, has_permission() owner-bypass becomes
-- vulnerable again — any profile with position_id IS NULL silently loses
-- owner status. Only use this rollback to recover from a failed apply.

-- ─── 1. Restore handle_new_user (pre-H3a — silent NULL insert) ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id   BIGINT;
  v_branch_id   BIGINT;
  v_role_text   TEXT;
  v_position_id BIGINT;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
  );
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_role_text := COALESCE(NEW.raw_app_meta_data ->> 'role', 'owner');
  v_position_id := public._auth_v2_position_id_from_role(v_role_text, v_tenant_id);

  INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
  VALUES (
    NEW.id, v_tenant_id, v_branch_id, v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- ─── 2. Restore admin_update_profile (pre-H3a — no NULL guard) ──
-- (Body is identical to H3a except the NULL check on v_final_position.)
-- For brevity, reapply by reverting to the prior migration's definition.
-- See `supabase/migrations/20260423030000_auth_v2_m5_drop_legacy.sql:81-211`.

-- ─── 3. Restore FK ON DELETE SET NULL ─────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_position_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_position_id_fkey
    FOREIGN KEY (position_id)
    REFERENCES public.positions(id)
    ON DELETE SET NULL;

-- ─── 4. Drop NOT NULL constraint ──────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN position_id DROP NOT NULL;

COMMENT ON COLUMN public.profiles.position_id IS
  'HR chức vụ. Populated by M2 backfill. Nullable (rollback state).';
