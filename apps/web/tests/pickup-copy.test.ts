import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol } from "./static-source";

const read = (path: string) =>
  normalizeEol(readFileSync(join(process.cwd(), path), "utf8"));

const pickupPageOnlySource = read(
  "app/(protected)/br/[branchId]/pickup/page.tsx",
);
const pickupLayoutSource = read(
  "app/(protected)/br/[branchId]/pickup/layout.tsx",
);
const pickupLoadingSource = read(
  "app/(protected)/br/[branchId]/pickup/loading.tsx",
);
const pickupErrorSource = read(
  "app/(protected)/br/[branchId]/pickup/error.tsx",
);
const pickupLightModeSource = read(
  "app/(protected)/br/[branchId]/pickup/pickup-light-mode.tsx",
);
const pickupOrderBoardSource = read(
  "app/(protected)/br/[branchId]/pickup/pickup-order-board-client.tsx",
);
const pickupPageSource = `${pickupLayoutSource}\n${pickupPageOnlySource}\n${pickupOrderBoardSource}`;
const pickupWaitTimeSource = read(
  "app/(protected)/br/[branchId]/pickup/pickup-wait-time.tsx",
);
const pickupRealtimeRefreshSource = read(
  "app/(protected)/br/[branchId]/pickup/pickup-realtime-refresh.tsx",
);
const pickupIdleVisualSource = read(
  "app/(protected)/br/[branchId]/pickup/pickup-idle-visual.tsx",
);
const uiGlobalsSource = read("../../packages/ui/src/styles/globals.css");

test("public pickup skips staff layout auth; retired /runner redirects to pickup", () => {
  const protectedLayout = read("app/(protected)/layout.tsx");
  const proxy = read("proxy.ts");
  const skipIdx = protectedLayout.indexOf("isPickupPublicDisplayPath");
  const authIdx = protectedLayout.indexOf("await loadAuthState()");
  const rewriteIdx = proxy.indexOf("rewriteRetiredRunnerPath");
  const publicIdx = proxy.indexOf("isPublicAppPath(pathname)");

  assert.ok(skipIdx >= 0 && authIdx > skipIdx);
  assert.match(protectedLayout, /readRequestPathname\(await headers\(\)\)/);
  assert.match(protectedLayout, /isStationChromePath/);
  assert.match(protectedLayout, /return children;/);
  assert.ok(rewriteIdx >= 0 && publicIdx > rewriteIdx);
  assert.match(proxy, /NextResponse\.redirect\(url, 308\)/);
  assert.match(proxy, /withRequestPathname/);
  assert.match(proxy, /passThrough\(request\)/);
});

test("Pickup page follows the KDS order-list vocabulary", () => {
  assert.match(
    pickupPageSource,
    /import \{ createServiceClient \} from "@comtammatu\/database\/supabase\/service";/,
  );
  assert.match(
    pickupPageSource,
    /import \{ notFound \} from "next\/navigation";/,
  );
  assert.match(
    pickupPageSource,
    /type PickupSupabase = ReturnType<typeof createServiceClient>;/,
  );
  assert.match(pickupPageSource, /const supabase = createServiceClient\(\);/);
  assert.match(
    pickupPageSource,
    /if \(!Number\.isInteger\(branchIdNum\) \|\| branchIdNum <= 0\)/,
  );
  assert.match(pickupPageSource, /isPickupOperationalBranchKind/);
  assert.match(pickupPageSource, /branch\.is_active !== true/);
  assert.match(pickupPageSource, /const tenantId = branch\.tenant_id;/);
  assert.match(pickupPageSource, /\.eq\("tenant_id", tenantId\)/);
  assert.match(pickupPageSource, /notFound\(\);/);
  assert.doesNotMatch(pickupPageSource, /runner_public_slug/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_DISPLAY_TOKEN_RE/);
  assert.doesNotMatch(pickupPageSource, /loadAuthState/);
  assert.doesNotMatch(pickupPageSource, /@\/_lib\/auth/);
  assert.doesNotMatch(pickupPageSource, /claims\.tenant_id/);
  assert.match(pickupPageSource, /eyebrow: MODULE_LABELS_VI\.pickup/);
  assert.match(pickupPageSource, /idleEmptyTitle: "Chưa có món cần phục vụ\."/);
  assert.match(
    pickupPageSource,
    /idleDoneTitle: "Đã phục vụ hết món đang chờ\."/,
  );
  assert.match(
    pickupPageSource,
    /idleBrandLine: "Món mới sẽ hiện ngay khi bếp gọi phục vụ\."/,
  );
  assert.match(pickupPageSource, /wifi: "WiFi: Má Tư"/);
  assert.match(pickupPageSource, /password: "Mật khẩu: xincamon"/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_READY_WINDOW_MS/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_FEATURED_STATUS/);
  assert.doesNotMatch(pickupPageSource, /ready: "Sẵn sàng"/);
  assert.match(pickupPageSource, /inProgress: "Đang làm"/);
  assert.match(pickupPageSource, /pending: "Chờ"/);
  assert.doesNotMatch(pickupPageSource, /preparing: "Chuẩn bị"/);
  assert.match(pickupPageSource, /order: "Đơn"/);
  assert.match(pickupPageSource, /quantity: "Số món"/);
  assert.match(pickupPageSource, /status: "Trạng thái"/);
  assert.match(pickupPageSource, /wait: "Chờ"/);
  assert.doesNotMatch(pickupPageSource, /wait: "Thời gian đợi"/);
  assert.match(
    pickupPageSource,
    /const PICKUP_ACTIVE_STATUSES = \["pending", "preparing", "ready"\] as const;/,
  );
  assert.match(pickupPageSource, /isPickupGuestBoardVisible/);
  assert.doesNotMatch(pickupPageSource, /laneDineIn/);
  assert.doesNotMatch(pickupPageSource, /PickupLaneBoard/);
  assert.doesNotMatch(pickupPageSource, /md:grid-cols-2/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_VISIBLE_STATUSES/);
  assert.match(pickupPageSource, /\.in\("status", PICKUP_ACTIVE_STATUSES\)/);
  assert.match(pickupPageSource, /const PICKUP_ROW_LIMIT_BASE = 4;/);
  assert.match(pickupPageSource, /const PICKUP_ROW_LIMIT_XL = 6;/);
  assert.match(
    pickupPageSource,
    /const rowLimit = usesBaseRowLimit[\s\S]*PICKUP_ROW_LIMIT_BASE[\s\S]*PICKUP_ROW_LIMIT_XL/,
  );
  assert.match(pickupPageSource, /useIsMobile\(1280\)/);
  assert.doesNotMatch(pickupPageSource, /hiddenBelowXl/);
  assert.match(pickupPageSource, /const PICKUP_OVERFLOW_TILE_LIMIT = 4;/);
  assert.match(
    pickupPageSource,
    /const PICKUP_OVERFLOW_PREVIEW_LIMIT = PICKUP_OVERFLOW_TILE_LIMIT - 1;/,
  );
  assert.match(
    pickupPageSource,
    /moreOrders: \(count: number\) => `Còn \$\{String\(count\)\} đơn`/,
  );
  assert.match(pickupPageSource, /function PickupOverflowRail/);
  assert.match(pickupPageSource, /data-pickup-overflow-rail/);
  assert.match(
    pickupPageSource,
    /<PickupOverflowRail rows=\{overflowRows\} \/>/,
  );
  assert.doesNotMatch(pickupPageSource, /overflowBaseRows|overflowXlRows/);
  assert.match(
    pickupPageSource,
    /activeRows\.slice\(0, PICKUP_OVERFLOW_PREVIEW_LIMIT\)/,
  );
  assert.match(pickupPageSource, /activeRows\.length - previewRows\.length/);
  assert.match(pickupPageSource, /grid-flow-col auto-cols-fr gap-2/);
  assert.match(
    pickupPageOnlySource,
    /className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background"/,
  );
  assert.match(
    pickupPageOnlySource,
    /className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-background p-4"/,
  );
  assert.doesNotMatch(pickupPageOnlySource, /\bh-dvh\b/);
  assert.match(pickupPageSource, /className="flex h-full min-h-0 w-full/);
  assert.match(
    pickupPageSource,
    /className="theme-light-only chrome-safe-pt flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground touch-manipulation"/,
  );
  assert.match(
    pickupLoadingSource,
    /className="flex min-h-0 flex-1 items-center justify-center"/,
  );
  assert.match(
    pickupErrorSource,
    /className="flex min-h-0 flex-1 items-center justify-center p-4"/,
  );
  assert.match(pickupPageSource, /<PickupLightMode \/>/);
  assert.match(uiGlobalsSource, /:root,\n\.theme-light-only \{/);
  assert.match(uiGlobalsSource, /color-scheme: light;/);
  assert.match(pickupLightModeSource, /root\.classList\.remove\("dark"\)/);
  assert.match(pickupLightModeSource, /root\.classList\.add\("light"\)/);
  assert.match(pickupLightModeSource, /root\.style\.colorScheme = "light"/);
  assert.match(
    pickupLightModeSource,
    /window\.setTimeout\(applyLightMode, 0\)/,
  );
  assert.doesNotMatch(pickupLightModeSource, /matu-theme/);
  assert.doesNotMatch(pickupLightModeSource, /localStorage/);
  assert.match(pickupPageSource, /grid-rows-4/);
  assert.match(pickupPageSource, /grid-cols-2/);
  assert.match(pickupPageSource, /sm:grid-cols-12/);
  assert.match(pickupPageSource, /const PICKUP_COLUMN_CLASS = \{/);
  assert.match(pickupPageSource, /order: "col-span-1 border-r sm:col-span-4"/);
  assert.match(
    pickupPageSource,
    /quantity: "col-span-1 sm:col-span-3 sm:border-r"/,
  );
  assert.match(
    pickupPageSource,
    /status: "col-span-1 max-sm:border-t sm:col-span-4 sm:border-r"/,
  );
  assert.match(
    pickupPageSource,
    /wait: "col-span-1 max-sm:border-l max-sm:border-t sm:col-span-1"/,
  );
  assert.match(pickupPageSource, /PickupColumnHeading/);
  assert.match(pickupPageSource, /items-stretch/);
  assert.doesNotMatch(pickupPageSource, /divide-x divide-border\/70/);
  assert.match(pickupPageSource, /role="list"/);
  assert.match(pickupPageSource, /role="listitem"/);
  assert.match(
    pickupPageSource,
    /aria-current=\{featured \? "true" : undefined\}/,
  );
  assert.match(pickupPageSource, /const PICKUP_EXIT_MS = 320;/);
  assert.match(pickupPageSource, /setDisplayRows/);
  assert.match(pickupPageSource, /window\.setTimeout/);
  assert.match(
    pickupPageSource,
    /data-pickup-exiting=\{row\.exiting \? "true" : undefined\}/,
  );
  assert.match(pickupPageSource, /motion-safe:duration-300/);
  assert.match(pickupPageSource, /-translate-x-full opacity-0/);
  assert.match(
    pickupPageSource,
    /data-pickup-featured=\{featured \? "true" : undefined\}/,
  );
  assert.match(
    pickupPageSource,
    /flex-1 grid-rows-4 overflow-hidden xl:grid-rows-6/,
  );
  assert.match(pickupPageSource, /text-pickup-header/);
  assert.match(pickupPageSource, /text-pickup-board/);
  assert.match(pickupPageSource, /text-pickup-empty-secondary/);
  assert.match(pickupPageSource, /text-pickup-footer/);
  assert.match(pickupPageSource, /PickupIdleVisual/);
  assert.match(pickupPageSource, /type PickupIdleState/);
  assert.match(pickupPageSource, /fetchPickupTodayTicketCount/);
  assert.match(
    pickupPageSource,
    /\.select\("id", \{ count: "exact", head: true \}\)/,
  );
  assert.match(pickupPageSource, /\.lt\("created_at", todayEndIso\)/);
  assert.match(
    pickupPageSource,
    /idleState = todayTicketCountResult\.count > 0 \? "done" : "empty";/,
  );
  assert.match(pickupPageSource, /if \(displayRows\.length === 0\)/);
  assert.match(
    pickupPageSource,
    /<PickupOrderBoardClient rows=\{rows\} nowMs=\{nowMs\} idleState=\{idleState\} \/>/,
  );
  assert.match(
    pickupPageSource,
    /<PickupIdleVisual state=\{resolvedIdleState\} \/>/,
  );
  assert.match(
    pickupPageSource,
    /<PickupIdleAtmosphere state=\{resolvedIdleState\} \/>/,
  );
  assert.match(pickupPageSource, /function PickupIdleAtmosphere/);
  assert.match(pickupPageSource, /data-pickup-idle-atmosphere=\{state\}/);
  assert.match(pickupPageSource, /from-success\/15 via-success\/5/);
  assert.match(pickupPageSource, /from-warning\/15 via-warning\/5/);
  assert.match(pickupPageSource, /border-t border-border\/80 bg-muted\/30/);
  assert.match(pickupPageSource, /PickupFooter/);
  assert.match(
    pickupPageSource,
    /relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-4 text-center/,
  );
  assert.match(pickupPageSource, /flex max-w-full flex-col items-center gap-2/);
  assert.match(
    pickupPageSource,
    /<PickupOrderCell column="status" mono>\s*\{statusLabel\}\s*<\/PickupOrderCell>/,
  );
  assert.match(
    pickupPageSource,
    /const statusLabel = getPickupStatusLabel\(row\.status\);/,
  );
  assert.match(pickupPageSource, /featured && "border-l-primary"/);
  assert.match(
    pickupPageSource,
    /featured && "bg-warning\/15 ring-1 ring-inset ring-warning\/20"/,
  );
  assert.doesNotMatch(pickupPageSource, /bg-primary text-primary-foreground/);
  assert.doesNotMatch(pickupPageSource, /\.eq\("status", "ready"\)/);
  assert.doesNotMatch(pickupPageSource, /readyAfterIso/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_COPY\.ready/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_COPY\.preparing/);
  assert.doesNotMatch(pickupPageSource, /border-success\/70/);
  assert.match(pickupPageSource, /getPickupStatusLabel/);
  assert.match(pickupPageSource, /PickupOrderCell/);
  assert.match(
    pickupPageSource,
    /import \{ PickupWaitTime \} from "\.\/pickup-wait-time";/,
  );
  assert.match(
    pickupPageSource,
    /<PickupWaitTime startIso=\{row\.sortAt\} initialNowMs=\{nowMs\} \/>/,
  );
  assert.match(pickupPageSource, /sortAt: item\.sortAt/);
  assert.match(
    pickupPageSource,
    /<PickupColumnHeading column="order">\s*\{PICKUP_BOARD_COPY\.tableHeaders\.order\}\s*<\/PickupColumnHeading>/,
  );
  assert.match(
    pickupPageSource,
    /<PickupColumnHeading column="quantity">\s*\{PICKUP_BOARD_COPY\.tableHeaders\.quantity\}\s*<\/PickupColumnHeading>/,
  );
  assert.match(
    pickupPageSource,
    /<PickupColumnHeading column="status">\s*\{PICKUP_BOARD_COPY\.tableHeaders\.status\}\s*<\/PickupColumnHeading>/,
  );
  assert.match(
    pickupPageSource,
    /<PickupColumnHeading column="wait" align="right">/,
  );
  assert.match(
    pickupPageSource,
    /<PickupOrderCell column="order" mono>[\s\S]*?#\{queueIndex\}[\s\S]*?\{row\.orderLabel\}[\s\S]*?<\/PickupOrderCell>/,
  );
  assert.match(
    pickupPageSource,
    /<PickupOrderCell column="quantity" mono>\s*\{formatCount\(row\.itemQuantity\)\} \{PICKUP_BOARD_COPY\.itemUnit\}\s*<\/PickupOrderCell>/,
  );
  assert.doesNotMatch(
    pickupPageSource,
    /<PickupColumnHeading align="right">\s*\{PICKUP_COPY\.tableHeaders\.quantity\}/,
  );
  assert.doesNotMatch(
    pickupPageSource,
    /<PickupOrderCell align="right" mono>\s*\{formatItemQuantity\(row\.itemQuantity\)\}/,
  );
  assert.doesNotMatch(pickupPageSource, /Danh sách đơn KDS/);
  assert.doesNotMatch(pickupPageSource, /featuredLabel/);
  assert.doesNotMatch(pickupPageSource, /sectionTitle/);
  assert.doesNotMatch(pickupPageSource, /AppPageHeader/);
  assert.match(pickupPageSource, /function PickupErrorState/);
  assert.match(pickupPageSource, /<AppEmptyState/);
  assert.doesNotMatch(pickupPageSource, /IconCookingPot/);
  assert.doesNotMatch(pickupPageSource, /variant="outline"/);
  assert.doesNotMatch(pickupPageSource, /<AppPage/);
  assert.doesNotMatch(pickupPageSource, /<AppSection/);
  assert.doesNotMatch(pickupPageSource, /PickupSummaryBadge/);
  assert.doesNotMatch(pickupPageSource, /PickupFeaturedCall/);
  assert.doesNotMatch(pickupPageSource, /PickupQueueList/);
  assert.doesNotMatch(pickupPageSource, /PickupQueueCard/);
  assert.doesNotMatch(pickupPageSource, /PICKUP_NEXT_ORDER_LIMIT/);
  assert.doesNotMatch(pickupPageSource, /auto-rows-fr/);
  assert.doesNotMatch(pickupPageSource, /text-\[28px\]/);
  assert.doesNotMatch(pickupPageSource, /<PickupOrderCell label=/);
  assert.doesNotMatch(pickupPageSource, /grid-cols-pickup-board/);
  assert.doesNotMatch(pickupPageSource, /size="status"/);
  assert.doesNotMatch(pickupPageSource, /text-pickup-status/);
  assert.doesNotMatch(pickupPageSource, /text-warning/);
  assert.doesNotMatch(pickupPageSource, /text-success/);
  assert.doesNotMatch(pickupPageSource, /status\.className/);
  assert.doesNotMatch(pickupPageSource, /order: "Bàn"/);
  assert.doesNotMatch(pickupPageSource, /grid-cols-4/);
  assert.doesNotMatch(pickupPageSource, /uppercase tracking-wide/);
  assert.doesNotMatch(pickupPageSource, /actions=\{/);
  assert.doesNotMatch(pickupPageSource, /eyebrow: "Pickup"/);
  assert.doesNotMatch(pickupPageSource, /Chưa có đơn Pickup/);
  assert.doesNotMatch(pickupPageSource, /Đã phục vụ các toàn bộ đơn/);
  assert.doesNotMatch(pickupPageSource, /chúc quý khách dùng bữa ngon miệng/);
  assert.doesNotMatch(pickupPageSource, /Mời nhận món/);
  assert.doesNotMatch(pickupPageSource, /Đang mời/);
  assert.doesNotMatch(pickupPageSource, /Chưa có món sẵn sàng/);
  assert.doesNotMatch(pickupPageSource, /Chưa có đơn trong KDS/);
  assert.doesNotMatch(pickupPageSource, /Khi POS gửi món vào bếp/);
  assert.doesNotMatch(pickupPageSource, /bg-primary\/10/);
  assert.doesNotMatch(
    pickupPageSource,
    /\.in\("status", \["ready", "served"\]\)/,
  );
  assert.doesNotMatch(
    pickupPageSource,
    /\.filter\(\(item\) => item\.lane === "served"\)/,
  );
  assert.doesNotMatch(pickupPageSource, /aria-label=\{`Pickup/);
});

test("Pickup public board uses polling, not raw Realtime changes", () => {
  assert.match(pickupPageSource, /<PickupRealtimeRefresh \/>/);
  assert.match(pickupRealtimeRefreshSource, /"use client";/);
  // Polling keeps deterministic max staleness on an always-visible kiosk even if
  // the realtime socket drops silently; the board is a derived "now serving" view
  // that needs a full queue rebuild per change. 6s halves the per-shift refresh
  // count vs 3s while staying inside customer-readable staleness.
  assert.match(pickupRealtimeRefreshSource, /const POLL_INTERVAL_MS = 6_000;/);
  assert.match(pickupRealtimeRefreshSource, /router\.refresh\(\)/);
  assert.match(pickupRealtimeRefreshSource, /window\.setInterval/);
  assert.match(pickupRealtimeRefreshSource, /visibilitychange/);
  assert.doesNotMatch(pickupRealtimeRefreshSource, /useRealtimeChannel/);
  assert.doesNotMatch(pickupRealtimeRefreshSource, /postgres_changes/);
  assert.doesNotMatch(pickupRealtimeRefreshSource, /\.channel\(/);
});

test("Pickup polling loads active tickets once per refresh", () => {
  const start = pickupPageOnlySource.indexOf(
    "async function fetchPickupVisibleTickets",
  );
  const end = pickupPageOnlySource.indexOf(
    "export default async function PickupPage",
  );
  const loader = pickupPageOnlySource.slice(start, end);

  assert.equal((loader.match(/\.from\("kds_tickets"\)/g) ?? []).length, 1);
  assert.doesNotMatch(loader, /activeBatchIds|activeUngroupedOrderIds/);
});

test("Pickup idle visual renders the shared animated Cot Let status mascot", () => {
  assert.doesNotMatch(pickupIdleVisualSource, /"use client";/);
  assert.match(
    pickupIdleVisualSource,
    /export type PickupIdleState = "empty" \| "done";/,
  );
  // Idle mascot renders through the shared BrandMascot adapter, not a direct
  // /brand/mascot/* asset reference (design-system.md brand rules).
  assert.match(
    pickupIdleVisualSource,
    /import \{ BrandMascot \} from "@\/components\/brand";/,
  );
  assert.doesNotMatch(pickupIdleVisualSource, /\/brand\/mascot\/cotlet\.png/);
  assert.doesNotMatch(pickupIdleVisualSource, /next\/image/);
  assert.match(pickupIdleVisualSource, /<BrandMascot/);
  assert.match(pickupIdleVisualSource, /animated/);
  assert.match(
    pickupIdleVisualSource,
    /state === "done" \? "waving" : "waiting"/,
  );
  assert.match(pickupIdleVisualSource, /mood=\{mascotMood\}/);
  assert.match(pickupIdleVisualSource, /scale-75/);
  assert.match(pickupIdleVisualSource, /priority/);
  assert.match(pickupIdleVisualSource, /bg-warning\/15/);
  assert.match(pickupIdleVisualSource, /bg-warning\/10/);
  assert.match(pickupIdleVisualSource, /data-pickup-idle-state=\{state\}/);
  assert.doesNotMatch(pickupIdleVisualSource, /DotLottie/);
  assert.doesNotMatch(pickupIdleVisualSource, /@lottiefiles/);
  assert.doesNotMatch(pickupIdleVisualSource, /be-suon-tuoi/);
  assert.doesNotMatch(pickupIdleVisualSource, /https?:\/\//);

  // BrandMascot remains the single source for the mascot asset.
  const brandSource = read("app/components/brand.tsx");
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

test("Pickup board uses responsive design-system text and Tailwind grid tokens", () => {
  assert.match(
    uiGlobalsSource,
    /--text-pickup-header: clamp\(1\.25rem, 3\.2dvh, 2\.875rem\);/,
  );
  assert.match(uiGlobalsSource, /--text-pickup-header--line-height: 1\.12;/);
  assert.match(
    uiGlobalsSource,
    /--text-pickup-board: clamp\(1\.625rem, 3\.8dvh, 3\.75rem\);/,
  );
  assert.match(uiGlobalsSource, /--text-pickup-board--line-height: 1\.12;/);
  assert.match(
    uiGlobalsSource,
    /--text-pickup-empty-secondary: clamp\(1\.25rem, 3dvh, 2\.75rem\);/,
  );
  assert.match(
    uiGlobalsSource,
    /--text-pickup-empty-secondary--line-height: 1\.12;/,
  );
  assert.match(
    uiGlobalsSource,
    /--text-pickup-footer: clamp\(1\.125rem, 2\.4dvh, 2\.25rem\);/,
  );
  assert.match(uiGlobalsSource, /--text-pickup-footer--line-height: 1\.12;/);
  assert.doesNotMatch(
    uiGlobalsSource,
    /--text-pickup-(?:header|board|empty-secondary|footer): \d+px;/,
  );
  assert.doesNotMatch(
    uiGlobalsSource,
    /--text-pickup-(?:header|board|empty-secondary|footer): [^;]*vw/,
  );
  assert.doesNotMatch(uiGlobalsSource, /@utility grid-cols-pickup-board/);
  assert.doesNotMatch(
    uiGlobalsSource,
    /grid-template-columns: 35% 20% 25% 20%;/,
  );
  assert.match(pickupPageSource, /column === "wait"/);
  assert.match(pickupPageSource, /"px-2 xl:px-4" : "px-2 sm:px-4"/);
  assert.match(pickupPageSource, /PICKUP_COLUMN_CLASS\[column\]/);
  assert.match(
    pickupPageSource,
    /text-pickup-footer font-semibold text-foreground xl:gap-x-16 xl:py-4/,
  );
  assert.doesNotMatch(pickupPageSource, /brand-pattern-vong-to/);
  assert.doesNotMatch(pickupPageSource, /brand-strip brand-pattern-vong-to/);
  assert.doesNotMatch(
    pickupPageSource,
    /px-8 py-4 font-heading text-pickup-header/,
  );
  assert.doesNotMatch(pickupPageSource, /justify-center px-8 py-4/);
  assert.doesNotMatch(pickupPageSource, /col-span-5/);
});

test("Pickup wait-time cell updates every second on the client", () => {
  assert.match(pickupWaitTimeSource, /"use client";/);
  assert.match(pickupWaitTimeSource, /const PICKUP_WAIT_TICK_MS = 1_000;/);
  assert.match(pickupWaitTimeSource, /const \[nowMs, setNowMs\] = useState/);
  assert.match(pickupWaitTimeSource, /setNowMs\(Date\.now\(\)\);/);
  assert.match(
    pickupWaitTimeSource,
    /window\.setInterval\(tick, PICKUP_WAIT_TICK_MS\)/,
  );
  assert.match(
    pickupWaitTimeSource,
    /document\.addEventListener\("visibilitychange", handleVisibility\)/,
  );
  assert.match(pickupWaitTimeSource, /window\.clearInterval\(intervalId\)/);
  assert.match(
    pickupWaitTimeSource,
    /document\.removeEventListener\("visibilitychange", handleVisibility\)/,
  );
});

test("Pickup wait time shows seconds before the first minute", () => {
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
    pickupWaitTimeSource.match(
      /export function formatPickupWaitTime[\s\S]*?\n}\n/,
    )?.[0] ?? ""
  ).replace(
    "export function formatPickupWaitTime(startIso: string, nowMs: number): string",
    "function formatPickupWaitTime(startIso, nowMs)",
  );
  const formatter = new Function(
    `${functionSource}; return formatPickupWaitTime;`,
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
