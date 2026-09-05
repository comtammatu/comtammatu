import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  extractSqlFunction,
  readActiveMigrationSql,
  readSql,
  assertSqlMatch,
  assertSqlNotMatch,
} from "./_lib/active-sql.ts";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readSql(repoRoot, path);
}

test("cart invariant migration enforces auto-revoke on void, reduce, and edit item mutations", () => {
  const migrationPath =
    "supabase/migrations/20260905105000_cart_invariant_auto_revoke_promotions.sql";
  assert.ok(
    existsSync(resolve(repoRoot, migrationPath)),
    `Migration ${migrationPath} must exist`,
  );

  const migrationSql = readRepo(migrationPath);
  const activeSql = readActiveMigrationSql(repoRoot);

  // 1. apply_gift_promotion_selection must insert into 'note', never 'notes'
  assertSqlMatch(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\.apply_gift_promotion_selection/,
  );
  assertSqlMatch(
    migrationSql,
    /\bnote,\s*modifiers,\s*sides,\s*created_at/,
    "apply_gift_promotion_selection must insert into note column, not notes",
  );
  assertSqlNotMatch(
    migrationSql,
    /\bnotes,\s*modifiers/,
    "apply_gift_promotion_selection must not reference non-existent notes column",
  );

  // 2. void_order_item must check promotion eligibility and auto-revoke if subtotal violates min_subtotal
  assertSqlMatch(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\.void_order_item/,
  );
  const voidBody = extractSqlFunction(activeSql, "void_order_item");
  assertSqlMatch(
    voidBody,
    /v_order\.promotion_id IS NOT NULL/,
    "void_order_item must check for active promotion on the order",
  );
  assertSqlMatch(
    voidBody,
    /promotion_is_eligible\(/,
    "void_order_item must verify promotion eligibility with new subtotal",
  );
  assertSqlMatch(
    voidBody,
    /clear_promotion\(/,
    "void_order_item must call clear_promotion if promotion is no longer eligible",
  );

  // 3. reduce_order_item_quantity must check promotion eligibility and auto-revoke
  assertSqlMatch(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\.reduce_order_item_quantity/,
  );
  const reduceBody = extractSqlFunction(activeSql, "reduce_order_item_quantity");
  assertSqlMatch(
    reduceBody,
    /v_order\.promotion_id IS NOT NULL/,
    "reduce_order_item_quantity must check for active promotion on the order",
  );
  assertSqlMatch(
    reduceBody,
    /promotion_is_eligible\(/,
    "reduce_order_item_quantity must verify promotion eligibility with new subtotal",
  );
  assertSqlMatch(
    reduceBody,
    /clear_promotion\(/,
    "reduce_order_item_quantity must call clear_promotion if promotion is no longer eligible",
  );

  // 4. edit_pending_order_item must check promotion eligibility and auto-revoke
  assertSqlMatch(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\.edit_pending_order_item/,
  );
  const editBody = extractSqlFunction(activeSql, "edit_pending_order_item");
  assertSqlMatch(
    editBody,
    /FROM public\.menu_item_variants/,
    "edit_pending_order_item must use the canonical menu_item_variants table",
  );
  assertSqlNotMatch(
    editBody,
    /public\.menu_variants/,
    "edit_pending_order_item must not reference the retired menu_variants table",
  );
  assertSqlMatch(
    editBody,
    /pos_resolve_item_list_price\(/,
    "edit_pending_order_item must preserve channel-aware list pricing",
  );
  assertSqlMatch(
    editBody,
    /pos_order_modifier_sum\(/,
    "edit_pending_order_item must preserve canonical modifier pricing",
  );
  assertSqlMatch(
    editBody,
    /SELECT sides_sum, enriched_sides[\s\S]*FROM public\.pos_enrich_order_sides/,
    "edit_pending_order_item must read the canonical side enrichment result",
  );
  assertSqlMatch(
    editBody,
    /v_order\.promotion_id IS NOT NULL/,
    "edit_pending_order_item must check for active promotion on the order",
  );
  assertSqlMatch(
    editBody,
    /promotion_is_eligible\(/,
    "edit_pending_order_item must verify promotion eligibility with new subtotal",
  );
  assertSqlMatch(
    editBody,
    /clear_promotion\(/,
    "edit_pending_order_item must call clear_promotion if promotion is no longer eligible",
  );

  // 5. Dynamic promotion kinds (bxgy, free_side, free_item, auto_order) re-evaluated via evaluate_order_promotions
  for (const fn of [voidBody, reduceBody, editBody]) {
    assertSqlMatch(
      fn,
      /evaluate_order_promotions\(/,
      "item mutations must re-evaluate dynamic promotions if still eligible",
    );
  }
});
