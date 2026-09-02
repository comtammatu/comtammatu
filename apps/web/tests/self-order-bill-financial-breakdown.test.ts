import assert from "node:assert/strict";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";


const migration = readSql(process.cwd(), "supabase/migrations/20260711043533_self_order_bill_financial_breakdown.sql");

test("Self-Order snapshot exposes authoritative bill totals", () => {
  assert.match(migration, /'subtotal', o\.subtotal/);
  assert.match(migration, /'serviceCharge', o\.service_charge/);
  assert.match(migration, /'discountAmount', o\.discount_amount/);
  assert.match(migration, /'totalAmount', o\.total_amount/);
});

test("Self-Order financial snapshot keeps the service-role boundary", () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path TO ''/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
});
