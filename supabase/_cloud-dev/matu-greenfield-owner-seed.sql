-- Cloud DEV only: minimal Greenfield Owner/Auth -> Branch Context fixture.
-- Apply only to Environment Registry ref xrsantkidwknjhcgcfmi.
-- This seed is intentionally one-shot and fails if business/auth data exists.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants)
     OR EXISTS (SELECT 1 FROM public.branches)
     OR EXISTS (SELECT 1 FROM public.profiles)
     OR EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'greenfield_owner_seed_requires_empty_target';
  END IF;
END;
$$;

-- tenants.owner_user_id and auth.users -> profiles form a bootstrap cycle.
-- Suppress user triggers only inside this transaction, then build both sides.
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  is_sso_user,
  is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'greenfield.owner@example.com',
  extensions.crypt('Greenfield-Owner-2026!', extensions.gen_salt('bf')),
  now(),
  jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email'),
    'role', 'owner',
    'position_code', 'owner',
    'full_name', 'Greenfield Owner QA'
  ),
  jsonb_build_object('full_name', 'Greenfield Owner QA'),
  now(),
  now(),
  '',
  '',
  '',
  '',
  false,
  false
);

INSERT INTO auth.identities (
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  'b0000000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_object(
    'sub', 'b0000000-0000-4000-8000-000000000001',
    'email', 'greenfield.owner@example.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  'greenfield.owner@example.com',
  now(),
  now(),
  now()
);

INSERT INTO public.tenants (name, slug, legal_name, owner_user_id, settings)
VALUES (
  'Má Tư Greenfield QA',
  'comtammatu',
  'MÁ TƯ GREENFIELD QA — NON-PRODUCTION',
  'b0000000-0000-4000-8000-000000000001'::uuid,
  '{}'::jsonb
);

INSERT INTO public.branches (
  tenant_id,
  name,
  address,
  code,
  branch_kind,
  is_active
)
SELECT id, 'Greenfield Branch QA', 'Cloud DEV fixture', 'GF', 'branch', true
FROM public.tenants
WHERE slug = 'comtammatu';

INSERT INTO public.positions (
  tenant_id,
  code,
  label_vi,
  label_en,
  is_active,
  is_system
)
SELECT id, 'owner', 'Chủ sở hữu', 'Owner', true, true
FROM public.tenants
WHERE slug = 'comtammatu';

INSERT INTO public.profiles (
  id,
  tenant_id,
  branch_id,
  position_id,
  full_name,
  is_active
)
SELECT
  'b0000000-0000-4000-8000-000000000001'::uuid,
  tenant.id,
  branch.id,
  position.id,
  'Greenfield Owner QA',
  true
FROM public.tenants tenant
JOIN public.branches branch
  ON branch.tenant_id = tenant.id
 AND branch.code = 'GF'
JOIN public.positions position
  ON position.tenant_id = tenant.id
 AND position.code = 'owner'
WHERE tenant.slug = 'comtammatu';

INSERT INTO public.employees (
  tenant_id,
  profile_id,
  employee_code,
  is_active
)
SELECT
  tenant.id,
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'GF-OWNER-001',
  true
FROM public.tenants tenant
WHERE tenant.slug = 'comtammatu';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.tenants) <> 1
     OR (SELECT count(*) FROM public.branches) <> 1
     OR (SELECT count(*) FROM public.positions) <> 1
     OR (SELECT count(*) FROM public.profiles) <> 1
     OR (SELECT count(*) FROM public.employees) <> 1
     OR (SELECT count(*) FROM auth.users) <> 1
     OR (SELECT count(*) FROM auth.identities) <> 1 THEN
    RAISE EXCEPTION 'greenfield_owner_seed_postcondition_failed';
  END IF;
END;
$$;

COMMIT;
