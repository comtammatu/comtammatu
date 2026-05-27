import test from "node:test";
import assert from "node:assert/strict";
import { hashIp } from "../ip-hash";

test("hashIp produces stable 64-char hex digest", async () => {
  const h1 = await hashIp("203.0.113.42", "salt-abc-123");
  assert.equal(h1.length, 64);
  assert.match(h1, /^[0-9a-f]{64}$/);

  const h2 = await hashIp("203.0.113.42", "salt-abc-123");
  assert.equal(h1, h2, "same inputs → same hash");
});

test("hashIp same IP + different salt → different hash", async () => {
  const h1 = await hashIp("203.0.113.42", "salt-A");
  const h2 = await hashIp("203.0.113.42", "salt-B");
  assert.notEqual(h1, h2);
});

test("hashIp different IP + same salt → different hash", async () => {
  const h1 = await hashIp("203.0.113.42", "salt-X");
  const h2 = await hashIp("203.0.113.43", "salt-X");
  assert.notEqual(h1, h2);
});

test("hashIp throws on empty inputs", async () => {
  await assert.rejects(() => hashIp("", "salt"), /ip_hash_inputs_required/);
  await assert.rejects(
    () => hashIp("203.0.113.42", ""),
    /ip_hash_inputs_required/,
  );
});
