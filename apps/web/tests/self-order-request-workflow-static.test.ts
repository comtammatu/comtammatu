import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);
const rateLimitMigration = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);
const baseline = readFileSync(
  join(
    process.cwd(),
    "../..",
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const block = new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(migration)?.[0];
  assert.ok(block, `missing function ${name}`);
  return block;
}

const submit = functionBody("self_order_submit");
const payment = functionBody("self_order_create_payment_request");
const accept = functionBody("self_order_accept_request");

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

test("current schema keeps one RPC-only request model", () => {
  assert.match(migration, /CREATE TABLE public\.self_order_requests/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX self_order_requests_one_pending_per_table ON public\.self_order_requests USING btree \(table_id\) WHERE \(status = 'pending'/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX self_order_requests_client_op_id_uidx[\s\S]*\(tenant_id, client_op_id\)/,
  );
  assert.doesNotMatch(migration, /CREATE TABLE public\.self_order_batches/);
  assert.match(
    migration,
    /GRANT SELECT ON TABLE public\.self_order_requests TO authenticated/,
  );
  assert.match(
    migration,
    /GRANT SELECT ON TABLE public\.self_order_requests TO service_role/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT (?:INSERT|UPDATE|DELETE|ALL).*TABLE public\.self_order_requests TO (?:anon|authenticated)/,
  );
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
  assert.match(migration, /'multiple_open_orders'/);
  assert.match(
    migration,
    /client_op_id = p_client_op_id[\s\S]*status = 'rejected'/,
  );
  assert.match(payment, /IF v_open_order_count <> 1 THEN/);
  assert.match(payment, /self_order_order_ambiguous/);
  assert.match(payment, /v_existing\.table_id <> v_table\.id/);
  assert.doesNotMatch(payment, /self_order_sessions|v_session|session_id/);
});

test("payment intent integrity is order-owned without session residue", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX self_order_payment_requests_one_active_per_order[\s\S]*\(tenant_id, order_id\)[\s\S]*status = ANY \(ARRAY\['cash_call'::text, 'vietqr_pending'::text\]/,
  );
  const paymentRequests =
    migration.match(
      /CREATE TABLE public\.self_order_payment_requests \([\s\S]*?\n\);/,
    )?.[0] ?? "";
  assert.notEqual(paymentRequests, "");
  assert.doesNotMatch(paymentRequests, /\bsession_id\b/);
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
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.self_order_submit\([^;]+\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.self_order_accept_request\([^;]+\) TO authenticated/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.self_order_accept_request\([^;]+\) TO service_role/,
  );
});

test("request rate limits keep only token and IP scopes", () => {
  const rateLimitTable =
    rateLimitMigration.match(
      /CREATE TABLE public\.self_order_rate_buckets \([\s\S]*?\n\);/,
    )?.[0] ?? "";
  const rateLimitFunction = functionBody("self_order_consume_rate_limits");
  assert.notEqual(rateLimitTable, "");
  assert.match(
    rateLimitTable,
    /purpose = ANY \(ARRAY\['batch'::text, 'payment'::text\]\)/,
  );
  assert.match(
    rateLimitTable,
    /scope_type = ANY \(ARRAY\['token'::text, 'ip'::text\]\)/,
  );
  assert.match(
    rateLimitFunction,
    /self_order_consume_rate_limits\([\s\S]*p_token text,[\s\S]*p_ip_hash text/,
  );
  assert.doesNotMatch(rateLimitFunction, /p_session_id|p_device_hash/);
  assert.doesNotMatch(
    rateLimitMigration,
    /GRANT .* ON TABLE public\.self_order_rate_buckets TO (?:anon|authenticated)/,
  );
});
