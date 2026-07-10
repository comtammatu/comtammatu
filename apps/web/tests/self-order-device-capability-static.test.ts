import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(process.cwd(), "lib/self-order/device-capability.ts"),
  "utf8",
);

test("self-order device capability uses an opaque hardened cookie", () => {
  assert.match(source, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(source, /createHmac\("sha256", devicePepper\(\)\)/);
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: "lax"/);
  assert.match(source, /path: "\/api\/self-order"/);
  assert.match(source, /SELF_ORDER_DEVICE_PEPPER is required in production/);
});

test("self-order mutations require JSON, custom header, and same-origin proof", () => {
  assert.match(source, /startsWith\("application\/json"\)/);
  assert.match(source, /SELF_ORDER_MUTATION_HEADER\) !== "1"/);
  assert.match(source, /origin === request\.nextUrl\.origin/);
  assert.match(source, /sec-fetch-site"\) === "same-origin"/);
  assert.match(source, /getClientIp\(request\.headers\)/);
});

test("cookie-varying self-order responses are never shared-cacheable", () => {
  assert.match(source, /Cache-Control", "private, no-store, max-age=0"/);
  assert.match(source, /Vary", "Cookie"/);
});
