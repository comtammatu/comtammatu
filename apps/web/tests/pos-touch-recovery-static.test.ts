import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const orderDetailRoot =
  "app/(protected)/br/[branchId]/pos/_components/order-detail";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("POS destructive confirmation dialogs keep both actions touch-sized", () => {
  const dialogFiles = [
    "cancel-order-dialog.tsx",
    "void-item-dialog.tsx",
    "void-paid-order-dialog.tsx",
    "reduce-quantity-dialog.tsx",
  ];

  for (const file of dialogFiles) {
    const source = read(`${orderDetailRoot}/${file}`);
    assert.equal(source.match(/actionSize="touch"/g)?.length, 1, file);
  }
});

test("POS reduce quantity stepper keeps both controls touch-sized", () => {
  const source = read(`${orderDetailRoot}/reduce-quantity-dialog.tsx`);

  assert.equal(source.match(/size="icon-touch"/g)?.length, 2);
  assert.doesNotMatch(source, /size="icon"/);
});

test("POS payment recovery controls stay touch-sized and responsive", () => {
  const source = read(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(
    source,
    /size="touch"\s+className="w-full sm:w-auto"\s+onClick=\{\(\) => void handleCancelPendingPayment\(\)\}[\s\S]{0,180}\{SELF_ORDER_VI\.staffCancelPayment\}/,
  );
  assert.match(
    source,
    /size="touch"\s+className="w-full sm:w-auto"\s+onClick=\{\(\) =>\s+handleSelectMethod\(selectedMethod\)\s+\}[\s\S]{0,300}\{REMOTE_PAYMENT_COPY\.retryCreate\}/,
  );
  assert.match(
    source,
    /size="touch"\s+className="self-start text-destructive[^"]*"\s+onClick=\{\(\) => void handleCancelPendingPayment\(\)\}[\s\S]{0,400}\{messages\.pos\.payment\.cancelPending\}/,
  );
});
