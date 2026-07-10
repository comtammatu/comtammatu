import assert from "node:assert/strict";
import test from "node:test";
import {
  getGrnLocationKindLabel,
  isSameGrnReferenceCost,
  pickGrnReceivingLocation,
  type GrnCreateProcurementLocationOption,
} from "../lib/inventory/grn-create-model";

const locations: GrnCreateProcurementLocationOption[] = [
  {
    id: 10,
    name: "Kho sau",
    branchId: 1,
    branchName: "Phước Hải",
    branchKind: "branch",
    kind: "warehouse",
    isDefaultReceive: true,
    isDefaultConsumption: false,
  },
  {
    id: 11,
    name: "Bếp nóng",
    branchId: 1,
    branchName: "Phước Hải",
    branchKind: "branch",
    kind: "kitchen",
    isDefaultReceive: false,
    isDefaultConsumption: true,
  },
  {
    id: 20,
    name: "Kho SX",
    branchId: 2,
    branchName: "Bếp trung tâm",
    branchKind: "central_kitchen",
    kind: "production_storage",
    isDefaultReceive: true,
    isDefaultConsumption: false,
  },
];

test("GRN create model keeps a branch receipt on its warehouse and honors draft location", () => {
  assert.equal(pickGrnReceivingLocation(locations, 1)?.id, 10);
  assert.equal(pickGrnReceivingLocation(locations, 1, 11)?.id, 11);
  assert.equal(pickGrnReceivingLocation(locations, 2)?.id, 20);
  assert.equal(pickGrnReceivingLocation([], 1), null);
});

test("GRN create model exposes contextual receiving labels and stable cost comparison", () => {
  assert.equal(getGrnLocationKindLabel(locations[0]!), "Kho");
  assert.equal(getGrnLocationKindLabel(locations[1]!), "Bếp");
  assert.equal(isSameGrnReferenceCost(10000, { value: 10000.005 }), true);
  assert.equal(isSameGrnReferenceCost(10000, { value: 10000.02 }), false);
  assert.equal(isSameGrnReferenceCost(10000, null), false);
});
