/**
 * Production QA smoke: ADR 0028 short transfer receive + INV-12 reason_code.
 * Marker: [QA-SMOKE-20260810]
 *
 * Usage (repo root):
 *   node --env-file=apps/web/.env.local scripts/qa-smoke-transfer-stocktake.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createClient } = require(
  "/Users/luongthebinh/Downloads/comtammatu/node_modules/.pnpm/@supabase+supabase-js@2.110.7/node_modules/@supabase/supabase-js",
);

const MARKER = "[QA-SMOKE-20260810]";
const TENANT_ID = 1;
const CENTRAL_BRANCH_ID = 1;
const CENTRAL_LOCATION_ID = 1;
const BRANCH_ID = 3;
const BRANCH_LOCATION_ID = 17;
const INGREDIENT_ID = 5; // Tiêu — ample central stock
const ENTRY_UNIT_ID = 36; // units.id for Tiêu base unit
const SHIP_QTY = 2;
const RECV_QTY = 1;

function env(key) {
  if (process.env[key]) return process.env[key];
  for (const path of ["apps/web/.env.local", ".env.local"]) {
    try {
      const text = readFileSync(path, "utf8");
      const match = text.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (match) return match[1].replace(/^["']|["']$/g, "");
    } catch {
      /* ignore */
    }
  }
  throw new Error(`missing ${key}`);
}

function client(key) {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function password() {
  return `QaSmk-${randomBytes(9).toString("base64url")}!`;
}

async function ensureOps(service) {
  const email = `qa.smoke.ops.20260810@comtammatu.com`;
  const fullName = `QA Ops KhoTong ${MARKER}`;
  const pass = password();

  const { data: existingUsers } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = (existingUsers?.users ?? []).find((u) => u.email === email);
  if (existing?.id) {
    await service.auth.admin.updateUserById(existing.id, { password: pass });
    return { email, password: pass, userId: existing.id, created: false };
  }

  const { data: owner } = await service
    .from("profiles")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (!owner?.id) throw new Error("no owner profile for provisioning");

  const token = randomUUID();
  const { error: prepareError } = await service.rpc(
    "prepare_staff_user_provisioning",
    {
      p_token: token,
      p_email: email,
      p_tenant_id: TENANT_ID,
      p_branch_id: CENTRAL_BRANCH_ID,
      p_position_code: "central_supply_ops",
      p_full_name: fullName,
      p_provisioned_by: owner.id,
    },
  );
  if (prepareError) throw prepareError;

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password: pass,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        provisioning_token: token,
      },
    });
  if (createError) throw createError;

  await service.auth.admin.updateUserById(created.user.id, {
    user_metadata: { full_name: fullName, provisioning_token: null },
  });

  return { email, password: pass, userId: created.user.id, created: true };
}

async function signIn(email, pass) {
  const anon = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const sb = client(anon);
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: pass,
  });
  if (error) throw error;
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), anon, {
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function shipToInTransit(ops, noteTag) {
  const { data: draft, error: draftError } = await ops.rpc(
    "create_stock_transfer_draft",
    {
      p_from_branch_id: CENTRAL_BRANCH_ID,
      p_to_branch_id: BRANCH_ID,
      p_from_location_id: CENTRAL_LOCATION_ID,
      p_to_location_id: BRANCH_LOCATION_ID,
      p_transfer_number: "",
      p_notes: `${MARKER} short-receive ${noteTag}`,
      p_vehicle_info: null,
      p_lines: [
        {
          ingredientId: INGREDIENT_ID,
          quantity: SHIP_QTY,
          entryUnitId: ENTRY_UNIT_ID,
        },
      ],
    },
  );
  if (draftError) throw draftError;
  const transferId = draft.id ?? draft.transfer_id;
  if (!transferId) throw new Error(`no transfer id: ${JSON.stringify(draft)}`);

  const { error: shipError } = await ops.rpc("stock_transfer_confirm_ship", {
    p_transfer_id: transferId,
  });
  if (shipError) throw shipError;

  return transferId;
}

async function receiveShort(bm, transferId, shortfallClass) {
  const { error: confirmError } = await bm.rpc(
    "stock_transfer_confirm_receive",
    { p_transfer_id: transferId },
  );
  if (confirmError) throw confirmError;

  // Expect rejection without classification
  const { error: noClassError } = await bm.rpc("stock_transfer_receive", {
    p_transfer_id: transferId,
    p_items: {
      [String(INGREDIENT_ID)]: {
        qty: RECV_QTY,
        note: "QA short without class",
      },
    },
  });
  if (!noClassError) {
    throw new Error(`${shortfallClass}: accepted without classification`);
  }

  const { data, error } = await bm.rpc("stock_transfer_receive", {
    p_transfer_id: transferId,
    p_items: {
      [String(INGREDIENT_ID)]: {
        qty: RECV_QTY,
        note: `${MARKER} ${shortfallClass} short receive smoke`,
        shortfall_class: shortfallClass,
      },
    },
  });
  if (error) throw error;
  return data;
}

async function assertSubtype(service, transferId, subtype) {
  const { data, error } = await service
    .from("stock_movements")
    .select("id, movement_subtype, entry_quantity, quantity_change, reason")
    .eq("transfer_id", transferId)
    .eq("movement_subtype", subtype);
  if (error) throw error;
  if (!data?.length) {
    throw new Error(`missing movement subtype ${subtype} on transfer ${transferId}`);
  }
  return data[0];
}

async function smokeStocktake(bm, service) {
  // Cancel leftover QA in-progress sessions via status update (no cancel RPC).
  const { data: openSessions } = await service
    .from("stocktake_sessions")
    .select("id, status, notes")
    .eq("branch_id", BRANCH_ID)
    .eq("status", "in_progress");

  for (const session of openSessions ?? []) {
    if (String(session.notes ?? "").includes(MARKER)) {
      await service
        .from("stocktake_sessions")
        .update({ status: "cancelled" })
        .eq("id", session.id);
    }
  }

  const { data: created, error: createError } = await bm.rpc(
    "create_stocktake_session",
    {
      p_branch_id: BRANCH_ID,
      p_location_id: BRANCH_LOCATION_ID,
    },
  );
  if (createError) throw createError;
  const sessionId = created.id ?? created.session_id;
  if (!sessionId) throw new Error(`no session id: ${JSON.stringify(created)}`);

  await service
    .from("stocktake_sessions")
    .update({ notes: `${MARKER} INV-12 reason_code smoke` })
    .eq("id", sessionId);

  const { data: lines, error: linesError } = await service
    .from("stocktake_lines")
    .select("id, ingredient_id, system_quantity")
    .eq("session_id", sessionId)
    .eq("round_no", 1);
  if (linesError) throw linesError;
  if (!lines?.length) throw new Error("stocktake has no lines");

  const varianceLine = lines.find((line) => Number(line.system_quantity) >= 1);
  if (!varianceLine) throw new Error("no positive system qty line for variance");

  for (const line of lines) {
    const system = Number(line.system_quantity ?? 0);
    // counted_quantity must be >= 0 even when on-hand is negative (ADR 0026).
    const base = Math.max(0, system);
    const counted = line.id === varianceLine.id ? base - 1 : base;
    const { error } = await bm
      .from("stocktake_lines")
      .update({
        counted_quantity: counted,
        reason_code: null,
        variance_reason: null,
      })
      .eq("id", line.id);
    if (error) throw error;
  }

  const { error: blockedError } = await bm.rpc("complete_stocktake", {
    p_session_id: sessionId,
  });
  if (!blockedError) {
    throw new Error("complete_stocktake accepted variance without reason_code");
  }
  const blockedMsg = blockedError.message ?? String(blockedError);
  if (!blockedMsg.includes("stocktake_reason_code_required")) {
    throw new Error(`unexpected complete error: ${blockedMsg}`);
  }

  // Code every non-zero variance (intentional + clamped negative on-hand lines).
  const { data: afterCount } = await service
    .from("stocktake_lines")
    .select("id, system_quantity, counted_quantity")
    .eq("session_id", sessionId)
    .eq("round_no", 1);
  for (const line of afterCount ?? []) {
    const system = Number(line.system_quantity ?? 0);
    const counted = Number(line.counted_quantity ?? 0);
    if (Math.abs(counted - system) <= 1e-9) continue;
    const { error } = await bm
      .from("stocktake_lines")
      .update({
        reason_code: "found_missing",
        variance_reason: `${MARKER} INV-12 smoke note`,
      })
      .eq("id", line.id);
    if (error) throw error;
  }

  // Clear intentional line to re-prove the gate, then set and complete.
  const { error: clearError } = await bm
    .from("stocktake_lines")
    .update({ reason_code: null, variance_reason: null })
    .eq("id", varianceLine.id);
  if (clearError) throw clearError;

  const { error: blockedAgain } = await bm.rpc("complete_stocktake", {
    p_session_id: sessionId,
  });
  if (!String(blockedAgain?.message ?? "").includes("stocktake_reason_code_required")) {
    throw new Error("expected second reason_code gate");
  }

  const { error: reasonError } = await bm
    .from("stocktake_lines")
    .update({
      reason_code: "found_missing",
      variance_reason: `${MARKER} INV-12 smoke note`,
    })
    .eq("id", varianceLine.id);
  if (reasonError) throw reasonError;

  const { data: completed, error: completeError } = await bm.rpc(
    "complete_stocktake",
    { p_session_id: sessionId },
  );
  if (completeError) throw completeError;

  return {
    sessionId,
    varianceLineId: varianceLine.id,
    ingredientId: varianceLine.ingredient_id,
    blockedMsg,
    completed,
  };
}

const service = client(env("SUPABASE_SERVICE_ROLE_KEY"));
const bmCreds = JSON.parse(
  readFileSync(".tmp/qa-smoke-accounts-20260810.json", "utf8"),
).accounts.find((a) => a.position_code === "branch_manager");
if (!bmCreds) throw new Error("BM QA creds missing");

const opsCreds = await ensureOps(service);
mkdirSync(".tmp", { recursive: true });
const outPath = ".tmp/qa-smoke-ops-20260810.json";
writeFileSync(
  outPath,
  JSON.stringify({ marker: MARKER, ...opsCreds }, null, 2),
);

const ops = await signIn(opsCreds.email, opsCreds.password);
const bm = await signIn(bmCreds.email, bmCreds.password);

const sourceTransferId = await shipToInTransit(ops, "source_variance");
await receiveShort(bm, sourceTransferId, "source_variance");
const sourceMove = await assertSubtype(
  service,
  sourceTransferId,
  "transfer_source_variance",
);

const transitTransferId = await shipToInTransit(ops, "transit_loss");
await receiveShort(bm, transitTransferId, "transit_loss");
const transitMove = await assertSubtype(
  service,
  transitTransferId,
  "transfer_transit_loss",
);

const stocktake = await smokeStocktake(bm, service);

const summary = {
  marker: MARKER,
  ops: { email: opsCreds.email, created: opsCreds.created, credsFile: outPath },
  transfers: {
    source_variance: {
      transferId: sourceTransferId,
      movementId: sourceMove.id,
      entry_quantity: sourceMove.entry_quantity,
    },
    transit_loss: {
      transferId: transitTransferId,
      movementId: transitMove.id,
      entry_quantity: transitMove.entry_quantity,
    },
  },
  stocktake,
};

console.log(JSON.stringify(summary, null, 2));
