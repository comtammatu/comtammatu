-- Migration: work_task_visibility_revoke_anon
-- Close the PostgREST anon execute path on the Work visibility RPCs.

REVOKE ALL ON FUNCTION public.can_create_work_task() FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.can_create_work_task() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_work_task() TO service_role;

REVOKE ALL ON FUNCTION public.can_assign_work_task(bigint) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.can_assign_work_task(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.can_assign_work_task(bigint) TO service_role;

REVOKE ALL ON FUNCTION public.list_work_actor_profiles() FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.list_work_actor_profiles() TO authenticated;
GRANT ALL ON FUNCTION public.list_work_actor_profiles() TO service_role;

REVOKE ALL ON FUNCTION public.list_work_task_creators() FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.list_work_task_creators() TO authenticated;
GRANT ALL ON FUNCTION public.list_work_task_creators() TO service_role;

REVOKE ALL ON FUNCTION public.set_work_task_creator(uuid, boolean) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.set_work_task_creator(uuid, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_work_task_creator(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.set_work_task_participants(bigint, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.set_work_task_participants(bigint, uuid[], uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_work_task_participants(bigint, uuid[], uuid[]) TO service_role;
