import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const webRoot = process.cwd();

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(join(webRoot, path), "utf8");
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

  assert.match(migration, /CREATE TABLE public\.promotions/);
  assert.match(migration, /CREATE TABLE public\.promotion_codes/);
  assert.match(migration, /CREATE TABLE public\.promotion_redemptions/);
  assert.match(migration, /ADD COLUMN promotion_id/);
  assert.match(migration, /ADD COLUMN promotion_code_id/);

  for (const fn of [
    "upsert_promotion",
    "apply_promotion_code",
    "clear_promotion",
    "preview_promotion_code",
    "evaluate_order_promotions",
    "issue_promotion_codes",
    "void_promotion_code",
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE FUNCTION public\\.${fn}\\(`),
      fn,
    );
    assert.match(
      migration,
      new RegExp(
        `CREATE FUNCTION public\\.${fn}\\([\\s\\S]*?SECURITY DEFINER`,
      ),
      `${fn} SECURITY DEFINER`,
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\) TO authenticated, service_role`,
      ),
      `${fn} grant`,
    );
  }

  assert.match(migration, /has_permission\(v_order\.branch_id, 'pos:apply_discount'\)/);
  assert.match(migration, /has_permission\(v_order\.branch_id, 'pos:use'\)/);
  assert.match(migration, /CREATE POLICY promotions_select/);
  assert.match(migration, /has_permission\(NULL::bigint, 'promo:read'\)/);
  assert.doesNotMatch(migration, /GRANT INSERT ON TABLE public\.promotions TO authenticated/);

  assert.match(rotation, /CREATE OR REPLACE FUNCTION public\.upsert_promotion\(/);
  assert.match(rotation, /promotion_reusable_code_required/);
  assert.match(rotation, /replaced_by_code_rotation/);
  assert.match(rotation, /code <> v_code/);

  assert.match(freeSide, /free_side/);
  assert.match(freeSide, /apply_free_side_selection/);
  assert.match(freeSide, /promotion_free_side_candidates/);
  assert.match(freeSide, /needs_side_selection/);
  assert.match(freeSide, /allow_code/);
  assert.match(freeSide, /allow_auto/);

  const perMain = readRepo(
    "supabase/migrations/20260814135200_promotion_free_side_per_main_qty.sql",
  );
  assert.match(perMain, /promotion_free_side_total_need/);
  assert.match(perMain, /promotion_free_side_auto_selections/);
  assert.match(perMain, /line_need/);
  assert.match(perMain, /needs_side_selection/);
  assert.match(perMain, /per qualifying main unit/);
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
  assert.match(messages, /posOfferChip:/);
  assert.match(messages, /posPickSidesTitle:/);

  const kinds = readWeb("lib/promotions/kinds.ts");
  assert.match(kinds, /"free_side"/);

  const rpcErrors = readWeb("lib/promotions/rpc-errors.ts");
  assert.match(rpcErrors, /promotion_reusable_code_required/);
  assert.match(rpcErrors, /promotion_side_selection_required/);

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
  assert.match(sheet, /posPickSidesTitle/);
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
  assert.match(glossary, /`promo_code` \| Mã giảm/);
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
