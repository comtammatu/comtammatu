/**
 * Invoice Provider Interface (HĐĐT)
 *
 * Tương tự Go interface — mỗi HĐĐT provider (MISA, ViettelSinvoice...)
 * implement interface này. Server action gọi qua interface,
 * swap provider không cần đổi business logic.
 *
 * ```
 * InvoiceProvider (interface)
 *   ├── MisaProvider
 *   └── (fallback) ViettelSinvoiceProvider
 * ```
 */

export interface InvoiceLineItem {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceRequest {
  /** Internal order reference */
  orderId: number;
  orderNumber: string;

  /** Seller info (from tenants table) */
  sellerName: string;
  sellerTaxCode: string;
  sellerAddress: string;

  /** Buyer info (optional for B2C) */
  buyerName?: string;
  buyerTaxCode?: string;
  buyerAddress?: string;

  /** Line items */
  items: InvoiceLineItem[];

  /** Totals */
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
}

export interface InvoiceResult {
  status: "draft" | "signing" | "submitted" | "issued" | "failed";
  invoiceNumber: string | null;
  providerRef: string;
  /** Raw provider response for storage */
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
}

export interface InvoiceProvider {
  readonly name: string;

  /** Create and submit invoice to CQT */
  createInvoice(request: InvoiceRequest): Promise<InvoiceResult>;

  /** Check invoice status (for async providers) */
  getStatus(providerRef: string): Promise<InvoiceStatus>;

  /** Cancel an issued invoice */
  cancelInvoice(providerRef: string, reason: string): Promise<void>;
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
