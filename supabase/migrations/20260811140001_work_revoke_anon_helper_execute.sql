-- Work helpers/RPCs: explicit revoke from anon (PUBLIC revoke alone left anon
-- EXECUTE via Supabase role grants). Re-grant authenticated + service_role for
-- intentional browser RPC / RLS helper use.

REVOKE ALL ON FUNCTION public.can_access_workspace()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_workspace()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_work_department(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_work_department(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_work_project(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_work_project(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_work_task(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_work_task(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_write_work_task(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_work_task(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_my_work_tasks(boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_work_tasks(boolean)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_work_task(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_work_task(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_work_task(
  bigint, bigint, text, text, text, uuid, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_task(
  bigint, bigint, text, text, text, uuid, timestamptz
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_work_task(
  bigint,
  integer,
  text,
  text,
  text,
  uuid,
  timestamptz,
  bigint,
  boolean,
  boolean,
  boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_work_task(
  bigint,
  integer,
  text,
  text,
  text,
  uuid,
  timestamptz,
  bigint,
  boolean,
  boolean,
  boolean
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_work_task_status(bigint, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_task_status(bigint, integer, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.count_my_work_tasks_due(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_my_work_tasks_due(timestamptz)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ensure_pilot_work_department()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_pilot_work_department()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.add_work_task_comment(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_work_task_comment(bigint, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_work_task_checklist_item(
  bigint, bigint, text, boolean, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_work_task_checklist_item(
  bigint, bigint, text, boolean, integer
) TO authenticated, service_role;
