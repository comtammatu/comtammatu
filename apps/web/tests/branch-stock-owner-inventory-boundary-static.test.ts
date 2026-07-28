import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const STOCK_ROOT = join(
  process.cwd(),
  "app/(protected)/br/[branchId]/(operator)/stock",
);

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkTsx(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Primary navigation to Owner Inventory from Branch Stock is plane drift. */
const OWNER_INVENTORY_PRIMARY =
  /(?:href|push|replace)\s*[=:(]\s*[`'"]\/inventory(?:\/|['"`])/;

test("Branch Stock surfaces do not primary-link Owner /inventory routes", () => {
  const offenders: string[] = [];
  for (const file of walkTsx(STOCK_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (OWNER_INVENTORY_PRIMARY.test(source)) {
      offenders.push(file.replace(`${process.cwd()}/`, ""));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Branch Stock must not primary-link /inventory/*:\n${offenders.join("\n")}`,
  );
});

test("Branch Stock issues plane stays separate from Owner consumption shims", () => {
  const branchIssues = readFileSync(
    join(STOCK_ROOT, "issues/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(branchIssues, /IssuesPageContent|\/inventory\/consumption/);
  assert.doesNotMatch(branchIssues, /\/inventory\/issues/);
});
