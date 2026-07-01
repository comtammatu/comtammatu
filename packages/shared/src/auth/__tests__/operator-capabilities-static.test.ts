import test from "node:test";
import assert from "node:assert/strict";
import { resolveOperatorTiles } from "../operator-capabilities";

test("resolveOperatorTiles -> cashier sees sales tools but not kitchen", () => {
  const groups = resolveOperatorTiles("cashier", 7);
  const groupIds = groups.map((group) => group.id);

  assert.ok(groupIds.includes("my_shift"));
  assert.ok(groupIds.includes("sales_kitchen"));
  assert.equal(groupIds.includes("stock"), false);

  const salesKitchen = groups.find((group) => group.id === "sales_kitchen");
  const pos = salesKitchen?.tiles.find((tile) => tile.moduleKey === "pos");
  assert.equal(pos?.href, "/br/7/pos");
});

test("resolveOperatorTiles -> chef sees kitchen tools but not POS", () => {
  const groups = resolveOperatorTiles("chef", 7);
  const groupIds = groups.map((group) => group.id);
  const moduleKeys = groups.flatMap((group) =>
    group.tiles.map((tile) => tile.moduleKey),
  );

  assert.ok(groupIds.includes("sales_kitchen"));
  assert.ok(moduleKeys.includes("kds"));
  assert.ok(moduleKeys.includes("runner"));
  assert.equal(moduleKeys.includes("pos"), false);
});

test("resolveOperatorTiles -> branch manager sees branch workflows in operator hub", () => {
  const groups = resolveOperatorTiles("branch_manager", 3);
  const approvals = groups.find((group) => group.id === "approvals");
  const stock = groups.find((group) => group.id === "stock");
  const moduleKeys = groups.flatMap((group) =>
    group.tiles.map((tile) => tile.moduleKey),
  );

  assert.equal(
    approvals?.tiles.find((tile) => tile.moduleKey === "employee_checkout_approvals")
      ?.href,
    "/br/3/shift/checkout-approvals",
  );
  assert.equal(
    approvals?.tiles.find((tile) => tile.href === "/br/3/stock/count-slips")
      ?.label,
    "Duyệt kiểm kê",
  );
  assert.equal(
    stock?.tiles.find((tile) => tile.href === "/br/3/stock/receive")?.label,
    "Nhận hàng",
  );
  assert.equal(moduleKeys.includes("branch_dashboard"), false);
  assert.equal(moduleKeys.includes("branch_settings"), false);
});

test("resolveOperatorTiles -> office has no operator plane tiles", () => {
  assert.deepEqual(resolveOperatorTiles("office", 1), []);
});

test("resolveOperatorTiles -> drops empty groups", () => {
  assert.equal(
    resolveOperatorTiles("chef", 1).every((group) => group.tiles.length > 0),
    true,
  );
});
