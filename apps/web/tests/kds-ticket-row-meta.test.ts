import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TicketRowMeta } from "../app/(protected)/br/[branchId]/kds/_components/ticket-row-meta";
import { classifyModifier } from "../app/(protected)/br/[branchId]/kds/_lib/modifier-format";

test("TicketRowMeta renders side badges with clean + prefix and per-side colors", () => {
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
  assert.match(html, /bg-chart-1\/15/);
  assert.match(html, /bg-chart-2\/15/);
  assert.doesNotMatch(html, /bg-muted\/50/);
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

test("TicketRowMeta wraps long item notes on their own full-width line without scroll", () => {
  const longNote =
    "Không ớt, không đậu phộng, ít mỡ hành, cơm thêm và ghi chú rất dài cho bếp đọc hết";
  const html = renderToStaticMarkup(
    createElement(TicketRowMeta, {
      note: longNote,
      modifiers: null,
      sides: null,
    }),
  );

  assert.match(html, new RegExp(`Ghi chú: ${longNote}`));
  assert.match(html, /data-slot="note-callout"/);
  assert.match(html, /w-full/);
  assert.match(html, /break-words/);
  assert.doesNotMatch(
    html,
    /overflow-y-auto|max-h-16|max-h-20|overflow-hidden|whitespace-nowrap|line-clamp|truncate/,
  );
});

test("TicketRowMeta keeps the item note on its own row above modifier chips", () => {
  const html = renderToStaticMarkup(
    createElement(TicketRowMeta, {
      layout: "inline",
      note: "Ít mỡ",
      modifiers: [{ modifier_id: 1, name: "Ít cơm", price: 0 }],
      sides: null,
    }),
  );

  const noteIdx = html.indexOf("Ghi chú: Ít mỡ");
  const modifierIdx = html.indexOf("Ít cơm");
  assert.ok(noteIdx >= 0 && modifierIdx >= 0 && noteIdx < modifierIdx);
  assert.match(html, /data-slot="note-callout"/);
  assert.doesNotMatch(html, /inline-flex[\s\S]*Ghi chú/);
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
