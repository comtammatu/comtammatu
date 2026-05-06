# Inventory QA E2E — Unified Test Plan & Pre-Test Findings

> Date: 2026-05-06 | Tenant: 1 (Cơm Tấm Má Tư) | Project: `iexwsuaqqenyjiskawoj` (production blue) | Author: Claude (5-agent synthesis: PM + BA + Architect + Critic + Security)

---

## 0. Executive Summary

5 agents (planner / analyst / architect / critic / security-reviewer) ran in parallel. Their convergent findings:

- The Inventory module's **architectural contract is sound** (3-state transfer machine, branch_kind gates, hard-deny on production for AM/BM, retired `kitchen_use`, period close, 4-point ledger loop).
- However, **6 pre-existing security/correctness defects exist in the live production blue project** (`iexwsuaqqenyjiskawoj`). 2 are CRITICAL severity, 4 HIGH. They must be flagged to the owner before pilot — they are not introduced by this QA exercise but they affect what we can certify.
- A test plan of **66 named test cases** spans 7 flows × 10 roles × happy/negative outcomes.
- Recommended environment: **isolated `tenant_id = 99 'qa-pilot'`** seeded on production blue. Avoids the empty green project (v2 not started) and avoids local stack parity gaps. Cleanup is a single `DELETE WHERE tenant_id=99`.

---

## 1. Environment baseline (probed live)

| Fact | Value |
| --- | --- |
| Project | `iexwsuaqqenyjiskawoj.supabase.co` (production blue) |
| Tenant | 1 (`Cơm Tấm Má Tư`); tenant_id=99 is FREE for QA seed |
| Branches | 4 — id=1 CW (Kho Tổng Đất Đỏ), id=4 CK (Bếp trung tâm), id=2/3 store branches (Đất Đỏ, Phước Hải) |
| Existing profiles | 23 across 10 legacy roles (every role has ≥ 1 user) |
| Permission keys | 87 |
| Role templates | 15 |
| Staff_permissions grants | 583 |
| Accounting periods | May 2026 = open, Apr/Mar 2026 = soft_closed |
| Stock state | CW (1) has 55 stock rows + 1 transfer; branch 3 has 1 row + 1 transfer; CK (4) has 0 rows |
| matu-moi (v2) workspace | EMPTY — no v2 implementation; QA target must be blue |

## 2. Role landscape (10 legacy roles, 15 HR positions)

| Position code | Label VI | Legacy role |
| --- | --- | --- |
| owner | Chủ sở hữu | owner |
| super_manager | Giám đốc điều hành | super_manager |
| tro_ly_giam_doc | Trợ lý Giám đốc | super_manager |
| quan_ly_vung | Quản lý khu vực | area_manager |
| quan_ly_CN | Quản lý chi nhánh | branch_manager |
| kho_truong | Kho trưởng | warehouse_manager |
| thu_kho | Thủ kho | warehouse_manager |
| bep_truong | Bếp trưởng | production_manager |
| cashier | Thu ngân | cashier |
| waiter | Phục vụ | waiter |
| chef | Bếp | chef |
| phu_bep | Phụ bếp | chef |
| ke_toan / ke_toan_truong / office | Kế toán / Hành chính | office |

---

## 3. CRITICAL pre-test findings (must brief owner)

> These exist in production blue *before* this QA exercise. They affect risk profile, not test scope. Documented for the owner gate.

### S-CRIT-1 — JWT decoded without signature verification in proxy
- File: `packages/shared/src/auth/scope.ts:50-83` (`decodeJwtAppMetadata`); `apps/web/proxy.ts:90,125`; `apps/web/app/_lib/auth.ts:28,151`
- Behavior: `extractClaimsFromAccessToken` base64-decodes part 1 of JWT; signature never validated. Trust holds today only because Supabase HttpOnly cookies are the sole source.
- Risk: any future endpoint that reads `Authorization: Bearer <token>` and passes it through this decoder accepts a forged token. `/api/branch-presence` already exempt and processes Bearer tokens (proxy.ts:72-74).
- Fix: verify against Supabase JWKS via `jose.jwtVerify` inside `extractClaimsFromAccessToken`.

### S-CRIT-2 — Owner bypass in `has_permission` is NOT tenant-scoped
- File: `supabase/migrations/20260423040000_auth_v2_m5_hotfix_has_permission.sql:9-48`
- Behavior: owner-bypass clause checks only `positions.code = 'owner'` and never filters by `pr.tenant_id = auth_tenant_id()`. RLS gate at the row level still applies via the AND-shaped policy, BUT SECURITY DEFINER RPCs that call only `has_permission` bypass row-level tenant check.
- Risk: silent cross-tenant exposure if any owner profile exists in >1 tenant. v2 multi-tenant rollout makes this a P0 blocker.
- Fix: add `AND pr.tenant_id = auth_tenant_id()` to the owner-bypass `EXISTS`.

### S-HIGH-3 — `has_permission_any` allows cross-branch read/write on tenant-scoped tables
- Files: `20260422160000_…_representative.sql:57-87` (ingredients), `20260422210000_…_inventory_production_procurement.sql:38-145` (recipes/production_recipes/PO items/supplier_invoices), `20260422170001_…_m4b_rls_cutover.sql:478-621` (suppliers, purchase_orders, GRN).
- Behavior: a user holding `procurement:read` on Branch A can SELECT/INSERT/UPDATE/DELETE rows belonging to Branch B via direct PostgREST. Server actions narrow this; PostgREST does not.
- Repro: warehouse_manager(branch=A) → `GET /rest/v1/goods_received_notes?branch_id=eq.B` returns Branch B rows.
- Fix: change RLS to `has_permission(branch_id, key)` matching m4b's branch-scoped pattern.

### S-HIGH-4 — `stock_transfers` RLS allows escalation via `to_branch` trick
- File: `20260422170001_…_m4b_rls_cutover.sql:243-326`
- Behavior: INSERT WITH CHECK requires `inventory:transfer_create` on EITHER `from_branch_id` OR `to_branch_id`. A branch-A warehouse_manager can insert a draft with `from_branch_id = OTHER` to forge a transfer outward from another branch.
- Fix: require perm on the correct side per direction (create on from; receive on to).

### S-HIGH-5 — Multiple SECURITY DEFINER transfer RPCs lack `has_permission` re-check
- Files: `20260417010000_…_atomic_and_perf.sql:76-170` (`create_stock_transfer_draft`); `20260427103652_inventory_pilot_contract_v2.sql:440-678` (`stock_transfer_confirm_ship`, `_mark_in_transit`, `_confirm_receive`); `20260425000000_stock_levels_per_location.sql:448,595` (latest receive/ship).
- Behavior: gates only via legacy `auth_role()` whitelist. Revoking `inventory:transfer_ship` from a `branch_manager` via `staff_permissions` does NOT block them at the RPC layer — direct PostgREST `rpc()` succeeds.
- Fix: add `IF NOT public.has_permission(v_from_branch, 'inventory:transfer_ship') THEN RAISE … 42501` to every SECURITY DEFINER ship/receive RPC.

### S-MED-6 — `confirm_production_order` / `cancel_production_order` skip `is_inventory_production_operator()` re-check
- Behavior: production hard-deny is enforced at action layer + RLS but NOT at every SECURITY DEFINER RPC body. A user with manual `inventory:production_confirm` grant who is `area_manager` (no operator helper) can confirm via direct `supabase.rpc('confirm_production_order', …)`.
- Fix: re-check `is_inventory_production_operator()` in each production RPC.

### Additional architect-found correctness defects (HIGH/MED):

- **A-HIGH-1 WAC race**: `confirm_goods_receipt_note`, `stock_transfer_confirm_ship`, `confirm_production_order` read `stock_levels` then write WAC without `FOR UPDATE`. Concurrent confirms produce non-deterministic average cost.
- **A-HIGH-2 amend_grn_line back-prop**: owner-only RPC mutates a confirmed GRN's price; downstream movements are NOT recomputed. Single careless amend permanently desyncs WAC vs. movement ledger.
- **A-MED-7 `fetchStockIssues` silent scope widening**: `issue-actions.ts:74-86` — when `claims.branch_id == null` (admin) the query has NO branch filter and returns tenant-wide; no `has_permission` call. Stale admin sees old branch's issues.
- **A-MED-8 idempotency gaps**: `createStockTransfer`, `create_waste_entry` lack `client_op_id` deduping. Double-clicks produce duplicate drafts / waste entries.
- **A-MED-9 stock_levels not period-frozen**: closed-period valuation snapshots can mutate if any later GRN updates WAC.

---

## 4. ACL truth table (Critic synthesis)

> O=owner SM=super_mgr AM=area_mgr BM=branch_mgr WM=warehouse_mgr PM=production_mgr CA=cashier WA=waiter CH=chef OF=office

| Path | O | SM | AM | BM | WM | PM | CA | WA | CH | OF |
|---|---|---|---|---|---|---|---|---|---|---|
| `/inventory` | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 |
| `/inventory/grn` `/purchase-orders` `/suppliers` `/supplier-invoices` `/recipes` `/production` | 200 | 200 | 403 | 403 | 200 | 200 | 403 | 403 | 403 | 403 |
| `/inventory/stock` `/dashboard` `/stocktake` `/expiry` `/issues` `/reports` `/settings` `/m/*` | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 |
| `/inventory/supplier-returns` | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 |
| `/inventory/supplier-credit-notes` | 200 | 200 | 200 | 403 | 200 | 403 | 403 | 403 | 403 | 200 |
| `/admin/inventory/{cold-chain,express-windows,feature-flags,trust}` | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR |
| `/admin/dashboard` `/admin/staff` `/admin/accounting` | 200 | 200 | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR | REDIR |
| `/br/{ownBranch}/pos` (network gate may interpose) | BR-MIS | BR-MIS | BR-MIS | 200 | BR-MIS | BR-MIS | 200 | 200 | 403 | 403 |
| `/br/{cw_id}/pos` `/br/{ck_id}/pos` | CW-RES | CW-RES | CW-RES | CW-RES | CW-RES | CW-RES | CW-RES | CW-RES | CW-RES | CW-RES |

**Drift to verify** (regression R-INV-001): `apps/web/app/admin/inventory/{cold-chain,express-windows,feature-flags,trust}/page.tsx` exist on disk; `inventory_admin.allowedRoles=[]`. Verify `resolveModuleFromPath` maps every path under `/admin/inventory/*` to `inventory_admin` (so the empty allowedRoles produces a redirect, not a leak).

---

## 5. PERMISSION × ROLE matrix (must-test)

| Permission | O | SM | AM | BM | WM | PM | other |
|---|---|---|---|---|---|---|---|
| inventory:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| inventory:write | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| inventory:transfer_create | ✅ | ✅ | ❌ | ✅* | ✅ | ✅ | ❌ |
| inventory:transfer_ship | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| inventory:transfer_receive | ✅ | ✅ | ❌ | ✅* | ✅ | ✅ | ❌ |
| inventory:stocktake_* (create/complete/recount) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| inventory:stocktake_unblind | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory:writeoff | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| inventory:waste_approve | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| inventory:waste_bypass_photo | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory:adjust_approve | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| inventory:grn_express_configure | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory:grn_express_extend | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| inventory:grn_hardblock_override | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| inventory:production_create | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| inventory:production_confirm | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| procurement:read | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| procurement:supplier_manage | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| procurement:po_create | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| procurement:po_approve | ✅ | ✅ | ❌ | ❌ | ❌(held) | ❌ | ❌ |
| procurement:grn_create | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| procurement:grn_confirm | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| procurement:grn_amend | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| procurement:invoice_create / match | ✅ | ✅ | ❌ | ❌ | ❌(held) | ❌ | ❌ |
| supplier_return:create | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| supplier_return:confirm | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| accounting:period_reopen | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

`*` template-granted but runtime-restricted (BM intra-only, WM/PM scoped to own branch).

---

## 6. Test cases (66 total)

### Route ACL (10 cases) — TC-INV-A01..A10
A01..A10 = 10 roles × 1 representative path each, asserting expected status from §4.

### GRN (8) — TC-INV-G01..G08
G01 happy CW; G02 ±5% tolerance; G03 hardblock variance + override (negative for WM); G04 express window (PM at CK); G05 closed-period reject; G06 BM no-perm route ACL; G07 wrong branch_kind; G08 double-confirm idempotency.

### Transfer (12) — TC-INV-T01..T12
T01 CW→CK happy; T02 CW→branch happy; T03 CK→branch happy; T04 branch→CW INVALID; T05 branch→branch INVALID; T06 intra-branch Cấp bếp happy; T07 BM inter-site DENY (`BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR`); T08 BM ship inter-site DENY; T09 WM wrong branch; T10 partial receive; T11 ship without stock; T12 double-ship race.

### Production (6) — TC-INV-P01..P06
P01 happy CK; P02 AM hard-deny (action + RPC + RLS triple); P03 BM hard-deny; P04 missing BOM; P05 insufficient ingredients; P06 cancel after confirm.

### Stocktake (6) — TC-INV-S01..S06
S01 blind happy; S02 R4 escalation note ≥ 20ch; S03 period-close mid-session; S04 race two opens; S05 finalize without count; S06 unblind without permission.

### Waste/Writeoff (4) — TC-INV-W01..W04
W01 tier-0 happy; W02 WM (kho_truong) NO writeoff; W03 tier-1 photo bypass + bypass_photo grant; W04 closed period.

### Supplier Return (4) — TC-INV-R01..R04
R01 QC at receiving; R02 post-receipt return at branch; R03 cross-branch DENY; R04 BM confirm denied.

### POS Consumption (3) — TC-INV-PO1..PO3
PO1 consumes branch stock at default_consumption only; PO2 network gate (production env); PO3 CK/CW branch_kind denied for POS/KDS.

### Negative / Security (8) — TC-INV-X01..X08
X01 cross-tenant SELECT (RLS); X02 JWT swap; X03 app_metadata vs JWT mismatch; X04 manual perm grant on `inventory:production_create` to BM (must remain inert); X05 `stock_issue(kitchen_use)` rejection; X06 POS direct PostgREST when network-gated; X07 held perms (kho_truong cannot approve PO); X08 transfer scope role-vs-perm (WM at CW1 with manual grant on CW2).

### Pre-test security findings to repro (5) — TC-INV-Z01..Z05
Z01 forge JWT to S-CRIT-1; Z02 cross-tenant owner bypass S-CRIT-2; Z03 has_permission_any cross-branch leak via PostgREST GET; Z04 stock_transfers escalation via to_branch insert; Z05 SECURITY DEFINER `stock_transfer_confirm_ship` direct rpc() bypassing revoked perm.

---

## 7. R-INV regression rules (install in tasks/regressions.md)

- **R-INV-001** `/admin/inventory/*` retired subroute leak — verify resolveModuleFromPath
- **R-INV-002** `stock_issue(kitchen_use)` re-introduction
- **R-INV-003** branch_manager inter-site ship even with grant
- **R-INV-004** AM/BM production grant must be inert (triple gate)
- **R-INV-005** POS network gate auto-bypass in non-prod
- **R-INV-006** kho_truong template re-grants po_approve / invoice_*
- **R-INV-007** branch_kind validation in createGrnDraft
- **R-INV-008** RLS-blocked write returning `{data:null,error:null}`
- **R-INV-009** stocktake unblind leak via `system_quantity`
- **R-INV-010** UNIQUE missing `tenant_id` on multi-tenant inventory tables

---

## 8. Test environment & account scaffolding plan

### Strategy: tenant_id=99 'qa-pilot' on production blue, single namespace cleanup.

### Branches to seed (4):
- (99,1) `qa-cw` branch_kind=central_warehouse
- (99,2) `qa-ck` branch_kind=central_kitchen
- (99,3) `qa-branch-A` branch_kind=branch
- (99,4) `qa-branch-B` branch_kind=branch

### Test users to seed (12):
| handle | role | position | branch | branch_kind | purpose |
|---|---|---|---|---|---|
| qa+owner@matu.test | owner | owner | NULL | — | tenant-wide bypass |
| qa+sm@matu.test | super_manager | super_manager | NULL | — | procurement + production senior |
| qa+am@matu.test | area_manager | quan_ly_vung | NULL | — | oversight + AM hard-deny |
| qa+bma@matu.test | branch_manager | quan_ly_CN | qa-branch-A | branch | intra-branch + receive |
| qa+bmb@matu.test | branch_manager | quan_ly_CN | qa-branch-B | branch | cross-branch isolation control |
| qa+kho@matu.test | warehouse_manager | kho_truong | qa-cw | central_warehouse | CW lead, held po_approve |
| qa+thukho@matu.test | warehouse_manager | thu_kho | qa-cw | central_warehouse | warehouse staff (no writeoff) |
| qa+bep@matu.test | production_manager | bep_truong | qa-ck | central_kitchen | CK lead |
| qa+ca@matu.test | cashier | cashier | qa-branch-A | branch | POS consume |
| qa+wa@matu.test | waiter | waiter | qa-branch-A | branch | waiter scope |
| qa+chef@matu.test | chef | chef | qa-branch-A | branch | KDS scope |
| qa+office@matu.test | office | ke_toan | NULL | — | accounting |

Password: shared `Qa-Inv-2026!` (test-only; not a real account; rotated/discarded post-run).

### Catalog seed (minimal):
- 5 ingredients (NL01..NL05) + 2 finished goods (FG01..FG02)
- 2 recipes (POS) + 2 production_recipes (BOM at CK)
- 2 suppliers + 1 PO at CW
- locations: per branch, default_warehouse + default_consumption (where applicable)

### Cleanup contract:
- All seed rows tagged `tenant_id=99`. Single transaction:
  ```sql
  DELETE FROM auth.users WHERE email LIKE 'qa+%@matu.test';
  DELETE FROM tenants WHERE id = 99 CASCADE; -- relies on FK ON DELETE CASCADE
  ```
- If CASCADE not configured for some children, explicit per-table delete (script attached to run output).

---

## 9. Decision points needing owner approval

1. **Approve test-tenant strategy** on production blue (tenant_id=99) per §8?
2. **Acknowledge S-CRIT-1, S-CRIT-2, S-HIGH-3..5, S-MED-6** as pre-existing — do you want them
   - (a) **fixed first**, then re-run QA on the patched state, or
   - (b) **baseline-tested as-is now** to confirm + log them to a fix backlog, then re-run QA after fixes?
3. **Production scope confirmation**: any pilot CK operator role assignment (super_manager vs production_manager per BA finding §5.2)?
4. **AP / supplier-invoice flow**: in pilot scope or deferred to Phase 2 finance work?
