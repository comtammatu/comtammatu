import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const runnerPageOnlySource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/runner/page.tsx"),
  "utf8",
);
const runnerOrderBoardSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/runner/runner-order-board-client.tsx",
  ),
  "utf8",
);
const runnerPageSource = `${runnerPageOnlySource}\n${runnerOrderBoardSource}`;
const runnerWaitTimeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/runner/runner-wait-time.tsx",
  ),
  "utf8",
);
const runnerRealtimeRefreshSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/runner/runner-realtime-refresh.tsx",
  ),
  "utf8",
);
const runnerIdleVisualSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/runner/runner-idle-visual.tsx",
  ),
  "utf8",
);
const uiGlobalsSource = readFileSync(
  join(process.cwd(), "../../packages/ui/src/styles/globals.css"),
  "utf8",
);

test("Runner page follows the KDS order-list vocabulary", () => {
  assert.match(
    runnerPageSource,
    /import \{ createServiceClient \} from "@comtammatu\/database\/supabase\/service";/,
  );
  assert.match(
    runnerPageSource,
    /import \{ notFound \} from "next\/navigation";/,
  );
  assert.match(
    runnerPageSource,
    /type RunnerSupabase = ReturnType<typeof createServiceClient>;/,
  );
  assert.match(runnerPageSource, /const supabase = createServiceClient\(\);/);
  assert.match(
    runnerPageSource,
    /if \(!Number\.isInteger\(branchIdNum\) \|\| branchIdNum <= 0\)/,
  );
  assert.match(runnerPageSource, /isRunnerOperationalBranchKind/);
  assert.match(runnerPageSource, /branch\.is_active !== true/);
  assert.match(runnerPageSource, /const tenantId = branch\.tenant_id;/);
  assert.match(runnerPageSource, /\.eq\("tenant_id", tenantId\)/);
  assert.match(runnerPageSource, /notFound\(\);/);
  assert.doesNotMatch(runnerPageSource, /runner_public_slug/);
  assert.doesNotMatch(runnerPageSource, /RUNNER_DISPLAY_TOKEN_RE/);
  assert.doesNotMatch(runnerPageSource, /loadAuthState/);
  assert.doesNotMatch(runnerPageSource, /@\/_lib\/auth/);
  assert.doesNotMatch(runnerPageSource, /claims\.tenant_id/);
  assert.match(runnerPageSource, /eyebrow: MODULE_LABELS_VI\.runner/);
  assert.match(runnerPageSource, /idleEmptyTitle: "Chưa có món cần phục vụ\."/);
  assert.match(
    runnerPageSource,
    /idleDoneTitle: "Đã phục vụ hết món đang chờ\."/,
  );
  assert.match(
    runnerPageSource,
    /idleBrandLine: "Món mới sẽ hiện ngay khi bếp gọi phục vụ\."/,
  );
  assert.match(runnerPageSource, /wifi: "WiFi: Má Tư"/);
  assert.match(runnerPageSource, /password: "Mật khẩu: xincamon"/);
  assert.doesNotMatch(runnerPageSource, /RUNNER_READY_WINDOW_MS/);
  assert.doesNotMatch(runnerPageSource, /RUNNER_FEATURED_STATUS/);
  assert.doesNotMatch(runnerPageSource, /ready: "Sẵn sàng"/);
  assert.match(runnerPageSource, /pending: "Đang chờ"/);
  assert.doesNotMatch(runnerPageSource, /preparing: "Chuẩn bị"/);
  assert.match(runnerPageSource, /order: "Đơn"/);
  assert.match(runnerPageSource, /quantity: "Số món"/);
  assert.match(runnerPageSource, /status: "Trạng thái"/);
  assert.match(runnerPageSource, /wait: "Chờ"/);
  assert.doesNotMatch(runnerPageSource, /wait: "Thời gian đợi"/);
  assert.match(
    runnerPageSource,
    /const RUNNER_ACTIVE_STATUSES = \["pending", "preparing"\] as const;/,
  );
  assert.doesNotMatch(runnerPageSource, /RUNNER_VISIBLE_STATUSES/);
  assert.match(runnerPageSource, /\.in\("status", RUNNER_ACTIVE_STATUSES\)/);
  assert.match(runnerPageSource, /const RUNNER_ROW_LIMIT_BASE = 4;/);
  assert.match(runnerPageSource, /const RUNNER_ROW_LIMIT_XL = 6;/);
  assert.match(
    runnerPageSource,
    /displayRows\.slice\(0, RUNNER_ROW_LIMIT_XL\)/,
  );
  assert.match(runnerPageSource, /hiddenBelowXl && "hidden xl:grid"/);
  assert.match(
    runnerPageSource,
    /moreOrders: \(count: number\) => `Còn \$\{String\(count\)\} đơn đang chờ`/,
  );
  assert.match(runnerPageSource, /className="flex h-dvh min-h-0 w-full/);
  assert.match(runnerPageSource, /className="flex h-full min-h-0 w-full/);
  assert.match(runnerPageSource, /grid-rows-4/);
  assert.match(runnerPageSource, /grid-cols-12/);
  assert.match(runnerPageSource, /const RUNNER_COLUMN_SPAN = \{/);
  assert.match(runnerPageSource, /order: 4/);
  assert.match(runnerPageSource, /quantity: 3/);
  assert.match(runnerPageSource, /status: 4/);
  assert.match(runnerPageSource, /wait: 1/);
  assert.match(runnerPageSource, /RunnerColumnHeader/);
  assert.match(runnerPageSource, /items-stretch/);
  assert.match(runnerPageSource, /divide-x divide-border\/70/);
  assert.match(runnerPageSource, /role="list"/);
  assert.match(runnerPageSource, /role="listitem"/);
  assert.match(
    runnerPageSource,
    /aria-current=\{featured \? "true" : undefined\}/,
  );
  assert.match(runnerPageSource, /const RUNNER_EXIT_MS = 320;/);
  assert.match(runnerPageSource, /setDisplayRows/);
  assert.match(runnerPageSource, /window\.setTimeout/);
  assert.match(
    runnerPageSource,
    /data-runner-exiting=\{row\.exiting \? "true" : undefined\}/,
  );
  assert.match(runnerPageSource, /motion-safe:duration-300/);
  assert.match(runnerPageSource, /-translate-x-full opacity-0/);
  assert.match(
    runnerPageSource,
    /data-runner-featured=\{featured \? "true" : undefined\}/,
  );
  assert.match(
    runnerPageSource,
    /flex-1 grid-rows-4 overflow-hidden xl:grid-rows-6/,
  );
  assert.match(runnerPageSource, /text-runner-header/);
  assert.match(runnerPageSource, /text-runner-board/);
  assert.match(runnerPageSource, /text-runner-empty-secondary/);
  assert.match(runnerPageSource, /text-runner-footer/);
  assert.match(runnerPageSource, /RunnerIdleVisual/);
  assert.match(runnerPageSource, /type RunnerIdleState/);
  assert.match(runnerPageSource, /fetchRunnerTodayTicketCount/);
  assert.match(
    runnerPageSource,
    /\.select\("id", \{ count: "exact", head: true \}\)/,
  );
  assert.match(runnerPageSource, /\.lt\("created_at", todayEndIso\)/);
  assert.match(
    runnerPageSource,
    /idleState = todayTicketCountResult\.count > 0 \? "done" : "empty";/,
  );
  assert.match(runnerPageSource, /if \(displayRows\.length === 0\)/);
  assert.match(
    runnerPageSource,
    /<RunnerOrderBoardClient rows=\{rows\} nowMs=\{nowMs\} idleState=\{idleState\} \/>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerIdleVisual state=\{resolvedIdleState\} \/>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerIdleAtmosphere state=\{resolvedIdleState\} \/>/,
  );
  assert.match(runnerPageSource, /function RunnerIdleAtmosphere/);
  assert.match(runnerPageSource, /data-runner-idle-atmosphere=\{state\}/);
  assert.match(runnerPageSource, /from-success\/15 via-success\/5/);
  assert.match(runnerPageSource, /from-warning\/15 via-warning\/5/);
  assert.match(runnerPageSource, /border-t border-border\/80 bg-muted\/30/);
  assert.match(runnerPageSource, /RunnerFooter/);
  assert.match(
    runnerPageSource,
    /relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-4 text-center/,
  );
  assert.match(runnerPageSource, /flex max-w-full flex-col items-center gap-2/);
  assert.match(
    runnerPageSource,
    /<RunnerOrderCell span=\{RUNNER_COLUMN_SPAN\.status\} mono>\s*\{statusLabel\}\s*<\/RunnerOrderCell>/,
  );
  assert.match(
    runnerPageSource,
    /const statusLabel = getRunnerStatusLabel\(row\.status\);/,
  );
  assert.match(runnerPageSource, /featured && "border-l-primary"/);
  assert.match(
    runnerPageSource,
    /featured && "bg-warning\/15 ring-1 ring-inset ring-warning\/40"/,
  );
  assert.doesNotMatch(runnerPageSource, /bg-primary text-primary-foreground/);
  assert.doesNotMatch(runnerPageSource, /\.eq\("status", "ready"\)/);
  assert.doesNotMatch(runnerPageSource, /readyAfterIso/);
  assert.doesNotMatch(runnerPageSource, /RUNNER_COPY\.ready/);
  assert.doesNotMatch(runnerPageSource, /RUNNER_COPY\.preparing/);
  assert.doesNotMatch(runnerPageSource, /border-success\/70/);
  assert.match(runnerPageSource, /getRunnerStatusLabel/);
  assert.match(runnerPageSource, /RunnerOrderCell/);
  assert.match(
    runnerPageSource,
    /import \{ RunnerWaitTime \} from "\.\/runner-wait-time";/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerWaitTime startIso=\{row\.sortAt\} initialNowMs=\{nowMs\} \/>/,
  );
  assert.match(runnerPageSource, /sortAt: item\.sortAt/);
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.order\}>\s*\{RUNNER_BOARD_COPY\.tableHeaders\.order\}\s*<\/RunnerColumnHeader>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.quantity\}>\s*\{RUNNER_BOARD_COPY\.tableHeaders\.quantity\}\s*<\/RunnerColumnHeader>/,
  );
  assert.match(
    runnerPageSource,
    /<RunnerColumnHeader span=\{RUNNER_COLUMN_SPAN\.status\}>\s*\{RUNNER_BOARD_COPY\.tableHeaders\.status\}\s*<\/RunnerColumnHeader>/,
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
    /<RunnerOrderCell span=\{RUNNER_COLUMN_SPAN\.quantity\} mono>\s*\{formatCount\(row\.itemQuantity\)\} \{RUNNER_BOARD_COPY\.itemUnit\}\s*<\/RunnerOrderCell>/,
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
  assert.match(runnerPageSource, /function RunnerErrorState/);
  assert.match(runnerPageSource, /<AppEmptyState/);
  assert.doesNotMatch(runnerPageSource, /IconCookingPot/);
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
  assert.doesNotMatch(runnerPageSource, /chúc quý khách dùng bữa ngon miệng/);
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

test("Runner public board uses polling, not raw Realtime changes", () => {
  assert.match(runnerPageSource, /<RunnerRealtimeRefresh \/>/);
  assert.match(runnerRealtimeRefreshSource, /"use client";/);
  assert.match(runnerRealtimeRefreshSource, /const POLL_INTERVAL_MS = 3_000;/);
  assert.match(runnerRealtimeRefreshSource, /router\.refresh\(\)/);
  assert.match(runnerRealtimeRefreshSource, /window\.setInterval/);
  assert.match(runnerRealtimeRefreshSource, /visibilitychange/);
  assert.doesNotMatch(runnerRealtimeRefreshSource, /useRealtimeChannel/);
  assert.doesNotMatch(runnerRealtimeRefreshSource, /postgres_changes/);
  assert.doesNotMatch(runnerRealtimeRefreshSource, /\.channel\(/);
});

test("Runner idle visual renders the shared animated Cot Let status mascot", () => {
  assert.doesNotMatch(runnerIdleVisualSource, /"use client";/);
  assert.match(
    runnerIdleVisualSource,
    /export type RunnerIdleState = "empty" \| "done";/,
  );
  // Idle mascot renders through the shared BrandMascot adapter, not a direct
  // /brand/mascot/* asset reference (design-system.md brand rules).
  assert.match(
    runnerIdleVisualSource,
    /import \{ BrandMascot \} from "@\/components\/brand";/,
  );
  assert.doesNotMatch(runnerIdleVisualSource, /\/brand\/mascot\/cotlet\.png/);
  assert.doesNotMatch(runnerIdleVisualSource, /next\/image/);
  assert.match(runnerIdleVisualSource, /<BrandMascot/);
  assert.match(runnerIdleVisualSource, /animated/);
  assert.match(
    runnerIdleVisualSource,
    /state === "done" \? "waving" : "waiting"/,
  );
  assert.match(runnerIdleVisualSource, /mood=\{mascotMood\}/);
  assert.match(runnerIdleVisualSource, /scale-75/);
  assert.match(runnerIdleVisualSource, /priority/);
  assert.match(runnerIdleVisualSource, /bg-warning\/15/);
  assert.match(runnerIdleVisualSource, /bg-warning\/10/);
  assert.match(runnerIdleVisualSource, /data-runner-idle-state=\{state\}/);
  assert.doesNotMatch(runnerIdleVisualSource, /DotLottie/);
  assert.doesNotMatch(runnerIdleVisualSource, /@lottiefiles/);
  assert.doesNotMatch(runnerIdleVisualSource, /be-suon-tuoi/);
  assert.doesNotMatch(runnerIdleVisualSource, /https?:\/\//);

  // BrandMascot remains the single source for the mascot asset.
  const brandSource = readFileSync(
    join(process.cwd(), "app/components/brand.tsx"),
    "utf8",
  );
  assert.match(brandSource, /src: "\/brand\/mascot\/cotlet\.png"/);
  assert.match(brandSource, /motion-safe:animate-cotlet-idle/);
  assert.match(brandSource, /motion-safe:animate-cotlet-waiting/);
  assert.match(brandSource, /motion-safe:animate-cotlet-waving/);
  assert.match(brandSource, /width: 384/);
  assert.match(brandSource, /height: 512/);
  assert.match(
    uiGlobalsSource,
    /--animate-cotlet-idle: cotlet-idle 1s steps\(6\) infinite;/,
  );
  assert.match(
    uiGlobalsSource,
    /--animate-cotlet-waiting: cotlet-waiting 1\.1s steps\(6\) infinite;/,
  );
  assert.match(
    uiGlobalsSource,
    /--animate-cotlet-waving: cotlet-waving 800ms steps\(4\) infinite;/,
  );
  assert.doesNotMatch(uiGlobalsSource, /steps\(8\) infinite/);
  assert.match(uiGlobalsSource, /\/brand\/mascot\/cotlet\.spritesheet\.webp/);
  assert.match(uiGlobalsSource, /@utility mascot-cotlet/);
  assert.match(uiGlobalsSource, /@utility mascot-cotlet-waiting/);
  assert.match(uiGlobalsSource, /@utility mascot-cotlet-waving/);
});

test("Runner board uses responsive design-system text and Tailwind grid tokens", () => {
  assert.match(
    uiGlobalsSource,
    /--text-runner-header: clamp\(1\.25rem, 3\.2dvh, 2\.875rem\);/,
  );
  assert.match(uiGlobalsSource, /--text-runner-header--line-height: 1\.12;/);
  assert.match(
    uiGlobalsSource,
    /--text-runner-board: clamp\(1\.625rem, 3\.8dvh, 3\.75rem\);/,
  );
  assert.match(uiGlobalsSource, /--text-runner-board--line-height: 1\.12;/);
  assert.match(
    uiGlobalsSource,
    /--text-runner-empty-secondary: clamp\(1\.25rem, 3dvh, 2\.75rem\);/,
  );
  assert.match(
    uiGlobalsSource,
    /--text-runner-empty-secondary--line-height: 1\.12;/,
  );
  assert.match(
    uiGlobalsSource,
    /--text-runner-footer: clamp\(1\.125rem, 2\.4dvh, 2\.25rem\);/,
  );
  assert.match(uiGlobalsSource, /--text-runner-footer--line-height: 1\.12;/);
  assert.doesNotMatch(
    uiGlobalsSource,
    /--text-runner-(?:header|board|empty-secondary|footer): \d+px;/,
  );
  assert.doesNotMatch(
    uiGlobalsSource,
    /--text-runner-(?:header|board|empty-secondary|footer): [^;]*vw/,
  );
  assert.doesNotMatch(uiGlobalsSource, /@utility grid-cols-runner-board/);
  assert.doesNotMatch(
    uiGlobalsSource,
    /grid-template-columns: 35% 20% 25% 20%;/,
  );
  assert.match(runnerPageSource, /span === RUNNER_COLUMN_SPAN\.wait/);
  assert.match(runnerPageSource, /"px-2 xl:px-4" : "px-4"/);
  assert.match(runnerPageSource, /return "col-span-4"/);
  assert.match(runnerPageSource, /return "col-span-1"/);
  assert.match(
    runnerPageSource,
    /text-runner-footer font-semibold text-foreground xl:gap-x-16 xl:px-8 xl:py-4/,
  );
  assert.doesNotMatch(runnerPageSource, /brand-pattern-vong-to/);
  assert.doesNotMatch(runnerPageSource, /brand-strip brand-pattern-vong-to/);
  assert.doesNotMatch(
    runnerPageSource,
    /px-8 py-4 font-heading text-runner-header/,
  );
  assert.doesNotMatch(runnerPageSource, /justify-center px-8 py-4/);
  assert.doesNotMatch(runnerPageSource, /col-span-5/);
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
