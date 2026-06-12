# Inventory Overview Diagrams

> Mục tiêu: cung cấp bộ sơ đồ tổng quát cho toàn bộ Inventory domain.
>
> Boundary hiện tại:
>
> - `tenant` có thể chuyển thẳng về `Kho chi nhánh`.
> - `chi nhánh` là một node sản xuất/phân phối hợp lệ, không phải hop bắt buộc.
> - `Kho chi nhánh` và `Bếp chi nhánh` là hai điểm vận hành trong cùng site `branch`, tách bằng `inventory_locations`; cấp bếp dùng intra-branch transfer.

---

## 1. Executive Overview

```mermaid
flowchart LR
    SUP["Nhà cung cấp"]
    tenant["Tenant"]
    chi nhánh["chi nhánh"]
    BW["Kho chi nhánh"]
    BK["Bếp chi nhánh"]
    POS["POS / Bán hàng"]
    CTRL["Kiểm soát: stocktake / alerts / reports"]

    SUP -->|"PO -> GRN -> Supplier Invoice"| tenant

    tenant -->|"Transfer trực tiếp"| BW
    tenant -->|"Transfer nguyên liệu"| chi nhánh

    chi nhánh -->|"Production Order"| chi nhánh
    chi nhánh -->|"Transfer thành phẩm"| BW

    BW -->|"Cấp phát nội bộ"| BK
    BK -->|"Tiêu hao theo order completed"| POS

    tenant --- CTRL
    chi nhánh --- CTRL
    BW --- CTRL
    BK --- CTRL
```

---

## 2. Ops SOP Swimlane

```mermaid
flowchart TD
    subgraph tenant["Tenant"]
        H1["Tạo PO"]
        H2["Nhận hàng + GRN"]
        H3["Cập nhật WAC + tồn tenant"]
        H4{"Đi hàng theo hướng nào?"}
        H5["Transfer tenant -> chi nhánh"]
        H6["Transfer tenant -> Kho chi nhánh"]
    end

    subgraph chi nhánh["chi nhánh"]
        C1["Nhận nguyên liệu"]
        C2["Tạo Production Order"]
        C3["Xuất nguyên liệu + nhập thành phẩm"]
        C4["Transfer chi nhánh -> Kho chi nhánh"]
    end

    subgraph BR["Chi nhánh"]
        B1["Kho chi nhánh nhận hàng"]
        B2["Kho chi nhánh cấp phát -> Bếp chi nhánh"]
        B3["Bếp chi nhánh bán hàng"]
        B4["Order completed -> consumption"]
        B5["Stocktake / adjustment / write-off"]
    end

    H1 --> H2 --> H3 --> H4
    H4 -->|"Sản xuất tập trung"| H5 --> C1 --> C2 --> C3 --> C4 --> B1
    H4 -->|"Cấp thẳng chi nhánh"| H6 --> B1
    B1 --> B2 --> B3 --> B4 --> B5
```

---

## 3. System/Data Architecture

```mermaid
flowchart TB
    subgraph Master["Master Data"]
        ING["ingredients"]
        REC["recipes"]
        PREC["production_recipes"]
        SUPP["suppliers"]
    end

    subgraph Procurement["Procurement"]
        PO["purchase_orders"]
        GRN["goods_received_notes + grn_items"]
        INV["supplier_invoices"]
    end

    subgraph Inventory["Inventory Ledger"]
        SL["stock_levels"]
        SM["stock_movements"]
        TR["stock_transfers + stock_transfer_items"]
        ST["stocktake_sessions + stocktake_lines"]
    end

    subgraph Production["Production"]
        POX["production_orders + items"]
    end

    subgraph Sales["Sales Consumption"]
        ORD["orders + order_items"]
    end

    SUPP --> PO --> GRN --> INV
    GRN --> SL
    GRN --> SM

    ING --> SL
    ING --> SM
    REC --> ORD
    ORD --> SM

    PREC --> POX
    POX --> SM
    POX --> SL

    TR --> SM
    TR --> SL

    ST --> SM
    ST --> SL
```

---

## 4. Branch Boundary

```mermaid
flowchart LR
    BR["branch site trong DB"]
    BW["Kho chi nhánh"]
    BK["Bếp chi nhánh"]
    NOTE["Hiện 2 điểm này là vận hành nội bộ,
    chưa tách thành 2 branch/site riêng.
    Ledger vẫn hạch toán theo cùng branch_id."]

    BR --> BW
    BR --> BK
    BW --- NOTE
    BK --- NOTE
```

---

## 5. Cách Dùng

- Dùng sơ đồ `Executive Overview` khi cần giải thích flow business cho stakeholder.
- Dùng sơ đồ `Ops SOP Swimlane` khi training vận hành tenant, chi nhánh, và chi nhánh.
- Dùng sơ đồ `System/Data Architecture` khi review tác động code, migrations, hoặc reporting.
- Dùng sơ đồ `Branch Boundary` để nhắc rằng `Kho chi nhánh` và `Bếp chi nhánh` hiện chưa tách thành node dữ liệu riêng.

## 6. Tài Liệu Liên Quan

- [inventory.md](../ref/inventory.md)
- [inventory-sop.md](../ref/inventory-sop.md)
- [inventory-role-handoff.md](../ref/inventory-role-handoff.md)
- [inventory-rbac-matrix.md](../ref/inventory-rbac-matrix.md)
- [architecture.md](architecture.md)
