# T3 Contract — Branch operator receiving (GRN) + production (D068)

Tier: **T3** (Auth/RLS + SECURITY-context function + prod migration). Debate: 4 lenses
(Security, Data, Product, QA) spawned in parallel + orchestrator production trace.
Owner decisions: 2026-07-05.

Skill plan: repo rules = engineering + workflow + database + ui; external = t3-debate;
runtime = codegraph (read) + Supabase MCP (read-only); skipped = tax-vn (no rate/threshold),
browser QA (no new live UI — operator routes already exist; defer to impl verify).

## Objective (owner-decided 2026-07-05)

A **Kho CN** (`branches.branch_kind = 'branch'`) may, at its **own** branch:
1. Receive goods **directly from a supplier** (GRN) — no routing through Kho Tổng transfer.
2. Run **production** (production orders) — previously central-kitchen-only.

Actor = `branch_manager`. Authority = **create + confirm** (posts stock / consumes ingredients).
Suppliers = branch_manager may **quick-create** (tenant-wide supplier master). **PO stays closed**
to branches (no purchase orders at `branch` sites — unchanged from D066 §3 / D059 §7).

This **reverses a recorded decision**: `docs/ref/inventory-rbac-matrix.md` records that
`branch_manager` procurement keys were deliberately removed (`_archive/20260505094000_inventory_rbac_template_contract_v2.sql`)
and production is "hard-deny branch_manager". D068 authorizes the reversal; the matrix doc must
be updated in the same PR.

## Verified current state (evidence — do not re-derive)

- **Data/RPC already branch-capable.** `fetchProcurementBranches` (`apps/web/app/(protected)/inventory/_lib/procurement-branches.ts:19`) returns `'branch'`. `confirm_goods_receipt_note` RPC (baseline `00000000000000_baseline.sql:5823`, kind gate `:5869`) accepts `branch` and posts to `stock_movements`/`stock_levels`/`ingredients.unit_cost` keyed to the GRN's **own** `branch_id`. `create_production_order` (baseline:8076, `:8151` kind gate `NOT IN ('branch','central_kitchen')`) and `confirm_production_order` (baseline:6133, kind gate `NOT IN ('branch','central_kitchen')`) **already whitelist `'branch'`** and gate on `has_permission(branch_id, key)`.
- **The wall is code role gates + (production only) RLS/function hardcodes.**
- **GRN RLS is LOOSE** — `grn_insert` (baseline:40345) = `tenant AND has_permission_any('procurement:grn_create')`, **no branch-membership check** → cross-branch risk (F1.2 hardening).
- **Production RLS is STRICT but central-only** — `production_orders_write` (baseline:41539) + `production_order_items_write` (baseline:41513) require `b.branch_kind = 'central_kitchen'`; `is_inventory_production_operator()` = `auth_role() IN ('owner','production_manager')`.

## Synthesis

**Agreements (all 4 lenses):**
- Fits D012 phễu (1 step / 1 actor replaces the 3-step, 2-actor transfer ritual). Additive — the transfer path stays; branch can do both.
- Branch GRN/production post correctly to branch stock + food-cost/WAC via the existing RPCs (no misroute).
- Grant mechanism = per-position `role_templates`, applied on hire — a migration, not an ad-hoc per-user grant (which would drift).
- HĐĐT/B2C unaffected (GRN is inbound supplier receiving, not outbound invoicing).

**Conflicts resolved:**
1. **`PROCUREMENT_ROLES` coarse-widening is UNSAFE** (QA §3): the constant is shared by suppliers CRUD, PO lifecycle, supplier-invoice match, recipes. Resolution: keep `PROCUREMENT_ROLES` as the coarse gate for GRN + shared reads + suppliers **and add `branch_manager`**, but the fine differentiation is the **per-action permission key + grant** (existing architecture — every action declares a distinct `PERMISSION_KEYS.*`). branch_manager is granted only the 6 keys below → GRN + production + supplier-create + read work; recipe-write (needs `menu:write`), invoice-match (needs invoice keys) stay closed.
2. **PO must be double-guarded** (Security F2): because `PROCUREMENT_ROLES` is shared with PO actions, split out `PROCUREMENT_PO_ROLES = [owner, warehouse_manager, production_manager]` and point **all** of `purchase-order-actions.ts` at it. This rejects branch_manager from PO by role, independent of any grant.
3. **Cross-branch write (Security F1 / QA §4 CRITICAL).** `canAccessProcurementBranch` (`grn-actions.ts:34`) `return true` for any role not in `isBranchScopedProcurementRole` (currently only warehouse/production). Admitting branch_manager without also adding it there → branch A writes GRN for branch B (client-supplied `branch_id`). Same shape for production via `isProductionBranchScopedRole`. Resolution: add branch_manager to both branch-scoped predicates (their `claims.branch_id` is non-null → strict own-branch equality) + harden GRN RLS to `has_permission(branch_id, key)`.
4. **MODULE_ACL** (Security said "don't add", Data/Product/QA said "must add or the page redirects"): resolution — **add** branch_manager to `MODULE_ACL.inventory_procurement` (required for `GrnNewPageContent` `canAccess` + operator GRN/production routes). Accepted read-exposure (office PO/supplier-invoice **routes** become reachable, but PO **create** is role-split-closed, invoice-match key-closed, PO nav tile stays central-kind-gated). Single-tenant HKD, trusted branch_manager → acceptable. Revisit (decouple into a dedicated receiving module) only if the owner objects to branch seeing central PO reads. YAGNI for now.

## Final grant set (branch_manager role_template, per-branch scope)

`procurement:grn_create`, `procurement:grn_confirm`, `procurement:read`,
`procurement:supplier_manage`, `inventory:production_create`, `inventory:production_confirm`.

**NOT** granted: `procurement:po_create` (PO closed), `menu:write` (recipe-write closed),
supplier-invoice/match keys. Grants are **branch-scoped rows** (`branch_id = user's branch`,
never `NULL`/tenant-wide — a null grant would defeat the RLS branch-membership check).

## Implementation — CODE (shippable, no owner gate)

### GRN
1. `packages/shared/src/auth/inventory-roles.ts:19` — add `"branch_manager"` to `PROCUREMENT_ROLES`. Add new `export const PROCUREMENT_PO_ROLES = ["owner","warehouse_manager","production_manager"]` (old set).
2. `apps/web/app/(protected)/inventory/purchase-order-actions.ts:13` — import `PROCUREMENT_PO_ROLES`; set `const ROLES = PROCUREMENT_PO_ROLES` so **every** PO action (read + the 5 mutating: `createPurchaseOrder:180`, `createPurchaseOrderWithLines:258`, `upsertPurchaseOrderLine:360`, `deletePurchaseOrderLine:440`, `updatePurchaseOrderStatus:496`) rejects branch_manager by role. (GrnNewPageContent tolerates the resulting empty open-PO list — `grn/new/page.tsx:148-150`.)
3. `apps/web/app/(protected)/inventory/grn-actions.ts:18` — add `"branch_manager"` to `isBranchScopedProcurementRole`. **This is the cross-branch guard — must not ship without it.** Verify branch_manager claims carry non-null `branch_id` (pinned branch role) so `canAccessProcurementBranch:35-38` enforces `effectiveBranchId === branchId`.
4. `apps/web/app/(protected)/inventory/purchase-order-actions.ts:15` — same `isBranchScopedProcurementRole` copy: add `"branch_manager"` for consistency (defensive; moot now that PROCUREMENT_PO_ROLES excludes branch_manager). Add a `MIRROR` comment on both copies pointing at each other, OR extract to one shared helper in `inventory-roles.ts` and import in both (preferred — kills the QA-flagged drift).
5. `packages/shared/src/auth/module-acl.ts:61` — add `"branch_manager"` to `inventory_procurement.allowedRoles`.

### Production
6. `apps/web/app/(protected)/inventory/_lib/production-roles.ts:3` — add `"branch_manager"` to `PRODUCTION_OPERATOR_ROLES`; `:8` — add `"branch_manager"` to `PRODUCTION_BRANCH_SCOPED_ROLES`.
7. `apps/web/app/(protected)/inventory/_lib/production-shared.ts:86` — `requireProductionBranch`: change `data?.branch_kind !== "central_kitchen"` to reject only when kind is **neither** `"central_kitchen"` **nor** `"branch"`. Generalize the error copy away from "Chỉ Bếp Trung Tâm…" (route through `@comtammatu/shared/messages`, no inline Vietnamese). `requireProductionAccess:103` needs no change (branch_manager has non-null `branch_id` → hits `requireProductionBranch`, not the tenant fallback).
8. `packages/shared/src/auth/nav-config.ts:223` — production tile "Sản xuất" `kinds: ["central_kitchen"]` → `["central_kitchen","branch"]`. **Leave the PO tile (`:298`) `kinds` unchanged** (PO stays central).

### i18n
9. Any new/changed user-facing string → `@comtammatu/shared/messages` (eslint `i18n/no-inline-vietnamese` is in the gate). Run `pnpm lint:i18n:baseline` if the count shifts.

## Implementation — MIGRATION (single file, OWNER-DELEGATED APPLY — do NOT apply)

`supabase/migrations/<ts>_branch_operator_grn_production.sql`. Model idempotent form on
`supabase/migrations/20260702094500_branch_stock_operator_actions.sql`. Contains:

**(a) Grants** — `UPDATE role_templates` DISTINCT-unnest to add the 6 keys to `position_code='branch_manager'`; branch-scoped backfill into `staff_permissions` for active branch_manager operators (`branch_id = p.branch_id`, NOT NULL, `ON CONFLICT (user_id, branch_id, permission_key) WHERE branch_id IS NOT NULL`). Verify each key exists in the `permission_keys` catalog first (grn_create/read confirmed; verify `procurement:supplier_manage`, `inventory:production_create`, `inventory:production_confirm` scope — expect `branch`/`either`). Also update `supabase/_local-dev/dev-tenant-seed.sql` `branch_manager` template array (SSoT the migration mirrors).

**(b) GRN RLS hardening (F1.2)** — `grn_insert`, `grn_update`, `grn_items_write` WITH CHECK: replace `has_permission_any('procurement:grn_create')` with `has_permission(branch_id, 'procurement:grn_create')` (and the `grn_confirm` arm on update). `has_permission(bigint,text)` exists (baseline:14475, enforces `sp.branch_id = p_branch_id OR sp.branch_id IS NULL`). For `grn_items_write`, derive `branch_id` via the parent `goods_received_notes` row (items table has no direct `branch_id` — **verify the exact policy body** and join through the parent).

**(c) Production RLS relax** — `production_orders_write` (baseline:41539) + `production_order_items_write` (baseline:41513): change `b.branch_kind = 'central_kitchen'` → `b.branch_kind IN ('central_kitchen','branch')`. Keep the existing `has_permission(branch_id, …)` branch-membership arms.

**(d) Production operator function** — `CREATE OR REPLACE FUNCTION public.is_inventory_production_operator()` → `auth_role() IN ('owner','production_manager','branch_manager')`. Preserve `STABLE`, `SET search_path TO ''`.

Deliver as file → PR → owner applies (no default prod apply; MCP is read-only PROD SELECT).
The code change ships in the same PR but the migration is owner-gated: **until applied, branch_manager
holds no grant → the feature is dormant, not broken.**

## Tests (must be green before ship)

Re-pin:
- `packages/shared/src/auth/__tests__/module-acl-matrix.test.ts` — add `inventory_procurement` to `branch_manager` expected set (keep sorted). owner/warehouse/production entries unchanged.
- `apps/web/tests/operator-stock-redirect-static.test.ts` — **production tile** pin (`:1123`, `kinds: ["central_kitchen"]`) → `["central_kitchen","branch"]`. **PO tile pin (`:1136`) MUST stay unchanged** — if it needs editing, the diff scope-crept into PO.
- Regenerate `docs/spec/role-route-matrix.md` via `node scripts/gen-role-route-matrix.mjs` (then `--check` in gate).

New coverage:
- Unit: `branch_manager` with `branch_id=X` is **rejected** creating/confirming a GRN for `branchId=Y≠X` (`canAccessProcurementBranch` / `isBranchScopedProcurementRole`) — this symbol has **zero** current coverage; it is the highest-risk gap.
- Unit: `branch_manager` **rejected** by role on `createPurchaseOrder` / `createPurchaseOrderWithLines` (PROCUREMENT_PO_ROLES).
- Unit: `branch_manager` rejected creating a production order for a foreign branch.
- Unchanged: owner/warehouse_manager/production_manager paths still pass (no widening/narrowing).

## Gate (run FRESH in this worktree — turbo cache untrusted)

`pnpm lint && pnpm test` (never `| tail` — swallows exit code). Explicit: `i18n/no-inline-vietnamese`
zero new; `protected-route-module-coverage.test.ts` green; `node scripts/gen-role-route-matrix.mjs --check`;
`node scripts/check-seed-permission-sync.mjs`; `corepack pnpm lint:review-tier` (T3 token present in a
commit body). Keep a `Verification:` note with the `T3` token.

## Out of scope / accepted risk

- Office `/inventory/*` PO/invoice **routes** reachable by branch_manager (reads only; writes closed). Accepted; decouple later only if owner objects.
- Native-mobile branch receiving/production **UI polish** (job-first CTA per D067) is D067's domain — this PR only opens the capability on the existing operator routes.
- `requireProductionBranch` default-receive/production-location provisioning: a `branch` newly onboarded to production/receiving needs its `inventory_locations` default rows (baseline:5879 / production_location) or confirm raises `*_location_missing`. Provisioning checklist, not code.

## D068 — verbatim text for `docs/plan/decisions.md` (append after D067)

```
## D068: Kho CN tự nhận NCC (GRN) + sản xuất tại chi nhánh — branch_manager, own-branch (2026-07-05)

**Context:** Owner chỉ đạo 2026-07-05: "Kho CN được quyền nhập hàng, không cần phải thông qua Kho Tổng" + "Sản xuất chi nhánh cũng có và làm được, Quản lý chi nhánh có quyền". Xác minh code+PROD: tầng data/RPC ĐÃ sẵn cho `branch` — `confirm_goods_receipt_note`, `create_production_order`, `confirm_production_order` đều whitelist kind `branch` và gate `has_permission(branch_id, …)`; cái chặn là role gate code (`PROCUREMENT_ROLES`, `PRODUCTION_OPERATOR_ROLES`, `MODULE_ACL.inventory_procurement`) + (production) RLS `production_orders_write`/`production_order_items_write` + hàm `is_inventory_production_operator()` hardcode `central_kitchen`/`production_manager`. GRN RLS `grn_insert` chỉ soi `has_permission_any` (không branch-membership). ĐẢO quyết định đã ghi (`docs/ref/inventory-rbac-matrix.md` — branch_manager bị cố tình gỡ procurement + hard-deny production, migration `20260505...v2`). T3 debate 4 lens: `docs/worklog/t3-branch-operator-receiving-production-2026-07-05.md`.

**Decision (owner chỉ đạo 2026-07-05):**

1. **Kho CN (`branch`) tự nhận hàng NCC (GRN) trực tiếp** — không bắt buộc qua Kho Tổng; luồng điều chuyển (Yêu cầu hàng → Nhận) GIỮ, đây là ADD không thay.
2. **Sản xuất tại chi nhánh** — `branch` chạy được lệnh sản xuất (trước đây chỉ Bếp TT).
3. **Actor = `branch_manager`, quyền TẠO + XÁC NHẬN** (post tồn / trừ NL), **chỉ trên chi nhánh của mình** (own-branch, enforce cả app-layer `isBranchScoped*` lẫn RLS `has_permission(branch_id,…)`).
4. **NCC:** branch_manager được **tạo NCC nhanh** (danh mục NCC dùng chung tenant) — grant `procurement:supplier_manage`.
5. **PO vẫn ĐÓNG với chi nhánh** (không đặt hàng NCC ở `branch`) — tách `PROCUREMENT_PO_ROLES` giữ PO cho owner/warehouse/production; giữ D066 §3 / D059 §7 (tile "Đơn đặt hàng" central-only).
6. **Grant per-branch** (không tenant-wide): `procurement:grn_create/grn_confirm/read/supplier_manage` + `inventory:production_create/production_confirm` vào `role_templates.branch_manager` — migration file → PR → owner apply.

**Consequences:** Đảo mục branch_manager trong `docs/ref/inventory-rbac-matrix.md` (update cùng PR). Mở rộng D000 (Kho CN nhận NCC + sản xuất, không chỉ giữ branch stock/consumption); không đảo D012/D020/D066 §3/D059 §7 (PO vẫn central). Migration đụng RLS + hàm `is_inventory_production_operator()` → owner-delegated apply; đến khi apply, branch_manager chưa có grant → tính năng ngủ, không vỡ. Đảo mục 1–6 phải sửa bản ghi này trước.
```

## `docs/ref/inventory-rbac-matrix.md` edits

Flip `branch_manager` rows: `procurement:grn_create` / `grn_confirm` / `read` / `supplier_manage`
and `inventory:production_create` / `production_confirm` from ❌ to ✅ (own-branch). Remove the
"Production hard-deny branch_manager" note and the corresponding "Open Question" — replace with a
pointer to D068. Keep `procurement:po_create` = ❌ for branch_manager.

## Review outcome (2026-07-05)

Independent adversarial review (opus code-reviewer) on the committed diff: **PASS-WITH-FIXES**
— 0 Critical, 0 High, 1 Medium, 3 Low. Security-critical path (cross-branch prevention, PO
closure, RLS branch-membership, `is_inventory_production_operator` context preservation) verified
correct + fail-closed against baseline SQL and by fresh test execution.

Applied before merge:
- **MEDIUM (test fidelity):** extracted the guard decision to a pure shared
  `isProcurementBranchInScope(role, effectiveBranchId, targetBranchId)`; `canAccessProcurementBranch`
  now calls it and `procurement-branch-scope.test.ts` exercises the REAL function (not a
  reconstruction) — a guard-body regression (flipped `===`, wrong predicate) now fails RED.
- **LOW#1 (migration):** annotated that the `role_templates` UPDATE is intentionally not
  tenant-scoped (D002 single-tenant); the `staff_permissions` backfill is tenant-scoped.

Deferred, documented + backstopped: LOW#2 (`production_order_items_write` USING-arm places the
`has_permission` inside the EXISTS — pre-existing, parity-preserving), LOW#3 (defensive branch-scope
machinery in `purchase-order-actions.ts` is moot now PO is role-closed — belt-and-suspenders per §4).
Production cross-branch keeps the static test (triple-backstopped: `requireProductionBranch` + RLS +
`create/confirm_production_order` RPC `has_permission(branch_id,…)`).

Integration note: rebased onto main (D067 W4 catalog surface, #274). Fixed a pre-existing main-HEAD
red — #274 tripped `check-ui-contract` (operator-embedded button density on `grn-list-client.tsx`) —
in a separate `#274 follow-up` commit. Full gate (`pnpm lint && pnpm test`) green fresh in the
worktree post-rebase + post-fixes.
