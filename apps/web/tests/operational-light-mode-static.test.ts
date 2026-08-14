import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("operational and guest surfaces strictly enforce light mode without theme toggles", () => {
  const kdsLayout = read("app/(protected)/br/[branchId]/kds/layout.tsx");
  const kdsHeader = read(
    "app/(protected)/br/[branchId]/kds/_components/board-header.tsx",
  );
  const posLayout = read("app/(protected)/br/[branchId]/pos/layout.tsx");
  const posHeader = read(
    "app/(protected)/br/[branchId]/pos/pos-session-header.tsx",
  );
  const pickupLayout = read("app/(protected)/br/[branchId]/pickup/layout.tsx");
  const selfOrderClient = read("app/q/[token]/self-order-client.tsx");
  const invoicePage = read("app/q/invoice/[token]/page.tsx");

  // KDS checks
  assert.match(kdsLayout, /theme-light-only/);
  assert.match(kdsLayout, /<ForceLightMode/);
  assert.doesNotMatch(kdsHeader, /ThemeMenuItem/);
  assert.doesNotMatch(kdsHeader, /ThemeToggle/);

  // POS checks
  assert.match(posLayout, /theme-light-only/);
  assert.match(posLayout, /<ForceLightMode/);
  assert.doesNotMatch(posHeader, /ThemeMenuItem/);
  assert.doesNotMatch(posHeader, /ThemeToggle/);

  // Pickup checks
  assert.match(pickupLayout, /theme-light-only/);
  assert.match(pickupLayout, /PickupLightMode|ForceLightMode/);

  // Self-Order checks
  assert.match(selfOrderClient, /theme-light-only/);
  assert.match(selfOrderClient, /<ForceLightMode/);
  assert.doesNotMatch(selfOrderClient, /<ThemeToggle/);

  // Invoice checks
  assert.match(invoicePage, /theme-light-only/);
  assert.match(invoicePage, /<ForceLightMode/);
});
