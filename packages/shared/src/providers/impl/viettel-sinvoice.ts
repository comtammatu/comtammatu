import type {
  InvoiceProvider,
  InvoiceRequest,
  InvoiceResult,
  InvoiceStatus,
} from "../invoice";

/**
 * Viettel Sinvoice Provider — real API integration.
 *
 * URL structure (per HDSD Tích hợp API HĐĐT):
 *   - Base host:    https://api-vinvoice.viettel.vn
 *   - API prefix:   /services/einvoiceapplication/api
 *   - Login path:   /auth/login   (NO api prefix — host root)
 *   - Endpoint ex:  /services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}
 *
 * Test accounts (HDSD §I, password: 2wsxCDE#):
 *   - 0100109106-501/504/505/507/899  — kiểm tra dữ liệu đầu vào (server tính lại)
 *   - 0100109106-509                  — KHÔNG kiểm tra (server nhận như input)
 *
 * Auth methods (HDSD §II):
 *   - BasicAuth per-request (password sent each call)
 *   - Bearer accessToken via /auth/login (this impl uses Bearer with token cache)
 *
 * Strict validators we must satisfy (per error doc v1):
 *   - 43: |qty × unitPrice − itemTotalAmountWithoutTax| < 1
 *   - 44: |(itemTotalAmountWithoutTax − itemDiscount) × taxPercentage/100 − taxAmount| < 1
 *   - 49: |totalTaxAmount − Σ(itemInfo.taxAmount)| < 1
 *   - 87: |sumOfTotalLineAmountWithoutTax − Σ(itemInfo.itemTotalAmountWithoutTax)| < 1
 *   - 410/412: TransactionUuid must be 10–36 chars
 *
 * Sinvoice expects per-line NET (pre-VAT) prices. The InvoiceRequest
 * interface is rate-agnostic — caller may pass GROSS (B2B realtime path,
 * order_items.subtotal stored as gross) or NET (B2C batch, _compute_vat_breakdown
 * returns net). A heuristic compares Σ items.amount vs subtotal vs totalAmount
 * to pick the conversion factor. For mixed-rate B2B, header vatRate (predominant)
 * is used per-line — accepts ≤1₫ rounding tolerance; out-of-tolerance errors
 * surface as Sinvoice rejection (status='failed') rather than silent corruption.
 *
 * Env vars:
 *   - SINVOICE_USERNAME, SINVOICE_PASSWORD
 *   - COMPANY_TAX_CODE (also used by MISA)
 *   - SINVOICE_TEMPLATE_CODE   (e.g. "1/001")
 *   - SINVOICE_INVOICE_SERIES  (e.g. "C25TLL")
 *   - SINVOICE_BASE_URL        (override host; same URL for prod + test)
 *   - SINVOICE_SANDBOX=true    (informational — server distinguishes via creds)
 */

const DEFAULT_BASE_URL = "https://api-vinvoice.viettel.vn";
const API_PREFIX = "/services/einvoiceapplication/api";
const LOGIN_PATH = "/auth/login";

const TX_UUID_LENGTH = 32;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface ViettelSinvoiceConfig {
  username: string;
  password: string;
  taxCode: string;
  templateCode: string;
  invoiceSeries: string;
  /** Override default https://api-vinvoice.viettel.vn (host only, no path). */
  baseUrl?: string;
  /** Sandbox flag — informational; URL is the same, only creds differ. */
  sandbox?: boolean;
}

interface TokenCache {
  token: string;
  /** Epoch ms after which token is considered expired (with safety margin). */
  expiresAt: number;
}

interface SinvoiceEnvelope<TResult> {
  errorCode?: string | number | null;
  description?: string | null;
  result?: TResult | null;
}

interface SinvoiceLoginResult {
  access_token?: string;
  expires_in?: number;
}

interface SinvoiceCreateResult {
  invoiceNo?: string;
  reservationCode?: string;
  transactionID?: string;
  supplierTaxCode?: string;
}

interface SinvoiceStatusResult {
  invoiceNo?: string;
  paymentStatus?: number;
  invoiceStatus?: number;
}

/**
 * Build a deterministic 32-char transactionUuid from a domain key. Same key →
 * same uuid → safe retry: Sinvoice rejects duplicate uuid with code
 * TRANSACTION_IS_BEING_PROCESSED, which our caller treats as "already
 * submitted, look it up". 32 chars satisfies length validator (10–36).
 */
export function buildSinvoiceTransactionUuid(invoiceId: number): string {
  const idStr = String(invoiceId);
  const prefix = "HDDT";
  const fillerLen = TX_UUID_LENGTH - prefix.length - idStr.length;
  if (fillerLen < 0) {
    return `${prefix}${idStr.slice(-(TX_UUID_LENGTH - prefix.length))}`;
  }
  return `${prefix}${"0".repeat(fillerLen)}${idStr}`;
}

export class ViettelSinvoiceProvider implements InvoiceProvider {
  readonly name = "viettel";

  private readonly username: string;
  private readonly password: string;
  private readonly taxCode: string;
  private readonly templateCode: string;
  private readonly invoiceSeries: string;
  private readonly baseUrl: string;

  private tokenCache: TokenCache | null = null;
  private inFlightLogin: Promise<string> | null = null;

  constructor(config: ViettelSinvoiceConfig) {
    this.username = config.username;
    this.password = config.password;
    this.taxCode = config.taxCode;
    this.templateCode = config.templateCode;
    this.invoiceSeries = config.invoiceSeries;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private async login(): Promise<string> {
    const basic = Buffer.from(
      `${this.username}:${this.password}`,
      "utf-8",
    ).toString("base64");

    const res = await fetch(`${this.baseUrl}${LOGIN_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`sinvoice_login_${res.status}`);
    }

    const data = (await res.json()) as
      | SinvoiceEnvelope<SinvoiceLoginResult>
      | SinvoiceLoginResult;
    const result =
      "result" in data && data.result ? data.result : (data as SinvoiceLoginResult);
    const token = result?.access_token;
    if (!token) {
      throw new Error("sinvoice_login_no_token");
    }
    const ttlMs = (result?.expires_in ?? 24 * 60 * 60) * 1000;
    this.tokenCache = {
      token,
      expiresAt: Date.now() + ttlMs - TOKEN_SAFETY_MARGIN_MS,
    };
    return token;
  }

  private async ensureToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }
    if (this.inFlightLogin) {
      return this.inFlightLogin;
    }
    this.inFlightLogin = this.login().finally(() => {
      this.inFlightLogin = null;
    });
    return this.inFlightLogin;
  }

  private async authedFetch(
    apiPath: string,
    init: RequestInit,
  ): Promise<Response> {
    let token = await this.ensureToken();
    const exec = (auth: string) =>
      fetch(`${this.baseUrl}${API_PREFIX}${apiPath}`, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    let res = await exec(token);
    if (res.status === 401) {
      // Token expired or revoked — invalidate cache + retry once.
      this.tokenCache = null;
      token = await this.ensureToken();
      res = await exec(token);
    }
    return res;
  }

  /**
   * Detect whether caller's per-item amounts are GROSS (incl VAT) or NET.
   * B2B realtime path passes order_items.subtotal which is stored gross.
   * B2C batch path passes _compute_vat_breakdown line_subtotal which is net.
   * Compare Σ items.amount: closer to totalAmount → gross; closer to subtotal → net.
   */
  private detectGrossInput(request: InvoiceRequest): boolean {
    if (request.items.length === 0) return true;
    const itemsSum = request.items.reduce((s, i) => s + i.amount, 0);
    const distToGross = Math.abs(itemsSum - request.totalAmount);
    const distToNet = Math.abs(itemsSum - request.subtotal);
    return distToGross <= distToNet;
  }

  async createInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
    const transactionUuid = buildSinvoiceTransactionUuid(request.orderId);
    const callerPassesGross = this.detectGrossInput(request);

    // Per-line NET conversion (Sinvoice strict validators 43/44/87/49).
    // For mixed-rate B2B, header vatRate is used per-line — accepts ≤1₫
    // rounding tolerance; out-of-tolerance triggers Sinvoice rejection.
    const itemInfo = request.items.map((item, index) => {
      const lineGross = callerPassesGross
        ? item.amount
        : item.amount * (1 + request.vatRate / 100);
      const lineNet = Math.round(lineGross / (1 + request.vatRate / 100));
      const netUnitPrice =
        item.quantity > 0 ? Math.round(lineNet / item.quantity) : 0;
      const lineTax = Math.round(lineGross) - lineNet;
      return {
        lineNumber: index + 1,
        itemCode: "",
        itemName: item.name,
        unitName: item.unit || "Phần",
        unitPrice: netUnitPrice,
        quantity: item.quantity,
        itemTotalAmountWithoutTax: lineNet,
        itemDiscount: 0,
        taxPercentage: request.vatRate,
        taxAmount: lineTax,
      };
    });

    // Reconcile totals — use server-recomputed sums so Σ matches per-line
    // exactly (Sinvoice errors 49/87 are within ±1₫ tolerance only).
    const sumLineNet = itemInfo.reduce(
      (s, l) => s + l.itemTotalAmountWithoutTax,
      0,
    );
    const sumLineTax = itemInfo.reduce((s, l) => s + l.taxAmount, 0);
    const totalGross = sumLineNet + sumLineTax;

    const body = {
      generalInvoiceInfo: {
        invoiceType: "01GTKT",
        templateCode: this.templateCode,
        invoiceSeries: this.invoiceSeries,
        currencyCode: "VND",
        transactionUuid,
        adjustmentType: "1",
        paymentStatus: true,
        paymentType: 3,
        paymentTypeName: "TM/CK",
        cusGetInvoiceRight: true,
        userName: this.username,
      },
      buyerInfo: {
        buyerName: request.buyerName ?? "Khách lẻ",
        buyerLegalName: request.buyerName ?? "",
        buyerTaxCode: request.buyerTaxCode ?? "",
        buyerAddressLine: request.buyerAddress ?? "",
      },
      sellerInfo: {
        sellerLegalName: request.sellerName,
        sellerTaxCode: request.sellerTaxCode || this.taxCode,
        sellerAddressLine: request.sellerAddress ?? "",
      },
      payments: [{ paymentMethodName: "TM/CK" }],
      itemInfo,
      summarizeInfo: {
        sumOfTotalLineAmountWithoutTax: sumLineNet,
        totalAmountWithoutTax: sumLineNet,
        totalTaxAmount: sumLineTax,
        totalAmountWithTax: totalGross,
        discountAmount: 0,
      },
      taxBreakdowns: [
        {
          taxPercentage: request.vatRate,
          taxableAmount: sumLineNet,
          taxAmount: sumLineTax,
        },
      ],
    };

    try {
      const res = await this.authedFetch(
        `/InvoiceAPI/InvoiceWS/createInvoice/${this.taxCode}`,
        { method: "POST", body: JSON.stringify(body) },
      );

      const envelope =
        (await res.json()) as SinvoiceEnvelope<SinvoiceCreateResult>;

      if (!res.ok || envelope.errorCode) {
        return {
          status: "failed",
          invoiceNumber: null,
          providerRef: transactionUuid,
          providerData: {
            errorCode: envelope.errorCode ?? res.status,
            description: envelope.description ?? "create_invoice_failed",
            transactionUuid,
          },
        };
      }

      const result = envelope.result;
      const invoiceNo = result?.invoiceNo ?? null;

      // Sinvoice returns invoiceNo synchronously; CQT code (reservationCode)
      // arrives async per BU spec. Treat invoiceNo presence as 'submitted'
      // (sent to CQT, awaiting code) — reconcile cron polls getStatus.
      // No invoiceNo = still 'signing'.
      const status: InvoiceResult["status"] = invoiceNo
        ? "submitted"
        : "signing";

      return {
        status,
        invoiceNumber: invoiceNo,
        // providerRef stores transactionUuid (the key WE generated) so cancel
        // can reference the same submission — reservationCode is what
        // Sinvoice generated, useful for audit but not for cancel lookup.
        providerRef: transactionUuid,
        providerData: {
          transactionUuid,
          reservationCode: result?.reservationCode,
          transactionID: result?.transactionID,
          supplierTaxCode: result?.supplierTaxCode,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        invoiceNumber: null,
        providerRef: transactionUuid,
        providerData: {
          errorCode: "exception",
          description:
            err instanceof Error ? err.message : "sinvoice_call_failed",
          transactionUuid,
        },
      };
    }
  }

  async getStatus(providerRef: string): Promise<InvoiceStatus> {
    // Public S-invoice docs point to InvoiceWS/searchInvoiceByTransactionUuid
    // for reconciliation by our transactionUuid. Keep this endpoint behind the
    // provider boundary until Viettel BU confirms the contract for this account.
    try {
      const res = await this.authedFetch(
        `/InvoiceAPI/InvoiceUtilsWS/getInvoiceById`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierTaxCode: this.taxCode,
            transactionUuid: providerRef,
          }),
        },
      );
      const envelope =
        (await res.json()) as SinvoiceEnvelope<SinvoiceStatusResult>;
      if (!res.ok || envelope.errorCode) {
        return { status: "draft", invoiceNumber: null };
      }
      const r = envelope.result;
      // Sinvoice invoiceStatus: 0=Pending, 1=Signed, 5=Cancelled, 6=Replaced
      const map: Record<number, InvoiceStatus["status"]> = {
        0: "submitted",
        1: "issued",
        5: "cancelled",
        6: "replaced",
      };
      return {
        status: map[r?.invoiceStatus ?? 0] ?? "draft",
        invoiceNumber: r?.invoiceNo ?? null,
      };
    } catch {
      return { status: "draft", invoiceNumber: null };
    }
  }

  async cancelInvoice(providerRef: string, reason: string): Promise<void> {
    // Public S-invoice docs describe cancelTransactionInvoice with invoiceNo
    // and issue date form params. This transactionUuid variant must be
    // confirmed in sandbox before native cancel is treated as production-ready.
    const res = await this.authedFetch(
      `/InvoiceAPI/InvoiceWS/cancelTransactionInvoice/${this.taxCode}`,
      {
        method: "POST",
        body: JSON.stringify({
          supplierTaxCode: this.taxCode,
          transactionUuid: providerRef,
          additionalReferenceDesc: reason,
        }),
      },
    );

    if (!res.ok) {
      const envelope = (await res.json()) as SinvoiceEnvelope<unknown>;
      throw new Error(
        typeof envelope.description === "string"
          ? envelope.description
          : `sinvoice_cancel_${res.status}`,
      );
    }
  }
}
