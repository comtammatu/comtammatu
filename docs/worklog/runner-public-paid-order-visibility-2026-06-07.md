# Runner Public Paid-Order Visibility - 2026-06-07

Surface: `/br/[branchId]/runner`
Primary user job: khach xem thu tu don dang cho bep xu ly tren man hinh Runner.
Route family: branch-scoped customer display.
Change type: public read-only route plus queue visibility correction.
Primitives: existing Runner board cells, footer, realtime refresh with poll fallback.

## T3 Debate

PM: Scope is urgent Runner correctness only. Done means customers can open the Runner screen without login, and paid/prepaid takeaway orders stay visible while kitchen tickets are still pending or preparing.

BA: Payment state must not decide Runner disappearance. KDS ticket state is the workflow source: pending/preparing remain visible; once there is no visible kitchen work for that order/batch, the board can fall back to empty. Cancelled orders remain hidden.

Senior Dev: Keep POS/KDS mutations behind existing authenticated actions/RPCs. Make Runner public at route-resolution, use a server-only service client for minimal read columns, and bind every service-role query to the branch tenant id discovered from `branches`.

QA/QC: Add tests for public Runner path, for the page no longer using `loadAuthState`, and for completed paid orders with active tickets. Run targeted shared/web tests, then the repo gates.

## Resolution

- Runner is a customer display route, not an operator action route.
- No table is granted to `anon`; the server component owns the public read shape.
- `order.status = completed` can mean payment completion and must not hide active kitchen tickets.
- `order.status = cancelled` remains hidden.
