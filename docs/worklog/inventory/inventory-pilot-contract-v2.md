# Inventory Pilot Contract V2

> Date: `2026-04-27`
> Status: execution handoff
> Scope: docs/runtime contract for the ready-to-ship Inventory pilot.

## Decision

Inventory pilot readiness is the daily operating loop across four points:

1. `Kho Tổng / central_warehouse`
2. `Bếp Trung Tâm / central_kitchen`
3. `Kho Chi Nhánh / branch warehouse location`
4. `Bếp Chi Nhánh / branch kitchen/default consumption location`

Ready-to-ship does not mean every Inventory route is complete. It means this loop works end-to-end with clear role-based tasks, correct stock ledger impact, and evidence.

## Runtime Contract

- `NCC -> Kho Tổng`: PO/GRN minimal flow, actual received quantity, WAC update.
- `Kho Tổng -> Bếp Trung Tâm`: inter-site `stock_transfer` using the 5-step state machine.
- `Bếp Trung Tâm`: production order by BOM, atomic consumption/output, WAC-derived cost.
- `Bếp Trung Tâm -> Kho Chi Nhánh`: inter-site `stock_transfer` using the 5-step state machine.
- `Kho Tổng -> Kho Chi Nhánh`: direct inter-site `stock_transfer` for items that do not need central kitchen.
- `Kho Chi Nhánh -> Bếp Chi Nhánh`: atomic one-step intra-branch `stock_transfer`.
- `Bếp Chi Nhánh / POS`: consume from `default_consumption` location. Missing `default_consumption` is a setup error and must fail/block early; do not fallback silently.
- `Stocktake`: open, count, complete, and post adjustments with evidence.

`stock_issue(issue_type = kitchen_use)` is retired. It must not appear as a live SOP, UI option, Zod enum, seed, or SQL check value.

## Permission Contract

- `warehouse_manager`: create/ship transfers from CW to CK or branch; run CW inventory operations.
- `production_manager`: receive CW -> CK, create/confirm production, ship CK -> branch.
- `branch_manager`: receive inbound transfers and create/commit intra-branch `Cấp bếp`; no branch outbound inter-site shipping.
- `owner` / `area_manager`: oversight, exception review, reports; not default daily operators.
- `cashier` / `chef`: no full Inventory access; POS/KDS only unless a narrow future surface is explicitly designed.

App-layer and RPC-layer gates must both use the correct keys:

- `inventory:transfer_create`
- `inventory:transfer_ship`
- `inventory:transfer_receive`

`SECURITY DEFINER` transfer/issue RPCs are the source of truth and must not rely only on Server Action checks.

## UX Contract

Inventory UI must be task-first:

- `Tổng quan` -> `Hôm nay`
- `Thao tác nhanh` -> `Việc cần làm ngay`
- Branch quick actions: `Nhận hàng`, `Cấp bếp`, `Kiểm kê`, `Tồn cần xử lý`
- Central kitchen quick actions: `Nhận nguyên liệu`, `Sản xuất`, `Xuất thành phẩm`, `Tồn bếp`
- CW quick actions: `Nhập NCC`, `Xuất hàng`, `Tồn kho`, `Kiểm kê`
- Owner/area landing: exception and oversight, not operator CTAs.

The three open P1 evidence items are Definition of Done for the pilot:

- `INV-UIUX-001`: branch transfer CTA must not present inter-site create as the primary action.
- `INV-UIUX-002`: branch issues/export placeholder must not sit beside a live daily action.
- `INV-UIUX-005`: owner dashboard must not be framed as operator workspace.

## Deferred From Pilot

- Supplier invoice/payment/AP aging and payment proposal
- Supplier returns and credit notes
- Trust score, cold-chain, feature flags as frontline UI
- Auto-waste and waste tiers beyond minimal write-off/consumption
- Stocktake conflicts/recount/unblind as branch daily surface
- Barcode/bin/WMS, vendor portal, multi-level approvals
- Labor/overhead/WIP costing

These may exist in code, but pilot nav must not make them part of the daily path unless a new owner decision reopens scope.

## P0 Execution List

1. Docs cleanup: every active docs/SOP/runbook reference must point to intra-branch transfer, not live `kitchen_use`.
2. DB migration: add permission checks inside transfer/issue `SECURITY DEFINER` RPCs.
3. DB migration: enforce transfer/issue/movement locations belong to the declared branch.
4. DB migration: add atomic one-step intra-branch transfer RPC, e.g. `commit_intra_branch_transfer`.
5. App actions: split transfer permissions by create/ship/receive.
6. App actions/UI: restrict branch manager to inbound receive + intra-branch `Cấp bếp`.
7. POS setup gate: missing `default_consumption` must fail/block early and direct setup, not fallback.
8. UX/nav: task-first IA and close P1 evidence items.

## Verification Gates

Commands:

```bash
pnpm typecheck
pnpm lint
pnpm build
supabase migration list --linked --output json
supabase db push --linked --include-all --dry-run
supabase db lint --linked --schema public,auth,storage --level warning --fail-on none --output json
```

Repository grep gate:

- `kitchen_use` is allowed only in historical migrations, runtime rejection tests, and comments that explicitly say it is retired.
- No live docs, live UI labels, Zod enums, seeds, or SQL constraints may reintroduce it.

Smoke evidence:

- Before/after `stock_levels` rows for GRN, CW -> CK, CK production, CK/CW -> branch, branch warehouse -> branch kitchen, POS consumption, stocktake.
- Persona screenshots/logs for `warehouse_manager`, `production_manager`, `branch_manager`, `owner`/`area_manager`, and negative `cashier`/`chef`.
- Role-template/permission snapshot before and after the cutover.

## Session Start Prompt

Use this prompt to start a new implementation session:

```text
Bạn đang làm trong repo C:\Users\MATU\Downloads\comtammatu.

Mục tiêu: triển khai Inventory Pilot Contract V2 ready-to-ship. Đọc trước:
- AGENTS.md
- docs/agent/rules/engineering.md
- docs/agent/rules/database.md
- docs/agent/rules/ui.md
- docs/agent/rules/workflow.md
- docs/agent/rules/references.md
- tasks/regressions.md
- docs/worklog/inventory/inventory-pilot-contract-v2.md
- docs/ref/inventory.md
- docs/ref/inventory-sop.md
- docs/runbooks/inventory/pre-release-qa.md
- docs/worklog/inventory/evidence-log.md

Context bắt buộc:
- Inventory pilot scope là 4 điểm vận hành: Kho Tổng -> Bếp Trung Tâm -> Kho Chi Nhánh -> Bếp Chi Nhánh.
- Không ship toàn bộ ERP surface. Supplier invoice/payment/AP, returns/credit notes, trust, auto-waste, cold-chain, stocktake conflict/recount, barcode/bin/WMS, vendor portal, WIP/labor costing là deferred/ẩn khỏi pilot.
- `stock_issue(issue_type = kitchen_use)` đã retired bởi migration `20260426100100_retire_kitchen_use_issue_type.sql`; runtime chỉ còn `consumption | writeoff | other`.
- Kho Chi Nhánh -> Bếp Chi Nhánh phải dùng atomic one-step intra-branch `stock_transfer`, không dùng `kitchen_use`, không dùng state machine liên-site 5 bước.
- Inter-site transfers CW->CK, CW->Branch, CK->Branch vẫn dùng state machine 5 bước.
- Permission phải tách đúng: `inventory:transfer_create`, `inventory:transfer_ship`, `inventory:transfer_receive` ở cả app-layer và RPC `SECURITY DEFINER`.
- Branch manager chỉ được nhận inbound transfer và tạo/commit intra-branch `Cấp bếp`; không ship outbound liên-site.
- Production manager cần receive CW->CK, create/confirm production, ship CK->branch. Phải verify role template/grants bằng dữ liệu thật trước khi claim đủ quyền.
- POS consumption thiếu `default_consumption` phải fail/setup gate, không fallback silent.
- Đóng P1 evidence: `INV-UIUX-001`, `INV-UIUX-002`, `INV-UIUX-005`.

Trình tự làm:
1. Kiểm tra dirty worktree và không chạm unrelated changes.
2. Chạy 4-agent debate nếu bắt đầu implementation không phải docs-only.
3. Audit current code paths: transfer actions/RPCs, issue RPC, inventory locations, role permissions/templates, POS consumption location.
4. Viết migration bằng `supabase migration new <name>` cho DB gates/RPC/location integrity.
5. Patch app actions/UI theo Contract V2.
6. Verify bằng typecheck/lint/build, linked migration list/dry-run/lint, grep `kitchen_use`, E2E/smoke personas.
7. Update evidence log với commit/build, routes, personas, screenshots/logs, before/after data rows.
```
