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
  const moduleKeys = groups.flatMap((group) =>
    group.tiles.map((tile) => tile.moduleKey),
  );
  const hrefs = groups.flatMap((group) => group.tiles.map((tile) => tile.href));

  assert.equal(hrefs.includes("/br/3/stock"), true);
  assert.equal(hrefs.includes("/br/3/stock/transfer?queue=receive"), false);
  assert.equal(hrefs.includes("/br/3/stock/transfer"), false);
  assert.equal(hrefs.includes("/br/3/stock/stocktake"), true);
  assert.equal(hrefs.includes("/br/3/stock/consumption"), true);
  assert.equal(hrefs.includes("/br/3/stock/waste"), false);
  assert.equal(moduleKeys.includes("branch_dashboard"), false);
  assert.equal(moduleKeys.includes("branch_settings"), false);
});

test("resolveOperatorTiles -> approvals group dissolves into the hub queue, not a domain tile group (V2)", () => {
  const groups = resolveOperatorTiles("branch_manager", 3);
  const groupIds = groups.map((group) => group.id);

  assert.equal(groupIds.includes("approvals"), false);
  assert.equal(
    groups
      .flatMap((group) => group.tiles.map((tile) => tile.href))
      .includes("/br/3/shift/checkout-approvals"),
    false,
  );
  assert.equal(
    groups
      .flatMap((group) => group.tiles.map((tile) => tile.href))
      .includes("/br/3/stock/count-slips"),
    false,
  );
});

test("resolveOperatorTiles -> domain groups render Bán hàng, Nhân sự, Kho hàng in that order", () => {
  const groups = resolveOperatorTiles("branch_manager", 3);
  const groupIds = groups.map((group) => group.id);

  assert.deepEqual(groupIds, ["sales_kitchen", "my_shift", "stock"]);
  assert.equal(
    groups.find((group) => group.id === "sales_kitchen")?.title,
    "Bán hàng",
  );
  assert.equal(
    groups.find((group) => group.id === "my_shift")?.title,
    "Nhân sự",
  );
  assert.equal(groups.find((group) => group.id === "stock")?.title, "Kho hàng");
});

test("resolveOperatorTiles -> branch staff sees shift tools only", () => {
  const groups = resolveOperatorTiles("branch_staff", 7);
  const moduleKeys = groups.flatMap((group) =>
    group.tiles.map((tile) => tile.moduleKey),
  );

  assert.ok(moduleKeys.includes("operator_home"));
  assert.equal(moduleKeys.includes("pos"), false);
  assert.equal(moduleKeys.includes("kds"), false);
  assert.equal(moduleKeys.includes("orders"), false);
  assert.equal(moduleKeys.includes("finance"), false);
});

test("resolveOperatorTiles -> drops empty groups", () => {
  assert.equal(
    resolveOperatorTiles("chef", 1).every((group) => group.tiles.length > 0),
    true,
  );
});

test("resolveOperatorTiles -> default branchKind keeps sales and omits retired PO", () => {
  const groups = resolveOperatorTiles("owner", 3, "branch");
  const groupIds = groups.map((group) => group.id);
  const stock = groups.find((group) => group.id === "stock");

  assert.ok(groupIds.includes("sales_kitchen"));
  assert.equal(
    stock?.tiles.some((tile) => tile.href === "/br/3/stock/purchase-orders"),
    false,
  );
});

test("resolveOperatorTiles -> retired supplier returns stay out of the branch tiles", () => {
  const tiles = resolveOperatorTiles("owner", 3, "branch").flatMap(
    (group) => group.tiles,
  );

  assert.equal(
    tiles.some(
      (tile) =>
        tile.href.includes("supplier-returns") || tile.label === "Trả hàng NCC",
    ),
    false,
  );
});

test("resolveOperatorTiles -> operator hub does not duplicate Admin Dashboard workspace links", () => {
  const groups = resolveOperatorTiles("owner", 3);
  const hrefs = groups.flatMap((group) => group.tiles.map((tile) => tile.href));

  assert.equal(hrefs.includes("/menu"), false);
  assert.equal(hrefs.includes("/hr"), false);
  assert.equal(hrefs.includes("/inventory"), false);
  assert.equal(hrefs.includes("/inventory/production"), false);
});

test("resolveOperatorTiles -> production tile is native under Branch stock (D068)", () => {
  for (const role of ["owner", "branch_manager"] as const) {
    const groups = resolveOperatorTiles(role, 3, "branch");
    const stock = groups.find((group) => group.id === "stock");

    const productionTile = stock?.tiles.find(
      (tile) => tile.href === "/br/3/stock/production",
    );
    assert.ok(productionTile, `${role} must see native production tile`);
    assert.equal(productionTile?.label, "Sản xuất");
  }
});

test("resolveOperatorTiles -> branch stock group renders the branch tile set", () => {
  const branchStock = resolveOperatorTiles("owner", 3, "branch").find(
    (group) => group.id === "stock",
  );
  assert.deepEqual(
    branchStock?.tiles.map((tile) => tile.label),
    [
      "Quản lý tồn kho",
      "Nhập hàng",
      "Sản xuất",
      "Kiểm tồn",
      "Phân công đếm tồn",
      "Tiêu hao",
    ],
  );
});

test("resolveOperatorTiles -> branch kitchen transfer tile is retired", () => {
  const groups = resolveOperatorTiles("branch_manager", 3, "branch");
  const hrefs = groups.flatMap((group) => group.tiles.map((tile) => tile.href));
  assert.equal(hrefs.includes("/br/3/stock/transfer"), false);
  assert.equal(
    groups
      .find((group) => group.id === "stock")
      ?.tiles.some((tile) => tile.label === "Điều chuyển"),
    false,
  );
});

test("resolveOperatorTiles -> orders tile is Branch-native under sales_kitchen", () => {
  const groups = resolveOperatorTiles("owner", 3);
  const salesKitchen = groups.find((group) => group.id === "sales_kitchen");

  const ordersTile = salesKitchen?.tiles.find(
    (tile) => tile.moduleKey === "orders",
  );
  assert.equal(ordersTile?.href, "/br/3/orders");
});

test("resolveOperatorTiles -> cashier sees the branch-native orders tile", () => {
  const groups = resolveOperatorTiles("cashier", 7);
  const salesKitchen = groups.find((group) => group.id === "sales_kitchen");
  const ordersTile = salesKitchen?.tiles.find(
    (tile) => tile.moduleKey === "orders",
  );
  assert.equal(ordersTile?.href, "/br/7/orders");
});
