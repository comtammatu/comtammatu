# Inventory Overview Diagrams

> Mục tiêu: cung cấp bộ sơ đồ tổng quát cho toàn bộ Inventory domain.
>
> Boundary hiện tại:
>
> - `Bếp Trung Tâm` là central site stock-bearing duy nhất trên bảng `branches`.
> - `Kho chi nhánh` là stock-bearing location của chi nhánh.
> - `Bếp chi nhánh` (`branch` + `kitchen`) cũng là stock-bearing location; tiêu hao ghi nhận tại đây.

---

## 1. Executive Overview

```mermaid
flowchart LR
    SUP["Nhà cung cấp"]
    CK["Bếp Trung Tâm"]
    BW["Kho chi nhánh"]
    CONS["Tiêu hao chi nhánh"]
    POS["POS / Bán hàng"]
    CTRL["Kiểm soát: stocktake / alerts / reports"]

    SUP -->|"PO -> GRN"| CK
    SUP -->|"PO -> GRN"| BW

    CK -->|"Production Run"| CK
    CK -->|"Transfer thật"| BW

    BW -->|"Approved consumption"| CONS
    CONS -->|"Food cost thực tế"| POS

    CK --- CTRL
    BW --- CTRL
    CONS --- CTRL
```

---

## 2. Ops SOP Swimlane

```mermaid
flowchart TD
    subgraph central["Trung tâm"]
        H1["Tạo PO"]
        H2["Nhận hàng + GRN"]
        H3["Cập nhật WAC + tồn trung tâm"]
        H4{"Đi hàng theo hướng nào?"}
        H5["Production tại Bếp Trung Tâm"]
        H6["Transfer trung tâm -> Kho chi nhánh"]
    end

    subgraph BR["Chi nhánh"]
        B1["Kho chi nhánh nhận hàng"]
        B2["Bán hàng"]
        B3["Submit consumption report"]
        B4["Approve/apply consumption"]
        B5["Stocktake / adjustment / write-off"]
    end

    H1 --> H2 --> H3 --> H4
    H4 -->|"Sản xuất"| H5 --> H6 --> B1
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
