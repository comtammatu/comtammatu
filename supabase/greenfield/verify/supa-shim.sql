-- Supabase-compat shim for LOCAL postgres (verify-only; NOT shipped)
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE supabase_admin NOLOGIN;
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE supabase_storage_admin NOLOGIN;
CREATE ROLE dashboard_user NOLOGIN;
CREATE ROLE authenticator NOINHERIT LOGIN;
GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated') $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text, schedule text, command text, active boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS cron.job_run_details (
  jobid bigint, runid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz
);
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text, name text, owner uuid, created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
  AS $$ SELECT string_to_array(name, '/') $$;
