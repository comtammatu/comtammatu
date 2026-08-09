import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("app/(protected)/page.tsx", "utf8");
const overview = readFileSync("app/_components/owner-overview.tsx", "utf8");
const attention = readFileSync("app/_lib/control-home-attention.ts", "utf8");
const acl = readFileSync(
  "../../packages/shared/src/auth/module-acl.ts",
  "utf8",
);
const login = readFileSync(
  "../../packages/shared/src/auth/login-destination.ts",
  "utf8",
);

test("Control home page loads ACL-gated attention and role-aware overview", () => {
  assert.match(page, /loadControlHomeAttention/);
  assert.match(page, /OwnerOverview/);
  assert.match(overview, /AttentionQueue|attentionTitle/);
  assert.match(overview, /canAccess\(role/);
  assert.doesNotMatch(overview, /KpiCard|KpiRow/);
});

test("Control home attention covers finance inventory HR ops buckets", () => {
  assert.match(attention, /loadFinanceAttention|fetchFinanceCockpit/);
  assert.match(attention, /countOpenPurchaseOrders|countOpenGrns/);
  assert.match(attention, /fetchHrAttentionSummary/);
  assert.match(attention, /countPrintJobsNeedingAttention|getUnreadCount/);
});

test("MODULE_ACL owner home includes Control L0 adapters", () => {
  assert.match(acl, /accountant/);
  assert.match(acl, /central_supply_ops/);
  assert.match(acl, /central_kitchen_lead/);
  assert.match(login, /canAccess\(claims\.user_role, "owner"\)/);
});
