import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  getSelfOrderSeatingIdentity,
  resolveSelfOrderPrivacyTransition,
} from "../app/q/[token]/self-order/client-privacy-state";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const getRoute = read("app/api/self-order/[token]/route.ts");
const batchRoute = read("app/api/self-order/[token]/batches/route.ts");
const paymentRoute = read("app/api/self-order/[token]/payment/route.ts");
const joinRoute = read("app/api/self-order/[token]/join/route.ts");
const pairingRoute = read("app/api/self-order/[token]/pairing-code/route.ts");
const client = read("app/q/[token]/self-order-client.tsx");
const devicePanel = read("app/q/[token]/self-order/device-access-panel.tsx");
const hooks = read("app/q/[token]/self-order/hooks.ts");
const notFound = read("app/q/[token]/not-found.tsx");
const staffActions = read(
  "app/(protected)/br/[branchId]/pos/self-order-actions.ts",
);
const staffQueue = read(
  "app/(protected)/br/[branchId]/pos/_components/self-order-approval-sheet.tsx",
);

test("v2 snapshot lookup binds an opaque cookie while v1 remains expand-safe", () => {
  assert.match(getRoute, /result\.data\.capabilityVersion !== 2/);
  assert.match(getRoute, /readSelfOrderDeviceSecret\(request\)/);
  assert.match(getRoute, /hashSelfOrderDeviceSecret\(deviceSecret\)/);
  assert.match(getRoute, /getSelfOrderSnapshotV2/);
  assert.match(getRoute, /setSelfOrderDeviceCookie/);
  assert.match(getRoute, /snapshot\.data\.deviceAccess === "expired"/);
  assert.doesNotMatch(
    getRoute,
    /\["rejected", "revoked", "expired"\]\.includes/,
  );
  assert.match(getRoute, /applySelfOrderPrivateHeaders/);
});

test("v2 batch and payment mutations enforce the device and origin boundary", () => {
  for (const source of [batchRoute, paymentRoute, joinRoute, pairingRoute]) {
    assert.match(source, /validateSelfOrderMutationRequest\(request\)/);
    assert.match(source, /device_cookie_required/);
    assert.match(source, /hashSelfOrderClientIp\(request\)/);
    assert.match(source, /applySelfOrderPrivateHeaders/);
  }
  assert.match(batchRoute, /submitSelfOrderBatchV2/);
  assert.match(batchRoute, /getSelfOrderSnapshotV2/);
  assert.match(batchRoute, /snapshot: authoritativeSnapshot/);
  assert.match(paymentRoute, /createSelfOrderPaymentRequestV2/);
  assert.match(joinRoute, /requestSelfOrderDeviceJoinV2/);
  assert.match(pairingRoute, /refreshSelfOrderPairingCodeV2/);
});

test("guest UI separates public, pending, and approved seating access", () => {
  assert.match(client, /snapshot\.access === "origin_pending"/);
  assert.match(client, /snapshot\.access === "join_pending"/);
  assert.match(client, /snapshot\.deviceAccess === "rejected"/);
  assert.match(client, /snapshot\.deviceAccess === "revoked"/);
  assert.match(client, /snapshot\.canViewBill === false/);
  assert.match(client, /snapshot\.canRequestPayment !== false/);
  assert.match(client, /postSelfOrderJson[\s\S]*first\.status === 428/);
  assert.match(devicePanel, /SELF_ORDER_VI\.joinRequiredTitle/);
  assert.match(devicePanel, /SELF_ORDER_VI\.pairingCodeLabel/);
  assert.match(devicePanel, /onRefreshPairingCode/);
  assert.match(devicePanel, /snapshot\.deviceAccess === "rejected"/);
  assert.match(devicePanel, /snapshot\.deviceAccess === "revoked"/);
  assert.match(devicePanel, /role="alert"/);
  assert.match(devicePanel, /snapshot\.deviceRecovery === "expired"/);
  assert.match(devicePanel, /deviceApprovalExpiresAt\(deviceExpiresAt\)/);
});

test("device expiry and seating boundaries preserve only the recoverable draft", () => {
  assert.match(getRoute, /recoveredExpiredDevice = true/);
  assert.match(getRoute, /deviceRecovery: "expired" as const/);
  assert.match(hooks, /mergeSnapshotPreservingPairingCode/);
  assert.match(hooks, /current\.deviceRecovery === "expired"/);
  assert.match(hooks, /withPairingCode\.seatingAccess !== "join_required"/);
  assert.match(client, /const resetSeatingScopedState = useCallback/);
  assert.match(client, /setBuyerTaxCode\(""\)/);
  assert.match(client, /setBuyerAddress\(""\)/);
  assert.match(client, /setBuyerEmail\(""\)/);
  assert.match(client, /setSeatingEpoch\(\(current\) => current \+ 1\)/);
  assert.match(client, /key=\{seatingEpoch\}/);
  assert.match(client, /pendingCapabilityDraftKeyRef\.current = intent\.key/);
  assert.match(client, /snapshot\.access !== "approved"/);
  assert.match(client, /resolveSelfOrderPrivacyTransition/);
  assert.match(client, /getSelfOrderSeatingIdentity\(snapshot\)/);
  assert.match(client, /pendingBoundaryHasBatchRef/);
  assert.match(client, /transition\.preserveCart/);
  assert.match(client, /if \(!terminalError\) return/);
  assert.match(notFound, /<AppPage\s+as="main"\s+id="main-content"/);
});

test("seating privacy transition matrix resets skipped seat changes and preserves only exact expiry drafts", () => {
  const base = {
    previousIdentity: null,
    currentIdentity: null,
    previousBoundary: null,
    currentBoundary: null,
    currentAccess: undefined,
    currentSeatingAccess: undefined,
    deviceDenied: false,
    recoveryExpired: false,
    pendingHadSubmittedBatch: false,
    exactPendingDraft: false,
  } as const;

  assert.equal(
    getSelfOrderSeatingIdentity({
      ok: true,
      session: {
        status: "active",
        createdAt: "2026-07-10T01:00:00.000Z",
        approvedAt: "2026-07-10T01:01:00.000Z",
      },
    }),
    "session:2026-07-10T01:00:00.000Z",
  );
  assert.equal(
    getSelfOrderSeatingIdentity({
      ok: true,
      access: "join_pending",
      deviceRequest: {
        deviceId: 42,
        kind: "join",
        status: "join_pending",
      },
    }),
    "device:42",
  );
  assert.equal(
    getSelfOrderSeatingIdentity({
      ok: true,
      access: "public",
      seatingAccess: "join_required",
      deviceRecovery: "expired",
    }),
    "recovery:join_required",
  );

  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "session:A",
    }),
    { reset: true, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "session:A",
      currentIdentity: "session:B",
    }),
    { reset: true, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "session:A",
      previousBoundary: "approved",
      currentAccess: "public",
      currentSeatingAccess: "join_required",
      recoveryExpired: true,
    }),
    { reset: true, preserveCart: true },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "session:A",
      previousBoundary: "approved",
      currentAccess: "public",
      currentSeatingAccess: "available",
      recoveryExpired: true,
    }),
    { reset: true, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "device:1",
      previousBoundary: "origin_pending",
      currentAccess: "public",
      currentSeatingAccess: "join_required",
      recoveryExpired: true,
      pendingHadSubmittedBatch: true,
      exactPendingDraft: true,
    }),
    { reset: true, preserveCart: true },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "device:1",
      previousBoundary: "origin_pending",
      currentAccess: "public",
      currentSeatingAccess: "join_required",
      recoveryExpired: true,
      pendingHadSubmittedBatch: true,
      exactPendingDraft: false,
    }),
    { reset: true, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "device:1",
      previousBoundary: "origin_pending",
      currentAccess: "public",
      currentSeatingAccess: "available",
      recoveryExpired: true,
      pendingHadSubmittedBatch: true,
      exactPendingDraft: true,
    }),
    { reset: true, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "device:2",
      previousBoundary: "join_pending",
      currentAccess: "public",
      currentSeatingAccess: "join_required",
      recoveryExpired: true,
    }),
    { reset: true, preserveCart: true },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "device:1",
      currentIdentity: "session:A",
      previousBoundary: "origin_pending",
      currentBoundary: "approved",
      currentAccess: "approved",
    }),
    { reset: false, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "recovery:join_required",
      currentIdentity: "device:3",
      currentBoundary: "join_pending",
      currentAccess: "join_pending",
      currentSeatingAccess: "join_required",
    }),
    { reset: false, preserveCart: false },
  );
  assert.deepEqual(
    resolveSelfOrderPrivacyTransition({
      ...base,
      previousIdentity: "recovery:join_required",
      currentAccess: "public",
      currentSeatingAccess: "available",
    }),
    { reset: true, preserveCart: false },
  );
});

test("submitted capability drafts lock cart edits while join-only drafts stay editable", () => {
  const cart = read("app/q/[token]/self-order/cart-sheet.tsx");

  assert.match(
    client,
    /isSubmittedCapabilityPending =\s*isCapabilityPending && snapshot\.pendingBatch != null/,
  );
  assert.match(
    client,
    /isCartMutationLocked = isPending \|\| isSubmittedCapabilityPending/,
  );
  assert.match(client, /if \(isCartMutationLocked\) return/);
  assert.match(client, /isEditingLocked=\{isSubmittedCapabilityPending\}/);
  assert.match(
    cart,
    /editingDisabled = props\.isSubmitting \|\| props\.isEditingLocked/,
  );
  assert.match(cart, /disabled=\{editingDisabled\}/);
});

test("BFCache entry scrubs private state and restore stays blocked until a fresh snapshot", () => {
  assert.match(hooks, /import \{ flushSync \} from "react-dom"/);
  assert.match(hooks, /window\.addEventListener\("pagehide"/);
  assert.match(hooks, /window\.addEventListener\("pageshow"/);
  assert.match(hooks, /if \(!event\.persisted\) return/);
  assert.match(hooks, /setIsHistoryRestorePending\(true\)/);
  assert.match(hooks, /onHistoryPrivacyScrubRef\.current\?\.\(\)/);
  assert.match(hooks, /void refreshSnapshot\(\)/);
  assert.match(client, /resetSeatingScopedState\(false\)/);
  assert.match(client, /if \(isHistoryRestorePending\)/);
  assert.match(client, /SELF_ORDER_VI\.historyRestoreTitle/);
  assert.match(client, /SELF_ORDER_VI\.historyRestoreFailed/);
  assert.match(client, /onClick=\{\(\) => void refreshSnapshot\(\)\}/);
});

test("invoice validation focuses once per failed submit without moving on each keystroke", () => {
  const paymentPanel = read("app/q/[token]/self-order/payment-panel.tsx");

  assert.match(client, /setInvoiceErrorFocusRequest/);
  assert.match(paymentPanel, /errorFocusRequest\?\.field/);
  assert.match(paymentPanel, /\}, \[errorFocusRequest\]\);/);
  assert.doesNotMatch(paymentPanel, /\}, \[fieldErrors\]\);/);
});

test("staff approval requires the guest pairing code without exposing buyer PII", () => {
  assert.match(staffActions, /self_order_list_staff_queue_v2/);
  assert.match(staffActions, /self_order_approve_batch_v2/);
  assert.match(staffActions, /self_order_approve_device_join_v2/);
  assert.match(staffActions, /self_order_reject_device_join_v2/);
  assert.match(staffQueue, /PairingCodeField/);
  assert.match(staffQueue, /staffPairingCodeRequired/);
  assert.match(staffQueue, /pairingErrorByDevice/);
  assert.match(staffQueue, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(staffQueue, /grid grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.match(staffQueue, /queue\.approvedDevices\.map/);
  assert.match(staffQueue, /revokeSelfOrderSessionDevice/);
  assert.match(staffActions, /capabilityV2 && data\?\.ok !== true/);
  assert.match(staffActions, /if \(data\?\.ok !== true\)/);
  assert.doesNotMatch(staffQueue, /invoice_payload|buyerTaxCode|buyerAddress/);
});
