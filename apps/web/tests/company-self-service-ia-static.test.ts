import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// ADR 0022 §Initial delivery tranche: the personal-route boundary between
// Branch-mobile (`/br/[branchId]/shift/*`) and Company personal self-service
// (`/me/*` in Control Surface chrome). This is a static contract test; RLS,
// proxy gates, and capability bindings own runtime enforcement.

test("/me personal self-service routes stay company-scoped under Control Surface", () => {
  const mePage = read("apps/web/app/(protected)/me/page.tsx");
  const meClock = read("apps/web/app/(protected)/me/clock/page.tsx");
  const meSchedule = read("apps/web/app/(protected)/me/schedule/page.tsx");
  const meLeave = read("apps/web/app/(protected)/me/schedule/leave/page.tsx");
  const mePayslip = read("apps/web/app/(protected)/me/payslip/page.tsx");
  const meProfile = read("apps/web/app/(protected)/me/profile/page.tsx");
  const meLayout = read("apps/web/app/(protected)/me/layout.tsx");

  // Profile hub: personal routes only, never Branch ops or Work CTA.
  assert.match(mePage, /personalHubTitle/);
  assert.match(mePage, /href: "\/me\/profile"/);
  assert.match(mePage, /href: "\/me\/schedule"/);
  assert.match(mePage, /href: "\/me\/payslip"/);
  assert.match(mePage, /href: "\/notifications"/);
  assert.doesNotMatch(mePage, /StaffWorkdayPageContent/);
  assert.doesNotMatch(mePage, /href: "\/work"/);

  // Every personal route resolves to a sibling `/me/*` destination; none
  // leaks a Branch-scoped URL or redirects back into the Branch family.
  const meRoutes = [meClock, meSchedule, meLeave, mePayslip, meProfile];
  for (const source of meRoutes) {
    assert.doesNotMatch(source, /\/br\/\$\{|\/br\/\$\{branchId\}/);
  }
  assert.match(meClock, /home: "\/me"/);
  assert.match(meClock, /schedule: "\/me\/schedule"/);
  assert.match(meClock, /profile: "\/me\/profile"/);
  assert.match(meSchedule, /leaveHref="\/me\/schedule\/leave"/);
  assert.match(meSchedule, /profileHref="\/me\/profile"/);
  assert.match(meLeave, /returnHref="\/me\/schedule"/);
  assert.match(meLeave, /profileHref="\/me\/profile"/);
  assert.match(mePayslip, /profileHref="\/me\/profile"/);

  // Layout is a thin wrapper; no parallel shell, header, or redirect.
  assert.match(meLayout, /PwaRuntimeProvider/);
  assert.doesNotMatch(meLayout, /AppHeader|redirect\(|loadAuthState/);
});

test("Self module keeps Owner denied and grants actor-only capability", () => {
  const acl = read("packages/shared/src/auth/module-acl.ts");
  const discovery = read("packages/shared/src/auth/app-discovery.ts");
  const types = read("packages/shared/src/auth/types.ts");

  // `me` excludes owner at the ACL layer.
  assert.match(
    acl,
    /me: \{[\s\S]*?allowedRoles: STAFF_ROLES\.filter\(\(role\) => role !== "owner"\)/,
  );
  assert.match(acl, /role === "owner" && moduleKey === "me"/);
  assert.match(acl, /return false;/);

  // A zero-module office employee (`self_service`) receives no work module;
  // landing on `/me` grants self-service only, never Finance/Inventory/HR.
  assert.match(discovery, /if \(role === "self_service"\) return \[\];/);

  // `self_service` is tenant-level, not a branch-required operational role.
  const staffRoles = /export const STAFF_ROLES = \[([\s\S]*?)\] as const/.exec(
    types,
  )?.[1];
  assert.ok(staffRoles?.includes('"self_service"'));
  const branchRequired =
    /export const BRANCH_REQUIRED_OPERATIONAL_ROLES[^=]*=\s*\[([\s\S]*?)\] as const/.exec(
      types,
    )?.[1];
  assert.ok(branchRequired);
  assert.equal(
    branchRequired?.includes('"self_service"'),
    false,
    "self_service must not be branch-required operational",
  );
});

test("Control Surface chrome exposes Trang cá nhân and hides empty module nav", () => {
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const protectedLayout = read("apps/web/app/(protected)/layout.tsx");
  const commonCopy = read("apps/web/lib/messages/common.ts");

  // Avatar Footer link is sourced from the canonical self-service path.
  assert.match(protectedLayout, /canonicalizeSelfServicePath\(claims, "\/me"\)/);
  assert.match(shell, /personalHref=\{personalHref\}/);

  // `/me` is a recognized module surface; it owns no deep nav
  // (tier2 collapses to [] for `me`). Work H1 stays on EmployeePage.
  assert.match(shell, /\| "me"/);
  assert.doesNotMatch(shell, /mobileHeaderTitle|MODULE_ACL\.me\.label/);
  assert.match(shell, /activeModule === "me"[\s\S]*?return \[\]/);

  // Zero-module actors (empty tier1) suppress the bottom navbar so no empty
  // "Phân hệ" tab renders.
  assert.match(appShell, /showBottomNav = bottomNav && tier1WithBadges\.length > 0/);
  assert.match(appShell, /showBottomNav \? \(\s*<ControlSurfaceBottomNav/);

  // Account menu order: Trang cá nhân → Chế độ tối → separator → Đăng xuất.
  assert.match(commonCopy, /personalPage: "Trang cá nhân"/);
  assert.ok(
    appShell.indexOf('render={<Link href={personalHref} />}') <
      appShell.indexOf("<ThemeMenuItem"),
    "Trang cá nhân must precede the theme item",
  );
  assert.ok(
    appShell.indexOf("<ThemeMenuItem") <
      appShell.indexOf("<DropdownMenuSeparator />"),
    "theme item must precede the separator",
  );
  assert.ok(
    appShell.indexOf("<DropdownMenuSeparator />") <
      appShell.indexOf("copy.signOut"),
    "separator must precede sign out",
  );
});

test("default post-login landing splits self_service from module-bound roles", () => {
  const redirect = read("packages/shared/src/auth/login-destination.ts");
  const navResolution = read("packages/shared/src/auth/nav-resolution.ts");

  // Fail-closed landing: self_service gets `/`; module-bound roles resolve via canAccess elsewhere.
  assert.match(redirect, /user_role === "self_service"[\s\S]*?return "\/"/);
  assert.doesNotMatch(redirect, /user_role === "accountant"[\s\S]*?return "\/finance"/);
  assert.match(redirect, /return "\/access-denied\?reason=role-unassigned"/);

  // `self_service` role home is Control home; Avatar still opens `/me`.
  assert.match(
    navResolution,
    /role === "self_service"[\s\S]*?label: MODULE_ACL\.owner\.label,[\s\S]*?href: MODULE_ACL\.owner\.path/,
  );
});
