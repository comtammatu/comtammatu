import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/_archive/20260706100000_drop_dead_refund_restore.sql",
  ),
  "utf8",
);

function sqlFunction(name: string, markerEnd: RegExp | string): string {
  const startPattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`,
  );
  const startMatch = startPattern.exec(migration);
  if (!startMatch) return "";
  const rest = migration.slice(startMatch.index);
  const endMatch =
    typeof markerEnd === "string"
      ? rest.indexOf(markerEnd)
      : rest.search(markerEnd);
  if (endMatch < 0) return rest;
  return rest.slice(
    0,
    endMatch + (typeof markerEnd === "string" ? markerEnd.length : 0),
  );
}

test("refund_paid_order no longer references the dead restore path", () => {
  const fn = sqlFunction("refund_paid_order", "\n$$;");

  assert.notEqual(fn, "");
  assert.doesNotMatch(fn, /restore_stock_for_order/);
  assert.doesNotMatch(fn, /stock_consumed_status\s*=\s*'ok'/);
});

test("refund_paid_order preserves the refund insert, invoice leg, and order cancel", () => {
  const fn = sqlFunction("refund_paid_order", "\n$$;");

  assert.match(fn, /INSERT INTO public\.refunds/);
  assert.match(
    fn,
    /UPDATE public\.tax_invoices\s*\n\s*SET status = 'cancelled'/,
  );
  assert.match(
    fn,
    /UPDATE public\.orders\s*\n\s*SET status = 'cancelled', updated_at = now\(\)\s*\n\s*WHERE id = p_order_id;/,
  );
  assert.match(
    fn,
    /UPDATE public\.payments\s*\n\s*SET status = 'refunded', updated_at = now\(\)/,
  );
});

test("reverse_payment_and_post no longer references the dead restore path", () => {
  const fn = sqlFunction("reverse_payment_and_post", "\n$$;");

  assert.notEqual(fn, "");
  assert.doesNotMatch(fn, /restore_stock_for_order/);
  assert.doesNotMatch(fn, /stock_consumed_status\s*=\s*'ok'/);
});

test("reverse_payment_and_post preserves the refund/payment/order mutations", () => {
  const fn = sqlFunction("reverse_payment_and_post", "\n$$;");

  assert.match(fn, /INSERT INTO public\.refunds|UPDATE public\.refunds/);
  assert.match(
    fn,
    /UPDATE public\.payments\s+SET status = 'refunded'/,
  );
  assert.match(
    fn,
    /SELECT id, tenant_id, branch_id, payment_status\s+INTO v_order\s+FROM public\.orders/,
  );
});

test("restore_stock_for_order is dropped after both callers stop referencing it", () => {
  assert.match(
    migration,
    /DROP FUNCTION public\.restore_stock_for_order\(bigint, uuid\);/,
  );
});

test("restore_stock_for_order appears only in the DROP statement (no remaining caller)", () => {
  const occurrences = migration.match(/restore_stock_for_order/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test("payments.stock_consumed_status is retained and documented as historical-only", () => {
  assert.match(
    migration,
    /COMMENT ON COLUMN public\.payments\.stock_consumed_status IS/,
  );
  assert.doesNotMatch(migration, /DROP COLUMN[\s\S]*stock_consumed_status/);
});
