import assert from "node:assert/strict";
import { test } from "node:test";
import { VietQRProvider } from "../impl/vietqr";

test("VietQRProvider uses generated payment code as transfer memo", async () => {
  const provider = new VietQRProvider({
    apiKey: "",
    bankAccount: "19035551234567",
    bankCode: "TCB",
    accountName: "HO KINH DOANH COM TAM MA TU",
  });

  const result = await provider.createPayment({
    tenantId: 1,
    orderId: 42,
    orderNumber: "000123",
    amount: 125_000,
  });

  assert.equal(result.status, "pending");
  assert.match(result.providerRef ?? "", /^DH \d{6} [A-Z0-9]{5}$/);
  assert.equal(result.providerData?.description, result.providerRef);

  const qrUrl = new URL(result.qrData ?? "");
  assert.equal(qrUrl.searchParams.get("amount"), "125000");
  assert.equal(qrUrl.searchParams.get("addInfo"), result.providerRef);
});
