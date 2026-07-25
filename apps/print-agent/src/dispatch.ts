import {
  isRecord,
  renderPayloadToEscpos,
  type PrintPayload,
} from "@comtammatu/print-render";
import { sendRawLAN } from "./lan.js";

export type PrinterRow = {
  id: number;
  branch_id: number;
  role: "receipt" | "kitchen_1" | "kitchen_2";
  connection_type: string;
  lan_host: string | null;
  lan_port: number | null;
  paper_width_mm: number;
  is_active: boolean;
};

export type PrintJobRow = {
  id: number;
  tenant_id: number;
  branch_id: number;
  printer_id: number;
  job_type:
    | "kitchen_ticket"
    | "receipt"
    | "cancel_ticket"
    | "provisional_bill"
    | "shift_close_report";
  payload: PrintPayload;
  status:
    | "pending"
    | "processing"
    | "printed"
    | "failed"
    | "expired"
    | "cancelled";
};

export type PrintRetryOptions = {
  timeoutMs: number;
  maxAttempts: number;
  backoffMs: number;
  webBaseUrl?: string | null;
};

function resolveInvoiceUrl(
  content: string,
  webBaseUrl?: string | null,
): string {
  if (/^https?:\/\//i.test(content)) return content;
  if (!content.startsWith("/") || !webBaseUrl) {
    throw new Error("receipt invoice QR requires WEB_BASE_URL");
  }
  const url = new URL(content, webBaseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("receipt invoice QR requires an HTTP(S) WEB_BASE_URL");
  }
  return url.href;
}

export function resolveInvoiceQrUrls(
  payload: PrintPayload,
  webBaseUrl?: string | null,
): PrintPayload {
  if (payload.kind !== "receipt" || !payload.invoice_qr?.content)
    return payload;

  const invoiceQr = {
    ...payload.invoice_qr,
    content: resolveInvoiceUrl(payload.invoice_qr.content, webBaseUrl),
  };
  if (!isRecord(payload.document) || !Array.isArray(payload.document.blocks)) {
    return { ...payload, invoice_qr: invoiceQr };
  }

  return {
    ...payload,
    invoice_qr: invoiceQr,
    document: {
      ...payload.document,
      blocks: payload.document.blocks.map((block) => {
        if (
          !isRecord(block) ||
          block.type !== "invoiceQr" ||
          !isRecord(block.qr)
        ) {
          return block;
        }
        return { ...block, qr: { ...block.qr, content: invoiceQr.content } };
      }),
    },
  };
}

export async function dispatchPrintJob(
  job: PrintJobRow,
  printerCache: ReadonlyMap<number, PrinterRow>,
  options: PrintRetryOptions,
): Promise<void> {
  const printer = printerCache.get(job.printer_id);
  if (!printer) {
    throw new Error(`printer ${job.printer_id} not in cache / inactive`);
  }
  if (printer.connection_type !== "lan") {
    throw new Error(
      `printer ${printer.id}: only connection_type='lan' is supported (got '${printer.connection_type}')`,
    );
  }
  if (!printer.lan_host) {
    throw new Error(`printer ${printer.id} missing lan_host`);
  }

  const bytes = await renderPayloadToEscpos(
    resolveInvoiceQrUrls(job.payload, options.webBaseUrl),
  );
  await sendRawLAN(printer.lan_host, printer.lan_port ?? 9100, bytes, options);
}
