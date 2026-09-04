import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readSql(repoRoot, path);
}

function readWeb(path: string): string {
  return readSql(webRoot, path);
}

test("promotions migration writes existing discount columns via SECURITY DEFINER RPCs", () => {
  const migration = readRepo(
    "supabase/migrations/20260813235300_promotions_and_voucher_codes.sql",
  );
  const rotation = readRepo(
    "supabase/migrations/20260814021821_upsert_promotion_reusable_code_rotation.sql",
  );
  const freeSide = readRepo(
    "supabase/migrations/20260814114800_promotion_free_side.sql",
  );

  assertSqlMatch(migration, /CREATE TABLE public\.promotions/);
  assertSqlMatch(migration, /CREATE TABLE public\.promotion_codes/);
  assertSqlMatch(migration, /CREATE TABLE public\.promotion_redemptions/);
  assertSqlMatch(migration, /ADD COLUMN promotion_id/);
  assertSqlMatch(migration, /ADD COLUMN promotion_code_id/);

  for (const fn of [
    "upsert_promotion",
    "apply_promotion_code",
    "clear_promotion",
    "preview_promotion_code",
    "evaluate_order_promotions",
    "issue_promotion_codes",
    "void_promotion_code",
  ]) {
    assertSqlMatch(migration,
      new RegExp(`CREATE FUNCTION public\\.${fn}\\(`),
      fn,
    );
    assertSqlMatch(migration,
      new RegExp(
        `CREATE FUNCTION public\\.${fn}\\([\\s\\S]*?SECURITY DEFINER`,
      ),
      `${fn} SECURITY DEFINER`,
    );
    assertSqlMatch(migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\) TO authenticated, service_role`,
      ),
      `${fn} grant`,
    );
  }

  assertSqlMatch(migration, /has_permission\(v_order\.branch_id, 'pos:apply_discount'\)/);
  assertSqlMatch(migration, /has_permission\(v_order\.branch_id, 'pos:use'\)/);
  assertSqlMatch(migration, /CREATE POLICY promotions_select/);
  assertSqlMatch(migration, /has_permission\(NULL::bigint, 'promo:read'\)/);
  assertSqlNotMatch(migration, /GRANT INSERT ON TABLE public\.promotions TO authenticated/);

  assertSqlMatch(rotation, /CREATE OR REPLACE FUNCTION public\.upsert_promotion\(/);
  assertSqlMatch(rotation, /promotion_reusable_code_required/);
  assertSqlMatch(rotation, /replaced_by_code_rotation/);
  assertSqlMatch(rotation, /code <> v_code/);

  assertSqlMatch(freeSide, /free_side/);
  assertSqlMatch(freeSide, /apply_free_side_selection/);
  assertSqlMatch(freeSide, /promotion_free_side_candidates/);
  assertSqlMatch(freeSide, /needs_side_selection/);
  assertSqlMatch(freeSide, /allow_code/);
  assertSqlMatch(freeSide, /allow_auto/);

  const perMain = readRepo(
    "supabase/migrations/20260814135200_promotion_free_side_per_main_qty.sql",
  );
  assertSqlMatch(perMain, /promotion_free_side_total_need/);
  assertSqlMatch(perMain, /promotion_free_side_auto_selections/);
  assertSqlMatch(perMain, /line_need/);
  assertSqlMatch(perMain, /needs_side_selection/);
  assertSqlMatch(perMain, /per qualifying main unit/);

  const recalc = readRepo(
    "supabase/migrations/20260814164500_promotion_free_side_recalc_on_evaluate.sql",
  );
  assertSqlMatch(recalc, /promotion_free_side_applied_amount/);
  assertSqlMatch(recalc, /Tính lại miễn phí ăn kèm/);
  assertSqlMatch(recalc, /'code', v_code/);

  const freeItem = readRepo(
    "supabase/migrations/20260818164309_promotion_free_item.sql",
  );
  assertSqlMatch(freeItem, /kind = 'free_item'/);
  assertSqlMatch(freeItem, /free_item_qty/);
  assertSqlMatch(freeItem, /apply_free_item_selection/);
  assertSqlMatch(freeItem, /promotion_free_item_candidates/);
  assertSqlMatch(freeItem, /promotion_item_selection_required/);
  assertSqlMatch(freeItem, /allow_auto IS NOT TRUE/);
  assertSqlMatch(freeItem, /Tính lại món tặng/);

  const freeItemStaffQty = readRepo(
    "supabase/migrations/20260818211203_promotion_free_item_staff_qty.sql",
  );
  assertSqlMatch(freeItemStaffQty,
    /free_item_qty IS NULL OR free_item_qty >= 1/,
  );
  assertSqlMatch(freeItemStaffQty, /needs_side_selection', true/);
  assertSqlMatch(freeItemStaffQty, /jsonb_array_length[\s\S]*>= 1/);
  assertSqlMatch(freeItemStaffQty,
    /v_sum_units < 1 OR v_sum_units > v_quota/,
  );
  assertSqlMatch(freeItemStaffQty,
    /p_free_item_qty IS NOT NULL AND p_free_item_qty < 1/,
  );

  const freeItemNullQty = readRepo(
    "supabase/migrations/20260819125825_promotion_free_item_null_qty_candidates.sql",
  );
  assertSqlMatch(freeItemNullQty, /CREATE OR REPLACE FUNCTION public\.promotion_free_item_candidates\(/);
  assertSqlNotMatch(freeItemNullQty,
    /COALESCE\(p_promo\.free_item_qty, 0\) < 1/,
  );
});

test("promotions ACL is Owner-only with promo keys", () => {
  const acl = readRepo("packages/shared/src/auth/module-acl.ts");
  const permissions = readRepo("packages/shared/src/auth/permissions.ts");
  const nav = readRepo("packages/shared/src/auth/nav-config.ts");

  assert.match(
    acl,
    /promotions: \{\s*path: "\/promotions",\s*allowedRoles: \["owner"\]/,
  );
  assert.match(permissions, /PROMO_READ: "promo:read"/);
  assert.match(permissions, /PROMO_WRITE: "promo:write"/);
  assert.match(permissions, /PROMO_ISSUE: "promo:issue"/);
  assert.match(nav, /moduleKey: "promotions"/);
});

test("Owner promotions LIST/DOC and POS Mã giảm surfaces exist", () => {
  for (const path of [
    "apps/web/app/(protected)/promotions/page.tsx",
    "apps/web/app/(protected)/promotions/new/page.tsx",
    "apps/web/app/(protected)/promotions/[id]/page.tsx",
    "apps/web/lib/promotions/kinds.ts",
    "docs/plan/adr/0039-promotions-and-voucher-codes.md",
    "docs/modules/promotions.md",
  ]) {
    assert.equal(existsSync(resolve(repoRoot, path)), true, path);
  }

  const list = readWeb("app/(protected)/promotions/page.tsx");
  assert.match(list, /AppPage width="xwide" density="compact"/);
  assert.match(list, /ResponsiveActionButton/);
  assert.match(list, /PromotionsListClient/);

  const listClient = readWeb(
    "app/(protected)/promotions/promotions-list-client.tsx",
  );
  assert.match(listClient, /<AppListFrame/);
  assert.match(listClient, /domain="promotion"/);
  assert.match(listClient, /renderRowContextMenu/);
  assert.match(listClient, /RowActionsContextMenuItems/);
  assert.match(listClient, /PromotionMobileCard/);

  const formPage = readWeb("app/(protected)/promotions/new/page.tsx");
  assert.match(formPage, /PromotionForm/);
  assert.doesNotMatch(formPage, /AppPage width/);

  const form = readWeb("app/(protected)/promotions/promotion-form.tsx");
  assert.match(form, /DocumentFormFrame/);
  assert.match(form, /footer=\{/);
  assert.match(form, /AppSection/);
  assert.match(form, /kindConfigSection/);
  assert.match(form, /freeSideQty/);
  assert.match(form, /freeItemQty/);
  assert.match(form, /freeItemQtyHint/);
  assert.match(form, /buyItemIds/);
  assert.match(form, /getItemIds/);
  assert.match(form, /BusinessDateField/);
  assert.match(form, /ReasonConfirmDialog/);
  assert.match(form, /PROMOTIONS_VI\.codeRequired/);
  assert.match(form, /superRefine/);
  assert.doesNotMatch(form, /datetime-local/);
  assert.doesNotMatch(form, /type="date"/);

  const ownerActions = readWeb("app/(protected)/promotions/actions.ts");
  assert.match(ownerActions, /superRefine/);
  assert.match(ownerActions, /reusableCode/);

  const messages = readRepo("packages/shared/src/messages/promotions.ts");
  assert.match(messages, /codeRequired:/);
  assert.match(messages, /kindFreeSide:/);
  assert.match(messages, /kindFreeItem:/);
  assert.match(messages, /posOfferChip:/);
  assert.match(messages, /posPickSidesTitle:/);
  assert.match(messages, /posPickItemsTitle:/);
  assert.match(messages, /posFreeItemQtyGroup:/);
  assert.match(messages, /freeItemQtyHint:/);

  const kinds = readWeb("lib/promotions/kinds.ts");
  assert.match(kinds, /"free_side"/);
  assert.match(kinds, /"free_item"/);

  const rpcErrors = readWeb("lib/promotions/rpc-errors.ts");
  assert.match(rpcErrors, /promotion_reusable_code_required/);
  assert.match(rpcErrors, /promotion_side_selection_required/);
  assert.match(rpcErrors, /promotion_item_selection_required/);

  const statusBadge = readWeb("app/components/status-badge.tsx");
  assert.match(statusBadge, /promotion:/);
  assert.match(statusBadge, /"promotion-code"/);

  const sheet = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
  );
  assert.match(sheet, /PROMOTIONS_VI\.posCodeTab/);
  assert.match(sheet, /POS_VI\.discountTitle/);
  assert.match(sheet, /needsSideSelection/);
  assert.match(sheet, /amountHint/);
  assert.match(sheet, /autoPreviewAmount/);
  assert.match(sheet, /posAutoFreeSideHint/);
  assert.match(sheet, /resolvedCode/);
  assert.match(sheet, /posPickSidesTitle/);
  assert.match(sheet, /posPickItemsTitle/);
  assert.match(sheet, /posAutoFreeItemHint/);
  assert.match(sheet, /handleSetFreeItemUnits/);
  assert.match(sheet, /selectedUnitsTotal >= 1/);
  assert.match(sheet, /size="icon-touch"/);
  assert.match(sheet, /initialOffer/);
  assert.match(sheet, /onApplyFreeSide/);
  assert.match(sheet, /Item[\s\S]*variant="outline"/);
  assert.doesNotMatch(
    sheet,
    /className="flex items-start gap-3 rounded-md border/,
  );
  const promoCodeInput =
    /id="promo-code-input"[\s\S]*?\/>/.exec(sheet)?.[0] ?? "";
  assert.match(promoCodeInput, /controlSize="touch"/);
  assert.match(promoCodeInput, /className="font-mono"/);
  assert.doesNotMatch(promoCodeInput, /uppercase/);
  assert.doesNotMatch(promoCodeInput, /autoCapitalize/);
  assert.doesNotMatch(
    promoCodeInput,
    /setCodeText\(event\.target\.value\.toUpperCase\(\)\)/,
  );
  assert.match(sheet, /codeText\.trim\(\)\.toUpperCase\(\)/);
  assert.match(sheet, /kind: promo\.initialOffer\.kind \?\? "free_side"/);

  const detailSheet = readWeb(
    "app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
  );
  const inlinePlaceholderAt = detailSheet.indexOf(
    "PROMOTIONS_VI.inlinePromoPlaceholder",
  );
  const inlineInputStart = detailSheet.lastIndexOf("<Input", inlinePlaceholderAt);
  const inlineInputEnd = detailSheet.indexOf("/>", inlinePlaceholderAt);
  const inlinePromoInput = detailSheet.slice(
    inlineInputStart,
    inlineInputEnd + 2,
  );
  assert.match(inlinePromoInput, /controlSize="touch"/);
  assert.match(inlinePromoInput, /className=\{cn\(/);
  assert.doesNotMatch(inlinePromoInput, /uppercase/);
  assert.doesNotMatch(inlinePromoInput, /autoCapitalize/);
  assert.doesNotMatch(inlinePromoInput, /text-sm/);
  assert.match(inlinePromoInput, /inputMode="text"/);
  assert.match(detailSheet, /handleInlinePromoSubmit/);
  assert.match(
    detailSheet,
    /previewPromotionCode[\s\S]*needsSideSelection[\s\S]*setShowDiscount\(true\)/,
  );
  assert.match(detailSheet, /inlinePromoCode\.trim\(\)\.toUpperCase\(\)/);
  assert.match(sheet, /wasOpenRef/);
  assert.match(sheet, /if \(wasOpenRef\.current\) return;/);
  assert.match(sheet, /modesKey/);

  const actions = readWeb(
    "app/(protected)/br/[branchId]/pos/discount-actions.ts",
  );
  assert.match(actions, /PERMISSION_KEYS\.POS_APPLY_DISCOUNT/);
  assert.match(actions, /apply_promotion_code/);
  assert.match(actions, /apply_free_side_selection/);
  assert.match(actions, /p_side_selections/);
  assert.match(actions, /needsSideSelection/);
  assert.match(actions, /needs_side_selection/);
  assert.match(actions, /evaluateOrderPromotionOffers/);
  assert.match(actions, /clear_promotion/);
  assert.match(actions, /preview_promotion_code/);
  assert.doesNotMatch(actions, /error:\s*error\.message/);

  const evaluateOrder = readWeb("lib/promotions/evaluate-order.ts");
  assert.match(evaluateOrder, /parseFreeSideOffers/);
  assert.match(evaluateOrder, /needs_side_selection/);
  assert.match(evaluateOrder, /code:/);
  assert.match(
    evaluateOrder,
    /evaluateOrderPromotionsQuiet[\s\S]*offers:/,
  );

  const archetypes = readRepo("scripts/page-archetypes.mjs");
  assert.match(archetypes, /promotions\/page\.tsx": "LIST"/);
  assert.match(archetypes, /promotions\/new\/page\.tsx": "DOC-WORKFLOW"/);
  assert.match(archetypes, /promotions\/\[id\]\/page\.tsx": "DOC-WORKFLOW"/);

  const glossary = readRepo("docs/ref/glossary.md");
  assert.match(glossary, /`promotion` \| Khuyến mãi/);
  assert.match(glossary, /`free_item` \| Tặng món trên đơn/);
  assert.match(glossary, /`promo_code` \| Mã khuyến mãi \| .*QR gọi món/);
  assert.match(glossary, /`voucher_code` \| Mã voucher/);
});

test("POS evaluate runs on cart change and before pay", () => {
  const lifecycle = readWeb(
    "app/(protected)/br/[branchId]/pos/order-lifecycle.ts",
  );
  const payment = readWeb(
    "app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const detail = readWeb(
    "app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
  );

  assert.match(lifecycle, /evaluateOrderPromotionsQuiet/);
  assert.match(payment, /evaluateOrderPromotionsBlocking/);
  assert.match(detail, /PROMOTIONS_VI\.posPromoChip/);
  assert.match(detail, /PROMOTIONS_VI\.posOfferChip/);
  assert.match(detail, /evaluateOrderPromotionOffers/);
  assert.match(detail, /canApplyDiscount/);
});

test("voucher lifecycle hardening migration releases codes on cancel_order and void_order_item", () => {
  const hardening = readRepo(
    "supabase/migrations/20260827011500_promotion_voucher_lifecycle_hardening.sql",
  );
  assertSqlMatch(hardening, /CREATE OR REPLACE FUNCTION public\.cancel_order\(/);
  assertSqlMatch(hardening, /v_order\.promotion_code_id IS NOT NULL/);
  assertSqlMatch(hardening, /status = 'active'/);
  assertSqlMatch(hardening, /redeemed_count = GREATEST\(redeemed_count - 1, 0\)/);
  assertSqlMatch(hardening, /status = 'cleared'/);
  assertSqlMatch(hardening, /CREATE OR REPLACE FUNCTION public\.void_order_item\(/);
  assertSqlMatch(hardening, /v_all_cancelled/);

  const actions = readWeb(
    "app/(protected)/br/[branchId]/pos/discount-actions.ts",
  );
  assert.match(actions, /applyFreeItemSelection/);
  assert.match(actions, /apply_free_item_selection/);
});

test("evaluate_order_promotions rechecks min_subtotal for order-level campaigns", () => {
  const baseline = readRepo("supabase/migrations/20260902162918_baseline.sql");
  const start = sqlIndexOf(baseline, 
    "CREATE FUNCTION public.evaluate_order_promotions(p_order_id bigint)",
  );
  const end = sqlIndexOf(baseline, 
    "CREATE FUNCTION public.expire_stuck_print_jobs",
    start,
  );
  const baselineFn = baseline.slice(start, end);
  const orderLevelReturn = baselineFn.indexOf(
    "IF v_promo.kind IN ('order_pct', 'order_vnd', 'voucher_face') THEN",
  );
  const eligibility = baselineFn.indexOf("promotion_is_eligible(");
  assert.ok(orderLevelReturn >= 0, "baseline still short-circuits order-level campaigns");
  assert.ok(
    eligibility > orderLevelReturn,
    "baseline checks eligibility only after the order-level return",
  );

  const forward = readRepo(
    "supabase/migrations/20260903025327_enhance_promotion_lifecycle_and_cart_invariants.sql",
  );
  assertSqlMatch(forward,
    /IF NOT public\.promotion_is_eligible\([\s\S]*?ELSIF v_promo\.kind IN \('order_pct', 'order_vnd', 'voucher_face'\) THEN/,
  );
  assertSqlMatch(forward, /Khuyến mãi hết điều kiện/);
  assertSqlMatch(forward, /total_discount_amount/);
  assertSqlNotMatch(forward, /apply_gift_promotion_selection/);
  assertSqlNotMatch(forward, /merge_orders_auto_clear_promo/);
  assertSqlNotMatch(forward, /is_promo_gift/);
});

test("promo gift picker, merge release, and branch incident migration and wiring exist", () => {
  const giftMigration = readRepo(
    "supabase/migrations/20260904094819_promo_gift_picker_merge_release_and_branch_incident.sql",
  );
  assertSqlMatch(giftMigration, /CREATE OR REPLACE FUNCTION public\.apply_gift_promotion_selection/);
  assertSqlMatch(giftMigration, /CREATE OR REPLACE FUNCTION public\.merge_orders_auto_clear_promo/);
  assertSqlMatch(giftMigration, /CREATE OR REPLACE FUNCTION public\.create_branch_incident_task/);
  assertSqlMatch(giftMigration, /GRANT EXECUTE ON FUNCTION public\.apply_gift_promotion_selection/);
  assertSqlMatch(giftMigration, /GRANT EXECUTE ON FUNCTION public\.merge_orders_auto_clear_promo/);
  assertSqlMatch(giftMigration, /GRANT EXECUTE ON FUNCTION public\.create_branch_incident_task/);

  const actions = readWeb(
    "app/(protected)/br/[branchId]/pos/discount-actions.ts",
  );
  assert.match(actions, /apply_gift_promotion_selection/);
  assert.match(actions, /merge_orders_auto_clear_promo/);
  assert.match(actions, /listAvailablePromotions/);
  assert.match(actions, /applyGiftPromotionSelection/);

  const sheet = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
  );
  assert.match(sheet, /availablePromos/);
  assert.match(sheet, /giftItems/);
  assert.match(sheet, /onApplyGiftItem/);

  const orderDetail = readWeb(
    "app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
  );
  assert.match(orderDetail, /listAvailablePromotions/);
  assert.match(orderDetail, /applyGiftPromotionSelection/);
  assert.match(orderDetail, /releasePromoIfPresent/);

  const incidentActions = readWeb(
    "app/(protected)/br/[branchId]/_lib/incident-actions.ts",
  );
  assert.match(incidentActions, /create_branch_incident_task/);
  assert.match(incidentActions, /createBranchIncidentAction/);

  const incidentDialog = readWeb(
    "app/(protected)/br/[branchId]/_components/branch-incident-dialog.tsx",
  );
  assert.match(incidentDialog, /BranchIncidentDialog/);
  assert.match(incidentDialog, /createBranchIncidentAction/);

  const workBoard = readWeb(
    "app/(protected)/work/_components/work-board.tsx",
  );
  assert.match(workBoard, /incidentBadge/);
});
