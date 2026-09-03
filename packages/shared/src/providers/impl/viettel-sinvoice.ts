import {
  BUYER_NOT_GET_INVOICE_NAME,
  type InvoiceLineItem,
  type InvoiceLookupResult,
  type InvoiceProvider,
  type InvoiceRequest,
  type InvoiceResult,
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
 *   - 0100109106-501/504/505/507/899  — strict input validation (server recomputes)
 *   - 0100109106-509                  — NO validation (server takes input as-is)
 *
 * Auth methods (HDSD §II + Postman §5.5):
 *   - POST /auth/login with JSON { username, password }.
 *   - Bearer accessToken from login for subsequent API calls.
 *
 * Strict validators we must satisfy (per error doc v1):
 *   - 43: |qty × unitPrice − itemTotalAmountWithoutTax| < 1
 *   - 44: |(itemTotalAmountWithoutTax − itemDiscount) × taxPercentage/100 − taxAmount| < 1
 *   - 49: |totalTaxAmount − Σ(itemInfo.taxAmount)| < 1
 *   - 87: |sumOfTotalLineAmountWithoutTax − Σ(itemInfo.itemTotalAmountWithoutTax)| < 1
 *   - 410/412: TransactionUuid must be 10–36 chars
 *
 * Sinvoice expects per-line NET (pre-VAT) prices. The InvoiceRequest
 * interface is rate-agnostic — callers may pass GROSS or NET amounts.
 * A heuristic compares Σ items.amount vs subtotal vs totalAmount
 * to pick the conversion factor. For mixed-rate B2B, header vatRate (predominant)
 * is used per-line — accepts ≤1₫ rounding tolerance; out-of-tolerance errors
 * surface as Sinvoice rejection (status='failed') rather than silent corruption.
 *
 * Env vars:
 *   - SINVOICE_USERNAME, SINVOICE_PASSWORD
 *   - COMPANY_TAX_CODE
 *   - SINVOICE_TEMPLATE_CODE   (digit template form, e.g. "2/001" for HĐ bán hàng từ MTT)
 *   - SINVOICE_INVOICE_SERIES  (registered with CQT, e.g. "C26MAA")
 *   - SINVOICE_BASE_URL        (override host; same URL for prod + test)
 *   - SINVOICE_SANDBOX=true    (informational — server distinguishes via creds)
 *
 * Template ↔ invoiceType mapping (derived at runtime):
 *   - "1/..." → invoiceType "1" (HĐ GTGT / VAT-deductible)
 *   - "2/..." → invoiceType "2" (HĐ bán hàng từ MTT — F&B default)
 *   - 3/4/5/6 also supported (see deriveInvoiceTypeFromTemplate)
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
  message?: string | null;
  error?: string | null;
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
  codeOfTax?: string | null;
}

interface SinvoiceSearchHit {
  invoiceNo?: string;
  reservationCode?: string;
  issueDate?: number;
  status?: string;
  codeOfTax?: string | null;
  supplierTaxCode?: string;
}

function firstSearchHit(
  result: SinvoiceSearchHit[] | SinvoiceSearchHit | null | undefined,
): SinvoiceSearchHit | null {
  if (Array.isArray(result)) {
    return result[0] ?? null;
  }
  if (result && typeof result === "object") {
    return result;
  }
  return null;
}

function lookupIssuedAt(issueDate: number | undefined): string | null {
  if (typeof issueDate !== "number" || !Number.isFinite(issueDate)) {
    return null;
  }
  const issued = new Date(issueDate);
  if (Number.isNaN(issued.getTime())) {
    return null;
  }
  return issued.toISOString();
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

/**
 * Derive provider `invoiceType` from `templateCode`.
 *
 * Per Viettel HDSD line 580-598 + example bodies (HDSD §III.2, line
 * 869+ all show `invoiceType: "1"` paired with `templateCode: "1/001"`):
 *   - Template `1/...` → invoiceType `"1"` (HĐ GTGT)
 *   - Template `2/...` → invoiceType `"2"` (HĐ bán hàng — F&B/MTT)
 *   - Template `3/...` → invoiceType `"3"` ...
 *
 * Older pre-2026 templates like `01GTKT0/001` map to the `"01GTKT"` form;
 * we do NOT support those digit codes since 2026.
 *
 * Throws if templateCode shape is unrecognised so misconfigured env
 * surfaces loudly at boot rather than producing rejected invoices.
 */
export function deriveInvoiceTypeFromTemplate(templateCode: string): string {
  const match = templateCode.match(/^([1-6])\//);
  if (!match || !match[1]) {
    throw new Error(
      `Invalid SINVOICE_TEMPLATE_CODE format: "${templateCode}". ` +
        `Expected digit template form like "1/001" or "2/001".`,
    );
  }
  return match[1];
}

interface SinvoiceBaseItemInfo {
  lineNumber: number;
  selection: 1 | 3;
  itemCode: string;
  itemName: string;
  unitName: string;
  itemTotalAmountWithoutTax: number;
  itemTotalAmountAfterDiscount: number;
  itemTotalAmountWithTax: number;
  discount: number;
  itemDiscount: number;
  itemNote: null;
  isIncreaseItem: boolean | null;
  // Omitted for direct_sales_gross (mẫu-2 hóa đơn bán hàng): the sales-invoice
  // template has no thuế-suất field — Viettel strips taxPercentage from the CQT
  // XML, so we send neither rather than a placeholder. VAT mode (mẫu-1) sets both.
  taxPercentage?: number;
  taxAmount?: number;
}

export interface SinvoiceSaleItemInfo extends SinvoiceBaseItemInfo {
  selection: 1;
  unitPrice: number;
  quantity: number;
  isIncreaseItem: null;
}

export interface SinvoiceDiscountItemInfo extends SinvoiceBaseItemInfo {
  selection: 3;
  unitPrice?: never;
  quantity?: never;
  isIncreaseItem: false;
}

export type SinvoiceItemInfo = SinvoiceSaleItemInfo | SinvoiceDiscountItemInfo;

export interface SinvoiceLineMath {
  itemInfo: SinvoiceItemInfo[];
  sumLineNet: number;
  sumLineDiscount: number;
  sumLineTax: number;
  totalGross: number;
}

type SinvoicePricingMode = "vat_deductible_net" | "direct_sales_gross";
const DIRECT_SALES_DISCOUNT_LINE_NAME = "Chiết khấu hàng hóa";

function normalizeMoney(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

function clampMoney(value: number, max: number): number {
  return Math.min(Math.max(0, value), Math.max(0, max));
}

// Viettel rejects a `discount` rate carrying >2 decimal places
// (BAD_REQUEST_INVALID_DECIMAL_POINT_DISCOUNT). VAT mode still needs a line
// rate; direct-sales mode avoids it by sending a selection=3 discount line.
function roundDiscountRate(rate: number): number {
  return Math.round(rate * 100) / 100;
}

function findNetDiscountForGrossTarget(
  lineNet: number,
  vatRate: number,
  grossBeforeDiscount: number,
  grossDiscount: number,
): number {
  const targetGross = Math.max(
    0,
    Math.round(grossBeforeDiscount - grossDiscount),
  );
  const candidate = clampMoney(
    Math.round(grossDiscount / (1 + vatRate / 100)),
    lineNet,
  );
  const start = Math.max(0, candidate - 50);
  const end = Math.min(lineNet, candidate + 50);

  let best = candidate;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let discount = start; discount <= end; discount += 1) {
    const taxable = lineNet - discount;
    const tax = Math.round((taxable * vatRate) / 100);
    const grossAfterDiscount = taxable + tax;
    const diff = Math.abs(grossAfterDiscount - targetGross);
    if (diff < bestDiff) {
      best = discount;
      bestDiff = diff;
    }
  }

  return best;
}

/**
 * Compute Sinvoice itemInfo + reconciled sums.
 *
 * Template `1/...` (HĐ GTGT) wants net unit prices + VAT in
 * `taxAmount`; template `2/...` (HĐ bán hàng, direct method) displays
 * the sale price itself, with no VAT split on the PDF. For template `2/...`,
 * never divide menu prices by `(1 + vatRate)` — Cơm Tấm Má Tư menu prices are
 * already VAT-inclusive and must appear on the invoice as sold.
 *
 * Rounding order matters for Sinvoice strict validators:
 *   - 43: |qty × unitPrice − itemTotalAmountWithoutTax| < 1  (STRICT)
 *   - 44: |(itemTotalAmountWithoutTax − itemDiscount) × taxPercentage/100 − taxAmount| < 1
 *   - 87: |sumOfTotalLineAmountWithoutTax − Σ(itemInfo.itemTotalAmountWithoutTax)| < 1
 *   - 49: |totalTaxAmount − Σ(itemInfo.taxAmount)| < 1
 *
 * Derive netUnitPrice first (rounded), then lineNet = qty × netUnitPrice
 * (always exact integer). Independently rounding lineNet and netUnitPrice
 * — as the previous impl did — can drift by up to qty/2 and break validator
 * 43 in cases like qty=7, lineGross=100, vatRate=8 (lineNet=93,
 * netUnitPrice=13, qty×unitPrice=91, diff=2 ≥ 1 → reject).
 */
export function buildSinvoiceItemInfo(
  items: InvoiceLineItem[],
  vatRate: number,
  callerPassesGross: boolean,
  pricingMode: SinvoicePricingMode = "vat_deductible_net",
): SinvoiceLineMath {
  if (pricingMode === "direct_sales_gross") {
    const itemInfo: SinvoiceItemInfo[] = [];
    let sumLineNet = 0;
    let sumLineDiscount = 0;

    for (const item of items) {
      const lineGross = callerPassesGross
        ? item.amount
        : item.amount * (1 + vatRate / 100);
      const qty = item.quantity;
      const grossUnitPrice =
        qty > 0
          ? Math.round(
              callerPassesGross && item.unitPrice > 0
                ? item.unitPrice
                : lineGross / qty,
            )
          : 0;
      const lineAmount = grossUnitPrice * qty;
      const lineDiscount = clampMoney(
        normalizeMoney(item.discountAmount),
        lineAmount,
      );

      sumLineNet += lineAmount;
      sumLineDiscount += lineDiscount;

      itemInfo.push({
        lineNumber: itemInfo.length + 1,
        selection: 1,
        itemCode: "",
        itemName: item.name,
        unitName: item.unit || "Phần",
        unitPrice: grossUnitPrice,
        quantity: qty,
        itemTotalAmountWithoutTax: lineAmount,
        itemTotalAmountAfterDiscount: lineAmount,
        itemTotalAmountWithTax: lineAmount,
        discount: 0,
        itemDiscount: 0,
        itemNote: null,
        isIncreaseItem: null,
      });
    }

    if (sumLineDiscount > 0) {
      itemInfo.push({
        lineNumber: itemInfo.length + 1,
        selection: 3,
        itemCode: "",
        itemName: DIRECT_SALES_DISCOUNT_LINE_NAME,
        unitName: "",
        itemTotalAmountWithoutTax: sumLineDiscount,
        itemTotalAmountAfterDiscount: sumLineDiscount,
        itemTotalAmountWithTax: sumLineDiscount,
        discount: 0,
        itemDiscount: 0,
        itemNote: null,
        isIncreaseItem: false,
      });
    }

    return {
      itemInfo,
      sumLineNet,
      sumLineDiscount,
      sumLineTax: 0,
      totalGross: sumLineNet - sumLineDiscount,
    };
  }

  const itemInfo: SinvoiceItemInfo[] = items.map((item, index) => {
    const lineGross = callerPassesGross
      ? item.amount
      : item.amount * (1 + vatRate / 100);

    const qty = item.quantity;
    const grossUnitPrice = qty > 0 ? lineGross / qty : 0;
    const netUnitPrice = Math.round(grossUnitPrice / (1 + vatRate / 100));
    const lineNet = netUnitPrice * qty;
    const grossDiscount = callerPassesGross
      ? normalizeMoney(item.discountAmount)
      : normalizeMoney(item.discountAmount) * (1 + vatRate / 100);
    const lineDiscount = clampMoney(
      findNetDiscountForGrossTarget(lineNet, vatRate, lineGross, grossDiscount),
      lineNet,
    );
    const taxableAmount = lineNet - lineDiscount;
    const lineTax = Math.round((taxableAmount * vatRate) / 100);

    return {
      lineNumber: index + 1,
      selection: 1,
      itemCode: "",
      itemName: item.name,
      unitName: item.unit || "Phần",
      unitPrice: netUnitPrice,
      quantity: qty,
      itemTotalAmountWithoutTax: lineNet,
      itemTotalAmountAfterDiscount: taxableAmount,
      itemTotalAmountWithTax: taxableAmount + lineTax,
      discount:
        lineNet > 0 ? roundDiscountRate((lineDiscount / lineNet) * 100) : 0,
      itemDiscount: lineDiscount,
      itemNote: null,
      isIncreaseItem: null,
      taxPercentage: vatRate,
      taxAmount: lineTax,
    };
  });

  const sumLineNet = itemInfo.reduce(
    (s, l) => s + l.itemTotalAmountWithoutTax,
    0,
  );
  const sumLineDiscount = itemInfo.reduce((s, l) => s + l.itemDiscount, 0);
  const sumLineTax = itemInfo.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  const totalGross = itemInfo.reduce((s, l) => s + l.itemTotalAmountWithTax, 0);

  return { itemInfo, sumLineNet, sumLineDiscount, sumLineTax, totalGross };
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
    const res = await fetch(`${this.baseUrl}${LOGIN_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`sinvoice_login_${res.status}`);
    }

    const data = (await res.json()) as
      SinvoiceEnvelope<SinvoiceLoginResult> | SinvoiceLoginResult;
    const result =
      "result" in data && data.result
        ? data.result
        : (data as SinvoiceLoginResult);
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
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init.headers,
          Authorization: `Bearer ${auth}`,
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

  private async authedFormPost(
    apiPath: string,
    body: URLSearchParams,
  ): Promise<Response> {
    let token = await this.ensureToken();
    const exec = (auth: string) =>
      fetch(`${this.baseUrl}${API_PREFIX}${apiPath}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${auth}`,
          Cookie: `access_token=${auth}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    let res = await exec(token);
    if (res.status === 401) {
      this.tokenCache = null;
      token = await this.ensureToken();
      res = await exec(token);
    }
    return res;
  }

  private async readEnvelope<TResult>(
    res: Response,
  ): Promise<SinvoiceEnvelope<TResult>> {
    const text = await res.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as SinvoiceEnvelope<TResult>;
    } catch {
      return { description: text };
    }
  }

  private describeError(
    envelope: SinvoiceEnvelope<unknown>,
    fallback: string,
  ): string {
    return (
      envelope.description ?? envelope.message ?? envelope.error ?? fallback
    );
  }

  /**
   * Detect whether caller's per-item amounts are GROSS (incl VAT) or NET.
   * Per-order callers normally pass order_items.subtotal as gross; VAT templates
   * may pass net amounts.
   * Compare Σ items.amount: closer to totalAmount → gross; closer to subtotal → net.
   */
  private detectGrossInput(request: InvoiceRequest): boolean {
    if (request.items.length === 0) return true;
    const itemsSum = request.items.reduce(
      (s, i) => s + Math.max(0, i.amount - normalizeMoney(i.discountAmount)),
      0,
    );
    const distToGross = Math.abs(itemsSum - request.totalAmount);
    const distToNet = Math.abs(itemsSum - request.subtotal);
    return distToGross <= distToNet;
  }

  /**
   * Build the request body for one invoice.
   */
  private buildInvoiceBody(request: InvoiceRequest): {
    body: Record<string, unknown>;
    transactionUuid: string;
  } {
    const transactionUuid = buildSinvoiceTransactionUuid(request.orderId);
    const callerPassesGross = this.detectGrossInput(request);
    const invoiceType = deriveInvoiceTypeFromTemplate(this.templateCode);
    const pricingMode: SinvoicePricingMode =
      invoiceType === "2" ? "direct_sales_gross" : "vat_deductible_net";

    const { itemInfo, sumLineNet, sumLineDiscount, sumLineTax, totalGross } =
      buildSinvoiceItemInfo(
        request.items,
        request.vatRate,
        callerPassesGross,
        pricingMode,
      );
    if (
      pricingMode === "direct_sales_gross" &&
      totalGross !== normalizeMoney(request.totalAmount)
    ) {
      throw new Error(
        `sinvoice_direct_sales_total_mismatch:${totalGross}:${normalizeMoney(request.totalAmount)}`,
      );
    }
    const totalAmountAfterDiscount = sumLineNet - sumLineDiscount;

    const isReplacement = !!request.replacement;
    const generalInvoiceInfo: Record<string, unknown> = {
      invoiceType,
      templateCode: this.templateCode,
      invoiceSeries: this.invoiceSeries,
      currencyCode: "VND",
      transactionUuid,
      adjustmentType: isReplacement ? "3" : "1",
      paymentStatus: true,
      cusGetInvoiceRight: true,
      userName: this.username,
    };

    if (request.invoiceIssuedAt) {
      const invoiceIssuedDate = Date.parse(request.invoiceIssuedAt);
      if (!Number.isFinite(invoiceIssuedDate)) {
        throw new Error("sinvoice_invoice_issued_at_invalid");
      }
      generalInvoiceInfo["invoiceIssuedDate"] = invoiceIssuedDate;
    }

    if (request.replacement) {
      const r = request.replacement;
      generalInvoiceInfo["originalInvoiceId"] = r.originalInvoiceNumber;
      generalInvoiceInfo["originalInvoiceIssueDate"] = Date.parse(
        r.originalIssuedAt,
      );
      generalInvoiceInfo["originalInvoiceType"] = r.originalInvoiceType;
      generalInvoiceInfo["originalTemplateCode"] = r.originalTemplateCode;
      generalInvoiceInfo["adjustedNote"] = r.reason;
      generalInvoiceInfo["additionalReferenceDesc"] = r.agreementRef;
      generalInvoiceInfo["additionalReferenceDate"] = Date.parse(
        r.agreementDate,
      );
      generalInvoiceInfo["invoiceNote"] =
        `Thay thế hóa đơn số ${r.originalInvoiceNumber}`;
    }

    const buyerNotGetInvoice = request.buyerNotGetInvoice === true;
    // The no-buyer-info legal phrase is server-controlled: when buyerNotGetInvoice
    // is set, always emit the server constant and ignore any client-sent buyerName.
    // A stale POS client bundle ships an outdated constant; trusting it would put
    // the wrong legally-mandated text (NĐ 254/2026) on the invoice.
    const buyerName = buyerNotGetInvoice
      ? BUYER_NOT_GET_INVOICE_NAME
      : request.buyerTaxCode
        ? ""
        : (request.buyerName ?? "");
    const buyerLegalName =
      !buyerNotGetInvoice && request.buyerTaxCode
        ? (request.buyerName ?? null)
        : null;

    const body = {
      generalInvoiceInfo,
      buyerInfo: {
        buyerName,
        buyerLegalName,
        buyerTaxCode: request.buyerTaxCode ?? null,
        buyerAddressLine: request.buyerAddress ?? null,
        buyerPhoneNumber: null,
        buyerEmail: buyerNotGetInvoice ? null : (request.buyerEmail ?? null),
        buyerIdNo: null,
        buyerIdType: null,
        buyerNotGetInvoice: buyerNotGetInvoice ? "1" : "0",
      },
      payments: [{ paymentMethod: "3", paymentMethodName: "TM/CK" }],
      itemInfo,
      summarizeInfo: {
        sumOfTotalLineAmountWithoutTax: sumLineNet,
        totalAmountAfterDiscount,
        totalAmountWithoutTax: totalAmountAfterDiscount,
        totalTaxAmount: sumLineTax,
        totalAmountWithTax: totalGross,
        discountAmount: sumLineDiscount,
        totalAmountWithTaxInWords: null,
      },
      // mẫu-2 (direct_sales_gross): no tax breakdown — sales invoice has no
      // thuế-suất. mẫu-1 (VAT): one breakdown carrying the real rate.
      taxBreakdowns:
        pricingMode === "direct_sales_gross"
          ? []
          : [
              {
                taxPercentage: request.vatRate,
                taxableAmount: totalAmountAfterDiscount,
                taxAmount: sumLineTax,
              },
            ],
    };

    return { body, transactionUuid };
  }

  async createInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
    let transactionUuid = buildSinvoiceTransactionUuid(request.orderId);

    try {
      const built = this.buildInvoiceBody(request);
      const body = built.body;
      transactionUuid = built.transactionUuid;

      const res = await this.authedFetch(
        `/InvoiceAPI/InvoiceWS/createInvoice/${this.taxCode}`,
        { method: "POST", body: JSON.stringify(body) },
      );

      const envelope = await this.readEnvelope<SinvoiceCreateResult>(res);

      if (!res.ok || envelope.errorCode) {
        return {
          status: "failed",
          invoiceNumber: null,
          providerRef: transactionUuid,
          providerData: {
            httpStatus: res.status,
            errorCode: envelope.errorCode ?? res.status,
            description: this.describeError(envelope, "create_invoice_failed"),
            transactionUuid,
            response: JSON.parse(JSON.stringify(envelope)),
          },
        };
      }

      const result = envelope.result;
      const invoiceNo = result?.invoiceNo ?? null;
      const codeOfTax = result?.codeOfTax ?? null;

      // MTT mẫu-2 invoices receive the CQT code (codeOfTax / Mã của cơ quan
      // thuế) synchronously on create → already legally issued, so surface
      // 'issued' immediately. HĐ GTGT mẫu-1 without a code remains 'submitted';
      // no invoiceNo remains 'signing'. The codeOfTax check is strict non-empty
      // so a blank value never falsely issues.
      const hasCqtCode =
        typeof codeOfTax === "string" && codeOfTax.trim().length > 0;
      const status: InvoiceResult["status"] =
        invoiceNo && hasCqtCode
          ? "issued"
          : invoiceNo
            ? "submitted"
            : "signing";

      return {
        status,
        invoiceNumber: invoiceNo,
        codeOfTax,
        // providerRef stores transactionUuid (the key WE generated) so cancel
        // can reference the same submission. reservationCode is the customer
        // lookup secret (Mã tra cứu) — distinct from codeOfTax — kept for audit.
        providerRef: transactionUuid,
        providerData: {
          transactionUuid,
          reservationCode: result?.reservationCode,
          transactionID: result?.transactionID,
          supplierTaxCode: result?.supplierTaxCode,
          codeOfTax,
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

  async lookupInvoice(providerRef: string): Promise<InvoiceLookupResult> {
    const transactionUuid = providerRef.trim();
    if (transactionUuid.length < 10 || transactionUuid.length > 36) {
      return {
        outcome: "unknown",
        invoiceNumber: null,
        providerRef: transactionUuid,
      };
    }

    try {
      const res = await this.authedFormPost(
        "/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid",
        new URLSearchParams({
          supplierTaxCode: this.taxCode,
          transactionUuid,
        }),
      );
      const envelope = await this.readEnvelope<
        SinvoiceSearchHit[] | SinvoiceSearchHit
      >(res);
      if (!res.ok) {
        return {
          outcome: "unknown",
          invoiceNumber: null,
          providerRef: transactionUuid,
          providerData: {
            httpStatus: res.status,
            errorCode: envelope.errorCode ?? res.status,
          },
        };
      }
      if (envelope.errorCode) {
        return {
          outcome: "not_found",
          invoiceNumber: null,
          providerRef: transactionUuid,
          providerData: {
            errorCode: envelope.errorCode,
          },
        };
      }

      const hit = firstSearchHit(envelope.result);
      const invoiceNumber =
        typeof hit?.invoiceNo === "string" && hit.invoiceNo.trim().length > 0
          ? hit.invoiceNo.trim()
          : null;
      if (!invoiceNumber) {
        return {
          outcome: "not_found",
          invoiceNumber: null,
          providerRef: transactionUuid,
        };
      }

      const codeOfTax =
        typeof hit?.codeOfTax === "string" && hit.codeOfTax.trim().length > 0
          ? hit.codeOfTax.trim()
          : null;
      return {
        outcome: "issued",
        invoiceNumber,
        providerRef: transactionUuid,
        codeOfTax,
        issuedAt: lookupIssuedAt(hit?.issueDate),
        providerData: {
          transactionUuid,
          invoiceNo: invoiceNumber,
          reservationCode: hit?.reservationCode,
          codeOfTax,
        },
      };
    } catch {
      return {
        outcome: "unknown",
        invoiceNumber: null,
        providerRef: transactionUuid,
        providerData: { errorCode: "exception" },
      };
    }
  }

  async cancelInvoice(providerRef: string, reason: string): Promise<void> {
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
