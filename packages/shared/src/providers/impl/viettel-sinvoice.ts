import { unzipSync } from "fflate";
import {
  BUYER_NOT_GET_INVOICE_NAME,
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
 *   - 0100109106-501/504/505/507/899  — kiểm tra dữ liệu đầu vào (server tính lại)
 *   - 0100109106-509                  — KHÔNG kiểm tra (server nhận như input)
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
 *   - COMPANY_TAX_CODE (also used by MISA)
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

interface SinvoiceStatusSearchResult {
  invoiceNo?: string;
  status?: string | null;
  exchangeStatus?: string | null;
  exchangeDes?: string | null;
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
 * Derive TT78 `invoiceType` from `templateCode`.
 *
 * Per Viettel HDSD line 580-598 + example bodies (HDSD §III.2, line
 * 869+ all show `invoiceType: "1"` paired with `templateCode: "1/001"`):
 *   - Template `1/...` → invoiceType `"1"` (HĐ GTGT)
 *   - Template `2/...` → invoiceType `"2"` (HĐ bán hàng — F&B/MTT)
 *   - Template `3/...` → invoiceType `"3"` ...
 *
 * Legacy TT32 templates like `01GTKT0/001` map to `"01GTKT"` form;
 * we do NOT support those (project uses TT78 exclusively since 2026).
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
  itemCode: string;
  itemName: string;
  unitName: string;
  unitPrice: number;
  quantity: number;
  itemTotalAmountWithoutTax: number;
  itemDiscount: number;
  taxPercentage: number;
  taxAmount: number;
}

export interface SinvoiceLineMath {
  itemInfo: SinvoiceItemInfo[];
  sumLineNet: number;
  sumLineTax: number;
  totalGross: number;
}

/**
 * Compute Sinvoice itemInfo + reconciled sums.
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
): SinvoiceLineMath {
  const itemInfo: SinvoiceItemInfo[] = items.map((item, index) => {
    const lineGross = callerPassesGross
      ? item.amount
      : item.amount * (1 + vatRate / 100);

    const qty = item.quantity;
    const grossUnitPrice = qty > 0 ? lineGross / qty : 0;
    const netUnitPrice = Math.round(grossUnitPrice / (1 + vatRate / 100));
    const lineNet = netUnitPrice * qty;
    const lineTax = Math.round((lineNet * vatRate) / 100);

    return {
      lineNumber: index + 1,
      itemCode: "",
      itemName: item.name,
      unitName: item.unit || "Phần",
      unitPrice: netUnitPrice,
      quantity: qty,
      itemTotalAmountWithoutTax: lineNet,
      itemDiscount: 0,
      taxPercentage: vatRate,
      taxAmount: lineTax,
    };
  });

  const sumLineNet = itemInfo.reduce(
    (s, l) => s + l.itemTotalAmountWithoutTax,
    0,
  );
  const sumLineTax = itemInfo.reduce((s, l) => s + l.taxAmount, 0);
  const totalGross = sumLineNet + sumLineTax;

  return { itemInfo, sumLineNet, sumLineTax, totalGross };
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

    const { itemInfo, sumLineNet, sumLineTax, totalGross } =
      buildSinvoiceItemInfo(request.items, request.vatRate, callerPassesGross);

    const isReplacement = !!request.replacement;
    const generalInvoiceInfo: Record<string, unknown> = {
      invoiceType: deriveInvoiceTypeFromTemplate(this.templateCode),
      templateCode: this.templateCode,
      invoiceSeries: this.invoiceSeries,
      currencyCode: "VND",
      transactionUuid,
      adjustmentType: isReplacement ? "3" : "1",
      paymentStatus: true,
      paymentType: 3,
      paymentTypeName: "TM/CK",
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
    const buyerName =
      request.buyerName ??
      (buyerNotGetInvoice ? BUYER_NOT_GET_INVOICE_NAME : "");

    const body = {
      generalInvoiceInfo,
      buyerInfo: {
        buyerName,
        buyerLegalName: buyerNotGetInvoice ? "" : buyerName,
        buyerTaxCode: request.buyerTaxCode ?? "",
        buyerAddressLine: request.buyerAddress ?? "",
        buyerNotGetInvoice: buyerNotGetInvoice ? "1" : "0",
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
        return { status: "issued", invoiceNumber, error: null };
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
   * Download signed PDF + XML for an issued invoice.
   *
   * Endpoint (per HDSD §III.7): POST /InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile
   * Body: { supplierTaxCode, invoiceNo, templateCode, transactionUuid?, fileType: "ZIP" }
   * Response: JSON envelope { errorCode, description, fileName, fileToBytes }
   *   - fileToBytes: base64 of a ZIP archive
   *   - ZIP contents: .xml, .xsl, .pdf, logo/watermark/qrcode images
   *
   * Per Viettel HDSD §III.7 timing note: "request lấy file hóa đơn nên
   * được thực hiện sau từ 2-5 giây sau khi phát hành hóa đơn." Cron
   * 15-min cadence covers this comfortably.
   *
   * Per Viettel HDSD §III.7 state note: "Hệ thống chỉ lấy lên những
   * hóa đơn có trạng thái khả dụng (state = 1)" — only fully-signed
   * invoices are downloadable. Caller filters status='issued'.
   *
   * NEVER re-encodes bytes — extracts .pdf and .xml entries verbatim
   * from the ZIP. Caller hashes pre-Storage upload to verify signature
   * integrity.
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
      const res = await this.authedFetch(
        `/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierTaxCode: this.taxCode,
            invoiceNo: request.invoiceNumber,
            templateCode: this.templateCode,
            transactionUuid: request.providerRef,
            fileType: "ZIP",
          }),
        },
      );

      const envelope = (await res.json()) as SinvoiceEnvelope<{
        fileName?: string;
        fileToBytes?: string;
      }>;

      if (!res.ok || envelope.errorCode) {
        return {
          pdf: null,
          xml: null,
          error: `${envelope.errorCode ?? res.status}:${envelope.description ?? "download_failed"}`,
          providerData: { invoiceNo: request.invoiceNumber },
        };
      }

      const base64 = envelope.result?.fileToBytes;
      if (!base64 || typeof base64 !== "string") {
        return {
          pdf: null,
          xml: null,
          error: "empty_filetobytes",
        };
      }

      const zipBuffer = Buffer.from(base64, "base64");
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

      // Find first .pdf and .xml entries (case-insensitive). ZIP may
      // contain xsl/qrcode/logo — ignore those.
      let pdfEntry: { name: string; bytes: Uint8Array } | null = null;
      let xmlEntry: { name: string; bytes: Uint8Array } | null = null;
      for (const [name, bytes] of Object.entries(entries)) {
        const lower = name.toLowerCase();
        if (!pdfEntry && lower.endsWith(".pdf")) {
          pdfEntry = { name, bytes };
        } else if (!xmlEntry && lower.endsWith(".xml")) {
          xmlEntry = { name, bytes };
        }
      }

      if (!pdfEntry || !xmlEntry) {
        return {
          pdf: null,
          xml: null,
          error: `missing_entry:pdf=${!!pdfEntry},xml=${!!xmlEntry}`,
          providerData: { zipEntries: Object.keys(entries) },
        };
      }

      // Magic byte sanity: PDF must start with "%PDF" and XML with "<?xml" or "<".
      const pdfStart = String.fromCharCode(
        pdfEntry.bytes[0] ?? 0,
        pdfEntry.bytes[1] ?? 0,
        pdfEntry.bytes[2] ?? 0,
        pdfEntry.bytes[3] ?? 0,
      );
      if (pdfStart !== "%PDF") {
        return {
          pdf: null,
          xml: null,
          error: `bad_pdf_magic:got=${pdfStart}`,
        };
      }
      const xmlHead = Buffer.from(xmlEntry.bytes.slice(0, 5)).toString("utf8");
      if (!xmlHead.startsWith("<?xml") && !xmlHead.startsWith("<")) {
        return {
          pdf: null,
          xml: null,
          error: `bad_xml_magic:got=${xmlHead}`,
        };
      }

      const pdf: InvoiceArtifact = {
        bytes: pdfEntry.bytes,
        contentType: "application/pdf",
        filename: pdfEntry.name,
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
          zipFileName: envelope.result?.fileName ?? null,
          pdfFileName: pdfEntry.name,
          xmlFileName: xmlEntry.name,
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
