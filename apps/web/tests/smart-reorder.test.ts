import assert from "node:assert/strict";
import { test } from "node:test";

test("Smart Reorder: detects items below safety stock threshold", () => {
  const ingredients = [
    {
      id: 1,
      name: "Sườn cốt lết",
      onHand: 15,
      branchMinStock: 20,
      globalMinStock: 10,
      reorderQty: 30,
    },
    {
      id: 2,
      name: "Gạo tấm",
      onHand: 60,
      branchMinStock: null,
      globalMinStock: 50,
      reorderQty: null,
    },
    {
      id: 3,
      name: "Trứng gà",
      onHand: 100,
      branchMinStock: 150,
      globalMinStock: 50,
      reorderQty: null,
    },
  ];

  const processed = ingredients.map((item) => {
    const effectiveMin = item.branchMinStock ?? item.globalMinStock;
    const isBelowMin = effectiveMin > 0 && item.onHand <= effectiveMin;
    const suggestedQty = isBelowMin
      ? item.reorderQty ?? Math.max(0, effectiveMin * 2 - item.onHand)
      : 0;
    return {
      ...item,
      effectiveMin,
      isBelowMin,
      suggestedQty,
    };
  });

  // Item 1: onHand 15 <= branchMinStock 20 -> Below min, suggestedQty = 30 (batch qty)
  assert.equal(processed[0]?.isBelowMin, true);
  assert.equal(processed[0]?.effectiveMin, 20);
  assert.equal(processed[0]?.suggestedQty, 30);

  // Item 2: onHand 60 > globalMinStock 50 -> Safe
  assert.equal(processed[1]?.isBelowMin, false);
  assert.equal(processed[1]?.suggestedQty, 0);

  // Item 3: onHand 100 <= branchMinStock 150 -> Below min, suggestedQty = (150*2 - 100) = 200
  assert.equal(processed[2]?.isBelowMin, true);
  assert.equal(processed[2]?.effectiveMin, 150);
  assert.equal(processed[2]?.suggestedQty, 200);
});

test("Smart Reorder: routes supply channel accurately", () => {
  const items = [
    {
      id: 1,
      name: "Chả trứng hấp",
      fulfillFromCentralKitchen: true,
      fulfillFromCentralSupply: false,
    },
    {
      id: 2,
      name: "Hộp xốp mang về",
      fulfillFromCentralKitchen: false,
      fulfillFromCentralSupply: true,
    },
    {
      id: 3,
      name: "Nước ngọt Coca-Cola",
      fulfillFromCentralKitchen: false,
      fulfillFromCentralSupply: false,
    },
  ];

  const getChannel = (item: (typeof items)[0]) => {
    if (item.fulfillFromCentralKitchen) return "internal_transfer_kitchen";
    if (item.fulfillFromCentralSupply) return "internal_transfer_supply";
    return "supplier_po";
  };

  assert.equal(getChannel(items[0]!), "internal_transfer_kitchen");
  assert.equal(getChannel(items[1]!), "internal_transfer_supply");
  assert.equal(getChannel(items[2]!), "supplier_po");
});

test("Waste Analytics: groups reasons and computes percentage accurately", () => {
  const issueItems = [
    { reason_code: "spoiled", total_cost: 300_000 },
    { reason_code: "expired", total_cost: 200_000 },
    { reason_code: "loss", total_cost: 400_000 },
    { reason_code: "discrepancy", total_cost: 100_000 },
  ];

  let totalLoss = 0;
  const groups = {
    spoiled: 0,
    loss: 0,
    discrepancy: 0,
    other: 0,
  };

  for (const item of issueItems) {
    totalLoss += item.total_cost;
    if (item.reason_code === "spoiled" || item.reason_code === "expired") {
      groups.spoiled += item.total_cost;
    } else if (item.reason_code === "loss") {
      groups.loss += item.total_cost;
    } else if (item.reason_code === "discrepancy") {
      groups.discrepancy += item.total_cost;
    } else {
      groups.other += item.total_cost;
    }
  }

  assert.equal(totalLoss, 1_000_000);
  assert.equal(groups.spoiled, 500_000); // 50%
  assert.equal(groups.loss, 400_000); // 40%
  assert.equal(groups.discrepancy, 100_000); // 10%
  assert.equal(groups.spoiled / totalLoss, 0.5);
  assert.equal(groups.loss / totalLoss, 0.4);
  assert.equal(groups.discrepancy / totalLoss, 0.1);
});
