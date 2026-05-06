# Finance Redesign — Contract v1

> **Decision date:** 2026-05-06 · **Owner:** ngocnghia128@gmail.com · **Sprint:** 2 weeks · **Trigger:** "Finance Module, đặc biệt Doanh thu từ POS, cực kì tệ hại — chỉ số loạn, thiếu tool/quick-action/filter, dữ liệu thiếu trực quan."
>
> **Workflow:** 4-agent debate (PM / BA / Sr.Dev / QA) per `CLAUDE.md` § Team Workflow. Synthesis below is the only source of truth — agent transcripts are reference, not authority.

## Scope

| Surface | Route | v1 outcome |
|---|---|---|
| **POS Revenue (canonical)** | `/finance/revenue` | KPI, charts, filter, drill-down — single page |
| **Reconciliation** | `/finance/reconciliation` | Adopt shared primitives + variance chart + tiered tolerance |
| **Statements** | `/finance/statements` | KPI strip + filter bar (deep redesign deferred to v2) |
| **Food cost** | `/finance/food-cost` | Margin breakdown + static threshold per category |
| **Shared design language** | all 4 | Same `KpiCard`, `FilterBar`, `ChartCard`, `Empty`/`Loading` |

**Hard redirects:** `/finance` → `/finance/revenue?range=today` (preserve query params).

**OUT of v1:** Journal, Chart of Accounts, Posting Rules, Periods, Audit Trail (deep redesign); RBAC changes; multi-currency; native mobile app; PWA offline; A/B framework; Excel/PDF export; new schema columns (e.g. `menu_categories.food_cost_target`).

## Owner-confirmed decisions (locked, do not re-debate)

| # | Decision |
|---|---|
| Q1 | Hero KPI "Doanh thu" = `subtotal_revenue` (chưa VAT). VAT đầu ra là KPI riêng. |
| Q2 | AOV mặc định = `revenue / order_count` (per đơn). Per-cover là drill-down card. |
| Q3 | Voided rate = `voided_amount / gross_sales` (sạch hơn `voided/(net+voided)`). |
| Q4 | Compare default = previous period cùng độ dài. Chip cho phép switch sang same-week/month/year. |
| Q5 | HĐĐT cross-month: revenue theo `orders.completed_at`; VAT theo `tax_invoices.issued_at`. Tách 2 KPI. |
| Q6 | Branch picker = single-select. |
| Q7 | Reconciliation tolerance per-order = 0₫. Per-day = 100₫. Per-month = 1.000₫. Mandatory exception khi ≥0,1% subtotal hoặc ≥50.000 VND (max). |
| Q8 | Sprint = 2 tuần (P0 → P3). |

## Conflict resolutions

| # | Conflict | Resolution |
|---|---|---|
| C1 | Redirect direction | `/finance` → `/finance/revenue` (canonical là /revenue) |
| C2 | New RPCs in v1? | YES — `get_revenue_by_hour`, `get_revenue_by_cashier` (heatmap + cashier chart đòi hỏi) |
| C3 | Statements priority | Deferred to v2; v1 chỉ apply shared primitives |
| C4 | Food-cost dynamic threshold | Static threshold per category trong code (35% cơm, 30% đồ uống, 45% combo); `menu_categories.food_cost_target` defer v2 |

## Canonical money definitions (BA §1)

Nguồn duy nhất từ `mv_daily_revenue` + `orders` + `tax_invoices`. NUMERIC(15,2) VND, làm tròn 1 đồng cho hiển thị.

| Term | Tên VN | Công thức |
|---|---|---|
| `gross_sales` | Doanh thu gộp | `Σ(order_items.qty × menu_items.price)` cho `orders.status='completed'` |
| `discount_amount` | Giảm giá | `Σ orders.discount_amount` cho completed |
| `subtotal_revenue` | Doanh thu thuần (chưa VAT) | `gross_sales − discount_amount` — **đây là KPI hero** |
| `output_vat` | GTGT đầu ra | `Σ tax_invoices.vat_amount WHERE status='issued' AND issued_at IN range` |
| `total_collected` | Tổng tiền thu được | `Σ payments.amount WHERE order.completed AND p.status='completed'` |
| `voided_amount` | Giá trị đơn hủy | `Σ` orders cancelled sau confirmed + voided line items, tính trên subtotal |
| `aov_per_order` | Bình quân/đơn | `subtotal_revenue / order_count` (status=completed) |
| `aov_per_cover` | Bình quân/khách | `subtotal_revenue / total_covers` |

**Loại bỏ từ codebase:** `grossRevenue` ở `revenue-client.tsx` (ambiguous). `net_revenue` field từ RPC vẫn giữ tên nhưng UI hiển thị label "Doanh thu thuần" + tooltip "chưa VAT".

## KPI cards landing /finance/revenue (BA §2 contract)

| # | Label | Value | Hint | Drill-down | Tone |
|---|---|---|---|---|---|
| 1 | Doanh thu thuần | `subtotal_revenue` | "Chưa VAT" + delta vs compare | sparkline drill | neutral |
| 2 | Số đơn hoàn thành | `order_count` | Đơn/giờ | hour-of-day chart | neutral |
| 3 | Bình quân/đơn | `aov_per_order` | "đơn vị: đơn" | order distribution modal | warning ↓>10% |
| 4 | Bình quân/khách | `aov_per_cover` | "đơn vị: khách" | order type breakdown | neutral |
| 5 | Tỷ lệ giảm giá | `discount / gross_sales × 100` | Total VND | discount type breakdown | warn ≥8%, dest ≥15% |
| 6 | Tỷ lệ hủy | `voided / gross_sales × 100` | Đơn hủy | cancelled list | warn ≥3%, dest ≥5% |
| 7 | Tổng thu thực tế | `total_collected` | Cash/QR/MoMo split | reconciliation | dest nếu lệch >0,1% |
| 8 | HĐĐT đã phát hành | `count + output_vat` | "X HĐ / VAT Y₫" | invoice list | warn nếu attention>0 |

## Filter & compare semantics

**URL params** (single source of truth, parse via Zod):
```
?branch=all|<id>          default: all
?range=today|yesterday|7d|30d|mtd|qtd|ytd|last_month|custom    default: mtd
?from=YYYY-MM-DD&to=YYYY-MM-DD  (only when range=custom)
?gran=day|week|month       default: day
?compare=none|prev_period|prev_week|prev_month|prev_year   default: prev_period
?payment=all|cash|vietqr|momo  default: all
?breakdown=branch|hour|cashier|payment   per-route default
?cashier=<id>              drill-down only
```

**Preset boundaries** (Asia/Ho_Chi_Minh, day-grain inclusive):

| Preset | Range |
|---|---|
| Today | `[today, today]` |
| Yesterday | `[today-1, today-1]` |
| Last 7d | `[today-6, today]` |
| Last 30d | `[today-29, today]` |
| MTD | `[first_of_month, today]` |
| Last Month | `[first_prev_month, last_prev_month]` |
| QTD | `[first_of_quarter, today]` (VN: Jan/Apr/Jul/Oct) |
| YTD | `[first_of_year, today]` |

**Time-of-day cutoff:** Khi `range=today` AND now < 23:59, mọi compare PHẢI honor cùng cut-off. RPC `get_revenue_kpis` cần param `p_cutoff_time` (TIMESTAMPTZ) — server action passes `new Date().toISOString()` khi range=today.

## Edge cases (BA §4 — must handle)

- Refund post-completed → reverse journal vào kỳ refund issue, NOT kỳ gốc
- HĐĐT phát hành tháng sau → revenue tháng cũ (`completed_at`), VAT kỳ kê khai mới (`issued_at`)
- Voided order món đã serve → `food_cost` ghi nhận, revenue=0; flag `voided_with_consumption`, hiển thị "Hao hụt do hủy" tách
- Cross-day session (mở 23h, đóng 02h) → variance attach vào `session.opened_at` date; revenue per-order theo `completed_at`
- Mixed VAT (cơm 8% + bia 10%) → split per-line, KPI cấp đơn blended, drill-down per-rate
- MV stale 5 phút → `MvStalenessBanner` show last refresh; KPI realtime cần ít nhất 1 card đọc trực tiếp `orders` (banner provides timestamp + manual refresh)
- Branch HQ vs central kitchen → loại trừ `branch_kind ≠ 'branch'` khỏi revenue picker

## Reconciliation rules (BA §5)

| Category | Rule | Severity |
|---|---|---|
| `payment_short` | total_collected < expected | destructive |
| `payment_over` | total_collected > expected | warning |
| `missing_invoice` | order completed nhưng không HĐĐT trong 24h (B2C có thể skip) | warning |
| `orphan_invoice` | HĐĐT không gắn order_id | destructive |
| `cash_variance` | actual_cash − expected_cash | warn ≥50k, dest ≥500k |
| `transfer_pending` | bank_transfer/vietqr không khớp settlement | warn >24h, dest >72h |

Tolerance phân tầng: per-order=0, per-day=100, per-month=1000. Mandatory exception khi `|diff| ≥ max(0,1% × subtotal, 50.000 VND)`.

## Architecture (Sr.Dev contract)

**Component placement:** `apps/web/app/finance/components/` (domain-aware). Reuse `packages/ui/src/components/chart.tsx` (shadcn Recharts wrapper, 95KB lazy-loaded).

**New components:**
- `use-finance-params.ts` — Zod URL param parser/serializer + period preset library
- `components/filter-bar.tsx` — preset chips + branch + granularity + compare + payment
- `components/kpi-card.tsx` — value + delta + sparkline child + drill href
- `components/chart-card.tsx` — Card shell + ChartContainer; variants line/bar/area/donut
- `components/trend-sparkline.tsx` — lazy Recharts LineChart, no axes, no animation
- `components/compare-chip.tsx` — Badge + arrow + delta semantic tone
- `components/heatmap-grid.tsx` — pure SVG 7×24 grid, semantic token gradient
- `components/mv-staleness-banner.tsx` — reads last refresh + manual refresh button
- `components/work-queue-strip.tsx` — extracted from current `finance-client.tsx:485-547`
- `components/export-toolbar.tsx` — copy CSV / download CSV with filter signature

**Data fetching:** Server Component fetches initial data via `Promise.all`; Client Component owns filter state via URL params + `useTransition` + `router.replace({scroll:false})`. Each filter change re-runs RSC. `<Suspense>` boundaries around chart cards.

**Realtime:** Lift `useFinanceRealtimeRefresh` from `finance-client.tsx:93` and `revenue-client.tsx:43` into `FinanceShell` once. Debounce 1.5s.

**Server actions:** Reuse all existing in `apps/web/app/finance/actions.ts`. New: `fetchRevenueByHour`, `fetchRevenueByCashier` (cap 90 days, no MV).

**New RPCs (migration):**
- `get_revenue_by_hour(p_branch_id BIGINT, p_start DATE, p_end DATE)` — direct query on `payments` joined to `orders` with `(paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')` bucketing
- `get_revenue_by_cashier(p_branch_id, p_start, p_end)` — joins payments → orders → pos_sessions → profiles
- Both `SECURITY DEFINER` + `has_permission(branch, 'finance:view')` (or `has_permission_any` for null branch) per rule RLS-NOT-APPLIED-ON-MV
- `REVOKE EXECUTE ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated`

## QA gates (Critic contract)

**Invariants** (must hold ± defined tolerance, asserted in unit tests):

```
INV-1  net_revenue = subtotal_revenue + total_tax              ± 0
INV-2  cash + vietqr + momo + other = net_revenue              ± 1₫
INV-3  dine_in + takeaway = net_revenue                        ± 1₫
INV-4  voided_count = orders.status='cancelled' count for range  exact
INV-5  mv_daily_revenue.SUM = get_revenue_kpis.net_revenue       0
INV-6  vat_8 + vat_10 = total_tax                                exact
INV-7  reconcile.subledger - reconcile.gl = reconcile.diff       exact
```

**Bundle budget:** chart code ≤ 80kB gzip delta on `/finance/*`. CI fail if exceeded.

**Mobile:** 375 / 414 / 768 / 1024 / 1280 px viewports green.

**A11y:** axe-core 0 violations; chart cards have `role="img"` + `aria-label`; tab order = visual order; WCAG AA on semantic tokens.

**Pre-pilot real-data verification:**
1. MISA reconciliation 1 closed month ± 1.000₫
2. Vietcombank/MB statement 7d vs `vietqr_revenue` ± 0₫
3. MoMo merchant report ± 0₫
4. Cash variance vs HR cashier sheet 14d
5. Top 5 dishes × 30d food cost % manual ± 1,5pp

## Sequence

| Phase | Days | Output |
|---|---|---|
| **P0 — Foundation** | D1-D2 | Migration applied, `pnpm db:types` green, all 9 components + use-finance-params, realtime hook lifted |
| **P1 — POS Revenue** | D3-D5 | `/finance` redirect, `/finance/revenue` rewritten (<600 LOC target), 8 KPIs, 4 charts, drill-down by date, export CSV with filter signature, unit tests INV-1..7 |
| **P2 — 3 surfaces** | D6-D8 | Reconciliation/Statements/Food-cost adopt shared primitives + variance chart + margin breakdown |
| **P3 — Polish + ship** | D9-D10 | Mobile QA, Lighthouse, axe-core, visual regression baseline, pilot release |

**Phase gates:** owner approves demo trước khi qua phase tiếp. P0 fail = stop. P1 fail = revert to quick-win patch (Option A in original triage).

## Things-that-will-bite-you (carried from CLAUDE.md + Architect §8)

1. **MV refresh silent fail** — GROUP BY ⊆ unique index. Avoid new MVs này; query `payments` direct (cap 90d).
2. **Missing GRANT** → `{ data: null, error: null }`. Migration must include `GRANT EXECUTE ... TO authenticated`.
3. **Auth hook = SECURITY DEFINER** — không đụng vào.
4. **TZ leakage** — `(paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` for all hour/dow buckets, NOT raw UTC. Rule: PERIOD-FILTER-USES-LOCAL-TZ.
5. **Refund exclusion** — `o.status<>'cancelled' AND o.payment_status='paid' AND p.status='completed' AND p.paid_at IS NOT NULL`. Rule: REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ.
6. **Recharts is Client Component only** — every chart wrapper must `"use client"`. Lint-grep `import.*recharts` to verify.

## Acceptance criteria (owner check-off at end of sprint)

1. Single revenue page; `/finance` 301-redirect; old links don't break
2. KPI definitions identical across surfaces (snapshot test)
3. Filter bar có ≥6 quick presets + branch + granularity + compare + payment
4. ≥4 chart types: line, bar, donut, heatmap (all using shared `ChartCard`)
5. Số liệu KPI = period table = branch totals (cùng filter window) đến đồng cuối
6. Mọi KPI card có drill-down link
7. Label trung thực: bỏ "30 ngày" hiện thực là MTD; mỗi card ghi rõ window
8. Responsive ≥375px; filter bar collapse, table horizontal scroll
9. Empty/loading/error states đồng nhất 4 surfaces
10. Zero raw Tailwind palette ngoài `packages/ui/src/styles/*`; pass `pnpm lint`
11. Bundle delta ≤ 80kB gzip
12. Real-data verification 5 items pass before pilot

## References

- Audit findings: this conversation, 2026-05-06
- Source files: `apps/web/app/finance/{page.tsx, finance-client.tsx, revenue/page.tsx, revenue/revenue-client.tsx, actions.ts, components/finance-shell.tsx, use-finance-realtime-refresh.ts}`
- DB security pattern: `supabase/migrations/20260426030437_finance_mv_wrappers_v2.sql`
- TZ + paid filter pattern: `supabase/migrations/20260512000000_revenue_rollup_and_tz_fix.sql`
- Chart primitive: `packages/ui/src/components/chart.tsx` (shadcn Recharts 3.8.0)
- Regression rules: `tasks/regressions.md` (RLS-NOT-APPLIED-ON-MV, REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ, PERIOD-FILTER-USES-LOCAL-TZ, POS-CLOSE-SHIFT-PAID-FILTER-AND-VARIANCE-GATE, MV-GROUP-BY-MUST-MATCH-UNIQUE-INDEX, REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE, HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK)
