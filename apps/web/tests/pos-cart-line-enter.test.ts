import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  deriveJustAddedCartKeys,
  getCartLineEnterClass,
} from "../app/(protected)/br/[branchId]/pos/_lib/cart-line-enter";

const cartPaneSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx",
  ),
  "utf8",
);

test("first observation primes without flashing the initial cart", () => {
  const { nextKnownKeys, addedKeys } = deriveJustAddedCartKeys(null, [
    "a",
    "b",
  ]);
  assert.deepEqual(addedKeys, []);
  assert.deepEqual([...nextKnownKeys].sort(), ["a", "b"]);
});

test("a brand-new line key enters once", () => {
  const { addedKeys } = deriveJustAddedCartKeys(new Set(["a"]), ["a", "b"]);
  assert.deepEqual(addedKeys, ["b"]);
});

test("quantity++ reuses the existing key and does not replay the enter", () => {
  // The store merges quantity onto the same key, so the key set is unchanged.
  const { addedKeys } = deriveJustAddedCartKeys(new Set(["a"]), ["a"]);
  assert.deepEqual(addedKeys, []);
});

test("removing a line never enters and drops the key from known", () => {
  const { nextKnownKeys, addedKeys } = deriveJustAddedCartKeys(
    new Set(["a", "b"]),
    ["a"],
  );
  assert.deepEqual(addedKeys, []);
  assert.ok(!nextKnownKeys.has("b"));
});

test("simultaneous add + remove only enters the added key", () => {
  const { nextKnownKeys, addedKeys } = deriveJustAddedCartKeys(
    new Set(["a", "b"]),
    ["a", "c"],
  );
  assert.deepEqual(addedKeys, ["c"]);
  assert.deepEqual([...nextKnownKeys].sort(), ["a", "c"]);
});

test("enter class is a § G one-shot content enter: fade only, duration-150, no slide", () => {
  const cls = getCartLineEnterClass();
  assert.match(cls, /motion-safe:animate-in/);
  assert.match(cls, /motion-safe:fade-in/);
  assert.match(cls, /motion-safe:duration-150/);
  assert.doesNotMatch(cls, /duration-300/);
  assert.doesNotMatch(cls, /slide-in/);
  assert.doesNotMatch(cls, /transition-all/);
});

test("cart pane wires the one-shot key tracking to the enter class", () => {
  assert.match(cartPaneSource, /deriveJustAddedCartKeys\(/);
  assert.match(cartPaneSource, /getCartLineEnterClass\(\)/);
  assert.match(cartPaneSource, /justAddedKeys\.has\(item\.key\)/);
});
