# POS Receipt Payment QR - 2026-05-28

## T3 Review

PM: Scope is limited to printed payment receipts. Acceptance is that new `HÓA ĐƠN THANH TOÁN` print jobs can render the same payment QR block currently available on `PHIẾU TẠM TÍNH` when the tenant has VietQR configured.

BA: The QR must remain native scan-to-pay data, not a hosted checkout link. If VietQR settings are missing, the receipt still prints without a QR. Existing payment state, paid confirmation, cash change, and HĐĐT flow do not change.

Senior Dev: Add `payment_qr` to receipt print payloads, add a `paymentQr` block to active receipt templates that do not already have one, and make the print-agent receipt renderers consume the block. Keep RPC signatures stable to avoid a generated-types contract change.

QA/QC: Verify print-agent document and legacy receipt rendering includes the QR section. Run focused print-agent render tests, then the repo gates (`pnpm typecheck && pnpm lint && pnpm build`) if feasible.

## Unified Contract

- New receipt print jobs include `payment_qr` only when `payment_qr_type` is `vietqr`, bank/account settings exist, and the order total is positive.
- The QR content is EMVCo VietQR payload data generated in the receipt enqueue RPC, matching the thermal-printer requirement to print a scannable native QR.
- No MoMo `payUrl` or `deeplink` is encoded as a receipt QR fallback.
- Existing print jobs keep their immutable `payload.document`; this change affects new receipt jobs.
