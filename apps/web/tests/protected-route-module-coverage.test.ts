import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { resolveRouteFamilyContract } from "@comtammatu/shared/auth";

const repoRoot = resolve(process.cwd(), "../..");
const PROTECTED_ROOT = "apps/web/app/(protected)";

// Protected page.tsx routes that intentionally resolve to the `public` route
// family (no moduleKeys). Keep this list tiny and individually justified — a new
// entry here means a route deliberately bypasses ACL coverage.
const PUBLIC_PROTECTED_ROUTES = new Set<string>([
  // Customer-facing read-only pickup display (isPickupPublicDisplayPath).
  "apps/web/app/(protected)/br/[branchId]/pickup/page.tsx",
]);

function listPageFiles(dir: string): string[] {
  return readdirSync(resolve(repoRoot, dir)).flatMap((entry) => {
    const relPath = `${dir}/${entry}`;
    if (statSync(resolve(repoRoot, relPath)).isDirectory()) {
      return listPageFiles(relPath);
    }
    return entry === "page.tsx" ? [relPath] : [];
  });
}

// Map a `page.tsx` file path to the concrete URL the route resolver sees:
// drop the app prefix + route groups, give `[branchId]` a digit (the matcher
// converts it to `\d+`) and any other dynamic segment a plausible literal.
function routeUrlForPageFile(relPath: string): string {
  const afterApp = relPath
    .replace(/^apps\/web\/app/, "")
    .replace(/\/page\.tsx$/, "");
  const segments = afterApp
    .split("/")
    .filter((segment) => segment.length > 0)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => {
      if (segment === "[branchId]") return "7";
      if (/^\[\.\.\./.test(segment)) return segment; // surfaced as a failure below
      if (/^\[.+\]$/.test(segment)) return "1";
      return segment;
    });
  return `/${segments.join("/")}`;
}

test("every protected page.tsx resolves to a route family with moduleKeys", () => {
  const pageFiles = listPageFiles(PROTECTED_ROOT);
  assert.ok(pageFiles.length > 0, "found no protected page.tsx files to check");

  const escaped: string[] = [];
  for (const file of pageFiles) {
    if (/\[\.\.\./.test(file)) {
      escaped.push(`${file} -> catch-all segment unsupported by this guard; add explicit handling`);
      continue;
    }

    const url = routeUrlForPageFile(file);
    const family = resolveRouteFamilyContract(url);

    if (PUBLIC_PROTECTED_ROUTES.has(file)) {
      assert.equal(
        family?.id,
        "public",
        `${file} (${url}) is allowlisted as public but resolved to "${family?.id ?? "null"}"`,
      );
      continue;
    }

    if (!family || family.moduleKeys.length === 0) {
      escaped.push(
        `${file} (${url}) -> ${family ? `family "${family.id}" has no moduleKeys` : "no route family"}`,
      );
    }
  }

  assert.equal(
    escaped.length,
    0,
    `Protected routes escaped ACL module-key coverage:\n${escaped.join("\n")}`,
  );
});
