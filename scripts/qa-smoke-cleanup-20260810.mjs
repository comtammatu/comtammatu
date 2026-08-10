/**
 * Production hard cleanup for [QA-SMOKE-20260810].
 *
 * Reverses stock_levels + valuation accounts/balances, then deletes marked
 * documents / movements / valuation events (immutability trigger disabled
 * inside the transaction), then deletes ephemeral auth users.
 *
 *   node --env-file=apps/web/.env.local scripts/qa-smoke-cleanup-20260810.mjs
 *   node --env-file=apps/web/.env.local scripts/qa-smoke-cleanup-20260810.mjs --apply
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../apps/web/package.json",
  ),
);
const { createClient } = require("@supabase/supabase-js");

const MARKER = "[QA-SMOKE-20260810]";
const APPLY = process.argv.includes("--apply");
const PROJECT_REF = "enloyfnuerqgaqderbwb";

const QA_USER_IDS = [
  "dea02d43-f5fe-4f40-b7e7-90f1ad5417ea", // BM
  "25cc1fb2-ed80-400f-a8ae-2045edde3e31", // cashier
  "7f233cb6-aefc-4397-bdaa-9bde7a949a70", // ops
];

const QA_EMAILS = [
  "qa.smoke.bm.20260810@comtammatu.com",
  "qa.smoke.cashier.20260810@comtammatu.com",
  "qa.smoke.ops.20260810@comtammatu.com",
];

const OWNER_EMAIL = "owner@comtammatu.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function envOrFile(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ["apps/web/.env.local", ".env.local"]) {
    try {
      const text = readFileSync(file, "utf8");
      const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
      if (match) return match[1].replace(/^["']|["']$/g, "");
    } catch {
      /* ignore */
    }
  }
  throw new Error(`Missing env ${name}`);
}

async function findUserByEmail(service, email) {
  const normalized = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function reassignProfileFks(service, tenantId, fromIds, toId) {
  const tables = [
    ["orders", "created_by"],
    ["orders", "priority_marked_by"],
    ["payments", "created_by"],
    ["stock_movements", "created_by"],
    ["stock_requests", "created_by"],
    ["stock_transfers", "created_by"],
    ["stocktake_sessions", "created_by"],
    ["stocktake_sessions", "completed_by"],
    ["pos_sessions", "opened_by"],
    ["pos_sessions", "closed_by"],
    ["inventory_valuation_events", "created_by"],
    ["notifications", "created_by"],
    ["kds_tickets", "bumped_by"],
    ["kitchen_send_batches", "created_by"],
    ["finance_fund_entries", "created_by"],
    ["print_jobs", "created_by"],
  ];
  const summary = [];
  for (const [table, column] of tables) {
    const { data, error } = await service
      .from(table)
      .update({ [column]: toId })
      .eq("tenant_id", tenantId)
      .in(column, fromIds)
      .select("id");
    if (error) {
      if (
        error.code === "42P01" ||
        error.code === "42703" ||
        /column|relation|schema cache/i.test(error.message)
      ) {
        summary.push({ table, column, skipped: error.message });
        continue;
      }
      throw error;
    }
    summary.push({ table, column, reassigned: data?.length ?? 0 });
  }
  return summary;
}

const PURGE_SQL = `
DO $purge$
DECLARE
  movement_ids int[] := ARRAY[568,569,570,571,572,573,574,575,576,577,578,580,581,582];
  event_ids bigint[] := ARRAY[718,719,720,721,722,723,724,725,726,727,728,729,730,731,732,733,735,736,737];
  balance_ids bigint[] := ARRAY[554,555,556,557,558,560,562,563];
  origin_ids bigint[] := ARRAY[204,205,206,207];
  notification_ids bigint[] := ARRAY[2002,2005,2016];
BEGIN
  -- 1) Valuation allocations then immutable events
  ALTER TABLE public.inventory_value_allocations
    DISABLE TRIGGER inventory_value_allocations_immutable;
  ALTER TABLE public.inventory_valuation_events
    DISABLE TRIGGER inventory_valuation_events_immutable;

  DELETE FROM public.inventory_value_allocations
  WHERE valuation_event_id = ANY(event_ids);

  DELETE FROM public.inventory_valuation_events
  WHERE id = ANY(event_ids);

  ALTER TABLE public.inventory_valuation_events
    ENABLE TRIGGER inventory_valuation_events_immutable;
  ALTER TABLE public.inventory_value_allocations
    ENABLE TRIGGER inventory_value_allocations_immutable;

  -- 2) Restore / remove origin balances for transfers + shortfall/stocktake
  UPDATE public.inventory_origin_balances
  SET quantity = quantity + 6,
      book_value = book_value + 882,
      updated_at = now()
  WHERE id = 58;

  UPDATE public.inventory_origin_balances
  SET quantity = quantity + 1,
      book_value = book_value + 360000,
      updated_at = now()
  WHERE id = 489;

  DELETE FROM public.inventory_origin_balances
  WHERE id = ANY(balance_ids);

  DELETE FROM public.inventory_cost_origins
  WHERE id = ANY(origin_ids);

  -- 3) Restore valuation accounts
  UPDATE public.inventory_valuation_accounts
  SET quantity = quantity + 6,
      book_value = book_value + 882,
      updated_at = now()
  WHERE id = 62;

  UPDATE public.inventory_valuation_accounts
  SET quantity = quantity + 1,
      book_value = book_value + 360000,
      updated_at = now()
  WHERE id = 549;

  DELETE FROM public.inventory_valuation_accounts
  WHERE id IN (616, 617, 619);

  -- 4) Stock movements (no reverse trigger on DELETE)
  DELETE FROM public.stock_movements
  WHERE id = ANY(movement_ids);

  -- 5) Restore stock_levels
  UPDATE public.stock_levels
  SET current_quantity = current_quantity + 6,
      updated_at = now()
  WHERE location_id = 1 AND ingredient_id = 5;

  UPDATE public.stock_levels
  SET current_quantity = current_quantity - 3,
      updated_at = now()
  WHERE location_id = 17 AND ingredient_id = 5;

  UPDATE public.stock_levels
  SET current_quantity = current_quantity + 1,
      updated_at = now()
  WHERE location_id = 17 AND ingredient_id = 26;

  -- 6) Notifications
  DELETE FROM public.notification_reads
  WHERE notification_id = ANY(notification_ids);

  DELETE FROM public.notifications
  WHERE id = ANY(notification_ids)
     OR body ILIKE '%${MARKER}%'
     OR title ILIKE '%${MARKER}%'
     OR (entity_type = 'order' AND entity_id = 11)
     OR (entity_type = 'stock_request' AND entity_id IN (6,7,8));

  -- 7) Documents
  DELETE FROM public.orders WHERE id = 11;
  DELETE FROM public.stock_transfers WHERE id IN (90, 91, 92);
  DELETE FROM public.stocktake_sessions WHERE id = 19;
  DELETE FROM public.stock_requests WHERE id IN (6, 7, 8);
  DELETE FROM public.pos_sessions WHERE id = 2;

  -- 8) QA employees (ops may have none)
  DELETE FROM public.employees
  WHERE profile_id = ANY(ARRAY[
    'dea02d43-f5fe-4f40-b7e7-90f1ad5417ea'::uuid,
    '25cc1fb2-ed80-400f-a8ae-2045edde3e31'::uuid,
    '7f233cb6-aefc-4397-bdaa-9bde7a949a70'::uuid
  ]);
END;
$purge$;
`;

async function inventory(service) {
  const [{ data: profiles }, { data: requests }, { data: transfers }, { data: stocktakes }, { data: orders }] =
    await Promise.all([
      service
        .from("profiles")
        .select("id, full_name, branch_id")
        .ilike("full_name", `%${MARKER}%`),
      service
        .from("stock_requests")
        .select("id, request_number, status")
        .ilike("notes", `%${MARKER}%`),
      service
        .from("stock_transfers")
        .select("id, status")
        .ilike("notes", `%${MARKER}%`),
      service
        .from("stocktake_sessions")
        .select("id, status")
        .ilike("notes", `%${MARKER}%`),
      service
        .from("orders")
        .select("id, order_number, status")
        .eq("id", 11),
    ]);

  return {
    profiles: profiles ?? [],
    requests: requests ?? [],
    transfers: transfers ?? [],
    stocktakes: stocktakes ?? [],
    orders: orders ?? [],
  };
}

async function main() {
  const url = envOrFile("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(PROJECT_REF)) {
    throw new Error(`Refusing non-Production URL: ${url}`);
  }

  const service = createClient(url, envOrFile("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const before = await inventory(service);
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        marker: MARKER,
        before,
        will_purge: {
          order_id: 11,
          transfer_ids: [90, 91, 92],
          stocktake_id: 19,
          stock_request_ids: [6, 7, 8],
          pos_session_id: 2,
          movement_ids: [568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 580, 581, 582],
          valuation_event_ids: [
            718, 719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731,
            732, 733, 735, 736, 737,
          ],
          accounts: QA_EMAILS,
        },
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.error("Dry-run only. Re-run with --apply to mutate Production.");
    return;
  }

  // Prefer MCP/SQL editor path: use PostgREST rpc if available; else raw via fetch to pg.
  // Service role cannot run arbitrary DO blocks through supabase-js; use Management SQL via env DATABASE_URL if set.
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Fall back: write SQL file and instruct; also try supabase CLI db execute.
    throw new Error(
      "Set SUPABASE_DB_URL (or DATABASE_URL) for --apply hard purge, or run PURGE via Supabase SQL.",
    );
  }

  const pg = require("pg");
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(PURGE_SQL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const owner = await findUserByEmail(service, OWNER_EMAIL);
  if (!owner) throw new Error(`Owner missing: ${OWNER_EMAIL}`);

  const reassign = await reassignProfileFks(
    service,
    1,
    QA_USER_IDS,
    owner.id,
  );

  const deleted = [];
  for (const email of QA_EMAILS) {
    const user = await findUserByEmail(service, email);
    if (!user) {
      deleted.push({ email, status: "already_absent" });
      continue;
    }
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) throw error;
    deleted.push({ email, status: "deleted", user_id: user.id });
  }

  for (const file of [
    ".tmp/qa-smoke-accounts-20260810.json",
    ".tmp/qa-smoke-ops-20260810.json",
  ]) {
    if (existsSync(file)) unlinkSync(file);
  }

  const after = await inventory(service);
  console.log(
    JSON.stringify({ ok: true, reassign, deleted, after }, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
