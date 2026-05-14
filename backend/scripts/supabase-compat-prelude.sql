-- =============================================================
-- Supabase Compatibility Prelude for plain PostgreSQL
-- Purpose: stub out Supabase platform objects so migrations
--          written for hosted Supabase apply cleanly on vanilla
--          Postgres (e.g. local Docker dev, plain pgxpool backend).
-- This file MUST be applied BEFORE any supabase/migrations/*.sql
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Roles (Supabase built-in roles — created as no-login stubs)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime') THEN
    CREATE ROLE supabase_realtime NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- 2. auth schema + stub functions
-- ---------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

-- auth.users table stub (profiles.id FK references this)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- auth.uid() — returns NULL in plain Postgres (no session)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql STABLE
AS $$ SELECT NULL::UUID $$;

-- auth.role() — returns NULL
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$ SELECT NULL::TEXT $$;

-- auth.jwt() — returns empty JSONB
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql STABLE
AS $$ SELECT '{}'::JSONB $$;

-- auth.email() — returns NULL
CREATE OR REPLACE FUNCTION auth.email()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$ SELECT NULL::TEXT $$;

-- ---------------------------------------------------------------
-- 3. storage schema + stub objects
-- ---------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  TEXT REFERENCES storage.buckets(id),
  name       TEXT,
  owner      UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata   JSONB
);

-- storage helper functions used in RLS policies
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT string_to_array(name, '/') $$;

CREATE OR REPLACE FUNCTION storage.filename(name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

CREATE OR REPLACE FUNCTION storage.extension(name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT reverse(split_part(reverse(name), '.', 1))
$$;

-- ---------------------------------------------------------------
-- 4. cron schema stub (pg_cron not available on plain Postgres)
-- ---------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid   BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  jobname TEXT UNIQUE,
  schedule TEXT,
  command TEXT
);

CREATE OR REPLACE FUNCTION cron.schedule(p_name TEXT, p_schedule TEXT, p_command TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE v_id BIGINT;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (p_name, p_schedule, p_command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM cron.job WHERE jobname = p_name;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------
-- 5. supabase_realtime publication stub
--    (ALTER PUBLICATION supabase_realtime ADD TABLE … is used in
--     migrations; the publication must exist but does nothing here)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- 6. Grant postgres superuser access to stub schemas
-- ---------------------------------------------------------------
GRANT ALL ON SCHEMA auth    TO postgres;
GRANT ALL ON SCHEMA storage TO postgres;
GRANT ALL ON SCHEMA cron    TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA auth    TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron    TO postgres;
