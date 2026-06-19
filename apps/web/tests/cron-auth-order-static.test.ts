import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

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
      "if (!expected || !provided || !timingSafeEquals(provided, expected))",
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
