-- Extend Work management helper coverage for membership admin RPCs.

\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(11);

SELECT has_function(
  'public',
  'can_access_workspace',
  ARRAY[]::text[],
  'can_access_workspace helper exists'
);

SELECT has_function(
  'public',
  'can_read_work_department',
  ARRAY['bigint'::text],
  'can_read_work_department helper exists'
);

SELECT has_function(
  'public',
  'can_read_work_project',
  ARRAY['bigint'::text],
  'can_read_work_project helper exists'
);

SELECT has_function(
  'public',
  'can_read_work_task',
  ARRAY['bigint'::text],
  'can_read_work_task helper exists'
);

SELECT has_function(
  'public',
  'can_manage_work_membership',
  ARRAY[]::text[],
  'can_manage_work_membership helper exists'
);

SELECT has_function(
  'public',
  'upsert_work_department_member',
  ARRAY['bigint'::text, 'uuid'::text, 'text'::text],
  'upsert_work_department_member exists'
);

SELECT has_function(
  'public',
  'set_work_department_member_role',
  ARRAY['bigint'::text, 'uuid'::text, 'text'::text],
  'set_work_department_member_role exists'
);

SELECT has_function(
  'public',
  'deactivate_work_department_member',
  ARRAY['bigint'::text, 'uuid'::text],
  'deactivate_work_department_member exists'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_class class
    JOIN pg_namespace namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'work_tasks'
  ),
  'RLS enabled on work_tasks'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.table_privileges privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name = 'work_tasks'
      AND privilege.grantee = 'authenticated'
      AND privilege.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ),
  'authenticated has no direct write on work_tasks'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.table_privileges privilege
    WHERE privilege.table_schema = 'public'
      AND privilege.table_name = 'work_department_members'
      AND privilege.grantee = 'authenticated'
      AND privilege.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ),
  'authenticated has no direct write on work_department_members'
);

SELECT finish();

ROLLBACK;
