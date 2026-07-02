# Notification / Alert / Report Contract

Single source of truth for the notification spine: the producer contract, the
`dedup_key` registry, `kind` namespace, severity bands, and channel routing.
Read this before adding any notification, alert, anomaly detector, or scheduled
report. Every producer (DB trigger, scheduled detector, scheduled report, and —
later — the LLM advisory layer) writes into the SAME `notifications` table under
this contract.

Status legend per item: **[live]** exists in code/prod · **[designed]** contract
agreed, not yet built · **[future]** deferred behind a gate.

## The spine

```
PRODUCERS  →  notifications (single hub, dedup_key)  →  DISPATCHERS  →  CHANNELS  →  AUDIENCES
triggers/                                              foreground popup /         app roles /
detectors/                                             telegram (topic)           TG group
reports
```

- A **producer** is anything that writes a well-formed `notifications` row. It is
  stateless about delivery and owns its `dedup_key`. Detectors, reports, the
  future camera (`vision_events` reader) and LLM digest are all just producers.
- A **dispatcher** reads `notifications` cold over a time window and owns its own
  delivery idempotency (a claim-RPC + delivery ledger) and rate budget.
- **Foreground popups** are **[live]** — the open PWA fires an OS notification
  (`Notification` API, shown via the service worker) for new unread rows it can
  see, RLS-scoped. Client-side only: no dispatcher, no VAPID, no delivery
  ledger, **and no delivery when the app is closed**. The former server Web Push
  layer (`notifications-push` cron, VAPID, `claim_notification_push_delivery` +
  `notification_push_deliveries`) was removed.
- **Telegram** is **[designed]** — the first true server dispatcher: it MUST own
  a claim-RPC + `notification_telegram_deliveries` ledger (the dispatcher
  pattern above). Do **NOT** reuse `notification_outbox` /
  `dispatchNotificationOutbox` (user-gated, non-atomic read→loop→update — a
  double-send race).

## Producer contract (`notifications` row)

Every producer MUST set: `tenant_id` (single tenant = 1), `target_branch_id`,
`severity` (`info` | `warning` | `critical`), `kind` (`<domain>.<event>`, stable),
`dedup_key`, `target_roles[]` (drives RLS visibility → who sees the in-app feed
and the foreground popup; also digest/Telegram targeting). SHOULD set:
`entity_type` / `entity_id`, `action_url`, `meta` (jsonb structured payload for
digests / Telegram formatter / future LLM), `expires_at`.

A missing or colliding `dedup_key` is the difference between "one alert" and "an
alert every run" — it is a reviewed checklist item per producer.

## `dedup_key` registry

Entity-bound conditions that resolve when the entity closes → `kind:{entity_id}`.
Persisting / recurring states → append a coarse time bucket whose **width = the
re-nag cadence you want** (NOT the scan interval). `dedupKey(kind, row, now)` is a
pure function per producer (unit-testable).

| kind | dedup_key | fires | status |
| --- | --- | --- | --- |
| `pos.shift_variance` | `pos.shift_variance:{session_id}` | once/session | **[live]** trigger |
| `pos.payment_stock_failed` | `pos.payment_stock_failed:{payment_id}` | once/payment | **[live]** trigger + MoMo webhook |
| `pos.void_rate_high` | `pos.void_rate_high:{session_id}` | once/session | **[designed]** |
| `pos.discount_high_session` | `pos.discount_high_session:{session_id}` | once/session | **[designed]** |
| `pos.discount_high_order` | `pos.discount_high_order:{order_id}` | once/order | **[designed]** |
| `pos.session_stale` | `pos.session_stale:{session_id}:{floor(now/6h)}` | re-nag 6h | **[designed]** |
| `pos.payment_pending_stale` | `pos.payment_pending_stale:{payment_id}:{floor(now/2h)}` | re-nag 2h | **[designed]** |
| `pos.void_after_paid_unrefunded` | `pos.void_after_paid_unrefunded:{order_item_id}` | once/item | **[designed]** |
| `inventory.stock_low` | `inventory.stock_low:{ingredient_id}:{date}` | daily | **[live]** kind, detector **[designed]** |
| `inventory.expiry_soon` | `inventory.expiry_soon:{ingredient_id}:{date}` | daily | **[designed]** |
| `procure.grn_price_variance` | `procure.grn_price_variance:{grn_item_id}` | once/line | **[designed]** |
| `hddt.reconcile_stuck` | `hddt.reconcile_stuck:{tax_invoice_id}` | once/invoice | **[designed]** |
| `hr.leave_requested` | `hr.leave_request:{request_id}` | once/request | **[live]** RPC (submit) |
| `hr.leave_approved` | `hr.leave_approved:{request_id}` | once/request | **[live]** RPC (approve) |
| `hr.leave_rejected` | `hr.leave_rejected:{request_id}` | once/request | **[live]** RPC (reject) |
| `inventory.count_slip_submitted` | `inventory.count_slip:{slip_id}:submitted` | once/submit | **[live]** RPC (submit) |
| `inventory.count_slip_approved` | `inventory.count_slip:{slip_id}:approved` | once/approve | **[live]** RPC (approve) |
| `inventory.count_slip_recount` | `inventory.count_slip:{slip_id}:recount` | once/recount | **[live]** RPC (recount) |
| `report.daily_closeout` | `report.daily_closeout:{branch_id}:{date}` | once/day | **[designed]** |
| `report.weekly` | `report.weekly:{branch_id}:{iso_week}` | once/week | **[designed]** |

Enforce with `UNIQUE(tenant_id, dedup_key)` (partial, `WHERE dedup_key IS NOT
NULL`) + `INSERT ... ON CONFLICT DO NOTHING` (or `DO UPDATE SET created_at=now()`
to refresh within a re-nag bucket). The constraint IS the cursor — no separate
alert-state table.

## `kind` namespace

Reserved, **disjoint** prefixes so independent producers never merge-conflict on
the registry (this is what makes per-domain producers parallel-safe):
`pos.*` / `cash.*` · `inventory.*` / `stock.*` · `procure.*` · `fin.*` / `tax.*`
/ `hddt.*` · `hr.*` · `report.*` · `advisory.*` (LLM, future).

Register every new `kind` in `apps/web/lib/messages/notifications.ts` `kindLabel`
+ the icon map, or it renders as a raw string.

## Severity bands

`severity` enum is `info | warning | critical` only. Scheduled reports use `info`.
Two breakpoints per threshold kind (mirroring the existing `>t` / `>5t` idiom):

| kind | warning | critical |
| --- | --- | --- |
| cash variance | `> max(20000, 0.1% × expected_cash)` | `> 5×` threshold |
| void rate / session | `> 10%` | `> 25%` |
| discount / session | `> 5%` | `> 15%` |
| discount / order | `> 20%` | `> 40%` |
| session stale | `> 16h` open | `> 24h` |
| payment pending | `> 2h` | `> 6h` |
| void after paid, no refund | — | **always critical** |

Severity is the SINGLE source of urgency for BOTH dispatchers; neither may
re-derive urgency from `kind`. Test both classifiers against one shared fixture.

## Channel routing (owner-locked)

Two channels, two independent audiences:

- **Foreground popup** = role-based via `target_roles[]` (RLS decides who can
  see the row). Fires an OS popup **only while that user's PWA is open** — there
  is no closed-app delivery. Audience is whoever has the app open among the
  targeted roles. Severity (owner-locked, decided 2026-06-22): popups fire for
  **ALL** visible severities (incl. `info` `pos.order_new`), unlike the former
  critical-only server push — a foreground popup only shows while the app is
  open, so the noise cost is low.
- **Telegram supergroup** = audience is **group membership** (owner + specially
  invited people), DECOUPLED from app roles. The dispatcher is role-agnostic and
  routes by `kind` + `severity` → forum topic. Both `critical` and `warning` flow
  into topics; `warning` also rolls into the daily digest.

`routeTopic(kind, severity)` is a **total** function — an unknown kind routes to a
DEFAULT topic, never throws (forward-compat for future producers).

### Telegram topic taxonomy (forum supergroup, Bot API 10.1)

🔴 Khẩn (Critical) · 💵 Tiền-Quỹ · 🍳 Bếp-Void · 📦 Kho-Tồn · 🛒 Mua hàng-Nhập ·
🧾 Hóa đơn-Thuế · 👥 Nhân sự · 📊 Báo cáo ngày · 📈 Báo cáo tuần-tháng.
`critical` → 🔴; else by `kind` prefix. The 20 msg/min cap is per WHOLE group
(shared across topics) — daily digest batching is the pressure valve. Topic-id
map lives in `inventory_qc_settings.telegram_topic_map` (jsonb); bot token +
chat_id stay in env, never in the DB.

## Trigger vs detector ownership (no double-alert)

Single-row events stay DB triggers (already live): `pos.shift_variance` (#1
cash variance, retune constants only), `pos.payment_stock_failed` (#6),
`trg_notify_*` for order/GRN/transfer/stocktake. The scheduled detector cron owns
ONLY what triggers cannot: cross-row aggregates (void/discount rate per session)
and time/age staleness (session > 16h, payment > 2h). A test MUST assert the cron
emits zero rows of any trigger-owned `kind`.

## Hard invariants

- **LLM never holds a DB connection, an RPC, or a number.** It receives rows the
  deterministic layer already selected and emits prose only. A hallucinated number
  is impossible-by-construction. `advisory.*` / digest is the LAST thing built.
- **Money / tax / labor producers are capped at R1 (alert) forever** — never
  auto-act. See the autonomy ladder in `docs/plan/agentic-os-blueprint.md`.
- **Agent action surface = existing `SECURITY DEFINER` RPCs** (allowlist + caps).
  No new action API.
- **Migration/prod posture is owned by `database.md`** (Environment Registry +
  Migration Policy). Parallel file-writing agents each work in their own git
  worktree.
- **Single tenant** (`tenant_id = 1`); still scope every query by
  `tenant_id` + `branch_id` explicitly (service-role bypasses RLS).

Phasing, agent constellation, the autonomy ladder, the sprint plan, and the
agent-team delivery model are in `docs/plan/agentic-os-blueprint.md`.
