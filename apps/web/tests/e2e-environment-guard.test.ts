import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";
import {
  requireIsolatedE2EEnvironment,
  resolveConfiguredOwnerEmail,
} from "../e2e/helpers/environment";

const webRoot = process.cwd();
const readWeb = (path: string) => readFileSync(resolve(webRoot, path), "utf8");
const e2eRoot = resolve(webRoot, "e2e");
const approvedServiceFactory = resolve(e2eRoot, "helpers/service-client.ts");

const PLAYWRIGHT_SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/i;

function listPlaywrightSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listPlaywrightSourceFiles(path);
    return entry.isFile() && PLAYWRIGHT_SOURCE_EXTENSION.test(entry.name)
      ? [path]
      : [];
  });
}

function assertNoServiceRoleKeyOutsideFactory(
  root: string,
  approvedFactory: string,
) {
  const violations = listPlaywrightSourceFiles(root)
    .filter((path) => resolve(path) !== resolve(approvedFactory))
    .filter((path) =>
      readFileSync(path, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"),
    )
    .map((path) => relative(root, path).replaceAll("\\", "/"));
  assert.deepEqual(
    violations,
    [],
    `service-role key access is only allowed in ${approvedFactory}`,
  );
}

test("isolated E2E guard accepts loopback Supabase and browser URLs", () => {
  assert.deepEqual(
    requireIsolatedE2EEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421",
      E2E_BASE_URL: "http://localhost:3000",
    }),
    {
      supabaseUrl: "http://127.0.0.1:55421/",
      baseUrl: "http://localhost:3000/",
    },
  );
  assert.equal(
    requireIsolatedE2EEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:55421",
    }).baseUrl,
    "http://localhost:3000/",
  );
});

test("isolated E2E guard rejects a remote Supabase or browser target", () => {
  assert.throws(
    () =>
      requireIsolatedE2EEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        E2E_BASE_URL: "http://localhost:3000",
      }),
    /NEXT_PUBLIC_SUPABASE_URL must target a loopback host/,
  );
  assert.throws(
    () =>
      requireIsolatedE2EEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421",
        E2E_BASE_URL: "https://inventory.example.com",
      }),
    /E2E_BASE_URL must target a loopback host/,
  );
});

test("configured Owner email matches auth setup defaults", () => {
  assert.equal(resolveConfiguredOwnerEmail({}), "keeper@comtammatu.vn");
  assert.equal(
    resolveConfiguredOwnerEmail({ E2E_OWNER_EMAIL: " owner@example.test " }),
    "owner@example.test",
  );
});

test("auth setup guards execution without breaking Playwright discovery", () => {
  const source = readWeb("e2e/auth.setup.ts");
  const beforeAllIndex = source.indexOf("setup.beforeAll");
  const firstSetupIndex = source.indexOf('setup("authenticate');

  assert.ok(beforeAllIndex >= 0 && beforeAllIndex < firstSetupIndex);
  assert.match(
    source.slice(beforeAllIndex, firstSetupIndex),
    /requireIsolatedE2EEnvironment\(\)/,
  );
  assert.doesNotMatch(
    source.slice(0, beforeAllIndex),
    /requireIsolatedE2EEnvironment\(\)/,
    "the guard must run in setup execution, not at module discovery time",
  );
});

test("one guarded factory exclusively owns the E2E service-role key", () => {
  assertNoServiceRoleKeyOutsideFactory(e2eRoot, approvedServiceFactory);
  const factory = readFileSync(approvedServiceFactory, "utf8");
  const guardIndex = factory.indexOf("requireIsolatedE2EEnvironment()");
  const keyIndex = factory.indexOf("process.env.SUPABASE_SERVICE_ROLE_KEY");
  const clientIndex = factory.indexOf(
    "createClient<Database, DatabaseSchemaName, DatabaseSchemaName>(",
  );

  assert.ok(guardIndex >= 0 && guardIndex < keyIndex);
  assert.ok(keyIndex < clientIndex);
  assert.match(factory, /export function createE2EServiceClient/);
});

test("literal ownership rejects namespace, env alias and dead-guard bypasses", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "e2e-service-owner-"));
  const approved = join(fixtureRoot, "helpers", "service-client.ts");
  try {
    mkdirSync(join(fixtureRoot, "helpers"), { recursive: true });
    writeFileSync(
      approved,
      [
        "requireIsolatedE2EEnvironment();",
        "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
        "createClient(url, key);",
      ].join("\n"),
    );
    const bypasses = {
      "namespace.spec.ts": [
        'import * as supabase from "@supabase/supabase-js";',
        "supabase.createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);",
      ],
      "alias.spec.ts": [
        "const env = process.env;",
        "createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!);",
      ],
      "dead-guard.spec.ts": [
        "requireIsolatedE2EEnvironment();",
        "createClient(remoteUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);",
      ],
      "module-bypass.mjs": [
        "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
      ],
    };

    for (const [name, lines] of Object.entries(bypasses)) {
      const path = join(fixtureRoot, name);
      writeFileSync(path, lines.join("\n"));
      assert.throws(
        () => assertNoServiceRoleKeyOutsideFactory(fixtureRoot, approved),
        new RegExp(name.replace(".", "\\.")),
      );
      rmSync(path);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("the isolated CI smoke explicitly schedules ingredient conversion", () => {
  const workflow = readFileSync(
    resolve(webRoot, "../../.github/workflows/ci.yml"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(webRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const smoke = packageJson.scripts?.["test:e2e:smoke"] ?? "";

  assert.match(workflow, /e2e-smoke:[\s\S]*supabase-e2e-bringup\.mjs/);
  assert.match(workflow, /pnpm --filter @comtammatu\/web run test:e2e:smoke/);
  assert.match(smoke, /payment-cash/);
  assert.match(smoke, /e2e\/inventory\/ingredient-unit-conversion\.spec\.ts/);
});

test("ingredient round-trip binds fixtures to the configured Owner and stable cleanup keys", () => {
  const source = readWeb("e2e/inventory/ingredient-unit-conversion.spec.ts");
  const fixtureRunner = source.slice(
    source.indexOf("async function withBaseOnlyFixture"),
    source.indexOf("function createChainDefinition"),
  );
  const fixtureIndex = fixtureRunner.indexOf(
    "const keys = fixtureKeys(definition)",
  );
  const firstWriteIndex = fixtureRunner.indexOf("seedBaseOnlyIngredient(");

  assert.ok(fixtureIndex >= 0 && fixtureIndex < firstWriteIndex);
  assert.match(
    source,
    /resolveUserByEmail\(\s*supabase,\s*resolveConfiguredOwnerEmail\(\),\s*\)/,
  );
  assert.match(source, /if \(owner\.role !== "owner"\)/);
  assert.doesNotMatch(source, /resolveTenantId/);
  assert.match(
    source,
    /\.from\("ingredients"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.eq\("name", fixture\.ingredientName\)[\s\S]*?\.eq\("sku", fixture\.ingredientSku\)/,
  );
  assert.match(
    source,
    /\.from\("units"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.in\("code", \[\.\.\.fixture\.unitCodes\]\)/,
  );
  assert.match(
    source,
    /catch \(error\) \{[\s\S]*?testFailed = true;[\s\S]*?primaryError = error;[\s\S]*?finally/,
  );
  assert.match(
    source,
    /if \(testFailed\) \{[\s\S]*?reportCleanupFailure\(testInfo, cleanupError\)[\s\S]*?throw primaryError;/,
  );
});

test("ingredient round-trip handles semantic desktop rows and responsive cards", () => {
  const source = readWeb("e2e/inventory/ingredient-unit-conversion.spec.ts");

  assert.match(source, /getByRole\("row"\)\.filter/);
  assert.match(source, /getByRole\("button"\)\.filter/);
  assert.match(source, /desktopRow\.or\(responsiveCard\)/);
  assert.match(
    source,
    /dialog\.getByLabel\(`Quy đổi \$\{unitName\} sang đơn vị`\)/,
  );
  assert.match(source, /dialog\.getByRole\("button", \{ name: "Cập nhật" \}\)/);
  assert.doesNotMatch(source, /ingredientCatalogEntry[\s\S]*?\.first\(\)/);
  assert.doesNotMatch(
    source,
    /page\.getByText\(fixture\.ingredientName[\s\S]*?\.first\(\)\.click\(\)/,
  );
});

test("ingredient round-trip builds its graph through the UI from a base-only fixture", () => {
  const source = readWeb("e2e/inventory/ingredient-unit-conversion.spec.ts");

  assert.match(source, /async function addUnitThroughUi/);
  assert.match(source, /getByRole\("listitem"\)\.filter\(\{\s*hasText: unitName/);
  assert.doesNotMatch(
    source,
    /getByRole\("listitem"\)\.filter\(\{\s*has: dialog\.getByText/,
    "the descendant matcher must be relative to each list item",
  );
  assert.match(source, /async function configureManualRelation/);
  assert.match(source, /seedBaseOnlyIngredient/);
  assert.match(
    source,
    /\.from\("ingredient_units"\)[\s\S]*?\.insert\(\{[\s\S]*?is_base: true/,
  );
  assert.doesNotMatch(
    source,
    /\.from\("ingredient_units"\)[\s\S]*?\.insert\(\[/,
    "the graph must not be pre-seeded as multiple ingredient-unit rows",
  );
  assert.match(source, /addUnitThroughUi\(page, dialog, unitNames\.chai\)/);
  assert.match(source, /addUnitThroughUi\(page, dialog, unitNames\.thung\)/);
  assert.match(
    source,
    /configureManualRelation[\s\S]*unitNames\.thung[\s\S]*unitNames\.chai/,
  );
});

test("CI-only ingredient coverage owns the final interaction matrix", () => {
  const source = readWeb("e2e/inventory/ingredient-unit-conversion.spec.ts");

  for (const title of [
    "blocks dependent deletion until reassigned",
    "preserves physical ratios when the base changes",
    "handles automatic standards and invalid manual drafts",
  ]) {
    assert.match(source, new RegExp(`test\\("${title}`));
  }
  // Post-refactor (deae542c5, 2e43f3105) the editor renders base selection
  // as a Select (not a radio group), auto-derived factors as a read-only
  // <output> (not an editable input labeled "Tự động"), and no longer
  // shows the "Quy đổi về đơn vị chuẩn" preview line. Keep the contract
  // focused on the interactions that survived the refactor.
  assert.match(source, /expectTouchTarget/);
  assert.match(source, /toHaveAttribute\("aria-invalid", "true"\)/);
  assert.match(source, /Các đơn vị chuẩn phải cùng loại đo lường/);
  assert.match(source, /getByRole\("option", \{ name: unitNames\.chai/);
  assert.match(source, /readUnitGraph/);
});
