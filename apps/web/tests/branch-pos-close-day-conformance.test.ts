import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

test("POS Station desktop inner screen configures 1024px touch layout breakpoint and passes orders toggle", () => {
  const posDesktop = read(
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );

  assert.match(
    posDesktop,
    /const isTouchLayout = useIsMobile\(1024\);/,
    "POS must switch to desktop/tablet layout at 1024px instead of 1280px",
  );

  assert.match(
    posDesktop,
    /<SplitSidebar[\s\S]*?onToggleShowOrders=\{setShowOrders\}[\s\S]*?cartQuantity=\{cartQuantity\}[\s\S]*?ordersCount=\{orders\.length\}/,
    "POS desktop inner must pass showOrders switcher and counts to SplitSidebar",
  );
});

test("POS SplitSidebar supports single sidebar on lg tablet and dual-pane on xl desktop", () => {
  const sidebarVariants = read(
    "app/(protected)/br/[branchId]/pos/_components/pos-sidebar-variants.tsx",
  );

  assert.match(
    sidebarVariants,
    /lg:flex xl:hidden/,
    "SplitSidebar must provide single sidebar on lg (tablet landscape: 1024px - 1279px)",
  );

  assert.match(
    sidebarVariants,
    /xl:flex/,
    "SplitSidebar must provide dual pane on xl (desktop widescreen: >= 1280px)",
  );

  assert.match(
    sidebarVariants,
    /(?:Giỏ hàng|newCart)[\s\S]*?(?:Đơn|sessionOrders)/,
    "SplitSidebar tablet layout must provide switcher buttons between cart and session orders",
  );

  assert.match(
    sidebarVariants,
    /size="touch"/,
    "Switcher buttons must use the touch Button size (≥40px) instead of raw height classes",
  );
  assert.match(
    sidebarVariants,
    /from "@comtammatu\/ui\/components\/button"/,
    "Switcher must use the DS Button primitive",
  );
});

test("POS line item compact upgrades stepper buttons for ergonomic touch tapping", () => {
  const lineItem = read(
    "app/(protected)/br/[branchId]/pos/_components/pos-line-item-compact.tsx",
  );

  assert.match(
    lineItem,
    /size="icon-touch"/,
    "Quantity stepper buttons (+ / -) must use icon-touch size (≥40px) instead of raw height classes",
  );
});

test("POS Mobile Action Bar aligns dock hiding with 1024px breakpoint", () => {
  const mobileActionBar = read(
    "app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx",
  );

  assert.match(
    mobileActionBar,
    /lg:hidden/,
    "Touch dock must hide on lg and above (>= 1024px)",
  );
  assert.doesNotMatch(
    mobileActionBar,
    /xl:hidden/,
    "Touch dock must not use xl:hidden which kept it visible on tablet landscape",
  );
});

test("Close-Day screen complies with ADR 0024, print reporting, and cash reconciliation", () => {
  const closeDayClient = read(
    "app/(protected)/br/[branchId]/(operator)/close-day/close-day-client.tsx",
  );

  // ADR 0024: read-only summary, no mutation closing the day
  assert.doesNotMatch(
    closeDayClient,
    /close_branch_day/,
    "Close-day client must not invoke close_branch_day RPC directly (ADR 0024)",
  );

  // Print support
  assert.match(
    closeDayClient,
    /window\.print\(\)/,
    "Close-day client must provide a window.print() trigger",
  );
  assert.match(
    closeDayClient,
    /Printer/,
    "Close-day client must render a print icon button",
  );
  assert.match(
    closeDayClient,
    /print:hidden/,
    "Close-day client must hide navigation/actions in print view",
  );
  assert.match(
    closeDayClient,
    /hidden print:flex/,
    "Close-day client must include a print-only header banner",
  );

  // Cash reconciliation
  assert.match(
    closeDayClient,
    /(?:closeDayCashReconTitle|Đối soát két tiền mặt)/,
    "Close-day client must render cash drawer reconciliation section",
  );
  assert.match(
    closeDayClient,
    /cashReconciliation/,
    "Close-day client must compute cash drawer reconciliation across sessions",
  );
  assert.match(
    closeDayClient,
    /(?:closeDayCashStatusMatched|Khớp két)/,
    "Close-day client must provide status badge for reconciled cash drawer",
  );
});
