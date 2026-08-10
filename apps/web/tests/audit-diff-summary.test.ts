import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAuditDiff } from "@comtammatu/shared/messages";

test("summarizeAuditDiff lists whitelisted changed fields only", () => {
  const fields = summarizeAuditDiff(
    { status: "draft", password: "secret", note: "a" },
    { status: "confirmed", password: "secret2", note: "a", unknown_blob: 1 },
  );
  assert.deepEqual(fields, [
    {
      key: "status",
      label: "Trạng thái",
      from: "draft",
      to: "confirmed",
    },
  ]);
});

test("summarizeAuditDiff skips unchanged and sensitive keys", () => {
  const fields = summarizeAuditDiff(
    { payment_method: "cash", api_key: "x", amount: 10 },
    { payment_method: "transfer", api_key: "y", amount: 10 },
  );
  assert.equal(fields.length, 1);
  assert.equal(fields[0]?.key, "payment_method");
  assert.equal(fields[0]?.from, "cash");
  assert.equal(fields[0]?.to, "transfer");
});

test("summarizeAuditDiff accepts null sides", () => {
  const fields = summarizeAuditDiff(null, { status: "issued" });
  assert.equal(fields.length, 1);
  assert.equal(fields[0]?.from, null);
  assert.equal(fields[0]?.to, "issued");
});
