// MIRRORS packages/shared/src/labels/vi.ts payment label maps and
// print_template_payment_label() in SQL. print-render stays dependency-free
// of @comtammatu/shared so the print-agent bundle remains self-contained —
// keep all three in sync.

export const PAYMENT_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  bank_transfer: "Chuyển khoản",
};

export const PAYMENT_LABEL_FULL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "Chuyển khoản (VietQR)",
  bank_transfer: "Chuyển khoản",
  unknown: "Khác",
};

export const BRAND_LOCKUP_EYEBROW = "TIỆM CƠM TẤM";
export const BRAND_LOCKUP_NAME = "MÁ TƯ";
export const BRAND_LOCKUP_TAGLINE = "Thịt tươi 100%";
