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
  /** Discount allocated to this legal line in the same basis as `amount`. */
  discountAmount?: number;
}

export const BUYER_NOT_GET_INVOICE_NAME = "Người mua không lấy hóa đơn";

/**
 * Replacement context per TT78/2021 §7 (Path C). When present in
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
  /** TT78 digit form (e.g. "1", "2") matching original template prefix. */
  originalInvoiceType: string;
  /** TT78 digit form, e.g. "2" for template "2/001". */
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
  buyerNotGetInvoice?: boolean;

  /** Line items */
  items: InvoiceLineItem[];

  /** Totals */
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;

  /**
   * Present iff this is a TT78 §7 replacement (Path C).
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
  /** Raw provider response for storage */
  providerData?: Record<string, unknown>;
}

/**
 * Per-invoice outcome from a batch issue call. One entry per input request,
 * reconcilable by `transactionUuid`. Never represents a thrown error — a failed
 * item has `status='failed'` with the reason in `providerData`.
 */
export interface BatchInvoiceItemResult {
  /** Provider key echoed for reconcile (= providerRef). */
  transactionUuid: string;
  status: "submitted" | "issued" | "failed";
  invoiceNumber: string | null;
  providerRef: string;
  /** CQT code — present for MTT invoices once issued. */
  codeOfTax?: string | null;
  providerData?: Record<string, unknown>;
}

export interface InvoiceStatus {
  status:
    | "draft"
    | "signing"
    | "submitted"
    | "issued"
    | "cancelled"
    | "replaced";
  invoiceNumber: string | null;
  /**
   * Set ONLY when getStatus could not determine the real status —
   * network error, auth failure, malformed response. When `error` is
   * present, callers (e.g., reconcile cron) MUST treat the result as
   * "unknown, retry later" and ignore the `status` field. When `error`
   * is null/undefined, `status` is provider-confirmed truth.
   */
  error?: string | null;
}

/**
 * Result of downloading the signed PDF + XML of an issued invoice.
 * Bytes are PASS-THROUGH from provider — never re-encode (the
 * cryptographic signature applies to the exact bytes provider returns).
 * Caller MUST sha256 these bytes before Storage upload and persist the
 * digest as integrity proof.
 */
export interface InvoiceArtifact {
  bytes: Uint8Array;
  contentType: string;
  /** Provider-supplied filename if present, otherwise null. */
  filename: string | null;
}

export interface InvoiceArchive {
  pdf: InvoiceArtifact | null;
  xml: InvoiceArtifact | null;
  /**
   * Set when download could not be completed. Caller treats as "unknown,
   * retry later"; never derive partial archive from a response with
   * non-null `error`.
   */
  error?: string | null;
  /** Raw provider response metadata for forensic logging. */
  providerData?: Record<string, unknown>;
}

/**
 * Parameters needed to fetch the file bundle. Some providers
 * (Viettel) require invoiceNumber + templateCode in addition to the
 * stored provider_ref (transactionUuid). Caller passes whatever the
 * tax_invoices row already has — provider decides what to use.
 */
export interface InvoiceDownloadRequest {
  providerRef: string;
  invoiceNumber: string | null;
}

export interface InvoiceProvider {
  readonly name: string;

  /** Create and submit invoice to CQT */
  createInvoice(request: InvoiceRequest): Promise<InvoiceResult>;

  /**
   * Issue many invoices in one provider call (batch). Returns one result per
   * input request (same order); never throws — per-item failures surface as
   * `status='failed'`. Caller reconciles by `transactionUuid`.
   */
  createBatchInvoice(
    requests: InvoiceRequest[],
  ): Promise<BatchInvoiceItemResult[]>;

  /** Check invoice status (for async providers) */
  getStatus(providerRef: string): Promise<InvoiceStatus>;

  /** Cancel an issued invoice */
  cancelInvoice(providerRef: string, reason: string): Promise<void>;

  /**
   * Download the signed PDF + XML for an already-issued invoice.
   * MUST return bytes verbatim from the provider (no re-encoding).
   * Returns `{pdf, xml, error: null}` on success, `{pdf: null, xml:
   * null, error: '...'}` on any failure — never throw.
   */
  downloadInvoice(request: InvoiceDownloadRequest): Promise<InvoiceArchive>;
}

/**
 * Singleton: active invoice provider.
 * Set once at app startup based on env config.
 */
let activeProvider: InvoiceProvider | null = null;

export function setInvoiceProvider(provider: InvoiceProvider): void {
  activeProvider = provider;
}

export function getInvoiceProvider(): InvoiceProvider | null {
  return activeProvider;
}
