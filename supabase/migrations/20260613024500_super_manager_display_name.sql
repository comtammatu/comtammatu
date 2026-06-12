BEGIN;

UPDATE public.profiles
SET full_name = 'Giám đốc điều hành',
    updated_at = now()
WHERE id = 'a0000002-0000-4000-8000-000000000002'::uuid;

UPDATE auth.users
SET raw_user_meta_data =
      jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb('Giám đốc điều hành'::text), true),
    raw_app_meta_data =
      jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{full_name}', to_jsonb('Giám đốc điều hành'::text), true)
WHERE id = 'a0000002-0000-4000-8000-000000000002'::uuid;

COMMIT;
