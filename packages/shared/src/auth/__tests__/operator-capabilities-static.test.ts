import test from "node:test";
import assert from "node:assert/strict";
import { resolveOperatorTiles } from "../operator-capabilities";

test("resolveOperatorTiles -> cashier sees floor tools but not kitchen or branch control", () => {
  const groups = resolveOperatorTiles("cashier", 7);
  const groupIds = groups.map((group) => group.id);

  assert.ok(groupIds.includes("my_shift"));
  assert.ok(groupIds.includes("floor"));
  assert.equal(groupIds.includes("kitchen"), false);
  assert.equal(groupIds.includes("branch_control"), false);

  const floor = groups.find((group) => group.id === "floor");
  const pos = floor?.tiles.find((tile) => tile.moduleKey === "pos");
  assert.equal(pos?.href, "/br/7/pos");
});

test("resolveOperatorTiles -> chef sees kitchen tools but not POS", () => {
  const groups = resolveOperatorTiles("chef", 7);
  const groupIds = groups.map((group) => group.id);
  const moduleKeys = groups.flatMap((group) =>
    group.tiles.map((tile) => tile.moduleKey),
  );

  assert.ok(groupIds.includes("kitchen"));
  assert.ok(moduleKeys.includes("kds"));
  assert.ok(moduleKeys.includes("runner"));
  assert.equal(moduleKeys.includes("pos"), false);
});

test("resolveOperatorTiles -> branch manager sees branch control", () => {
  const groups = resolveOperatorTiles("branch_manager", 3);
  const control = groups.find((group) => group.id === "branch_control");
  const moduleKeys = control?.tiles.map((tile) => tile.moduleKey) ?? [];

  assert.ok(moduleKeys.includes("branch_dashboard"));
  assert.ok(moduleKeys.includes("branch_menu_limits"));
  assert.equal(
    control?.tiles.find((tile) => tile.moduleKey === "branch_settings")?.href,
    "/br/3/settings",
  );
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
