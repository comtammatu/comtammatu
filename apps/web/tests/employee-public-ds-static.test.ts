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
  predicate: (source: string, file: string) => boolean,
): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return predicate(source, file) ? [relativeFromCwd(file)] : [];
  });
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

function importsControlSurfaceChrome(source: string): boolean {
  return (
    /\bAppShell\b/.test(source) ||
    /\bControlSurfaceShell\b/.test(source) ||
    /\bAppListFrame\b/.test(source) ||
    source.includes("control-surface-nav") ||
    source.includes("resolveControlSurface")
  );
}

const staffRuntimeDir = join(process.cwd(), "lib/staff-runtime");
const publicDir = join(process.cwd(), "app/(public)");
const selfOrderDir = join(process.cwd(), "app/q");
const feedbackDir = join(process.cwd(), "app/r");
const adapterFile =
  "lib/staff-runtime/components/staff-runtime-page.tsx";

test("employee staff-runtime routes do not import AppSection outside the Employee adapter", () => {
  const offenders = filesMatching(
    staffRuntimeDir,
    (source, file) =>
      relativeFromCwd(file) !== adapterFile && importsAppSection(source),
  );
  assert.deepEqual(
    offenders,
    [],
    "Employee plane must use EmployeePanel, not AppSection",
  );
});

test("employee staff-runtime does not import control_surface chrome", () => {
  assert.deepEqual(
    filesMatching(staffRuntimeDir, importsControlSurfaceChrome),
    [],
    "Employee plane must not import AppShell / ControlSurfaceShell / AppListFrame",
  );
});

test("employee staff-runtime does not import raw Card primitive", () => {
  assert.deepEqual(
    filesMatching(staffRuntimeDir, importsRawCard),
    [],
    "Employee plane must use EmployeePanel/EmployeeFrame, not raw Card",
  );
});

test("public auth/gate routes do not import control_surface AppSection", () => {
  assert.deepEqual(
    filesMatching(publicDir, importsAppSection),
    [],
    "public/system-gate must use PublicSection, not AppSection",
  );
});

test("public guest /q routes do not import control_surface AppSection", () => {
  assert.deepEqual(
    filesMatching(selfOrderDir, importsAppSection),
    [],
    "self-order/public transaction must use PublicSection, not AppSection",
  );
});

test("public guest /r routes do not import control_surface AppSection", () => {
  assert.deepEqual(
    filesMatching(feedbackDir, importsAppSection),
    [],
    "public-feedback must not import AppSection",
  );
});

test("public guest routes do not import control_surface chrome", () => {
  const offenders = [
    ...filesMatching(selfOrderDir, importsControlSurfaceChrome),
    ...filesMatching(feedbackDir, importsControlSurfaceChrome),
    ...filesMatching(publicDir, importsControlSurfaceChrome),
  ];
  assert.deepEqual(
    offenders,
    [],
    "public surfaces must not import AppShell / ControlSurfaceShell / AppListFrame",
  );
});

test("public guest routes do not import raw Card primitive", () => {
  const offenders = [
    ...filesMatching(selfOrderDir, importsRawCard),
    ...filesMatching(feedbackDir, importsRawCard),
    ...filesMatching(publicDir, importsRawCard),
  ];
  assert.deepEqual(
    offenders,
    [],
    "public surfaces must use PublicSection/Item/Frame, not raw Card",
  );
});

test("PublicSection and Wave E UI blocks stay registered", async () => {
  const registryModule = await import(
    "../../../scripts/ui-component-registry.mjs"
  );
  const publicSection = registryModule.findComponentGuidance("PublicSection");
  assert.equal(publicSection[0]?.layer, "app-adapter");
  assert.match(publicSection[0]?.need ?? "", /public/i);
  assert.match(publicSection[0]?.forbidden ?? "", /AppSection/);

  const employee = registryModule.findComponentGuidance("employee-self-service");
  const transaction = registryModule.findComponentGuidance("public-transaction");
  const feedback = registryModule.findComponentGuidance("public-feedback");
  const gate = registryModule.findComponentGuidance("system-gate");

  assert.equal(employee[0]?.layer, "ui-block");
  assert.deepEqual(employee[0]?.planes ?? [], ["staff"]);
  assert.match(employee[0]?.use ?? "", /EmployeePage/);
  assert.match(employee[0]?.forbidden ?? "", /AppSection/);

  assert.equal(transaction[0]?.layer, "ui-block");
  assert.match(transaction[0]?.use ?? "", /PublicSection/);
  assert.match(transaction[0]?.forbidden ?? "", /AppSection/);

  assert.equal(feedback[0]?.layer, "ui-block");
  assert.deepEqual(feedback[0]?.planes ?? [], ["public"]);
  assert.match(feedback[0]?.forbidden ?? "", /runner/);

  assert.equal(gate[0]?.layer, "ui-block");
  assert.match(gate[0]?.use ?? "", /PublicSection/);
});
