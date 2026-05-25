import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("append routing reuses an open kitchen batch before minting a new PB", () => {
  const src = read(
    "supabase/migrations/20260601900000_reuse_open_kitchen_batch_for_append.sql",
  );

  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.route_order_to_kds/,
    "migration must override KDS routing",
  );
  assert.match(
    src,
    /kt\.status IN \('pending', 'preparing'\)/,
    "only visibly open KDS work should keep an existing PB open",
  );
  assert.match(
    src,
    /IF v_open_batch_id IS NOT NULL THEN[\s\S]*v_batch_id := v_open_batch_id[\s\S]*ELSE[\s\S]*SET kitchen_send_count = kitchen_send_count \+ 1/,
    "open batches must be reused before incrementing kitchen_send_count",
  );
});

test("kitchen print idempotency allows later append notices on a reused PB", () => {
  const src = read(
    "supabase/migrations/20260601900000_reuse_open_kitchen_batch_for_append.sql",
  );

  assert.match(
    src,
    /array_agg\(oi\.id ORDER BY oi\.id\) AS item_ids/,
    "print routing must carry the unsent item ids",
  );
  assert.match(
    src,
    /':batch:' \|\| v_route\.batch_id::TEXT[\s\S]*':items:' \|\| md5\(array_to_string\(v_route\.item_ids, ','\)\)/,
    "print idempotency must include item ids, not only the reused batch id",
  );
  assert.match(
    src,
    /batch_has_sent_items[\s\S]*WHEN v_route\.batch_has_sent_items THEN 'append'/,
    "a later print for the same PB must render as an append notice",
  );
  assert.doesNotMatch(
    src,
    /UPDATE public\.kitchen_send_batches[\s\S]*kind\s*=/,
    "print-only append labeling must not mutate the persisted batch kind",
  );
});
