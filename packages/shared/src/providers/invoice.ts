/**
 * Invoice Provider Interface (HĐĐT)
 *
 * Tương tự Go interface — HĐĐT runtime hiện chỉ đăng ký Viettel S-invoice,
 * nhưng server action gọi qua interface để giữ business logic tách khỏi
 * chi tiết HTTP/provider.
 *
 * ```
 * InvoiceProvider (interface)
 *   └── ViettelSinvoiceProvider
 * ```
 */

export interface InvoiceLineItem {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** VAT percentage snapshotted from the sold item. */
  vatRate: 0 | 5 | 8 | 10;
  /** Discount allocated to this legal line in the same basis as `amount`. */
  discountAmount?: number;
}

// Mandated phrase for a consumer buyer with no name/MST/ID — NĐ 254/2026 Phụ lục
// "Nội dung của hóa đơn" mục 4b (effective 01/07/2026). Do not translate/reword.
export const BUYER_NOT_GET_INVOICE_NAME = "Bán cho người tiêu dùng";

/**
 * Replacement context per TT 32/2025 + NĐ 254/2026 (Path C). When present in
 * InvoiceRequest, provider MUST send the call as `adjustmentType=3`
 * (HĐ thay thế) and inject original-invoice cross-references in
 * `generalInvoiceInfo` per Viettel HDSD §III.2.
 *
 * MUST be a fresh tx — caller passes the NEW row's tax_invoices.id
 * as `request.orderId` so `buildSinvoiceTransactionUuid` produces a
 * uuid distinct from the original's.
 */
export interface InvoiceReplacementContext {
  /** Invoice number of the original being replaced. */
  originalInvoiceNumber: string;
  /** ISO8601 timestamp of original issuance. Provider converts to epoch ms. */
  originalIssuedAt: string;
  /** Provider digit form (e.g. "1", "2") matching original template prefix. */
  originalInvoiceType: string;
  /** Provider digit form `"1"` for the registered VAT template. */
  originalTemplateCode: string;
  /** Lý do sai sót — ≤255 chars (Sinvoice `adjustedNote`). */
  reason: string;
  /** Văn bản thỏa thuận text — ≤225 chars (Sinvoice `additionalReferenceDesc`). REQUIRED. */
  agreementRef: string;
  /** ISO8601 timestamp of agreement. Provider converts to epoch ms. */
  agreementDate: string;
}

export interface InvoiceRequest {
  /** Internal order reference */
  orderId: number;
  orderNumber: string;
  /** Legal invoice time captured from the completed payment. */
  invoiceIssuedAt?: string;

  /**
   * Provider-neutral seller fields. Viettel S-invoice currently does not send
   * `sellerInfo`; seller identity is resolved by Vinvoice from supplierTaxCode
   * and the registered account/template.
   */
  sellerName: string;
  sellerTaxCode: string;
  sellerAddress: string;

  /** Buyer info (optional for B2C) */
  buyerName?: string;
  buyerTaxCode?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerNotGetInvoice?: boolean;

  /** Line items */
  items: InvoiceLineItem[];

  /** Totals */
  subtotal: number;
  vatAmount: number;
  totalAmount: number;

  /**
   * Present iff this is an HĐĐT replacement (Path C).
   * Provider branches body shape: adjustmentType="3" + original refs
   * in generalInvoiceInfo. Caller MUST pass NEW row id as `orderId`
   * to ensure transactionUuid uniqueness vs original.
   */
  replacement?: InvoiceReplacementContext;
}

export interface InvoiceResult {
  status: "draft" | "signing" | "submitted" | "issued" | "failed";
  invoiceNumber: string | null;
  providerRef: string;
  /**
   * CQT code (Mã của cơ quan thuế) when the provider returns it on the create
   * response. Distinct from the lookup secret `reservationCode`. Null while
   * submitted/signing or when the template does not return it synchronously.
   */
  codeOfTax?: string | null;
  /** Raw provider response for storage */
  providerData?: Record<string, unknown>;
}

export interface InvoiceProvider {
  readonly name: string;

  /** Create and submit invoice to CQT */
  createInvoice(request: InvoiceRequest): Promise<InvoiceResult>;

  /** Cancel an issued invoice */
  cancelInvoice(providerRef: string, reason: string): Promise<void>;
}
