import type {
  InvoiceArchive,
  InvoiceDownloadRequest,
  InvoiceProvider,
  InvoiceRequest,
  InvoiceResult,
  InvoiceStatus,
} from "../invoice";

/**
 * MISA meInvoice Provider — real API integration.
 *
 * Sandbox: https://testapi.meinvoice.vn/api/v1
 * Production: https://api.meinvoice.vn/api/v1
 *
 * Env vars: MISA_API_KEY, MISA_TAX_CODE, MISA_APP_ID, MISA_SANDBOX
 *
 * Flow:
 * 1. Create draft invoice → MISA returns invoiceId
 * 2. Sign and submit → MISA submits to CQT
 * 3. CQT processes → status becomes "issued" with invoice number
 *
 * MISA signing can be async. We handle both sync and async flows.
 */

const SANDBOX_BASE = "https://testapi.meinvoice.vn/api/v1";
const PRODUCTION_BASE = "https://api.meinvoice.vn/api/v1";

interface MisaConfig {
  apiKey: string;
  taxCode: string;
  appId?: string;
  sandbox?: boolean;
  /** Override base URL (takes precedence over the sandbox toggle). */
  baseUrl?: string;
}

interface MisaInvoiceResponse {
  Code?: number;
  Data?: {
    InvoiceID?: string;
    InvoiceNumber?: string;
    InvoiceSerial?: string;
    Status?: number;
  };
  ErrorMessage?: string;
}

export class MisaProvider implements InvoiceProvider {
  readonly name = "misa";

  private apiKey: string;
  private taxCode: string;
  private appId: string;
  private baseUrl: string;

  constructor(config: MisaConfig) {
    this.apiKey = config.apiKey;
    this.taxCode = config.taxCode;
    this.appId = config.appId ?? "";
    this.baseUrl =
      config.baseUrl
      ?? ((config.sandbox ?? process.env.MISA_SANDBOX === "true")
        ? SANDBOX_BASE
        : PRODUCTION_BASE);
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-KEY": this.apiKey,
      "X-TAX-CODE": this.taxCode,
      ...(this.appId ? { "X-APP-ID": this.appId } : {}),
    };
  }

  async createInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
    // Build MISA invoice payload per meInvoice API spec
    const invoiceDetails = request.items.map((item, index) => ({
      ItemName: item.name,
      UnitName: item.unit || "Phần",
      Quantity: item.quantity,
      UnitPrice: item.unitPrice,
      Amount: item.amount,
      SortOrder: index + 1,
      IsPromotion: false,
    }));

    const body = {
      InvoiceTypeID: 1, // Hóa đơn GTGT
      BuyerName: request.buyerName || "Khách lẻ",
      BuyerTaxCode: request.buyerTaxCode || "",
      BuyerAddress: request.buyerAddress || "",
      PaymentMethodName: "TM/CK", // Tiền mặt / Chuyển khoản
      TotalAmountWithoutVAT: request.subtotal,
      VATRate: request.vatRate,
      VATAmount: request.vatAmount,
      TotalAmount: request.totalAmount,
      InvoiceDetails: invoiceDetails,
      OriginalInvoiceData: {
        OrderId: request.orderId,
        OrderNumber: request.orderNumber,
      },
    };

    try {
      // Step 1: Create invoice
      const createRes = await fetch(`${this.baseUrl}/invoices`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      const createData = (await createRes.json()) as MisaInvoiceResponse;

      if (!createRes.ok || (createData.Code && createData.Code !== 200)) {
        return {
          status: "failed",
          invoiceNumber: null,
          providerRef: `MISA-ERR-${request.orderId}`,
          providerData: {
            code: createData.Code,
            error: createData.ErrorMessage ?? "Failed to create invoice",
          },
        };
      }

      const invoiceId = createData.Data?.InvoiceID ?? "";
      if (!invoiceId) {
        return {
          status: "failed",
          invoiceNumber: null,
          providerRef: `MISA-ERR-${request.orderId}`,
          providerData: { error: "No InvoiceID returned", raw: createData },
        };
      }

      // Step 2: Sign and submit to CQT
      const signRes = await fetch(
        `${this.baseUrl}/invoices/${invoiceId}/publish`,
        {
          method: "POST",
          headers: this.headers,
          signal: AbortSignal.timeout(30_000),
        },
      );

      const signData = (await signRes.json()) as MisaInvoiceResponse;

      // MISA may return the invoice number immediately (sync)
      // or return status=signing (async — poll getStatus later)
      const invoiceNumber =
        signData.Data?.InvoiceNumber ?? createData.Data?.InvoiceNumber ?? null;
      const status = signData.Data?.Status;

      // MISA Status codes: 0=Draft, 1=Signing, 2=Submitted, 3=Issued, 4=Error
      let resultStatus: InvoiceResult["status"];
      if (status === 3 || invoiceNumber) {
        resultStatus = "issued";
      } else if (status === 2) {
        resultStatus = "submitted";
      } else if (status === 1) {
        resultStatus = "signing";
      } else {
        resultStatus = "draft";
      }

      return {
        status: resultStatus,
        invoiceNumber,
        providerRef: invoiceId,
        providerData: {
          invoiceId,
          serial: signData.Data?.InvoiceSerial,
          misaStatus: status,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        invoiceNumber: null,
        providerRef: `MISA-ERR-${request.orderId}`,
        providerData: {
          error: err instanceof Error ? err.message : "MISA API call failed",
        },
      };
    }
  }

  async getStatus(providerRef: string): Promise<InvoiceStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/invoices/${providerRef}`, {
        method: "GET",
        headers: this.headers,
        signal: AbortSignal.timeout(15_000),
      });

      const data = (await res.json()) as MisaInvoiceResponse;
      const status = data.Data?.Status;
      const invoiceNumber = data.Data?.InvoiceNumber ?? null;

      const statusMap: Record<number, InvoiceStatus["status"]> = {
        0: "draft",
        1: "signing",
        2: "submitted",
        3: "issued",
        5: "cancelled",
        6: "replaced",
      };

      return {
        status: statusMap[status ?? 0] ?? "draft",
        invoiceNumber,
      };
    } catch {
      return { status: "draft", invoiceNumber: null };
    }
  }

  async cancelInvoice(providerRef: string, reason: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/invoices/${providerRef}/cancel`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ CancelReason: reason }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const data = (await res.json()) as MisaInvoiceResponse;
      throw new Error(
        data.ErrorMessage ?? `Failed to cancel invoice: ${res.status}`,
      );
    }
  }

  /**
   * MISA download not wired for Path D pilot — Viettel is the primary
   * provider as of 2026-05-13. Returns `error` so the archive helper
   * treats this as "unknown, surface to ops" rather than retrying.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async downloadInvoice(_req: InvoiceDownloadRequest): Promise<InvoiceArchive> {
    return {
      pdf: null,
      xml: null,
      error: "misa_download_not_implemented",
    };
  }
}
