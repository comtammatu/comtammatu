import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const runnerPageSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/runner/page.tsx"),
  "utf8",
);
const runnerWaitTimeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/runner/runner-wait-time.tsx",
  ),
  "utf8",
);
const uiGlobalsSource = readFileSync(
  join(process.cwd(), "../../packages/ui/src/styles/globals.css"),
  "utf8",
);

test("Runner page follows the KDS order-list vocabulary", () => {
  assert.match(runnerPageSource, /import Image from "next\/image";/);
  assert.match(runnerPageSource, /eyebrow: MODULE_LABELS_VI\.runner/);
  assert.match(runnerPageSource, /const RUNNER_MASCOT = \{/);
  assert.match(
    runnerPageSource,
    /src: "\/brand\/mascot\/be-suon-tuoi-runner\.png"/,
  );
  assert.match(runnerPageSource, /width: 384/);
  assert.match(runnerPageSource, /height: 512/);
  assert.match(runnerPageSource, /alt: ""/);
  assert.match(
    runnerPageSource,
    /emptyServed: "Các món đã được phục vụ đầy đủ\."/,
  );
  assert.match(
    runnerPageSource,
    /emptyEnjoy: "Chúc quý khách dùng bữa ngon miệng\."/,
  );
  assert.match(runnerPageSource, /wifi: "WiFi: Má Tư"/);
  assert.match(runnerPageSource, /password: "Mật khẩu: xincamon"/);
  assert.match(runnerPageSource, /const RUNNER_FEATURED_STATUS = "preparing";/);
  assert.match(runnerPageSource, /preparing: "Chuẩn bị"/);
  assert.match(runnerPageSource, /order: "Đơn"/);
  assert.match(runnerPageSource, /quantity: "Số món"/);
  assert.match(runnerPageSource, /status: "Trạng thái"/);
  assert.match(runnerPageSource, /wait: "Thời gian đợi"/);
  assert.match(
    runnerPageSource,
    /const RUNNER_ACTIVE_STATUSES = \["pending", "preparing"\] as const;/,
  );
  assert.match(
    runnerPageSource,
    /const RUNNER_VISIBLE_STATUSES = \[\s*"pending",\s*"preparing",\s*"ready"\s*\] as const;/,
  );
  assert.match(runnerPageSource, /\.in\("status", RUNNER_ACTIVE_STATUSES\)/);
  assert.match(runnerPageSource, /\.in\("status", RUNNER_VISIBLE_STATUSES\)/);
  assert.match(runnerPageSource, /const RUNNER_VISIBLE_ROW_LIMIT = 4;/);
  assert.match(runnerPageSource, /rows\.slice\(0, RUNNER_VISIBLE_ROW_LIMIT\)/);
  assert.match(runnerPageSource, /className="flex h-dvh min-h-0 w-full/);
  assert.match(runnerPageSource, /className="flex h-full min-h-0 w-full/);
  assert.match(runnerPageSource, /grid-rows-4/);
  assert.match(runnerPageSource, /grid-cols-12/);
  assert.match(runnerPageSource, /const RUNNER_COLUMN_SPAN = \{/);
  assert.match(runnerPageSource, /order: 5/);
  assert.match(runnerPageSource, /quantity: 2/);
  assert.match(runnerPageSource, /status: 3/);
  assert.match(runnerPageSource, /wait: 2/);
  assert.match(runnerPageSource, /RunnerColumnHeader/);
  assert.match(runnerPageSource, /items-stretch/);
  assert.match(runnerPageSource, /divide-x divide-border\/70/);
  assert.match(runnerPageSource, /role="list"/);
  assert.match(runnerPageSource, /role="listitem"/);
  assert.match(runnerPageSource, /flex-1 grid-rows-4/);
  assert.match(runnerPageSource, /text-runner-header/);
  assert.match(runnerPageSource, /text-runner-board/);
  assert.match(runnerPageSource, /text-runner-empty-secondary/);
  assert.match(runnerPageSource, /text-runner-footer/);
  assert.match(runnerPageSource, /RunnerEmptyMascot/);
  assert.match(runnerPageSource, /RunnerFooter/);
  assert.match(runnerPageSource, /gap-6 overflow-hidden bg-background px-8/);
  assert.match(runnerPageSource, /flex max-w-full flex-col items-center gap-3/);
  assert.match(runnerPageSource, /aria-hidden="true"/);
  assert.match(runnerPageSource, /priority/);
  assert.match(
    runnerPageSource,
    /className="h-56 w-auto shrink-0 object-contain drop-shadow-lg md:h-64"/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerOrderCell span=\{RUNNER_COLUMN_SPAN\.status\} mono>\s*\{statusLabel\}\s*<\/RunnerOrderCell>/,
  );
  assert.match(runnerPageSource, /bg-primary text-primary-foreground/);
  assert.match(
    runnerPageSource,
    /featured \? RUNNER_FEATURED_STATUS : row\.status/,
  );
  assert.match(runnerPageSource, /getRunnerStatusLabel/);
  assert.match(runnerPageSource, /RunnerOrderCell/);
  assert.match(
    runnerPageSource,
    /import \{ RunnerWaitTime \} from "\.\/runner-wait-time";/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerWaitTime startIso=\{row\.item\.sortAt\} initialNowMs=\{nowMs\} \/>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.order\}>\s*\{RUNNER_COPY\.tableHeaders\.order\}\s*<\/RunnerColumnHeader>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.quantity\}>\s*\{RUNNER_COPY\.tableHeaders\.quantity\}\s*<\/RunnerColumnHeader>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.status\}>\s*\{RUNNER_COPY\.tableHeaders\.status\}\s*<\/RunnerColumnHeader>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.wait\} align="right">/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerOrderCell span=\{RUNNER_COLUMN_SPAN\.order\} mono>\s*\{row\.orderLabel\}\s*<\/RunnerOrderCell>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerOrderCell span=\{RUNNER_COLUMN_SPAN\.quantity\} mono>\s*\{formatItemQuantity\(row\.itemQuantity\)\} \{RUNNER_COPY\.itemUnit\}\s*<\/RunnerOrderCell>/,
  );
  assert.doesNotMatch(
    runnerPageSource,
    /<RunnerColumnHeader align="right">\s*\{RUNNER_COPY\.tableHeaders\.quantity\}/,
  );
  assert.doesNotMatch(
    runnerPageSource,
    /<RunnerOrderCell align="right" mono>\s*\{formatItemQuantity\(row\.itemQuantity\)\}/,
  );
  assert.doesNotMatch(runnerPageSource, /Danh sách đơn KDS/);
  assert.doesNotMatch(runnerPageSource, /featuredLabel/);
  assert.doesNotMatch(runnerPageSource, /sectionTitle/);
  assert.doesNotMatch(runnerPageSource, /AppPageHeader/);
  assert.doesNotMatch(runnerPageSource, /AppEmptyState/);
  assert.doesNotMatch(runnerPageSource, /IconCookingPot/);
  assert.doesNotMatch(runnerPageSource, /@comtammatu\/ui\/components\/item/);
  assert.doesNotMatch(runnerPageSource, /variant="outline"/);
  assert.doesNotMatch(runnerPageSource, /<AppPage/);
  assert.doesNotMatch(runnerPageSource, /<AppSection/);
  assert.doesNotMatch(runnerPageSource, /RunnerSummaryBadge/);
  assert.doesNotMatch(runnerPageSource, /RunnerFeaturedCall/);
  assert.doesNotMatch(runnerPageSource, /RunnerQueueList/);
  assert.doesNotMatch(runnerPageSource, /RunnerQueueCard/);
  assert.doesNotMatch(runnerPageSource, /RUNNER_NEXT_ORDER_LIMIT/);
  assert.doesNotMatch(runnerPageSource, /auto-rows-fr/);
  assert.doesNotMatch(runnerPageSource, /text-\[28px\]/);
  assert.doesNotMatch(runnerPageSource, /<RunnerOrderCell label=/);
  assert.doesNotMatch(runnerPageSource, /grid-cols-runner-board/);
  assert.doesNotMatch(runnerPageSource, /size="status"/);
  assert.doesNotMatch(runnerPageSource, /text-runner-status/);
  assert.doesNotMatch(runnerPageSource, /text-warning/);
  assert.doesNotMatch(runnerPageSource, /text-success/);
  assert.doesNotMatch(runnerPageSource, /status\.className/);
  assert.doesNotMatch(runnerPageSource, /order: "Bàn"/);
  assert.doesNotMatch(runnerPageSource, /grid-cols-4/);
  assert.doesNotMatch(runnerPageSource, /uppercase tracking-wide/);
  assert.doesNotMatch(runnerPageSource, /actions=\{/);
  assert.doesNotMatch(runnerPageSource, /eyebrow: "Runner"/);
  assert.doesNotMatch(runnerPageSource, /Chưa có đơn Runner/);
  assert.doesNotMatch(runnerPageSource, /Đã phục vụ các toàn bộ đơn/);
  assert.doesNotMatch(runnerPageSource, /Chúc quý khách ngon miệng/);
  assert.doesNotMatch(runnerPageSource, /Mời nhận món/);
  assert.doesNotMatch(runnerPageSource, /Đang mời/);
  assert.doesNotMatch(runnerPageSource, /Đang làm/);
  assert.doesNotMatch(runnerPageSource, /Chưa có món sẵn sàng/);
  assert.doesNotMatch(runnerPageSource, /Chưa có đơn trong KDS/);
  assert.doesNotMatch(runnerPageSource, /Khi POS gửi món vào bếp/);
  assert.doesNotMatch(runnerPageSource, /bg-primary\/10/);
  assert.doesNotMatch(
    runnerPageSource,
    /\.in\("status", \["ready", "served"\]\)/,
  );
  assert.doesNotMatch(
    runnerPageSource,
    /\.filter\(\(item\) => item\.lane === "served"\)/,
  );
  assert.doesNotMatch(runnerPageSource, /aria-label=\{`Runner/);
});

test("Runner board uses fixed design-system text and Tailwind grid tokens", () => {
  assert.match(uiGlobalsSource, /--text-runner-header: 44px;/);
  assert.match(uiGlobalsSource, /--text-runner-header--line-height: 52px;/);
  assert.match(uiGlobalsSource, /--text-runner-board: 52px;/);
  assert.match(uiGlobalsSource, /--text-runner-board--line-height: 60px;/);
  assert.match(uiGlobalsSource, /--text-runner-empty-secondary: 44px;/);
  assert.match(
    uiGlobalsSource,
    /--text-runner-empty-secondary--line-height: 52px;/,
  );
  assert.match(uiGlobalsSource, /--text-runner-footer: 40px;/);
  assert.match(uiGlobalsSource, /--text-runner-footer--line-height: 48px;/);
  assert.doesNotMatch(uiGlobalsSource, /@utility grid-cols-runner-board/);
  assert.doesNotMatch(
    uiGlobalsSource,
    /grid-template-columns: 35% 20% 25% 20%;/,
  );
});

test("Runner wait-time cell updates every second on the client", () => {
  assert.match(runnerWaitTimeSource, /"use client";/);
  assert.match(runnerWaitTimeSource, /const RUNNER_WAIT_TICK_MS = 1_000;/);
  assert.match(runnerWaitTimeSource, /const \[nowMs, setNowMs\] = useState/);
  assert.match(runnerWaitTimeSource, /setNowMs\(Date\.now\(\)\);/);
  assert.match(
    runnerWaitTimeSource,
    /window\.setInterval\(tick, RUNNER_WAIT_TICK_MS\)/,
  );
  assert.match(
    runnerWaitTimeSource,
    /document\.addEventListener\("visibilitychange", handleVisibility\)/,
  );
  assert.match(runnerWaitTimeSource, /window\.clearInterval\(intervalId\)/);
  assert.match(
    runnerWaitTimeSource,
    /document\.removeEventListener\("visibilitychange", handleVisibility\)/,
  );
});

test("Runner wait time shows seconds before the first minute", () => {
  const cases = [
    { elapsedMs: -1_000, expected: "0s" },
    { elapsedMs: 0, expected: "0s" },
    { elapsedMs: 1_000, expected: "1s" },
    { elapsedMs: 15_000, expected: "15s" },
    { elapsedMs: 59_000, expected: "59s" },
    { elapsedMs: 60_000, expected: "1p" },
    { elapsedMs: 119_000, expected: "1p" },
    { elapsedMs: 3_600_000, expected: "1g" },
    { elapsedMs: 3_660_000, expected: "1g 1p" },
  ];
  const functionSource = (
    runnerWaitTimeSource.match(
      /export function formatRunnerWaitTime[\s\S]*?\n}\n/,
    )?.[0] ?? ""
  ).replace(
    "export function formatRunnerWaitTime(startIso: string, nowMs: number): string",
    "function formatRunnerWaitTime(startIso, nowMs)",
  );
  const formatter = new Function(
    `${functionSource}; return formatRunnerWaitTime;`,
  )() as (startIso: string, nowMs: number) => string;
  const nowMs = Date.UTC(2026, 4, 27, 13, 0, 0);

  for (const { elapsedMs, expected } of cases) {
    assert.equal(
      formatter(new Date(nowMs - elapsedMs).toISOString(), nowMs),
      expected,
    );
  }

  assert.equal(formatter("not-a-date", nowMs), "0s");
});
