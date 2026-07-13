import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { timingSafeSecretEquals } from "@comtammatu/shared/runtime";

function readRoute(routePath: string): string {
  return readFileSync(join(process.cwd(), routePath), "utf8");
}

const cronRoutes = [
  {
    name: "hddt-archive",
    path: "app/api/cron/hddt-archive/route.ts",
    flag: 'process.env["HDDT_ARCHIVE_ENABLED"]',
  },
  {
    name: "hddt-daily-summary",
    path: "app/api/cron/hddt-daily-summary/route.ts",
    flag: 'process.env["HDDT_DAILY_SUMMARY_ENABLED"]',
  },
  {
    name: "hddt-reconcile",
    path: "app/api/cron/hddt-reconcile/route.ts",
    flag: 'process.env["HDDT_RECONCILE_ENABLED"]',
  },
] as const;

test("HĐĐT cron routes authenticate before feature flags and service clients", () => {
  for (const route of cronRoutes) {
    const source = readRoute(route.path);
    const authIndex = source.indexOf("const expected = getCronSecret();");
    const forbiddenIndex = source.indexOf(
      "if (!expected || !provided || !timingSafeSecretEquals(provided, expected))",
    );
    const flagIndex = source.indexOf(route.flag);
    const serviceClientIndex = source.indexOf(
      "const supabase = createServiceClient();",
    );

    assert.ok(authIndex >= 0, `${route.name} must load CRON_SECRET`);
    assert.ok(forbiddenIndex >= 0, `${route.name} must reject bad Bearer auth`);
    assert.ok(flagIndex >= 0, `${route.name} must read its feature flag`);
    assert.ok(
      serviceClientIndex >= 0,
      `${route.name} must create a service client after auth`,
    );
    assert.ok(authIndex < flagIndex, `${route.name} auth must precede flag`);
    assert.ok(
      forbiddenIndex < flagIndex,
      `${route.name} unauthorized check must precede flag`,
    );
    assert.ok(
      flagIndex < serviceClientIndex,
      `${route.name} service client must stay after flag`,
    );
  }
});

test("MoMo reconcile cron authenticates before creating a service client", () => {
  const source = readRoute("app/api/cron/momo-reconcile/route.ts");
  const authIndex = source.indexOf("const expected = getCronSecret();");
  const forbiddenIndex = source.indexOf(
    "if (!expected || !provided || !timingSafeSecretEquals(provided, expected))",
  );
  const serviceClientIndex = source.indexOf(
    "const supabase = createServiceClient();",
  );
  const flagIndex = source.indexOf("isMomoRuntimeReady(process.env)");
  const executorIndex = source.indexOf(
    "await executeMomoReconciliationBatch(supabase)",
  );

  assert.ok(authIndex >= 0, "MoMo cron must load CRON_SECRET");
  assert.ok(forbiddenIndex >= 0, "MoMo cron must reject bad Bearer auth");
  assert.ok(serviceClientIndex >= 0, "MoMo cron must create a service client");
  assert.ok(flagIndex >= 0, "MoMo cron must read its feature flag");
  assert.ok(executorIndex >= 0, "MoMo cron must execute reconciliation");
  assert.ok(authIndex < serviceClientIndex, "MoMo cron auth must run first");
  assert.ok(
    forbiddenIndex < serviceClientIndex,
    "MoMo cron rejection must precede the service client",
  );
  assert.ok(
    forbiddenIndex < flagIndex,
    "MoMo cron rejection must precede the feature flag",
  );
  assert.ok(
    flagIndex < serviceClientIndex,
    "MoMo cron must skip before creating the service client",
  );
  assert.ok(
    serviceClientIndex < executorIndex,
    "MoMo cron must create the service client before execution",
  );
});

test("all cron routes use the shared exact secret comparison", () => {
  const routePaths = [
    ...cronRoutes.map((route) => route.path),
    "app/api/cron/kds-maintenance/route.ts",
    "app/api/cron/momo-reconcile/route.ts",
  ];

  for (const routePath of routePaths) {
    const source = readRoute(routePath);
    assert.match(source, /timingSafeSecretEquals\(provided, expected\)/);
    assert.doesNotMatch(source, /function timingSafeEquals/);
    assert.doesNotMatch(source, /from "node:crypto"/);
  }
});

test("secret comparison rejects values that only differ after 256 bytes", () => {
  const sharedPrefix = "a".repeat(256);

  assert.equal(timingSafeSecretEquals("bí mật", "bí mật"), true);
  assert.equal(
    timingSafeSecretEquals(`${sharedPrefix}x`, `${sharedPrefix}y`),
    false,
  );
  assert.equal(timingSafeSecretEquals("bí mật", "bi mat"), false);
});
