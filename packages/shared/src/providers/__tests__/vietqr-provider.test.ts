import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBankBin, VietQRProvider } from "../impl/vietqr";

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
  assert.match(result.providerRef ?? "", /^DH[A-Z0-9]{10}$/);
  assert.equal(result.providerData?.description, result.providerRef);
  assert.equal(result.providerData?.bankBin, "970407");

  assert.match(result.qrData ?? "", /^000201/);
  assert.doesNotMatch(result.qrData ?? "", /^https?:\/\//);
  assert.match(result.qrData ?? "", /970407/);
  assert.match(result.qrData ?? "", /125000/);
  assert.match(result.qrData ?? "", /DH[A-Z0-9]{10}/);
});

test("resolveBankBin covers current VietQR transfer bank codes used by POS", () => {
  const cases: Record<string, string> = {
    ABB: "970425",
    MB: "970422",
    OCB: "970448",
    VIB: "970441",
    SEAB: "970440",
    CIMB: "422589",
    WVN: "970457",
    CAKE: "546034",
    UBANK: "546035",
  };

  for (const [code, bin] of Object.entries(cases)) {
    assert.equal(resolveBankBin(code), bin);
  }
});
