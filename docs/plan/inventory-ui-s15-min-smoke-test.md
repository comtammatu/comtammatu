# S15-min Pilot Smoke Test — Trust Leaderboard + Self-view Badge

> Manual end-to-end verification for S15-min: admin trust leaderboard with
> live compute toggle, employee self-view trust badge on profile page.
> Run after Tranche 1 + 2 shipped; `compute_user_trust_score` RPC live per
> S9 migration.

## Prerequisites

- S8 + S9 migrations applied (`user_trust_score` table + `compute_user_trust_score` RPC live)
- At least 5 seeded users in `profiles` with branch_id set to a pilot branch
- Some recent GRN activity so `grn_count_30d` > 0 for most users
- Test user for admin view has `reports:view_branch` permission

## Step 1 — Admin leaderboard loads

1. Login as branch manager / QLV for branch 2
2. Navigate `/admin/inventory/trust?branchId=2`
3. Expect header "Trust leaderboard" with shield icon + subtitle mentioning c8 threshold
4. 4 tier summary cards render with counts: Elite / Trusted / Bootstrap / At risk
5. Branch Select dropdown shows active branches; current = Đất Đỏ
6. Table renders rows ordered by score DESC
7. Rank column shows 1, 2, 3 ... in muted color
8. Each row shows: name + UID suffix, Tier pill (compact TrustScoreBadge), stored score, GRN 30d, Incident, timestamps

## Step 2 — Empty state

1. Navigate `?branchId=<branch_with_no_trust_rows>`
2. Table shows empty message: "Chi nhánh này chưa có bản ghi trust score."
3. Tier summary cards all show 0

## Step 3 — Search filter

1. Type a partial employee name in the search box
2. Table filters live (client-side) to matching rows
3. Clear search → full list returns
4. If nothing matches: message "Không user nào khớp bộ lọc."
5. Tier summary cards do NOT refilter (they show the source rows count)

## Step 4 — Permission gate

1. Login as cashier / chef (no `reports:view_branch` permission)
2. Navigate `/admin/inventory/trust`
3. Expect redirect to `/` (home) — page gate is `REPORTS_VIEW_BRANCH`

## Step 5 — Live compute toggle (c8 auto-approve verification)

1. Loaded page: "Live compute: OFF" button visible
2. Click → URL becomes `/admin/inventory/trust?branchId=2&computed=1`
3. Table renders new "Score (live)" column at index 5
4. For the top 25 rows, live column populated; remaining 175 show "—"
5. When live ≠ stored by more than 2, the live cell text is amber
6. Click again → URL drops `&computed=1`, column disappears

## Step 6 — Threshold semantics (§Q4b cross-check)

Pick 3 rows at different scores:
- **Elite (≥85)**: purple pill, IconShieldCheck, tooltip mentions "85 ceiling"
- **Trusted (70-84)**: green pill, IconShieldHalf, tooltip mentions c8 auto-approve
- **Bootstrap (50-69)**: blue pill, IconShield, tooltip mentions "20 clean GRN in 60d"
- **At risk (<50)**: red pill, IconShieldX, tooltip mentions "recent incidents"

Hover each tier badge → tooltip matches.

## Step 7 — Self-view on employee profile

1. Login as a non-admin user who has branch_id and at least 1 GRN in 30d
2. Navigate `/employee/profile`
3. Scroll to "Hồ sơ đang dùng" card
4. Expect a new Item "Điểm tin cậy" with:
   - IconShieldCheck icon
   - TrustScoreBadge showing current tier + score
   - Subtext: "GRN 30 ngày: N" + optional "Incident: N" if > 0
5. The score shown is the freshly-computed value (uses `compute_user_trust_score` RPC)

## Step 8 — Self-view absence

1. Login as a tenant-level user (e.g. super_manager with `branch_id = null`)
2. Navigate `/employee/profile`
3. Expect NO "Điểm tin cậy" Item (profile page only queries when `claims.branch_id`)
4. Login as a branch user with no `user_trust_score` row yet (new hire, no GRN)
5. Self-view returns `data = null` → Item NOT rendered

## Step 9 — Compute accuracy cross-check

Pick one user from the leaderboard:
```sql
-- Spot-check the stored score
SELECT score, grn_count_30d, variance_incidents_30d
  FROM public.user_trust_score
 WHERE user_id = '<uid>' AND branch_id = 2;

-- Fresh compute via RPC
SELECT public.compute_user_trust_score('<uid>', 2);
```

1. Row score and RPC output should match within ±0.5 IF the updater cron
   recently ran
2. If they differ by > 2, the `?computed=1` view should amber-tint that row

## Step 10 — Live compute load

1. Load `?computed=1` on a branch with 200+ rows
2. Page rendering takes a few seconds (25 RPC calls, serialized)
3. Network tab: one POST to `/admin/inventory/trust?...` — no client-side
   RPC calls (everything runs during RSC)
4. Confirm no N+1 for users beyond the top 25 (live column shows "—")

## Step 11 — `includeComputed` is opt-in

Automated check: `getTrustLeaderboard(branchId, { includeComputed: false })`
MUST NOT call `compute_user_trust_score` RPC. Verify via tracing or SQL logs
— default path should run 1 SELECT query only.

## Acceptance

All 11 steps must pass before widening trust UI to additional branches.
Fail → file issue with step number, do NOT expose the admin route to new
roles until resolved.

## Known deferred

- Score history chart (requires `trust_score_history` table — NOT in current
  schema; S8 scaffold stores only the latest snapshot). Add in a future sprint
  if owner wants 30/60-day trend view.
- `supplier_items` CRUD — explicit defer per owner decision #6
- Tenant-wide cross-branch aggregation — S15-min scope is per-branch only
- Playwright E2E — QA adversarial sprint
