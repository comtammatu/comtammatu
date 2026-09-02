import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);
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
const STRIP =
  "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-revenue-target-strip.tsx";

test("operator home shows manager revenue strip with month, day, and milestones", () => {
  const home = read(HOME_PAGE);
  const strip = read(STRIP);

  assert.equal(exists(STRIP), true);
  assert.match(home, /BranchRevenueTargetStrip/);
  assert.match(
    home,
    /const revenueTargetRes = isManagerLike\s*\?\s*await fetchBranchRevenueTargetProgress\(context\.branchId\)/,
  );
  assert.match(home, /\{revenueTarget \? \(\s*<BranchRevenueTargetStrip/);
  assert.doesNotMatch(home, /revenueBadge|revenueProgressBadge|revenueNoTargetBadge/);

  const todayIndex = home.indexOf("<BranchTodayStatus");
  const stripIndex = home.indexOf("<BranchRevenueTargetStrip");
  const queueIndex = home.indexOf("<BranchQueueSection");
  assert.ok(stripIndex !== -1, "revenue strip is rendered");
  assert.ok(queueIndex !== -1, "queue section is rendered");
  assert.ok(
    todayIndex === -1 || todayIndex < stripIndex,
    "today status renders before revenue strip when present",
  );
  assert.ok(stripIndex < queueIndex, "revenue strip renders before queue");

  assert.match(strip, /monthRevenueLabel|Doanh thu tháng/);
  assert.match(strip, /dayRevenueLabel|Doanh thu ngày/);
  assert.match(strip, /netRevenueMtd/);
  assert.match(strip, /netRevenueToday/);
  assert.match(strip, /rewardTiers/);
  assert.match(strip, /isRevenueRewardTierAchieved/);
  assert.match(strip, /progressTrackPosition/);
  assert.match(strip, /progressTrackScale/);
  assert.match(strip, /<Progress\b/);
  assert.match(strip, /formatVND/);
  assert.match(strip, /BranchOperatorPanel/);
  assert.match(strip, /homeCopy\.revenueTargetTitle/);
  assert.match(strip, /style=\{\{ left:/);
  assert.match(strip, /progressCopy\.targetLabel/);
  assert.match(strip, /<AppSheet\b/);
  assert.match(strip, /rewardCopy\.trackingTitle/);
  assert.match(strip, /setMilestonesOpen/);
  assert.doesNotMatch(strip, /progressCopy\.dayHint|progressCopy\.nextMilestone|progressCopy\.paceToday|progressCopy\.businessDayCaption/);
  assert.doesNotMatch(strip, /<Collapsible>|CollapsibleTrigger|CollapsibleContent/);
  assert.doesNotMatch(strip, /\b(?:KpiCard|KpiRow)\b/);
});

test("operator home restores the queue-before-tiles landing order", () => {
  const home = read(HOME_PAGE);
  const queueIndex = home.indexOf("<BranchQueueSection");
  const groupsIndex = home.indexOf("groups.map(");

  assert.ok(queueIndex !== -1, "queue section is rendered");
  assert.ok(groupsIndex !== -1, "group tile map is rendered");
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

test("home revenue RPC measures MTD and today on the 04:00 business day", () => {
  const sql = read(
    "supabase/migrations/20260820010000_branch_revenue_target_progress_business_day.sql",
  );
  const sqlTest = read("supabase/tests/branch_revenue_targets_test.sql");

  assert.match(sql, /branch_business_date\(p_branch_id, now\(\)\)/);
  assert.match(sql, /branch_business_day_bounds\(p_branch_id, v_today\)/);
  assert.match(sql, /branch_business_day_bounds\(p_branch_id, v_month\)/);
  assertSqlNotMatch(sql, /calendar-day/);
  assert.match(sqlTest, /branch_business_date/);
  assert.match(sqlTest, /branch_business_day_bounds/);
});

test("revenue strip copy is localized through finance messages", () => {
  const financeCopy = read("apps/web/lib/messages/finance.ts");
  assert.match(financeCopy, /monthRevenueLabel: "Doanh thu tháng"/);
  assert.match(financeCopy, /dayRevenueLabel: "Doanh thu ngày"/);
  assert.match(financeCopy, /targetLabel: "Chỉ tiêu tháng"/);
  assert.match(financeCopy, /milestone: \(threshold: string\) => `Mốc \$\{threshold\}`/);
  assert.match(financeCopy, /trackingTitle: "Các mốc chỉ tiêu"/);

  const operatorCopy = read("apps/web/lib/messages/operator.ts");
  assert.match(operatorCopy, /revenueTargetTitle: "Chỉ tiêu doanh thu"/);
  assert.match(operatorCopy, /stationsTitle: "Trạm"/);
  assert.match(operatorCopy, /posStation: "POS"/);
  assert.match(operatorCopy, /kdsStation: "KDS"/);

  const strip = read(STRIP);
  assert.doesNotMatch(strip, /"Doanh thu tháng"/);
  assert.doesNotMatch(strip, /"Các mốc chỉ tiêu"/);

  const today = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-today-status.tsx",
  );
  assert.match(today, /status === "not_required"\) return null/);
  assert.match(today, /copy\.businessDayPrefix/);
  assert.match(today, /copy\.tasksRemaining/);
  assert.match(today, /status === "working" && state\.checklist\.remaining > 0/);
  assert.match(today, /\/br\/\$\{branchId\}\/shift(?!\/clock)/);

  const queueList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-list.tsx",
  );
  assert.match(queueList, /PREVIEW_COUNT = 3/);
  assert.match(queueList, /queueShowMore/);
  assert.doesNotMatch(queueList, /ItemDescription/);
});
