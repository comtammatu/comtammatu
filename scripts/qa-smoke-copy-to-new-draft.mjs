/**
 * Production QA smoke: ADR 0030 copy-to-new-draft from rejected stock request.
 * Marker: [QA-SMOKE-20260810]
 *
 *   node --env-file=apps/web/.env.local scripts/qa-smoke-copy-to-new-draft.mjs
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { createClient } = require(
  "/Users/luongthebinh/Downloads/comtammatu/node_modules/.pnpm/@supabase+supabase-js@2.110.7/node_modules/@supabase/supabase-js",
);

const MARKER = "[QA-SMOKE-20260810]";
const BRANCH_ID = 3;
const INGREDIENT_ID = 5; // Tiêu
const ENTRY_UNIT_ID = 36;
const QTY = 3;

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

async function asUser(email, password) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const service = createClient(
  env("NEXT_PUBLIC_SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const accounts = JSON.parse(
  readFileSync(".tmp/qa-smoke-accounts-20260810.json", "utf8"),
).accounts;
const bmCreds = accounts.find((a) => a.position_code === "branch_manager");
const opsPass =
  JSON.parse(readFileSync(".tmp/qa-smoke-ops-20260810.json", "utf8")).password ??
  "QaSmk-OpsSmoke88Fgou!";

await service.auth.admin.updateUserById(
  "7f233cb6-aefc-4397-bdaa-9bde7a949a70",
  { password: opsPass },
);

const bm = await asUser(bmCreds.email, bmCreds.password);
const ops = await asUser("qa.smoke.ops.20260810@comtammatu.com", opsPass);

const neededAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const { data: saved, error: saveError } = await bm.rpc("save_stock_request", {
  p_request_id: null,
  p_branch_id: BRANCH_ID,
  p_needed_at: neededAt,
  p_notes: `${MARKER} reject then copy-to-new-draft`,
  p_lines: [
    {
      ingredient_id: INGREDIENT_ID,
      entry_unit_id: ENTRY_UNIT_ID,
      quantity: QTY,
    },
  ],
  p_submit: true,
  p_idempotency_key: randomUUID(),
});
if (saveError) throw saveError;
const rejectedRequestId = saved.request_id ?? saved.id;
if (!rejectedRequestId) throw new Error(`no request id: ${JSON.stringify(saved)}`);

const { data: items, error: itemsError } = await service
  .from("stock_request_items")
  .select("id, ingredient_id, entry_unit_id, quantity, status")
  .eq("request_id", rejectedRequestId);
if (itemsError) throw itemsError;
if (!items?.length) throw new Error("no items on submitted request");

const { data: rejected, error: rejectError } = await ops.rpc(
  "reject_stock_request_lines",
  {
    p_request_id: rejectedRequestId,
    p_fulfill_site_kind: "central_supply",
    p_item_ids: items.map((item) => item.id),
    p_reason: `${MARKER} reject for copy-to-new smoke`,
  },
);
if (rejectError) throw rejectError;

const { data: afterReject } = await service
  .from("stock_requests")
  .select("id, request_number, status")
  .eq("id", rejectedRequestId)
  .single();
const { data: afterItems } = await service
  .from("stock_request_items")
  .select("id, status, quantity, ingredient_id, entry_unit_id")
  .eq("request_id", rejectedRequestId);

if (afterReject?.status !== "rejected" && afterReject?.status !== "closed") {
  // Some flows leave header submitted/partially rejected — require rejected lines.
  const hasRejected = (afterItems ?? []).some((item) => item.status === "rejected");
  if (!hasRejected) {
    throw new Error(
      `expected rejected lines; request=${JSON.stringify(afterReject)} items=${JSON.stringify(afterItems)}`,
    );
  }
}

const rejectedLines = (afterItems ?? []).filter(
  (item) => item.status === "rejected",
);
if (rejectedLines.length === 0) {
  throw new Error(`no rejected lines: ${JSON.stringify(afterItems)}`);
}

// Copy-to-new-draft: new independent voucher with copied lines (ADR 0030).
const { data: copied, error: copyError } = await bm.rpc("save_stock_request", {
  p_request_id: null,
  p_branch_id: BRANCH_ID,
  p_needed_at: neededAt,
  p_notes: `${MARKER} copied from ${afterReject.request_number} via copy-to-new-draft`,
  p_lines: rejectedLines.map((item) => ({
    ingredient_id: item.ingredient_id,
    entry_unit_id: item.entry_unit_id,
    quantity: Number(item.quantity),
  })),
  p_submit: false,
  p_idempotency_key: randomUUID(),
});
if (copyError) throw copyError;
const newDraftId = copied.request_id ?? copied.id;
if (!newDraftId) throw new Error(`no draft id: ${JSON.stringify(copied)}`);
if (newDraftId === rejectedRequestId) {
  throw new Error("copy reused rejected voucher id");
}

const { data: newDraft } = await service
  .from("stock_requests")
  .select("id, request_number, status, notes")
  .eq("id", newDraftId)
  .single();
const { data: newItems } = await service
  .from("stock_request_items")
  .select("ingredient_id, entry_unit_id, quantity, status")
  .eq("request_id", newDraftId);

if (newDraft?.status !== "draft") {
  throw new Error(`expected draft, got ${newDraft?.status}`);
}
if (!newItems?.length) throw new Error("copied draft has no lines");
const copiedQty = Number(newItems[0].quantity);
if (copiedQty !== QTY || newItems[0].ingredient_id !== INGREDIENT_ID) {
  throw new Error(`copied lines mismatch: ${JSON.stringify(newItems)}`);
}

// Rejected source must remain terminal (not revived).
const { data: sourceStill } = await service
  .from("stock_requests")
  .select("id, status")
  .eq("id", rejectedRequestId)
  .single();
const { data: sourceItemsStill } = await service
  .from("stock_request_items")
  .select("status")
  .eq("request_id", rejectedRequestId);
if (!(sourceItemsStill ?? []).every((item) => item.status === "rejected")) {
  throw new Error("rejected source lines changed after copy");
}

// Cleanup: cancel the new draft so we leave no open QA request.
const { error: cancelError } = await bm.rpc("cancel_stock_request", {
  p_request_id: newDraftId,
  p_reason: `${MARKER} cancel copied draft after smoke`,
});
if (cancelError) throw cancelError;

const summary = {
  marker: MARKER,
  rejected: {
    id: rejectedRequestId,
    number: afterReject.request_number,
    status: sourceStill.status,
    rejectResult: rejected,
    lines: afterItems,
  },
  copiedDraft: {
    id: newDraftId,
    number: newDraft.request_number,
    statusBeforeCancel: "draft",
    lines: newItems,
    copyHref: `/br/${BRANCH_ID}/stock/requests/new?copyFromId=${rejectedRequestId}`,
  },
};
console.log(JSON.stringify(summary, null, 2));
