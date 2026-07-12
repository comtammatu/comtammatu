# Chuẩn hoá danh mục và đơn vị tồn kho v1

Mục tiêu của chuẩn này là làm rõ dữ liệu kho để POS/KDS trừ đúng món, quản lý nhìn đúng tồn kho, và tránh dùng `item_kind`/`category` như các nhãn tạm hoặc dữ liệu test.

## Nguyên tắc

- `units.code` là mã kỹ thuật ổn định, dùng cho FK và logic quy đổi. Không đổi `code` nếu không có migration đổi toàn bộ tham chiếu.
- `units.name` là nhãn hiển thị. Có thể dùng tiếng Việt hoặc ký hiệu quen thuộc như `kg`, `ml`.
- Mỗi nguyên liệu/thành phẩm phải có ít nhất một dòng `ingredient_units` base unit. Base unit hiện tại là `purchase_unit`.
- `item_kind` chỉ dùng để phân loại bản chất hàng tồn, không dùng làm category hiển thị.
- `category` và `category_id` là nhóm vận hành cho quản lý kho. Khi đổi category phải cập nhật cả hai để UI và dữ liệu không lệch nhau.
- Dữ liệu test không được giữ bằng tên category hoặc sku như `Pilot stock-control` / `PILOT-*`.

## item_kind mục tiêu

Trạng thái code hiện tại vẫn chỉ validate `raw_material | finished_good` ở một số form/RPC kho. Vì vậy v1 áp dụng trước chỉ chuẩn hoá `category/category_id`, giữ `item_kind` vật tư/bán thành phẩm ở `raw_material` cho tới khi UI/RPC hỗ trợ đủ enum mở rộng.

| `item_kind` | Nghĩa vận hành | Ví dụ |
| --- | --- | --- |
| `raw_material` | Nguyên liệu mua vào hoặc đầu vào chưa sẵn bán | thịt tươi, gạo, rau, gia vị, trái cam |
| `semi_finished` | Bán thành phẩm đã sơ chế/nấu, được dùng làm cấu phần món bán | sườn cốt lết thành phẩm, bì, chả, nước mắm thành phẩm |
| `finished_good` | Thành phẩm/đồ uống bán trực tiếp qua POS hoặc map gần 1:1 với món bán | Sprite, Fanta, nước suối, cà phê, cơm thêm |
| `packaging` | Bao bì và vật tư phục vụ bán hàng | bọc, hộp, ly, nắp, ống hút, muỗng nĩa, tăm |
| `supply` | Vật tư vận hành nội bộ, không phải nguyên liệu món bán | giấy máy in, giấy vệ sinh, nước rửa chén, túi rác, than |

Stage A:

- `finished_good`: chỉ dùng cho đồ/món bán trực tiếp đang cần stock-control theo recipe.
- `raw_material`: tạm giữ cho nguyên liệu, bán thành phẩm, bao bì và vật tư để các màn hình hiện tại vẫn chỉnh được.
- Category chuẩn là nguồn phân biệt chính cho `Bán thành phẩm`, `Bao bì`, `Vật tư vận hành`.

Stage B:

- Mở rộng Zod/UI/RPC để chấp nhận `semi_finished`, `packaging`, `supply`.
- Sau đó mới migrate `item_kind` sang enum mục tiêu.

## Category chuẩn

| Category | Dùng cho |
| --- | --- |
| `Thịt` | Thịt tươi và nhóm thịt sống |
| `Rau củ` | Rau, củ, quả dùng cho món ăn |
| `Gạo & tinh bột` | Gạo, bún tàu và nhóm tinh bột |
| `Gia vị` | Gia vị, nước tương, nước mắm chai, rượu nấu, mật ong, mạch nha |
| `Dầu & sốt` | Dầu ăn, dầu điều, dầu mè, dầu hào |
| `Đồ uống nguyên liệu` | Trà khô, trái tắc/cam, sữa đặc, nguyên liệu pha đồ uống |
| `Đồ uống bán trực tiếp` | Lon/chai/ly đồ uống bán qua POS |
| `Bán thành phẩm bếp` | Thành phẩm bếp dùng làm cấu phần món bán |
| `Bán thành phẩm đồ uống` | Nền đồ uống đã pha/nấu dùng làm cấu phần đồ uống |
| `Bao bì & vật tư bán hàng` | Bao bì, ly, nắp, ống hút, muỗng nĩa, vật tư đi kèm đơn |
| `Vật tư vận hành` | Vật tư nội bộ như giấy máy in, túi rác, nước rửa chén, than |
| `Nguyên liệu khác` | Nhóm tạm cho nguyên liệu thật nhưng chưa đáng tách category riêng |

## Units chuẩn

`units.code` là mã máy ổn định bằng tiếng Anh, viết thường theo `snake_case`.
`units.name` là nhãn tiếng Việt cho người vận hành:

| code | name |
| --- | --- |
| `sack` | `bao` |
| `pouch` | `bịch` |
| `piece` | `cái` |
| `jerrycan` | `can` |
| `stick` | `cây` |
| `bottle` | `chai` |
| `g` | `gram` |
| `packet` | `gói` |
| `box` | `hộp` |
| `jar` | `hũ` |
| `kg` | `kg` |
| `tray` | `khay` |
| `l` | `lít` |
| `multipack` | `lốc` |
| `tin_can` | `lon` |
| `cup` | `ly` |
| `ml` | `ml` |
| `portion` | `phần` |
| `case` | `thùng` |
| `fruit` | `trái` |
| `bag` | `túi` |
| `blister_pack` | `vỉ` |

## Quyết định dọn dữ liệu test

- Xoá `Cam ép - Thành Phẩm` vì dòng này không có recipe, không có stock/order reference trong audit hiện tại, và món `Cam ép` đã dùng nguyên liệu thật là `Trái Cam` với quy đổi `kg -> ml -> ly`.
- Giữ `7UP - Thành Phẩm`, `Nước suối - Thành Phẩm`, `Cà Phê - Thành Phẩm`, `Cơm trắng - Thành Phẩm` vì đang có recipe liên kết. Chỉ bỏ dấu test khỏi `category` và `sku`.
- Xoá hoặc vô hiệu hoá category cũ chỉ khi không còn active ingredient trỏ tới category đó.

## Edge case cần giữ

- Không đổi `units.code` bằng tay vì `recipes.entry_unit_id` và `ingredient_units.unit_id` đang FK theo `units.id`.
- Không xoá nguyên liệu nếu đã có recipe, stock movement, purchase order, inventory count hoặc shift default tham chiếu.
- Nếu một dòng `- Thành Phẩm` chưa có recipe, không được tự động coi là bán được ở POS. Nó chỉ là stock item cần cấu hình recipe hoặc định mức tiếp theo.
- Nếu một món POS cần trừ theo nhiều cấu phần, recipe phải khai báo đủ từng line. Ví dụ sườn kèm trứng phải có line cho sườn và line cho trứng hoặc side consumption riêng.
