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
  const moduleKeys = groups.flatMap((group) =>
    group.tiles.map((tile) => tile.moduleKey),
  );
  const hrefs = groups.flatMap((group) => group.tiles.map((tile) => tile.href));

  assert.equal(
    approvals?.tiles.find(
      (tile) => tile.moduleKey === "employee_checkout_approvals",
    )?.href,
    "/br/3/shift/checkout-approvals",
  );
  assert.equal(
    approvals?.tiles.find((tile) => tile.href === "/br/3/stock/count-slips")
      ?.label,
    "Duyệt kiểm kê",
  );
  assert.equal(
    groups
      .find((group) => group.id === "stock")
      ?.tiles.find((tile) => tile.href === "/br/3/stock/receive")?.label,
    "Nhận hàng",
  );
  assert.equal(hrefs.includes("/br/3/stock"), true);
  assert.equal(hrefs.includes("/br/3/stock/receive"), true);
  assert.equal(hrefs.includes("/br/3/stock/transfer"), true);
  assert.equal(hrefs.includes("/br/3/stock/stocktake"), true);
  assert.equal(hrefs.includes("/br/3/stock/waste"), true);
  assert.equal(moduleKeys.includes("branch_dashboard"), false);
  assert.equal(moduleKeys.includes("branch_settings"), false);
});

test("resolveOperatorTiles -> office has no operator plane tiles", () => {
  assert.deepEqual(resolveOperatorTiles("office", 1), []);
});

test("resolveOperatorTiles -> central-site roles get stock tools without POS/KDS", () => {
  for (const role of ["warehouse_manager", "production_manager"] as const) {
    const groups = resolveOperatorTiles(role, 15);
    const stock = groups.find((group) => group.id === "stock");
    const moduleKeys = groups.flatMap((group) =>
      group.tiles.map((tile) => tile.moduleKey),
    );

    assert.ok(stock, `${role} must get a stock group`);
    assert.ok(
      (stock?.tiles.length ?? 0) > 0,
      `${role} stock group must be non-empty`,
    );
    assert.ok(
      stock?.tiles.some((tile) => tile.href === "/br/15/stock"),
      role,
    );
    assert.equal(moduleKeys.includes("pos"), false, role);
    assert.equal(moduleKeys.includes("kds"), false, role);
    assert.equal(moduleKeys.includes("runner"), false, role);
  }
});

test("resolveOperatorTiles -> drops empty groups", () => {
  assert.equal(
    resolveOperatorTiles("chef", 1).every((group) => group.tiles.length > 0),
    true,
  );
});
