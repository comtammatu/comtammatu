# ADR 0024 — Branch business-day summary without manual day-close ceremony

**Status:** Accepted — shipped (Owner 2026-08-08). Product UI is Daily Summary
only; `close_branch_day` returns `branch_day_close_retired`.

**Decision owner:** Owner

**Review tier:** T3 — operational day boundary, POS/finance summary contract

**Supersedes informal plan wording** that equated
`VN_BUSINESS_DAY_CUTOFF_HOUR = 4` with “automatic day close / khóa sổ”.

## Context

Operators need a clear **business day** window for branch reporting (POS
sessions, stock issues, attendance checkout, revenue totals). The codebase
already defines that window at **04:00** local (`VN_BUSINESS_DAY_CUTOFF_HOUR`,
SQL `branch_business_day_bounds` / `branch_business_date`).

Separately, the product used to have a **manual day-close ceremony**:

- UI: `/br/[branchId]/close-day` with Submit → `closeBranchDay` Server Action
- RPC: `public.close_branch_day`
- State: `branch_day_state.is_closed` (+ cash recon snapshot fields)

Owner direction (2026-08-08): remove the mandatory “Chốt ngày” button. The
route is a **Daily Operational Summary** that always reflects live
aggregates for the selected business date. Forgetting to press a button must
not block the next calendar morning’s open session.

Finance remains operational, not a General Ledger close (D020).

## Decision

### 1. Two concepts — never conflate

| Concept | Meaning | Writes `is_closed`? |
| --- | --- | --- |
| **Business-day window** | Half-open interval `[D 04:00, (D+1) 04:00)` in branch timezone (fallback `Asia/Ho_Chi_Minh`) | **No** |
| **Day-close ceremony** | Operator Submit that called `close_branch_day` and persisted `branch_day_state.is_closed` | Retired from product |

- Clock passing 04:00 **only** advances which business date a timestamp belongs
  to. It does **not** lock inventory, POS, attendance, or “đóng sổ”.
- Docs, UI copy, and agents must not say “tự động đóng sổ / tự động chốt ngày”
  when they mean the cut-off window.

### 2. Product surface

- `/br/[branchId]/close-day` (name may later become `/daily-summary`; rename
  is optional and not required by this ADR) is a **read-only Daily Summary**
  for a chosen business date.
- **No** Submit / “Chốt ngày” primary action for Branch Manager or cashier.
- Summary blocks remain: POS sessions, stock/count attention, HR checkout
  attention, revenue totals — driven by `get_branch_day_summary` (and related
  read RPCs), not by a close ceremony.

### 3. Data and RPC posture (implementation PR)

- **Deprecate and remove** the operator path to `close_branch_day` (Server
  Action + UI). Prefer dropping or hard-disabling the RPC in the same program
  so anonymous/scripted callers cannot reintroduce the ceremony.
- Historical `branch_day_state` rows already closed may remain for audit; new
  business dates **must not require** a close row to view a complete summary.
- Do not replace the button with a cron that sets `is_closed = true` at 04:00.
  That would reintroduce false “đóng sổ” semantics.

### 4. Cash control stays on POS session close

- Financial SSOT for cash remains **POS session close**: cashier enters
  `closing_cash` manually; `expected_cash = opening_cash + cash_revenue`
  (`docs/modules/finance.md`); next cashier enters `opening_cash` manually.
- **Rejected:** `carryover_cash` column, DB default `2000000`, or silent
  prefilling that replaces counted open/close amounts. Counted cash in / cash
  out stays 100% manual.

### 5. Known reporting gap (do not paper over)

- `docs/ref/operational-data-contract.md` notes that some finance/order filters
  still use calendar `00:00–24:00` VN while branch-day summary uses 04:00.
- Daily Summary must cite the branch-day contract and must not claim identity
  with unaligned finance cards until a separate finance-window alignment lands.

## Rejected options

- Keeping a mandatory “Chốt ngày” button “just in case”.
- Cron / cut-off trigger that writes `branch_day_state.is_closed`.
- Treating cut-off as GL period close or inventory lock.
- `carryover_cash` as a substitute for counted `opening_cash` / `closing_cash`.
- Informal plan label “no ADR needed for P2.1” — this ADR **is** required
  before implementation.

## Consequences

- Implementation updates UI, messages, Server Actions, RPC/tests, and
  `docs/ref/operational-data-contract.md` in the same program.
- Until that PR ships, runtime still has the Submit button; agents must treat
  **this ADR as product authority** and must not teach operators that 04:00
  already auto-closes the day.
- Agents must cite **ADR 0024**, not “auto close-day” slang without the split
  table above.

## Authority

- `docs/plan/decisions.md` — D020, D050
- `docs/modules/finance.md` — POS cash formula
- `docs/ref/operational-data-contract.md` — branch business-day window
- `packages/shared/src/time/vietnam.ts` — `VN_BUSINESS_DAY_CUTOFF_HOUR`
- `docs/ref/branch-operations.md` (ops intent; this ADR wins on
  conflict)
