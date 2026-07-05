import { unzipSync } from "fflate";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  type BatchInvoiceItemResult,
  type InvoiceArchive,
  type InvoiceArtifact,
  type InvoiceDownloadRequest,
  type InvoiceLineItem,
  type InvoiceProvider,
  type InvoiceRequest,
  type InvoiceResult,
  type InvoiceStatus,
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
 * interface is rate-agnostic — caller may pass GROSS (B2B realtime path,
 * order_items.subtotal stored as gross) or NET (B2C batch, _compute_vat_breakdown
 * returns net). A heuristic compares Σ items.amount vs subtotal vs totalAmount
 * to pick the conversion factor. For mixed-rate B2B, header vatRate (predominant)
 * is used per-line — accepts ≤1₫ rounding tolerance; out-of-tolerance errors
 * surface as Sinvoice rejection (status='failed') rather than silent corruption.
 *
 * Env vars:
 *   - SINVOICE_USERNAME, SINVOICE_PASSWORD
 *   - COMPANY_TAX_CODE
 *   - SINVOICE_TEMPLATE_CODE   (TT78 form, e.g. "2/001" for HĐ bán hàng từ MTT)
 *   - SINVOICE_INVOICE_SERIES  (registered with CQT, e.g. "C26MAA")
 *   - SINVOICE_BASE_URL        (override host; same URL for prod + test)
 *   - SINVOICE_SANDBOX=true    (informational — server distinguishes via creds)
 *
 * Template ↔ invoiceType mapping (TT78, derived at runtime):
 *   - "1/..." → invoiceType "1" (HĐ GTGT / VAT-deductible)
 *   - "2/..." → invoiceType "2" (HĐ bán hàng từ MTT — F&B default)
 *   - 3/4/5/6 also supported per TT78 (see deriveInvoiceTypeFromTemplate)
 */

const DEFAULT_BASE_URL = "https://api-vinvoice.viettel.vn";
const API_PREFIX = "/services/einvoiceapplication/api";
const LOGIN_PATH = "/auth/login";

const TX_UUID_LENGTH = 32;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
// Sinvoice createBatchInvoice cap (HDSD v2.50: ≤50/lô to avoid timeout).
const SINVOICE_BATCH_MAX = 50;

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

interface SinvoiceStatusSearchResult {
  invoiceNo?: string;
  status?: string | null;
  exchangeStatus?: string | null;
  exchangeDes?: string | null;
  codeOfTax?: string | null;
}

// createBatchInvoice response (HDSD v2.50). Top-level (NOT wrapped in the
// `result` envelope that single createInvoice uses). Per-invoice outcomes in
// `createInvoiceOutputs` keyed by `transactionUuid`; input-validation failures
// in `lstMapError`. A JSON/token-level failure returns `{code,message,data}`.
interface SinvoiceBatchOutput {
  transactionUuid?: string | null;
  errorCode?: number | string | null;
  description?: string | null;
  result?: {
    invoiceNo?: string | null;
    reservationCode?: string | null;
    transactionID?: string | null;
    supplierTaxCode?: string | null;
    codeOfTax?: string | null;
  } | null;
}

interface SinvoiceBatchResponse {
  createInvoiceOutputs?: SinvoiceBatchOutput[] | null;
  lstMapError?:
    | { msg?: string; invoiceSeri?: string; errorCode?: string }[]
    | null;
  totalSuccess?: number;
  totalFail?: number;
  code?: number;
  message?: string;
  data?: string;
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
 * Derive TT78 `invoiceType` from `templateCode`.
 *
 * Per Viettel HDSD line 580-598 + example bodies (HDSD §III.2, line
 * 869+ all show `invoiceType: "1"` paired with `templateCode: "1/001"`):
 *   - Template `1/...` → invoiceType `"1"` (HĐ GTGT)
 *   - Template `2/...` → invoiceType `"2"` (HĐ bán hàng — F&B/MTT)
 *   - Template `3/...` → invoiceType `"3"` ...
 *
 * Older pre-2026 (TT78-era) templates like `01GTKT0/001` map to the
 * `"01GTKT"` form; we do NOT support those (TT32-style codes only since 2026).
 *
 * Throws if templateCode shape is unrecognised so misconfigured env
 * surfaces loudly at boot rather than producing rejected invoices.
 */
export function deriveInvoiceTypeFromTemplate(templateCode: string): string {
  const match = templateCode.match(/^([1-6])\//);
  if (!match || !match[1]) {
    throw new Error(
      `Invalid SINVOICE_TEMPLATE_CODE format: "${templateCode}". ` +
        `Expected TT78 form like "1/001" or "2/001".`,
    );
  }
  return match[1];
}

export interface SinvoiceItemInfo {
  lineNumber: number;
  selection: 1;
  itemCode: string;
  itemName: string;
  unitName: string;
  unitPrice: number;
  quantity: number;
  itemTotalAmountWithoutTax: number;
  itemTotalAmountAfterDiscount: number;
  itemTotalAmountWithTax: number;
  discount: number;
  itemDiscount: number;
  itemNote: null;
  isIncreaseItem: null;
  // Omitted for direct_sales_gross (mẫu-2 hóa đơn bán hàng): the sales-invoice
  // template has no thuế-suất field — Viettel strips taxPercentage from the CQT
  // XML, so we send neither rather than a placeholder. VAT mode (mẫu-1) sets both.
  taxPercentage?: number;
  taxAmount?: number;
}

export interface SinvoiceLineMath {
  itemInfo: SinvoiceItemInfo[];
  sumLineNet: number;
  sumLineDiscount: number;
  sumLineTax: number;
  totalGross: number;
}

type SinvoicePricingMode = "vat_deductible_net" | "direct_sales_gross";

function normalizeMoney(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

function clampMoney(value: number, max: number): number {
  return Math.min(Math.max(0, value), Math.max(0, max));
}

// Viettel rejects a `discount` rate carrying >2 decimal places
// (BAD_REQUEST_INVALID_DECIMAL_POINT_DISCOUNT). The authoritative discount is
// itemDiscount (đồng) — all strict total validators (43/44/49/87) key off the
// amount, never this rate — so rounding the rate to 2dp cannot disturb totals.
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
 * TT78 template `1/...` (HĐ GTGT) wants net unit prices + VAT in
 * `taxAmount`; TT78 template `2/...` (HĐ bán hàng, direct method) displays
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
  const itemInfo: SinvoiceItemInfo[] = items.map((item, index) => {
    const lineGross = callerPassesGross
      ? item.amount
      : item.amount * (1 + vatRate / 100);

    const qty = item.quantity;
    if (pricingMode === "direct_sales_gross") {
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
      const lineAfterDiscount = lineAmount - lineDiscount;

      return {
        lineNumber: index + 1,
        selection: 1,
        itemCode: "",
        itemName: item.name,
        unitName: item.unit || "Phần",
        unitPrice: grossUnitPrice,
        quantity: qty,
        itemTotalAmountWithoutTax: lineAmount,
        itemTotalAmountAfterDiscount: lineAfterDiscount,
        itemTotalAmountWithTax: lineAfterDiscount,
        // Viettel `discount` is a RATE (% of line, 0–100); `itemDiscount` is the
        // amount. Sending an amount as the rate reads as >100% → DISCOUNT_INVALID.
        discount:
          lineAmount > 0
            ? roundDiscountRate((lineDiscount / lineAmount) * 100)
            : 0,
        itemDiscount: lineDiscount,
        itemNote: null,
        isIncreaseItem: null,
        // No taxPercentage/taxAmount: mẫu-2 sales invoice carries no tax rate.
      };
    }

    const grossUnitPrice = qty > 0 ? lineGross / qty : 0;
    const netUnitPrice = Math.round(grossUnitPrice / (1 + vatRate / 100));
    const lineNet = netUnitPrice * qty;
    const grossDiscount = callerPassesGross
      ? normalizeMoney(item.discountAmount)
      : normalizeMoney(item.discountAmount) * (1 + vatRate / 100);
    const lineDiscount = clampMoney(
      findNetDiscountForGrossTarget(
        lineNet,
        vatRate,
        lineGross,
        grossDiscount,
      ),
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
      discount: lineNet > 0 ? roundDiscountRate((lineDiscount / lineNet) * 100) : 0,
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
  const totalGross = itemInfo.reduce(
    (s, l) => s + l.itemTotalAmountWithTax,
    0,
  );

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
      | SinvoiceEnvelope<SinvoiceLoginResult>
      | SinvoiceLoginResult;
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
   * B2B realtime path passes order_items.subtotal which is stored gross.
   * B2C batch path passes _compute_vat_breakdown line_subtotal which is net.
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
   * Build the per-invoice request body shared by createInvoice (single) and
   * createBatchInvoice (the `commonInvoiceInputs[]` elements). Same shape; the
   * batch endpoint just wraps an array of these.
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
      : (request.buyerName ?? "");

    const body = {
      generalInvoiceInfo,
      buyerInfo: {
        buyerName,
        buyerLegalName: buyerNotGetInvoice ? null : buyerName || null,
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
    const { body, transactionUuid } = this.buildInvoiceBody(request);

    try {
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
      // 'issued' immediately (same rule as createBatchInvoice + getStatus). HĐ
      // GTGT mẫu-1 codes arrive async (no codeOfTax yet ⇒ 'submitted', reconcile
      // cron promotes). No invoiceNo ⇒ still 'signing'. The codeOfTax check is
      // strict non-empty so a '' / whitespace value never falsely issues.
      const hasCqtCode =
        typeof codeOfTax === "string" && codeOfTax.trim().length > 0;
      const status: InvoiceResult["status"] =
        invoiceNo && hasCqtCode ? "issued" : invoiceNo ? "submitted" : "signing";

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

  /**
   * Issue many invoices in one Sinvoice call (HDSD v2.50
   * `createBatchInvoice`). Request wraps the per-invoice bodies in
   * `commonInvoiceInputs`; response returns per-invoice outcomes in
   * `createInvoiceOutputs` (keyed by transactionUuid) + `lstMapError`. Chunks
   * at SINVOICE_BATCH_MAX. Never throws — a whole-chunk failure marks every
   * item in that chunk failed so the caller reconciles per transactionUuid.
   */
  async createBatchInvoice(
    requests: InvoiceRequest[],
  ): Promise<BatchInvoiceItemResult[]> {
    const results: BatchInvoiceItemResult[] = [];

    const fail = (
      uuid: string,
      description: string,
      extra?: Record<string, unknown>,
    ): BatchInvoiceItemResult => ({
      transactionUuid: uuid,
      status: "failed",
      invoiceNumber: null,
      providerRef: uuid,
      codeOfTax: null,
      providerData: { transactionUuid: uuid, description, ...extra },
    });

    for (let i = 0; i < requests.length; i += SINVOICE_BATCH_MAX) {
      const chunk = requests.slice(i, i + SINVOICE_BATCH_MAX);
      const built = chunk.map((r) => this.buildInvoiceBody(r));
      const reqBody = { commonInvoiceInputs: built.map((b) => b.body) };

      try {
        const res = await this.authedFetch(
          `/InvoiceAPI/InvoiceWS/createBatchInvoice/${this.taxCode}`,
          { method: "POST", body: JSON.stringify(reqBody) },
        );
        const env = (await this.readEnvelope<unknown>(
          res,
        )) as unknown as SinvoiceBatchResponse;

        // JSON/token-level rejection ({code,message,data}) → whole chunk failed.
        if (!Array.isArray(env.createInvoiceOutputs)) {
          const description =
            env.message ??
            env.data ??
            this.describeError(
              env as SinvoiceEnvelope<unknown>,
              "batch_invoice_failed",
            );
          for (const b of built) {
            results.push(fail(b.transactionUuid, description, {
              httpStatus: res.status,
            }));
          }
          continue;
        }

        const outputs = env.createInvoiceOutputs;
        for (let k = 0; k < built.length; k++) {
          const b = built[k];
          if (!b) continue;
          // Map by transactionUuid; fall back to positional order (HDSD: outputs
          // align with commonInvoiceInputs; examples sometimes echo uuid=null).
          const out =
            outputs.find(
              (o) => o?.transactionUuid && o.transactionUuid === b.transactionUuid,
            ) ??
            outputs[k] ??
            null;
          const invoiceNo = out?.result?.invoiceNo ?? null;
          const codeOfTax = out?.result?.codeOfTax ?? null;
          const okCode =
            out != null &&
            (out.errorCode === 200 ||
              out.errorCode === "200" ||
              out.errorCode == null);

          if (out && okCode && invoiceNo) {
            results.push({
              transactionUuid: b.transactionUuid,
              // codeOfTax present (MTT) = issued; else submitted, reconcile cron polls.
              status: codeOfTax ? "issued" : "submitted",
              invoiceNumber: invoiceNo,
              providerRef: b.transactionUuid,
              codeOfTax,
              providerData: {
                transactionUuid: b.transactionUuid,
                reservationCode: out.result?.reservationCode,
                transactionID: out.result?.transactionID,
                codeOfTax,
              },
            });
          } else {
            const errMsg =
              out?.description ??
              env.lstMapError?.[k]?.msg ??
              env.lstMapError?.[0]?.msg ??
              "batch_item_failed";
            results.push(
              fail(b.transactionUuid, errMsg, {
                errorCode: out?.errorCode ?? null,
              }),
            );
          }
        }
      } catch (err) {
        const description =
          err instanceof Error ? err.message : "sinvoice_batch_call_failed";
        for (const b of built) results.push(fail(b.transactionUuid, description));
      }
    }

    return results;
  }

  async getStatus(providerRef: string): Promise<InvoiceStatus> {
    try {
      const body = new URLSearchParams({
        supplierTaxCode: this.taxCode,
        transactionUuid: providerRef,
      });
      const res = await this.authedFetch(
        `/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
      );
      const envelope = (await res.json()) as SinvoiceEnvelope<
        SinvoiceStatusSearchResult[]
      >;
      if (!res.ok || envelope.errorCode) {
        const description =
          typeof envelope.description === "string"
            ? envelope.description
            : `sinvoice_getstatus_${res.status}`;
        return {
          status: "draft",
          invoiceNumber: null,
          error: `${envelope.errorCode ?? res.status}:${description}`,
        };
      }
      const r = Array.isArray(envelope.result) ? envelope.result[0] : null;
      if (!r) {
        return {
          status: "draft",
          invoiceNumber: null,
          error: "invoice_not_found",
        };
      }

      const exchangeStatus = (r.exchangeStatus ?? "").toUpperCase();
      const textualStatus = `${r.status ?? ""} ${exchangeStatus}`.toLowerCase();
      const invoiceNumber = r.invoiceNo ?? null;

      if (
        textualStatus.includes("cancel") ||
        textualStatus.includes("hủy") ||
        textualStatus.includes("huy")
      ) {
        return { status: "cancelled", invoiceNumber, error: null };
      }
      if (
        textualStatus.includes("replace") ||
        textualStatus.includes("thay thế") ||
        textualStatus.includes("thay the")
      ) {
        return { status: "replaced", invoiceNumber, error: null };
      }
      if (exchangeStatus.includes("DIS_APPROVED")) {
        return {
          status: "submitted",
          invoiceNumber,
          error: `cqt_rejected:${r.exchangeDes ?? exchangeStatus}`,
        };
      }
      if (
        r.codeOfTax ||
        (exchangeStatus.includes("APPROVED") &&
          !exchangeStatus.includes("DIS_APPROVED"))
      ) {
        return {
          status: "issued",
          invoiceNumber,
          codeOfTax: r.codeOfTax ?? null,
          error: null,
        };
      }
      if (invoiceNumber) {
        return { status: "submitted", invoiceNumber, error: null };
      }

      return {
        status: "draft",
        invoiceNumber,
        error: `unknown_exchange_status:${exchangeStatus || "missing"}`,
      };
    } catch (e) {
      return {
        status: "draft",
        invoiceNumber: null,
        error: e instanceof Error ? e.message : "sinvoice_getstatus_exception",
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

  /**
   * Fetch one representation file (fileType "PDF" or "ZIP") for an issued
   * invoice. Returns the decoded bytes verbatim (never re-encoded) or an error
   * string.
   *
   * Endpoint: POST /InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile.
   * Response is a FLAT JSON envelope { errorCode, description, fileName,
   * fileToBytes, paymentStatus } — fields at top level, NOT under `result`.
   * This endpoint signals success with errorCode 200 (number), unlike
   * createInvoice/getStatus where success is a null errorCode; a present
   * top-level fileToBytes is the reliable success signal.
   */
  private async fetchRepresentationFile(
    invoiceNumber: string,
    transactionUuid: string,
    fileType: "PDF" | "ZIP",
  ): Promise<{ bytes: Uint8Array; fileName: string | null } | { error: string }> {
    const res = await this.authedFetch(
      `/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`,
      {
        method: "POST",
        body: JSON.stringify({
          supplierTaxCode: this.taxCode,
          invoiceNo: invoiceNumber,
          templateCode: this.templateCode,
          transactionUuid,
          fileType,
        }),
      },
    );
    const envelope = (await res.json()) as {
      errorCode?: number | string | null;
      description?: string | null;
      fileName?: string | null;
      fileToBytes?: string | null;
    };
    const base64 = envelope.fileToBytes;
    if (!res.ok || typeof base64 !== "string" || base64.length === 0) {
      return {
        error: `${fileType}:${envelope.errorCode ?? res.status}:${envelope.description ?? "download_failed"}`,
      };
    }
    return {
      bytes: new Uint8Array(Buffer.from(base64, "base64")),
      fileName: envelope.fileName ?? null,
    };
  }

  /**
   * Download signed PDF + XML for an issued invoice.
   *
   * The PDF comes back directly as a base64 PDF (fileType=PDF); the signed XML
   * (the legal original) ships only inside the ZIP representation (fileType=ZIP)
   * for the MTT template — so this makes TWO calls and combines them.
   *
   * Per Viettel HDSD §III.7 timing note: "request lấy file hóa đơn nên
   * được thực hiện sau từ 2-5 giây sau khi phát hành hóa đơn." Cron
   * 15-min cadence covers this comfortably.
   *
   * Per Viettel HDSD §III.7 state note: "Hệ thống chỉ lấy lên những
   * hóa đơn có trạng thái khả dụng (state = 1)" — only fully-signed
   * invoices are downloadable. Caller filters status='issued'.
   *
   * NEVER re-encodes bytes — the PDF is used as returned and the XML is
   * extracted verbatim from the ZIP. Caller hashes pre-Storage upload to
   * verify signature integrity.
   */
  async downloadInvoice(
    request: InvoiceDownloadRequest,
  ): Promise<InvoiceArchive> {
    if (!request.invoiceNumber) {
      return {
        pdf: null,
        xml: null,
        error: "missing_invoice_number",
      };
    }

    try {
      // 1) PDF — fileType=PDF returns the signed PDF directly as base64.
      const pdfRes = await this.fetchRepresentationFile(
        request.invoiceNumber,
        request.providerRef,
        "PDF",
      );
      if ("error" in pdfRes) {
        return {
          pdf: null,
          xml: null,
          error: pdfRes.error,
          providerData: { invoiceNo: request.invoiceNumber },
        };
      }
      const pdfBytes = pdfRes.bytes;
      const pdfStart = String.fromCharCode(
        pdfBytes[0] ?? 0,
        pdfBytes[1] ?? 0,
        pdfBytes[2] ?? 0,
        pdfBytes[3] ?? 0,
      );
      if (pdfStart !== "%PDF") {
        return { pdf: null, xml: null, error: `bad_pdf_magic:got=${pdfStart}` };
      }

      // 2) XML — the signed XML ships only inside the ZIP representation.
      const zipRes = await this.fetchRepresentationFile(
        request.invoiceNumber,
        request.providerRef,
        "ZIP",
      );
      if ("error" in zipRes) {
        return {
          pdf: null,
          xml: null,
          error: zipRes.error,
          providerData: { invoiceNo: request.invoiceNumber },
        };
      }
      const zipBuffer = Buffer.from(zipRes.bytes);
      // Magic byte check for ZIP: PK\x03\x04 = 0x50 0x4B 0x03 0x04
      if (
        zipBuffer.length < 4 ||
        zipBuffer[0] !== 0x50 ||
        zipBuffer[1] !== 0x4b ||
        zipBuffer[2] !== 0x03 ||
        zipBuffer[3] !== 0x04
      ) {
        return {
          pdf: null,
          xml: null,
          error: `bad_zip_magic:size=${zipBuffer.length}`,
        };
      }

      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(new Uint8Array(zipBuffer));
      } catch (e) {
        return {
          pdf: null,
          xml: null,
          error: `unzip_failed:${e instanceof Error ? e.message : "unknown"}`,
        };
      }

      // The ZIP carries the signed .xml (plus xsl/qrcode/logo we ignore).
      let xmlEntry: { name: string; bytes: Uint8Array } | null = null;
      for (const [name, bytes] of Object.entries(entries)) {
        if (name.toLowerCase().endsWith(".xml")) {
          xmlEntry = { name, bytes };
          break;
        }
      }
      if (!xmlEntry) {
        return {
          pdf: null,
          xml: null,
          error: "missing_xml_in_zip",
          providerData: { zipEntries: Object.keys(entries) },
        };
      }
      const xmlHead = Buffer.from(xmlEntry.bytes.slice(0, 5)).toString("utf8");
      if (!xmlHead.startsWith("<?xml") && !xmlHead.startsWith("<")) {
        return { pdf: null, xml: null, error: `bad_xml_magic:got=${xmlHead}` };
      }

      const pdf: InvoiceArtifact = {
        bytes: pdfBytes,
        contentType: "application/pdf",
        filename: pdfRes.fileName ?? `${request.invoiceNumber}.pdf`,
      };
      const xml: InvoiceArtifact = {
        bytes: xmlEntry.bytes,
        contentType: "application/xml",
        filename: xmlEntry.name,
      };

      return {
        pdf,
        xml,
        error: null,
        providerData: {
          pdfFileName: pdf.filename,
          xmlFileName: xmlEntry.name,
          zipFileName: zipRes.fileName,
        },
      };
    } catch (e) {
      return {
        pdf: null,
        xml: null,
        error: e instanceof Error ? e.message : "sinvoice_download_exception",
      };
    }
  }
}
