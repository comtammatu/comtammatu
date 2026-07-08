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

test("snapshot contract type includes order.items line type", () => {
  const contracts = readWeb("lib/self-order/contracts.ts");

  assert.match(contracts, /export interface SelfOrderOrderLine \{/);
  assert.match(contracts, /menuItemId: number;/);
  assert.match(contracts, /itemName: string;/);
  assert.match(contracts, /variantName: string \| null;/);
  assert.match(contracts, /quantity: number;/);
  assert.match(contracts, /unitPrice: number;/);
  assert.match(contracts, /lineTotal: number;/);
  assert.match(contracts, /note: string \| null;/);
  assert.match(contracts, /items: SelfOrderOrderLine\[\];/);
});

test("SELF_ORDER_VI has v2 phase1 status and CTA keys", () => {
  const messages = readRepo("packages/shared/src/messages/self-order.ts");

  assert.match(messages, /statusPendingApproval:/);
  assert.match(messages, /statusActive:/);
  assert.match(messages, /statusAwaitingVietQr:/);
  assert.match(messages, /statusAwaitingCash:/);
  assert.match(messages, /statusClosed:/);
  assert.match(messages, /ctaAwaitingApproval:/);
  assert.match(messages, /ctaAwaitingApprovalHint:/);
  assert.match(messages, /billTab:/);
  assert.match(messages, /orderedItemsTitle:/);
  assert.match(messages, /orderedItemsShowMore:/);
  assert.match(messages, /customizeItem:/);
  assert.match(messages, /closeCustomizerAria:/);
  assert.match(messages, /variantLabel:/);
  assert.match(messages, /modifierLabel:/);
  assert.match(messages, /sidesLabel:/);
  assert.match(messages, /itemNoteLabel:/);
  assert.match(messages, /decreaseQuantityAria:/);
  assert.match(messages, /increaseQuantityAria:/);
  assert.match(messages, /submitFirstBatch: "Gửi món"/);
  assert.match(messages, /statusPendingApproval: "Đã gửi món"/);
  assert.match(messages, /ctaAwaitingApproval: "Đã gửi món"/);
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
  assert.match(pill, /variant: "warning"/);
  assert.match(pill, /variant: "success"/);
  assert.match(pill, /variant: "info"/);
});

test("order-summary lists SelfOrderOrderLine items with collapse at 5", () => {
  const summary = readWeb("app/q/[token]/self-order/order-summary.tsx");

  assert.match(
    summary,
    /import type \{ SelfOrderOrderLine \} from "@lib\/self-order\/contracts"/,
  );
  assert.match(summary, /SELF_ORDER_VI\.orderedItemsTitle/);
  assert.match(summary, /SELF_ORDER_VI\.orderedItemsShowMore/);
  assert.match(summary, /useState\(false\)/);
  assert.match(summary, /COLLAPSE_THRESHOLD/);
  assert.match(summary, /items\.slice\(0, COLLAPSE_THRESHOLD\)/);
  assert.match(summary, /formatVND/);
});

test("cart-sheet has mobile sticky bottom bar, bottom Sheet, and ctaDisabled wiring", () => {
  const cart = readWeb("app/q/[token]/self-order/cart-sheet.tsx");

  assert.match(cart, /SheetContent/);
  assert.match(cart, /@comtammatu\/ui\/components\/sheet/);
  // Mobile-only sticky bar, constrained when viewed on desktop.
  assert.match(cart, /fixed inset-x-0 bottom-0/);
  assert.match(cart, /max-w-xl/);
  assert.match(cart, /side="bottom"/);
  assert.match(cart, /max-h-dvh-95/);
  assert.match(cart, /max-h-dvh-80/);
  assert.match(cart, /size="touch-lg"/);
  assert.match(cart, /SELF_ORDER_VI\.cartTitle/);
  assert.match(cart, /SELF_ORDER_VI\.subtotal/);
  assert.match(cart, /formatVND/);
  assert.match(cart, /cartOptionSummary/);
  assert.match(cart, /item\.modifiers\.map/);
  assert.match(cart, /item\.sides\.map/);
  assert.match(cart, /SELF_ORDER_VI\.itemNoteLabel/);
  // ctaDisabled must flow into SubmitCta (hard-disable: pending/closed only)
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
  assert.match(menu, /size="icon-sm"/);
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
  assert.match(menu, /onAdd\(\{/);
  assert.match(menu, /quantity,/);
  assert.match(menu, /note: trimmedNote === "" \? undefined : trimmedNote/);
  assert.doesNotMatch(menu, /@comtammatu\/ui\/components\/label/);
  assert.doesNotMatch(
    menu,
    /<h3 className="font-heading text-base font-semibold"/,
  );
  assert.match(orchestrator, /function addItem\(cartItem: SelfOrderCartItem\)/);
});

test("self-order is mobile-only with no desktop sidebar branch", () => {
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");
  const menu = readWeb("app/q/[token]/self-order/menu-panel.tsx");
  const cart = readWeb("app/q/[token]/self-order/cart-sheet.tsx");
  const payment = readWeb("app/q/[token]/self-order/payment-panel.tsx");

  assert.match(orchestrator, /width="narrow"/);
  assert.doesNotMatch(orchestrator, /<aside|sm:|md:|lg:|xl:|2xl:/);
  assert.doesNotMatch(menu, /hidden md:flex|sm:|md:|lg:|xl:|2xl:/);
  assert.doesNotMatch(cart, /sm:|md:|lg:|xl:|2xl:|fixed right-3 bottom-24/);
  assert.doesNotMatch(payment, /sm:|md:|lg:|xl:|2xl:/);
});

test("orchestrator locks CTA while first batch is pending approval and keeps cancel-then-add reachable", () => {
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");

  assert.match(
    orchestrator,
    /import \{ StatusPill \} from "\.\/self-order\/status-pill"/,
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
    /import \{ PaymentPanel, type VietQrState \} from "\.\/self-order\/payment-panel"/,
  );
  assert.match(orchestrator, /TabsContent/);
  assert.match(orchestrator, /SELF_ORDER_VI\.billTab/);
  assert.match(orchestrator, /activeMainTab/);
  assert.match(orchestrator, /hasBillTab/);
  assert.match(
    orchestrator,
    /import \{ useSnapshotSync \} from "\.\/self-order\/hooks"/,
  );

  assert.match(
    orchestrator,
    /ctaHardDisabled = isClosed \|\| isPendingApproval/,
  );
  assert.match(
    orchestrator,
    /if \(cartItems\.length === 0 \|\| isPending \|\| ctaHardDisabled\) return/,
  );
  assert.match(orchestrator, /activeOrder\?\.paymentStatus === "paid"/);
  assert.match(orchestrator, /pending_payment_exists/);
  assert.match(orchestrator, /cancel-pending-payment-and-add/);
  assert.match(orchestrator, /ctaDisabled=\{ctaHardDisabled\}/);
  assert.doesNotMatch(orchestrator, /isSearchActive|onSearchActiveChange/);
  assert.doesNotMatch(
    orchestrator,
    /cartItems\.length === 0 \|\| isPending \|\| paymentLocked/,
  );
});
