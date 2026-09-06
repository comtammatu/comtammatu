import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("POS category navigation and preset buttons strictly adhere to universal 48px standard", () => {
  const menuGrid = read(
    "app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx",
  );
  const customizer = read(
    "app/(protected)/br/[branchId]/pos/item-customizer.tsx",
  );
  const discountSheet = read(
    "app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
  );
  const approvalSheet = read(
    "app/(protected)/br/[branchId]/pos/_components/self-order-approval-sheet.tsx",
  );
  const billSheet = read(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  // 1. Menu grid category tabs
  assert.match(menuGrid, /tabPillClassName\s*=\s*[\s\S]*?\bmin-h-12\b/);
  assert.doesNotMatch(menuGrid, /tabPillClassName\s*=\s*[\s\S]*?\bmin-h-10\b/);

  // 2. Item customizer discount presets
  assert.match(customizer, /size="touch"[\s\S]*?shrink-0 px-3 text-xs font-semibold tabular-nums/);
  assert.doesNotMatch(customizer, /h-9 shrink-0 px-3 text-xs font-semibold tabular-nums/);

  // 3. Order detail discount sheet presets
  assert.match(discountSheet, /size="touch"[\s\S]*?shrink-0 px-3 text-xs font-semibold tabular-nums/);
  assert.doesNotMatch(discountSheet, /h-9 shrink-0 px-3 text-xs font-semibold tabular-nums/);

  // 4. Staff call acknowledge action in approval sheet
  assert.match(
    approvalSheet,
    /size="touch"[\s\S]*?onClick=\{[\s\S]*?handleAcknowledgeCall\(call\.id\)\}[\s\S]*?SELF_ORDER_VI\.staffCallServed/,
  );
  assert.doesNotMatch(
    approvalSheet,
    /<Button[^>]*?size="sm"[^>]*?handleAcknowledgeCall/,
  );
  assert.doesNotMatch(
    approvalSheet,
    /className="h-8 gap-1 text-xs"[\s\S]*?SELF_ORDER_VI\.staffCallServed/,
  );

  // 5. Bill receipt cash received InputGroup
  assert.match(billSheet, /<InputGroup size="touch">[\s\S]*?\{messages\.pos\.payment\.cashReceived\}/);
  assert.doesNotMatch(billSheet, /<InputGroup className="h-10">[\s\S]*?\{messages\.pos\.payment\.cashReceived\}/);
});

test("QR Self-Order touch targets strictly adhere to universal 48px standard with zero mini overrides", () => {
  const stepper = read("app/q/[token]/self-order/quantity-stepper.tsx");
  const menuPanel = read("app/q/[token]/self-order/menu-panel.tsx");
  const feedbackSheet = read("app/q/[token]/self-order/feedback-sheet.tsx");
  const cartSheet = read("app/q/[token]/self-order/cart-sheet.tsx");
  const itemSheet = read("app/q/[token]/self-order/item-sheet.tsx");

  // 1. Quantity stepper buttons
  assert.match(stepper, /size="icon-touch"[\s\S]*?disabled=\{disabled \|\| quantity <= 0\}/);
  assert.match(stepper, /size="icon-touch"[\s\S]*?disabled=\{disabled\}[\s\S]*?onClick=\{onIncrease\}/);
  assert.doesNotMatch(stepper, /className="size-8"/);

  // 2. Menu panel quick add button
  assert.match(
    menuPanel,
    /size="icon-touch"[\s\S]*?className="shadow-xs"[\s\S]*?\{SELF_ORDER_VI\.addToCart\}/,
  );
  assert.doesNotMatch(menuPanel, /className="size-8 shadow-xs"/);

  // 3. Feedback sheet quick tags
  assert.match(feedbackSheet, /size="touch"[\s\S]*?rounded-full px-4 font-medium/);
  assert.doesNotMatch(feedbackSheet, /size="sm"[\s\S]*?h-7 rounded-full/);

  // 4. Cart sheet item stepper and remove actions
  assert.match(cartSheet, /size="icon-touch"[\s\S]*?onClick=\{\(\) => onQuantityChange\(item\.key, -1\)\}/);
  assert.match(cartSheet, /size="icon-touch"[\s\S]*?onClick=\{\(\) => onQuantityChange\(item\.key, 1\)\}/);
  assert.match(cartSheet, /size="icon-touch"[\s\S]*?onClick=\{\(\) => onRemove\(item\.key\)\}/);

  // 5. Item customizer sheet stepper
  assert.match(itemSheet, /size="icon-touch"[\s\S]*?onClick=\{\(\) => updateQuantity\(-1\)\}/);
  assert.match(itemSheet, /size="icon-touch"[\s\S]*?onClick=\{\(\) => updateQuantity\(1\)\}/);
  assert.match(itemSheet, /size="touch"[\s\S]*?onClick=\{commitCustomizedItem\}/);
});

test("Self-Order and POS preserve responsive multi-column layouts across device tiers", () => {
  const menuPanel = read("app/q/[token]/self-order/menu-panel.tsx");
  const posInner = read(
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const posMenuGrid = read(
    "app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx",
  );

  // Self-Order responsive menu grid: 1 col on mobile, 2 cols on md+
  assert.match(menuPanel, /grid grid-cols-1 gap-3 md:grid-cols-2/);

  // POS desktop breakpoint at 1280px for touch action bar vs split sidebar
  assert.match(posInner, /useIsMobile\(1280\)/);

  // POS menu grid: 2 cols on mobile, 3 cols on lg, 4 cols on 2xl
  assert.match(posMenuGrid, /grid grid-cols-2 gap-2 sm:gap-3/);
  assert.match(posMenuGrid, /sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4/);
});
