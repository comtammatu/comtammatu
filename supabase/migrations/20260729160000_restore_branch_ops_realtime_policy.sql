-- The `branch_ops_receive` SELECT policy on `realtime.messages` was dropped from
-- the active chain when baseline 20260727120000 was rebuilt: `pg_dump
-- --schema=public --schema=private` excludes the extension-managed `realtime`
-- schema, so every re-baseline silently loses Realtime Authorization policies.
-- The server-side broadcast bus still calls
-- `realtime.send(v_payload, 'ops', 'branch:' || v_branch || ':ops', true)`
-- (baseline.sql broadcast_branch_ops + pos/menu fan-out), but with no receive
-- policy every authenticated JOIN is rejected with
-- "Unauthorized: You do not have permissions to read from this Channel topic",
-- and the supabase-js client re-JOINs on Phoenix's rejoinTimer in a loop.
--
-- This is the sole SELECT policy on realtime.messages in the active chain
-- (the retired self_order_public_broadcast_select policy was dropped in
-- migration-archive/20260711140000_retire_self_order_v2.sql). Restoring it
-- re-arms authorization for private `branch:{id}:ops` topics via the existing
-- `public.can_read_branch_ops(bigint)` predicate (baseline.sql), which checks
-- active owner-or-assigned-branch within the same tenant.
--
-- RLS on realtime.messages is Supabase-managed and already enabled; no
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is needed.

DROP POLICY IF EXISTS "branch_ops_receive" ON realtime.messages;

CREATE POLICY "branch_ops_receive"
ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() ~ '^branch:[1-9][0-9]*:ops$'
  AND public.can_read_branch_ops(
    split_part(realtime.topic(), ':', 2)::bigint
  )
);
