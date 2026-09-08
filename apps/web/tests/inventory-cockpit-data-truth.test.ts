import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  operationalCount,
  settleOperationalCount,
} from "../lib/inventory/operational-count";

test("cockpit loaders distinguish denied, failed, zero, and truncated reads at a non-default branch", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      fileURLToPath(
        new URL(
          "./fixtures/inventory-cockpit-counts.fixture.ts",
          import.meta.url,
        ),
      ),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test("operational counts preserve zero and reject absent, invalid, and failed reads", async () => {
  assert.deepEqual(operationalCount(0, null), { status: "ready", count: 0 });
  assert.deepEqual(operationalCount(17, null), { status: "ready", count: 17 });
  for (const value of [null, undefined, -1, 1.5, NaN, Infinity, "17"]) {
    assert.deepEqual(operationalCount(value, null), { status: "unavailable" });
  }
  assert.deepEqual(operationalCount(0, { message: "private database error" }), {
    status: "unavailable",
  });
  assert.deepEqual(
    await settleOperationalCount(async () => {
      throw new Error("private");
    }),
    { status: "unavailable" },
  );
});

test("cockpit renders exact zero, errors, role restrictions, and non-default branch links", async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { InventoryShiftCockpit } =
    await import("../app/(protected)/inventory/_components/inventory-shift-cockpit");
  const props = {
    branchId: 73,
    title: "Cần xử lý",
    canAccessProduction: false,
    canAccessStock: false,
    items: [
      {
        id: "transfers",
        label: "Điều chuyển đang giao",
        href: "/inventory/transfers?work=dispatch",
        result: operationalCount(0, null),
      },
      {
        id: "grn",
        label: "Chờ nhập",
        href: "/inventory/grn",
        result: operationalCount(null, null),
      },
      {
        id: "waste",
        label: "Chờ duyệt hao",
        href: "/inventory/waste/approvals",
        result: { status: "forbidden" as const },
      },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(InventoryShiftCockpit, props),
  );
  assert.match(html, />0<\/span>/);
  assert.match(html, /Chưa tải được/);
  assert.match(html, /Tải lại/);
  assert.match(html, /work=dispatch&amp;branch=73/);
  assert.doesNotMatch(
    html,
    /Chờ duyệt hao|\/inventory\/waste|\/inventory\/production|\/inventory\/stock/,
  );
  assert.doesNotMatch(html, /DC-0907|Chả trứng|KDS Stream|85 kg/);
  assert.doesNotMatch(html, /<a[^>]*role="listitem"/);

  const all = renderToStaticMarkup(
    React.createElement(InventoryShiftCockpit, {
      ...props,
      branchId: null,
      scopeAll: true,
      canAccessStock: true,
      canAccessProduction: true,
      items: [{ ...props.items[0]!, result: operationalCount(7, null) }],
    }),
  );
  assert.match(all, /work=dispatch&amp;branch=all/);
  assert.match(all, /\/inventory\/stock\?branch=all/);
  assert.match(all, /\/inventory\/production\?branch=all/);
  assert.match(all, />7<\/span>/);
  assert.doesNotMatch(all, /Tải lại/);
});

test("inventory cockpit never publishes sample stock, production, dispatch, or POS facts", () => {
  const source = readFileSync(
    "app/(protected)/inventory/_components/inventory-shift-cockpit.tsx",
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /sampleDeficits|sampleBatchItems|sampleDispatches|autoDeductionDesc\(85|kdsStreamActive/,
  );
  assert.doesNotMatch(source, /transferCount\s*>\s*0\s*\?/);
});

test("inventory landing does not turn failed reads into zero counts", () => {
  const source = readFileSync("app/(protected)/inventory/page.tsx", "utf8");
  assert.doesNotMatch(source, /catch\s*\{\s*return 0/);
});
