import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("app/(protected)/page.tsx", "utf8");
const overview = readFileSync(
  "app/_components/control-surface-overview.tsx",
  "utf8",
);
const attention = readFileSync("app/_lib/control-home-attention.ts", "utf8");
const acl = readFileSync(
  "../../packages/shared/src/auth/module-acl.ts",
  "utf8",
);
const login = readFileSync(
  "../../packages/shared/src/auth/login-destination.ts",
  "utf8",
);

test("Control home page loads ACL-gated attention and a queue-only overview", () => {
  assert.match(page, /loadControlHomeAttention/);
  assert.match(page, /getTodayWorkState/);
  assert.match(page, /ControlSurfaceOverview/);
  assert.match(overview, /AttentionQueue|attentionTitle/);
  assert.match(overview, /AppTodayCommandBar/);
  assert.match(overview, /canAccess\(role, "me"\)/);
  assert.doesNotMatch(overview, /KpiCard|KpiRow/);
  assert.doesNotMatch(overview, /operationsModules|ModuleLinks/);
  assert.doesNotMatch(overview, /operationsTitle|foundationTitle|shortcutsTitle/);
});

test("Control home attention covers finance inventory HR ops buckets", () => {
  assert.match(attention, /loadFinanceAttention|fetchFinanceAttentionExceptions/);
  assert.match(attention, /FINANCE_VIEW/);
  assert.doesNotMatch(attention, /fetchFinanceCockpit/);
  assert.match(attention, /countOpenPurchaseOrders|listOpenGrnsForAttention/);
  assert.match(attention, /documentTitle/);
  assert.match(attention, /\/inventory\/grn\/\$\{/);
  assert.match(attention, /\/work\/tasks\/\$\{/);
  assert.match(attention, /fetchHrAttentionSummary/);
  assert.match(attention, /countPrintJobsNeedingAttention|getUnreadCount/);
  assert.match(attention, /listMyWorkTasks/);
});

test("MODULE_ACL owner home includes Control L0 adapters", () => {
  assert.match(acl, /accountant/);
  assert.match(acl, /central_supply_ops/);
  assert.match(acl, /central_kitchen_lead/);
  assert.match(login, /canAccess\(claims\.user_role, "owner"\)/);
});

test("proxy keeps branch-floor roles off Control home `/`", () => {
  const proxy = readFileSync("../../apps/web/proxy.ts", "utf8");
  const homeGateStart = proxy.indexOf('pathname === "/" && !canAccess');
  assert.ok(homeGateStart > 0, "expected Control home proxy gate");
  const homeGate = proxy.slice(
    homeGateStart,
    proxy.indexOf("// Owner-plane routes", homeGateStart),
  );
  assert.match(homeGate, /user_role !== "self_service"/);
  assert.match(homeGate, /PERMISSION_KEYS\.SELF_ACCESS/);
  assert.doesNotMatch(homeGate, /PERMISSION_KEYS\.HR_VIEW_EMPLOYEE/);
  assert.match(homeGate, /redirectToDefaultLanding/);
  assert.match(
    proxy,
    /homeSelfServiceBypass[\s\S]*user_role === "self_service"/,
  );
});
