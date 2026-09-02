import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";
import { extractSqlFunction, readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260710113746_self_order_request_workflow.sql");
const rateLimitMigration = readSql(process.cwd(), "supabase/migrations/20260710191526_self_order_request_rate_limits.sql");
const baseline = normalizePgDumpSql(
  readSql(process.cwd(), "supabase/migrations/20260902162918_baseline.sql"),
);

function functionBody(signature: string, _next: string): string {
  const name = signature.match(/FUNCTION ((?:public|private)\.\w+)/)?.[1];
  return name ? extractSqlFunction(migration, name) : "";
}

const submit = functionBody(
  "CREATE OR REPLACE FUNCTION public.self_order_submit(",
  "CREATE OR REPLACE FUNCTION public.self_order_accept_request(",
);
const payment = functionBody(
  "CREATE OR REPLACE FUNCTION public.self_order_create_payment_request(",
  "CREATE OR REPLACE FUNCTION public.self_order_cancel_payment_request(",
);
const accept = functionBody(
  "CREATE OR REPLACE FUNCTION public.self_order_accept_request(",
  "CREATE OR REPLACE FUNCTION public.self_order_reject_request(",
);

function baselineFunctionBody(signature: string, next: string): string {
  const start = baseline.indexOf(signature);
  const end = baseline.indexOf(next, start);
  assert.notEqual(start, -1, `missing ${signature}`);
  assert.notEqual(end, -1, `missing boundary ${next}`);
  return baseline.slice(start, end);
}

const appendOrderItems = baselineFunctionBody(
  "CREATE FUNCTION public.append_order_items(",
  "CREATE FUNCTION public.append_order_items_with_daily_limit_hold(",
);
const createOrder = baselineFunctionBody(
  "CREATE FUNCTION public.create_order(",
  "CREATE FUNCTION public.create_order_with_daily_limit_hold(",
);

test("S1 creates one RPC-only request model and backfills pending batches", () => {
  assertSqlMatch(migration, /CREATE TABLE public\.self_order_requests/);
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX self_order_requests_one_pending_per_table[\s\S]*ON public\.self_order_requests \(table_id\)[\s\S]*WHERE status = 'pending'/,
  );
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX self_order_requests_client_op_id_uidx[\s\S]*\(tenant_id, client_op_id\)/,
  );
  assertSqlMatch(migration,
    /FROM public\.self_order_batches b[\s\S]*WHERE b\.status = 'pending_approval'[\s\S]*INSERT INTO public\.self_order_requests/,
  );
  assertSqlMatch(migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.self_order_requests[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assertSqlMatch(migration,
    /GRANT SELECT ON TABLE public\.self_order_requests TO authenticated, service_role/,
  );
  assertSqlNotMatch(migration, /DROP (?:TABLE|FUNCTION|COLUMN)/i);
});

test("self_order_submit serializes by table and branches on the open-order count", () => {
  assert.match(
    submit,
    /pg_advisory_xact_lock\([\s\S]*hashtext\('self-order-table'\)/,
  );
  const oneOrder = submit.indexOf("IF v_open_order_count = 1 THEN");
  const append = submit.indexOf("public.append_order_items", oneOrder);
  const pending = submit.indexOf("'pending'", append);
  assert.ok(oneOrder >= 0 && append > oneOrder && pending > append);
  assert.match(submit, /public\.self_order_canonicalize_cart/);
  assert.match(
    submit,
    /public\.self_order_set_actor_claims\(v_order\.created_by/,
  );
  assert.match(submit, /'accepted'[\s\S]*v_order\.created_by[\s\S]*now\(\)/);
  assert.match(submit, /self_order_idempotency_conflict/);
  assert.match(submit, /item\.value - 'key'/);
  assert.match(submit, /SET search_path TO ''/);
});

test("staff acceptance changes only the request and preserves canonical KDS routing", () => {
  assert.match(accept, /public\.create_order\(/);
  assert.match(accept, /public\.append_order_items\(/);
  assert.match(
    accept,
    /UPDATE public\.self_order_requests[\s\S]*SET status = 'accepted'/,
  );
  assert.doesNotMatch(
    accept,
    /UPDATE public\.(?:orders|order_items|kds_tickets)/,
  );
  assert.match(createOrder, /PERFORM public\.route_order_to_kds\(v_order_id\)/);
  assert.match(
    appendOrderItems,
    /PERFORM public\.route_order_to_kds\(p_order_id\)/,
  );
});

test("snapshot and payment fail closed for multi-bill tables", () => {
  assertSqlMatch(migration, /'multiple_open_orders'/);
  assertSqlMatch(migration,
    /client_op_id = p_client_op_id[\s\S]*status = 'rejected'/,
  );
  assert.match(payment, /IF v_open_order_count <> 1 THEN/);
  assert.match(payment, /self_order_order_ambiguous/);
  assert.match(payment, /v_existing\.table_id <> v_table\.id/);
  assert.doesNotMatch(payment, /self_order_sessions|v_session|session_id/);
});

test("payment intent integrity moves from session to order", () => {
  assertSqlMatch(migration,
    /ALTER TABLE public\.self_order_payment_requests[\s\S]*ALTER COLUMN session_id DROP NOT NULL/,
  );
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX self_order_payment_requests_one_active_per_order[\s\S]*\(tenant_id, order_id\)[\s\S]*WHERE status IN \('cash_call', 'vietqr_pending'\)/,
  );
  assertSqlMatch(migration,
    /CREATE UNIQUE INDEX self_order_payment_requests_sessionless_client_op_uidx[\s\S]*WHERE session_id IS NULL/,
  );
  assert.match(
    payment,
    /INSERT INTO public\.self_order_payment_requests \([\s\S]*order_id,[\s\S]*client_op_id/,
  );
  assert.match(payment, /SET search_path TO ''/);
});

test("public security-definer RPCs keep explicit checks and least privilege", () => {
  for (const body of [submit, payment]) {
    assert.match(body, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
    assert.match(body, /SET search_path TO ''/);
  }
  assertSqlMatch(migration,
    /REVOKE ALL ON FUNCTION public\.self_order_submit\(text, jsonb, text, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.self_order_accept_request\(bigint, bigint\)[\s\S]*TO authenticated, service_role/,
  );
});

test("request rate limits keep only token and IP scopes", () => {
  assertSqlMatch(rateLimitMigration,
    /CHECK \(purpose IN \('batch', 'payment'\)\)/,
  );
  assertSqlMatch(rateLimitMigration, /CHECK \(scope_type IN \('token', 'ip'\)\)/);
  assertSqlMatch(rateLimitMigration,
    /self_order_consume_rate_limits\([\s\S]*p_token text,[\s\S]*p_ip_hash text/,
  );
  assertSqlNotMatch(rateLimitMigration, /p_session_id|p_device_hash/);
  assertSqlMatch(rateLimitMigration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.self_order_rate_buckets[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
});
