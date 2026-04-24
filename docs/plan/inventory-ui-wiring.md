# Inventory UI Wiring Plan — Tranches 1-3 (S10-S15)

> Post-DB-layer (S0-S9 shipped, 17 migrations). Consolidated from 4-agent debate (PM/BA/Dev/QA) 2026-04-24.
> Owner decisions: #6 strict defer supplier_items UI; #9 per-branch feature flags.
> No designer — Claude generates component wireframes inline.

## Pilot scope

- **Branches**: #1 Trụ sở chính (Kho Tổng) + #2 Chi nhánh Đất Đỏ
- **Actor roles tested**: owner, super_manager, quan_ly_vung, quan_ly_CN, bep_truong, chef, thu_kho, cashier
- **Feature flag scope**: per-branch (flag keys enable features only on pilot branches)
- **Parallel**: 2 dev, 2 lanes

## Tranche summary

| Tranche | When | Sprints | Effort (2-dev wall-clock) |
|---|---|---|---|
| **1 — Pre-pilot** | Before pilot go-live | S10 + S11-core + S12 + S13a | 26d → ~13d wall-clock |
| **2 — During pilot** | Weeks 2-4 post-go-live | S11-ext + S13b | 10d sequential |
| **3 — Post-pilot** | After 60d pilot data | S15 trust (supplier_items strict defer) + QA adversarial | 8d |

---

## Tranche 0 — Foundation (1 day, prep before S10)

Before any sprint starts:

### F0.1 Feature flag migration
```sql
CREATE TABLE public.branch_feature_flags (
  branch_id   BIGINT  NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  flag_key    TEXT    NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  enabled_by  UUID    REFERENCES auth.users(id),
  enabled_at  TIMESTAMPTZ,
  notes       TEXT,
  PRIMARY KEY (branch_id, flag_key)
);
-- RLS: tenant-scoped read; write gated by `settings:branch` or `settings:tenant`
```

### F0.2 Client helper
```ts
// packages/shared/src/hooks/use-feature-flag.ts
export async function isFeatureEnabled(branchId: number, flagKey: string): Promise<boolean>;
// Server component pattern — fetch once per request, pass to client via props
```

### F0.3 Admin UI tại `/admin/inventory/feature-flags`
Simple table: branch × flag toggle, audit trail.

### F0.4 Seed flag keys (disabled initially)
- `inv_s10_grn_variance`
- `inv_s11_waste_tier`
- `inv_s12_dashboard_v2`
- `inv_s13a_stocktake_v2`
- `inv_s13b_stocktake_recount`
- `inv_s14_auto_approve`

### F0.5 Pre-S10 tasks
- [x] s3a self-approval guard patched
- [ ] Install `@tanstack/react-virtual` (in progress)
- [ ] Expand `packages/shared/src/labels/vi.ts` with inventory vocab (~80 entries)
- [ ] Generate component wireframes (Claude — no designer mode)

---

## Tranche 1 — Pilot Critical

### S10 — GRN variance + hardblock + Express window + cold-chain admin (9d)

**Lane A — Dev 1**

#### Routes touched
- `apps/web/app/inventory/grn/[id]/grn-detail-client.tsx` — add variance panel + auto-approve hint
- `apps/web/app/inventory/m/grn/new/[supplierId]/grn-create-client.tsx` — add tier pill + override code input
- `apps/web/app/inventory/grn/grn-list-client.tsx` — filter + badge column
- `apps/web/app/inventory/settings/page.tsx` — add "Express window" + "Cold-chain" sections

#### Routes new
- `apps/web/app/admin/inventory/cold-chain/page.tsx` — category checkbox list + item override search
- `apps/web/app/admin/inventory/feature-flags/page.tsx` — branch × flag grid

#### Components (extend existing)
- `_components/variance-tier-badge.tsx` — extends `StatusBadge` with `tier` variant
- `_components/baseline-hint.tsx` — "TB 30 ngày" inline hint
- `_components/hardblock-override-dialog.tsx` — wraps `PhotoUploadInput` (extended với `bucket` prop) + reason dropdown + note ≥50
- `_components/override-code-input.tsx` — password-style with server-clock-synced rate-limit countdown
- `_components/auto-approve-eval-panel.tsx` — 8-condition breakdown 🟢/🔴
- `_components/express-window-indicator.tsx` — countdown timer header
- `_components/extend-window-button.tsx` — +60min button with 3/tuần counter

#### Server actions
| Action | RPC |
|---|---|
| `getBaselinePrice(supplier, ingredient, uom)` | `get_grn_price_baseline` |
| `rotateOverrideCode(branch, newCode)` | `rotate_branch_override_code` |
| `verifyOverrideCode(branch, code)` | `verify_branch_override_code` |
| `submitHardblockOverride(grnItemId, file, reason, note)` | upload Storage + `override_grn_hardblock` |
| `evaluateAutoApprove(grnId)` | `grn_is_auto_approvable` |
| `tryAutoApprove(grnId)` | `try_auto_approve_grn` |
| `configureExpressWindow(branch, enabled, start, end)` | `configure_express_window` |
| `extendExpressWindow(branch, minutes, note)` | `extend_express_window` |
| `setCategoryReviewPolicy(tenant, category, required)` | UPSERT `ingredient_category_review_policy` |
| `setItemReviewOverride(ingredientId, override)` | UPDATE `ingredients.review_override` |

#### Acceptance criteria
1. 4 tier scenarios render correct color + CTA (0=no badge, 1=yellow confirm, 2=orange note+code, 3=red hardblock modal)
2. Hardblock modal: note <50 char → submit disabled; file upload success → evidence_url passed to RPC; orphan cleanup on fail
3. Rate limit indicator: "Bạn đã override 2/2 tuần" → button disabled
4. Express window countdown synced với server clock (not `Date.now()` local)
5. Extend button 3/tuần counter visible; 4th click → 54000 error rendered friendly
6. Cold-chain admin: category checkbox list → save → verify via `inventory_requires_manual_review(ingredient_id)` returns true for items in flagged category
7. Period-close respect: GRN với `received_date` trong hard-closed period → submit reject với 42501 banner

#### Regression rules hit
- `PRESET-FIRST-UI`, `NO-FAKE-PRIMITIVES` — mọi components dùng shadcn base
- `INVENTORY-BRANCH-FILTER-URL-ONLY` — branch scope via `?branchId=`
- `NO-ARBITRARY-DIMENSIONS` — Tailwind tokens only
- `TERMINOLOGY-SOURCE-OF-TRUTH` — reason codes from `vi.ts`

---

### S11-core — Waste 2-tier + approval queue (6d)

**Lane B — Dev 2 (parallel with S10)**

#### Routes touched
- `apps/web/app/inventory/issues/page.tsx` — unified list với tier column + filter
- `apps/web/app/inventory/issues/[id]/issue-detail-client.tsx` — approval panel
- `apps/web/app/inventory/m/stock/mobile-stock-client.tsx` — waste entry UX on mobile

#### Routes new
- `apps/web/app/inventory/waste/new/page.tsx` — desktop form
- `apps/web/app/inventory/waste/approvals/page.tsx` — QLV queue

#### Components
- `_components/waste-tier-badge.tsx` — extends StatusBadge (2 tiers + bypass mode)
- `_components/waste-photo-upload.tsx` — camera-only capture (input capture=environment)
- `_components/waste-reason-dropdown.tsx` — 13 reason codes (i18n from vi.ts)
- `_components/shift-cap-meter.tsx` — progress bar user shift cap (rolling sum)
- `_components/branch-daily-cap-banner.tsx` — warning khi approaching cap
- `_components/waste-approval-card.tsx` — approval queue item
- `_components/anti-split-rolling-meter.tsx` — live rolling 15min sum per SKU (BA's missing surface)

#### Server actions
| Action | RPC |
|---|---|
| `createWasteEntry(branchId, locationId, items, photos, notes, sourceType)` | `create_waste_entry` |
| `approveWaste(issueId, decision, note)` | `approve_waste` (self-approval guard fires) |

#### Out of scope S11-core (moved to S11-ext/Tranche 2)
- POS void auto-gen integration
- KDS cancel stage picker

#### Acceptance criteria
1. Tier 0/1/2 render với correct photo_required + approval_required states
2. Camera permission flow: denied → fallback message (no file upload option)
3. Photo EXIF enforce ≤ 5 min client side (block upload nếu older); server validate (deferred S3-b)
4. Anti-split rolling meter: realtime update khi user đang typing qty → show "Nếu thêm → rolling 15min sum: 147k/150k"
5. Approval queue: QLV không được approve own waste (42501 fires)
6. Shift cap meter: visible in form header, turns red at 1.4tr/1.5tr
7. Reason immutability: edit existing waste → reason_code field disabled

---

### S12 — Dashboard + alerts + period close admin (5d)

**Lane B — Dev 2 sequential after S11-core**

#### Routes touched
- `apps/web/app/inventory/dashboard-client.tsx` — full rewrite consuming MV
- `apps/web/app/inventory/page.tsx` — landing layout

#### Routes new
- `apps/web/app/admin/accounting/periods/page.tsx` — soft/hard close + reopen admin

#### Components
- `_components/dashboard-summary-cards.tsx` — 4 cards (value, SKUs, alerts, in-transit)
- `_components/location-breakdown-table.tsx` — Kho CN + Bếp + in-transit rows
- `_components/alerts-drawer.tsx` — right panel, 3 alert types with severity
- `_components/refresh-button.tsx` — manual MV refresh với last-computed-at badge
- `_components/period-close-card.tsx` — per-month (year, month, soft_closed, hard_closed) + Admin actions

#### Server actions
| Action | RPC |
|---|---|
| `getDashboard(branchId)` | `get_inventory_dashboard` (JSONB unwrap) |
| `getAlerts(branchId, types, limit, offset)` | `get_inventory_alerts` |
| `refreshDashboard()` | `refresh_inventory_dashboard` (client rate-limit 1/min) |
| `closePeriodSoft(tenant, year, month)` | `close_period_soft` |
| `closePeriodHard(tenant, year, month)` | `close_period_hard` |
| `reopenPeriod(tenant, year, month)` | `reopen_period` (2FA UI) |

#### Acceptance criteria
1. Role-aware default filter: warehouse→Kho CN, chef→Bếp, QL CN→all, admin→cross-branch
2. Cost masking: `can_view_cost=false` → total_value_vnd hidden với em-dash placeholder
3. Performance p95 < 800ms trên throttled Fast 3G (Lighthouse CI gate)
4. Virtualized alerts drawer (500+ rows — `@tanstack/react-virtual`)
5. Last-updated timestamp visible (MV 5-min staleness transparency)
6. Period close card: ngày 5 auto soft-close; ngày 15 auto hard-close; manual override với audit trail
7. Reopen period requires 2FA modal (password re-enter)

---

### S13a — Stocktake basic + blind wrapper + draft auto-save (6d)

**Lane A — Dev 1 sequential after S10**

#### Routes touched
- `apps/web/app/inventory/stocktake/page.tsx` — session list với blind/audit badges
- `apps/web/app/inventory/stocktake/stocktake-list-client.tsx` — list enhancements

#### Routes new
- `apps/web/app/inventory/stocktake/new/page.tsx` — wizard (mode → location → thresholds)
- `apps/web/app/inventory/stocktake/[id]/counting-client.tsx` — main counting grid (blind-aware)

#### Migration needed (F0+ or S13a start)
```sql
CREATE TABLE public.stocktake_drafts (
  session_id BIGINT PRIMARY KEY REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE,
  draft_counts JSONB NOT NULL DEFAULT '{}',
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by UUID REFERENCES auth.users(id)
);
```

#### Components
- `_components/stocktake-mode-selector.tsx` — radio with default blind/open per mode
- `_components/blind-counting-grid.tsx` — virtualized, omits system_qty column in blind mode
- `_components/round-progress-stepper.tsx` — rounds 1-4 indicator
- `_components/abc-class-chip.tsx` — extends StatusBadge
- `_components/zone-lock-indicator.tsx` — countdown + heartbeat status
- `_components/stocktake-draft-saver.tsx` — 30s auto-save, resume-from-draft banner

#### Server actions
| Action | RPC / logic |
|---|---|
| `startStocktake(...)` | `start_stocktake` |
| `getLinesBlind(sessionId)` | `get_stocktake_lines_blind` (omits system_qty) |
| `submitCountRound(sessionId, round, counts)` | `submit_count_round` |
| `saveDraft(sessionId, counts)` | UPSERT `stocktake_drafts` |
| `acquireZone(sessionId, zoneId)` | `acquire_zone_lock` |
| `heartbeatZone(sessionId, zoneId)` | `heartbeat_zone_lock` (client interval 10min) |

#### Out of scope S13a (moved to S13b)
- Recount round 2+ flow
- Round-4 escalation
- Conflict resolver queue

#### Acceptance criteria
1. Blind mode network-tab inspection: no `system_quantity` in response body (Playwright assert)
2. React cache cannot leak system_qty (pass only blind DTO as props, never full row)
3. Auto-save draft 30s; browser refresh → resume banner "Đã lưu lúc 14:32"
4. Virtualized grid 200 SKU scroll 60fps (Playwright trace)
5. Zone lock countdown visible; heartbeat fail → banner warning 5min before expiry
6. ABC chip shows tier with stricter threshold tooltip

---

## Tranche 2 — During pilot

### S11-ext — POS void/KDS cancel auto-gen (4d)

- POS `completePayment` handler: khi order `void_after_served` → expand recipe → call `create_waste_from_order(orderId, 'pos_return', ...)` qua `SAVEPOINT ... EXCEPTION` (non-fatal)
- KDS cancel button: radio `before_cook / mid_cook / after_cook`, mid_cook takes slider 0-100%
- Cashier toast: "Đã tạo phiếu waste #X" hoặc "Không tạo được waste (admin sẽ xử lý)" — void always succeeds

### S13b — Recount ladder + round-4 escalation + conflict queue (6d)

- Recount round 2/3 UI với variance heatmap
- Round-4 escalation form (QLV + admin 2-sign)
- `/inventory/stocktake/conflicts` queue (read `stocktake_conflicts`)
- Zone lock rehearsal test: 2 devices on same zone

---

## Tranche 3 — Post-pilot (8d)

### S15-minimal — Trust leaderboard (3d)
- Admin table view `user_trust_score` per branch
- Score history chart (timeline GRN + incidents)
- Self-view badge trong user profile
- **supplier_items CRUD strict defer** per owner decision #6

### QA adversarial (5d)
- Red-team scenarios: trust bootstrap exploit, anti-split cross-branch, RLS-on-MV leak via MV scan
- Playwright E2E: 5 adversarial specs per QA review

---

## Deferred indefinitely

- `supplier_price_list` contract/quotation management UI — thu mua dùng SQL Studio until demand signals
- `supplier_items` NCC SKU mapping UI — kept deferred per spec §Q6 phase 3
- Edge Function EXIF server validator (S3-b) — security team separate ship
- Offline stocktake Layer 1+2 client (Dexie + sync engine) — post-pilot if wifi issues > 10%
- Mobile routes upgrade `/inventory/m/*` — desktop first

---

## Gate 0 checklist — pre-S10 kickoff

| # | Task | Status |
|---|---|---|
| 1 | Self-approval guard applied | ✅ s3a done |
| 2 | MV refresh CONCURRENTLY verified | ✅ |
| 3 | `@tanstack/react-virtual` installed | ⏳ running bg |
| 4 | `vi.ts` expanded với ~80 inventory vocab | ⏳ S10 day 1 |
| 5 | Spec §Q4a 7→8 updated | ✅ |
| 6 | supplier_items scope: strict defer | ✅ owner confirmed |
| 7 | Cold-chain UX spec drafted | ⏳ S10 day 1 |
| 8 | POS void SAVEPOINT pattern confirmed | ⏳ S11 kickoff |
| 9 | Feature flag architecture: per-branch | ✅ owner confirmed |
| 10 | Designer: none, Claude generates wireframes | ✅ confirmed |
| 11 | `branch_feature_flags` table migration | ⏳ F0 |
| 12 | `qc-settings-client` pattern referenced | ✅ inspected |

---

## Effort summary (final)

| Tranche | Sprints | Raw effort | 2-dev parallel |
|---|---|---|---|
| T0 Foundation | F0 migration + helpers + wireframes + labels | 2d | 2d |
| T1 Pre-pilot | S10 + S11-core + S12 + S13a | 26d | **~13d** |
| T2 During pilot | S11-ext + S13b | 10d | ~5-7d |
| T3 Post-pilot | S15-min + QA adversarial | 8d | ~5d |
| **Total** | | **46d raw** | **~25d wall-clock** |

With 2-dev parallel + no designer blocking: **~5 weeks to full rollout**.

---

## References

- Spec: `docs/plan/inventory-redesign.md` (updated §Q4a 7→8)
- DB migrations: `supabase/migrations/2026042505*-2026042516*.sql` (17 + s3a/s5a/s9b patches = 20 total)
- Regression rules: `tasks/regressions.md`
- Existing UI baseline: `apps/web/app/inventory/*`
- Component library: `packages/ui/*` + `apps/web/app/inventory/_components/*`
- Labels source-of-truth: `packages/shared/src/labels/vi.ts` (needs expansion)
