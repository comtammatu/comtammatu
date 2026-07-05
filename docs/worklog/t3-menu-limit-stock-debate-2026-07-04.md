# T3 Debate — Menu Sale-Limit / Stock-Deduction Semantics Redesign (2026-07-04)

> Reconciled-through `d69a0a48`
> STATUS: PROGRAM COMPLETE 2026-07-04 — PR-1 #231 / PR-2 #233 / PR-3 #234 /
> PR-4 #238 merged; all seven migrations applied to prod (owner-delegated).
> D065 amends this contract's two-switch model: owner chose ONE switch
> ("Trừ tồn khi bán" = deduct + hard DB gate, never negative, out = locked
> until restocked; OFF = unlimited) — the advisory-gate resolution in
> §Conflicts #1 and the two-switch §Concept model are superseded by D065
> in docs/plan/decisions.md. Owner decision the same day (PR #232):
> deduction stays OFF, GRN re-entry cancelled — the switch is
> dormant-but-ready. Open tails tracked in tasks/todo.md (db:types
> reconcile, e2e tz fix, stock_consumed_status reader cleanup).

Tier: **T3**. Trigger surface: SECURITY DEFINER RPC rewrites on the POS hot
path, order-write trigger semantics, per-branch feature-flag rollout that can
silently block all sales (the 2026-06-30 → 07-03 Phước Hải pilot lockout), and
amendments to frozen decisions D016/D053.

Skill plan: repo rules = engineering + database + ui + workflow + team;
external skills = t3-debate launcher; runtime tools = supabase MCP (prod,
SELECT-only) + codegraph + Workflow fan-out; skipped = browser QA (design
phase, no diff yet).

Owner ask (2026-07-04): the cluster "giới hạn món / trừ món / giới hạn bán /
còn lại / trừ kho" is incoherent — investigate, add a mechanism to turn OFF
stock deduction, and make no-recipe items sell unlimited unless the item is
turned off. "Giới hạn bán" named the worst offender.

## Evidence base

Four investigation lane reports (DB semantics, POS client, manager UI,
intent/history) produced by parallel subagents 2026-07-04; prod facts verified
live via read-only SQL the same day:

- `stock_levels` is EMPTY (owner inventory wipe 2026-07-03; GRN re-entry
  pending, then owner intends to re-enable deduction).
- All 22 active menu items have 1:1 finished-good recipes; no active item is
  recipe-less today.
- Both `pos_stock_outcome_posting` and `pos_ingredient_stock_block` are OFF on
  every branch; branch 3's posting flag was enabled 06-30 (pilot) and turned
  off 07-03 12:25 after the whole menu showed "còn 0".
- Measured: `branch_menu_limit_availability(1, 3, today, true)` returns
  `available_to_sell = 0` for all 22 items; with `false` it returns NULL
  (unlimited) but `limit_quantity` still shows 0 via the COALESCE blend.
- The manual daily-limit lane is in real daily use (~306 portions/day counted,
  2–3 manual caps, holds active).
- Prod already runs the 20260703150000 availability body.

## Root defects (agreed by all four lenses)

1. **One flag fuses two decisions.** `pos_stock_outcome_posting` drives both
   stock-movement posting (trừ kho) and the availability stock leg (chặn bán).
   It has **no UI** — flippable only by SQL — while the visible switch
   ("Bán theo tồn kho") controls a different, never-enabled kitchen trigger.
2. **Capacity NULL → 0.** `compute_menu_item_stock_capacity` returns NULL for
   "no recipe OR broken unit conversion"; the availability CASE maps that to 0
   under the flag — no-recipe items render permanently sold out, and no manual
   escape hatch exists (`set_branch_menu_daily_limit` raises
   `stock capacity required` for capacity-NULL items).
3. **The Giới hạn bán page lies.** RPC `limit_quantity` =
   `COALESCE(manual, live capacity)`; the table pre-fills capacity as if it
   were a manual limit and saving persists it; "Còn lại" is computed with a
   third client formula that ignores holds/pending; clear button doesn't
   render; empty input rejected; disable-toggle hostage to capacity
   validation.
4. **Display ≠ enforcement.** POS can grey out items the DB would happily
   sell; the only hard stock trigger reads a *different* stock pool (kitchen)
   behind a *different* flag; four divergent demand explosions exist.
5. **"Tắt trừ kho" is currently a lie at one edge:** legacy
   `consume_stock_for_order` (Path 2) is flag-free, granted to
   `authenticated`, deducts kitchen stock and hard-fails served→completed on
   shortage; its idempotency hole vs Path 1 allows double deduction.
   Verified: zero live repo callers — latent, not live.
6. Dead weight everywhere: `accepted_today` ≡ `sold_today`,
   `stock_capacity_live` ≡ `stock_capacity`, 5 of 11 RPC fields unused by any
   consumer, persisted `stock_capacity` column maintained by triggers but
   unread, dead KDS-86 stack pinned by tests, `payments.stock_consumed_status`
   has zero writers (refund stock-restore is dead code), refund GUC
   comment-vs-code contradiction on `sold_today`.

## Lens positions (condensed)

- **PM:** two-phase repair, not redesign. Fail-open is the product default —
  a false block costs lunch-rush revenue; a false allow costs one plate.
  Critical catch: "no-recipe = unlimited" alone defuses nothing today (all 22
  items have recipes); the load-bearing fix is decoupling deduct from block.
  MVP must land before the owner re-enables posting. No new hard blocks.
- **BA:** five orthogonal controls (Ngưng bán tenant → Tắt món hôm nay →
  Giới hạn tay → Chặn theo tồn → Trừ kho), precedence strict;
  `GATE_eff = GATE AND DED`; NULL doctrine (capacity NULL never blocks,
  anywhere); full decision table (14-row spanning set); enforcement = display;
  reason codes on every zero; one demand explosion; business-date =
  VN calendar date of the quota-consuming event.
- **Senior Dev:** Option (a) — keep `pos_stock_outcome_posting` posting-only,
  add `pos_stock_availability_gate` (default OFF) as the sole availability
  input; per-item opt-out = recipe presence, no second boolean. TS-first,
  DB-second sequencing (prod apply lags deploy). Five function-level forward
  migrations; REVOKE Path 2 from authenticated; widen Path-1 idempotency.
  Behavioral rollback = flags OFF reproduces today exactly.
- **QA:** the RPC boundary is a compiler blind spot (untyped rpc casts,
  5 copies of the shape, realtime fabricates 7 of 11 fields); enumerated the
  pinned tests that must consciously flip (several pin *archived* migration
  text and would stay green while asserting dead semantics); no live capacity
  compute inside the INSERT trigger (POS latency); two non-negotiable
  prerequisites: resolve the refund-void quota contradiction explicitly, and
  land D016/D053 decision edits before implementation.

## Conflicts and resolutions

1. **BA's new hard stock-gate trigger (enforcement = display) vs PM's "no new
   hard blocks" + QA's trigger-latency bound.** → Phase 1 ships the stock gate
   as **display/POS-advisory only** (server RPC computes it, client gates on
   it, no new order-write trigger). Rationale: single-digit terminals, race
   window ≈ seconds, oversell cost = one plate, and the pilot failure was
   over-blocking, not overselling. The manual lane keeps its existing hard
   triggers unchanged. Recorded as designed behavior, not a gap. Revisit only
   on a real oversell incident.
2. **BA's `GATE_eff = GATE AND DED` coupling vs Dev's independent flags.** →
   Adopt the coupling. Gating on a ledger that deduction isn't maintaining is
   exactly the 07-03 lockout reproduced. UI: gate switch disabled with
   explanation while deduction is off.
3. **Broken-unit-config = fail-open (BA/PM) vs pilot doc fail-closed.** →
   Fail-open for selling, fail-loud for visibility: capacity-NULL items sell
   unlimited; the manager page badges them (has-recipe vs missing-conversion)
   so "ungated because unconfigured" is visible. Supersedes pilot rule
   (`phuoc-hai-stock-control-pilot-config-2026-06-30.md:174`).
4. **Own-hold exclusion now (Dev M1) vs Phase 2 (PM).** → Include the
   `p_exclude_hold_tokens` param in M1's DROP+CREATE (avoids a second shape
   change later); client wiring may trail. QA invariant: exactly ONE side
   credits own holds — once the server excludes, the client add-back is
   removed in the same PR.
5. **Kitchen gate `pos_ingredient_stock_block` retire (BA) vs contain
   (PM/Dev).** → Phase 1: freeze do-not-enable + relabel the settings card so
   it stops masquerading as the availability switch. Trigger/flag removal is a
   later cleanup, owner-acknowledged (reverses his 2026-06-28 decision).

## Unified task contract

### Concept model (canonical, ratify glossary with owner)

| Control | Grain | Storage | Owner surface |
| --- | --- | --- | --- |
| Ngưng bán (menu) | tenant × item | `menu_items.is_active` | `/menu` (existing) |
| Tắt món hôm nay | branch × item × day | `is_disabled` on limits row | Giới hạn bán page — must work for EVERY active item |
| Giới hạn bán (tay) | branch × item × day | `limit_quantity` (raw manual only) | Giới hạn bán page |
| Chặn bán theo tồn (GATE) | branch | new flag `pos_stock_availability_gate` | `/br/{id}/settings/pos` switch (new) |
| Trừ kho khi bán (DED) | branch | `pos_stock_outcome_posting` | `/br/{id}/settings/pos` switch (new UI) |

Precedence: is_active → is_disabled → min(manual lane, stock lane) →
unlimited. `GATE_eff = GATE AND DED`. NULL = unlimited, never 0, both lanes,
display and gating. Per-item stock opt-out = recipe presence (a recipe-less
item is outside stock control by definition; no sixth switch).

### Core availability semantics (replaces current CASE)

```
stock_remaining  = NULL                      when NOT GATE_eff
                 = NULL                      when capacity IS NULL   -- no recipe / broken config
                 = capacity − pending − foreign_holds  otherwise
manual_remaining = NULL                      when manual limit IS NULL
                 = manual − sold_today − foreign_holds otherwise
available_to_sell = 0 if is_disabled
                  = NULL if both legs NULL (unlimited)
                  = GREATEST(0, LEAST(non-null legs))
```

Every zero carries a reason (disabled_day / manual_exhausted /
stock_exhausted) so POS toasts stop reporting stock zeros as "hết suất".

**Limit-ratchet paradox (owner-reported 2026-07-04, named invariant).**
Repro on current code with deduction ON: capacity 100, no manual limit →
"Giới hạn" column shows 100 (COALESCE blend); sell 51 → stock deducts,
capacity recomputes to 49, blend shows "Giới hạn 49 / Đã bán 51" and the
client fallback `min(limit, capacity) − sold = −2` blocks sales while 49
portions of stock remain. Three cooperating causes: the COALESCE blend, the
`limit ≤ capacity` validation (server raise + input `max`), and the client
fallback subtracting `sold_today` from a live-shrinking capacity —
double-counting demand once via the ledger and once via the counter.
Invariant: a number compared against cumulative `sold_today` must be fixed at
set time (manual limit); a number that shrinks with sales (live capacity) may
only be compared against remaining demand (pending + holds), never against
`sold_today`; the manual limit is never seeded or clamped from capacity. Add
this exact 100→51 scenario as a named decision-table test row
(`limit_ratchet`) in the PR-2 SQL suite and a client gate unit test in PR-1.

### Implementation plan (phased; PR = separate worktree, fresh full gate)

**PR-1 (TS only, deployable immediately):**
- Manager page truth: render raw `manual_limit_quantity` (empty = "Không
  giới hạn"), wire the existing clear action as a button, "Còn lại" =
  `available_to_sell`, drop client capacity-coupling validation, badge
  capacity-NULL items, glossary pass (kill "Hạn mức bán" drift).
- POS client: collapse the three remaining-formulas onto server
  `available_to_sell` (NULL = unlimited); delete the `effectiveDailyCap`
  fallback and `dailyLimitRemaining`; demote realtime merge to
  refetch-trigger; split stock-vs-quota toast copy.
- Settings: two switches ("Trừ kho khi bán", "Giới hạn bán theo tồn kho" —
  disabled while DED off) via existing `branch_feature_flags` upsert pattern +
  flag registry; relabel the ingredient-block card.
- Rewrite the pinned tests that assert the old formulas (list in QA report;
  each flip justified one line in the PR body).

**PR-2 (DB + types), migrations in order:**
- M1 `menu_availability_gate_split`: DROP+CREATE
  `branch_menu_limit_availability` (gate param, capacity-NULL→NULL,
  `p_exclude_hold_tokens uuid[]`), `get_branch_menu_daily_limits_for_pos`
  (source = gate flag, row filter keyed on gate), REPLACE
  `list_branch_menu_daily_limits`. Inert while flags OFF.
- M2 `menu_manual_limit_decouple` — **moved INTO PR-1**
  (`20260704120000_menu_manual_limit_decouple.sql`) because the new UI on the
  old RPCs is a P0 hazard: old `set` COALESCEs a NULL limit to live capacity
  (currently 0 → saving an empty box would lock the item) and old `clear`
  freezes the persisted capacity snapshot into the manual limit. New
  semantics: `set` never defaults/clamps from capacity and accepts
  disable-only rows; `clear` nulls `limit_quantity` + re-enables while
  KEEPING the row so `sold_today` survives a mid-day re-limit (deleting the
  row would reset the counter and over-permit — refines the earlier "truly
  deletes" wording, D064 §3). Apply order: owner applies M2 BEFORE the PR-1
  deploy (old UI is safe on M2: its client pre-checks are stricter and the
  clear action had no UI caller). Apply off-peak.
- M3 `path2_lockdown_posting_idempotency`: REVOKE `transition_order_status`
  FROM authenticated (check prod PostgREST logs first); widen
  `post_pos_sale_consumption_if_ready` idempotency to any `consumption` row.
  **Hard prerequisite before the owner re-enables posting.**
- `pnpm db:types` + delete the untyped rpc casts in `menu-actions.ts`;
  re-index codegraph.

**PR-3 (cleanup, after PR-1 deploy + PR-2 apply verified):**
- M5 `menu_availability_slim_fields`: drop `accepted_today`,
  `stock_capacity_live`, blended `limit_quantity` from the three RPCs; drop
  the two `stock_capacity` refresh triggers (stops auto-created "manual"
  rows). Column itself stays (additive-only), drop queued owner-gated.
- POS "còn N" card display when finite (D053 §3 clarification), reorder-path
  client gate, dead KDS-86 client stack removal + ACL doc-comment fix.

**M4 (owner-decision-gated):** refund-void quota rule (proposed: first-ready
boundary — portion made ⇒ quota stays consumed; not made ⇒ freed) +
`payments.stock_consumed_status` (write it or delete its readers) — must be
settled before posting re-enable, else refunds silently never restore stock.

### Re-enable runbook (the decoupling payoff)

GRN opening balances → flip DED ON (ledger resumes, **zero sales impact**) →
observe ledger days ("shadow mode") → optionally flip GATE ON per branch →
7-day acceptance: no "toàn bộ menu còn 0", no POS block the DB would accept.

### Test plan (owned by QA report; highlights)

14-row SQL decision-table suite on the supabase-local full chain (bringup
script), manual-lane bit-identical regression before client collapse,
last-portion concurrency with own-token exclusion, cross-midnight append,
paid-but-not-ready gap accounting, tz fix for `daily-limit-realtime.spec.ts`,
SECURITY DEFINER static gate for every replaced fn, fresh-worktree full gate,
owner prod probes post-apply (flags per branch, availability sample with both
args, sold_today vs order_items integrity, stuck holds, P0001 rate).

### Decision-log edits required BEFORE implementation

1. New D-row: 2026-07-04 owner ruling — fail-open NULL doctrine (supersedes
   pilot fail-closed), two-flag split, GATE_eff coupling, advisory stock gate.
2. D053 §1 amendment: name both flags + rollback ladder (GATE off → DED off).
3. D016 consequences: replace webhook-500 clause; Path 2 REVOKE recorded.
4. Superseding note in `2026-06-28-pos-ingredient-stock-limit.md` (kitchen
   gate frozen); refresh stale status line in the Phước Hải pilot doc.

### Owner decision points — DECIDED 2026-07-04, recorded as D064

| # | Question | Owner decision |
| --- | --- | --- |
| OD1 | Two switches (Trừ kho / Chặn bán theo tồn, gate only effective with deduction on)? | **YES** (D064 §1) |
| OD2 | Freeze + later remove the kitchen hard-block flag? | **REMOVE FULLY** (owner confirmed 2026-07-04 after explanation, D064 §7): PR-1 hides the card; PR-3 removes the ingredient-cap client stack (TS first), then a drop migration for `trg_enforce_ingredient_stock` + `enforce_branch_ingredient_stock` + `get_branch_menu_ingredient_caps_for_pos` + flag rows |
| OD3 | Paid-then-voided order: does the portion return to today's quota? | **First-ready boundary** — made ⇒ no return; not made ⇒ return (D064 §5) |
| OD4 | POS card display? | **YES, stronger than default:** "Còn N phần" shown directly on the menu card whenever finite (not only when low), reason badge at 0 (D064 §6) |

### Stage-6 cross-runtime handoff (pre-land, per team.md)

Each PR gets an independent `codex review` pass with: this contract, the four
lane reports, the QA flip-list (which pinned assertions were retired vs
re-anchored), and pass/fail criteria = manual-lane invariants + decision-table
outputs. Arbitration per team.md → Arbitration.
