# HĐĐT & Thuế GTGT — Hóa Đơn Điện Tử & Giá Trị Gia Tăng

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư — mô hình F&B multi-branch
> Khung pháp lý: NĐ 123/2020, NĐ 70/2025, NĐ 68/2026, TT 78/2021, Luật Thuế GTGT 2024, NQ 198/2025/QH15, NQ 204/2025/QH15
> Last updated: 2026-06-09 (Viettel S-invoice only, HKD model)

---

## 1. Tổng quan nghĩa vụ pháp lý

Cơm Tấm Má Tư hiện vận hành theo mô hình **Hộ kinh doanh (HKD)**. Không mặc
định áp dụng assumption CTCP/doanh nghiệp nộp GTGT theo phương pháp khấu trừ.
HĐĐT, mẫu hóa đơn, phương pháp tính thuế, và kỳ khai thuế phải theo cấu hình
HKD đã đăng ký với cơ quan thuế/provider.

Các mốc chính đến tháng 06/2026:

- Từ 01/01/2026, HKD/cá nhân kinh doanh không áp dụng thuế khoán; số liệu POS,
  HĐĐT, sổ doanh thu, và chứng từ phải đủ để kê khai.
- HKD có doanh thu từ 01 tỷ đồng/năm trở lên thuộc diện bắt buộc sử dụng HĐĐT;
  HKD doanh thu thấp hơn không bị buộc dùng HĐĐT nhưng được tiếp tục/tự nguyện
  sử dụng nếu đã đăng ký hợp pháp và có nhu cầu minh bạch giao dịch.
- HKD doanh thu trên 500 triệu đồng/năm thực hiện khai/nộp thuế theo NĐ
  68/2026; trường hợp doanh thu năm từ 50 tỷ đồng trở xuống khai GTGT theo quý,
  trên 50 tỷ đồng khai theo tháng.
- NQ 204/2025/QH15 giảm 2% thuế GTGT từ 01/07/2025 đến 31/12/2026 cho nhóm
  hàng hóa/dịch vụ đủ điều kiện; dịch vụ ăn uống thông thường đang được xử lý
  theo mức 8% trong thời hạn này, trừ mặt hàng thuộc nhóm loại trừ.

### 1.1 Mô hình vận hành

Trong chế độ HĐĐT active, hệ thống mặc định phát hành **HĐĐT per-order cho
payment POS**. Daily summary chỉ còn dùng cho backfill hoặc khi chủ trương vận
hành chuyển sang template tổng hợp riêng.

| Luồng                 | Khi nào                     | Tần suất                     | Đối tượng pháp lý                                |
| --------------------- | --------------------------- | ---------------------------- | ------------------------------------------------ |
| **POS realtime**      | Payment POS trong chế độ HĐĐT active | Per-order (ngay tại quầy)    | HĐ điện tử per-order; có MST nếu khách cung cấp  |
| **B2C daily summary** | Backfill hoặc rollout riêng | 1 HĐ tổng hợp/chi nhánh/ngày | HĐ tổng hợp B2C (template riêng đăng ký với CQT) |

Mỗi order chỉ thuộc **đúng 1** trong 2 luồng (không double-issue).

---

## 2. Thuế suất GTGT áp dụng cho F&B

| Loại hàng hóa / dịch vụ                    | Thuế suất | Ghi chú                                                        |
| ------------------------------------------ | --------- | -------------------------------------------------------------- |
| Thực phẩm chế biến tại chỗ (ăn uống)       | **8%**    | Áp dụng giảm 2% đến 31/12/2026 theo NQ 204/2025/QH15 nếu không thuộc nhóm loại trừ |
| Đồ uống có cồn                             | **10%**   | Bia, rượu                                                      |
| Đồ uống không cồn                          | **8%**    | Áp dụng giảm 2% đến 31/12/2026 nếu không thuộc nhóm loại trừ   |
| Nguyên liệu thực phẩm thô (rau, thịt, gạo) | **5%**    | Khi mua từ nhà cung cấp                                        |
| Dịch vụ vận chuyển nội địa                 | **8%**    | Phí giao hàng nếu có                                           |
| Xuất khẩu                                  | **0%**    | Không áp dụng                                                  |

> ⚠️ **Lưu ý hậu 31/12/2026**: NQ 204/2025/QH15 hết hiệu lực → các nhóm đang
> được giảm 2% có thể quay về **10%** nếu không có chính sách gia hạn mới. Cần
> monitor văn bản Bộ Tài chính/Quốc hội trước Q4/2026 và chuẩn bị migration thay
> đổi `vat_rate` mặc định ở `menu_items` nếu chính sách đổi.

> ⚠️ **Dev note**: Trường `vat_rate` trong `tax_invoices` và `supplier_invoices` lưu dưới dạng `NUMERIC(5,2)` (ví dụ: `8.00`, `10.00`). KHÔNG lưu dưới dạng thập phân `0.08`.

---

## 3. HĐĐT Đầu Ra (bán hàng cho khách)

### 3.1 Quy trình xuất hóa đơn

#### POS realtime (per-order, default trong chế độ HĐĐT active)

```
Payment thành công tại POS
  → Nếu khách cung cấp MST: cashier nhập thông tin người mua
  → Nếu khách không lấy HĐ: POS dùng buyerName='Người mua không lấy hóa đơn',
     MST trống, buyerNotGetInvoice=true
  → createTaxInvoice action gọi Viettel S-invoice API
  → INSERT tax_invoice (kind='per_order', status='signing'|'submitted'|'issued')
      ↳ provider failure → lưu row status='draft' để Finance xử lý
      ↳ provider submission → set signing_started_at để reconcile cron pickup
  → Reconcile cron poll CQT tới khi status='issued'
  → Archive cron tải PDF/XML sau khi issued
```

**Nghiệp vụ khóa**: khi HĐĐT active, khách không lấy hóa đơn vẫn đi theo luồng
phát hành HĐĐT cho giao dịch bán hàng theo template đã đăng ký. Form POS chỉ để
nhập thêm thông tin người mua/MST, không phải opt-out xuất HĐĐT.

#### B2C daily summary (tổng hợp ngày hôm trước)

```
Cron 02:05 ICT mỗi ngày (HOẶC admin manual trigger /finance/summary)
  → Loop từng chi nhánh active:
      → Insert summary_run_queue { trigger_source: 'cron'|'manual', triggered_by }
      → RPC aggregate_daily_b2c_invoice(branch_id, summary_date, actor)
          ↳ Lock pg_advisory(hashtext(branch_id||summary_date))
          ↳ Idempotency check: existing active summary → return { skipped: true }
          ↳ Eligible orders: payments.status='completed' AND
                             (paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = summary_date AND
                             chưa thuộc tax_invoice active nào
          ↳ INSERT tax_invoice (kind='daily_summary', order_id=NULL, status='draft')
          ↳ INSERT tax_invoice_orders junction rows (1 per order)
          ↳ Return { tax_invoice_id, line_items_for_provider, vat_breakdown }
      → RPC transition_tax_invoice_state_as_system(id, 'signing')
      → Provider.createInvoice(line_items, buyerName='Người mua không lấy hóa đơn',
         buyerNotGetInvoice=true)
      → RPC transition_tax_invoice_state_as_system(id, 'issued'|'submitted')
      → UPDATE summary_run_queue { status, finished_at }
```

**Lưu ý vận hành**: khi POS per-order đang bật, daily summary bình thường sẽ
không còn eligible orders vì mỗi payment đã có HĐ per-order. Giữ flow này cho
backfill hoặc khi chủ trương vận hành chuyển sang template tổng hợp riêng.

### 3.2 Thông tin bắt buộc trên HĐĐT đầu ra

```
- Tên, địa chỉ, MST người bán
    + Vinvoice/S-invoice hiển thị theo hồ sơ người bán đã đăng ký với Viettel/CQT
    + Runtime hiện KHÔNG tự gửi `sellerInfo`; app chỉ truyền `supplierTaxCode`
      qua `COMPANY_TAX_CODE` cho endpoint/API lookup
- Tên, địa chỉ, MST người mua
    + Khách có MST: bắt buộc tên + MST hợp lệ
    + Khách không lấy HĐ: ghi "Người mua không lấy hóa đơn", MST trống
    + B2C summary backfill: ghi "Người mua không lấy hóa đơn", MST trống
- Số thứ tự hóa đơn (do CQT cấp / provider cấp)
- Ngày lập hóa đơn
- Tên hàng hóa, đơn vị, số lượng, đơn giá
    + Per-order: chi tiết món
      * Món POS có topping/món kèm tính tiền phải tách thành từng dòng HĐĐT:
        dòng món chính dùng giá nền, sau đó mỗi topping/món kèm là một dòng
        riêng. Ví dụ Cơm sườn cốt lết kèm Bì/Chả/Trứng: 35.000 + 7.000 +
        7.000 + 5.000, không gộp thành một dòng 54.000.
    + B2C summary: gộp theo VAT rate, ví dụ "Đồ ăn 8%" + "Đồ uống có cồn 10%"
- Thành tiền:
    + Mẫu `1/...` (HĐ GTGT): đơn giá/thành tiền chưa thuế + dòng VAT tách riêng
    + Mẫu `2/...` (HĐ bán hàng từ MTT/direct method): đơn giá/thành tiền là giá bán
      trực tiếp đã gồm VAT theo menu; không chia ngược cho Viettel vì PDF không có
      cột VAT và sẽ làm lệch tổng do làm tròn từng dòng
- Thuế suất/tiền thuế GTGT: hiển thị riêng chỉ với mẫu HĐ GTGT; mẫu `2/...`
  vẫn lưu `vat_rate/vat_amount` nội bộ để báo cáo nhưng gửi provider theo giá gross
- Tổng tiền thanh toán
- Chữ ký số của người bán
```

### 3.3 Các trạng thái HĐĐT (state machine)

```
draft → signing → submitted → issued      ← trạng thái hợp lệ
                             ↓
                          cancelled         ← hủy hợp lệ (≥20 ký tự lý do)
                             ↓
                          replaced          ← thay thế bằng HĐ mới (TT 78)

[Legacy-only]
draft → not_required                       ← không được tạo mới
```

| Trạng thái     | Mô tả                                 | Cho phép hủy?         |
| -------------- | ------------------------------------- | --------------------- |
| `draft`        | Chưa ký, chưa gửi                     | Có (xóa luôn qua RPC) |
| `signing`      | Đang ký số (async)                    | Không                 |
| `submitted`    | Đã gửi CQT, chờ mã                    | Không                 |
| `issued`       | Đã có mã CQT (trạng thái cuối hợp lệ) | Có — biên bản hủy     |
| `cancelled`    | Đã hủy                                | Terminal              |
| `replaced`     | Đã thay thế                           | Terminal              |
| `not_required` | (Legacy D4) order không có MST        | Terminal              |

> **D4 deprecation note**: `not_required` không được insert mới. Logic hiện tại: order không có MST vẫn gọi provider realtime với buyerName mặc định `Người mua không lấy hóa đơn`, MST trống, `buyerNotGetInvoice=true`. Legacy `not_required` rows vẫn tồn tại trong DB phục vụ audit và không chặn phát hành HĐ per-order mới cho cùng order.

#### Allowed transitions (DB enforced)

State machine enforce qua RPC `transition_tax_invoice_state(id, to_status, payload?, note?)` (`supabase/migrations/20260425035346_tax_invoice_state_machine.sql:72-160`). Mọi UPDATE status PHẢI đi qua RPC — không cho phép client UPDATE trực tiếp.

```
draft     → signing, cancelled, not_required
signing   → submitted, issued, draft (retry on fail), cancelled
submitted → issued, cancelled
issued    → cancelled, replaced
cancelled → (terminal)
replaced  → (terminal)
not_required → (terminal)
```

RPC raise `illegal_transition` (ERRCODE 22023) khi cố gắng nhảy ngoài matrix.

#### Permission split

| Transition target        | Required permission |
| ------------------------ | ------------------- |
| `cancelled` / `replaced` | `settings:tenant`   |
| Tất cả transition khác   | `orders:write`      |

`cancel`/`replace` cần owner/super_manager (kèm biên bản hủy theo TT 78). Issuance flow (`draft → signing → submitted → issued`) cho phép cashier+ thực hiện.

#### Idempotency

Có 2 partial UNIQUE indexes:

```sql
-- Per-order: 1 active invoice per order
CREATE UNIQUE INDEX uq_tax_invoices_active_per_order
  ON tax_invoices (order_id)
  WHERE invoice_kind = 'per_order'
    AND status NOT IN ('cancelled', 'replaced', 'not_required');

-- B2C daily summary: 1 active summary per (branch, date)
CREATE UNIQUE INDEX uq_tax_invoices_active_per_summary
  ON tax_invoices (tenant_id, branch_id, summary_date)
  WHERE invoice_kind = 'daily_summary'
    AND status NOT IN ('cancelled', 'replaced');
```

Cashier double-click sẽ nhận error rõ ràng "Đơn này đã có HĐ #N", không phải raw constraint violation. Cron + manual trigger duplicate (race trong 100ms) → 1 thành công, 1 trả `{ skipped: true }`.

#### Audit trail — `tax_invoice_events`

Mỗi state transition write 1 row vào `tax_invoice_events`:

```sql
CREATE TABLE tax_invoice_events (
  id              BIGINT PRIMARY KEY,
  tax_invoice_id  BIGINT NOT NULL REFERENCES tax_invoices(id),
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  actor_id        UUID REFERENCES profiles(id),    -- NULL cho cron system actor
  payload         JSONB,                            -- state-specific (cancel_reason, provider response, ...)
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- RLS: `finance:view` permission required
- INSERT only via `transition_tax_invoice_state` / `_as_system` RPC (no DML grants to authenticated)
- `tax_invoices.provider_data` accumulates per-state via JSONB merge (`||`) — cancel KHÔNG ghi đè provider payload gốc; full history ở `tax_invoice_events`

### 3.4 Database — bảng `tax_invoices`

```sql
CREATE TABLE tax_invoices (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id            BIGINT NOT NULL REFERENCES tenants(id),
  branch_id            BIGINT NOT NULL REFERENCES branches(id),
  order_id             BIGINT REFERENCES orders(id),            -- NULL khi invoice_kind='daily_summary'

  -- Phân loại HĐ
  invoice_kind         TEXT NOT NULL DEFAULT 'per_order'
                         CHECK (invoice_kind IN ('per_order','daily_summary')),
  summary_date         DATE,                                    -- chỉ set khi 'daily_summary'
  summary_orders_count INTEGER,                                 -- chỉ set khi 'daily_summary'

  -- shape constraint
  CONSTRAINT chk_invoice_kind_shape CHECK (
    (invoice_kind = 'per_order'
       AND order_id IS NOT NULL
       AND summary_date IS NULL)
    OR (invoice_kind = 'daily_summary'
       AND order_id IS NULL
       AND summary_date IS NOT NULL
       AND summary_orders_count IS NOT NULL)
  ),

  -- Trạng thái
  status               TEXT NOT NULL DEFAULT 'draft',
                       -- draft|signing|submitted|issued|cancelled|replaced|not_required

  -- Thông tin người mua
  buyer_name           TEXT,
  buyer_tax_code       TEXT,
  buyer_address        TEXT,
  buyer_email          TEXT,

  -- Số liệu thuế
  subtotal             NUMERIC(15,2) NOT NULL,
  vat_rate             NUMERIC(5,2)  NOT NULL DEFAULT 8.00,
  vat_amount           NUMERIC(15,2) NOT NULL,
  total_amount         NUMERIC(15,2) NOT NULL,

  -- Provider
  provider             TEXT NOT NULL,                           -- runtime: 'viettel'; historical rows may contain 'misa'/'mock'/'skipped'
  provider_ref         TEXT,                                    -- ID phía provider (transactionUuid)
  provider_data        JSONB,                                   -- payload tích lũy theo state
  cqt_code             TEXT,                                    -- Mã CQT cấp (sau khi issued)
  invoice_number       TEXT,                                    -- Số hóa đơn
  invoice_series       TEXT,                                    -- Ký hiệu mẫu, ví dụ: "1C25TLL"

  -- Tài liệu
  pdf_url              TEXT,
  xml_url              TEXT,

  -- Hủy / thay thế
  cancel_reason        TEXT,                                    -- ≥20 ký tự khi cancel
  replaced_by_id       BIGINT REFERENCES tax_invoices(id),

  -- Timestamps
  signing_started_at   TIMESTAMPTZ,
  issued_at            TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES profiles(id)             -- nullable cho cron system actor
);
```

### 3.5 Junction table — `tax_invoice_orders`

Map 1 HĐ tổng hợp → N orders. Một order chỉ được trong **đúng 1** active summary HĐ (enforce qua trigger `tio_assert_one_active_summary_per_order`).

```sql
CREATE TABLE tax_invoice_orders (
  tax_invoice_id  BIGINT NOT NULL REFERENCES tax_invoices(id) ON DELETE CASCADE,
  order_id        BIGINT NOT NULL REFERENCES orders(id)       ON DELETE RESTRICT,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id)      ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES branches(id)     ON DELETE CASCADE,
  vat_rate        NUMERIC(5,2)  NOT NULL,
  line_subtotal   NUMERIC(15,2) NOT NULL,
  line_vat_amount NUMERIC(15,2) NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (tax_invoice_id, order_id)
);

-- RLS: SELECT cần finance:view; INSERT/DELETE chỉ qua SECURITY DEFINER RPC
```

> Cancel summary HĐ KHÔNG xóa junction rows — preserve audit. Underlying orders KHÔNG auto re-eligible cho batch mới (regression rule `HDDT-SUMMARY-CANCEL-PRESERVES-JUNCTION`).

### 3.6 Queue table — `summary_run_queue`

Audit + observability cho cron + admin manual trigger.

```sql
CREATE TABLE summary_run_queue (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  summary_date    DATE   NOT NULL,
  status          TEXT   NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','issued','failed','skipped')),
  trigger_source  TEXT   NOT NULL CHECK (trigger_source IN ('cron','manual')),
  triggered_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL khi cron system
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  tax_invoice_id  BIGINT REFERENCES tax_invoices(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: finance:view permission
```

### 3.7 Service-role RPC (cron path)

Cron job KHÔNG có `auth.uid()` — không thể gọi `transition_tax_invoice_state` thông thường. Dùng overload dành riêng:

```sql
public.transition_tax_invoice_state_as_system(
  p_tax_invoice_id BIGINT,
  p_to_status      TEXT,
  p_actor          UUID,                 -- 'SYSTEM_CRON_UUID' = '00000000-0000-0000-0000-000000000001'
  p_payload        JSONB DEFAULT NULL,
  p_note           TEXT  DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
```

**Hard gate**: function raise `forbidden_service_role_only` (ERRCODE 42501) nếu `request.jwt.claims->>'role' <> 'service_role'`. GRANT EXECUTE chỉ cho `service_role`, REVOKE từ `authenticated`. Xem regression rule `HDDT-SERVICE-ROLE-RPC-GATED-ON-CLAIM`.

### 3.8 Late MST request sau summary backfill

Sau khi cron summary đã gộp 1 order vào HĐ tổng hợp, nếu khách quay lại yêu cầu HĐ có MST:

- `createTaxInvoice` reject với message: "Đơn này đã trong HĐ tổng hợp ngày X — Liên hệ kế toán để lập HĐ điều chỉnh"
- Pilot: kế toán xử lý qua portal provider (manual HĐ điều chỉnh giảm + HĐ có MST mới)
- Defer P1: tự động hóa flow summary-adjustment → HĐ điều chỉnh

Regression rule `HDDT-LATE-B2B-REQUEST-AFTER-BATCH-BLOCKED`.

---

## 4. Hóa đơn/chứng từ đầu vào (mua nguyên liệu từ nhà cung cấp)

### 4.1 Điều kiện để ghi nhận hồ sơ thuế/chi phí

Với HKD, hệ thống không mặc định coi hóa đơn NCC là VAT đầu vào được khấu trừ.
Mục tiêu v1 là lưu đủ hồ sơ để kế toán/thuế đối chiếu:

1. Hóa đơn/chứng từ hợp lệ từ NCC.
2. Thông tin người mua khớp hồ sơ HKD khi NCC xuất hóa đơn cho Má Tư.
3. Hàng hóa thực sự nhận đủ (có GRN xác nhận).
4. Thanh toán và chứng từ đi kèm đủ để giải trình chi phí, đặc biệt với giao
   dịch giá trị lớn.
5. Kỳ khai/ghi nhận được gắn rõ để export cho kế toán.

> ⚠️ **3-way matching**: Hệ thống phải verify PO → GRN → Supplier Invoice/chứng
> từ NCC trước khi đưa vào export thuế/kế toán. Cờ `is_vat_deductible` là field
> kỹ thuật phục vụ cấu hình kế toán nâng cao; không được hiển thị như default HKD
> nếu chưa có quyết định pháp lý/kế toán riêng. Chi tiết xem `docs/ref/inventory.md`.

### 4.2 Database — bảng `supplier_invoices`

```sql
CREATE TABLE supplier_invoices (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  grn_id              BIGINT REFERENCES goods_received_notes(id),
  po_id               BIGINT REFERENCES purchase_orders(id),

  invoice_number      TEXT NOT NULL,
  invoice_date        TIMESTAMPTZ NOT NULL,

  subtotal            NUMERIC(15,2) NOT NULL,
  vat_rate            NUMERIC(5,2) NOT NULL,
  vat_amount          NUMERIC(15,2) NOT NULL,
  total_amount        NUMERIC(15,2) NOT NULL,

  matching_status     TEXT NOT NULL DEFAULT 'pending',          -- pending|matched|discrepancy|approved
  matching_notes      TEXT,

  payment_status      TEXT NOT NULL DEFAULT 'unpaid',           -- unpaid|partial|paid
  payment_method      TEXT,                                     -- 'bank_transfer' | 'cash'
  paid_at             TIMESTAMPTZ,

  declared_period     TEXT,                                     -- 'YYYY-MM' kỳ kê khai
  is_vat_deductible   BOOLEAN NOT NULL DEFAULT false,

  pdf_url             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(invoice_number, supplier_id, tenant_id)
);
```

---

## 5. Provider HĐĐT

Hệ thống abstract qua interface `InvoiceProvider` (`packages/shared/src/providers/invoice.ts:48-93`) nhưng runtime chỉ register Viettel S-invoice. Không còn env `INVOICE_PROVIDER`; init logic ở `apps/web/lib/invoice-provider-init.ts`.

### 5.1 Interface `InvoiceProvider`

```typescript
interface InvoiceProvider {
  createInvoice(req: CreateInvoiceRequest): Promise<InvoiceResult>;
  getStatus(providerRef: string): Promise<InvoiceStatus>;
  cancelInvoice(providerRef: string, reason: string): Promise<void>;
}

type InvoiceResult = {
  status: "draft" | "signing" | "submitted" | "issued" | "failed";
  invoiceNumber: string | null; // null khi draft/signing
  providerRef: string; // unique ID phía provider
  providerData: Record<string, unknown>;
};
```

### 5.2 Provider

| Provider         | Status              | API base URL                                       | Đăng ký template |
| ---------------- | ------------------- | -------------------------------------------------- | ---------------- |
| Viettel Sinvoice | Hoạt động, duy nhất | `https://api-vinvoice.viettel.vn` (cùng test+prod) | Qua Viettel BU   |

MISA meInvoice đã bị loại khỏi runtime dự án. Không dùng lại tài liệu hoặc provider MISA-era làm hướng dẫn triển khai mới.

### 5.3 Viettel Sinvoice

Implementation: `packages/shared/src/providers/impl/viettel-sinvoice.ts:115-426`.

Verified current contract:

- `COMPANY_TAX_CODE` là `supplierTaxCode` dùng trong URL
  `InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}` và các API tra cứu/tải/hủy.
- Provider body gửi `generalInvoiceInfo`, `buyerInfo`, `payments`, `itemInfo`,
  `summarizeInfo`, `taxBreakdowns`; hiện KHÔNG gửi `sellerInfo`.
- Theo tài liệu S-invoice, `sellerInfo` có thể được truyền hoặc lấy tự động từ
  hệ thống hóa đơn điện tử; nếu truyền `sellerTaxCode`, dữ liệu người bán phải
  khớp tài khoản/MST đăng nhập và các trường người bán trở thành ràng buộc.
- Vì vậy KHÔNG thêm `SELLER_*` env hoặc override `sellerInfo` nếu chưa có tài
  liệu Vinvoice/account registration cụ thể cho HKD Cơm Tấm Má Tư.

```env
SINVOICE_USERNAME=<account_mst, vd "0100109106-899">
SINVOICE_PASSWORD=<api_password>
SINVOICE_TEMPLATE_CODE=<đăng ký với CQT, vd "2/001" cho HĐ bán hàng từ MTT, "1/001" cho HĐ GTGT>
SINVOICE_INVOICE_SERIES=<đăng ký với CQT, vd "C26MAA">
SINVOICE_BASE_URL=https://api-vinvoice.viettel.vn # default
SINVOICE_SANDBOX=false # informational; URL không đổi
COMPANY_TAX_CODE=<supplierTaxCode đã đăng ký với Viettel/CQT>

```

Auth flow:

1. `POST /auth/login` với JSON `{ username, password }` → trả Bearer token
2. `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}` (Bearer) → tạo HĐ
3. `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid` với form `{ supplierTaxCode, transactionUuid }` → tra cứu trạng thái
4. `POST /services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile` → lấy PDF/XML

**transactionUuid format**: hàm `buildSinvoiceTransactionUuid(invoiceId)` (viettel-sinvoice.ts) tạo 32-char deterministic key dạng `HDDT<...>` để idempotent retry. Persist `provider_ref` BEFORE call để tránh duplicate khi retry.

**Sinvoice test accounts** (smoke test trước cutover prod, mật khẩu chung `2wsxCDE#`):

- `0100109106-501 / 504 / 505 / 507 / 899` — kiểm tra dữ liệu đầu vào nghiêm ngặt
- `0100109106-509` — KHÔNG kiểm tra (dùng cho test rộng)

**Common Sinvoice error codes** (per HDSD v1):

| Code                                  | Vấn đề                | Action                                        |
| ------------------------------------- | --------------------- | --------------------------------------------- |
| `1517` Invoice serial inactive        | Mẫu HĐ chưa kích hoạt | Active thông báo phát hành với CQT            |
| `1521` / `47` `INVOICE_NO_DUPLICATED` | Số HĐ trùng           | Retry 1 phút sau (UNIQUE lock OK)             |
| `1520` Invalid supplier tax code      | MST không khớp        | Check `COMPANY_TAX_CODE` với tài khoản/template Viettel |
| `OUT_OF_INVOICE_NO`                   | Hết số HĐ trong dải   | Đăng ký dải mới với CQT                       |
| `INVALID_USER_PASSWORD`               | Sai cred              | Kiểm tra `SINVOICE_USERNAME/PASSWORD`         |
| `429` Too Many Requests               | Rate limit            | Cron auto retry next-cycle                    |
| `503` Service Unavailable             | Sinvoice maintenance  | Đợi BU thông báo                              |
| `TRANSACTION_IS_BEING_PROCESSED`      | UUID đang xử lý       | Đợi 1 phút                                    |
| `INVALID_TRANSACTION_UUID`            | UUID format sai       | Bug code → fix `buildSinvoiceTransactionUuid` |

### 5.5 Provider init logic

`apps/web/lib/invoice-provider-init.ts:22-55` đọc env tại boot, register đúng 1 provider singleton dùng cho cả realtime + cron. Re-register khi env thay đổi (edge function reload).

---

## 6. Kê khai & báo cáo thuế

### 6.1 Kê khai thuế GTGT hàng tháng (Tờ khai 01/GTGT)

- **Hạn nộp**: ngày 20 tháng tiếp theo (ví dụ: tháng 3 → nộp trước 20/4)
- **Dữ liệu cần**:
  - Tổng GTGT đầu ra: `tax_invoices WHERE status = 'issued'` (cả `per_order` lẫn `daily_summary`)
  - Tổng GTGT đầu vào: `supplier_invoices WHERE is_vat_deductible = true`
- **Nộp qua**: eTax Mobile hoặc phần mềm kế toán — **không nộp trực tiếp từ hệ thống này**

### 6.2 Dashboard `/finance` (RPC `get_finance_dashboard_summary`)

`supabase/migrations/20260527020000_finance_dashboard_summary_rpc.sql:17-182` cung cấp counters:

```sql
SELECT public.get_finance_dashboard_summary(
  p_start_date := '2026-05-01',
  p_end_date   := '2026-05-31',
  p_branch_id  := NULL  -- null = all branches user có quyền
);
-- Returns: { invoices_attention, invoices_issued, invoices_not_required,
--            journal_entries_count, webhook_failures_count, ... }
````

ACL gate: `finance:view`.

### 6.3 SQL queries kế toán dùng

```sql
-- Tổng GTGT đầu ra theo tháng (cả 2 luồng)
SELECT
  DATE_TRUNC('month', issued_at) AS period,
  invoice_kind,
  SUM(subtotal)     AS total_before_vat,
  SUM(vat_amount)   AS total_vat_out,
  SUM(total_amount) AS total_revenue
FROM tax_invoices
WHERE tenant_id = $1
  AND status = 'issued'
  AND issued_at BETWEEN $2 AND $3
GROUP BY 1, 2 ORDER BY 1, 2;

-- Tổng GTGT đầu vào có thể khấu trừ
SELECT
  declared_period,
  SUM(vat_amount) AS total_vat_in
FROM supplier_invoices
WHERE tenant_id = $1
  AND is_vat_deductible = true
GROUP BY 1 ORDER BY 1;

-- Verify cross-day misalignment (check sau cron)
SELECT count(*) FROM tax_invoice_orders tio
JOIN tax_invoices ti ON ti.id = tio.tax_invoice_id
JOIN payments p      ON p.order_id = tio.order_id
WHERE ti.invoice_kind = 'daily_summary'
  AND p.status = 'completed'
  AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <> ti.summary_date;
-- Expected: 0
```

---

## 7. Cron + Admin manual trigger flow

### 7.1 Cron route

File: `apps/web/app/api/cron/hddt-daily-summary/route.ts`. Schedule trong `apps/web/vercel.json`:

```json
{ "path": "/api/cron/hddt-daily-summary", "schedule": "5 19 * * *" }
```

`19:05 UTC = 02:05 ICT` ngày hôm sau. Auth: `Authorization: Bearer ${CRON_SECRET}` (timing-safe equal). Feature flag `HDDT_DAILY_SUMMARY_ENABLED=true` mới chạy thật, nếu off → return `{ skipped: 'feature_flag_off' }`.

Response shape:

```json
{
  "ok": true,
  "summary_date": "2026-05-07",
  "branches_processed": 3,
  "issued": 2,
  "submitted": 1,
  "skipped": 0,
  "failed": 0
}
```

### 7.2 Admin manual trigger

UI: `/finance/summary` (`apps/web/app/(protected)/finance/summary/page.tsx`). Server actions: `apps/web/app/(protected)/finance/summary-invoice-actions.ts`.

```typescript
runDailySummaryForBranch(branchId, summaryDate)
  // Permission: settings:tenant
  // Feature flag: HDDT_DAILY_SUMMARY_ENABLED='true'
  // Insert summary_run_queue { trigger_source: 'manual', triggered_by: user.id }
  // → executeSummaryRun (apps/web/lib/hddt-daily-summary.ts)

listSummaryRunQueue(branchId?, daysBack=30)
  // Permission: finance:view (read-only dashboard)
```

Shared executor: `apps/web/lib/hddt-daily-summary.ts:67+ executeSummaryRun(deps)` — reuse cho cả cron + manual để đảm bảo logic duy nhất.

### 7.3 SYSTEM_CRON_UUID

Hardcoded `'00000000-0000-0000-0000-000000000001'`. Seed qua migration vào `profiles` table với `full_name='System Cron'`. Cron path pass UUID này làm `p_actor` vào `transition_tax_invoice_state_as_system`. Audit log có `triggered_by = SYSTEM_CRON_UUID` cho cron, `= user.id` cho manual.

---

## 8. Xử lý lỗi thường gặp

| Lỗi                           | Nguyên nhân                        | Xử lý                                                                   |
| ----------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| CQT từ chối cấp mã            | MST không hợp lệ, sai template     | Kiểm tra `*_TEMPLATE_CODE` env + đăng ký với CQT                        |
| Timeout khi gọi provider      | Mạng chậm                          | Retry 3 lần exponential backoff; provider_ref đã persist nên idempotent |
| HĐ đã issued nhưng cần sửa    | Sai thông tin người mua            | Hủy + biên bản + lập HĐ thay thế (`replaced`)                           |
| Provider trả lỗi duplicate    | Gọi API 2 lần                      | Kiểm tra `provider_ref` trước khi gọi lại                               |
| Cron orphan `signing` qua đêm | Provider ack chưa đến              | Reconcile cron (defer P1) hoặc manual transition `signing → draft`      |
| Late MST sau summary backfill | Khách quay lại xin HĐ MST          | Kế toán lập HĐ điều chỉnh giảm trên provider portal + HĐ có MST mới     |
| Cross-month cancel            | Hủy HĐ kỳ trước sau khi đã kê khai | Soft warning UI; defer hard-block đến period-close infra                |

Các Sinvoice-specific error codes: xem §5.4 và `docs/runbooks/hddt-viettel-operations.md` §"Lỗi Thường Gặp".

---

## 9. Quyền truy cập (ACL)

### 9.1 Permission keys (`packages/shared/src/auth/permissions.ts`)

| Key                         | Dùng cho                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `finance:view`              | Đọc `tax_invoices`, `tax_invoice_events`, `summary_run_queue`, `tax_invoice_orders`, dashboard `/finance` |
| `orders:write`              | Issuance flow `draft → signing → submitted → issued`                                                      |
| `settings:tenant`           | `cancelled` / `replaced` transition; manual trigger summary                                               |
| `tax:close_period_override` | (Future) bypass period-close hard-block                                                                   |

### 9.2 Module ACL (`packages/shared/src/auth/module-acl.ts:89-93`)

| Module    | Path       | Roles được phép          |
| --------- | ---------- | ------------------------ |
| `finance` | `/finance` | `owner`, `super_manager` |

> **Note**: `/finance/summary` admin trigger UI KHÔNG có entry riêng trong `module-acl.ts` — gate qua permission `settings:tenant` ở action level (`runDailySummaryForBranch`). Cashier/branch_manager sẽ thấy nav nhưng action sẽ reject.

### 9.3 Role matrix tổng hợp

| Hành động                     | owner | super_manager | | branch_manager | cashier |
| ----------------------------- | :---: | :-----------: | :----------: | :------------: | :-----: |
| Xem danh sách HĐĐT            |   ✓   |       ✓       |      ✓       |       ✓        |    ✓    |
| Xem dashboard `/finance`      |   ✓   |       ✓       |      −       |       −        |    −    |
| Xuất HĐĐT realtime            |   ✓   |       ✓       |      ✓       |       ✓        |    ✓    |
| Hủy / thay thế HĐĐT           |   ✓   |       ✓       |      −       |       −        |    −    |
| Manual trigger daily summary  |   ✓   |       ✓       |      −       |       −        |    −    |
| Xem queue `summary_run_queue` |   ✓   |       ✓       |      −       |       −        |    −    |
| Config provider (env var)     |   ✓   |       −       |      −       |       −        |    −    |

---

## 10. Migration files đã ship (timestamp order)

| Timestamp        | File                                | Mô tả                                                                                                                                                        |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260425035346` | `tax_invoice_state_machine.sql`     | RPC `transition_tax_invoice_state` + matrix + `tax_invoice_events` + `signing_started_at` + `uq_tax_invoices_active_per_order`                               |
| `20260502000000` | `pos_hddt_not_required_d4.sql`      | Thêm state `not_required` (D4 — đã retire)                                                                                                                   |
| `20260508053555` | `hddt_summary_schema.sql`           | `tax_invoices` cols + `tax_invoice_orders` junction + `summary_run_queue` + `uq_tax_invoices_active_per_summary`                                             |
| `20260508055046` | `hddt_summary_rpcs.sql`             | `transition_tax_invoice_state_as_system` + `_compute_vat_breakdown` + `aggregate_daily_b2c_invoice` (v1) + trigger `tio_assert_one_active_summary_per_order` |
| `20260508055230` | `hddt_aggregate_rpc_fixes.sql`      | Fix bucket `payments.paid_at` (orders không có column) + `pg_advisory_xact_lock(BIGINT)` 1-arg                                                               |
| `20260527020000` | `finance_dashboard_summary_rpc.sql` | `get_finance_dashboard_summary` cho `/finance` dashboard                                                                                                     |

---

## 11. Regression rules HDDT (`tasks/regressions.md`)

Đặt trong order phát sinh, theo timeline ship:

- `HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN`
- `HDDT-FORM-PAYLOAD-FREEZE-AT-CLICK`
- `POS-HDDT-CONDITIONAL-ON-MST`
- `HDDT-CANCEL-REASON-MIN-20`
- `HDDT-BATCH-CRON-USES-LOCAL-TZ-BUCKET`
- `HDDT-BATCH-IDEMPOTENT-VIA-UNIQUE-CONSTRAINT`
- `HDDT-BATCH-RESERVE-DRAFT-BEFORE-PROVIDER-CALL`
- `HDDT-BATCH-NO-PROVIDER-CALL-INSIDE-RPC`
- `HDDT-BATCH-SKIP-CONTINUE-PER-BRANCH`
- `HDDT-SUMMARY-CANCEL-PRESERVES-JUNCTION`
- `HDDT-BATCH-CRON-AUTH-VIA-BEARER-CRON-SECRET`
- `HDDT-D4-NOT-REQUIRED-DEPRECATED-AFTER-BATCH`
- `HDDT-LATE-B2B-REQUEST-AFTER-BATCH-BLOCKED`
- `HDDT-SERVICE-ROLE-RPC-GATED-ON-CLAIM`
- `HDDT-SUMMARY-AUDIT-WHO-TRIGGERED`
- `HDDT-VERCEL-CRON-TIMEOUT-FANOUT-SAFE`

---

## 12. Tài liệu liên quan

- `docs/runbooks/hddt-viettel-operations.md` — smoke/reconcile/archive cho Viettel S-invoice
- `docs/ref/inventory.md` — 3-way matching GRN / PO / Supplier Invoice
- `docs/spec/database-schema.md` — Schema đầy đủ
- `apps/web/app/(protected)/finance/actions.ts:58-446` — `createTaxInvoice` + `cancelTaxInvoice`
- `apps/web/app/(protected)/finance/summary-invoice-actions.ts` — Manual trigger actions
- `apps/web/lib/hddt-daily-summary.ts` — Shared `executeSummaryRun`
- `apps/web/lib/invoice-provider-init.ts` — Viettel S-invoice env injection
- `packages/shared/src/providers/invoice.ts:48-93` — Interface
- `packages/shared/src/providers/impl/viettel-sinvoice.ts:115-426` — Sinvoice impl
- `tasks/regressions.md` — Named failure rules `HDDT-*`
