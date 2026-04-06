import type {
  InvoiceProvider,
  InvoiceRequest,
  InvoiceResult,
  InvoiceStatus,
} from "../invoice";

/**
 * MISA meInvoice Provider
 * TODO: Replace mock with real MISA API
 * Docs: https://apidocs.meinvoice.vn
 */
export class MisaProvider implements InvoiceProvider {
  readonly name = "misa";

  private apiKey: string;
  private taxCode: string;

  constructor(config: { apiKey: string; taxCode: string }) {
    this.apiKey = config.apiKey;
    this.taxCode = config.taxCode;
  }

  async createInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
    // TODO: Call MISA meInvoice API
    // POST api.meinvoice.vn/api/v1/invoices
    // Headers: X-API-KEY, X-TAX-CODE
    // Body: { invoiceType, buyer, items, totals }
    // Response: { invoiceId, invoiceNumber, status }

    // Note: MISA signing may be async. If so, status = 'signing'
    // and we poll getStatus() until 'issued'.

    const providerRef = `MISA-${this.taxCode}-${Date.now()}`;
    const invoiceNumber = `INV-${request.orderId}-${Date.now()}`;

    // Mock: instant issued (real MISA may be async)
    return {
      status: "issued",
      invoiceNumber,
      providerRef,
      providerData: {
        apiKey: this.apiKey ? "[set]" : "[missing]",
        taxCode: this.taxCode,
        mock: true,
      },
    };
  }

  async getStatus(providerRef: string): Promise<InvoiceStatus> {
    // TODO: GET api.meinvoice.vn/api/v1/invoices/{providerRef}/status

    void providerRef;
    return {
      status: "issued",
      invoiceNumber: null,
    };
  }

  async cancelInvoice(providerRef: string, reason: string): Promise<void> {
    // TODO: POST api.meinvoice.vn/api/v1/invoices/{providerRef}/cancel
    // Body: { reason }
    // Must create biên bản hủy per legal requirement

    void providerRef;
    void reason;
  }
}
