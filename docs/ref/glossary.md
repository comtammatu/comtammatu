# Glossary

Canonical names and one-sentence definitions for Cơm Tấm Má Tư. Detail lives in
domain `docs/ref/*.md`, metric contracts in `operational-data-contract.md`, and
runtime ACL in `docs/modules/auth.md`. UI copy ladder: this file → shared
labels/messages → route dictionaries. Run `pnpm lint:copy` after copy changes.

## Read rules

- On meaning/label conflict with older docs, this glossary wins.
- Code/schema/RPC use English `canonical_term`; UI uses Vietnamese `label_vi`
  or an approved acronym standing alone — never bilingual labels.
- Numbers, tax rates, and legal thresholds come from `legal-framework-2026.md`
  and domain tax/payroll refs, not from memory.

## Language

Full policy: `docs/agent/rules/language.md`. Gate: `pnpm lint:language-policy`
plus `pnpm lint:copy` for UI strings.

| Layer | Language |
| --- | --- |
| Product UI / interactive copy | Vietnamese (or approved acronym alone) |
| End-user / owner business docs (`docs/ref/**`) | Vietnamese primary; keep `canonical_term` / `label_vi` columns |
| Agent rules, skills, specs, modules, plan/ADR, architecture, tasks | English |
| Code, schema, RPC, paths, config, infra | English identifiers |
| Technical comments, commits | English |

**UI capitalization:** sentence case for body; Title Case only for short nav/
button labels. Prefer `hoá`/`thoả`/`hoà` spelling in product copy.

**English whitelist in UI (standing alone):** `POS`, `KDS`, `PO`, `GRN`, `WAC`,
`QR`, `HĐĐT`, `GTGT`, `PIT`, `AOV`, `COGS`, `PDF`, `CSV`, `VND`, `NCC`, plus
approved file extensions.

### Denylist (do not reintroduce)

| Drift | Use instead |
| --- | --- |
| `Employee Portal` | `Trang cá nhân` (`/me`); Branch shift stays `Ca của tôi` |
| `Owner Shell` / `Owner surface` / `Ops surface` | `Quản trị` (`control_surface`) |
| `Operations chrome` (new prose) | `station_chrome` |
| Bare `Dashboard` | `Tổng quan` / `buồng lái` as fit |
| `Stock` / `Finance` as UI labels | `Kho hàng` / `Tài chính` |
| `Point of Sale` / `Kitchen Display System` | `POS` / `KDS` |
| `Báo cáo CEO` | `Báo cáo điều hành` |
| `food cost` in ordinary UI | `giá vốn món` / `chi phí nguyên liệu` |
| `draft` / `template` / `checklist` / `inbox` / `ID` / `job` / `sheet` in UI | Vietnamese business wording (`bản nháp`, `mẫu`, `việc trong ca`, `mã …`) |
| `Topping` / `blind` / `peer cross` | `Món thêm` / `đếm mù` / `đếm chéo` |
| Embedded `GRN`/`PO` in UI sentences | `phiếu nhập` / `đơn đặt hàng` (acronym only as pill/badge) |
| `Quầy Bếp` (chrome) | `KDS` |
| `Runner` (chrome) / `Màn gọi số` on tiles/nav | `Gọi số` (`pickup_display`) |
| `Quản lý kho` / `Bản điều hành kho` (module chrome) | `Kho hàng` (role title `Quản lý kho Tổng` stays) |
| `Đơn hàng` / `Đơn hàng bán` as module/nav chrome | `Đơn bán` (long `Đơn hàng bán` only via `ORDER_VI.long`) |
| `Công việc của tôi` | `Ca của tôi` |
| Bare `Nay` as home/nav/filter chrome | `Hôm nay` |
| `Trung tâm quản trị` as page chrome | `Quản trị` |
| `Điều chuyển nội bộ` / `Giao nhận hàng` as nav short | workspace `Giao nhận`; document `Điều chuyển` |

### UI chrome short ladder (product vocabulary platform)

Nav, tiles, tabs, badges, and page chrome must use these shorts from
`packages/shared/src/labels/**` + `packages/shared/src/messages/domain.ts`.
Modules may specialize body copy; they must not invent a third name for the
same concept.

| Concept | Chrome short | Formal / document | Source |
| --- | --- | --- | --- |
| Sale order module | `Đơn bán` | `Đơn hàng bán` | `ORDER_VI` / `MODULE_LABELS_VI.orders` |
| Inventory module | `Kho hàng` | — | `MODULE_LABELS_VI.inventory` |
| Kitchen display | `KDS` | — | `MODULE_LABELS_VI.kds` |
| Guest pickup board | `Gọi số` | `Màn gọi số` | `MODULE_LABELS_VI.pickup` |
| Personal account plane | `Trang cá nhân` | `/me` hub | Avatar Footer `personalPage` |
| Personal work surface | `Ca của tôi` | Branch `/shift` | `APP_COPY_VI.employeePortal` |
| Branch home / today chip | `Hôm nay` | — | `MODULE_LABELS_VI.branch_home` |
| Stock fulfillment workspace | `Giao nhận` | covers YCH + nhận/giao | inventory dictionary `transfers` |
| Stock transfer document | `Điều chuyển` | `Phiếu điều chuyển` | glossary `stock_transfer` |
| Control surface | `Quản trị` | — | `APP_COPY_VI.ownerSurface` |
| Shift checklist items | `Việc trong ca` | — | not the `/me` portal name |

## Product Dual Thesis

SSOT map: `docs/spec/architecture.md`. Role ACL `owner` ≠ product plane.

| Nửa (VI) | Plane | Việc |
| -------- | ----- | ---- |
| Quản lý hệ thống | `control_surface` | Oversight, master data, finance/HR/settings L0 |
| Vận hành bán hàng | `branch_surface` + `station_chrome` | Ca chi nhánh, POS/KDS/Pickup (Gọi số), stock ca |

Không dùng `Owner` / `Ops` làm tên nửa sản phẩm. Role ACL `owner` ≠ plane.

### `control_surface` (mặt phẳng L0 / Quản trị)

| Trường               | Giá trị |
| -------------------- | ------- |
| `canonical_term`     | `control_surface` |
| `label_vi`           | `Quản trị` |
| `definition`         | Nửa **Quản lý hệ thống**: chrome quản trị tenant/site trung tâm qua `ControlSurfaceShell` → `AppShell`: `/`, `/menu`, `/orders`, `/inventory`, `/finance`, `/hr`, `/branches`, `/settings`, `/feedback`. Actor theo `role-route-matrix` (Owner đầy đủ; accountant và central roles chỉ vào slice L0 được cấp). Runtime plane alias: `RouteSurface: "owner"`. |
| `not_this`           | Role ACL `owner`; `station_chrome` (POS/KDS/Pickup (Gọi số)); nhãn UI `Vận hành` / `Ops surface`; `branch_surface` |
| `scope`              | cross-module |
| `source_of_truth`    | `docs/spec/design-system.md` § Chrome Archetypes; `docs/modules/ui.md` § control_surface Shell Structure; runtime `ControlSurfaceShell` + DOM `data-control-surface-scroll` |
| `allowed_variants`   | Long UI: `Quản trị`; docs EN: `control_surface`; alias nội bộ cũ trong git history: Owner surface / Owner control |
| `forbidden_synonyms` | `Ops surface`, `Vận hành` (làm nhãn plane), `Owner` (làm tên plane), `Văn phòng` |

### `branch_surface`

| Trường               | Giá trị |
| -------------------- | ------- |
| `canonical_term`     | `branch_surface` |
| `label_vi`           | `Chi nhánh` |
| `definition`         | Mặt phẳng ca tại `/br/[branchId]/*` dùng Branch runtime chrome (không gồm station full-screen). |
| `not_this`           | `control_surface`; `station_chrome` |
| `scope`              | cross-module |
| `source_of_truth`    | `docs/spec/design-system.md` § Chrome Archetypes; `docs/spec/role-route-matrix.md` |

### `station_chrome`

| Trường               | Giá trị |
| -------------------- | ------- |
| `canonical_term`     | `station_chrome` |
| `label_vi`           | *(không nhãn ô dùm)* — dùng `POS` / `KDS` / `Runner` |
| `definition`         | Chrome full-screen một việc: POS, KDS, Pickup dưới `/br/[branchId]/{pos,kds,pickup}`. |
| `not_this`           | `control_surface`; gọi chung “Vận hành” thay cho tên station |
| `scope`              | POS |
| `source_of_truth`    | `docs/spec/design-system.md` § Chrome Archetypes |
| `allowed_variants`   | Alias docs cũ: Operations chrome (chỉ khi đọc lịch sử; prose mới dùng `station_chrome`) |

### `operational_role`

| Trường               | Giá trị |
| -------------------- | ------- |
| `canonical_term`     | `operational_role` |
| `label_vi`           | `vai trò vận hành` |
| `definition`         | Nhóm role ngoài Owner đầy đủ: `accountant`, `central_supply_ops`, `central_kitchen_lead`, … — quyền theo matrix, không đổi tên plane. |
| `not_this`           | `control_surface`; `station_chrome`; nhãn plane `Quản trị` |
| `scope`              | cross-module |
| `source_of_truth`    | D076; `docs/spec/role-route-matrix.md`; `packages/shared/src/auth/types.ts` |

### Role `owner`

| Trường               | Giá trị |
| -------------------- | ------- |
| `canonical_term`     | `owner` |
| `label_vi`           | `Chủ sở hữu` |
| `definition`         | Role ACL L0 đầy đủ. Không phải tên mặt phẳng sản phẩm. |
| `not_this`           | `control_surface` / `Quản trị` (plane) |
| `scope`              | cross-module |
| `source_of_truth`    | `packages/shared/src/auth/types.ts`; `docs/spec/role-route-matrix.md` |

**Từ khóa “vận hành”** chỉ dùng cho: tên sản phẩm (`restaurant_operations_system`), metric tài chính vận hành, `operational_role`, và mô tả job — **không** là nhãn `control_surface`.

## Copy source ladder

Mỗi loại copy có đúng một nguồn sở hữu. Khi thêm/sửa copy, cập nhật nguồn đúng
trước hoặc trong cùng PR, rồi chạy `pnpm lint:copy`.

- Nghĩa business + quy tắc đặt tên: `docs/ref/glossary.md`.
- Metric/card/title có số liệu: `docs/ref/operational-data-contract.md`.
- Nhãn tiếng Việt domain dùng chung: `packages/shared/src/labels/vi.ts`.
- Action/state/error chung: `@comtammatu/shared/messages` hoặc
  `apps/web/lib/messages/*`.
- Chuỗi cố định theo luật: `packages/shared/src/labels/legal-fixed.ts`.
- Adapter route/thuật ngữ Inventory:
  `apps/web/app/(protected)/inventory/_lib/dictionary.ts`.
- Adapter route-specific khác: dictionary domain tương ứng.

## Mẫu entry bắt buộc

Thuật ngữ nghiệp vụ mới phải đủ các trường sau khi rủi ro nhầm lẫn cao:

| Trường                 | Ý nghĩa                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `canonical_term`       | English term dùng trong code/docs kỹ thuật                       |
| `label_vi`             | Nhãn tiếng Việt chuẩn                                            |
| `definition`           | Nghĩa đúng trong Cơm Tấm Má Tư                                   |
| `not_this`             | Những thứ không được lẫn                                         |
| `scope`                | POS, Finance, Inventory, Owner, doanh nghiệp/legal, HR, hoặc cross-module |
| `source_of_truth`      | Doc/code/schema/RPC sở hữu dữ liệu hoặc rule                     |
| `allowed_variants`     | Long/short/acronym được phép dùng                                |
| `forbidden_synonyms`   | Cách gọi bị cấm hoặc chỉ dùng trong context hẹp                  |
| `related_contract_key` | Bắt buộc nếu term là metric/card số liệu                         |

## Bản đồ số liệu F&B và tài chính

Nguyên tắc nền:

- `Doanh thu thuần` trên bề mặt Owner là giá trị món của đơn đã trả sau
  discount và chưa VAT: `subtotal_revenue - discount_amount`.
- VAT/GTGT là khoản thu hộ/nộp lại hoặc nghĩa vụ thuế theo phương pháp GTGT đã đăng ký, không
  phải lãi của nhà hàng.
- Mua nguyên liệu không tự động là `food cost`; chỉ là giá vốn khi được ghi nhận
  là tiêu hao/bán hàng theo contract.
- `estimated` hoặc `needs_review` không được hiển thị như KPI tin cậy.
- Nhãn ngắn `Doanh thu` chỉ được dùng cho
  `finance.revenue.money_collected` trên Finance Basic, với hint nói rõ đây là
  payment hoàn tất và có thể gồm VAT. Các bề mặt khác không dùng nhãn trần nếu
  chưa nói rõ metric key, công thức, source, exclusions và confidence.

### Metric vocabulary

| Canonical term           | Nhãn chuẩn                    | Định nghĩa                                                                                                 | Công thức / rule                                                                                 | Không được lẫn với                                                                     | Contract/source                                                     |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `gross_sales`            | Tổng giá bán trước giảm giá   | Tổng giá menu/list của món bán trước giảm giá, refund, VAT passthrough.                                    | `sum(item_list_price * qty)` theo đơn hợp lệ.                                                    | Tiền đã thu, doanh thu trước VAT, doanh thu tính thuế.                                 | Revenue report; cần contract khi đưa lên KPI.                       |
| `discount_amount`        | Giảm giá                      | Tổng khuyến mãi, giảm giá, comp làm giảm doanh thu bán hàng.                                               | Tổng discount trên order/item đã đóng.                                                           | Waste, hủy món, hoàn tiền.                                                             | POS/revenue detail.                                                 |
| `refund_amount`          | Hoàn tiền                     | Tiền trả lại sau khi đơn đã thanh toán.                                                                    | Tổng refund đã approved trong kỳ.                                                                | Hủy món trước thanh toán, giảm giá.                                                    | Finance refund workflow.                                            |
| `voided_amount`          | Giá trị hủy trước thanh toán  | Giá trị dòng món/đơn bị hủy trước khi paid.                                                                | Tổng void/cancel trước commercial close.                                                         | Refund sau thanh toán, discount.                                                       | POS exception report.                                               |
| `net_sales_before_vat`   | Doanh thu thuần               | Giá trị món của đơn đã trả sau discount và chưa VAT; là mẫu số margin hiện tại.                            | `subtotal_revenue - discount_amount` trên tập đơn có payment hoàn tất.                           | Tổng payment gồm VAT, tiền mặt trong két, HĐĐT đã phát hành, doanh thu tính thuế.      | `finance.revenue.before_vat_after_discount`.                        |
| `total_collected`        | Tổng tiền đã thu              | Tổng giá trị payment hoàn tất trong kỳ, có thể gồm VAT.                                                    | Sum `payments.amount` completed tại `paid_at`, bucket theo ngày Việt Nam.                        | Doanh thu thuần, HĐĐT đã phát hành, công nợ, doanh thu tính thuế.                      | `finance.revenue.money_collected`.                                  |
| `cash_collected`         | Tiền mặt đã thu               | Phần `total_collected` bằng tiền mặt.                                                                      | Sum paid amount method `cash`.                                                                   | Tiền mặt hiện hữu trong két, cash variance.                                            | Payment split.                                                      |
| `bank_wallet_collected`  | Chuyển khoản đã thu           | Phần `total_collected` qua VietQR hoặc chuyển khoản.                                                       | Sum paid amount method `bank_transfer`/`vietqr`.                                                 | Doanh thu kênh bán, tiền ngân hàng đã settle nếu có delay.                             | Payment split.                                                      |
| `payment_split`          | Cơ cấu thanh toán             | Tỷ trọng thu theo phương thức thanh toán.                                                                  | `amount_by_method / total_collected`.                                                            | Sales channel mix.                                                                     | Finance/revenue report.                                             |
| `tax_collected`          | Thuế đã thu/ước tính phải nộp | Phần VAT/GTGT tương ứng doanh thu bán ra theo cấu hình thuế/HĐĐT của doanh nghiệp.                          | Theo `einvoice-tax.md`; không hardcode trong UI.                                                 | Lãi, doanh thu thuần, chi phí.                                                         | HĐĐT/tax module.                                                    |
| `issued_invoice_revenue` | Doanh thu HĐĐT đã phát hành   | Tổng giá trị HĐĐT trạng thái `issued`.                                                                     | Sum tax invoice amount where `status='issued'`.                                                  | Doanh thu POS nếu chưa/không xuất HĐĐT, tiền đã thu.                                   | HĐĐT report.                                                        |
| `tax_declared_revenue`   | Doanh thu tính thuế           | Doanh thu dùng để kê khai theo luật và phương pháp thuế doanh nghiệp đã đăng ký.                           | Theo `einvoice-tax.md` và `legal-framework-2026.md`.                                             | Doanh thu POS, HĐĐT đã phát hành, tiền đã thu, doanh thu thuần dùng cho biên lợi nhuận. | Legal/tax SSoT.                                                    |
| `order_count`            | Số đơn                        | Số đơn bán hợp lệ trong kỳ.                                                                                | Count order completed/paid theo contract.                                                        | Số lượt khách/covers, số bàn.                                                          | Revenue report.                                                     |
| `average_order_value`    | Giá trị trung bình mỗi đơn    | Doanh thu trung bình mỗi order.                                                                            | `net_sales_before_vat / order_count`.                                                            | Doanh thu/lượt khách nếu chưa có guest count.                                          | Revenue report.                                                     |
| `covers`                 | Lượt khách                    | Số khách phục vụ thực tế.                                                                                  | Sum `guest_count` nếu POS capture; takeaway dùng order count nếu chưa có khách.                  | Số đơn, số bàn.                                                                        | Future dine-in analytics.                                           |
| `food_cost`              | Giá vốn món                   | Chi phí nguyên liệu/bao bì trực tiếp đã ghi nhận cho món bán hoặc tiêu hao bếp.                            | Theo consumption/production/approved report.                                                     | Chi phí vận hành, hóa đơn NCC, PO, tiền đã trả NCC.                                    | `finance.food_cost.recorded`.                                       |
| `theoretical_food_cost`  | Giá vốn định mức              | Giá vốn suy ra từ công thức món và mix bán hàng.                                                           | `sum(recipe_qty * cost * sold_qty)`.                                                             | Giá vốn thực tế nếu chưa đối soát tồn/kiểm kê.                                         | Analysis only, `estimated`.                                         |
| `actual_food_cost`       | Giá vốn thực tế               | Giá vốn từ biến động kho/tiêu hao thực tế.                                                                 | `begin_inventory + purchases + transfers_in - transfers_out - ending_inventory +/- adjustments`. | Định mức recipe, purchase spend.                                                       | Inventory/Finance when source trusted.                              |
| `food_cost_percentage`   | Tỷ lệ giá vốn món             | Tỷ lệ giá vốn trên doanh thu trước VAT.                                                                    | `food_cost / net_sales_before_vat`.                                                              | Biên gộp, tỷ lệ giảm giá.                                                              | Finance food-cost report.                                           |
| `gross_profit`           | Lợi nhuận gộp                 | Phần còn lại sau khi trừ giá vốn món khỏi doanh thu thuần.                                                  | `net_sales_before_vat - food_cost`.                                                              | Kết quả kinh doanh, lợi nhuận ròng, dòng tiền, tiền mặt trong két.                     | `finance.gross_profit.readonly`.                                    |
| `gross_margin`           | Biên gộp                      | Tỷ lệ lợi nhuận gộp trên doanh thu thuần.                                                                  | `gross_profit / net_sales_before_vat`.                                                           | Tỷ lệ giá vốn món, biên ròng.                                                          | Supporting context.                                                 |
| `operating_expense`      | Chi phí vận hành              | Chi phí kỳ đã ghi nhận: thuê, điện nước, lương, phần mềm, marketing, sửa chữa, vật tư tiêu hao, khấu hao/phân bổ và phí. | Sum posted expense trong kỳ, loại direct ingredient COGS và nguyên giá tài sản.         | Giá vốn món, công nợ NCC, tiền mua TSCĐ/thiết bị chưa phân bổ.                         | `finance.expense.operating`.                                        |
| `operating_result`       | Kết quả kinh doanh            | Kết quả sau khi trừ giá vốn món và chi phí vận hành, cộng biến động tồn kho.                               | `gross_profit - operating_expense + (closing - opening inventory)`.                              | Lợi nhuận ròng, dòng tiền, kết quả kê khai thuế.                                       | `finance.operating_result`.                                         |
| `labor_cost`             | Chi phí nhân công             | Lương, phụ cấp chịu chi phí, bảo hiểm và nghĩa vụ của người sử dụng lao động được ghi nhận cho vận hành.  | Theo payroll/HR contract.                                                                        | Cổ tức, phân phối lợi nhuận, chi cá nhân.                                              | Future/HR-linked finance.                                           |
| `prime_cost`             | Chi phí chính                 | Chi phí kiểm soát chính trong nhà hàng: giá vốn món + chi phí nhân công.                                   | `food_cost + labor_cost`.                                                                        | Chi phí vận hành tổng, lợi nhuận ròng.                                                 | Chỉ dùng khi cả food cost và labor cost trusted.                    |
| `net_operating_profit`   | Lợi nhuận vận hành ròng       | Lãi sau khi trừ giá vốn, nhân công, chi phí vận hành, và khoản vận hành khác đã định nghĩa.                | `net_sales_before_vat - food_cost - labor_cost - operating_expense +/- other_operating_items`.   | Lợi nhuận gộp, tiền mặt, lợi nhuận kế toán doanh nghiệp.                               | Không là Finance Basic KPI mặc định.                                |
| `inventory_value`        | Giá trị tồn kho               | Tiền đang nằm trong tồn kho theo snapshot location/branch.                                                 | `stock_levels.current_quantity * (stock_levels.avg_unit_cost ?? ingredients.unit_cost ?? 0)`.    | Chi phí trong kỳ, tiền mua NCC, profit.                                                | `finance.inventory_value.current`, `inventory.stock_value.current`. |
| `site_wac`               | Giá vốn kho này               | WAC của đúng kho/location đang xem; hết hàng vẫn giữ giá cuối, nhập mới thì tính lại bình quân.            | `stock_levels.avg_unit_cost` tại site đó.                                                        | Định mức/phần, giá vốn món POS, một WAC toàn công ty.                                  | Inventory stock / issue / transfer.                                 |
| `fixed_asset`            | Tài sản cố định (TSCĐ)        | Tài sản đồng thời có lợi ích kinh tế tương lai, dùng trên một năm và nguyên giá tin cậy từ 30 triệu đồng. | Theo hồ sơ tài sản và chính sách kế toán đã chọn.                                      | Mọi thiết bị, công cụ nhỏ, vật tư tiêu hao.                                            | Chưa có runtime contract.                                           |
| `tool_equipment`         | Công cụ, dụng cụ              | Thiết bị/vật dụng không đủ toàn bộ tiêu chí TSCĐ; có thể ghi trực tiếp hoặc phân bổ dần.                  | Theo chính sách kế toán, tính trọng yếu và nơi sử dụng.                                | TSCĐ; vật tư tiêu hao dùng hết trong kỳ.                                               | Chưa có runtime contract.                                           |
| `depreciation_expense`   | Chi phí khấu hao              | Phần nguyên giá TSCĐ được phân bổ có hệ thống vào chi phí của kỳ.                                         | Theo nguyên giá, ngày sử dụng, thời gian và phương pháp khấu hao đã duyệt.             | Tiền mua tài sản, khấu hao lũy kế, giá trị còn lại.                                    | Chưa có runtime contract.                                           |
| `asset_carrying_value`   | Giá trị còn lại của tài sản   | Nguyên giá trừ khấu hao lũy kế tại thời điểm báo cáo.                                                     | `asset_cost - accumulated_depreciation`.                                               | Giá mua, số tiền đã trả, chi phí khấu hao kỳ.                                          | Chưa có runtime contract.                                           |
| `stock_on_hand`          | Tồn hiện tại                  | Số lượng thực tế theo ledger tại location.                                                                 | `stock_levels.current_quantity`.                                                                 | Giá trị tồn kho, hàng đã đặt mua.                                                      | `inventory.stock_quantity.current`.                                 |
| `purchase_spend`         | Giá trị mua hàng              | Giá trị hàng/chi phí đã mua hoặc nhận từ NCC.                                                              | Theo trạng thái PO/GRN/hóa đơn NCC.                                                              | Giá vốn món, giá trị tồn kho, chi phí vận hành.                                        | Procurement report.                                                 |
| `supplier_payable`       | Phải trả NCC                  | Khoản còn nợ nhà cung cấp.                                                                                 | Invoice total - paid amount.                                                                     | Purchase spend, food cost, cash expense.                                               | Supplier invoice / AP workflow.                                     |
| `waste_cost`             | Giá trị hao hụt/hủy hỏng      | Chi phí nguyên liệu mất do hư, bỏ, sai món, quá hạn, vỡ.                                                   | `waste_qty * unit_cost`.                                                                         | Discount, comp, refund.                                                                | Inventory exception report.                                         |
| `stocktake_variance`     | Chênh lệch kiểm kê            | Chênh giữa sổ và đếm thực tế.                                                                              | `counted_qty - book_qty`, value by unit cost.                                                    | Waste đã ghi nhận, transfer chưa nhận.                                                 | Stocktake workflow.                                                 |
| `inventory_turnover`     | Vòng quay tồn kho             | Tốc độ chuyển tồn kho thành tiêu hao/bán hàng.                                                             | `COGS / average_inventory_value`.                                                                | Doanh thu, stockout.                                                                   | Inventory/Finance analysis.                                         |
| `expected_cash`          | Tiền mặt dự thu               | Tiền mặt POS đáng lẽ có trong két tại lúc đóng ca theo payment hoàn tất.                                   | `opening_cash + sum(completed cash payments)` trong ca.                                          | Tiền đếm thực tế, tiền mặt tenant-wide theo sổ.                                        | Cash session.                                                       |
| `counted_cash`           | Tiền mặt kiểm đếm             | Tiền mặt nhân sự/quản lý đếm thực tế.                                                                      | Manual count at close.                                                                           | Expected cash.                                                                         | Cash session.                                                       |
| `cash_variance`          | Chênh lệch tiền mặt           | Két thừa/thiếu so với kỳ vọng.                                                                             | `counted_cash - expected_cash`.                                                                  | Lợi nhuận, doanh thu, chi phí.                                                         | Cash session reconciliation.                                        |
| `staff_repaid`           | Nhân viên bù đủ tiền thiếu    | Quản lý đã nhận đủ `abs(cash_variance)` của ca thiếu; giữ nguyên số đếm lúc chốt.                          | Chỉ dùng khi `cash_variance < 0`; settlement bằng toàn bộ khoản thiếu.                           | Điều chỉnh sổ quỹ, sửa số đếm, thu một phần.                                           | `resolve_pos_session_variance`.                                     |
| `accepted_adjustment`    | Ghi nhận lệch ca              | Quản lý giữ số đếm thực tế và ghi nhận kết quả thừa/thiếu để báo cáo, điều tra.                            | Book delta bằng 0; tổn thất/lợi ích đã kiểm chứng dùng finance adjustment riêng.                 | Nhân viên bù tiền, sửa phương thức thanh toán, tự động đổi số dư theo sổ.              | `resolve_pos_session_variance`.                                     |

### Legacy identifier notes

- `net_revenue` trong database/RPC hiện bị overload, nhưng nghĩa nghiệp vụ không
  được overload. Trên UI Finance, `net_sales_before_vat` dùng nhãn
  `Doanh thu thuần`. Nếu source field `net_revenue` đang chứa
  `sum(orders.total_amount)` gồm VAT/tổng khách trả, adapter phải đổi tên nghĩa
  sang `total_collected`, không hỏi owner chọn lại định nghĩa.
- `Lợi nhuận ròng` không thuộc năm KPI Finance Basic hiện hành. Chỉ dùng khi đã
  có contract cho `net_operating_profit`, đủ source cho food cost/labor/expense,
  và confidence không phải `estimated`/`needs_review`.
- `Tiền mặt hiện hữu` chỉ dùng cho cash session/drawer khi có opening/counting
  contract; không dùng thay `cash_collected`.

## Từ điển kiến thức nền F&B/Finance

Các bảng dưới đây là kiến thức nền để agent dùng khi gặp thuật ngữ chuyên ngành.
Nếu chưa có source dữ liệu trong hệ thống, agent được phép đánh dấu
`blocked`/`estimated`, nhưng không được đổi nghĩa thuật ngữ.

### Revenue, sales, và kênh bán

| Term                      | Nhãn chuẩn                       | Nghĩa agent phải biết                                                          | Không được lẫn với             |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| `sales`                   | doanh số bán hàng                | Tổng hoạt động bán ra theo đơn/dòng món; cần nói rõ gross/net/VAT/payment.     | tiền đã thu, HĐĐT đã phát hành |
| `gross_sales`             | tổng giá bán trước giảm giá      | Tổng giá list/menu trước discount/refund/VAT passthrough.                      | doanh thu ròng                 |
| `net_sales`               | doanh thu ròng / doanh thu thuần | Doanh thu sau giảm giá/hoàn tiền, trước VAT nếu dùng cho margin.               | tổng khách trả gồm VAT         |
| `net_sales_before_vat`    | doanh thu thuần trước VAT        | Canonical của Má Tư cho margin và lợi nhuận gộp.                               | `total_collected`              |
| `sales_return`            | hàng bán trả lại                 | Giá trị bán bị trả lại sau bán; F&B thường hiếm, gần với refund/void tùy flow. | discount                       |
| `discount`                | giảm giá                         | Khoản giảm thương mại trước/ở lúc thanh toán.                                  | waste, comp nội bộ             |
| `comp`                    | món tặng/miễn phí                | Món được miễn phí vì chăm sóc khách/sự cố; vẫn có thể tạo food cost.           | discount tiền, waste           |
| `void`                    | hủy trước thanh toán             | Xóa/hủy món hoặc đơn trước commercial close.                                   | refund                         |
| `refund`                  | hoàn tiền                        | Trả lại tiền sau khi paid/completed.                                           | void/cancel trước paid         |
| `service_charge`          | phí dịch vụ                      | Phí tính thêm cho dịch vụ nếu có chính sách rõ.                                | tip, VAT, doanh thu món        |
| `tip`                     | tiền tip                         | Tiền khách thưởng nhân viên; không mặc định là doanh thu nhà hàng.             | service charge, revenue        |
| `sales_channel`           | kênh bán                         | Nguồn phát sinh nhu cầu: dine-in, takeaway, delivery, app/platform.            | payment method                 |
| `payment_method`          | phương thức thanh toán           | Cách khách trả tiền: cash, bank transfer, VietQR.                              | sales channel                  |
| `delivery_platform_sales` | doanh thu qua nền tảng giao hàng | Doanh thu đơn đến từ nền tảng giao hàng bên thứ ba nếu tích hợp.               | payout về ngân hàng            |
| `platform_commission`     | phí nền tảng                     | Phí nền tảng khấu trừ hoặc xuất hóa đơn dịch vụ.                               | food cost, discount            |
| `net_payout`              | tiền nền tảng thực chuyển        | Tiền về sau khi trừ commission/fee/adjustment.                                 | doanh thu ròng                 |
| `settlement_lag`          | độ trễ đối soát tiền             | Khoảng thời gian giữa paid/order completed và tiền thực về ngân hàng.          | công nợ xấu                    |
| `sales_mix`               | cơ cấu doanh thu theo nhóm       | Tỷ trọng doanh thu theo món/nhóm/kênh.                                         | payment split                  |
| `product_mix`             | cơ cấu món bán                   | Tỷ trọng số lượng hoặc doanh thu từng món.                                     | sales channel mix              |

### Cost, margin, và profit

| Term                          | Nhãn chuẩn               | Nghĩa agent phải biết                                                                                             | Không được lẫn với                |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `cost_of_goods_sold` (`COGS`) | giá vốn hàng bán         | Direct cost của món/hàng đã bán hoặc tiêu hao để tạo doanh thu. Trong F&B thường là food/beverage/packaging cost. | purchase spend, operating expense |
| `food_cost`                   | giá vốn món              | Phần COGS nguyên liệu/bao bì gắn với món bán hoặc tiêu hao bếp.                                                   | hóa đơn NCC                       |
| `beverage_cost`               | giá vốn đồ uống          | COGS của đồ uống nếu tách menu.                                                                                   | food cost nếu cần phân tích riêng |
| `packaging_cost`              | chi phí bao bì trực tiếp | Bao bì đi kèm món mang về/giao hàng; có thể tính vào COGS hoặc direct variable cost theo contract.                | opex văn phòng                    |
| `theoretical_food_cost`       | giá vốn định mức         | Giá vốn kỳ vọng từ recipe và mix bán hàng.                                                                        | actual food cost                  |
| `actual_food_cost`            | giá vốn thực tế          | Giá vốn từ tồn đầu + mua/nhận + điều chuyển - tồn cuối +/- điều chỉnh.                                            | recipe estimate                   |
| `food_cost_variance`          | chênh lệch giá vốn       | Actual food cost - theoretical food cost.                                                                         | stocktake variance riêng lẻ       |
| `standard_cost`               | giá vốn chuẩn            | Cost định mức dùng để tính nhanh/mô phỏng.                                                                        | WAC/current actual cost           |
| `actual_cost`                 | giá vốn thực tế          | Cost sau khi ghi nhận mua/tiêu hao/kiểm kê.                                                                       | standard cost                     |
| `gross_profit`                | lợi nhuận gộp            | Net sales - COGS/food cost.                                                                                       | net profit, cash flow             |
| `gross_margin`                | biên gộp                 | Lợi nhuận gộp / doanh thu thuần.                                                                                  | tỷ lệ giá vốn món                 |
| `contribution_margin`         | lãi đóng góp             | Doanh thu món/kênh trừ chi phí biến đổi trực tiếp.                                                                | gross profit toàn kỳ              |
| `variable_cost`               | chi phí biến đổi         | Chi phí thay đổi theo số đơn/món: nguyên liệu, bao bì, platform fee theo đơn.                                     | fixed cost                        |
| `fixed_cost`                  | chi phí cố định          | Chi phí ít đổi theo sản lượng ngắn hạn: thuê mặt bằng, phần mềm cố định.                                          | variable cost                     |
| `labor_cost`                  | chi phí nhân công        | Lương, phụ cấp, bảo hiểm/thuế employer nếu ghi nhận.                                                              | Cổ tức, phân phối lợi nhuận       |
| `labor_cost_percentage`       | tỷ lệ chi phí nhân công  | Labor cost / net sales.                                                                                           | prime cost %                      |
| `prime_cost`                  | prime cost               | Food/beverage COGS + labor cost; cost kiểm soát chính của nhà hàng.                                               | total operating expense           |
| `prime_cost_ratio`            | tỷ lệ chi phí chính      | Chi phí chính / doanh thu ròng.                                                                                   | biên gộp                          |
| `operating_expense` (`opex`)  | chi phí vận hành         | Rent, utilities, software, repair, marketing, bank/payment fee; không gồm direct COGS nếu đã tách.                | food cost                         |
| `operating_profit`            | lợi nhuận vận hành       | Lãi sau COGS/labor/opex trong phạm vi vận hành.                                                                   | net income pháp lý                |
| `net_profit`                  | lợi nhuận sau thuế TNDN  | Bottom-line kế toán sau doanh thu, giá vốn, chi phí, kết quả tài chính/khác và thuế TNDN khi kỳ đã khóa đầy đủ.   | lợi nhuận gộp, kết quả vận hành   |
| `net_margin`                  | biên lợi nhuận ròng      | Net profit / revenue.                                                                                             | gross margin                      |
| `ebitda`                      | EBITDA                   | Earnings before interest, tax, depreciation, amortization; không phải KPI mặc định của Finance vận hành.          | cash profit                       |
| `dividend`                    | cổ tức                   | Phần lợi nhuận được phân phối cho cổ đông theo quyết định hợp lệ.                                                 | expense vận hành, lương           |

### Cash, công nợ, và đối soát

| Term                         | Nhãn chuẩn             | Nghĩa agent phải biết                                                                        | Không được lẫn với                 |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `cash_basis`                 | ghi nhận theo tiền     | Doanh thu/chi phí ghi khi tiền thu/chi.                                                      | accrual basis                      |
| `accrual_basis`              | ghi nhận dồn tích      | Ghi khi doanh thu phát sinh/chi phí incurred, bất kể tiền đã chuyển chưa.                    | cash basis                         |
| `cash_flow`                  | dòng tiền              | Tiền vào/ra theo thời gian.                                                                  | profit                             |
| `cash_inflow`                | dòng tiền vào          | Tiền nhận từ khách/nền tảng/khoản khác.                                                      | revenue nếu chưa earned            |
| `cash_outflow`               | dòng tiền ra           | Tiền chi cho NCC/nhân sự/expense/chủ rút.                                                    | expense nếu là trả nợ cũ           |
| `cash_on_hand`               | tiền mặt hiện hữu      | Tiền thực có trong két hoặc quỹ.                                                             | cash collected                     |
| `bank_opening_balance`       | số dư ngân hàng đầu kỳ | Mốc số dư Owner nhập vì hệ thống không đọc được số dư tài khoản ngân hàng.                   | Tổng giao dịch SePay               |
| `bank_transaction`           | giao dịch ngân hàng    | Một biến động tiền vào hoặc tiền ra canonical từ SePay, tính đúng một lần theo ID giao dịch. Màn Finance LIST `/finance/bank-transactions` nhãn UI **Giao dịch**. | Webhook delivery, payment, expense; không lẫn với quy trình đối soát |
| `opening_cash`               | tiền đầu ca            | Tiền mặt trong két khi mở ca.                                                                | doanh thu                          |
| `closing_cash`               | tiền cuối ca           | Tiền mặt thực đếm khi đóng ca.                                                               | expected cash                      |
| `cash_over_short`            | thừa/thiếu tiền mặt    | Counted cash - expected cash.                                                                | lãi/lỗ                             |
| `bank_reconciliation`        | đối soát ngân hàng     | Phân loại giao dịch ngân hàng vào payment/chứng từ; gắn hoặc gỡ không đổi số dư. Hành động khớp trên màn **Giao dịch**, không phải tên màn. | payment split, bank movement; không gọi màn hình là «Đối soát NH» |
| `accounts_receivable` (`AR`) | phải thu               | Tiền khách/nền tảng/đối tác còn nợ.                                                          | revenue                            |
| `accounts_payable`           | phải trả               | Tiền còn nợ NCC/đối tác.                                                                     | purchase spend                     |
| `payable_due_date`           | hạn thanh toán NCC     | Ngày phải trả hóa đơn/khế ước NCC.                                                           | ngày GRN                           |
| `receivable_aging`           | tuổi nợ phải thu       | Phân nhóm khoản phải thu theo số ngày chưa thu.                                              | doanh thu ngày                     |
| `payable_aging`              | tuổi nợ phải trả       | Phân nhóm khoản phải trả theo số ngày chưa thanh toán.                                       | chi phí trong kỳ                   |
| `prepaid_expense`            | chi phí trả trước      | Tiền đã trả nhưng phân bổ cho nhiều kỳ.                                                      | chi phí vận hành kỳ hiện tại       |
| `accrued_expense`            | chi phí dồn tích       | Chi phí đã phát sinh nhưng chưa trả tiền.                                                    | AP invoice đã nhận nếu có invoice  |
| `deposit`                    | đặt cọc                | Tiền giữ chỗ/đặt cọc, chưa chắc là revenue.                                                  | payment for completed order        |

### Inventory, procurement, và costing

| Term                      | Nhãn chuẩn               | Nghĩa agent phải biết                                               | Không được lẫn với         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------- | -------------------------- |
| `beginning_inventory`     | tồn đầu kỳ               | Giá trị/số lượng tồn tại đầu kỳ.                                    | opening cash               |
| `ending_inventory`        | tồn cuối kỳ              | Giá trị/số lượng tồn cuối kỳ.                                       | closing cash               |
| `average_inventory`       | tồn bình quân            | Bình quân tồn trong kỳ, dùng cho turnover.                          | inventory snapshot         |
| `inventory_turnover`      | vòng quay tồn kho        | COGS / average inventory value.                                     | sales growth               |
| `days_inventory_on_hand`  | số ngày tồn kho          | Average inventory / daily COGS; ước số ngày tồn đủ dùng.            | shelf life                 |
| `par_level`               | mức tồn chuẩn            | Tồn mục tiêu để vận hành đủ mà không dư quá.                        | reorder point              |
| `reorder_point`           | điểm đặt hàng            | Ngưỡng tồn kích hoạt đặt hàng.                                      | par level                  |
| `lead_time`               | thời gian giao hàng      | Thời gian từ đặt hàng đến nhận hàng.                                | shelf life                 |
| `safety_stock`            | tồn an toàn              | Phần tồn đệm để tránh stockout.                                     | overstock                  |
| `stockout`                | hết hàng                 | Tồn không đủ để bán/sản xuất.                                       | low stock                  |
| `overstock`               | dư tồn                   | Tồn vượt nhu cầu/par, tăng rủi ro hư hỏng/cash tied.                | inventory value cao có lợi |
| `dead_stock`              | tồn chết                 | Hàng tồn lâu/khó dùng/khó bán.                                      | safety stock               |
| `shrinkage`               | hao hụt không giải thích | Mất mát do thất thoát/sai đếm/hư hỏng chưa phân loại.               | waste đã ghi nhận          |
| `spoilage`                | hư hỏng                  | Hàng hỏng/quá hạn không dùng được.                                  | comp/discount              |
| `waste`                   | hao phí/bỏ đi            | Nguyên liệu/món bị bỏ vì sơ chế, lỗi, hỏng, quá hạn.                | void/refund                |
| `yield`                   | tỷ lệ thu hồi            | Lượng usable sau sơ chế/chế biến so với lượng mua.                  | recipe qty                 |
| `trim_loss`               | hao hụt sơ chế           | Phần mất khi làm sạch/cắt tỉa.                                      | cooking loss               |
| `cooking_loss`            | hao hụt nấu nướng        | Mất trọng lượng/số lượng khi nấu.                                   | trim loss                  |
| `portion_cost`            | giá vốn khẩu phần        | Cost cho một phần/món theo recipe/yield.                            | menu price                 |
| `landed_cost`             | giá nhập đủ chi phí      | Giá hàng gồm phí vận chuyển/handling liên quan để đưa hàng vào kho. | unit price trần            |
| `purchase_variance`       | chênh lệch mua hàng      | Chênh giữa PO, GRN, invoice về lượng/giá.                           | stocktake variance         |
| `cycle_count`             | kiểm kê luân phiên       | Kiểm kê một phần theo lịch.                                         | stocktake toàn kho         |

### Menu, bàn, và hiệu suất vận hành

| Term                       | Nhãn chuẩn                    | Nghĩa agent phải biết                                                        | Không được lẫn với            |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `average_order_value`      | giá trị trung bình mỗi đơn    | Doanh thu ròng / số đơn.                                                     | chi tiêu trung bình mỗi khách |
| `average_check`            | hóa đơn trung bình            | Tương tự AOV/check average, tùy check/order model.                           | total collected               |
| `covers`                   | lượt khách                    | Số khách phục vụ; chỉ dùng khi capture guest count.                          | order count                   |
| `average_spend_per_cover`  | chi tiêu trung bình mỗi khách | Net sales / covers.                                                          | AOV                           |
| `table_turnover`           | vòng quay bàn                 | Số lượt khách/party mỗi bàn trong kỳ.                                        | inventory turnover            |
| `seat_occupancy`           | tỷ lệ lấp đầy chỗ ngồi        | Seat-hours used / seat-hours available.                                      | table turnover                |
| `RevPASH`                  | doanh thu trên ghế-giờ        | Revenue per available seat hour; hữu ích khi dine-in capacity là bottleneck. | AOV                           |
| `party_size`               | quy mô nhóm khách             | Số khách trong một bàn/party.                                                | covers cả ngày                |
| `dwell_time`               | thời gian ngồi bàn            | Thời gian khách chiếm bàn.                                                   | prep time                     |
| `ticket_time`              | thời gian xử lý phiếu         | Thời gian từ gửi bếp đến ready/served.                                       | dwell time                    |
| `prep_time`                | thời gian chế biến            | Thời gian bếp chuẩn bị món.                                                  | service time                  |
| `service_time`             | thời gian phục vụ             | Thời gian từ order/ready đến served hoặc close tùy metric.                   | prep time                     |
| `86_item`                  | món tạm hết                   | Món không bán được vì hết nguyên liệu/sản xuất.                              | deactivated menu item         |
| `menu_engineering`         | phân tích menu                | Phân loại món theo popularity và contribution margin.                        | báo cáo doanh thu đơn thuần   |
| `item_popularity`          | độ phổ biến món               | Tỷ trọng món trong product mix.                                              | profitability                 |
| `item_contribution_margin` | lãi đóng góp theo món         | Net item sales - variable cost của món.                                      | gross profit toàn cửa hàng    |
| `menu_price`               | giá bán menu                  | Giá niêm yết đã gồm VAT, trước discount; không cộng VAT lần hai tại POS.      | net sales                     |

### Ranh giới thuế doanh nghiệp

| Term                    | Nhãn chuẩn                 | Nghĩa agent phải biết                                  | Không được lẫn với                       |
| ----------------------- | -------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `taxable_revenue`       | doanh thu tính thuế        | Revenue dùng làm căn cứ kê khai theo cấu hình pháp lý. | net sales for margin                     |
| `invoice_issued_amount` | giá trị HĐĐT đã phát hành  | Tổng tiền trên HĐĐT đã phát hành.                      | doanh thu POS nếu hóa đơn chưa phát hành |
| `vat_payable`           | GTGT phải nộp              | Nghĩa vụ theo phương pháp khấu trừ bằng GTGT đầu ra trừ GTGT đầu vào được khấu trừ và cộng/trừ điều chỉnh; phương pháp khác có công thức riêng. | VAT đầu ra trên màn HĐĐT |
| `cit_payable`           | TNDN phải nộp              | Nghĩa vụ thuế TNDN của doanh nghiệp trong kỳ.          | PIT payroll, VAT payable                 |
| `tax_withholding`       | khấu trừ thuế              | Thuế bị khấu trừ/nộp thay bởi nền tảng/đối tác nếu có. | platform commission                      |
| `invoice_cancellation`  | hủy HĐĐT                   | Hủy hóa đơn theo trạng thái/provider/luật.             | refund order                             |
| `invoice_replacement`   | thay thế HĐĐT              | Lập hóa đơn thay thế sau sai sót/hủy theo quy định.    | edit receipt                             |
| `customer_tax_info`     | thông tin người mua lấy HĐ | MST/tên/địa chỉ người mua khi yêu cầu HĐĐT.            | thông tin khách lẻ bắt buộc              |

## Canonical terms

Format: `canonical_term` — **label** — one-sentence definition. Detail → linked
domain doc.

### Organization

| Term | Label | Definition |
| --- | --- | --- |
| `tenant` | hồ sơ doanh nghiệp | Single-tenant system subject row. |
| `joint_stock_company` | công ty cổ phần | Current legal form of Má Tư. Detail: `business-context.md`. |
| `legal_representative` | người đại diện theo pháp luật | Registered legal representative; not HR title or owner user. |
| `beneficial_owner` | chủ sở hữu hưởng lợi | Beneficial owner when law requires disclosure. |
| `shareholder` | cổ đông | Share register owner. |
| `branch` | chi nhánh | L1 operational site (sell, stock, transfer, count). |
| `branch_warehouse` | kho chi nhánh | Sole active warehouse at a branch site. |
| `site` | site vận hành | Technical umbrella for branch/location kinds. |
| `tax_registration` | đăng ký thuế | Legal MST/name/address registration; not brand display name. |

### Surfaces & modules

| Term | Label | Definition |
| --- | --- | --- |
| `admin` / `admin_overview` | quản trị / tổng quan quản trị | Short alias of `control_surface` / attention landing on it. |
| `finance_basic` | tài chính vận hành | Daily money, stock value, food cost, expenses, HĐĐT — not full GL. |
| `inventory_ops` | điều hành kho | Inventory module on `control_surface`. |
| `point_of_sale` / `kitchen_display_system` | POS / KDS | Order capture / kitchen display stations. |
| `pickup_display` | Gọi số (formal: Màn gọi số) | Guest + delivery shipper read-only ready board (`/br/[branchId]/pickup`). Not a staff food-runner workflow. |
| `employee_portal` | Ca của tôi | Branch personal day-flow (`/br/.../shift`, `/br/.../profile`). Not `/me` (`Trang cá nhân`) and not the shift checklist label `Việc trong ca`. |

### Sales / POS / KDS

| Term | Label | Definition |
| --- | --- | --- |
| `order` | đơn hàng bán (chrome: Đơn bán) | POS sale order. Chrome/nav uses short `Đơn bán`; formal long stays `Đơn hàng bán`. |
| `order_item` | dòng món | Line on a sale order. |
| `menu_item` | món bán | Sellable menu item. |
| `modifier` | tùy chọn món | Add/remove choice on a menu item; not a separate sellable side. |
| `combo` | combo | Bundled sellable set under one price/promo. |
| `promotion` | Khuyến mãi | Owner campaign that attributes a POS discount (ADR 0039). |
| `promo_code` | Mã giảm | Reusable campaign code entered at POS. |
| `voucher_code` | Mã voucher | One-time unique code with optional face value. |
| `portion_quantity` | số phần (`Nx`) | Leading `Nx` = number of main portions. |
| `side_portion_qty` | SL trên phần (`xN`) | Trailing `xN` = qty per portion, not multiplied across portions. |
| `table_session` | phiên bàn | Dine-in table service lifecycle. |
| `takeaway_context` | ngữ cảnh mang về | Takeaway context that may hold multiple open orders. |
| `pos_session` | ca POS | Open sales session per branch (D7). |
| `terminal` | đăng ký POS | Minimal register record to open a session. |
| `kds_ticket` | phiếu bếp | Kitchen display ticket. |
| `printer` | máy in | LAN printer fleet bindings for a branch. |
| `ready` / `served` / `completed` | sẵn sàng / đã phục vụ / hoàn thành POS | Kitchen done / fulfillment marker / paid+closed POS. |
| `release_table` | trả bàn | Auto table release on POS completed/cancelled. |
| `covers` | lượt khách | Guest count only when POS captures it. |
| `party_size` | quy mô nhóm khách | Guests in one table/party. |

Branch Ops CTA verbs: **Vào POS**, **Mở ca**, **Vào KDS**, **Vào Gọi số**, **Bếp (KDS)**,
**Trạm bếp**, **Đăng ký POS**, **Thiết lập chi nhánh**, **Điều hành**.

### Inventory / procurement

Detail: `inventory.md`, `inventory-sop.md`.

| Term | Label | Definition |
| --- | --- | --- |
| `stock_request` | yêu cầu hàng | Internal replenishment request from central sites to a branch. |
| `purchase_request` | yêu cầu mua | Central purchase need that may spawn POs per supplier. |
| `purchase_order` | đơn đặt hàng NCC | Commitment to one supplier under one purchase request. |
| `goods_received_note` | phiếu nhập kho | One physical receipt against one PO. |
| `supplier_invoice` | hóa đơn NCC | Supplier input invoice; commercial price authority. |
| `accounts_payable` | công nợ NCC | Amount still owed after payments/credits. |
| `po_applied_quantity` / `excess_quantity` / `shortage_quantity` | số lượng tính vào đơn / dư ngoài đơn / còn thiếu | PO apply / over-receipt at cost 0 / remaining PO qty. |
| `supplier_payment` | thanh toán NCC | Payment to a supplier. |
| `stock_level` / `stock_movement` | tồn kho / biến động tồn kho | On-hand snapshot+WAC / append-only ledger. |
| `stock_transfer` / `stock_issue` | phiếu điều chuyển / phiếu xuất kho | Inter-site move document (chrome short: Điều chuyển) / internal issue or write-off document. Fulfillment workspace chrome that also covers `stock_request` is `Giao nhận`, not a synonym for this document. |
| `transfer_source_variance` | thiếu do nơi xuất | ADR 0028 default short-receive class: shipping site owns the shortfall as preparation/shipping variance. |
| `transfer_transit_loss` / `Nhận thiếu` | nhận thiếu | ADR 0028 exception: in-transit damage, breakage, or loss — operator label `Nhận thiếu`; stored code `transfer_transit_loss`. |
| waste / stocktake `reason_code` | (see `WASTE_REASON_LABELS_VI`) | ADR 0031 shared causal catalog for waste and stocktake variance; not ownership. |
| `consumption` | tiêu hao | Stock decrease from sale, production, waste, or approved use. |
| `stocktake` / `inventory_count_slip` | kiểm kê / phiếu đếm | Count session / assigned count slip. |
| `base_unit` / `entry_unit_id` / `to_base_factor` | đơn vị chuẩn / đơn vị chứng từ / quy đổi | Ledger unit / document unit / snapshot factor to base. |
| `purchase_unit_cost` / `average_unit_cost` / `weighted_average_cost` | đơn giá nhập / giá vốn BQ (`WAC`) | Confirmed supplier-invoice unit price / on-hand WAC method. |
| `reference_unit_cost` / `movement_unit_cost` / `inventory_value` / `site_wac` | giá tham chiếu / đơn giá ghi sổ / giá trị tồn / giá vốn kho này | Catalog hint cost / movement snapshot cost / book value of on-hand / site WAC. |
| `raw_material` / `finished_good` | nguyên liệu / thành phẩm | Input stock / produced or held finished stock. |
| `recipe` / `production_recipe` / `production_order` | định mức món bán / công thức sản xuất / lệnh sản xuất | POS consumption BOM / FG BOM / production run. |
| `three_way_matching` | đối soát 3 chứng từ | Match PO + GRN + supplier invoice. |

### Payments & cash

| Term | Label | Definition |
| --- | --- | --- |
| `payment_method` | phương thức thanh toán | Customer method on `payments.method` (`cash`, `vietqr`). |
| `cash` / `vietqr` / `bank_transfer` | tiền mặt / VietQR / chuyển khoản | Customer cash / customer QR / supplier payout method. |
| `payment_status` / `payment_close` | trạng thái thanh toán / đóng thanh toán POS | unpaid→partial→paid / event that completes the POS order. |
| `cash_session` | ca tiền mặt | Drawer open/count/variance session. |

### Tax / e-invoice / accounting

Detail: `einvoice-tax.md`, `legal-framework-2026.md`, `finance-assets-vat-fnb.md`,
`accounting-books-tt133-tt99.md`.

| Term | Label | Definition |
| --- | --- | --- |
| `value_added_tax` / `output_vat` | thuế GTGT / GTGT đầu ra | VAT per registered method / output VAT for the period. |
| `input_vat_recorded` / `input_vat_pending_review` / `input_vat_deductible` / `input_vat_non_deductible` | GTGT đầu vào đã ghi nhận / chờ kiểm tra / được khấu trừ / không khấu trừ | Input VAT lifecycle states. |
| `vat_rate` | thuế suất GTGT | Percent points (e.g. `8.00`), not fraction `0.08`. |
| `corporate_income_tax` | thuế TNDN | Corporate income tax; not salary PIT. |
| `tax_invoice` / `cash_register_invoice` | hóa đơn điện tử bán ra / HĐĐT từ máy tính tiền | Output e-invoice / cash-register e-invoice. |
| `receipt` | phiếu tạm tính | POS printout without CQT code; not a legal e-invoice. |
| `cqt_code` / `invoice_series` / `invoice_number` | mã CQT / ký hiệu hóa đơn / số hóa đơn | Authority code / series / number after issue. |
| `einvoice_provider` / `declared_period` | nhà cung cấp HĐĐT / kỳ kê khai | Current runtime provider (`viettel`) / declaration period. |
| `enterprise_accounting_book` / `cashbook` | sổ kế toán doanh nghiệp / sổ quỹ | Statutory books vs operational cash book. |

### HR / payroll

Detail: `payroll-pit.md`, `labor-contracts.md`, `modules/auth.md` HR contract.

| Term | Label | Definition |
| --- | --- | --- |
| `employee` / `employment_contract` | nhân viên / hợp đồng lao động | HR employee row / labor contract row. |
| `employer` / `employee_party` | người sử dụng lao động / người lao động | Company as employer / employee party. |
| `position` | chức vụ | HR job label; never permission by itself. |
| `permission_key` | khóa quyền | System action permission string. |
| `probation` / `fixed_term_contract` / `indefinite_contract` | thử việc / HĐ xác định thời hạn / HĐ không xác định thời hạn | Contract tenure kinds. |
| `attendance` / `shift` / `timesheet` | chấm công / ca làm / bảng công | Work presence / shift window / period attendance summary. |
| `social_insurance` / `health_insurance` / `unemployment_insurance` | BHXH / BHYT / BHTN | Distinct insurance types. |
| `personal_income_tax_salary` | TNCN tiền lương | Salary PIT; not corporate CIT. |
| `gross_salary` / `net_salary` / `insurance_base_salary` | lương gộp / lương thực lĩnh / mức lương đóng bảo hiểm | Pre-deduction / take-home / insurance base. |
| `payroll_period` / `payroll_entry` | kỳ lương / dòng lương | Pay period / one employee×period line. |

## Easy-to-confuse pairs

| Pair | Rule |
| --- | --- |
| Collected cash vs net sales vs issued HĐĐT | Money in ≠ margin revenue ≠ invoiced revenue. |
| `gross_sales` vs `net_sales_before_vat` | Gross before discounts; net sales before VAT is default margin revenue. |
| `food_cost` vs purchase spend vs opex | Food cost is consumption/waste per contract, not every purchase. |
| `inventory_value` vs profit | Stock book value is not profit. |
| Gross/operating/net profit vs cash flow | Profit ladder ≠ bank/cash movement. |
| `supplier_invoice` vs `tax_invoice` vs `receipt` | Input invoice ≠ output e-invoice ≠ POS temp slip. |
| `payment_status` vs `order_status` vs `invoice_status` | Pay state ≠ kitchen/POS state ≠ e-invoice state. |
| `stock_transfer` vs `stock_issue` vs `consumption` | Move vs issue doc vs approved usage decrease. |
| `order` vs `purchase_order` | Sale order ≠ supplier PO. |
| `completed` vs `served` | Commercial close ≠ fulfillment served. |
| CIT vs salary PIT | Company tax ≠ employee wage tax. |

## Related docs

- Metrics/cards: `operational-data-contract.md`
- Inventory: `inventory.md`, `inventory-sop.md`
- Tax/legal: `legal-framework-2026.md`, `einvoice-tax.md`, `payroll-pit.md`,
  `labor-contracts.md`
- Business boundary: `business-context.md`
- Screen audience: `screen-context-map.md`
