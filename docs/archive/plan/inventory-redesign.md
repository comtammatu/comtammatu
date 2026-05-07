> ARCHIVED 2026-05-07 — Capabilities folded into 05-MODULE-CATALOG.md (Inventory)

# Inventory Redesign — Unified Policy Spec

> Workshop chốt từ 4-agent debate (PM / BA / Dev / QA) + owner approval.
> Created: 2026-04-24
> Status: APPROVED POLICY — pending S0 foundation sprint before coding.
> Supersedes ad-hoc inventory policy notes. Lives alongside `inventory-location-ledger.md` (CW/CK plumbing already shipped) and `m5-stock-enhancement.md` (Phase 2 items promoted into this spec).

## Scope

7 chính sách vận hành + 10 chốt blocker đã duyệt. Bản này là nguồn sự thật cho:
- Auth v2 permission catalog (draft bên dưới, chưa apply migration).
- Schema inventory tier 2 (waste, stocktake blind, price list, auto-approve gating, express window, dashboard MV).
- Regression rules mới (`tasks/regressions.md`).
- Backlog sprint S0–S9+ (`docs/plan/backlog.md`).

Không đụng kiến trúc CW/CK đã ship (multi-instance Kho Tổng + Bếp Trung Tâm via `inventory_locations`, transfer direction trigger).

## Working principles

1. **Dynamic > Fixed** cho threshold có liên quan đến doanh thu/quy mô branch.
2. **Schedule > Toggle** cho cửa sổ bypass.
3. **Evidence-required** cho mọi bypass hard rule (photo EXIF, PDF, ≥50 ký tự).
4. **Soft/Hard tiered** cho period close và variance check.
5. **Role-aware default** nhưng **RLS server-side** vẫn enforce.
6. **Deterministic auto-approve MVP**, trust-score là Phase 3 sau khi có baseline data.

---

## 1. Seven approved policies (final)

### Q1. Waste — 2-tier + anti-splitting v2

**Tier 1 — Photo required** khi bất kỳ điều kiện nào đúng:
- `value ≥ 150.000 VND` (single event) HOẶC `rolling_15min_sum(same_user, same_sku) ≥ 150.000`
- `qty ≥ 50%` tồn tại location
- `reason ∈ {dropped, quality_fail, contaminated, found_missing}`

Photo rule: camera-live (input capture), EXIF ≤ 5 phút, server strip-detection → reject.

**Tier 2 — Photo + QLV approve** khi:
- `value ≥ 500.000 VND` per event
- `user_shift_cap ≥ 1.500.000 VND` trong shift_key đó
- `branch_daily_cap` vượt (xem B4 dưới)
- `reason ∈ {found_missing, theft_suspected}` luôn tier 2 bất kể value

Reason immutable sau save. Đổi reason = tạo phiếu mới + audit.

**Shift key**: `YYYY-MM-DD_{morning|afternoon|evening}` theo `branches.timezone`. Business day cutoff **04:00 local**.

**Waste auto-generated từ POS/KDS**:
- `source_type='pos_return'`: khách trả món sau khi bưng → Bếp CN, reason=`customer_return`, qty theo BOM. Không photo; note bắt buộc.
- `source_type='kds_cancel'`: chef cancel giữa chừng. Stage ∈ {`before_cook` (không waste), `mid_cook` (% partial), `after_cook` (full recipe)}.

### Q2. Stocktake — Blind-by-tier + cross-branch audit

| Kỳ | Mode | Auditor |
|---|---|---|
| Daily | Open | Self |
| Weekly | ABC (A=blind, B/C=open) | Self + random spot-check 10% do QLV trigger |
| Monthly | Blind | Admin/regional sample ≥ 2 SKU A-class (không cần full) |
| Quarterly | Blind | Cross-CN peer rotation + admin |
| Spot | Blind 100% | Random cron + manual trigger |

**Recount rule**:
- Lệch `>5%` HOẶC `>200.000 VND` (tier A configurable tighter) → recount.
- Round 1→3 bình thường; chốt `percentile_cont(0.5)`.
- **Round 4 = QLV + admin** (không tự median, escalation bắt buộc).

**Blind enforcement**: SECURITY DEFINER RPC `get_stocktake_lines_blind(session_id)` lọc cột `system_qty` server-side. Không rely on client hide.

**ABC snapshot**: khoá vào session lúc start. ABC ranking **per-branch**, refresh Sunday 02:00 via `pg_cron`. New branch (<30 ngày data) inherit tenant-global ranking.

**Unaudited flag**: session monthly không có admin presence → mark `unaudited=true`, hiển thị trong báo cáo CTCP.

### Q3. GRN price variance — Symmetric 3-tier + baseline hygiene

| Lệch | Action |
|---|---|
| `≤ 15%` | Hint xám ("TB 30 ngày: X") |
| `15–30%` | Tick "Đã kiểm tra giá" bắt buộc |
| `30–100%` | Note ≥ 20 ký tự + chọn reason code |
| `≥ 100%` (giữ 100% không phải 200%) | Block hard, cần override path |

Symmetric (±) — áp cả chiều tăng và giảm. Baseline = `avg_30d_same_supplier_same_item`.

**Baseline fallback**:
- `sample_n < 3` → thử `avg_30d_any_supplier_same_item`.
- Vẫn `< 3` → **QLV manual approve bắt buộc** cho GRN đó, không áp tier.

**Override rate limit**: 3 override `30–100%` / user / tuần. Vượt → block, escalate QLV. Top-override weekly report gửi Admin Fri 09:00.

**Hard block exception (`≥100%`)**:
- Permission: `inventory.grn.hardblock.override` (QLV only).
- Evidence: PDF upload (hợp đồng/báo giá/market clipping) vào bucket `grn-evidence`.
- Note: ≥ 50 ký tự.
- Rate: 2 lần/tuần/QLV; vượt → escalate Admin.
- **Baseline pause**: sau override, `baseline_paused=true` 30 ngày cho (supplier, SKU) → giá outlier không kéo avg_30d lệch.
- Audit: append-only table `grn_hardblock_overrides`.

**Override code** (cho 30–100% tier không phải hard): `pgcrypto.crypt()` bcrypt hash trong `branch_override_codes`, rotate được, rate-limit 3 attempts/phút qua Edge Function.

### Q4a. GRN auto-approve — Deterministic (Phase 2 + Q4b integration)

**8 conditions AND** (S6 shipped 7; S9 added c8 trust_score):

1. `grn.po_id IS NOT NULL` — có PO gốc.
2. `variance_pct ≤ 30%` (Q3 tier ≤ Confirm) cho **tất cả lines**. **[soft — express bypass]**
3. `total_diff_value ≤ 3%` of PO value AND `max_line_diff ≤ 10%` qty AND `≤ 15%` price.
4. Không line nào có `reason ∈ {damaged, missing, wrong_item, contaminated}`.
5. `total_value ≤ 10.000.000 VND` (branch override được, cap tuyệt đối 30tr).
6. Supplier có `≥ 3 GRN confirmed` trong 90 ngày qua. **[soft — express bypass]**
7. Không cold-chain SKU (xem B3 dưới).
8. `compute_user_trust_score(grn.created_by, grn.branch_id) ≥ 70` (Q4b threshold). **[hard — never bypass]**

Evaluator **chạy cả client (ẩn nút) và server (RPC guard)**. Client không được tin.

**Express window** (schedule-based, không toggle):
- Cấu hình tại `branch_express_window` bởi `inventory.grn.express.configure` (QLV/Admin). Base 06:00–09:00 `branches.timezone`.
- QL CN có `inventory.grn.express.extend` → +60 phút/ngày, max 3 lần/tuần, note ≥ 10 ký tự.
- Extend quá giới hạn → auto disable quyền user, notification QLV realtime, log `grn_express_audit`.
- **Express CHỈ bypass conditions 2 và 6** (soft: variance ≤ Confirm 30%, supplier history). **KHÔNG bypass** cold-chain (7), photo, cap (5), hard block Q3.

### Q4b. Trust_score (Phase 3 — design only for now)

- Scope: per `(tenant, branch, user)`. Không cross-branch.
- Bootstrap: user/supplier mới = **50** (không phải 100).
- Warmup: cần ≥ 20 GRN confirmed trong 60 ngày để đạt 70 threshold.
- Decay asymmetric: incident `-20`, good GRN `+0.5`.
- Recovery cap `≤ 85` sau khi có incident (không về 100).
- Incident = GRN reject/revoke, stocktake variance match user tạo, override 30–100% bị flag.
- Monthly regression review: random sample 5% auto-approved để reviewer xác nhận.

### Q5. Dashboard — Branch total + location breakdown

- Summary card: `Kho CN + Bếp CN + in-transit`.
- In-transit ownership: **sender branch** cho tới khi receiver confirm. Receiver thấy qua badge "inbound pending".
- Mini stacked bar breakdown luôn hiển thị (không cần click).
- **Alerts per location**, không chỉ branch. Event realtime push tới QLV + branch_manager cho `theft_suspected`, `found_missing` (bypass cache 60s).
- Role-aware default filter (warehouse=Kho CN, chef=Bếp CN, branch_manager=all, admin=tenant). RLS server-side vẫn enforce.
- Materialized view: `mv_inventory_stock_current` refresh `*/5 * * * *` via pg_cron.
- **SECURITY DEFINER wrapper** `get_inventory_dashboard(p_branch_id)` — không expose MV cho role `authenticated` (RLS không apply trên MV).
- Cache 60s; invalidate on waste/GRN confirm/stocktake finalize event.

### Q6. supplier_price_list — Hybrid 3-source, decoupled

Schema:
```sql
supplier_price_list (
  id, tenant_id, supplier_id, ingredient_id, uom_id,
  unit_price, currency (default 'VND'),
  source ∈ {contract, quotation, grn_last, manual},
  effective_from, effective_to,
  min_order_qty, lead_time_days,
  source_ref JSONB,  -- {grn_id|po_id|quotation_id|contract_id, volume_discount_schedule}
  priority SMALLINT GENERATED STORED  -- contract=1, quotation=2, grn_last=3, manual=4
)
```

Resolver: `resolve_po_prices_batch(supplier_id, items[])` — return lowest priority effective row per (ingredient, uom) tại `CURRENT_DATE`.

**grn_last chỉ upsert khi GRN được QL CN approve explicit** (không auto-upsert từ Q4a express auto-approve). Cắt circular baseline Q3↔Q6.

Supplier dedupe: `suppliers.tax_code UNIQUE per tenant` — chặn supplier-swap gaming.

Contract expiry auto-notify 30 ngày trước. Contract overlap cho cùng `(supplier, ingredient, source='contract')` → trigger validate reject.

Weekly price drift alert: `grn_last` lệch `contract` > 10% cho 30 ngày liên tục → notification thu mua (rate-limited per SKU/week để tránh spam với volatile commodity).

`supplier_items` (NCC SKU mapping) defer Phase 3.

### Q7. Stocktake offline — 24h, RFC + pilot

**Gate** behind feature flag `STOCKTAKE_OFFLINE_ENABLED`. Pilot 1 CN trước khi rollout.

**Layer 1 — Local persist**:
- Dexie (IndexedDB). `client_op_id = uuidv7` (time-sortable).
- Private/incognito detection: `navigator.storage.persist()` → block entry nếu false.
- Quota check: `navigator.storage.estimate()` trước session; photo compress < 500KB client-side.
- Persist 30 ngày từ last-access.

**Layer 2 — Sync**:
- Batch 50 lines/request, idempotent key `(session_id, ingredient_id, client_op_id)`.
- Retry exponential (2s, 5s, 15s, 60s, 180s).
- Conflict = server đã có `(session_id, ingredient_id, round_no)` final → 409 response → client mark `sync_status='conflict'`, server tạo row `stocktake_conflicts` pending QLV resolve.
- **Không silent client-wins**. QLV có queue `/inventory/stocktake/conflicts`.

**Layer 3 — Fail-safe**:
- JSON auto-email QLV attachment khi sync fail > 10 phút (không phải user download).
- Server verify `offline_created_at <= now()` AND `>= session_opened_at`. Outside window → reject (chống clock tamper).
- Audit checksum: server-signed per batch.

**Zone lock**: table `stocktake_zone_locks(session_id, zone_id, locked_by, expires_at)`. TTL 30 phút, heartbeat 10 phút. Không dùng PG advisory (mất trên PostgREST).

**Blind vs cache**: IndexedDB cache metadata SKU nhưng **blacklist `qty_on_hand`, `system_qty`** fields trong blind mode.

**Conflict resolver UI**: queue `/inventory/stocktake/conflicts` + inline badge trên session detail + push notification QLV. SLA 24h unresolved → escalate Admin.

---

## 2. Ten blocker chốt

| # | Chốt | Key cấu hình |
|---|---|---|
| B1 | Monthly auditor = admin/regional sample A-class; quarterly = peer rotation + admin; session không auditor → `unaudited=true` | `stocktake.monthly.auditor_required = admin_or_regional` |
| B2 | Express window schedule-based; QLV/Admin configure base, QL CN extend +60p max 3/tuần | `grn.express.window = 06:00–09:00 tz-branch`, `extend.max_per_week = 3` |
| B3 | Cold-chain flag ở **category level** (`ingredient_categories.requires_manual_review`) + item override nullable | Admin maintain category; QLV override per-item |
| B4 | Branch daily waste cap dynamic: `max(500k, min(5tr, 2.5% × rev_7d_avg))`, nightly cron snapshot | `waste.branch_daily_cap.pct = 0.025`, floor 500k, ceiling 5tr |
| B5 | Hard block override = QLV + PDF evidence + note 50 chars, rate 2/tuần, baseline pause 30 ngày | `grn.hardblock.override.rate_limit_week = 2` |
| B6 | Waste customer return auto-generate từ POS void → Bếp CN, reason=`customer_return`, no photo, note required | `waste.customer_return.auto_generate = true` |
| B7 | KDS cancel stages: `before_cook` (no waste) / `mid_cook` (partial %) / `after_cook` (full recipe) | Reason prefix `kds_cancel_*` |
| B8 | Period close: soft day 5 (back-date allowed, flag prior period); hard day 15 (no back-date, Admin 2FA để reopen) | `accounting.soft_close_day = 5`, `hard_close_day = 15` |
| B9 | ABC per-branch, tenant-global fallback khi branch < 30 ngày data | `abc.scope = per_branch`, `new_branch_fallback_days = 30` |
| B10 | Conflict resolver UI = queue page + inline badge + push + SLA 24h | `stocktake.conflict.sla_hours = 24` |

---

## 3. Draft permission keys (14 new keys)

Chưa apply migration. Khi ship vào catalog + `packages/shared/src/auth/permissions.ts`, `PERMISSION_KEY_COUNT` tăng từ 68 → 82.

```ts
// inventory — waste tier 2
INVENTORY_WASTE_APPROVE:              "inventory:waste_approve",           // QLV
INVENTORY_WASTE_BYPASS_PHOTO:         "inventory:waste_bypass_photo",      // Admin audit, không mặc định cấp

// inventory — stocktake
INVENTORY_STOCKTAKE_RECOUNT:          "inventory:stocktake_recount",       // QLV
INVENTORY_STOCKTAKE_UNBLIND:          "inventory:stocktake_unblind",       // admin-only, break-glass

// inventory — adjust
INVENTORY_ADJUST_APPROVE:             "inventory:adjust_approve",          // QLV

// inventory — GRN express + hardblock
INVENTORY_GRN_EXPRESS_CONFIGURE:      "inventory:grn_express_configure",   // QLV/Admin
INVENTORY_GRN_EXPRESS_EXTEND:         "inventory:grn_express_extend",      // QL CN (revocable)
INVENTORY_GRN_HARDBLOCK_OVERRIDE:     "inventory:grn_hardblock_override",  // QLV only

// inventory — catalog policy
INVENTORY_CATALOG_REVIEW_POLICY_SET:  "inventory:catalog_review_policy_set",   // Admin (category)
INVENTORY_ITEM_REVIEW_OVERRIDE_SET:   "inventory:item_review_override_set",    // QLV (item-level)

// accounting
ACCOUNTING_PERIOD_REOPEN:             "accounting:period_reopen",           // Admin + 2FA

// procurement — price list
PROCUREMENT_PRICE_LIST_READ:          "procurement:price_list_read",
PROCUREMENT_PRICE_LIST_WRITE:         "procurement:price_list_write",       // thu mua + Admin
PROCUREMENT_OVERRIDE_CODE_ROTATE:     "procurement:override_code_rotate",   // QLV+Admin
```

Role default mapping (phác):

| Key | cashier | waiter | chef | bếp_truong | branch_manager | regional_manager | admin |
|---|---|---|---|---|---|---|---|
| waste_approve | | | | | ✓ | ✓ | ✓ |
| stocktake_recount | | | | | ✓ | ✓ | ✓ |
| stocktake_unblind | | | | | | | ✓ |
| adjust_approve | | | | | ✓ | ✓ | ✓ |
| grn_express_configure | | | | | | ✓ | ✓ |
| grn_express_extend | | | | | ✓ | ✓ | ✓ |
| grn_hardblock_override | | | | | | ✓ | ✓ |
| catalog_review_policy_set | | | | | | | ✓ |
| item_review_override_set | | | | | ✓ | ✓ | ✓ |
| period_reopen | | | | | | | ✓ |
| price_list_read | | | | | ✓ | ✓ | ✓ |
| price_list_write | | | | | | ✓ | ✓ |
| override_code_rotate | | | | | ✓ | ✓ | ✓ |

---

## 4. Build order (revised 9-sprint plan)

| Sprint | Scope | Artifact |
|---|---|---|
| **S0** | Foundation: `branches.timezone`, shift_key helper, `branch_override_codes` (bcrypt), SECURITY DEFINER MV wrappers, `ingredient_categories.requires_manual_review`, `accounting_periods` table, branch_daily_waste_cap cron | 1 tuần, kill 5 Dev blockers |
| S1 | Q6 tier 1 table + manual upsert + Q3 baseline MV (`mv_grn_price_baseline`) | Foundation Q3 |
| S2 | Q3 full (3-tier symmetric + override code + rate limit + hard block exception + baseline pause) | ROI ngay |
| S3 | Q1 full (2-tier + anti-split v2 + shift_key + EXIF + branch_daily_cap + POS/KDS auto-gen) | High ROI |
| S4 | Q5 full (MV + wrapper + per-location alerts + event invalidation) — MVP stabilize | MVP release |
| S5 | Q2 (blind + recount + cross-branch audit + ABC per-branch + round 4 escalation) | Training 2 tuần |
| S6 | Q4a deterministic (7-AND evaluator + Express schedule + QL CN extend) | Post Q3+Q6 stable |
| S7 | Q7 RFC + pilot 1 CN (Layer 1+2) + conflict queue | Feature-flagged |
| S8 | Q7 rollout + Q4b trust_score design + B8 period close flow | Phase 3 begin |
| S9+ | Q4b build + supplier_items + regression hardening | Nice-to-have |

Dev effort: ~55 ngày người tổng (44.5 + S0). Với 2 dev + 1 QA parallel: ~6 tuần MVP (S0–S4), ~11 tuần full (S0–S8).

## 5. Acceptance metric (for Gate 4 post-release monitoring)

| Metric | Target | Alert threshold |
|---|---|---|
| Waste photo compliance | ≥ 95% | < 90% → audit |
| GRN auto-approve rate | 40–60% | > 80% gaming / < 20% policy too tight |
| Override 30–100% frequency | < 3/QLV/tuần | > 5 → flag |
| Hard block override frequency | < 2/QLV/tuần | > 3 → escalate Admin |
| Stocktake variance avg (tier A) | < 3% | > 5% → audit branch |
| Offline sync success rate | > 98% | < 95% → infra |
| Dashboard p95 | < 800ms | > 1.2s → perf audit |
| Waste VND reduction (post 90 ngày) | -20% vs baseline | < -10% → policy retune |

## 6. Open items carried forward

- Admin UI cho `areas` (từ roadmap H3 defer) — không phải phần inventory redesign nhưng sẽ touch khi scale > 3 CN.
- `mv_inventory_stock_current` refresh cost khi 20k movement/day — load test ở S4.
- Threat model Q4a adversarial testing — QA viết playbook ở S6 pre-release.
- Q4b trust_score formula review — design sprint S8 trước khi build.

## 7. Cross-reference

- Kiến trúc CW/CK: `docs/plan/inventory-location-ledger.md`, `docs/plan/inventory-location-ledger-phase2.md`
- Business context: `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/ref/business-context.md`
- Auth: `docs/modules/auth.md`
- DB: `docs/modules/database.md`, `docs/spec/database-schema.md`
- Roadmap: `docs/plan/roadmap.md` (M5-Ext Phase 2 items merged here)
- Regressions: `tasks/regressions.md`
- Backlog: `docs/plan/backlog.md`
