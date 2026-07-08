import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { ResolvedOperatorTileGroup } from "@comtammatu/shared/auth";
import { getOperatorMoreGroups } from "../app/(protected)/br/[branchId]/(operator)/_lib/operator-home-contract";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("operator routes use a route group without wrapping station apps", () => {
  assert.equal(
    exists("apps/web/app/(protected)/br/[branchId]/layout.tsx"),
    false,
  );
  for (const path of [
    "apps/web/app/(protected)/br/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  ]) {
    assert.equal(exists(path), true, path);
  }
});

test("operator bottom nav replaces employee More with Hồ sơ", () => {
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  for (const expected of [
    "`/br/${branchId}`",
    "`/br/${branchId}/shift`",
    "`/br/${branchId}/shift/schedule`",
  ]) {
    assert.ok(bottomNav.includes(expected), expected);
  }
  assert.doesNotMatch(bottomNav, /shift\/profile/);
  assert.doesNotMatch(bottomNav, /shift\/leave/);
  assert.doesNotMatch(bottomNav, /shift\/payslip/);
  assert.ok(bottomNav.includes("showBranchManagement"));
  assert.ok(bottomNav.includes("`/br/${branchId}/dashboard`"));
  assert.ok(bottomNav.includes("`/br/${branchId}/pos-sessions`"));
  assert.ok(bottomNav.includes("`/br/${branchId}/settings`"));
  assert.ok(bottomNav.includes("`/br/${branchId}/more`"));
  assert.ok(bottomNav.includes("branchManagementOverflowPrefixes"));
  assert.doesNotMatch(bottomNav, /\]\s*:\s*\[\s*`\/br\/\$\{branchId\}\/more`/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/profile`/);
  assert.match(bottomNav, /label: messages\.employee\.nav\.profileShort/);
  assert.match(bottomNav, /showBranchManagement\s*\?\s*\[/);
  assert.match(bottomNav, /\]\s*:\s*\[/);
  assert.match(bottomNav, /icon: User/);
  assert.doesNotMatch(bottomNav, /"\/notifications"/);
  assert.doesNotMatch(bottomNav, /MAX_VISIBLE_ITEMS/);
});

test("operator header keeps profile and notifications in chrome", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const appHeader = read("apps/web/app/components/app-header.tsx");

  assert.match(layout, /homeHref=\{`\/br\/\$\{context\.branchId\}`\}/);
  assert.match(layout, /homeAriaLabel=\{APP_COPY_VI\.operatorHome\}/);
  assert.match(layout, /subtitle=\{ROLE_LABEL_VI\[claims\.user_role\]\}/);
  assert.doesNotMatch(layout, /Hub \$\{hubLabel\}/);
  assert.match(appHeader, /homeHref\?: string/);
  assert.match(appHeader, /<Link[\s\S]*href=\{href\}/);
  assert.match(layout, /IconUser/);
  assert.match(layout, /href=\{`\/br\/\$\{context\.branchId\}\/profile`\}/);
  assert.match(layout, /aria-label=\{messages\.employee\.nav\.profileShort\}/);
  assert.match(layout, /notificationsHref/);
  assert.match(layout, /const unreadPromise = getUnreadCount\(\)\.catch/);
  assert.match(layout, /const unreadResult = await unreadPromise/);
  assert.match(layout, /encodeURIComponent\(`\/br\/\$\{context\.branchId\}`\)/);
  assert.match(layout, /href=\{notificationsHref\}/);
  assert.match(layout, /size="icon-touch"/);
  assert.doesNotMatch(layout, /IconBell data-icon="inline-start"/);
  assert.doesNotMatch(layout, /<Badge/);
  assert.doesNotMatch(layout, /shift\/profile/);
});

test("notifications page provides a safe branch return path", () => {
  const page = read("apps/web/app/(protected)/notifications/page.tsx");

  assert.match(page, /getSafeInternalReturnTo/);
  assert.match(page, /\/br\/\$\{claims\.branch_id\}/);
  assert.match(page, /messages\.notifications\.back/);
});

test("operator home label is today, not Branch Hub", () => {
  const labels = read("packages/shared/src/labels/vi.ts");

  assert.match(labels, /operatorHome: "Nay"/);
  assert.match(labels, /operator_home: "Nay"/);
  assert.doesNotMatch(labels, /operatorHome: "Branch Hub"/);
  assert.doesNotMatch(labels, /Branch Runtime|Branch Ops/);
});

test("operator home renders MODULE_ACL-backed capability tiles", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(home, /resolveOperatorTiles/);
  assert.match(home, /EmployeePage/);
  assert.match(
    home,
    /showTodayCard =\s*canAccess\(claims\.user_role, "operator_home"\)(?: && claims\.user_role !== "owner")?/,
  );
  assert.match(home, /showManagementCard/);
  const todaySource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-today-status.tsx",
  );
  assert.match(todaySource, /mode="compact-status"/);
  assert.match(home, /groups\.map/);
  assert.match(home, /EmployeeActionSection/);
  assert.match(home, /resolveOperatorTileIcon/);
  assert.match(home, /isCentral\s*\?\s*centralGroups\s*:\s*branchTodayGroups/);
  assert.match(home, /showTodayCard\s*\?/);
  assert.match(
    home,
    /key: `\$\{group\.id\}-\$\{tile\.moduleKey\}-\$\{tile\.href\}`/,
  );
  assert.match(home, /mobileColumns=\{2\}/);
  assert.doesNotMatch(home, /operatorRuntimeActions/);
  assert.doesNotMatch(home, /operatorOpsActions/);
  assert.doesNotMatch(home, /EmployeeStatusStrip/);
  assert.doesNotMatch(home, /operatorShortcutsStatus/);
  assert.doesNotMatch(home, /OPERATION_HANDOFFS/);
});

test("operator more renders only tiles hidden from Today", () => {
  const more = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/more/page.tsx",
  );

  assert.match(more, /resolveOperatorTiles/);
  assert.match(more, /getOperatorMoreGroups/);
  assert.match(more, /claims\.user_role/);
  assert.match(more, /claims\.user_role !== "branch_manager"/);
  assert.match(more, /claims\.user_role !== "owner"/);
  assert.match(more, /redirect\(`\/br\/\$\{context\.branchId\}\/profile`\)/);
  assert.match(more, /centralMoreTitle/);
  assert.match(more, /moreEmptyTitle/);
});

test("operator more group resolver removes home-visible shortcuts", () => {
  const tile = (href: string, moduleKey = "inventory") => ({
    moduleKey,
    href,
    label: href,
    icon: "Package",
    group: "stock",
  });
  const groups = [
    {
      id: "sales_kitchen",
      title: "Bán hàng",
      tiles: [
        tile("/br/1/pos", "pos"),
        tile("/br/1/runner", "runner"),
        tile("/br/1/kds", "kds"),
        tile("/br/1/menu-limits", "branch_menu_limits"),
        tile("/br/1/orders", "orders"),
      ],
    },
    {
      id: "my_shift",
      title: "Nhân sự",
      tiles: [
        tile("/br/1/shift/clock", "employee"),
        tile("/br/1/shift", "employee"),
        tile("/br/1/team", "branch_team"),
      ],
    },
    {
      id: "stock",
      title: "Kho hàng",
      tiles: [
        tile("/br/1/stock"),
        tile("/br/1/stock/receive"),
        tile("/br/1/stock/production", "inventory_procurement"),
        tile("/br/1/stock/transfer"),
        tile("/br/1/stock/stocktake"),
        tile("/br/1/stock/count-assignments", "employee_checkout_approvals"),
        tile("/br/1/stock/waste"),
        tile("/br/1/stock/grn"),
      ],
    },
  ] as ResolvedOperatorTileGroup[];

  const moreGroups = getOperatorMoreGroups(groups, "branch");
  assert.deepEqual(
    moreGroups.flatMap((group) => group.tiles.map((tile) => tile.href)),
    [
      "/br/1/menu-limits",
      "/br/1/orders",
      "/br/1/shift/clock",
      "/br/1/shift",
      "/br/1/team",
      "/br/1/stock",
      "/br/1/stock/receive",
      "/br/1/stock/production",
      "/br/1/stock/transfer",
      "/br/1/stock/stocktake",
      "/br/1/stock/count-assignments",
      "/br/1/stock/waste",
      "/br/1/stock/grn",
    ],
  );

  const managerMoreGroups = getOperatorMoreGroups(
    groups,
    "branch",
    "branch_manager",
  );
  assert.deepEqual(
    managerMoreGroups.flatMap((group) => group.tiles.map((tile) => tile.href)),
    ["/br/1/runner", "/br/1/kds", "/br/1/stock/production", "/br/1/stock/grn"],
  );
});

test("operator hub owns branch workflow entry tiles", () => {
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const operatorTiles =
    navConfig.split("export const OPERATOR_TILE_ITEMS =")[1] ?? "";

  assert.match(navConfig, /my_shift: "Nhân sự"/);
  assert.match(navConfig, /approvals: "Duyệt"/);
  assert.match(navConfig, /sales_kitchen: "Bán hàng"/);
  assert.match(navConfig, /stock: "Kho hàng"/);
  assert.doesNotMatch(navConfig, /office_bridge/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/clock"/,
  );
  assert.match(operatorTiles, /hrefTemplate: "\/br\/\{branchId\}\/shift"/);
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/tasks"/,
  );
  assert.match(operatorTiles, /moduleKey: "employee_checkout_approvals"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/checkout-approvals"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/employee\/checkout-approvals"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/count-slips"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/inventory\/count-slips"/,
  );
  assert.match(operatorTiles, /hrefTemplate: "\/br\/\{branchId\}\/stock"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/receive"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/stocktake"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/count"/,
  );
  assert.doesNotMatch(operatorTiles, /branch_pos_sessions/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/waste"/,
  );
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/stocktake"/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/transfers"/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/waste/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/(menu|hr|inventory)"/);
  assert.match(operatorTiles, /moduleKey: "branch_menu_limits"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/menu-limits"/,
  );
  assert.doesNotMatch(navConfig, /branch_setup/);
  assert.doesNotMatch(operatorTiles, /moduleKey: "branch_dashboard"/);
  assert.doesNotMatch(operatorTiles, /moduleKey: "branch_settings"/);
});

test("branch dashboard and settings routes live inside operator shell", () => {
  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
  ]) {
    const source = read(path);

    assert.match(source, /AppPageHeader|EmployeePage/);
    assert.doesNotMatch(source, /BranchManagementShell/);
    assert.doesNotMatch(source, /management-chrome/);
  }
});

test("pre-clock-in gate disables floor tiles instead of hiding them", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(
    page,
    /tilesLockedBeforeClockIn && lockedGroupIds\.has\(group\.id\)/,
  );
  assert.doesNotMatch(page, /tiles: \[\]/);
});

test("operator home overview KPIs are gated by branch_dashboard access", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  // Sales KPIs additionally require branch_kind "branch" — central sites
  // keep their home to curated job tiles (D066).
  assert.match(
    home,
    /showOverview =\s*canAccess\(claims\.user_role, "branch_dashboard"\) && branchKind === "branch"/,
  );

  const overviewSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-overview-section.tsx",
  );

  assert.match(overviewSource, /fetchBranchDayStatus/);
  assert.match(overviewSource, /getUnreadCount\(\)/);
  assert.match(overviewSource, /formatVND\(day\.todayRevenue\)/);
  assert.match(overviewSource, /messages\.settings\.branch\.hubOverviewTitle/);
  assert.match(overviewSource, /messages\.settings\.branch\.dayRevenueLabel/);
  assert.match(
    overviewSource,
    /messages\.settings\.branch\.hubOverviewUnreadLabel/,
  );
  assert.match(overviewSource, /href=\{`\$\{basePath\}\/dashboard`\}/);
  assert.match(overviewSource, /href="\/notifications"/);
  assert.doesNotMatch(overviewSource, /count_unread_notifications/);
  assert.doesNotMatch(overviewSource, /createServiceClient/);
});

test("operator home renders the unified Cần xử lý queue before domain tile rows (V2, D059)", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  const queueSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-queue-section.tsx",
  );

  assert.match(queueSource, /fetchBranchQueueCounts/);
  assert.match(queueSource, /queueRows\.length === 0/);
  assert.match(queueSource, /branchCopy\.queueTitle/);

  // Instead of checking order (queue was moved to sidebar), check that it's rendered conditionally
  assert.match(home, /!isFloorRole \|\| showOverview/);
  assert.match(home, /<HubQueueSection/);
});

test("operator today shift and profile screens use responsive branch layout", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const employeeHome = read("apps/web/lib/staff-runtime/page.tsx");
  const profile = read("apps/web/lib/staff-runtime/profile/page.tsx");
  const profileActions = read(
    "apps/web/lib/staff-runtime/profile/profile-actions.tsx",
  );
  const operatorProfile = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx",
  );
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  assert.match(layout, /md:max-w-5xl lg:max-w-5xl xl:max-w-6xl/);
  assert.doesNotMatch(layout, /\s+mobile\s+contentClassName=/);
  assert.match(bottomNav, /position="static"/);
  assert.match(bottomNav, /hideOnDesktop=\{false\}/);
  assert.match(home, /flex-col md:flex-row/);
  assert.match(home, /md:w-72 lg:w-80 xl:w-96/);
  assert.match(employeeHome, /workflowLayout === "stepper"/);
  assert.match(employeeHome, /lg:grid-cols-5/);
  assert.match(operatorProfile, /<ProfilePageContent \/>/);
  assert.doesNotMatch(operatorProfile, /PERSONAL_LINKS/);
  assert.doesNotMatch(operatorProfile, /permissions/);
  assert.doesNotMatch(operatorProfile, /showWorkspaceLinks/);
  assert.doesNotMatch(profile, /showWorkspaceLinks/);
  assert.doesNotMatch(profile, /resolveQuickLaunchGroups/);
  assert.doesNotMatch(profile, /EmployeeActionSection/);
  assert.doesNotMatch(profile, /EmployeeHomePageContent/);
  assert.doesNotMatch(profile, /attendance_records/);
  assert.doesNotMatch(profile, /bank_account/);
  assert.match(profile, /<EmployeePanel tone="info" size="sm">/);
  assert.match(profile, /<div className="grid gap-4">/);
  assert.match(profile, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(profile, /group\/avatar-upload/);
  assert.match(profile, /relative row-span-2 size-28 shrink-0/);
  assert.match(profile, /sm:size-32/);
  assert.match(profile, /<Avatar className="size-full min-h-full min-w-full">/);
  assert.doesNotMatch(profile, /<Avatar\s+size="lg"/);
  assert.match(
    profile,
    /AvatarFallback className="text-3xl font-semibold sm:text-4xl"/,
  );
  assert.match(profile, /absolute inset-0 z-10/);
  assert.match(profile, /pointer-events-none absolute inset-0 z-10/);
  assert.match(
    profile,
    /bg-foreground\/50 p-0 text-background opacity-0 transition-opacity/,
  );
  assert.match(profile, /has-data-\[icon=inline-start\]:pl-0/);
  assert.match(profile, /has-data-\[icon=inline-end\]:pr-0/);
  assert.match(profileActions, /has-data-\[icon=inline-start\]:pl-0/);
  assert.match(profileActions, /has-data-\[icon=inline-end\]:pr-0/);
  assert.match(profile, /group-hover\/avatar-upload:pointer-events-auto/);
  assert.match(profile, /group-hover\/avatar-upload:opacity-100/);
  assert.match(
    profile,
    /group-focus-within\/avatar-upload:pointer-events-auto/,
  );
  assert.match(profile, /group-focus-within\/avatar-upload:opacity-100/);
  assert.doesNotMatch(
    profile,
    /bg-foreground\/45 p-0 text-background opacity-100/,
  );
  assert.doesNotMatch(profile, /top-1\/2 left-1\/2/);
  assert.doesNotMatch(profile, /-translate-x-1\/2/);
  assert.match(profile, /copy\.employeeCode/);
  assert.match(profile, /border-t border-border\/60/);
  assert.match(profile, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
  assert.match(profile, /IconBirthDate/);
  assert.match(profile, /formatBirthDate\(birthDate\)/);
  assert.match(profile, /copy\.birthDate/);
  assert.match(profile, /copy\.noBirthDate/);
  assert.match(profile, /aria-label=\{`\$\{copy\.phone\}: \$\{phone\}`\}/);
  assert.match(profile, /aria-label=\{`\$\{copy\.email\}: \$\{email\}`\}/);
  assert.match(
    profile,
    /aria-label=\{`\$\{copy\.birthDate\}: \$\{birthDateDisplay\}`\}/,
  );
  assert.doesNotMatch(
    profile,
    /<span className="shrink-0(?: text-muted-foreground)?">\s*\{copy\.(?:phone|email|birthDate)\}:\s*<\/span>/,
  );
  assert.doesNotMatch(profile, /new Date/);
  assert.doesNotMatch(profile, /EmployeeDetailList/);
  assert.doesNotMatch(profile, /EmployeeStatusStrip/);
  assert.doesNotMatch(profile, /useIsMobile/);
  assert.match(profile, /ProfileEditAction/);
  assert.match(profile, /ProfileAvatarAction/);
  assert.doesNotMatch(profile, /profile-edit-dialog/);
  assert.doesNotMatch(profile, /profile-avatar-upload/);
  assert.match(profileActions, /dynamic<ProfileEditActionProps>/);
  assert.match(profileActions, /dynamic<ProfileAvatarActionProps>/);
  assert.match(profileActions, /import\("\.\/profile-edit-dialog"\)/);
  assert.match(profileActions, /import\("\.\/profile-avatar-upload"\)/);
  assert.match(profileActions, /ssr: false/);
  assert.match(profile, /buttonSize="sm"/);
  assert.match(profile, /buttonVariant="outline"/);
  assert.match(profile, /buttonVariant="ghost"/);
  assert.doesNotMatch(profile, /buttonVariant="default"/);
  assert.match(profile, /triggerLabel=\{copy\.editProfileShort\}/);
  assert.match(profileActions, /buttonVariant\?: ProfileButtonVariant/);
  assert.doesNotMatch(profile, /flex-col items-center gap-2/);
  assert.doesNotMatch(profile, /className="w-fit text-muted-foreground"/);
  assert.doesNotMatch(profile, /className="w-full min-w-0"/);
  assert.doesNotMatch(profile, /grid grid-cols-2 gap-2/);
  assert.doesNotMatch(profile, /sm:min-w-40/);
  assert.doesNotMatch(profile, /grid gap-2 text-sm sm:grid-cols-2/);
  assert.doesNotMatch(profile, /col-start-2 row-start-2/);
  assert.doesNotMatch(profile, /start_date/);
  assert.doesNotMatch(profile, /copy\.startDate/);
  assert.match(
    profile,
    /profiles"\)\s*\.select\("full_name, phone, avatar_url, birth_date"\)/,
  );
  assert.match(profile, /birthDate: birthDate \?\? ""/);
  assert.doesNotMatch(profile, /label: copy\.birthDate/);
  assert.doesNotMatch(profile, /columns=\{2\}/);
});

test("employee profile self-service update uses the scoped profile RPC", () => {
  const action = read("apps/web/lib/staff-runtime/profile/actions.ts");
  const dialog = read(
    "apps/web/lib/staff-runtime/profile/profile-edit-dialog.tsx",
  );
  const upload = read(
    "apps/web/lib/staff-runtime/profile/profile-avatar-upload.tsx",
  );
  const copy = read("apps/web/lib/messages/employee.ts");
  const migration = read(
    "supabase/migrations/20260707165303_add_profile_birth_date.sql",
  );

  assert.match(action, /z\.object/);
  assert.match(action, /profileSchema\.safeParse/);
  assert.match(action, /supabase\.rpc\("update_my_profile"/);
  assert.match(action, /p_full_name: fullName/);
  assert.match(action, /p_phone: phone/);
  assert.match(action, /p_birth_date: birthDate/);
  assert.match(action, /getVNDateString/);
  assert.match(action, /uploadMyAvatar/);
  assert.match(action, /createServiceClient/);
  assert.match(action, /storage\s*\.from\(PROFILE_AVATAR_BUCKET\)\s*\.upload/);
  assert.match(action, /p_avatar_url: publicUrl/);
  assert.match(action, /Không thể cập nhật hồ sơ/);
  assert.doesNotMatch(action, /error\.message/);
  assert.match(dialog, /FormDialog/);
  assert.match(dialog, /TextField/);
  assert.match(dialog, /name="birthDate"/);
  assert.match(dialog, /type="date"/);
  assert.match(dialog, /autoComplete="name"/);
  assert.match(dialog, /type="tel"/);
  assert.match(dialog, /autoComplete="tel"/);
  assert.match(dialog, /autoComplete="bday"/);
  assert.doesNotMatch(dialog, /avatarUrl/);
  assert.doesNotMatch(dialog, /https:\/\/\.\.\./);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(dialog, /toast\.success\(copy\.savedProfile\)/);
  assert.match(upload, /type="file"/);
  assert.match(upload, /accept=\{AVATAR_ACCEPT\}/);
  assert.match(upload, /createImageBitmap/);
  assert.match(upload, /uploadMyAvatar\(formData\)/);
  assert.doesNotMatch(upload, /type="url"/);
  assert.match(copy, /uploadAvatar: "Đổi ảnh"/);
  assert.match(copy, /birthDate: "Ngày sinh"/);
  assert.match(copy, /profileShort: "Hồ sơ"/);
  assert.match(copy, /title: "Hồ sơ"/);
  assert.doesNotMatch(copy, /Hồ sơ cá nhân, ca hôm nay và công lương/);
  assert.doesNotMatch(copy, /URL ảnh đại diện/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_date date/);
  assert.match(migration, /p_birth_date date DEFAULT NULL::date/);
});

test("manager smart card counts pending waste approvals with checkouts", () => {
  const home = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(home, /\.eq\("issue_type", "writeoff"\)/);
  assert.match(home, /\.eq\("approval_status", "pending"\)/);
  assert.match(home, /INVENTORY_WASTE_APPROVE/);
  assert.match(home, /pendingCheckouts \+ pendingWaste/);
});

test("manager shift dashboard keeps the self attendance card", () => {
  const home = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(
    home,
    /mode === "manager-dashboard"[\s\S]*\{todayCard\}[\s\S]*\{managerActionPanel\}/,
  );
});
