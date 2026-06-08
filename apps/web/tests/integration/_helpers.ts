/**
 * Integration-test harness for the REAL money RPCs against the lean Supabase
 * project (uozwee). Every test runs inside a single transaction that is ALWAYS
 * rolled back (BEGIN … ROLLBACK), so the database stays pristine — no row this
 * suite writes is ever committed.
 *
 * Why pg + manual JWT claims (not supabase-js): the money RPCs gate on
 * `auth.uid()` + `auth_tenant_id()` (read from request.jwt.claims). The GoTrue
 * custom_access_token_hook that injects tenant_id/branch_id is NOT enabled on
 * this project, so a supabase-js sign-in yields a JWT without tenant claims and
 * the RPCs fail tenant checks. Setting `request.jwt.claims` directly gives us
 * full, deterministic control of the auth context inside the rolled-back tx.
 *
 * Connection: pooler (session mode), creds from repo .env.local. Target is
 * ALWAYS uozwee; this harness must never point at prod.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "../../../../.env.local");

const UOZWEE_HOST = "aws-1-ap-southeast-1.pooler.supabase.com";
const UOZWEE_USER = "postgres.uozweehdeyflukijrynf";

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

/** True only if uozwee creds are present — lets the suite skip gracefully. */
export function hasIntegrationCreds(): boolean {
  try {
    const env = readEnv();
    return Boolean(
      env["SUPABASE_PASSWORD"] &&
        (env["NEXT_PUBLIC_SUPABASE_URL"] ?? "").includes("uozwee"),
    );
  } catch {
    return false;
  }
}

export function makeClient(): Client {
  const env = readEnv();
  const url = env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
  // Safety rail: refuse to connect to anything that is not the lean dev project.
  if (!url.includes("uozwee")) {
    throw new Error(
      `Integration tests target uozwee only; refusing to run against ${url}`,
    );
  }
  return new Client({
    host: UOZWEE_HOST,
    port: 5432,
    user: UOZWEE_USER,
    database: "postgres",
    password: env["SUPABASE_PASSWORD"]!,
    ssl: { rejectUnauthorized: false },
  });
}

export interface TestActor {
  uid: string;
  tenantId: number;
  branchId: number;
}

/**
 * Set the per-statement auth context the RPCs read. Call AFTER opening the
 * transaction. `app_metadata` carries tenant_id/branch_id exactly as the real
 * access token would once the hook is enabled.
 */
export async function setAuthContext(
  client: Client,
  actor: TestActor,
): Promise<void> {
  const claims = JSON.stringify({
    sub: actor.uid,
    role: "authenticated",
    app_metadata: {
      tenant_id: actor.tenantId,
      branch_id: actor.branchId,
      user_role: "owner",
    },
  });
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    claims,
  ]);
}

/**
 * Provision an owner test actor + a menu item inside the current transaction.
 * Everything created here is rolled back with the tx. Runs as the superuser
 * connection role (privileged inserts into auth.users / profiles).
 */
export async function seedActorAndMenu(
  client: Client,
  opts: { tenantId: number; branchId: number },
): Promise<{ actor: TestActor; menuItemId: number; basePrice: number }> {
  const uid = `00000000-0000-4000-8000-${Date.now()
    .toString(16)
    .padStart(12, "0")
    .slice(-12)}`;

  await client.query(
    `INSERT INTO auth.users (id, email, instance_id, aud, role)
     VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
     ON CONFLICT (id) DO NOTHING`,
    [uid, `int_${uid}@matu.test`],
  );

  const pos = await client.query(
    "SELECT id FROM public.positions WHERE code = 'owner' LIMIT 1",
  );
  const positionId = pos.rows[0].id as number;

  await client.query(
    `INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
     VALUES ($1, $2, $3, $4, 'INT TEST OWNER')
     ON CONFLICT (id) DO NOTHING`,
    [uid, opts.tenantId, opts.branchId, positionId],
  );

  const basePrice = 50000;
  const cat = await client.query(
    `INSERT INTO public.menu_categories (tenant_id, name, sort_order)
     VALUES ($1, 'INT Test Cat', 999) RETURNING id`,
    [opts.tenantId],
  );
  const categoryId = cat.rows[0].id as number;

  const item = await client.query(
    `INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, is_active)
     VALUES ($1, $2, 'INT Test Com Tam', $3, true) RETURNING id`,
    [opts.tenantId, categoryId, basePrice],
  );

  return {
    actor: { uid, tenantId: opts.tenantId, branchId: opts.branchId },
    menuItemId: item.rows[0].id as number,
    basePrice,
  };
}

/**
 * Create a paid-eligible order via the real create_order RPC (auth context must
 * already be set). Returns the order id + its total.
 */
export async function createOrder(
  client: Client,
  actor: TestActor,
  menuItemId: number,
  quantity: number,
): Promise<{ orderId: number; total: number }> {
  const items = JSON.stringify([
    { menu_item_id: menuItemId, quantity, item_name: "INT Test Com Tam" },
  ]);
  const res = await client.query(
    `SELECT public.create_order($1, $2, $3::uuid, $4::jsonb, 'takeaway') AS r`,
    [actor.tenantId, actor.branchId, actor.uid, items],
  );
  const orderId = Number(res.rows[0].r.order_id);
  const ord = await client.query(
    "SELECT total_amount FROM public.orders WHERE id = $1",
    [orderId],
  );
  return { orderId, total: Number(ord.rows[0].total_amount) };
}

/**
 * Count stock_movements consumption rows attributable to a sale order. The HKD
 * lean invariant ("không trừ kho") requires this to be 0 for any paid sale.
 */
export async function countSaleStockMovements(
  client: Client,
  orderId: number,
): Promise<number> {
  const res = await client.query(
    `SELECT count(*)::int AS n
       FROM public.stock_movements
      WHERE order_id = $1 AND type = 'consumption'`,
    [orderId],
  );
  return res.rows[0].n as number;
}
