import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  mapMomoPaymentException,
  sortMomoPaymentExceptions,
  type MomoPaymentExceptionRow,
} from "../app/(protected)/finance/_lib/momo-payment-exception-model";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

function paymentRow(
  id: number,
  providerData: Record<string, unknown>,
  updatedAt = "2026-07-13T03:00:00.000Z",
): MomoPaymentExceptionRow {
  return {
    id,
    order_id: id + 100,
    amount: 125_000,
    status: "completed",
    paid_at: "2026-07-13T02:00:00.000Z",
    provider_ref: `MOMO-${id}`,
    provider_data: providerData,
    created_at: "2026-07-13T01:00:00.000Z",
    updated_at: updatedAt,
  };
}

test("MoMo exception model exposes late success as an open owner queue item", () => {
  const mapped = mapMomoPaymentException(
    paymentRow(1, {
      lateSuccessRequiresReview: true,
      transactionId: "10001",
      conflictingTransactionId: "10002",
    }),
  );

  assert.ok(mapped);
  assert.equal(mapped.reviewStatus, "open");
  assert.equal(mapped.transactionId, "10002");
  assert.deepEqual(mapped.reasons, ["late_success"]);
});

test("MoMo query success with non-final settlement is eligible", () => {
  const mapped = mapMomoPaymentException(
    paymentRow(2, {
      momoReconciliation: {
        disposition: "success",
        settlementStatus: "requires_manual_review",
        transactionId: "20001",
      },
    }),
  );

  assert.ok(mapped);
  assert.equal(mapped.transactionId, "20001");
  assert.deepEqual(mapped.reasons, ["reconciliation_success"]);
});

test("final MoMo reconciliation is excluded without stored review evidence", () => {
  for (const settlementStatus of ["completed", "already_completed"]) {
    assert.equal(
      mapMomoPaymentException(
        paymentRow(3, {
          momoReconciliation: {
            disposition: "success",
            settlementStatus,
            transactionId: "30001",
          },
        }),
      ),
      null,
    );
  }
});

test("stored reviewing and refunded metadata remain visible as evidence", () => {
  const reviewing = mapMomoPaymentException(
    paymentRow(4, {
      momoReview: {
        status: "reviewing",
        reviewedAt: "2026-07-13T03:30:00.000Z",
        reviewedBy: "owner-user-id",
        transactionId: "40001",
      },
    }),
  );
  const refunded = mapMomoPaymentException(
    paymentRow(5, {
      momoReview: {
        status: "refunded",
        reviewedAt: "2026-07-13T04:00:00.000Z",
        reviewedBy: "owner-user-id",
        transactionId: "50001",
        resolutionReference: "REFUND-50001",
      },
    }),
  );

  assert.ok(reviewing);
  assert.equal(reviewing.reviewStatus, "reviewing");
  assert.equal(reviewing.transactionId, "40001");
  assert.ok(refunded);
  assert.equal(refunded.reviewStatus, "refunded");
  assert.equal(refunded.resolutionReference, "REFUND-50001");
  assert.deepEqual(refunded.reasons, []);
});

test("invalid zero transaction evidence stays visible but cannot be closed", () => {
  const mapped = mapMomoPaymentException(
    paymentRow(6, {
      lateSuccessRequiresReview: true,
      transactionId: "0",
      momoReconciliation: { transactionId: 0 },
    }),
  );

  assert.ok(mapped);
  assert.equal(mapped.transactionId, null);
});

test("invalid higher-priority conflict evidence never falls through to another transaction", () => {
  const mapped = mapMomoPaymentException(
    paymentRow(61, {
      lateSuccessRequiresReview: true,
      conflictingTransactionId: "0",
      transactionId: "61001",
      momoReconciliation: { transactionId: "61002" },
    }),
  );

  assert.ok(mapped);
  assert.equal(mapped.transactionId, null);
});

test("MoMo exception queue sorts open, reviewing, refunded then newest", () => {
  const openOld = mapMomoPaymentException(
    paymentRow(
      7,
      { lateSuccessRequiresReview: true, transactionId: "70001" },
      "2026-07-13T02:00:00.000Z",
    ),
  );
  const openNew = mapMomoPaymentException(
    paymentRow(
      8,
      { lateSuccessRequiresReview: true, transactionId: "80001" },
      "2026-07-13T05:00:00.000Z",
    ),
  );
  const reviewing = mapMomoPaymentException(
    paymentRow(9, {
      momoReview: { status: "reviewing", transactionId: "90001" },
    }),
  );
  const refunded = mapMomoPaymentException(
    paymentRow(10, {
      momoReview: { status: "refunded", transactionId: "100001" },
    }),
  );
  assert.ok(openOld && openNew && reviewing && refunded);

  assert.deepEqual(
    sortMomoPaymentExceptions([refunded, openOld, reviewing, openNew]).map(
      (item) => item.paymentId,
    ),
    [8, 7, 9, 10],
  );
});

test("MoMo exception loader is tenant-scoped and bounded", () => {
  const source = read(
    "apps/web/app/(protected)/finance/_lib/momo-payment-exceptions.ts",
  );

  assert.match(source, /\.from\("payments"\)/);
  assert.match(source, /\.eq\("tenant_id", claims\.tenant_id\)/);
  assert.match(source, /\.eq\("method", "momo"\)/);
  assert.match(source, /\.limit\(MOMO_PAYMENT_SCAN_LIMIT\)/);
  assert.match(source, /MOMO_PAYMENT_SCAN_LIMIT = 200/);
});

test("MoMo review action validates evidence and delegates the atomic write to RPC", () => {
  const source = read(
    "apps/web/app/(protected)/finance/momo-payment-review-actions.ts",
  );

  assert.match(source, /getAuthContextWithPermission\(/);
  assert.match(source, /const OWNER_ROLES[^;]+\["owner"\]/s);
  assert.match(source, /review_momo_payment_exception/);
  assert.match(source, /p_expected_transaction_id:/);
  assert.match(source, /p_resolution_reference:/);
  assert.match(source, /\.superRefine\(/);
  assert.doesNotMatch(source, /\.update\(/);
});

test("MoMo exception UI is a responsive owner-gated reconciliation surface", () => {
  const component = read(
    "apps/web/app/(protected)/finance/bank-transactions/momo-payment-exceptions-table.tsx",
  );
  const page = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );

  assert.match(component, /<DataTable/);
  assert.match(component, /mobileCardRender=/);
  assert.match(component, /if \(!canReview\)/);
  assert.match(component, /await confirm\(/);
  assert.match(component, /variant: "destructive"/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(page, /fetchMomoPaymentExceptions\(\)/);
  assert.match(page, /<MomoPaymentExceptionsTable/);
  assert.match(page, /canReview=\{canLinkPayments\}/);
});
