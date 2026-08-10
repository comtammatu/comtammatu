import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SimpleBarChart,
  TargetTrendSparkline,
} from "../app/(protected)/inventory/_lib/chart-primitives";

const root = process.cwd();

test("inventory bar chart exposes its name and labeled values", () => {
  const markup = renderToStaticMarkup(
    createElement(SimpleBarChart, {
      ariaLabel: "Biến động kho",
      formatValue: (value: number) => `${value} kg`,
      data: [
        {
          label: "Nhập kho",
          values: [{ label: "Nhập kho", value: 12, color: "primary" }],
        },
        {
          label: "Xuất kho",
          values: [
            { label: "Chuyển ra", value: 4, color: "danger" },
            { label: "Tiêu hao", value: 3, color: "warning" },
          ],
        },
      ],
    }),
  );

  assert.match(markup, /role="img"/);
  assert.match(markup, /aria-label="Biến động kho"/);
  assert.match(markup, /aria-describedby="[^"]+-description"/);
  assert.match(
    markup,
    /Nhập kho: 12 kg\. Xuất kho: Chuyển ra 4 kg, Tiêu hao 3 kg/,
  );
});

test("inventory trend chart describes every labeled point and its target", () => {
  const markup = renderToStaticMarkup(
    createElement(TargetTrendSparkline, {
      ariaLabel: "Xu hướng giá vốn món",
      formatValue: (value: number) => `${value}%`,
      data: [
        { label: "01/2026", value: 28 },
        { label: "02/2026", value: 31 },
      ],
      target: 30,
      targetDescription: "Mục tiêu 30%",
    }),
  );

  assert.match(markup, /<svg[^>]+role="img"/);
  assert.match(markup, /aria-label="Xu hướng giá vốn món"/);
  assert.match(markup, /aria-describedby="[^"]+-description"/);
  assert.match(
    markup,
    /<desc[^>]*>01\/2026: 28%\. 02\/2026: 31%\. Mục tiêu 30%<\/desc>/,
  );
});

test("owner inventory reports supply meaningful chart labels and formatters", () => {
  const client = readFileSync(
    join(root, "app/(protected)/inventory/reports/reports-client.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(root, "app/(protected)/inventory/reports/page.tsx"),
    "utf8",
  );

  assert.match(
    client,
    /<SimpleBarChart[\s\S]*ariaLabel=\{messages\.inventory\.reports\.movementTitle\}[\s\S]*formatValue=\{formatQuantity\}/,
  );
  assert.match(
    client,
    /<TargetTrendSparkline[\s\S]*ariaLabel=\{messages\.inventory\.reports\.foodCostTrend\}[\s\S]*formatValue=\{formatPercent\}[\s\S]*targetDescription=\{messages\.inventory\.reports\.foodCostTarget\}/,
  );
  assert.match(
    page,
    /label: `\$\{key\.slice\(5\)\}\/\$\{key\.slice\(0, 4\)\}`/,
  );
  assert.match(
    page,
    /label: messages\.inventory\.reports\.transferOut[\s\S]*label: messages\.inventory\.reports\.consumption[\s\S]*label: messages\.inventory\.reports\.productionConsumption/,
  );
});
