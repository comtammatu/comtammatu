# ADR 0024 — Branch business-day summary without manual day-close ceremony

**Status:** Accepted — shipped (Owner 2026-08-08). Product UI is Daily Summary
only; `close_branch_day` returns `branch_day_close_retired`.

**Decision owner:** Owner

**Review tier:** T3 — operational day boundary, POS/finance summary contract

**Supersedes informal plan wording** that equated
`VN_BUSINESS_DAY_CUTOFF_HOUR = 4` with “automatic day close / khóa sổ”.

## Context

Operators need a clear **business day** window for branch reporting. The
codebase already defines that window at **04:00** local
(`VN_BUSINESS_DAY_CUTOFF_HOUR`, SQL `branch_business_day_bounds` /
`branch_business_date`). Separately, the product had a manual day-close
ceremony (`/br/[branchId]/close-day` → `close_branch_day` →
`branch_day_state.is_closed`). Owner direction: remove mandatory “Chốt ngày”;
forgetting a button must not block the next morning. Finance stays operational,
not GL close (D020).

## Decision

### 1. Two concepts — never conflate

| Concept | Meaning | Writes `is_closed`? |
| --- | --- | --- |
| **Business-day window** | Half-open `[D 04:00, (D+1) 04:00)` in branch TZ (fallback `Asia/Ho_Chi_Minh`) | **No** |
| **Day-close ceremony** | Operator Submit that persisted `branch_day_state.is_closed` | Retired from product |

Clock passing 04:00 only advances which business date a timestamp belongs to.
It does not lock inventory, POS, attendance, or “đóng sổ”. Docs/UI/agents must
not say “tự động đóng sổ / tự động chốt ngày” for the cut-off window.

### 2. Product surface

- `/br/[branchId]/close-day` (optional later rename `/daily-summary`) is a
  **read-only Daily Summary** for a chosen business date.
- No Submit / “Chốt ngày” for Branch Manager or cashier.
- Blocks remain POS sessions, stock/count attention, HR checkout attention,
  revenue totals via `get_branch_day_summary` (and related reads).

### 3. Data / RPC

- Operator path to `close_branch_day` removed; RPC hard-disabled
  (`branch_day_close_retired`).
- Historical closed `branch_day_state` rows may remain for audit; new dates do
  not require a close row for a complete summary.
- Do not cron-set `is_closed = true` at 04:00.

### 4. Cash control stays on POS session close

- SSOT: cashier enters `closing_cash`; `expected_cash = opening_cash + cash_revenue`
  (`docs/modules/finance.md`); next cashier enters `opening_cash` manually.
- Rejected: `carryover_cash`, DB default `2000000`, or silent prefilling.

### 5. Known reporting gap

Some finance/order filters still use calendar `00:00–24:00` VN while
branch-day summary uses 04:00 (`docs/ref/operational-data-contract.md`).
Daily Summary must not claim identity with unaligned finance cards until a
separate alignment lands.

Rejected: mandatory “Chốt ngày”; cut-off as GL/inventory lock; treating this
change as “no ADR needed”.

## Consequences

- Agents cite **ADR 0024** and the split table above — not “auto close-day”
  slang.
- Authority: D020/D050; `docs/modules/finance.md`;
  `docs/ref/operational-data-contract.md`;
  `packages/shared/src/time/vietnam.ts`; `docs/ref/branch-operations.md`
  (this ADR wins on conflict).

## Verification

- UI has no day-close Submit; `close_branch_day` returns retired error.
- Summary reads live aggregates for the selected business date without requiring
  `is_closed`.
- POS session open/close cash remains fully manual.
