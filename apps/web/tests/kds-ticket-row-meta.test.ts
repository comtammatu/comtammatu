import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TicketRowMeta } from "../app/(protected)/br/[branchId]/kds/components/ticket-row-meta";

test("TicketRowMeta renders side badges with distinct semantic chart tones", () => {
  const html = renderToStaticMarkup(
    createElement(TicketRowMeta, {
      note: null,
      modifiers: null,
      sides: [
        {
          side_item_id: 1,
          name: "Canh thêm",
          price: 0,
          is_default: false,
        },
        {
          side_item_id: 2,
          name: "Trứng ốp la",
          price: 5_000,
          quantity: 2,
          is_default: false,
        },
      ],
    }),
  );

  assert.match(html, /Canh thêm x1/);
  assert.match(html, /Trứng ốp la x2/);
  assert.match(html, /bg-chart-1\/15/);
  assert.match(html, /border-chart-1\/40/);
  assert.match(html, /bg-chart-2\/15/);
  assert.match(html, /border-chart-2\/40/);
});
