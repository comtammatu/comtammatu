import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  pickDefaultStaffCountLocationId,
  selectStaffCountLocations,
} from "../lib/inventory/staff-count-location";

test("selectStaffCountLocations keeps only kitchen after a branch split", () => {
  const rows = [
    { id: 91, location_kind: "warehouse" },
    { id: 204, location_kind: "kitchen" },
  ];

  assert.deepEqual(selectStaffCountLocations(rows), [
    { id: 204, location_kind: "kitchen" },
  ]);
});

test("selectStaffCountLocations keeps warehouse when the branch has no kitchen", () => {
  const rows = [{ id: 17, location_kind: "warehouse" }];

  assert.deepEqual(selectStaffCountLocations(rows), rows);
});

test("pickDefaultStaffCountLocationId prefers kitchen and ignores a warehouse URL after split", () => {
  const locations = selectStaffCountLocations([
    { id: 91, location_kind: "warehouse", kind: "warehouse" },
    { id: 204, location_kind: "kitchen", kind: "kitchen" },
  ]);

  assert.equal(pickDefaultStaffCountLocationId(locations, null), 204);
  assert.equal(pickDefaultStaffCountLocationId(locations, 204), 204);
  assert.equal(
    pickDefaultStaffCountLocationId(locations, 91),
    204,
    "warehouse is not a staff-count location after split",
  );
});

test("branch count assignment loader uses the shared kitchen-after-split picker", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "lib/inventory/branch-count-assignment-data.ts",
    ),
    "utf8",
  );

  assert.match(source, /selectStaffCountLocations/);
  assert.match(source, /pickDefaultStaffCountLocationId/);
  assert.match(source, /\.in\("location_kind", \["warehouse", "kitchen"\]\)/);
  assert.doesNotMatch(source, /\.in\("location_kind", \["warehouse"\]\)/);
});
