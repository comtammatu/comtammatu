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
| `Employee Portal` | `Ca của tôi` (`employee_portal` / `/me`) |
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
| Personal work surface | `Ca của tôi` | — | `APP_COPY_VI.employeePortal` |
| Branch home / today chip | `Hôm nay` | — | `MODULE_LABELS_VI.branch_home` |
| Stock fulfillment workspace | `Giao nhận` | covers YCH + nhận/giao | inventory dictionary `transfers` |
| Stock transfer document | `Điều chuyển` | `Phiếu điều chuyển` | glossary `stock_transfer` |
| Control surface | `Quản trị` | — | `APP_COPY_VI.ownerSurface` |
| Shift checklist items | `Việc trong ca` | — | not the `/me` portal name |

## Product Dual Thesis

SSOT map: `docs/spec/architecture.md`. Role ACL `owner` ≠ product plane.

| Term | Label | Definition |
| --- | --- | --- |
| `control_surface` | Quản trị | L0 admin plane (`AppShell`): `/`, `/menu`, `/orders`, `/inventory`, `/finance`, `/hr`, `/branches`, `/settings`, `/feedback`. |
| `branch_surface` | Chi nhánh | `/br/[branchId]/*` branch runtime chrome excluding full-screen stations. |
| `station_chrome` | POS / KDS / Gọi số | Full-screen one-job chrome under `/br/[branchId]/{pos,kds,pickup}`. |
| `operational_role` | vai trò vận hành | Non-full-Owner roles in the route matrix; not a plane name. |
| `owner` | Chủ sở hữu | Full L0 ACL role; never the name of the product plane. |
| `restaurant_operations_system` | bộ phần mềm quản lý vận hành và bán hàng | Product name for `comtammatu`. |

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
| `employee_portal` | Ca của tôi | Personal day-flow surface (`/me/*`, Branch shift/profile). Not the shift checklist label `Việc trong ca`. |

### Sales / POS / KDS

| Term | Label | Definition |
| --- | --- | --- |
| `order` | đơn hàng bán (chrome: Đơn bán) | POS sale order. Chrome/nav uses short `Đơn bán`; formal long stays `Đơn hàng bán`. |
| `order_item` | dòng món | Line on a sale order. |
| `menu_item` | món bán | Sellable menu item. |
| `modifier` | tùy chọn món | Add/remove choice on a menu item; not a separate sellable side. |
| `combo` | combo | Bundled sellable set under one price/promo. |
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
| `reference_unit_cost` / `movement_unit_cost` / `inventory_value` | giá tham chiếu / đơn giá ghi sổ / giá trị tồn | Catalog hint cost / movement snapshot cost / book value of on-hand. |
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
