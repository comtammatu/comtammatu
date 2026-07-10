import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("snapshot migration returns order.items array", () => {
  const migration = readRepo(
    "supabase/migrations/20260708140000_self_order_snapshot_order_items.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_get_snapshot\(p_token text\)/,
  );
  assert.match(migration, /v_order_items jsonb := NULL/);
  assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY oi\.id\)/);
  // COALESCE wraps jsonb_agg so empty orders return '[]' instead of null.
  assert.match(migration, /COALESCE\(/);
  assert.match(migration, /'\[\]'::jsonb/);
  // Items subquery must be scoped by tenant.
  assert.match(migration, /oi\.tenant_id = v_session\.tenant_id/);
  assert.match(migration, /oi\.status <> 'cancelled'/);
  assert.match(migration, /'items', v_order_items/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.self_order_get_snapshot\(text\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.self_order_get_snapshot\(text\) TO service_role/,
  );
});

test("snapshot returns approved item customizations for self-order bill", () => {
  const migration = readRepo(
    "supabase/migrations/20260709150000_self_order_snapshot_item_customizations.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_get_snapshot\(p_token text\)/,
  );
  assert.match(
    migration,
    /'modifiers', COALESCE\(oi\.modifiers, '\[\]'::jsonb\)/,
  );
  assert.match(migration, /'sides', COALESCE\(oi\.sides, '\[\]'::jsonb\)/);
  assert.match(migration, /'note', oi\.note/);
  assert.match(migration, /oi\.tenant_id = v_session\.tenant_id/);
  assert.match(migration, /oi\.status <> 'cancelled'/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.self_order_get_snapshot\(text\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT ALL ON FUNCTION public\.self_order_get_snapshot\(text\) TO service_role/,
  );
});

test("rejecting a pending self-order batch revokes the session and blocks resubmit", () => {
  const migration = readRepo(
    "supabase/migrations/20260709064954_fix_self_order_reject_session_state.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_reject_batch\(/,
  );
  assert.match(
    migration,
    /UPDATE public\.self_order_batches[\s\S]*status = 'rejected'[\s\S]*session_id = v_batch\.session_id[\s\S]*status = 'pending_approval'/,
  );
  assert.match(
    migration,
    /UPDATE public\.self_order_sessions[\s\S]*SET status = 'revoked'[\s\S]*close_reason = COALESCE\(v_reason, 'staff_rejected'\)/,
  );
  assert.match(
    migration,
    /s\.status IN \('pending_approval', 'active', 'revoked'\)/,
  );
  assert.match(migration, /s\.token_snapshot = v_table\.self_order_token/);
  assert.match(migration, /s\.status = 'revoked'/);
  assert.match(migration, /self_order_session_revoked/);
});

test("snapshot contract validates order items before exposing them", () => {
  const contracts = readWeb("lib/self-order/contracts.ts");

  assert.match(contracts, /export interface SelfOrderOrderLine \{/);
  assert.match(contracts, /menuItemId: number;/);
  assert.match(contracts, /itemName: string;/);
  assert.match(contracts, /variantName: string \| null;/);
  assert.match(contracts, /quantity: number;/);
  assert.match(contracts, /unitPrice: number;/);
  assert.match(contracts, /lineTotal: number;/);
  assert.match(contracts, /export type SelfOrderCartModifier/);
  assert.match(contracts, /export type SelfOrderCartSide/);
  assert.match(contracts, /modifiers: SelfOrderCartModifier\[\];/);
  assert.match(contracts, /sides: SelfOrderCartSide\[\];/);
  assert.match(contracts, /note: string \| null;/);
  assert.match(contracts, /const publicSelfOrderOrderLineSchema = z/);
  assert.match(contracts, /items: z\.array\(publicSelfOrderOrderLineSchema\)/);
  assert.match(contracts, /export type PublicSelfOrderSnapshot = z\.infer</);
});

test("SELF_ORDER_VI has v2 phase1 status and CTA keys", () => {
  const messages = readRepo("packages/shared/src/messages/self-order.ts");

  assert.match(messages, /statusPendingApproval:/);
  assert.match(messages, /statusActive:/);
  assert.match(messages, /statusAwaitingVietQr:/);
  assert.match(messages, /statusAwaitingCash:/);
  assert.match(messages, /statusClosed:/);
  assert.match(messages, /statusRejected:/);
  assert.match(messages, /ctaAwaitingApproval:/);
  assert.match(messages, /ctaAwaitingApprovalHint:/);
  assert.match(messages, /ctaRejected:/);
  assert.match(messages, /ctaRejectedHint:/);
  assert.match(messages, /orderRejectedBlocked:/);
  assert.match(messages, /billTab:/);
  assert.match(messages, /orderedItemsTitle:/);
  assert.match(messages, /roundsTitle:/);
  assert.match(messages, /roundStatusRejected:/);
  assert.match(messages, /paymentDescription:/);
  assert.match(messages, /buyerDescription:/);
  assert.match(messages, /billEmptyTitle:/);
  assert.match(messages, /billEmptyDescription:/);
  assert.match(messages, /refreshFailed:/);
  assert.match(messages, /retryRefresh:/);
  assert.match(messages, /customizeItem:/);
  assert.match(messages, /closeCustomizerAria:/);
  assert.match(messages, /variantLabel:/);
  assert.match(messages, /modifierLabel:/);
  assert.match(messages, /sidesLabel:/);
  assert.match(messages, /itemNoteLabel:/);
  assert.match(messages, /decreaseQuantityAria:/);
  assert.match(messages, /increaseQuantityAria:/);
  assert.match(messages, /submitFirstBatch: "Gửi món"/);
  assert.match(
    messages,
    /refreshFailed: "Không cập nhật được, đang dùng dữ liệu cũ\."/,
  );
  assert.match(messages, /retryRefresh: "Thử lại"/);
  assert.match(messages, /statusPendingApproval: "Đã gửi món"/);
  assert.match(messages, /statusRejected: "Đã từ chối"/);
  assert.match(messages, /ctaAwaitingApproval: "Đã gửi món"/);
  assert.match(messages, /ctaRejected: "Đã từ chối"/);
  assert.doesNotMatch(messages, /submitFirstBatch: "Gửi nhân viên duyệt"/);
});

test("status-pill renders mapped SELF_ORDER_VI labels by session state", () => {
  const pill = readWeb("app/q/[token]/self-order/status-pill.tsx");

  assert.match(
    pill,
    /import \{ Badge, type BadgeProps \} from "@comtammatu\/ui\/components\/badge"/,
  );
  assert.match(pill, /SELF_ORDER_VI\.statusPendingApproval/);
  assert.match(pill, /SELF_ORDER_VI\.statusActive/);
  assert.match(pill, /SELF_ORDER_VI\.statusAwaitingVietQr/);
  assert.match(pill, /SELF_ORDER_VI\.statusAwaitingCash/);
  assert.match(pill, /SELF_ORDER_VI\.statusClosed/);
  assert.match(pill, /SELF_ORDER_VI\.statusRejected/);
  assert.match(pill, /variant: "warning"/);
  assert.match(pill, /variant: "success"/);
  assert.match(pill, /variant: "info"/);
  assert.match(pill, /variant: "destructive"/);
  assert.ok(
    pill.indexOf('order.paymentStatus === "paid"') <
      pill.indexOf('paymentRequest?.status === "vietqr_pending"'),
  );
});

test("order-summary lists guest batches as rounds with cancelled state", () => {
  const summary = readWeb("app/q/[token]/self-order/order-summary.tsx");
  const contracts = readWeb("lib/self-order/contracts.ts");
  const migration = readRepo(
    "supabase/migrations/20260709223000_self_order_snapshot_batches.sql",
  );

  assert.match(summary, /export function OrderSummary/);
  assert.match(summary, /SelfOrderGuestBatch/);
  assert.match(summary, /SELF_ORDER_VI\.roundsTitle/);
  assert.match(summary, /SELF_ORDER_VI\.roundLabel/);
  assert.match(summary, /SELF_ORDER_VI\.roundStatusRejected/);
  assert.match(summary, /line-through/);
  assert.match(summary, /BatchRound/);
  assert.match(summary, /SELF_ORDER_VI\.orderedItemsDescription/);
  assert.match(summary, /totalAmount/);
  assert.ok(
    summary.indexOf("SELF_ORDER_VI.orderedItemsTitle") <
      summary.indexOf("SELF_ORDER_VI.roundsTitle"),
  );
  assert.match(contracts, /export interface SelfOrderGuestBatch/);
  assert.match(
    contracts,
    /batches: z\.array\(publicSelfOrderBatchSchema\)\.optional\(\)/,
  );
  assert.match(migration, /'batches', COALESCE\(v_batches_payload/);
  assert.match(migration, /round_index/);
  assert.match(migration, /guest_status/);
  assert.match(migration, /orphan_pending_no_batch/);
  assert.doesNotMatch(
    migration,
    /s\.status IN \('pending_approval', 'active', 'revoked', 'closed'\)/,
  );
  assert.match(
    migration,
    /s\.status IN \('pending_approval', 'active', 'revoked'\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.self_order_submit_batch/,
  );
  assert.match(migration, /RAISE EXCEPTION 'self_order_session_revoked'/);
  assert.match(migration, /\(elem->>'menu_item_id'\) ~ '\^\[0-9\]\+\$'/);
});

test("staff approval queue renders item customizations before approving", () => {
  const actions = readWeb(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );
  const sheet = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/self-order-approval-sheet.tsx",
  );

  assert.match(
    actions,
    /import type \{ SelfOrderCartItem \} from "@lib\/self-order\/contracts"/,
  );
  assert.match(actions, /items: SelfOrderCartItem\[\];/);
  assert.match(sheet, /function batchItemOptionSummary/);
  assert.match(sheet, /item\.modifiers\.map/);
  assert.match(sheet, /item\.sides\.map/);
  assert.match(sheet, /SELF_ORDER_VI\.itemNoteLabel/);
  assert.match(sheet, /optionSummary/);
  assert.match(sheet, /break-words/);
  assert.doesNotMatch(sheet, /className="min-w-0 truncate"/);
});

test("cart-sheet has mobile sticky bottom bar, bottom Sheet, and ctaDisabled wiring", () => {
  const cart = readWeb("app/q/[token]/self-order/cart-sheet.tsx");

  assert.match(cart, /SheetContent/);
  assert.match(cart, /@comtammatu\/ui\/components\/sheet/);
  // Mobile-only sticky bar, constrained when viewed on desktop.
  assert.match(cart, /fixed inset-x-0 bottom-0/);
  assert.match(cart, /max-w-2xl/);
  assert.match(cart, /workflow-safe-pb/);
  assert.match(cart, /side="bottom"/);
  assert.match(cart, /max-h-dvh-95/);
  assert.match(cart, /max-h-dvh-80/);
  assert.match(cart, /size="touch-lg"/);
  assert.match(cart, /flex flex-col gap-2 sm:flex-row/);
  assert.match(cart, /className="w-full sm:min-w-28 sm:w-auto"/);
  assert.match(cart, /SELF_ORDER_VI\.cartTitle/);
  assert.match(cart, /SELF_ORDER_VI\.subtotal/);
  assert.match(cart, /Spinner/);
  assert.match(cart, /AlertDescription/);
  assert.match(cart, /submitError/);
  assert.match(cart, /disabled=\{disabled \|\| item\.quantity <= 1\}/);
  assert.match(
    cart,
    /editingDisabled = props\.isSubmitting \|\| props\.isEditingLocked/,
  );
  assert.match(cart, /disabled=\{editingDisabled\}/);
  assert.match(cart, /SELF_ORDER_VI\.decreaseQuantityAria/);
  assert.match(cart, /SELF_ORDER_VI\.increaseQuantityAria/);
  assert.match(cart, /formatVND/);
  assert.match(cart, /cartOptionSummary/);
  assert.match(cart, /item\.modifiers\.map/);
  assert.match(cart, /item\.sides\.map/);
  assert.match(cart, /SELF_ORDER_VI\.itemNoteLabel/);
  // ctaDisabled must flow into SubmitCta.
  assert.match(cart, /ctaDisabled/);
  assert.match(cart, /ctaDisabledHint/);
  assert.doesNotMatch(cart, /lg:hidden|lg:flex|hidden flex-col gap-3/);
});

test("menu-panel owns category tabs and menu grid with no search chrome", () => {
  const menu = readWeb("app/q/[token]/self-order/menu-panel.tsx");

  assert.match(menu, /export function MenuPanel/);
  assert.match(menu, /export function MenuItemGrid/);
  assert.match(menu, /SELF_ORDER_VI\.allCategories/);
  assert.match(menu, /AppEmptyState/);
  assert.doesNotMatch(menu, /normalizeSearch/);
  assert.doesNotMatch(menu, /InputGroup/);
  assert.doesNotMatch(menu, /IconSearch/);
  assert.doesNotMatch(menu, /searchPlaceholder|searchAria|cancelSearch/);
});

test("menu-panel opens a POS-aligned mobile Sheet for variant, modifier, side, note, and quantity", () => {
  const menu = readWeb("app/q/[token]/self-order/menu-panel.tsx");
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");

  assert.match(menu, /SheetContent/);
  assert.match(menu, /SelfOrderItemSheet/);
  assert.match(menu, /@comtammatu\/ui\/components\/sheet/);
  assert.match(menu, /SheetClose/);
  assert.match(menu, /size="icon-touch"/);
  assert.match(menu, /side="bottom"/);
  assert.match(menu, /h-dvh max-h-dvh p-0/);
  assert.match(menu, /Separator/);
  assert.match(menu, /@comtammatu\/ui\/components\/radio-group/);
  assert.match(menu, /RadioGroup/);
  assert.match(menu, /RadioGroupItem/);
  assert.match(menu, /FieldSet/);
  assert.match(menu, /FieldLegend/);
  assert.match(menu, /FieldLabel/);
  assert.match(menu, /menu_item_variants/);
  assert.match(menu, /menu_item_modifiers/);
  assert.match(menu, /menu_item_available_sides/);
  assert.match(menu, /selectedSideQuantities/);
  assert.match(menu, /SELF_ORDER_VI\.itemNoteLabel/);
  assert.match(menu, /SELF_ORDER_VI\.decreaseQuantityAria/);
  assert.match(menu, /SELF_ORDER_VI\.increaseQuantityAria/);
  assert.match(menu, /flex-col items-stretch[\s\S]*sm:flex-row/);
  assert.match(menu, /min-w-0 flex-1 sm:min-w-20 sm:flex-none/);
  assert.match(menu, /onAdd\(\{/);
  assert.match(menu, /quantity,/);
  assert.match(menu, /note: trimmedNote === "" \? undefined : trimmedNote/);
  assert.match(menu, /const wasOpenRef = useRef\(false\)/);
  assert.match(menu, /const opening = open && !wasOpenRef\.current/);
  assert.match(menu, /setSelectedVariant\(\(current\) =>/);
  assert.doesNotMatch(menu, /@comtammatu\/ui\/components\/label/);
  assert.doesNotMatch(
    menu,
    /<h3 className="font-heading text-base font-semibold"/,
  );
  assert.match(orchestrator, /function addItem\(cartItem: SelfOrderCartItem\)/);
});

test("self-order remains one responsive workflow with no desktop sidebar branch", () => {
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");
  const menu = readWeb("app/q/[token]/self-order/menu-panel.tsx");
  const cart = readWeb("app/q/[token]/self-order/cart-sheet.tsx");
  const payment = readWeb("app/q/[token]/self-order/payment-panel.tsx");

  assert.match(orchestrator, /width="narrow"/);
  assert.doesNotMatch(orchestrator, /<aside/);
  assert.doesNotMatch(menu, /hidden md:flex|<aside/);
  assert.doesNotMatch(cart, /<aside|fixed right-3 bottom-24/);
  assert.doesNotMatch(payment, /hidden md:flex|<aside/);
});

test("orchestrator locks CTA for approval/payment states and keeps cancellation staff-owned", () => {
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");

  assert.match(
    orchestrator,
    /import \{ StatusPill \} from "\.\/self-order\/status-pill"/,
  );
  assert.match(
    orchestrator,
    /import \{ SessionStatePanel \} from "\.\/self-order\/session-state-panel"/,
  );
  assert.match(
    orchestrator,
    /import \{ CartSheet \} from "\.\/self-order\/cart-sheet"/,
  );
  assert.match(
    orchestrator,
    /import \{ OrderSummary \} from "\.\/self-order\/order-summary"/,
  );
  assert.match(
    orchestrator,
    /import \{ MenuPanel \} from "\.\/self-order\/menu-panel"/,
  );
  assert.match(
    orchestrator,
    /PaymentPanel,[\s\S]*type GuestPaymentRequestState,[\s\S]*from "\.\/self-order\/payment-panel"/,
  );
  assert.match(orchestrator, /SessionStatePanel/);
  assert.doesNotMatch(
    orchestrator,
    /BrandLogoBox|BrandMark|BrandLockup|BrandMascot/,
  );
  assert.doesNotMatch(orchestrator, /brand-pattern-caro/);
  assert.match(orchestrator, /TabsContent/);
  assert.match(orchestrator, /SELF_ORDER_VI\.billTab/);
  assert.match(orchestrator, /activeMainTab/);
  assert.match(orchestrator, /value=\{activeMainTab\}/);
  assert.match(orchestrator, /flex min-h-dvh w-full flex-col gap-1/);
  assert.match(orchestrator, /min-w-0 flex-1/);
  assert.match(orchestrator, /flex flex-col gap-2 sm:flex-row/);
  assert.match(orchestrator, /flex min-w-0 items-center gap-1\.5/);
  assert.match(
    orchestrator,
    /TabsList className="h-11 w-full shrink-0 sm:w-44"/,
  );
  assert.match(orchestrator, /<AppPage\s+as="main"\s+id="main-content"/);
  assert.match(
    orchestrator,
    /previous === "pending_approval" &&\s*sessionStatus === "active"/,
  );
  assert.match(orchestrator, /activeOrder\.paymentStatus !== "paid"/);
  assert.match(
    orchestrator,
    /!isSessionActive \|\|[\s\S]*!activeOrder \|\|[\s\S]*isPaymentPending \|\|[\s\S]*activePaymentRequest/,
  );
  assert.doesNotMatch(orchestrator, /hasBillTab/);
  assert.doesNotMatch(orchestrator, /IconRefresh|RefreshCw as IconRefresh/);
  assert.match(
    orchestrator,
    /import \{ useSnapshotSync \} from "\.\/self-order\/hooks"/,
  );
  assert.match(orchestrator, /NoteCallout/);
  assert.match(orchestrator, /isRefreshing/);
  assert.match(orchestrator, /refreshError/);
  assert.match(orchestrator, /disabled=\{isRefreshing\}/);
  assert.match(orchestrator, /SELF_ORDER_VI\.retryRefresh/);
  assert.match(orchestrator, /submitError=\{submitError\}/);
  assert.doesNotMatch(orchestrator, /bottom-24 z-40/);

  assert.match(
    orchestrator,
    /ctaHardDisabled =[\s\S]*isClosed \|\|[\s\S]*isPendingApproval \|\|[\s\S]*isSessionRevoked \|\|[\s\S]*activePaymentRequest !== null/,
  );
  assert.match(orchestrator, /isSessionRevoked = sessionStatus === "revoked"/);
  assert.match(orchestrator, /SELF_ORDER_VI\.ctaRejected/);
  assert.match(orchestrator, /SELF_ORDER_VI\.ctaRejectedHint/);
  assert.match(
    orchestrator,
    /if \(cartItems\.length === 0 \|\| isPending \|\| ctaHardDisabled\) return/,
  );
  assert.match(orchestrator, /activeOrder\?\.paymentStatus === "paid"/);
  assert.match(orchestrator, /pending_payment_exists/);
  assert.match(orchestrator, /SELF_ORDER_VI\.paymentCancelStaffRequired/);
  assert.doesNotMatch(orchestrator, /cancel-pending-payment-and-add/);
  assert.match(orchestrator, /ctaDisabled=\{ctaHardDisabled\}/);
  assert.doesNotMatch(orchestrator, /isSearchActive|onSearchActiveChange/);
  assert.doesNotMatch(
    orchestrator,
    /cartItems\.length === 0 \|\| isPending \|\| paymentLocked/,
  );
  assert.doesNotMatch(
    orchestrator,
    /\.filter\(\(item\) => item\.quantity > 0\)/,
  );
});

test("self-order guest UI keeps compact session panels without mascot chrome", () => {
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");
  const sessionPanel = readWeb(
    "app/q/[token]/self-order/session-state-panel.tsx",
  );
  const page = readWeb("app/q/[token]/page.tsx");
  const payment = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const menu = readWeb("app/q/[token]/self-order/menu-panel.tsx");
  const messages = readRepo("packages/shared/src/messages/self-order.ts");

  assert.match(sessionPanel, /export function SessionStatePanel/);
  assert.match(sessionPanel, /SELF_ORDER_VI\.pendingApprovalTitle/);
  assert.match(sessionPanel, /SELF_ORDER_VI\.closedTitle/);
  assert.match(sessionPanel, /NoteCallout/);
  assert.doesNotMatch(sessionPanel, /BrandMascot|BrandLockup|BrandMark/);
  assert.doesNotMatch(sessionPanel, /@comtammatu\/ui\/components\/card/);

  assert.match(page, /SELF_ORDER_VI\.unavailableTitle/);
  assert.doesNotMatch(page, /BrandMascot|BrandLockup|brand-pattern-caro/);

  assert.doesNotMatch(payment, /BrandLockup|BrandMascot/);
  assert.match(menu, /symbol="riceBowl"/);

  assert.match(messages, /closedTitle:/);
  assert.match(messages, /viewBill:/);
  assert.match(
    orchestrator,
    /TabsList className="h-11 w-full shrink-0 sm:w-44"/,
  );
  assert.doesNotMatch(
    orchestrator,
    /BrandMascot|brand-pattern-caro|from-secondary\/30/,
  );
});

test("self-order loading and feedback reuse existing design-system primitives", () => {
  const loading = readWeb("app/q/[token]/loading.tsx");
  const hooks = readWeb("app/q/[token]/self-order/hooks.ts");
  const payment = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");

  assert.match(loading, /import \{ PageSkeleton \}/);
  assert.match(
    loading,
    /<PageSkeleton width="narrow" density="compact" mobile blocks=\{3\} \/>/,
  );

  assert.match(hooks, /SELF_ORDER_VI\.refreshFailed/);
  assert.match(hooks, /isRefreshing/);
  assert.match(hooks, /refreshError/);
  assert.match(hooks, /clearRefreshError/);
  assert.match(hooks, /catch \{/);
  assert.match(hooks, /setRefreshError\(SELF_ORDER_VI\.refreshFailed\)/);
  assert.match(hooks, /const \[terminalError, setTerminalError\]/);
  assert.match(hooks, /result\.error\.code === "not_found"/);
  assert.match(hooks, /result\.error\.code === "pos_session_closed"/);
  assert.doesNotMatch(hooks, /catch \(error\)/);

  assert.match(payment, /Spinner/);
  assert.match(payment, /<AppSection/);
  assert.match(payment, /SELF_ORDER_VI\.buyerTitle/);
  assert.match(payment, /SELF_ORDER_VI\.paymentTitle/);
  assert.match(payment, /SELF_ORDER_VI\.billEmptyTitle/);
  assert.match(payment, /SELF_ORDER_VI\.paymentDescription/);
  assert.match(payment, /SELF_ORDER_VI\.buyerDescription/);
  assert.match(payment, /id="self-order-buyer-not-get-invoice"/);
  assert.match(payment, /disabled=\{disabled \|\| isPending\}/);
  assert.match(payment, /target\?\.focus\(\)/);
  assert.match(payment, /name="buyerTaxCode"/);
  assert.match(payment, /autoComplete="off"/);
  assert.match(payment, /inputMode="numeric"/);
  assert.match(payment, /maxLength=\{14\}/);
  assert.match(orchestrator, /function normalizeTaxCodeInput/);
  assert.match(
    orchestrator,
    /digits\.slice\(0, 10\)[\s\S]*digits\.slice\(10\)/,
  );
  assert.match(payment, /IconCash data-icon="inline-start"/);
  assert.match(payment, /IconQrcode data-icon="inline-start"/);
  assert.doesNotMatch(payment, /BrandLockup|BrandMascot/);
});
