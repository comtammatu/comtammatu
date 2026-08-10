import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("GRN audit history renders the action and actor name without exposing UUIDs", async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { AuditHistoryList } =
    await import("../app/components/audit-history-list");
  const userId = "50f3d810-a3a1-4013-8300-95af5223dee7";
  const html = renderToStaticMarkup(
    React.createElement(AuditHistoryList, {
      logs: [
        {
          id: 68,
          action: "inventory.grn.saved",
          entityType: "goods_received_note",
          entityId: "17",
          userId,
          actorName: "Thục",
          createdAt: "2026-07-30T02:53:23.389224Z",
        },
      ],
    }),
  );

  assert.match(html, /Lưu phiếu nhập/);
  assert.match(html, /Thục/);
  assert.doesNotMatch(html, new RegExp(userId));
});
