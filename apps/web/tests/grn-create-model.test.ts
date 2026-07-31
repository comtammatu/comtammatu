import assert from "node:assert/strict";
import test from "node:test";
import {
  getGrnLocationKindLabel,
  pickGrnReceivingLocation,
  resolveSoleGrnWarehouseLocation,
  type GrnCreateProcurementLocationOption,
} from "../lib/inventory/grn-create-model";

const locations: GrnCreateProcurementLocationOption[] = [
  {
    id: 10,
    name: "Kho sau",
    branchId: 1,
    branchName: "Nguyễn Hữu Thọ",
    branchKind: "branch",
    kind: "warehouse",
    isDefaultReceive: true,
    isDefaultConsumption: false,
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
  {
    id: 21,
    name: "Kho",
    branchId: 2,
    branchName: "Bếp trung tâm",
    branchKind: "central_kitchen",
    kind: "warehouse",
    isDefaultReceive: true,
    isDefaultConsumption: true,
  },
];

test("GRN create model resolves only the site's sole warehouse", () => {
  assert.equal(pickGrnReceivingLocation(locations, 1)?.id, 10);
  assert.equal(pickGrnReceivingLocation(locations, 2)?.id, 21);
  assert.equal(pickGrnReceivingLocation([], 1), null);
  assert.equal(
    pickGrnReceivingLocation(
      [
        ...locations,
        {
          ...locations[0]!,
          id: 11,
        },
      ],
      1,
    ),
    null,
  );
});

test("GRN warehouse resolution accepts exactly one active warehouse", () => {
  assert.deepEqual(resolveSoleGrnWarehouseLocation([{ id: 10 }]), {
    status: "resolved",
    locationId: 10,
  });
});

test("GRN warehouse resolution rejects a branch without an active warehouse", () => {
  assert.deepEqual(resolveSoleGrnWarehouseLocation([]), {
    status: "missing",
  });
});

test("GRN warehouse resolution rejects ambiguous active warehouses", () => {
  assert.deepEqual(resolveSoleGrnWarehouseLocation([{ id: 10 }, { id: 11 }]), {
    status: "ambiguous",
  });
});

test("GRN create model exposes contextual receiving labels", () => {
  assert.equal(getGrnLocationKindLabel(locations[0]!), "Kho");
  assert.equal(getGrnLocationKindLabel(locations[1]!), "Kho sản xuất");
});
