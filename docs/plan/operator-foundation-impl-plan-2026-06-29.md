# Operator Workspace — Sub-project #1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on a dedicated branch/worktree (superpowers:using-git-worktrees), KHÔNG commit thẳng `main`.

**Goal:** Dựng 3 unit nền (pure/additive, KHÔNG đổi hành vi đang chạy) cho Operator Workspace: branch-context resolver, capability-tile registry, Branch Hub destination resolver.

**Architecture:** Cả 3 unit là hàm thuần + config, test bằng vitest, CHƯA wire vào proxy/login/UI (cutover ở sub-project #2 khi Operator home tồn tại). Capability registry là **mở rộng** lớp nav-as-data sẵn có (`MODULE_ACL` + `canAccess`, D019.4) — KHÔNG tạo nguồn nav mới. Branch-context **tổng quát hóa** `resolveInventoryBranchScope` thành 1 resolver dùng chung. Auth gate vẫn là `proxy.ts` (các resolver này chỉ là lớp đọc, KHÔNG phải cổng gác).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React `cache()`, Supabase-js, vitest (`turbo test`). Monorepo: `packages/shared` (auth SSoT) + `apps/web`.

Nguồn: blueprint `docs/plan/operator-workspace-blueprint-2026-06-29.md` §11 sub-project #1; quyết định `docs/plan/decisions.md` D050.

## Global Constraints

- TypeScript strict mode, `noUncheckedIndexedAccess: true` — mảng/index-access trả `T | undefined`, phải handle.
- `MODULE_ACL` + `canAccess` (`packages/shared/src/auth/module-acl.ts`) là **single source** cho ACL; mọi tile filter PHẢI qua `canAccess(role, moduleKey)`. KHÔNG hard-code role list.
- Các resolver này là **read-only helper**, KHÔNG phải cổng gác — proxy + RLS vẫn enforce. Không re-implement auth.
- ĐÂY là sub-project **additive**: KHÔNG sửa `proxy.ts`, `resolvePostLoginRedirect`, `getDefaultRedirect`, hay layout/page nào. Không wire live.
- Test: vitest. Shared tests ở `packages/shared/src/auth/__tests__/*-static.test.ts`; web tests ở `apps/web/tests/*-static.test.ts`. Lệnh per-package qua `pnpm --filter`.
- i18n: gate `i18n/no-inline-vietnamese` CHỈ quét `apps/web` → inline VN trong `packages/shared` OK (khớp `nav-config.ts`). File `apps/web/app/_lib/branch-context.ts` KHÔNG được chứa string VN inline.
- KHÔNG thêm export vào `packages/shared/src/auth/index.ts` barrel ở sub-project này (tránh dead-export gate); test import qua relative path. Barrel export thêm khi sub-project #2 tiêu thụ.
- Hoàn tất: `pnpm typecheck && pnpm lint && pnpm test` (root) phải xanh.

---

### Task 1: Branch-context resolver (pure scope select + cache glue)

**Files:**
- Create: `apps/web/app/_lib/branch-scope-select.ts` (pure, type-only imports)
- Create: `apps/web/app/_lib/branch-context.ts` (cache glue, queries `branches`)
- Test: `apps/web/tests/branch-scope-select-static.test.ts`

**Interfaces:**
- Consumes: `JwtClaims`, `StaffRole` (type-only, từ `@comtammatu/shared`); `LoadedAuthState` (từ `apps/web/app/_lib/auth.ts`) cho kiểu supabase.
- Produces: `selectBranchScope(claims, branches, requestedBranchId): BranchScopeSelection`; `resolveBranchContext(supabase, claims, requestedBranchId): Promise<BranchContext | null>`; types `OperatorBranchOption`, `BranchScopeSelection`, `BranchContext`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { selectBranchScope, type OperatorBranchOption } from "../app/_lib/branch-scope-select";
import type { JwtClaims } from "@comtammatu/shared";

const BR: OperatorBranchOption[] = [
  { id: 1, name: "CN Lê Văn Sỹ", branch_kind: "branch" },
  { id: 2, name: "CN Phan Xích Long", branch_kind: "branch" },
];
const claims = (role: JwtClaims["user_role"], branch_id: number | null): JwtClaims => ({
  tenant_id: 1, branch_id, user_role: role,
});

describe("selectBranchScope", () => {
  it("owner sees all branches and can switch", () => {
    const r = selectBranchScope(claims("owner", null), BR, null);
    expect(r.allowedBranches).toHaveLength(2);
    expect(r.canSwitch).toBe(true);
    expect(r.currentBranchId).toBe(1);
  });
  it("pinned staff sees only own branch, cannot switch", () => {
    const r = selectBranchScope(claims("cashier", 2), BR, null);
    expect(r.allowedBranches.map((b) => b.id)).toEqual([2]);
    expect(r.canSwitch).toBe(false);
    expect(r.currentBranchId).toBe(2);
  });
  it("requested branch wins only when allowed", () => {
    expect(selectBranchScope(claims("owner", null), BR, 2).currentBranchId).toBe(2);
    expect(selectBranchScope(claims("cashier", 2), BR, 1).currentBranchId).toBe(2);
  });
  it("returns null current when no allowed branch", () => {
    const r = selectBranchScope(claims("cashier", 9), BR, null);
    expect(r.allowedBranches).toHaveLength(0);
    expect(r.currentBranchId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comtammatu/web exec vitest run tests/branch-scope-select-static.test.ts`
Expected: FAIL — `Cannot find module "../app/_lib/branch-scope-select"`.

- [ ] **Step 3: Write the pure module**

Create `apps/web/app/_lib/branch-scope-select.ts`:

```ts
import type { JwtClaims, StaffRole } from "@comtammatu/shared";

export interface OperatorBranchOption {
  id: number;
  name: string;
  branch_kind: string;
}

export interface BranchScopeSelection {
  allowedBranches: OperatorBranchOption[];
  currentBranchId: number | null;
  canSwitch: boolean;
}

const TENANT_WIDE_ROLES: ReadonlySet<StaffRole> = new Set(["owner", "office"]);

export function selectBranchScope(
  claims: JwtClaims,
  branches: OperatorBranchOption[],
  requestedBranchId: number | null,
): BranchScopeSelection {
  const allowedBranches = TENANT_WIDE_ROLES.has(claims.user_role)
    ? branches
    : branches.filter((b) => b.id === claims.branch_id);

  const fallback =
    allowedBranches.find((b) => b.id === claims.branch_id) ?? allowedBranches[0] ?? null;
  const defaultBranchId = fallback ? fallback.id : null;

  const requestedAllowed =
    requestedBranchId != null && allowedBranches.some((b) => b.id === requestedBranchId);

  return {
    allowedBranches,
    currentBranchId: requestedAllowed ? requestedBranchId : defaultBranchId,
    canSwitch: allowedBranches.length > 1,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comtammatu/web exec vitest run tests/branch-scope-select-static.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the cache glue (no new test — thin query)**

Create `apps/web/app/_lib/branch-context.ts`:

```ts
import { cache } from "react";
import type { JwtClaims, StaffRole } from "@comtammatu/shared";
import type { LoadedAuthState } from "./auth";
import {
  selectBranchScope,
  type BranchScopeSelection,
  type OperatorBranchOption,
} from "./branch-scope-select";

export type { OperatorBranchOption, BranchScopeSelection };

export interface BranchContext {
  branchId: number;
  branch: OperatorBranchOption;
  allowedBranches: OperatorBranchOption[];
  canSwitch: boolean;
  role: StaffRole;
}

type OperatorSupabase = LoadedAuthState["supabase"];

export const resolveBranchContext = cache(
  async (
    supabase: OperatorSupabase,
    claims: JwtClaims,
    requestedBranchId: number | null,
  ): Promise<BranchContext | null> => {
    const { data } = await supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("id");

    const branches = (data ?? []) as OperatorBranchOption[];
    const { allowedBranches, currentBranchId, canSwitch } = selectBranchScope(
      claims,
      branches,
      requestedBranchId,
    );
    if (currentBranchId == null) return null;
    const branch = allowedBranches.find((b) => b.id === currentBranchId);
    if (!branch) return null;

    return { branchId: currentBranchId, branch, allowedBranches, canSwitch, role: claims.user_role };
  },
);
```

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @comtammatu/web exec tsc --noEmit -p tsconfig.json`
Expected: no errors in the two new files.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_lib/branch-scope-select.ts apps/web/app/_lib/branch-context.ts apps/web/tests/branch-scope-select-static.test.ts
git commit -m "feat(operator): add shared branch-context resolver (foundation #1)"
```

---

### Task 2: Capability-tile registry + resolver

**Files:**
- Create: `packages/shared/src/auth/operator-capabilities.ts`
- Test: `packages/shared/src/auth/__tests__/operator-capabilities-static.test.ts`

**Interfaces:**
- Consumes: `MODULE_ACL`, `canAccess`, `ModuleKey` (từ `./module-acl`); `StaffRole` (từ `./types`).
- Produces: `resolveOperatorTiles(role, branchId): ResolvedOperatorTileGroup[]`; consts `OPERATOR_TILES`, `OPERATOR_TILE_GROUP_TITLES`; types `OperatorTileGroupId`, `OperatorTileConfig`, `ResolvedOperatorTile`, `ResolvedOperatorTileGroup`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { resolveOperatorTiles } from "../operator-capabilities";

describe("resolveOperatorTiles", () => {
  it("cashier sees floor (POS) but not kitchen or branch control", () => {
    const groups = resolveOperatorTiles("cashier", 7);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain("floor");
    expect(ids).not.toContain("kitchen");
    expect(ids).not.toContain("branch_control");
    const pos = groups.find((g) => g.id === "floor")!.tiles.find((t) => t.moduleKey === "pos")!;
    expect(pos.href).toBe("/br/7/pos");
  });
  it("chef sees kitchen (KDS), not floor", () => {
    const groups = resolveOperatorTiles("chef", 7);
    expect(groups.map((g) => g.id)).toContain("kitchen");
    expect(groups.map((g) => g.id)).not.toContain("floor");
  });
  it("branch_manager sees branch control", () => {
    const groups = resolveOperatorTiles("branch_manager", 3);
    const control = groups.find((g) => g.id === "branch_control")!;
    expect(control.tiles.map((t) => t.moduleKey)).toContain("branch_menu_limits");
    expect(control.tiles.find((t) => t.moduleKey === "branch_settings")!.href).toBe("/br/3/settings");
  });
  it("drops empty groups", () => {
    expect(resolveOperatorTiles("chef", 1).every((g) => g.tiles.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comtammatu/shared exec vitest run src/auth/__tests__/operator-capabilities-static.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the registry + resolver**

Create `packages/shared/src/auth/operator-capabilities.ts`:

```ts
import { MODULE_ACL, canAccess, type ModuleKey } from "./module-acl";
import type { StaffRole } from "./types";

export type OperatorTileGroupId =
  | "my_shift"
  | "floor"
  | "kitchen"
  | "stock"
  | "branch_control";

export interface OperatorTileConfig {
  moduleKey: ModuleKey;
  icon: string;
  group: OperatorTileGroupId;
  hrefTemplate: string;
  label?: string;
}

export interface ResolvedOperatorTile {
  moduleKey: ModuleKey;
  label: string;
  icon: string;
  href: string;
  group: OperatorTileGroupId;
}

export interface ResolvedOperatorTileGroup {
  id: OperatorTileGroupId;
  title: string;
  tiles: ResolvedOperatorTile[];
}

export const OPERATOR_TILE_GROUP_TITLES: Record<OperatorTileGroupId, string> = {
  my_shift: "Ca của tôi",
  floor: "Bán hàng",
  kitchen: "Bếp",
  stock: "Kho",
  branch_control: "Điều hành chi nhánh",
};

const OPERATOR_TILE_GROUP_ORDER: OperatorTileGroupId[] = [
  "my_shift",
  "floor",
  "kitchen",
  "stock",
  "branch_control",
];

export const OPERATOR_TILES: OperatorTileConfig[] = [
  { moduleKey: "employee", icon: "ListChecks", group: "my_shift", hrefTemplate: "/employee" },
  { moduleKey: "pos", icon: "Cash", group: "floor", hrefTemplate: "/br/{branchId}/pos" },
  { moduleKey: "orders", icon: "Receipt", group: "floor", hrefTemplate: "/orders" },
  { moduleKey: "kds", icon: "ChefHat", group: "kitchen", hrefTemplate: "/br/{branchId}/kds" },
  { moduleKey: "runner", icon: "BellRinging", group: "kitchen", hrefTemplate: "/br/{branchId}/runner" },
  { moduleKey: "inventory", icon: "Package", group: "stock", hrefTemplate: "/inventory?branchId={branchId}" },
  { moduleKey: "branch_menu_limits", icon: "ToggleRight", group: "branch_control", hrefTemplate: "/br/{branchId}/settings/menu-limits" },
  { moduleKey: "branch_settings", icon: "Settings", group: "branch_control", hrefTemplate: "/br/{branchId}/settings" },
  { moduleKey: "branch_dashboard", icon: "LayoutDashboard", group: "branch_control", hrefTemplate: "/br/{branchId}/dashboard" },
  { moduleKey: "employee_checkout_approvals", icon: "CircleCheck", group: "branch_control", hrefTemplate: "/employee/checkout-approvals" },
];

export function resolveOperatorTiles(
  role: StaffRole,
  branchId: number,
): ResolvedOperatorTileGroup[] {
  const visible = OPERATOR_TILES.filter((tile) => canAccess(role, tile.moduleKey));
  return OPERATOR_TILE_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    title: OPERATOR_TILE_GROUP_TITLES[groupId],
    tiles: visible
      .filter((tile) => tile.group === groupId)
      .map((tile) => ({
        moduleKey: tile.moduleKey,
        label: tile.label ?? MODULE_ACL[tile.moduleKey].label,
        icon: tile.icon,
        href: tile.hrefTemplate.replace("{branchId}", String(branchId)),
        group: tile.group,
      })),
  })).filter((group) => group.tiles.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comtammatu/shared exec vitest run src/auth/__tests__/operator-capabilities-static.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/operator-capabilities.ts packages/shared/src/auth/__tests__/operator-capabilities-static.test.ts
git commit -m "feat(operator): add capability-tile registry over MODULE_ACL (foundation #1)"
```

---

### Task 3: Branch Hub destination resolver

**Files:**
- Create: `packages/shared/src/auth/branch-hub.ts`
- Test: `packages/shared/src/auth/__tests__/branch-hub-static.test.ts`

**Interfaces:**
- Consumes: `getDefaultRedirect`, `isAdminRole` (từ `./scope`); `JwtClaims` (từ `./types`).
- Produces: `resolveBranchHubDestination(claims, ctx): string`; types `StationKind`, `BranchHubContext`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { resolveBranchHubDestination } from "../branch-hub";
import type { JwtClaims } from "../types";

const c = (role: JwtClaims["user_role"], branch_id: number | null): JwtClaims => ({
  tenant_id: 1, branch_id, user_role: role,
});

describe("resolveBranchHubDestination", () => {
  it("installed station PWA goes straight to that station", () => {
    expect(resolveBranchHubDestination(c("cashier", 2), { standaloneStation: "pos", isDesktop: false }))
      .toBe("/br/2/pos");
  });
  it("desktop owner lands on office plane", () => {
    expect(resolveBranchHubDestination(c("owner", null), { standaloneStation: null, isDesktop: true }))
      .toBe("/admin/dashboard");
  });
  it("pinned staff lands on operator home for their branch", () => {
    expect(resolveBranchHubDestination(c("chef", 5), { standaloneStation: null, isDesktop: false }))
      .toBe("/br/5");
  });
  it("owner on phone goes to branch picker", () => {
    expect(resolveBranchHubDestination(c("owner", null), { standaloneStation: null, isDesktop: false }))
      .toBe("/br");
  });
  it("office on phone falls back to role default", () => {
    expect(resolveBranchHubDestination(c("office", null), { standaloneStation: null, isDesktop: false }))
      .toBe("/employee");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @comtammatu/shared exec vitest run src/auth/__tests__/branch-hub-static.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the resolver**

Create `packages/shared/src/auth/branch-hub.ts`:

```ts
import { getDefaultRedirect, isAdminRole } from "./scope";
import type { JwtClaims } from "./types";

export type StationKind = "pos" | "kds" | "runner";

export interface BranchHubContext {
  standaloneStation: StationKind | null;
  isDesktop: boolean;
}

export function resolveBranchHubDestination(
  claims: JwtClaims,
  ctx: BranchHubContext,
): string {
  if (ctx.standaloneStation && claims.branch_id != null) {
    return `/br/${claims.branch_id}/${ctx.standaloneStation}`;
  }
  if (ctx.isDesktop && isAdminRole(claims.user_role)) {
    return getDefaultRedirect(claims);
  }
  if (claims.branch_id != null) {
    return `/br/${claims.branch_id}`;
  }
  if (isAdminRole(claims.user_role)) {
    return "/br";
  }
  return getDefaultRedirect(claims);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @comtammatu/shared exec vitest run src/auth/__tests__/branch-hub-static.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth/branch-hub.ts packages/shared/src/auth/__tests__/branch-hub-static.test.ts
git commit -m "feat(operator): add device-aware Branch Hub destination resolver (foundation #1)"
```

---

### Task 4: Full gate + handoff note

**Files:** none (verification only)

- [ ] **Step 1: Run the full repo gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green. Nếu dead-export gate phàn nàn 3 unit mới "unused" (chỉ test import qua relative path), KHÔNG suppress — đó là public API tiêu thụ ở sub-project #2; thêm vào `packages/shared/src/auth/index.ts` barrel CHỈ khi #2 wire (ghi rõ ở handoff).

- [ ] **Step 2: Confirm zero behavior change**

Xác nhận grep: KHÔNG file nào ngoài 6 file mới import `resolveBranchContext` / `resolveOperatorTiles` / `resolveBranchHubDestination`. Login/proxy/redirect chưa đổi. Đây là tiêu chí "additive" của #1.

Run: `git grep -nE "resolveBranchContext|resolveOperatorTiles|resolveBranchHubDestination" -- "apps/web/app" "apps/web/proxy.ts" | grep -v "_lib/branch-context\|_lib/branch-scope-select"`
Expected: no output (chưa wire live).

- [ ] **Step 3: Commit (if any gate fixups were needed)**

```bash
git add -A
git commit -m "chore(operator): foundation #1 gate green"
```

## Self-Review (đã chạy)

- **Spec coverage:** 3 deliverable của blueprint #1 (branch-context · capability registry · Branch Hub) = Task 1/2/3. ✓
- **Placeholder scan:** không có placeholder chưa quyết; mọi step có code/lệnh thật. ✓
- **Type consistency:** `OperatorBranchOption`/`BranchScopeSelection`/`BranchContext` (Task 1), `Resolved*Tile*` (Task 2), `BranchHubContext`/`StationKind` (Task 3) định nghĩa 1 lần, dùng nhất quán; `JwtClaims`/`StaffRole`/`MODULE_ACL`/`canAccess`/`getDefaultRedirect`/`isAdminRole` khớp chữ ký đã verify trong code. ✓
- **Additive:** không sửa proxy/redirect/layout; barrel export hoãn → không đổi hành vi. ✓
