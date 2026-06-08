import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

// The granular append-routing migration was squashed into the lean baseline,
// which expresses the kitchen-batch model in regenerated form. Assert the
// durable invariants of the baseline's route_order_to_kds.
const baselinePath = "supabase/migrations/00000000000000_baseline.sql";

test("KDS routing is batch-aware and gated on visibly-open tickets", () => {
  const src = read(baselinePath);

  assert.match(
    src,
    /CREATE (OR REPLACE )?FUNCTION public\.route_order_to_kds/,
    "baseline must define KDS routing",
  );
  assert.match(
    src,
    /kitchen_send_batches/,
    "KDS routing must persist kitchen send batches",
  );
  assert.match(
    src,
    /kt\.status IN \('pending', 'preparing'\)/,
    "only visibly open KDS work should keep an existing batch open",
  );
  assert.match(
    src,
    /kitchen_send_count = kitchen_send_count \+ 1/,
    "new sends must advance the order's kitchen_send_count",
  );
});
