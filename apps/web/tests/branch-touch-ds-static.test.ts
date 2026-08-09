import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function relativeFromCwd(file: string): string {
  return file.slice(join(process.cwd()).length + 1);
}

function filesMatching(
  dir: string,
  predicate: (source: string) => boolean,
): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return predicate(source) ? [relativeFromCwd(file)] : [];
  });
}

function importsControlSurfaceChrome(source: string): boolean {
  return (
    /\bAppShell\b/.test(source) ||
    /\bControlSurfaceShell\b/.test(source) ||
    /\bAppListFrame\b/.test(source) ||
    /\bDocumentFormFrame\b/.test(source) ||
    /\bDataTable\b/.test(source) ||
    source.includes("control-surface-nav") ||
    source.includes("resolveControlSurface")
  );
}

function importsAppSection(source: string): boolean {
  return (
    /\bAppSection\b/.test(source) &&
    (source.includes("@/components/surface") ||
      source.includes("@/components/surface/app-section"))
  );
}

function importsRawCard(source: string): boolean {
  return (
    source.includes('@comtammatu/ui/components/card"') ||
    source.includes("@comtammatu/ui/components/card'")
  );
}

const branchDir = join(process.cwd(), "app/(protected)/br");
const branchOperatorAdapterFile =
  "lib/branch-operator/components/branch-operator-page.tsx";
const grnDir = join(
  process.cwd(),
  "app/(protected)/br/[branchId]/(operator)/stock/grn",
);
const branchHomePage = join(
  process.cwd(),
  "app/(protected)/br/[branchId]/(operator)/page.tsx",
);

const BRANCH_TOUCH_BLOCKS = [
  "branch-action-home",
  "branch-touch-list",
  "branch-touch-detail",
  "branch-touch-document",
] as const;

test("Branch touch UI blocks stay registered with use/forbidden/exemplar", async () => {
  const registryModule = await import(
    "../../../scripts/ui-component-registry.mjs"
  );

  for (const name of BRANCH_TOUCH_BLOCKS) {
    const entry = registryModule.findComponentGuidance(name)[0];
    assert.ok(entry, `${name} must be registered`);
    assert.equal(entry.layer, "ui-block", name);
    assert.deepEqual(entry.planes ?? [], ["branch"], name);
    assert.match(entry.use ?? "", /BranchOperator/, `${name} use`);
    assert.match(entry.forbidden ?? "", /AppShell|DocumentFormFrame|DataTable/, `${name} forbidden`);
    assert.match(entry.forbidden ?? "", /raw Card/, `${name} forbids raw Card`);
    assert.ok(
      typeof entry.exemplar === "string" && entry.exemplar.includes("/br/"),
      `${name} exemplar must be a Branch path`,
    );
  }

  const list = registryModule.findComponentGuidance("branch-touch-list")[0];
  assert.match(list?.exemplar ?? "", /\/stock\/grn\/page\.tsx$/);
  assert.match(list?.use ?? "", /ItemGroup/);

  const detail = registryModule.findComponentGuidance("branch-touch-detail")[0];
  assert.match(detail?.exemplar ?? "", /\/stock\/grn\/\[id\]\/page\.tsx$/);

  const doc = registryModule.findComponentGuidance("branch-touch-document")[0];
  assert.match(
    doc?.exemplar ?? "",
    /\/stock\/grn\/new\/\[supplierId\]\/page\.tsx$/,
  );

  const home = registryModule.findComponentGuidance("branch-action-home")[0];
  assert.match(home?.exemplar ?? "", /\/\(operator\)\/page\.tsx$/);
});

test("branch-operator domain adapter locks GRN touch exemplar", async () => {
  const registryModule = await import(
    "../../../scripts/ui-component-registry.mjs"
  );
  const family = registryModule.findComponentGuidance("branch-operator")[0];
  assert.equal(family?.layer, "domain-adapter");
  assert.match(family?.forbidden ?? "", /AppListFrame|DocumentFormFrame|DataTable/);
  assert.match(family?.exemplar ?? "", /\/stock\/grn\/page\.tsx$/);
});

test("GRN Branch touch gold tree does not import control_surface LIST chrome", () => {
  assert.deepEqual(
    filesMatching(grnDir, importsControlSurfaceChrome),
    [],
    "branch-touch GRN exemplar must not import AppShell/AppListFrame/DocumentFormFrame/DataTable",
  );
});

test("GRN Branch touch gold tree does not import raw Card", () => {
  assert.deepEqual(
    filesMatching(grnDir, importsRawCard),
    [],
    "branch-touch GRN exemplar must not import raw Card",
  );
});

test("Branch action-home gold page stays BranchOperatorPage without control_surface chrome", () => {
  const source = readFileSync(branchHomePage, "utf8");
  assert.match(source, /BranchOperatorPage/);
  assert.match(source, /BranchOperatorActionSection/);
  assert.equal(importsControlSurfaceChrome(source), false);
  assert.equal(importsRawCard(source), false);
});

test("Branch routes do not import control_surface AppSection", () => {
  assert.deepEqual(
    filesMatching(branchDir, importsAppSection),
    [],
    "branch_surface must use BranchOperatorPanel, not AppSection",
  );
});

test("Branch routes do not import control_surface LIST/DOC chrome", () => {
  assert.deepEqual(
    filesMatching(branchDir, (source) => {
      return (
        /\bAppShell\b/.test(source) ||
        /\bControlSurfaceShell\b/.test(source) ||
        /\bAppListFrame\b/.test(source) ||
        /\bDocumentFormFrame\b/.test(source) ||
        source.includes("control-surface-nav") ||
        source.includes("resolveControlSurface")
      );
    }),
    [],
    "branch_surface must not import AppShell / AppListFrame / DocumentFormFrame",
  );
});

test("Branch routes do not import raw Card primitive", () => {
  assert.deepEqual(
    filesMatching(branchDir, importsRawCard),
    [],
    "branch_surface must use BranchOperatorPanel/Frame, not raw Card",
  );
});

test("BranchOperator adapter is the only Branch plane AppSection wrapper", () => {
  const adapter = readFileSync(
    join(process.cwd(), branchOperatorAdapterFile),
    "utf8",
  );
  assert.match(adapter, /from "@\/components\/surface"/);
  assert.match(adapter, /\bAppSection\b/);
  assert.match(adapter, /export function BranchOperatorPanel/);
  assert.match(adapter, /contentFlush/);
});
