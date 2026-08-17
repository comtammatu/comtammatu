import {
  BUYER_NOT_GET_INVOICE_NAME,
  type InvoiceLineItem,
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
 * Sinvoice expects per-line NET (pre-VAT) prices. InvoiceRequest always carries
 * VAT-inclusive sold amounts and an explicit VAT rate on every line.
 *
 * Env vars:
 *   - SINVOICE_USERNAME, SINVOICE_PASSWORD
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
 * 869+ all show `invoiceType: "1"` paired with `templateCode: "1/00x"`):
 * Throws if templateCode shape is unrecognised so misconfigured env
 * surfaces loudly at boot rather than producing rejected invoices.
 */
export function deriveInvoiceTypeFromTemplate(templateCode: string): string {
  if (!/^1\//.test(templateCode)) {
    throw new Error(
      `Invalid invoice template format: "${templateCode}". ` +
        `Expected VAT template form like "1/002".`,
    );
  }
  return "1";
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
  taxPercentage: number;
  taxAmount: number;
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

function normalizeMoney(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** Viettel 43/44: |diff| < 1 VND. Integer form of |net × rate/100 − tax| < 1. */
function passesValidator43(
  qty: number,
  unitPrice: number,
  lineNet: number,
): boolean {
  return Math.abs(qty * unitPrice - lineNet) < 1;
}

function passesValidator44(
  lineNet: number,
  vatRate: number,
  taxAmount: number,
): boolean {
  return Math.abs(lineNet * vatRate - taxAmount * 100) < 100;
}

function roundedLineTax(lineNet: number, vatRate: number): number {
  return Math.round((lineNet * vatRate) / 100);
}

/**
 * Prefer residual tax (GROSS − NET) so the line stays additive in whole VND.
 * Fall back to rounded tax when residual would break validator 44.
 */
function chooseLineTax(
  lineNet: number,
  vatRate: number,
  lineGross: number,
): number {
  const residual = lineGross - lineNet;
  if (residual >= 0 && passesValidator44(lineNet, vatRate, residual)) {
    return residual;
  }
  return roundedLineTax(lineNet, vatRate);
}

/**
 * Choose integer net unit price so qty×net is as close as possible to the
 * post-discount GROSS (ADR 0034, no itemDiscount), preferring a unit that
 * lets residual VAT pass validator 44.
 */
function findNetUnitPriceForGrossTarget(
  qty: number,
  vatRate: number,
  targetGross: number,
): number {
  const gross = Math.max(0, Math.round(targetGross));
  const seed = Math.round(gross / qty / (1 + vatRate / 100));
  const start = Math.max(0, seed - 50);
  const end = seed + 50;

  let best = Math.max(0, seed);
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestResidualOk = false;
  for (let netUnit = start; netUnit <= end; netUnit += 1) {
    const lineNet = netUnit * qty;
    const residualTax = gross - lineNet;
    const residualOk =
      residualTax >= 0 && passesValidator44(lineNet, vatRate, residualTax);
    const diff = Math.abs(lineNet * (1 + vatRate / 100) - gross);
    if (residualOk && !bestResidualOk) {
      best = netUnit;
      bestDiff = diff;
      bestResidualOk = true;
      if (diff === 0) break;
      continue;
    }
    if (residualOk === bestResidualOk && diff < bestDiff) {
      best = netUnit;
      bestDiff = diff;
      if (diff === 0 && residualOk) break;
    }
  }
  return best;
}

function applySaleLineAmounts(
  line: SinvoiceSaleItemInfo,
  lineNet: number,
  taxAmount: number,
): void {
  line.itemTotalAmountWithoutTax = lineNet;
  line.itemTotalAmountAfterDiscount = lineNet;
  line.taxAmount = taxAmount;
  line.itemTotalAmountWithTax = lineNet + taxAmount;
}

function tryShiftLineTax(line: SinvoiceSaleItemInfo, delta: number): boolean {
  const nextTax = line.taxAmount + delta;
  if (nextTax < 0) return false;
  if (
    !passesValidator44(line.itemTotalAmountWithoutTax, line.taxPercentage, nextTax)
  ) {
    return false;
  }
  applySaleLineAmounts(line, line.itemTotalAmountWithoutTax, nextTax);
  return true;
}

function tryShiftQtyOneNet(line: SinvoiceSaleItemInfo, delta: number): boolean {
  if (line.quantity !== 1) return false;
  const nextNet = line.itemTotalAmountWithoutTax + delta;
  if (nextNet < 0) return false;
  const nextUnit = nextNet;
  if (!passesValidator43(1, nextUnit, nextNet)) return false;
  const keptTax = line.taxAmount;
  const nextTax = passesValidator44(nextNet, line.taxPercentage, keptTax)
    ? keptTax
    : chooseLineTax(nextNet, line.taxPercentage, nextNet + keptTax + delta);
  if (!passesValidator44(nextNet, line.taxPercentage, nextTax)) return false;
  if (nextNet + nextTax !== line.itemTotalAmountWithTax + delta) return false;
  line.unitPrice = nextUnit;
  applySaleLineAmounts(line, nextNet, nextTax);
  return true;
}

/**
 * Keep invoice GROSS on the POS whole-VND total. Per-line integer NET/VAT can
 * drift ±1₫; absorb the leftover onto another line without breaking 43/44.
 */
function absorbWholeVndGrossResidual(
  itemInfo: SinvoiceSaleItemInfo[],
  targetGross: number,
): void {
  const currentGross = () =>
    itemInfo.reduce((sum, line) => sum + line.itemTotalAmountWithTax, 0);

  let drift = targetGross - currentGross();
  const maxSteps = Math.max(8, itemInfo.length * 4);
  for (let step = 0; step < maxSteps && drift !== 0; step += 1) {
    const delta = drift > 0 ? 1 : -1;
    const candidates = [...itemInfo].sort(
      (a, b) => b.itemTotalAmountWithTax - a.itemTotalAmountWithTax,
    );
    const moved =
      candidates.some((line) => tryShiftLineTax(line, delta)) ||
      candidates.some((line) => tryShiftQtyOneNet(line, delta));
    if (!moved) {
      throw new Error(`sinvoice_gross_residual_unresolved:${drift}`);
    }
    drift = targetGross - currentGross();
  }

  if (drift !== 0) {
    throw new Error(`sinvoice_gross_residual_unresolved:${drift}`);
  }
}

export type SinvoiceBuyerInfo = {
  buyerName: string | null;
  buyerLegalName: string | null;
  buyerTaxCode: string | null;
  buyerAddressLine: string | null;
  buyerEmail: string | null;
  buyerNotGetInvoice: "0" | "1";
};

function resolveInvoiceBuyerKind(
  request: Pick<
    InvoiceRequest,
    "buyerKind" | "buyerTaxCode" | "buyerNotGetInvoice"
  >,
): NonNullable<InvoiceRequest["buyerKind"]> {
  if (request.buyerNotGetInvoice === true || request.buyerKind === "consumer") {
    return "consumer";
  }
  if (request.buyerKind === "business" || request.buyerKind === "individual") {
    return request.buyerKind;
  }
  // Legacy payloads without buyerKind: tax present → business, else individual.
  return request.buyerTaxCode?.trim() ? "business" : "individual";
}

/**
 * Map domain InvoiceRequest buyer fields onto Viettel buyerInfo.
 *
 * - consumer / buyerNotGetInvoice: legal phrase in buyerName only (NĐ 254/2026).
 * - business: registered company name → buyerLegalName only.
 * - individual: person name → buyerName only (optional personal MST on tax field).
 *
 * Never copy the same company string into both name fields. Never put a personal
 * MST buyer's name into buyerLegalName.
 */
export function resolveSinvoiceBuyerInfo(
  request: Pick<
    InvoiceRequest,
    | "buyerName"
    | "buyerTaxCode"
    | "buyerAddress"
    | "buyerEmail"
    | "buyerKind"
    | "buyerNotGetInvoice"
  >,
): SinvoiceBuyerInfo {
  const kind = resolveInvoiceBuyerKind(request);
  if (kind === "consumer") {
    // Server-controlled legal phrase — ignore any client-sent buyerName.
    return {
      buyerName: BUYER_NOT_GET_INVOICE_NAME,
      buyerLegalName: null,
      buyerTaxCode: null,
      buyerAddressLine: null,
      buyerEmail: null,
      buyerNotGetInvoice: "1",
    };
  }

  const label = request.buyerName?.trim() || null;
  const taxCode = request.buyerTaxCode?.trim() || null;
  const address = request.buyerAddress?.trim() || null;
  const email = request.buyerEmail?.trim() || null;

  if (kind === "business") {
    return {
      buyerName: null,
      buyerLegalName: label,
      buyerTaxCode: taxCode,
      buyerAddressLine: address,
      buyerEmail: email,
      buyerNotGetInvoice: "0",
    };
  }

  return {
    buyerName: label,
    buyerLegalName: null,
    buyerTaxCode: taxCode,
    buyerAddressLine: address,
    buyerEmail: email,
    buyerNotGetInvoice: "0",
  };
}

/**
 * Compute Sinvoice itemInfo + reconciled sums.
 *
 * Template `1/...` wants net unit prices + VAT in `taxAmount`.
 * ADR 0034: caller supplies post-discount GROSS lines; do not send
 * `itemDiscount` / discount rate (always 0).
 *
 * Rounding order matters for Sinvoice strict validators:
 *   - 43: |qty × unitPrice − itemTotalAmountWithoutTax| < 1  (STRICT)
 *   - 44: |(itemTotalAmountWithoutTax − itemDiscount) × taxPercentage/100 − taxAmount| < 1
 *   - 87: |sumOfTotalLineAmountWithoutTax − Σ(itemInfo.itemTotalAmountWithoutTax)| < 1
 *   - 49: |totalTaxAmount − Σ(itemInfo.taxAmount)| < 1
 *
 * Derive netUnitPrice first (whole VND), then lineNet = qty × netUnitPrice
 * (exact integer). Independently rounding lineNet and netUnitPrice can drift
 * by up to qty/2 and break validator 43 (qty=7, lineGross=100, vatRate=8).
 * Tax is residual GROSS−NET when 44 holds, else rounded. Invoice GROSS is
 * forced back onto Σ POS line GROSS by absorbing leftover ±1₫ onto another
 * line that still passes 43/44.
 */
export function buildSinvoiceItemInfo(
  items: InvoiceLineItem[],
): SinvoiceLineMath {
  const saleItems: SinvoiceSaleItemInfo[] = items.map((item, index) => {
    const lineVatRate = item.vatRate;
    if (![0, 5, 8, 10].includes(lineVatRate)) {
      throw new Error(`sinvoice_invalid_vat_rate:${lineVatRate}`);
    }
    const lineGross = normalizeMoney(item.amount);
    const qty = item.quantity;
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("sinvoice_invalid_quantity");
    }

    const netUnitPrice = findNetUnitPriceForGrossTarget(
      qty,
      lineVatRate,
      lineGross,
    );
    const lineNet = netUnitPrice * qty;
    const lineTax = chooseLineTax(lineNet, lineVatRate, lineGross);

    return {
      lineNumber: index + 1,
      selection: 1 as const,
      itemCode: "",
      itemName: item.name,
      unitName: item.unit || "Phần",
      unitPrice: netUnitPrice,
      quantity: qty,
      itemTotalAmountWithoutTax: lineNet,
      itemTotalAmountAfterDiscount: lineNet,
      itemTotalAmountWithTax: lineNet + lineTax,
      discount: 0,
      itemDiscount: 0,
      itemNote: null,
      isIncreaseItem: null,
      taxPercentage: lineVatRate,
      taxAmount: lineTax,
    };
  });

  const targetGross = items.reduce(
    (sum, item) => sum + normalizeMoney(item.amount),
    0,
  );
  absorbWholeVndGrossResidual(saleItems, targetGross);

  const itemInfo: SinvoiceItemInfo[] = saleItems;
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
   * Build the request body for one invoice.
   */
  private buildInvoiceBody(request: InvoiceRequest): {
    body: Record<string, unknown>;
    transactionUuid: string;
  } {
    const transactionUuid = buildSinvoiceTransactionUuid(request.orderId);
    const invoiceType = deriveInvoiceTypeFromTemplate(this.templateCode);

    const { itemInfo, sumLineNet, sumLineDiscount, sumLineTax, totalGross } =
      buildSinvoiceItemInfo(request.items);
    const totalAmountAfterDiscount = sumLineNet - sumLineDiscount;
    if (
      totalAmountAfterDiscount !== normalizeMoney(request.subtotal) ||
      sumLineTax !== normalizeMoney(request.vatAmount) ||
      totalGross !== normalizeMoney(request.totalAmount)
    ) {
      throw new Error(
        `sinvoice_total_mismatch:${totalAmountAfterDiscount}:${sumLineTax}:${totalGross}`,
      );
    }
    if (request.sellerTaxCode !== this.taxCode) {
      throw new Error("sinvoice_seller_tax_code_mismatch");
    }
    const taxBreakdowns = Array.from(
      itemInfo.reduce(
        (groups, line) => {
          if (line.selection !== 1) return groups;
          const rate = line.taxPercentage;
          const current = groups.get(rate) ?? {
            taxPercentage: rate,
            taxableAmount: 0,
            taxAmount: 0,
          };
          current.taxableAmount += line.itemTotalAmountAfterDiscount;
          current.taxAmount += line.taxAmount;
          groups.set(rate, current);
          return groups;
        },
        new Map<
          number,
          {
            taxPercentage: number;
            taxableAmount: number;
            taxAmount: number;
          }
        >(),
      ),
    ).map(([, breakdown]) => breakdown);

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

    const buyerInfo = resolveSinvoiceBuyerInfo(request);

    const body = {
      generalInvoiceInfo,
      buyerInfo: {
        ...buyerInfo,
        buyerPhoneNumber: null,
        buyerIdNo: null,
        buyerIdType: null,
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
      taxBreakdowns,
    };

    return { body, transactionUuid };
  }

  async createInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
    let transactionUuid = buildSinvoiceTransactionUuid(request.orderId);
    let built: ReturnType<ViettelSinvoiceProvider["buildInvoiceBody"]>;

    try {
      built = this.buildInvoiceBody(request);
      transactionUuid = built.transactionUuid;
    } catch (err) {
      return {
        status: "failed",
        invoiceNumber: null,
        providerRef: transactionUuid,
        providerData: {
          errorCode: "validation",
          description:
            err instanceof Error ? err.message : "sinvoice_validation_failed",
          transactionUuid,
        },
      };
    }

    try {
      const res = await this.authedFetch(
        `/InvoiceAPI/InvoiceWS/createInvoice/${this.taxCode}`,
        { method: "POST", body: JSON.stringify(built.body) },
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
            outcomeUnknown:
              res.status === 408 || res.status === 429 || res.status >= 500,
            description: this.describeError(envelope, "create_invoice_failed"),
            transactionUuid,
            response: JSON.parse(JSON.stringify(envelope)),
          },
        };
      }

      const result = envelope.result;
      const invoiceNo = result?.invoiceNo ?? null;
      const codeOfTax = result?.codeOfTax ?? null;

      // A synchronous CQT code means the invoice is legally issued.
      // An invoice number without that code remains submitted; no invoice
      // number remains signing. Blank codes never falsely issue.
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
          outcomeUnknown: true,
          description:
            err instanceof Error ? err.message : "sinvoice_call_failed",
          transactionUuid,
        },
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
