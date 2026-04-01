# Roadmap — Cơm Tấm Má Tư

> Approved: 2026-04-01 | Mode: Greenfield + Scope Expansion
> Constraint: mỗi sprint < 2 tuần (10 ngày làm việc)

## Overview

```
Sprint 1  → Sprint 2a → Sprint 2b → Sprint 3 → v1.0.0 PILOT
  (5d)       (7d)         (5d)        (8d)
                                              ├→ Sprint 4 (6d)
                                              ├→ Sprint 5 (4d)
                                              ├→ Sprint 6 (8d)
                                              └→ Sprint 7 (4d)

Total to pilot: ~25 ngày (Sprint 1 + 2a + 2b + 3)
Total all sprints: ~47 ngày
```

---

## v0.1.0 — Foundation ✅ (2026-04-01)

## v0.1.1 — Security Hardening ✅ (2026-04-02)

- Fix migration ordering: clean up legacy profiles before adding branch constraint
- Lock down profiles DML: revoke INSERT/DELETE, all mutations through RPCs only
- Fix office role visibility: tenant-wide SELECT for HR functions
- Drop overly-permissive "Managers can manage all profiles" policy
- Fix supabase/config.toml for CLI compatibility

## Sprint 1: Admin Shell + Menu + Tables + Staff + Settings

> 6 sessions | 4-5 ngày | Depends: v0.1.0
> Ref: `docs/ref/business-context.md`

| #   | Session                       | Tables                                                                                          |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| S1  | Admin layout + sidebar        | —                                                                                               |
| S2  | Branch CRUD + system_settings | system_settings                                                                                 |
| S3  | Staff management              | — (profiles)                                                                                    |
| S4  | Menu CRUD + sides             | menu_categories, menu_items, menu_item_variants, menu_item_modifiers, menu_item_available_sides |
| S5  | Tables & zones                | branch_zones, tables                                                                            |
| S6  | Polish + /review              | —                                                                                               |

## Sprint 2a: POS + KDS + Payments

> 6 sessions | 5-7 ngày | Depends: Sprint 1
> North Star: "Order → thanh toán — dưới 2 phút"
> Ref: `docs/ref/third-party-integrations.md` (§1 Payments — VietQR, Momo)

| #   | Session                      | Tables                                                                                                                              |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Order schema + state machine | orders, order_items, order_status_history, pos_terminals, pos_sessions, kds_stations, kds_station_categories, kds_tickets, payments |
| S2  | POS — menu browse + cart     | —                                                                                                                                   |
| S3  | POS — table + order submit   | —                                                                                                                                   |
| S4  | KDS — realtime queue         | —                                                                                                                                   |
| S5  | KDS — bump/complete          | —                                                                                                                                   |
| S6  | Payments — cash + VietQR     | —                                                                                                                                   |

## Sprint 2b: Stock + Dashboard + Printer + Audit

> 5 sessions | 4-5 ngày | Depends: Sprint 2a
> Ref: `docs/ref/inventory.md` (§1–4 Ingredients, recipes, stock levels, stock movements)

| #   | Session                        | Tables                                              |
| --- | ------------------------------ | --------------------------------------------------- |
| S1  | Ingredients + stock levels     | ingredients, recipes, stock_levels, stock_movements |
| S2  | Dashboard — basic revenue      | —                                                   |
| S3  | Printer config + bill printing | printer_configs                                     |
| S4  | Audit logging                  | audit_logs                                          |
| S5  | Integration test — full flow   | —                                                   |

## Sprint 3: HĐĐT + Momo + Procurement + Refunds

> 7 sessions | 6-8 ngày | Depends: Sprint 2b
> Ref: `docs/ref/einvoice-tax.md` (HĐĐT, VAT, provider), `docs/ref/inventory.md` (§5–7 GRN, 3-way matching), `docs/ref/third-party-integrations.md` (§1 Momo, §2 HĐĐT provider)

| #   | Session                            | Tables                                           |
| --- | ---------------------------------- | ------------------------------------------------ |
| S1  | HĐĐT schema + Edge Function        | tax_invoices                                     |
| S2  | HĐĐT UI + provider config          | —                                                |
| S3  | Momo payment                       | payment_webhooks                                 |
| S4  | Suppliers + Purchase Orders        | suppliers, purchase_orders, purchase_order_items |
| S5  | GRN + auto stock update            | goods_received_notes, grn_items                  |
| S6  | Supplier Invoices + 3-way matching | supplier_invoices                                |
| S7  | Refunds                            | refunds                                          |

### >>> v1.0.0 PILOT LAUNCH (sau Sprint 3 stable) <<<

## Sprint 4: CRM + Loyalty + Discounts

> 6 sessions | 5-6 ngày | Depends: Sprint 2a

| #   | Session                    | Tables                            |
| --- | -------------------------- | --------------------------------- |
| S1  | Customer database          | customers                         |
| S2  | Loyalty tiers + earn rules | loyalty_tiers, loyalty_earn_rules |
| S3  | Points accumulation        | loyalty_transactions              |
| S4  | Vouchers + redemption      | vouchers, redemptions             |
| S5  | Manual discounts           | order_discounts                   |
| S6  | CRM dashboard              | —                                 |

## Sprint 5: Dashboard Advanced + Reports

> 4 sessions | 3-4 ngày | Depends: Sprint 2b + 3
> Ref: `docs/ref/inventory.md` (§10 Báo cáo kho, food cost), `docs/ref/einvoice-tax.md` (§6 Kê khai & báo cáo thuế)

| #   | Session                      | Tables           |
| --- | ---------------------------- | ---------------- |
| S1  | Revenue dashboard (advanced) | mv_daily_revenue |
| S2  | Top items + menu performance | mv_top_items     |
| S3  | Food cost analysis           | mv_food_cost     |
| S4  | MV refresh + cron            | —                |

## Sprint 6: Finance VAS + HR/Payroll CTCP

> 7 sessions | 6-8 ngày | Depends: Sprint 2a + 3
> Ref: `docs/ref/labor-contracts.md` (HĐLĐ, BHXH, onboarding/offboarding), `docs/ref/payroll-pit.md` (lương, thuế TNCN, quyết toán)

| #   | Session                 | Tables                             |
| --- | ----------------------- | ---------------------------------- |
| S1  | Employee records        | employees                          |
| S2  | Shifts + attendance     | shifts, attendance_records         |
| S3  | Payroll calculation     | —                                  |
| S4  | Payroll processing      | payroll_periods, payroll_entries   |
| S5  | Chart of accounts (VAS) | chart_of_accounts, journal_entries |
| S6  | Financial statements    | —                                  |
| S7  | Payroll reports         | —                                  |

## Sprint 7: QR Self-Order

> 4 sessions | 3-4 ngày | Depends: Sprint 2a

| #   | Session              | Tables         |
| --- | -------------------- | -------------- |
| S1  | QR code generation   | table_qr_codes |
| S2  | Customer menu page   | —              |
| S3  | Self-order flow      | —              |
| S4  | Self-checkout VietQR | —              |

## Post-v1.0 (Tier 2)

See `backlog.md` for deferred features.
