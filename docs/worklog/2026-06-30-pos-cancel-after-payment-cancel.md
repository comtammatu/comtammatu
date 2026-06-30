# POS Cancel After Payment Cancel

Reconciled-through 1f5ae618.

Owner: hotfix for POS order cancellation after a cashier cancels a pending QR payment.

Skill plan: repo rules = engineering + database + workflow + payment regressions; external skills = investigate + supabase; runtime tools = CodeGraph + shell; skipped = production apply.

PM: The cashier action `Hủy phiên chờ` must unblock `Hủy đơn`; no new POS workflow is needed.

BA: A `pending` VietQR payment code still locks money mutations. A `failed` payment produced by `cancel_pending_payment` is no longer an active payment session and must not block order cancellation. Paid/completed orders stay terminal.

Senior Dev: Forward-migrate `order_payment_code_is_exposed` so the trigger only treats `payments.status = 'pending'` as an active lock. Do not change `cancel_order`, `cancel_pending_payment`, or the POS bill UI.

QA: Add a static regression test against the new migration. Verify the focused provider test, then run typecheck/lint/build if time allows.
