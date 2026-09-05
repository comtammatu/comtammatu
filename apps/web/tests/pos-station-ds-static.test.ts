import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

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

function relativeFromApp(file: string): string {
  return file.slice(process.cwd().length + 1);
}

function filesImportingAppSection(dir: string): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const importsAppSection =
      /\bAppSection\b/.test(source) &&
      (source.includes("@/components/surface") ||
        source.includes("@/components/surface/app-section"));
    return importsAppSection ? [relativeFromApp(file)] : [];
  });
}

function filesImportingRawCard(dir: string): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return source.includes('@comtammatu/ui/components/card"') ||
      source.includes("@comtammatu/ui/components/card'")
      ? [relativeFromApp(file)]
      : [];
  });
}

function filesImportingControlSurfaceChrome(dir: string): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const hits =
      /\bAppShell\b/.test(source) ||
      /\bControlSurfaceShell\b/.test(source) ||
      /\bAppListFrame\b/.test(source) ||
      /\bBranchOperatorPage\b/.test(source) ||
      /\bDataTable\b/.test(source) ||
      source.includes("control-surface-nav") ||
      source.includes("resolveControlSurface");
    return hits ? [relativeFromApp(file)] : [];
  });
}

function filesMatching(dir: string, pattern: RegExp): string[] {
  return walkFiles(dir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return pattern.test(source) ? [relativeFromApp(file)] : [];
  });
}

const STATION_OVERLAY_ALLOWLIST = new Set<string>([]);

const posDir = join(process.cwd(), "app/(protected)/br/[branchId]/pos");

test("POS station routes do not import control_surface AppSection", () => {
  const offenders = filesImportingAppSection(posDir);
  assert.deepEqual(
    offenders,
    [],
    `POS station_chrome must use StationSection, not AppSection: ${offenders.join(", ")}`,
  );
});

test("POS station routes do not import raw Card primitive", () => {
  const offenders = filesImportingRawCard(posDir);
  assert.deepEqual(
    offenders,
    [],
    `POS station_chrome must use StationSection/Frame, not raw Card: ${offenders.join(", ")}`,
  );
});

test("POS station routes do not import control_surface chrome", () => {
  const offenders = filesImportingControlSurfaceChrome(posDir);
  assert.deepEqual(
    offenders,
    [],
    `POS must not import AppShell / ControlSurfaceShell / AppListFrame / BranchOperatorPage / DataTable: ${offenders.join(", ")}`,
  );
});

test("StationSection is registered as a station_chrome app adapter", async () => {
  const registryUrl = pathToFileURL(
    resolve(process.cwd(), "../../scripts/ui-component-registry.mjs"),
  ).href;
  const registryModule = await import(registryUrl);
  const guidance = registryModule.findComponentGuidance("StationSection");
  assert.ok(guidance.length > 0, "StationSection must be in APP_ADAPTER_REGISTRY");
  assert.match(
    guidance[0]?.use ?? "",
    /StationSection/,
    "registry use string must name StationSection",
  );
  assert.match(
    guidance[0]?.need ?? "",
    /station_chrome/i,
    "registry need string must scope StationSection to station_chrome",
  );
  assert.match(
    guidance[0]?.exemplar ?? "",
    /\/pos\/session-gate\.tsx$/,
    "StationSection exemplar must stay the POS session-gate gold path",
  );
});

test("pos-board block locks StationSection composition and session-gate exemplar", async () => {
  const registryUrl = pathToFileURL(
    resolve(process.cwd(), "../../scripts/ui-component-registry.mjs"),
  ).href;
  const registryModule = await import(registryUrl);
  const pos = registryModule.findComponentGuidance("pos-board");
  assert.equal(pos[0]?.layer, "ui-block");
  assert.deepEqual(pos[0]?.planes ?? [], ["station"]);
  assert.match(pos[0]?.use ?? "", /StationSection/);
  assert.match(pos[0]?.forbidden ?? "", /AppSection/);
  assert.match(pos[0]?.forbidden ?? "", /BranchOperatorPage/);
  assert.match(pos[0]?.forbidden ?? "", /raw Card/);
  assert.match(pos[0]?.exemplar ?? "", /\/pos\/session-gate\.tsx$/);
});

test("POS station overlays stay on StationSheet except shrinking allowlist", () => {
  const overlay = filesMatching(
    posDir,
    /\bAppDialog\b|\bAppSheet\b|\bAppDrawer\b|<SheetContent\b|<DrawerContent\b/,
  );
  assert.deepEqual(
    overlay.filter((file) => !STATION_OVERLAY_ALLOWLIST.has(file)).sort(),
    [],
    `POS overlays outside StationSheet: ${overlay.join(", ")}`,
  );
});
