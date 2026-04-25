# M2-Ext2: Table & Bill Operations

> Status: PR3 SHIPPED 2026-04-25 (Option A only) | PR1 + PR2 DEFERRED post-pilot
> Depends: M2 (SHIPPED), M2-Ext (SHIPPED) | Branch: main
> Supersedes "NOT in scope" carve-outs from [m2-order-lifecycle.md](m2-order-lifecycle.md)
> 4-agent debate verdict: PM = defer all 3; BA/Architect = proceed with corrections; QA = REVISE before ship.
> Owner decision (2026-04-25): Option 1 — ship PR3 Option A only, defer PR1 + PR2 until pilot evidence.

## Problem

F&B pilot scenarios not covered by current POS:

1. **Gộp bàn (merge table)** — nhóm khách lớn chiếm 2 bàn ghép vật lý, hoặc 2 đơn riêng cùng nhóm muốn chung 1 hóa đơn theo bàn → hiện tại phải tạo đơn riêng cho mỗi bàn, reconcile tay
2. **Tách đơn (split bill)** — 4 khách ngồi chung bàn, mỗi người trả riêng / chia đều theo đầu người / chia theo món → hiện tại phải tính nhẩm + thu từng người
3. **Gộp đơn (merge bill)** — sau khi nhóm khách order làm nhiều lần nhưng muốn 1 hóa đơn chung → hiện tại có thể dùng "Thêm món" nếu chủ động, nhưng nếu đã lỡ tạo 2 đơn riêng thì kẹt

## Baseline (what exists today)

- `orders.table_id BIGINT NULL` — 1 đơn ↔ 1 bàn (hoặc NULL cho takeaway)
- `orders.status`: new → confirmed → preparing → ready → served → completed | cancelled
- `orders.payment_status`: unpaid | partial | paid
- Payment close → `status=completed` + release table (auto-trigger)
- `transfer_order_table()` RPC đã ship — đổi table_id 1 đơn
- `append_order_items()` RPC đã ship — thêm món vào đơn hiện có
- Chưa có: multi-table per order, multi-order per table, order-order parent/child link, order split

## Scope (MVP, subject to 4-agent debate)

### PR1: Gộp đơn (merge bill) — làm TRƯỚC (data model đơn giản nhất)

**Data model:**
- Thêm `orders.merged_into_order_id BIGINT NULL REFERENCES orders(id)` — FK self
- Thêm CHECK: khi `merged_into_order_id IS NOT NULL` thì `status='cancelled'`

**RPC `merge_orders(p_target_order_id, p_source_order_ids[])`:**
- Advisory lock theo toàn bộ order IDs
- Validate tất cả cùng `branch_id`, `tenant_id`
- Validate target + sources: status ∈ (new, confirmed, preparing, ready, served), payment_status ∈ (unpaid, partial) [đơn có partial payment không merge — defer]
- Validate chưa có tax_invoice nào
- Move `order_items` + `kds_tickets` về target (UPDATE order_id)
- Update source orders: `status='cancelled'`, `merged_into_order_id=target`
- Recalc target totals
- Ghi `order_status_history` source: "merged_into_{target_id}"
- Ghi `order_status_history` target: "merged_from_{source_ids}"

**UI:**
- "Gộp đơn…" trong overflow của order-detail-sheet
- Picker: list các đơn cùng branch, chưa completed/cancelled, chưa paid, loại trừ self
- Confirm dialog: "Gộp N đơn (tổng Xd) vào đơn #Y? Các đơn nguồn sẽ bị hủy."

### PR2: Tách đơn (split bill) — làm SAU PR1

**3 chế độ (MVP chọn 1-2):**
- (a) **Theo món** — chọn subset order_items → tạo sub-order
- (b) **Chia đều** — nhập N người → N sub-order với total/N
- (c) **Chia theo tỷ lệ** — phức tạp, defer

**Quyết định MVP:** chỉ ship (a) + (b). Chế độ (c) defer.

**Data model:**
- Thêm `orders.split_from_order_id BIGINT NULL REFERENCES orders(id)`
- Parent giữ `status='split'` (thêm enum value) — không nhận payment trực tiếp, chỉ là container
- Mỗi sub là 1 order độc lập với `table_id` copy từ parent, payment riêng

**RPC `split_order_by_items(p_order_id, p_splits)`** — mode (a):
- `p_splits` = `[{order_item_ids: [1,2], note: "Khách A"}, {order_item_ids: [3], note: "Khách B"}]`
- Validate parent chưa paid, chưa có tax_invoice, status ∈ (confirmed, preparing, ready, served)
- Validate mọi order_item được phân phối đúng 1 lần, không sót
- Clone order_items sang sub-orders (không move — parent giữ items read-only cho audit)
- Parent status → 'split', sub-orders inherit status='served' (hoặc theo parent)
- KDS tickets: migrate hay không? **Quyết định:** không — KDS chỉ quan tâm món, đã bump xong rồi mới tách

**RPC `split_order_evenly(p_order_id, p_num_splits)`** — mode (b):
- Parent status → 'split'
- Tạo N sub-orders, mỗi sub `total_amount = parent.total / N` (round lẻ về sub cuối)
- Không clone items — sub chỉ giữ tổng tiền để payment

**UI:**
- "Tách đơn…" trong overflow
- 2 tab: "Theo món" (checkbox list) / "Chia đều" (input số người)
- Hiển thị preview: mỗi sub hiển thị tổng tiền + danh sách món (nếu mode a)

**Block conditions:**
- Đơn đã paid
- Đơn đã print HĐĐT (`tax_invoices` có row)
- Đơn đã completed/cancelled
- Đơn đã split rồi (không re-split)

### PR3: Gộp bàn (merge table) — SHIPPED 2026-04-25

**Scope shipped (Option A — multi-order-per-table, zero SQL):**

- `MultiOrderTablePicker` dialog hiển thị khi tap occupied bàn — list active orders + nút "Tạo đơn mới trên bàn này"
- Badge "N đơn" trên table tile khi N ≥ 2 active orders
- State `allowOccupiedTableId` trong [pos-desktop-shell.tsx](../../apps/web/app/br/[branchId]/pos/pos-desktop-shell.tsx) bypass auto-clear effect khi user explicit chọn occupied
- `selectedTableUsable = selectedTableAvailable || isExplicitOccupied` gate `orderContextReady` + `canSubmit`
- "Chuyển bàn" button đã promote từ "Khác…" overflow lên hàng chính ngay trên dropdown

**Architecture verified (Architect 4-agent):**

- `create_order` RPC ([20260425020000_fix_pos_order_rpcs_auth_v2.sql:99-106](../../supabase/migrations/20260425020000_fix_pos_order_rpcs_auth_v2.sql)) — KHÔNG block theo `tables.status` → multi-order-friendly today
- `trg_release_table_on_order_status` ([20260426040000_pos_payment_close_table_release.sql:37-48](../../supabase/migrations/20260426040000_pos_payment_close_table_release.sql)) — đã COUNT(active orders on table) trước khi release → tự động đúng cho multi-order
- `transfer_order_table` đã RELAX để accept target ∈ (`available`, `occupied`) — alignment với multi-order-per-table (migration [20260429100000_transfer_order_table_allow_occupied.sql](../../supabase/migrations/20260429100000_transfer_order_table_allow_occupied.sql)). Block `reserved` và `maintenance` (intentionally unavailable). UI dropdown `transfer-table-dialog.tsx` show "N đơn" suffix khi target đã có active orders để cashier biết ghép vào.

**Regression rule added:**
- `POS-MULTI-ORDER-PER-TABLE-NEW-INTENT-EXPLICIT` ([tasks/regressions.md](../../tasks/regressions.md))

**Files changed:**

- New: `apps/web/app/br/[branchId]/pos/_components/multi-order-table-picker.tsx`
- Modified: `pos-desktop-shell.tsx`, `pos-table-gate.tsx`, `order-detail-sheet.tsx` (Chuyển bàn promotion), `order-history.tsx` (export ACTIVE_POS_STATUSES)

**Pilot exit criteria for un-deferring PR1/PR2:**

1. PR1 Gộp đơn: pilot owner reports ≥3 cases/week of "lỡ tạo 2 đơn riêng cho cùng nhóm khách"
2. PR2 Tách đơn: pilot owner reports ≥5 cases/week of "khách chia tiền theo món" mà cashier xử lý tay

Nếu không đạt threshold trong 2 tuần đầu pilot → defer indefinitely.

---

### PR3 (legacy plan — NOT shipped, kept for context if Option B needed later): Gộp bàn (merge table) — làm CUỐI

**Sub-problem 1:** Gộp bàn vật lý (2 bàn ghép lại, phục vụ chung) — có thể chỉ cần nhãn, không cần data model thay đổi

**Sub-problem 2:** Multi-order per table — nhiều nhóm khách ngồi chung bàn (hoặc cùng bàn nhưng order riêng) — không cần `orders.table_id[]`, chỉ cần UI cho phép tạo đơn khi bàn đã occupied

**Data model options:**
- **Option A (minimal):** Không đổi schema. UI bỏ check "bàn đã occupied". `tables.status` tính = bất kỳ đơn nào ref tới bàn → occupied. Release = không còn đơn active nào
- **Option B (junction):** `order_tables(order_id, table_id, is_primary)` — 1 đơn có thể ghép nhiều bàn. Migration phức tạp, backward-compat qua view
- **Option C (group):** `table_groups(id, branch_id, name)` + `tables.group_id` — nhóm bàn vật lý; order vẫn 1 table_id

**Quyết định sơ bộ:** Option A cho pilot. Option B/C defer cho đến khi có evidence.

**UI:**
- Pos-table-gate: hiển thị warning "Bàn đã có đơn #X" thay vì block
- Table badge: nếu bàn có 2+ đơn → hiển thị "2 đơn" kèm tooltip

**NOT in PR3:** drag-and-drop merge trên TableMap (blocked by TableMap spatial defer)

## NOT in scope (toàn bộ M2-Ext2)

- Refund-based split (khách đã trả, tách ngược) → đợi M4 refund UI
- Cross-branch merge
- Auto-split theo QR self-order
- Merge đơn đã print HĐĐT (pháp lý cấm — block trong RPC)
- Undo merge / unmerge (tạo đơn mới thay thế)
- Tách theo tỷ lệ % (mode c) — defer
- Multi-tax-invoice split (1 split 1 HĐĐT) — defer, pilot dùng 1 HĐĐT parent

## Open Questions (để debate giải quyết)

1. **Gộp đơn:** giữ order_number của đơn target, hay generate mới? (Đề xuất: giữ target, source bị cancelled nên không conflict)
2. **Tách đơn mode (b) — chia đều:** có cho phép custom amount per split không, hay chỉ chia đều? (Đề xuất: chỉ chia đều trong MVP)
3. **Gộp bàn:** pilot có thực sự cần merge-logical, hay chỉ cần multi-order-per-table là đủ? (Cần BA kiểm với owner thật)
4. **KDS impact:** khi gộp đơn, kds_tickets có migrate order_id không? (Đề xuất: có, để KDS thấy đúng đơn sau merge)
5. **Stock consume:** đã consume cho parent rồi có consume lại cho sub không? (Đề xuất: không — consume chỉ trigger tại payment, split không đụng stock)
6. **Finance/VAS:** merge/split có tạo journal entry riêng không? (Đề xuất: không — payment mới là trigger)

## Debate Status (4-agent mandatory per CLAUDE.md)

- [ ] PM review (scope, MVP, priority, pilot fit)
- [ ] BA review (business rules, edge cases, Vietnamese F&B norms)
- [ ] Architect review (data model trade-offs, schema migration risk)
- [ ] QA/QC review (test plan, regression surfaces, quality gates)
- [ ] Synthesis + conflict resolution
- [ ] Implementation (PR1 → PR2 → PR3)
- [ ] Verification per PR

## Prior Art

- [m2-order-lifecycle.md](m2-order-lifecycle.md) — M2-Ext (append items, void, cancel, transfer table) — explicit NOT-in-scope carve-out for these 3 features
- [20260409100000_m2_pos_order_lifecycle.sql](../../supabase/migrations/20260409100000_m2_pos_order_lifecycle.sql) — M2-Ext RPC baseline
- [20260424142658_pos_payment_close_table_release.sql](../../supabase/migrations/20260424142658_pos_payment_close_table_release.sql) — payment-close semantics (table release rule)
- [tasks/regressions.md](../../tasks/regressions.md) — `PAYMENT-AUTO-COMPLETES-ORDER`, `POS-SERVED-NOT-TABLE-TERMINAL`
