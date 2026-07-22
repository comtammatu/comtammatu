import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("S3 exposes snapshot, submit, and payment without device capability", () => {
  const getRoute = read("app/api/self-order/[token]/route.ts");
  const submitRoute = read("app/api/self-order/[token]/submit/route.ts");
  const paymentRoute = read("app/api/self-order/[token]/payment/route.ts");
  const requestSecurity = read("lib/self-order/request-security.ts");

  assert.match(getRoute, /getSelfOrderSnapshot/);
  assert.match(submitRoute, /submitSelfOrderRequest/);
  assert.match(paymentRoute, /createSelfOrderPaymentRequest/);
  assert.match(requestSecurity, /private, no-store/);
  assert.match(requestSecurity, /hashSelfOrderClientIp/);
  assert.doesNotMatch(
    `${getRoute}\n${submitRoute}\n${paymentRoute}\n${requestSecurity}`,
    /device_cookie_required|device_token|capabilityVersion|pairing/,
  );

  for (const retired of [
    "app/api/self-order/[token]/batches/route.ts",
    "app/api/self-order/[token]/join/route.ts",
    "app/api/self-order/[token]/pairing-code/route.ts",
    "app/api/self-order/[token]/cancel-pending-payment-and-add/route.ts",
    "lib/self-order/device-capability.ts",
  ]) {
    assert.equal(existsSync(join(root, retired)), false, retired);
  }
});

test("S4 is one responsive menu page with pending-state feedback and adaptive polling", () => {
  const client = read("app/q/[token]/self-order-client.tsx");
  const bill = read("app/q/[token]/self-order/bill-drawer.tsx");
  const cart = read("app/q/[token]/self-order/cart-sheet.tsx");
  const menu = read("app/q/[token]/self-order/menu-panel.tsx");
  const hooks = read("app/q/[token]/self-order/hooks.ts");
  const surface = read("app/components/surface.tsx");

  assert.match(client, /SELF_ORDER_VI\.tableLabel/);
  assert.match(client, /padded=\{false\}/);
  assert.match(
    client,
    /className="h-dvh min-h-0 overflow-hidden bg-background"/,
  );
  assert.match(
    client,
    /contentClassName="h-full min-h-0 p-0"/,
  );
  assert.doesNotMatch(client, /contentClassName="h-dvh/);
  assert.doesNotMatch(surface, /mobile && "pb-28"/);
  assert.match(client, /SELF_ORDER_VI\.branchFallback/);
  assert.match(client, /SELF_ORDER_VI\.billTab/);
  assert.match(client, /from "@\/components\/theme-toggle"/);
  assert.match(client, /<ThemeToggle/);
  assert.match(client, /size="icon-touch"/);
  assert.doesNotMatch(client, /billAvailable/);
  assert.match(client, /variant="default"/);
  assert.match(client, /SELF_ORDER_VI\.billTab/);
  assert.doesNotMatch(client, /fixed right-3 z-30/);
  assert.doesNotMatch(client, /bottom-20/);
  assert.match(client, /billView/);
  assert.match(client, /onOpenPayment=\{\(\) => setBillView\("payment"\)\}/);
  assert.match(client, /from "next\/dynamic"/);
  assert.match(
    client,
    /const PaymentPanel = dynamic\([\s\S]*import\("\.\/self-order\/payment-panel"\)/,
  );
  assert.match(client, /ssr: false, loading: PaymentPanelLoading/);
  assert.match(
    client,
    /billOpen && billView === "payment" && !ambiguous && order \? \(/,
  );
  assert.match(client, /toast\.error\(refreshError\)/);
  assert.match(client, /toast\.warning\(SELF_ORDER_VI\.rejectedCalloutTitle/);
  assert.match(client, /guestToastKeyRef/);
  assert.match(client, /from "@\/components\/form"/);
  assert.match(client, /<AppDialog/);
  assert.match(client, /awaitingDialogOpen/);
  assert.match(client, /pendingDialogTitle/);
  assert.match(client, /pendingDialogDescription/);
  assert.match(client, /SELF_ORDER_VI\.callMore/);
  assert.match(client, /SELF_ORDER_VI\.paymentCompletedClose/);
  assert.match(client, /footerClassName="flex-col gap-2 sm:flex-row"/);
  assert.match(client, /const isFirstPendingSubmit = !awaiting/);
  assert.match(
    client,
    /state === "awaiting_confirmation"[\s\S]*isFirstPendingSubmit[\s\S]*setAwaitingDialogOpen\(true\)/,
  );
  assert.doesNotMatch(client, /toast\.warning\(SELF_ORDER_VI\.awaitingCalloutTitle/);
  assert.match(client, /rejectedCalloutTitle/);
  assert.match(client, /SELF_ORDER_VI\.submitAddMore/);
  assert.match(client, /<BillDrawer/);
  assert.doesNotMatch(client, /<NoteCallout|<Alert/);
  assert.doesNotMatch(
    client,
    /StatusPill|SessionStatePanel|DeviceAccessPanel|<Tabs/,
  );
  assert.match(bill, /<Sheet/);
  assert.match(
    bill,
    /data-\[side=bottom\]:h-dvh data-\[side=bottom\]:max-h-dvh/,
  );
  assert.match(bill, /<ScrollArea className="min-h-0 flex-1">/);
  assert.doesNotMatch(bill, /SELF_ORDER_VI\.tableLabel/);
  assert.doesNotMatch(bill, /visibleRounds|RoundItem/);
  assert.match(bill, /pendingItems/);
  assert.match(bill, /<OrderSummary/);
  const summary = read("app/q/[token]/self-order/order-summary.tsx");
  assert.doesNotMatch(
    summary,
    /SelfOrderRound|RoundItem|roundsTitle|roundsDescription|roundLabel/,
  );
  assert.match(summary, /SELF_ORDER_VI\.billItemColumn/);
  assert.match(summary, /SELF_ORDER_VI\.billQuantityColumn/);
  assert.match(summary, /SELF_ORDER_VI\.billUnitPriceColumn/);
  assert.match(summary, /SELF_ORDER_VI\.billLineTotalColumn/);
  assert.match(summary, /<DataTable/);
  assert.doesNotMatch(summary, /grid-cols-\[minmax\(0,1fr\)_auto_auto_auto\]/);
  assert.match(summary, /items\.flatMap\(buildBillRows\)/);
  assert.match(summary, /formatVND\(row\.unitPrice\)/);
  assert.match(summary, /formatVND\(row\.lineTotal\)/);
  assert.match(summary, /import \{ BrandMascot \} from "@\/components\/brand"/);
  assert.match(summary, /<BrandMascot decorative size="sm" \/>/);
  assert.match(summary, /awaitingCalloutTitle/);
  assert.match(summary, /awaitingCalloutDescription/);
  assert.match(summary, /role="status"/);
  assert.match(bill, /SELF_ORDER_VI\.subtotal/);
  assert.match(bill, /SELF_ORDER_VI\.serviceCharge/);
  assert.match(bill, /SELF_ORDER_VI\.discount/);
  assert.match(bill, /SELF_ORDER_VI\.totalAmount/);
  assert.doesNotMatch(menu, /<Tabs|TabsTrigger|TabsList/);
  assert.match(menu, /isSelfOrderComCategory\(category\)/);
  assert.match(menu, /compact=\{!isSelfOrderComCategory\(category\)\}/);
  assert.match(menu, /<MenuRowButton/);
  assert.match(menu, /defaultSelfOrderCategoryValue/);
  assert.match(menu, /splitMenuItemDisplayName/);
  assert.match(menu, /from "\.\/menu-display"/);
  assert.match(menu, /menuPromptTitle/);
  assert.doesNotMatch(menu, /bg-gradient-to-t from-black/);
  assert.doesNotMatch(menu, /featuredMainDishes|MenuPhotoButton/);
  assert.match(menu, /grid grid-cols-1 gap-3 md:grid-cols-2/);
  assert.doesNotMatch(menu, /category\.type !== "main_dish"/);
  assert.match(menu, /items-stretch justify-start gap-4 p-3/);
  assert.match(menu, /active:scale-95/);
  assert.match(menu, /group-active:scale-105/);
  assert.match(menu, /className="object-cover transition-transform duration-150 group-active:scale-105"/);
  assert.doesNotMatch(
    menu,
    /text-xs font-medium tracking-wide text-muted-foreground uppercase/,
  );
  assert.match(menu, /BrandSymbol/);
  assert.match(menu, /variant="riceBowl"/);
  assert.doesNotMatch(menu, /Utensils/);
  assert.match(client, /Clock as IconClock/);
  assert.doesNotMatch(client, /⏳/);
  assert.match(menu, /selfOrderItemImageBadges/);
  assert.match(menu, /Star as IconStar/);
  assert.match(menu, /ThumbsUp as IconThumbsUp/);
  assert.match(menu, /absolute left-2 top-2/);
  assert.doesNotMatch(menu, /Nên thử/);
  assert.match(menu, /Hết suất|reasonSoldOut|availabilityReasonLabel/);
  assert.match(menu, /flex flex-wrap items-center gap-1\.5/);
  assert.doesNotMatch(menu, /absolute top-1\.5 (?:left|right)-1\.5/);
  assert.match(menu, /h-32 w-32/);
  assert.match(menu, /h-16 w-16/);
  assert.match(menu, /text-2xl leading-tight/);
  assert.match(menu, /text-lg leading-snug/);
  assert.match(menu, /font-heading text-2xl font-semibold tracking-tight/);
  assert.ok(
    menu.indexOf("SELF_ORDER_VI.menuPromptTitle") < menu.indexOf("<ScrollArea"),
  );
  const menuDisplay = read("app/q/[token]/self-order/menu-display.ts");
  assert.match(menuDisplay, /isSelfOrderComCategory/);
  assert.match(menuDisplay, /normalizeCategoryName\(category\.name\) === "cơm"/);
  assert.match(menuDisplay, /!== "khác"/);
  assert.match(menuDisplay, /Truyền thống/);
  assert.doesNotMatch(menuDisplay, /Nên thử/);
  assert.match(menuDisplay, /Chờ 20 phút/);
  assert.match(client, /defaultSelfOrderCategoryValue\(initialSnapshot\.menu\)/);
  assert.doesNotMatch(client, /useState\("all"\)/);
  assert.match(bill, /paymentView/);
  assert.match(bill, /onOpenPayment/);
  assert.match(bill, /onBackToBill/);
  assert.match(
    hooks,
    /const fast = snapshot\.ok && snapshot\.state === "awaiting_confirmation"/,
  );
  assert.doesNotMatch(hooks, /fast[\s\S]{0,120}payment_pending/);
  assert.match(hooks, /fast \? 3_000 : 15_000/);
  assert.doesNotMatch(hooks, /realtimeTopic|\.channel\(/);
  const payment = read("app/q/[token]/self-order/payment-panel.tsx");
  assert.match(payment, /ReceiptText as IconReceipt/);
  assert.match(payment, /Banknote as IconCash/);
  assert.match(payment, /QrCode as IconQrcode/);
  assert.doesNotMatch(payment, /CreditCard/);
  assert.match(
    cart,
    /fixed inset-x-0 bottom-0[\s\S]*?onClick=\{\(\) => setOpen\(true\)\}/,
  );
  assert.match(
    cart,
    /className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden p-0"/,
  );
  assert.doesNotMatch(cart, /\bh-dvh\b|\bmax-h-dvh\b/);
  assert.match(cart, /<ScrollArea className="min-h-0 flex-1">/);
  assert.match(cart, /SELF_ORDER_VI\.editCartItem/);
  assert.match(cart, /onReplace/);
  assert.match(cart, /SelfOrderItemSheet/);
  assert.match(cart, /initialDraft=\{editingCartItem\}/);
  assert.match(cart, /ItemSeparator/);
  const cartLine = cart.slice(
    cart.indexOf("function CartLine"),
    cart.indexOf("export function CartSheet"),
  );
  assert.match(cartLine, /ItemActions className="[^"]*flex-wrap/);
  assert.match(cartLine, /size="touch"/);
  assert.equal(cartLine.match(/size="icon-touch"/g)?.length, 3);
  assert.doesNotMatch(cartLine, /size="(?:sm|icon-sm)"/);
  assert.match(
    cart,
    /workflow-safe-pb flex shrink-0[\s\S]*onClick=\{props\.onSubmit\}/,
  );
});

test("self-order menu availability reuses the POS stock gate", () => {
  const server = read("lib/self-order/server.ts");
  const availability = read("lib/self-order/availability.ts");
  const contracts = read("lib/self-order/contracts.ts");
  const guestUi = readFileSync(
    join(root, "../../docs/spec/self-order-guest-ui.md"),
    "utf8",
  );

  assert.match(server, /branch_menu_limit_availability/);
  assert.match(server, /pos_stock_outcome_posting/);
  assert.match(server, /withMenuAvailability/);
  assert.match(server, /findCartSoldOutMessage/);
  assert.match(server, /itemQuotaExceeded|itemSoldOutBlocked|itemDisabledBlocked/);
  assert.doesNotMatch(server, /soldOutBlocked/);
  assert.match(availability, /remainingAfterDemand/);
  assert.match(availability, /isAvailabilityBlocked/);
  assert.match(availability, /findCartSoldOutMessage/);
  assert.match(contracts, /available_to_sell/);
  assert.match(contracts, /manual_limit_quantity/);
  assert.match(guestUi, /branch_menu_limit_availability/);
  assert.match(guestUi, /primary \(terracotta\)/);
  assert.match(guestUi, /no\s+per-item category eyebrow/);
  assert.doesNotMatch(guestUi, /fixed lower-right/);
});

test("item sheet supports add and cart-edit commit paths", () => {
  const itemSheet = read("app/q/[token]/self-order/item-sheet.tsx");
  assert.match(itemSheet, /initialDraft/);
  assert.match(itemSheet, /SELF_ORDER_VI\.updateCartItem/);
  assert.match(itemSheet, /onCommit/);
  assert.match(itemSheet, /hydrateFromDraft/);
  assert.match(
    itemSheet,
    /className="mx-auto w-full max-w-2xl overflow-hidden p-0"/,
  );
  assert.match(
    itemSheet,
    /className="flex min-h-0 flex-1 flex-col overflow-hidden"/,
  );
  assert.doesNotMatch(itemSheet, /\bh-dvh\b|\bmax-h-dvh\b/);
  assert.match(itemSheet, /h-52 w-full/);
  assert.match(
    itemSheet,
    /sm:aspect-video sm:h-auto sm:max-h-52 md:max-h-48 lg:max-h-48/,
  );
  assert.match(itemSheet, /max-w-2xl/);
  assert.match(itemSheet, /object-cover object-center/);
  assert.match(itemSheet, /SheetDescription className="sr-only"/);
  assert.doesNotMatch(
    itemSheet,
    /item\.description \?\? SELF_ORDER_VI\.customizeDescription/,
  );
  assert.match(
    itemSheet,
    /flex shrink-0 flex-wrap items-center gap-2 p-3 sm:flex-nowrap[\s\S]*max-sm:basis-full[\s\S]*commitCustomizedItem/,
  );
});

test("S5 routes pending QR requests through the table and bill surfaces", () => {
  const actions = read(
    "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
  );
  const approval = read(
    "app/(protected)/br/[branchId]/pos/_components/self-order-approval-sheet.tsx",
  );
  const tables = read("app/(protected)/br/[branchId]/pos/pos-table-gate.tsx");
  const desktop = read(
    "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const bill = read(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(actions, /\.from\("self_order_requests"\)/);
  assert.match(actions, /\.from\("self_order_payment_requests"\)/);
  assert.match(actions, /self_order_accept_request/);
  assert.match(actions, /self_order_reject_request/);
  assert.match(actions, /self_order_cancel_payment_request/);
  assert.doesNotMatch(
    actions,
    /self_order_list_staff_queue_v2|approveSelfOrderBatch|DeviceJoin|pairingCode|capabilityV2/,
  );

  assert.match(approval, /displayedRequests\.map/);
  assert.match(approval, /request\.items\.map/);
  assert.match(approval, /request\.customerNote/);
  assert.match(approval, /provisionalTotal/);
  assert.match(approval, /activeOrdersByTable/);
  assert.match(approval, /activeOrders\.length >= 2/);
  assert.match(approval, /role="list"/);
  assert.match(approval, /role="listitem"/);
  assert.match(approval, /staffTargetRequired/);
  assert.match(approval, /acceptSelfOrderRequest/);
  assert.match(approval, /rejectSelfOrderRequest/);

  assert.match(tables, /pendingSelfOrderTableIds/);
  assert.match(tables, /QR ⏳/);
  assert.match(tables, /variant="warning"/);

  assert.match(desktop, /fetchSelfOrderPosState/);
  assert.match(desktop, /playOperationalAlert\(\{ kind: "pos\.self_order"/);
  assert.match(desktop, /playAppSignal\("pos-payment-call"\)/);
  assert.match(desktop, /knownSelfOrderPaymentRequestIdsRef/);
  assert.match(desktop, /5_000/);
  assert.match(desktop, /pendingSelfOrderRequestByTable\.get/);
  assert.match(desktop, /const selfOrderActionVisible/);
  assert.match(desktop, /sessionAction=\{desktopSelfOrderAction\}/);
  assert.match(desktop, /selfOrderRequestCount=\{/);
  assert.doesNotMatch(desktop, /fixed right-3 bottom-20/);
  assert.match(desktop, /SELF_ORDER_VI\.staffApprove/);
  assert.match(desktop, /setSelfOrderApprovalOpen\(true\)/);
  assert.match(desktop, /setSelectedSelfOrderRequestId\(null\)/);
  assert.match(desktop, /selfOrderPaymentRequestId=/);

  assert.match(bill, /cancelSelfOrderPaymentRequest/);
  assert.match(bill, /staff_cancelled_from_bill/);
  assert.match(bill, /selfOrderPaymentRequestId/);
});
