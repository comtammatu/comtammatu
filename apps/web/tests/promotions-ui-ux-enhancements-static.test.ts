import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";

const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

test("delete_promotion RPC migration satisfies accounting lifecycle invariants", () => {
  const migrationPath = "supabase/migrations/20260905130000_delete_promotion_rpc.sql";
  assert.ok(existsSync(resolve(repoRoot, migrationPath)), "Migration file must exist");

  const sql = readRepo(migrationPath);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.delete_promotion\(/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path TO 'pg_catalog', 'public'/);
  assert.match(sql, /public\.has_permission\(NULL::bigint, 'promo:write'\)/);
  assert.match(sql, /o\.promotion_id = p_id/);
  assert.match(sql, /c\.status = 'redeemed'/);
  assert.match(sql, /status = 'ended'/);
  assert.match(sql, /DELETE FROM public\.promotion_branches/);
  assert.match(sql, /DELETE FROM public\.promotion_items/);
  assert.match(sql, /DELETE FROM public\.promotion_codes/);
  assert.match(sql, /DELETE FROM public\.promotions/);
  assert.match(sql, /GRANT ALL ON FUNCTION public\.delete_promotion\(bigint\) TO authenticated/);
});

test("promotions actions export deletePromotion Server Action", () => {
  const actionsContent = readWeb("app/(protected)/promotions/actions.ts");
  assert.match(actionsContent, /export const deletePromotion = withAction\(/);
  assert.match(actionsContent, /permission: PERMISSION_KEYS\.PROMO_WRITE/);
  assert.match(actionsContent, /rpc.*"delete_promotion"/);
  assert.match(actionsContent, /revalidateSurfacePath\("\/promotions"\)/);
});

test("PromotionQuickViewSheet component provides complete inspection without opening edit page", () => {
  const sheetContent = readWeb("app/(protected)/promotions/promotion-quick-view-sheet.tsx");
  assert.match(sheetContent, /export function PromotionQuickViewSheet\(/);
  assert.match(sheetContent, /AppSheet/);
  assert.match(sheetContent, /StatusBadge/);
  assert.match(sheetContent, /onStatusChange/);
  assert.match(sheetContent, /onDelete/);
  assert.match(sheetContent, /PROMOTIONS_VI\.rulesTitle/);
  assert.match(sheetContent, /PROMOTIONS_VI\.targetBranchesTitle/);
  assert.match(sheetContent, /PROMOTIONS_VI\.codesStatsTitle/);
});

test("PromotionsListClient contains KPI row, multi-facet filters, and quick view sheet integration", () => {
  const clientContent = readWeb("app/(protected)/promotions/promotions-list-client.tsx");
  assert.match(clientContent, /<KpiRow/);
  assert.match(clientContent, /<KpiCard/);
  assert.match(clientContent, /PROMOTIONS_VI\.statActive/);
  assert.match(clientContent, /PROMOTIONS_VI\.statPausedOrDraft/);
  assert.match(clientContent, /PROMOTIONS_VI\.statTotalCodes/);
  assert.match(clientContent, /PROMOTIONS_VI\.statRedeemedCodes/);
  assert.match(clientContent, /kindFilter/);
  assert.match(clientContent, /branchFilter/);
  assert.match(clientContent, /<PromotionQuickViewSheet/);
  assert.match(clientContent, /deletePromotion/);
  assert.match(clientContent, /PROMOTIONS_VI\.deleteConfirmTitle/);
});

test("PromotionForm includes 1-touch presets, live mockup preview, header quick toggle, and codes search/filter", () => {
  const formContent = readWeb("app/(protected)/promotions/promotion-form.tsx");
  assert.match(formContent, /applyPreset\("happy_hour"\)/);
  assert.match(formContent, /applyPreset\("order_vnd"\)/);
  assert.match(formContent, /applyPreset\("bxgy"\)/);
  assert.match(formContent, /applyPreset\("free_side"\)/);
  assert.match(formContent, /<PromotionLiveMockup/);
  assert.match(formContent, /handleQuickToggleStatus/);
  assert.match(formContent, /handleHeaderDelete/);
  assert.match(formContent, /codeSearch/);
  assert.match(formContent, /codeStatusFilter/);
  assert.match(formContent, /PROMOTIONS_VI\.searchCodesPlaceholder/);
});

test("Vietnamese copy keys for promotions UI/UX enhancements exist and are well-formed", () => {
  assert.ok(PROMOTIONS_VI.statActive);
  assert.ok(PROMOTIONS_VI.statPausedOrDraft);
  assert.ok(PROMOTIONS_VI.statTotalCodes);
  assert.ok(PROMOTIONS_VI.statRedeemedCodes);
  assert.ok(PROMOTIONS_VI.filterBranch);
  assert.ok(PROMOTIONS_VI.filterKind);
  assert.ok(PROMOTIONS_VI.quickViewTitle);
  assert.ok(PROMOTIONS_VI.presetsTitle);
  assert.ok(PROMOTIONS_VI.presetHappyHourTitle);
  assert.ok(PROMOTIONS_VI.deleteConfirmTitle);
  assert.ok(PROMOTIONS_VI.searchCodesPlaceholder);
});
