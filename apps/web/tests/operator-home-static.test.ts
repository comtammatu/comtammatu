import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const HOME_PAGE = "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx";

test("operator home KPI strip is gone; revenue survives as one subordinate badge", () => {
  const home = read(HOME_PAGE);

  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-revenue-target-strip.tsx",
    ),
    false,
  );
  assert.doesNotMatch(home, /BranchRevenueTargetStrip|KpiCard|KpiRow/);
  assert.doesNotMatch(home, /formatVND|shortValue=|<Progress\b/);

  // Same server action + ACL gate as before: manager/owner only.
  assert.match(
    home,
    /const revenueTargetRes = isManagerLike\s*\?\s*await fetchBranchRevenueTargetProgress\(context\.branchId\)/,
  );
  // A failed fetch (success:false forbidden/loadFailed paths) renders NO
  // badge; the secondary no-target badge only covers genuine
  // success-with-no-target results.
  assert.match(
    home,
    /const revenueBadge =\s*!isManagerLike \|\| revenueTargetRes\?\.success !== true\s*\?\s*null/,
  );

  // Exactly one badge wiring carries the revenue info: the actionable
  // orders (run-phase) section badge slot.
  const badgeWirings = home.match(/badge=\{/g) ?? [];
  assert.equal(badgeWirings.length, 1);
  assert.match(
    home,
    /section\.phase === "run" \? \(revenueBadge \?\? undefined\) : undefined/,
  );
  assert.match(home, /homeCopy\.revenueProgressBadge\(/);
  assert.match(home, /homeCopy\.revenueNoTargetBadge/);
  assert.match(home, /variant: "secondary" as const/);
});

test("operator home restores the queue-before-tiles landing order", () => {
  const home = read(HOME_PAGE);
  const queueIndex = home.indexOf("<BranchQueueSection");
  const phaseIndex = home.indexOf("phaseSections.map(");
  const groupsIndex = home.indexOf("groups.map(");

  assert.ok(queueIndex !== -1, "queue section is rendered");
  assert.ok(phaseIndex !== -1, "phase tile map is rendered");
  assert.ok(groupsIndex !== -1, "group tile map is rendered");
  assert.ok(queueIndex < phaseIndex, "queue renders before phase tiles");
  assert.ok(queueIndex < groupsIndex, "queue renders before group tiles");
});

test("no KpiCard/KpiRow stat surfaces remain under the /br/ route tree", () => {
  const brRoot = resolve(repoRoot, "apps/web/app/(protected)/br");
  const sources = walkFiles(brRoot).filter((file) =>
    /\.(?:ts|tsx)$/.test(file),
  );
  assert.ok(sources.length > 0);
  for (const file of sources) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /\b(?:KpiCard|KpiRow)\b/,
      file,
    );
  }
});

test("revenue badge copy is localized through operator messages", () => {
  const operatorCopy = read("apps/web/lib/messages/operator.ts");
  assert.match(
    operatorCopy,
    /revenueProgressBadge: \(pct: string\) => `\$\{pct\} chỉ tiêu`/,
  );
  assert.match(operatorCopy, /revenueNoTargetBadge: "Chưa đặt chỉ tiêu"/);

  const home = read(HOME_PAGE);
  assert.doesNotMatch(home, /chỉ tiêu/);
  assert.doesNotMatch(home, /Chưa đặt chỉ tiêu/);
});
