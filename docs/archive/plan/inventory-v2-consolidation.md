# Inventory V2 Consolidation — Refactor Contract

> **⚠️ STATUS: SUPERSEDED (2026-05-05)**
>
> Owner đã expand scope từ Inventory-only consolidation → whole-system blue/green rebuild + brand refresh. Doc này không còn là plan ship được.
>
> **Replacement program:**
> - Top-level: `docs/10-ROADMAP.md`
> - Strategy: `docs/plan/system-rebuild/{00-DEBATE-SYNTHESIS,01-BRAND-SOFTWARE-PROGRAM,02-GREEN-BASELINE,03-DATA-MIGRATION-POLICY,04-CUTOVER-QA-RUNBOOK}.md`
> - ADRs: `docs/plan/adr/000{1-4}-*.md`
> - Audit: `docs/plan/system-rebuild/audit/`
>
> Inventory V2 cụ thể trong rebuild = **Wave W3** trong route-family rollout. Chi tiết W3 sẽ viết fresh chống green baseline (không port V1 latent schema) tại `docs/plan/system-rebuild/05-W3-INVENTORY-DETAIL.md` (PENDING — sau audit results).
>
> Nội dung dưới đây giữ làm **historical reference** cho:
> - Persona test matrix structure
> - 17 RPC body cutover pattern (vẫn áp dụng cho W3)
> - Pending data guard (stocktake_conflicts / hardblock overrides) — converted thành audit blocker trong `audit/classification-template.md`
> - Schema bug discoveries (column `enabled`, RPC sig 5-arg, position_code casing) — đã đưa lên ADR-0004 + W3 baseline
>
> **Đừng dùng SQL sketches phía dưới làm input cho rebuild migration** — green baseline viết từ scratch trong `supabase/migrations-green/0001_green_baseline.sql`.
>
> ---
>
> ### Original (v2) header (frozen):
>
> **Status:** PROPOSED v2 — incorporated dev review 2026-05-05
> **Author:** synthesis 4-agent debate (PM / BA / Sr.Dev / QA) + dev errata
> **Created:** 2026-05-05 (v1) → revised 2026-05-05 (v2)
> **Supersedes (UI scope):** `docs/plan/inventory-redesign.md` (V1) cho phần daily UX/nav/role; V1 schema/RPC giữ làm latent enforcement layer.
> **Aligned with:** `docs/worklog/inventory/inventory-pilot-contract-v2.md` (V2 Pilot Contract)
>
> **Revision log v2** — fixes from dev review:
> - §2 Q2: cold-chain seed UPDATE đúng `ingredient_category_review_policy` (không phải `ingredient_categories`).
> - §2 Q6: chấp nhận generic redirect proxy hiện tại — bỏ kế hoạch patch proxy/`BlockedStateReasonCode`.
> - §3 phasing: đổi P3↔P4 — `notFound()` route tree TRƯỚC, delete component/action SAU khi grep + build sạch.
> - §3 P5 SQL: fix `branch_feature_flags.enabled` (không phải `is_enabled`), flag key prefix `inv_s10_*` (không phải `S10_*`), `create_waste_from_order(BIGINT,BIGINT,TEXT,JSONB,TEXT)` 5-param signature, `role_templates.position_code` đúng casing (`quan_ly_CN`, `quan_ly_vung`, `bep_truong`, `kho_truong`), legacy_role qua `positions.legacy_role_code` JOIN (không phải `profiles.legacy_role_code`).
> - §3 P5 + §7 DoD: bỏ "SW version bump" — Serwist precache hash + NetworkFirst tự handle stale; không có `SW_VERSION` constant trong `apps/web/app/sw.ts`.
> - §1 scope: V1 components có caller V2 (HardblockOverrideDialog, AutoApproveEvalPanel, WasteTierBadge, `_lib/feature-flags.ts`) — KHÔNG delete blanket; classify per orphan-grep gate trong P4.

---

## How to read this doc

Bốn nhóm nội dung:
1. **§0–§1**: vì sao chốt V2, scope cứng.
2. **§2**: 9 owner decisions đã pre-resolve với rationale (dev có thể challenge).
3. **§3–§5**: implementation plan — file:line, SQL sketch, persona test matrix.
4. **§6–§8**: rollback, DoD, sign-off block.

Dev team đọc theo thứ tự — mỗi section đều standalone. Câu hỏi/disagreement comment thẳng vào doc qua PR.

---

## §0. Tại sao consolidate

**Triệu chứng**: `/admin/inventory` list 4 V1 cards (trust/cold-chain/express/feature-flags) song song với V2 pilot 4-điểm vận hành (CW→CK→KCN→BCN). Owner dashboard, branch_manager nav, role gating, regression rules — đều mix V1 + V2 không nhất quán.

**Nguyên nhân**: V1 (Inventory Redesign 7-policy) ship qua S0–S15 trong tuần 2026-04-25; V2 Pilot Contract ship đè 2 ngày sau (2026-04-27) nhưng chỉ enforce runtime SQL (`kitchen_use` retire, atomic intra-branch transfer, default_consumption gate). UI/nav/role không dọn theo V2.

**Quyết định**: V2 = single source of truth cho UI/nav/role/SOP. V1 schema/RPC giữ làm latent layer (re-enable Phase 3 khi business chín, không drop để tránh data loss).

---

## §1. Scope cứng

### IN SCOPE (refactor này phải làm)

| # | Item |
|---|---|
| 1 | `/admin/inventory` rewrite → owner exception view (1 page, không phải hub 5-card) |
| 2 | `module-acl.ts:inventory_admin` thu về `["owner", "super_manager"]` |
| 3 | 4 sub-routes admin V1 (`trust`, `cold-chain`, `express-windows`, `feature-flags`) → page body trả `notFound()` (giữ file `*-client.tsx` cho revert dễ) |
| 4 | 7 sub-routes inventory V1 deferred (`stocktake/conflicts`, `stocktake/[id]/escalate`, `waste/auto`, `waste/approvals`, `supplier-returns`, `supplier-credit-notes`, `supplier-invoices`) → page body trả `notFound()` |
| 5 | `/inventory/_components/inventory-shell.tsx` — không đụng (đã đúng V2 task-first IA) |
| 6 | Slim `trust-actions.ts` — giữ `getMyTrustScore` (caller `apps/web/app/employee/profile/page.tsx:36`); xoá admin leaderboard exports nếu không còn caller sau P3 |
| 7 | Sau khi P3 (route notFound) merged + build green: chạy orphan grep gate (P3.5). Mỗi server action / component dưới đây **chỉ delete khi grep + typecheck xác nhận 0 caller**: `feature-flag-actions.ts`, `catalog-policy-actions.ts`, `credit-note-actions.ts`, `supplier-payment-actions.ts`, `supplier-return-actions.ts`, `variance-actions.ts`, `auto-approve-eval-panel.tsx`, `hardblock-override-dialog.tsx`, `waste-tier-badge.tsx`, `kds-cancel-stage-picker.tsx`, `_lib/feature-flags.ts`, `_lib/feature-flag-meta.ts`, `_lib/auto-waste-toast.ts`. Component nào còn caller V2 (vd `HardblockOverrideDialog ← grn-line-variance-column.tsx`, `AutoApproveEvalPanel + variance-actions ← grn-variance-wrapper.tsx`, `WasteTierBadge ← waste/new/waste-create-client.tsx`, `_lib/feature-flags ← dashboard/page.tsx + stocktake/[id]/count/page.tsx`) → KEEP (hoặc reduce tới no-op) — KHÔNG delete blanket |
| 8 | Delete `waste-actions.ts#createWasteFromOrder` + Zod schema — đã verify 0 caller POS/KDS runtime, chỉ self-reference + read-only `auto-list-client.tsx` (xoá cùng P3 khi `/inventory/waste/auto` 404) |
| 9 | Migration `20260507000000_inventory_v2_consolidate.sql`: pending-data guard, slim `role_templates`, REVOKE EXECUTE V1 RPCs, disable V1 feature flags, seed `ingredient_category_review_policy`, unschedule defer MV cron — chi tiết §3 P5 |
| 10 | RPC body cutover (subset 7 inventory RPCs trong `inventory-rbac-matrix.md §6`) → `has_permission()` (P0 BLOCKER trước UI cutover) |
| 11 | Update `permissions.ts` comments (giữ keys, mark `[V1-LATENT]`) |
| 12 | Update SOP docs: `inventory.md`, `inventory-sop.md`, `inventory-rbac-matrix.md`, `inventory-role-handoff.md` |
| 13 | Mark `inventory-redesign.md` header `SUPERSEDED by inventory-v2-consolidation.md (UI scope only)` |
| 14 | Add regression rule `INVENTORY-V1-RETIRED-2026-05` block re-introduction |
| 15 | Evidence-log: 7 personas × 2 devices screenshot + before/after `stock_levels` rows cho 4-điểm flow |

### OUT OF SCOPE (KHÔNG được làm trong refactor này)

| # | Item | Lý do |
|---|---|---|
| 1 | `DROP TABLE` cho bất kỳ V1 table nào | Audit/data loss/irreversible |
| 2 | `DROP FUNCTION` V1 RPCs | RLS policy reference + Phase 3 re-enable |
| 3 | Sửa `mv_inventory_stock_current` definition | V2 dashboard depend |
| 4 | Đổi cron `scan_inventory_alerts` | V2 reorder alert vẫn cần |
| 5 | Mobile shell `apps/web/app/inventory/m/**` | Đã align persona, refactor riêng nếu cần |
| 6 | POS/KDS cancel flow | V2 không touch — dùng `consumption`/`refund_restore` movement có sẵn |
| 7 | Print agent (`apps/print-agent/**`) | Grep verified zero V1 inventory ref |
| 8 | `accounting_periods` schema | Cross-cutting Finance, refactor riêng |
| 9 | `branch_feature_flags` table | Infra cross-cutting |

---

## §2. 9 Owner Decisions — Pre-resolved

Mỗi quyết định dưới đây đã có recommend + rationale. Dev có thể challenge từng cái qua PR comment. Owner override = update §2 + invalidate downstream sections.

### Q1. POS auto-waste khi void/cancel

**Decision: DELETE `createWasteFromOrder` action + picker + auto-list page**.

**Rationale**: Grep verified — `createWasteFromOrder` chỉ được tham chiếu bởi 4 file: chính `waste-actions.ts:393`, `kds-cancel-stage-picker.tsx`, `auto-list-client.tsx`, `auto-waste-toast.ts`. **POS `discount-actions.ts` và `order-actions.ts` KHÔNG hề gọi nó.** Tức wiring đã chết từ trước; xoá UI = zero runtime regression. RPC `create_waste_from_order` ở DB giữ (REVOKE EXECUTE từ `authenticated` thôi) — Phase 3 reopen bằng grant lại.

**Replaces**: void/cancel hiện đã ghi `consumption` âm hoặc `refund_restore` qua `complete_payment_and_consume_stock` — đủ cho V2 cost reconciliation. Stocktake định kỳ catch shrink.

**Regression impact**: rule `AUTO-WASTE-NON-FATAL` (2026-04-24) **archive vào `regressions-archive.md`** vì action không còn tồn tại.

### Q2. Cold-chain SKU flag

**Decision: SEED `ingredient_category_review_policy` rows với `requires_manual_review = TRUE` cho category lạnh, drop UI config**.

**Rationale**: V1 §Q4a auto-approve condition #7 hard-block cold-chain; nếu để policy mặc định FALSE = mọi SKU vào auto-approve = **food safety risk**. Seed = owner không thể vô tình tắt qua UI. Schema thực tế (per `supabase/migrations/20260425060000_s0b_catalog_review_policy.sql:22`): table `ingredient_category_review_policy(tenant_id, category, requires_manual_review)` — `category` là TEXT (không phải FK), PK `(tenant_id, category)`.

```sql
-- Seed cold-chain category names that match actual ingredient_categories.code/name in your tenant.
-- Dev MUST verify list against `SELECT DISTINCT category FROM ingredients` HOẶC seed `ingredient_categories` table TRƯỚC khi run migration.
INSERT INTO public.ingredient_category_review_policy (tenant_id, category, requires_manual_review, updated_at)
SELECT t.id, c.category_name, TRUE, now()
FROM public.tenants t
CROSS JOIN (VALUES
  ('thit_song'),       -- thịt sống
  ('hai_san'),         -- hải sản
  ('sua_trung'),       -- sữa & trứng
  ('rau_la_tuoi'),     -- rau ăn lá tươi
  ('do_dong_lanh')     -- đồ đông lạnh
) AS c(category_name)
ON CONFLICT (tenant_id, category)
  DO UPDATE SET requires_manual_review = TRUE, updated_at = now();
```

**Caveat for dev**: list `category_name` ở trên phải khớp với taxonomy thực tế (`ingredients.category` hoặc `ingredient_categories.code`). Dev `SELECT DISTINCT category FROM public.ingredients` trước khi viết migration cuối — nếu seed dùng `code` slug thì map sang đó.

**RPC `set_category_review_policy` REVOKE EXECUTE** — no UI re-toggle.

### Q3. Pending data trong `stocktake_conflicts`, `grn_hardblock_overrides`

**Decision: Migration check pending count = 0 trước khi merge**.

**Rationale**: Drop UI khi pending còn = audit gone. Migration thêm `DO $$ ... RAISE EXCEPTION` block:
```sql
DO $$
DECLARE pending_count int;
BEGIN
  SELECT count(*) INTO pending_count
  FROM public.stocktake_conflicts WHERE resolved_at IS NULL;
  IF pending_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate: % pending stocktake_conflicts. Resolve via /inventory/stocktake/conflicts first.', pending_count;
  END IF;

  SELECT count(*) INTO pending_count
  FROM public.grn_hardblock_overrides WHERE status = 'pending';
  IF pending_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate: % pending grn_hardblock_overrides. Resolve via /inventory/grn first.', pending_count;
  END IF;
END $$;
```
QLV phải resolve hết trước khi `supabase db push` — nếu có pending, migration fail rõ ràng, không silent.

### Q4. `user_trust_score` data hiện có

**Decision: Giữ table read-only**.

**Rationale**: Phase 3 re-enable cheap. Migration:
```sql
REVOKE EXECUTE ON FUNCTION public.compute_user_trust_score(uuid, bigint) FROM authenticated;
-- Self-view qua server action `getMyTrustScore` (Server Action chạy với service_role) vẫn ok
```
Self-view tại `/employee/profile` (verified caller) **giữ nguyên** — rule `TRUST-SELF-VIEW-NO-GATE` còn enforce.

### Q5. `grn-evidence` storage bucket

**Decision: Giữ bucket nguyên trạng**.

**Rationale**: Tax audit có thể yêu cầu PDF. Storage cost không đáng kể. Bucket policy không đụng.

### Q6. Branch_manager mất `/admin/inventory` access

**Decision: Update `module-acl.ts:inventory_admin.allowedRoles` → `["owner", "super_manager"]`. Chấp nhận generic redirect proxy hiện tại — KHÔNG patch proxy / `BlockedStateReasonCode`**.

**Rationale**: V2 contract ghi rõ "Owner/area landing: exception and oversight, not operator CTAs". `branch_manager` operator cần `/inventory` (đã có), không cần `/admin/inventory`.

**Runtime behavior** (verified `apps/web/proxy.ts:130-145`): admin route ACL fail → `redirectToDefaultLanding(request, response, claims, surface)`. Proxy không pass query reason. Branch manager visit `/admin/inventory` → bị redirect về default landing của role họ (`/inventory`). Không error rõ ràng nhưng không break — UX hiccup chấp nhận được, đỡ phải patch `BlockedStateReasonCode` (file `packages/shared/src/auth/blocked-state.ts:1-5` chỉ có 5 reason cố định, thêm reason = chạm shared-package + downstream surfaces).

**Mitigation cho UX hiccup**: Sidebar `inventory-shell.tsx` không hiển thị link `/admin/inventory` cho `branch_manager` ngay từ build (gate qua `canAccess(claims.user_role, "inventory_admin")` đã cập nhật). User chủ động typing URL = power user, redirect generic là đủ.

**Nếu owner muốn message rõ**: viết Phase 3 ticket riêng patch proxy + add `admin-inventory-restricted` reason — KHÔNG nằm trong refactor consolidation này.

### Q7. Cutover timing vs pilot evidence sign-off

**Decision: Refactor TRƯỚC pilot evidence sign-off**.

**Rationale**: QA flag pilot evidence-log §5 hiện `Final call: not ready` — vì V1 surface đang ô nhiễm pilot UI. Sign-off CHỈ pass sau khi V2 thuần. Cutover trước → evidence pure V2 → sign-off mới có ý nghĩa.

Risk: nếu V2 cutover phát sinh bug, Phase 0 (RPC body cutover) đã đủ stable trước UI cutover. Reversible bằng git revert.

### Q8. 17 RPC legacy `auth_role()` cutover

**Decision: P0 — patch RPC body sang `has_permission()` TRƯỚC UI cutover**.

**Rationale**: Per `inventory-rbac-matrix.md §6`, các RPC này whitelist hardcoded `super_manager`. Sau khi UI gate dùng `inventory:transfer_create/ship/receive`, `bep_truong` (production_manager) hoặc `quan_ly_cn` (branch_manager) sẽ bị RPC reject dù có permission key đúng. Negative test fail = pilot fail.

17 RPC ưu tiên fix (subset Inventory):
```
create_production_order, confirm_production_order, cancel_production_order,
upsert_recipe_lines, create_stock_transfer_draft, stock_transfer_list_branches,
create_stocktake_session
```
Các RPC khác (admin_update_profile, KDS, payroll, gl_reconciliation) defer Phase 3.

### Q9. Rollback procedure

**Decision: Document trong ADR. Không cần migration rollback (schema không drop)**.

**Steps**:
```bash
# 1. Revert UI commits
git revert -m 1 <merge-sha>

# 2. Restore role_templates from snapshot
psql "$DATABASE_URL" -f docs/plan/inventory-v2-consolidation/snapshot-role-templates-pre.sql

# 3. Restore staff_permissions from snapshot
psql "$DATABASE_URL" -f docs/plan/inventory-v2-consolidation/snapshot-staff-permissions-pre.sql

# 4. Re-grant RPC EXECUTE (signatures must match exactly)
psql "$DATABASE_URL" <<EOF
GRANT EXECUTE ON FUNCTION
  public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT),
  public.unblind_stocktake_session(uuid),
  public.recount_stocktake_round(uuid, integer),
  public.set_branch_express_window(bigint, time, time),
  public.extend_branch_express_window(bigint, integer),
  public.set_category_review_policy(bigint, boolean),
  public.compute_user_trust_score(uuid, bigint),
  public.rotate_branch_override_code(bigint)
TO authenticated;
EOF

# 5. Re-enable V1 feature flags (column name = enabled, not is_enabled)
psql "$DATABASE_URL" -c "
UPDATE public.branch_feature_flags
SET enabled = TRUE, updated_at = now()
WHERE flag_key IN (
  'inv_s10_grn_variance', 'inv_s11_waste_tier', 'inv_s11_ext_auto_waste',
  'inv_s13a_stocktake_v2'
);"
```

Snapshot files committed cùng PR refactor để rollback chỉ cần `git checkout` + `psql`. KHÔNG cần SW version bump — Serwist precache hash + NetworkFirst `pages` cache tự handle stale.

---

## §3. Implementation Plan — 6 Phases

| Phase | Goal | Effort | Reversibility |
|---|---|---|---|
| **P0** | RPC body cutover 7 inventory RPCs (`auth_role()` → `has_permission()`) | 1.5 ngày | Schema/data: zero risk; revert = git revert migration |
| **P1** | Permission & ACL slim (`module-acl.ts` + `permissions.ts` comments) | 1 ngày | Snapshot `role_templates` rows trước migration |
| **P2** | Admin hub rewrite + 4 admin V1 routes → `notFound()` | 2 ngày | git revert |
| **P3** | Hide deferred `/inventory/*` route trees → `notFound()` (KHÔNG delete component/action) | 1 ngày | git revert |
| **P3.5** | Orphan grep + typecheck gate — generate per-file delete/keep list | 0.5 ngày | Read-only — không có rollback gì |
| **P4** | Delete component/server-action ORPHAN (dựa trên P3.5 output, KHÔNG blanket) | 1 ngày | git revert |
| **P5** | Migration consolidate + docs/SOP/ADR/regression update | 1.5 ngày | Migration REVOKE-only → grant lại |

**Total**: ~8.5 ngày dev + 2 ngày QA persona evidence = ~2 tuần lịch.

**Lý do tách P3 / P3.5 / P4** (per dev review): nhiều component V1 (`HardblockOverrideDialog`, `AutoApproveEvalPanel`, `WasteTierBadge`, `_lib/feature-flags.ts`) đang được V2 routes import. Delete blanket = build break. Phải hide route tree TRƯỚC, để consumer V1 (vd `waste/approvals/waste-approvals-client.tsx`) trở thành dead code, RỒI mới chạy grep gate.

### P0 details — RPC body cutover (P0 BLOCKER)

**Files**: 7 migrations mới `20260506000010_*` đến `20260506000070_*`, mỗi migration `CREATE OR REPLACE FUNCTION` cho 1 RPC.

**Pattern**:
```sql
-- BEFORE (legacy auth_role check)
CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(...) ...
DECLARE v_role text;
BEGIN
  v_role := public.auth_role();
  IF v_role NOT IN ('super_manager', 'warehouse_manager', 'production_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  ...
END $$;

-- AFTER (permission-key check)
CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(p_branch_id bigint, ...) ...
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any(p_branch_id, 'inventory:transfer_create') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  ...
END $$;
```

**Verify**: per-persona negative test (cashier với devtools call → expect 42501).

### P1 details — Permission & ACL slim

**File 1**: `packages/shared/src/auth/module-acl.ts:65-72`
```diff
   inventory_admin: {
     path: "/admin/inventory",
-    allowedRoles: [
-      "owner",
-      "super_manager",
-      "area_manager",
-      "branch_manager",
-      "warehouse_manager",
-    ],
+    allowedRoles: ["owner", "super_manager"],
     label: getModuleLabelVi("inventory_admin"),
   },
```

**File 2**: `packages/shared/src/labels/vi.ts` thêm i18n message redirect.

**File 3**: `packages/shared/src/auth/permissions.ts` — comment block trên 14 V1 keys:
```diff
-  // inventory — redesign S0 (waste tier-2, stocktake blind/recount, adjust, GRN express, catalog review)
+  // inventory — V1-LATENT: schema preserved, UI hidden per inventory-v2-consolidation.md §1.
+  // Re-enable Phase 3 = re-grant template + restore route page.
   INVENTORY_WASTE_APPROVE: "inventory:waste_approve",
   ...
```

### P2 details — Admin hub rewrite

**File**: `apps/web/app/admin/inventory/page.tsx` — full rewrite.

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt as IconReceipt, ArrowRight as IconArrowRight, AlertTriangle as IconAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@comtammatu/ui/components/card";
import { loadAuthState } from "@/_lib/auth";
import { canAccess } from "@comtammatu/shared/auth";

export const dynamic = "force-dynamic";

/**
 * Admin Inventory — Owner exception view.
 * Per inventory-v2-consolidation.md §1: owner/super_manager only.
 * V1 advanced cards (trust/cold-chain/express/FF) removed from primary nav.
 */
export default async function InventoryAdminPage() {
  const { claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "inventory_admin")) redirect("/");

  // Load exception counts (server-side aggregation)
  const exceptions = await loadInventoryExceptions(); // GRN pending review > 24h, stocktake unaudited, period close gate

  return (
    <div className="container mx-auto max-w-5xl space-y-5 py-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Cấu hình kho</h1>
        <p className="text-muted-foreground text-sm">
          Owner overview. Vận hành hằng ngày tại{" "}
          <Link href="/inventory" className="underline">/inventory</Link>.
        </p>
      </header>

      <ExceptionGrid data={exceptions} />

      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          href="/admin/accounting/periods"
          title="Kỳ kế toán"
          description="Đóng/mở kỳ, hard-close day 15 + 2FA"
          icon={<IconReceipt className="size-5 text-success" />}
        />
      </div>
    </div>
  );
}
// ... ExceptionGrid + ToolCard helpers
```

**Routes 404**: `apps/web/app/admin/inventory/{trust,cold-chain,express-windows,feature-flags}/page.tsx`:
```tsx
import { notFound } from "next/navigation";
export default function Page() { notFound(); }
```
Giữ `*-client.tsx` để revert dễ.

### P3 details — Hide deferred route trees (notFound)

**Goal**: cắt 7 route consumer V1 khỏi build trước khi đụng component/action.

**Files** — body thành stub `notFound()`:
```tsx
// apps/web/app/inventory/stocktake/conflicts/page.tsx
// apps/web/app/inventory/stocktake/[id]/escalate/page.tsx
// apps/web/app/inventory/waste/auto/page.tsx              ← cùng đây xoá luôn auto-list-client.tsx
// apps/web/app/inventory/waste/approvals/page.tsx         ← waste-approvals-client.tsx trở thành orphan
// apps/web/app/inventory/supplier-returns/page.tsx        ← supplier-return-actions tạm còn caller "Page"; sẽ cleanup ở P4
// apps/web/app/inventory/supplier-credit-notes/page.tsx
// apps/web/app/inventory/supplier-invoices/page.tsx
import { notFound } from "next/navigation";
export default function Page() { notFound(); }
```

**Quan trọng**: P3 chỉ thay BODY của `page.tsx`. **KHÔNG xoá** sibling files (`*-client.tsx`, `[id]/page.tsx`, etc.) trong cùng directory ở phase này — `page.tsx` là entry route, các file kia chưa đến mức orphan cho đến khi `page.tsx` không còn import. Sau P3 build, sibling không còn caller → P3.5 sẽ catch.

**Sidebar nav**: `inventory-shell.tsx` hiện không expose các route deferred này vào sidebar (đã verify lines 71-220). Nếu có entry trỏ vào → comment out cùng PR.

**Verify P3**: `pnpm build` exit 0 (page route hợp lệ, không có TS error orphan).

### P3.5 details — Orphan grep gate (read-only)

**Goal**: enumerate file trở thành dead code sau P3, cho dev quyết định delete vs keep.

**Bash script** (commit vào `docs/plan/inventory-v2-consolidation/orphan-scan.sh`):
```bash
#!/usr/bin/env bash
# Run AFTER P3 merged. Output: list file 0 caller.
set -euo pipefail

CANDIDATES=(
  # Components
  "apps/web/app/inventory/_components/auto-approve-eval-panel.tsx"
  "apps/web/app/inventory/_components/hardblock-override-dialog.tsx"
  "apps/web/app/inventory/_components/waste-tier-badge.tsx"
  "apps/web/app/inventory/_components/kds-cancel-stage-picker.tsx"
  # Libs
  "apps/web/app/inventory/_lib/feature-flags.ts"
  "apps/web/app/inventory/_lib/feature-flag-meta.ts"
  "apps/web/app/inventory/_lib/auto-waste-toast.ts"
  # Server actions
  "apps/web/app/inventory/feature-flag-actions.ts"
  "apps/web/app/inventory/catalog-policy-actions.ts"
  "apps/web/app/inventory/credit-note-actions.ts"
  "apps/web/app/inventory/supplier-payment-actions.ts"
  "apps/web/app/inventory/supplier-return-actions.ts"
  "apps/web/app/inventory/variance-actions.ts"
  # Sibling client files in 7 deferred routes (likely orphan after P3)
  "apps/web/app/inventory/waste/auto/auto-list-client.tsx"
  "apps/web/app/inventory/waste/approvals/waste-approvals-client.tsx"
  "apps/web/app/inventory/supplier-returns/supplier-returns-client.tsx"
  "apps/web/app/inventory/supplier-credit-notes/credit-notes-client.tsx"
  "apps/web/app/inventory/stocktake/conflicts/conflicts-queue-client.tsx"
)

for f in "${CANDIDATES[@]}"; do
  base=$(basename "$f" | sed -E 's/\.(tsx|ts)$//')
  # Match imports referencing this file (excluding the file itself)
  callers=$(rg -l --type ts --type tsx "(@/inventory/.*${base}|\.\.?/.*${base}|\"\\./${base}\")" apps/web/app 2>/dev/null | grep -v "^${f}$" || true)
  if [ -z "$callers" ]; then
    echo "ORPHAN: $f"
  else
    echo "KEEP:   $f  (callers: $(echo "$callers" | tr '\n' ',' | sed 's/,$//'))"
  fi
done
```

**Output**: 2 buckets — `ORPHAN` và `KEEP`. Dev commit output vào `docs/plan/inventory-v2-consolidation/orphan-report-<DATE>.txt`.

**Acceptance for P3.5**: tất cả admin V1 routes (`/admin/inventory/{trust,cold-chain,express-windows,feature-flags}`) imports được scan; nếu có route nào còn import server action V1 mà chưa được P2 xử lý (vd `admin/inventory/cold-chain/page.tsx:4` import `catalog-policy-actions`), P3.5 phải flag để P4 xử lý.

### P4 details — Delete orphans only (dựa trên P3.5 output)

**Rule**: chỉ delete file nằm trong `ORPHAN` bucket của P3.5 report. Không blanket.

**Predict ORPHAN (post-P3, sẽ verify thực tế qua script)**:
- `kds-cancel-stage-picker.tsx` — caller `auto-list-client.tsx` (also orphan after P3)
- `_lib/auto-waste-toast.ts` — only references in already-orphan files
- `waste-approvals-client.tsx`, `auto-list-client.tsx`, `conflicts-queue-client.tsx`, `credit-notes-client.tsx`, `supplier-returns-client.tsx`
- `feature-flag-actions.ts` — only caller `/admin/inventory/feature-flags/feature-flags-client.tsx` (page.tsx 404 ở P2; client orphan nếu page không còn import)
- `catalog-policy-actions.ts` — only caller `/admin/inventory/cold-chain/page.tsx` (P2 404'd)
- `supplier-return-actions.ts`, `credit-note-actions.ts`, `supplier-payment-actions.ts` — only callers các page deferred (P3 404'd)

**Predict KEEP (callers in V2 keep routes)**:
- `HardblockOverrideDialog` ← `_components/grn-line-variance-column.tsx` (V2 GRN)
- `AutoApproveEvalPanel` + `variance-actions.ts` ← `_components/grn-variance-wrapper.tsx` (V2 GRN)
- `WasteTierBadge` ← `waste/new/waste-create-client.tsx` (V2 manual writeoff)
- `_lib/feature-flags.ts` ← `dashboard/page.tsx:6` + `stocktake/[id]/count/page.tsx:5`

**Subsequent decisions for KEEP-bucket files** (defer ra Phase 3 ticket riêng):
1. `_lib/feature-flags.ts` ở `dashboard/page.tsx`/`count/page.tsx` đang gate giữa V1 dashboard và V2 dashboard. Sau consolidation, đường dẫn V2-only → flag check thừa. Quyết định: hoặc remove flag check + drop V1 path code, hoặc giữ flag (rollout future-proof). Dev đề xuất kèm benchmark.
2. `HardblockOverrideDialog` + `AutoApproveEvalPanel`: GRN UI vẫn hiển thị variance hint là V2-acceptable (Q3 không deferred hard, chỉ defer hardblock policy admin config). Giữ nguyên render, gate dialog button bằng permission `inventory:grn_hardblock_override` (đã có).
3. `WasteTierBadge`: V2 manual writeoff không tier — badge hiển thị Tier 1 mọi lúc → information-free. Thay bằng plain badge "Manual" hoặc remove. Defer.

**Slim trust-actions.ts**: P4 cũng slim file — giữ `getMyTrustScore` (caller `apps/web/app/employee/profile/page.tsx:36`), xoá `getTrustLeaderboard` + admin exports nếu P3 đã 404 `/admin/inventory/trust`.

**Slim waste-actions.ts**: xoá `createWasteFromOrderSchema` + `createWasteFromOrder` function (lines 359-440) — đã verify 0 caller POS/KDS runtime; sau P3 hide `/waste/auto`, `auto-list-client.tsx` orphan và xoá cùng → tất cả callers đi.

**Verify P4**: `pnpm typecheck && pnpm lint && pnpm build` exit 0 sau mỗi delete; commit per-file để bisect dễ.

### P5 details — Migration consolidate

**File**: `supabase/migrations/20260507000000_inventory_v2_consolidate.sql`

```sql
-- ============================================================
-- Inventory V2 Consolidation
-- Per docs/plan/inventory-v2-consolidation.md
-- Schema preserved; only grants/flags/seeds touched.
-- ============================================================

BEGIN;

-- 1. Pending data check (Q3)
DO $$
DECLARE pending_count int;
BEGIN
  SELECT count(*) INTO pending_count
  FROM public.stocktake_conflicts WHERE resolved_at IS NULL;
  IF pending_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate: % pending stocktake_conflicts.', pending_count;
  END IF;

  SELECT count(*) INTO pending_count
  FROM public.grn_hardblock_overrides WHERE status = 'pending';
  IF pending_count > 0 THEN
    RAISE EXCEPTION 'Cannot consolidate: % pending grn_hardblock_overrides.', pending_count;
  END IF;
END $$;

-- 2. Slim role_templates — remove V1 keys from non-owner positions.
--    Position codes verified against `20260422120001_auth_v2_seed_catalog.sql` +
--    `20260425070000_s0c_period_overrides_caps_permissions.sql`:
--    `quan_ly_CN` (mixed case), `quan_ly_vung`, `kho_truong`, `bep_truong`, `ke_toan_truong`.
UPDATE public.role_templates
SET permission_keys = (
  SELECT array_agg(k) FROM unnest(permission_keys) k
  WHERE k NOT IN (
    'inventory:waste_approve',
    'inventory:waste_bypass_photo',
    'inventory:stocktake_recount',
    'inventory:stocktake_unblind',
    'inventory:adjust_approve',
    'inventory:grn_express_configure',
    'inventory:grn_express_extend',
    'inventory:grn_hardblock_override',
    'inventory:catalog_review_policy_set',
    'inventory:item_review_override_set',
    'procurement:price_list_write',
    'procurement:override_code_rotate',
    'supplier_return:create',
    'supplier_return:confirm'
  )
),
updated_at = now()
WHERE is_system = TRUE
  AND position_code IN (
    'quan_ly_CN',    -- branch manager (mixed case in seed!)
    'quan_ly_vung',  -- regional manager (NOT 'quan_ly_khu_vuc')
    'kho_truong',
    'thu_kho',
    'bep_truong'
  );

-- 3. Delete user-level grants (non-owner) — legacy_role lives on positions, not profiles.
DELETE FROM public.staff_permissions sp
USING public.profiles pr
JOIN public.positions po ON pr.position_id = po.id
WHERE sp.user_id = pr.id
  AND po.legacy_role_code NOT IN ('owner', 'super_manager')
  AND sp.permission_key IN (
    'inventory:waste_approve', 'inventory:waste_bypass_photo',
    'inventory:stocktake_recount', 'inventory:stocktake_unblind',
    'inventory:adjust_approve',
    'inventory:grn_express_configure', 'inventory:grn_express_extend',
    'inventory:grn_hardblock_override',
    'inventory:catalog_review_policy_set', 'inventory:item_review_override_set',
    'procurement:price_list_write', 'procurement:override_code_rotate',
    'supplier_return:create', 'supplier_return:confirm'
  );

-- 4. REVOKE EXECUTE V1 RPCs.
--    Signatures must match exactly; create_waste_from_order is 5-arg per
--    `20260425100000_s3_waste_tier_anti_split_and_rpcs.sql:453`.
REVOKE EXECUTE ON FUNCTION
  public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT),
  public.unblind_stocktake_session(uuid),
  public.recount_stocktake_round(uuid, integer),
  public.set_branch_express_window(bigint, time, time),
  public.extend_branch_express_window(bigint, integer),
  public.set_category_review_policy(bigint, boolean),
  public.compute_user_trust_score(uuid, bigint),
  public.rotate_branch_override_code(bigint)
FROM authenticated;
-- service_role + owner-bypass via has_permission() retained.

-- 5. Cold-chain seed (Q2) — table is ingredient_category_review_policy
--    (tenant_id, category, requires_manual_review). category is TEXT free-form.
--    Dev MUST update category list to match actual tenant taxonomy
--    (run `SELECT DISTINCT category FROM public.ingredients` first).
INSERT INTO public.ingredient_category_review_policy
  (tenant_id, category, requires_manual_review, updated_at)
SELECT t.id, c.category_name, TRUE, now()
FROM public.tenants t
CROSS JOIN (VALUES
  ('thit_song'),
  ('hai_san'),
  ('sua_trung'),
  ('rau_la_tuoi'),
  ('do_dong_lanh')
) AS c(category_name)
ON CONFLICT (tenant_id, category)
  DO UPDATE SET requires_manual_review = TRUE, updated_at = now();

-- 6. Disable V1 feature flags. Column is `enabled` (NOT `is_enabled`);
--    flag_key prefix is `inv_s{n}_*` per
--    `20260425170000_s10_foundation_branch_feature_flags.sql` +
--    `apps/web/app/inventory/_lib/feature-flags.ts`.
--    KEEP `inv_s12_dashboard_v2` enabled — V2 dashboard depends on it
--    (caller `apps/web/app/inventory/dashboard/page.tsx:52`).
UPDATE public.branch_feature_flags
SET enabled = FALSE,
    disabled_at = now(),
    updated_at = now()
WHERE flag_key IN (
  'inv_s10_grn_variance',
  'inv_s11_waste_tier',
  'inv_s11_ext_auto_waste',
  'inv_s13a_stocktake_v2',
  'inv_s13b_stocktake_recount',
  'inv_s14_auto_approve'
);

-- 7. Unschedule defer MV cron jobs
SELECT cron.unschedule('refresh_mv_grn_price_baseline')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_grn_price_baseline');
SELECT cron.unschedule('refresh_mv_inventory_value_ranking')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_inventory_value_ranking');
-- mv_inventory_stock_current cron KEEP (V2 dashboard depend)

COMMIT;

-- ============================================================
-- Rollback procedure (manual, NOT auto):
-- See docs/plan/inventory-v2-consolidation.md §6
-- ============================================================
```

**Snapshot files** committed cùng PR (rollback aid):
- `docs/plan/inventory-v2-consolidation/snapshot-role-templates-pre.sql` — `pg_dump` của `role_templates` trước migration
- `docs/plan/inventory-v2-consolidation/snapshot-staff-permissions-pre.sql` — same cho `staff_permissions`

---

## §4. Persona Test Matrix

Yêu cầu: 7 personas × ≥2 devices (desktop + mobile) screenshot + log + before/after `stock_levels` rows.

| Persona | Routes PASS | Routes FAIL/redirect | Action mutations | RPC expectation |
|---|---|---|---|---|
| `owner` | `/admin/inventory` (exception view), `/admin/accounting/periods`, `/inventory/*` (oversight read) | — | `period_reopen` (with 2FA) | `reopen_accounting_period` |
| `super_manager` | same as owner | — | `period_reopen` | same |
| `area_manager` | `/inventory` (read-only across area branches), `/admin/inventory` (READ-ONLY) | `/inventory/transfers/new` (no CTA) | none operator | none |
| `warehouse_manager` (kho_truong) | `/inventory`, `/inventory/grn`, `/inventory/transfers/new` (CW outbound), `/inventory/stocktake` | `/admin/inventory/{trust,cold-chain,express,FF}` 404 | ship CW→CK | `inventory:transfer_ship` succeeds; cashier same call → 42501 |
| `production_manager` (bep_truong) | `/inventory/transfers` (receive CW→CK + ship CK→branch), `/inventory/production`, `/inventory/recipes` | `/admin/inventory/*` 403 | `confirm_production_order` | RPC accepts (post P0 cutover); negative `quan_ly_cn` → 42501 |
| `branch_manager` | `/inventory` (Hôm nay), `/inventory/transfers/[id]/receive`, intra-branch "Cấp bếp", `/inventory/stocktake/new` | `/admin/inventory` 403 redirect `/employee?forbidden=1`, inter-site outbound RPC → 42501 | `commit_intra_branch_transfer` | atomic; before/after `stock_levels (warehouse_loc, kitchen_loc)` |
| `cashier` | `/br/[id]/pos` only | `/inventory/*`, `/admin/*` 403 redirect | POS payment confirm | `complete_payment_and_consume_stock` succeeds; if branch missing `default_consumption` → `default_consumption_location_missing` (NOT silent fallback) |
| `chef` | `/br/[id]/kds` only | `/inventory/*` 403 | KDS cancel | `cancel_order_item` (no auto-waste row created — verify 0 `waste_headers` insert) |

**Evidence format per row**: `evidence-log.md` table:
```
| Persona | Device | Route | Status | Screenshot | Before stock_levels | After stock_levels | RPC | Latency ms |
```

---

## §5. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | RPC body cutover P0 break existing super_manager flows | Med | High | Test với super_manager persona TRƯỚC cutover; `has_permission()` đã có owner bypass |
| R2 | Migration P5 fail với pending data | Low | Low | DO block fail rõ ràng, không silent; dev resolve qua hiện tại UI rồi re-run |
| R3 | `database.types.ts` regen sau migration → typecheck cascade | Med | Med | P5 chạy CUỐI cùng; `pnpm db:types` + typecheck trong cùng PR |
| R4 | PWA cache hit V1 page khi user reopen → 404 silent | Med | Low | Serwist precache hash auto-bump qua Next build; `pages` cache là NetworkFirst (timeout 4s) — user online thấy 404 mới ngay. User offline tap link cũ → 404 khi reconnect, fail-soft. Không cần SW version constant. |
| R5 | Branch_manager UX hit 403 không hiểu | Med | Low | i18n message redirect rõ ràng; release notes + training delta doc |
| R6 | Cron unschedule hỏng `mv_inventory_stock_current` (sai job name) | Low | High | Verify `SELECT * FROM cron.job` trước migration; chỉ unschedule 2 job đã list |
| R7 | Rollback cần re-INSERT `role_templates` nhưng snapshot stale | Med | Med | Snapshot taken in same PR; commit cùng migration |
| R8 | `kds-cancel-stage-picker.tsx` xoá → KDS UI vỡ silent | Low | Med | Grep verified 0 caller — nhưng chạy lại grep ngay trước delete |
| R9 | Dev confuse "ẩn UI" vs "delete" | High | Low | Doc này phân biệt rõ; PR review checklist |
| R10 | Owner đổi ý sau merge | Low | Low | §6 rollback đơn giản (git revert + psql) |

---

## §6. Rollback Procedure

**Trigger**: post-merge, owner request revert hoặc critical bug phát hiện.

**Steps** (5-10 phút):

```bash
# 1. Identify merge SHA
git log --oneline --grep="inventory-v2-consolidation" | head -5

# 2. Revert
git revert -m 1 <merge-sha>
git push origin main

# 3. Restore role_templates from snapshot
psql "$DATABASE_URL" -f docs/plan/inventory-v2-consolidation/snapshot-role-templates-pre.sql

# 4. Restore staff_permissions
psql "$DATABASE_URL" -f docs/plan/inventory-v2-consolidation/snapshot-staff-permissions-pre.sql

# 5. Re-grant V1 RPC EXECUTE (signatures must match exactly)
psql "$DATABASE_URL" <<EOF
GRANT EXECUTE ON FUNCTION
  public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT),
  public.unblind_stocktake_session(uuid),
  public.recount_stocktake_round(uuid, integer),
  public.set_branch_express_window(bigint, time, time),
  public.extend_branch_express_window(bigint, integer),
  public.set_category_review_policy(bigint, boolean),
  public.compute_user_trust_score(uuid, bigint),
  public.rotate_branch_override_code(bigint)
TO authenticated;
EOF

# 6. Re-enable feature flags (column = enabled, flag prefix = inv_s*)
psql "$DATABASE_URL" -c "
UPDATE public.branch_feature_flags
SET enabled = TRUE, disabled_at = NULL, updated_at = now()
WHERE flag_key IN (
  'inv_s10_grn_variance', 'inv_s11_waste_tier', 'inv_s11_ext_auto_waste',
  'inv_s13a_stocktake_v2', 'inv_s13b_stocktake_recount', 'inv_s14_auto_approve'
);"

# 7. Re-schedule cron
psql "$DATABASE_URL" -c "
SELECT cron.schedule('refresh_mv_grn_price_baseline', '*/15 * * * *', \$\$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_grn_price_baseline\$\$);
SELECT cron.schedule('refresh_mv_inventory_value_ranking', '0 */1 * * *', \$\$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_value_ranking\$\$);
"

# 8. Verify
pnpm typecheck && pnpm lint && pnpm build
```

**SW note**: KHÔNG có bước "bump SW version". `apps/web/app/sw.ts` không có `SW_VERSION` constant; cache invalidation đến qua Serwist precache hash (Next.js build) + `pages` cache dùng NetworkFirst (4s timeout) → user online sẽ thấy 404 mới ngay; user offline thấy stale page link một lần, click → fail-soft khi reconnect.

**Notes**:
- Schema không bị drop → no data loss
- Tax/audit data nguyên vẹn
- Cố tình không tự động hoá rollback — owner phải approve mới chạy

---

## §7. Definition of Done

CI must enforce — boolean evidence:

| # | Check | Command |
|---|---|---|
| 1 | Build green | `pnpm typecheck && pnpm lint && pnpm build` exit 0 |
| 2 | Copy lint pass | `pnpm lint:copy` exit 0 |
| 3 | Migration list parity dev/prod | `supabase migration list --linked` no orphan |
| 4 | Migration dry-run | `supabase db push --linked --include-all --dry-run` no unexpected changes |
| 5 | Migration lint | `supabase db lint --linked --schema public,auth,storage --level warning --fail-on warning` exit 0 |
| 6 | DB types regen | `pnpm db:types` không diff `database.types.ts` (V1 tables giữ nguyên schema) |
| 7 | Admin V1 routes 404 | `rg -l 'export default' apps/web/app/admin/inventory/{trust,cold-chain,express-windows,feature-flags}/page.tsx \| xargs rg -L "notFound"` returns 0 |
| 8 | Deferred inventory routes 404 | `rg -l 'export default' apps/web/app/inventory/{stocktake/conflicts,waste/auto,waste/approvals,supplier-returns,supplier-credit-notes,supplier-invoices}/page.tsx \| xargs rg -L "notFound"` returns 0 |
| 9 | Orphan report committed | `docs/plan/inventory-v2-consolidation/orphan-report-*.txt` exists; mỗi `ORPHAN:` row có git commit xoá tương ứng |
| 10 | KEEP-bucket files unchanged trong refactor này | `git diff <p4-merge>..HEAD -- apps/web/app/inventory/_components/{hardblock-override-dialog,auto-approve-eval-panel,waste-tier-badge}.tsx apps/web/app/inventory/_lib/feature-flags.ts` empty |
| 11 | Grep `kitchen_use` blacklist | `rg "kitchen_use" apps/ packages/ -t ts -t tsx` returns 0 hits outside historical migrations + retire test |
| 12 | Persona ACL test | `pnpm test:e2e --grep "inventory.persona"` exit 0 (7 personas × positive + negative) |
| 13 | Evidence-log appended | `docs/worklog/inventory/evidence-log.md` has ≥14 rows (7 personas × 2 devices) post-cutover |
| 14 | Regression rule retired | `tasks/regressions.md` has `INVENTORY-V1-RETIRED-2026-05` entry + 10 retire IDs archived/struck-through |
| 15 | ADR committed | `docs/plan/adr/inventory-v2-consolidation.md` exists with status APPROVED |
| 16 | SOP docs updated | `inventory.md`, `inventory-sop.md`, `inventory-rbac-matrix.md`, `inventory-role-handoff.md` mention V2 contract |
| 17 | `inventory-redesign.md` SUPERSEDED header | `head -5 docs/plan/inventory-redesign.md` shows `SUPERSEDED` |

---

## §8. Sign-off Block

| Role | Name | Date | Decision |
|---|---|---|---|
| Owner | _____________ | _____________ | ☐ approve / ☐ reject / ☐ revise |
| Lead Dev | _____________ | _____________ | ☐ approve / ☐ reject / ☐ revise |
| QA Lead | _____________ | _____________ | ☐ approve / ☐ reject / ☐ revise |

**Sign-off conditions**:
- All 9 owner decisions in §2 explicitly accepted hoặc overridden (commented inline)
- 17 DoD items in §7 acknowledged
- Risk register §5 reviewed; mitigations approved
- Rollback procedure §6 acknowledged
- Persona evidence requirement §4 understood

**Post-sign-off cutover sequence**:
1. P0 RPC body cutover merged + verified on dev
2. P0 deployed prod, smoke test 24h
3. P1–P5 merged in single PR (atomic refactor)
4. Persona evidence captured (24h sprint)
5. Pilot evidence-log §5 sign-off → V2 pilot officially ready

---

## §9. References

- `docs/plan/inventory-redesign.md` — V1 spec (will be marked SUPERSEDED for UI scope)
- `docs/worklog/inventory/inventory-pilot-contract-v2.md` — V2 contract source
- `docs/worklog/inventory/evidence-log.md` — pilot evidence log
- `docs/ref/inventory.md` — business rules
- `docs/ref/inventory-sop.md` — SOP
- `docs/ref/inventory-rbac-matrix.md` — permission matrix + 17 legacy RPCs
- `docs/ref/inventory-role-handoff.md` — role handoff
- `tasks/regressions.md` — named regression rules
- `packages/shared/src/auth/permissions.ts` — permission catalog
- `packages/shared/src/auth/module-acl.ts` — route ACL
- `apps/web/app/admin/inventory/page.tsx` — current V1 hub
- `apps/web/app/inventory/_components/inventory-shell.tsx` — sidebar nav (already V2-compatible)
- `apps/web/app/inventory/waste-actions.ts:359-440` — `createWasteFromOrder` (dead wiring confirmed)
- `apps/web/app/employee/profile/page.tsx:36` — `getMyTrustScore` caller (KEEP)

---

**End of contract.** Comments / disagreements → inline PR review.
