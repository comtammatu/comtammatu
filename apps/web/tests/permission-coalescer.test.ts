import assert from "node:assert/strict";
import { test } from "node:test";
import { createPermissionCoalescer } from "../app/_lib/permission-coalescer";

test("layout, page, and helper overlapping sets in one wave share one batch RPC", async () => {
  const calls: string[][] = [];
  const coalescer = createPermissionCoalescer(async (items) => {
    calls.push(items.map((item) => item.key));
    return items.map(() => true);
  });

  const layout = Promise.all([
    coalescer.probe("layout:a", null),
    coalescer.probe("shared:b", null),
  ]);
  const page = Promise.all([
    coalescer.probe("shared:b", null),
    coalescer.probe("page:c", null),
  ]);
  const helper = coalescer.probe("layout:a", null);
  const [layoutResult, pageResult, helperResult] = await Promise.all([
    layout,
    page,
    helper,
  ]);

  assert.equal(calls.length, 1);
  assert.deepEqual(
    new Set(calls[0]),
    new Set(["layout:a", "shared:b", "page:c"]),
  );
  assert.deepEqual(layoutResult, [true, true]);
  assert.deepEqual(pageResult, [true, true]);
  assert.equal(helperResult, true);
});

test("overlapping permission sets in one wave share one batch RPC", async () => {
  const calls: Array<Array<{ key: string; branchId: number | null }>> = [];
  const coalescer = createPermissionCoalescer(async (items) => {
    calls.push(items.map((item) => ({ key: item.key, branchId: item.branchId })));
    return items.map((item) => item.key !== "deny");
  });

  const [a, b, c, aAgain, deny] = await Promise.all([
    coalescer.probe("inventory:read", null),
    coalescer.probe("finance:view", null),
    coalescer.probe("pos:use", 3),
    coalescer.probe("inventory:read", null),
    coalescer.probe("deny", null),
  ]);

  assert.equal(calls.length, 1);
  const batch = calls[0];
  assert.ok(batch);
  assert.deepEqual(
    new Set(batch.map((item) => `${item.key}:${String(item.branchId)}`)),
    new Set([
      "inventory:read:null",
      "finance:view:null",
      "pos:use:3",
      "deny:null",
    ]),
  );
  assert.equal(a, true);
  assert.equal(b, true);
  assert.equal(c, true);
  assert.equal(aAgain, true);
  assert.equal(deny, false);
});

test("sequential waves pay at most one extra RPC for new keys", async () => {
  const calls: string[][] = [];
  const coalescer = createPermissionCoalescer(async (items) => {
    calls.push(items.map((item) => item.key));
    return items.map(() => true);
  });

  await coalescer.probe("layout:a", null);
  await coalescer.probe("page:c", null);
  const layoutAgain = await coalescer.probe("layout:a", null);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["layout:a"]);
  assert.deepEqual(calls[1], ["page:c"]);
  assert.equal(layoutAgain, true);
});

test("batch result order maps after duplicate collapse", async () => {
  const coalescer = createPermissionCoalescer(async (items) => {
    return items.map((item) => item.key === "allow");
  });

  const [first, second, third] = await Promise.all([
    coalescer.probe("allow", 1),
    coalescer.probe("deny", 1),
    coalescer.probe("allow", 1),
  ]);

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(third, true);
});
