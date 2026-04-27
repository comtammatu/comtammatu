// Verbatim Vietnamese strings mandated by VN tax/labor law or by e-invoice
// provider API contracts. The text consolidation sweep (Phase 2) MUST NOT
// replace these — leave them inline and annotate with `// vi-allow: legal-fixed`
// for downstream lint enforcement.
//
// Source citations:
//   NĐ 70/2025          — Hóa đơn điện tử mandate (≥200,000đ POS receipts)
//   TT 78/2021          — invoice mandatory fields
//   Luật QLT 2019 Art.30 — Mã số thuế requirement
//   Luật thuế GTGT       — VAT terminology
//   MISA/Viettel/VNPT    — e-invoice provider API field names
//
// See docs/ref/einvoice-tax.md and docs/ref/glossary.md §"Kế toán và thuế GTGT".

// Tax/legal terms that MUST appear verbatim on documents submitted to CQT
// or rendered on legal-bearing receipts (HĐĐT).
export const LEGAL_FIXED_VI = [
  "Hóa đơn điện tử",
  "HĐĐT",
  "Mã số thuế",
  "MST",
  "Tên người mua",
  "Tên người mua / công ty",
  "Người mua hàng",
  "Đơn vị mua hàng",
  "Người bán hàng",
  "Đơn vị bán hàng",
  "Mã CQT",
  "Cục Quản lý Thuế",
  "Ký hiệu hóa đơn",
  "Số hóa đơn",
  "Thuế GTGT",
  "Thuế giá trị gia tăng",
  "GTGT đầu ra",
  "GTGT đầu vào",
  "Thuế suất",
  "Cộng tiền hàng",
  "Tổng cộng tiền thanh toán",
  "Tổng tiền thanh toán",
  "Bằng chữ",
] as const;
export type LegalFixedString = (typeof LEGAL_FIXED_VI)[number];

// POS receipt invariants — rendered on bill-receipt-summary printed receipts.
// Not strictly law-mandated but changing them requires ops/legal review per
// Phase 2 QA gates.
// glossary §"In ấn": receipt = "Phiếu tạm tính" canonical (POS print, no CQT code).
export const RECEIPT_INVARIANT_VI = [
  "Phiếu tạm tính",
  "Tiền mặt",
  "Chuyển khoản",
  "Tổng cộng",
  "Khách trả",
  "Tiền thừa",
  "Tại bàn",
  "Mang về",
  "Cảm ơn quý khách",
] as const;
export type ReceiptInvariantString = (typeof RECEIPT_INVARIANT_VI)[number];
