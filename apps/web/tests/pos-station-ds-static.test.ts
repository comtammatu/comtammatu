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

const posDir = join(process.cwd(), "app/(protected)/br/[branchId]/pos");

test("POS station routes do not import control_surface AppSection", () => {
  const offenders = walkFiles(posDir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const importsAppSection =
      /\bAppSection\b/.test(source) &&
      (source.includes('@/components/surface') ||
        source.includes("@/components/surface/app-section"));
    return importsAppSection
      ? [file.slice(process.cwd().length + 1)]
      : [];
  });

  assert.deepEqual(
    offenders,
    [],
    `POS station_chrome must use StationSection, not AppSection: ${offenders.join(", ")}`,
  );
});

test("POS station routes do not import raw Card primitive", () => {
  const offenders = walkFiles(posDir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return source.includes('@comtammatu/ui/components/card"') ||
      source.includes("@comtammatu/ui/components/card'")
      ? [file.slice(process.cwd().length + 1)]
      : [];
  });

  assert.deepEqual(
    offenders,
    [],
    `POS station_chrome must use StationSection/Frame, not raw Card: ${offenders.join(", ")}`,
  );
});

test("StationSection is registered as a station_chrome app adapter", async () => {
  const registryModule = await import(
    "../../../scripts/ui-component-registry.mjs"
  );
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
});
