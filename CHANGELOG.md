# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0.0] - 2026-04-15

### Added
- GL auto-posting engine: every business transaction now creates balanced journal entries automatically
- `posting_rules` table with 16 VAS-standard rules configurable per tenant
- `auto_post_journal()` core RPC called from all business-event RPCs
- POS cash/VietQR/Momo payments auto-post Revenue + COGS + VAT journals
- GRN confirmation auto-posts Inventory (Dr 152) / AP (Cr 331) journals
- Supplier payment tracking with `supplier_payments` table and AP reduction journals
- Payroll approval auto-posts multi-line journal (salary, BHXH/BHYT/BHTN, PIT)
- Stock transfer receive auto-posts inter-branch inventory reclassification
- Production order completion auto-posts raw material consumption + finished goods output
- Fiscal period management (open/closing/closed) with period enforcement
- Month-end close procedure with MV refresh and 5-category GL reconciliation
- Posting rules admin page at `/admin/finance/posting-rules`
- Fiscal periods page at `/admin/finance/periods` with close workflow and reconciliation dialog
- Badge "Tự động" on auto-posted journal entries
- Account 155 (Thành phẩm) added to VAS chart of accounts
- `confirm_payment_and_post()` atomic RPC replacing non-atomic VietQR/Momo confirmation
- Implicit subledger FK (`journal_entry_id`) on payments, GRN, invoices, payroll, transfers, production

### Changed
- `create_payment()` RPC now auto-posts GL journal on cash payment completion
- `confirm_goods_receipt_note()` RPC now auto-posts GL journal on GRN confirmation
- `stock_transfer_receive()` RPC now auto-posts GL journal on transfer receive
- `confirm_production_order()` RPC now auto-posts GL journal on production completion
- `confirmPayment` server action refactored from 3 non-atomic DB calls to atomic RPC
- `approvePayroll` server action now calls `post_payroll_journal` on approval

### Removed
- Inventory design mockup files (`inventory/trang_*/`) — implementations live in `apps/web/app/inventory/`
