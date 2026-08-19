import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TicketRowMeta } from "../app/(protected)/br/[branchId]/kds/_components/ticket-row-meta";
import { classifyModifier } from "../app/(protected)/br/[branchId]/kds/_lib/modifier-format";

test("TicketRowMeta renders side badges with clean + prefix and unified styling", () => {
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

  assert.match(html, /\+ Canh thêm/);
  assert.match(html, /\+ Trứng ốp la/);
  assert.doesNotMatch(html, /Canh thêm x1/);
  assert.doesNotMatch(html, /Trứng ốp la x2/);
  assert.match(html, /bg-muted\/50/);
});

test("TicketRowMeta renders item notes with a Ghi chú prefix", () => {
  const html = renderToStaticMarkup(
    createElement(TicketRowMeta, {
      note: "Sườn cháy cạnh",
      modifiers: null,
      sides: null,
    }),
  );

  assert.match(html, /Ghi chú: Sườn cháy cạnh/);
});

test("classifyModifier treats explicit Vietnamese negation prefixes as warnings", () => {
  assert.equal(classifyModifier("Không mỡ hành"), "negation");
  assert.equal(classifyModifier("ko ớt"), "negation");
  assert.equal(classifyModifier("k đá"), "negation");
  assert.equal(classifyModifier("đừng cay"), "negation");
  assert.equal(classifyModifier("bỏ hành"), "neutral");
  assert.equal(classifyModifier("Ít cơm"), "neutral");
  assert.equal(classifyModifier("thêm trứng"), "addition");
});
