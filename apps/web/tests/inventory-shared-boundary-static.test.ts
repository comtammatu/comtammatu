import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const MOVED_MODULES = [
  "format",
  "grn-draft",
  "purchase-units",
  "reference-cost",
  "types",
  "unit-options",
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

test("shared inventory modules stay outside the Owner surface route tree", () => {
  for (const moduleName of MOVED_MODULES) {
    assert.equal(
      existsSync(join(process.cwd(), `lib/inventory/${moduleName}.ts`)),
      true,
      moduleName,
    );
    assert.equal(
      existsSync(
        join(
          process.cwd(),
          `app/(protected)/inventory/_lib/${moduleName}.ts`,
        ),
      ),
      false,
      moduleName,
    );
  }

  const forbiddenImport = new RegExp(
    `_lib/(?:${MOVED_MODULES.join("|")})(?:["']|$)`,
  );
  const offenders = [
    ...sourceFiles(join(process.cwd(), "app")),
    ...sourceFiles(join(process.cwd(), "lib")),
  ].filter((path) => forbiddenImport.test(readFileSync(path, "utf8")));

  assert.deepEqual(offenders, []);
});
