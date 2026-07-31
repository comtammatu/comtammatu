# Chỉ mục quyết định tương thích

> Các mã `Dxxx` được giữ để những inbound reference còn hiệu lực không mất
> nghĩa. Đây không phải backlog, worklog hay nguồn mô tả chi tiết. ADR, spec,
> ref, module docs và rules được trỏ trong từng entry mới là authority. Quyết
> định đã supersede bị xóa; Git giữ lịch sử.

## D002: Tenant → Branch

**Net effect:** Phân cấp runtime là `Tenant (L0) → Branch (L1)`, không có Brand
scope hoặc Brand claim. Canonical: `docs/spec/architecture.md`.

## D005: Infrastructure do owner quản lý

**Net effect:** Source chỉ giữ biến môi trường và guard; agent không tự tạo
infrastructure ngoài nhiệm vụ được owner ủy quyền rõ ràng. Canonical:
`docs/agent/rules/database.md`.

## D009: Path-based routing

**Net effect:** Owner ở `/`; Branch runtime ở `/br/[branchId]/*`; ACL tập trung
tại proxy và module ACL. Nhân sự không gắn site dùng self-service `/me/*`;
Owner bị từ chối tường minh khỏi route family này. Canonical:
`docs/spec/architecture.md`, ADR 0012.

## D010: Form contract

**Net effect:** Form CRUD dùng React Hook Form, Zod và Má Tư DS Field; ngoại lệ
chỉ khi owning module ghi rõ. Canonical: `docs/modules/ui.md`.

## D011: Print-agent LAN-only

**Net effect:** `apps/print-agent` chỉ hỗ trợ máy in LAN; không có USB transport
hoặc runtime transport switch. Canonical: `docs/modules/infrastructure.md`.

## D012: Vận hành tinh gọn

**Net effect:** PWA là client vận hành; không đưa Local-first POS, native rewrite
hay payment rail không có consumer vào backlog. Role sàn bán hàng là `cashier`.

## D015: `main` là Production track của CTCP Chén Sứ

**Net effect:** `main` chỉ phục vụ CTCP Chén Sứ/Cơm Tấm Má Tư. Production duy
nhất là Vercel `comtammatu`, Supabase `enloyfnuerqgaqderbwb`, domain
`web.comtammatu.com`. Không nhập dữ liệu, Auth, secret hoặc runtime evidence của
pháp nhân khác. Canonical: `docs/agent/rules/database.md`, ADR 0016.

## D016: POS stock outcome

**Net effect:** Trừ tồn bán hàng theo final order outcome và feature contract;
không đặt stock mutation vào client/payment UI. Canonical:
`docs/ref/operational-data-contract.md`.

## D017: Owner L0, Branch Manager L1

**Net effect:** Owner quản lý Tenant; Branch Manager vận hành đúng chi nhánh.
Self plane chỉ phục vụ hồ sơ/ngày làm của nhân viên không phải Owner và không
tạo thêm cấp quản trị. Canonical: ADR 0012 và
`docs/spec/role-route-matrix.md`.

## D018: Không có tenant-admin phụ

**Net effect:** `owner` là tenant administrator duy nhất. Role và claim
canonical nằm trong `packages/shared/src/auth/`.

## D019: Control surface và branch surface

**Net effect:** `control_surface` dùng shared management chrome; `branch_surface`
dùng operator/station chrome. Một capability có một route home, nav là data và
outer padding thuộc `AppPage`. Canonical: `docs/spec/design-system.md`,
`docs/spec/role-route-matrix.md`.

## D020: Finance vận hành, không phải sổ kế toán doanh nghiệp

**Net effect:** Product không cung cấp General Ledger/TT 200/VAS close UI.
Database close/reopen support không trở thành app surface. Canonical:
`docs/modules/finance.md`, ADR 0016.

## D022: HĐĐT theo payment event

**Net effect:** HĐĐT được enqueue khi thanh toán hoàn tất; không có local draft
sau thanh toán. Canonical: `docs/ref/einvoice-tax.md`, ADR 0013.

## D023: Correction ngoài POS

**Net effect:** Sửa payment/HĐĐT thuộc Owner/Accountant; POS chỉ giữ full
void-after-paid đã được contract cho phép. Canonical: `docs/modules/finance.md`.

## D026: HR theo Người, Ngày công, Lương

**Net effect:** HR đọc nguồn vận hành hiện tại; payroll entry là snapshot khi
chốt. Kế toán dùng `pay_basis` có hiệu lực theo hợp đồng:
`fixed_monthly` không prorate lương cơ bản theo attendance, phép hưởng lương
không giảm lương, phép không hưởng lương tạo khoản khấu trừ tường minh. Không
suy `pay_basis` từ JWT role. HR chốt nghĩa vụ lương, Finance ghi nhận thanh
toán. Canonical: `docs/ref/payroll-pit.md`, `docs/ref/labor-contracts.md`.

## D027: Chấm công theo ca

**Net effect:** Đơn vị attendance là ca; shift là cấu hình chung; mỗi lượt vào/ra
và việc trong ca thuộc một shift record. Mọi non-Owner đều có self-service:
floor/central lưu site được gán, Kế toán lưu `branch_id = NULL`; Owner không
punch. Checkout floor do Branch Manager duyệt, central/Kế toán vào queue Owner.
Canonical: `docs/spec/database-schema.md`, `docs/ref/payroll-pit.md`, ADR 0012.

## D028: Kết quả vận hành và kiểm soát nguyên liệu

**Net effect:** Tiêu hao nguyên liệu dựa trên đếm thực tế và stock ledger.
Finance hiển thị `Kết quả vận hành`, dòng tiền và số dư quỹ theo nguồn riêng;
không gọi các chỉ số này là `Lợi nhuận ròng`. Canonical:
`docs/ref/operational-data-contract.md`, `docs/modules/finance.md`.

## D029: Money display

**Net effect:** Glyph tiền app/print là `đ`; số tiền dùng formatter và money
helpers theo domain, không dùng formatter làm nguồn tính. Canonical:
`docs/spec/design-system.md`.

## D030: Ratchet allowlist

**Net effect:** Allowlist của guard là sàn false-positive có phân loại, không
phải backlog phải ép về zero bằng sửa hình thức.

## D033: TypeScript/Supabase trunk

**Net effect:** `main` dùng TypeScript/Next.js/Supabase hiện hành; không có Go
port song song.

## D039: HĐĐT provider result

**Net effect:** Provider result được xử lý qua canonical invoice job/provider
contract; không dựng đường phát hành thứ hai. Canonical:
`docs/ref/einvoice-tax.md`.

## D040: Không dùng tax percentage giả

**Net effect:** VAT/HĐĐT dùng tax rate theo dòng và cấu hình pháp lý/provider;
không dùng `taxPercentage` tổng hợp giả. Canonical: ADR 0016.

## D041: Payroll calculation atomic

**Net effect:** Payroll calculation nhiều dòng đi qua một RPC atomic và snapshot
versioned tax/labor inputs.

## D043: Payment authorization

**Net effect:** Payment RPC tự kiểm tra permission và scope; UI visibility không
thay authorization.

## D044: Một UI contract

**Net effect:** Má Tư Design System là UI SSOT duy nhất. Canonical:
`docs/spec/design-system.md`.

## D046: Foreground notification

**Net effect:** Popup thiết bị chỉ chạy khi PWA đang mở; không có Web Push
server layer. Canonical: `docs/spec/toast-notification-system.md`.

## D048: IA Người và Chi nhánh

**Net effect:** HR quản lý nhân sự/tài khoản; Branch management quản lý site.
Không dựng roster hoặc admin surface thứ hai.

## D049: Full void-after-paid

**Net effect:** POS chỉ được full void theo canonical atomic correction; partial
financial correction vẫn thuộc Owner/Accountant.

## D050: Operator workspace

**Net effect:** Branch daily work nằm trong `/br/[branchId]/*`, mobile-first,
scope lấy từ URL và verified claims. Canonical: ADR 0012.

## D052: Việc trong ca theo vị trí

**Net effect:** `position_shift_tasks` là SSOT việc trong ca theo vị trí; clock-in
snapshot task để giữ lịch sử. Sao chép từ vị trí khác là thao tác mẫu; không hồi
sinh `shift_checklist_templates` hoặc tạo workflow song song.

## D053: KDS/POS/Inventory truth

**Net effect:** KDS state, payment state và inventory outcome là các fact riêng;
không suy trạng thái vật lý từ aggregate khác. Canonical:
`docs/ref/operational-data-contract.md`.

## D056: Branch receive và consumption

**Net effect:** Branch nhận transfer và ghi consumption qua canonical
branch-native workflows; không mở branch GRN.

## D058: Hai presentation plane, một contract

**Net effect:** Management và Branch presentation khác chrome nhưng dùng chung
domain contract, route identity và shared records.

## D062: PWA delivery

**Net effect:** PWA là hướng client vận hành; native rewrite chỉ mở lại khi có
constraint phần cứng không giải được bằng PWA.

## D064: POS capacity và quota

**Net effect:** Manual quota và stock availability là hai nguồn rõ ràng; NULL
capacity fail-open, hold token chống double-count. Canonical:
`docs/ref/operational-data-contract.md`.

## D065: Một công tắc stock sale outcome

**Net effect:** Bật stock outcome đồng thời bật hard availability gate và
posting; không cho tồn âm, race ở posting fail-soft và được stocktake phát hiện.

## D069: Typography và night mode

**Net effect:** Be Vietnam Pro cho heading, Geist cho body, Geist Mono cho data.
Night mode dùng warm-dark cookie contract và không ảnh hưởng print. Canonical:
`docs/spec/design-system.md`.

## D075: Self-order dùng POS order canonical

**Net effect:** Self-order chỉ tạo canonical POS order qua server boundary;
không có session/order store song song. Approval component còn hoạt động.
Canonical: `docs/spec/self-order-guest-ui.md`.

## D076: Application roles

**Net effect:** Role, permission và route audience canonical nằm trong
`packages/shared/src/auth/` và generated role-route matrix; HR position không
trở thành authorization layer thứ hai.

## D085: Operating expense VAT

**Net effect:** Expense hỗ trợ breakdown VAT `0|5|8|10`, gross/taxable money
chính xác và attachment HĐ GTGT tùy chọn. Canonical:
`docs/ref/finance-assets-vat-fnb.md`.

## D091: Inventory topology và physical QC

**Net effect:** Mỗi active site có đúng một active warehouse. GRN ghi
received/rejected quantity; rejected quantity cần reason và ảnh. Không lot/HSD,
temperature, price-QC hoặc manual quality status. Canonical:
`docs/ref/inventory.md`.

## D093: Central-only GRN và branch stock request

**Net effect:** GRN chỉ tại Central Supply/Central Kitchen. Branch xin hàng bằng
stock request và nhận transfer; Branch không production hoặc GRN. Canonical:
`docs/ref/inventory-role-ops.md`, `docs/ref/inventory.md`.

## D099: Nhu cầu mua và phân bổ NCC

**Net effect:** Kho lập Nhu cầu mua không NCC/giá; Kế toán phân bổ đúng đủ cho
một hoặc nhiều NCC. Một RPC tạo một PO/NCC và một GRN nháp/PO. PO/GRN không là
nguồn giá thương mại; Hóa đơn NCC là price authority. Canonical:
`docs/ref/inventory.md`, ADR 0017.

## D101: Inventory valuation settlement

**Net effect:** Moving WAC tiếp tục được dùng. Valuation subledger append-only
quyết toán giá trị Hóa đơn NCC mà không tăng số lượng lần hai hoặc sửa movement
snapshot. `legacy_purchase_price_variance` chỉ ghi phần variance mở đầu không
thể suy đoán lineage. Canonical:
`docs/ref/inventory.md`, ADR 0017,
`supabase/migrations/20260730155938_inventory_valuation_subledger.sql`.
