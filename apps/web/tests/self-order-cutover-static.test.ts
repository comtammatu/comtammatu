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

test("S4 is one menu page with derived callouts and adaptive polling", () => {
  const client = read("app/q/[token]/self-order-client.tsx");
  const bill = read("app/q/[token]/self-order/bill-drawer.tsx");
  const menu = read("app/q/[token]/self-order/menu-panel.tsx");
  const hooks = read("app/q/[token]/self-order/hooks.ts");

  assert.match(client, /SELF_ORDER_VI\.tableLabel/);
  assert.match(client, /SELF_ORDER_VI\.viewBill/);
  assert.match(client, /awaitingCalloutTitle/);
  assert.match(client, /rejectedCalloutTitle/);
  assert.match(client, /SELF_ORDER_VI\.submitAddMore/);
  assert.match(client, /<BillDrawer/);
  assert.match(client, /!ambiguous \? \(/);
  assert.doesNotMatch(
    client,
    /StatusPill|SessionStatePanel|DeviceAccessPanel|<Tabs/,
  );
  assert.match(bill, /<Drawer/);
  assert.match(bill, /pendingItems/);
  assert.match(bill, /<OrderSummary/);
  assert.doesNotMatch(menu, /<Tabs|TabsTrigger|TabsList/);
  assert.match(menu, /category\.type !== "main_dish"/);
  assert.match(menu, /<MenuCompactButton/);
  assert.match(menu, /featuredMainDishes/);
  assert.match(menu, /category\.type === "main_dish"/);
  assert.match(menu, /\.slice\(0, 3\)/);
  assert.match(menu, /featuredMainDishIds/);
  assert.match(hooks, /fast \? 3_000 : 15_000/);
  assert.doesNotMatch(hooks, /realtimeTopic|\.channel\(/);
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
  assert.match(desktop, /playAppSignal\("pos"\)/);
  assert.match(desktop, /5_000/);
  assert.match(desktop, /pendingSelfOrderRequestByTable\.get/);
  assert.match(desktop, /fixed right-3 bottom-20 z-40 lg:bottom-4/);
  assert.match(desktop, /SELF_ORDER_VI\.staffApprove/);
  assert.match(desktop, /setSelfOrderApprovalOpen\(true\)/);
  assert.match(desktop, /setSelectedSelfOrderRequestId\(null\)/);
  assert.match(desktop, /selfOrderPaymentRequestId=/);

  assert.match(bill, /cancelSelfOrderPaymentRequest/);
  assert.match(bill, /staff_cancelled_from_bill/);
  assert.match(bill, /selfOrderPaymentRequestId/);
});
