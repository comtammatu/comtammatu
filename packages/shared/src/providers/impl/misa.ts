import type {
  InvoiceProvider,
  InvoiceRequest,
  InvoiceResult,
  InvoiceStatus,
} from "../invoice";

/**
 * MISA meInvoice Provider
 * Docs: https://apidocs.meinvoice.vn
 */
export class MisaProvider implements InvoiceProvider {
  readonly name = "misa";

  private apiKey: string;
  private taxCode: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; taxCode: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.taxCode = config.taxCode;
    this.baseUrl = config.baseUrl ?? "https://api.meinvoice.vn/api/v1";
  }

  async createInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
    const endpoint = new URL("/invoices", this.baseUrl);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-KEY": this.apiKey,
        "X-TAX-CODE": this.taxCode,
      },
      body: JSON.stringify({
        orderRef: request.orderNumber,
        buyer: {
          name: request.buyerName ?? null,
          taxCode: request.buyerTaxCode ?? null,
          address: request.buyerAddress ?? null,
        },
        items: request.items.map((i) => ({
          name: i.name,
          unit: i.unit,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: i.amount,
        })),
        totals: {
          subtotal: request.subtotal,
          vatRate: request.vatRate,
          vatAmount: request.vatAmount,
          totalAmount: request.totalAmount,
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok || !json) {
      return {
        status: "failed",
        invoiceNumber: null,
        providerRef: `MISA-${this.taxCode}-${Date.now()}`,
        providerData: { httpStatus: res.status },
      };
    }

    const providerRef =
      typeof json.invoiceId === "string"
        ? json.invoiceId
        : `MISA-${this.taxCode}-${Date.now()}`;

    const invoiceNumber =
      typeof json.invoiceNumber === "string" ? json.invoiceNumber : null;

    const statusRaw = String(json.status ?? "submitted");
    const status: InvoiceResult["status"] =
      statusRaw === "draft" ||
      statusRaw === "signing" ||
      statusRaw === "submitted" ||
      statusRaw === "issued"
        ? statusRaw
        : "submitted";

    return {
      status,
      invoiceNumber,
      providerRef,
      providerData: json,
    };
  }

  async getStatus(providerRef: string): Promise<InvoiceStatus> {
    const endpoint = new URL(
      `/invoices/${encodeURIComponent(providerRef)}/status`,
      this.baseUrl,
    );
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-API-KEY": this.apiKey,
        "X-TAX-CODE": this.taxCode,
      },
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok || !json) {
      return { status: "draft", invoiceNumber: null };
    }

    const statusRaw = String(json.status ?? "draft");
    const status: InvoiceStatus["status"] =
      statusRaw === "draft" ||
      statusRaw === "signing" ||
      statusRaw === "submitted" ||
      statusRaw === "issued" ||
      statusRaw === "cancelled" ||
      statusRaw === "replaced"
        ? statusRaw
        : "draft";

    return {
      status,
      invoiceNumber:
        typeof json.invoiceNumber === "string" ? json.invoiceNumber : null,
    };
  }

  async cancelInvoice(providerRef: string, reason: string): Promise<void> {
    const endpoint = new URL(
      `/invoices/${encodeURIComponent(providerRef)}/cancel`,
      this.baseUrl,
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-KEY": this.apiKey,
        "X-TAX-CODE": this.taxCode,
      },
      body: JSON.stringify({ reason }),
    });

    if (!res.ok) {
      throw new Error("MISA cancel invoice failed");
    }
  }
}
