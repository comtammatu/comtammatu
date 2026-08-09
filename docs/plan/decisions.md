# Compatibility Decision Index

> `Dxxx` codes are kept so inbound references stay meaningful. This file is not
> a backlog, worklog, or detailed authority. ADR, spec, ref, module docs, and
> rules named in each entry own the detail. Superseded decisions are deleted;
> Git keeps history.

Do not create new `Dxxx` codes for tasks or implementation notes. New architecture
changes use an ADR. When no inbound reference remains, delete the compatibility
entry.

## D009: Path-based routing
**Net effect:** Owner `/`; Branch `/br/[branchId]/*`; self-service `/me/*` (Owner denied); ACL at proxy + module ACL. Canonical: `docs/spec/architecture.md`, ADR 0012.

## D011: Print-agent LAN-only
**Net effect:** `apps/print-agent` supports LAN printers only; no USB or runtime transport switch. Canonical: `docs/modules/infrastructure.md`.

## D012: Lean operations
**Net effect:** PWA is the operations client; no Local-first POS / native rewrite / non-consumer payment rail; floor role is `cashier`; shift-lead void exception per ADR 0023. Canonical: ADR 0023.

## D015: `main` is the Production track for CTCP Chén Sứ
**Net effect:** `main` serves CTCP Chén Sứ only; sole Production stack is Vercel `comtammatu` / Supabase `enloyfnuerqgaqderbwb` / `web.comtammatu.com`. Canonical: `docs/agent/rules/database.md`, ADR 0016.

## D016: POS stock outcome
**Net effect:** Stock deducts from final order outcome and feature contract; no client/payment UI stock mutation. Canonical: `docs/ref/operational-data-contract.md`.

## D017: Owner L0, Branch Manager L1
**Net effect:** Owner governs the tenant; Branch Manager operates one branch; Self plane is not an admin tier. Canonical: ADR 0012, `docs/spec/role-route-matrix.md`.

## D019: Control surface and branch surface
**Net effect:** `control_surface` uses shared management chrome; `branch_surface` uses operator/station chrome; one capability maps to one home route. Canonical: `docs/spec/design-system.md`, `docs/spec/role-route-matrix.md`.

## D020: Operational finance, not enterprise GL
**Net effect:** No GL / Circular 200 / VAS close UI; 04:00 business-day window is not book close; manual Chốt ngày ceremony removed (ADR 0024). Canonical: `docs/modules/finance.md`, ADR 0016, ADR 0024.

## D023: Corrections outside POS
**Net effect:** Payment / HĐĐT corrections belong to Owner/Accountant; POS only does contracted full void-after-paid. Canonical: `docs/modules/finance.md`.

## D026: HR around Person, attendance day, and payroll
**Net effect:** HR reads operations sources; payroll snapshots on close; `pay_basis` from HĐLĐ; both bases use `working_days` (D027 / ADR 0019); HR closes obligations, Finance records payment. Canonical: `docs/ref/payroll-pit.md`, `docs/ref/labor-contracts.md`, ADR 0019.

## D027: Shift-based attendance
**Net effect:** Attendance follows assigned shifts; work credit is hours / freeze window capped at 1.0 per shift; Owner does not punch; floor checkout needs Branch Manager approval. Canonical: `docs/spec/database-schema.md`, `docs/ref/payroll-pit.md`, ADR 0019.

## D028: Kết quả vận hành and ingredient control
**Net effect:** Consumption follows physical counts and the stock ledger; Finance shows Kết quả vận hành / cash flow / fund balances, not Lợi nhuận ròng. Canonical: `docs/ref/operational-data-contract.md`, `docs/modules/finance.md`.

## D030: Ratchet allowlist
**Net effect:** Guard allowlists are classified false-positive floors, not a backlog to force to zero with cosmetic edits.

## D046: Foreground notification
**Net effect:** Device popups only while the PWA is open; no server Web Push layer. Canonical: `docs/spec/toast-notification-system.md`.

## D048: Person and branch IA
**Net effect:** HR owns people/accounts; Branch management owns sites; no second roster/admin surface.

## D049: Full void-after-paid
**Net effect:** POS only full-voids via atomic correction; partial correction is Owner/Accountant; shift-lead authority per ADR 0023; no refund rail. Canonical: ADR 0023.

## D050: Operator workspace
**Net effect:** Branch daily work lives under `/br/[branchId]/*`, mobile-first, scoped from URL and verified claims. Canonical: ADR 0012.

## D052: Position shift tasks
**Net effect:** `position_shift_tasks` is the SSOT for in-shift work; clock-in snapshots tasks; do not revive `shift_checklist_templates`.

## D058: Two presentation planes, one contract
**Net effect:** Management and Branch presentation differ in chrome but share domain contract, route identity, and shared records.

## D062: PWA delivery
**Net effect:** PWA is the operations client direction; native rewrite only when a hardware constraint cannot be solved with PWA.

## D064: POS capacity and quota
**Net effect:** Manual quota and stock availability are distinct sources; NULL capacity fails open; hold tokens prevent double-count. Canonical: `docs/ref/operational-data-contract.md`.

## D065: One stock-sale-outcome switch
**Net effect:** Enabling stock outcome also enables availability signalling and posting; posting races fail soft; stocktake detects drift. The no-negative-at-posting clause is reversed by ADR 0026 (post-and-flag after payment). Pre-order `enforce_branch_stock_availability` stays a hard block for cashiers/floor staff; Branch Manager may reopen the sell path only on the menu-limits page via re-enable and/or a dedicated daily sellable-allowance field (`stock_allowance_quantity` — adds N portions on top of stock-derived remaining; not absolute daily sellable; not ignore-stock; not `Bổ sung tồn kho` ledger replenish; no POS PIN) without skipping posting. Canonical: ADR 0026.

## D069: Typography and night mode
**Net effect:** Geist heading/body, Geist Mono for data; warm-dark night mode via cookie; print unaffected. Canonical: `docs/spec/design-system.md`.

## D075: Self-order uses canonical POS order
**Net effect:** Self-order creates only the canonical POS order through the server; no parallel session/order store. Canonical: `docs/spec/self-order-guest-ui.md`.

## D076: Application roles
**Net effect:** Role/permission/route audience live in `packages/shared/src/auth/` and the role-route matrix; HR position is not a second auth layer.

## D091: Inventory topology and physical QC
**Net effect:** Each active site has one active warehouse; GRN records received/rejected (+ reason/photo); no lot / expiry / temperature / price-QC. Canonical: `docs/ref/inventory.md`.

## D093: Central-only GRN and branch stock request
**Net effect:** GRN is Central Supply/Kitchen only; Branch requests stock and receives transfers; no Branch production/GRN. Canonical: `docs/ref/inventory.md` §11.

## D099: Nhu cầu mua and supplier selection
**Net effect:** Warehouse drafts Nhu cầu mua without NCC/price; when chỉ có một NCC active then auto PO; Kế toán chỉ chọn hoặc chia số lượng khi có nhiều NCC; lines bị chặn để bổ sung mapping before creating PO/NCC; GRN nháp/PO carry no price; Hóa đơn NCC is the price authority. Canonical: `docs/ref/inventory.md`, ADR 0017.

## D101: Inventory valuation settlement
**Net effect:** Moving WAC continues; Valuation subledger append-only settles Hóa đơn NCC and không tăng số lượng lần hai; legacy variance posts as `legacy_purchase_price_variance`. Canonical: `docs/ref/inventory.md`, ADR 0017.

## D103: Food-delivery platform onboarding before adapters
**Net effect:** Food-delivery adapters ship only after partner approval and a signed contract; until then, onboarding/readiness only. Canonical: `docs/runbooks/food-delivery-platform-onboarding.md`, `docs/ref/branch-operations.md`.
