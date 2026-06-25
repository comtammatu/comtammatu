# Order Payment Code Follow-up - 2026-06-26

Reconciled-through 682126b0

Skill plan: repo rules = engineering + skills + database + ui + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Supabase CLI; skipped = direct prod apply because the owner has not delegated production migration apply in this turn.

PM: Scope is the POS payment-code model only. Done means every order can print or display one stable `DH...` transfer code without the cashier selecting the VietQR tab, and the POS no longer offers a QR cancel path for that code.

BA: The payment code belongs to the order's active payment slot. It must be generated once, reused for provisional bills, cash confirmation, manual VietQR confirmation, SePay lookup, and final receipts. Cashier-selected method remains an intent until settlement; SePay may correct a cash-confirmed order to VietQR when the immutable code and amount match.

Senior Dev: Reuse `payments` and the existing one-active-payment invariant instead of adding a new table. Add a small RPC to ensure a valid order payment code, then have POS print/open paths call it. Do not update `orders.payment_method` during code creation.

QA/QC: Static payment hardening tests must fail if provisional print calls `create_payment`, if the bill sheet keeps the cancel QR button, or if SePay/cash paths stop preserving `provider_ref`. Full gates remain `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
