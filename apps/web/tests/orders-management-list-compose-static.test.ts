import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Phase D — Orders Owner LIST compose:
 * KpiRow above one AppListFrame + AppToolbar variant="inline"
 * (no page-level sticky AppToolbar after KPIs). Shell is xwide+compact.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Orders Owner LIST uses AppListFrame + inline toolbar after KpiRow", () => {
  const client = read("app/(protected)/orders/orders-client.tsx");
  const body = read("app/(protected)/orders/orders-page-body.tsx");

  assert.match(body, /<AppPage width="xwide" density="compact"/);
  assert.match(client, /<AppListFrame/);
  assert.match(client, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.match(client, /KpiRow[\s\S]*?<AppListFrame/);
  assert.doesNotMatch(
    client,
    /KpiRow[\s\S]*?<AppToolbar[^>]*\bsticky\b/,
  );
  assert.doesNotMatch(client, /<AppToolbar\s+sticky\b/);
  assert.match(client, /orderId/);
  assert.match(client, /selectOrder/);
  assert.match(client, /dateFrom/);
  assert.match(client, /writeListFilterParam|searchParams\.get\("dateFrom"\)/);
  assert.doesNotMatch(client, /\bfetchOrders\b/);
});

test("Orders Owner page binds list filters from URL searchParams", () => {
  const page = read("app/(protected)/orders/page.tsx");
  assert.match(page, /dateFrom/);
  assert.match(page, /dateTo/);
  assert.match(page, /status/);
  assert.match(page, /listFilters/);
  assert.match(page, /fetchOrders\(/);
});
