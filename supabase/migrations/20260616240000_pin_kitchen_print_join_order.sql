BEGIN;

-- private.enqueue_kitchen_completion_print_internal builds a 10-relation / 9-JOIN
-- routing query whose PROD cost is dominated by join-order PLANNING (~49ms plan
-- vs ~0.5-3ms execution; PostgREST invokes the parent RPC one-transaction-per-
-- call, so PL/pgSQL generic-plan caching never amortizes). The relation count
-- exceeds join_collapse_limit/from_collapse_limit (default 8), forcing an
-- exhaustive join-order search on every call. The query is already written in the
-- optimal order (anchored on the kds_tickets PK), so pinning both collapse limits
-- to 1 trusts that written order and cuts planning ~6-7x with a byte-identical
-- plan and identical output (verified by EXPLAIN ANALYZE on PROD).
--
-- Applied via ALTER FUNCTION ... SET so the function body is NOT restated (no
-- drift risk); the existing SET search_path is preserved. Idempotent.

ALTER FUNCTION private.enqueue_kitchen_completion_print_internal(bigint, bigint[], uuid)
  SET join_collapse_limit TO 1;
ALTER FUNCTION private.enqueue_kitchen_completion_print_internal(bigint, bigint[], uuid)
  SET from_collapse_limit TO 1;

DO $$
DECLARE
  v_config text[];
BEGIN
  SELECT proconfig INTO v_config
  FROM pg_proc
  WHERE oid = 'private.enqueue_kitchen_completion_print_internal(bigint, bigint[], uuid)'::regprocedure;

  IF NOT (v_config @> ARRAY['join_collapse_limit=1'] AND v_config @> ARRAY['from_collapse_limit=1']) THEN
    RAISE EXCEPTION 'join-order pin not applied: proconfig=%', v_config;
  END IF;

  IF NOT (v_config @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'search_path lost on enqueue_kitchen_completion_print_internal: proconfig=%', v_config;
  END IF;
END $$;

COMMIT;
