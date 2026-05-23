# Inventory QA E2E — Final Report

> Archived 2026-05-23 from top-level `tasks/`. Historical QA worklog; active tracker remains `tasks/todo.md`.
> **Date:** 2026-05-06 | **Project:** `iexwsuaqqenyjiskawoj` (production blue) | **Test tenant:** `tenant_id=99 'qa-pilot'`
> **Authors:** Claude (5-agent synthesis: planner + analyst + architect + critic + security-reviewer) → SQL execution
> **Test plan ref:** [inventory-qa-e2e-2026-05-06.md](inventory-qa-e2e-2026-05-06.md)

---

## 0. Executive Summary

**27 named test cases executed across 9 categories on a sandboxed `tenant_id=99` namespace built on production blue.**

| Outcome | Count | %  |
| --- | --- | --- |
| ✅ PASS | 20 | 74% |
| 🔴 BUG_CONFIRMED | 4 | 15% |
| 🟡 CODE_REVIEW_CONFIRMED | 2 | 7% |
| 🟠 BLOCKED_BY_DRIFT | 1 | 4% |

### Headline findings

1. **2 CRITICAL pre-existing security defects** in production blue (cannot be fixed by retest of QA seed alone — require migration patches):
   - **Z01-CRIT-1**: JWT signature not verified anywhere (`extractClaimsFromAccessToken` base64-decodes only). Code-review confirmed; not actively exploitable from current Supabase HttpOnly cookie path, but any future Bearer-token endpoint accepting this decoder is forge-vulnerable.
   - **Z01-CRIT-2**: Owner bypass in `has_permission()` is NOT tenant-scoped. Owner of tenant A authorizes against branches of tenant B. Active SQL repro succeeded.

2. **2 HIGH RLS leaks** confirmed by direct active repro:
   - **Z02-HIGH-3**: `has_permission_any` cross-branch read leak on `goods_received_notes` (and likely sister tables). kho_truong (branch=CW) read another branch's GRN via PostgREST.
   - **Z03-HIGH-4**: `stock_transfers` RLS uses `(perm on from OR perm on to)`. branch_manager can INSERT a forged draft listing CW as `from_branch_id` despite zero authority on CW.

3. **1 HIGH template drift** (T-DRIFT-001):
   - RBAC matrix doc (`docs/ref/inventory-rbac-matrix.md` §4) lists `inventory:writeoff` ✅ for branch_manager + area_manager, but the live `role_templates` rows on tenant 1 (and copied to test tenant 99) **do not** grant either of them. Branch managers cannot create waste entries despite SOP listing them as the operator. **Either fix the doc or fix the template seed.**

4. **2 architect findings INVALIDATED** by current code state:
   - **S-HIGH-5** (transfer SECURITY DEFINER RPCs lacking `has_permission` re-check): Active repro showed `stock_transfer_confirm_ship` properly raises `42501 forbidden_transfer_ship` when `inventory:transfer_ship` revoked. All 9 critical RPCs now call `has_permission`. Architect was reading older migrations.
   - **S-MED-6** (production RPCs lacking `is_inventory_production_operator()` re-check): Active repro showed `confirm_production_order` properly raises `42501 forbidden` for area_manager with manual `inventory:production_confirm` grant.

5. **All "happy path" inventory flows tested PASSED**:
   - 4-point loop CW→CK transfer (T01): full lifecycle draft→received, 8 movements, 1 journal entry posted (TRANSFER_INVENTORY)
   - Intra-branch Cấp bếp (T06): atomic warehouse→kitchen one-step
   - Production at CK (P01): atomic raw consume + finished-good output, WAC carry, journal entry
   - GRN draft creation at CW (G01)
   - Stocktake session start (S01)

6. **All "negative-by-design" rejections fired correctly** (12 of 12):
   - branch→CW invalid direction (T04)
   - branch→branch invalid direction (T05)
   - BM creates inter-site (T07): rejected `branch_manager_inter_site_create_forbidden`
   - BM ships inter-site (T08): rejected `forbidden_transfer_ship`
   - Insufficient stock on ship (T11)
   - Production hard-deny for area_manager (P02) and branch_manager (P03)
   - kitchen_use issue_type rejection (X05): CHECK constraint
   - Cross-tenant SELECT (X01): RLS denies
   - Manual production grant inert via operator helper (X04, Z05)
   - Held perms for kho_truong (X07): po_approve, invoice_create, invoice_match all FALSE in template
   - BM lacks procurement:read → cannot SEE GRN (G06)

---

## 1. Test environment

| Item | Value |
| --- | --- |
| Supabase project | `iexwsuaqqenyjiskawoj.supabase.co` (production blue) |
| Test tenant | `tenant_id=99 'qa-pilot'` (slug `qa-pilot-inv`) |
| Branches seeded | 4 — `qa-cw` (id=11, CW), `qa-ck` (id=12, CK), `qa-branch-A` (id=13), `qa-branch-B` (id=14) |
| Locations | 6 — CW main_warehouse (63), CK main_storage (64), branch A main_warehouse(56)+kitchen(57), branch B main_warehouse(58)+kitchen(59) |
| Users | 12 (qa+owner / qa+sm / qa+am / qa+bma / qa+bmb / qa+kho / qa+thukho / qa+bep / qa+ca / qa+wa / qa+chef / qa+office) — pwd `Qa-Inv-2026!` |
| Catalog | 5 raw + 2 finished_good ingredients, 5 production_recipe lines, 2 suppliers |
| Initial stock | CW: 100 each NL01..NL05; branch A: 10 NL01 + 5 NL02 |
| GL setup | 34 chart_of_accounts + 20 posting_rules copied from tenant 1 |
| Accounting period | 2026-05 (open) |
| Impersonation helper | `public.qa_set_user(p_email text)` SECURITY DEFINER — sets `request.jwt.claims` from email |

---

## 2. BUGS — detailed (must brief owner)

### 🔴 Z01 — CRITICAL — Owner bypass not tenant-scoped (S-CRIT-2)

**Where:** `supabase/migrations/20260423040000_auth_v2_m5_hotfix_has_permission.sql:9-48`

**Repro:**
```sql
-- Impersonate qa+owner (tenant=99)
SELECT public.qa_set_user('qa+owner@matu.test');
SET LOCAL ROLE authenticated;
-- Branch 1 belongs to tenant 1
SELECT public.has_permission(1::bigint, 'inventory:read');     -- returns TRUE (BUG)
SELECT public.has_permission(99999::bigint, 'inventory:read'); -- returns TRUE for nonexistent branch (BUG)
```

**Impact:** Whenever a SECURITY DEFINER RPC trusts `has_permission` alone (without explicit `tenant_id` filter), an owner profile in any tenant can authorize across tenants. Today, the AND-shaped row-level RLS layer (`tenant_id = auth_tenant_id() AND has_permission(...)`) still catches it at the row layer — but RPC bodies bypass that. A future RPC that reads/writes via the elevated SECURITY DEFINER context risks tenant escape.

**Fix:** Add `AND pr.tenant_id = (SELECT (auth.jwt()->'app_metadata'->>'tenant_id')::BIGINT)` to the owner-bypass `EXISTS` clause inside `has_permission()` and `has_permission_any()`.

### 🔴 Z01-jwt-sig — CRITICAL — JWT signature not verified (S-CRIT-1)

**Where:** `packages/shared/src/auth/scope.ts:50-83` (`decodeJwtAppMetadata`); reached via `apps/web/proxy.ts:90,125` and `apps/web/app/_lib/auth.ts:28,151`

**Repro (code review only, MCP cannot forge HTTP cookies):**
```ts
// extractClaimsFromAccessToken does base64 decode of part [1] of JWT — no signature verify
// Today only Supabase HttpOnly cookies feed the decoder, so not actively exploitable.
// Tomorrow if any endpoint reads `Authorization: Bearer <token>` and passes it through this decoder,
// an attacker can forge tokens with any tenant_id / role.
```

**Impact:** Latent. The cookie-set-by-Supabase invariant currently holds, but `/api/branch-presence` already accepts Bearer tokens (proxy.ts:72-74) and the codebase's surface is growing. Any future Bearer-accepting endpoint that calls the same decoder accepts forged tokens.

**Fix:** Replace base64-decode in `extractClaimsFromAccessToken` with `jose.jwtVerify` against Supabase JWKS, OR force every callsite to use `supabase.auth.getUser(token)` which performs the verification server-side.

### 🔴 Z02 — HIGH — Cross-branch read leak via has_permission_any (S-HIGH-3)

**Where:** `supabase/migrations/20260422170001_auth_v2_m4b_rls_cutover.sql:478-621` (RLS for goods_received_notes / supplier_invoices / suppliers / purchase_orders / grn_items / purchase_order_items); same pattern in `20260422160000_..._representative.sql:57-87` for `ingredients` and `20260422210000_..._inventory_production_procurement.sql:38-145` for `recipes`/`production_recipes`.

**Repro:**
```sql
-- service_role: insert a GRN at branch 12 (CK)
INSERT INTO goods_received_notes (tenant_id, branch_id, supplier_id, grn_number, status, received_date, created_by)
VALUES (99, 12, <supplier>, 'QA-GRN-Z02-CK', 'draft', CURRENT_DATE, <kho_uuid>);

-- impersonate kho_truong (branch=11) — has procurement:read on branch 11 ONLY
SELECT public.qa_set_user('qa+kho@matu.test');
SET LOCAL ROLE authenticated;
SELECT count(*) FROM goods_received_notes WHERE tenant_id=99 AND branch_id=12;
-- returns 1 (LEAK) — RLS allowed because has_permission_any returns TRUE
SELECT public.has_permission(12::bigint, 'procurement:read'); -- returns FALSE (proper)
SELECT public.has_permission_any('procurement:read');         -- returns TRUE (the leak vector)
```

**Impact:** Any user holding `procurement:read` on **any** branch reads tenant-wide procurement data. In multi-branch operations, branches' supplier prices / invoices / PO data leak across branches even where the user has no explicit grant.

**Fix:** Change `(... AND has_permission_any(key))` to `(... AND has_permission(branch_id, key))` on tenant-scoped procurement tables, mirroring the m4b branch-scoped pattern.

### 🔴 Z03 — HIGH — `stock_transfers` either-side INSERT escalation (S-HIGH-4)

**Where:** RLS policy `stock_transfers_insert` WITH CHECK uses `has_permission(from_branch_id, key) OR has_permission(to_branch_id, key)`.

**Repro:**
```sql
-- branch_manager A (branch=13). Has transfer_create only on branch 13.
SELECT public.qa_set_user('qa+bma@matu.test');
SET LOCAL ROLE authenticated;
-- Forge a draft with from=11 (CW, no perm there), to=13 (own)
INSERT INTO stock_transfers (tenant_id, from_branch_id, to_branch_id, transfer_number, status, created_by, from_location_id, to_location_id)
VALUES (99, 11, 13, 'QA-Z03-FORGED', 'draft', auth.uid(), 63, 56);
-- INSERT succeeds (RLS allowed via to_branch=13 perm)
```

**Impact:** A branch_manager can forge a transfer record showing CW → own branch as if CW was about to ship. They cannot ship it (action+RPC subsequent gates block) but: (a) they pollute the transfer ledger, (b) the row is visible across the OR-shaped SELECT policy, (c) accidental UI confusion at CW operators.

**Fix:** Split RLS by direction:
- INSERT WITH CHECK should require `has_permission(from_branch_id, transfer_create)` only (the creator must be authorized on the source).
- Same for SELECT (current OR pattern means BMs see other branches' transfers if their own branch is on either leg).
- UPDATE: `has_permission(from_branch_id, transfer_create) OR has_permission(to_branch_id, transfer_receive)` to allow shipper or receiver edits, not generic OR.

### 🔴 T-DRIFT-001 — HIGH — RBAC matrix doc vs role_template seed drift

**Where:** `docs/ref/inventory-rbac-matrix.md` §4 vs `role_templates` rows on tenant 1 (copied to tenant 99 for test).

**Active repro:**
```sql
-- Per the matrix, branch_manager and area_manager should have inventory:writeoff
-- Live data:
SELECT u.email, pos.code,
  EXISTS(SELECT 1 FROM staff_permissions sp 
         WHERE sp.user_id=u.id AND sp.permission_key='inventory:writeoff') AS has_writeoff
FROM auth.users u JOIN profiles p ON p.id=u.id JOIN positions pos ON pos.id=p.position_id
WHERE p.tenant_id=99 AND pos.code IN ('quan_ly_CN','quan_ly_vung','kho_truong','thu_kho')
ORDER BY pos.code;

--   quan_ly_CN  : FALSE  (matrix says ✅)
--   quan_ly_vung: FALSE  (matrix says ✅)
--   kho_truong  : TRUE   (matches matrix)
--   thu_kho     : FALSE  (matches matrix)
```

**Impact:** Pilot operators (branch_manager, area_manager) cannot create waste entries despite SOP §4 listing them as the responsible operator. Either:
- (a) Doc is wrong → update `inventory-rbac-matrix.md` to remove ✅ from BM/AM
- (b) Template is wrong → run a migration to grant `inventory:writeoff` to `quan_ly_CN` and `quan_ly_vung` templates

Per BA finding 5.2, the matrix is supposed to be source of truth → option (b) is correct unless owner explicitly intends BM/AM to escalate to kho/SM for waste.

---

## 3. Test results — full table

### Z-block — pre-existing security findings repro

| Test | Severity | Status | Outcome |
| --- | --- | --- | --- |
| Z01 | CRITICAL | 🔴 BUG_CONFIRMED | Owner bypass returns TRUE for cross-tenant + nonexistent branches |
| Z01-jwt-sig | CRITICAL | 🟡 CODE_REVIEW | JWT signature not verified in proxy decoder |
| Z02 | HIGH | 🔴 BUG_CONFIRMED | Cross-branch GRN read leak via `has_permission_any` |
| Z03 | HIGH | 🔴 BUG_CONFIRMED | `stock_transfers` either-side INSERT escalation |
| Z04 | N/A | ✅ PASS | `stock_transfer_confirm_ship` properly raises 42501 when perm revoked |
| Z05 | N/A | ✅ PASS | `confirm_production_order` properly rejects AM via operator helper |

### A-block — route ACL truth table

| Test | Status | Outcome |
| --- | --- | --- |
| A-route-acl | ✅ PASS | inventory: 6 roles allowed; inventory_procurement: 4 roles + has_permission_any gate; inventory_admin: 0 (retired) |

### T-block — transfer flows

| Test | Status | Outcome |
| --- | --- | --- |
| T01 (CW→CK happy) | ✅ PASS | Full lifecycle draft→received; CW NL02 100→90; CK NL02 0→10; 8 movements; 1 journal |
| T04 (branch→CW INVALID) | ✅ PASS | `23514: invalid direction branch -> central_warehouse` |
| T05 (branch→branch INVALID) | ✅ PASS | `23514: invalid direction branch -> branch` |
| T06 (intra-branch Cấp bếp happy) | ✅ PASS | Single-step atomic warehouse→kitchen, status=received |
| T07 (BM inter-site create DENY) | ✅ PASS | `42501/branch_manager_inter_site_create_forbidden` |
| T08 (BM inter-site ship DENY) | ✅ PASS | `42501/forbidden_transfer_ship` |
| T11 (insufficient stock) | ✅ PASS | `P0001/insufficient_stock:283` |

### P-block — production

| Test | Status | Outcome |
| --- | --- | --- |
| P01 (bep_truong production happy) | ✅ PASS | Atomic raw consume + finished output; FG02 1lit produced (cost 93,200₫) |
| P02 (AM hard-deny) | ✅ PASS | `42501/forbidden` via `is_inventory_production_operator()` |
| P03 (BM hard-deny) | ✅ PASS | `42501/forbidden` via `is_inventory_production_operator()` |

### S-block — stocktake

| Test | Status | Outcome |
| --- | --- | --- |
| S01 (BM start blind stocktake) | ✅ PASS | Session created |

### G-block — GRN

| Test | Status | Outcome |
| --- | --- | --- |
| G01 (kho creates GRN at CW) | ✅ PASS | Draft INSERT succeeds |
| G06 (BM no procurement:read → cannot read GRN) | ✅ PASS | RLS denies — visible_count=0 |

### W-block — waste/writeoff

| Test | Status | Outcome |
| --- | --- | --- |
| W01 (BM tier-0 waste happy) | 🟠 BLOCKED_BY_DRIFT | BM lacks `inventory:writeoff` per template — see T-DRIFT-001 |
| W02 (kho_truong has writeoff per template) | ✅ PASS | has_writeoff=TRUE matches matrix |

### X-block — negative/security

| Test | Status | Outcome |
| --- | --- | --- |
| X01 (cross-tenant SELECT) | ✅ PASS | tenant 99 user reads tenant 1 ingredients = 0 |
| X02 (JWT swap) | 🟡 CODE_REVIEW | Same as Z01-jwt-sig |
| X04 (manual production grant inert) | ✅ PASS | Same as Z05 — operator helper rejects |
| X05 (kitchen_use retired) | ✅ PASS | `23514` CHECK constraint `stock_issues_issue_type_check` rejects |
| X07 (held perms for kho_truong) | ✅ PASS | po_approve / invoice_create / invoice_match all FALSE in grant |

### RBAC drift

| Test | Status | Outcome |
| --- | --- | --- |
| T-DRIFT-001 | 🔴 BUG_CONFIRMED | BM/AM template missing `inventory:writeoff` despite matrix showing ✅ |

---

## 4. R-INV regressions to install in `tasks/regressions.md`

These rules should be added — they capture the actual findings observed:

- **R-INV-CRIT-001** `[has_permission owner bypass]`: Always tenant-filter the owner-bypass clause in `has_permission` / `has_permission_any`. Without `pr.tenant_id = auth_tenant_id()`, an owner profile becomes a cross-tenant authorization key. Caught: Z01 active repro 2026-05-06.
- **R-INV-CRIT-002** `[JWT decode without verify]`: Never read JWT claims by base64 decoding — use `jose.jwtVerify` with Supabase JWKS, or pass through `supabase.auth.getUser()`. The base64-only path in `decodeJwtAppMetadata` is acceptable ONLY for HttpOnly cookies set by Supabase. Any new endpoint reading Bearer tokens MUST verify. Caught: code review 2026-05-06.
- **R-INV-HIGH-003** `[has_permission_any cross-branch leak]`: For tenant-scoped procurement tables (`goods_received_notes`, `purchase_orders`, `purchase_order_items`, `supplier_invoices`, `suppliers`, `grn_items`, `ingredients`, `recipes`, `production_recipes`), RLS must use `has_permission(branch_id, key)` not `has_permission_any(key)`. Caught: Z02 active repro 2026-05-06.
- **R-INV-HIGH-004** `[stock_transfers either-side escalation]`: `stock_transfers_insert` WITH CHECK must require `has_permission(from_branch_id, transfer_create)` strictly (not OR with to_branch). UPDATE policy may use `OR` only when split by direction (ship vs receive). Caught: Z03 active repro 2026-05-06.
- **R-INV-HIGH-005** `[RBAC matrix vs template seed drift]`: Every change to `docs/ref/inventory-rbac-matrix.md` must include a sister migration regenerating `role_templates.permission_keys` for the affected position. CI gate: a query that diffs matrix expectations against live `role_templates` and fails on any drift. Caught: T-DRIFT-001 2026-05-06.

---

## 5. What the agents got right and wrong

### Got right
- **PM**: scope, acceptance criteria, environment recommendation (tenant_id=99 was the right call); pilot blocker call-outs all relevant.
- **BA**: 15 invariants list — every flow tested respected I1, I2, I3, I4, I5, I12, I14. Doc ambiguities #2 and #6 surfaced as findings.
- **QA Critic**: Predicted `/admin/inventory/*` retired-route drift (file-on-disk while ACL=[]); confirmed via inventory of files. Predicted exact rejection messages (`branch_manager_inter_site_create_forbidden`, `branch_manager_inter_site_ship_forbidden`) which fired in T07/T08.
- **Security**: Top 3 findings (Z01, Z01-jwt-sig, Z02, Z03) were live bugs. Owner bypass + JWT verify + has_permission_any leak + stock_transfers either-side — all confirmed.

### Got wrong
- **Architect's S-HIGH-5** (transfer SECURITY DEFINER RPCs lacking has_permission re-check): INVALIDATED — current production migrations have hardened ALL 9 transfer/production/GRN RPCs with `has_permission` calls. Architect was reading older migration files (e.g., `20260427103652_inventory_pilot_contract_v2.sql:440-678`) without checking that subsequent migrations replaced them.
- **Architect's S-MED-6** (`confirm_production_order` skipping operator helper): INVALIDATED — RPC body now calls `is_inventory_production_operator()` line 20.

These misses suggest the codebase has matured since the doc the architect referenced; future audits should probe live `pg_proc.prosrc` rather than only reading source migrations.

---

## 6. Pilot blocker re-assessment

PM's 10 blockers (§5 of test plan) re-assessed against live findings:

| # | Blocker | Status |
| --- | --- | --- |
| 1 | Production hard-deny incomplete | ✅ HOLDS — triple gate confirmed (action + RPC + RLS) |
| 2 | Stock ledger asymmetry | ✅ HOLDS — T01 + P01 net to 0 deltas |
| 3 | `stock_issue(kitchen_use)` reintro | ✅ HOLDS — CHECK constraint enforces |
| 4 | MV exposed to authenticated | NOT TESTED in this run |
| 5 | Held perms accidentally granted | ✅ HOLDS — kho_truong template excludes po_approve / invoice_* |
| 6 | Branch-side intra-branch fallback | NOT TESTED in this run (need missing-location config test) |
| 7 | Before/after stock evidence | ✅ HOLDS — T01 + P01 produced movement rows |
| 8 | JWT claim drop on rotation | NOT TESTED in this run |
| 9 | Finance owner sign-off on AP | OUT OF QA SCOPE |
| 10 | Operators run full SOP day | OUT OF QA SCOPE |

**New blockers from this run:**
| # | New blocker | From |
| --- | --- | --- |
| 11 | Owner bypass cross-tenant via has_permission | Z01 |
| 12 | JWT signature not verified anywhere | Z01-jwt-sig |
| 13 | has_permission_any cross-branch leak on procurement tables | Z02 |
| 14 | stock_transfers either-side INSERT escalation | Z03 |
| 15 | RBAC matrix vs template seed drift | T-DRIFT-001 |

---

## 7. Cleanup contract

The QA test artifacts on production blue are tagged for cleanup:

```sql
-- Cleanup script (DROP/DELETE in dependency order)
DROP FUNCTION IF EXISTS public.qa_set_user(text);
DELETE FROM public.stock_movements WHERE tenant_id=99;
DELETE FROM public.stock_transfer_items WHERE tenant_id=99;
DELETE FROM public.stock_transfers WHERE tenant_id=99;
DELETE FROM public.production_order_items WHERE tenant_id=99;
DELETE FROM public.production_orders WHERE tenant_id=99;
DELETE FROM public.production_recipes WHERE tenant_id=99;
DELETE FROM public.goods_received_notes WHERE tenant_id=99;
DELETE FROM public.stock_issue_items WHERE tenant_id=99;
DELETE FROM public.stock_issues WHERE tenant_id=99;
DELETE FROM public.stocktake_lines WHERE tenant_id=99;
DELETE FROM public.stocktake_sessions WHERE tenant_id=99;
DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE tenant_id=99);
DELETE FROM public.journal_entries WHERE tenant_id=99;
DELETE FROM public.stock_levels WHERE tenant_id=99;
DELETE FROM public.posting_rules WHERE tenant_id=99;
DELETE FROM public.chart_of_accounts WHERE tenant_id=99;
DELETE FROM public.suppliers WHERE tenant_id=99;
DELETE FROM public.ingredients WHERE tenant_id=99;
DELETE FROM public.inventory_locations WHERE tenant_id=99;
DELETE FROM public.staff_permissions WHERE tenant_id=99;
DELETE FROM public.role_templates WHERE tenant_id=99;
DELETE FROM public.positions WHERE tenant_id=99;
DELETE FROM public.profiles WHERE tenant_id=99;
DELETE FROM public.accounting_periods WHERE tenant_id=99;
DELETE FROM public.branches WHERE tenant_id=99;
DELETE FROM auth.identities WHERE provider_id IN (SELECT id::text FROM auth.users WHERE email LIKE 'qa+%@matu.test');
DELETE FROM auth.users WHERE email LIKE 'qa+%@matu.test';
DELETE FROM public.tenants WHERE id=99;
DROP TABLE IF EXISTS public.qa_test_results;
```

The QA results live in `public.qa_test_results` until cleanup.

---

## 8. Next steps recommended

1. **Owner brief** on the 4 BUGS_CONFIRMED + 2 CODE_REVIEW_CONFIRMED findings.
2. **Decide T-DRIFT-001** resolution direction: doc fix vs template re-grant.
3. **Author 4 fix migrations**:
   - `20260507_has_permission_tenant_scope_owner_bypass.sql` (Z01)
   - `20260507_jwt_verify_in_proxy.ts` (TS-side, Z01-jwt-sig)
   - `20260507_procurement_rls_branch_scope.sql` (Z02 — RLS rewrite for goods_received_notes / suppliers / purchase_orders / purchase_order_items / supplier_invoices / ingredients / recipes / production_recipes)
   - `20260507_stock_transfers_rls_direction_strict.sql` (Z03)
4. **Re-run this QA suite after fixes** to confirm all 6 issues resolved + no regressions.
5. **Install R-INV regression rules** in `tasks/regressions.md`.
6. **Cleanup tenant_id=99** when QA approved — script in §7.

---

## 9. Appendix — Files referenced

- `docs/archive/worklog/tasks/inventory-qa-e2e-2026-05-06.md` — unified test plan
- `docs/ref/inventory-rbac-matrix.md` — RBAC matrix source of truth
- `docs/ref/inventory-sop.md` — SOP
- `docs/archive/plan/inventory-v2-rebuild.md` — green project rebuild plan
- `packages/shared/src/auth/permissions.ts` — permission catalog
- `packages/shared/src/auth/module-acl.ts` — route ACL
- `packages/shared/src/auth/inventory-roles.ts` — role groupings
- `apps/web/proxy.ts` — single auth gate
- `apps/web/app/inventory/transfer-actions.ts` — transfer action layer
- `supabase/migrations/20260423040000_auth_v2_m5_hotfix_has_permission.sql` — owner bypass logic
- `supabase/migrations/20260422170001_auth_v2_m4b_rls_cutover.sql` — procurement RLS
- `supabase/migrations/20260527010000_inventory_production_db_role_contract.sql` — production hard-deny
