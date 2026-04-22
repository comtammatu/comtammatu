# Inventory ERP Gap Matrix

> Mục tiêu: đối chiếu bộ docs ERP tham chiếu ở `/Users/luongthebinh/Downloads/comtammatu/docs/` với docs hiện có của repo này, rồi chốt cách hấp thụ theo hướng **lean pilot fit**.
>
> Boundary không đổi:
>
> - Product vẫn là **restaurant operations system**, không nâng thành ERP tổng quát.
> - Auth/ACL vẫn lấy từ `packages/shared/src/auth/module-acl.ts` và JWT claims hiện tại.
> - Inventory vẫn ưu tiên mô hình pilot linh hoạt giữa `Kho Tổng (CW)`, `Bếp Trung Tâm (CK)`, `Kho chi nhánh`, và `Bếp chi nhánh` (multi-instance cho CW/CK).

---

## 1. Cách đọc matrix

| Quyết định | Ý nghĩa |
| ---------- | ------- |
| `Adopt` | Có thể mang gần như nguyên ý tưởng vào repo hiện tại |
| `Adapt` | Giữ business rule cốt lõi nhưng phải viết lại để khớp boundary hiện tại |
| `Defer` | Có giá trị, nhưng chưa phù hợp scope pilot |
| `Reject` | Không phù hợp product/architecture hiện tại |

---

## 2. Mapping theo tài liệu

| ERP source | Repo hiện tại | Mức khớp | Quyết định | Ghi chú |
| ---------- | ------------- | -------- | ---------- | ------- |
| `docs/domain/inventory/README.md` | [inventory.md](inventory.md), [inventory-sop.md](inventory-sop.md), [inventory-role-handoff.md](inventory-role-handoff.md) | Cao | `Adapt` | Cùng trục vận hành giữa `CW`, `CK`, `Kho chi nhánh`, `Bếp chi nhánh`, nhưng repo hiện tại cần giữ phrasing ngắn gọn và gắn chặt vào route/RPC thật. |
| `docs/domain/inventory/schema-erd-v1.md` | [database-schema.md](../spec/database-schema.md), [inventory.md](inventory.md), [m5-stock-enhancement.md](../plan/m5-stock-enhancement.md) | Trung bình | `Adapt` | Nên lấy ledger, audit, FK/index conventions, production semantics. Không mang `business_documents`, `applications`, tree location enterprise. |
| `docs/domain/inventory/rbac.md` | [auth.md](../modules/auth.md), [inventory.md](inventory.md) | Trung bình | `Adapt` | Nên lấy business action matrix và data visibility. Không copy role catalog ERP; repo vẫn dùng 8 role hiện tại. |
| `docs/domain/inventory/price-variance-management.md` | [inventory.md](inventory.md), [m5-stock-enhancement.md](../plan/m5-stock-enhancement.md) | Trung bình | `Adapt` | Nên nhập tolerance, payment terms, due date, payment status, AP aging, alert semantics. Không nhập FX variance, price lock, standard cost engine lúc này. |
| `docs/domain/inventory/central-kitchen-production-flow.md` | [inventory.md](inventory.md), [inventory-sop.md](inventory-sop.md) | Cao | `Adapt` | Nên nhập cách mô tả BOM, yield, by-product, transfer-price boundary ở mức tối thiểu; không nhập đủ labor/overhead/WIP accounting. |
| `docs/plan/inventory-implementation-roadmap.md` | [roadmap.md](../plan/roadmap.md), [m5-stock-enhancement.md](../plan/m5-stock-enhancement.md) | Thấp | `Defer` | Roadmap ERP có nhịp ERP foundation trước domain. Repo hiện tại đã chốt đường đi khác, nên chỉ dùng để tham khảo sequencing domain. |
| `docs/runbooks/inventory/*` | Chưa có tương đương trực tiếp | Thấp | `Adopt` | Repo hiện tại thiếu runbook release/readiness cho Inventory. Nên bổ sung phiên bản lean bám vào verify thật. |
| `docs/worklog/inventory/*` | Chưa có tương đương trực tiếp | Thấp | `Adopt` | Repo hiện tại thiếu matrix theo dõi “doc ↔ code ↔ verify ↔ readiness”. Nên thêm bản gọn, không cần cả control tower. |
| `docs/llm-wiki/module-cards/inventory.md` | [CODEBASE_MAP.md](../CODEBASE_MAP.md), `AGENTS.md` | Thấp | `Defer` | Có ích cho agent continuity, nhưng chưa phải khoảng trống lớn nhất so với RBAC/runbook/readiness. |
| `docs/ref/platform-schema-v1.md` | [decisions.md](../plan/decisions.md), [auth.md](../modules/auth.md), [database-schema.md](../spec/database-schema.md) | Thấp | `Reject` cho import trực tiếp | Đây là platform model khác boundary hiện tại. Chỉ dùng như cảnh báo kiến trúc, không dùng làm source of truth cho repo này. |

---

## 3. Những gì nên nhập ngay

### 3.1 Business rules

- `PO -> GRN -> supplier_invoice` phải luôn tách rõ, và `GRN` là số thực nhận.
- `payment_terms`, `due_date`, `payment_status`, `AP aging` nên trở thành vocabulary chuẩn của Inventory/AP boundary.
- `yield_factor` cho recipe/production nên được coi là extension hợp lệ của pilot.
- `waste`, `expired`, `count_adjustment`, `transfer short receipt` cần reason codes rõ hơn trong docs.

### 3.2 Documentation assets

- Một doc RBAC Inventory kiểu lean, map thẳng vào role hiện tại.
- Một runbook pre-release QA cho Inventory.
- Một adoption matrix để tránh docs nói đã xong nhưng code/test chưa theo kịp.

---

## 4. Những gì chưa nên nhập

- `business_documents` làm workflow kernel chung cho toàn hệ thống
- `applications`, `user_app_assignments`, `device_registrations`
- location tree đa tầng kiểu `company -> region -> branch -> sub-location`
- vendor portal
- FIFO/FEFO engine, lot/batch-first architecture, bin locations
- PR workflow nhiều bước
- labor/overhead costing, intercompany accounting, payment proposal engine

---

## 5. Xung đột cần tránh

| Nếu copy nguyên ERP docs | Xung đột phát sinh |
| ------------------------ | ------------------ |
| Role matrix ERP | Lệch với `staff_role` và `module-acl.ts` hiện tại |
| Platform schema ERP | Phá quyết định `Tenant -> Branch` ở [decisions.md](../plan/decisions.md) |
| FIFO / lot-heavy design | Lệch với WAC-first direction ở [m5-stock-enhancement.md](../plan/m5-stock-enhancement.md) |
| Approval kernel nhiều lớp | Đi ngược chủ đích “never run out, never overpay”, tăng ma sát pilot |

---

## 6. Thứ tự hấp thụ khuyến nghị

1. Chốt `gap matrix` này làm contract.
2. Chuẩn hóa RBAC/action matrix cho Inventory.
3. Bổ sung runbook/readiness docs.
4. Sau đó mới cập nhật hoặc refactor [inventory.md](inventory.md) theo từng lát nhỏ.

---

## 7. Files draft được thêm theo matrix này

- [inventory-rbac-matrix.md](inventory-rbac-matrix.md)
- [pre-release-qa.md](../runbooks/inventory/pre-release-qa.md)
- [adoption-matrix.md](../worklog/inventory/adoption-matrix.md)
