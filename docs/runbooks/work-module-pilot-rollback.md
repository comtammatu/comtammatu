# Work module pilot rollback

English engineering notes for rolling back the Work control-surface pilot without
leaving navigation or RPC exposure in place.

## Hide navigation and discovery

1. Remove or narrow `MODULE_ACL.work.allowedRoles` in
   `packages/shared/src/auth/module-acl.ts` so the module no longer appears in
   control-surface nav for pilot roles.
2. Revoke delegated `work:manage` grants from non-owner profiles if the pilot
   used permission-based access instead of department membership.

## Disable server entry points (optional hard stop)

If UI hiding is not enough during the pilot window:

1. `REVOKE EXECUTE` on Work RPCs from `authenticated` for:
   `can_access_workspace`, `list_my_work_tasks`, `get_work_task`,
   `create_work_task`, `update_work_task`, `set_work_task_status`,
   `count_my_work_tasks_due`, `ensure_pilot_work_department`.
2. Keep table RLS enabled — rollback is about discovery and mutation paths, not
   opening reads through direct table access.

## Control home and staff CTA

1. Remove `loadWorkAttention` from `apps/web/app/_lib/control-home-attention.ts`
   if attention should stop surfacing before the next deploy.
2. Remove the `/work` CTA block from `apps/web/lib/staff-runtime/page.tsx` that
   gates on `can_access_workspace`.

## Pilot verification scope

This runbook does **not** require a full RLS leak audit for the 7-day pilot.
Routine rollback checks:

- Non-member users cannot open `/work` (empty / no-access state).
- Removed nav entry does not reappear via deep links for branch station roles.
- Attention card `work:mine-due` disappears after attention loader removal.

## Re-enable

1. Restore `MODULE_ACL.work` roles.
2. Re-grant RPC execute to `authenticated`.
3. Owner runs `ensure_pilot_work_department()` once if the pilot department row
   was deactivated.
4. Smoke `/work`, `/work/tasks/[id]`, control-home attention, and `/me` CTA.
