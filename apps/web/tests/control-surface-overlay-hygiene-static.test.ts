import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { toPosixPath } from "./static-source";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const protectedRoot = join(repoRoot, "apps/web/app/(protected)");

const RAW_OVERLAY =
  /from ["']@comtammatu\/ui\/components\/(dialog|sheet|drawer)["']/;
const L0_FORBIDDEN = /\b(AppDrawer|StationSheet)\b/;

test("Control Surface routes do not import raw Dialog/Sheet/Drawer or L0-forbidden overlays", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "br") continue;
        walk(full);
        continue;
      }
      if (entry.endsWith(".tsx") || entry.endsWith(".ts")) files.push(full);
    }
  };
  walk(protectedRoot);

  const violations: string[] = [];
  for (const abs of files) {
    const rel = toPosixPath(abs.slice(repoRoot.length + 1));
    const source = readFileSync(abs, "utf8");
    if (RAW_OVERLAY.test(source) || L0_FORBIDDEN.test(source)) {
      violations.push(rel);
    }
  }

  assert.deepEqual(violations, []);
});
