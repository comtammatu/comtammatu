# POS Daily Limit Holds - 2026-06-10

## Scope

Surface: POS order creation and append flow.
Primary job: when only one portion remains, the first POS cart that reserves it gets the right to submit it.
Change type: T3 database/RPC concurrency fix with minimal UI wiring.

## T3 Perspectives

PM: The rule is economic, not visual: remaining quota must be allocated by the database, not by two browser tabs reading the same stale number. The operator should see fewer buttons, not a manual "claim" step.

BA: Existing `sold_today` remains accepted sales. A new short-lived hold represents draft demand only until submit, cancel, clear, or expiry. Existing clients can still submit when no live hold blocks them.

Senior Dev: Add a `branch_menu_item_daily_holds` table plus reserve/release RPCs. The reserve RPC locks relevant daily-limit rows in `menu_item_id ASC`, replaces the caller token snapshot atomically, and excludes that token when checking availability. The order insert trigger also subtracts active holds from capacity and lets `create_order` / `append_order_items` exclude the caller token via a transaction-local GUC.

QA: Verify the same item as main and side is aggregated once, disabled items fail at reserve and submit, two concurrent reserve attempts for the last portion produce one success and one `daily_limit_exceeded`, expired holds no longer block, and append flow obeys the same rule as new order flow.

## Contract

- Hold TTL defaults to 180 seconds and is capped by the RPC.
- Hold state is server-side only; no scope or entitlement is stored in browser storage.
- Checkout commits matching active holds to the resulting order.
- Submit without a hold token remains possible, but cannot consume quota already held by someone else.

## T2 Follow-up - Item-Specific Sold-Out Messages

Skill plan: repo rules = engineering + database + ui + workflow; external skills = Supabase + shadcn; runtime tools = SQL migration review + TypeScript gates; skipped = no shadcn CLI because this is toast copy and action mapping, not primitive/component work.

PM: scope = make sold-out failures actionable for waiter/cashier; acceptance = toast names the blocked main item or side item; priority = frontline speed during service.

BA: rules = never expose raw Postgres messages; disabled and exhausted limits need distinct copy; if another terminal holds the last portion, tell staff that the item is currently held or unavailable.

Senior Dev: approach = add structured `DETAIL` JSON to daily-limit RPC/trigger exceptions, parse it in the POS action layer, and map `menu_item_id` to cart/sides labels already present in the request payload.

QA: tests = typecheck/lint/build plus targeted review of fallback parsing for old message shape; regressions = RPC-ERROR-MUST-MAP-OR-LOG-UNMAPPED and RPC-STRUCTURED-FAILURE-DETAIL.
