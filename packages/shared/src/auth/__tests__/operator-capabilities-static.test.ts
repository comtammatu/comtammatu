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

test("resolveOperatorTiles -> approvals group dissolves into the hub queue, not a domain tile group (V2)", () => {
  const groups = resolveOperatorTiles("branch_manager", 3);
  const groupIds = groups.map((group) => group.id);

  assert.equal(groupIds.includes("approvals"), false);
  assert.equal(
    groups.flatMap((group) => group.tiles.map((tile) => tile.href)).includes(
      "/br/3/shift/checkout-approvals",
    ),
    false,
  );
  assert.equal(
    groups.flatMap((group) => group.tiles.map((tile) => tile.href)).includes(
      "/br/3/stock/count-slips",
    ),
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

test("resolveOperatorTiles -> office has no operator plane tiles", () => {
  assert.deepEqual(resolveOperatorTiles("office", 1), []);
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

test("resolveOperatorTiles -> central_supply/central_kitchen branchKind hides sales_kitchen and adds PO tile", () => {
  for (const branchKind of ["central_supply", "central_kitchen"] as const) {
    for (const role of ["warehouse_manager", "production_manager"] as const) {
      const groups = resolveOperatorTiles(role, 15, branchKind);
      const groupIds = groups.map((group) => group.id);
      const stock = groups.find((group) => group.id === "stock");

      assert.equal(groupIds.includes("sales_kitchen"), false, `${role}/${branchKind}`);
      assert.ok(
        stock?.tiles.some(
          (tile) => tile.href === "/br/15/stock/purchase-orders",
        ),
        `${role}/${branchKind} must see the purchase-orders tile`,
      );
    }

    const ownerGroups = resolveOperatorTiles("owner", 15, branchKind);
    const ownerStock = ownerGroups.find((group) => group.id === "stock");
    assert.equal(
      ownerGroups.map((group) => group.id).includes("sales_kitchen"),
      false,
      `owner/${branchKind}`,
    );
    assert.ok(
      ownerStock?.tiles.some(
        (tile) => tile.href === "/br/15/stock/purchase-orders",
      ),
      `owner/${branchKind} must see the purchase-orders tile`,
    );
  }
});

test("resolveOperatorTiles -> default branchKind ('branch') keeps sales_kitchen and omits the PO tile", () => {
  const groups = resolveOperatorTiles("owner", 3, "branch");
  const groupIds = groups.map((group) => group.id);
  const stock = groups.find((group) => group.id === "stock");

  assert.ok(groupIds.includes("sales_kitchen"));
  assert.equal(
    stock?.tiles.some((tile) => tile.href === "/br/3/stock/purchase-orders"),
    false,
  );
});

test("resolveOperatorTiles -> operator hub does not duplicate office workspace links", () => {
  const groups = resolveOperatorTiles("owner", 3);
  const groupIds = groups.map((group) => String(group.id));
  const hrefs = groups.flatMap((group) => group.tiles.map((tile) => tile.href));

  assert.equal(groupIds.includes("office_bridge"), false);
  assert.equal(hrefs.includes("/menu"), false);
  assert.equal(hrefs.includes("/hr"), false);
  assert.equal(hrefs.includes("/inventory"), false);
  assert.equal(hrefs.includes("/inventory/production"), false);
});

test("resolveOperatorTiles -> production tile is native under stock at central_kitchen, not office_bridge", () => {
  const groups = resolveOperatorTiles("production_manager", 15, "central_kitchen");
  const groupIds = groups.map((group) => String(group.id));
  const stock = groups.find((group) => group.id === "stock");

  assert.equal(groupIds.includes("office_bridge"), false);

  const productionTile = stock?.tiles.find(
    (tile) => tile.href === "/br/15/stock/production",
  );
  assert.ok(productionTile, "production_manager must see native production tile");
  assert.equal(productionTile?.label, "Sản xuất");
});

test("resolveOperatorTiles -> production tile renders at central_kitchen and branch, never at central_supply (D068)", () => {
  // D068: branch runs production, so the "Sản xuất" tile is now curated for
  // `branch` too. It must still never appear at `central_supply` (Kho Tổng).
  for (const branchKind of ["central_kitchen", "branch"] as const) {
    for (const role of ["owner", "production_manager"] as const) {
      const groups = resolveOperatorTiles(role, 15, branchKind);
      const hrefs = groups.flatMap((group) =>
        group.tiles.map((tile) => tile.href),
      );
      assert.equal(
        hrefs.includes("/br/15/stock/production"),
        true,
        `${role}/${branchKind} must see production tile`,
      );
    }
  }

  for (const role of ["owner", "production_manager"] as const) {
    const groups = resolveOperatorTiles(role, 15, "central_supply");
    const hrefs = groups.flatMap((group) =>
      group.tiles.map((tile) => tile.href),
    );
    assert.equal(
      hrefs.includes("/br/15/stock/production"),
      false,
      `${role}/central_supply must not see production tile`,
    );
  }
});

test("resolveOperatorTiles -> central-site stock groups are curated whitelists (D066)", () => {
  const supplyStock = resolveOperatorTiles("owner", 15, "central_supply").find(
    (group) => group.id === "stock",
  );
  assert.deepEqual(
    supplyStock?.tiles.map((tile) => tile.label),
    [
      "Tồn kho",
      "Nhận hàng",
      "Chuyển hàng",
      "Kiểm kê",
      "Báo hao hụt",
      "Trả hàng NCC",
      "Phiếu nhập",
      "Đơn đặt hàng",
      "Danh mục",
    ],
  );

  const kitchenStock = resolveOperatorTiles(
    "owner",
    15,
    "central_kitchen",
  ).find((group) => group.id === "stock");
  assert.deepEqual(
    kitchenStock?.tiles.map((tile) => tile.label),
    [
      "Sản xuất",
      "Tồn kho",
      "Nhận hàng",
      "Chuyển hàng",
      "Kiểm kê",
      "Báo hao hụt",
      "Phiếu nhập",
      "Đơn đặt hàng",
    ],
  );
});

test("resolveOperatorTiles -> office_bridge group is retired", () => {
  for (const branchKind of ["central_supply", "central_kitchen"] as const) {
    const groupIds = resolveOperatorTiles("owner", 15, branchKind).map(
      (group) => String(group.id),
    );
    assert.equal(groupIds.includes("office_bridge"), false, branchKind);
  }

  const branchGroupIds = resolveOperatorTiles("owner", 3, "branch").map(
    (group) => String(group.id),
  );
  assert.equal(branchGroupIds.includes("office_bridge"), false);
});

test("resolveOperatorTiles -> transfer tile reads as dispatch at central sites, request at branches", () => {
  const branchStock = resolveOperatorTiles("branch_manager", 3, "branch").find(
    (group) => group.id === "stock",
  );
  assert.deepEqual(
    branchStock?.tiles
      .filter((tile) => tile.href === "/br/3/stock/transfer")
      .map((tile) => tile.label),
    ["Yêu cầu hàng"],
  );

  const supplyStock = resolveOperatorTiles(
    "warehouse_manager",
    15,
    "central_supply",
  ).find((group) => group.id === "stock");
  assert.deepEqual(
    supplyStock?.tiles
      .filter((tile) => tile.href === "/br/15/stock/transfer")
      .map((tile) => tile.label),
    ["Chuyển hàng"],
  );
});

test("resolveOperatorTiles -> orders tile is branch-native under sales_kitchen, not office_bridge", () => {
  const groups = resolveOperatorTiles("owner", 3);
  const groupIds = groups.map((group) => String(group.id));
  const salesKitchen = groups.find((group) => group.id === "sales_kitchen");

  assert.equal(groupIds.includes("office_bridge"), false);

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
