import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCredentials } from "../redact-credentials";

test("redactCredentials → null/undefined → unchanged", () => {
  assert.equal(redactCredentials(null), null);
  assert.equal(redactCredentials(undefined), undefined);
});

test("redactCredentials → primitive values → unchanged", () => {
  assert.equal(redactCredentials("hello"), "hello");
  assert.equal(redactCredentials(42), 42);
  assert.equal(redactCredentials(true), true);
});

test("redactCredentials → flat object with apiKey → redacted", () => {
  const out = redactCredentials({ apiKey: "sk_live_xxx", mode: "live" });
  assert.deepEqual(out, { apiKey: "[REDACTED]", mode: "live" });
});

test("redactCredentials → snake_case secret keys redacted", () => {
  const out = redactCredentials({
    secret_key: "abc",
    access_key: "def",
    api_key: "ghi",
    other: "kept",
  });
  assert.deepEqual(out, {
    secret_key: "[REDACTED]",
    access_key: "[REDACTED]",
    api_key: "[REDACTED]",
    other: "kept",
  });
});

test("redactCredentials → top-level credentials key replaces whole subtree", () => {
  const out = redactCredentials({
    kind: "vietqr",
    enabled: true,
    credentials: { apiKey: "x", accountNo: "1", accountName: "X" },
  });
  assert.deepEqual(out, {
    kind: "vietqr",
    enabled: true,
    credentials: "[REDACTED]",
  });
});

test("redactCredentials → nested object preserves non-secret structure", () => {
  const out = redactCredentials({
    provider: {
      kind: "vietqr",
      mode: "live",
      apiKey: "sk_live_xxx",
      accountNo: "1234",
    },
  });
  assert.deepEqual(out, {
    provider: {
      kind: "vietqr",
      mode: "live",
      apiKey: "[REDACTED]",
      accountNo: "1234",
    },
  });
});

test("redactCredentials → arrays processed elementwise", () => {
  const out = redactCredentials([
    { secretKey: "a", id: 1 },
    { secretKey: "b", id: 2 },
  ]);
  assert.deepEqual(out, [
    { secretKey: "[REDACTED]", id: 1 },
    { secretKey: "[REDACTED]", id: 2 },
  ]);
});

test("redactCredentials → partnerCode NOT redacted (merchant ID, not secret)", () => {
  const out = redactCredentials({ partnerCode: "PAYMENT_PARTNER_123" });
  assert.deepEqual(out, { partnerCode: "PAYMENT_PARTNER_123" });
});

test("redactCredentials → case-insensitive key matching", () => {
  const out = redactCredentials({ APIKey: "x", AccessKey: "y" });
  assert.deepEqual(out, { APIKey: "[REDACTED]", AccessKey: "[REDACTED]" });
});

test("redactCredentials → password and token redacted", () => {
  const out = redactCredentials({
    user: "admin",
    password: "hunter2",
    token: "jwt.xyz",
  });
  assert.deepEqual(out, {
    user: "admin",
    password: "[REDACTED]",
    token: "[REDACTED]",
  });
});

test("redactCredentials → does not mutate input", () => {
  const input = { apiKey: "secret", mode: "live" };
  const out = redactCredentials(input);
  assert.equal(input.apiKey, "secret");
  assert.equal(out.apiKey, "[REDACTED]");
  assert.notEqual(input, out);
});
