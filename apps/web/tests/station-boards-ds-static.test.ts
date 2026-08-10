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

function relativeFromApp(file: string): string {
  return file.slice(join(process.cwd()).length + 1);
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

const kdsDir = join(process.cwd(), "app/(protected)/br/[branchId]/kds");
const pickupDir = join(process.cwd(), "app/(protected)/br/[branchId]/pickup");
const operationalAdapter = join(
  process.cwd(),
  "app/components/surface/operational.tsx",
);

test("KDS station routes do not import control_surface AppSection", () => {
  assert.deepEqual(
    filesImportingAppSection(kdsDir),
    [],
    "KDS station_chrome must not import AppSection",
  );
});

test("KDS station routes do not import raw Card primitive", () => {
  assert.deepEqual(
    filesImportingRawCard(kdsDir),
    [],
    "KDS station_chrome must use OperationalBoardCard/Frame, not raw Card",
  );
});

test("KDS station routes do not import control_surface chrome", () => {
  assert.deepEqual(
    filesImportingControlSurfaceChrome(kdsDir),
    [],
    "KDS must not import AppShell / ControlSurfaceShell / AppListFrame / BranchOperatorPage / DataTable",
  );
});

test("Pickup station routes do not import control_surface AppSection", () => {
  assert.deepEqual(
    filesImportingAppSection(pickupDir),
    [],
    "Pickup station_chrome must not import AppSection",
  );
});

test("Pickup station routes do not import raw Card primitive", () => {
  assert.deepEqual(
    filesImportingRawCard(pickupDir),
    [],
    "Pickup station_chrome must not import raw Card",
  );
});

test("Pickup station routes do not import control_surface chrome", () => {
  assert.deepEqual(
    filesImportingControlSurfaceChrome(pickupDir),
    [],
    "Pickup must not import AppShell / ControlSurfaceShell / AppListFrame / BranchOperatorPage / DataTable",
  );
});

test("KDS and Pickup loading stay PageSpinner (no fake ticket skeleton)", () => {
  const kdsLoading = readFileSync(join(kdsDir, "loading.tsx"), "utf8");
  const pickupLoading = readFileSync(join(pickupDir, "loading.tsx"), "utf8");
  assert.match(kdsLoading, /PageSpinner/);
  assert.match(pickupLoading, /PageSpinner/);
  assert.doesNotMatch(kdsLoading, /\bSkeleton\b/);
  assert.doesNotMatch(pickupLoading, /\bSkeleton\b/);
});

test("OperationalBoardCard uses named motion tokens, not bare transition", () => {
  const source = readFileSync(operationalAdapter, "utf8");
  assert.match(
    source,
    /transition-\[background-color,box-shadow,opacity\]/,
  );
  assert.match(source, /duration-\[var\(--motion-base\)\]/);
  assert.match(source, /ease-\[var\(--ease-move\)\]/);
  assert.doesNotMatch(
    source,
    /className=\{cn\(\s*"transition"/,
  );
  assert.doesNotMatch(source, /transition-all/);
});

test("realtime-board, runner-board, and pos-board UI blocks stay registered for station", async () => {
  const registryModule = await import(
    "../../../scripts/ui-component-registry.mjs"
  );
  const kds = registryModule.findComponentGuidance("realtime-board");
  const runner = registryModule.findComponentGuidance("runner-board");
  const pos = registryModule.findComponentGuidance("pos-board");
  assert.equal(kds[0]?.layer, "ui-block");
  assert.equal(runner[0]?.layer, "ui-block");
  assert.equal(pos[0]?.layer, "ui-block");
  assert.deepEqual(kds[0]?.planes ?? [], ["station"]);
  assert.deepEqual(runner[0]?.planes ?? [], ["station"]);
  assert.deepEqual(pos[0]?.planes ?? [], ["station"]);
  assert.match(kds[0]?.use ?? "", /OperationalBoardCard/);
  assert.match(runner[0]?.use ?? "", /Runner station chrome/);
  assert.match(pos[0]?.use ?? "", /StationSection/);
  assert.match(kds[0]?.forbidden ?? "", /AppSection/);
  assert.match(runner[0]?.forbidden ?? "", /AppSection/);
  assert.match(pos[0]?.forbidden ?? "", /AppSection/);
  assert.match(kds[0]?.forbidden ?? "", /BranchOperatorPage/);
  assert.match(runner[0]?.forbidden ?? "", /BranchOperatorPage/);
  assert.match(pos[0]?.forbidden ?? "", /BranchOperatorPage/);
  assert.match(kds[0]?.forbidden ?? "", /raw Card/);
  assert.match(runner[0]?.forbidden ?? "", /raw Card/);
  assert.match(pos[0]?.forbidden ?? "", /raw Card/);
  assert.match(kds[0]?.exemplar ?? "", /\/kds\/page\.tsx$/);
  assert.match(runner[0]?.exemplar ?? "", /\/pickup\/page\.tsx$/);
  assert.match(pos[0]?.exemplar ?? "", /\/pos\/session-gate\.tsx$/);
});

test("audit route family maps /app/r/ to public-feedback, not runner", () => {
  const audit = readFileSync(
    join(process.cwd(), "../../scripts/audit-ui-components.mjs"),
    "utf8",
  );
  assert.match(audit, /\["public-feedback"/);
  assert.match(audit, /file\.includes\("\/app\/r\/"\)/);
  assert.doesNotMatch(audit, /\["runner-display"/);
});
